import React, { useState, useEffect, useMemo } from "react";
import {
  TrendingUp,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  BarChart3,
  Activity,
  Target,
  Zap,
  Package,
  Loader2
} from "lucide-react";
import { collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { getISOWeek, startOfISOWeek, endOfISOWeek, format } from "date-fns";

/**
 * CapacityPlanningView
 * Vergelijkt beschikbare productie-uren met geplande uren
 * Toont het verschil tussen capaciteit en demand
 */
const CapacityPlanningView = () => {
  const [loading, setLoading] = useState(true);
  const [occupancy, setOccupancy] = useState([]);
  const [planningOrders, setPlanningOrders] = useState([]);
  const [timeStandards, setTimeStandards] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(new Date());

  const currentWeek = getISOWeek(selectedWeek);
  const weekStart = startOfISOWeek(selectedWeek);
  const weekEnd = endOfISOWeek(selectedWeek);

  useEffect(() => {
    setLoading(true);

    // Load occupancy data
    const unsubOcc = onSnapshot(
      collection(db, ...PATHS.OCCUPANCY),
      (snapshot) => {
        setOccupancy(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    // Load planning orders
    const unsubPlanning = onSnapshot(
      collection(db, ...PATHS.PLANNING),
      (snapshot) => {
        setPlanningOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      }
    );

    // Load time standards
    const unsubStandards = onSnapshot(
      collection(db, ...PATHS.PRODUCTION_STANDARDS),
      (snapshot) => {
        setTimeStandards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    return () => {
      unsubOcc();
      unsubPlanning();
      unsubStandards();
    };
  }, []);

  // Bereken beschikbare capaciteit
  const capacityMetrics = useMemo(() => {
    // Filter occupancy voor deze week
    const weekOccupancy = occupancy.filter(occ => {
      const occDate = new Date(occ.date);
      return occDate >= weekStart && occDate <= weekEnd;
    });

    // Bereken totale productie-uren (netto werk)
    const totalProductionHours = weekOccupancy.reduce((sum, occ) => {
      return sum + parseFloat(occ.hoursWorked || 0);
    }, 0);

    // Bereken rand-uren (setup, pauze, overhead)
    // Aanname: 8 uur per dag - hoursWorked = overhead
    const totalScheduledHours = weekOccupancy.reduce((sum, occ) => {
      return sum + 8; // Standaard werkdag
    }, 0);

    const overheadHours = totalScheduledHours - totalProductionHours;

    // Unieke operators deze week
    const uniqueOperators = new Set(weekOccupancy.map(o => o.operatorNumber));
    const operatorCount = uniqueOperators.size;

    return {
      totalProductionHours: Math.round(totalProductionHours * 10) / 10,
      overheadHours: Math.round(overheadHours * 10) / 10,
      totalScheduledHours: Math.round(totalScheduledHours * 10) / 10,
      operatorCount,
      efficiency: totalScheduledHours > 0 
        ? Math.round((totalProductionHours / totalScheduledHours) * 100) 
        : 0
    };
  }, [occupancy, weekStart, weekEnd]);

  // Bereken geplande uren op basis van orders en standaard tijden
  const demandMetrics = useMemo(() => {
    // Filter orders voor deze week
    const weekOrders = planningOrders.filter(order => {
      const orderWeek = order.week || getISOWeek(new Date());
      return orderWeek === currentWeek;
    });

    let totalPlannedUnits = 0;
    let estimatedHours = 0;
    let ordersWithStandards = 0;
    let ordersWithoutStandards = 0;

    weekOrders.forEach(order => {
      const planCount = parseInt(order.plan || 0);
      totalPlannedUnits += planCount;

      // Zoek standaard tijd voor dit product op deze machine
      const standard = timeStandards.find(std => 
        std.itemCode === order.item && 
        std.machine === order.machine
      );

      if (standard && planCount > 0) {
        const hoursNeeded = (standard.standardMinutes * planCount) / 60;
        estimatedHours += hoursNeeded;
        ordersWithStandards++;
      } else if (planCount > 0) {
        ordersWithoutStandards++;
      }
    });

    return {
      totalPlannedUnits,
      estimatedHours: Math.round(estimatedHours * 10) / 10,
      ordersWithStandards,
      ordersWithoutStandards,
      totalOrders: weekOrders.length
    };
  }, [planningOrders, timeStandards, currentWeek]);

  // Bereken verschil
  const gap = useMemo(() => {
    const difference = capacityMetrics.totalProductionHours - demandMetrics.estimatedHours;
    const percentage = demandMetrics.estimatedHours > 0
      ? Math.round((difference / demandMetrics.estimatedHours) * 100)
      : 0;

    return {
      hours: Math.round(difference * 10) / 10,
      percentage,
      status: difference >= 0 ? 'surplus' : 'shortage'
    };
  }, [capacityMetrics, demandMetrics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[40px] text-white relative overflow-hidden shadow-xl border border-white/5">
        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
          <BarChart3 size={150} />
        </div>
        <div className="relative z-10">
          <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
            Capaciteits <span className="text-blue-400">Planning</span>
          </h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">
            Week {currentWeek} • {format(weekStart, 'd MMM')} - {format(weekEnd, 'd MMM yyyy')}
          </p>
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Beschikbare Capaciteit */}
        <div className="bg-white border-2 border-emerald-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <Users className="text-emerald-600" size={24} />
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black">
              Beschikbaar
            </span>
          </div>
          <div className="text-4xl font-black text-emerald-600 mb-2">
            {capacityMetrics.totalProductionHours}u
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
            Productie-uren
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Operators</span>
              <span className="font-bold">{capacityMetrics.operatorCount}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Overhead</span>
              <span className="font-bold">{capacityMetrics.overheadHours}u</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Efficiency</span>
              <span className="font-bold">{capacityMetrics.efficiency}%</span>
            </div>
          </div>
        </div>

        {/* Geplande Vraag */}
        <div className="bg-white border-2 border-blue-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <Calendar className="text-blue-600" size={24} />
            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-black">
              Planning
            </span>
          </div>
          <div className="text-4xl font-black text-blue-600 mb-2">
            {demandMetrics.estimatedHours}u
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
            Geplande uren
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Orders</span>
              <span className="font-bold">{demandMetrics.totalOrders}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Units</span>
              <span className="font-bold">{demandMetrics.totalPlannedUnits}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Met standaard</span>
              <span className="font-bold">{demandMetrics.ordersWithStandards}/{demandMetrics.totalOrders}</span>
            </div>
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
              {gap.status === 'surplus' ? 'Overschot' : 'Tekort'}
            </span>
          </div>
          <div className={`text-4xl font-black mb-2 ${
            gap.status === 'surplus' ? 'text-emerald-600' : 'text-rose-600'
          }`}>
            {gap.status === 'surplus' ? '+' : ''}{gap.hours}u
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
            {gap.status === 'surplus' ? 'Overcapaciteit' : 'Ondercapaciteit'}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Percentage</span>
              <span className={`font-black ${
                gap.status === 'surplus' ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {gap.percentage > 0 ? '+' : ''}{gap.percentage}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {demandMetrics.ordersWithoutStandards > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-amber-600 flex-shrink-0" size={20} />
          <div>
            <div className="text-sm font-bold text-amber-900">
              Ontbrekende Standaard Tijden
            </div>
            <div className="text-xs text-amber-700 mt-1">
              {demandMetrics.ordersWithoutStandards} orders hebben geen standaard productietijd ingesteld.
              Ga naar <strong>Productie Tijden</strong> om deze toe te voegen voor nauwkeurigere capaciteitsberekening.
            </div>
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4 flex items-center gap-2">
          <Target size={18} />
          Aanbevelingen
        </h3>
        <div className="space-y-3">
          {gap.status === 'shortage' ? (
            <>
              <div className="flex items-start gap-3 p-3 bg-rose-50 rounded-xl">
                <AlertTriangle className="text-rose-600 flex-shrink-0 mt-0.5" size={16} />
                <div className="text-xs">
                  <div className="font-bold text-rose-900">Onderbezetting</div>
                  <div className="text-rose-700 mt-1">
                    Er zijn {Math.abs(gap.hours)} uur te weinig. Overweeg extra shifts, overuren, of herplan niet-kritische orders.
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3 p-3 bg-emerald-50 rounded-xl">
                <CheckCircle2 className="text-emerald-600 flex-shrink-0 mt-0.5" size={16} />
                <div className="text-xs">
                  <div className="font-bold text-emerald-900">Capaciteit Beschikbaar</div>
                  <div className="text-emerald-700 mt-1">
                    Er zijn {gap.hours} uur over. Mogelijkheden: extra orders aannemen, preventief onderhoud, training, of proces optimalisatie.
                  </div>
                </div>
              </div>
            </>
          )}
          
          {capacityMetrics.efficiency < 70 && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl">
              <Zap className="text-amber-600 flex-shrink-0 mt-0.5" size={16} />
              <div className="text-xs">
                <div className="font-bold text-amber-900">Lage Efficiency</div>
                <div className="text-amber-700 mt-1">
                  Slechts {capacityMetrics.efficiency}% van de tijd wordt productief gebruikt. 
                  Analyseer waar tijd verloren gaat: setup, wachttijden, materiaal tekorten?
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
            Capaciteit Verdeling
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Productie</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${capacityMetrics.efficiency}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-16 text-right">
                  {capacityMetrics.totalProductionHours}u
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Overhead</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-slate-400 rounded-full"
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
            Planning Status
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Met standaard</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full"
                    style={{ 
                      width: `${demandMetrics.totalOrders > 0 
                        ? (demandMetrics.ordersWithStandards / demandMetrics.totalOrders) * 100 
                        : 0}%` 
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-16 text-right">
                  {demandMetrics.ordersWithStandards}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Zonder standaard</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 rounded-full"
                    style={{ 
                      width: `${demandMetrics.totalOrders > 0 
                        ? (demandMetrics.ordersWithoutStandards / demandMetrics.totalOrders) * 100 
                        : 0}%` 
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-16 text-right">
                  {demandMetrics.ordersWithoutStandards}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CapacityPlanningView;
