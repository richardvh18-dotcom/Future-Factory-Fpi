import React from 'react';
import { resolveLabelContent, getBarcodeUrl } from '../../utils/labelHelpers';
import InternalQrImage from '../../utils/InternalQrImage';

/**
 * CRITICAL: PIXELS_PER_MM moet passen bij printer DPI voor print/preview parity.
 * 
 * Standaard scherm DPI = 96, dus PIXELS_PER_MM = 96 / 25.4 ≈ 3.78
 * Printer DPI = 203 (standaard), dus dots/mm = 203 / 25.4 ≈ 8.0
 * 
 * Elke DPI mismatch zorgt voor overlapping/spacing mismatch in fysieke print.
 */
const SCREEN_DPI = 96;
const CSS_PIXELS_PER_POINT = 96 / 72;
const PRINTER_PREVIEW_FONT_STACK = '"Lucida Console", "Courier New", monospace';

type LabelElement = {
  type?: 'text' | 'line' | 'box' | 'qr' | 'barcode' | string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  isBold?: boolean;
  fontFamily?: string;
  align?: 'left' | 'center' | 'right';
  thickness?: number;
  rotation?: number;
  maxLines?: number;
};

type LabelTemplate = {
  width: number;
  height: number;
  elements?: LabelElement[];
};

type LabelVisualPreviewProps = {
  label?: LabelTemplate | null;
  data?: Record<string, unknown>;
  zoom?: number;
  className?: string;
  printerDpi?: number;
};

/**
 * Berekent PIXELS_PER_MM voor gegeven printer-DPI
 * Hiermee wordt preview gesynchroniseerd met actuele print-output
 */
const getPixelsPerMm = (printerDpi = 203) => {
  // We schalen zelf naar printer-dots zodat preview parity heeft
  // 203 DPI printer = 8.0 dots/mm
  // Preview pixels moeten dezelfde schaal gebruiken voor 1:1 preview/print matching
  return (printerDpi || 203) / 25.4;
};

const getLongestPreviewLineLength = (value: unknown): number => {
  const lines = String(value || "").split(/\r?\n/);
  return lines.reduce((maxLen, line) => Math.max(maxLen, line.length), 0);
};

const getResolvedPreviewMaxLines = (
  element: LabelElement,
  baseFontPx: number,
  rotation = 0,
  zoom = 1,
  pixelsPerMm = 3.78
): number => {
  const explicitMaxLines = Number(element.maxLines);
  if (Number.isFinite(explicitMaxLines) && explicitMaxLines > 0) {
    return Math.max(1, Math.floor(explicitMaxLines));
  }

  const normalizedRotation = ((Number(rotation) || 0) % 360 + 360) % 360;
  const isVerticalRotation = normalizedRotation === 90 || normalizedRotation === 270;
  const blockHeightMm = isVerticalRotation
    ? (element.width || element.height || 0)
    : (element.height || 0);

  if (!blockHeightMm || !baseFontPx) return 1;

  const blockHeightPx = blockHeightMm * pixelsPerMm * zoom;
  const estimatedLineHeightPx = Math.max(1, baseFontPx * 1.05);
  return Math.max(1, Math.floor((blockHeightPx * 0.92) / estimatedLineHeightPx));
};

/**
 * Berekent tekststijl exact gelijk aan AdminLabelDesigner.getPreviewTextStyle
 * zodat preview en designer identiek renderen.
 */
const getPreviewTextStyle = (
  element: LabelElement,
  content: unknown,
  zoom: number,
  rotation = 0,
  pixelsPerMm = 3.78
): { fontSize: number; lineHeight: string } => {
  const normalizedRotation = ((Number(rotation) || 0) % 360 + 360) % 360;
  const isVerticalRotation = normalizedRotation === 90 || normalizedRotation === 270;
  const baseFontPx = (element.fontSize || 10) * CSS_PIXELS_PER_POINT * zoom;
  const maxLines = getResolvedPreviewMaxLines(element, baseFontPx, normalizedRotation, zoom, pixelsPerMm);

  if (isVerticalRotation) {
    // Bij verticale rotatie is el.height het loopvlak voor tekst (de "breedte" na rotatie)
    const runLengthMm = element.height || element.width || 0;
    const runLengthPx = runLengthMm * pixelsPerMm * zoom;
    // el.width wordt na rotatie de "hoogte" — het budget voor meerdere regels
    const lineBudgetMm = element.width || element.height || 0;
    const lineBudgetPx = lineBudgetMm * pixelsPerMm * zoom;

    if (runLengthPx > 0) {
      const longestLineLength = Math.max(1, getLongestPreviewLineLength(content));
      const estimatedLongestWrappedLine = Math.max(1, Math.ceil(longestLineLength / maxLines));
      const widthLimitedFontPx = (runLengthPx * 0.92) / (estimatedLongestWrappedLine * 0.52);
      const heightLimitedFontPx = lineBudgetPx ? (lineBudgetPx * 0.9) / maxLines : baseFontPx;
      const fittedFontPx = Math.max(1, Math.min(baseFontPx, widthLimitedFontPx, heightLimitedFontPx));
      return { fontSize: fittedFontPx, lineHeight: "1.05" };
    }
    return { fontSize: baseFontPx, lineHeight: "1.05" };
  }

  const effectiveWidthMm = element.width || 0;
  const blockWidthPx = effectiveWidthMm * pixelsPerMm * zoom;
  const blockHeightPx = element.height ? element.height * pixelsPerMm * zoom : null;

  if (!blockWidthPx) {
    return { fontSize: baseFontPx, lineHeight: "1.05" };
  }

  const longestLineLength = Math.max(1, getLongestPreviewLineLength(content));
  const estimatedLongestWrappedLine = Math.max(1, Math.ceil(longestLineLength / maxLines));
  const widthLimitedFontPx = (blockWidthPx * 0.92) / (estimatedLongestWrappedLine * 0.52);
  const heightLimitedFontPx = blockHeightPx ? (blockHeightPx * 0.9) / maxLines : baseFontPx;
  const fittedFontPx = Math.max(1, Math.min(baseFontPx, widthLimitedFontPx, heightLimitedFontPx));

  return { fontSize: fittedFontPx, lineHeight: "1.05" };
};

const LabelVisualPreview = ({ label, data = {}, zoom = 1, className = "", printerDpi = 203 }: LabelVisualPreviewProps) => {
  const pixelsPerMm = getPixelsPerMm(printerDpi);
  
  if (!label) return <div className={`w-48 h-32 bg-slate-200 flex items-center justify-center text-xs text-slate-400 italic ${className}`}>Geen template</div>;

  return (
    <div
      className={`bg-white relative overflow-hidden ${className}`}
      style={{
        width: `${label.width * pixelsPerMm * zoom}px`,
        height: `${label.height * pixelsPerMm * zoom}px`,
      }}
    >
      {label.elements?.map((el, index) => {
        const resolved = resolveLabelContent(el, data) as { content?: unknown };
        const displayContent = String(resolved?.content ?? '');
        const rotation = ((Number(el.rotation) || 0) % 360 + 360) % 360;
        const isVerticalRotation = rotation === 90 || rotation === 270;
        const baseStyle = {
          position: "absolute",
          left: `${el.x * pixelsPerMm * zoom}px`,
          top: `${el.y * pixelsPerMm * zoom}px`,
          width: el.width
            ? `${el.width * pixelsPerMm * zoom}px`
            : "auto",
          height: el.height
            ? `${el.height * pixelsPerMm * zoom}px`
            : "auto",
          color: "black",
          transform: `rotate(${rotation}deg)`,
          transformOrigin: "top left",
          overflow: "hidden",
          textAlign: "left",
        };

        if (el.type === "text") {
          const textStyle = getPreviewTextStyle(el, displayContent, zoom, rotation, pixelsPerMm);

          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                width: isVerticalRotation
                  ? `${(el.height || el.width || 1) * pixelsPerMm * zoom}px`
                  : `${el.width * pixelsPerMm * zoom}px`,
                height: isVerticalRotation
                  ? `${(el.width || el.height || 1) * pixelsPerMm * zoom}px`
                  : (el.height
                    ? `${el.height * pixelsPerMm * zoom}px`
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
                width: `${el.width * pixelsPerMm * zoom}px`,
                height: `${el.height * pixelsPerMm * zoom}px`,
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
                width: `${el.width * pixelsPerMm * zoom}px`,
                height: `${el.height * pixelsPerMm * zoom}px`,
                border: `${(el.thickness || 1) * pixelsPerMm * zoom}px solid black`,
                boxSizing: "border-box",
              }}
            />
          );
        
        if (el.type === "qr" || el.type === "barcode")
          return (
             <div key={index} style={{
                 ...baseStyle, 
                 width: `${(el.width || 30) * pixelsPerMm * zoom}px`, 
                 height: `${(el.height || 30) * pixelsPerMm * zoom}px`,
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
