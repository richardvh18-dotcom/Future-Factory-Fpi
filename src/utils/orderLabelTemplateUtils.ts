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
