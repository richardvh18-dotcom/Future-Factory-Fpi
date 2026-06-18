import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  BarChart3,
  Activity,
  Target,
  Zap,
  Loader2,
  TrendingDown,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Brain,
  Upload,
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  BarChart2
} from "lucide-react";
import { collection, collectionGroup, onSnapshot, doc, getDocs, query, limit } from "firebase/firestore";
import { db } from "../../config/firebase";
import {
  getPlanningArchivePath,
  getPathString,
  PATHS,
} from "../../config/dbPaths";
import { getISOWeek, startOfISOWeek, endOfISOWeek, format, subWeeks, addWeeks, startOfYear, endOfYear } from "date-fns";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import CapacityImportModal from "../digitalplanning/modals/CapacityImportModal";
import EfficiencyDashboard from "../digitalplanning/EfficiencyDashboard";
import GanttChartView from "./GanttChartView";
import TimeTrackingView from "./TimeTrackingView";
import WorkloadHeatmapView from "./WorkloadHeatmapView";
import { normalizeMachine } from "../../utils/hubHelpers";
import { getDeliveryPlanningState, resolveDeliveryDate, toDateSafe } from "../../utils/dateUtils";
import { subscribeScopedEfficiencyHours } from "../../utils/efficiencyScopedReader";

type CapacityPlanningViewProps = {
  initialDepartment?: string;
  lockDepartment?: boolean;
  onNavigate?: (...args: unknown[]) => void;
};

type DepartmentConfig = {
  id?: string;
  name?: string;
  isActive?: boolean;
};

type FactoryConfig = {
  departments: DepartmentConfig[];
};

type DateLikeInput =
  | Date
  | string
  | number
  | {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
      _seconds?: number;
      nanoseconds?: number;
      _nanoseconds?: number;
    }
  | null
  | undefined;

type OccupancyRow = {
  id: string;
  date?: DateLikeInput;
  departmentId?: string;
  hoursWorked?: string | number;
  hours?: string | number;
  machineId?: string;
  machineName?: string;
  operatorNumber?: string | number;
  [key: string]: unknown;
};

type PlanningOrder = {
  id: string;
  orderId?: string;
  machine?: string;
  item?: string;
  itemCode?: string;
  plan?: string | number;
  quantity?: string | number;
  plannedDate?: DateLikeInput;
  date?: DateLikeInput;
  deliveryDate?: DateLikeInput;
  plannedDeliveryDate?: DateLikeInput;
  dueDate?: DateLikeInput;
  deadline?: DateLikeInput;
  status?: string;
  departmentId?: string;
  plannedHours?: string | number;
  plannedHoursBH?: string | number;
  plannedHoursNabewerken?: string | number;
  plannedHoursBM01?: string | number;
  [key: string]: unknown;
};

type TimeStandardRow = {
  id: string;
  itemCode?: string;
  machine?: string;
  standardMinutes?: string | number;
  [key: string]: unknown;
};

type EfficiencyRow = {
  id?: string;
  orderId?: string;
  minutesPerUnit?: number;
  quantity?: number;
  qcTimeTotal?: number;
  productionTimeTotal?: number;
  postProcessingTimeTotal?: number;
  [key: string]: unknown;
};

type PlanningBuckets = {
  root: PlanningOrder[];
  scoped: PlanningOrder[];
};

/**
 * CapacityPlanningView
 * Vergelijkt beschikbare productie-uren met geplande uren
 * Toont het verschil tussen capaciteit en demand
 */
const CapacityPlanningView = ({ initialDepartment, lockDepartment = false, onNavigate }: CapacityPlanningViewProps) => {
  const { t } = useTranslation();
  const { user, role, isAdmin } = useAdminAuth();
  const readDb = db;
  const readPaths = PATHS;
  const [loading, setLoading] = useState(true);
  const [occupancy, setOccupancy] = useState<OccupancyRow[]>([]);
  const [planningOrders, setPlanningOrders] = useState<PlanningOrder[]>([]);
  const [activePlanningOrders, setActivePlanningOrders] = useState<PlanningOrder[]>([]);
  const [archivedPlanningOrders, setArchivedPlanningOrders] = useState<PlanningOrder[]>([]);
  const [timeStandards, setTimeStandards] = useState<TimeStandardRow[]>([]);
  const [efficiencyData, setEfficiencyData] = useState<Record<string, EfficiencyRow>>({});
  const [selectedWeek, setSelectedWeek] = useState(new Date());
  const [selectedDepartment, setSelectedDepartment] = useState(initialDepartment || "ALLES");
  const [departments, setDepartments] = useState<string[]>(["ALLES"]);
  const [factoryConfig, setFactoryConfig] = useState<FactoryConfig>({ departments: [] });
  const [timePeriod, setTimePeriod] = useState("week"); // "week", "ytd", "year", "future", "yoy"
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [comparisonYear, setComparisonYear] = useState(new Date().getFullYear() - 1);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMissingStandards, setShowMissingStandards] = useState(false);
  const [activeTab, setActiveTab] = useState("capacity");
  const planningBucketsRef = useRef<PlanningBuckets>({ root: [], scoped: [] });

  // Auto-filter voor teamleaders
  const isTeamleader = role === "teamleader";
  const userDepartment = String(user?.department || "");
  const canChangeFilter = !lockDepartment && (isAdmin || role === "engineer" || !isTeamleader);

  const toNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const currentWeek = getISOWeek(selectedWeek);
  const weekStart = startOfISOWeek(selectedWeek);
  const weekEnd = endOfISOWeek(selectedWeek);

  // Datums berekenen op basis van timePeriod
  let periodStart, periodEnd, periodLabel;
  
  switch(timePeriod) {
    case "week":
      periodStart = weekStart;
      periodEnd = weekEnd;
      periodLabel = `Week ${currentWeek} • ${format(weekStart, 'd MMM')} - ${format(weekEnd, 'd MMM yyyy')}`;
      break;
    case "ytd":
      periodStart = startOfYear(new Date(selectedYear, 0, 1));
      periodEnd = new Date(); // Tot vandaag
      periodLabel = `YTD ${selectedYear} • ${format(periodStart, 'd MMM')} - ${format(periodEnd, 'd MMM yyyy')}`;
      break;
    case "year":
      periodStart = startOfYear(new Date(selectedYear, 0, 1));
      periodEnd = endOfYear(new Date(selectedYear, 11, 31));
      periodLabel = `Hele jaar ${selectedYear} • ${format(periodStart, 'd MMM')} - ${format(periodEnd, 'd MMM yyyy')}`;
      break;
    case "future":
      periodStart = new Date();
      periodEnd = addWeeks(new Date(), 12); // 12 weken vooruit
      periodLabel = `Komende 12 weken • ${format(periodStart, 'd MMM')} - ${format(periodEnd, 'd MMM yyyy')}`;
      break;
    case "yoy":
      periodStart = startOfYear(new Date(selectedYear, 0, 1));
      periodEnd = new Date(); // Tot vandaag, maar dan vorig jaar
      periodLabel = `Vergelijking ${comparisonYear} vs ${selectedYear}`;
      break;
    default:
      periodStart = weekStart;
      periodEnd = weekEnd;
      periodLabel = `Week ${currentWeek}`;
  }

  const archivePlanningYears = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const minYear = Math.min(2020, selectedYear || nowYear, comparisonYear || nowYear);
    const maxYear = Math.max(nowYear, selectedYear || nowYear, comparisonYear || nowYear);
    const years = [];
    for (let year = minYear; year <= maxYear; year += 1) {
      years.push(year);
    }
    return years;
  }, [selectedYear, comparisonYear]);

  // Helper functie voor department matching via departmentId
  const matchesDepartment = (departmentId: unknown, filterDepartmentName: string) => {
    if (!filterDepartmentName || filterDepartmentName.trim().toLowerCase() === "alles") return true;
    if (!departmentId) return false;

    // Zoek department in factory config via id (case-insensitive)
    const dept = factoryConfig.departments?.find((d) => {
      if (!d.id || !departmentId) return false;
      return String(d.id).trim().toLowerCase() === String(departmentId).trim().toLowerCase();
    });
    if (!dept) return false;

    const deptName = (dept.name || "").toLowerCase().trim();
    const filter = (filterDepartmentName || "").toLowerCase().trim();

    // Exacte match
    if (deptName === filter) return true;

    // Department name bevat filter (bijv. "Productie - Fittings" bevat "Fittings")
    if (deptName.includes(filter)) return true;

    // Filter bevat department name
    if (filter.includes(deptName)) return true;

    return false;
  };

  // Load departments from factory structure
  useEffect(() => {
    if (!readPaths || !readPaths.FACTORY_CONFIG) return;

    const factoryConfigPath = getPathString(readPaths.FACTORY_CONFIG);
    const docRef = doc(readDb, factoryConfigPath);
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const rawData = docSnap.data() as Record<string, unknown>;
        const data: FactoryConfig = {
          departments: Array.isArray(rawData.departments)
            ? (rawData.departments as DepartmentConfig[])
            : [],
        };
        setFactoryConfig(data);
        const depts = Array.isArray(data.departments) 
          ? data.departments.filter((d) => d.isActive).map((d) => String(d.name || "")).filter(Boolean)
          : [];
        setDepartments(["ALLES", ...depts]);
      }
    });
    return () => unsub();
  }, [readDb, readPaths]);

  // Auto-filter voor teamleaders op hun afdeling
  useEffect(() => {
    if (!initialDepartment && isTeamleader && userDepartment) {
      // Zoek matching department (kan "Productie - Fittings" vs "Fittings" zijn)
      const matchingDept = departments.find(d => 
        d === userDepartment || 
        d.includes(userDepartment) || 
        userDepartment.includes(d)
      );
      if (matchingDept) {
        setSelectedDepartment(matchingDept);
      } else if (userDepartment !== "ALLES") {
        // Fallback naar user department als het niet in de lijst staat
        setSelectedDepartment(userDepartment);
      }
    }
  }, [isTeamleader, userDepartment, departments, initialDepartment]);

  // Update selectedDepartment als initialDepartment verandert (bijv. navigatie)
  useEffect(() => {
    if (initialDepartment && departments.length > 0) {
      if (initialDepartment === "ALLES") {
        setSelectedDepartment("ALLES");
        return;
      }
      // Probeer te matchen met beschikbare departments
      const match = departments.find(d => 
        d.toLowerCase() === initialDepartment.toLowerCase() ||
        d.toLowerCase().includes(initialDepartment.toLowerCase()) ||
        initialDepartment.toLowerCase().includes(d.toLowerCase())
      );
      setSelectedDepartment(match || initialDepartment);
    }
  }, [initialDepartment, departments]);

  useEffect(() => {
    if (!readPaths || !readPaths.PLANNING) {
      console.error("PATHS configuration missing in CapacityPlanningView");
      setLoading(false);
      return;
    }

    setLoading(true);

    // Load occupancy data
    const unsubOcc = onSnapshot(
      collection(readDb, getPathString(readPaths.OCCUPANCY)),
      (snapshot) => {
        setOccupancy(
          snapshot.docs.map((docEntry): OccupancyRow => ({
            id: docEntry.id,
            ...(docEntry.data() as Record<string, unknown>),
          }))
        );
      }
    );

    const mergePlanningBuckets = () => {
      const mergedMap = new Map<string, PlanningOrder>();
      Object.values(planningBucketsRef.current).forEach((rows) => {
        (rows || []).forEach((row, idx) => {
          const key = String(row.orderId || row.id || `${row.machine || ""}-${row.item || ""}-${idx}`).trim();
          if (!key) return;
          mergedMap.set(key, row);
        });
      });
      setActivePlanningOrders(Array.from(mergedMap.values()));
    };

    const unsubRootPlanning = onSnapshot(
      collection(readDb, getPathString(readPaths.PLANNING)),
      (snapshot) => {
        planningBucketsRef.current.root = snapshot.docs.map((docEntry): PlanningOrder => ({
          id: docEntry.id,
          __docPath: docEntry.ref.path,
          ...(docEntry.data() as Record<string, unknown>),
        }));
        mergePlanningBuckets();
        setLoading(false);
      },
      (error) => {
        console.warn("Planning root listener failed:", error);
        planningBucketsRef.current.root = [];
        mergePlanningBuckets();
        setLoading(false);
      }
    );

    const unsubScopedPlanning = onSnapshot(
      collectionGroup(readDb, "orders"),
      (snapshot) => {
        const planningPrefix = `${getPathString(readPaths.PLANNING)}/`;
        planningBucketsRef.current.scoped = snapshot.docs
          .filter((d) => {
            const path = d.ref.path || "";
            return (
              path.startsWith(planningPrefix) &&
              path.includes("/machines/") &&
              path.includes("/orders/")
            );
          })
          .map((docEntry): PlanningOrder => ({
            id: docEntry.id,
            __docPath: docEntry.ref.path,
            ...(docEntry.data() as Record<string, unknown>),
          }));
        mergePlanningBuckets();
        setLoading(false);
      },
      (error) => {
        console.warn("Planning scoped listener failed:", error);
        planningBucketsRef.current.scoped = [];
        mergePlanningBuckets();
        setLoading(false);
      }
    );

    // Load time standards
    const unsubStandards = onSnapshot(
      collection(readDb, getPathString(readPaths.PRODUCTION_STANDARDS)),
      (snapshot) => {
        setTimeStandards(
          snapshot.docs.map((docEntry): TimeStandardRow => ({
            id: docEntry.id,
            ...(docEntry.data() as Record<string, unknown>),
          }))
        );
      }
    );

    return () => {
      unsubOcc();
      unsubRootPlanning();
      unsubScopedPlanning();
      unsubStandards();
    };
  }, [readDb, readPaths]);

  useEffect(() => {
    let cancelled = false;

    const loadArchivePlanning = async () => {
      try {
        const archiveBuckets = await Promise.all(
          archivePlanningYears.map(async (year) => {
            const snapshot = await getDocs(
              query(collection(readDb, getPathString(getPlanningArchivePath(year))), limit(8000))
            );
            return { year, snapshot };
          })
        );

        if (cancelled) return;

        const rows = archiveBuckets.flatMap(({ year, snapshot }) =>
          snapshot.docs.map((entry): PlanningOrder => ({
            id: entry.id,
            ...(entry.data() as Record<string, unknown>),
            _archiveYear: year,
            _archived: true,
          }))
        );

        setArchivedPlanningOrders(rows);
      } catch (error) {
        console.warn("Archive planning load failed:", error);
        if (!cancelled) setArchivedPlanningOrders([]);
      }
    };

    loadArchivePlanning();

    return () => {
      cancelled = true;
    };
  }, [readDb, archivePlanningYears]);

  useEffect(() => {
    const deduped = new Map<string, PlanningOrder>();

    // First archived, then active so active records win on key collisions.
    [...archivedPlanningOrders, ...activePlanningOrders].forEach((order, index) => {
      const key =
        String(order.orderId || order.id || "").trim() ||
        `fallback-${order.machine || ""}-${order.item || ""}-${order.plannedDate || order.date || index}`;
      deduped.set(key, order);
    });

    setPlanningOrders(Array.from(deduped.values()));
  }, [activePlanningOrders, archivedPlanningOrders]);

  // Load efficiency/imported hours
  useEffect(() => {
    if (!readPaths || !readPaths.EFFICIENCY_HOURS) return;

    const unsubEfficiency = subscribeScopedEfficiencyHours({
      db: readDb,
      mode: "active",
      onData: (rows: Array<Record<string, unknown>>) => {
        const data: Record<string, EfficiencyRow> = {};
        rows.forEach((row) => {
          const efficiencyRow = row as EfficiencyRow;
          const key = String(efficiencyRow.orderId || efficiencyRow.id || "").trim();
          if (!key) return;
          data[key] = efficiencyRow;
        });
        setEfficiencyData(data);
      },
      onError: (error) => {
        console.warn("Scoped efficiency listener failed:", error);
        setEfficiencyData({});
      },
    });
    return () => unsubEfficiency();
  }, [readDb, readPaths]);

  // Bereken beschikbare capaciteit
  const capacityMetrics = useMemo(() => {
    // Filter occupancy voor de geselecteerde periode
    let periodOccupancy = occupancy.filter(occ => {
      const occDate = toDateSafe(occ.date);
      if (!occDate) return false;
      return occDate >= periodStart && occDate <= periodEnd;
    });

    // Debug: toon unieke departments in occupancy data
    if (selectedDepartment !== "ALLES") {
      const uniqueDeptIds = [...new Set(periodOccupancy.map(o => o.departmentId))];
      const uniqueDeptNames = uniqueDeptIds.map(id => {
        const dept = factoryConfig.departments?.find(d => d.id === id);
        return dept ? dept.name : id;
      });
      console.log("📊 Department IDs in occupancy:", uniqueDeptIds);
      console.log("📊 Department Names:", uniqueDeptNames);
      console.log("🔍 Filtering for:", selectedDepartment);
    }

    // Filter op afdeling als niet "ALLES"
    if (selectedDepartment !== "ALLES") {
      periodOccupancy = periodOccupancy.filter(occ => {
        return matchesDepartment(occ.departmentId, selectedDepartment);
      });
    }

    // Bereken totale uren en splits op in productie vs support
    let totalTheoreticalHours = 0; // Bruto uren (voor weergave/vergelijking)
    let totalProductionHours = 0; // Effectieve netto uren
    let realProductionHours = 0;
    let supportHours = 0;
    
    periodOccupancy.forEach(occ => {
      let baseHours = toNumber(occ.hoursWorked || occ.hours || 0);
      
      // Future Factory regel: standaard werkdag is 7 netto uren (8u min 1u pauze)
      if (!baseHours || baseHours === 8) {
        baseHours = 7;
      }
      
      totalTheoreticalHours += baseHours;
      
      // Efficiency Factor 85% inbouwen voor de effectieve netto capaciteit
      const effectiveHours = baseHours * 0.85;
      
      totalProductionHours += effectiveHours;
      
      // Check of station BH of BA is (werkelijke productie)
      // UPDATE: Ruimere check voor Mazak, Nabewerking en ID variaties (st_bh...)
      const mId = (occ.machineId || "").toUpperCase();
      const mName = (occ.machineName || "").toUpperCase();
      const idStr = mId + " " + mName;

      const isProduction = idStr.includes("BH") || idStr.includes("BA") || idStr.includes("MAZAK") || idStr.includes("NABEWERK");

      if (isProduction) {
        realProductionHours += effectiveHours;
      } else {
        supportHours += effectiveHours;
      }
    });

    // Bereken rand-uren (setup, pauze, overhead) op basis van het verschil
    const totalScheduledHours = totalTheoreticalHours;
    const overheadHours = totalScheduledHours - totalProductionHours;

    // Unieke operators deze periode
    const uniqueOperators = new Set(periodOccupancy.map(o => o.operatorNumber));
    const operatorCount = uniqueOperators.size;

    return {
      totalProductionHours: Math.round(totalProductionHours * 10) / 10,
      realProductionHours: Math.round(realProductionHours * 10) / 10,
      supportHours: Math.round(supportHours * 10) / 10,
      overheadHours: Math.round(overheadHours * 10) / 10,
      totalScheduledHours: Math.round(totalScheduledHours * 10) / 10,
      operatorCount,
      efficiency: 85, // Vastgesteld op 85% volgens de matrix (of je kunt het berekenen als je dynamische downtime hebt)
      productionRatio: totalProductionHours > 0
        ? Math.round((realProductionHours / totalProductionHours) * 100)
        : 0
    };
  }, [occupancy, periodStart, periodEnd, selectedDepartment, factoryConfig, timePeriod]);

  const getOrderPlanningStartDate = (order: PlanningOrder) => {
    const planned = toDateSafe(order?.plannedDate);
    if (planned) return planned;

    const delivery = resolveDeliveryDate(
      order?.deliveryDate,
      order?.plannedDeliveryDate,
      order?.dueDate,
      order?.deadline
    );
    const planningState = getDeliveryPlanningState(delivery, {
      productionLeadDays: 21,
      finishBufferDays: 3,
    });
    return planningState.productionStartDate || null;
  };

  // Bereken geplande uren op basis van orders en standaard tijden
  const demandMetrics = useMemo(() => {
    const getSplitHours = (order: PlanningOrder) => {
      const bh = toNumber(order.plannedHoursBH || 0);
      const nab = toNumber(order.plannedHoursNabewerken || 0);
      const bm01 = toNumber(order.plannedHoursBM01 || 0);
      return { bh, nab, bm01, total: bh + nab + bm01 };
    };

    // Filter orders voor de geselecteerde periode
    let periodOrders = planningOrders.filter(order => {
      const orderDate = getOrderPlanningStartDate(order) || new Date();
      
      const status = (order.status || '').toLowerCase();
      if (status === 'cancelled') return false;

      // 1. Toekomst negeren
      if (orderDate > periodEnd) return false;

      // 2. Verleden: Alleen meenemen als NIET afgerond (Backlog)
      const isCompleted = ['completed', 'shipped', 'gereed', 'finished'].includes(status);
      if (orderDate < periodStart && isCompleted) return false;

      return true;
    });

    // Debug: toon unieke departments in planning data
    if (selectedDepartment !== "ALLES") {
      const uniqueDeptIds = [...new Set(periodOrders.map(o => o.departmentId))];
      const uniqueDeptNames = uniqueDeptIds.map(id => {
        const dept = factoryConfig.departments?.find(d => d.id === id);
        return dept ? dept.name : id;
      });
      console.log("📋 Department IDs in planning:", uniqueDeptIds);
      console.log("📋 Department Names:", uniqueDeptNames);
    }

    // DEBUG: Toon alle machines die in de database gevonden zijn voordat er gefilterd wordt
    console.log("🔍 Machines in database (Raw):", [...new Set(planningOrders.map(o => o.machine))]);

    // Filter op afdeling als niet "ALLES"
    if (selectedDepartment !== "ALLES") {
      periodOrders = periodOrders.filter(order => {
        // normalizeMachine strips LN-prefix "40" (bijv. "40BH18" → "BH18")
        const machine = normalizeMachine(order.machine || "");
        const selDept = selectedDepartment.toUpperCase();
        if (selDept === "FITTINGS" && (machine.startsWith("BH") || machine === "BM18")) return true;
        if (selDept === "PIPES" && machine.startsWith("BA")) return true;
        // Anders: standaard department check
        return matchesDepartment(order.departmentId, selectedDepartment);
      });
    }

    let totalPlannedUnits = 0;
    let estimatedHours = 0;
    let ordersWithStandards = 0;
    let ordersWithoutStandards = 0;
    let hoursFromEfficiency = 0;
    let ordersWithEfficiency = 0;
    const missingStandardsList: PlanningOrder[] = [];

    periodOrders.forEach(order => {
      const planCount = toNumber(order.plan || order.quantity || 0);
      totalPlannedUnits += planCount;
      const importedPlannedHours = toNumber(order.plannedHours || 0);
      const splitHours = getSplitHours(order);

      // 1. Check eerst of er specifieke uren zijn geïmporteerd (Infor LN) - case-insensitive match
      const orderIdKey = String(order.orderId || "");
      let importedInfo = orderIdKey ? efficiencyData[orderIdKey] : undefined;
      if (!importedInfo && orderIdKey) {
        // Probeer case-insensitive match
        const key = Object.keys(efficiencyData).find((k) => k.toLowerCase() === orderIdKey.toLowerCase());
        if (key) importedInfo = efficiencyData[key];
      }

      if (importedInfo && importedInfo.minutesPerUnit) {
        // Gebruik de geïmporteerde 'norm' per stuk (productie + nabewerken)
        const hoursNeeded = (importedInfo.minutesPerUnit * planCount) / 60;
        // Voeg Eindinspectie (QC) uren toe — staan apart in qcTimeTotal, niet in minutesPerUnit
        const qcQty = importedInfo.quantity || 1;
        const qcHours = qcQty > 0 ? ((importedInfo.qcTimeTotal || 0) / qcQty * planCount) / 60 : 0;
        estimatedHours += hoursNeeded + qcHours;
        ordersWithStandards++;
        hoursFromEfficiency += hoursNeeded + qcHours;
        ordersWithEfficiency++;
      } else if (splitHours.total > 0) {
        // Nieuwe PlanningImportModal met gesplitste stationuren (1715/1740/1020).
        estimatedHours += splitHours.total;
        ordersWithStandards++;
      } else if (importedPlannedHours > 0) {
        // Nieuwe planning import (plannedHours) direct gebruiken als vraag in uren.
        estimatedHours += importedPlannedHours;
        ordersWithStandards++;
      } else {
        // 2. Fallback: Zoek standaard tijd voor dit product op deze machine
        const standard = timeStandards.find(std => 
          std.itemCode === order.item && 
          std.machine === order.machine
        );

        if (standard && planCount > 0) {
          const hoursNeeded = (toNumber(standard.standardMinutes) * planCount) / 60;
          estimatedHours += hoursNeeded;
          ordersWithStandards++;
        } else if (planCount > 0) {
          ordersWithoutStandards++;
          missingStandardsList.push(order);
        }
      }
    });

    return {
      totalPlannedUnits,
      estimatedHours: Math.round(estimatedHours * 10) / 10,
      ordersWithStandards,
      ordersWithoutStandards,
      totalOrders: periodOrders.length,
      hoursFromEfficiency: Math.round(hoursFromEfficiency * 10) / 10,
      ordersWithEfficiency,
      missingStandardsList
    };
  }, [planningOrders, timeStandards, efficiencyData, periodStart, periodEnd, selectedDepartment, factoryConfig, timePeriod]);

  // Bereken balans per machine (Vraag vs Aanbod)
  const machineBreakdown = useMemo(() => {
    const breakdown: Record<string, { capacity: number; demand: number }> = {};

    // Geeft het QC/Eindinspectie station terug op basis van hoofdmachine
    const getQcStation = (machineName: string) => {
      if (machineName.startsWith("BH")) return "BM01";
      if (machineName.startsWith("BA")) return "BA01";
      return "BM01"; // Default fallback
    };

    const addDemandToMachine = (machineName: string, hours: unknown) => {
      const normalizedMachine = normalizeMachine(machineName || "");
      const safeHours = toNumber(hours || 0);
      if (!normalizedMachine || safeHours <= 0) return;

      if (!breakdown[normalizedMachine]) breakdown[normalizedMachine] = { capacity: 0, demand: 0 };
      breakdown[normalizedMachine].demand += safeHours;
    };

    // 1. Capaciteit per machine (Occupancy)
    occupancy.forEach(occ => {
      const occDate = toDateSafe(occ.date);
      if (!occDate) return;
      if (occDate < periodStart || occDate > periodEnd) return;
      
      // Filter by department
      if (selectedDepartment !== "ALLES" && !matchesDepartment(occ.departmentId, selectedDepartment)) return;

      const machine = normalizeMachine(occ.machineId || occ.machineName || "");
      if (!machine) return;
      
      if (!breakdown[machine]) breakdown[machine] = { capacity: 0, demand: 0 };
      
      // Toepassen van de Future Factory Capaciteitsmatrix regel (7 netto uren, 85% efficiency)
      let baseHours = toNumber(occ.hoursWorked || occ.hours || 0);
      if (!baseHours || baseHours === 8) {
        baseHours = 7;
      }
      
      const effectiveHours = baseHours * 0.85;
      breakdown[machine].capacity += effectiveHours;
    });

    // 2. Vraag per machine (Orders)
    planningOrders.forEach(order => {
      const orderDate = getOrderPlanningStartDate(order) || new Date();

      const status = (order.status || '').toLowerCase();
      if (status === 'cancelled') return;

      // 1. Toekomst negeren
      if (orderDate > periodEnd) return;

      // 2. Verleden: Alleen meenemen als NIET afgerond (Backlog)
      const isCompleted = ['completed', 'shipped', 'gereed', 'finished'].includes(status);
      if (orderDate < periodStart && isCompleted) return;

      // Filter by department, maar neem altijd mee als machine bij afdeling hoort
      const machine = normalizeMachine(order.machine || "");
      if (!machine) return;
      const selDept = selectedDepartment.toUpperCase();
      if (selectedDepartment !== "ALLES") {
        if (!( (selDept === "FITTINGS" && machine.startsWith("BH")) || (selDept === "PIPES" && machine.startsWith("BA")) || matchesDepartment(order.departmentId, selectedDepartment) )) {
          return;
        }
      }

      if (!breakdown[machine]) breakdown[machine] = { capacity: 0, demand: 0 };

      const splitBH = toNumber(order.plannedHoursBH || 0);
      const splitNabewerken = toNumber(order.plannedHoursNabewerken || 0);
      const splitBM01 = toNumber(order.plannedHoursBM01 || 0);
      const hasSplitHours = splitBH > 0 || splitNabewerken > 0 || splitBM01 > 0;

      if (hasSplitHours) {
        // Zet importuren op de juiste stations:
        // 1715 -> hoofdmachine (BH), 1740 -> NABEWERKING, 1020 -> BM01.
        addDemandToMachine(machine, splitBH);
        addDemandToMachine("NABEWERKING", splitNabewerken);
        addDemandToMachine("BM01", splitBM01);
        return;
      }

      let hoursNeeded = 0;
      // Case-insensitive efficiencyData lookup
      const orderIdKey = String(order.orderId || "");
      let importedInfo = orderIdKey ? efficiencyData[orderIdKey] : undefined;
      if (!importedInfo && orderIdKey) {
        const key = Object.keys(efficiencyData).find((k) => k.toLowerCase() === orderIdKey.toLowerCase());
        if (key) importedInfo = efficiencyData[key];
      }
      const planCount = toNumber(order.plan || order.quantity || 0);
      const importedPlannedHours = toNumber(order.plannedHours || 0);

      if (importedInfo) {
        // Check of we gesplitste data hebben (Productie vs Nabewerking)
        // Dit komt uit de Infor LN import (op 20 vs op 30)
        if (importedInfo.productionTimeTotal !== undefined || importedInfo.postProcessingTimeTotal !== undefined) {
            const qty = importedInfo.quantity || 1;
            // 1. Productie Tijd -> Gaat naar de geplande machine (bv. BH11)
            const prodTotal = importedInfo.productionTimeTotal || 0;
            const prodPerUnit = qty > 0 ? prodTotal / qty : 0;
            hoursNeeded = (prodPerUnit * planCount) / 60;

            // 2. Nabewerking Tijd -> Gaat naar 'NABEWERKING' station
            const postTotal = importedInfo.postProcessingTimeTotal || 0;
            if (postTotal > 0) {
                const postPerUnit = qty > 0 ? postTotal / qty : 0;
                const postHours = (postPerUnit * planCount) / 60;
                const postMachine = "NABEWERKING";
                if (!breakdown[postMachine]) breakdown[postMachine] = { capacity: 0, demand: 0 };
                breakdown[postMachine].demand += postHours;
            }

            // 3. Eindinspectie (QC) Tijd -> Gaat naar het QC station van de afdeling
            const qcTotal = importedInfo.qcTimeTotal || 0;
            if (qcTotal > 0) {
                const qcPerUnit = qty > 0 ? qcTotal / qty : 0;
                const qcHoursNeeded = (qcPerUnit * planCount) / 60;
                const qcStation = getQcStation(machine);
                if (!breakdown[qcStation]) breakdown[qcStation] = { capacity: 0, demand: 0 };
                breakdown[qcStation].demand += qcHoursNeeded;
            }
        } else if (importedInfo.minutesPerUnit) {
            // Fallback voor oude imports zonder splitsing
            hoursNeeded = (importedInfo.minutesPerUnit * planCount) / 60;
        }
      } else if (importedPlannedHours > 0) {
        hoursNeeded = importedPlannedHours;
      } else {
        const standard = timeStandards.find(std => 
          std.itemCode === order.item && 
          std.machine === order.machine
        );
        if (standard) {
           hoursNeeded = (toNumber(standard.standardMinutes) * planCount) / 60;
        }
      }

      breakdown[machine].demand += hoursNeeded;
    });

    // 2b. Consolidatie: Voeg varianten van Nabewerking samen (NABEWERKEN -> NABEWERKING)
    const targetKey = "NABEWERKING";
    const aliases = ["NABEWERKEN", "NABW"];
    
    aliases.forEach(alias => {
      if (breakdown[alias]) {
        if (!breakdown[targetKey]) breakdown[targetKey] = { capacity: 0, demand: 0 };
        breakdown[targetKey].capacity += breakdown[alias].capacity;
        breakdown[targetKey].demand += breakdown[alias].demand;
        delete breakdown[alias];
      }
    });

    // 3. Formatteren en Sorteren
    return Object.entries(breakdown)
      .map(([machine, data]) => ({
        machine,
        capacity: Math.round(data.capacity * 10) / 10,
        demand: Math.round(data.demand * 10) / 10,
        gap: Math.round((data.capacity - data.demand) * 10) / 10,
        utilization: data.capacity > 0 ? Math.round((data.demand / data.capacity) * 100) : 0,
        status: (data.capacity - data.demand) >= 0 ? 'surplus' : 'shortage'
      }))
      .filter(item => {
        // Verberg Teamleader en inactieve stations
        if (item.machine.includes("TEAMLEADER")) return false;
        return item.capacity > 0 || item.demand > 0;
      })
      .sort((a, b) => {
        const nameA = a.machine;
        const nameB = b.machine;
        
        const isBHA = nameA.startsWith("BH");
        const isBHB = nameB.startsWith("BH");

        // 1. BH Stations eerst (numeriek)
        if (isBHA && isBHB) {
           const numA = parseInt(nameA.replace(/\D/g, '')) || 0;
           const numB = parseInt(nameB.replace(/\D/g, '')) || 0;
           return numA - numB;
        }
        if (isBHA) return -1;
        if (isBHB) return 1;
        
        // 2. Specifieke volgorde voor overige
        const priorityOrder = ["ALGEMEEN", "NABEWERK", "BM01", "BA01", "MAZAK", "LOSSEN"];
        
        const getPriority = (name: string) => {
          const idx = priorityOrder.findIndex(k => name.includes(k));
          return idx !== -1 ? idx : 999;
        };

        const prioA = getPriority(nameA);
        const prioB = getPriority(nameB);

        if (prioA !== prioB) return prioA - prioB;
        
        // 3. Alfabetisch voor de rest
        return nameA.localeCompare(nameB);
      });

  }, [occupancy, planningOrders, efficiencyData, timeStandards, periodStart, periodEnd, selectedDepartment]);

  // Bereken verschil
  const gap = useMemo(() => {
    // Gebruik realProductionHours voor vergelijking met planning
    const difference = capacityMetrics.realProductionHours - demandMetrics.estimatedHours;
    const percentage = demandMetrics.estimatedHours > 0
      ? Math.round((difference / demandMetrics.estimatedHours) * 100)
      : 0;

    return {
      hours: Math.round(difference * 10) / 10,
      percentage,
      status: difference >= 0 ? 'surplus' : 'shortage'
    };
  }, [capacityMetrics, demandMetrics]);

  // Knelpunten analyse
  const bottlenecks = useMemo(() => {
    const issues = [];
    
    // Te weinig capaciteit
    if (gap.status === 'shortage' && Math.abs(gap.hours) > 10) {
      issues.push({
        type: 'capacity_shortage',
        severity: 'high',
        title: 'Capaciteitstekort',
        description: `${Math.abs(gap.hours)}u te kort voor geplande productie`,
        icon: AlertTriangle,
        color: 'text-red-500'
      });
    }
    
    // Orders zonder tijdstandaarden
    if (demandMetrics.ordersWithoutStandards > 0) {
      const percentage = Math.round((demandMetrics.ordersWithoutStandards / demandMetrics.totalOrders) * 100);
      issues.push({
        type: 'missing_standards',
        severity: percentage > 50 ? 'high' : 'medium',
        title: 'Ontbrekende Productietijden',
        description: `${demandMetrics.ordersWithoutStandards} orders (${percentage}%) zonder standaardtijden`,
        icon: Clock,
        color: percentage > 50 ? 'text-orange-500' : 'text-yellow-500'
      });
    }
    
    // Lage efficiency
    if (capacityMetrics.efficiency < 70) {
      issues.push({
        type: 'low_efficiency',
        severity: 'medium',
        title: 'Lage Efficiency',
        description: `Slechts ${capacityMetrics.efficiency}% van beschikbare tijd productief`,
        icon: TrendingDown,
        color: 'text-yellow-500'
      });
    }
    
    // Te weinig operators
    if (capacityMetrics.operatorCount < 3) {
      issues.push({
        type: 'low_staffing',
        severity: 'medium',
        title: 'Onderbezetting',
        description: `Slechts ${capacityMetrics.operatorCount} operators deze week`,
        icon: Users,
        color: 'text-yellow-500'
      });
    }
    
    return issues;
  }, [gap, capacityMetrics, demandMetrics]);

  // Voorspelling voor volgende weken (simpel trend-based)
  const prediction = useMemo(() => {
    const currentCapacity = capacityMetrics.realProductionHours;
    const currentDemand = demandMetrics.estimatedHours;
    
    // Simpele voorspelling: assumeer 10% groei in demand
    const predictedDemand = currentDemand * 1.1;
    const predictedGap = currentCapacity - predictedDemand;
    
    return {
      nextWeekDemand: Math.round(predictedDemand * 10) / 10,
      nextWeekGap: Math.round(predictedGap * 10) / 10,
      trend: predictedGap < 0 ? 'increasing_pressure' : 'manageable',
      confidence: demandMetrics.ordersWithStandards > 0 ? 'medium' : 'low'
    };
  }, [capacityMetrics, demandMetrics]);

  // PDF Export functie
  const exportToPDF = async () => {
    const [{ default: jsPDF }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF();
    const pdfDoc = doc as typeof doc & {
      autoTable: (options: unknown) => void;
      lastAutoTable?: { finalY: number };
    };
    const pageWidth = doc.internal.pageSize.width;
    
    // Titel
    doc.setFontSize(20);
    doc.text("Capaciteitsrapport", 14, 20);
    
    // Subtitle
    doc.setFontSize(12);
    doc.text(`Week ${currentWeek} • ${format(weekStart, 'd MMM')} - ${format(weekEnd, 'd MMM yyyy')}`, 14, 28);
    doc.text(`Afdeling: ${selectedDepartment}`, 14, 34);
    
    // Capaciteit sectie
    doc.setFontSize(14);
    doc.text("Beschikbare Capaciteit", 14, 45);
    
    pdfDoc.autoTable({
      startY: 50,
      head: [['Metric', 'Waarde']],
      body: [
        ['Totaal Uren', `${capacityMetrics.totalProductionHours}u`],
        ['Productie Uren (BH/BA)', `${capacityMetrics.realProductionHours}u`],
        ['Support Uren', `${capacityMetrics.supportHours}u`],
        ['Overhead', `${capacityMetrics.overheadHours}u`],
        ['Operators', capacityMetrics.operatorCount],
        ['Efficiency', `${capacityMetrics.efficiency}%`]
      ],
      theme: 'striped'
    });
    
    // Vraag sectie
    const yPos = (pdfDoc.lastAutoTable?.finalY || 50) + 10;
    doc.setFontSize(14);
    doc.text("Geplande Vraag", 14, yPos);
    
    pdfDoc.autoTable({
      startY: yPos + 5,
      head: [['Metric', 'Waarde']],
      body: [
        ['Geplande Eenheden', demandMetrics.totalPlannedUnits],
        ['Geschatte Uren', `${demandMetrics.estimatedHours}u`],
        ['Orders met Tijden', demandMetrics.ordersWithStandards],
        ['Orders zonder Tijden', demandMetrics.ordersWithoutStandards]
      ],
      theme: 'striped'
    });
    
    // Gap analyse
    const yPos2 = (pdfDoc.lastAutoTable?.finalY || yPos + 20) + 10;
    doc.setFontSize(14);
    doc.text("Gap Analyse", 14, yPos2);
    
    pdfDoc.autoTable({
      startY: yPos2 + 5,
      head: [['Metric', 'Waarde']],
      body: [
        ['Verschil', `${gap.hours}u`],
        ['Percentage', `${gap.percentage}%`],
        ['Status', gap.status === 'surplus' ? 'Overcapaciteit' : 'Tekort']
      ],
      theme: 'striped'
    });
    
    // Knelpunten
    if (bottlenecks.length > 0) {
      const yPos3 = (pdfDoc.lastAutoTable?.finalY || yPos2 + 20) + 10;
      doc.setFontSize(14);
      doc.text("Knelpunten", 14, yPos3);
      
      pdfDoc.autoTable({
        startY: yPos3 + 5,
        head: [['Type', 'Beschrijving', 'Prioriteit']],
        body: bottlenecks.map(b => [b.title, b.description, b.severity.toUpperCase()]),
        theme: 'striped'
      });
    }
    
    // Voettekst
    doc.setFontSize(8);
    doc.text(`Gegenereerd: ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, 14, doc.internal.pageSize.height - 10);
    doc.text(`Gebruiker: ${user?.name || user?.email}`, pageWidth - 14, doc.internal.pageSize.height - 10, { align: 'right' });
    
    // Download
    doc.save(`capaciteit_week${currentWeek}_${selectedDepartment}.pdf`);
  };

  // Week navigatie functies
  const goToPreviousWeek = () => {
    setSelectedWeek(prev => subWeeks(prev, 1));
  };
  
  const goToNextWeek = () => {
    setSelectedWeek(prev => addWeeks(prev, 1));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4">
        <div className="inline-flex items-center rounded-xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-widest border-slate-300 bg-slate-100 text-slate-700">
          Databron: Productie
        </div>
      </div>
      {/* White Toolbar Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-col xl:flex-row justify-between items-center gap-4 shrink-0 z-30 shadow-sm">
        
        {/* Left Spacer for Centering (Desktop) */}
        <div className="hidden xl:block flex-1"></div>
        
        {/* Tabs Navigation */}
        <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto max-w-full no-scrollbar shrink-0 justify-center">
          {[
            { id: "capacity", label: t("planning.capacity.tabs.capacity", "Capaciteit"), icon: BarChart3 },
            { id: "efficiency", label: t("planning.capacity.tabs.efficiency", "Efficiency"), icon: Activity },
            { id: "gantt", label: t("planning.capacity.tabs.gantt", "Gantt"), icon: LayoutDashboard },
            { id: "timetracking", label: t("planning.capacity.tabs.timetracking", "Time Tracking"), icon: Clock },
            { id: "heatmap", label: t("planning.capacity.tabs.heatmap", "Heatmap"), icon: BarChart2 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-slate-200 text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/60"
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Controls (Right) */}
        <div className="flex items-center gap-4 w-full xl:flex-1 justify-end">
          {activeTab === "capacity" && (
            <>
            {/* Department Filter */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-500 font-bold uppercase tracking-widest hidden sm:block">
                {t("planning.capacity.department", "Afdeling:")}
              </label>
              {canChangeFilter ? (
                <div className="relative">
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 font-bold pr-8"
                  >
                    {departments.map(dept => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="bg-slate-100 border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold text-slate-700 flex items-center gap-2">
                  {selectedDepartment}
                  <span className="text-xs text-blue-500">{t("planning.capacity.assigned", "(toegewezen)")}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors text-xs font-bold"
              >
                <Upload size={16} />
                <span className="hidden sm:inline">{t("planning.capacity.upload", "Upload")}</span>
              </button>
              <button
                onClick={exportToPDF}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors text-xs font-bold"
              >
                <FileDown size={16} />
                <span className="hidden sm:inline">{t("common.pdf", "PDF")}</span>
              </button>
            </div>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === "capacity" && (
        <div className="p-6">
        <div className="max-w-7xl mx-auto space-y-6 w-full">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[40px] text-white relative overflow-hidden shadow-xl border border-white/5">
        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
          <BarChart3 size={150} />
        </div>
        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
                {t("planning.capacity.titlePrefix", "Capaciteits")} <span className="text-blue-400">{t("planning.capacity.titleAccent", "Planning")}</span>
              </h2>
              <div className="flex items-center gap-4 mt-4">
                {/* Time Period Selector */}
                <div className="flex gap-2">
                  {[
                    { value: "week", label: t("planning.capacity.periods.week", "Week"), icon: "📅" },
                    { value: "ytd", label: t("planning.capacity.periods.ytd", "YTD"), icon: "📈" },
                    { value: "year", label: t("planning.capacity.periods.year", "Jaar"), icon: "📊" },
                    { value: "future", label: t("planning.capacity.periods.future", "Toekomst"), icon: "🔮" },
                    { value: "yoy", label: t("planning.capacity.periods.yoy", "YoY Vergelijking"), icon: "📉" }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setTimePeriod(option.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        timePeriod === option.value
                          ? "bg-blue-500/30 border border-blue-400/50 text-white"
                          : "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      {option.icon} {option.label}
                    </button>
                  ))}
                </div>

                {/* Year Selector (voor YTD, Year, YoY) */}
                {["ytd", "year", "yoy"].includes(timePeriod) && (
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {[selectedYear, selectedYear - 1, selectedYear - 2].map(year => (
                      <option key={year} value={year} className="text-slate-900">
                        {year}
                      </option>
                    ))}
                  </select>
                )}

                {/* Comparison Year (voor YoY) */}
                {timePeriod === "yoy" && (
                  <>
                    <span className="text-xs text-slate-400">{t("planning.capacity.vs", "vs")}</span>
                    <select
                      value={comparisonYear}
                      onChange={(e) => setComparisonYear(parseInt(e.target.value))}
                      className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      {[selectedYear - 1, selectedYear - 2, selectedYear - 3].map(year => (
                        <option key={year} value={year} className="text-slate-900">
                          {year}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                {/* Week Navigator (alleen voor week view) */}
                {timePeriod === "week" && (
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      onClick={goToPreviousWeek}
                      className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-widest min-w-[200px] text-center">
                      {periodLabel}
                    </span>
                    <button
                      onClick={goToNextWeek}
                      className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}

                {/* Period Label (voor andere views) */}
                {timePeriod !== "week" && (
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-widest ml-auto">
                    {periodLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Totaal Beschikbare Uren */}
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <Users className="text-slate-600" size={24} />
            <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-black">
              {t("planning.capacity.metrics.total", "Totaal")}
            </span>
          </div>
          <div className="text-4xl font-black text-slate-600 mb-2">
            {capacityMetrics.totalProductionHours}u
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
            {t("planning.capacity.metrics.availableHours", "Beschikbare Mens-uren")}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">{t("planning.capacity.metrics.operators", "Operators")}</span>
              <span className="font-bold">{capacityMetrics.operatorCount}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">{t("planning.capacity.metrics.overhead", "Overhead")}</span>
              <span className="font-bold">{capacityMetrics.overheadHours}u</span>
            </div>
          </div>
        </div>

        {/* Werkelijke Productie Uren (BH/BA) */}
        <div className="bg-white border-2 border-emerald-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <Activity className="text-emerald-600" size={24} />
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black">
              {t("planning.capacity.metrics.production", "Productie")}
            </span>
          </div>
          <div className="text-4xl font-black text-emerald-600 mb-2">
            {capacityMetrics.realProductionHours}u
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
            {t("planning.capacity.metrics.bhbaStations", "BH/BA stations")}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">{t("planning.capacity.metrics.ratio", "Ratio")}</span>
              <span className="font-bold">{capacityMetrics.productionRatio}%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">{t("planning.capacity.metrics.support", "Support")}</span>
              <span className="font-bold">{capacityMetrics.supportHours}u</span>
            </div>
          </div>
        </div>

        {/* Geplande Vraag */}
        <div className="bg-white border-2 border-blue-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <Calendar className="text-blue-600" size={24} />
            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-black">
              {t("planning.capacity.metrics.planning", "Planning")}
            </span>
          </div>
          <div className="text-4xl font-black text-blue-600 mb-2">
            {demandMetrics.estimatedHours}u
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
            {t("planning.capacity.metrics.requiredOrderHours", "Benodigde Order-uren")}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">{t("planning.capacity.metrics.orders", "Orders")}</span>
              <span className="font-bold">{demandMetrics.totalOrders}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">{t("planning.capacity.metrics.units", "Units")}</span>
              <span className="font-bold">{demandMetrics.totalPlannedUnits}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">{t("planning.capacity.metrics.withStandard", "Met standaard")}</span>
              <span className="font-bold">{demandMetrics.ordersWithStandards}/{demandMetrics.totalOrders}</span>
            </div>
            {demandMetrics.hoursFromEfficiency > 0 && (
              <div className="flex justify-between text-xs pt-2 mt-2 border-t border-slate-100">
                <span className="text-purple-600 font-bold">{t("planning.capacity.metrics.fromEfficiency", "Uit Efficiency")}</span>
                <span className="font-black text-purple-600">{demandMetrics.hoursFromEfficiency}u ({demandMetrics.ordersWithEfficiency})</span>
              </div>
            )}
          </div>
        </div>

        {/* Verschil */}
        <div className={`bg-white border-2 rounded-2xl p-6 ${
          gap.status === 'surplus' 
            ? 'border-emerald-200' 
            : 'border-rose-200'
        }`}>
          <div className="flex items-center justify-between mb-4">
            {gap.status === 'surplus' ? (
              <CheckCircle2 className="text-emerald-600" size={24} />
            ) : (
              <AlertTriangle className="text-rose-600" size={24} />
            )}
            <span className={`px-3 py-1 rounded-full text-xs font-black ${
              gap.status === 'surplus'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-700'
            }`}>
              {gap.status === 'surplus' ? t("planning.capacity.metrics.surplus", "Overschot") : t("planning.capacity.metrics.shortage", "Tekort")}
            </span>
          </div>
          <div className={`text-4xl font-black mb-2 ${
            gap.status === 'surplus' ? 'text-emerald-600' : 'text-rose-600'
          }`}>
            {gap.status === 'surplus' ? '+' : ''}{gap.hours}u
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
            {gap.status === 'surplus' ? t("planning.capacity.metrics.overcapacity", "Overcapaciteit") : t("planning.capacity.metrics.undercapacity", "Ondercapaciteit")}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">{t("planning.capacity.metrics.percentage", "Percentage")}</span>
              <span className={`font-black ${
                gap.status === 'surplus' ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {gap.percentage > 0 ? '+' : ''}{gap.percentage}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Machine Capaciteit Balans (NIEUW) */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4 flex items-center gap-2">
          <Activity size={18} />
          {t("planning.capacity.machineBalance", "Machine Capaciteit Balans")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {machineBreakdown.map((item) => (
            <div 
              key={item.machine} 
              className={`p-4 rounded-xl border-2 ${
                item.status === 'shortage' 
                  ? 'bg-red-50 border-red-100' 
                  : 'bg-emerald-50 border-emerald-100'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-black text-slate-800 text-lg">{item.machine}</span>
                <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wider ${
                  item.status === 'shortage' 
                    ? 'bg-red-100 text-red-700' 
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {item.status === 'shortage' ? t("planning.capacity.metrics.shortage", "Tekort") : t("planning.capacity.metrics.surplus", "Overschot")}
                </span>
              </div>
              
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">{t("planning.capacity.machine.availablePeople", "Beschikbaar (Mensen):")}</span>
                  <span className="font-bold text-slate-700">{item.capacity}u</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">{t("planning.capacity.machine.requiredOrders", "Nodig (Orders):")}</span>
                  <span className="font-bold text-slate-700">{item.demand}u</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">{t("planning.capacity.machine.utilization", "Bezettingsgraad:")}</span>
                  <span className={`font-bold ${item.utilization > 100 ? 'text-red-600' : 'text-slate-700'}`}>
                    {item.utilization}%
                  </span>
                </div>
                <div className={`flex justify-between pt-2 border-t ${
                  item.status === 'shortage' ? 'border-red-200' : 'border-emerald-200'
                }`}>
                  <span className="font-black uppercase">{t("planning.capacity.machine.difference", "Verschil:")}</span>
                  <span className={`font-black text-sm ${
                    item.status === 'shortage' ? 'text-red-600' : 'text-emerald-600'
                  }`}>
                    {item.gap > 0 ? '+' : ''}{item.gap}u
                  </span>
                </div>
              </div>
            </div>
          ))}
          
          {machineBreakdown.length === 0 && (
            <div className="col-span-full text-center py-8 text-slate-400 italic text-xs">
              {t("planning.capacity.noDataForPeriod", "Geen data beschikbaar voor deze periode/afdeling.")}
            </div>
          )}
        </div>
      </div>

      {/* Warnings */}
      {demandMetrics.ordersWithoutStandards > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-600 flex-shrink-0" size={20} />
            <div className="flex-1">
              <div className="text-sm font-bold text-amber-900">
                {t("planning.capacity.missingStandardsTitle", "Ontbrekende Standaard Tijden")}
              </div>
              <div className="text-xs text-amber-700 mt-1">
                {t("planning.capacity.missingStandardsMessage", "{{count}} orders hebben geen standaard productietijd ingesteld.", { count: demandMetrics.ordersWithoutStandards })}
                {onNavigate ? (
                  <button onClick={() => onNavigate("production_standards")} className="underline font-bold hover:text-amber-900 ml-1">
                    {t("planning.capacity.goToProductionTimes", "Ga naar Productie Tijden")}
                  </button>
                ) : (
                  <span> {t("planning.capacity.goTo", "Ga naar")} <strong>{t("planning.capacity.productionTimes", "Productie Tijden")}</strong></span>
                )}
                 {t("planning.capacity.missingStandardsSuffix", "om deze toe te voegen voor nauwkeurigere capaciteitsberekening.")}
              </div>
              <button 
                onClick={() => setShowMissingStandards(!showMissingStandards)}
                className="flex items-center gap-1 text-xs font-bold text-amber-800 mt-2 hover:text-amber-900 transition-colors"
              >
                {showMissingStandards ? t("planning.capacity.hideList", "Verberg lijst") : t("planning.capacity.showList", "Toon lijst")} 
                {showMissingStandards ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          </div>

          {showMissingStandards && (
            <div className="bg-white/60 rounded-xl border border-amber-200 overflow-hidden animate-in slide-in-from-top-2">
              <div className="max-h-60 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-xs">
                  <thead className="bg-amber-100/50 text-amber-900 font-bold sticky top-0">
                    <tr>
                      <th className="px-3 py-2">{t("planning.capacity.table.order", "Order")}</th>
                      <th className="px-3 py-2">{t("planning.capacity.table.itemCode", "Item Code")}</th>
                      <th className="px-3 py-2">{t("planning.capacity.table.description", "Omschrijving")}</th>
                      <th className="px-3 py-2">{t("planning.capacity.table.machine", "Machine")}</th>
                      <th className="px-3 py-2 text-right">{t("planning.capacity.table.quantity", "Aantal")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {demandMetrics.missingStandardsList.map(order => (
                      <tr key={order.id} className="hover:bg-amber-50/50 transition-colors">
                        <td className="px-3 py-2 font-mono font-bold text-amber-800">{order.orderId}</td>
                        <td className="px-3 py-2 font-mono text-amber-900">{order.itemCode || "-"}</td>
                        <td className="px-3 py-2 text-amber-900 truncate max-w-[150px]" title={order.item}>{order.item}</td>
                        <td className="px-3 py-2 text-amber-800">{order.machine}</td>
                        <td className="px-3 py-2 text-right text-amber-900 font-bold">{order.plan}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4 flex items-center gap-2">
          <Target size={18} />
          {t("planning.capacity.recommendationsTitle", "Aanbevelingen")}
        </h3>
        <div className="space-y-3">
          {gap.status === 'shortage' ? (
            <>
              <div className="flex items-start gap-3 p-3 bg-rose-50 rounded-xl">
                <AlertTriangle className="text-rose-600 flex-shrink-0 mt-0.5" size={16} />
                <div className="text-xs">
                  <div className="font-bold text-rose-900">{t("planning.capacity.recommendations.shortageTitle", "Onderbezetting")}</div>
                  <div className="text-rose-700 mt-1">
                    {t("planning.capacity.recommendations.shortageText", "Er zijn {{hours}} uur te weinig. Overweeg extra shifts, overuren, of herplan niet-kritische orders.", { hours: Math.abs(gap.hours) })}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3 p-3 bg-emerald-50 rounded-xl">
                <CheckCircle2 className="text-emerald-600 flex-shrink-0 mt-0.5" size={16} />
                <div className="text-xs">
                  <div className="font-bold text-emerald-900">{t("planning.capacity.recommendations.availableTitle", "Capaciteit Beschikbaar")}</div>
                  <div className="text-emerald-700 mt-1">
                    {t("planning.capacity.recommendations.availableText", "Er zijn {{hours}} uur over. Mogelijkheden: extra orders aannemen, preventief onderhoud, training, of proces optimalisatie.", { hours: gap.hours })}
                  </div>
                </div>
              </div>
            </>
          )}
          
          {capacityMetrics.efficiency < 70 && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl">
              <Zap className="text-amber-600 flex-shrink-0 mt-0.5" size={16} />
              <div className="text-xs">
                <div className="font-bold text-amber-900">{t("planning.capacity.recommendations.lowEfficiencyTitle", "Lage Efficiency")}</div>
                <div className="text-amber-700 mt-1">
                  {t("planning.capacity.recommendations.lowEfficiencyText", "Slechts {{efficiency}}% van de tijd wordt productief gebruikt. Analyseer waar tijd verloren gaat: setup, wachttijden, materiaal tekorten?", { efficiency: capacityMetrics.efficiency })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4">
            {t("planning.capacity.hoursDistribution", "Uren Verdeling")}
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">{t("planning.capacity.breakdown.productionBhba", "Productie (BH/BA)")}</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${capacityMetrics.productionRatio}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-16 text-right">
                  {capacityMetrics.realProductionHours}u
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">{t("planning.capacity.metrics.support", "Support")}</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-slate-400 rounded-full"
                    style={{ width: `${100 - capacityMetrics.productionRatio}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-16 text-right">
                  {capacityMetrics.supportHours}u
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-600">{t("planning.capacity.metrics.overhead", "Overhead")}</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${100 - capacityMetrics.efficiency}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-16 text-right">
                  {capacityMetrics.overheadHours}u
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4">
            {t("planning.capacity.planningStatus", "Planning Status")}
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">{t("planning.capacity.status.inforLn", "Infor LN (Efficiency)")}</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 rounded-full"
                    style={{ 
                      width: `${demandMetrics.totalOrders > 0 
                        ? (demandMetrics.ordersWithEfficiency / demandMetrics.totalOrders) * 100 
                        : 0}%` 
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-12 text-right">
                  {demandMetrics.ordersWithEfficiency}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">{t("planning.capacity.status.standardDb", "Standaard DB")}</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full"
                    style={{ 
                      width: `${demandMetrics.totalOrders > 0 
                        ? ((demandMetrics.ordersWithStandards - demandMetrics.ordersWithEfficiency) / demandMetrics.totalOrders) * 100 
                        : 0}%` 
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-12 text-right">
                  {demandMetrics.ordersWithStandards - demandMetrics.ordersWithEfficiency}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">{t("planning.capacity.status.withoutData", "Zonder data")}</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 rounded-full"
                    style={{ 
                      width: `${demandMetrics.totalOrders > 0 
                        ? (demandMetrics.ordersWithoutStandards / demandMetrics.totalOrders) * 100 
                        : 0}%` 
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-12 text-right">
                  {demandMetrics.ordersWithoutStandards}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Knelpunten Analyse */}
      {bottlenecks.length > 0 && (
        <div className="bg-white border-2 border-red-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="text-red-600" size={20} />
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
              {t("planning.capacity.bottlenecksTitle", "Geïdentificeerde Knelpunten")}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {bottlenecks.map((bottleneck, idx) => {
              const Icon = bottleneck.icon;
              return (
                <div key={idx} className={`p-4 rounded-xl border-2 ${
                  bottleneck.severity === 'high' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                }`}>
                  <div className="flex items-start gap-3">
                    <Icon className={bottleneck.color} size={20} />
                    <div className="flex-1">
                      <div className="font-bold text-sm text-slate-800">{bottleneck.title}</div>
                      <div className="text-xs text-slate-600 mt-1">{bottleneck.description}</div>
                      <div className={`text-xs font-bold mt-2 ${
                        bottleneck.severity === 'high' ? 'text-red-600' : 'text-amber-600'
                      }`}>
                        {t("planning.capacity.priority", "Prioriteit")}: {bottleneck.severity.toUpperCase()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Voorspelling */}
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="text-purple-600" size={20} />
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
            {t("planning.capacity.predictionTitle", "Voorspelling Volgende Week")}
          </h3>
          <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full font-bold">
            BETA
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-4 border border-purple-100">
            <div className="text-xs text-slate-600 uppercase tracking-wider mb-1">{t("planning.capacity.prediction.expectedDemand", "Verwachte Vraag")}</div>
            <div className="text-2xl font-black text-purple-600">{prediction.nextWeekDemand}u</div>
            <div className="text-xs text-slate-500 mt-1">{t("planning.capacity.prediction.trendGrowth", "+10% trend groei")}</div>
          </div>
          
          <div className="bg-white rounded-xl p-4 border border-purple-100">
            <div className="text-xs text-slate-600 uppercase tracking-wider mb-1">{t("planning.capacity.prediction.predictedGap", "Voorspeld Verschil")}</div>
            <div className={`text-2xl font-black ${prediction.nextWeekGap >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {prediction.nextWeekGap}u
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {prediction.trend === 'increasing_pressure' ? t("planning.capacity.prediction.increasingPressure", "⚠️ Toenemende druk") : t("planning.capacity.prediction.manageable", "✓ Beheersbaar")}
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-4 border border-purple-100">
            <div className="text-xs text-slate-600 uppercase tracking-wider mb-1">{t("planning.capacity.prediction.confidence", "Betrouwbaarheid")}</div>
            <div className={`text-2xl font-black ${
              prediction.confidence === 'high' ? 'text-emerald-600' : 
              prediction.confidence === 'medium' ? 'text-amber-600' : 'text-slate-400'
            }`}>
              {prediction.confidence === 'high' ? t("planning.capacity.prediction.high", "Hoog") : prediction.confidence === 'medium' ? t("planning.capacity.prediction.medium", "Middel") : t("planning.capacity.prediction.low", "Laag")}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {demandMetrics.ordersWithStandards > 0 ? t("planning.capacity.prediction.ordersWithData", "{{count}} orders met data", { count: demandMetrics.ordersWithStandards }) : t("planning.capacity.prediction.insufficientData", "Onvoldoende data")}
            </div>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
          <div className="flex items-start gap-2">
            <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={14} />
            <div className="text-xs text-blue-800">
              <strong>{t("common.note", "Let op")}:</strong> {t("planning.capacity.prediction.noticeLead", "Deze voorspelling is gebaseerd op historische trends en aannames.")} 
              Gebruik dit als indicatie, niet als absolute waarheid. Houd rekening met seizoensinvloeden, 
              geplande stilstand, en externe factoren.
            </div>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      <CapacityImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          console.log("Uren geïmporteerd");
        }}
      />
      </div>
      </div>
      )}
      
      {activeTab === "efficiency" && <EfficiencyDashboard />}
      {activeTab === "gantt" && <GanttChartView />}
      {activeTab === "timetracking" && (
        <TimeTrackingView
          initialDepartment={selectedDepartment}
        />
      )}
      {activeTab === "heatmap" && <WorkloadHeatmapView />}
    </div>
    </div>
  );
};

export default CapacityPlanningView;
