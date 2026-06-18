import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  FileText,
  TrendingUp,
  Clock,
  Users,
  Package,
  Activity,
  Upload,
  Download,
  Filter,
  BarChart3,
  LineChart,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Box,
  Factory,
  Target,
  Zap,
} from "lucide-react";
import { collection, query, getDocs, limit, doc, getDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { getArchiveItemsPath, PATHS } from "../../config/dbPaths";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { normalizeMachine } from "../../utils/hubHelpers";
import { useNotifications } from '../../contexts/NotificationContext';
import { fetchScopedEfficiencyHours } from "../../utils/efficiencyScopedReader";
import { executeAtpsOccupancyExport, getAtpsExportMonitor, previewAtpsOccupancyExport } from "../../services/planningSecurityService";

type AnyRecord = Record<string, any>;
type LeadTimeRow = { station: string; orderId: string; hours: number };

const asPath = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((segment) => String(segment)) : [];

const toRows = (snap: any): AnyRecord[] =>
  Array.isArray(snap?.docs)
    ? snap.docs.map((d: any) => ({ id: d?.id, ...((d?.data?.() as AnyRecord) || {}) }))
    : [];

const getCollectionRef = (dbRef: any, pathLike: unknown): any | null => {
  const path = asPath(pathLike);
  if (!path.length) return null;
  return (collection as any)(dbRef, ...path);
};

const getDocRef = (dbRef: any, pathLike: unknown): any | null => {
  const path = asPath(pathLike);
  if (path.length < 2) return null;
  return (doc as any)(dbRef, ...path);
};

/**
 * AdminReportsView - Centrale Rapportage Module
 * Biedt diverse rapportages voor productie, kwaliteit, efficiency en prestaties
 */
const AdminReportsView = () => {
  const { t } = useTranslation();
  const readDb = db;
  const readPaths = PATHS;
  const usePilotReadData = false;
  const getArchiveItemsPathForSource = (year: number | string) => getArchiveItemsPath(year);
  
  // State
  const { notify } = useNotifications();
  const [selectedCategory, setSelectedCategory] = useState<AnyRecord | null>(null);
  const [selectedReport, setSelectedReport] = useState<AnyRecord | null>(null);
  const [dateRange, setDateRange] = useState("week"); // 'today', 'week', 'month', 'custom'
  const [customStartDate] = useState("");
  const [customEndDate] = useState("");
  const [filters, setFilters] = useState({
    station: "ALL",
    operator: "ALL",
    product: "ALL",
    status: "ALL",
  });
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<AnyRecord | null>(null);
  const [offeredDepartmentFilter, setOfferedDepartmentFilter] = useState("ALL");
  const [offeredWorkstationFilter, setOfferedWorkstationFilter] = useState("ALL");
  const [offeredKpiFilter, setOfferedKpiFilter] = useState("ALL"); // ALL | COMPLETED | OFFERED | PRODUCED_NOT_OFFERED
  const [productionDepartmentFilter, setProductionDepartmentFilter] = useState("ALL");
  const [factoryDepartments, setFactoryDepartments] = useState<AnyRecord[]>([]);
  const [kpiPopup, setKpiPopup] = useState<{ open: boolean; type: string | null }>({ open: false, type: null }); // COMPLETED | OFFERED | PRODUCED_NOT_OFFERED
  const [measurementDetailMode, setMeasurementDetailMode] = useState("current_week"); // current_week | browse_week | all
  const [measurementWeekOffset, setMeasurementWeekOffset] = useState(0);
  const [measurementLotNumberSearch, setMeasurementLotNumberSearch] = useState("");
  const [atpsPreviewLoading, setAtpsPreviewLoading] = useState(false);
  const [atpsLiveLoading, setAtpsLiveLoading] = useState(false);
  const [atpsMonitorLoading, setAtpsMonitorLoading] = useState(false);
  const [atpsPreviewLast, setAtpsPreviewLast] = useState<AnyRecord | null>(null);
  const [atpsMonitor, setAtpsMonitor] = useState<AnyRecord | null>(null);

  const runAtpsDryRunPreview = async () => {
    setAtpsPreviewLoading(true);
    try {
      const result = await previewAtpsOccupancyExport({
        limit: 200,
        dryRun: true,
        executeLive: false,
      });

      setAtpsPreviewLast(result as AnyRecord);

      const totals = (result as AnyRecord)?.totals || {};
      const mode = String((result as AnyRecord)?.mode || "passive");
      const noopReason = String((result as AnyRecord)?.noopReason || "");
      notify(
        `ATPS dry-run klaar: ${Number(totals.count || 0)} records, ${Number(totals.hoursWorked || 0)} uur (${mode}). ${noopReason}`.trim()
      );
    } catch (error) {
      console.error("ATPS dry-run preview fout:", error);
      notify("ATPS dry-run mislukt. Zie console voor details.");
    } finally {
      setAtpsPreviewLoading(false);
    }
  };

  const refreshAtpsMonitor = async () => {
    setAtpsMonitorLoading(true);
    try {
      const result = await getAtpsExportMonitor({ runsLimit: 12, previewLimit: 8 });
      setAtpsMonitor(result as AnyRecord);
    } catch (error) {
      console.error("ATPS monitor ophalen fout:", error);
      notify("ATPS monitor kon niet geladen worden.");
    } finally {
      setAtpsMonitorLoading(false);
    }
  };

  const runAtpsLiveExport = async () => {
    const confirmed = window.confirm("Live ATPS export starten? Alleen records met atpsExported = false worden verwerkt.");
    if (!confirmed) return;

    setAtpsLiveLoading(true);
    try {
      const result = await executeAtpsOccupancyExport({ limit: 250 });
      const delivery = (result as AnyRecord)?.delivery || {};
      notify(
        `ATPS live export afgerond: marked ${Number(delivery.markedExported || 0)}, retry queue ${Number(delivery.queuedForRetry || 0)}.`
      );
      await refreshAtpsMonitor();
    } catch (error) {
      console.error("ATPS live export fout:", error);
      notify("ATPS live export mislukt. Bekijk monitor/retry queue.");
      await refreshAtpsMonitor();
    } finally {
      setAtpsLiveLoading(false);
    }
  };

  useEffect(() => {
    refreshAtpsMonitor();
  }, []);

  useEffect(() => {
    const loadFactoryDepartments = async () => {
      try {
        const configRef = getDocRef(readDb, readPaths.FACTORY_CONFIG);
        if (!configRef) {
          setFactoryDepartments([]);
          return;
        }
        const configSnap = await getDoc(configRef);
        if (!configSnap.exists()) {
          setFactoryDepartments([]);
          return;
        }

        const data = (configSnap.data() || {}) as AnyRecord;
        const departments = Array.isArray(data.departments) ? data.departments : [];
        setFactoryDepartments(departments);
      } catch (error) {
        console.error("Error loading factory departments:", error);
        setFactoryDepartments([]);
      }
    };

    loadFactoryDepartments();
  }, [readDb, readPaths]);

  const factoryDepartmentMeta = useMemo(() => {
    const normalizeDeptLabel = (value: unknown) =>
      String(value || "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    const toDisplayDeptLabel = (value: unknown) => {
      const normalized = normalizeDeptLabel(value);
      if (!normalized) return "Onbekend";
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    };

    const list = (factoryDepartments || []).map((dept: AnyRecord) => {
      const key = String(dept?.slug || dept?.id || dept?.name || "").trim().toLowerCase();
      const label = toDisplayDeptLabel(dept?.name || dept?.slug || dept?.id || "Onbekend");
      const stations = (dept?.stations || [])
        .filter((s: AnyRecord) => s.isAvailableForPlanning !== false)
        .map((s: AnyRecord) => normalizeMachine(s?.name || s?.id || ""))
        .filter(Boolean);
      return { key, label, stations };
    }).filter((d) => d.key);

    const byKey = list.reduce((acc: Record<string, { key: string; label: string; stations: string[] }>, d) => {
      acc[d.key] = d;
      return acc;
    }, {});

    const byLabel = list.reduce((acc: Record<string, { label: string; keys: Set<string>; stations: Set<string> }>, d) => {
      const normalizedLabel = normalizeDeptLabel(d.label) || "onbekend";
      const displayLabel = toDisplayDeptLabel(d.label);
      if (!acc[normalizedLabel]) {
        acc[normalizedLabel] = {
          label: displayLabel,
          keys: new Set(),
          stations: new Set(),
        };
      }
      acc[normalizedLabel].keys.add(d.key);
      d.stations.forEach((s: string) => acc[normalizedLabel].stations.add(s));
      return acc;
    }, {});

    const byLabelList = Object.values(byLabel).map((entry) => ({
      label: entry.label,
      keys: Array.from(entry.keys),
      stations: Array.from(entry.stations),
    }));

    const keyToLabel: Record<string, string> = {};
    const normalizedLabelToLabel: Record<string, string> = {};
    const stationToLabel: Record<string, string> = {};

    byLabelList.forEach((entry) => {
      const normalizedLabel = normalizeDeptLabel(entry.label);
      if (normalizedLabel) normalizedLabelToLabel[normalizedLabel] = entry.label;
      entry.keys.forEach((k) => {
        keyToLabel[String(k || "").trim().toLowerCase()] = entry.label;
      });
      entry.stations.forEach((s) => {
        const ns = normalizeMachine(s);
        if (ns) stationToLabel[ns] = entry.label;
      });
    });

    return { list, byKey, byLabelList, keyToLabel, normalizedLabelToLabel, stationToLabel };
  }, [factoryDepartments]);

  // Report Categories
  const reportCategories = [
    {
      id: "production",
      title: "Productie Rapporten",
      icon: <Factory size={24} className="text-blue-600" />,
      color: "bg-blue-50 border-blue-200",
      description: "Productie-output, doorlooptijden en planning",
      reports: [
        {
          id: "production_output",
          title: "Productie Output",
          description: "Totaal geproduceerde eenheden per werkstation en periode",
          icon: <Package size={20} />,
          metrics: ["total_produced", "by_station", "by_shift", "completion_rate"],
        },
        {
          id: "lead_time",
          title: "Doorlooptijd Analyse",
          description: "Gemiddelde doorlooptijd per stap en product",
          icon: <Clock size={20} />,
          metrics: ["avg_lead_time", "min_max", "by_product", "bottlenecks"],
        },
        {
          id: "order_completion",
          title: "Order Voltooiing",
          description: "Status van orders en planning vs. realiteit",
          icon: <Target size={20} />,
          metrics: ["completed_orders", "delayed_orders", "on_time_percentage", "backlog"],
        },
        {
          id: "wip_status",
          title: "Work In Progress",
          description: "Overzicht van producten onderweg in de fabriek",
          icon: <Activity size={20} />,
          metrics: ["total_wip", "by_station", "by_order", "flow_status"],
        },
        {
          id: "offered_totals",
          title: "Totaal Aangeboden (Dag/Week)",
          description: "Aantal aangeboden producten richting eindinspectie per dag of week",
          icon: <BarChart3 size={20} />,
          metrics: ["offered_total", "by_day", "by_week", "bm01_flow"],
        },
      ],
    },
    {
      id: "quality",
      title: "Kwaliteit Rapporten",
      icon: <CheckCircle2 size={24} className="text-green-600" />,
      color: "bg-green-50 border-green-200",
      description: "Afkeuringen, herwerk en first-time-right ratio",
      reports: [
        {
          id: "rejection_analysis",
          title: "Afkeur Analyse",
          description: "Overzicht van afkeuringen per reden en werkstation",
          icon: <XCircle size={20} />,
          metrics: ["total_rejections", "by_reason", "by_station", "rejection_rate"],
        },
        {
          id: "first_time_right",
          title: "First Time Right",
          description: "FTR percentage per werkstation en operator",
          icon: <CheckCircle2 size={20} />,
          metrics: ["ftr_percentage", "by_station", "by_operator", "trend"],
        },
        {
          id: "rework_tracking",
          title: "Herwerk Tracking",
          description: "Producten in tijdelijke afkeur en herstelstatus",
          icon: <AlertTriangle size={20} />,
          metrics: ["temp_reject_count", "avg_repair_time", "by_station", "success_rate"],
        },
        {
          id: "inspection_results",
          title: "Inspectie Resultaten",
          description: "Resultaten van eindcontrole en tussentijdse inspecties",
          icon: <CheckCircle2 size={20} />,
          metrics: ["passed_inspections", "failed_inspections", "by_product", "by_inspector"],
        },
        {
          id: "temp_reject_overview",
          title: "Tijdelijke Afkeur Overzicht",
          description: "Alle tijdelijke afkeuringen inclusief reden en station",
          icon: <AlertTriangle size={20} />,
          metrics: ["temp_reject_total", "by_station", "by_reason", "open_temp_rejects"],
        },
        {
          id: "product_measurements",
          title: "Product Metingen",
          description: "Overzicht van metingen vastgelegd tijdens productie",
          icon: <LineChart size={20} />,
          metrics: ["products_with_measurements", "measurement_fields", "avg_values", "coverage"],
        },
      ],
    },
    {
      id: "efficiency",
      title: "Efficiency Rapporten",
      icon: <TrendingUp size={24} className="text-purple-600" />,
      color: "bg-purple-50 border-purple-200",
      description: "OEE, machine-utilization en productiviteit",
      reports: [
        {
          id: "oee_analysis",
          title: "OEE Analyse",
          description: "Overall Equipment Effectiveness per machine",
          icon: <Zap size={20} />,
          metrics: ["availability", "performance", "quality", "oee_score"],
        },
        {
          id: "machine_utilization",
          title: "Machine Bezetting",
          description: "Beschikbaarheid en gebruik van werkstations",
          icon: <Factory size={20} />,
          metrics: ["utilization_rate", "idle_time", "productive_time", "by_station"],
        },
        {
          id: "cycle_time",
          title: "Cyclustijd Analyse",
          description: "Werkelijke vs. standaard cyclustijden",
          icon: <Clock size={20} />,
          metrics: ["actual_vs_standard", "variance", "by_product", "by_operator"],
        },
        {
          id: "downtime_analysis",
          title: "Downtime Analyse",
          description: "Stilstand oorzaken en duur",
          icon: <AlertTriangle size={20} />,
          metrics: ["total_downtime", "by_reason", "by_station", "mtbf_mttr"],
        },
        {
          id: "worked_hours",
          title: "Gewerkte Uren",
          description: "Totaal gewerkte uren per station en periode",
          icon: <Clock size={20} />,
          metrics: ["total_hours", "by_station", "hours_per_day", "hours_per_week"],
        },
      ],
    },
    {
      id: "personnel",
      title: "Personeel Rapporten",
      icon: <Users size={24} className="text-orange-600" />,
      color: "bg-orange-50 border-orange-200",
      description: "Operator prestaties, training en bezetting",
      reports: [
        {
          id: "operator_performance",
          title: "Operator Prestaties",
          description: "Productiviteit en kwaliteit per operator",
          icon: <Users size={20} />,
          metrics: ["units_per_operator", "quality_score", "efficiency", "certifications"],
        },
        {
          id: "shift_analysis",
          title: "Ploegen Analyse",
          description: "Vergelijking tussen ochtend, middag en nacht",
          icon: <Clock size={20} />,
          metrics: ["output_by_shift", "quality_by_shift", "efficiency_by_shift", "attendance"],
        },
        {
          id: "training_matrix",
          title: "Training Matrix",
          description: "Vaardighedenniveau en certificeringen",
          icon: <Target size={20} />,
          metrics: ["certified_operators", "training_gaps", "by_skill", "by_station"],
        },
        {
          id: "attendance_overview",
          title: "Aanwezigheid Overzicht",
          description: "Bezetting en bezettingsgraad",
          icon: <Users size={20} />,
          metrics: ["scheduled_vs_actual", "absences", "overtime", "by_department"],
        },
      ],
    },
    {
      id: "inventory",
      title: "Voorraad & Materiaal",
      icon: <Box size={24} className="text-teal-600" />,
      color: "bg-teal-50 border-teal-200",
      description: "Voorraad, materiaalgebruik en waste",
      reports: [
        {
          id: "inventory_status",
          title: "Voorraad Status",
          description: "Actuele voorraad per locatie en productgroep",
          icon: <Package size={20} />,
          metrics: ["stock_levels", "by_location", "low_stock_alerts", "turnover_rate"],
        },
        {
          id: "material_consumption",
          title: "Materiaalverbruik",
          description: "Verbruik vs. planning en waste analyse",
          icon: <Activity size={20} />,
          metrics: ["actual_vs_planned", "waste_percentage", "by_product", "cost_impact"],
        },
        {
          id: "lot_traceability",
          title: "Lot Traceerbaarheid",
          description: "Volledige tracking van lotnummers door productie",
          icon: <FileText size={20} />,
          metrics: ["lot_history", "quality_by_lot", "material_batch", "customer_shipment"],
        },
      ],
    },
    {
      id: "custom",
      title: "Custom Rapporten",
      icon: <FileSpreadsheet size={24} className="text-indigo-600" />,
      color: "bg-indigo-50 border-indigo-200",
      description: "Maatwerk rapportages en data exports",
      reports: [
        {
          id: "data_export",
          title: "Data Export",
          description: "Export van ruwe data naar Excel of CSV",
          icon: <Download size={20} />,
          metrics: ["custom_fields", "date_range", "filters", "formats"],
        },
        {
          id: "dashboard_widgets",
          title: "Dashboard Widgets",
          description: "Configureerbare live widgets voor Chief Dashboard",
          icon: <BarChart3 size={20} />,
          metrics: ["real_time", "custom_kpis", "visual_types", "auto_refresh"],
        },
      ],
    },
  ];

  // Helper: Get date range for queries
  const getDateRange = () => {
    const now = new Date();
    let startDate, endDate;

    switch (dateRange) {
      case "today":
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case "week":
        startDate = startOfWeek(now, { weekStartsOn: 1 });
        endDate = endOfWeek(now, { weekStartsOn: 1 });
        break;
      case "month":
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        break;
      case "custom":
        startDate = customStartDate ? new Date(customStartDate) : subDays(now, 30);
        endDate = customEndDate ? new Date(customEndDate) : now;
        break;
      default:
        startDate = startOfWeek(now, { weekStartsOn: 1 });
        endDate = endOfWeek(now, { weekStartsOn: 1 });
    }

    return { startDate, endDate };
  };

  const getItemDate = (item: AnyRecord) => {
    const candidates = [
      item?.timestamps?.finished,
      item?.timestamps?.completed,
      item?.timestamps?.eindinspectie_start,
      item?.timestamps?.bm01_start,
      item?.timestamps?.nabewerking_end,
      item?.timestamps?.lossen_end,
      item?.timestamps?.wikkelen_end,
      item?.timestamps?.station_start,
      item?.updatedAt,
      item?.timestamp,
      item?.date,
      item?.createdAt,
    ];
    for (const value of candidates) {
      if (!value) continue;
      if (typeof value?.toDate === "function") return value.toDate();
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
  };

  const getDepartmentLabel = (item: AnyRecord) => {
    const normalizeRaw = (value: unknown) =>
      String(value || "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    const rawDepartment = normalizeRaw(item?.department || item?.originalDepartment || "");

    // Station-naar-afdeling mapping uit factory config heeft prioriteit
    // omdat data soms een verouderde department field bevat.
    const machineCandidate =
      item?.originMachine ||
      item?.machine ||
      item?.currentStation ||
      item?.lastStation ||
      "";
    const normalizedMachine = normalizeMachine(machineCandidate);
    if (normalizedMachine && factoryDepartmentMeta.stationToLabel[normalizedMachine]) {
      return factoryDepartmentMeta.stationToLabel[normalizedMachine];
    }

    if (rawDepartment && factoryDepartmentMeta.keyToLabel[rawDepartment]) {
      return factoryDepartmentMeta.keyToLabel[rawDepartment];
    }

    if (rawDepartment && factoryDepartmentMeta.normalizedLabelToLabel[rawDepartment]) {
      return factoryDepartmentMeta.normalizedLabelToLabel[rawDepartment];
    }

    const exact = factoryDepartmentMeta.list.find((d) => d.key === rawDepartment);
    if (exact) return exact.label;

    const byContains = factoryDepartmentMeta.list.find(
      (d) => rawDepartment && (d.key.includes(rawDepartment) || rawDepartment.includes(d.key))
    );
    if (byContains) return byContains.label;

    const findByKeyword = (keyword: string) =>
      factoryDepartmentMeta.byLabelList.find((d) => d.label.toLowerCase().includes(keyword))?.label;

    if (rawDepartment.includes("pipe")) return findByKeyword("pipe") || "Pipes";
    if (rawDepartment.includes("fit")) return findByKeyword("fit") || "Fittings";
    if (rawDepartment.includes("spool")) return findByKeyword("spool") || "Spools";

    const n = normalizedMachine;

    if (["BH05", "BH07", "BH08", "BH09", "BA05", "BA07", "BA08", "BA09"].includes(n)) {
      return findByKeyword("pipe") || "Pipes";
    }
    if (n.includes("SPOOL")) return findByKeyword("spool") || "Spools";
    if (
      n.includes("BM01") ||
      n.includes("NABEWERK") ||
      n.includes("MAZAK") ||
      ["BH11", "BH12", "BH15", "BH16", "BH17", "BH18", "BH31"].includes(n)
    ) {
      return findByKeyword("fit") || "Fittings";
    }

    return "Onbekend";
  };

  const getDepartmentDisplayLabel = (deptKey: unknown) => {
    const raw = String(deptKey || "")
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) return "Onbekend";

    const key = raw.toLowerCase();
    if (factoryDepartmentMeta.keyToLabel[key]) return factoryDepartmentMeta.keyToLabel[key];
    if (factoryDepartmentMeta.normalizedLabelToLabel[key]) return factoryDepartmentMeta.normalizedLabelToLabel[key];
    if (key === "onbekend") return "Onbekend";

    return raw;
  };

  const getWorkstationLabel = (item: AnyRecord) => {
    const machineCandidate =
      item?.originMachine ||
      item?.machine ||
      item?.currentStation ||
      item?.lastStation ||
      "";
    const n = normalizeMachine(machineCandidate);
    if (!n) return "Onbekend";

    if (n === "BA05") return "BH05";
    if (n === "BA07") return "BH07";
    if (n === "BA08") return "BH08";
    if (n === "BA09") return "BH09";
    return n;
  };

  const isDepartmentScopedReport = (reportId: string) =>
    ["production_output", "lead_time", "order_completion", "wip_status"].includes(reportId);

  const openKpiPopup = (type: string) => {
    setOfferedKpiFilter(type);
    setKpiPopup({ open: true, type });
  };

  const closeKpiPopup = () => {
    setKpiPopup({ open: false, type: null });
  };

  const formatHoursAsHM = (hoursValue: unknown) => {
    const numeric = Number(hoursValue || 0);
    if (!Number.isFinite(numeric) || numeric < 0) return "0u 00m";
    const totalMinutes = Math.round(numeric * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}u ${String(m).padStart(2, "0")}m`;
  };

  const getMeasurementDetailDateRange = () => {
    if (measurementDetailMode === "all") {
      return { startDate: null, endDate: null };
    }

    const offsetWeeks = measurementDetailMode === "browse_week" ? measurementWeekOffset : 0;
    const baseDate = subDays(new Date(), offsetWeeks * 7);
    return {
      startDate: startOfWeek(baseDate, { weekStartsOn: 1 }),
      endDate: endOfWeek(baseDate, { weekStartsOn: 1 }),
    };
  };

  const isCompletedAtInspection = (item: AnyRecord) => {
    const status = String(item?.status || "").toLowerCase();
    const step = String(item?.currentStep || "").toLowerCase();
    const station = String(item?.currentStation || "").toLowerCase();
    return (
      status === "completed" ||
      status === "gereed" ||
      step === "finished" ||
      station === "gereed" ||
      !!item?.timestamps?.finished
    );
  };

  const isOfferedToInspection = (item: AnyRecord) => {
    const status = String(item?.status || "").toLowerCase();
    const station = String(item?.currentStation || "").toUpperCase();
    const step = String(item?.currentStep || "").toUpperCase();
    return (
      status.includes("te keuren") ||
      station.includes("BM01") ||
      step.includes("EINDINSPECTIE") ||
      !!item?.timestamps?.eindinspectie_start
    );
  };

  const isProducedButNotOffered = (item: AnyRecord) => {
    if (isCompletedAtInspection(item) || isOfferedToInspection(item)) return false;

    const status = String(item?.status || "").toLowerCase();
    const step = String(item?.currentStep || "").toLowerCase();

    const hasProductionSignals =
      !!item?.timestamps?.station_start ||
      !!item?.timestamps?.started ||
      !!item?.timestamps?.lossen_start ||
      !!item?.timestamps?.nabewerking_start ||
      status === "in_progress" ||
      status === "te nabewerken" ||
      status === "te lossen" ||
      step.includes("wikkel") ||
      step.includes("lossen") ||
      step.includes("nabewerk") ||
      step.includes("in progress");

    return hasProductionSignals;
  };

  const fetchTrackingProductsInRange = async () => {
    const { startDate, endDate } = getDateRange();

    const trackingRef = getCollectionRef(readDb, readPaths.TRACKING);
    if (!trackingRef) return [];

    const trackingQuery = query(trackingRef, limit(3000));
    const trackingSnap = await getDocs(trackingQuery);
    const products: AnyRecord[] = toRows(trackingSnap)
      .filter((p) => {
        const itemDate = getItemDate(p);
        return itemDate ? isWithinInterval(itemDate, { start: startDate, end: endDate }) : true;
      });

    const byDepartment: AnyRecord[] = productionDepartmentFilter !== "ALL"
      ? products.filter((p) => getDepartmentDisplayLabel(getDepartmentLabel(p)) === productionDepartmentFilter)
      : products;

    return filters.station !== "ALL"
      ? byDepartment.filter((p) => (p.currentStation || "").toUpperCase().includes(filters.station))
      : byDepartment;
  };

  // Generic production overview (fallback)
  const fetchProductionData = async () => {
    try {
      const filteredProducts = await fetchTrackingProductsInRange();

      const stationCounts: Record<string, number> = {};
      filteredProducts.forEach((p) => {
        const station = p.currentStation || p.machine || "Unknown";
        stationCounts[station] = (stationCounts[station] || 0) + 1;
      });

      const completed = filteredProducts.filter(
        (p) => p.status === "completed" || p.currentStep === "Finished"
      ).length;
      const inProgress = filteredProducts.filter(
        (p) => p.status !== "completed" && p.currentStep !== "Finished" && p.status !== "rejected"
      ).length;
      const rejected = filteredProducts.filter(
        (p) => p.status === "rejected" || p.currentStep === "REJECTED"
      ).length;

      return {
        summary: {
          total: filteredProducts.length,
          change: 0,
          trend: "up",
          completed,
          inProgress,
          rejected,
        },
        chartData: Object.entries(stationCounts)
          .map(([label, value]) => ({ label, value: Number(value || 0) }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
        details: Object.entries(
          filteredProducts.reduce((acc: Record<string, { name: string; count: number; status: string }>, p) => {
            const orderKey = p.orderId || "Geen Order";
            if (!acc[orderKey]) acc[orderKey] = { name: orderKey, count: 0, status: "in_progress" };
            acc[orderKey].count++;
            if (p.status === "completed") acc[orderKey].status = "completed";
            return acc;
          }, {})
        ).map(([, data], idx) => ({ id: idx + 1, ...data })),
      };
    } catch (error) {
      console.error("Error fetching production data:", error);
      throw error;
    }
  };

  const fetchProductionOutputData = async () => {
    try {
      const products = await fetchTrackingProductsInRange();
      const completedProducts = products.filter((p) => p.status === "completed" || p.currentStep === "Finished");

      const byStation: Record<string, number> = {};
      const byShift = { Ochtend: 0, Middag: 0, Nacht: 0 };
      completedProducts.forEach((p) => {
        const station = p.currentStation || p.machine || "Unknown";
        byStation[station] = (byStation[station] || 0) + 1;

        const d = getItemDate(p);
        const hour = d ? d.getHours() : 0;
        if (hour >= 6 && hour < 14) byShift.Ochtend += 1;
        else if (hour >= 14 && hour < 22) byShift.Middag += 1;
        else byShift.Nacht += 1;
      });

      return {
        summary: {
          total: completedProducts.length,
          change: 0,
          trend: "up",
          completed: completedProducts.length,
          inProgress: products.length - completedProducts.length,
          rejected: products.filter((p) => p.status === "rejected" || p.currentStep === "REJECTED").length,
        },
        chartData: Object.entries(byStation)
          .map(([label, value]) => ({ label, value: Number(value || 0) }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
        details: Object.entries(byShift).map(([name, count], idx) => ({
          id: idx + 1,
          name: `Shift ${name}`,
          count,
          status: "completed",
        })),
      };
    } catch (error) {
      console.error("Error fetching production output data:", error);
      throw error;
    }
  };

  const fetchLeadTimeData = async () => {
    try {
      const products = await fetchTrackingProductsInRange();

      const leadTimes = products
        .map((p) => {
          const start = p?.timestamps?.station_start?.toDate?.()
            || (p?.timestamps?.station_start ? new Date(p.timestamps.station_start) : null)
            || p?.timestamps?.started?.toDate?.()
            || (p?.timestamps?.started ? new Date(p.timestamps.started) : null)
            || p?.createdAt?.toDate?.()
            || (p?.createdAt ? new Date(p.createdAt) : null);

          const end = p?.timestamps?.finished?.toDate?.()
            || (p?.timestamps?.finished ? new Date(p.timestamps.finished) : null)
            || p?.timestamps?.completed?.toDate?.()
            || (p?.timestamps?.completed ? new Date(p.timestamps.completed) : null)
            || p?.updatedAt?.toDate?.()
            || (p?.updatedAt ? new Date(p.updatedAt) : null);

          if (!start || !end) return null;
          const diffMs = end.getTime() - start.getTime();
          if (!Number.isFinite(diffMs) || diffMs <= 0) return null;

          return {
            station: p.currentStation || p.machine || "Unknown",
            orderId: p.orderId || "Geen Order",
            hours: diffMs / (1000 * 60 * 60),
          };
        })
        .filter((x): x is LeadTimeRow => Boolean(x));

      const values = leadTimes.map((x) => x.hours);
      const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 0;

      const byStation: Record<string, { total: number; count: number }> = {};
      leadTimes.forEach((x) => {
        if (!byStation[x.station]) byStation[x.station] = { total: 0, count: 0 };
        byStation[x.station].total += x.hours;
        byStation[x.station].count += 1;
      });

      return {
        summary: {
          total: Number(avg.toFixed(1)),
          change: 0,
          trend: "down",
        },
        chartData: Object.entries(byStation)
          .map(([label, v]) => ({ label, value: Number(((v.total || 0) / Math.max(v.count || 1, 1)).toFixed(1)) }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
        details: [
          { id: 1, name: "Gemiddelde", count: `${Number(avg.toFixed(1))} u (${formatHoursAsHM(avg)})`, status: "active" },
          { id: 2, name: "Kortste", count: `${Number(min.toFixed(1))} u (${formatHoursAsHM(min)})`, status: "active" },
          { id: 3, name: "Langste", count: `${Number(max.toFixed(1))} u (${formatHoursAsHM(max)})`, status: "active" },
        ],
      };
    } catch (error) {
      console.error("Error fetching lead time data:", error);
      throw error;
    }
  };

  const fetchOrderCompletionData = async () => {
    try {
      const products = await fetchTrackingProductsInRange();
      const now = new Date();

      const byOrder: Record<string, { orderId: string; total: number; completed: number; dueDate: any }> = {};
      products.forEach((p) => {
        const orderId = p.orderId || "Geen Order";
        if (!byOrder[orderId]) {
          byOrder[orderId] = {
            orderId,
            total: 0,
            completed: 0,
            dueDate: p.dueDate || p.deliveryDate || p.plannedDate || null,
          };
        }
        byOrder[orderId].total += 1;
        if (p.status === "completed" || p.currentStep === "Finished") byOrder[orderId].completed += 1;
      });

      const orders = Object.values(byOrder) as Array<{ orderId: string; total: number; completed: number; dueDate: any }>;
      const completedOrders = orders.filter((o) => o.total > 0 && o.completed === o.total);
      const inProgressOrders = orders.filter((o) => o.completed > 0 && o.completed < o.total);
      const backlogOrders = orders.filter((o) => o.completed === 0);

      const delayedOrders = orders.filter((o) => {
        if (!o.dueDate) return false;
        const due = o.dueDate?.toDate?.() || new Date(o.dueDate);
        if (!(due instanceof Date) || Number.isNaN(due.getTime())) return false;
        return due < now && o.completed < o.total;
      });

      return {
        summary: {
          total: orders.length,
          change: 0,
          trend: completedOrders.length >= delayedOrders.length ? "up" : "down",
        },
        chartData: [
          { label: "Voltooid", value: completedOrders.length },
          { label: "Lopend", value: inProgressOrders.length },
          { label: "Backlog", value: backlogOrders.length },
          { label: "Vertraagd", value: delayedOrders.length },
        ],
        details: orders
          .sort((a, b) => (b.completed / Math.max(b.total, 1)) - (a.completed / Math.max(a.total, 1)))
          .slice(0, 30)
          .map((o, idx) => ({
            id: idx + 1,
            name: o.orderId,
            count: `${o.completed}/${o.total}`,
            status: o.completed === o.total ? "completed" : o.completed > 0 ? "active" : "in_progress",
          })),
      };
    } catch (error) {
      console.error("Error fetching order completion data:", error);
      throw error;
    }
  };

  const fetchWipStatusData = async () => {
    try {
      const products = await fetchTrackingProductsInRange();
      const wipItems = products.filter((p) => {
        const status = String(p.status || "").toLowerCase();
        const step = String(p.currentStep || "").toLowerCase();
        return !(status === "completed" || step === "finished" || status === "rejected" || step === "rejected");
      });

      const byStep: Record<string, number> = {};
      wipItems.forEach((p) => {
        const step = p.currentStep || p.currentStation || "Onbekend";
        byStep[step] = (byStep[step] || 0) + 1;
      });

      const tempRejectCount = wipItems.filter((p) => {
        const status = String(p.status || "").toLowerCase();
        const step = String(p.currentStep || "").toLowerCase();
        return status.includes("temp") || step.includes("temp");
      }).length;

      return {
        summary: {
          total: wipItems.length,
          change: 0,
          trend: "up",
        },
        chartData: Object.entries(byStep)
          .map(([label, value]) => ({ label, value: Number(value || 0) }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
        details: [
          { id: 1, name: "Actieve WIP Items", count: wipItems.length, status: "active" },
          { id: 2, name: "Temp Reject in WIP", count: tempRejectCount, status: tempRejectCount > 0 ? "temp_reject" : "active" },
        ],
      };
    } catch (error) {
      console.error("Error fetching WIP status data:", error);
      throw error;
    }
  };

  // Fetch quality data
  const fetchQualityData = async () => {
    const { startDate, endDate } = getDateRange();

    try {
      const trackingRef = getCollectionRef(readDb, readPaths.TRACKING);
      if (!trackingRef) {
        return {
          summary: { total: 0, change: 0, trend: "down", ftrPercentage: 0, tempRejects: 0 },
          chartData: [],
          details: [
            { id: 1, name: "Definitieve Afkeur", count: 0, status: "rejected" },
            { id: 2, name: "Tijdelijke Afkeur", count: 0, status: "temp_reject" },
            { id: 3, name: "Goedgekeurd", count: 0, status: "completed" },
          ],
        };
      }

      const trackingQuery = query(trackingRef, limit(3000));
      const trackingSnap = await getDocs(trackingQuery);
      const products: AnyRecord[] = toRows(trackingSnap)
        .filter((p) => {
          const itemDate = getItemDate(p);
          return itemDate ? isWithinInterval(itemDate, { start: startDate, end: endDate }) : true;
        });

      const filteredProducts = filters.station !== "ALL" 
        ? products.filter((p) => (p.currentStation || "").toUpperCase().includes(filters.station))
        : products;

      // Count rejections
      const rejections = filteredProducts.filter(
        (p) => p.status === "rejected" || p.currentStep === "REJECTED"
      );
      const tempRejects = filteredProducts.filter(
        (p) => p.currentStep === "temp_reject" || p.status === "temp_reject"
      );
      const completed = filteredProducts.filter(
        (p) => p.status === "completed" || p.currentStep === "Finished"
      );

      const totalProcessed = completed.length + rejections.length;
      const ftrPercentage = totalProcessed > 0
        ? Number(((completed.length / totalProcessed) * 100).toFixed(1))
        : 0;

      // Rejections by station
      const rejectionsByStation: Record<string, number> = {};
      rejections.forEach((p) => {
        const station = p.currentStation || p.machine || "Unknown";
        rejectionsByStation[station] = (rejectionsByStation[station] || 0) + 1;
      });

      const chartData = Object.entries(rejectionsByStation)
        .map(([label, value]) => ({ label, value: Number(value || 0) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

      return {
        summary: {
          total: rejections.length,
          change: 0, // Could calculate trend
          trend: "down",
          ftrPercentage,
          tempRejects: tempRejects.length,
        },
        chartData,
        details: [
          { id: 1, name: "Definitieve Afkeur", count: rejections.length - tempRejects.length, status: "rejected" },
          { id: 2, name: "Tijdelijke Afkeur", count: tempRejects.length, status: "temp_reject" },
          { id: 3, name: "Goedgekeurd", count: completed.length, status: "completed" },
        ],
      };
    } catch (error) {
      console.error("Error fetching quality data:", error);
      throw error;
    }
  };

  // Fetch efficiency data
  const fetchEfficiencyData = async () => {
    const { startDate, endDate } = getDateRange();

    try {
      // Fetch occupancy data
      const occupancyRef = getCollectionRef(readDb, readPaths.OCCUPANCY);
      if (!occupancyRef) throw new Error("OCCUPANCY path ontbreekt");
      const occupancyQuery = query(occupancyRef, limit(500));
      const occupancySnap = await getDocs(occupancyQuery);
      const occupancy: AnyRecord[] = toRows(occupancySnap);

      // Filter by date range
      const filteredOccupancy = occupancy.filter((occ) => {
        if (!occ.date) return false;
        const occDate = occ.date.toDate ? occ.date.toDate() : new Date(occ.date);
        return isWithinInterval(occDate, { start: startDate, end: endDate });
      });

      // Calculate utilization by station
      const stationUtilization: Record<string, { total: number; productive: number }> = {};
      filteredOccupancy.forEach((occ) => {
        const station = occ.station || occ.machineId || "Unknown";
        if (!stationUtilization[station]) {
          stationUtilization[station] = { total: 0, productive: 0 };
        }
        stationUtilization[station].total++;
        if (occ.operatorNumber || occ.operator) {
          stationUtilization[station].productive++;
        }
      });

      const chartData = Object.entries(stationUtilization)
        .map(([label, data]) => ({
          label,
          value: data.total > 0 ? Math.round((data.productive / data.total) * 100) : 0,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

      const avgUtilization = chartData.length > 0
        ? Math.round(chartData.reduce((sum, d) => sum + d.value, 0) / chartData.length)
        : 0;

      return {
        summary: {
          total: avgUtilization,
          change: 5.2,
          trend: "up",
        },
        chartData,
        details: Object.entries(stationUtilization).map(([station, data], idx) => ({
          id: idx + 1,
          name: station,
          count: `${data.productive}/${data.total}`,
          status: data.productive > 0 ? "active" : "idle",
        })),
      };
    } catch (error) {
      console.error("Error fetching efficiency data:", error);
      throw error;
    }
  };

  // Fetch personnel data
  const fetchPersonnelData = async () => {
    try {
      const personnelRef = getCollectionRef(readDb, readPaths.PERSONNEL);
      if (!personnelRef) throw new Error("PERSONNEL path ontbreekt");
      const personnelQuery = query(personnelRef, limit(200));
      const personnelSnap = await getDocs(personnelQuery);
      const personnel: AnyRecord[] = toRows(personnelSnap);

      // Count by department/role
      const deptCounts: Record<string, number> = {};
      personnel.forEach((p) => {
        const dept = p.department || p.role || "Unknown";
        deptCounts[dept] = (deptCounts[dept] || 0) + 1;
      });

      const chartData = Object.entries(deptCounts)
        .map(([label, value]) => ({ label, value: Number(value || 0) }))
        .sort((a, b) => b.value - a.value);

      return {
        summary: {
          total: personnel.length,
          change: 0,
          trend: "up",
        },
        chartData,
        details: personnel.slice(0, 20).map((p, idx) => ({
          id: idx + 1,
          name: p.name || p.operatorNumber || "Unknown",
          count: p.operatorNumber || "-",
          status: p.active ? "active" : "inactive",
        })),
      };
    } catch (error) {
      console.error("Error fetching personnel data:", error);
      throw error;
    }
  };

  const fetchWorkedHoursData = async () => {
    const { startDate, endDate } = getDateRange();

    try {
      const occupancyRef = getCollectionRef(readDb, readPaths.OCCUPANCY);
      const [hoursRecords, occSnap] = await Promise.all([
        fetchScopedEfficiencyHours({ db: readDb, mode: "active", maxDocs: 3000 }),
        occupancyRef ? getDocs(query(occupancyRef, limit(3000))) : Promise.resolve({ docs: [] } as any),
      ]);

      const normalizeHours = (value: unknown) => {
        const parsed = parseFloat(String(value ?? "0"));
        if (Number.isNaN(parsed)) return 0;
        return parsed;
      };

      const occRecords: AnyRecord[] = toRows(occSnap);

      const combined: AnyRecord[] = [
        ...hoursRecords.map((r) => ({ ...r, _source: "efficiency" })),
        ...occRecords.map((r) => ({ ...r, _source: "occupancy" })),
      ].filter((r) => {
        const d = getItemDate(r);
        return d ? isWithinInterval(d, { start: startDate, end: endDate }) : false;
      });

      const stationHours: Record<string, number> = {};
      const dayHours: Record<string, number> = {};

      combined.forEach((r) => {
        const station = (r.station || r.machineId || r.machineName || "Unknown").toString();
        const hours = normalizeHours(r.hours ?? r.hoursWorked ?? 8);
        const rowDate = getItemDate(r);
        const dayKey = rowDate ? format(rowDate, "yyyy-MM-dd") : "unknown";

        stationHours[station] = (stationHours[station] || 0) + hours;
        dayHours[dayKey] = (dayHours[dayKey] || 0) + hours;
      });

      const totalHours = Object.values(stationHours).reduce((sum, h) => sum + h, 0);

      return {
        summary: {
          total: Number(totalHours.toFixed(1)),
          change: 0,
          trend: "up",
        },
        chartData: Object.entries(stationHours)
          .map(([label, value]) => ({ label, value: Number(value.toFixed(1)) }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
        details: Object.entries(dayHours)
          .sort(([a], [b]) => (a < b ? 1 : -1))
          .map(([day, hours], idx) => ({
            id: idx + 1,
            name: day,
            count: Number(hours.toFixed(1)),
            status: "active",
          }))
          .slice(0, 30),
      };
    } catch (error) {
      console.error("Error fetching worked hours data:", error);
      throw error;
    }
  };

  const fetchTempRejectData = async () => {
    const { startDate, endDate } = getDateRange();

    try {
      const trackingRef = getCollectionRef(readDb, readPaths.TRACKING);
      if (!trackingRef) throw new Error("TRACKING path ontbreekt");
      const trackingSnap = await getDocs(query(trackingRef, limit(4000)));
      const products: AnyRecord[] = toRows(trackingSnap)
        .filter((p) => {
          const itemDate = getItemDate(p);
          return itemDate ? isWithinInterval(itemDate, { start: startDate, end: endDate }) : true;
        });

      const tempRejects = products.filter((p) => {
        const status = String(p.status || "").toLowerCase();
        const step = String(p.currentStep || "").toLowerCase();
        const inspectionStatus = String(p.inspection?.status || "").toLowerCase();
        return (
          status.includes("temp_reject") ||
          step.includes("temp_reject") ||
          inspectionStatus.includes("tijdelijke")
        );
      });

      const byStation: Record<string, number> = {};
      const byReason: Record<string, number> = {};

      tempRejects.forEach((p) => {
        const station = p.currentStation || p.lastStation || p.machine || "Unknown";
        byStation[station] = (byStation[station] || 0) + 1;

        const reasons = Array.isArray(p.inspection?.reasons) ? p.inspection.reasons : [];
        if (reasons.length === 0) {
          byReason["Geen reden opgegeven"] = (byReason["Geen reden opgegeven"] || 0) + 1;
        } else {
          reasons.forEach((r: string) => {
            byReason[r] = (byReason[r] || 0) + 1;
          });
        }
      });

      return {
        summary: {
          total: tempRejects.length,
          change: 0,
          trend: "down",
          tempRejects: tempRejects.length,
        },
        chartData: Object.entries(byStation)
          .map(([label, value]) => ({ label, value: Number(value || 0) }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
        details: Object.entries(byReason)
          .map(([name, count], idx) => ({ id: idx + 1, name, count: Number(count || 0), status: "temp_reject" }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20),
      };
    } catch (error) {
      console.error("Error fetching temp reject data:", error);
      throw error;
    }
  };

  const fetchMeasurementsData = async () => {
    const { startDate, endDate } = getMeasurementDetailDateRange();

    try {
      const effectiveStart = startDate || subDays(new Date(), 365 * 3);
      const effectiveEnd = endDate || new Date();
      const yearStart = effectiveStart.getFullYear();
      const yearEnd = effectiveEnd.getFullYear();
      const years = [];
      for (let y = yearStart; y <= yearEnd; y++) years.push(y);

      const [trackingSnap, ...archiveSnaps] = await Promise.all([
        (() => {
          const trackingRef = getCollectionRef(readDb, readPaths.TRACKING);
          if (!trackingRef) return Promise.resolve({ docs: [] } as any);
          return getDocs(query(trackingRef, limit(4000)));
        })(),
        ...years.map((year) =>
          getDocs(
            query(
              (collection as any)(readDb, ...asPath(getArchiveItemsPathForSource(year))),
              limit(4000)
            )
          )
        ),
      ]);

      const trackingProducts: AnyRecord[] = toRows(trackingSnap).map((row: AnyRecord) => ({ ...row, source: "tracking" }));
      const archivedProducts = archiveSnaps.flatMap((snap) =>
        toRows(snap).map((row: AnyRecord) => ({ ...row, source: "archive" }))
      );

      // De-dupe op lot/id: voorkeur voor tracking-record als beide bestaan
      const mapByKey = new Map();
      ([...archivedProducts, ...trackingProducts] as AnyRecord[]).forEach((p) => {
        const key = p.lotNumber || p.id;
        if (!key) return;
        mapByKey.set(key, p);
      });

      const products = Array.from(mapByKey.values())
        .filter((p) => {
          if (!startDate || !endDate) return true;
          const itemDate = getItemDate(p);
          return itemDate ? isWithinInterval(itemDate, { start: startDate, end: endDate }) : true;
        });

      const withMeasurements = products.filter((p) => p.measurements && typeof p.measurements === "object");

      const measurementFieldCount: Record<string, number> = {};
      withMeasurements.forEach((p) => {
        Object.keys(p.measurements || {}).forEach((field) => {
          measurementFieldCount[field] = (measurementFieldCount[field] || 0) + 1;
        });
      });

      const tgKey = Object.keys(measurementFieldCount).find((k) => k.toLowerCase() === "tg") || "TG";
      const brixKey = Object.keys(measurementFieldCount).find((k) => k.toLowerCase() === "brix") || "Brix";
      measurementFieldCount[tgKey] = measurementFieldCount[tgKey] || 0;
      measurementFieldCount[brixKey] = measurementFieldCount[brixKey] || 0;

      return {
        summary: {
          total: withMeasurements.length,
          change: 0,
          trend: "up",
        },
        chartData: Object.entries(measurementFieldCount)
          .map(([label, value]) => ({ label, value: Number(value || 0) }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
        details: withMeasurements.slice(0, 30).map((p, idx) => ({
          id: idx + 1,
          name: `${p.lotNumber || p.id}${p.source === "archive" ? " (archief)" : ""}`,
          count: Object.keys(p.measurements || {}).length,
          tgValue: (p.measurements?.TG ?? p.measurements?.tg ?? p.measurements?.Tg ?? "-").toString(),
          brixValue: (p.measurements?.Brix ?? p.measurements?.brix ?? p.measurements?.BRIX ?? "-").toString(),
          measurementSummary: Object.entries(p.measurements || {})
            .slice(0, 5)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" | "),
          status: "completed",
        })),
      };
    } catch (error) {
      console.error("Error fetching measurements data:", error);
      throw error;
    }
  };

  const fetchOfferedTotalsData = async () => {
    const { startDate, endDate } = getDateRange();

    try {
      const yearStart = startDate.getFullYear();
      const yearEnd = endDate.getFullYear();
      const years = [];
      for (let y = yearStart; y <= yearEnd; y++) years.push(y);

      const [trackingSnap, ...archiveSnaps] = await Promise.all([
        (() => {
          const trackingRef = getCollectionRef(readDb, readPaths.TRACKING);
          if (!trackingRef) return Promise.resolve({ docs: [] } as any);
          return getDocs(query(trackingRef, limit(4000)));
        })(),
        ...years.map((year) =>
          getDocs(
            query(
              (collection as any)(readDb, ...asPath(getArchiveItemsPathForSource(year))),
              limit(4000)
            )
          )
        ),
      ]);

      const trackingProducts: AnyRecord[] = toRows(trackingSnap).map((row: AnyRecord) => ({ ...row, source: "tracking" }));
      const archivedProducts = archiveSnaps.flatMap((snap) =>
        toRows(snap).map((row: AnyRecord) => ({ ...row, source: "archive" }))
      );

      const byKey = new Map();
      ([...archivedProducts, ...trackingProducts] as AnyRecord[]).forEach((p) => {
        const key = p.lotNumber || p.id;
        if (!key) return;
        byKey.set(key, p);
      });
      const allProducts = Array.from(byKey.values());

      const getDepartmentFilterLabel = (item: AnyRecord) => getDepartmentDisplayLabel(getDepartmentLabel(item));

      const itemMatchesOfferedFilters = (item: AnyRecord) => {
        const department = getDepartmentFilterLabel(item);
        const workstation = getWorkstationLabel(item);
        if (offeredDepartmentFilter !== "ALL" && department !== offeredDepartmentFilter) return false;
        if (offeredWorkstationFilter !== "ALL" && workstation !== offeredWorkstationFilter) return false;
        return true;
      };

      const allDepartments = factoryDepartmentMeta.byLabelList.map((d: AnyRecord) => d.label);
      const departmentWorkstationsMap = factoryDepartmentMeta.byLabelList.reduce((acc: Record<string, string[]>, d) => {
        acc[d.label] = d.stations;
        return acc;
      }, {});

      const allWorkstations = Array.from(
        new Set(factoryDepartmentMeta.byLabelList.flatMap((d: AnyRecord) => d.stations || []))
      ).sort();

      const filteredWorkstations = offeredDepartmentFilter === "ALL"
        ? allWorkstations
        : (departmentWorkstationsMap[offeredDepartmentFilter] || []).slice().sort();

      // Gereedmeldingen tellen op gereedmeld-datum (timestamps.finished), niet op planningsweek.
      const completedItems = allProducts.filter((p) => {
        if (!isCompletedAtInspection(p)) return false;
        const finishedDate = p?.timestamps?.finished?.toDate?.()
          || (p?.timestamps?.finished ? new Date(p.timestamps.finished) : null)
          || p?.timestamps?.completed?.toDate?.()
          || (p?.timestamps?.completed ? new Date(p.timestamps.completed) : null)
          || getItemDate(p);
        if (!finishedDate || Number.isNaN(finishedDate.getTime())) return false;
        return isWithinInterval(finishedDate, { start: startDate, end: endDate });
      }).filter(itemMatchesOfferedFilters);

      const activeProducedNotOffered = trackingProducts.filter((p) => {
        const itemDate = getItemDate(p);
        if (itemDate && !isWithinInterval(itemDate, { start: startDate, end: endDate })) return false;
        return isProducedButNotOffered(p);
      }).filter(itemMatchesOfferedFilters);

      const offeredItems = trackingProducts.filter((p) => {
        const itemDate = getItemDate(p) || p.timestamps?.eindinspectie_start?.toDate?.();
        if (itemDate && !isWithinInterval(itemDate, { start: startDate, end: endDate })) return false;
        return isOfferedToInspection(p);
      }).filter(itemMatchesOfferedFilters);

      const grouped: Record<string, number> = {};
      offeredItems.forEach((p) => {
        const d = p.timestamps?.eindinspectie_start?.toDate?.() || getItemDate(p);
        if (!d) return;
        const key = dateRange === "month" ? `Week ${format(d, "II")} (${format(d, "yyyy")})` : format(d, "yyyy-MM-dd");
        grouped[key] = (grouped[key] || 0) + 1;
      });

      const departmentBuckets: Record<string, AnyRecord> = {};
      completedItems.forEach((p) => {
        const dept = getDepartmentFilterLabel(p);
        if (!departmentBuckets[dept]) {
          departmentBuckets[dept] = {
            department: dept,
            completedAtInspection: 0,
            offeredToInspection: 0,
            producedNotOffered: 0,
          };
        }
        departmentBuckets[dept].completedAtInspection += 1;
      });

      activeProducedNotOffered.forEach((p) => {
        const dept = getDepartmentFilterLabel(p);
        if (!departmentBuckets[dept]) {
          departmentBuckets[dept] = {
            department: dept,
            completedAtInspection: 0,
            offeredToInspection: 0,
            producedNotOffered: 0,
          };
        }
        departmentBuckets[dept].producedNotOffered += 1;
      });

      offeredItems.forEach((p) => {
        const dept = getDepartmentFilterLabel(p);
        if (!departmentBuckets[dept]) {
          departmentBuckets[dept] = {
            department: dept,
            completedAtInspection: 0,
            offeredToInspection: 0,
            producedNotOffered: 0,
          };
        }
        departmentBuckets[dept].offeredToInspection += 1;
      });

      const departmentOverview = (Object.values(departmentBuckets) as AnyRecord[])
        .map((d: AnyRecord) => ({
          ...d,
          totalReported: d.completedAtInspection,
        }))
        .sort((a: AnyRecord, b: AnyRecord) => b.completedAtInspection - a.completedAtInspection || b.producedNotOffered - a.producedNotOffered);

      const stationBuckets: Record<string, AnyRecord> = {};
      completedItems.forEach((p) => {
        const station = getWorkstationLabel(p);
        if (!stationBuckets[station]) {
          stationBuckets[station] = {
            workstation: station,
            completedAtInspection: 0,
            offeredToInspection: 0,
            producedNotOffered: 0,
          };
        }
        stationBuckets[station].completedAtInspection += 1;
      });

      activeProducedNotOffered.forEach((p) => {
        const station = getWorkstationLabel(p);
        if (!stationBuckets[station]) {
          stationBuckets[station] = {
            workstation: station,
            completedAtInspection: 0,
            offeredToInspection: 0,
            producedNotOffered: 0,
          };
        }
        stationBuckets[station].producedNotOffered += 1;
      });

      offeredItems.forEach((p) => {
        const station = getWorkstationLabel(p);
        if (!stationBuckets[station]) {
          stationBuckets[station] = {
            workstation: station,
            completedAtInspection: 0,
            offeredToInspection: 0,
            producedNotOffered: 0,
          };
        }
        stationBuckets[station].offeredToInspection += 1;
      });

      const stationOverview = (Object.values(stationBuckets) as AnyRecord[]).sort(
        (a, b) => b.completedAtInspection - a.completedAtInspection || b.producedNotOffered - a.producedNotOffered
      );

      const sortedEntries = Object.entries(grouped).sort(([a], [b]) => (a > b ? 1 : -1));
      const totalCompleted = completedItems.length;
      const totalProducedNotOffered = activeProducedNotOffered.length;

      return {
        summary: {
          total: totalCompleted,
          change: 0,
          trend: "up",
          offeredTotal: offeredItems.length,
          producedNotOfferedTotal: totalProducedNotOffered,
          departmentsWithOutput: departmentOverview.filter((d: AnyRecord) => d.completedAtInspection > 0 || d.producedNotOffered > 0).length,
          workstationsWithOutput: stationOverview.filter((s) => s.completedAtInspection > 0 || s.producedNotOffered > 0).length,
        },
        chartData: departmentOverview.map((d: AnyRecord) => ({ label: d.department, value: d.completedAtInspection })),
        details: departmentOverview.map((d: AnyRecord, idx: number) => ({
          id: idx + 1,
          name: getDepartmentDisplayLabel(d.department),
          count: `${d.completedAtInspection} gereed | ${d.producedNotOffered} nog niet aangeboden`,
          status: d.producedNotOffered > 0 ? "in_progress" : "completed",
        })),
        timelineData: sortedEntries.map(([label, value]) => ({ label, value })).slice(-12),
        departmentOverview,
        stationOverview,
        availableDepartments: allDepartments,
        availableWorkstations: filteredWorkstations,
      };
    } catch (error) {
      console.error("Error fetching offered totals data:", error);
      throw error;
    }
  };

  // Main report generation function
  const generateReportData = async (reportOverride: AnyRecord | null = null) => {
    const targetReport = reportOverride || selectedReport;
    if (!targetReport?.id) {
      console.warn("generateReportData called without a valid report");
      return;
    }

    setLoading(true);
    try {
      let data: AnyRecord;

      if (targetReport.id === "production_output") {
        data = await fetchProductionOutputData();
      } else if (targetReport.id === "lead_time") {
        data = await fetchLeadTimeData();
      } else if (targetReport.id === "order_completion") {
        data = await fetchOrderCompletionData();
      } else if (targetReport.id === "wip_status") {
        data = await fetchWipStatusData();
      } else if (targetReport.id === "worked_hours") {
        data = await fetchWorkedHoursData();
      } else if (targetReport.id === "temp_reject_overview") {
        data = await fetchTempRejectData();
      } else if (targetReport.id === "product_measurements") {
        data = await fetchMeasurementsData();
      } else if (targetReport.id === "offered_totals") {
        data = await fetchOfferedTotalsData();
      }

      // Select appropriate data fetch function based on category
        else if (targetReport.id.includes("production") || targetReport.id.includes("output") || 
          targetReport.id.includes("order") || targetReport.id.includes("wip") || targetReport.id.includes("lead")) {
        data = await fetchProductionData();
      } else if (targetReport.id.includes("rejection") || targetReport.id.includes("quality") || 
                 targetReport.id.includes("first") || targetReport.id.includes("rework") || 
                 targetReport.id.includes("inspection")) {
        data = await fetchQualityData();
      } else if (targetReport.id.includes("oee") || targetReport.id.includes("utilization") || 
                 targetReport.id.includes("cycle") || targetReport.id.includes("downtime") ||
                 targetReport.id.includes("efficiency")) {
        data = await fetchEfficiencyData();
      } else if (targetReport.id.includes("operator") || targetReport.id.includes("shift") || 
                 targetReport.id.includes("training") || targetReport.id.includes("attendance") ||
                 targetReport.id.includes("personnel")) {
        data = await fetchPersonnelData();
      } else {
        // Fallback to production data
        data = await fetchProductionData();
      }
      
      setReportData(data);
    } catch (error) {
      console.error("Error generating report:", error);
      notify("Fout bij het genereren van rapport. Zie console voor details.");
    } finally {
      setLoading(false);
    }
  };

  // Export helpers
  const buildExportFilename = (extension: string) => {
    const safeTitle = (selectedReport?.title || "report")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `${safeTitle || "report"}_${new Date().toISOString().slice(0, 10)}.${extension}`;
  };

  const downloadBlob = (content: string, mimeType: string, filename: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export functions
  const exportToPDF = () => {
    if (!reportData || !selectedReport) return;

    const chartRows = (reportData.chartData || [])
      .map((item: AnyRecord) => `<tr><td style="padding:8px;border:1px solid #ddd;">${item.label}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">${item.value}</td></tr>`)
      .join("");

    const detailRows = (reportData.details || [])
      .map((item: AnyRecord) => `<tr><td style="padding:8px;border:1px solid #ddd;">${item.name}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">${item.count}</td><td style="padding:8px;border:1px solid #ddd;">${item.status}</td></tr>`)
      .join("");

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${selectedReport.title}</title>
  </head>
  <body style="font-family:Arial,sans-serif;padding:24px;">
    <h1 style="margin:0 0 8px 0;">${selectedReport.title}</h1>
    <p style="margin:0 0 16px 0;color:#666;">${t("adminReportsView.generatedOn", "Gegenereerd op")} ${new Date().toLocaleString()}</p>
    <h2>${t("adminReportsView.summary", "Samenvatting")}</h2>
    <ul>
      <li>${t("adminReportsView.total", "Totaal")}: ${reportData.summary?.total ?? 0}</li>
      <li>${t("adminReportsView.trend", "Trend")}: ${reportData.summary?.trend || "n/a"} (${reportData.summary?.change ?? 0}%)</li>
    </ul>
    <h2>${t("adminReportsView.overviewPerWorkstation", "Overzicht per Werkstation")}</h2>
    <table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
      <thead><tr><th style="padding:8px;border:1px solid #ddd;text-align:left;">${t("adminReportsView.workstation", "Werkstation")}</th><th style="padding:8px;border:1px solid #ddd;text-align:right;">${t("adminReportsView.value", "Waarde")}</th></tr></thead>
      <tbody>${chartRows}</tbody>
    </table>
    <h2>${t("adminReportsView.details", "Details")}</h2>
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr><th style="padding:8px;border:1px solid #ddd;text-align:left;">${t("adminReportsView.name", "Naam")}</th><th style="padding:8px;border:1px solid #ddd;text-align:right;">${t("adminReportsView.amount", "Aantal")}</th><th style="padding:8px;border:1px solid #ddd;text-align:left;">${t("adminReportsView.status", "Status")}</th></tr></thead>
      <tbody>${detailRows}</tbody>
    </table>
    <script>window.onload = () => { window.print(); };</script>
  </body>
</html>`;

    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) {
      notify("Pop-up geblokkeerd. Sta pop-ups toe voor PDF export.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const exportToExcel = () => {
    if (!reportData || !selectedReport) return;

    const header = "sep=,\n";
    const summary = [
      ["Rapport", selectedReport.title],
      ["Datum", new Date().toLocaleString()],
      ["Totaal", reportData.summary?.total ?? 0],
      ["Trend", reportData.summary?.trend || "n/a"],
      ["Verschil %", reportData.summary?.change ?? 0],
      [],
      ["Overzicht per werkstation"],
      ["Werkstation", "Waarde"],
      ...(reportData.chartData || []).map((item: AnyRecord) => [item.label, item.value]),
      [],
      ["Details"],
      ["Naam", "Aantal", "Status"],
      ...(reportData.details || []).map((item: AnyRecord) => [item.name, item.count, item.status]),
    ];

    const csvLike = summary
      .map((row) => row.map((cell: unknown) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    downloadBlob(`${header}${csvLike}`, "application/vnd.ms-excel;charset=utf-8", buildExportFilename("xls"));
  };

  const exportToCSV = () => {
    if (!reportData || !selectedReport) return;

    const rows = [
      ["Report", selectedReport.title],
      ["GeneratedAt", new Date().toISOString()],
      ["Total", reportData.summary?.total ?? 0],
      ["Trend", reportData.summary?.trend || "n/a"],
      ["ChangePercent", reportData.summary?.change ?? 0],
      [],
      ["Workstation", "Value"],
      ...(reportData.chartData || []).map((d: AnyRecord) => [d.label, d.value]),
      [],
      ["Name", "Count", "Status"],
      ...(reportData.details || []).map((d: AnyRecord) => [d.name, d.count, d.status]),
    ];

    const csvContent = rows
      .map((row) => row.map((cell: unknown) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    downloadBlob(csvContent, "text/csv;charset=utf-8", buildExportFilename("csv"));
  };

  useEffect(() => {
    if (selectedReport?.id !== "offered_totals") return;
    generateReportData(selectedReport);
  }, [offeredDepartmentFilter, offeredWorkstationFilter]);

  useEffect(() => {
    if (!selectedReport?.id) return;
    if (!isDepartmentScopedReport(selectedReport.id)) return;
    generateReportData(selectedReport);
  }, [productionDepartmentFilter]);

  useEffect(() => {
    if (selectedReport?.id !== "product_measurements") return;
    generateReportData(selectedReport);
  }, [measurementDetailMode, measurementWeekOffset]);

  useEffect(() => {
    if (selectedReport?.id !== "offered_totals") return;
    if (!reportData?.availableDepartments?.length) return;
    if (offeredDepartmentFilter !== "ALL" && !reportData.availableDepartments.includes(offeredDepartmentFilter)) {
      setOfferedDepartmentFilter("ALL");
    }
    if (offeredWorkstationFilter !== "ALL" && !reportData?.availableWorkstations?.includes(offeredWorkstationFilter)) {
      setOfferedWorkstationFilter("ALL");
    }
  }, [reportData, selectedReport, offeredDepartmentFilter, offeredWorkstationFilter]);

  const sourceBadge = (
    <div className={`mb-4 inline-flex items-center rounded-xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-widest ${usePilotReadData ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-300 bg-slate-100 text-slate-700"}`}>
      {t("adminReportsView.dataSource", "Databron")}: {usePilotReadData ? t("adminReportsView.pilotDbReadOnly", "Pilot DB (Read Only)") : t("adminReportsView.currentDb", "Huidige DB")}
    </div>
  );

  // Render category selection
  if (!selectedCategory) {
    return (
      <div className="h-full overflow-y-auto bg-slate-50 p-8">
        <div className="max-w-7xl mx-auto">
          {sourceBadge}
          <div className="mb-8">
            <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight mb-2">
              {t("reports.title", "Rapportage Centre")}
            </h2>
            <p className="text-slate-500 text-sm">
              {t("reports.subtitle", "Selecteer een rapportage categorie om te beginnen")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reportCategories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category)}
                className={`group p-8 rounded-3xl border-2 ${category.color} hover:shadow-xl transition-all duration-300 text-left active:scale-95`}
              >
                <div className="p-4 bg-white rounded-2xl shadow-md w-fit mb-6 group-hover:scale-110 transition-transform">
                  {category.icon}
                </div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-3">
                  {category.title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  {category.description}
                </p>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                  {category.reports.length} rapporten beschikbaar
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Render report selection
  if (selectedCategory && !selectedReport) {
    return (
      <div className="h-full overflow-y-auto bg-slate-50 p-8">
        <div className="max-w-7xl mx-auto">
          {sourceBadge}
          <button
            onClick={() => setSelectedCategory(null)}
            className="mb-6 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {t("adminReportsView.backToCategories", "← Terug naar categorieën")}
          </button>

          <div className="mb-8">
            <div className="flex items-center gap-4 mb-3">
              <div className={`p-3 rounded-2xl ${selectedCategory.color}`}>
                {selectedCategory.icon}
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">
                  {selectedCategory.title}
                </h2>
                <p className="text-slate-500 text-sm">{selectedCategory.description}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {selectedCategory.reports.map((report: AnyRecord) => (
              <button
                key={report.id}
                onClick={() => {
                  setSelectedReport(report);
                  generateReportData(report);
                }}
                className="group p-6 bg-white border border-slate-200 rounded-2xl hover:shadow-lg transition-all duration-300 text-left active:scale-95"
              >
                <div className="p-3 bg-slate-50 rounded-xl w-fit mb-4 group-hover:bg-blue-50 transition-colors">
                  {report.icon}
                </div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">
                  {report.title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  {report.description}
                </p>
                <div className="flex flex-wrap gap-1">
                  {report.metrics.slice(0, 3).map((metric: string) => (
                    <span
                      key={metric}
                      className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase rounded"
                    >
                      {metric}
                    </span>
                  ))}
                  {report.metrics.length > 3 && (
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase rounded">
                      +{report.metrics.length - 3}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const canExport = !!reportData && !loading;
  const activeReport = selectedReport as AnyRecord;

  // Render report view with data
  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-6 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto">
          {sourceBadge}
          <button
            onClick={() => setSelectedReport(null)}
            className="mb-4 px-4 py-2 bg-slate-100 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            {t("adminReportsView.backToReports", "← Terug naar rapporten")}
          </button>
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                {activeReport.title}
              </h2>
              <p className="text-sm text-slate-500">{activeReport.description}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={runAtpsDryRunPreview}
                disabled={atpsPreviewLoading}
                className="px-4 py-2 bg-amber-50 text-amber-700 rounded-xl text-sm font-bold hover:bg-amber-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Test de passieve ATPS export preview"
              >
                {atpsPreviewLoading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} ATPS Dry-run
              </button>
              <button
                onClick={runAtpsLiveExport}
                disabled={atpsLiveLoading}
                className="px-4 py-2 bg-rose-50 text-rose-700 rounded-xl text-sm font-bold hover:bg-rose-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Start live export naar ATPS"
              >
                {atpsLiveLoading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} ATPS Live
              </button>
              <button
                onClick={refreshAtpsMonitor}
                disabled={atpsMonitorLoading}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Ververs ATPS monitor"
              >
                {atpsMonitorLoading ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />} Monitor
              </button>
              <button
                onClick={exportToCSV}
                disabled={!canExport}
                className="px-4 py-2 bg-green-50 text-green-700 rounded-xl text-sm font-bold hover:bg-green-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet size={16} /> CSV
              </button>
              <button
                onClick={exportToExcel}
                disabled={!canExport}
                className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet size={16} /> Excel
              </button>
              <button
                onClick={exportToPDF}
                disabled={!canExport}
                className="px-4 py-2 bg-red-50 text-red-700 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileText size={16} /> PDF
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-6 flex flex-wrap gap-3">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
            >
              <option value="today">{t("adminReportsView.today", "Vandaag")}</option>
              <option value="week">{t("adminReportsView.thisWeek", "Deze Week")}</option>
              <option value="month">{t("adminReportsView.thisMonth", "Deze Maand")}</option>
              <option value="custom">{t("adminReportsView.customPeriod", "Custom Periode")}</option>
            </select>

            {selectedReport?.id !== "offered_totals" && (
              <select
                value={filters.station}
                onChange={(e) => setFilters({ ...filters, station: e.target.value })}
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
              >
                <option value="ALL">{t("adminReportsView.allWorkstations", "Alle Werkstations")}</option>
                <option value="BH11">{t("adminReportsView.stationBh11", "BH11")}</option>
                <option value="BH16">{t("adminReportsView.stationBh16", "BH16")}</option>
                <option value="BH18">{t("adminReportsView.stationBh18", "BH18")}</option>
                <option value="BH31">{t("adminReportsView.stationBh31", "BH31")}</option>
                <option value="BM01">{t("adminReportsView.stationBm01", "BM01")}</option>
              </select>
            )}

            <button
              onClick={() => generateReportData()}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Filter size={16} />}
              {loading ? t("common.loading", "Laden...") : t("adminReportsView.generateReport", "Genereer Rapport")}
            </button>

            {isDepartmentScopedReport(selectedReport?.id) && (
              <select
                value={productionDepartmentFilter}
                onChange={(e) => setProductionDepartmentFilter(e.target.value)}
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
              >
                <option value="ALL">{t("adminReportsView.allDepartments", "Alle Afdelingen")}</option>
                {factoryDepartmentMeta.byLabelList
                  .map((d: AnyRecord) => d.label)
                  .sort((a, b) => a.localeCompare(b))
                  .map((label) => (
                    <option key={label} value={label}>{label}</option>
                  ))}
              </select>
            )}

            {selectedReport?.id === "offered_totals" && (
              <>
                <select
                  value={offeredDepartmentFilter}
                  onChange={(e) => {
                    setOfferedDepartmentFilter(e.target.value);
                    setOfferedWorkstationFilter("ALL");
                  }}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
                >
                  <option value="ALL">{t("adminReportsView.allDepartments", "Alle Afdelingen")}</option>
                  {(reportData?.availableDepartments || []).map((dept: string) => (
                    <option key={dept} value={dept}>{getDepartmentDisplayLabel(dept)}</option>
                  ))}
                </select>

                <select
                  value={offeredWorkstationFilter}
                  onChange={(e) => setOfferedWorkstationFilter(e.target.value)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
                >
                  <option value="ALL">{t("adminReportsView.allWorkstations", "Alle Werkstations")}</option>
                  {(reportData?.availableWorkstations || []).map((station: string) => (
                    <option key={station} value={station}>{station}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          {atpsPreviewLast && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <span className="font-black uppercase tracking-wider">{t("adminReportsView.atpsDryRun", "ATPS Dry-run")}</span>
              <span className="ml-2">
                mode: {String(atpsPreviewLast.mode || "passive")} | records: {Number(atpsPreviewLast?.totals?.count || 0)} | uren: {Number(atpsPreviewLast?.totals?.hoursWorked || 0)}
              </span>
            </div>
          )}

          {atpsMonitor && (
            <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700">
              <div className="font-black uppercase tracking-wider text-slate-800 mb-1">{t("adminReportsView.atpsMonitor", "ATPS Monitor")}</div>
              <div className="flex flex-wrap gap-4">
                <span>{t("adminReportsView.pendingRetries", "Pending retries")}: <strong>{Number(atpsMonitor?.retryQueue?.pendingCount || 0)}</strong></span>
                <span>{t("adminReportsView.failedRetries", "Failed retries")}: <strong>{Number(atpsMonitor?.retryQueue?.failedCount || 0)}</strong></span>
                <span>{t("adminReportsView.latestLiveRun", "Laatste live run")}: <strong>{String(atpsMonitor?.runs?.[0]?.status || "-")}</strong></span>
                <span>{t("adminReportsView.latestPreviewRun", "Laatste preview run")}: <strong>{String(atpsMonitor?.previewRuns?.[0]?.status || "-")}</strong></span>
              </div>
            </div>
          )}
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Loader2 className="animate-spin text-blue-600" size={48} />
              <p className="text-sm text-slate-500 font-bold">{t("adminReportsView.reportGenerating", "Rapport wordt gegenereerd...")}</p>
            </div>
          ) : reportData ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <button
                  type="button"
                  onClick={() => selectedReport?.id === "offered_totals" && openKpiPopup("COMPLETED")}
                  className={`p-6 bg-white rounded-2xl border shadow-sm text-left w-full ${selectedReport?.id === "offered_totals" ? "hover:border-blue-300 transition-colors" : "border-slate-200"} ${selectedReport?.id === "offered_totals" && offeredKpiFilter === "COMPLETED" ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">
                      {selectedReport?.id === "offered_totals" ? t("adminReportsView.reportedReadyTotal", "Gereedgemeld Totaal") : t("adminReportsView.total", "Totaal")}
                    </span>
                    {reportData.summary.change !== undefined && (
                      <div className={`px-2 py-1 rounded-lg text-xs font-bold ${reportData.summary.trend === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {reportData.summary.trend === 'up' ? '↑' : '↓'} {Math.abs(reportData.summary.change)}%
                      </div>
                    )}
                  </div>
                  <div className="text-4xl font-black text-slate-800">{reportData.summary.total.toLocaleString()}</div>
                </button>

                {selectedReport?.id === "offered_totals" && reportData.summary.offeredTotal !== undefined && (
                  <button
                    type="button"
                    onClick={() => openKpiPopup("OFFERED")}
                    className={`p-6 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl border text-left w-full hover:border-emerald-300 transition-colors ${offeredKpiFilter === "OFFERED" ? "border-emerald-500 ring-2 ring-emerald-100" : "border-emerald-200"}`}
                  >
                    <span className="text-xs font-bold text-emerald-700 uppercase block mb-2">{t("adminReportsView.totalOffered", "Totaal Aangeboden")}</span>
                    <div className="text-4xl font-black text-emerald-900">
                      {reportData.summary.offeredTotal.toLocaleString()}
                    </div>
                  </button>
                )}

                {/* Conditionally show FTR for quality reports */}
                {reportData.summary.ftrPercentage !== undefined && (
                  <div className="p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-2xl border border-green-200">
                    <span className="text-xs font-bold text-green-700 uppercase block mb-2">{t("adminReportsView.firstTimeRight", "First Time Right")}</span>
                    <div className="text-4xl font-black text-green-900">
                      {reportData.summary.ftrPercentage}%
                    </div>
                  </div>
                )}

                {/* Show completed count for production reports */}
                {reportData.summary.completed !== undefined && (
                  <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl border border-blue-200">
                    <span className="text-xs font-bold text-blue-700 uppercase block mb-2">{t("adminReportsView.completed", "Voltooid")}</span>
                    <div className="text-4xl font-black text-blue-900">
                      {reportData.summary.completed.toLocaleString()}
                    </div>
                  </div>
                )}

                {selectedReport?.id === "offered_totals" && reportData.summary.producedNotOfferedTotal !== undefined && (
                  <button
                    type="button"
                    onClick={() => openKpiPopup("PRODUCED_NOT_OFFERED")}
                    className={`p-6 bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl border text-left w-full hover:border-amber-300 transition-colors ${offeredKpiFilter === "PRODUCED_NOT_OFFERED" ? "border-amber-500 ring-2 ring-amber-100" : "border-amber-200"}`}
                  >
                    <span className="text-xs font-bold text-amber-700 uppercase block mb-2">{t("adminReportsView.producedNotOffered", "Geproduceerd, Niet Aangeboden")}</span>
                    <div className="text-4xl font-black text-amber-900">
                      {reportData.summary.producedNotOfferedTotal.toLocaleString()}
                    </div>
                  </button>
                )}

                {selectedReport?.id === "offered_totals" && reportData.summary.departmentsWithOutput !== undefined && (
                  <div className="p-6 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl border border-indigo-200">
                    <span className="text-xs font-bold text-indigo-700 uppercase block mb-2">{t("adminReportsView.departmentsWithOutput", "Afdelingen Met Output")}</span>
                    <div className="text-4xl font-black text-indigo-900">
                      {reportData.summary.departmentsWithOutput.toLocaleString()}
                    </div>
                  </div>
                )}

                {selectedReport?.id === "offered_totals" && reportData.summary.workstationsWithOutput !== undefined && (
                  <div className="p-6 bg-gradient-to-br from-sky-50 to-sky-100 rounded-2xl border border-sky-200">
                    <span className="text-xs font-bold text-sky-700 uppercase block mb-2">{t("adminReportsView.workstationsWithOutput", "Werkstations Met Output")}</span>
                    <div className="text-4xl font-black text-sky-900">
                      {reportData.summary.workstationsWithOutput.toLocaleString()}
                    </div>
                  </div>
                )}

                {/* Show rejected count */}
                {reportData.summary.rejected !== undefined && (
                  <div className="p-6 bg-gradient-to-br from-red-50 to-red-100 rounded-2xl border border-red-200">
                    <span className="text-xs font-bold text-red-700 uppercase block mb-2">{t("adminReportsView.rejected", "Afgekeurd")}</span>
                    <div className="text-4xl font-black text-red-900">
                      {reportData.summary.rejected.toLocaleString()}
                    </div>
                  </div>
                )}

                {/* Fallback cards */}
                {!reportData.summary.ftrPercentage && !reportData.summary.completed && (
                  <>
                <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl border border-blue-200">
                  <span className="text-xs font-bold text-blue-700 uppercase block mb-2">{t("adminReportsView.averagePerDay", "Gemiddelde per Dag")}</span>
                  <div className="text-4xl font-black text-blue-900">
                    {Math.round(reportData.summary.total / 7).toLocaleString()}
                  </div>
                </div>

                <div className="p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl border border-purple-200">
                  <span className="text-xs font-bold text-purple-700 uppercase block mb-2">{t("adminReportsView.activeStations", "Stations Actief")}</span>
                  <div className="text-4xl font-black text-purple-900">{reportData.chartData.length}</div>
                </div>
                  </>
                )}
              </div>

              {/* Chart */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-6">
                  {selectedReport?.id === "offered_totals" ? t("adminReportsView.reportedReadyByDepartment", "Gereedgemeld per Afdeling") : t("adminReportsView.overviewPerWorkstation", "Overzicht per Werkstation")}
                </h3>
                {selectedReport?.id === "offered_totals" && (
                  <p className="text-xs text-slate-500 mb-4">
                    {t("adminReportsView.activeKpiFilter", "Actieve KPI-filter")}: {offeredKpiFilter === "COMPLETED" ? t("adminReportsView.reportedReady", "Gereedgemeld") : offeredKpiFilter === "OFFERED" ? t("adminReportsView.offered", "Aangeboden") : offeredKpiFilter === "PRODUCED_NOT_OFFERED" ? t("adminReportsView.producedNotOfferedLower", "Geproduceerd, niet aangeboden") : t("common.all", "Alles")}
                  </p>
                )}
                <div className="space-y-3">
                  {(selectedReport?.id === "offered_totals" && offeredKpiFilter === "PRODUCED_NOT_OFFERED"
                    ? (reportData.departmentOverview || []).map((d: AnyRecord) => ({ label: getDepartmentDisplayLabel(d.department), value: d.producedNotOffered }))
                    : (reportData.chartData || []).map((d: AnyRecord) => ({ label: getDepartmentDisplayLabel(d.label), value: d.value }))
                  ).map((item: AnyRecord, index: number, arr: AnyRecord[]) => {
                    const maxValue = Math.max(1, ...arr.map((d: AnyRecord) => d.value));
                    const percentage = (item.value / maxValue) * 100;
                    
                    return (
                      <div key={index} className="flex items-center gap-4">
                        <div
                          className="w-36 shrink-0 text-sm font-black text-slate-700 truncate"
                          title={item.label}
                        >
                          {item.label}
                        </div>
                        <div className="flex-1 min-w-0 bg-slate-100 rounded-full h-8 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-blue-600 h-full flex items-center justify-end px-3 transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          >
                            <span className="text-white text-xs font-bold">{item.value}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedReport?.id === "offered_totals" && Array.isArray(reportData.departmentOverview) && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-200">
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                      Afdelingsoverzicht Gereedmelding
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                            Afdeling
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                            Gereedgemeld (Eindinspectie)
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                            Geproduceerd, Nog Niet Aangeboden
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {reportData.departmentOverview
                          .filter((dept) => {
                            if (offeredKpiFilter === "COMPLETED") return dept.completedAtInspection > 0;
                            if (offeredKpiFilter === "PRODUCED_NOT_OFFERED") return dept.producedNotOffered > 0;
                            return true;
                          })
                          .map((dept) => (
                          <tr key={dept.department} className="hover:bg-slate-50">
                            <td className="px-6 py-4 text-sm font-semibold text-slate-800">{getDepartmentDisplayLabel(dept.department)}</td>
                            <td className="px-6 py-4 text-sm text-slate-700">{dept.completedAtInspection.toLocaleString()}</td>
                            <td className="px-6 py-4 text-sm text-slate-700">{dept.producedNotOffered.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedReport?.id === "offered_totals" && Array.isArray(reportData.stationOverview) && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-200">
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                      Werkstation Overzicht
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                            Werkstation
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                            Gereedgemeld
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                            Geproduceerd, Nog Niet Aangeboden
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {reportData.stationOverview
                          .filter((station) => {
                            if (offeredKpiFilter === "COMPLETED") return station.completedAtInspection > 0;
                            if (offeredKpiFilter === "PRODUCED_NOT_OFFERED") return station.producedNotOffered > 0;
                            return true;
                          })
                          .map((station) => (
                            <tr key={station.workstation} className="hover:bg-slate-50">
                              <td className="px-6 py-4 text-sm font-semibold text-slate-800">{station.workstation}</td>
                              <td className="px-6 py-4 text-sm text-slate-700">{station.completedAtInspection.toLocaleString()}</td>
                              <td className="px-6 py-4 text-sm text-slate-700">{station.producedNotOffered.toLocaleString()}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedReport?.id === "offered_totals" && kpiPopup.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
                  <div className="bg-white w-full max-w-6xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                          {kpiPopup.type === "COMPLETED" && t("adminReportsView.kpiDetailReportedReady", "KPI Detail: Gereedgemeld")}
                          {kpiPopup.type === "OFFERED" && t("adminReportsView.kpiDetailOffered", "KPI Detail: Aangeboden")}
                          {kpiPopup.type === "PRODUCED_NOT_OFFERED" && t("adminReportsView.kpiDetailProducedNotOffered", "KPI Detail: Geproduceerd, Niet Aangeboden")}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">{t("adminReportsView.perDepartmentAndWorkstationInCurrentPeriod", "Per afdeling en per werkstation binnen de huidige periode/filters.")}</p>
                      </div>
                      <button
                        type="button"
                        onClick={closeKpiPopup}
                        className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200"
                      >
                        {t("common.close", "Sluiten")}
                      </button>
                    </div>

                    <div className="p-6 overflow-auto space-y-6">
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200">
                          <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider">{t("adminReportsView.perDepartment", "Per Afdeling")}</h4>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">{t("adminReportsView.department", "Afdeling")}</th>
                                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">{t("adminReportsView.amount", "Aantal")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {(reportData.departmentOverview || [])
                                .map((dept: AnyRecord) => ({
                                  label: getDepartmentDisplayLabel(dept.department),
                                  value:
                                    kpiPopup.type === "COMPLETED"
                                      ? dept.completedAtInspection
                                      : kpiPopup.type === "OFFERED"
                                      ? (dept.offeredToInspection || 0)
                                      : dept.producedNotOffered,
                                }))
                                .filter((row: AnyRecord) => row.value > 0)
                                .sort((a: AnyRecord, b: AnyRecord) => b.value - a.value)
                                .map((row: AnyRecord) => (
                                  <tr key={`popup-dept-${row.label}`} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 text-sm font-semibold text-slate-800">{row.label}</td>
                                    <td className="px-6 py-4 text-sm text-slate-700">{row.value.toLocaleString()}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200">
                          <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider">{t("adminReportsView.perWorkstation", "Per Werkstation")}</h4>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">{t("adminReportsView.workstation", "Werkstation")}</th>
                                <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">{t("adminReportsView.amount", "Aantal")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {(reportData.stationOverview || [])
                                .map((station: AnyRecord) => ({
                                  label: station.workstation,
                                  value:
                                    kpiPopup.type === "COMPLETED"
                                      ? station.completedAtInspection
                                      : kpiPopup.type === "OFFERED"
                                      ? (station.offeredToInspection || 0)
                                      : station.producedNotOffered,
                                }))
                                .filter((row: AnyRecord) => row.value > 0)
                                .sort((a: AnyRecord, b: AnyRecord) => b.value - a.value)
                                .map((row: AnyRecord) => (
                                  <tr key={`popup-station-${row.label}`} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 text-sm font-semibold text-slate-800">{row.label}</td>
                                    <td className="px-6 py-4 text-sm text-slate-700">{row.value.toLocaleString()}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedReport?.id === "offered_totals" && Array.isArray(reportData.timelineData) && reportData.timelineData.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-6">
                    Aangeboden Trend (Dag/Week)
                  </h3>
                  <div className="space-y-3">
                    {reportData.timelineData.map((item: AnyRecord, index: number) => {
                      const maxValue = Math.max(1, ...reportData.timelineData.map((d: AnyRecord) => d.value));
                      const percentage = (item.value / maxValue) * 100;

                      return (
                        <div key={`timeline-${index}`} className="flex items-center gap-4">
                          <div
                            className="w-36 shrink-0 text-sm font-black text-slate-700 truncate"
                            title={item.label}
                          >
                            {item.label}
                          </div>
                          <div className="flex-1 min-w-0 bg-slate-100 rounded-full h-8 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-full flex items-center justify-end px-3 transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            >
                              <span className="text-white text-xs font-bold">{item.value}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Details Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                    Gedetailleerd Overzicht
                  </h3>
                  {selectedReport?.id === "product_measurements" && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <select
                        value={measurementDetailMode}
                        onChange={(e) => {
                          const mode = e.target.value;
                          setMeasurementDetailMode(mode);
                          if (mode !== "browse_week") setMeasurementWeekOffset(0);
                        }}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
                      >
                        <option value="current_week">{t("adminReportsView.currentWeek", "Huidige Week")}</option>
                        <option value="browse_week">{t("adminReportsView.browseByWeek", "Terugbladeren per Week")}</option>
                        <option value="all">{t("common.all", "Alles")}</option>
                      </select>

                      {measurementDetailMode === "browse_week" && (
                        <>
                          <button
                            type="button"
                            onClick={() => setMeasurementWeekOffset((prev) => prev + 1)}
                            className="px-3 py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-200"
                          >
                            ← Oudere Week
                          </button>
                          <button
                            type="button"
                            onClick={() => setMeasurementWeekOffset((prev) => Math.max(prev - 1, 0))}
                            disabled={measurementWeekOffset === 0}
                            className="px-3 py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Nieuwere Week →
                          </button>
                          <span className="text-xs text-slate-500 font-semibold">
                            {measurementWeekOffset === 0 ? "Deze week" : `${measurementWeekOffset} week(en) terug`}
                          </span>
                        </>
                      )}
                      <input
                        type="text"
                        placeholder={t("placeholders.adminReportsLotSearch", "Zoeken op lotnummer...")}
                        value={measurementLotNumberSearch}
                        onChange={(e) => setMeasurementLotNumberSearch(e.target.value)}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 placeholder-slate-400"
                      />
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                          {selectedReport?.id === "lead_time"
                            ? "Doorlooptijd Metric"
                            : selectedReport?.id === "order_completion"
                            ? "Order"
                            : selectedReport?.id === "wip_status"
                            ? "WIP Segment"
                            : selectedReport?.id === "production_output"
                            ? "Output Segment"
                            : "Product"}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                          {selectedReport?.id === "product_measurements"
                            ? "Metingen"
                            : selectedReport?.id === "lead_time"
                            ? "Waarde"
                            : selectedReport?.id === "order_completion"
                            ? "Voortgang"
                            : "Aantal"}
                        </th>
                        {selectedReport?.id === "product_measurements" && (
                          <>
                            <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                              TG
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                              Brix
                            </th>
                          </>
                        )}
                        <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {reportData.details
                        .filter((detail: AnyRecord) => {
                          if (selectedReport?.id === "product_measurements" && measurementLotNumberSearch.trim()) {
                            return detail.name.toLowerCase().includes(measurementLotNumberSearch.toLowerCase());
                          }
                          return true;
                        })
                        .map((detail: AnyRecord) => (
                        <tr key={detail.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm font-medium text-slate-800">{detail.name}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {selectedReport?.id === "product_measurements" ? (
                              <div className="space-y-1">
                                <div className="font-semibold text-slate-700">{detail.measurementSummary || "Geen meetwaarden"}</div>
                                <div className="text-xs text-slate-400">{detail.count} velden</div>
                              </div>
                            ) : (
                              detail.count
                            )}
                          </td>
                          {selectedReport?.id === "product_measurements" && (
                            <>
                              <td className="px-6 py-4 text-sm text-slate-700 font-semibold">{detail.tgValue || "-"}</td>
                              <td className="px-6 py-4 text-sm text-slate-700 font-semibold">{detail.brixValue || "-"}</td>
                            </>
                          )}
                          <td className="px-6 py-4">
                            <span
                              className={`px-2 py-1 rounded-lg text-xs font-bold ${
                                detail.status === "completed"
                                  ? "bg-green-100 text-green-700"
                                  : detail.status === "rejected"
                                  ? "bg-red-100 text-red-700"
                                  : detail.status === "temp_reject"
                                  ? "bg-orange-100 text-orange-700"
                                  : detail.status === "active"
                                  ? "bg-blue-100 text-blue-700"
                                  : detail.status === "idle"
                                  ? "bg-slate-100 text-slate-600"
                                  : "bg-yellow-100 text-yellow-700"
                              }`}
                            >
                              {detail.status === "completed"
                                ? "Voltooid"
                                : detail.status === "rejected"
                                ? "Afgekeurd"
                                : detail.status === "temp_reject"
                                ? "Tijdelijk Afgekeurd"
                                : detail.status === "active"
                                ? "Actief"
                                : detail.status === "idle"
                                ? "Niet Actief"
                                : "In behandeling"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <FileText className="text-slate-300" size={64} />
              <p className="text-slate-500 text-sm font-bold">{t("adminReportsView.noDataAvailable", "Geen data beschikbaar")}</p>
              <button
                onClick={generateReportData}
                className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
              >
                Genereer Rapport
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminReportsView;
