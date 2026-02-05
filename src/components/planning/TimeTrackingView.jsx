import React, { useState, useEffect, useMemo } from "react";
import { 
  Clock, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Calendar
} from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { format, getISOWeek, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { nl } from "date-fns/locale";

/**
 * TimeTrackingView - Compare actual vs planned time
 * Shows time variance and identifies bottlenecks
 */
const TimeTrackingView = () => {
  const [orders, setOrders] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState(new Date());
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    const unsubOrders = onSnapshot(
      collection(db, ...PATHS.PLANNING),
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
      collection(db, ...PATHS.OCCUPANCY),
      (snapshot) => {
        const occData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setOccupancy(occData);
      }
    );

    return () => {
      unsubOrders();
      unsubOccupancy();
    };
  }, []);

  // Filter orders by selected week
  const weekOrders = useMemo(() => {
    const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: 1 });

    return orders.filter(order => {
      if (!order.plannedDate) return false;
      
      const planDate = new Date(order.plannedDate.seconds * 1000);
      const inWeek = isWithinInterval(planDate, { start: weekStart, end: weekEnd });
      
      if (filterStatus !== "all" && order.status !== filterStatus) return false;
      
      return inWeek;
    });
  }, [orders, selectedWeek, filterStatus]);

  // Calculate time metrics per order
  const orderMetrics = useMemo(() => {
    return weekOrders.map(order => {
      const planned = order.estimatedHours || 0;
      const actual = order.actualHours || 0;
      const variance = actual - planned;
      const variancePercent = planned > 0 ? (variance / planned) * 100 : 0;
      
      let status = "on_track";
      if (Math.abs(variancePercent) < 10) status = "on_track";
      else if (variancePercent > 0) status = "over";
      else status = "under";

      return {
        ...order,
        planned,
        actual,
        variance,
        variancePercent,
        status
      };
    });
  }, [weekOrders]);

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

  // Get status color
  const getStatusColor = (status) => {
    const colors = {
      on_track: "bg-emerald-50 border-emerald-200 text-emerald-800",
      over: "bg-red-50 border-red-200 text-red-800",
      under: "bg-blue-50 border-blue-200 text-blue-800"
    };
    return colors[status] || colors.on_track;
  };

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
            {/* Week Selector */}
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-slate-600" />
              <span className="text-sm font-bold text-slate-700">
                Week {getISOWeek(selectedWeek)} - {format(selectedWeek, 'yyyy')}
              </span>
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
              <option value="ready_to_ship">Verzendklaar</option>
              <option value="shipped">Verzonden</option>
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
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Gepland</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Daadwerkelijk</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Variance</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {orderMetrics.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-12 text-center text-slate-400">
                    Geen orders in geselecteerde week
                  </td>
                </tr>
              ) : (
                orderMetrics.map(order => (
                  <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-sm text-slate-800">{order.orderId || order.item}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-600">{order.itemCode || order.extraCode}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-600">{order.machine || "-"}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-bold text-slate-700">{Math.round(order.planned)}h</div>
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
