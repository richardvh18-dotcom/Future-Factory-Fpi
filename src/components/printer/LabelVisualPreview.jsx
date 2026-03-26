import React from 'react';
import { resolveLabelContent, getBarcodeUrl } from '../../utils/labelHelpers';
import InternalQrImage from '../../utils/InternalQrImage';

const PIXELS_PER_MM = 3.78;
const CSS_PIXELS_PER_POINT = 96 / 72;
const PRINTER_PREVIEW_FONT_STACK = '"Lucida Console", "Courier New", monospace';

const getLongestPreviewLineLength = (value) => {
  const lines = String(value || "").split(/\r?\n/);
  return lines.reduce((maxLen, line) => Math.max(maxLen, line.length), 0);
};

/**
 * Berekent tekststijl exact gelijk aan AdminLabelDesigner.getPreviewTextStyle
 * zodat preview en designer identiek renderen.
 */
const getPreviewTextStyle = (element, content, zoom, rotation = 0) => {
  const normalizedRotation = ((Number(rotation) || 0) % 360 + 360) % 360;
  const isVerticalRotation = normalizedRotation === 90 || normalizedRotation === 270;
  const baseFontPx = (element.fontSize || 10) * CSS_PIXELS_PER_POINT * zoom;

  if (isVerticalRotation) {
    // Bij verticale rotatie is el.height het loopvlak voor tekst (de "breedte" na rotatie)
    const runLengthMm = element.height || element.width || 0;
    const runLengthPx = runLengthMm * PIXELS_PER_MM * zoom;
    const maxLines = Math.max(1, Number(element.maxLines) || 1);
    // el.width wordt na rotatie de "hoogte" — het budget voor meerdere regels
    const lineBudgetMm = element.width || element.height || 0;
    const lineBudgetPx = lineBudgetMm * PIXELS_PER_MM * zoom;

    if (runLengthPx > 0) {
      const longestLineLength = Math.max(1, getLongestPreviewLineLength(content));
      const widthLimitedFontPx = (runLengthPx * 0.92) / (longestLineLength * 0.52);
      const heightLimitedFontPx = lineBudgetPx ? (lineBudgetPx * 0.9) / maxLines : baseFontPx;
      const fittedFontPx = Math.max(1, Math.min(baseFontPx, widthLimitedFontPx, heightLimitedFontPx));
      return { fontSize: fittedFontPx, lineHeight: "1.05" };
    }
    return { fontSize: baseFontPx, lineHeight: "1.05" };
  }

  const effectiveWidthMm = element.width || 0;
  const blockWidthPx = effectiveWidthMm * PIXELS_PER_MM * zoom;
  const maxLines = Math.max(1, Number(element.maxLines) || 1);
  const blockHeightPx = element.height ? element.height * PIXELS_PER_MM * zoom : null;

  if (!blockWidthPx) {
    return { fontSize: baseFontPx, lineHeight: "1.05" };
  }

  const longestLineLength = Math.max(1, getLongestPreviewLineLength(content));
  const widthLimitedFontPx = (blockWidthPx * 0.92) / (longestLineLength * 0.52);
  const heightLimitedFontPx = blockHeightPx ? (blockHeightPx * 0.9) / maxLines : baseFontPx;
  const fittedFontPx = Math.max(1, Math.min(baseFontPx, widthLimitedFontPx, heightLimitedFontPx));

  return { fontSize: fittedFontPx, lineHeight: "1.05" };
};

const LabelVisualPreview = ({ label, data, zoom = 1, className = "", printerDpi = 203 }) => {
  if (!label) return <div className={`w-48 h-32 bg-slate-200 flex items-center justify-center text-xs text-slate-400 italic ${className}`}>Geen template</div>;

  return (
    <div
      className={`bg-white relative overflow-hidden ${className}`}
      style={{
        width: `${label.width * PIXELS_PER_MM * zoom}px`,
        height: `${label.height * PIXELS_PER_MM * zoom}px`,
      }}
    >
      {label.elements?.map((el, index) => {
        const resolved = resolveLabelContent(el, data);
        const displayContent = resolved.content;
        const rotation = ((Number(el.rotation) || 0) % 360 + 360) % 360;
        const isVerticalRotation = rotation === 90 || rotation === 270;
        const baseStyle = {
          position: "absolute",
          left: `${el.x * PIXELS_PER_MM * zoom}px`,
          top: `${el.y * PIXELS_PER_MM * zoom}px`,
          width: el.width
            ? `${el.width * PIXELS_PER_MM * zoom}px`
            : "auto",
          height: el.height
            ? `${el.height * PIXELS_PER_MM * zoom}px`
            : "auto",
          color: "black",
          transform: `rotate(${rotation}deg)`,
          transformOrigin: "top left",
          overflow: "hidden",
          textAlign: "left",
        };

        if (el.type === "text") {
          const textStyle = getPreviewTextStyle(el, displayContent, zoom, rotation);

          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                width: isVerticalRotation
                  ? `${(el.height || el.width || 1) * PIXELS_PER_MM * zoom}px`
                  : `${el.width * PIXELS_PER_MM * zoom}px`,
                height: isVerticalRotation
                  ? `${(el.width || el.height || 1) * PIXELS_PER_MM * zoom}px`
                  : (el.height
                    ? `${el.height * PIXELS_PER_MM * zoom}px`
                    : "auto"),
                fontSize: `${textStyle.fontSize}px`,
                lineHeight: textStyle.lineHeight,
                fontWeight: el.isBold ? "900" : "normal",
                fontFamily: el.fontFamily || PRINTER_PREVIEW_FONT_STACK,
                textAlign: el.align || "left",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                wordBreak: "normal",
                boxSizing: "border-box",
              }}
            >
              {displayContent}
            </div>
          );
        }

        if (el.type === "line")
          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                width: `${el.width * PIXELS_PER_MM * zoom}px`,
                height: `${el.height * PIXELS_PER_MM * zoom}px`,
                backgroundColor: "black",
              }}
            />
          );

        if (el.type === "box")
          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                width: `${el.width * PIXELS_PER_MM * zoom}px`,
                height: `${el.height * PIXELS_PER_MM * zoom}px`,
                border: `${(el.thickness || 1) * PIXELS_PER_MM * zoom}px solid black`,
                boxSizing: "border-box",
              }}
            />
          );
        
        if (el.type === "qr" || el.type === "barcode")
          return (
             <div key={index} style={{
                 ...baseStyle, 
                 width: `${(el.width || 30) * PIXELS_PER_MM * zoom}px`, 
                 height: `${(el.height || 30) * PIXELS_PER_MM * zoom}px`,
                 background: "#f8fafc",
                 border: "1px solid #cbd5e1",
                 display: "flex",
                 alignItems: "center",
                 justifyContent: "center",
             }}>
                {el.type === 'barcode' ? (
                    <img 
                        src={getBarcodeUrl(displayContent)} 
                        alt="code" 
                        style={{ width: "80%", height: "80%", objectFit: "contain" }} 
                    />
                ) : (
                  <InternalQrImage value={displayContent} size={160} alt="code" className="w-[80%] h-[80%] object-contain" />
                )}
             </div>
          );

        return null;
      })}
    </div>
  );
};

export default LabelVisualPreview;
