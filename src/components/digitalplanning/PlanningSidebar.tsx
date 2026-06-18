import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  ChevronRight,
  AlertCircle,
  Calendar,
  Sparkles,
  Factory,
  Filter,
  Archive,
  Download,
  Printer,
} from "lucide-react";
import StatusBadge from "./common/StatusBadge";
import { collection, query, getDocs, limit } from "firebase/firestore";
import { db } from "../../config/firebase";
import { getArchiveItemsPath } from "../../config/dbPaths";
import { endOfISOWeek, format, getISOWeek, isSameDay, isWithinInterval, startOfISOWeek, isValid } from "date-fns";
import { getEffectivePlanQty, getOrderFinishedUnits, getOrderIdentity, getTrackedRecordOrderId } from "../../utils/planningProgress";

type SidebarRecord = {
  id: string;
  orderId?: string;
  machine?: string;
  originMachine?: string;
  item?: string;
  itemDescription?: string;
  itemCode?: string;
  status?: string;
  currentStep?: string;
  currentStation?: string;
  lastStation?: string;
  lotNumber?: string;
  lotNumbers?: string[];
  lotNumbersText?: string;
  activeLot?: string;
  archivedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  completedAt?: Date | unknown;
  rejectDate?: unknown;
  timestamps?: {
    finished?: unknown;
    started?: unknown;
    station_start?: unknown;
    wikkelen_start?: unknown;
  };
  inspection?: { status?: string; timestamp?: unknown; reasons?: string[] };
  isArchivedOrder?: boolean;
  isTrackingDerivedOrder?: boolean;
  isCompletedInspectionEntry?: boolean;
  weekNumber?: number;
  weekYear?: number;
  [key: string]: any;
};

type PlanningSidebarProps = {
  orders?: SidebarRecord[];
  selectedOrderId?: string;
  onSelect: (order: SidebarRecord) => void;
  trackedProducts?: SidebarRecord[];
  archivedProducts?: SidebarRecord[];
  archivedHistoryProducts?: SidebarRecord[];
  enableRejectionScopes?: boolean;
};

const formatDateInputValue = (date: Date) => format(date, "yyyy-MM-dd");

const parseDateInputValue = (value: string) => {
  const parsed = new Date(`${String(value || "").trim()}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
};

const toEntryDate = (entry: SidebarRecord) => {
  const candidates = [
    entry?.completedAt,
    entry?.timestamps?.finished,
    entry?.rejectDate,
    entry?.archivedAt,
    entry?.updatedAt,
    entry?.createdAt,
  ];

  for (const value of candidates) {
    if (!value) continue;
    if (typeof (value as any)?.toDate === "function") {
      const converted = (value as any).toDate();
      if (Number.isFinite(converted?.getTime?.())) return converted;
    }

    if (value instanceof Date && Number.isFinite(value.getTime())) {
      return value;
    }

    const parsed = new Date(value as any);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }

  return null;
};

/**
 * PlanningSidebar - Nu met 'NIEUW' indicator voor recent toegevoegde orders.
 */
const PlanningSidebar = ({
  orders = [],
  selectedOrderId,
  onSelect,
  trackedProducts = [],
  archivedProducts = [],
  archivedHistoryProducts = [],
  enableRejectionScopes = false,
}: PlanningSidebarProps) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMachine, setSelectedMachine] = useState("ALL");
  const [sortMode, setSortMode] = useState("week_backlog");

  // NIEUW: Bepaal de meest recente importtijd om "onlangs toegevoegd" te kunnen filteren/resetten
  const latestImportTimestamp = useMemo(() => {
    let maxMs = 0;
    orders.forEach((o) => {
      const val = o.createdAt || o.importDate;
      if (!val) return;
      const ms = typeof val?.toMillis === 'function' ? val.toMillis() : new Date(val).getTime();
      if (Number.isFinite(ms) && ms > maxMs) {
        maxMs = ms;
      }
    });
    return maxMs;
  }, [orders]);

  const [prevLatestImport, setPrevLatestImport] = useState(latestImportTimestamp);

  useEffect(() => {
    if (latestImportTimestamp && prevLatestImport && latestImportTimestamp !== prevLatestImport) {
      setSortMode("week_backlog");
    }
    setPrevLatestImport(latestImportTimestamp);
  }, [latestImportTimestamp]);
  const [dataScope, setDataScope] = useState("active");
  const [rejectPeriod, setRejectPeriod] = useState("this_week");
  const [completedRangeMode, setCompletedRangeMode] = useState("day");
  const [completedDateValue, setCompletedDateValue] = useState(formatDateInputValue(new Date()));
  const [archivedOrders, setArchivedOrders] = useState<SidebarRecord[]>([]);
  const [loadingArchive, setLoadingArchive] = useState(false);

  const currentWeek = getISOWeek(new Date());
  const currentYear = new Date().getFullYear();
  const selectedCompletedDate = useMemo(() => parseDateInputValue(completedDateValue), [completedDateValue]);

  // Auto-enable history when searching for lot numbers
  useEffect(() => {
    const term = (searchTerm || "").toLowerCase().trim();
    // Check if search term looks like a lot number (6+ digits or contains only numbers)
    const isLotNumberSearch = /\d{6,}/.test(term) || (/^\d+$/.test(term) && term.length > 5);
    
    if (isLotNumberSearch && dataScope === "active") {
      // Switch to "all" (active + history) when searching for lot numbers
      setDataScope("all");
    } else if (!isLotNumberSearch && dataScope === "all") {
      // If search term is cleared or changed to non-lot search, keep current scope
      // Only switch back if it's truly a manual action (not automatic)
      // Keep it in "all" for now to avoid constant toggling
    }
  }, [searchTerm]);

  const isHistoryScope = dataScope === "history" || dataScope === "all";
  const isRejectScope = dataScope === "temp_reject" || dataScope === "definitive_reject";
  const isCompletedScope = dataScope === "completed_inspection";

  const getLotFromRecord = (record: SidebarRecord) => {
    const directLot = String(record?.lotNumber || record?.activeLot || "").trim();
    if (directLot) return directLot;

    const rawId = String(record?.id || "").trim();
    if (!rawId) return "";

    const lotFromId = rawId.match(/_(\d{6,})$/);
    return lotFromId ? lotFromId[1] : "";
  };

  const getOrderIdFromRecord = (record: SidebarRecord) => {
    return getTrackedRecordOrderId(record);
  };

  const getTrackedStatus = (product: SidebarRecord) => String(product?.status || "").trim().toLowerCase();
  const getTrackedStep = (product: SidebarRecord) => String(product?.currentStep || "").trim().toLowerCase();
  const isInactiveTrackedProduct = (product: SidebarRecord) => {
    const status = getTrackedStatus(product);
    const step = getTrackedStep(product);
    const inspectionStatus = String(product?.inspection?.status || "").trim().toLowerCase();

    return (
      ["finished", "completed", "gereed", "rejected", "afkeur", "archived_rejected"].includes(status) ||
      ["finished", "rejected"].includes(step) ||
      inspectionStatus === "afkeur"
    );
  };

  const getEntryPriority = (entry: SidebarRecord | undefined) => {
    if (!entry) return 0;
    if (entry?.isArchivedOrder) return 1;
    if (entry?.isTrackingDerivedOrder) return 2;
    return 3;
  };

  const mergeOrderEntries = (existing: SidebarRecord | undefined, incoming: SidebarRecord) => {
    if (!existing) return incoming;

    const existingLots = Array.isArray(existing?.lotNumbers) ? existing.lotNumbers : [];
    const incomingLots = Array.isArray(incoming?.lotNumbers) ? incoming.lotNumbers : [];
    const combinedLots = Array.from(
      new Set(
        [...existingLots, ...incomingLots]
          .map((lot) => String(lot || "").trim())
          .filter(Boolean)
      )
    );

    const existingPriority = getEntryPriority(existing);
    const incomingPriority = getEntryPriority(incoming);
    const base = incomingPriority >= existingPriority ? incoming : existing;
    const overlay = base === incoming ? existing : incoming;

    return {
      ...overlay,
      ...base,
      lotNumbers: combinedLots,
      lotNumbersText: combinedLots.join(" "),
      isArchivedOrder: !!existing?.isArchivedOrder && !!incoming?.isArchivedOrder,
      isTrackingDerivedOrder: base?.isTrackingDerivedOrder === true && getEntryPriority(base) === 2,
    };
  };

  const normalizeOrderStatus = (status: unknown) =>
    String(status || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");

  const normalizeStationFilter = (value: unknown) => {
    const raw = String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
    if (!raw) return "";
    if (raw === "STATION BM01") return "BM01";
    if (raw.includes("BM01") || raw.includes("INSPECTIE")) return "BM01";
    if (raw.includes("MAZAK")) return "MAZAK";
    if (raw.includes("NABEWERK")) return "NABEWERKEN";
    if (raw.includes("LOSSEN")) return "LOSSEN";
    if (raw.startsWith("40")) return raw.slice(2);
    return raw;
  };

  const getStationLabel = (value: unknown) => {
    const normalized = normalizeStationFilter(value);
    if (normalized === "NABEWERKEN") return "Nabewerken";
    if (normalized === "MAZAK") return "Mazak";
    if (normalized === "BM01") return "BM01";
    if (normalized === "LOSSEN") return "Lossen";
    return normalized || String(value || "").trim();
  };

  const isOpenOrRunningStatus = (status: unknown) => {
    const normalized = normalizeOrderStatus(status);
    // Geen status = toon altijd (import orders hebben soms geen status)
    if (!normalized) return true;
    return [
      "open",
      "planned",
      "planning",
      "waiting",
      "released",
      "release",
      "vrijgegeven",
      "gepland",
      "nieuw",
      "new",
      "pending",
      "todo",
      "to_do",
      "te_doen",
      "in_progress",
      "in_behandeling",
      "active",
      "processing",
      "running",
      "lopend",
      "ingepland",
      "gereed_voor_productie",
      "productie",
    ].includes(normalized);
  };

  // Haal archief data op wanneer history scope actief is of wanneer er gezocht wordt
  useEffect(() => {
    if ((isHistoryScope || !!searchTerm) && archivedOrders.length === 0) {
      setLoadingArchive(true);
      const fetchArchive = async () => {
        try {
          const baseYear = new Date().getFullYear();
          const years = [baseYear, baseYear - 1, baseYear - 2, baseYear - 3];

          const snapshots = await Promise.all(
            years.map((year) =>
              getDocs(
                query(
                  collection(db, getArchiveItemsPath(year).join("/")),
                  limit(800)
                )
              )
            )
          );

          const data = snapshots.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));

          // Dedupliceren op orderId en tegelijk lotnummers aggregeren
          const uniqueMap = new Map<string, SidebarRecord>();
          data.forEach((item: SidebarRecord) => {
            const parsedOrderIdFromId = String(item?.id || "").trim().replace(/_\d{6,}$/, "");
            const orderId = String(item?.orderId || parsedOrderIdFromId || "").trim();
            if (!orderId) return;

            const lot = getLotFromRecord(item);
            const finishedAt =
              (typeof (item?.timestamps?.finished as any)?.toMillis === "function" && (item?.timestamps?.finished as any).toMillis()) ||
              (item?.timestamps?.finished ? new Date(item.timestamps.finished as any).getTime() : 0) ||
              (typeof (item?.updatedAt as any)?.toMillis === "function" ? (item.updatedAt as any).toMillis() : new Date(item?.updatedAt as any || 0).getTime()) ||
              0;

            if (!uniqueMap.has(orderId)) {
              const lotNumbers = lot ? [lot] : [];
              uniqueMap.set(orderId, {
                ...item,
                id: orderId,
                orderId,
                machine: item.machine || item.originMachine || "Onbekend",
                status: "completed",
                lotNumbers,
                lotNumbersText: lotNumbers.join(" "),
                lastFinishedAt: finishedAt,
                isArchivedOrder: true,
              });
              return;
            }

            const existing = uniqueMap.get(orderId);
            if (!existing) return;
            const nextLots = lot ? Array.from(new Set([...(existing.lotNumbers || []), lot])) : (existing.lotNumbers || []);
            const keepCurrent = finishedAt <= (existing.lastFinishedAt || 0);
            const merged = {
              ...(keepCurrent ? existing : { ...existing, ...item }),
              id: orderId,
              orderId,
              machine: (keepCurrent ? existing.machine : (item.machine || item.originMachine || existing.machine || "Onbekend")),
              status: "completed",
              lotNumbers: nextLots,
              lotNumbersText: nextLots.join(" "),
              lastFinishedAt: Math.max(existing.lastFinishedAt || 0, finishedAt),
              isArchivedOrder: true,
            };
            uniqueMap.set(orderId, merged);
          });

          const mergedOrders = Array.from(uniqueMap.values())
            .sort((a, b) => (b.lastFinishedAt || 0) - (a.lastFinishedAt || 0));

          setArchivedOrders(mergedOrders);
        } catch (err) {
          console.error("Fout bij laden archief:", err);
        } finally {
          setLoadingArchive(false);
        }
      };
      fetchArchive();
    }
  }, [isHistoryScope, archivedOrders.length, searchTerm]);

  const trackingDerivedOrders = useMemo(() => {
    const byOrder = new Map<string, SidebarRecord>();

    trackedProducts.forEach((product: SidebarRecord) => {
      if (isInactiveTrackedProduct(product)) return;

      const orderId = getOrderIdFromRecord(product);
      if (!orderId) return;

      const lot = getLotFromRecord(product);
      const current = byOrder.get(orderId);
      const nextLots = Array.from(
        new Set([...(current?.lotNumbers || []), ...(lot ? [lot] : [])].filter(Boolean))
      );

      byOrder.set(orderId, {
        ...current,
        id: orderId,
        orderId,
        machine:
          product?.currentStation ||
          product?.currentStep ||
          product?.originMachine ||
          product?.machine ||
          current?.machine ||
          "Onbekend",
        item:
          current?.item ||
          product?.item ||
          product?.itemDescription ||
          product?.itemCode ||
          "Onbekend product",
        itemDescription: current?.itemDescription || product?.itemDescription || product?.item || "",
        itemCode: current?.itemCode || product?.itemCode || "",
        status: current?.status || product?.status || "in_progress",
        currentStation: product?.currentStation || current?.currentStation || "",
        lotNumbers: nextLots,
        lotNumbersText: nextLots.join(" "),
        isTrackingDerivedOrder: true,
      });
    });

    return Array.from(byOrder.values());
  }, [trackedProducts]);

  const completedInspectionEntries = useMemo(() => {
    const combinedProducts = [...trackedProducts, ...archivedProducts, ...archivedHistoryProducts];
    const uniqueEntries = new Map<string, SidebarRecord>();

    combinedProducts.forEach((product: SidebarRecord) => {
      const completedAt = toEntryDate(product);
      if (!completedAt) return;

      const lastStation = normalizeStationFilter(product?.lastStation || "");
      const status = String(product?.status || "").trim().toLowerCase();
      const step = String(product?.currentStep || "").trim().toUpperCase();
      const isInspectionCompleted =
        lastStation === "BM01" &&
        (status === "completed" || step === "FINISHED" || normalizeStationFilter(product?.currentStation || "") === "GEREED");

      if (!isInspectionCompleted) return;

      const inRange = completedRangeMode === "day"
        ? isSameDay(completedAt, selectedCompletedDate)
        : isWithinInterval(completedAt, {
            start: startOfISOWeek(selectedCompletedDate),
            end: endOfISOWeek(selectedCompletedDate),
          });

      if (!inRange) return;

      const orderId = getOrderIdFromRecord(product);
      const lotNumber = getLotFromRecord(product) || String(product?.id || "").trim();
      const dedupeKey = `${orderId}__${lotNumber}__${completedAt.getTime()}`;
      if (uniqueEntries.has(dedupeKey)) return;

      uniqueEntries.set(dedupeKey, {
        ...product,
        id: dedupeKey,
        orderId,
        lotNumber,
        lotNumbersText: lotNumber,
        item: product?.item || product?.itemDescription || product?.itemCode || "Onbekend product",
        itemDescription: product?.itemDescription || product?.item || "",
        itemCode: product?.itemCode || "",
        machine: product?.originMachine || product?.machine || product?.lastStation || "Onbekend",
        originMachine: product?.originMachine || product?.machine || "",
        lastStation: product?.lastStation || "BM01",
        currentStation: product?.currentStation || "GEREED",
        status: "Gereed gemeld",
        completedAt,
        completedDateMs: completedAt.getTime(),
        weekNumber: getISOWeek(completedAt),
        weekYear: completedAt.getFullYear(),
        isCompletedInspectionEntry: true,
      });
    });

    return Array.from(uniqueEntries.values()).sort((a, b) => (b.completedDateMs || 0) - (a.completedDateMs || 0));
  }, [trackedProducts, archivedProducts, archivedHistoryProducts, completedRangeMode, selectedCompletedDate]);

  // Bepaal de bron data: Actief, History of beide
  const sourceData = useMemo(() => {
    if (dataScope === "completed_inspection") return completedInspectionEntries;

    if (dataScope === "temp_reject" || dataScope === "definitive_reject") {
      return trackedProducts
        .filter((p) => {
          const status = String(p?.status || "").toLowerCase().trim();
          const step = String(p?.currentStep || "").toUpperCase().trim();
          const inspectionStatus = String(p?.inspection?.status || "").toLowerCase().trim();

          if (dataScope === "temp_reject") {
            return inspectionStatus === "tijdelijke afkeur" || status === "temp_rejected" || status === "held_qc" || step === "HOLD_AREA";
          }

          return status === "rejected" || step === "REJECTED" || inspectionStatus === "afkeur";
        })
        .map((p) => {
          const rejectDateRaw =
            p?.inspection?.timestamp ||
            p?.updatedAt ||
            p?.createdAt ||
            p?.startTime ||
            null;
          const rejectDate =
            typeof (rejectDateRaw as any)?.toDate === "function"
              ? (rejectDateRaw as any).toDate()
              : new Date((rejectDateRaw as any) || Date.now());

          const weekNumber = Number.isFinite(getISOWeek(rejectDate)) ? getISOWeek(rejectDate) : currentWeek;
          const weekYear = Number.isFinite(rejectDate.getFullYear()) ? rejectDate.getFullYear() : currentYear;

          return {
            ...p,
            id: p.id || p.lotNumber || `${p.orderId || "-"}_${p.currentStation || "-"}_${Math.random().toString(36).slice(2)}`,
            orderId: String(p.orderId || "").trim(),
            machine: p.originMachine || p.currentStation || "Onbekend",
            item: p.item || p.itemDescription || p.itemCode || "Onbekend product",
            lotNumbersText: p.lotNumber || "",
            rejectDate,
            rejectDateMs: rejectDate.getTime(),
            weekNumber,
            weekYear,
            isRejectEntry: true,
            rejectKind: dataScope,
            status: dataScope === "temp_reject" ? "Tijdelijke afkeur" : "rejected",
          };
        });
    }

    if (dataScope === "history") return archivedOrders;
    if (dataScope === "all") {
      const byOrder = new Map();
      archivedOrders.forEach((o) => {
        const key = String(o?.orderId || o?.id || "").trim();
        if (!key) return;
        const current = byOrder.get(key);
        byOrder.set(key, mergeOrderEntries(current, o));
      });
      trackingDerivedOrders.forEach((o) => {
        const key = String(o?.orderId || o?.id || "").trim();
        if (!key) return;
        const current = byOrder.get(key);
        byOrder.set(key, mergeOrderEntries(current, o));
      });
      orders.forEach((o) => {
        const key = String(o?.orderId || o?.id || "").trim();
        if (!key) return;
        const current = byOrder.get(key);
        byOrder.set(key, mergeOrderEntries(current, o));
      });
      return Array.from(byOrder.values());
    }

    const byOrder = new Map();
    trackingDerivedOrders.forEach((o) => {
      const key = String(o?.orderId || o?.id || "").trim();
      if (!key) return;
      byOrder.set(key, mergeOrderEntries(byOrder.get(key), o));
    });
    orders.forEach((o) => {
      const key = String(o?.orderId || o?.id || "").trim();
      if (!key) return;
      byOrder.set(key, mergeOrderEntries(byOrder.get(key), o));
    });
    return Array.from(byOrder.values());
  }, [dataScope, orders, archivedOrders, trackingDerivedOrders, trackedProducts, currentWeek, currentYear, completedInspectionEntries]);

  // Helper om te bepalen of een order nieuw is (< 48 uur na aanmaak/import)
  const isOrderNew = (order: SidebarRecord) => {
    const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
    const val = order.createdAt || order.importDate;
    if (!val) return false;
    const ms = typeof val?.toMillis === 'function' ? val.toMillis() : new Date(val).getTime();
    return Number.isFinite(ms) && ms > fortyEightHoursAgo;
  };

  // Helper om te bepalen of een order tot de meest recente import behoort (binnen 5 minuten van de nieuwste order in de lijst)
  const isOrderRecentlyAdded = (order: SidebarRecord) => {
    if (!latestImportTimestamp) return false;
    const val = order.createdAt || order.importDate;
    if (!val) return false;
    const ms = typeof val?.toMillis === 'function' ? val.toMillis() : new Date(val).getTime();
    return Number.isFinite(ms) && (latestImportTimestamp - ms) < 5 * 60 * 1000;
  };

  const orderStationMap = useMemo(() => {
    const byOrder = new Map<string, Set<string>>();

    // Include both active and archived products
    const allProducts = [...trackedProducts, ...archivedProducts, ...archivedHistoryProducts];

    allProducts.forEach((product) => {
      const orderKey = getOrderIdFromRecord(product);
      if (!orderKey) return;

      const set = byOrder.get(orderKey) || new Set<string>();
      const candidates = [
        product?.currentStation,
        product?.currentStep,
        product?.lastStation,
        product?.originMachine,
        product?.machine,
      ];

      candidates.forEach((candidate: unknown) => {
        const normalized = normalizeStationFilter(candidate);
        if (normalized) set.add(normalized);
      });

      byOrder.set(orderKey, set);
    });

    return byOrder;
  }, [trackedProducts, archivedProducts, archivedHistoryProducts]);

  // Lot-nummers per orderId ophalen vanuit trackedProducts en archivedProducts
  const orderLotMap = useMemo(() => {
    const byOrder = new Map<string, Set<string>>();
    const allProducts = [...trackedProducts, ...archivedProducts, ...archivedHistoryProducts];
    allProducts.forEach((product) => {
      const orderKey = getOrderIdFromRecord(product);
      if (!orderKey) return;
      const lot = getLotFromRecord(product) || String(product?.id || "").trim();
      if (!lot) return;
      const set = byOrder.get(orderKey) || new Set<string>();
      set.add(lot.toLowerCase());
      byOrder.set(orderKey, set);
    });
    return byOrder;
  }, [trackedProducts, archivedProducts, archivedHistoryProducts]);

  // Unieke machines ophalen voor filter
  const machines = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();
    options.set("ALL", { value: "ALL", label: "Alle Machines / Stations" });
    const downstreamStations = new Set(["BM01", "MAZAK", "NABEWERKEN", "LOSSEN"]);

    sourceData.forEach((order) => {
      const machineValue = normalizeStationFilter(order?.machine);
      if (machineValue && !options.has(machineValue)) {
        options.set(machineValue, { value: machineValue, label: getStationLabel(machineValue) });
      }

      const orderKey = String(order?.orderId || order?.id || "").trim();
      if (!orderKey) return;
      const relatedStations = orderStationMap.get(orderKey);
      if (!relatedStations) return;
      relatedStations.forEach((stationValue: string) => {
        if (!stationValue || !downstreamStations.has(stationValue)) return;
        if (!options.has(stationValue)) {
          options.set(stationValue, { value: stationValue, label: getStationLabel(stationValue) });
        }
      });
    });

    // Ook downstream stations tonen die alleen in tracking voorkomen
    // (bijv. wanneer de gekoppelde order niet meer in de actieve sourceData zit).
    orderStationMap.forEach((stationSet) => {
      stationSet.forEach((stationValue: string) => {
        if (!stationValue || !downstreamStations.has(stationValue)) return;
        if (!options.has(stationValue)) {
          options.set(stationValue, { value: stationValue, label: getStationLabel(stationValue) });
        }
      });
    });

    return Array.from(options.values()).sort((a, b) => {
      if (a.value === "ALL") return -1;
      if (b.value === "ALL") return 1;
      return a.label.localeCompare(b.label);
    });
  }, [sourceData, orderStationMap]);

  const scopeOptions = [
    { value: "active", label: "Actief" },
    { value: "history", label: "History" },
    { value: "all", label: "Actief + History" },
    { value: "completed_inspection", label: "Gereedlijst Eindinspectie" },
    ...(enableRejectionScopes
      ? [
          { value: "temp_reject", label: "Tijdelijke Afkeur" },
          { value: "definitive_reject", label: "Definitieve Afkeur" },
        ]
      : []),
  ];

  // ── Helpers voor gereed-berekening (moeten vóór filteredOrders staan) ──────
  const getNumeric = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const normalizeOrderKey = (value: unknown) => String(value || "").trim().toUpperCase();

  const trackedFinishedByOrder = useMemo(() => {
    const lotsByOrder = new Map();
    const allTrackedRecords = [...trackedProducts, ...archivedProducts, ...archivedHistoryProducts];

    allTrackedRecords.forEach((product) => {
      if (product?.isVirtualLot) return;

      const orderId = normalizeOrderKey(getOrderIdFromRecord(product));
      if (!orderId) return;

      // Definitief afgekeurde of verwijderde lots tellen niet mee.
      const status = String(product?.status || "").toLowerCase();
      const step = String(product?.currentStep || "").toLowerCase();
      const isDefinitivelyRemoved =
        status === "deleted" ||
        status === "archived_rejected" ||
        step === "rejected" ||
        status === "rejected";
      if (isDefinitivelyRemoved) return;

      const lotNumber = String(getLotFromRecord(product) || product?.id || "").trim();
      if (!lotNumber) return;

      const existingLots = lotsByOrder.get(orderId) || new Set();
      existingLots.add(lotNumber);
      lotsByOrder.set(orderId, existingLots);
    });

    const countMap = new Map();
    lotsByOrder.forEach((lotSet, orderId) => {
      countMap.set(orderId, lotSet.size);
    });

    return countMap;
  }, [trackedProducts, archivedProducts, archivedHistoryProducts]);

  const virtualLotsByOrder = useMemo(() => {
    const map = new Map();
    const allTrackedRecords = [...trackedProducts, ...archivedProducts, ...archivedHistoryProducts];

    allTrackedRecords.forEach((product) => {
      if (!product?.isVirtualLot) return;

      const orderId = normalizeOrderKey(getOrderIdFromRecord(product));
      if (!orderId) return;

      const lotNumber = String(getLotFromRecord(product) || product?.id || "").trim();
      if (!lotNumber) return;

      const set = map.get(orderId) || new Set();
      set.add(lotNumber);
      map.set(orderId, set);
    });

    return map;
  }, [trackedProducts, archivedProducts, archivedHistoryProducts]);

  const activeTrackedByOrder = useMemo(() => {
    const countMap = new Map();

    trackedProducts.forEach((product) => {
      if (product?.isVirtualLot) return;
      const orderId = normalizeOrderKey(getOrderIdFromRecord(product));
      if (!orderId) return;

      const status = String(product?.status || "").toLowerCase();
      const step = String(product?.currentStep || "").toLowerCase();
      const isFinished =
        status.includes("finish") ||
        status.includes("gereed") ||
        status.includes("completed") ||
        step.includes("finish") ||
        step.includes("reject") ||
        status.includes("reject");

      if (isFinished) return;
      countMap.set(orderId, (countMap.get(orderId) || 0) + 1);
    });

    return countMap;
  }, [trackedProducts]);

  const getFinishedUnitsForOrder = (order: SidebarRecord) => {
    const baseFinished = getOrderFinishedUnits(order);
    const orderKey = normalizeOrderKey(getOrderIdentity(order));
    const trackedFinished = getNumeric(trackedFinishedByOrder.get(orderKey));
    return Math.max(baseFinished, trackedFinished);
  };
  // ─────────────────────────────────────────────────────────────────────────

  const filteredOrders = useMemo(() => {
    const getPriorityLevel = (order: SidebarRecord) => {
      const rawPriority = order?.priority;
      const normalizedPriority =
        rawPriority === true
          ? "high"
          : String(rawPriority || "").toLowerCase().trim();

      if (normalizedPriority === "immediate") return "immediate";
      if (normalizedPriority === "urgent") return "urgent";
      if (normalizedPriority === "high") return "high";
      if (order?.isMoved) return "high";
      if (order?.isUrgent) return "urgent";
      return "normal";
    };

    const getPriorityRank = (order: SidebarRecord) => {
      const level = getPriorityLevel(order);
      if (level === "immediate") return 3;
      if (level === "urgent") return 2;
      if (level === "high") return 1;
      return 0;
    };

    const getOrderDateMs = (order: SidebarRecord) => {
      const candidates = [
        order?.completedAt,
        order?.timestamps?.finished,
        order?.plannedDate,
        order?.deliveryDate,
        order?.dueDate,
        order?.date,
        order?.createdAt,
        order?.updatedAt,
      ];

      for (const value of candidates) {
        if (!value) continue;
        if (typeof (value as any)?.toMillis === "function") {
          const ms = (value as any).toMillis();
          if (Number.isFinite(ms)) return ms;
        }
        if (value instanceof Date) {
          const ms = value.getTime();
          if (Number.isFinite(ms)) return ms;
        }
        const ms = new Date(value as any).getTime();
        if (Number.isFinite(ms)) return ms;
      }

      return Number.MAX_SAFE_INTEGER;
    };

    const isInProgress = (order: SidebarRecord) => {
      const status = String(order?.status || "").toLowerCase().trim();
      return ["in_progress", "in progress", "in-behandeling", "in behandeling", "active", "processing"].includes(status);
    };

    let result = sourceData;

    // 1. Machine Filter
    if (selectedMachine !== "ALL") {
      result = result.filter((o) => {
        const machineMatch = normalizeStationFilter(o.machine) === selectedMachine;
        if (machineMatch) return true;

        const orderKey = String(o?.orderId || o?.id || "").trim();
        if (!orderKey) return false;
        const relatedStations = orderStationMap.get(orderKey);
        return relatedStations ? relatedStations.has(selectedMachine) : false;
      });
    }

    // 2. Status Filter (actieve lijst: alleen Open/Lopend)
    // Orders met effectief-Gereed status (produced >= plan && geen actieve lots) worden
    // ook uitgefilterd, ook al staat de DB-status nog op 'planned'/'in_progress'.
    if (dataScope === "active") {
      result = result.filter((o) => {
        const plannedAmt = Math.max(0, getEffectivePlanQty(o));
        const finishedAmt = getFinishedUnitsForOrder(o);
        const activeAmt = getNumeric(activeTrackedByOrder.get(normalizeOrderKey(getOrderIdentity(o))));

          if (!isOpenOrRunningStatus(o?.status)) {
              // Een gesloten order hoort niet in de actieve lijst, tenzij er nog producten fysiek in behandeling zijn
              return activeAmt > 0;
          }

        if (plannedAmt > 0) {
          if (finishedAmt >= plannedAmt && activeAmt === 0) return false;
        }
        return true;
      });
    }

    if (isRejectScope) {
      const now = new Date();
      const thisWeek = getISOWeek(now);
      const thisYear = now.getFullYear();
      const thisMonth = now.getMonth();
      const previousWeekDate = new Date(now);
      previousWeekDate.setDate(previousWeekDate.getDate() - 7);
      const previousWeek = getISOWeek(previousWeekDate);
      const previousWeekYear = previousWeekDate.getFullYear();

      result = result.filter((entry: SidebarRecord) => {
        const entryWeek = Number(entry.weekNumber || entry.week || 0);
        const entryYear = Number(entry.weekYear || entry.year || thisYear);
        const entryDateRaw =
          entry?.rejectDate ||
          entry?.inspection?.timestamp ||
          entry?.updatedAt ||
          entry?.createdAt ||
          null;
        const entryDate =
          typeof (entryDateRaw as any)?.toDate === "function"
            ? (entryDateRaw as any).toDate()
            : new Date((entryDateRaw as any) || 0);
        if (rejectPeriod === "this_week") return entryWeek === thisWeek && entryYear === thisYear;
        if (rejectPeriod === "previous_week") return entryWeek === previousWeek && entryYear === previousWeekYear;
        if (rejectPeriod === "this_month") {
          return Number.isFinite(entryDate.getTime()) && entryDate.getFullYear() === thisYear && entryDate.getMonth() === thisMonth;
        }
        if (rejectPeriod === "this_year") return entryYear === thisYear;
        return true;
      });
    }

    // 3. Zoeken
    const term = (searchTerm || "").toLowerCase().trim();
    if (term) {
      const terms = term.split(/\s+/).filter(Boolean);
      result = result.filter((order: SidebarRecord) => {
      const searchableFields = [
        order?.orderId,
        order?.item,
        order?.itemDescription,
        order?.itemCode,
        order?.originMachine,
        order?.lastStation,
        order?.currentStation,
        order?.productId,
        order?.project,
        order?.projectDesc,
        order?.machine,
        order?.code,
        order?.extraCode,
        order?.lot,
        order?.activeLot,
        order?.lotNumber,
        order?.lotNumbersText,
        order?.diameter,
        order?.diameterCode,
        order?.drawing,
        order?.notes,
        order?.orderStatus,
        order?.customer,
        order?.week,
        order?.weekNumber,
        order?.plan,
        order?.completedAt ? format(toEntryDate(order) || new Date(), "yyyy-MM-dd") : "",
        isOrderNew(order) ? "nieuw" : "",
        isOrderNew(order) ? "new" : "",
        isOrderNew(order) ? "last48h" : "",
        isOrderNew(order) ? "laatste48u" : "",
        isOrderRecentlyAdded(order) ? "onlangs" : "",
        isOrderRecentlyAdded(order) ? "recent" : "",
        isOrderRecentlyAdded(order) ? "recent toegevoegd" : "",
      ]
        .filter((v) => v !== null && v !== undefined)
        .map((v) => String(v).toLowerCase());

      // Voeg lotnummers toe vanuit tracked/archived products
      const orderKey = String(order?.orderId || order?.id || "").trim();
      const trackedLots = orderLotMap.get(orderKey);
      if (trackedLots) {
        trackedLots.forEach((lot: string) => searchableFields.push(lot));
      }

      return terms.every((part) =>
        searchableFields.some((value) => value.includes(part))
      );
    });

      // Als scope 'active' is, voeg ook archiefmatches toe op basis van zoekterm
      if (dataScope === "active" && archivedOrders.length > 0) {
        const existingIds = new Set(result.map((o) => String(o?.orderId || o?.id || "").trim()));
        const archiveMatches = archivedOrders.filter((order: SidebarRecord) => {
          const key = String(order?.orderId || order?.id || "").trim();
          if (existingIds.has(key)) return false;
          const fields = [
            order?.orderId,
            order?.item,
            order?.itemDescription,
            order?.itemCode,
            order?.machine,
            order?.lotNumber,
            order?.lotNumbersText,
          ]
            .filter(Boolean)
            .map((v) => String(v).toLowerCase());
          return terms.every((part) => fields.some((v) => v.includes(part)));
        });
        result = [...result, ...archiveMatches];
      }
    }

    // 4. Sorteren (standaard): Huidige/Toekomstige weken eerst, daarna Backlog (Oude weken)
    return result.sort((a, b) => {
      if (isCompletedScope) {
        const dateA = getOrderDateMs(a);
        const dateB = getOrderDateMs(b);
        if (dateA !== dateB) return dateB - dateA;
        return (a.orderId || "").localeCompare(b.orderId || "");
      }

      const priorityRankA = getPriorityRank(a);
      const priorityRankB = getPriorityRank(b);
      if (priorityRankA !== priorityRankB) return priorityRankB - priorityRankA;

      if (sortMode === "recently_added") {
        const isNewA = isOrderRecentlyAdded(a);
        const isNewB = isOrderRecentlyAdded(b);
        if (isNewA && !isNewB) return -1;
        if (!isNewA && isNewB) return 1;

        if (isNewA) {
          const valA = a.createdAt || a.importDate;
          const valB = b.createdAt || b.importDate;
          const msA = typeof valA?.toMillis === 'function' ? valA.toMillis() : new Date(valA || 0).getTime();
          const msB = typeof valB?.toMillis === 'function' ? valB.toMillis() : new Date(valB || 0).getTime();
          if (msA !== msB) return msB - msA;
        }

        const weekA = Number(a.weekNumber || a.week || 999);
        const yearA = Number(a.weekYear || a.year || currentYear);
        const weekB = Number(b.weekNumber || b.week || 999);
        const yearB = Number(b.weekYear || b.year || currentYear);
        
        const absWeekA = yearA * 52 + weekA;
        const absWeekB = yearB * 52 + weekB;
        const absCurrent = currentYear * 52 + currentWeek;
        
        const isBacklogA = absWeekA < absCurrent;
        const isBacklogB = absWeekB < absCurrent;
        
        if (isBacklogA && !isBacklogB) return 1;
        if (!isBacklogA && isBacklogB) return -1;
        
        if (absWeekA !== absWeekB) return absWeekA - absWeekB;
        
        return (a.orderId || "").localeCompare(b.orderId || "");
      }

      if (sortMode === "in_progress_first") {
        const inProgressA = isInProgress(a);
        const inProgressB = isInProgress(b);
        if (inProgressA && !inProgressB) return -1;
        if (!inProgressA && inProgressB) return 1;

        const dateA = getOrderDateMs(a);
        const dateB = getOrderDateMs(b);
        if (dateA !== dateB) return dateA - dateB;

        return (a.orderId || "").localeCompare(b.orderId || "");
      }

      if (sortMode === "date_asc" || sortMode === "date_desc" || isRejectScope) {
        const dateA = getOrderDateMs(a);
        const dateB = getOrderDateMs(b);
        if (dateA !== dateB) {
          if (isRejectScope) return dateB - dateA;
          return sortMode === "date_asc" ? dateA - dateB : dateB - dateA;
        }

        return (a.orderId || "").localeCompare(b.orderId || "");
      }

      const weekA = Number(a.weekNumber || a.week || 999);
      const yearA = Number(a.weekYear || a.year || currentYear);
      const weekB = Number(b.weekNumber || b.week || 999);
      const yearB = Number(b.weekYear || b.year || currentYear);
      
      // Absolute weekwaarde voor vergelijking
      const absWeekA = yearA * 52 + weekA;
      const absWeekB = yearB * 52 + weekB;
      const absCurrent = currentYear * 52 + currentWeek;
      
      const isBacklogA = absWeekA < absCurrent;
      const isBacklogB = absWeekB < absCurrent;
      
      // Backlog moet ONDERAAN ("daaronder moet een splitsing komen")
      if (isBacklogA && !isBacklogB) return 1;
      if (!isBacklogA && isBacklogB) return -1;
      
      // Binnen de groepen: Sorteer op week (Oplopend: Week 10, 11, 12...)
      if (absWeekA !== absWeekB) return absWeekA - absWeekB;
      
      // Fallback: Order ID
      return (a.orderId || "").localeCompare(b.orderId || "");
    });
  }, [sourceData, searchTerm, selectedMachine, dataScope, currentWeek, currentYear, sortMode, rejectPeriod, isRejectScope, isCompletedScope, orderStationMap, archivedOrders, orderLotMap, trackedFinishedByOrder, activeTrackedByOrder]);

  const completedExportRows = useMemo(() => {
    if (!isCompletedScope) return [];

    return filteredOrders.map((entry) => {
      const completedAt = toEntryDate(entry) || entry?.completedAt || new Date();
      return {
        readyDate: format(completedAt, "yyyy-MM-dd"),
        readyTime: format(completedAt, "HH:mm"),
        orderId: entry?.orderId || "",
        lotNumber: entry?.lotNumber || entry?.lotNumbersText || "",
        item: entry?.item || entry?.itemDescription || "",
        itemCode: entry?.itemCode || "",
        originStation: getStationLabel(entry?.originMachine || entry?.machine || ""),
        inspectionStation: getStationLabel(entry?.lastStation || "BM01"),
        status: entry?.status || "Gereed gemeld",
      };
    });
  }, [filteredOrders, isCompletedScope]);

  const completedPeriodLabel = useMemo(() => {
    if (completedRangeMode === "day") return format(selectedCompletedDate, "yyyy-MM-dd");
    return `week_${String(getISOWeek(selectedCompletedDate)).padStart(2, "0")}_${selectedCompletedDate.getFullYear()}`;
  }, [completedRangeMode, selectedCompletedDate]);

  const handleExportCompletedExcel = async () => {
    if (!completedExportRows.length) return;

    const XLSX = await import("xlsx");
    const headerRow = [
      "Gereed datum",
      "Tijd",
      "Order",
      "Lot",
      "Product",
      "Item code",
      "Bron station",
      "Eindinspectie",
      "Status",
    ];
    const aoa = [
      headerRow,
      ...completedExportRows.map((row) => [
        row.readyDate,
        row.readyTime,
        row.orderId,
        row.lotNumber,
        row.item,
        row.itemCode,
        row.originStation,
        row.inspectionStation,
        row.status,
      ]),
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    worksheet["!cols"] = [
      { wch: 14 },
      { wch: 10 },
      { wch: 16 },
      { wch: 16 },
      { wch: 32 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Gereedlijst");
    XLSX.writeFile(workbook, `teamleader_gereedlijst_${completedRangeMode}_${completedPeriodLabel}.xlsx`);
  };

  const handleExportCompletedPdf = async () => {
    if (!completedExportRows.length) return;

    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const selectedOption = machines.find((option) => option.value === selectedMachine);
    const filterLabel = selectedOption?.label || selectedMachine;

    doc.setFontSize(14);
    doc.text("Eindinspectie Gereedlijst", 14, 14);
    doc.setFontSize(9);
    doc.text(`Periode: ${completedPeriodLabel}`, 14, 20);
    doc.text(`Filter: ${filterLabel}`, 75, 20);
    doc.text(`Totaal: ${completedExportRows.length}`, 145, 20);

    autoTable(doc, {
      startY: 25,
      styles: { fontSize: 8, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      head: [["Gereed datum", "Tijd", "Order", "Lot", "Product", "Item code", "Bron station", "Eindinspectie", "Status"]],
      body: completedExportRows.map((row) => [
        row.readyDate,
        row.readyTime,
        row.orderId,
        row.lotNumber,
        row.item,
        row.itemCode,
        row.originStation,
        row.inspectionStation,
        row.status,
      ]),
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 14 },
        2: { cellWidth: 22 },
        3: { cellWidth: 24 },
        4: { cellWidth: 58 },
        5: { cellWidth: 24 },
        6: { cellWidth: 26 },
        7: { cellWidth: 22 },
        8: { cellWidth: 20 },
      },
    });

    doc.save(`teamleader_gereedlijst_${completedRangeMode}_${completedPeriodLabel}.pdf`);
  };

  const machineThroughputPerDay = useMemo(() => {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 14);

    const byMachineFinished = new Map();
    trackedProducts.forEach((product) => {
      const machine = normalizeStationFilter(
        product?.machine || product?.originMachine || product?.currentStation || product?.lastStation
      );
      if (!machine) return;

      const status = String(product?.status || "").toLowerCase();
      const step = String(product?.currentStep || "").toLowerCase();
      const isFinished =
        status.includes("finish") ||
        status.includes("gereed") ||
        status.includes("completed") ||
        step.includes("finish");
      if (!isFinished) return;

      const eventDateRaw =
        product?.timestamps?.finished ||
        product?.updatedAt ||
        product?.lastUpdated ||
        product?.createdAt ||
        null;
      const eventDate = typeof eventDateRaw?.toDate === "function" ? eventDateRaw.toDate() : new Date(eventDateRaw || 0);
      if (!Number.isFinite(eventDate.getTime()) || eventDate < windowStart) return;

      byMachineFinished.set(machine, (byMachineFinished.get(machine) || 0) + 1);
    });

    const throughput = new Map();
    byMachineFinished.forEach((count, machine) => {
      throughput.set(machine, Math.max(0.5, count / 14));
    });
    return throughput;
  }, [trackedProducts]);

  const predictedScheduleByOrder = useMemo(() => {
    const grouped = new Map<string, SidebarRecord[]>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const getSortDate = (order: SidebarRecord) => {
      const candidates = [
        order?.plannedDate,
        order?.deliveryDate,
        order?.plannedDeliveryDate,
        order?.dueDate,
        order?.date,
        order?.createdAt,
      ];
      for (const value of candidates) {
        if (!value) continue;
        const parsed = typeof (value as any)?.toDate === "function" ? (value as any).toDate() : new Date(value as any);
        if (Number.isFinite(parsed.getTime())) return parsed;
      }
      return new Date(today);
    };

    const getDeliveryDate = (order: SidebarRecord) => {
      const candidates = [
        order?.rejectDate,
        order?.plannedDeliveryDate,
        order?.deliveryDate,
        order?.dueDate,
        order?.plannedDate,
      ];
      for (const value of candidates) {
        if (!value) continue;
        const parsed = typeof (value as any)?.toDate === "function" ? (value as any).toDate() : new Date(value as any);
        if (Number.isFinite(parsed.getTime())) {
          parsed.setHours(0, 0, 0, 0);
          return parsed;
        }
      }
      return null;
    };

    const isOrderInProgress = (order: SidebarRecord) => {
      const status = String(order?.status || "").toLowerCase().trim();
      return ["in_progress", "in progress", "in-behandeling", "in behandeling", "active", "processing", "running", "lopend"].includes(status);
    };

    sourceData.forEach((order) => {
      const orderId = getOrderIdentity(order);
      if (!orderId) return;
      const machine = normalizeStationFilter(order?.machine);
      if (!machine) return;
      const list = grouped.get(machine) || [];
      list.push(order);
      grouped.set(machine, list);
    });

    const result = new Map();

    grouped.forEach((machineOrders, machine) => {
      const unitsPerDay = machineThroughputPerDay.get(machine) || 1;
      const sorted = [...machineOrders].sort((a, b) => {
        const aInProgress = isOrderInProgress(a);
        const bInProgress = isOrderInProgress(b);
        if (aInProgress && !bInProgress) return -1;
        if (!aInProgress && bInProgress) return 1;
        return getSortDate(a).getTime() - getSortDate(b).getTime();
      });

      let accumulatedDays = 0;

      sorted.forEach((order) => {
        const orderId = getOrderIdentity(order);
        const planned = Math.max(0, getEffectivePlanQty(order));
        const produced = getFinishedUnitsForOrder(order);
        const remaining = Math.max(0, planned - produced);

        let currentSpeed = Math.max(0.5, unitsPerDay);

        if (isOrderInProgress(order) && produced > 0) {
          const orderStartCandidates = [
            order?.timestamps?.station_start,
            order?.timestamps?.started,
            order?.timestamps?.wikkelen_start,
            order?.startedAt,
            order?.startTime,
            order?.createdAt
          ];

          let earliestStart = new Date();
          for (const val of orderStartCandidates) {
            if (!val) continue;
            const parsed = typeof (val as any)?.toDate === "function" ? (val as any).toDate() : new Date(val as any);
            if (Number.isFinite(parsed.getTime()) && parsed < earliestStart) {
              earliestStart = parsed;
            }
          }

          const daysWorking = Math.max(0.1, (Date.now() - earliestStart.getTime()) / (1000 * 60 * 60 * 24));
          const specificSpeed = produced / daysWorking;
          
          if (specificSpeed > 0) {
            currentSpeed = Math.max(0.1, specificSpeed);
          }
        }

        const requiredDaysForOrder = remaining / currentSpeed;

        const predictedReadyDate = new Date(today);
        predictedReadyDate.setDate(today.getDate() + Math.max(0, Math.ceil(accumulatedDays + requiredDaysForOrder) - 1));

        const deliveryDate = getDeliveryDate(order);
        let slipDays: number | null = deliveryDate
          ? Math.round((predictedReadyDate.getTime() - deliveryDate.getTime()) / (24 * 60 * 60 * 1000))
          : null;

        let scheduleStatus = !deliveryDate
          ? "unknown"
          : slipDays !== null && slipDays > 0
            ? "behind"
            : slipDays !== null && slipDays < 0
              ? "ahead"
              : "on_time";

        const hasStarted = isOrderInProgress(order) || produced > 0;
        let finalPredictedReadyDate: Date | null = predictedReadyDate;

        if (!hasStarted) {
          finalPredictedReadyDate = null;
          if (deliveryDate && deliveryDate.getTime() <= today.getTime()) {
             slipDays = Math.round((today.getTime() - deliveryDate.getTime()) / (24 * 60 * 60 * 1000));
             scheduleStatus = slipDays > 0 ? "behind" : "on_time";
          } else {
             slipDays = null;
             scheduleStatus = "unknown";
          }
        }

        result.set(orderId, {
          predictedReadyDate: finalPredictedReadyDate,
          scheduleStatus,
          slipDays,
        });

        accumulatedDays += requiredDaysForOrder;
      });
    });

    return result;
  }, [sourceData, machineThroughputPerDay, trackedFinishedByOrder]);

  const handleExportCurrentList = () => {
    if (!filteredOrders.length) return;

    const rows: Array<Record<string, string | number>> = filteredOrders.map((order: SidebarRecord) => {
      const prediction = predictedScheduleByOrder.get(getOrderIdentity(order));
      const predictionDateStr = prediction?.predictedReadyDate ? format(prediction.predictedReadyDate, "yyyy-MM-dd") : "";
      return {
      orderId: order.orderId || "",
      lotNumber: order.lotNumber || order.activeLot || "",
      item: order.item || order.itemDescription || order.itemCode || "",
      machine: order.machine || order.originMachine || order.currentStation || "",
      status: order.status || "",
      week: order.weekNumber || order.week || "",
      year: order.weekYear || order.year || "",
      rejectType: order.rejectKind === "temp_reject" ? "Tijdelijke afkeur" : order.rejectKind === "definitive_reject" ? "Definitieve afkeur" : "",
      rejectReason: order.inspection?.reasons ? order.inspection.reasons.join(" | ") : "",
      updatedAt: typeof (order.updatedAt as any)?.toDate === "function" ? (order.updatedAt as any).toDate().toISOString() : String(order.updatedAt || ""),
      predictedReadyDate: predictionDateStr,
      };
    });

    const headers = Object.keys(rows[0]);
    const escapeCsv = (value: unknown) => {
      const text = String(value ?? "");
      if (text.includes('"') || text.includes(",") || text.includes("\n")) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((h) => escapeCsv(row[h as keyof typeof row])).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const datePart = new Date().toISOString().slice(0, 10);
    const scopePart = String(dataScope || "lijst").toLowerCase();

    const link = document.createElement("a");
    link.href = url;
    link.download = `teamleader_${scopePart}_${datePart}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredProductRows = useMemo(() => {
    const orderLookup = new Map(
      filteredOrders.map((order) => [String(order?.orderId || order?.id || "").trim(), order])
    );

    const rows: Array<Record<string, string>> = [];
    const seen = new Set();

    // Combineer actieve en alle soorten gearchiveerde producten voor een compleet overzicht
    const allProducts = [...trackedProducts, ...archivedProducts, ...archivedHistoryProducts];

    allProducts.forEach((product) => {
      const orderKey = getOrderIdFromRecord(product);
      if (!orderKey || !orderLookup.has(orderKey)) return;

      const lotNumber = String(product?.lotNumber || product?.activeLot || product?.id || "").trim();
      const dedupeKey = `${orderKey}__${lotNumber || product?.id || ""}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      const order = orderLookup.get(orderKey);
      const stationLabel = getStationLabel(
        product?.currentStation || product?.currentStep || product?.lastStation || product?.originMachine || product?.machine || order?.machine || ""
      );

      // Tijdsindicatie toevoegen voor PDF
      const prediction = predictedScheduleByOrder.get(getOrderIdentity(order));
      const predictionDateStr = prediction?.predictedReadyDate ? format(prediction.predictedReadyDate, "dd-MM-yyyy") : "-";

      const finishedDateRaw = product?.finishedAt || product?.completedAt || product?.archivedAt || product?.updatedAt || product?.timestamps?.finished;
      const finishedDate = finishedDateRaw ? toEntryDate({ ...product, finishedAt: finishedDateRaw }) : null;
      const createdDateRaw = product?.createdAt || product?.startedAt || product?.timestamps?.started;
      const createdDate = createdDateRaw ? toEntryDate({ ...product, createdAt: createdDateRaw }) : null;

      rows.push({
        lotNumber,
        orderId: orderKey,
        product: product?.item || product?.itemDescription || order?.item || order?.itemDescription || order?.itemCode || "",
        station: stationLabel,
        poText: order?.notes || order?.poText || "",
        status: product?.status || order?.status || "",
        finishedAt: finishedDate && isValid(finishedDate) ? format(finishedDate, "dd-MM-yyyy HH:mm") : "-",
        createdAt: createdDate && isValid(createdDate) ? format(createdDate, "dd-MM-yyyy HH:mm") : "-",
        predictedReadyDate: predictionDateStr,
      });
    });

    if (rows.length > 0) return rows;

    // Fallback: als er geen tracked products zijn, exporteer minimale orderregels.
    return filteredOrders.map((order: SidebarRecord) => {
      const prediction = predictedScheduleByOrder.get(getOrderIdentity(order));
      const predictionDateStr = prediction?.predictedReadyDate ? format(prediction.predictedReadyDate, "dd-MM-yyyy") : "-";
      return {
      lotNumber: order?.lotNumber || order?.activeLot || "",
      orderId: order?.orderId || order?.id || "",
      product: order?.item || order?.itemDescription || order?.itemCode || "",
      station: getStationLabel(order?.machine || ""),
      poText: order?.notes || order?.poText || "",
      status: order?.status || "",
      finishedAt: "-",
      createdAt: "-",
      predictedReadyDate: predictionDateStr,
      };
    });
  }, [filteredOrders, trackedProducts, archivedProducts, archivedHistoryProducts, predictedScheduleByOrder]);

  const handleExportCurrentPdf = async () => {
    if (!filteredProductRows.length) return;

    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const datePart = new Date().toISOString().slice(0, 10);
    const selectedOption = machines.find((option) => option.value === selectedMachine);
    const filterLabel = selectedOption?.label || selectedMachine;

    doc.setFontSize(14);
    doc.text("Planning Productlijst", 14, 14);
    doc.setFontSize(9);
    doc.text(`Filter: ${filterLabel}`, 14, 20);
    doc.text(`Scope: ${dataScope}`, 70, 20);
    doc.text(`Datum: ${datePart}`, 110, 20);
    doc.text(`Totaal: ${filteredProductRows.length}`, 155, 20);

    autoTable(doc, {
      startY: 25,
      styles: { fontSize: 8, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      head: [["Lotnummer", "Ordernummer", "Product", "Aangemaakt", "Gereed", "Voorspeld", "Station", "PO Text"]],
      body: filteredProductRows.map((row) => [
        row.lotNumber || "",
        row.orderId || "",
        row.product || "",
        row.createdAt || "-",
        row.finishedAt || "-",
        row.predictedReadyDate || "-",
        row.station || "",
        row.poText || "",
      ]),
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 24 },
        2: { cellWidth: 44 },
        3: { cellWidth: 24 },
        4: { cellWidth: 24 },
        5: { cellWidth: 24 },
        6: { cellWidth: 22 },
        7: { cellWidth: 80 },
      },
    });

    doc.save(`planning_productlijst_${String(selectedMachine || "all").toLowerCase()}_${datePart}.pdf`);
  };

  const getOrderDisplayName = (order: SidebarRecord) => {
    return (
      order?.item ||
      order?.itemDescription ||
      order?.itemCode ||
      order?.productId ||
      t("digitalplanning.sidebar.no_itemcode")
    );
  };

  const formatDeliveryDate = (order: SidebarRecord) => {
    const candidates = [
      order?.rejectDate,
      order?.plannedDeliveryDate,
      order?.deliveryDate,
      order?.dueDate,
      order?.plannedDate,
      order?.date,
    ];

    for (const value of candidates) {
      if (!value) continue;
      const date =
        typeof value?.toDate === "function"
          ? (value as any).toDate()
          : new Date(value as any);
      if (Number.isFinite(date.getTime())) {
        const dateStr = date.toLocaleDateString("nl-NL", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
        const week = String(getISOWeek(date)).padStart(2, "0");
        return `${dateStr}  W${week}`;
      }
    }

    return "--";
  };

  const formatDateWithWeek = (dateInput: unknown) => {
    const date = typeof (dateInput as any)?.toDate === "function" ? (dateInput as any).toDate() : new Date(dateInput as any);
    if (!Number.isFinite(date.getTime())) return "--";
    const dateStr = date.toLocaleDateString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const week = String(getISOWeek(date)).padStart(2, "0");
    return `${dateStr}  W${week}`;
  };

  const getOrderTileTintClass = (order: SidebarRecord) => {
    const orderKey = normalizeOrderKey(getOrderIdentity(order));
    if (virtualLotsByOrder.has(orderKey)) {
      return "border-orange-200 bg-orange-50 hover:border-orange-300";
    }

    const matchText = [order?.itemCode, order?.item, order?.itemDescription, order?.extraCode]
      .filter(Boolean)
      .join(" ")
      .toUpperCase();

    if (matchText.includes("EMT")) {
      return "border-sky-200 bg-sky-50 hover:border-sky-300";
    }

    if (matchText.includes("CST")) {
      return "border-slate-300 bg-slate-100 hover:border-slate-400";
    }

    return "border-slate-50 bg-white hover:border-slate-200 hover:bg-slate-50";
  };

  const getOrderTypeBadge = (order: SidebarRecord) => {
    const matchText = [order?.itemCode, order?.item, order?.itemDescription, order?.extraCode]
      .filter(Boolean)
      .join(" ")
      .toUpperCase();

    if (matchText.includes("EMT")) {
      return {
        label: "EMT",
        className: "bg-sky-100 text-sky-700 border border-sky-200",
      };
    }

    if (matchText.includes("CST")) {
      return {
        label: "CST",
        className: "bg-slate-200 text-slate-700 border border-slate-300",
      };
    }

    return null;
  };

  const Row = ({ order }: { order: SidebarRecord }) => {
    if (!order) return null;
    const isSelected =
      selectedOrderId === order.id || selectedOrderId === order.orderId;
    const isNew = isOrderNew(order);
    const isDelegated = !!order.delegatedTo;
    const plannedAmount = Math.max(0, getEffectivePlanQty(order));
    const finishedAmount = getFinishedUnitsForOrder(order);
    const activeTrackedCount = getNumeric(activeTrackedByOrder.get(normalizeOrderKey(getOrderIdentity(order))));
    const shouldForceCompletedStatus = plannedAmount > 0 && finishedAmount >= plannedAmount && activeTrackedCount === 0;
    const effectiveStatus = shouldForceCompletedStatus ? "Gereed" : order.status;
    const isDelegatedStatus = !shouldForceCompletedStatus && (order.status === 'delegated' || order.status === 'DELEGATED');
    const isCancelled = order.status === 'cancelled';
    const isOnHold = order.status === 'on_hold';
    const rawPriority = order?.priority;
    const normalizedPriority =
      rawPriority === true
        ? "high"
        : String(rawPriority || "").toLowerCase().trim();
    const priorityLevel =
      normalizedPriority === "immediate"
        ? "immediate"
        : normalizedPriority === "urgent"
          ? "urgent"
          : (normalizedPriority === "high" || order?.isMoved)
            ? "high"
            : (order?.isUrgent ? "urgent" : "normal");
    const priorityBadge =
      priorityLevel === "immediate"
        ? { label: "1e Prio", className: "bg-rose-100 text-rose-700 border border-rose-200" }
        : priorityLevel === "urgent"
          ? { label: "Spoed", className: "bg-orange-100 text-orange-700 border border-orange-200" }
          : priorityLevel === "high"
            ? { label: "Prio", className: "bg-amber-100 text-amber-700 border border-amber-200" }
            : null;
    const orderTypeBadge = getOrderTypeBadge(order);
    const cardTintClass = getOrderTileTintClass(order);
    const prediction = predictedScheduleByOrder.get(getOrderIdentity(order));
    const predictionLabel =
      prediction?.scheduleStatus === "behind"
        ? t("digitalplanning.sidebar.prediction_behind", "Achter op schema")
        : prediction?.scheduleStatus === "ahead"
          ? t("digitalplanning.sidebar.prediction_ahead", "Voor op schema")
          : prediction?.scheduleStatus === "on_time"
            ? t("digitalplanning.sidebar.prediction_on_time", "Op schema")
            : t("digitalplanning.sidebar.prediction_unknown", "Onbekend");
    const predictionClass =
      prediction?.scheduleStatus === "behind"
        ? "text-rose-700"
        : prediction?.scheduleStatus === "ahead"
          ? "text-emerald-700"
          : "text-amber-700";
    const orderWithPrediction = {
      ...order,
      predictedReadyDate: prediction?.predictedReadyDate || null,
      scheduleStatus: prediction?.scheduleStatus || "unknown",
      slipDays: prediction?.slipDays,
    };

    return (
      <div className="px-3 py-1.5">
        <button
          onClick={() => onSelect(orderWithPrediction)}
          className={`w-full p-4 rounded-[28px] border-2 text-left transition-all duration-200 group relative overflow-hidden block
            ${
              isSelected
                ? "bg-emerald-50 border-emerald-500 shadow-md shadow-emerald-100"
                : isCancelled
                  ? "bg-slate-50 border-slate-100 opacity-60 grayscale"
                  : isOnHold
                    ? "bg-orange-50/50 border-orange-200 opacity-80"
                    : cardTintClass
            }
          `}
        >
          {isNew && (
            <div className="absolute top-0 right-0 px-2 py-0.5 bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest rounded-bl-lg z-10 shadow-sm">
              Nieuw
            </div>
          )}

          {priorityLevel !== "normal" && (
            <div
              className={`absolute top-0 right-0 w-1.5 h-full ${
                priorityLevel === "immediate"
                  ? "bg-rose-500"
                  : priorityLevel === "urgent"
                    ? "bg-orange-500"
                    : "bg-amber-500"
              } animate-pulse`}
            />
          )}

          <div className="flex justify-between items-start gap-2 mb-1.5">
            <div className="flex flex-col overflow-hidden min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className={`font-black text-sm tracking-tighter truncate ${
                    isSelected ? "text-emerald-800" : "text-slate-900"
                  }`}
                >
                  {order.orderId || t("digitalplanning.sidebar.no_id")}
                </span>
                <span className="text-[9px] font-bold text-slate-400 truncate">
                  {order.itemCode || order.productId || "-"}
                </span>
              </div>
              
              <span
                className={`font-bold text-xs truncate ${
                  isSelected ? "text-emerald-700" : "text-slate-600"
                }`}
              >
                {getOrderDisplayName(order)}
              </span>

              {((order.extraCode && order.extraCode !== "-") || orderTypeBadge || order.project || priorityBadge || isDelegated) && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {isDelegated && (
                    <span title={`Gedelegeerd aan ${order.delegatedTo}`}>
                      <Factory size={10} className="text-purple-500" />
                    </span>
                  )}
                  {priorityBadge && (
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide ${priorityBadge.className}`}>
                      {priorityBadge.label}
                    </span>
                  )}
                  {order.extraCode && order.extraCode !== "-" && (
                    <span className="px-1.5 py-0.5 bg-amber-400 text-amber-900 border border-amber-500 rounded text-[8px] font-black uppercase tracking-wide">
                      {order.extraCode}
                    </span>
                  )}
                  {orderTypeBadge && (
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide ${orderTypeBadge.className}`}>
                      {orderTypeBadge.label}
                    </span>
                  )}
                  {order.project && (
                    <span className="text-[8px] font-bold uppercase tracking-tighter text-slate-400 truncate max-w-[120px]">
                      {order.project}
                    </span>
                  )}
                </div>
              )}
            </div>
            
            <div className="shrink-0 mt-0.5">
              {isDelegatedStatus ? (
                <span className="px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200 shadow-sm">
                Delegated
              </span>
            ) : (
              <StatusBadge status={effectiveStatus} />
            )}
          </div>
          </div>

          {/* Totaal Gereed & Leverdata Blok */}
          <div className="mb-1 rounded-xl border border-slate-100 bg-slate-50/70 p-2 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[8px] font-black uppercase tracking-tighter text-blue-600">{t("planningSidebar.totalReady", "Totaal Gereed")}</p>
              <p className="text-[8px] font-black text-blue-900 bg-blue-100/50 px-1 py-0 rounded">
                {getFinishedUnitsForOrder(order)} / {Math.max(0, getEffectivePlanQty(order))}
              </p>
            </div>

            <div className="h-px bg-slate-200 w-full opacity-50" />

            <div className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-2 text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Calendar size={10} className="mt-0.5 text-slate-400 shrink-0" />
                  <span className="uppercase text-slate-400 text-[7px] font-bold">{t("planningSidebar.delivery", "Lever:")}</span>
                </div>
                <span className="text-right text-[7px] font-black text-slate-700 ml-1">{formatDeliveryDate(order)}</span>
              </div>

              <div className="flex items-start justify-between gap-2 text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Calendar size={10} className="mt-0.5 text-slate-400 shrink-0" />
                  <span className="uppercase text-slate-400 text-[7px] font-bold truncate max-w-[90px]" title={t("digitalplanning.sidebar.predicted_ready", "Voorspelde gereeddatum")}>
                    Voorspr:
                  </span>
                </div>
                <div className="min-w-0 text-right">
                  <span className="block text-[7px] font-black text-slate-700">
                    {prediction?.predictedReadyDate ? formatDateWithWeek(prediction.predictedReadyDate) : "--"}
                  </span>
                  <span className={`block text-[7px] font-bold ${predictionClass}`}>
                    {predictionLabel}
                    {Number.isFinite(prediction?.slipDays)
                      ? ` (${prediction.slipDays > 0 ? "+" : ""}${prediction.slipDays}d)`
                      : ""}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-4 right-4">
            <ChevronRight
              size={16}
              className={`transition-transform duration-300 ${
                isSelected
                  ? "text-emerald-500 translate-x-1"
                  : "text-slate-200 group-hover:text-slate-400"
              }`}
            />
          </div>
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 animate-in fade-in duration-300">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
        <div className="relative group">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors"
            size={16}
          />
          <input
            type="text"
            placeholder={t("digitalplanning.sidebar.search_placeholder")}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
            <div className="relative flex-1">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <select 
                value={selectedMachine}
                onChange={(e) => setSelectedMachine(e.target.value)}
                className="w-full pl-9 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase outline-none focus:border-blue-500 cursor-pointer"
              >
                {machines.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="relative flex-1">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              {isRejectScope ? (
                <select
                  value={rejectPeriod}
                  onChange={(e) => setRejectPeriod(e.target.value)}
                  className="w-full pl-9 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="this_week">{t("planningSidebar.thisWeek", "Deze week")}</option>
                  <option value="previous_week">{t("planningSidebar.previousWeek", "Vorige week")}</option>
                  <option value="this_month">{t("planningSidebar.thisMonth", "Deze maand")}</option>
                  <option value="this_year">{t("planningSidebar.thisYear", "Dit jaar")}</option>
                  <option value="all">{t("planningSidebar.all", "Alles")}</option>
                </select>
              ) : isCompletedScope ? (
                <select
                  value={completedRangeMode}
                  onChange={(e) => setCompletedRangeMode(e.target.value)}
                  className="w-full pl-9 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="day">{t("planningSidebar.perDay", "Per dag")}</option>
                  <option value="week">{t("planningSidebar.perWeek", "Per week")}</option>
                </select>
              ) : (
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value)}
                  className="w-full pl-9 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="week_backlog">{t("digitalplanning.sidebar.sort_week_backlog", "Week + Backlog")}</option>
                  <option value="in_progress_first">{t("digitalplanning.sidebar.sort_in_progress_first", "In behandeling eerst")}</option>
                  <option value="date_asc">{t("digitalplanning.sidebar.sort_date_asc", "Datum oplopend")}</option>
                  <option value="date_desc">{t("digitalplanning.sidebar.sort_date_desc", "Datum aflopend")}</option>
                  <option value="recently_added">{t("digitalplanning.sidebar.sort_recently_added", "Onlangs toegevoegd")}</option>
                </select>
              )}
            </div>
            <div className="relative flex-1">
              <Archive className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <select
                value={dataScope}
                onChange={(e) => setDataScope(e.target.value)}
                className="w-full pl-9 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase outline-none focus:border-blue-500 cursor-pointer"
              >
                {scopeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            {isCompletedScope && (
              <div className="relative flex-1">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="date"
                  value={completedDateValue}
                  onChange={(e) => setCompletedDateValue(e.target.value)}
                  className="w-full pl-9 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase outline-none focus:border-blue-500 cursor-pointer"
                />
              </div>
            )}
            <button
              type="button"
              onClick={isCompletedScope ? handleExportCompletedPdf : handleExportCurrentPdf}
              disabled={filteredOrders.length === 0}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              title={isCompletedScope ? "Exporteer gereedlijst als PDF" : "Exporteer huidige lijst als PDF"}
            >
              <Printer size={14} /> PDF
            </button>
            <button
              type="button"
              onClick={isCompletedScope ? handleExportCompletedExcel : handleExportCurrentList}
              disabled={filteredOrders.length === 0}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              title={isCompletedScope ? "Exporteer gereedlijst als Excel" : "Exporteer huidige lijst"}
            >
              <Download size={14} /> {isCompletedScope ? "Excel" : "Export"}
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center opacity-40 w-full">
            {loadingArchive && isHistoryScope ? (
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("planningSidebar.loadingArchive", "Archief laden...")}</p>
            ) : (
              <>
                <AlertCircle size={32} className="mb-2 text-slate-300" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {t("digitalplanning.sidebar.no_results")}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-0.5 pb-4">
            {(() => {
              let lastLabel: string | null = null;
              return filteredOrders.map((order, index) => {
                let currentLabel: string | null = null;

                if (sortMode === "week_backlog") {
                  const w = Number(order.weekNumber || order.week);
                  const y = Number(order.weekYear || order.year || currentYear);
                  const absW = y * 52 + w;
                  const absC = currentYear * 52 + currentWeek;
                  
                  if (absW < absC) {
                    currentLabel = "Backlog";
                  } else if (Number.isFinite(w) && w !== 999 && w !== 0) {
                    currentLabel = y !== currentYear ? `Week ${w} (${y})` : `Week ${w}`;
                  } else {
                    currentLabel = "Onbekend";
                  }
                } else if (sortMode === "in_progress_first") {
                  const status = String(order?.status || "").toLowerCase().trim();
                  const inProgress = ["in_progress", "in progress", "in-behandeling", "in behandeling", "active", "processing", "running", "lopend"].includes(status);
                  currentLabel = inProgress ? "In behandeling" : "Gepland";
                } else if (sortMode === "recently_added") {
                  currentLabel = isOrderRecentlyAdded(order)
                    ? t("digitalplanning.sidebar.recently_added_label", "Onlangs toegevoegd")
                    : t("digitalplanning.sidebar.other_label", "Overige");
                }

                const showDivider = (sortMode === "week_backlog" || sortMode === "in_progress_first" || sortMode === "recently_added") && currentLabel !== lastLabel;
                if (showDivider) {
                  lastLabel = currentLabel;
                }

                return (
                  <React.Fragment key={String(order?.id || order?.orderId || index)}>
                    {showDivider && currentLabel && (
                      <div className="flex items-center gap-3 mt-5 mb-2.5 px-4 first:mt-2">
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm">{currentLabel}</span>
                        <div className="h-px bg-slate-200 flex-1"></div>
                      </div>
                    )}
                    <Row order={order} />
                  </React.Fragment>
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanningSidebar;
