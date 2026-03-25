import React from 'react';
import { resolveLabelContent, getBarcodeUrl } from '../../utils/labelHelpers';
import InternalQrImage from '../../utils/InternalQrImage';

const PIXELS_PER_MM = 3.78;
const PRINTER_PREVIEW_FONT_STACK = '"Lucida Console", "Courier New", monospace';

const getLongestPreviewLineLength = (value) => {
  const lines = String(value || "").split(/\r?\n/);
  return lines.reduce((maxLen, line) => Math.max(maxLen, line.length), 0);
};

const getRotationCode = (rotation = 0) => {
  const rotationMap = { 0: 'N', 90: 'R', 180: 'I', 270: 'B' };
  return rotationMap[rotation] || 'N';
};

const getPreviewTextLayout = (element, content, labelWidthMm, printerDpi = 203) => {
  const dotsPerMm = (Number(printerDpi) > 0 ? Number(printerDpi) : 203) / 25.4;
  const mmToDots = (mm) => Math.round(Number(mm || 0) * dotsPerMm);

  const requestedHeight = mmToDots((element.fontSize || 12) / 2.8);
  const hasExplicitWidth = Number.isFinite(Number(element.fontWidth));
  const explicitWidth = hasExplicitWidth ? mmToDots((element.fontWidth || 12) / 2.8) : 0;
  const naturalWidth = explicitWidth || Math.max(1, Math.round(requestedHeight * 0.48));

  const rot = getRotationCode(element.rotation || 0);
  const wrapWidthMm = (rot === 'R' || rot === 'B')
    ? (Number(element.height) || Number(element.width) || 0)
    : Number(element.width);

  let widthDots = null;
  let fontHeight = requestedHeight;
  let fontWidth = hasExplicitWidth ? naturalWidth : 0;

  if (wrapWidthMm) {
    const rawWidthDots = mmToDots(wrapWidthMm);
    const innerWidthDots = Math.max(1, rawWidthDots - mmToDots(0.8));
    const maxLines = Math.max(1, Number(element.maxLines) || 1);
    const lineBudgetMm = (rot === 'R' || rot === 'B')
      ? (Number(element.width) || Number(element.height) || 0)
      : (Number(element.height) || 0);
    const heightLimitDots = lineBudgetMm
      ? Math.max(1, Math.floor(mmToDots(lineBudgetMm) / maxLines))
      : requestedHeight;
    const longestLineLength = Math.max(1, getLongestPreviewLineLength(content));
    const maxCharWidth = Math.max(1, Math.floor((innerWidthDots * 0.98) / longestLineLength));
    const fittedWidth = Math.min(naturalWidth, maxCharWidth);
    const fittedHeight = Math.max(1, Math.min(heightLimitDots, requestedHeight));

    widthDots = innerWidthDots;
    fontHeight = fittedHeight;
    fontWidth = hasExplicitWidth ? fittedWidth : 0;
  }

  const baseX = mmToDots(element.x);
  const baseY = mmToDots(element.y);
  const elementHeightDots = element.height ? mmToDots(element.height) : 0;
  const printableMinX = mmToDots(1);
  const printableMaxX = mmToDots(labelWidthMm) - mmToDots(1);

  let x = baseX;
  let y = baseY;

  if (rot === 'R' || rot === 'B') {
    const verticalCompensation = Math.max(
      mmToDots(2),
      elementHeightDots,
      Math.round(fontHeight * 0.85)
    );
    x = x - verticalCompensation + mmToDots(5);
  }

  x = Math.max(printableMinX, Math.min(x, printableMaxX));

  return { x, y, widthDots, fontHeight, fontWidth, dotsPerMm };
};

const LabelVisualPreview = ({ label, data, zoom = 1, className = "", printerDpi = 203 }) => {
  if (!label) return <div className={`w-48 h-32 bg-slate-200 flex items-center justify-center text-xs text-slate-400 italic ${className}`}>Geen template</div>;

  const dotsPerMm = (Number(printerDpi) > 0 ? Number(printerDpi) : 203) / 25.4;
  const dotsToPx = (dots) => (dots / dotsPerMm) * PIXELS_PER_MM * zoom;

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
        const previewTextLayout = el.type === "text"
          ? getPreviewTextLayout(el, displayContent, label.width, printerDpi)
          : null;
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
          const fontSizePx = Math.max(1, dotsToPx(previewTextLayout.fontHeight));
          const lineHeightMultiplier = 1.12;
          const lineHeightPx = fontSizePx * lineHeightMultiplier;
          const configuredMaxLines = Math.max(1, Number(el.maxLines) || 1);
          const minTextHeightPx = Math.ceil(lineHeightPx * configuredMaxLines);
          const baseHeightPx = el.height ? (el.height * PIXELS_PER_MM * zoom) : null;
          const resolvedHeightPx = baseHeightPx
            ? Math.max(baseHeightPx, minTextHeightPx)
            : minTextHeightPx;

          const isLargeLabel = (Number(label.height) || 0) >= 50;
          const minVerticalMm = isLargeLabel ? 55 : 30;
          // Zorg ervoor minWidth niet groter is dan werkelijke object-breedte
          const constrainedMinVerticalMm = Math.min(minVerticalMm, Number(el.width) || minVerticalMm);
          const minVerticalPx = constrainedMinVerticalMm * PIXELS_PER_MM * zoom;

          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                left: `${dotsToPx(previewTextLayout.x)}px`,
                top: `${dotsToPx(previewTextLayout.y)}px`,
                width: isVerticalRotation
                  ? `${Math.max(el.height ? el.height * PIXELS_PER_MM * zoom : 1, 1)}px`
                  : (previewTextLayout.widthDots
                      ? `${dotsToPx(previewTextLayout.widthDots)}px`
                      : baseStyle.width),
                height: isVerticalRotation
                  ? `${Math.max(el.width ? el.width * PIXELS_PER_MM * zoom : 1, 1)}px`
                  : `${resolvedHeightPx}px`,
                // Bij 90°/270° rotatie: pre-rotatie width = visuele hoogte, pre-rotatie height = visuele breedte
                minWidth: isVerticalRotation ? `${minVerticalPx}px` : undefined,
                fontSize: `${fontSizePx}px`,
                lineHeight: `${lineHeightMultiplier}`,
                fontWeight: el.isBold ? "900" : "normal",
                fontFamily: el.fontFamily || PRINTER_PREVIEW_FONT_STACK,
                textAlign: el.align || "left",
                whiteSpace: "pre-wrap",
                overflowWrap: "break-word",
                wordBreak: isVerticalRotation ? "break-all" : "normal",
                boxSizing: "border-box",
                paddingBottom: isVerticalRotation ? 0 : "1px",
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