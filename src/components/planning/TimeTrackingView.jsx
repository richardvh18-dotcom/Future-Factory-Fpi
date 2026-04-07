import React, { useState, useEffect, useMemo } from "react";
import { 
  Clock, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Calendar,
  Building2
} from "lucide-react";
import { collection, onSnapshot, doc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { getArchiveItemsPath, getReadPaths } from "../../config/dbPaths";
import { format, getISOWeek, startOfWeek, endOfWeek, startOfDay, endOfDay, startOfMonth, endOfMonth, isWithinInterval, isValid, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from "date-fns";
import { calculateDuration } from "../../utils/efficiencyCalculator";

/**
 * TimeTrackingView - Compare actual vs planned time
 * Shows time variance and identifies bottlenecks
 */
const TimeTrackingView = ({ dataSourceMode = "current" }) => {
  const usePilotReadData = dataSourceMode === "pilot-read";
  const readPaths = useMemo(() => getReadPaths(usePilotReadData), [usePilotReadData]);
  const [orders, setOrders] = useState([]);
  const [, setOccupancy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [efficiencyData, setEfficiencyData] = useState({});
  const [trackingLogs, setTrackingLogs] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState("week");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedDepartment, setSelectedDepartment] = useState("ALLES");
  const [departments, setDepartments] = useState(["ALLES"]);
  const [factoryConfig, setFactoryConfig] = useState({ departments: [] });
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);

  useEffect(() => {
    if (!readPaths) return;

    const unsubOrders = onSnapshot(
      collection(db, ...readPaths.PLANNING),
      (snapshot) => {
        const ordersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setOrders(ordersData);
        setLoading(false);
      }
    );

    const unsubOccupancy = onSnapshot(
      collection(db, ...readPaths.OCCUPANCY),
      (snapshot) => {
        const occData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setOccupancy(occData);
      }
    );

    // Load efficiency/imported hours
    const unsubEfficiency = onSnapshot(
      collection(db, ...readPaths.EFFICIENCY_HOURS),
      (snapshot) => {
        const data = {};
        snapshot.docs.forEach((doc) => {
          data[doc.id] = doc.data();
        });
        setEfficiencyData(data);
      }
    );

    // Load tracking logs for actuals calculation
    const mergeTrackingRows = (activeRows, archivedRows) => {
      const merged = new Map();
      [...activeRows, ...archivedRows].forEach((row) => {
        const key = String(row.id || row.lotNumber || `${row.orderId || ""}-${row.itemCode || ""}`);
        if (!merged.has(key)) merged.set(key, row);
      });
      setTrackingLogs(Array.from(merged.values()));
    };

    let activeTrackingRows = [];
    let archivedTrackingRows = [];

    const unsubTracking = onSnapshot(
      collection(db, ...readPaths.TRACKING),
      (snapshot) => {
        activeTrackingRows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        mergeTrackingRows(activeTrackingRows, archivedTrackingRows);
      }
    );

    const archiveYear = selectedDate.getFullYear();
    const unsubArchiveTracking = onSnapshot(
      collection(db, ...getArchiveItemsPath(archiveYear)),
      (snapshot) => {
        archivedTrackingRows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), _archived: true, _archiveYear: archiveYear }));
        mergeTrackingRows(activeTrackingRows, archivedTrackingRows);
      }
    );

    // Load departments from factory structure
    const unsubConfig = onSnapshot(
      doc(db, ...readPaths.FACTORY_CONFIG),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setFactoryConfig(data);
          const depts = Array.isArray(data.departments) 
            ? data.departments.filter(d => d.isActive !== false).map(d => d.name)
            : [];
          setDepartments(["ALLES", ...depts]);
        }
      }
    );

    return () => {
      unsubOrders();
      unsubOccupancy();
      unsubEfficiency();
      unsubTracking();
      unsubArchiveTracking();
      unsubConfig();
    };
  }, [readPaths, selectedDate]);

  const toDateValue = (value) => {
    if (!value) return null;
    if (value?.toDate) return value.toDate();
    if (value?.seconds) return new Date(value.seconds * 1000);
    const d = value instanceof Date ? value : new Date(value);
    return isValid(d) ? d : null;
  };

  const inferDepartmentFromMachine = (machine) => {
    const m = String(machine || "").trim().toUpperCase();
    if (m.startsWith("BH")) return "Fittings";
    if (m.startsWith("BA")) return "Pipes";
    if (m.startsWith("BM")) return "Spools";
    return "";
  };

  const parseNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const classifyByWc = (wc) => {
    const upper = String(wc || "").toUpperCase();
    if (upper.includes("BM01") || upper.includes("BA01")) return "qc";
    if (upper.includes("NABEWERK") || upper.includes("NABEW")) return "post";
    return null;
  };

  const classifyReferenceOperation = (refOp, wc) => {
    const wcBucket = classifyByWc(wc);
    if (wcBucket) return wcBucket;

    const digits = parseInt(String(refOp || "").replace(/\D/g, ""), 10);
    if (Number.isNaN(digits)) return "production";
    const opCode = digits % 100;
    if (opCode === 60) return "qc";
    if (opCode === 30) return "post";
    return "production";
  };

  const getSplitPlannedHours = (operations, fallbackTotalHours = 0) => {
    const split = { productionHours: 0, postHours: 0, qcHours: 0 };
    const entries = Object.entries(operations || {});

    if (!entries.length) {
      return {
        ...split,
        totalHours: parseNumber(fallbackTotalHours),
        hasReferenceOps: false,
      };
    }

    entries.forEach(([refOp, values]) => {
      const planned = parseNumber(values?.planned);
      const bucket = classifyReferenceOperation(refOp, values?.wc);
      if (bucket === "qc") split.qcHours += planned;
      else if (bucket === "post") split.postHours += planned;
      else split.productionHours += planned;
    });

    const totalHours = split.productionHours + split.postHours + split.qcHours;
    return {
      ...split,
      totalHours,
      hasReferenceOps: true,
    };
  };

  const getOrderActualHours = (orderLike) => {
    if (!orderLike) return 0;

    const hourCandidates = [
      orderLike.totalActualHours,
      orderLike.actualHours,
      orderLike.spentProductionTime,
      orderLike.hoursWorked,
      orderLike.productionHours,
    ];

    for (const candidate of hourCandidates) {
      const hours = parseNumber(candidate);
      if (hours > 0) return hours;
    }

    const minuteCandidates = [
      orderLike.actualMinutes,
      orderLike.totalActualMinutes,
      orderLike.spentMinutes,
      orderLike.productionMinutes,
    ];

    for (const candidate of minuteCandidates) {
      const minutes = parseNumber(candidate);
      if (minutes > 0) return minutes / 60;
    }

    return 0;
  };

  const getHistoryTimestampBy = (log, matcher) => {
    if (!Array.isArray(log?.history)) return null;
    const row = log.history.find((h) => matcher(h || {}));
    return toDateValue(row?.timestamp);
  };

  const getLogProcessBounds = (log) => {
    const ts = log?.timestamps || {};

    const wikkelenStart =
      toDateValue(ts.wikkelen_start) ||
      getHistoryTimestampBy(log, (h) => String(h?.action || "").toLowerCase().includes("start wikkelen")) ||
      getHistoryTimestampBy(log, (h) => String(h?.action || "").toLowerCase().includes("start")) ||
      toDateValue(log?.createdAt);

    const wikkelenEnd =
      toDateValue(ts.wikkelen_end) ||
      getHistoryTimestampBy(log, (h) => String(h?.details || "").toLowerCase().includes("wikkelen naar lossen"));

    const lossenStart =
      toDateValue(ts.lossen_start) ||
      getHistoryTimestampBy(log, (h) => String(h?.details || "").toLowerCase().includes("wikkelen naar lossen"));

    const lossenEnd =
      toDateValue(ts.lossen_end) ||
      getHistoryTimestampBy(log, (h) => String(h?.details || "").toLowerCase().includes("lossen naar nabewerking"));

    const nabewerkingStart =
      toDateValue(ts.nabewerking_start) ||
      getHistoryTimestampBy(log, (h) => String(h?.details || "").toLowerCase().includes("lossen naar nabewerking"));

    const nabewerkingEnd =
      toDateValue(ts.nabewerking_end) ||
      toDateValue(ts.bm01_start) ||
      getHistoryTimestampBy(log, (h) => String(h?.details || "").toLowerCase().includes("verwerking afgerond")) ||
      getHistoryTimestampBy(log, (h) => String(h?.station || "").toUpperCase() === "BM01") ||
      toDateValue(ts.finished) ||
      toDateValue(ts.completed) ||
      toDateValue(log?.updatedAt);

    return {
      wikkelenStart,
      wikkelenEnd,
      lossenStart,
      lossenEnd,
      nabewerkingStart,
      nabewerkingEnd,
    };
  };

  const getRangeDurationMinutes = (startValue, endValue) => {
    const start = toDateValue(startValue);
    const end = toDateValue(endValue);
    if (!start || !end) return 0;
    const duration = calculateDuration(start, end);
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  };

  const getLotMetrics = (log) => {
    const bounds = getLogProcessBounds(log);
    const bm01Start =
      toDateValue(log?.timestamps?.bm01_start) ||
      getHistoryTimestampBy(log, (h) => String(h?.station || "").toUpperCase() === "BM01");
    const bm01End =
      toDateValue(log?.timestamps?.finished) ||
      toDateValue(log?.timestamps?.completed) ||
      toDateValue(log?.updatedAt);

    const wikkelenMinutes = getRangeDurationMinutes(bounds.wikkelenStart, bounds.wikkelenEnd);
    const lossenMinutes = getRangeDurationMinutes(bounds.lossenStart, bounds.lossenEnd);
    const nabewerkingMinutes = getRangeDurationMinutes(bounds.nabewerkingStart, bounds.nabewerkingEnd);
    const bm01Minutes = getRangeDurationMinutes(bm01Start, bm01End);
    const totalMinutes = wikkelenMinutes + lossenMinutes + nabewerkingMinutes + bm01Minutes;

    return {
      id: log?.id,
      lotNumber: log?.lotNumber || log?.id || "Onbekend",
      machine: log?.machine || log?.stationLabel || log?.currentStation || "-",
      status: log?.status || "-",
      currentStation: log?.currentStation || log?.lastStation || "-",
      actualHours: totalMinutes / 60,
      stationMetrics: {
        wikkelenHours: wikkelenMinutes / 60,
        lossenHours: lossenMinutes / 60,
        nabewerkingHours: nabewerkingMinutes / 60,
        bm01Hours: bm01Minutes / 60,
      },
      timeBounds: {
        ...bounds,
        bm01Start,
        bm01End,
      },
    };
  };

  const formatDateTime = (value) => {
    const date = toDateValue(value);
    return date ? format(date, "dd/MM/yy HH:mm") : "-";
  };

  const formatDateRange = (startValue, endValue) => {
    const start = formatDateTime(startValue);
    const end = formatDateTime(endValue);
    if (start === "-" && end === "-") return "-";
    return `${start} -> ${end}`;
  };

  const getTrackingDurationMinutes = (log) => {
    const ts = log?.timestamps || {};
    const bounds = getLogProcessBounds(log);

    const start = toDateValue(
      log?.timestamps?.station_start ||
      log?.timestamps?.started ||
      log?.startTime ||
      log?.startedAt
    );

    if (start) {
      const end = toDateValue(
        log?.timestamps?.finished ||
        log?.timestamps?.completed ||
        log?.endTime ||
        log?.completedAt ||
        log?.updatedAt
      ) || new Date();

      const minutes = calculateDuration(start, end);
      if (Number.isFinite(minutes) && minutes > 0) return minutes;
    }

    const getNabewerkingEnd = () => {
      const explicitEnd =
        bounds.nabewerkingEnd ||
        toDateValue(log?.updatedAt);

      if (explicitEnd) return explicitEnd;

      const statusText = String(log?.status || "").toLowerCase();
      const stepText = String(log?.currentStep || "").toLowerCase();
      const isStillInNabewerking =
        (stepText.includes("nabewer") || statusText.includes("nabewer")) &&
        !statusText.includes("completed") &&
        !stepText.includes("finished") &&
        !statusText.includes("gereed") &&
        !statusText.includes("aangeboden");

      return isStillInNabewerking ? new Date() : null;
    };

    let total = 0;

    const addRange = (startValue, endValue) => {
      total += getRangeDurationMinutes(startValue, endValue);
    };

    addRange(bounds.wikkelenStart, bounds.wikkelenEnd);
    addRange(bounds.lossenStart, bounds.lossenEnd);
    addRange(bounds.nabewerkingStart, getNabewerkingEnd());
    addRange(ts.station_start, ts.finished || ts.completed || new Date());

    return total > 0 ? total : 0;
  };

  const getLogActivityDate = (log) => {
    const ts = log?.timestamps || {};
    return (
      toDateValue(ts.wikkelen_start) ||
      toDateValue(ts.lossen_start) ||
      toDateValue(ts.nabewerking_start) ||
      toDateValue(ts.bm01_start) ||
      toDateValue(ts.station_start) ||
      toDateValue(ts.started) ||
      toDateValue(ts.nabewerking_end) ||
      toDateValue(ts.completed) ||
      toDateValue(ts.finished) ||
      toDateValue(log?.updatedAt) ||
      toDateValue(ts.lossen_end) ||
      toDateValue(ts.wikkelen_end) ||
      toDateValue(log?.createdAt)
    );
  };

  const getLogActivityDates = (log) => {
    const ts = log?.timestamps || {};
    return [
      ts.wikkelen_start,
      ts.lossen_start,
      ts.nabewerking_start,
      ts.bm01_start,
      ts.station_start,
      ts.started,
      ts.wikkelen_end,
      ts.lossen_end,
      ts.nabewerking_end,
      ts.finished,
      ts.completed,
      log?.startedAt,
      log?.startTime,
      log?.createdAt,
      log?.updatedAt,
    ]
      .map((value) => toDateValue(value))
      .filter(Boolean);
  };

  const trackingByOrder = useMemo(() => {
    const grouped = new Map();
    trackingLogs.forEach((log) => {
      const orderId = String(log?.orderId || log?.orderNumber || "").trim();
      if (!orderId) return;
      if (!grouped.has(orderId)) grouped.set(orderId, []);
      grouped.get(orderId).push(log);
    });
    return grouped;
  }, [trackingLogs]);

  const mergedOrders = useMemo(() => {
    const byOrderId = new Map();

    orders.forEach((order) => {
      const orderId = String(order?.orderId || order?.id || "").trim();
      if (!orderId) return;
      byOrderId.set(orderId, { ...order, orderId });
    });

    trackingByOrder.forEach((logs, orderId) => {
      if (byOrderId.has(orderId)) return;
      const sample = logs[0] || {};
      byOrderId.set(orderId, {
        id: sample.id || orderId,
        orderId,
        item: sample.item,
        itemCode: sample.itemCode,
        machine: sample.machine || sample.stationLabel || sample.currentStation,
        departmentId: sample.departmentId || sample.deptId,
        department: sample.department,
        status: sample.status || "in_production",
        plannedDate: getLogActivityDate(sample),
        estimatedHours: 0,
      });
    });

    return Array.from(byOrderId.values());
  }, [orders, trackingByOrder]);

  // Helper functie voor department matching
  const matchesDepartment = (order, filterDepartmentName) => {
    if (filterDepartmentName === "ALLES") return true;

    const departmentId = order?.departmentId;
    const directDepartment = String(order?.department || "").trim();
    const inferredDepartment = inferDepartmentFromMachine(order?.machine);
    const filter = filterDepartmentName.toLowerCase().trim();

    if (directDepartment) {
      const name = directDepartment.toLowerCase().trim();
      if (name === filter || name.includes(filter) || filter.includes(name)) return true;
    }

    if (inferredDepartment) {
      const inferred = inferredDepartment.toLowerCase().trim();
      if (inferred === filter || inferred.includes(filter) || filter.includes(inferred)) return true;
    }

    if (!departmentId) return false;
    
    const dept = factoryConfig.departments?.find(
      (d) => String(d.id || "").trim().toLowerCase() === String(departmentId).trim().toLowerCase()
    );
    if (!dept) return false;
    
    const deptName = dept.name.toLowerCase().trim();
    
    if (deptName === filter) return true;
    if (deptName.includes(filter)) return true;
    if (filter.includes(deptName)) return true;
    
    return false;
  };

  // Filter orders by selected week
  const weekOrders = useMemo(() => {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
    const dayStart = startOfDay(selectedDate);
    const dayEnd = endOfDay(selectedDate);
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);

    const range = periodMode === "day"
      ? { start: dayStart, end: dayEnd }
      : periodMode === "month"
        ? { start: monthStart, end: monthEnd }
        : { start: weekStart, end: weekEnd };

    return mergedOrders.filter(order => {
      const orderKey = String(order.orderId || order.id || "").trim();
      const relatedLogs = trackingByOrder.get(orderKey) || [];
      
      const planDate = toDateValue(order.plannedDate);
      const hasPlanInRange = planDate ? isWithinInterval(planDate, range) : false;
      const hasActivityInRange = relatedLogs.some((log) => {
        const eventDates = getLogActivityDates(log);
        return eventDates.some((eventDate) => isWithinInterval(eventDate, range));
      });

      if (!hasPlanInRange && !hasActivityInRange) return false;
      
      if (filterStatus !== "all" && order.status !== filterStatus) return false;
      
      // Filter by department
      if (selectedDepartment !== "ALLES" && !matchesDepartment(order, selectedDepartment)) return false;

      return true;
    });
  }, [mergedOrders, trackingByOrder, selectedDate, periodMode, filterStatus, selectedDepartment, factoryConfig]);

  const navigatePrevious = () => {
    setSelectedDate((prev) => (
      periodMode === "day"
        ? subDays(prev, 1)
        : periodMode === "month"
          ? subMonths(prev, 1)
          : subWeeks(prev, 1)
    ));
  };

  const navigateNext = () => {
    setSelectedDate((prev) => (
      periodMode === "day"
        ? addDays(prev, 1)
        : periodMode === "month"
          ? addMonths(prev, 1)
          : addWeeks(prev, 1)
    ));
  };

  const jumpToToday = () => setSelectedDate(new Date());

  // Calculate time metrics per order
  const orderMetrics = useMemo(() => {
    return weekOrders.map(order => {
      const currentOrderId = String(order.orderId || order.id || "").trim();
      const relatedLogs = trackingByOrder.get(currentOrderId) || [];
      const lotDetails = relatedLogs.map((log) => getLotMetrics(log));
      const planCount = parseInt(order.quantity) || parseInt(order.plan) || 0;

      const splitFromReferenceOps = getSplitPlannedHours(order.operations, parseFloat(order.totalPlannedHours) || 0);
      let plannedProductionHours = splitFromReferenceOps.productionHours;
      let plannedPostHours = splitFromReferenceOps.postHours;
      let plannedQcHours = splitFromReferenceOps.qcHours;

      let planned = splitFromReferenceOps.hasReferenceOps
        ? splitFromReferenceOps.totalHours
        : parseFloat(order.totalPlannedHours) || parseFloat(order.estimatedHours) || 0;
      let hasEfficiency = false;

      // Use imported efficiency data if available (Infor LN)
      const importedInfo = efficiencyData[order.orderId];
      if (importedInfo) {
        const effQty = parseNumber(importedInfo.quantity) || 1;
        const safePlanCount = planCount > 0 ? planCount : effQty;
        const ratio = effQty > 0 ? safePlanCount / effQty : 1;

        const effProductionHours = (parseNumber(importedInfo.productionTimeTotal) * ratio) / 60;
        const effPostHours = (parseNumber(importedInfo.postProcessingTimeTotal) * ratio) / 60;
        const effQcHours = (parseNumber(importedInfo.qcTimeTotal) * ratio) / 60;
        const effSplitTotal = effProductionHours + effPostHours + effQcHours;

        if (effSplitTotal > 0) {
          if (plannedProductionHours <= 0) plannedProductionHours = effProductionHours;
          if (plannedPostHours <= 0) plannedPostHours = effPostHours;
          if (plannedQcHours <= 0) plannedQcHours = effQcHours;
          if (planned <= 0) planned = effSplitTotal;
          hasEfficiency = true;
        } else if (importedInfo.minutesPerUnit) {
          const plannedFromMinutesPerUnit = (parseNumber(importedInfo.minutesPerUnit) * safePlanCount) / 60;
          if (planned <= 0) planned = plannedFromMinutesPerUnit;
          hasEfficiency = true;
        }
      }

      let calculatedActualMinutes = 0;
      let wikkelenMinutes = 0;
      let lossenMinutes = 0;
      let nabewerkingMinutes = 0;
      let bm01Minutes = 0;
      
      lotDetails.forEach((lot) => {
        calculatedActualMinutes += lot.actualHours * 60;
        wikkelenMinutes += (lot.stationMetrics?.wikkelenHours || 0) * 60;
        lossenMinutes += (lot.stationMetrics?.lossenHours || 0) * 60;
        nabewerkingMinutes += (lot.stationMetrics?.nabewerkingHours || 0) * 60;
        bm01Minutes += (lot.stationMetrics?.bm01Hours || 0) * 60;
      });

      const actualFromLogs = calculatedActualMinutes / 60;
      const actual = actualFromLogs > 0 ? actualFromLogs : getOrderActualHours(order);

      const variance = actual - planned;
      const variancePercent = planned > 0 ? (variance / planned) * 100 : 0;
      
      const status = Math.abs(variancePercent) < 10
        ? "on_track"
        : variancePercent > 0
          ? "over"
          : "under";

      return {
        ...order,
        planned,
        actual,
        variance,
        variancePercent,
        status,
        hasEfficiency,
        lotCount: lotDetails.length,
        lotDetails,
        stationMetrics: {
          wikkelenHours: wikkelenMinutes / 60,
          lossenHours: lossenMinutes / 60,
          nabewerkingHours: nabewerkingMinutes / 60,
          bm01Hours: bm01Minutes / 60,
        },
        plannedStationMetrics: {
          wikkelenHours: plannedProductionHours,
          lossenHours: 0,
          nabewerkingHours: plannedPostHours,
          bm01Hours: plannedQcHours,
        },
      };
    });
  }, [weekOrders, efficiencyData, trackingByOrder]);

  // Summary statistics
  const summary = useMemo(() => {
    const totalPlanned = orderMetrics.reduce((sum, o) => sum + o.planned, 0);
    const totalActual = orderMetrics.reduce((sum, o) => sum + o.actual, 0);
    const totalVariance = totalActual - totalPlanned;
    const avgVariancePercent = totalPlanned > 0 ? (totalVariance / totalPlanned) * 100 : 0;

    const onTrack = orderMetrics.filter(o => o.status === "on_track").length;
    const over = orderMetrics.filter(o => o.status === "over").length;
    const under = orderMetrics.filter(o => o.status === "under").length;

    return {
      totalPlanned,
      totalActual,
      totalVariance,
      avgVariancePercent,
      onTrack,
      over,
      under
    };
  }, [orderMetrics]);

  const stationTotals = useMemo(() => {
    return orderMetrics.reduce(
      (acc, order) => {
        const metrics = order.stationMetrics || {};
        acc.wikkelen += Number(metrics.wikkelenHours || 0);
        acc.lossen += Number(metrics.lossenHours || 0);
        acc.nabewerking += Number(metrics.nabewerkingHours || 0);
        acc.bm01 += Number(metrics.bm01Hours || 0);
        return acc;
      },
      { wikkelen: 0, lossen: 0, nabewerking: 0, bm01: 0 }
    );
  }, [orderMetrics]);

  // Get status icon
  const getStatusIcon = (status) => {
    if (status === "on_track") return <CheckCircle className="text-emerald-600" size={20} />;
    if (status === "over") return <TrendingUp className="text-red-600" size={20} />;
    return <TrendingDown className="text-blue-600" size={20} />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-800">
              Time <span className="text-blue-600">Tracking</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Vergelijk daadwerkelijke vs geplande tijd per order
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Day/Week Selector */}
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-slate-600" />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPeriodMode("day")}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${periodMode === "day" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-700"}`}
                >
                  Dag
                </button>
                <button
                  onClick={() => setPeriodMode("week")}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${periodMode === "week" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-700"}`}
                >
                  Week
                </button>
                <button
                  onClick={() => setPeriodMode("month")}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${periodMode === "month" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-700"}`}
                >
                  Maand
                </button>
              </div>
              <button onClick={navigatePrevious} className="px-2 py-1.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold">
                Vorige
              </button>
              <span className="text-sm font-bold text-slate-700 min-w-[180px] text-center">
                {periodMode === "day"
                  ? format(selectedDate, "dd-MM-yyyy")
                  : periodMode === "month"
                    ? format(selectedDate, "MMMM yyyy")
                    : `Week ${getISOWeek(selectedDate)} - ${format(selectedDate, "yyyy")}`}
              </span>
              <button onClick={navigateNext} className="px-2 py-1.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold">
                Volgende
              </button>
              <button onClick={jumpToToday} className="px-2 py-1.5 rounded-md bg-blue-500 text-white text-xs font-bold">
                Vandaag
              </button>
            </div>

            {/* Department Filter */}
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-slate-600" />
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="px-3 py-1.5 border-2 border-slate-200 rounded-lg text-sm font-bold"
              >
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            {/* Filter Status */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 border-2 border-slate-200 rounded-lg text-sm font-bold"
            >
              <option value="all">Alle Status</option>
              <option value="planned">Gepland</option>
              <option value="in_production">In Productie</option>
              <option value="quality_check">Controle</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border-2 border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 uppercase">Totaal Gepland</span>
            <Clock className="text-blue-600" size={20} />
          </div>
          <div className="text-3xl font-black text-slate-800">{Math.round(summary.totalPlanned)}h</div>
        </div>

        <div className="bg-white rounded-xl p-4 border-2 border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 uppercase">Totaal Daadwerkelijk</span>
            <BarChart3 className="text-purple-600" size={20} />
          </div>
          <div className="text-3xl font-black text-slate-800">{Math.round(summary.totalActual)}h</div>
        </div>

        <div className="bg-white rounded-xl p-4 border-2 border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 uppercase">Variance</span>
            {summary.totalVariance >= 0 ? (
              <TrendingUp className="text-red-600" size={20} />
            ) : (
              <TrendingDown className="text-emerald-600" size={20} />
            )}
          </div>
          <div className={`text-3xl font-black ${summary.totalVariance >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {summary.totalVariance >= 0 ? '+' : ''}{Math.round(summary.totalVariance)}h
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {summary.avgVariancePercent >= 0 ? '+' : ''}{Math.round(summary.avgVariancePercent)}%
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border-2 border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 uppercase">Status</span>
            <CheckCircle className="text-emerald-600" size={20} />
          </div>
          <div className="flex gap-2 mt-2">
            <div className="text-center flex-1">
              <div className="text-xl font-black text-emerald-600">{summary.onTrack}</div>
              <div className="text-xs text-slate-500">On Track</div>
            </div>
            <div className="text-center flex-1">
              <div className="text-xl font-black text-red-600">{summary.over}</div>
              <div className="text-xs text-slate-500">Over</div>
            </div>
            <div className="text-center flex-1">
              <div className="text-xl font-black text-blue-600">{summary.under}</div>
              <div className="text-xs text-slate-500">Under</div>
            </div>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border-2 border-slate-200">
          <div className="text-xs font-bold text-slate-600 uppercase mb-1">Totaal Wikkelen</div>
          <div className="text-2xl font-black text-slate-800">{stationTotals.wikkelen.toFixed(1)}h</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-2 border-slate-200">
          <div className="text-xs font-bold text-slate-600 uppercase mb-1">Totaal Lossen</div>
          <div className="text-2xl font-black text-slate-800">{stationTotals.lossen.toFixed(1)}h</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-2 border-slate-200">
          <div className="text-xs font-bold text-slate-600 uppercase mb-1">Totaal Nabewerken</div>
          <div className="text-2xl font-black text-slate-800">{stationTotals.nabewerking.toFixed(1)}h</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-2 border-slate-200">
          <div className="text-xs font-bold text-slate-600 uppercase mb-1">Totaal Eindinspectie</div>
          <div className="text-2xl font-black text-slate-800">{stationTotals.bm01.toFixed(1)}h</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200">
        <div className="p-4 border-b-2 border-slate-200 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-800">
            Order Time Analysis ({orderMetrics.length} orders)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b-2 border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Order</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Item</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Machine</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Wikkelen</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Lossen</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Nabewerken</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Eindinspectie</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Gepland</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Daadwerkelijk</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Variance</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {orderMetrics.length === 0 ? (
                <tr>
                  <td colSpan="11" className="px-4 py-12 text-center text-slate-400">
                    Geen orders in geselecteerde {periodMode === "day" ? "dag" : periodMode === "month" ? "maand" : "week"}
                  </td>
                </tr>
              ) : (
                orderMetrics.map(order => (
                  <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-sm text-slate-800">{order.orderId || order.item}</div>
                      <button
                        type="button"
                        onClick={() => setSelectedOrderDetail(order)}
                        className="mt-1 text-xs font-bold text-blue-600 hover:text-blue-800"
                      >
                        Bekijk lots ({order.lotCount || 0})
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-600">{order.itemCode || order.extraCode}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-600">{order.machine || "-"}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-bold text-slate-700">
                        {order.stationMetrics ? order.stationMetrics.wikkelenHours.toFixed(1) : "0.0"}h
                        <span className="text-xs text-slate-400"> / {order.plannedStationMetrics ? order.plannedStationMetrics.wikkelenHours.toFixed(1) : "0.0"}h</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-bold text-slate-700">
                        {order.stationMetrics ? order.stationMetrics.lossenHours.toFixed(1) : "0.0"}h
                        <span className="text-xs text-slate-400"> / {order.plannedStationMetrics ? order.plannedStationMetrics.lossenHours.toFixed(1) : "0.0"}h</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-bold text-slate-700">
                        {order.stationMetrics ? order.stationMetrics.nabewerkingHours.toFixed(1) : "0.0"}h
                        <span className="text-xs text-slate-400"> / {order.plannedStationMetrics ? order.plannedStationMetrics.nabewerkingHours.toFixed(1) : "0.0"}h</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-bold text-slate-700">
                        {order.stationMetrics ? order.stationMetrics.bm01Hours.toFixed(1) : "0.0"}h
                        <span className="text-xs text-slate-400"> / {order.plannedStationMetrics ? order.plannedStationMetrics.bm01Hours.toFixed(1) : "0.0"}h</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-bold text-slate-700">
                        {Math.round(order.planned)}h
                        {order.hasEfficiency && (
                          <span className="text-[9px] text-purple-600 ml-1 font-black" title="Gebaseerd op Infor LN efficiency">(LN)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-bold text-slate-700">{Math.round(order.actual)}h</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className={`text-sm font-bold ${
                        order.variance >= 0 ? 'text-red-600' : 'text-emerald-600'
                      }`}>
                        {order.variance >= 0 ? '+' : ''}{Math.round(order.variance)}h
                      </div>
                      <div className={`text-xs ${
                        order.variance >= 0 ? 'text-red-500' : 'text-emerald-500'
                      }`}>
                        {order.variancePercent >= 0 ? '+' : ''}{Math.round(order.variancePercent)}%
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center">
                        {getStatusIcon(order.status)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottlenecks */}
      {selectedOrderDetail && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-[min(98vw,1800px)] max-h-[92vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <div className="text-lg font-black text-slate-800">Order {selectedOrderDetail.orderId}</div>
                <div className="text-sm text-slate-500">Lotdetails en stationtijden ({selectedOrderDetail.lotCount || 0} lots)</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderDetail(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-300"
              >
                Sluiten
              </button>
            </div>
            <div className="overflow-y-auto overflow-x-hidden p-4">
              <table className="w-full table-fixed">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase">Lot</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase">Machine</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase">Status</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-600 uppercase">Wikkelen</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-600 uppercase">Lossen</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-600 uppercase">Nabew.</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-600 uppercase">Inspectie</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-600 uppercase">Totaal</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase">Wikkel Tijd</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase">Lossen Tijd</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase">Nabew. Tijd</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase">BM01 Tijd</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrderDetail.lotDetails?.map((lot) => (
                    <tr key={lot.id || lot.lotNumber} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3 text-sm font-bold text-slate-800 truncate">{lot.lotNumber}</td>
                      <td className="px-3 py-3 text-sm text-slate-600 truncate">{lot.machine}</td>
                      <td className="px-3 py-3 text-sm text-slate-600 truncate">{lot.status}</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-slate-700 whitespace-nowrap">{lot.stationMetrics.wikkelenHours.toFixed(1)}h</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-slate-700 whitespace-nowrap">{lot.stationMetrics.lossenHours.toFixed(1)}h</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-slate-700 whitespace-nowrap">{lot.stationMetrics.nabewerkingHours.toFixed(1)}h</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-slate-700 whitespace-nowrap">{lot.stationMetrics.bm01Hours.toFixed(1)}h</td>
                      <td className="px-3 py-3 text-sm text-right font-black text-slate-800 whitespace-nowrap">{lot.actualHours.toFixed(1)}h</td>
                      <td
                        className="px-3 py-3 text-[11px] leading-tight text-slate-500 whitespace-normal break-words"
                        title={formatDateRange(lot.timeBounds.wikkelenStart, lot.timeBounds.wikkelenEnd)}
                      >
                        {formatDateRange(lot.timeBounds.wikkelenStart, lot.timeBounds.wikkelenEnd)}
                      </td>
                      <td
                        className="px-3 py-3 text-[11px] leading-tight text-slate-500 whitespace-normal break-words"
                        title={formatDateRange(lot.timeBounds.lossenStart, lot.timeBounds.lossenEnd)}
                      >
                        {formatDateRange(lot.timeBounds.lossenStart, lot.timeBounds.lossenEnd)}
                      </td>
                      <td
                        className="px-3 py-3 text-[11px] leading-tight text-slate-500 whitespace-normal break-words"
                        title={formatDateRange(lot.timeBounds.nabewerkingStart, lot.timeBounds.nabewerkingEnd)}
                      >
                        {formatDateRange(lot.timeBounds.nabewerkingStart, lot.timeBounds.nabewerkingEnd)}
                      </td>
                      <td
                        className="px-3 py-3 text-[11px] leading-tight text-slate-500 whitespace-normal break-words"
                        title={formatDateRange(lot.timeBounds.bm01Start, lot.timeBounds.bm01End)}
                      >
                        {formatDateRange(lot.timeBounds.bm01Start, lot.timeBounds.bm01End)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {orderMetrics.filter(o => o.status === "over").length > 0 && (
        <div className="mt-6 bg-white rounded-2xl shadow-sm border-2 border-red-200 p-6">
          <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
            <AlertTriangle size={20} />
            Bottlenecks (Orders die langer duren dan gepland)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orderMetrics
              .filter(o => o.status === "over")
              .sort((a, b) => b.variance - a.variance)
              .map(order => (
                <div key={order.id} className="p-4 bg-red-50 border-2 border-red-200 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-sm text-slate-800">{order.orderId || order.item}</div>
                    <TrendingUp className="text-red-600" size={16} />
                  </div>
                  <div className="text-xs text-slate-600 mb-2">{order.itemCode}</div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                      {Math.round(order.planned)}h → {Math.round(order.actual)}h
                    </div>
                    <div className="text-sm font-black text-red-600">
                      +{Math.round(order.variance)}h
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="mt-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border-2 border-blue-200">
        <div className="flex items-start gap-4">
          <Clock className="text-blue-600 flex-shrink-0" size={24} />
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Time Tracking Analysis</h3>
            <div className="text-sm text-slate-700 space-y-1">
              <p>✅ <strong>On Track:</strong> Variance binnen ±10% van gepland</p>
              <p>⚠️ <strong>Over:</strong> Daadwerkelijke tijd is meer dan 10% hoger dan gepland</p>
              <p>📉 <strong>Under:</strong> Daadwerkelijke tijd is meer dan 10% lager dan gepland</p>
              <p>💡 <strong>Tip:</strong> Gebruik bottleneck analyse om orders te identificeren die extra aandacht nodig hebben</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimeTrackingView;
