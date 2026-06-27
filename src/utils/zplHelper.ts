// Debugmodus: zet op true om ZPL-output te loggen
const DEBUG_ZPL = false;

type ZplRotation = "N" | "R" | "I" | "B";
type ZplTextAlign = "left" | "center" | "right" | "justify";

type ZplElement = {
    type: "text" | "barcode" | "qr" | "box" | "line" | "image";
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    offsetX?: number;
    offsetY?: number;
    rotation?: number;
    content?: string;
    fontSize?: number;
    fontWidth?: number;
    fontFamily?: string;
    maxLines?: number;
    align?: ZplTextAlign;
    inverted?: boolean;
    moduleWidth?: number;
    showText?: boolean;
    magnification?: number;
    thickness?: number;
    color?: string;
    hexData?: string;
    byteCount?: number;
    totalBytes?: number;
    rowBytes?: number;
};

type ZplTemplate = {
    width?: number;
    height?: number;
    elements?: ZplElement[];
    darkness?: number;
    printSpeed?: number;
};

type LabelData = Record<string, unknown> & {
    isLastOfBatch?: boolean;
    columnIndex?: number;
    useDynamicLength?: boolean;
    lotNumber?: string;
    zplTextFont?: string;
};

type LegacyOptions = {
    paperWidthMm?: number;
    baseHeightMm?: number;
    [key: string]: unknown;
};

type ResolveFn = (el: ZplElement, data: LabelData) => { content?: string } | null | undefined;
type TranslateFn = (value: string) => string;
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
const mmToDots = (mm: number): number => Math.round(mm * DPI);
let DPI = DEFAULT_DPI;

const getLongestLineLength = (value: unknown): number => {
    const lines = String(value || "").split(/\r?\n/);
    return lines.reduce((maxLen: number, line: string) => Math.max(maxLen, line.length), 0);
};

const wrapTextContent = (value: unknown, maxCharsPerLine = 1, maxLines = 1): string[] => {
    const safeMaxChars = Math.max(1, Math.floor(maxCharsPerLine));
    const safeMaxLines = Math.max(1, Math.floor(maxLines));
    const sourceLines = String(value || "").replace(/\r/g, "").split("\n");
    const wrapped: string[] = [];

    const pushLine = (line: string): void => {
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

const PREVIEW_GLYPH_ASPECT_RATIO = 0.46; // Zebra Font 0 is "CG Triumvirate Bold Condensed" (smal lettertype)
const PREVIEW_TEXT_PADDING = 1.0;
const PRINT_FONT_HEIGHT_VISUAL_BOOST = 1.25; 
const PRINT_FONT_WIDTH_VISUAL_BOOST = 1.25;
const DEFAULT_ZPL_TEXT_FONT = "0";

const normalizeZplFontName = (value: unknown): string => {
    const raw = String(value || "").trim().toUpperCase();
    if (!raw) return DEFAULT_ZPL_TEXT_FONT;

    if (raw === "A" || raw === "0") return raw;
    if (raw.includes("FONTA") || raw.includes("ZEBRA-A")) return "A";
    if (raw.includes("FONT0") || raw.includes("ZEBRA-0") || raw.includes("FONT O")) return "0";

    return DEFAULT_ZPL_TEXT_FONT;
};

const buildTextFontCommand = (fontName: string, rot: ZplRotation, height: number, width: number): string => {
    if (fontName === "A") {
        return `^AA${rot},${height},${width}`;
    }

    return `^A0${rot},${height},${width}`;
};

const getTextMetrics = (el: ZplElement, content: string, rot: ZplRotation = "N") => {
    // Converteer font points (pt) naar printer dots op basis van de actuele DPI.
    // 1 pt = 1/72 inch. Printer dots per inch = DPI * 25.4.
    const dotsPerPoint = (DPI * 25.4) / 72;
    const requestedHeight = Math.max(
        1,
        Math.round((Number(el.fontSize) || 10) * dotsPerPoint * PRINT_FONT_HEIGHT_VISUAL_BOOST)
    );
    const hasExplicitWidth = Number.isFinite(Number(el.fontWidth));
    const explicitWidth = hasExplicitWidth
        ? Math.max(
            1,
            Math.round((Number(el.fontWidth) || 12) * dotsPerPoint * PRINT_FONT_WIDTH_VISUAL_BOOST)
        )
        : 0;
    const naturalWidth = explicitWidth || Math.max(
        1,
        Math.round(requestedHeight * PREVIEW_GLYPH_ASPECT_RATIO * PRINT_FONT_WIDTH_VISUAL_BOOST)
    );

    if (!el.width) {
        const fallbackWidth = Math.max(
            1,
            Math.round(requestedHeight * PREVIEW_GLYPH_ASPECT_RATIO * PRINT_FONT_WIDTH_VISUAL_BOOST)
        );
        return {
            fontHeight: requestedHeight,
            fontWidth: hasExplicitWidth ? explicitWidth : fallbackWidth,
            widthDots: null,
        };
    }

    // Bij verticale tekst (90/270) is de effectieve wrap-richting omgedraaid.
    // Gebruik dan de element-hoogte als breedte voor ^FB wrap.
    const wrapWidthMm = (rot === 'R' || rot === 'B')
        ? (Number(el.height) || Number(el.width) || 0)
        : Number(el.width);
    const rawWidthDots = mmToDots(wrapWidthMm);
    const innerWidthDots = Math.max(1, Math.floor(rawWidthDots * PREVIEW_TEXT_PADDING));
    const maxLines = Math.max(1, Number(el.maxLines) || 1);
    // Het beschikbare regelbudget staat bij verticale tekst op de X-as (element.width).
    const lineBudgetMm = (rot === 'R' || rot === 'B')
        ? (Number(el.width) || Number(el.height) || 0)
        : (Number(el.height) || 0);
    const heightLimitDots = lineBudgetMm
        ? Math.max(1, Math.floor((mmToDots(lineBudgetMm) * 0.9) / maxLines))
        : requestedHeight;
    const longestLineLength = Math.max(1, getLongestLineLength(content));
    const estimatedLongestWrappedLine = Math.max(1, Math.ceil(longestLineLength / maxLines));
    const maxCharWidth = Math.max(1, Math.floor((innerWidthDots * 1.0) / estimatedLongestWrappedLine));
    const fittedWidth = Math.min(naturalWidth, maxCharWidth);
    // Houd de glyph-ratio stabiel: als de beschikbare breedte kleiner wordt,
    // schaal de hoogte mee om overlap in kopregels te voorkomen.
    const widthRatio = hasExplicitWidth
        ? (fittedWidth / Math.max(1, explicitWidth))
        : 1;
    const widthConstrainedHeight = hasExplicitWidth
        ? Math.max(1, Math.floor(requestedHeight * Math.min(1, widthRatio)))
        : Math.max(1, Math.floor(fittedWidth / PREVIEW_GLYPH_ASPECT_RATIO));
    const fittedHeight = Math.max(1, Math.min(heightLimitDots, requestedHeight, widthConstrainedHeight));

    return {
        fontHeight: fittedHeight,
        fontWidth: hasExplicitWidth
            ? fittedWidth
            : Math.max(1, Math.round(fittedHeight * PREVIEW_GLYPH_ASPECT_RATIO * PRINT_FONT_WIDTH_VISUAL_BOOST)),
        widthDots: innerWidthDots,
    };
};


/**
 * Vervangt placeholders zoals {itemCode} met echte data
 */
const parseContent = (text: string | undefined, data: LabelData): string => {
    if (!text) return "";
    return text.replace(/\{(\w+)\}/g, (_match: string, key: string) => String(data[key] ?? ""));
};

/**
 * Genereert ZPL code voor een productielabel
 * @param {Object} template - Het label ontwerp object (met elements array)
 * @param {Object} data - De variabele data
 * @param {number} printerDpi - DPI van de printer (default 203)
 * @returns {string} ZPL string
 */
export const generatePrintData = (
    template: ZplTemplate | LabelData,
    data: LabelData = {},
    printerDpi = 203,
    resolveFn: ResolveFn | null = null,
    t: TranslateFn | null = null
): string => {
    // Update globale DPI setting
    DPI = (Number(printerDpi) > 0 ? Number(printerDpi) : 203) / 25.4;

    // Fallback voor oude aanroepen (backward compatibility)
    // Als eerste argument geen template object is met elements, behandelen we het als 'data'
    const templateInput = template as ZplTemplate;
    if (!templateInput.elements && !templateInput.width) {
        return generateLegacyZPL(template as LabelData, data as LegacyOptions); // data zit in 2e arg in oude call, maar hier in 1e
    }

    const {
        width = 90,
        height = 40,
        elements = [],
        darkness = 15,
        printSpeed = 3
    } = templateInput;

    const {
        isLastOfBatch = true,
        columnIndex = 0,
        useDynamicLength = false // Kan true zijn als template dat toestaat
    } = data; // Data bevat nu ook de print-context opties
    const requestedFont = normalizeZplFontName(data.zplTextFont);

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
    elements.forEach((el: ZplElement) => {
        // Ondersteun per-object offsetX/offsetY (in mm, optioneel)
        // Voeg { offsetX: 1, offsetY: 0 } toe aan een element om extra correctie toe te passen
        // Variabelen vervangen
              const resolvedContent = resolveFn
                  ? String(resolveFn(el, data)?.content || "")
                  : parseContent(el.content, data);
              const content = t ? t(resolvedContent) : resolvedContent;

        // Positie berekenen
        let baseX = globalXOffset + mmToDots(Number(el.x || 0) + Number(el.offsetX || 0));
        let baseY = mmToDots(Number(el.y || 0) + Number(el.offsetY || 0));

        // Rotatie
        const rotationMap: Record<0 | 90 | 180 | 270, ZplRotation> = { 0: "N", 90: "R", 180: "I", 270: "B" };
        const rotationValue = Number(el.rotation) || 0;
        const normalizedRotation: 0 | 90 | 180 | 270 =
            rotationValue === 90 || rotationValue === 180 || rotationValue === 270 ? rotationValue : 0;
        const rot = rotationMap[normalizedRotation];

        // Correctie voor verticale objecten zodat print overeenkomt met preview
        // Preview gebruikt altijd linksboven vóór rotatie als referentie
        // ZPL gebruikt linksboven na rotatie, dus bij 90° X -= hoogte, bij 270° Y -= breedte
        // BUGFIX: ZPL ^FO uses the exact origin of the first character. HTML preview with transform-origin: top-left
        // places the top-left of the first character exactly at el.x, el.y. So NO adjustment is needed!
        // if (rawRotation === 90) {
        //     baseX -= mmToDots(el.height || 0);
        // } else if (rawRotation === 270) {
        //     baseY -= mmToDots(el.width || 0);
        // }

        // TYPE: TEXT
        if (el.type === 'text') {
            let { fontHeight, fontWidth, widthDots } = getTextMetrics(el, content, rot);

            let x = baseX;
            let y = baseY;

            const alignMap: Record<ZplTextAlign, string> = { 'left': 'L', 'center': 'C', 'right': 'R', 'justify': 'J' };
            const alignKey: ZplTextAlign = el.align === 'center' || el.align === 'right' || el.align === 'justify' ? el.align : 'left';
            const align = alignMap[alignKey] || 'L';
            const maxLines = Math.max(1, Number(el.maxLines || 1));
            
            let applyFB = !!widthDots;

            if (widthDots) {
                const isVertical = rot === 'R' || rot === 'B';
                
                // Schakel het bug-gevoelige Zebra Field Block (^FB) ALLEEN uit voor VERTICALE tekst
                if (maxLines === 1 && isVertical) {
                    applyFB = false;
                    
                    // Manuele uitlijning zonder ^FB (voorkomt verspringende karakters bij rotatie)
                    if (align !== 'L') {
                        const estimatedTextLength = content.length * (fontHeight * 0.60);
                        const shift = align === 'C' ? Math.floor((widthDots - estimatedTextLength) / 2) : (widthDots - estimatedTextLength);
                        
                        if (shift > 0) { // Voorkom negatieve shift (naar links/boven)
                            if (rot === 'R') y += shift;
                            else if (rot === 'B') y -= shift;
                        }
                    }
                } else if (maxLines === 1 && !isVertical) {
                    // Voor horizontale tekst: behoud ^FB maar maak het veld ruimer om afkappen (clipping) te voorkomen
                    const extraSpace = 200; 
                    widthDots += extraSpace;
                    if (align === 'C') x -= Math.floor(extraSpace / 2);
                    else if (align === 'R') x -= extraSpace;
                }
            }

            zpl += `^FO${Math.round(x)},${Math.round(y)}`;
            const safeFontHeight = Math.max(4, Math.min(fontHeight, 500));
            const safeFontWidth = Math.max(2, Math.min(fontWidth, 500));
            const elementFont = normalizeZplFontName(el.fontFamily);
            const effectiveFont = elementFont !== DEFAULT_ZPL_TEXT_FONT ? elementFont : requestedFont;
            zpl += buildTextFontCommand(effectiveFont, rot, safeFontHeight, safeFontWidth);

            if (applyFB && widthDots) {
                zpl += `^FB${widthDots},${maxLines},0,${align},0`;
            }

            // Inverted text (wit op zwart)
            if (el.inverted) {
                zpl += `^FR`;
            }

            zpl += `^FD${content}^FS`;
        }

        // TYPE: BARCODE (Code 128)
        else if (el.type === 'barcode') {
            const x = baseX;
            const y = baseY;
            zpl += `^FO${x},${y}`;
            const h = mmToDots(Number(el.height || 10));
            const w = Number(el.moduleWidth || 2); // Module width (dikte streepjes)
            const showText = el.showText ? 'Y' : 'N';
            zpl += `^BY${w},3,${h}`; // Module width, ratio, height
            zpl += `^BC${rot},${h},${showText},N,N`;
            zpl += `^FD${content}^FS`;
        }

        // TYPE: QR CODE
        else if (el.type === 'qr') {
            let x = baseX;
            let y = baseY;

            // QR in ZPL gebruikt discrete moduleschaal (magnification), terwijl de editor
            // in mm werkt. Bereken daarom een schaal op basis van element width/height.
            const targetQrMm = Math.max(Number(el.width || 0), Number(el.height || 0));
            const targetQrDots = targetQrMm > 0 ? mmToDots(targetQrMm) : 0;
            const autoMag = targetQrDots > 0 ? Math.max(2, Math.round(targetQrDots / 24)) : 4;
            const rawMag = targetQrDots > 0
                ? autoMag
                : Number(el.magnification || 4);
            const mag = Math.max(1, Math.min(10, Math.round(rawMag)));

            // Center de effectieve QR-bitmap binnen het gewenste elementvak.
            if (targetQrDots > 0) {
                const renderedQrDots = mag * 24;
                const delta = Math.round((targetQrDots - renderedQrDots) / 2);
                x += delta;
                y += delta;
            }

            zpl += `^FO${x},${y}`;
            // ^BQ orientation, model, magnification, error correction, mask
            zpl += `^BQN,2,${mag},Q,7`;
            zpl += `^FDQA,${content}^FS`;
        }

        // TYPE: BOX / LINE
        else if (el.type === 'box' || el.type === 'line') {
            const x = baseX;
            const y = baseY;
            zpl += `^FO${x},${y}`;
            const w = mmToDots(Number(el.width || 1));
            const h = mmToDots(Number(el.height || 1));
            const t = mmToDots(Number(el.thickness || 0.5));
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
            zpl += `^GFA,${Number(el.byteCount || 0)},${Number(el.totalBytes || 0)},${Number(el.rowBytes || 0)},${el.hexData}^FS`;
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
         
    }
    return zpl;
};

/**
 * Genereert een volledige ZPL batch voor lotnummers op 90mm labels.
 * Houdt font-/positie- en cutter/backfeed-gedrag consistent over alle schermen.
 */
export const generateLotBatchZPL = ({
    lots = [],
    orderNumber = "",
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
}: {
    lots?: Array<string | number>;
    orderNumber?: string;
    printerDpi?: number;
    darkness?: number;
    labelWidthMm?: number;
    labelHeightMm?: number;
    qrSizeMm?: number;
    qrXmm?: number;
    qrYmm?: number;
    qrCellWidth?: number | null;
    textYmm?: number;
    textHeightMm?: number;
    rightMarginMm?: number;
    gapAfterQrMm?: number;
    lotTextShiftRightMm?: number;
    separatorXmm?: number;
    separatorYmm?: number;
    separatorWidthMm?: number;
} = {}): string => {
    if (!Array.isArray(lots) || lots.length === 0) return "";

    const normalizedOrderNumber = String(orderNumber || "").trim();
    const rows = [
        ...lots.map((lot) => ({
            text: String(lot || ""),
            qrValue: String(lot || ""),
        })),
        ...(normalizedOrderNumber
            ? [{ text: `ORDER ${normalizedOrderNumber}`, qrValue: normalizedOrderNumber }]
            : []),
    ];

    const dotsPerMm = printerDpi === 300 ? 12 : 8;
    const toDots = (mm: number): number => Math.round(mm * dotsPerMm);

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
    const lotChars = Math.max(15, ...rows.map((row) => String(row.text || "").length));
    // Character width is 52% of height for monospace fonts (standard Zebra font)
    const fontWidthDots = Math.max(1, Math.round(fontHeightDots * 0.52));
    const estimatedTextWidthDots = lotChars * fontWidthDots;
    const lotTextShiftRightDots = toDots(lotTextShiftRightMm);
    const textX = Math.max(
        textAreaStartDots,
        textAreaStartDots + Math.round((textAreaWidthDots - estimatedTextWidthDots) / 2) + lotTextShiftRightDots
    );

    let zplBatch = "";
    const safeFontHeight = Math.max(6, Math.min(fontHeightDots, 500)); // Ensure valid range
    rows.forEach((row, index) => {
        const isLast = index === rows.length - 1;
        zplBatch += "^XA";
        zplBatch += "^CI28";
        zplBatch += isLast ? "^MMC" : "^MMT";
        zplBatch += `^PW${toDots(labelWidthMm)}`;
        zplBatch += `^LL${toDots(labelHeightMm)}`;
        zplBatch += `^MD${darkness}`;
        zplBatch += `^FO${leftQrX},${qrY}^BQN,2,${effectiveQrCellWidth},Q,7^FDQA,${row.qrValue}^FS`;
        zplBatch += `^FO${textX},${textY}^A0N,${safeFontHeight},${fontWidthDots}^FD${row.text}^FS`;
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
const generateLegacyZPL = (data: LabelData = {}, options: LegacyOptions = {}): string => {
    // Converteer oude data naar nieuwe template structuur
    const template = {
        width: options.paperWidthMm || 90,
        height: options.baseHeightMm || 40,
        elements: [
            { type: 'text', x: 2, y: 4, fontSize: 14, content: String(data.itemCode || 'UNKNOWN') },
            { type: 'text', x: 2, y: 12, fontSize: 8, content: String(data.description || ''), width: 40, maxLines: 2 },
            { type: 'text', x: 2, y: 20, fontSize: 6, content: String(data.lotNumber || '') },
            { type: 'text', x: 2, y: 23, fontSize: 6, content: new Date().toLocaleDateString('nl-NL') },
            { type: 'barcode', x: 2, y: 27, height: 8, content: String(data.lotNumber || ''), showText: true }
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

export const downloadZPL = (zpl: string, filename = "label.zpl"): void => {
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

/**
 * BITMAP PRINT MODE: Genereer label als pure raster (GFA bitmap)
 * in plaats van ZPL commando's. Dit garandeert 1-op-1 parity tussen
 * preview en fysieke print.
 */
export const generateBitmapPrintData = async (
    labelCanvas: HTMLCanvasElement | null,
    width: number,
    height: number,
    printerDpi = 203,
    darkness = 15,
    printSpeed = 3
): Promise<string> => {
    if (!labelCanvas) {
        throw new Error("Label canvas required for bitmap rendering");
    }

    try {
        const { canvasToZplGfa } = await import("./canvasToBitmapZpl");
        
        const zplRaw = canvasToZplGfa(labelCanvas, {
            width,
            height,
            printerDpi,
            darkness,
            printSpeed,
            // Houd nog wat anti-aliased randpixels vast, maar zonder kleine letters dicht te smeren.
            threshold: 188,
            strokeBoost: 0
        });

        const zpl = String(zplRaw || '').replace(/^\^XA/, '^XA\n^FXBITMAP_V3_TS160^FS');

        return zpl;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Bitmap rendering failed: ${message}`);
    }
};

/**
 * Helper om HTML element naar canvas te converteren (voor bitmap print)
 * Dit is een simpele implementatie; voor complexe layouts gebruik html2canvas library
 */
export const captureElementAsCanvas = async (
    element: HTMLElement | null,
    widthMm: number,
    heightMm: number,
    printerDpi = 203
): Promise<HTMLCanvasElement> => {
    if (!element) {
        throw new Error("Element required for canvas capture");
    }

    const canvas = document.createElement('canvas');
    const dotsPerMm = printerDpi / 25.4;
    canvas.width = Math.round(widthMm * dotsPerMm);
    canvas.height = Math.round(heightMm * dotsPerMm);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error("Canvas 2D context not available");
    }

    // Zet witte achtergrond
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Gebruik html2canvas package direct voor betrouwbare rendering.
    if ((document as any)?.fonts?.ready) {
        try {
            await (document as any).fonts.ready;
        } catch {
            // Font readiness is best-effort.
        }
    }

    const { default: html2canvas } = await import('html2canvas');
    // Render het element 1:1 (het is al op 4× renderZoom gerenderd via unifiedLabelRenderEngine).
    // captureElementAsCanvas schaalt het grote canvas terug naar printerresolutie.
    const renderCanvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 1,
        useCORS: true,
        logging: false
    });

    // Downsample van grote render naar printerresolutie dots (versterkt lettertypegewicht).
    ctx.drawImage(renderCanvas, 0, 0, canvas.width, canvas.height);
    return canvas;
};

export const logPrintAction = async (
    user: { uid?: string } | null | undefined,
    labelName: string | null | undefined,
    printerIp: string | null | undefined,
    data: { lotNumber?: string } | null | undefined
): Promise<void> => {
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

export const checkPrinterStatus = async (ip: string | null | undefined): Promise<{ online: boolean; message: string }> => {
    if (!ip) return { online: false, message: "No IP" };
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 2000);
        await fetch(`http://${ip}/`, { signal: controller.signal, mode: 'no-cors' });
        clearTimeout(id);
        return { online: true, message: "Ready" };
    } catch {
        return { online: false, message: "Printer Unreachable" };
    }
};