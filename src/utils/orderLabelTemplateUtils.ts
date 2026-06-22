import { applyLabelLogic, processLabelData } from './labelHelpers';

type AnyRecord = Record<string, unknown>;

type LabelTemplateLike = {
  id?: unknown;
  linkedTemplateId?: unknown;
  linkedLabelTemplateId?: unknown;
  [key: string]: unknown;
};

export const getOrderLabelOrder = (item: AnyRecord = {}): string =>
  String(
    item.orderId ||
      item.orderNumber ||
      item.Order ||
      item.Productieorder ||
      item.order ||
      item.originalOrderId ||
      item.id ||
      'ONBEKEND'
  );

export const getOrderLabelItemCode = (item: AnyRecord = {}): string =>
  String(
    item.itemCode ||
      item.productCode ||
      item.articleCode ||
      item.productId ||
      item.Item ||
      item.Artikel ||
      item.item ||
      ''
  );

export const getOrderLabelDescription = (item: AnyRecord = {}): string =>
  String(
    item.itemDescription ||
      item.description ||
      item.Description ||
      item.Omschrijving ||
      item.item ||
      ''
  );

export const buildOrderLabelTemplateProduct = (item: AnyRecord = {}): AnyRecord => {
  const itemCode = getOrderLabelItemCode(item);
  const description = getOrderLabelDescription(item);

  return {
    ...item,
    itemCode,
    productId: item.productId || itemCode,
    description,
    item: item.item || description,
    extraCode: item.extraCode || item.Code || '',
  };
};

const normalizeTokenText = (value: unknown): string =>
  String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

export const isElbow100Product = (item: AnyRecord = {}): boolean => {
  const typeText = normalizeTokenText(item.productType || item.type || '');
  const descriptionText = normalizeTokenText(getOrderLabelDescription(item));
  const itemCodeText = normalizeTokenText(getOrderLabelItemCode(item));
  const combined = `${typeText} ${descriptionText} ${itemCodeText}`.trim();

  const hasElbow = /\bELB\b|\bELBOW\b/.test(combined);
  const has100 = /(^|\D)100(\D|$)/.test(combined);
  return hasElbow && has100;
};

export const isElbow200Product = (item: AnyRecord = {}): boolean => {
  const typeText = normalizeTokenText(item.productType || item.type || '');
  const descriptionText = normalizeTokenText(getOrderLabelDescription(item));
  const itemCodeText = normalizeTokenText(getOrderLabelItemCode(item));
  const combined = `${typeText} ${descriptionText} ${itemCodeText}`.trim();

  const hasElbow = /\bELB\b|\bELBOW\b/.test(combined);
  const has200 = /(^|\D)200(\D|$)/.test(combined);
  return hasElbow && has200;
};

const hasSmallTemplateHint = (template: LabelTemplateLike): boolean => {
  const tags = Array.isArray(template?.tags)
    ? template.tags.map((tag) => String(tag || '').toUpperCase().trim())
    : [];
  const name = normalizeTokenText(template?.name || '');
  const width = Number(template?.width || 0);
  const height = Number(template?.height || 0);
  const hasSmallDimensions = width > 0 && height > 0 && height <= 40;

  return (
    tags.includes('SMALL') ||
    tags.includes('KLEIN') ||
    tags.includes('SMAL') ||
    tags.includes('SLIM') ||
    /\bSMALL\b|\bKLEIN\b|\bSMAL\b|\bSLIM\b/.test(name) ||
    hasSmallDimensions
  );
};

const hasCodeTemplateHint = (template: LabelTemplateLike): boolean => {
  const tags = Array.isArray(template?.tags)
    ? template.tags.map((tag) => String(tag || '').toUpperCase().trim())
    : [];
  const name = normalizeTokenText(template?.name || '');

  return tags.includes('CODE') || /\bCODE\b/.test(name);
};

const hasLargeTemplateHint = (template: LabelTemplateLike): boolean => {
  const tags = Array.isArray(template?.tags)
    ? template.tags.map((tag) => String(tag || '').toUpperCase().trim())
    : [];
  const name = normalizeTokenText(template?.name || '');

  return (
    tags.includes('LARGE') ||
    tags.includes('GROOT') ||
    /\bLARGE\b|\bGROOT\b/.test(name)
  );
};

export const hasOrderLabelCode = (item: AnyRecord = {}): boolean => {
  const rawCode = item.code || item.extraCode || item.Code || '';
  const normalizedCode = String(rawCode).trim().toUpperCase();
  if (!normalizedCode) return false;
  return normalizedCode !== '-' && normalizedCode !== 'NVT' && normalizedCode !== 'N/A';
};

const hasLinkedTemplate = (template: LabelTemplateLike): boolean =>
  Boolean(toTemplateId(template?.linkedTemplateId || template?.linkedLabelTemplateId));

export const pickPreferredTempTemplateId = (
  item: AnyRecord = {},
  templates: LabelTemplateLike[] = []
): string => {
  if (!Array.isArray(templates) || templates.length === 0) return '';

  if (hasOrderLabelCode(item)) {
    const byId = new Map<string, LabelTemplateLike>();
    templates.forEach((template) => {
      const id = toTemplateId(template?.id);
      if (id) byId.set(id, template);
    });

    const codeTemplates = templates.filter((template) => hasCodeTemplateHint(template));

    const codeThenSmallTemplate = codeTemplates.find((template) => {
      const linkedId = toTemplateId(template?.linkedTemplateId || template?.linkedLabelTemplateId);
      if (!linkedId) return false;
      const linkedTemplate = byId.get(linkedId);
      return Boolean(linkedTemplate && hasSmallTemplateHint(linkedTemplate));
    });

    if (codeThenSmallTemplate) return toTemplateId(codeThenSmallTemplate.id);

    const codeSingleTemplate = codeTemplates.find((template) => !hasLinkedTemplate(template));
    if (codeSingleTemplate) return toTemplateId(codeSingleTemplate.id);

    if (codeTemplates.length > 0) return toTemplateId(codeTemplates[0]?.id);
  }

  const smallTemplates = templates.filter((template) => hasSmallTemplateHint(template));
  const smallSingleTemplate = smallTemplates.find((template) => !hasLinkedTemplate(template));
  if (smallSingleTemplate) return toTemplateId(smallSingleTemplate.id);

  if (smallTemplates.length > 0) return toTemplateId(smallTemplates[0]?.id);

  const singleTemplate = templates.find((template) => !hasLinkedTemplate(template));
  if (singleTemplate) return toTemplateId(singleTemplate.id);

  return toTemplateId(templates[0]?.id);
};

export const normalizeOrderLabelProductData = (item: AnyRecord = {}): AnyRecord => {
  const order = getOrderLabelOrder(item);
  const itemCode = getOrderLabelItemCode(item);
  const description = getOrderLabelDescription(item);

  return {
    ...item,
    orderId: order,
    orderNumber: order,
    itemCode,
    productId: itemCode,
    item: description,
    description,
    itemDescription: description,
    lotNumber: item.lotNumber || order,
  };
};

export const buildOrderLabelPreviewData = (
  item: AnyRecord = {},
  labelRules: Record<string, unknown>[] | null | undefined = []
): AnyRecord => {
  const normalized = normalizeOrderLabelProductData(item);
  const base = processLabelData(normalized);
  return applyLabelLogic(base, labelRules || []);
};

const toTemplateId = (value: unknown): string => String(value || '').trim();

const getLinkedTemplateId = (template: LabelTemplateLike | null | undefined): string => {
  if (!template || typeof template !== 'object') return '';
  return toTemplateId(template.linkedTemplateId || template.linkedLabelTemplateId);
};

export const resolveLinkedTemplateChain = (
  templates: LabelTemplateLike[] = [],
  primaryTemplateId: unknown,
  options: { maxDepth?: number } = {}
): LabelTemplateLike[] => {
  const maxDepth = Math.max(1, Number(options.maxDepth) || 4);
  const startId = toTemplateId(primaryTemplateId);
  if (!startId || !Array.isArray(templates) || templates.length === 0) return [];

  const byId = new Map<string, LabelTemplateLike>();
  templates.forEach((tpl) => {
    const id = toTemplateId(tpl?.id);
    if (!id || byId.has(id)) return;
    byId.set(id, tpl);
  });

  const chain: LabelTemplateLike[] = [];
  const visited = new Set<string>();
  let currentId = startId;

  while (currentId && chain.length < maxDepth) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const template = byId.get(currentId);
    if (!template) break;

    chain.push(template);
    currentId = getLinkedTemplateId(template);
  }

  return chain;
};
