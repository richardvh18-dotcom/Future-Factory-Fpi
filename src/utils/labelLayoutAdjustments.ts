type LabelLike = {
  name?: string;
  folder?: string;
  labelName?: string;
  tags?: string[];
  width?: number;
  height?: number;
};

type LabelElementLike = {
  x?: number;
  y?: number;
  rotation?: number;
};

type LabelLayoutNudge = {
  xMm: number;
  yMm: number;
};

const toUpperText = (value: unknown): string => String(value || '').trim().toUpperCase();

const isWavistrongTemplate = (label: LabelLike | null | undefined): boolean => {
  if (!label) return false;

  const haystack = [label.name, label.labelName, label.folder, ...(Array.isArray(label.tags) ? label.tags : [])]
    .map(toUpperText)
    .filter(Boolean);

  return haystack.some((value) => value.includes('WAVISTRONG'));
};

export const getWavistrongLayoutNudge = (
  label: LabelLike | null | undefined,
  element: LabelElementLike,
  content: unknown
): LabelLayoutNudge => {
  if (!isWavistrongTemplate(label)) return { xMm: 0, yMm: 0 };

  const normalizedContent = toUpperText(content);
  const rotation = ((Number(element.rotation) || 0) % 360 + 360) % 360;
  const isVerticalRotation = rotation === 90 || rotation === 270;
  const labelWidthMm = Number(label?.width) || 0;

  return {
    xMm: isVerticalRotation && labelWidthMm > 0 && Number(element.x) > labelWidthMm / 2 ? -1 : 0,
    yMm: normalizedContent === 'WAVISTRONG' ? -1.5 : 0,
  };
};