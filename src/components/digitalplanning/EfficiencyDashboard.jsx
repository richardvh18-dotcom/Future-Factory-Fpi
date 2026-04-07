import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Clock, 
  AlertTriangle, 
  TrendingUp, 
  Activity,
  Search,
  Timer,
  BrainCircuit,
  History
} from 'lucide-react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { getReadPaths, getEfficiencyArchivePath, getPlanningArchivePath } from '../../config/dbPaths';
import { format as formatDate, getISOWeek, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { calculateDuration, formatMinutes, getEfficiencyColor } from '../../utils/efficiencyCalculator';
import AiPredictionView from './AiPredictionView';

const EfficiencyDashboard = ({ dataSourceMode = 'current' }) => {
  const { t } = useTranslation();
  const usePilotReadData = dataSourceMode === 'pilot-read';
  const readPaths = useMemo(() => getReadPaths(usePilotReadData), [usePilotReadData]);
  const [standards, setStandards] = useState([]);
  const [tracking, setTracking] = useState([]);
  const [planningOrders, setPlanningOrders] = useState([]);
  const [, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all'); // 'active', 'all'
  const [departmentFilter, setDepartmentFilter] = useState('ALL'); // Nieuw: Afdeling filter
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('active'); // 'active' | 'archive'
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState('week');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showAiAnalysis, setShowAiAnalysis] = useState(false);
  const [factoryConfig, setFactoryConfig] = useState({ departments: [] });

  const toDateValue = (value) => {
    if (!value) return null;
    if (value?.toDate) return value.toDate();
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const getTrackingDurationMinutes = (log) => {
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

    const ts = log?.timestamps || {};
    let total = 0;

    const addRange = (startValue, endValue) => {
      const s = toDateValue(startValue);
      const e = toDateValue(endValue);
      if (!s || !e) return;
      const diff = calculateDuration(s, e);
      if (Number.isFinite(diff) && diff > 0) total += diff;
    };

    // Product-flow paden uit tracked_products
    addRange(ts.wikkelen_start || log?.createdAt, ts.wikkelen_end);
    addRange(ts.lossen_start, ts.lossen_end);
    addRange(ts.nabewerking_start, ts.nabewerking_end || new Date());
    addRange(ts.station_start, ts.finished || ts.completed || new Date());

    // Fallback op history-start als timestampvelden incompleet zijn.
    if (total <= 0 && Array.isArray(log?.history)) {
      const startHistory = log.history.find((h) => String(h?.action || '').toLowerCase().includes('start'));
      const startFromHistory = toDateValue(startHistory?.timestamp);
      const bestEnd = toDateValue(ts.wikkelen_end || ts.lossen_end || ts.nabewerking_end || log?.updatedAt);
      if (startFromHistory && bestEnd) {
        const diff = calculateDuration(startFromHistory, bestEnd);
        if (Number.isFinite(diff) && diff > 0) total += diff;
      }
    }

    return total > 0 ? total : 0;
  };

  const resolveDepartmentNameFromId = (departmentId) => {
    if (!departmentId) return '';
    const idLower = String(departmentId).trim().toLowerCase();
    const dept = (factoryConfig.departments || []).find(
      (d) => String(d?.id || '').trim().toLowerCase() === idLower
    );
    return dept?.name || '';
  };

  const normalizeText = (value) => String(value || '').trim().toLowerCase();

  const parseNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const inferDepartmentFromMachine = (machine) => {
    const m = String(machine || '').trim().toUpperCase();
    if (m.startsWith('BH')) return 'Fittings';
    if (m.startsWith('BA')) return 'Pipes';
    if (m.startsWith('BM')) return 'Spools';
    return '';
  };

  const getOrderActualMinutes = (orderLike) => {
    if (!orderLike) return 0;

    const hoursCandidates = [
      orderLike.totalActualHours,
      orderLike.actualHours,
      orderLike.spentProductionTime,
      orderLike.hoursWorked,
      orderLike.productionHours,
    ];

    for (const candidate of hoursCandidates) {
      const hours = parseNumber(candidate);
      if (hours > 0) return hours * 60;
    }

    const minuteCandidates = [
      orderLike.actualMinutes,
      orderLike.totalActualMinutes,
      orderLike.spentMinutes,
      orderLike.productionMinutes,
    ];

    for (const candidate of minuteCandidates) {
      const minutes = parseNumber(candidate);
      if (minutes > 0) return minutes;
    }

    return 0;
  };

  const getOrderSplitMinutes = (orderLike) => {
    if (!orderLike) {
      return {
        productionMinutes: 0,
        postMinutes: 0,
        qcMinutes: 0,
      };
    }

    const productionMinutes = parseNumber(orderLike.plannedMinutesBH) || (parseNumber(orderLike.plannedHoursBH) * 60);
    const postMinutes = parseNumber(orderLike.plannedMinutesNabewerken) || (parseNumber(orderLike.plannedHoursNabewerken) * 60);
    const qcMinutes = parseNumber(orderLike.plannedMinutesBM01) || (parseNumber(orderLike.plannedHoursBM01) * 60);

    return {
      productionMinutes,
      postMinutes,
      qcMinutes,
    };
  };

  const getLogActivityDates = (log) => {
    const ts = log?.timestamps || {};
    const historyDates = Array.isArray(log?.history)
      ? log.history.map((h) => toDateValue(h?.timestamp)).filter(Boolean)
      : [];

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
      ...historyDates,
    ]
      .map((value) => toDateValue(value))
      .filter(Boolean);
  };

  const getRangeForPeriod = () => {
    const dayStart = startOfDay(selectedDate);
    const dayEnd = endOfDay(selectedDate);
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);

    if (periodMode === 'day') return { start: dayStart, end: dayEnd };
    if (periodMode === 'month') return { start: monthStart, end: monthEnd };
    return { start: weekStart, end: weekEnd };
  };

  const navigatePrevious = () => {
    setSelectedDate((prev) => (
      periodMode === 'day'
        ? subDays(prev, 1)
        : periodMode === 'month'
          ? subMonths(prev, 1)
          : subWeeks(prev, 1)
    ));
  };

  const navigateNext = () => {
    setSelectedDate((prev) => (
      periodMode === 'day'
        ? addDays(prev, 1)
        : periodMode === 'month'
          ? addMonths(prev, 1)
          : addWeeks(prev, 1)
    ));
  };

  const jumpToToday = () => setSelectedDate(new Date());

  const matchesDepartmentFilter = (row) => {
    if (departmentFilter === 'ALL') return true;

    const filter = normalizeText(departmentFilter);
    const candidates = [
      row.department,
      row.departmentName,
      row.departmentId,
      inferDepartmentFromMachine(row.machine),
      resolveDepartmentNameFromId(row.departmentId),
    ]
      .map(normalizeText)
      .filter(Boolean);

    return candidates.some((candidate) =>
      candidate === filter || candidate.includes(filter) || filter.includes(candidate)
    );
  };

  useEffect(() => {
    setLoading(true);

    if (!readPaths || !readPaths.EFFICIENCY_HOURS || !readPaths.TRACKING) {
      setLoading(false);
      return;
    }

    // 1. Haal de standaarden op (Targets uit Infor LN import)
    // Wissel tussen actuele collectie en archief op basis van viewMode
    const collectionPath = viewMode === 'active' 
      ? readPaths.EFFICIENCY_HOURS
      : getEfficiencyArchivePath(selectedYear);

    const standardsRef = collection(db, ...collectionPath);
    const unsubStandards = onSnapshot(standardsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStandards(data);
    });

    // 2. Haal de werkelijke tracking data op (Actuals van de vloer)
    // We gebruiken de tracking collectie waar operators hun start/stop tijden loggen
    const trackingRef = collection(db, ...readPaths.TRACKING);
    const unsubTracking = onSnapshot(trackingRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTracking(data);
    });

    const planningCollectionPath = viewMode === 'active'
      ? readPaths.PLANNING
      : getPlanningArchivePath(selectedYear);

    const planningRef = collection(db, ...planningCollectionPath);
    const unsubPlanning = onSnapshot(planningRef, (snapshot) => {
      const data = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      setPlanningOrders(data);
    });

    const configRef = doc(db, ...readPaths.FACTORY_CONFIG);
    const unsubFactory = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        setFactoryConfig(docSnap.data() || { departments: [] });
      }
    });

    setLoading(false);

    return () => {
      unsubStandards();
      unsubTracking();
      unsubPlanning();
      unsubFactory();
    };
  }, [viewMode, selectedYear, readPaths]);

  const dashboardData = useMemo(() => {
    const orderById = new Map();
    planningOrders.forEach((order) => {
      const orderId = String(order.orderId || '').trim();
      const docId = String(order.id || '').trim();
      if (orderId) orderById.set(orderId, order);
      if (docId && !orderById.has(docId)) orderById.set(docId, order);
    });

    const periodRange = getRangeForPeriod();

    // 1. AI Learning: Bouw een kennisbank op van historische tijden per product
    const productKnowledgeBase = {};
    
    tracking.forEach(log => {
      if ((log.status === 'completed' || log.status === 'shipped') && (log.itemCode || log.item)) {
        const duration = getTrackingDurationMinutes(log);
        
        if (duration > 0) {
          const key = log.itemCode || log.item;
          if (!productKnowledgeBase[key]) {
            productKnowledgeBase[key] = { totalTime: 0, count: 0 };
          }
          productKnowledgeBase[key].totalTime += duration;
          productKnowledgeBase[key].count += 1;
        }
      }
    });

    // Combineer standaarden met werkelijke data
    let processed = standards.map(std => {
      const itemCode = std.itemCode || std.productId || "Onbekend";
      const stdOrderId = String(std.orderId || std.id || '').trim();
      const planningOrder = orderById.get(stdOrderId);
      // Vind alle tracking records voor deze order
      // We matchen op orderId (string comparison voor veiligheid)
      const relatedLogs = tracking.filter(t => 
        String(t.orderId || t.orderNumber) === stdOrderId
      );

      // Bereken totaal bestede tijd en voortgang
      let actualMinutes = 0;
      let producedQty = 0;
      
      relatedLogs.forEach(log => {
        actualMinutes += getTrackingDurationMinutes(log);

        // Aantal berekening (alleen voltooide items tellen)
        if (log.status === 'completed' || log.status === 'shipped') {
          producedQty += 1; 
        }
      });

      if (actualMinutes <= 0) {
        actualMinutes = Math.max(
          getOrderActualMinutes(std),
          getOrderActualMinutes(planningOrder)
        );
      }

      const splitFromOrder = getOrderSplitMinutes(planningOrder);
      const prodTotal = Number(std.productionTimeTotal || 0) > 0
        ? Number(std.productionTimeTotal || 0)
        : splitFromOrder.productionMinutes;
      const postTotal = Number(std.postProcessingTimeTotal || 0) > 0
        ? Number(std.postProcessingTimeTotal || 0)
        : splitFromOrder.postMinutes;
      const qcTotal = Number(std.qcTimeTotal || 0) > 0
        ? Number(std.qcTimeTotal || 0)
        : splitFromOrder.qcMinutes;
      const targetTotal = Number(std.standardTimeTotal || 0) > 0
        ? Number(std.standardTimeTotal || 0)
        : (prodTotal + postTotal);
      
      // Efficiency Formule: (Verdiende Tijd / Werkelijke Tijd) * 100
      // We gebruiken 'Earned Value' (Geproduceerd * Norm) zodat de score ook klopt
      // voor orders die halverwege instromen (ramp-up fase).
      const stdQty = Number(std.quantity || planningOrder?.quantity || planningOrder?.plan || 0);
      const normPerUnit = Number(std.minutesPerUnit || 0) > 0
        ? Number(std.minutesPerUnit || 0)
        : (stdQty > 0 ? targetTotal / stdQty : 0);
      const earnedMinutes = producedQty * normPerUnit;

      let efficiency = 0;
      if (actualMinutes > 0) {
        efficiency = (earnedMinutes / actualMinutes) * 100;
      } else if (producedQty > 0) {
        efficiency = 100; // Wel productie, (nog) geen tijd geregistreerd -> aanname 100%
      }

      // Voorspelling: Als we op dit tempo doorgaan, halen we het dan?
      const isOverrun = actualMinutes > targetTotal;
      
      // AI Voorspelling ophalen
      const history = productKnowledgeBase[itemCode];
      const aiAveragePerUnit = history ? (history.totalTime / history.count) : normPerUnit;
      const aiPredictedTotal = aiAveragePerUnit * (std.quantity || 1);
      const firstLog = relatedLogs[0] || {};
      const departmentId = std.departmentId || planningOrder?.departmentId || firstLog.departmentId || firstLog.deptId || null;
      const machine = planningOrder?.machine || std.machine || firstLog.machine || firstLog.currentStation;
      const departmentName = std.department || std.departmentName || planningOrder?.department || firstLog.department || inferDepartmentFromMachine(machine) || resolveDepartmentNameFromId(departmentId) || 'Overig';

      const eventDates = [
        ...relatedLogs.flatMap((log) => getLogActivityDates(log)),
        toDateValue(std?.createdAt),
        toDateValue(std?.updatedAt),
        toDateValue(planningOrder?.plannedDate),
        toDateValue(planningOrder?.createdAt),
        toDateValue(planningOrder?.updatedAt),
      ].filter(Boolean);

      const inSelectedPeriod =
        viewMode === 'archive'
          ? true
          : eventDates.some((d) => isWithinInterval(d, periodRange));

      return {
        ...std,
        actualMinutes,
        producedQty,
        efficiency,
        isOverrun,
        logsCount: relatedLogs.length,
        qcTimeTotal: qcTotal,
        productionTimeTotal: prodTotal,
        postProcessingTimeTotal: postTotal,
        aiPredictedTotal, // De voorspelde tijd op basis van historie
        aiConfidence: history ? Math.min(100, history.count * 10) : 0, // Hoe zeker is de AI? (meer data = meer zekerheid)
        departmentId,
        departmentName,
        department: departmentName,
        machine,
        inSelectedPeriod,
      };
    });

    // Fallback: toon ook orders die wel tracking hebben maar (nog) geen efficiency import.
    const knownOrderIds = new Set(
      standards
        .map((std) => String(std.orderId || std.id || '').trim())
        .filter(Boolean)
    );
    const trackingByOrder = {};

    tracking.forEach((log) => {
      const orderId = String(log.orderId || log.orderNumber || '').trim();
      if (!orderId || knownOrderIds.has(orderId)) return;
      if (!trackingByOrder[orderId]) trackingByOrder[orderId] = [];
      trackingByOrder[orderId].push(log);
    });

    const fallbackRows = Object.entries(trackingByOrder).map(([orderId, relatedLogs]) => {
      let actualMinutes = 0;
      let producedQty = 0;
      const planningOrder = orderById.get(orderId);

      relatedLogs.forEach((log) => {
        actualMinutes += getTrackingDurationMinutes(log);

        if (log.status === 'completed' || log.status === 'shipped') {
          producedQty += 1;
        }
      });

      if (actualMinutes <= 0) {
        actualMinutes = getOrderActualMinutes(planningOrder);
      }

      const first = relatedLogs[0] || {};
      const departmentId = planningOrder?.departmentId || first.departmentId || first.deptId || null;
      const machine = planningOrder?.machine || first.machine || first.currentStation;
      const departmentName = planningOrder?.department || first.department || inferDepartmentFromMachine(machine) || resolveDepartmentNameFromId(departmentId) || 'Overig';
      const inferredMinutesPerUnit = producedQty > 0 && actualMinutes > 0
        ? actualMinutes / producedQty
        : 0;

      const eventDates = [
        ...relatedLogs.flatMap((log) => getLogActivityDates(log)),
        toDateValue(planningOrder?.plannedDate),
        toDateValue(planningOrder?.createdAt),
        toDateValue(planningOrder?.updatedAt),
      ].filter(Boolean);

      const inSelectedPeriod =
        viewMode === 'archive'
          ? true
          : eventDates.some((d) => isWithinInterval(d, periodRange));

      return {
        id: orderId,
        orderId,
        itemCode: first.itemCode || first.item || 'Onbekend',
        item: first.item || first.itemCode || 'Tracking order',
        quantity: planningOrder?.quantity || first.quantity || producedQty || 0,
        status: planningOrder?.status || first.status || 'in_progress',
        minutesPerUnit: inferredMinutesPerUnit,
        standardTimeTotal: actualMinutes,
        productionTimeTotal: 0,
        postProcessingTimeTotal: 0,
        qcTimeTotal: 0,
        actualMinutes,
        producedQty,
        efficiency: actualMinutes > 0 ? 100 : 0,
        isOverrun: false,
        logsCount: relatedLogs.length,
        aiPredictedTotal: actualMinutes,
        aiConfidence: 0,
        departmentId,
        departmentName,
        department: departmentName,
        machine,
        inSelectedPeriod,
      };
    });

    processed = [...processed, ...fallbackRows];

    if (viewMode === 'active') {
      processed = processed.filter((i) => i.inSelectedPeriod);
    }

    // Filteren
    if (filterStatus === 'active' && viewMode === 'active') {
      processed = processed.filter(i => i.status !== 'completed' && i.status !== 'completed_in_ln');
    }

    processed = processed.filter((i) => matchesDepartmentFilter(i));

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      processed = processed.filter(i => 
        String(i.orderId).toLowerCase().includes(lower)
      );
    }

    // Sorteren: Orders met meeste aandacht nodig bovenaan (laagste efficiency eerst, maar wel met activiteit)
    processed.sort((a, b) => {
        if (a.actualMinutes === 0 && b.actualMinutes > 0) return 1;
        if (a.actualMinutes > 0 && b.actualMinutes === 0) return -1;
        return a.efficiency - b.efficiency;
    });

    // KPI Aggregates
    const totalTarget = processed.reduce((sum, i) => sum + (i.standardTimeTotal || 0), 0);
    const totalActual = processed.reduce((sum, i) => sum + i.actualMinutes, 0);
    const avgEfficiency = totalActual > 0 ? Math.round((totalTarget / totalActual) * 100) : 0;
    
    const activeCount = processed.length;
    const overrunCount = processed.filter(i => i.isOverrun).length;

    return {
      items: processed,
      kpi: {
        avgEfficiency,
        activeCount,
        overrunCount,
        totalActual
      }
    };
  }, [standards, tracking, planningOrders, filterStatus, searchTerm, viewMode, departmentFilter, factoryConfig, selectedDate, periodMode]);

  if (showAiAnalysis) {
    return <AiPredictionView onClose={() => setShowAiAnalysis(false)} dataSourceMode={dataSourceMode} />;
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header & KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className={`p-3 rounded-xl ${dashboardData.kpi.avgEfficiency >= 85 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
            <Activity size={24} />
          </div>
          <div>
            <div className="text-sm text-slate-500 font-bold uppercase tracking-wider">{t('efficiency_dashboard.avg_efficiency')}</div>
            <div className="text-2xl font-black text-slate-800">{dashboardData.kpi.avgEfficiency}%</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
            <TrendingUp size={24} />
          </div>
          <div>
            <div className="text-sm text-slate-500 font-bold uppercase tracking-wider">{t('efficiency_dashboard.active_orders')}</div>
            <div className="text-2xl font-black text-slate-800">{dashboardData.kpi.activeCount}</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-purple-100 text-purple-600">
            <Clock size={24} />
          </div>
          <div>
            <div className="text-sm text-slate-500 font-bold uppercase tracking-wider">{t('efficiency_dashboard.hours_spent')}</div>
            <div className="text-2xl font-black text-slate-800">{formatMinutes(dashboardData.kpi.totalActual)}</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className={`p-3 rounded-xl ${dashboardData.kpi.overrunCount > 0 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-400'}`}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <div className="text-sm text-slate-500 font-bold uppercase tracking-wider">{t('efficiency_dashboard.overruns')}</div>
            <div className="text-2xl font-black text-slate-800">{dashboardData.kpi.overrunCount}</div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        {/* Afdeling Filter */}
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5 font-bold outline-none"
        >
          <option value="ALL">Alle Afdelingen</option>
          <option value="FITTINGS">Fittings</option>
          <option value="PIPES">Pipes</option>
          <option value="SPOOLS">Spools</option>
        </select>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Search className="text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder={t('efficiency_dashboard.search_placeholder')} 
            className="bg-transparent border-none focus:ring-0 text-slate-700 font-medium w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setShowAiAnalysis(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl shadow-md font-black text-[10px] uppercase tracking-wider hover:bg-purple-700 transition-all"
          >
            <BrainCircuit size={16} />
            <span className="hidden sm:inline">AI Analyse</span>
          </button>

          {/* View Mode Selector (Actueel vs Archief) */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1 mr-2">
            <button
              onClick={() => setViewMode('active')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'active' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t('efficiency_dashboard.view_active')}
            </button>
            <button
              onClick={() => setViewMode('archive')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'archive' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <History size={12} />
              {t('efficiency_dashboard.view_archive')}
            </button>
          </div>

          {viewMode === 'archive' && (
            <select 
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block p-2 font-bold"
            >
              {[0, 1, 2, 3].map(offset => {
                const y = new Date().getFullYear() - offset;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          )}

          {viewMode === 'active' && (
            <>
              <div className="flex bg-slate-100 rounded-lg p-1">
                <button onClick={() => setFilterStatus('active')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterStatus === 'active' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{t('efficiency_dashboard.filter_open')}</button>
                <button onClick={() => setFilterStatus('all')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterStatus === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{t('efficiency_dashboard.filter_all')}</button>
              </div>

              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                <button
                  onClick={() => setPeriodMode('day')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${periodMode === 'day' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >
                  Dag
                </button>
                <button
                  onClick={() => setPeriodMode('week')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${periodMode === 'week' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >
                  Week
                </button>
                <button
                  onClick={() => setPeriodMode('month')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${periodMode === 'month' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >
                  Maand
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button onClick={navigatePrevious} className="px-2 py-1.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold">
                  Vorige
                </button>
                <span className="text-xs font-bold text-slate-600 min-w-[150px] text-center">
                  {periodMode === 'day'
                    ? formatDate(selectedDate, 'dd-MM-yyyy')
                    : periodMode === 'month'
                      ? formatDate(selectedDate, 'MMMM yyyy')
                      : `Week ${getISOWeek(selectedDate)} - ${formatDate(selectedDate, 'yyyy')}`}
                </span>
                <button onClick={navigateNext} className="px-2 py-1.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold">
                  Volgende
                </button>
                <button onClick={jumpToToday} className="px-2 py-1.5 rounded-md bg-blue-500 text-white text-xs font-bold">
                  Vandaag
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Orders List */}
      <div className="grid grid-cols-1 gap-4">
        {dashboardData.items.map((item) => (
          <div key={item.orderId} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-col md:flex-row justify-between gap-6">
              
              {/* Order Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-lg font-black text-slate-800">{item.orderId}</span>
                  <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase ${item.isOverrun ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                    {item.isOverrun ? t('efficiency_dashboard.status_overrun') : t('efficiency_dashboard.status_on_schedule')}
                  </span>
                </div>
                <div className="text-sm font-bold text-blue-600 mb-2">
                  {item.itemCode} <span className="text-slate-400">•</span> {item.item}
                </div>

                <div className="text-xs text-slate-500 flex flex-wrap gap-4 items-center">
                  <span>{t('efficiency_dashboard.qty')}: <b>{item.quantity}</b></span>
                  <span>{t('efficiency_dashboard.produced')}: <b>{item.producedQty}</b></span>
                  <span>{t('efficiency_dashboard.norm')}: <b>{Math.round(item.minutesPerUnit * 10) / 10}m</b> / {t('efficiency_dashboard.per_piece')}</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {item.productionTimeTotal > 0 && (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-bold border border-blue-100" title={t('efficiency_dashboard.prod_tooltip')}>
                        {t('efficiency_dashboard.prod')}: {formatMinutes(item.productionTimeTotal)}
                      </span>
                    )}
                    {item.postProcessingTimeTotal > 0 && (
                      <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs font-bold border border-purple-100" title={t('efficiency_dashboard.post_tooltip')}>
                        {t('efficiency_dashboard.post')}: {formatMinutes(item.postProcessingTimeTotal)}
                      </span>
                    )}
                    {item.qcTimeTotal > 0 && (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-bold border border-amber-100" title={t('efficiency_dashboard.qc_excluded')}>
                        {t('efficiency_dashboard.qc')}: {formatMinutes(item.qcTimeTotal)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress Bar & Stats */}
              <div className="flex-1 flex flex-col justify-center">
                <div className="flex justify-between text-sm font-bold mb-2">
                  <span className="text-slate-600">
                    {formatMinutes(item.actualMinutes)} {t('efficiency_dashboard.spent')}
                  </span>
                  <div className="text-right">
                    <span className="text-slate-400 block text-[10px] uppercase">Target</span>
                    <span className="text-slate-600">{formatMinutes(item.standardTimeTotal)}</span>
                  </div>
                </div>
                <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${getEfficiencyColor(item.efficiency).replace('text-', 'bg-').split(' ')[1]}`}
                    style={{ width: `${Math.min(100, (item.actualMinutes / item.standardTimeTotal) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Efficiency Score */}
              <div className="flex flex-col items-end justify-center min-w-[100px]">
                <div className={`text-3xl font-black ${getEfficiencyColor(item.efficiency).split(' ')[0]}`}>
                  {Math.round(item.efficiency)}%
                </div>
                <div className="text-xs text-slate-400 font-bold uppercase">{t('efficiency_dashboard.efficiency')}</div>
                
                {/* AI Prediction Badge */}
                <div className="mt-2 flex items-center gap-1 bg-purple-50 px-2 py-1 rounded border border-purple-100" title={`Gebaseerd op ${Math.round(item.aiConfidence/10)} eerdere producties`}>
                  <BrainCircuit size={10} className="text-purple-500" />
                  <span className="text-[9px] font-bold text-purple-700">AI: ~{formatMinutes(item.aiPredictedTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}

        {dashboardData.items.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Timer size={48} className="mx-auto mb-4 opacity-20" />
            <p>
              {viewMode === 'active' 
                ? t('efficiency_dashboard.no_data_active')
                : t('efficiency_dashboard.no_data_archive', { year: selectedYear })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EfficiencyDashboard;