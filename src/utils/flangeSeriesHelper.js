const normalizeText = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const sanitizeCount = (value, fallback = 1) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 100);
};

const sanitizeRule = (rule, index) => {
  const matcher = normalizeText(rule?.matcher || rule?.pattern || "");
  if (!matcher) return null;
  return {
    id: String(rule?.id || `rule_${index + 1}`),
    matcher,
    cavityCount: sanitizeCount(rule?.cavityCount ?? rule?.count, 1),
  };
};

const sanitizeToolingMold = (entry, index) => {
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

export const getFlangeSeriesRules = (rawRules) => {
  const source = Array.isArray(rawRules) ? rawRules : [];
  const sanitized = source
    .map((rule, index) => sanitizeRule(rule, index))
    .filter(Boolean);
  return sanitized;
};

export const getToolingMolds = (rawEntries) => {
  if (!Array.isArray(rawEntries)) return [];
  return rawEntries
    .map((entry, index) => sanitizeToolingMold(entry, index))
    .filter((entry) => entry && entry.active);
};

const matchesRule = (text, matcher) => {
  const normalizedText = normalizeText(text);
  const normalizedMatcher = normalizeText(matcher);
  if (!normalizedText || !normalizedMatcher) return false;

  const tokens = normalizedMatcher.split(" ").filter(Boolean);
  if (tokens.length === 0) return false;

  return tokens.every((token) => normalizedText.includes(token));
};

const stationMatches = (entry, stationId) => {
  const normalizedStation = normalizeText(stationId);
  if (!Array.isArray(entry?.stations) || entry.stations.length === 0) return true;
  if (!normalizedStation) return true;
  return entry.stations.includes(normalizedStation);
};

const applicationMatchesFlange = (entry) => {
  const application = String(entry?.application || "").trim().toLowerCase();
  if (!application) return true;
  return application === "flange_series" || application === "flange";
};

const buildItemCodeCandidates = (order, relatedItemCodes = []) => {
  const candidates = [order?.itemCode, order?.item, ...relatedItemCodes]
    .map((value) => normalizeText(value))
    .filter(Boolean);
  return new Set(candidates);
};

const isFlangeText = (text) => {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return false;
  if (normalizedText.startsWith("FL ") || normalizedText === "FL") return true;
  if (normalizedText.includes(" FL ")) return true;
  return normalizedText.includes("FLENS") || normalizedText.includes("FLANGE");
};

export const getFlangeSeriesInfo = (
  order,
  rawRules,
  rawToolingMolds = [],
  stationId = "",
  relatedItemCodes = []
) => {
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
