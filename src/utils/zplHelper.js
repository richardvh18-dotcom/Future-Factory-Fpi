import { resolveLabelContent } from "./labelHelpers";

/**
 * Genereert ZPL code voor Zebra printers op basis van een label template.
 * @param {Object} label - Het label template object
 * @param {Object} data - De data om in te vullen (order, lot, etc.)
 * @param {number} dpi - Dots per mm (8 = 203dpi, 12 = 300dpi)
 */
export const generateZPL = (label, data, dpi = 8) => {
  if (!label || !label.elements) return "";

  let zpl = "^XA\n"; // Start Format
  zpl += `^PW${Math.round(label.width * dpi)}\n`; // Print Width
  zpl += `^LL${Math.round(label.height * dpi)}\n`; // Label Length
  zpl += "^CI28\n"; // UTF-8 Encoding

  label.elements.forEach(el => {
    const resolved = resolveLabelContent(el, data);
    const content = resolved.content || "";
    const x = Math.round(el.x * dpi);
    const y = Math.round(el.y * dpi);
    
    // Field Origin
    zpl += `^FO${x},${y}`;

    if (el.type === "text") {
      // Font scaling (benadering)
      // ZPL Font 0 (Scalable)
      const h = Math.round(el.fontSize * 2.8); 
      const w = Math.round(el.fontSize * 2.8);
      zpl += `^A0N,${h},${w}`;
      zpl += `^FD${content}^FS\n`;
    } else if (el.type === "barcode") {
      // Code 128
      const h = Math.round((el.height || 10) * dpi);
      zpl += `^BCN,${h},N,N,N`;
      zpl += `^FD${content}^FS\n`;
    } else if (el.type === "qr") {
      // QR Code
      const mag = Math.max(2, Math.round((el.width || 20) / 5)); 
      zpl += `^BQN,2,${mag}`;
      zpl += `^FDQA,${content}^FS\n`;
    } else if (el.type === "box") {
        // Graphic Box
        const w = Math.round(el.width * dpi);
        const h = Math.round(el.height * dpi);
        const t = Math.round((el.thickness || 1) * dpi);
        zpl += `^GB${w},${h},${t}^FS\n`;
    } else if (el.type === "line") {
        // Line (Graphic Box with height/width as thickness)
        const w = Math.round(el.width * dpi);
        const h = Math.round(el.height * dpi); 
        zpl += `^GB${w},${h},${h}^FS\n`; 
    }
  });

  zpl += "^XZ"; // End Format
  return zpl;
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
