const CSS_PIXELS_PER_POINT = 96 / 72;

export const ZEBRA_FONT0_PREVIEW_STACK = '"Lucida Console", "Courier New", monospace';

export const resolvePreviewFontFamily = (fontFamily) => {
  const value = String(fontFamily || '').toLowerCase();
  if (!value || value.includes('arial') || value.includes('helvetica') || value.includes('sans')) {
    return ZEBRA_FONT0_PREVIEW_STACK;
  }
  return fontFamily;
};

export const getPixelsPerMm = (printerDpi = 300) => {
  return (printerDpi || 300) / 25.4;
};

const getLongestPreviewLineLength = (value) => {
  const lines = String(value || '').split(/\r?\n/);
  return lines.reduce((maxLen, line) => Math.max(maxLen, line.length), 0);
};

const getResolvedPreviewMaxLines = (element, baseFontPx, rotation = 0, zoom = 1, pixelsPerMm = 8.0) => {
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

export const getPreviewTextStyle = (element, content, zoom, rotation = 0, pixelsPerMm = 8.0) => {
  const normalizedRotation = ((Number(rotation) || 0) % 360 + 360) % 360;
  const isVerticalRotation = normalizedRotation === 90 || normalizedRotation === 270;
  const baseFontPx = (element.fontSize || 10) * CSS_PIXELS_PER_POINT * zoom;
  const maxLines = getResolvedPreviewMaxLines(element, baseFontPx, normalizedRotation, zoom, pixelsPerMm);

  if (isVerticalRotation) {
    const runLengthMm = element.height || element.width || 0;
    const runLengthPx = runLengthMm * pixelsPerMm * zoom;
    const lineBudgetMm = element.width || element.height || 0;
    const lineBudgetPx = lineBudgetMm * pixelsPerMm * zoom;

    if (runLengthPx > 0) {
      const longestLineLength = Math.max(1, getLongestPreviewLineLength(content));
      const estimatedLongestWrappedLine = Math.max(1, Math.ceil(longestLineLength / maxLines));
      const widthLimitedFontPx = (runLengthPx * 0.92) / (estimatedLongestWrappedLine * 0.52);
      const heightLimitedFontPx = lineBudgetPx ? (lineBudgetPx * 0.9) / maxLines : baseFontPx;
      const fittedFontPx = Math.max(1, Math.min(baseFontPx, widthLimitedFontPx, heightLimitedFontPx));
      return { fontSize: fittedFontPx, lineHeight: '1.05' };
    }

    return { fontSize: baseFontPx, lineHeight: '1.05' };
  }

  const effectiveWidthMm = element.width || 0;
  const blockWidthPx = effectiveWidthMm * pixelsPerMm * zoom;
  const blockHeightPx = element.height ? element.height * pixelsPerMm * zoom : null;

  if (!blockWidthPx) {
    return { fontSize: baseFontPx, lineHeight: '1.05' };
  }

  const longestLineLength = Math.max(1, getLongestPreviewLineLength(content));
  const estimatedLongestWrappedLine = Math.max(1, Math.ceil(longestLineLength / maxLines));
  const widthLimitedFontPx = (blockWidthPx * 0.92) / (estimatedLongestWrappedLine * 0.52);
  const heightLimitedFontPx = blockHeightPx ? (blockHeightPx * 0.9) / maxLines : baseFontPx;
  const fittedFontPx = Math.max(1, Math.min(baseFontPx, widthLimitedFontPx, heightLimitedFontPx));

  return { fontSize: fittedFontPx, lineHeight: '1.05' };
};
