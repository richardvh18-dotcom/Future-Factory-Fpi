import React, { useState, useEffect, useMemo } from "react";
import { 
  TrendingUp, 
  Clock, 
  Target, 
  Activity,
  AlertCircle,
  CheckCircle2,
  Timer,
  BarChart3,
  Calendar
} from "lucide-react";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import {
  calculateEfficiency,
  calculateBatchEfficiency,
  formatMinutes,
  calculateDuration,
  getEfficiencyColor,
  getEfficiencyLabel,
  isBehindSchedule,
  calculateTimeDeviation
} from "../../utils/efficiencyCalculator";

/**
 * EfficiencyDashboard
 * Toont real-time efficiency metrics op basis van verwachte vs werkelijke productietijden
 */
const EfficiencyDashboard = ({ selectedStation, dateRange = 'today' }) => {
  const [loading, setLoading] = useState(true);
  const [timeStandards, setTimeStandards] = useState([]);
  const [completedProducts, setCompletedProducts] = useState([]);
  const [activeProducts, setActiveProducts] = useState([]);

  useEffect(() => {
    loadData();
  }, [selectedStation, dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Laad productie standaarden
      const standardsSnapshot = await getDocs(
        collection(db, ...PATHS.PRODUCTION_STANDARDS)
      );
      const standards = standardsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTimeStandards(standards);

      // Laad afgeronde producten (laatste 24 uur)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const completedQuery = query(
        collection(db, ...PATHS.TRACKING),
        where("status", "==", "completed"),
        where("updatedAt", ">=", yesterday),
        ...(selectedStation ? [where("originMachine", "==", selectedStation)] : []),
        orderBy("updatedAt", "desc"),
        limit(100)
      );
      
      const completedSnapshot = await getDocs(completedQuery);
      const completed = completedSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Bereken werkelijke productietijd
          actualTime: calculateDuration(
            data.timestamps?.station_start || data.startTime,
            data.timestamps?.completed || data.updatedAt
          )
        };
      });
      setCompletedProducts(completed);

      // Laad actieve producten
      const activeQuery = query(
        collection(db, ...PATHS.TRACKING),
        where("status", "==", "in_progress"),
        ...(selectedStation ? [where("currentStation", "==", selectedStation)] : [])
      );
      
      const activeSnapshot = await getDocs(activeQuery);
      const active = activeSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Bereken tot nu toe verstreken tijd
          actualTime: calculateDuration(
            data.timestamps?.station_start || data.startTime,
            new Date()
          )
        };
      });
      setActiveProducts(active);

    } catch (error) {
      console.error("Error loading efficiency data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Koppel standaard tijden aan producten
  const enrichedCompleted = useMemo(() => {
    return completedProducts.map(product => {
      const standard = timeStandards.find(std => 
        std.itemCode === product.item && 
        std.machine === product.originMachine
      );
      
      return {
        ...product,
        targetTime: standard?.standardMinutes || null,
        efficiency: standard?.standardMinutes 
          ? calculateEfficiency(product.actualTime, standard.standardMinutes)
          : null
      };
    });
  }, [completedProducts, timeStandards]);

  const enrichedActive = useMemo(() => {
    return activeProducts.map(product => {
      const standard = timeStandards.find(std => 
        std.itemCode === product.item && 
        std.machine === product.currentStation
      );
      
      const targetTime = standard?.standardMinutes || null;
      const isBehind = targetTime ? isBehindSchedule(
        product.timestamps?.station_start || product.startTime,
        targetTime
      ) : false;
      
      const deviation = targetTime ? calculateTimeDeviation(
        product.timestamps?.station_start || product.startTime,
        targetTime
      ) : 0;
      
      return {
        ...product,
        targetTime,
        isBehind,
        deviation
      };
    });
  }, [activeProducts, timeStandards]);

  // Bereken overall statistics
  const stats = useMemo(() => {
    const batchStats = calculateBatchEfficiency(enrichedCompleted);
    
    const onTimeCount = enrichedCompleted.filter(p => 
      p.efficiency && p.efficiency >= 85
    ).length;
    
    const behindCount = enrichedActive.filter(p => p.isBehind).length;
    
    return {
      ...batchStats,
      onTimePercentage: batchStats.productCount > 0 
        ? Math.round((onTimeCount / batchStats.productCount) * 100)
        : 0,
      behindCount
    };
  }, [enrichedCompleted, enrichedActive]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Clock className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">
            Productie <span className="text-blue-600">Efficiency</span>
          </h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
            {selectedStation || 'Alle Machines'} • Laatste 24 uur
          </p>
        </div>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition"
        >
          Ververs
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Overall Efficiency */}
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <Target className="text-blue-600" size={24} />
            {stats.averageEfficiency && (
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getEfficiencyColor(stats.averageEfficiency)}`}>
                {getEfficiencyLabel(stats.averageEfficiency)}
              </span>
            )}
          </div>
          <div className="text-3xl font-black text-slate-900">
            {stats.averageEfficiency ? `${stats.averageEfficiency}%` : '—'}
          </div>
          <div className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
            Gemiddelde Efficiency
          </div>
        </div>

        {/* On Time */}
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <CheckCircle2 className="text-emerald-600" size={24} />
          </div>
          <div className="text-3xl font-black text-slate-900">
            {stats.onTimePercentage}%
          </div>
          <div className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
            Op Tijd of Sneller
          </div>
        </div>

        {/* Total Produced */}
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <BarChart3 className="text-purple-600" size={24} />
          </div>
          <div className="text-3xl font-black text-slate-900">
            {stats.productCount}
          </div>
          <div className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
            Afgeronde Units
          </div>
        </div>

        {/* Behind Schedule */}
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <AlertCircle className={stats.behindCount > 0 ? "text-rose-600" : "text-slate-400"} size={24} />
          </div>
          <div className={`text-3xl font-black ${stats.behindCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {stats.behindCount}
          </div>
          <div className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
            Achterlopend
          </div>
        </div>
      </div>

      {/* Active Production - Real-time */}
      {enrichedActive.length > 0 && (
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="text-blue-600" size={20} />
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
              Lopende Productie ({enrichedActive.length})
            </h3>
          </div>
          <div className="space-y-3">
            {enrichedActive.slice(0, 5).map(product => (
              <div key={product.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <div className="text-sm font-bold text-slate-800">{product.item}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                    <span>{product.lotNumber}</span>
                    <span>•</span>
                    <span>{product.currentStation}</span>
                  </div>
                </div>
                <div className="text-right">
                  {product.targetTime ? (
                    <>
                      <div className="text-sm font-bold text-slate-800">
                        {formatMinutes(product.actualTime)} / {formatMinutes(product.targetTime)}
                      </div>
                      {product.isBehind ? (
                        <div className="text-xs text-rose-600 font-bold flex items-center gap-1 justify-end mt-1">
                          <AlertCircle size={12} />
                          {formatMinutes(Math.abs(product.deviation))} te laat
                        </div>
                      ) : (
                        <div className="text-xs text-emerald-600 font-bold flex items-center gap-1 justify-end mt-1">
                          <CheckCircle2 size={12} />
                          {formatMinutes(product.deviation)} over
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-slate-400">Geen standaard</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Completed */}
      {enrichedCompleted.length > 0 && (
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Timer className="text-emerald-600" size={20} />
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
              Recent Afgerond ({enrichedCompleted.length})
            </h3>
          </div>
          <div className="space-y-3">
            {enrichedCompleted.slice(0, 10).map(product => (
              <div key={product.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <div className="text-sm font-bold text-slate-800">{product.item}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                    <span>{product.lotNumber}</span>
                    <span>•</span>
                    <span>{product.originMachine}</span>
                  </div>
                </div>
                <div className="text-right">
                  {product.efficiency ? (
                    <>
                      <div className={`px-3 py-1 rounded-full text-xs font-bold border inline-block ${getEfficiencyColor(product.efficiency)}`}>
                        {product.efficiency}%
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {formatMinutes(product.actualTime)} / {formatMinutes(product.targetTime)}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-slate-400">Geen standaard</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Data State */}
      {enrichedCompleted.length === 0 && enrichedActive.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <Calendar size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-sm font-bold uppercase tracking-widest">
            Geen productie data beschikbaar
          </p>
          <p className="text-xs mt-2">
            Start productie om efficiency metrics te zien
          </p>
        </div>
      )}
    </div>
  );
};

export default EfficiencyDashboard;
