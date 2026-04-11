import React, { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { List } from "react-window";
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
import { getISOWeek } from "date-fns";

const FixedSizeList = List;

// Lokale AutoSizer implementatie om import problemen te voorkomen
const AutoSizer = ({ children }) => {
  const parentRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!parentRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    resizeObserver.observe(parentRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div ref={parentRef} style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      {size.width > 0 && size.height > 0 && children(size)}
    </div>
  );
};

/**
 * PlanningSidebar - Nu met 'NIEUW' indicator voor recent toegevoegde orders.
 */
const PlanningSidebar = ({
  orders = [],
  selectedOrderId,
  onSelect,
  trackedProducts = [],
  enableRejectionScopes = false,
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMachine, setSelectedMachine] = useState("ALL");
  const [sortMode, setSortMode] = useState("week_backlog");
  const [dataScope, setDataScope] = useState("active");
  const [rejectPeriod, setRejectPeriod] = useState("this_week");
  const [archivedOrders, setArchivedOrders] = useState([]);
  const [loadingArchive, setLoadingArchive] = useState(false);

  const currentWeek = getISOWeek(new Date());
  const currentYear = new Date().getFullYear();

  const isHistoryScope = dataScope === "history" || dataScope === "all";
  const isRejectScope = dataScope === "temp_reject" || dataScope === "definitive_reject";

  const normalizeOrderStatus = (status) =>
    String(status || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");

  const normalizeStationFilter = (value) => {
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

  const getStationLabel = (value) => {
    const normalized = normalizeStationFilter(value);
    if (normalized === "NABEWERKEN") return "Nabewerken";
    if (normalized === "MAZAK") return "Mazak";
    if (normalized === "BM01") return "BM01";
    if (normalized === "LOSSEN") return "Lossen";
    return normalized || String(value || "").trim();
  };

  const isOpenOrRunningStatus = (status) => {
    const normalized = normalizeOrderStatus(status);
    return [
      "open",
      "planned",
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
    ].includes(normalized);
  };

  // Haal archief data op wanneer history scope actief is
  useEffect(() => {
    if (isHistoryScope && archivedOrders.length === 0) {
      setLoadingArchive(true);
      const fetchArchive = async () => {
        try {
          const baseYear = new Date().getFullYear();
          const years = [baseYear, baseYear - 1, baseYear - 2, baseYear - 3];

          const snapshots = await Promise.all(
            years.map((year) =>
              getDocs(
                query(
                  collection(db, ...getArchiveItemsPath(year)),
                  limit(800)
                )
              )
            )
          );

          const data = snapshots.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));

          // Dedupliceren op orderId en tegelijk lotnummers aggregeren
          const uniqueMap = new Map();
          data.forEach(item => {
            const orderId = String(item?.orderId || "").trim();
            if (!orderId) return;

            const lot = String(item?.lotNumber || item?.activeLot || "").trim();
            const finishedAt =
              (typeof item?.timestamps?.finished?.toMillis === "function" && item.timestamps.finished.toMillis()) ||
              (item?.timestamps?.finished ? new Date(item.timestamps.finished).getTime() : 0) ||
              (item?.updatedAt?.toMillis ? item.updatedAt.toMillis() : new Date(item?.updatedAt || 0).getTime()) ||
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
  }, [isHistoryScope, archivedOrders.length]);

  // Bepaal de bron data: Actief, History of beide
  const sourceData = useMemo(() => {
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
            typeof rejectDateRaw?.toDate === "function"
              ? rejectDateRaw.toDate()
              : new Date(rejectDateRaw || Date.now());

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
      orders.forEach((o) => {
        const key = String(o?.orderId || o?.id || "").trim();
        if (!key) return;
        byOrder.set(key, o);
      });
      // Archive record overschrijft actieve record zodat status correct "completed" is.
      archivedOrders.forEach((o) => {
        const key = String(o?.orderId || o?.id || "").trim();
        if (!key) return;
        byOrder.set(key, o);
      });
      return Array.from(byOrder.values());
    }
    return orders;
  }, [dataScope, orders, archivedOrders, trackedProducts, currentWeek, currentYear]);

  // Helper om te bepalen of een order nieuw is (< 24 uur)
  const isOrderNew = (order) => {
    if (!order.createdAt) return false;
    const createdAt = order.createdAt.toMillis
      ? order.createdAt.toMillis()
      : new Date(order.createdAt).getTime();
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    return createdAt > twentyFourHoursAgo;
  };

  const orderStationMap = useMemo(() => {
    const byOrder = new Map();

    trackedProducts.forEach((product) => {
      const orderKey = String(product?.orderId || "").trim();
      if (!orderKey) return;

      const set = byOrder.get(orderKey) || new Set();
      const candidates = [
        product?.currentStation,
        product?.currentStep,
        product?.lastStation,
        product?.originMachine,
        product?.machine,
      ];

      candidates.forEach((candidate) => {
        const normalized = normalizeStationFilter(candidate);
        if (normalized) set.add(normalized);
      });

      byOrder.set(orderKey, set);
    });

    return byOrder;
  }, [trackedProducts]);

  // Unieke machines ophalen voor filter
  const machines = useMemo(() => {
    const options = new Map();
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
      relatedStations.forEach((stationValue) => {
        if (!stationValue || !downstreamStations.has(stationValue)) return;
        if (!options.has(stationValue)) {
          options.set(stationValue, { value: stationValue, label: getStationLabel(stationValue) });
        }
      });
    });

    // Ook downstream stations tonen die alleen in tracking voorkomen
    // (bijv. wanneer de gekoppelde order niet meer in de actieve sourceData zit).
    orderStationMap.forEach((stationSet) => {
      stationSet.forEach((stationValue) => {
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
    ...(enableRejectionScopes
      ? [
          { value: "temp_reject", label: "Tijdelijke Afkeur" },
          { value: "definitive_reject", label: "Definitieve Afkeur" },
        ]
      : []),
  ];

  const filteredOrders = useMemo(() => {
    const getPriorityLevel = (order) => {
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

    const getPriorityRank = (order) => {
      const level = getPriorityLevel(order);
      if (level === "immediate") return 3;
      if (level === "urgent") return 2;
      if (level === "high") return 1;
      return 0;
    };

    const getOrderDateMs = (order) => {
      const candidates = [
        order?.plannedDate,
        order?.deliveryDate,
        order?.dueDate,
        order?.date,
        order?.createdAt,
        order?.updatedAt,
      ];

      for (const value of candidates) {
        if (!value) continue;
        if (typeof value?.toMillis === "function") {
          const ms = value.toMillis();
          if (Number.isFinite(ms)) return ms;
        }
        if (value instanceof Date) {
          const ms = value.getTime();
          if (Number.isFinite(ms)) return ms;
        }
        const ms = new Date(value).getTime();
        if (Number.isFinite(ms)) return ms;
      }

      return Number.MAX_SAFE_INTEGER;
    };

    const isInProgress = (order) => {
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
    if (dataScope === "active") {
      result = result.filter((o) => isOpenOrRunningStatus(o?.status));
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

      result = result.filter((entry) => {
        const entryWeek = Number(entry.weekNumber || entry.week || 0);
        const entryYear = Number(entry.weekYear || entry.year || thisYear);
        const entryDateRaw =
          entry?.rejectDate ||
          entry?.inspection?.timestamp ||
          entry?.updatedAt ||
          entry?.createdAt ||
          null;
        const entryDate =
          typeof entryDateRaw?.toDate === "function"
            ? entryDateRaw.toDate()
            : new Date(entryDateRaw || 0);
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
      result = result.filter((order) => {
      const searchableFields = [
        order?.orderId,
        order?.item,
        order?.itemDescription,
        order?.itemCode,
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
        isOrderNew(order) ? "nieuw" : "",
        isOrderNew(order) ? "new" : "",
        isOrderNew(order) ? "last24h" : "",
        isOrderNew(order) ? "laatste24u" : "",
      ]
        .filter((v) => v !== null && v !== undefined)
        .map((v) => String(v).toLowerCase());

      return terms.every((part) =>
        searchableFields.some((value) => value.includes(part))
      );
    });
    }

    // 4. Sorteren (standaard): Huidige/Toekomstige weken eerst, daarna Backlog (Oude weken)
    return result.sort((a, b) => {
      const priorityRankA = getPriorityRank(a);
      const priorityRankB = getPriorityRank(b);
      if (priorityRankA !== priorityRankB) return priorityRankB - priorityRankA;

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
  }, [sourceData, searchTerm, selectedMachine, dataScope, currentWeek, currentYear, sortMode, rejectPeriod, isRejectScope, orderStationMap]);

  const handleExportCurrentList = () => {
    if (!filteredOrders.length) return;

    const rows = filteredOrders.map((order) => ({
      orderId: order.orderId || "",
      lotNumber: order.lotNumber || order.activeLot || "",
      item: order.item || order.itemDescription || order.itemCode || "",
      machine: order.machine || order.originMachine || order.currentStation || "",
      status: order.status || "",
      week: order.weekNumber || order.week || "",
      year: order.weekYear || order.year || "",
      rejectType: order.rejectKind === "temp_reject" ? "Tijdelijke afkeur" : order.rejectKind === "definitive_reject" ? "Definitieve afkeur" : "",
      rejectReason: order.inspection?.reasons ? order.inspection.reasons.join(" | ") : "",
      updatedAt: order.updatedAt?.toDate ? order.updatedAt.toDate().toISOString() : (order.updatedAt || ""),
    }));

    const headers = Object.keys(rows[0]);
    const escapeCsv = (value) => {
      const text = String(value ?? "");
      if (text.includes('"') || text.includes(",") || text.includes("\n")) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(",")),
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

    const rows = [];
    const seen = new Set();

    trackedProducts.forEach((product) => {
      const orderKey = String(product?.orderId || "").trim();
      if (!orderKey || !orderLookup.has(orderKey)) return;

      const lotNumber = String(product?.lotNumber || product?.activeLot || product?.id || "").trim();
      const dedupeKey = `${orderKey}__${lotNumber || product?.id || ""}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      const order = orderLookup.get(orderKey);
      const stationLabel = getStationLabel(
        product?.currentStation || product?.currentStep || product?.lastStation || product?.originMachine || product?.machine || order?.machine || ""
      );

      rows.push({
        lotNumber,
        orderId: orderKey,
        product: product?.item || product?.itemDescription || order?.item || order?.itemDescription || order?.itemCode || "",
        station: stationLabel,
        poText: order?.notes || order?.poText || "",
        status: product?.status || order?.status || "",
      });
    });

    if (rows.length > 0) return rows;

    // Fallback: als er geen tracked products zijn, exporteer minimale orderregels.
    return filteredOrders.map((order) => ({
      lotNumber: order?.lotNumber || order?.activeLot || "",
      orderId: order?.orderId || order?.id || "",
      product: order?.item || order?.itemDescription || order?.itemCode || "",
      station: getStationLabel(order?.machine || ""),
      poText: order?.notes || order?.poText || "",
      status: order?.status || "",
    }));
  }, [filteredOrders, trackedProducts]);

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
      head: [["Lotnummer", "Ordernummer", "Product", "Station", "PO Text", "Status"]],
      body: filteredProductRows.map((row) => [
        row.lotNumber || "",
        row.orderId || "",
        row.product || "",
        row.station || "",
        row.poText || "",
        row.status || "",
      ]),
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 26 },
        2: { cellWidth: 64 },
        3: { cellWidth: 28 },
        4: { cellWidth: 100 },
        5: { cellWidth: 24 },
      },
    });

    doc.save(`planning_productlijst_${String(selectedMachine || "all").toLowerCase()}_${datePart}.pdf`);
  };

  const getOrderDisplayName = (order) => {
    return (
      order?.item ||
      order?.itemDescription ||
      order?.itemCode ||
      order?.productId ||
      t("digitalplanning.sidebar.no_itemcode")
    );
  };

  const formatDeliveryDate = (order) => {
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
          ? value.toDate()
          : new Date(value);
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

  const getOrderTileTintClass = (order) => {
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

  const getOrderTypeBadge = (order) => {
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

  const Row = ({ index, style }) => {
    const order = filteredOrders[index];
    const isSelected =
      selectedOrderId === order.id || selectedOrderId === order.orderId;
    const isNew = isOrderNew(order);
    const isDelegated = !!order.delegatedTo;
    const isDelegatedStatus = order.status === 'delegated' || order.status === 'DELEGATED';
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

    return (
      <div style={style} className="px-2 py-1">
        <button
          key={order.id}
          onClick={() => onSelect(order)}
          className={`w-full h-full p-4 rounded-2xl border-2 text-left transition-all duration-200 group relative overflow-hidden
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
            <div className="absolute top-0 right-0 px-2 py-1 bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest rounded-bl-lg z-10 shadow-sm">
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

          <div className="flex justify-between items-start mb-2">
            <div className="flex flex-col overflow-hidden">
              <span
                className={`font-black text-sm uppercase tracking-tight truncate ${
                  isSelected ? "text-emerald-800" : "text-slate-700"
                }`}
              >
                {getOrderDisplayName(order)}
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`font-black text-sm tracking-tighter truncate ${
                    isSelected ? "text-emerald-700" : "text-slate-900"
                  }`}
                >
                  {order.orderId || t("digitalplanning.sidebar.no_id")}
                </span>
                {isDelegated && (
                  <Factory size={12} className="text-purple-500" title={`Gedelegeerd aan ${order.delegatedTo}`} />
                )}
                {priorityBadge && (
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${priorityBadge.className}`}>
                    {priorityBadge.label}
                  </span>
                )}
              </div>
              {order.extraCode && order.extraCode !== "-" && (
                <span className="mt-0.5 inline-block px-1.5 py-0.5 bg-amber-400 text-amber-900 border border-amber-500 rounded text-[9px] font-black uppercase tracking-wide">
                  {order.extraCode}
                </span>
              )}
              {orderTypeBadge && (
                <span className={`mt-0.5 inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${orderTypeBadge.className}`}>
                  {orderTypeBadge.label}
                </span>
              )}
              {order.project && (
                <span className="text-[9px] font-bold uppercase tracking-tighter text-slate-400 truncate max-w-[120px]">
                  {order.project}
                </span>
              )}
            </div>
            {isDelegatedStatus ? (
              <span className="px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200 shadow-sm">
                Delegated
              </span>
            ) : (
              <StatusBadge status={order.status} />
            )}
          </div>

          <div className="flex items-center gap-2 mb-3">
            <p className="text-[10px] font-bold text-slate-400 truncate">
              {order.itemCode || order.productId || "-"}
            </p>
          </div>

          {(order.poText || order.notes) && (
            <div className="mb-2 rounded-lg border border-amber-100 bg-amber-50 px-2 py-1">
              <p className="text-[9px] font-black uppercase tracking-wide text-amber-700">PO Text</p>
              <p className="truncate text-[10px] font-bold text-amber-900">
                {order.poText || order.notes}
              </p>
            </div>
          )}

          <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold text-slate-500">
            <Calendar size={10} className="text-slate-300" />
            <span className="uppercase text-slate-400">Leverdatum:</span>
            <span className="text-slate-700">{formatDeliveryDate(order)}</span>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100/50">
            <div className="flex items-center gap-2">
              {isNew && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[8px] font-black uppercase tracking-wider">
                  <Sparkles size={8} />
                  Nieuw
                </span>
              )}
            </div>
            <ChevronRight
              size={14}
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

  // FALLBACK: Als react-window niet geladen kan worden, toon een standaard lijst.
  // Dit voorkomt de "Element type is invalid" crash.
  if (!FixedSizeList) {
    return (
      <div className="flex flex-col h-full bg-white border-r border-slate-200 animate-in fade-in duration-300">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
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
                  className="w-full pl-9 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase outline-none focus:border-blue-500"
                >
                  <option value="this_week">Deze week</option>
                  <option value="previous_week">Vorige week</option>
                  <option value="this_month">Deze maand</option>
                  <option value="this_year">Dit jaar</option>
                  <option value="all">Alles</option>
                </select>
              ) : (
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value)}
                  className="w-full pl-9 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase outline-none focus:border-blue-500"
                >
                  <option value="week_backlog">{t("digitalplanning.sidebar.sort_week_backlog", "Week + Backlog")}</option>
                  <option value="in_progress_first">{t("digitalplanning.sidebar.sort_in_progress_first", "In behandeling eerst")}</option>
                  <option value="date_asc">{t("digitalplanning.sidebar.sort_date_asc", "Datum oplopend")}</option>
                  <option value="date_desc">{t("digitalplanning.sidebar.sort_date_desc", "Datum aflopend")}</option>
                </select>
              )}
            </div>
            <div className="relative flex-1">
              <Archive className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <select
                value={dataScope}
                onChange={(e) => setDataScope(e.target.value)}
                className="w-full pl-9 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase outline-none focus:border-blue-500"
              >
                {scopeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleExportCurrentPdf}
              disabled={filteredOrders.length === 0}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              title="Exporteer huidige lijst als PDF"
            >
              <Printer size={14} /> PDF
            </button>
            <button
              type="button"
              onClick={handleExportCurrentList}
              disabled={filteredOrders.length === 0}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              title="Exporteer huidige lijst"
            >
              <Download size={14} /> Export
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
           {filteredOrders.map((order, index) => (
             <div key={order.id} style={{ height: 176, width: "100%" }}>
                <Row index={index} style={{ height: "100%", width: "100%" }} />
             </div>
          ))}
          {filteredOrders.length === 0 && loadingArchive && isHistoryScope && (
             <div className="p-8 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
               Archief laden...
             </div>
          )}
        </div>
      </div>
    );
  }

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
                  <option value="this_week">Deze week</option>
                  <option value="previous_week">Vorige week</option>
                  <option value="this_month">Deze maand</option>
                  <option value="this_year">Dit jaar</option>
                  <option value="all">Alles</option>
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
            <button
              type="button"
              onClick={handleExportCurrentPdf}
              disabled={filteredOrders.length === 0}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              title="Exporteer huidige lijst als PDF"
            >
              <Printer size={14} /> PDF
            </button>
            <button
              type="button"
              onClick={handleExportCurrentList}
              disabled={filteredOrders.length === 0}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              title="Exporteer huidige lijst"
            >
              <Download size={14} /> Export
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-1">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center opacity-40">
            {loadingArchive && isHistoryScope ? (
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Archief laden...</p>
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
          <AutoSizer>
            {({ height, width }) => (
              <FixedSizeList
                className="custom-scrollbar"
                rowCount={filteredOrders.length}
                rowHeight={176}
                rowComponent={Row}
                rowProps={{}}
                style={{ height, width }}
              />
            )}
          </AutoSizer>
        )}
      </div>
    </div>
  );
};

export default PlanningSidebar;
