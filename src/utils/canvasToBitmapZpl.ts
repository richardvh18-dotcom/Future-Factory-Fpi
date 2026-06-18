/**
 * Canvas-to-Bitmap ZPL Converter
 * 
 * Rendert HTML-canvas als zwart/wit bitmap en genereert ZPL ^GFA commando
 * voor 1-op-1 print parity tussen preview en fysieke label
 */

type BitmapRenderOptions = {
    width: number;      // Label width in mm
    height: number;     // Label height in mm
    printerDpi?: number; // Printer DPI (default 203)
    darkness?: number;   // Media darkness (0-30)
    printSpeed?: number; // Print speed (0-12)
    inverted?: boolean;  // Invert black/white (default false)
    threshold?: number;  // Luma threshold 0-255 (hoger = dikkere/vollere tekst)
    strokeBoost?: number; // Extra pixel-verdikking (0 = uit, 1..2 aanbevolen)
};

type GfaData = {
    hexString: string;  // Hex-encoded bitmap data
    byteCount: number;  // Aantal bytes
    rowBytes: number;   // Bytes per rij
    totalHeight: number; // Hoogte in dots
};

/**
 * Converteert pixel-data naar ZPL GFA bitmap formaat
 * 
 * ZPL GFA: ^GFA,[bytes],[totalBytes],[rowBytes],[hex data]
 * Elk bit = 1 pixel (1 = zwart, 0 = wit)
 * Data is row-major, MSB first
 */
export const pixelsToGfaBitmap = (
    imageData: Uint8ClampedArray,
    widthDots: number,
    heightDots: number,
    inverted = false,
    threshold = 188
): GfaData => {
    // imageData is RGBA (4 bytes per pixel)
    // We converteren naar 1-bit zwart/wit
    
    // Bereken bytes per rij (ronde omhoog naar nearest byte)
    const rowBytes = Math.ceil(widthDots / 8);
    const totalBytes = rowBytes * heightDots;
    
    const boostedMask = buildBoostedMaskFromImageData(imageData, widthDots, heightDots, threshold);

    // Zet alle pixels om naar array van bytes
    const bitmapBytes: number[] = [];
    
    for (let y = 0; y < heightDots; y++) {
        let currentByte = 0;
        let bitPosition = 0;
        
        for (let x = 0; x < widthDots; x++) {
            let pixelBit = boostedMask[y * widthDots + x];
            
            // Invert als nodig
            if (inverted) {
                pixelBit = pixelBit === 1 ? 0 : 1;
            }
            
            // Zet bit in huidige byte (MSB first)
            currentByte = (currentByte << 1) | pixelBit;
            bitPosition++;
            
            // Byte is vol
            if (bitPosition === 8 || x === widthDots - 1) {
                // Pad met nullen als dit de laatste byte van rij is en niet vol
                if (bitPosition < 8) {
                    currentByte <<= (8 - bitPosition);
                }
                bitmapBytes.push(currentByte);
                currentByte = 0;
                bitPosition = 0;
            }
        }
    }
    
    // Converteren naar hex string
    const hexString = bitmapBytes
        .map(byte => {
            const hex = byte.toString(16).toUpperCase();
            return hex.padStart(2, '0');
        })
        .join('');
    
    return {
        hexString,
        byteCount: bitmapBytes.length,
        rowBytes,
        totalHeight: heightDots
    };
};

const buildBoostedMaskFromImageData = (
    imageData: Uint8ClampedArray,
    widthDots: number,
    heightDots: number,
    threshold = 188,
    strokeBoost = 0
): Uint8Array => {
    // 2-pass conversie:
    // 1) threshold naar binair masker
    // 2) lichte edge-boost op bijna-zwarte anti-aliased randpixels
    const normalizedThreshold = Math.max(1, Math.min(254, Number(threshold) || 188));
    const edgeBoostThreshold = Math.min(254, normalizedThreshold + 14);
    const lumaMap = new Uint16Array(widthDots * heightDots);
    const mask = new Uint8Array(widthDots * heightDots);

    for (let y = 0; y < heightDots; y++) {
        for (let x = 0; x < widthDots; x++) {
            const idx = y * widthDots + x;
            const pixelIndex = idx * 4;
            const r = imageData[pixelIndex];
            const g = imageData[pixelIndex + 1];
            const b = imageData[pixelIndex + 2];
            const luma = (r * 299 + g * 587 + b * 114) / 1000;
            lumaMap[idx] = Math.round(luma);
            mask[idx] = luma < normalizedThreshold ? 1 : 0;
        }
    }

    const boostedMask = new Uint8Array(mask);
    for (let y = 1; y < heightDots - 1; y++) {
        for (let x = 1; x < widthDots - 1; x++) {
            const idx = y * widthDots + x;
            if (mask[idx] === 1) continue;
            if (lumaMap[idx] >= edgeBoostThreshold) continue;

            const hasBlackNeighbor =
                mask[idx - 1] === 1 ||
                mask[idx + 1] === 1 ||
                mask[idx - widthDots] === 1 ||
                mask[idx + widthDots] === 1;

            if (hasBlackNeighbor) {
                boostedMask[idx] = 1;
            }
        }
    }

    const boostRadius = Math.max(0, Math.min(3, Math.floor(Number(strokeBoost) || 0)));
    if (boostRadius === 0) {
        return boostedMask;
    }

    // Morfologische dilatie: verdik bestaande zwarte pixels met een kleine radius.
    const dilated = new Uint8Array(boostedMask);
    for (let y = 0; y < heightDots; y++) {
        for (let x = 0; x < widthDots; x++) {
            const idx = y * widthDots + x;
            if (boostedMask[idx] !== 1) continue;

            for (let dy = -boostRadius; dy <= boostRadius; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= heightDots) continue;
                for (let dx = -boostRadius; dx <= boostRadius; dx++) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= widthDots) continue;
                    dilated[ny * widthDots + nx] = 1;
                }
            }
        }
    }

    return dilated;
};

export const canvasToPrinterMonochromeCanvas = (
    canvas: HTMLCanvasElement,
    options: {
        width: number;
        height: number;
        printerDpi?: number;
        threshold?: number;
        strokeBoost?: number;
    }
): HTMLCanvasElement => {
    const {
        width,
        height,
        printerDpi = 203,
        threshold = 188,
        strokeBoost = 0
    } = options;

    const dotsPerMm = printerDpi / 25.4;
    const widthDots = Math.max(1, Math.round(width * dotsPerMm));
    const heightDots = Math.max(1, Math.round(height * dotsPerMm));

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = widthDots;
    tempCanvas.height = heightDots;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!tempCtx) {
        throw new Error('Temp canvas 2D context not available');
    }

    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, widthDots, heightDots);
    tempCtx.drawImage(canvas, 0, 0, widthDots, heightDots);

    const srcData = tempCtx.getImageData(0, 0, widthDots, heightDots);
    const boostedMask = buildBoostedMaskFromImageData(srcData.data, widthDots, heightDots, threshold, strokeBoost);

    const monoCanvas = document.createElement('canvas');
    monoCanvas.width = widthDots;
    monoCanvas.height = heightDots;
    const monoCtx = monoCanvas.getContext('2d', { willReadFrequently: true });
    if (!monoCtx) {
        throw new Error('Monochrome canvas 2D context not available');
    }

    const out = monoCtx.createImageData(widthDots, heightDots);
    for (let i = 0; i < boostedMask.length; i++) {
        const offset = i * 4;
        const isBlack = boostedMask[i] === 1;
        const value = isBlack ? 0 : 255;
        out.data[offset] = value;
        out.data[offset + 1] = value;
        out.data[offset + 2] = value;
        out.data[offset + 3] = 255;
    }
    monoCtx.putImageData(out, 0, 0);
    return monoCanvas;
};

/**
 * Rendert een canvas-element naar ZPL GFA bitmap
 * 
 * @param canvas HTML Canvas element
 * @param options Bitmap render opties
 * @returns ZPL GFA commando string
 */
export const canvasToZplGfa = (
    canvas: HTMLCanvasElement,
    options: BitmapRenderOptions
): string => {
    const {
        width,
        height,
        printerDpi = 203,
        darkness = 15,
        printSpeed = 3,
        inverted = false,
        threshold = 168,
        strokeBoost = 0
    } = options;
    
    // Converteer mm naar dots
    const dotsPerMm = printerDpi / 25.4;
    const widthDots = Math.round(width * dotsPerMm);
    const heightDots = Math.round(height * dotsPerMm);
    
    // Haal raster data op
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
        throw new Error('Canvas 2D context not available');
    }
    
    // Zet canvas op printer-resolutie voor 1-op-1 rendering
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = widthDots;
    tempCanvas.height = heightDots;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!tempCtx) {
        throw new Error('Temp canvas 2D context not available');
    }
    
    // Teken direct naar doelresolutie; de broncanvas is al op juiste verhouding opgebouwd.
    tempCtx.drawImage(canvas, 0, 0, widthDots, heightDots);
    
    // Haal bitmap data op
    const imageData = tempCtx.getImageData(0, 0, widthDots, heightDots);
    
    // Converteren naar ZPL bitmap
    const boosted = buildBoostedMaskFromImageData(imageData.data, widthDots, heightDots, threshold, strokeBoost);
    const rgbaFromBoosted = new Uint8ClampedArray(widthDots * heightDots * 4);
    for (let i = 0; i < boosted.length; i++) {
        const o = i * 4;
        const v = boosted[i] === 1 ? 0 : 255;
        rgbaFromBoosted[o] = v;
        rgbaFromBoosted[o + 1] = v;
        rgbaFromBoosted[o + 2] = v;
        rgbaFromBoosted[o + 3] = 255;
    }
    const gfa = pixelsToGfaBitmap(rgbaFromBoosted, widthDots, heightDots, inverted, 128);
    
    // Bouw ZPL commando
    let zpl = "^XA";
    zpl += "^CI28";  // UTF-8 Encoding
    zpl += `^PW${widthDots}`;  // Print Width
    zpl += `^LL${heightDots}`;  // Label Length
    zpl += `^MD${darkness}`;    // Media Darkness
    zpl += `^PR${printSpeed}`;  // Print Speed
    zpl += "^MMC";  // Cut mode
    
    // GFA commando: ^GFA,bytes,totalBytes,rowBytes,[hex data]
    zpl += `^FO0,0^GFA,${gfa.byteCount},${gfa.byteCount},${gfa.rowBytes},${gfa.hexString}^FS`;
    
    // Print 1x en cut
    zpl += "^PQ1,0,1,Y";
    zpl += "^XZ";
    
    return zpl;
};

/**
 * Async wrapper: Wacht tot canvas beschikbaar is en genereert ZPL
 */
export const canvasToZplGfaAsync = async (
    canvas: HTMLCanvasElement,
    options: BitmapRenderOptions
): Promise<string> => {
    return new Promise((resolve, reject) => {
        // Zorg dat canvas volledig gerenderd is voordat we bitmap genereren
        requestAnimationFrame(() => {
            try {
                const zpl = canvasToZplGfa(canvas, options);
                resolve(zpl);
            } catch (error) {
                reject(error);
            }
        });
    });
};

/**
 * Render-to-canvas helper: Neemt React/HTML component en rendert naar canvas
 * 
 * Dit is voor toekomstige use-cases waar we direct HTML → bitmap willen gaan
 */
export const htmlToCanvas = async (
    element: HTMLElement,
    widthDots: number,
    heightDots: number
): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas');
    canvas.width = widthDots;
    canvas.height = heightDots;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas 2D context not available');
    }
    
    // Dit is een simpele implementatie; voor complexe HTML zou je
    // een library als html2canvas moeten gebruiken
    ctx.drawImage(element as any, 0, 0);
    
    return canvas;
};

/**
 * Test: Genereer simpel zwart/wit bitmap
 */
export const getTestBitmapZpl = (): string => {
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 203;  // 1 inch @ 203 DPI
    testCanvas.height = 203;
    
    const ctx = testCanvas.getContext('2d')!;
    
    // Witte achtergrond
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, testCanvas.width, testCanvas.height);
    
    // Zwarte rand
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 5;
    ctx.strokeRect(5, 5, testCanvas.width - 10, testCanvas.height - 10);
    
    // Tekst
    ctx.fillStyle = 'black';
    ctx.font = 'bold 40px Arial';
    ctx.fillText('BITMAP', 30, 120);
    
    return canvasToZplGfa(testCanvas, {
        width: 25.4,  // 1 inch
        height: 25.4,
        printerDpi: 203
    });
};
