const normalizeRouteToken = (value: unknown): string =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .replace(/^40(?=BH|BM|BA|MAZAK)/, "40");

const toTokenList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeRouteToken(entry)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[;,\n]/)
      .map((entry) => normalizeRouteToken(entry))
      .filter(Boolean);
  }

  return [];
};

export type PrinterRoutingContext = {
  stationId?: string;
  routeKey?: string;
  labelRoute?: string;
  labelType?: string;
  itemCode?: string;
  item?: string;
  isFlange?: boolean;
  templateTags?: string[];
};

export type PrinterRoutingTarget = {
  id?: string;
  name?: string;
  queueStations?: unknown;
  linkedStations?: unknown;
  routingKeys?: unknown;
  routingTags?: unknown;
  isDefault?: boolean;
  [key: string]: unknown;
};

export const getPrinterRoutingCandidates = (context: PrinterRoutingContext = {}): string[] => {
  const candidates = new Set<string>();
  const station = normalizeRouteToken(context.stationId);
  const routeKey = normalizeRouteToken(context.routeKey || context.labelRoute || context.labelType);
  const templateTags = toTokenList(context.templateTags);

  if (routeKey) candidates.add(routeKey);
  if (station) {
    candidates.add(station);
    candidates.add(`STATION:${station}`);
    candidates.add(`QUEUE:${station}`);
  }

  for (const templateTag of templateTags) {
    candidates.add(templateTag);
    candidates.add(`LABEL:${templateTag}`);
    candidates.add(`ROUTE:${templateTag}`);
  }

  const itemCode = normalizeRouteToken(context.itemCode || context.item);
  const hasFlangeTemplateTag = templateTags.includes("FLANGE") || templateTags.includes("FLENS") || templateTags.includes("FLENZEN");
  if (context.isFlange || itemCode.startsWith("FL") || hasFlangeTemplateTag) {
    candidates.add("MAZAK");
    candidates.add("FLANGE");
    candidates.add("LABEL:MAZAK");
    candidates.add("ROUTE:MAZAK");
    candidates.add("ROUTE:FLANGE");
  }

  if (station && /^BH\d+$/i.test(station)) {
    candidates.add("GENERAL");
    candidates.add("LARGE");
    candidates.add("BIGLABEL");
    candidates.add("ROUTE:GENERAL");
    candidates.add(`GENERAL:${station}`);
    candidates.add(`BH:${station}`);
  }

  if (station && /^BM\d+$/i.test(station)) {
    candidates.add("BM");
  }

  return Array.from(candidates).filter(Boolean);
};

export const getPrinterRoutingTokens = (printer: PrinterRoutingTarget | null | undefined): string[] => {
  if (!printer) return [];

  const tokens = new Set<string>();
  toTokenList(printer.routingKeys).forEach((entry) => tokens.add(entry));
  toTokenList(printer.routingTags).forEach((entry) => tokens.add(entry));
  toTokenList(printer.queueStations).forEach((entry) => tokens.add(entry));
  toTokenList(printer.linkedStations).forEach((entry) => tokens.add(entry));

  if (printer.name) {
    tokens.add(normalizeRouteToken(printer.name));
  }

  return Array.from(tokens).filter(Boolean);
};

export const resolvePrinterForRouting = <T extends PrinterRoutingTarget>(
  printers: T[],
  context: PrinterRoutingContext = {}
): T | null => {
  if (!Array.isArray(printers) || printers.length === 0) return null;

  const candidates = getPrinterRoutingCandidates(context);
  if (candidates.length === 0) return null;

  let bestPrinter: T | null = null;
  let bestScore = 0;

  for (const printer of printers) {
    const tokens = getPrinterRoutingTokens(printer);
    if (tokens.length === 0) continue;

    let score = 0;
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (tokens.includes(candidate)) {
        if (candidate.startsWith("ROUTE:") || candidate.startsWith("LABEL:")) {
          score += 6;
        } else if (candidate.startsWith("STATION:") || candidate.startsWith("QUEUE:")) {
          score += 5;
        } else if (candidate.startsWith("GENERAL:")) {
          score += 4;
        } else if (candidate === "GENERAL" || candidate === "LARGE" || candidate === "BIGLABEL") {
          score += 2;
        } else {
          score += 3;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestPrinter = printer;
    }
  }

  return bestPrinter;
};

export const serializeRoutingKeys = (value: unknown): string[] => {
  return Array.from(new Set(toTokenList(value)));
};
