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
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { PATHS, getEfficiencyArchivePath } from '../../config/dbPaths';
import { calculateDuration, formatMinutes, getEfficiencyColor } from '../../utils/efficiencyCalculator';
import AiPredictionView from './AiPredictionView';

const EfficiencyDashboard = () => {
  const { t } = useTranslation();
  const [standards, setStandards] = useState([]);
  const [tracking, setTracking] = useState([]);
  const [, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('active'); // 'active', 'all'
  const [departmentFilter, setDepartmentFilter] = useState('ALL'); // Nieuw: Afdeling filter
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('active'); // 'active' | 'archive'
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showAiAnalysis, setShowAiAnalysis] = useState(false);

  useEffect(() => {
    setLoading(true);

    if (!PATHS || !PATHS.EFFICIENCY_HOURS) {
      setLoading(false);
      return;
    }

    // 1. Haal de standaarden op (Targets uit Infor LN import)
    // Wissel tussen actuele collectie en archief op basis van viewMode
    const collectionPath = viewMode === 'active' 
      ? PATHS.EFFICIENCY_HOURS
      : getEfficiencyArchivePath(selectedYear);

    const standardsRef = collection(db, ...collectionPath);
    const unsubStandards = onSnapshot(standardsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStandards(data);
    });

    // 2. Haal de werkelijke tracking data op (Actuals van de vloer)
    // We gebruiken de tracking collectie waar operators hun start/stop tijden loggen
    const trackingRef = collection(db, ...PATHS.TRACKING);
    const unsubTracking = onSnapshot(trackingRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTracking(data);
    });

    setLoading(false);

    return () => {
      unsubStandards();
      unsubTracking();
    };
  }, [viewMode, selectedYear]);

  const dashboardData = useMemo(() => {
    // 1. AI Learning: Bouw een kennisbank op van historische tijden per product
    const productKnowledgeBase = {};
    
    tracking.forEach(log => {
      if ((log.status === 'completed' || log.status === 'shipped') && log.itemCode && log.timestamps?.station_start) {
        const start = log.timestamps.station_start.toDate ? log.timestamps.station_start.toDate() : new Date(log.timestamps.station_start);
        const end = log.timestamps.completed?.toDate ? log.timestamps.completed.toDate() : new Date();
        const duration = calculateDuration(start, end);
        
        if (duration > 0) {
          if (!productKnowledgeBase[log.itemCode]) {
            productKnowledgeBase[log.itemCode] = { totalTime: 0, count: 0 };
          }
          productKnowledgeBase[log.itemCode].totalTime += duration;
          productKnowledgeBase[log.itemCode].count += 1;
        }
      }
    });

    // Combineer standaarden met werkelijke data
    let processed = standards.map(std => {
      const itemCode = std.itemCode || std.productId || "Onbekend";
      // Vind alle tracking records voor deze order
      // We matchen op orderId (string comparison voor veiligheid)
      const relatedLogs = tracking.filter(t => 
        String(t.orderId || t.orderNumber) === String(std.orderId)
      );

      // Bereken totaal bestede tijd en voortgang
      let actualMinutes = 0;
      let producedQty = 0;
      
      relatedLogs.forEach(log => {
        // Tijd berekening
        if (log.timestamps?.station_start) {
          const start = log.timestamps.station_start.toDate ? log.timestamps.station_start.toDate() : new Date(log.timestamps.station_start);
          // Als nog niet klaar, reken tot nu (live view)
          const end = log.timestamps.completed?.toDate ? log.timestamps.completed.toDate() : 
                      (log.timestamps.finished?.toDate ? log.timestamps.finished.toDate() : new Date());
          
          const duration = calculateDuration(start, end);
          actualMinutes += duration;
        }

        // Aantal berekening (alleen voltooide items tellen)
        if (log.status === 'completed' || log.status === 'shipped') {
          producedQty += 1; 
        }
      });

      const targetTotal = std.standardTimeTotal || 0;
      const qcTotal = std.qcTimeTotal || 0;
      const prodTotal = std.productionTimeTotal || 0;
      const postTotal = std.postProcessingTimeTotal || 0;
      
      // Efficiency Formule: (Verdiende Tijd / Werkelijke Tijd) * 100
      // We gebruiken 'Earned Value' (Geproduceerd * Norm) zodat de score ook klopt
      // voor orders die halverwege instromen (ramp-up fase).
      const normPerUnit = std.minutesPerUnit || 0;
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
        department: std.department || 'Overig'
      };
    });

    // Filteren
    if (filterStatus === 'active' && viewMode === 'active') {
      processed = processed.filter(i => i.status !== 'completed' && i.status !== 'completed_in_ln');
    }

    if (departmentFilter !== 'ALL') {
      processed = processed.filter(i => (i.department || "").toUpperCase() === departmentFilter);
    }

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
  }, [standards, tracking, filterStatus, searchTerm, viewMode, departmentFilter]);

  if (showAiAnalysis) {
    return <AiPredictionView onClose={() => setShowAiAnalysis(false)} />;
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
            <div className="flex bg-slate-100 rounded-lg p-1">
              <button onClick={() => setFilterStatus('active')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterStatus === 'active' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{t('efficiency_dashboard.filter_open')}</button>
              <button onClick={() => setFilterStatus('all')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterStatus === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{t('efficiency_dashboard.filter_all')}</button>
            </div>
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