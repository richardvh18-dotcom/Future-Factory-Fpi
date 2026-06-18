import React, { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Upload,
  Loader2,
  Database,
  ShieldCheck,
  Clipboard,
} from "lucide-react";
import {
  collection,
  collectionGroup,
  getDocs,
} from "firebase/firestore";
import { db, auth, logActivity } from "../../../config/firebase";
import { PATHS, getPathString } from "../../../config/dbPaths";
import { importPlanningOrders } from "../../../services/planningSecurityService";
import { normalizeMachine } from "../../../utils/hubHelpers";
import { useNotifications } from "../../../contexts/NotificationContext";
import * as XLSX from "xlsx";
import { getISOWeek, format, startOfISOWeek, differenceInCalendarWeeks, parse, parseISO, isValid, subWeeks } from "date-fns";

type PlanningImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  currentDepartment?: string;
};

type PlanningImportEntry = {
  id: string;
  orderId?: string;
  orderNumber?: string;
  sourceDataId?: string;
  machine?: string;
  isValidForImport?: boolean;
  atEindinspectieCount?: number;
  smartSyncExcluded?: boolean;
  smartSyncIncluded?: boolean;
  inspectionApprovedQty?: number;
  produced?: number;
  [key: string]: any;
};

type DebugLogEntry = {
  msg: string;
  type: string;
  time: string;
};

type LnOperationRow = {
  pTime: number;
  aTime: number;
  wc: string;
};

type LnGroupedOperation = {
  derived: LnOperationRow[];
  original: LnOperationRow[];
};

type PlanningOperationTotals = {
  planned: number;
  actual: number;
  wc: string;
};

type PlanningImportAggregate = PlanningImportEntry & {
  machine: string;
  machineTotals?: Record<string, number>;
  _opRows?: Record<string, LnGroupedOperation>;
  operations: Record<string, PlanningOperationTotals>;
  totalPlannedHours: number;
  totalActualHours: number;
  totalEstimatedHoursFromLn?: number;
  plannedDeliveryDate?: string | Date | null;
  weekNumber?: number | null;
};

/**
 * PlanningImportModal v4.7 - Pilot Version (Order Creation Date Support)
 */
const PlanningImportModal = ({ isOpen, onClose, onSuccess, currentDepartment = "all" }: PlanningImportModalProps) => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const [fileData, setFileData] = useState<PlanningImportEntry[]>([]);
  const [rawWorkbook, setRawWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());
  const [existingOrderMap, setExistingOrderMap] = useState<Map<string, PlanningImportEntry>>(new Map());
  const [importMode, setImportMode] = useState("smart_update");
  const [hoursOnlyMode, setHoursOnlyMode] = useState(false);
  const [selectedMachines, setSelectedMachines] = useState<string[]>([]);
  const [machineGroupFilter, setMachineGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [readySyncFilter, setReadySyncFilter] = useState("all");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [toDoOverrides, setToDoOverrides] = useState<Record<string, unknown>>({});
  const [pasteMode, setPasteMode] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgressPct, setImportProgressPct] = useState(0);
  const [importProgressLabel, setImportProgressLabel] = useState("");
  const [importEtaLabel, setImportEtaLabel] = useState("");
  const [, setDebugLogs] = useState<DebugLogEntry[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pasteTextAreaRef = useRef<HTMLTextAreaElement | null>(null);

  // Bepaal of deze import alleen voor Fittings is
  const isFittingsScoped = useMemo(() => currentDepartment === "fittings", [currentDepartment]);

  // Tijdelijke businessguard: deze orders staan bevestigd in DB en mogen niet via slimme sync worden bijgewerkt.
  const SMART_SYNC_EXCLUDED_ORDER_IDS = useMemo(
    () =>
      new Set([
        "N20024490",
        "N20024491",
        "N20024566",
        "N20024604",
        "N20024738",
        "N20024739",
        "N20024740",
        "N20024769",
        "N20024772",
        "N20024774",
        "N20024781",
        "N20024828",
        "N20024731",
        "N20024607",
      ]),
    []
  );

  useEffect(() => {
    const fetchExisting = async () => {
      if (!isOpen) return;
      try {
        // Fetch planning orders first (critical for existing-order detection)
        const [rootSnap, scopedSnap] = await Promise.all([
          getDocs(collection(db, getPathString(PATHS.PLANNING))),
          getDocs(collectionGroup(db, "orders")),
        ]);

        const byKey = new Map<string, { data: PlanningImportEntry; priority: number }>();
        const planningPrefix = `${getPathString(PATHS.PLANNING)}/`;

        const scopedPlanningDocs = scopedSnap.docs.filter((docEntry: any) => {
          const path = String(docEntry?.ref?.path || "");
          return (
            path.startsWith(planningPrefix) &&
            path.includes("/machines/") &&
            path.includes("/orders/")
          );
        });

        const indexDoc = (docEntry: any, { priority = 1 }: { priority?: number } = {}) => {
          const data = docEntry.data() || {};
          const indexedData: PlanningImportEntry = { ...data, id: docEntry.id, __docPath: docEntry?.ref?.path || "" };
          const keys = getOrderKeys(indexedData);
          if (!keys.length) return;

          keys.forEach((key: string) => {
            const existing = byKey.get(key);
            if (!existing || priority >= existing.priority) {
              byKey.set(key, { data: indexedData, priority });
            }
          });
        };

        // Legacy/root laag eerst, scoped planning daarna als bron van waarheid.
        rootSnap.docs.forEach((docEntry) => indexDoc(docEntry, { priority: 1 }));
        scopedPlanningDocs.forEach((docEntry) => indexDoc(docEntry, { priority: 2 }));

        setExistingIds(new Set(byKey.keys()));
        setExistingOrderMap(new Map(Array.from(byKey.entries()).map(([key, value]) => [key, value.data])));

        // Fetch Eindinspectie counts separately (non-blocking, best-effort)
        try {
          const trackedSnap = await getDocs(collectionGroup(db, "items"));
          const atEindinspectieCountMap = new Map<string, number>();
          trackedSnap.docs.forEach((docEntry: any) => {
            const path = String(docEntry?.ref?.path || "");
            if (!path.includes("/tracked_products/")) return;

            const data = docEntry.data() || {};
            const orderId = String(data?.orderId || "").trim().toUpperCase();
            const currentStep = String(data?.currentStep || "").trim().toUpperCase();

            if (orderId && (currentStep === "EINDINSPECTIE" || currentStep.includes("INSPECTIE"))) {
              const current = atEindinspectieCountMap.get(orderId) || 0;
              atEindinspectieCountMap.set(orderId, current + 1);
            }
          });

          // Merge Eindinspectie counts into already-built map
          if (atEindinspectieCountMap.size > 0) {
            setExistingOrderMap((prev) => {
              const updated = new Map(prev);
              updated.forEach((orderData, key) => {
                const orderIdForLookup = String(orderData?.orderId || orderData?.id || "").trim().toUpperCase();
                const count = atEindinspectieCountMap.get(orderIdForLookup) || 0;
                if (count > 0) {
                  updated.set(key, { ...orderData, atEindinspectieCount: count });
                }
              });
              return updated;
            });
          }
        } catch {
          // Eindinspectie count niet beschikbaar, geen probleem – vergelijking werkt zonder
        }
      } catch {
        addLog(t("digitalplanning.planning_import.logs.db_connect_failed", "Database connectie mislukt."), "error");
      }
    };
    fetchExisting();
  }, [isOpen, t]);

  const addLog = (msg: string, type = "info") => {
    setDebugLogs((prev) => [{ msg, type, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 15)]);
  };

  const clean = (val: unknown) => String(val || "").trim();
  const getOrderKeys = (order: Partial<PlanningImportEntry> | null | undefined) => {
    const keys = new Set<string>();
    [order?.id, order?.orderId, order?.orderNumber, order?.sourceDataId].forEach((value) => {
      const key = clean(value).toUpperCase();
      if (key) keys.add(key);
    });
    return Array.from(keys);
  };

  const getExistingOrder = (order: Partial<PlanningImportEntry> | null | undefined) => {
    const keys = getOrderKeys(order);
    for (const key of keys) {
      const existing = existingOrderMap.get(key);
      if (existing) return existing;
    }
    return null;
  };

  const isExistingOrder = (order: Partial<PlanningImportEntry> | null | undefined) => {
    return getOrderKeys(order).some((key) => existingIds.has(key));
  };

  const isSmartSyncExcludedOrder = (order: Partial<PlanningImportEntry> | null | undefined) => {
    return getOrderKeys(order).some((key) => SMART_SYNC_EXCLUDED_ORDER_IDS.has(key));
  };

  const buildImportDocId = (orderId: unknown, ...suffixCandidates: unknown[]) => {
    const safeOrderId = clean(orderId);
    const suffix = suffixCandidates
      .map((value) => clean(value))
      .find((value) => value.length > 0);
    const raw = suffix ? `${safeOrderId}_${suffix}` : safeOrderId;
    return raw.replace(/[^a-zA-Z0-9]/g, "_");
  };

  if (!isOpen) return null;
  const parseNum = (val: unknown) => {
    if (val === null || val === undefined || val === "") return 0;
    const s = String(val).replace(/\s/g, "").replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  const getComparableReadyQty = (order: PlanningImportEntry) => {
    const produced =
      order?.inspectionApprovedQty ??
      order?.produced ??
      0;
    // Voeg producten toe die al bij Eindinspectie klaarstaan (wikkelstap in FF historisch meegenomen)
    const atEindinspectie = order?.atEindinspectieCount ?? 0;
    const total = produced + atEindinspectie;
    const n = Number(total);
    return Number.isFinite(n) ? n : 0;
  };

  const parsePastedTabularData = (text: string) => {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (ch === '"') {
        if (inQuotes && next === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === "\t" && !inQuotes) {
        row.push(cell.trim());
        cell = "";
        continue;
      }

      if ((ch === "\n" || ch === "\r") && !inQuotes) {
        if (ch === "\r" && next === "\n") i++;
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = "";
        continue;
      }

      if ((ch === "\n" || ch === "\r") && inQuotes) {
        cell += " ";
        continue;
      }

      cell += ch;
    }

    if (cell.length > 0 || row.length > 0) {
      row.push(cell.trim());
      rows.push(row);
    }

    return rows.filter((r) => r.some((c) => clean(c) !== ""));
  };

  const normalizeHeader = (value: unknown) =>
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");

  const firstIndex = (headers: unknown[], candidates: unknown[]) => {
    const normalized = headers.map(normalizeHeader);
    for (const candidate of candidates) {
      const idx = normalized.findIndex((h: string) => h === normalizeHeader(candidate));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const parseFlexibleDate = (rawValue: unknown) => {
    if (!rawValue) return null;
    if (rawValue instanceof Date && !isNaN(rawValue.getTime())) return rawValue;

    const raw = String(rawValue).trim();
    if (!raw) return null;

    const candidates = [
      parse(raw, "dd/MM/yyyy", new Date()),
      parse(raw, "d/M/yyyy", new Date()),
      parse(raw, "dd-MM-yyyy", new Date()),
      parse(raw, "d-M-yyyy", new Date()),
      parse(raw, "MM/dd/yyyy", new Date()),
      parse(raw, "M/d/yyyy", new Date()),
      parse(raw, "MM-dd-yyyy", new Date()),
      parse(raw, "M-d-yyyy", new Date()),
      parseISO(raw),
      new Date(raw),
    ];

    return candidates.find((d) => isValid(d)) || null;
  };

  const processTabularPlanningRows = (rawRows: unknown[][]) => {
    if (!Array.isArray(rawRows) || rawRows.length === 0) return [];

    const headerIdx = rawRows.findIndex((row: unknown[]) => {
      const headers = (row || []).map((h: unknown) => normalizeHeader(h));
      return headers.includes("order") && (headers.includes("machine") || headers.includes("datum") || headers.includes("date"));
    });

    if (headerIdx === -1) return [];

    const headers = (rawRows[headerIdx] || []).map((h: unknown) => String(h || "").trim());
    const dataRows = rawRows.slice(headerIdx + 1);

    const idxOrder = firstIndex(headers, ["order", "order id", "ordernummer", "production order"]);
    const idxMachine = firstIndex(headers, ["machine", "work center", "station"]);
    const idxItemCode = firstIndex(headers, ["manufactured item", "item code", "item"]);
    const idxItemDesc = firstIndex(headers, ["item desc", "item description", "description", "omschrijving"]);
    const idxDatum = firstIndex(headers, ["datum", "date", "delivery date", "leverdatum", "planned delivery date"]);
    const idxWeek = firstIndex(headers, ["week", "week number", "weeknumber"]);
    const idxPlan = firstIndex(headers, ["plan", "qty", "quantity", "aantal"]);
    const idxDelivered = firstIndex(headers, ["hoeveelheid geleverd", "geleverd", "delivered quantity", "delivered qty"]);
    const idxToDo = firstIndex(headers, ["to do", "to do qty", "todo", "to_do"]);
    const idxProduced = firstIndex(headers, ["gewikkeld", "produced", "gemaakt", "hoeveelheid gereed"]);
    const idxEstimatedHours = firstIndex(headers, ["total production estimated time [hrs]", "total production estimated time hrs", "estimated time [hrs]", "estimated time hrs"]);
    const idxStatus = firstIndex(headers, ["status", "order status"]);
    const idxCode = firstIndex(headers, ["code", "extra code", "special instructions"]);
    const idxPoText = firstIndex(headers, ["po text", "po-text", "po note", "opmerking"]);
    const idxProject = firstIndex(headers, ["project"]);
    const idxProjectDesc = firstIndex(headers, ["project desc", "project description"]);
    const idxDrawing = firstIndex(headers, ["drawing", "drawing number", "tekening"]);

    if (idxOrder === -1) return [];

    const orders: PlanningImportEntry[] = dataRows
      .map((row: unknown[]) => {
        const orderId = clean(row[idxOrder]);
        if (!orderId) return null;

        const machine = normalizeMachine(idxMachine !== -1 ? row[idxMachine] : "-");
        const itemCode = idxItemCode !== -1 ? clean(row[idxItemCode]) : "";
        const itemDescription = idxItemDesc !== -1 ? clean(row[idxItemDesc]) : "";
        const rawStatus = idxStatus !== -1 ? clean(row[idxStatus]) : "released";
        const deliveryObj = idxDatum !== -1 ? parseFlexibleDate(row[idxDatum]) : null;
        const parsedWeek = idxWeek !== -1 ? Number(row[idxWeek]) : null;
        const weekNumber = typeof parsedWeek === "number" && Number.isFinite(parsedWeek) && parsedWeek > 0
          ? parsedWeek
          : (deliveryObj ? getISOWeek(deliveryObj) : null);

        const plan = idxToDo !== -1
          ? parseNum(row[idxToDo])
          : (idxPlan !== -1 ? parseNum(row[idxPlan]) : 0);

        const produced = idxProduced !== -1 ? parseNum(row[idxProduced]) : 0;
        const estimatedHours = idxEstimatedHours !== -1 ? parseNum(row[idxEstimatedHours]) : 0;
        const quantity = idxPlan !== -1 ? parseNum(row[idxPlan]) : plan;
        const deliveredQty = idxDelivered !== -1 ? parseNum(row[idxDelivered]) : null;
        const docId = buildImportDocId(orderId, itemCode, itemDescription, machine);

        return {
          id: docId || orderId,
          orderId,
          machine,
          itemCode,
          item: itemDescription,
          itemDescription,
          project: idxProject !== -1 ? clean(row[idxProject]) : "",
          projectDesc: idxProjectDesc !== -1 ? clean(row[idxProjectDesc]) : "",
          notes: idxPoText !== -1 ? clean(row[idxPoText]) : "",
          extraCode: idxCode !== -1 ? clean(row[idxCode]) : "",
          quantity,
          deliveredQty,
          toDoQty: plan || quantity,
          plan: plan || quantity,
          produced,
          plannedDeliveryDate: deliveryObj ? deliveryObj.toISOString() : null,
          deliveryDate: deliveryObj ? deliveryObj.toISOString() : null,
          plannedDate: deliveryObj ? subWeeks(deliveryObj, 3).toISOString() : null,
          weekNumber,
          orderStatus: rawStatus,
          drawing: idxDrawing !== -1 ? clean(row[idxDrawing]) : "",
          isValidForImport: isStatusAllowed(rawStatus),
          status: "waiting",
          totalPlannedHours: estimatedHours,
          totalActualHours: 0,
          operations: {},
          sourceType: "Pasted Table",
        };
      })
      .filter((order) => Boolean(order)) as PlanningImportEntry[];

    // Dedupe op id: laatste regel wint.
    const byId = new Map<string, PlanningImportEntry>();
    orders.forEach((o) => {
      if (o.id) byId.set(o.id, o);
    });
    return Array.from(byId.values());
  };

  const normalizeMachine = (val: unknown) => {
    let str = clean(val).toUpperCase();
    // Work Center uit LN moet zichtbaar blijven zoals aangeleverd (bijv. 40BH18).
    if (str === "BM18") str = "BH18";
    if (str === "40BM18") str = "40BH18";
    return str || "-";
  };

  const extractMachineHint = (...values: unknown[]) => {
    const machinePattern = /(?:^|[^A-Z0-9])((?:40)?[A-Z]{2}\d{2})(?=$|[^A-Z0-9])/i;

    for (const value of values.flat(Infinity)) {
      const text = String(value || "").trim().toUpperCase();
      if (!text) continue;
      const match = text.match(machinePattern);
      if (match?.[1]) return match[1].toUpperCase();
    }

    return "";
  };

  const isStatusAllowed = (status: unknown) => {
    const s = clean(status).toLowerCase();
    if (s.includes("production completed") || s.includes("completed")) return false;
    const allowed = ["released", "planned", "active", "created", "vrijgegeven", "aangemaakt", "actief"];
    return allowed.some(keyword => s.includes(keyword));
  };

  const normalizeMachineCodeForFilter = (machineCode: unknown) => {
    const normalized = normalizeMachine(machineCode);
    if (normalized === "BM18") return "BH18";
    return normalized;
  };

  const getMachinePriority = (machineCode: unknown) => {
    const m = clean(machineCode).toUpperCase();
    if (/^40BH\d{2}$/.test(m)) return 600;
    if (/^40BM\d{2}$/.test(m)) return 550;
    if (/^40BA\d{2}$/.test(m)) return 500;
    if (/^40BB\d{2}$/.test(m)) return 450;
    if (/^40AJ\d{2}$/.test(m)) return 300;
    if (/^40\d{4}$/.test(m)) return 150;
    return 50;
  };

  const isFittingsMachine = (machineCode: unknown) => {
    const m = clean(machineCode).toUpperCase();
    const normalized = m.startsWith("40") ? m.slice(2) : m;
    const allowed = new Set(["BH11", "BH12", "BH15", "BH16", "BH17", "BH18", "BH31"]);
    return allowed.has(normalized);
  };

  const isPipesMachine = (machineCode: unknown) => {
    const m = clean(machineCode).toUpperCase();
    const normalized = m.startsWith("40") ? m.slice(2) : m;
    const padded = normalized.replace(/^BA(\d)$/, "BA0$1");
    const allowed = new Set(["BA05", "BA07", "BA08", "BA09"]);
    return allowed.has(padded);
  };

  const getDeliveryMeta = (order: PlanningImportEntry) => {
    const raw = order?.deliveryDate || order?.plannedDeliveryDate;
    const parsed = raw ? new Date(raw) : null;
    const isValidDate = parsed && !isNaN(parsed.getTime());
    if (!isValidDate) {
      return { dateLabel: "-", weekLabel: "W?", weekDiff: null };
    }

    const parsedDate = parsed as Date;

    const nowWeekStart = startOfISOWeek(new Date());
    const targetWeekStart = startOfISOWeek(parsedDate);
    const weekDiff = differenceInCalendarWeeks(targetWeekStart, nowWeekStart);
    const weekNumber = order?.weekNumber || getISOWeek(parsedDate);

    return {
      dateLabel: format(parsedDate, "dd-MM-yyyy"),
      weekLabel: `W${weekNumber}`,
      weekDiff,
    };
  };

  const getDeliveryColorClass = (weekDiff: number | null) => {
    if (weekDiff === null) return "bg-slate-100 text-slate-500 border-slate-200";
    if (weekDiff < 0) return "bg-red-50 text-red-700 border-red-200";
    if (weekDiff === 0) return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  };

  // QC-stations per afdeling: wc na normalizeMachine ("40BM01" → "BM01")
  const QC_STATIONS = ["BM01", "BA01"];

  const classifyByWc = (wc: unknown) => {
    const upper = String(wc || "").toUpperCase();
    if (QC_STATIONS.some(s => upper.includes(s))) return "qc";
    if (upper.includes("NABEWERK") || upper.includes("NABEW")) return "post";
    return null; // geen WC-match, val terug op refOp-code
  };

  const classifyReferenceOperation = (refOp: unknown, wc: unknown, refOpsConfig: Record<string, { type?: string }> | null = null) => {
    // 1. Database-driven lookup (indien aanwezig via Firestore import)
    if (refOpsConfig && refOp) {
      const entry = refOpsConfig[String(refOp).trim()];
      if (entry?.type) return entry.type;
    }
    // 2. WC-fallback
    const wcBucket = classifyByWc(wc);
    if (wcBucket) return wcBucket;
    // 3. Hardcoded bekende codes
    const knownTypes: Record<string, string> = { "1020": "qc", "1715": "production", "1740": "post", "1115": "post" };
    if (knownTypes[String(refOp).trim()]) return knownTypes[String(refOp).trim()];
    // 4. Modulo-heuristiek als laatste fallback
    const digits = parseInt(String(refOp || "").replace(/\D/g, ""), 10);
    if (isNaN(digits)) return "production";
    const opCode = digits % 100;
    if (opCode === 60) return "qc";
    if (opCode === 30) return "post";
    return "production";
  };


  // LOGICA: Aggregatie van Operations per unieke Productie Order inclusief Creation Date
  const processRawLNDump = (rawRows: unknown[][]) => {
    const headerIdx = rawRows.findIndex((r) =>
      r.some((c: unknown) => {
        const h = normalizeHeader(c);
        return (
          h === "production order" ||
          h === "productieorder" ||
          h === "ordernummer" ||
          h === "order number"
        );
      })
    );
    if (headerIdx === -1) {
      addLog(t("digitalplanning.planning_import.logs.invalid_format", "Fout formaat: 'Production Order' niet gevonden."), "error");
      return [];
    }

    const headers = rawRows[headerIdx].map((h: unknown) => normalizeHeader(h));
    const dataRows = rawRows.slice(headerIdx + 1);
    const findCol = (names: string[]) =>
      headers.findIndex((h: string) => names.some((n: string) => h.includes(normalizeHeader(n))));

    const idx = {
      order: findCol(["production order", "productieorder", "ordernummer", "order number"]),
      delivery: findCol(["planned delivery date", "geplande leverdatum", "leverdatum", "datum"]),
      machine: findCol(["work center", "work centre", "afdeling", "machine", "station"]),
      status: findCol(["order status", "ord.status", "ord status", "status"]),
      item: findCol(["item", "artikel"]),
      desc: findCol(["item description", "omschrijving", "artikelomschrijving"]),
      project: findCol(["project"]),
      projectDesc: findCol(["project description", "project desc", "projectomschrijving"]),
      qty: findCol(["quantity ordered", "orderhoeveelheid", "aantal"]),
      delivered: findCol(["quantity delivered", "hoeveelheid geleverd", "geleverd", "delivered qty"]),
      ready: findCol(["quantity ready", "hoeveelheid gereed", "gewikkeld", "produced", "gemaakt"]),
      operation: findCol(["operation", "bewerking"]),
      origBewerking: findCol(["oorspronkelijke bewerking", "original operation", "orig operation", "orig. bewerking"]),
      plannedHours: findCol(["production time", "labor hours", "productietijd", "manuren"]),
      totalEstimatedHours: findCol(["total production estimated time [hrs]", "total production estimated time hrs", "estimated production time [hrs]", "estimated production time hrs"]),
      actualHours: findCol(["spent production time", "bestede tijd"]),
      refOp: findCol(["reference operation", "ref.bew", "ref bew"]),
      drawing: findCol(["drawing number", "tekening"]),
      notes: findCol(["production order text", "productieorder tekst", "po text", "po-text", "po note", "opmerking"]),
      // Alleen Special Instructions mag naar extraCode (Lot Code mag niet worden geïmporteerd als code).
      special: findCol(["special instructions", "special instruction", "extra code", "extra-code"]),
      todo: findCol(["to do qty"]),
      creation: findCol(["order creation date"]) // Nieuwe kolom voor Dossier
    };

    const orderMap = new Map<string, PlanningImportAggregate>();

    dataRows.forEach((row: unknown[]) => {
      const orderId = clean(row[idx.order]);
      if (!orderId || orderId === "" || orderId === "0") return;

      const refOp = clean(row[idx.refOp]) || clean(row[idx.operation]);
      const pTime = parseNum(row[idx.plannedHours]);
      const estimatedTotalTime = parseNum(row[idx.totalEstimatedHours]);
      const aTime = parseNum(row[idx.actualHours]);
      const rawStatus = clean(row[idx.status]);
      const rowMachine = normalizeMachine(row[idx.machine]);
      const rowStatusAllowed = isStatusAllowed(rawStatus);
      const rawDelivery = idx.delivery !== -1 ? row[idx.delivery] : null;

      if (!orderMap.has(orderId)) {
        orderMap.set(orderId, {
          id: buildImportDocId(orderId, clean(row[idx.item]), clean(row[idx.desc]), rowMachine),
          orderId: orderId,
          machine: rowMachine,
          itemCode: clean(row[idx.item]),
          item: clean(row[idx.desc]),
          itemDescription: clean(row[idx.desc]),
          project: clean(row[idx.project]),
          projectDesc: clean(row[idx.projectDesc]),
          notes: clean(row[idx.notes]),
          extraCode: clean(row[idx.special]),
          quantity: parseNum(row[idx.qty]),
          deliveredQty: idx.delivered !== -1 ? parseNum(row[idx.delivered]) : null,
          produced: idx.ready !== -1 ? parseNum(row[idx.ready]) : 0,
          toDoQty: parseNum(row[idx.qty]),
          plannedDeliveryDate: rawDelivery instanceof Date ? rawDelivery : (clean(rawDelivery) || null),
          orderCreationDate: clean(row[idx.creation]), // Alleen voor dossier
          orderStatus: rawStatus,
          drawing: clean(row[idx.drawing]),
          isValidForImport: rowStatusAllowed,
          status: "waiting",
          plan: parseNum(row[idx.qty]) || 0,
          totalPlannedHours: 0,
          totalEstimatedHoursFromLn: estimatedTotalTime,
          totalActualHours: 0,
          operations: {},
          machineTotals: {},
          sourceType: "LN Consolidated"
        });
      }

      const order = orderMap.get(orderId);
      if (!order) return;
      if ((order.machine === "-" || !order.machine) && rowMachine !== "-") {
        order.machine = rowMachine;
      }
      if (!rowStatusAllowed) {
        order.isValidForImport = false;
      }
      if (!order.orderStatus && rawStatus) {
        order.orderStatus = rawStatus;
      }

      if (!order.orderCreationDate) {
        order.orderCreationDate = clean(row[idx.creation]);
      }

      if (estimatedTotalTime > 0) {
        order.totalEstimatedHoursFromLn = Math.max(Number(order.totalEstimatedHoursFromLn) || 0, estimatedTotalTime);
      }

      if ((!order.extraCode || order.extraCode === "-") && clean(row[idx.special])) {
        order.extraCode = clean(row[idx.special]);
      }

      if (!order.notes) {
        order.notes = clean(row[idx.notes]);
      }

      if (!order.project) {
        order.project = clean(row[idx.project]);
      }

      if (!order.projectDesc) {
        order.projectDesc = clean(row[idx.projectDesc]);
      }

      if (!order.drawing) {
        order.drawing = clean(row[idx.drawing]);
      }

      if (idx.delivered !== -1) {
        order.deliveredQty = Math.max(Number(order.deliveredQty) || 0, parseNum(row[idx.delivered]));
      }
      if (idx.ready !== -1) {
        order.produced = Math.max(Number(order.produced) || 0, parseNum(row[idx.ready]));
      }

      if (rowMachine !== "-") {
        const machineWeight = pTime > 0 ? pTime : 0.001;
        const machineTotals = order.machineTotals ?? (order.machineTotals = {});
        machineTotals[rowMachine] = (machineTotals[rowMachine] || 0) + machineWeight;
      }

      order.totalPlannedHours += pTime;
      order.totalActualHours += aTime;

      if (refOp) {
        // Derived bewerking detection: when Bewerking ≠ Oorspronkelijke bewerking the row is a
        // derived operation that carries the actual Productietijd. Original rows often have 0h when
        // a derived row exists. We prefer the derived row over the original for the same refOp.
        const bewNum = idx.operation !== -1 ? parseNum(row[idx.operation]) : 0;
        const origBewNum = idx.origBewerking !== -1 ? parseNum(row[idx.origBewerking]) : bewNum;
        const isDerived = bewNum > 0 && origBewNum > 0 && Math.abs(bewNum - origBewNum) > 0.001;

        if (!order._opRows) order._opRows = {};
        if (!order._opRows[refOp]) order._opRows[refOp] = { derived: [], original: [] };
        const rowEntry = { pTime, aTime, wc: normalizeMachine(row[idx.machine] || "") };
        if (isDerived) {
          order._opRows[refOp].derived.push(rowEntry);
        } else {
          order._opRows[refOp].original.push(rowEntry);
        }
      }
    });

    const result = Array.from(orderMap.values()).map((order) => {
      const rankedMachines = Object.entries(order.machineTotals ?? {})
        .map(([machineCode, weightedHours]) => ({
          machineCode,
          weightedHours: Number(weightedHours) || 0,
          score: getMachinePriority(machineCode) + (Number(weightedHours) || 0),
        }))
        .sort((a, b) => b.score - a.score);

      const primaryMachine = rankedMachines[0]?.machineCode || order.machine;
      const rest = { ...order };
      delete rest.machineTotals;
      delete rest._opRows;

      // Convert _opRows to final operations map with derived-bewerking selection:
      // if a derived row exists for a refOp (Bewerking ≠ OorspronkelijkeBewerking) use its
      // Productietijd; otherwise sum the original rows.
      const correctedOperations: Record<string, PlanningOperationTotals> = {};
      let correctedTotalHours = 0;
      Object.entries(order._opRows || {}).forEach(([refOp, opGroup]) => {
        const { derived, original } = opGroup as LnGroupedOperation;
        const rows = derived.length > 0 ? derived : original;
        const planned = rows.reduce((sum: number, r: LnOperationRow) => sum + r.pTime, 0);
        const actual = rows.reduce((sum: number, r: LnOperationRow) => sum + r.aTime, 0);
        const wc = rows[0]?.wc || "";
        correctedOperations[refOp] = { planned, actual, wc };
        correctedTotalHours += planned;
      });
      rest.operations = correctedOperations;
      if (correctedTotalHours > 0) {
        rest.totalPlannedHours = correctedTotalHours;
      }

      if ((Number(rest.totalPlannedHours) || 0) <= 0 && (Number(rest.totalEstimatedHoursFromLn) || 0) > 0) {
        rest.totalPlannedHours = Number(rest.totalEstimatedHoursFromLn) || 0;
      }
      delete rest.totalEstimatedHoursFromLn;

      // Planned Delivery Date → deliveryDate (canonical field used throughout the app)
      let deliveryDate = rest.plannedDeliveryDate || null;
      let weekNumber = rest.weekNumber || null;
      if (deliveryDate) {
        const d = deliveryDate instanceof Date ? deliveryDate : new Date(deliveryDate);
        if (!isNaN(d.getTime())) {
          deliveryDate = d.toISOString();
          weekNumber = getISOWeek(d);
          // Sitebrede regel: productie start standaard 3 weken voor levering.
          if (!rest.plannedDate) {
            rest.plannedDate = subWeeks(d, 3).toISOString();
          }
        } else {
          deliveryDate = null;
        }
      }

      return {
        ...rest,
        id: buildImportDocId(rest.orderId, rest.itemCode, rest.itemDescription, primaryMachine),
        machine: primaryMachine,
        deliveryDate,
        weekNumber,
      };
    });
    addLog(
      t("digitalplanning.planning_import.logs.orders_consolidated", {
        count: result.length,
        defaultValue: "{{count}} orders geconsolideerd.",
      }),
      "success"
    );
    return result;
  };

  const handleSheetChange = (sheetName: string, workbookOverride: XLSX.WorkBook | null = null) => {
    const workbook = workbookOverride || rawWorkbook;
    if (!workbook) return;
    setLoading(true);
    try {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        addLog(
          t("digitalplanning.planning_import.logs.sheet_not_found", {
            name: sheetName,
            defaultValue: "Tabblad niet gevonden: {{name}}",
          }),
          "error"
        );
        setFileData([]);
        return;
      }
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
      let data: PlanningImportEntry[] = processRawLNDump(rawRows);
      if (!data.length) {
        data = processTabularPlanningRows(rawRows);
      }
      setFileData(data);
      setToDoOverrides({});
    } catch {
      addLog(t("digitalplanning.planning_import.logs.sheet_read_failed", "Fout bij inlezen tabblad."), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { cellDates: true });
      setRawWorkbook(workbook);
      const bestSheet = workbook.SheetNames.find((n: string) => n.toLowerCase().includes("data") || n.toLowerCase().includes("format") || n === "40BM01");
      handleSheetChange(bestSheet || workbook.SheetNames[0], workbook);
    } catch { addLog(t("digitalplanning.planning_import.logs.file_unreadable", "Bestand onleesbaar."), "error"); } finally { setLoading(false); }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { cellDates: true });
      setRawWorkbook(workbook);
      const bestSheet = workbook.SheetNames.find((n: string) => n.toLowerCase().includes("data") || n.toLowerCase().includes("format") || n === "40BM01");
      handleSheetChange(bestSheet || workbook.SheetNames[0], workbook);
    } catch { addLog(t("digitalplanning.planning_import.logs.file_unreadable", "Bestand onleesbaar."), "error"); } finally { setLoading(false); }
  };

  const handlePasteImport = async () => {
    const pastedText = pasteTextAreaRef.current?.value || "";
    if (!clean(pastedText)) {
      alert(t("digitalplanning.planning_import.alerts.paste_first", "Plak eerst Excel-gegevens in het tekstveld."));
      return;
    }

    setLoading(true);
    try {
      let rows = parsePastedTabularData(pastedText);
      if (!rows.length) {
        alert(t("digitalplanning.planning_import.alerts.no_valid_paste_data", "Geen geldige geplakte data gevonden."));
        return;
      }

      let machineHintFromFlattened = extractMachineHint(pastedText);

      // Herstel voor enkele Office-plakvarianten waar alles in 1 lange regel terechtkomt.
      if (rows.length <= 2 && (rows[0]?.length || 0) > 40) {
        const allCells = rows.flat();
        const lowered = allCells.map((c) => String(c || "").toLowerCase().trim());
        const headerStart = lowered.findIndex(
          (c, i) =>
            c === "datum" &&
            lowered[i + 1] === "week" &&
            lowered[i + 2] === "order"
        );

        if (headerStart !== -1) {
          const machineCell = extractMachineHint(allCells.slice(0, headerStart));
          if (machineCell) machineHintFromFlattened = machineCell;

          const headerLen = 11;
          const header = allCells.slice(headerStart, headerStart + headerLen);
          const dataCells = allCells.slice(headerStart + headerLen);
          const rebuilt = [header];

          for (let i = 0; i < dataCells.length; i += headerLen) {
            const chunk = dataCells.slice(i, i + headerLen);
            if (!chunk.length) continue;
            while (chunk.length < headerLen) chunk.push("");
            if (chunk.some((v) => String(v || "").trim() !== "")) rebuilt.push(chunk);
          }

          if (rebuilt.length > 1) rows = rebuilt;
        }
      }

      let headerIndex = rows.findIndex((row) => {
        const lowered = row.map((h) => String(h || "").toLowerCase());
        return lowered.includes("machine") && lowered.includes("order");
      });

      if (headerIndex === -1) {
        headerIndex = rows.findIndex((row) => {
          const lowered = row.map((h) => String(h || "").toLowerCase());
          return lowered.includes("order") && lowered.includes("datum");
        });
      }

      if (headerIndex === -1) {
        alert(t("digitalplanning.planning_import.alerts.columns_not_found", "Fout: kolommen 'Machine' en 'order' niet gevonden."));
        return;
      }

      const normalizedRows = rows.slice(headerIndex);
      const headerRow = normalizedRows[0] || [];
      let hasMachineCol = headerRow.some((h) => String(h || "").toLowerCase().includes("machine"));

      let machineFromContext = machineHintFromFlattened || "";
      if (!machineFromContext) {
        for (let i = 0; i < headerIndex; i++) {
          const row = rows[i] || [];
          const hit = extractMachineHint(row);
          if (hit) {
            machineFromContext = hit;
            break;
          }
        }
      }

      let preparedRows = normalizedRows;
      if (!hasMachineCol && machineFromContext) {
        preparedRows = normalizedRows.map((row, idx) => {
          if (idx === 0) return ["Machine", ...row];
          if (!row.some((cell) => String(cell || "").trim() !== "")) return ["", ...row];
          return [machineFromContext, ...row];
        });
        hasMachineCol = true;
      }

      // Vul lege datum/week velden op met vorige waarde voor compacte plakblokken.
      if (preparedRows.length > 1) {
        const header = preparedRows[0].map((h) => String(h || "").toLowerCase().trim());
        const idxDate = header.indexOf("datum");
        const idxWeek = header.indexOf("week");
        const idxOrder = header.indexOf("order");
        let lastDate = "";
        let lastWeek = "";

        preparedRows = preparedRows.map((row, idx) => {
          if (idx === 0) return row;
          const next = [...row];
          if (idxDate !== -1) {
            const dateVal = String(next[idxDate] || "").trim();
            if (dateVal) lastDate = dateVal;
            else if (lastDate && String(next[idxOrder] || "").trim()) next[idxDate] = lastDate;
          }
          if (idxWeek !== -1) {
            const weekVal = String(next[idxWeek] || "").trim();
            if (weekVal) lastWeek = weekVal;
            else if (lastWeek && String(next[idxOrder] || "").trim()) next[idxWeek] = lastWeek;
          }
          return next;
        });
      }

      let parsedData: PlanningImportEntry[] = processRawLNDump(preparedRows as unknown[][]);
      if (!parsedData.length) {
        parsedData = processTabularPlanningRows(preparedRows as unknown[][]);
      }
      if (!parsedData.length) {
        alert(t("digitalplanning.planning_import.alerts.no_importable_orders", "Geen importeerbare orders gevonden in geplakte data."));
        return;
      }

      setRawWorkbook(null);
      setFileData(parsedData);
      setToDoOverrides({});
      addLog(
        t("digitalplanning.planning_import.logs.paste_rows_loaded", {
          count: parsedData.length,
          defaultValue: "{{count}} regels geladen uit plakdata.",
        }),
        "success"
      );
    } catch {
      addLog(t("digitalplanning.planning_import.logs.paste_processing_failed", "Fout bij verwerken van geplakte data."), "error");
      alert(t("digitalplanning.planning_import.alerts.paste_processing_failed", "Fout bij verwerken van geplakte data."));
    } finally {
      setLoading(false);
    }
  };

  const validOrders = useMemo(() => fileData.filter((d) => d.isValidForImport), [fileData]);

  const getComparableToDoQty = (order: PlanningImportEntry) => {
    const raw =
      order?.toDoQty ??
      order?.plan ??
      order?.quantity ??
      0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const effectiveValidOrders = useMemo(() => {
    return validOrders.map((order) => {
      const orderId = order.id;
      if (!orderId) return order;
      const overrideRaw = toDoOverrides[orderId];
      if (overrideRaw === undefined || overrideRaw === null || String(overrideRaw).trim() === "") {
        return order;
      }

      const parsed = Math.max(0, parseNum(overrideRaw));
      return {
        ...order,
        toDoQty: parsed,
      };
    });
  }, [validOrders, toDoOverrides]);

  const availableMachines = useMemo(() => {
    let machines = Array.from(new Set(effectiveValidOrders.map((d) => normalizeMachineCodeForFilter(d.machine)).filter(Boolean))).sort();
    if (isFittingsScoped) {
      machines = machines.filter((machine) => isFittingsMachine(machine));
    }
    return machines;
  }, [effectiveValidOrders, isFittingsScoped]);

  const getDefaultMachineSelection = (machines: string[]) => {
    const bh18Machines = machines.filter((machine) => {
      const normalized = normalizeMachineCodeForFilter(machine);
      return normalized === "BH18" || normalized === "40BH18";
    });

    if (bh18Machines.length > 0) return bh18Machines.sort();
    return [];
  };

  useEffect(() => {
    setSelectedMachines((prev) => {
      const filtered = prev.filter((machine) => availableMachines.includes(machine));
      if (filtered.length === 0) {
        const defaultSelection = getDefaultMachineSelection(availableMachines);
        if (defaultSelection.length > 0) return defaultSelection;
      }
      return filtered;
    });
  }, [availableMachines]);

  const isSpoolsMachine = (machineCode: unknown) => {
    const m = clean(machineCode).toUpperCase();
    const normalized = m.startsWith("40") ? m.slice(2) : m;
    return /^BB\d{2}$/.test(normalized) || /^BM\d{2}$/.test(normalized);
  };

  const getDepartmentGroupMachines = (groupName: string) => {
    if (groupName === "fittings") return availableMachines.filter((machine) => isFittingsMachine(machine));
    if (groupName === "pipes") return availableMachines.filter((machine) => isPipesMachine(machine));
    if (groupName === "spools") return availableMachines.filter((machine) => isSpoolsMachine(machine));
    return availableMachines;
  };

  const toggleMachineSelection = (machineCode: string) => {
    setSelectedMachines((prev) => {
      if (prev.includes(machineCode)) return prev.filter((m) => m !== machineCode);
      return [...prev, machineCode].sort();
    });
  };

  const selectMachines = (machines: string[]) => {
    const unique = Array.from(new Set(machines.map((m: string) => normalizeMachineCodeForFilter(m)))).filter((m): m is string => availableMachines.includes(m));
    setSelectedMachines(unique.sort());
  };

  const isAllowedBySelectedMachines = (order: PlanningImportEntry) => {
    if (!selectedMachines.length) return false;
    return selectedMachines.includes(normalizeMachineCodeForFilter(order.machine));
  };

  const getComparableQty = (order: PlanningImportEntry) => {
    const raw =
      order?.plan ??
      order?.quantity ??
      order?.toDoQty ??
      0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const getComparablePlannedHours = (order: PlanningImportEntry) => {
    if (!order || typeof order !== "object") return null;

    const fromReferenceOps = order?.referenceOperationTimes as Record<string, { plannedHours?: number; planned?: number }> | undefined;
    if (fromReferenceOps && typeof fromReferenceOps === "object" && Object.keys(fromReferenceOps).length > 0) {
      const total = Object.values(fromReferenceOps).reduce((sum: number, op) => {
        const value = Number(op?.plannedHours ?? op?.planned ?? 0);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);
      return Number.isFinite(total) ? total : null;
    }

    const splitCandidates = [order?.plannedHoursBH, order?.plannedHoursNabewerken, order?.plannedHoursBM01]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (splitCandidates.length > 0) {
      return splitCandidates.reduce((sum, value) => sum + value, 0);
    }

    const fromOperations = order?.operations as Record<string, { planned?: number; plannedHours?: number }> | undefined;
    if (fromOperations && typeof fromOperations === "object" && Object.keys(fromOperations).length > 0) {
      const total = Object.values(fromOperations).reduce((sum: number, op) => {
        const value = Number(op?.planned ?? op?.plannedHours ?? 0);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);
      return Number.isFinite(total) ? total : null;
    }

    return null;
  };

  const normalizePoText = (value: unknown) =>
    clean(value)
      .replace(/\s+/g, " ")
      .trim();

  const orderChangeMeta = useMemo(() => {
    const byId = new Map<string, any>();
    effectiveValidOrders.forEach((order: PlanningImportEntry) => {
      const existing = getExistingOrder(order);
      if (!existing) {
        byId.set(order.id, {
          isExisting: false,
          quantityChanged: false,
          todoChanged: false,
          readyChanged: false,
          notesChanged: false,
          hoursChanged: false,
          oldQuantity: null,
          newQuantity: getComparableQty(order),
          oldToDoQty: null,
          newToDoQty: getComparableToDoQty(order),
          oldReadyQty: null,
          newReadyQty: getComparableReadyQty(order),
          oldNotes: "",
          newNotes: clean(order.notes),
          oldPlannedHours: null,
          newPlannedHours: getComparablePlannedHours(order),
          hasSmartChange: false,
        });
        return;
      }

      const existingPlanRaw = Number(existing?.plan);
      const existingQuantityRaw = Number(existing?.quantity);
      const hasManualPlanOverride =
        Number.isFinite(existingPlanRaw) &&
        Number.isFinite(existingQuantityRaw) &&
        existingPlanRaw !== existingQuantityRaw;

      const oldQuantity = hasManualPlanOverride ? existingPlanRaw : getComparableQty(existing);
      const newQuantity = getComparableQty(order);
      const oldToDoQty = getComparableToDoQty(existing);
      const newToDoQty = getComparableToDoQty(order);
      const oldReadyQty = getComparableReadyQty(existing);
      const newReadyQty = getComparableReadyQty(order);
      const oldDeliveryDate = existing?.plannedDeliveryDate || existing?.deliveryDate || "";
      const newDeliveryDate = order?.plannedDeliveryDate || order?.deliveryDate || "";
      const oldNotes = normalizePoText(existing?.notes);
      const newNotes = normalizePoText(order?.notes);
      
      const quantityChanged = hasManualPlanOverride ? false : Math.abs(oldQuantity - newQuantity) > 0.001;
      const todoChanged = Math.abs(oldToDoQty - newToDoQty) > 0.001;
      const readyChanged = Math.abs(oldReadyQty - newReadyQty) > 0.001;

      // Verfijnde datumvergelijking op dag-niveau om format-verschillen (bijv. 27-03 vs 27-3) te negeren
      const parseForCompare = (d: unknown) => {
        if (!d) return "";
        const parsed = d instanceof Date ? d : new Date(String(d));
        if (isNaN(parsed.getTime())) {
          // Fallback voor d-m-yyyy tekst (LN her-import)
          const parts = clean(d).split(/[-/]/);
          if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            return `${year}-${month}-${day}`;
          }
          return clean(d);
        }
        return format(parsed, "yyyy-MM-dd");
      };

      const cleanOldDate = parseForCompare(oldDeliveryDate);
      const cleanNewDate = parseForCompare(newDeliveryDate);
      const deliveryDateChanged = cleanOldDate !== "" && cleanNewDate !== "" && cleanOldDate !== cleanNewDate;

      // We triggeren alleen op notesChanged als de nieuwe Excel note daadwerkelijk tekst bevat (en anders is).
      // Dit voorkomt dat een bestaande opmerking in FF wordt overschreven/getriggerd door een lege Excel cel.
      // We negeren kleine spatie-verschillen door te trimmen en dubbele spaties te mergen in normalizePoText.
      const notesChanged = newNotes !== "" && oldNotes.toLowerCase() !== newNotes.toLowerCase();
      const oldPlannedHours = getComparablePlannedHours(existing);
      const newPlannedHours = getComparablePlannedHours(order);
      const hoursChanged =
        newPlannedHours !== null &&
        (oldPlannedHours === null || Math.abs(oldPlannedHours - newPlannedHours) > 0.0001);

      const hasSmartChange = quantityChanged || notesChanged || deliveryDateChanged;

      byId.set(order.id, {
        isExisting: true,
        quantityChanged,
        todoChanged,
        readyChanged,
        deliveryDateChanged,
        notesChanged,
        hoursChanged,
        oldQuantity,
        newQuantity,
        oldToDoQty,
        newToDoQty,
        oldReadyQty,
        newReadyQty,
        oldDeliveryDate,
        newDeliveryDate,
        oldNotes,
        newNotes,
        oldPlannedHours,
        newPlannedHours,
        hasManualPlanOverride,
        // Ready LN vs FF is informatief; deze import schrijft produced/gereed niet terug.
        // We triggeren nu ook op quantity/todo wijzigingen zodat orders met gewijzigde aantallen verschijnen in de Smart Sync.
        hasSmartChange: hasSmartChange || todoChanged || quantityChanged,
      });
    });
    return byId;
  }, [effectiveValidOrders, existingOrderMap, toDoOverrides]);

  const displayData = useMemo(() => {
    let rows = [...effectiveValidOrders];

    if (isFittingsScoped) {
      rows = rows.filter((d) => isFittingsMachine(d.machine));
    } else if (machineGroupFilter === "fittings") {
      rows = rows.filter((d) => isFittingsMachine(d.machine));
    } else if (machineGroupFilter === "pipes") {
      rows = rows.filter((d) => isPipesMachine(d.machine));
    } else if (machineGroupFilter === "spools") {
      rows = rows.filter((d) => isSpoolsMachine(d.machine));
    }

    rows = rows.filter((d) => isAllowedBySelectedMachines(d));

    if (statusFilter === "new") {
      rows = rows.filter((d) => !isExistingOrder(d));
    } else if (statusFilter === "existing") {
      rows = rows.filter((d) => isExistingOrder(d));
    }

    if (readySyncFilter !== "all") {
      rows = rows.filter((d) => {
        const meta = orderChangeMeta.get(d.id);
        if (!meta?.isExisting) return false;
        const delta = Number(meta.newReadyQty || 0) - Number(meta.oldReadyQty || 0);
        if (readySyncFilter === "match") return delta === 0;
        if (readySyncFilter === "higher") return delta > 0;
        if (readySyncFilter === "lower") return delta < 0;
        if (readySyncFilter === "mismatch") return delta !== 0;
        return true;
      });
    }

    // In paste mode: alleen nieuwe orders tonen (geen bestaande updaten)
    if (pasteMode) {
      rows = rows.filter((d) => !isExistingOrder(d));
      rows.sort((a, b) => String(a.orderId || a.id).localeCompare(String(b.orderId || b.id)));
    } else if (importMode === "smart_update") {
      if (!hoursOnlyMode) {
        rows = rows.filter((d) => {
          // Hard-coded exclusion for specific problematic order
          if (clean(d?.orderId) === "N20024607") return false;
          
          if (isSmartSyncExcludedOrder(d)) return false;
          const meta = orderChangeMeta.get(d.id);
          return meta ? (!meta.isExisting || meta.hasSmartChange) : false;
        });

        rows.sort((a, b) => {
          const aMeta = orderChangeMeta.get(a.id);
          const bMeta = orderChangeMeta.get(b.id);
          const aEligible = aMeta ? (!aMeta.isExisting || aMeta.hasSmartChange) : false;
          const bEligible = bMeta ? (!bMeta.isExisting || bMeta.hasSmartChange) : false;
          if (Number(bEligible) !== Number(aEligible)) return Number(bEligible) - Number(aEligible);
          return String(a.orderId || a.id).localeCompare(String(b.orderId || b.id));
        });
      } else {
        // In uren-only modus tonen we alle gefilterde orders zodat ook oude orders uren kunnen krijgen.
        rows.sort((a, b) => String(a.orderId || a.id).localeCompare(String(b.orderId || b.id)));
      }
    }

    return rows;
  }, [effectiveValidOrders, machineGroupFilter, statusFilter, readySyncFilter, existingIds, selectedMachines, importMode, orderChangeMeta, isFittingsScoped, pasteMode, hoursOnlyMode]);

  const importCandidates = useMemo(() => {
    let rows;
    // In paste mode: strict new-only — geen overschrijven, geen updates van bestaande orders
    if (pasteMode) {
      rows = effectiveValidOrders.filter((d) => !isExistingOrder(d));
    } else if (importMode === "smart_update") {
      rows = effectiveValidOrders.filter((d) => {
        if (hoursOnlyMode) return true;
        if (isSmartSyncExcludedOrder(d)) return false;
        return !isExistingOrder(d) || orderChangeMeta.get(d.id)?.hasSmartChange;
      });
    } else {
      rows = effectiveValidOrders.filter((d) =>
        importMode === "overwrite" ||
        !isExistingOrder(d)
      );
    }
    rows = rows.filter((d) => isAllowedBySelectedMachines(d));
    if (isFittingsScoped) {
      rows = rows.filter((d) => isFittingsMachine(d.machine));
    }

    // Alleen geselecteerde orders meenemen in importCandidates
    // Zodat zij ook daadwerkelijk de enigen zijn die de database raken.
    return rows.filter((order: PlanningImportEntry) => selectedOrderIds.has(order.id));
  }, [effectiveValidOrders, importMode, existingIds, selectedMachines, orderChangeMeta, isFittingsScoped, pasteMode, SMART_SYNC_EXCLUDED_ORDER_IDS, hoursOnlyMode, selectedOrderIds]);

  useEffect(() => {
    // We willen de initiële selectie alleen doen als de data voor het eerst binnenkomt of modus wisselt.
    // Anders overschrijft deze useEffect de handmatige vinkjes van de gebruiker.
    setSelectedOrderIds((prev) => {
      // Als we al een selectie hebben en niet in overwrite modus zitten, behoud deze dan.
      if (prev.size > 0 && importMode !== "overwrite") return prev;

      let candidates;
      if (pasteMode) {
        candidates = effectiveValidOrders.filter((d) => !isExistingOrder(d));
      } else if (importMode === "smart_update") {
        candidates = effectiveValidOrders.filter((d) => {
          if (hoursOnlyMode) return true;
          if (isSmartSyncExcludedOrder(d)) return false;
          return !isExistingOrder(d) || orderChangeMeta.get(d.id)?.hasSmartChange;
        });
      } else {
        candidates = effectiveValidOrders;
      }
      
      const filtered = candidates.filter((d: PlanningImportEntry) => isAllowedBySelectedMachines(d));
      return new Set(filtered.map((d) => d.id));
    });
  }, [effectiveValidOrders.length, importMode, pasteMode, hoursOnlyMode]); // Trigger op verandering van data-lengte of modus

  const importableCount = useMemo(
    () => importCandidates.length,
    [importCandidates]
  );
  const deliveryBuckets = useMemo(() => {
    return displayData.reduce(
      (acc, order) => {
        const { weekDiff } = getDeliveryMeta(order);
        if (weekDiff === null) acc.unknown += 1;
        else if (weekDiff < 0) acc.overdue += 1;
        else if (weekDiff === 0) acc.current += 1;
        else acc.upcoming += 1;
        return acc;
      },
      { overdue: 0, current: 0, upcoming: 0, unknown: 0 }
    );
  }, [displayData]);

  const toggleOrderSelection = (id: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setVisibleSelection = (selected: boolean) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      displayData.forEach((order) => {
        if (selected) next.add(order.id);
        else next.delete(order.id);
      });
      return next;
    });
  };

  const startImport = async () => {
    setImporting(true);
    setImportProgressPct(0);
    setImportProgressLabel(t("digitalplanning.planning_import.progress_preparing", "Import voorbereiden..."));
    setImportEtaLabel("");
    try {
      const toImport = importCandidates;
      const importStartMs = Date.now();

      // Callable in chunks om payload-grootte stabiel te houden.
      const CHUNK = 250;
      const totalChunks = Math.max(1, Math.ceil(toImport.length / CHUNK));
      for (let i = 0; i < toImport.length; i += CHUNK) {
        const chunk = toImport.slice(i, i + CHUNK);
        const payloadOrders = chunk.map((item) => ({
          ...item,
          isExistingOrder: isExistingOrder(item),
          planningVisible: selectedOrderIds.has(item.id),
          importDate: new Date().toISOString(), // Zorgt ervoor dat nieuwe orders direct een importDate krijgen voor de "Nieuw" ribbon
        }));

        await importPlanningOrders({
          orders: payloadOrders,
          importMode,
          hoursOnlyMode,
        });

        const chunkNumber = Math.floor(i / CHUNK) + 1;
        const pct = Math.round((chunkNumber / totalChunks) * 100);
        setImportProgressPct(pct);
        setImportProgressLabel(
          t("digitalplanning.planning_import.progress_chunks", {
            current: chunkNumber,
            total: totalChunks,
            defaultValue: "Import bezig: chunk {{current}}/{{total}}",
          })
        );

        const elapsedMs = Date.now() - importStartMs;
        const avgChunkMs = elapsedMs / chunkNumber;
        const remainingChunks = Math.max(0, totalChunks - chunkNumber);
        const remainingMs = Math.max(0, Math.round(avgChunkMs * remainingChunks));
        const remainingSec = Math.ceil(remainingMs / 1000);
        const etaMin = Math.floor(remainingSec / 60);
        const etaSec = remainingSec % 60;
        setImportEtaLabel(
          remainingChunks > 0
            ? t("digitalplanning.planning_import.progress_eta", {
                min: etaMin,
                sec: etaSec,
                defaultValue: "Nog ~{{min}}m {{sec}}s",
              })
            : t("digitalplanning.planning_import.progress_finalizing", "Afronden...")
        );
      }

      const newCount = toImport.filter((item) => !isExistingOrder(item)).length;
      const updateCount = toImport.length - newCount;
      const logMsg = importMode === "smart_update"
        ? `${toImport.length} orders gesynchroniseerd (${newCount} nieuw, ${updateCount} bijgewerkt).`
        : `${toImport.length} orders geimporteerd.`;
      setImportProgressPct(100);
      setImportProgressLabel(t("digitalplanning.planning_import.progress_done", "Import voltooid"));
      setImportEtaLabel("");
      addLog(t("digitalplanning.planning_import.logs.import_success", "Import succesvol!"), "success");
      showSuccess(
        importMode === "smart_update"
          ? t("digitalplanning.planning_import.toasts.sync_success", {
              count: toImport.length,
              defaultValue: "Slimme import voltooid: {{count}} orders verwerkt.",
            })
          : t("digitalplanning.planning_import.toasts.import_success", {
              count: toImport.length,
              defaultValue: "Import voltooid: {{count}} orders verwerkt.",
            })
      );
      await logActivity(auth.currentUser?.uid || "system", "PLANNING_IMPORT", logMsg);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1000);
    } catch {
      addLog(t("digitalplanning.planning_import.logs.database_error", "Database fout."), "error");
      setImportProgressLabel(t("digitalplanning.planning_import.progress_failed", "Import mislukt"));
      setImportEtaLabel("");
      showError(t("digitalplanning.planning_import.toasts.import_failed", "Import mislukt. Controleer de logs en probeer opnieuw."));
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md">
      <div className="bg-white w-full max-w-[96vw] h-[96vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden border border-white/20 text-left relative">
        <div className="p-5 border-b flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-[1.1rem] text-white shadow-xl"><Database size={22} /></div>
            <div>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight italic leading-none">{t("digitalplanning.planning_import.title", "Planning Import")}</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{t('digitalplanning.planning_import.version_support', 'v4.7 • Extended Dossier Support')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-all"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 p-8 overflow-hidden bg-white custom-scrollbar">
            {fileData.length === 0 ? (
                <div className="h-full rounded-[4rem] border-2 border-slate-100 p-8 flex flex-col gap-6 bg-slate-50/40">
                  <div 
                    onClick={() => fileInputRef.current?.click()} 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`flex-1 border-4 border-dashed rounded-[3rem] flex flex-col items-center justify-center transition-all cursor-pointer group text-center min-h-[320px] ${
                      isDragging 
                        ? "border-blue-500 bg-blue-50/80 scale-[1.02]" 
                        : "border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 bg-white"
                    }`}
                  >
                    <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 transition-transform ${isDragging ? "bg-blue-600 text-white scale-110 shadow-xl" : "bg-blue-100 text-blue-600 group-hover:scale-110"}`}>
                      {loading ? <Loader2 className="animate-spin" size={50} /> : <Upload size={50} />}
                    </div>
                    <h3 className="text-2xl font-black text-slate-700 uppercase">{isDragging ? t("digitalplanning.planning_import.drop_to_import", "Laat los om te importeren") : t("digitalplanning.planning_import.select_ln_export", "Selecteer LN Export")}</h3>
                    <p className="text-slate-400 mt-2 font-medium italic">{t("digitalplanning.planning_import.drag_drop_support", "Sleep een bestand hierheen of klik om te bladeren")}</p>
                    <input type="file" ref={fileInputRef} onChange={handleFile} accept=".xlsx,.xlsm" className="hidden" />
                  </div>
                </div>
            ) : (
              <div className="h-full min-h-0 flex flex-col gap-8">
                <div className="bg-slate-900 p-4 rounded-[2.5rem] flex justify-between items-start shadow-2xl gap-4">
                   <div className="flex-1 min-w-0 text-white">
                      <div className="flex flex-wrap items-end gap-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-blue-400 uppercase ml-1 mb-1 tracking-widest">{t("digitalplanning.planning_import.department_group_label", "Afdelingsgroep")}</span>
                          <select value={machineGroupFilter} onChange={(e) => setMachineGroupFilter(e.target.value)} disabled={isFittingsScoped} className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 font-bold text-xs text-white outline-none focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed">
                            <option value="all" className="text-slate-800">{t("digitalplanning.planning_import.machine_group_all", "ALLES")}</option>
                            <option value="fittings" className="text-slate-800">{t("digitalplanning.planning_import.machine_group_fittings", "FITTINGS")}</option>
                            <option value="pipes" className="text-slate-800">{t("digitalplanning.planning_import.machine_group_pipes", "PIPES")}</option>
                            <option value="spools" className="text-slate-800">{t("digitalplanning.planning_import.machine_group_spools", "SPOOLS")}</option>
                          </select>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-blue-400 uppercase ml-1 mb-1 tracking-widest">{t("digitalplanning.planning_import.status_label", "Status")}</span>
                          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 font-bold text-xs text-white outline-none focus:border-blue-500">
                            <option value="all" className="text-slate-800">{t("digitalplanning.planning_import.status_all", "ALLES")}</option>
                            <option value="new" className="text-slate-800">{t("digitalplanning.planning_import.status_new", "NIEUW")}</option>
                            <option value="existing" className="text-slate-800">{t("digitalplanning.planning_import.status_existing", "BESTAAND")}</option>
                          </select>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-blue-400 uppercase ml-1 mb-1 tracking-widest">{t("digitalplanning.planning_import.ready_sync_label", "Wikkel LN vs FF")}</span>
                          <select value={readySyncFilter} onChange={(e) => setReadySyncFilter(e.target.value)} className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 font-bold text-xs text-white outline-none focus:border-blue-500">
                            <option value="all" className="text-slate-800">{t("digitalplanning.planning_import.ready_sync_all", "ALLES")}</option>
                            <option value="match" className="text-slate-800">{t("digitalplanning.planning_import.ready_sync_match", "GELIJK")}</option>
                            <option value="higher" className="text-slate-800">{t("digitalplanning.planning_import.ready_sync_higher", "LN > FF")}</option>
                            <option value="lower" className="text-slate-800">{t("digitalplanning.planning_import.ready_sync_lower", "LN < FF")}</option>
                            <option value="mismatch" className="text-slate-800">{t("digitalplanning.planning_import.ready_sync_mismatch", "VERSCHIL")}</option>
                          </select>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => selectMachines(availableMachines)}
                            className="px-2.5 py-1.5 bg-white/10 border border-white/20 text-white rounded-lg font-black uppercase text-[10px] tracking-widest hover:bg-white/20"
                          >
                            {t("digitalplanning.planning_import.select_all", "Alles selecteren")}
                          </button>
                          <button
                            onClick={() => selectMachines([])}
                            className="px-2.5 py-1.5 bg-white/10 border border-white/20 text-white rounded-lg font-black uppercase text-[10px] tracking-widest hover:bg-white/20"
                          >
                            {t("digitalplanning.planning_import.clear_selection", "Leegmaken")}
                          </button>
                          <button
                            onClick={() => setVisibleSelection(true)}
                            className="px-2.5 py-1.5 bg-white/10 border border-white/20 text-white rounded-lg font-black uppercase text-[10px] tracking-widest hover:bg-white/20"
                          >
                            {t("digitalplanning.planning_import.all_visible", "Alles zichtbaar")}
                          </button>
                          <button
                            onClick={() => setVisibleSelection(false)}
                            className="px-2.5 py-1.5 bg-white/10 border border-white/20 text-white rounded-lg font-black uppercase text-[10px] tracking-widest hover:bg-white/20"
                          >
                            {t("digitalplanning.planning_import.all_hidden", "Alles verborgen")}
                          </button>
                          <div className="border-l border-white/30 pl-2" />
                          <label className="flex items-center gap-2 px-2.5 py-1.5 bg-yellow-500/20 border border-yellow-500/40 rounded-lg cursor-pointer hover:bg-yellow-500/30 transition-all">
                            <input
                              type="checkbox"
                              checked={hoursOnlyMode}
                              onChange={(e) => setHoursOnlyMode(e.target.checked)}
                              className="w-3.5 h-3.5 rounded accent-yellow-500"
                            />
                            <span className="text-yellow-200 font-black uppercase text-[10px] tracking-widest">
                              📋 {t("digitalplanning.planning_import.hours_only_mode", "Alleen Uren")}
                            </span>
                          </label>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 max-h-16 overflow-y-auto pr-1">
                        {availableMachines.map((machineCode) => {
                          const selected = selectedMachines.includes(machineCode);
                          return (
                            <button
                              key={machineCode}
                              onClick={() => toggleMachineSelection(machineCode)}
                              className={`px-2.5 py-1 rounded-lg font-black uppercase text-[10px] tracking-widest border transition-all ${selected ? "bg-blue-500 text-white border-blue-500" : "bg-white/5 text-slate-200 border-white/20 hover:bg-white/15"}`}
                            >
                              {machineCode}
                            </button>
                          );
                        })}
                      </div>
                   </div>
                   <div className="text-right text-white shrink-0">
                       <p className="text-[10px] font-black opacity-40 uppercase tracking-widest">{t("digitalplanning.planning_import.found_orders", "Gevonden Orders")}</p>
                       <p className="text-3xl font-black tracking-tighter">{displayData.length}</p>
                       <p className="text-[10px] mt-1 text-emerald-200 font-black uppercase tracking-widest">{t("digitalplanning.planning_import.selected_machines_count", { count: selectedMachines.length, defaultValue: "Machines in import: {{count}}" })}</p>
                       <p className="text-[10px] mt-1 text-blue-200 font-black uppercase tracking-widest">{t("digitalplanning.planning_import.in_planning", { count: displayData.filter((order) => selectedOrderIds.has(order.id)).length, defaultValue: "In Planning: {{count}}" })}</p>
                       <div className="mt-2 flex flex-wrap justify-end gap-2">
                         <span className="px-2 py-1 rounded-lg bg-red-500/20 text-red-200 text-[10px] font-black uppercase tracking-widest">{t("digitalplanning.planning_import.bucket_overdue", { count: deliveryBuckets.overdue, defaultValue: "Achter: {{count}}" })}</span>
                         <span className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-200 text-[10px] font-black uppercase tracking-widest">{t("digitalplanning.planning_import.bucket_current", { count: deliveryBuckets.current, defaultValue: "Deze week: {{count}}" })}</span>
                         <span className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-200 text-[10px] font-black uppercase tracking-widest">{t("digitalplanning.planning_import.bucket_upcoming", { count: deliveryBuckets.upcoming, defaultValue: "Komend: {{count}}" })}</span>
                       </div>
                   </div>
                </div>

                <div className="border border-slate-100 rounded-[2.5rem] overflow-hidden bg-white shadow-sm flex-1 min-h-0 overflow-y-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-400 font-black uppercase tracking-wider border-b">
                      <tr>
                        <th className="px-4 py-3 sticky top-0 bg-slate-50">{t("digitalplanning.planning_import.table_order", "Order")}</th>
                        <th className="px-3 py-3 sticky top-0 bg-slate-50">{t("digitalplanning.planning_import.table_machine", "Machine")}</th>
                        <th className="px-3 py-3 sticky top-0 bg-slate-50">{t("digitalplanning.planning_import.table_product", "Product")}</th>
                        <th className="px-3 py-3 sticky top-0 bg-slate-50 text-center">{t("digitalplanning.planning_import.table_delivery_date", "Leverdatum")}</th>
                        <th className="px-2 py-3 sticky top-0 bg-slate-50 text-center">{t("digitalplanning.planning_import.table_status", "Status")}</th>
                        <th className="px-2 py-3 sticky top-0 bg-slate-50 text-center">{t("digitalplanning.planning_import.table_quantity", "Orderhoeveelheid")}</th>
                        <th className="px-2 py-3 sticky top-0 bg-slate-50 text-center">{t("digitalplanning.planning_import.table_todo_qty", "Te maken")}</th>
                        <th className="px-2 py-3 sticky top-0 bg-slate-50 text-center">{t("digitalplanning.planning_import.table_ready_qty", "Hoeveelheid gereed (LN/FF)")}</th>
                        <th className="px-2 py-3 sticky top-0 bg-slate-50 text-center w-[100px]">{t("digitalplanning.planning_import.table_extra_code", "ExtraCode")}</th>
                        <th className="px-2 py-3 sticky top-0 bg-slate-50">{t("digitalplanning.planning_import.table_po_text", "PO Text")}</th>
                        <th className="px-3 py-3 sticky top-0 bg-slate-50 text-center">{t("digitalplanning.planning_import.table_plan_hours", "Plan Uren")}</th>
                        <th className="px-3 py-3 sticky top-0 bg-slate-50 text-right pr-4">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-[10px]">{t("digitalplanning.planning_import.table_in_planning", "In Planning")}</span>
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded accent-blue-600 cursor-pointer border-slate-300"
                              checked={displayData.length > 0 && displayData.every(order => selectedOrderIds.has(order.id))}
                              onChange={(e) => setVisibleSelection(e.target.checked)}
                              title={t("digitalplanning.planning_import.toggle_all_visible", "Selecteer alle zichtbare orders")}
                            />
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {displayData.map((order) => {
                        const isExisting = isExistingOrder(order);
                        const changeMeta = orderChangeMeta.get(order.id);
                        const isQtyIncrease = changeMeta?.quantityChanged && Number(changeMeta.newQuantity) > Number(changeMeta.oldQuantity);
                        const isQtyDecrease = changeMeta?.quantityChanged && Number(changeMeta.newQuantity) < Number(changeMeta.oldQuantity);
                        const readyDelta = Number(changeMeta?.newReadyQty || 0) - Number(changeMeta?.oldReadyQty || 0);
                        const readyUp = changeMeta?.isExisting && readyDelta > 0;
                        const readyDown = changeMeta?.isExisting && readyDelta < 0;
                        const readyEqual = changeMeta?.isExisting && readyDelta === 0;
                        const isSmartUnchangedExisting =
                          importMode === "smart_update" &&
                          !hoursOnlyMode &&
                          isExisting &&
                          !changeMeta?.hasSmartChange;
                        const deliveryMeta = getDeliveryMeta(order);
                        const deliveryColor = getDeliveryColorClass(deliveryMeta.weekDiff);
                        return (
                          <tr key={order.id} className={`hover:bg-blue-50/30 transition-all ${!order.isValidForImport ? 'opacity-30 grayscale italic' : ''}`}>
                            <td className="px-4 py-1.5 font-black text-slate-900 whitespace-nowrap leading-tight">{order.orderId}</td>
                            <td className="px-3 py-1.5"><span className="bg-blue-100 text-blue-700 px-2 py-[2px] rounded-lg font-black text-[10px] uppercase leading-none">{order.machine}</span></td>
                            <td className="px-3 py-1.5 leading-tight">
                              <p className="font-bold text-slate-800 truncate max-w-[220px]">{order.itemDescription}</p>
                              <span className="text-[9px] text-slate-400 font-mono">{order.itemCode}</span>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <div className="flex flex-col items-center gap-0.5 leading-tight">
                                {importMode === "smart_update" && changeMeta?.isExisting && changeMeta?.deliveryDateChanged ? (
                                  <>
                                    <span 
                                      className="px-2 py-[2px] rounded-lg border text-[10px] font-black line-through text-slate-400 bg-slate-50 border-slate-200"
                                      title={t("digitalplanning.planning_import.old_delivery_date", "Oude leverdatum")}
                                    >
                                      {changeMeta.oldDeliveryDate ? format(new Date(changeMeta.oldDeliveryDate), "dd-MM") : "-"}
                                    </span>
                                    <span 
                                      className={`px-2 py-[2px] rounded-lg border text-[10px] font-black ${deliveryColor}`}
                                      title={t("digitalplanning.planning_import.new_delivery_date", "Nieuwe leverdatum")}
                                    >
                                      {deliveryMeta.dateLabel}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className={`px-2 py-[2px] rounded-lg border text-[10px] font-black ${deliveryColor}`}>{deliveryMeta.weekLabel}</span>
                                    <span className="text-[10px] font-bold text-slate-500">{deliveryMeta.dateLabel}</span>
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <span className="inline-block px-2 py-[2px] rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black uppercase max-w-[110px] truncate leading-none">{order.orderStatus || "-"}</span>
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {importMode === "smart_update" && changeMeta?.isExisting && changeMeta?.quantityChanged ? (
                                <div className="inline-flex items-center gap-1">
                                  <span className="text-[10px] font-black text-slate-400 line-through">{changeMeta.oldQuantity}</span>
                                  <span
                                    className={`text-[11px] font-black px-1.5 py-[1px] rounded border ${
                                      isQtyIncrease
                                        ? "text-emerald-700 bg-emerald-100 border-emerald-200"
                                        : isQtyDecrease
                                        ? "text-red-700 bg-red-100 border-red-200"
                                        : "text-slate-700 bg-slate-100 border-slate-200"
                                    }`}
                                  >
                                    {changeMeta.newQuantity}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] font-black text-slate-700">{Number(order.quantity || 0)}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={String(toDoOverrides[order.id] ?? Number(order.toDoQty ?? order.plan ?? order.quantity ?? 0))}
                                onChange={(e) => {
                                  const nextVal = e.target.value;
                                  setToDoOverrides((prev) => ({
                                    ...prev,
                                    [order.id]: nextVal,
                                  }));
                                }}
                                className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-[11px] font-black text-slate-700 outline-none focus:border-blue-500"
                                title={t("digitalplanning.planning_import.todo_edit_title", "Pas te maken aantal aan voor import")}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-center whitespace-nowrap">
                              {changeMeta?.isExisting ? (
                                <div className="inline-flex items-center gap-1 flex-col">
                                  <span 
                                    className="text-[10px] font-black text-slate-400 cursor-help"
                                    title={`Gemaakt: ${Number(getExistingOrder(order)?.produced || 0)}, Bij Eindinspectie: ${Number(getExistingOrder(order)?.atEindinspectieCount || 0)}`}
                                  >
                                    FF {Number(changeMeta.oldReadyQty || 0)}
                                  </span>
                                  <span className={`text-[10px] font-black px-1.5 py-[1px] rounded border ${
                                    readyUp
                                      ? "text-emerald-700 bg-emerald-100 border-emerald-200"
                                      : readyDown
                                      ? "text-red-700 bg-red-100 border-red-200"
                                      : readyEqual
                                      ? "text-slate-700 bg-slate-100 border-slate-200"
                                      : "text-blue-700 bg-blue-100 border-blue-200"
                                  }`}>
                                    LN {Number(changeMeta.newReadyQty || 0)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] font-black text-blue-700">LN {Number(order.produced || 0)}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center w-[100px]">
                              {order.extraCode ? (
                                <span className="inline-block max-w-[88px] truncate text-[10px] bg-amber-50 text-amber-700 px-1.5 py-[2px] rounded font-black border border-amber-100 leading-none">{order.extraCode}</span>
                              ) : (
                                <span className="text-[10px] text-slate-300 font-black">-</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 leading-tight">
                              {order.notes ? (
                                <span
                                  className={`inline-block max-w-[200px] truncate text-[10px] px-1.5 py-[2px] rounded font-black border leading-none ${
                                    importMode === "smart_update" && changeMeta?.isExisting && changeMeta?.notesChanged
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : "bg-indigo-50 text-indigo-700 border-indigo-100"
                                  }`}
                                  title={importMode === "smart_update" && changeMeta?.isExisting && changeMeta?.notesChanged ? `${t("digitalplanning.planning_import.was", "Was")}: ${changeMeta.oldNotes || "-"}` : undefined}
                                >
                                  {order.notes}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-300 font-black">-</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-center whitespace-nowrap">
                                <span className="text-sm font-black text-blue-600">{Number(order.totalPlannedHours).toFixed(1)}h</span>
                            </td>
                            <td className="px-3 py-1.5 text-right pr-4">
                              <label className={`inline-flex items-center gap-2 select-none ${isSmartUnchangedExisting ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                                <input
                                  type="checkbox"
                                  checked={selectedOrderIds.has(order.id)}
                                  disabled={isSmartUnchangedExisting}
                                  onChange={() => {
                                    if (isSmartUnchangedExisting) return;
                                    toggleOrderSelection(order.id);
                                  }}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                {isExisting ? (
                                  importMode === "smart_update" && changeMeta?.hasSmartChange
                                    ? <span className="text-emerald-600 font-black uppercase text-[10px]">{t("digitalplanning.planning_import.sync_label", "Sync")}</span>
                                    : importMode === "smart_update" && hoursOnlyMode
                                    ? <span className="text-emerald-600 font-black uppercase text-[10px]">{t("digitalplanning.planning_import.sync_label", "Sync")}</span>
                                    : importMode === "smart_update"
                                    ? <span className="text-slate-400 font-black uppercase text-[10px]">-</span>
                                    : <span className="text-amber-500 font-black uppercase text-[10px]">{t("digitalplanning.planning_import.update_label", "Update")}</span>
                                ) : (
                                  <span className="text-blue-500 font-black uppercase text-[10px]">{t("digitalplanning.planning_import.new_label", "Nieuw")}</span>
                                )}
                              </label>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

        </div>

        <div className="p-10 border-t bg-slate-50 flex justify-between items-center relative">
          <div className="flex gap-3 bg-white p-1.5 rounded-3xl border border-slate-200">
             <button onClick={() => setImportMode("smart_update")} className={`px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${importMode === "smart_update" ? "bg-emerald-600 text-white shadow-xl" : "text-slate-400 hover:bg-slate-50"}`}>{t("digitalplanning.planning_import.smart_update", "Slimme Sync")}</button>
             <button onClick={() => setImportMode("overwrite")} className={`px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${importMode === "overwrite" ? "bg-orange-600 text-white shadow-xl" : "text-slate-400 hover:bg-slate-50"}`}>{t("digitalplanning.planning_import.overwrite_all", "Overschrijf Alles")}</button>
          </div>
          <div className="flex gap-5">
            <button onClick={onClose} className="px-10 py-4 bg-white border-2 border-slate-200 text-slate-400 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-100 transition-all">{t("digitalplanning.planning_import.cancel", "Annuleren")}</button>
            <button onClick={startImport} disabled={importableCount === 0 || importing} className="px-12 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-sm tracking-widest shadow-2xl shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center gap-4 disabled:opacity-50 disabled:bg-slate-300 min-w-[280px]">
              {importing ? (
                <>
                  <Loader2 className="animate-spin" size={24} />
                  <span className="flex flex-col items-start leading-tight">
                    <span>{importProgressLabel || t("digitalplanning.planning_import.importing", "Bezig met importeren...")}</span>
                    {importEtaLabel && <span className="text-[10px] text-blue-200">{importEtaLabel}</span>}
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck size={24} />
                  {t("digitalplanning.planning_import.import_orders", { count: importableCount, defaultValue: "Importeer {{count}} Orders" })}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlanningImportModal;
