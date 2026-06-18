type FlangeRuleInput = Record<string, unknown> | null | undefined;

type FlangeRule = {
  id: string;
  matcher: string;
  cavityCount: number;
};

type ToolingMold = {
  id: string;
  name: string;
  itemCode: string;
  matcher: string;
  application: string;
  stations: string[];
  active: boolean;
  cavityCount: number;
};

type FlangeSeriesInfo = {
  isFlange: boolean;
  cavityCount: number;
  matchedTooling: ToolingMold | null;
  matchedRule: FlangeRule | null;
  searchableText: string;
};

const normalizeText = (value: unknown): string =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const sanitizeCount = (value: unknown, fallback = 1): number => {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 100);
};

const sanitizeRule = (rule: FlangeRuleInput, index: number): FlangeRule | null => {
  const matcher = normalizeText(rule?.matcher || rule?.pattern || "");
  if (!matcher) return null;
  return {
    id: String(rule?.id || `rule_${index + 1}`),
    matcher,
    cavityCount: sanitizeCount(rule?.cavityCount ?? rule?.count, 1),
  };
};

const sanitizeToolingMold = (entry: FlangeRuleInput, index: number): ToolingMold | null => {
  const itemCode = normalizeText(entry?.itemCode || entry?.item || "");
  const matcher = normalizeText(entry?.matcher || entry?.pattern || entry?.name || "");
  const stations = Array.isArray(entry?.stations)
    ? entry.stations.map((station) => normalizeText(station)).filter(Boolean)
    : [];

  if (!itemCode && !matcher) return null;

  return {
    id: String(entry?.id || `tooling_${index + 1}`),
    name: String(entry?.name || entry?.toolingName || "").trim(),
    itemCode,
    matcher,
    application: String(entry?.application || "").trim().toLowerCase(),
    stations,
    active: entry?.active !== false,
    cavityCount: sanitizeCount(entry?.cavityCount ?? entry?.count, 1),
  };
};

export const getFlangeSeriesRules = (rawRules: unknown): FlangeRule[] => {
  const source = Array.isArray(rawRules) ? rawRules : [];
  const sanitized = source
    .map((rule, index) => sanitizeRule(rule, index))
    .filter(Boolean);
  return sanitized as FlangeRule[];
};

export const getToolingMolds = (rawEntries: unknown): ToolingMold[] => {
  if (!Array.isArray(rawEntries)) return [];
  return rawEntries
    .map((entry, index) => sanitizeToolingMold(entry, index))
    .filter((entry): entry is ToolingMold => Boolean(entry && entry.active));
};

const matchesRule = (text: unknown, matcher: unknown): boolean => {
  const normalizedText = normalizeText(text);
  const normalizedMatcher = normalizeText(matcher);
  if (!normalizedText || !normalizedMatcher) return false;

  const tokens = normalizedMatcher.split(" ").filter(Boolean);
  if (tokens.length === 0) return false;

  return tokens.every((token) => normalizedText.includes(token));
};

const stationMatches = (entry: { stations?: string[] } | null | undefined, stationId: unknown): boolean => {
  const normalizedStation = normalizeText(stationId);
  if (!Array.isArray(entry?.stations) || entry.stations.length === 0) return true;
  if (!normalizedStation) return true;
  return entry.stations.includes(normalizedStation);
};

const applicationMatchesFlange = (entry: { application?: unknown } | null | undefined): boolean => {
  const application = String(entry?.application || "").trim().toLowerCase();
  if (!application) return true;
  return application === "flange_series" || application === "flange";
};

const buildItemCodeCandidates = (
  order: Record<string, unknown> | null | undefined,
  relatedItemCodes: unknown[] = []
): Set<string> => {
  const candidates = [order?.itemCode, order?.item, ...relatedItemCodes]
    .map((value) => normalizeText(value))
    .filter(Boolean);
  return new Set(candidates);
};

const isFlangeText = (text: unknown): boolean => {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return false;
  if (normalizedText.startsWith("FL ") || normalizedText === "FL") return true;
  if (normalizedText.includes(" FL ")) return true;
  return normalizedText.includes("FLENS") || normalizedText.includes("FLANGE");
};

export const getFlangeSeriesInfo = (
  order: Record<string, unknown> | null | undefined,
  rawRules: unknown,
  rawToolingMolds: unknown[] = [],
  stationId = "",
  relatedItemCodes: unknown[] = []
): FlangeSeriesInfo => {
  const rules = getFlangeSeriesRules(rawRules);
  const toolingMolds = getToolingMolds(rawToolingMolds);
  const searchableText = normalizeText(
    [
      order?.item,
      order?.itemDescription,
      order?.itemCode,
      order?.notes,
      order?.extraCode,
    ]
      .filter(Boolean)
      .join(" ")
  );

  const isFlange = isFlangeText(searchableText);
  if (!isFlange) {
    return {
      isFlange: false,
      cavityCount: 1,
      matchedTooling: null,
      matchedRule: null,
      searchableText,
    };
  }

  const itemCodeCandidates = buildItemCodeCandidates(order, relatedItemCodes);
  const toolingCandidates = toolingMolds.filter(
    (entry) => stationMatches(entry, stationId) && applicationMatchesFlange(entry)
  );

  const matchedByItemCode = toolingCandidates.find(
    (entry) => entry.itemCode && itemCodeCandidates.has(entry.itemCode)
  );
  const matchedByMatcher = toolingCandidates.find(
    (entry) => entry.matcher && matchesRule(searchableText, entry.matcher)
  );

  const matchedTooling = matchedByItemCode || matchedByMatcher || null;

  const matchedRule = rules.find((rule) => matchesRule(searchableText, rule.matcher)) || null;
  const resolvedCavityCount = matchedTooling
    ? sanitizeCount(matchedTooling.cavityCount, 1)
    : matchedRule
      ? sanitizeCount(matchedRule.cavityCount, 1)
      : 1;

  return {
    isFlange: true,
    cavityCount: resolvedCavityCount,
    matchedTooling,
    matchedRule,
    searchableText,
  };
};
