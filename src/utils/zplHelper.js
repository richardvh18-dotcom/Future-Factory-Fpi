// Debugmodus: zet op true om ZPL-output te loggen
const DEBUG_ZPL = false;
/**
 * ZPL Helper voor Future Factory Labels
 * Geavanceerde ZPL Rendering Engine (NiceLabel-style).
 * 
 * Features:
 * - Dynamische Lengte (^LL) voor papierbesparing
 * - Smart Cutter (^GS) voor snijden per batch
 * - 2-koloms ondersteuning
 * - Variabele injectie ({placeholder})
 * - Support voor Tekst, Barcode, QR, Box, Lijn, Image
 */

// Conversie helpers (203 DPI standaard)
const DEFAULT_DPI = 203 / 25.4; // dots/mm
const mmToDots = (mm) => Math.round(mm * DPI);
let DPI = DEFAULT_DPI;

const getLongestLineLength = (value) => {
    const lines = String(value || "").split(/\r?\n/);
    return lines.reduce((maxLen, line) => Math.max(maxLen, line.length), 0);
};

const wrapTextContent = (value, maxCharsPerLine = 1, maxLines = 1) => {
    const safeMaxChars = Math.max(1, Math.floor(maxCharsPerLine));
    const safeMaxLines = Math.max(1, Math.floor(maxLines));
    const sourceLines = String(value || "").replace(/\r/g, "").split("\n");
    const wrapped = [];

    const pushLine = (line) => {
        if (wrapped.length >= safeMaxLines) return;
        wrapped.push(line);
    };

    for (const sourceLine of sourceLines) {
        if (wrapped.length >= safeMaxLines) break;

        const words = sourceLine.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            pushLine("");
            continue;
        }

        let currentLine = "";
        for (const word of words) {
            if (wrapped.length >= safeMaxLines) break;

            if (word.length > safeMaxChars) {
                if (currentLine) {
                    pushLine(currentLine);
                    currentLine = "";
                }

                let remainder = word;
                while (remainder.length > safeMaxChars && wrapped.length < safeMaxLines) {
                    pushLine(remainder.slice(0, safeMaxChars));
                    remainder = remainder.slice(safeMaxChars);
                }
                currentLine = remainder;
                continue;
            }

            const candidate = currentLine ? `${currentLine} ${word}` : word;
            if (candidate.length <= safeMaxChars) {
                currentLine = candidate;
            } else {
                pushLine(currentLine);
                currentLine = word;
            }
        }

        if (wrapped.length < safeMaxLines && currentLine) {
            pushLine(currentLine);
        }
    }

    if (wrapped.length === 0) {
        return [""];
    }

    if (sourceLines.length > 0 && wrapped.length === safeMaxLines) {
        const lastIndex = wrapped.length - 1;
        wrapped[lastIndex] = wrapped[lastIndex].trimEnd();
    }

    return wrapped.slice(0, safeMaxLines);
};

const getResolvedTextMaxLines = (el, requestedHeight, rot = 'N') => {
    const explicitMaxLines = Number(el.maxLines);
    if (Number.isFinite(explicitMaxLines) && explicitMaxLines > 0) {
        return Math.max(1, Math.floor(explicitMaxLines));
    }

    const lineBudgetMm = (rot === 'R' || rot === 'B')
        ? (Number(el.width) || Number(el.height) || 0)
        : (Number(el.height) || 0);
    if (!lineBudgetMm || !requestedHeight) return 1;

    const lineBudgetDots = mmToDots(lineBudgetMm);
    const estimatedLineHeightDots = Math.max(1, Math.round(requestedHeight * 1.05));
    return Math.max(1, Math.floor((lineBudgetDots * 0.92) / estimatedLineHeightDots));
};

const getTextMetrics = (el, content, rot = 'N') => {
    const requestedHeight = mmToDots((el.fontSize || 10) / 2.8);
    const maxLines = getResolvedTextMaxLines(el, requestedHeight, rot);
    const hasExplicitWidth = Number.isFinite(Number(el.fontWidth));
    const explicitWidth = hasExplicitWidth
        ? mmToDots((el.fontWidth || 12) / 2.8)
        : 0;
    const naturalWidth = explicitWidth || Math.max(1, Math.round(requestedHeight * 0.48));

    if (!el.width) {
        return {
            fontHeight: requestedHeight,
            fontWidth: explicitWidth,
            widthDots: null,
        };
    }

    // Bij verticale tekst (90/270) is de effectieve wrap-richting omgedraaid.
    // Gebruik dan de element-hoogte als breedte voor ^FB wrap.
    const wrapWidthMm = (rot === 'R' || rot === 'B')
        ? (Number(el.height) || Number(el.width) || 0)
        : Number(el.width);
    const rawWidthDots = mmToDots(wrapWidthMm);
    const innerWidthDots = Math.max(1, rawWidthDots - mmToDots(0.8));
    // Het beschikbare regelbudget staat bij verticale tekst op de X-as (element.width).
    const lineBudgetMm = (rot === 'R' || rot === 'B')
        ? (Number(el.width) || Number(el.height) || 0)
        : (Number(el.height) || 0);
    const heightLimitDots = lineBudgetMm
        ? Math.max(1, Math.floor(mmToDots(lineBudgetMm) / maxLines))
        : requestedHeight;
    const longestLineLength = Math.max(1, getLongestLineLength(content));
    const estimatedLongestWrappedLine = Math.max(1, Math.ceil(longestLineLength / maxLines));
    const maxCharWidth = Math.max(1, Math.floor((innerWidthDots * 0.98) / estimatedLongestWrappedLine));
    const fittedWidth = Math.min(naturalWidth, maxCharWidth);
    const fittedHeight = Math.max(1, Math.min(heightLimitDots, requestedHeight));
    const estimatedCharWidthDots = Math.max(1, hasExplicitWidth ? fittedWidth : Math.round(fittedHeight * 0.48));
    const charsPerLine = Math.max(1, Math.floor((innerWidthDots * 0.98) / estimatedCharWidthDots));

    return {
        fontHeight: fittedHeight,
        // Laat ZPL de natuurlijke karakterbreedte gebruiken als er geen expliciete fontWidth is.
        // Dit voorkomt dat tekst in print te dun wordt t.o.v. de visuele preview.
        fontWidth: hasExplicitWidth ? fittedWidth : 0,
        widthDots: innerWidthDots,
        maxLines,
        charsPerLine,
    };
};


/**
 * Vervangt placeholders zoals {itemCode} met echte data
 */
const parseContent = (text, data) => {
    if (!text) return "";
    return text.replace(/\{(\w+)\}/g, (_, key) => data[key] || "");
};

/**
 * Genereert ZPL code voor een productielabel
 * @param {Object} template - Het label ontwerp object (met elements array)
 * @param {Object} data - De variabele data
 * @param {number} printerDpi - DPI van de printer (default 203)
 * @returns {string} ZPL string
 */
export const generatePrintData = (template, data, printerDpi = 203, resolveFn = null, t = null) => {
    // Update globale DPI setting
    DPI = (Number(printerDpi) > 0 ? Number(printerDpi) : 203) / 25.4;

    // Fallback voor oude aanroepen (backward compatibility)
    // Als eerste argument geen template object is met elements, behandelen we het als 'data'
    if (!template.elements && !template.width) {
        return generateLegacyZPL(template, data); // data zit in 2e arg in oude call, maar hier in 1e
    }

    const {
        width = 90,
        height = 40,
        elements = [],
        darkness = 15,
        printSpeed = 3
    } = template;

    const {
        isLastOfBatch = true,
        columnIndex = 0,
        useDynamicLength = false // Kan true zijn als template dat toestaat
    } = data; // Data bevat nu ook de print-context opties

    // 1. Setup & Encoding
    let zpl = "^XA";            // Start Format
    zpl += "^CI28";             // UTF-8 Encoding
    zpl += `^PW${mmToDots(width)}`; // Print Width
    zpl += `^MD${darkness}`;    // Media Darkness (0-30)
    zpl += `^PR${printSpeed}`;  // Print Rate
    // Cut Mode: ^MMC = Cut na elke label, ^MMT = Tear-off (geen cut)
    zpl += isLastOfBatch ? "^MMC" : "^MMT";

    // 2. Dynamische Lengte (^LL)
    let labelHeightDots = mmToDots(height);
    if (useDynamicLength) {
        // Hier zou logica kunnen komen om hoogte te schalen o.b.v. content
        zpl += `^LL${labelHeightDots}`;
    } else {
        zpl += `^LL${labelHeightDots}`;
    }

    // 3. Kolom Berekening (X-Offset)
    // Als we 2 kolommen printen op 1 label (bijv. kleine stickers naast elkaar)
    const colOffsetMm = columnIndex === 1 ? (width / 2) : 0;
    const globalXOffset = mmToDots(colOffsetMm);

    // 4. Render Elements (De "NiceLabel" Engine)
    elements.forEach(el => {
        // Ondersteun per-object offsetX/offsetY (in mm, optioneel)
        // Voeg { offsetX: 1, offsetY: 0 } toe aan een element om extra correctie toe te passen
        // Variabelen vervangen
        let content = el.content;
        if (resolveFn) {
             const resolved = resolveFn(el, data);
             content = resolved.content || "";
             if (t) content = t(content);
        } else {
             content = parseContent(el.content, data);
        }

        // Positie berekenen
        let baseX = globalXOffset + mmToDots(el.x + (el.offsetX || 0));
        let baseY = mmToDots(el.y + (el.offsetY || 0));

        // Rotatie
        const rotationMap = { 0: 'N', 90: 'R', 180: 'I', 270: 'B' };
        const rot = rotationMap[el.rotation || 0] || 'N';
        const rawRotation = Number(el.rotation) || 0;

        // Correctie voor verticale objecten zodat print overeenkomt met preview
        // Preview gebruikt altijd linksboven vóór rotatie als referentie
        // ZPL gebruikt linksboven na rotatie, dus bij 90° X -= hoogte, bij 270° Y -= breedte
        if (rawRotation === 90) {
            baseX -= mmToDots(el.height || 0);
        } else if (rawRotation === 270) {
            baseY -= mmToDots(el.width || 0);
        }

        // TYPE: TEXT
        if (el.type === 'text') {
            let { fontHeight, fontWidth, widthDots, maxLines, charsPerLine } = getTextMetrics(el, content, rot);
            const printableMinX = mmToDots(1);
            const printableMaxX = mmToDots(width) - mmToDots(1);
            const printableMinY = mmToDots(1);
            const printableMaxY = mmToDots(height) - mmToDots(1);

            let x = baseX;
            let y = baseY;


            const isVerticalRotation = rot === 'R' || rot === 'B';
            x = Math.max(printableMinX, Math.min(x, printableMaxX));
            y = Math.max(printableMinY, Math.min(y, printableMaxY));

            // Field Block voor tekst wrapping en uitlijning.
            // Let op: op ZM400 geeft ^FB in combinatie met ^A0R/^A0B instabiele output,
            // dus voor verticale tekst bewust uitschakelen.
            if (!isVerticalRotation) {
                zpl += `^FO${x},${y}`;
                zpl += `^A0${rot},${fontHeight},${fontWidth}`;
            }

            if (widthDots && !isVerticalRotation) {
                const alignMap = { 'left': 'L', 'center': 'C', 'right': 'R', 'justify': 'J' };
                const align = alignMap[el.align] || 'L';
                zpl += `^FB${widthDots},${maxLines},0,${align},0`;
            }

            // Inverted text (wit op zwart)
            if (el.inverted && !isVerticalRotation) {
                zpl += `^FR`;
            }

            if (isVerticalRotation && widthDots) {
                const wrappedLines = wrapTextContent(content, charsPerLine, maxLines);
                const lineAdvanceDots = Math.max(1, Math.round(fontHeight * 1.05));
                const startX = rot === 'B'
                    ? x + Math.max(0, (wrappedLines.length - 1) * lineAdvanceDots)
                    : x;

                wrappedLines.forEach((line, lineIndex) => {
                    const lineX = rot === 'B'
                        ? startX - (lineIndex * lineAdvanceDots)
                        : startX + (lineIndex * lineAdvanceDots);
                    zpl += `^FO${lineX},${y}`;
                    zpl += `^A0${rot},${fontHeight},${fontWidth}`;
                    if (el.inverted) {
                        zpl += `^FR`;
                    }
                    zpl += `^FD${line}^FS`;
                });
            } else {
                zpl += `^FD${content}^FS`;
            }
        }

        // TYPE: BARCODE (Code 128)
        else if (el.type === 'barcode') {
            const x = baseX;
            const y = baseY;
            zpl += `^FO${x},${y}`;
            const h = mmToDots(el.height || 10);
            const w = el.moduleWidth || 2; // Module width (dikte streepjes)
            const showText = el.showText ? 'Y' : 'N';
            zpl += `^BY${w},3,${h}`; // Module width, ratio, height
            zpl += `^BC${rot},${h},${showText},N,N`;
            zpl += `^FD${content}^FS`;
        }

        // TYPE: QR CODE
        else if (el.type === 'qr') {
            const x = baseX;
            const y = baseY;
            zpl += `^FO${x},${y}`;
            // ^BQ orientation, model, magnification, error correction, mask
            const mag = el.magnification || 4; // Grootte (1-10)
            zpl += `^BQN,2,${mag},Q,7`;
            zpl += `^FDQA,${content}^FS`;
        }

        // TYPE: BOX / LINE
        else if (el.type === 'box' || el.type === 'line') {
            const x = baseX;
            const y = baseY;
            zpl += `^FO${x},${y}`;
            const w = mmToDots(el.width || 1);
            const h = mmToDots(el.height || 1);
            const t = mmToDots(el.thickness || 0.5);
            const color = el.color === 'white' ? 'W' : 'B'; // Black or White lines
            zpl += `^GB${w},${h},${t},${color},0^FS`;
        }

        // TYPE: IMAGE (Placeholder voor logo's)
        else if (el.type === 'image' && el.hexData) {
            const x = baseX;
            const y = baseY;
            zpl += `^FO${x},${y}`;
            // ^GFA = Graphic Field ASCII
            // Dit vereist dat de image data al geconverteerd is naar ZPL Hex formaat
            zpl += `^GFA,${el.byteCount},${el.totalBytes},${el.rowBytes},${el.hexData}^FS`;
        }
    });

    // 5. Print Quantity & Cut trigger
    if (isLastOfBatch) {
        zpl += "^PQ1,0,1,Y"; // Print 1 + Cut
    } else {
        zpl += "^PQ1,0,1,N"; // Print 1 + No Cut
    }

    zpl += "^XZ"; // Einde Format
    if (DEBUG_ZPL) {
        // Log de ZPL-output voor debugdoeleinden
         
        console.log('--- ZPL OUTPUT ---\n' + zpl + '\n--- END ZPL ---');
    }
    return zpl;
};

/**
 * Genereert een volledige ZPL batch voor lotnummers op 90mm labels.
 * Houdt font-/positie- en cutter/backfeed-gedrag consistent over alle schermen.
 */
export const generateLotBatchZPL = ({
    lots = [],
    printerDpi = 203,
    darkness = 15,
    labelWidthMm = 90,
    labelHeightMm = 13,
    qrSizeMm = 9,
    qrXmm = 2,
    qrYmm = 2.5,
    qrCellWidth = null,
    textYmm = 2.5,
    textHeightMm = 6.5,
    rightMarginMm = 2,
    gapAfterQrMm = 2,
    lotTextShiftRightMm = 0,
    separatorXmm = 2,
    separatorYmm = 12.4,
    separatorWidthMm = 86
} = {}) => {
    if (!Array.isArray(lots) || lots.length === 0) return "";

    const dotsPerMm = printerDpi === 300 ? 12 : 8;
    const toDots = (mm) => Math.round(mm * dotsPerMm);

    const leftQrX = toDots(qrXmm);
    const qrY = toDots(qrYmm);
    const textY = toDots(textYmm);
    const fontHeightDots = toDots(textHeightMm);
    const targetQrSizeDots = toDots(qrSizeMm);
    const autoQrCellWidth = Math.max(2, Math.round(targetQrSizeDots / 24));
    const effectiveQrCellWidth = Number.isFinite(Number(qrCellWidth)) && Number(qrCellWidth) > 0
        ? Number(qrCellWidth)
        : autoQrCellWidth;
    const textAreaStartDots = toDots(qrXmm + qrSizeMm + gapAfterQrMm);
    const textAreaWidthDots = toDots(labelWidthMm - rightMarginMm - (qrXmm + qrSizeMm + gapAfterQrMm));
    const lotChars = Math.max(15, ...lots.map((lot) => String(lot || "").length));
    const spreadFactor = 2.0;
    const fontWidthDots = Math.max(1, Math.round((textAreaWidthDots / lotChars) * spreadFactor));
    const estimatedTextWidthDots = lotChars * fontWidthDots;
    const lotTextShiftRightDots = toDots(lotTextShiftRightMm);
    const textX = Math.max(
        textAreaStartDots,
        textAreaStartDots + Math.round((textAreaWidthDots - estimatedTextWidthDots) / 2) + lotTextShiftRightDots
    );

    let zplBatch = "";
    lots.forEach((lot, index) => {
        const isLast = index === lots.length - 1;
        zplBatch += "^XA";
        zplBatch += "^CI28";
        zplBatch += isLast ? "^MMC" : "^MMT";
        zplBatch += `^PW${toDots(labelWidthMm)}`;
        zplBatch += `^LL${toDots(labelHeightMm)}`;
        zplBatch += `^MD${darkness}`;
        zplBatch += `^FO${leftQrX},${qrY}^BQN,2,${effectiveQrCellWidth},Q,7^FDQA,${lot}^FS`;
        zplBatch += `^FO${textX},${textY}^A0N,${fontHeightDots},${fontWidthDots}^FD${lot}^FS`;
        zplBatch += `^FO${toDots(separatorXmm)},${toDots(separatorYmm)}^GB${toDots(separatorWidthMm)},1,1^FS`;
        if (isLast) {
            zplBatch += "^PQ1,0,1,Y";
        } else {
            zplBatch += "^PQ1,0,1,N";
        }
        zplBatch += "^XZ";
    });

    return zplBatch;
};

// --- LEGACY SUPPORT (Voor hardcoded tests) ---
const generateLegacyZPL = (data, options) => {
    // Converteer oude data naar nieuwe template structuur
    const template = {
        width: options.paperWidthMm || 90,
        height: options.baseHeightMm || 40,
        elements: [
            { type: 'text', x: 2, y: 4, fontSize: 14, content: data.itemCode || 'UNKNOWN' },
            { type: 'text', x: 2, y: 12, fontSize: 8, content: data.description || '', width: 40, maxLines: 2 },
            { type: 'text', x: 2, y: 20, fontSize: 6, content: data.lotNumber },
            { type: 'text', x: 2, y: 23, fontSize: 6, content: new Date().toLocaleDateString('nl-NL') },
            { type: 'barcode', x: 2, y: 27, height: 8, content: data.lotNumber, showText: true }
        ]
    };
    return generatePrintData(template, { ...data, ...options });
};

/**
 * Helper om een test-label te genereren
 */
export const getTestZPL = () => {
    const testTemplate = {
        width: 90,
        height: 40,
        darkness: 20,
        elements: [
            { type: 'box', x: 1, y: 1, width: 88, height: 38, thickness: 0.5 }, // Kader
            { type: 'text', x: 5, y: 5, fontSize: 12, content: "ZPL ENGINE TEST", isBold: true },
            { type: 'line', x: 5, y: 10, width: 80, height: 0.5 }, // Lijn
            { type: 'text', x: 5, y: 15, fontSize: 8, content: "Variabele: {var1}" },
            { type: 'qr', x: 60, y: 12, content: "https://fpi-future-factory.web.app", magnification: 3 }
        ]
    };
    
    return generatePrintData(testTemplate, { 
        var1: "Werkt!", 
        isLastOfBatch: true 
    });
};

export const downloadZPL = (zpl, filename = "label.zpl") => {
    const blob = new Blob([zpl], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const logPrintAction = async (user, labelName, printerIp, data) => {
    try {
        const { logActivity } = await import("../config/firebase");
        await logActivity(
            user?.uid || "system",
            "PRINT_LABEL",
            `Label geprint: ${labelName || "Unknown Label"} voor lot ${data?.lotNumber || "N/A"} via ${printerIp || "Local/PDF"}`
        );
    } catch (e) {
        console.error("Failed to log print action", e);
    }
};

export const checkPrinterStatus = async (ip) => {
    if (!ip) return { online: false, message: "No IP" };
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 2000);
        await fetch(`http://${ip}/`, { signal: controller.signal, mode: 'no-cors' });
        clearTimeout(id);
        return { online: true, message: "Ready" };
    } catch (e) {
        return { online: false, message: "Printer Unreachable" };
    }
};