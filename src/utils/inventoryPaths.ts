import { PATHS } from "../config/dbPaths";

const DEFAULT_DEPARTMENT = "Fittings";
const DEFAULT_MACHINE = "UNASSIGNED";

const toSegment = (value: unknown, fallback: string): string => {
  const normalized = String(value || "")
    .trim()
    .replace(/[/.#?$[\]]/g, "_")
    .replace(/\s+/g, "_");
  return normalized || fallback;
};

const detectMachineFromText = (value = "") => {
  const upper = String(value || "").toUpperCase();
  const machineMatch = upper.match(/(?:40)?(?:BH|BM|BA)\d{2}/);
  if (machineMatch) return machineMatch[0].replace(/^40/, "");
  if (upper.includes("LOSSEN")) return "LOSSEN";
  if (upper.includes("NABEWERK")) return "NABEWERKING";
  if (upper.includes("BM01")) return "BM01";
  return "";
};

export const resolveInventoryScope = (record: Record<string, any> = {}) => {
  const departmentId = toSegment(
    record.departmentId || record.department || record.afdeling,
    DEFAULT_DEPARTMENT
  );

  const detectedMachine =
    record.machineId ||
    record.machine ||
    record.stationId ||
    detectMachineFromText(record.location) ||
    detectMachineFromText(record.id);

  const machineId = toSegment(detectedMachine, DEFAULT_MACHINE);

  return { departmentId, machineId };
};

export const buildScopedInventoryDocPath = ({
  docId,
  departmentId,
  machineId,
}: {
  docId: string;
  departmentId?: string;
  machineId?: string;
}) => {
  const safeDocId = String(docId || "").trim();
  if (!safeDocId) return null;

  return [
    ...PATHS.INVENTORY,
    toSegment(departmentId, DEFAULT_DEPARTMENT),
    "machines",
    toSegment(machineId, DEFAULT_MACHINE),
    "items",
    safeDocId,
  ];
};

export const isProductionInventoryScopedDoc = (path = "") =>
  String(path || "").includes(`/${PATHS.INVENTORY.join("/")}/`) &&
  String(path || "").includes("/machines/") &&
  String(path || "").includes("/items/");
