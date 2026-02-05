import React, { useState, useEffect, useMemo } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar,
  ZoomIn,
  ZoomOut,
  Filter
} from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval,
  addDays,
  subDays,
  differenceInDays,
  isToday
} from "date-fns";
import { nl } from "date-fns/locale";

/**
 * GanttChartView - Timeline visualization for order planning
 * Shows orders on a timeline per machine/department
 */
const GanttChartView = () => {
  const [orders, setOrders] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewStart, setViewStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [viewRange, setViewRange] = useState(14); // days
  const [selectedDepartment, setSelectedDepartment] = useState("ALLES");

  useEffect(() => {
    // Load orders
    const unsubOrders = onSnapshot(
      collection(db, ...PATHS.PLANNING),
      (snapshot) => {
        const ordersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setOrders(ordersData);
        
        // Extract unique machines
        const uniqueMachines = [...new Set(ordersData.map(o => o.machine).filter(Boolean))];
        setMachines(uniqueMachines.sort());
        setLoading(false);
      }
    );

    return () => unsubOrders();
  }, []);

  // Calculate timeline days
  const timelineDays = useMemo(() => {
    return eachDayOfInterval({
      start: viewStart,
      end: addDays(viewStart, viewRange - 1)
    });
  }, [viewStart, viewRange]);

  // Calculate column width (each day)
  const dayWidth = 80; // pixels per day

  // Get orders for a machine
  const getOrdersForMachine = (machine) => {
    return orders.filter(order => 
      order.machine === machine &&
      order.plannedDate
    );
  };

  // Calculate order position and width
  const getOrderStyle = (order) => {
    if (!order.plannedDate) return null;

    const orderDate = new Date(order.plannedDate.seconds * 1000);
    const daysFromStart = differenceInDays(orderDate, viewStart);
    
    if (daysFromStart < 0 || daysFromStart >= viewRange) return null;

    // Estimate duration based on plan count (1 day per 100 pieces as example)
    const estimatedDays = Math.max(1, Math.ceil((order.plan || 0) / 100));
    
    return {
      left: `${daysFromStart * dayWidth}px`,
      width: `${estimatedDays * dayWidth - 8}px`
    };
  };

  // Get order color based on status
  const getOrderColor = (order) => {
    const status = order.status || "planned";
    const colors = {
      planned: "bg-blue-500",
      in_production: "bg-orange-500",
      quality_check: "bg-purple-500",
      ready_to_ship: "bg-emerald-500",
      shipped: "bg-slate-400"
    };
    return colors[status] || "bg-slate-500";
  };

  // Navigation
  const goToPreviousWeek = () => setViewStart(prev => subDays(prev, 7));
  const goToNextWeek = () => setViewStart(prev => addDays(prev, 7));
  const goToToday = () => setViewStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

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
              Gantt <span className="text-blue-600">Planning</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Visuele timeline van orderplanning per machine
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* View Range */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewRange(7)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewRange === 7
                    ? "bg-blue-500 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                1 Week
              </button>
              <button
                onClick={() => setViewRange(14)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewRange === 14
                    ? "bg-blue-500 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                2 Weken
              </button>
              <button
                onClick={() => setViewRange(30)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewRange === 30
                    ? "bg-blue-500 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                1 Maand
              </button>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={goToPreviousWeek}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={goToToday}
                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors"
              >
                Vandaag
              </button>
              <button
                onClick={goToNextWeek}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Gantt Chart */}
      <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 overflow-hidden">
        {/* Timeline Header */}
        <div className="flex border-b-2 border-slate-200 bg-slate-50">
          {/* Machine Column */}
          <div className="w-48 flex-shrink-0 p-4 border-r-2 border-slate-200 font-bold text-sm text-slate-700">
            Machine
          </div>
          
          {/* Days */}
          <div className="flex-1 overflow-x-auto">
            <div className="flex" style={{ minWidth: `${viewRange * dayWidth}px` }}>
              {timelineDays.map((day, idx) => (
                <div
                  key={idx}
                  className={`flex-shrink-0 border-r border-slate-200 p-2 text-center ${
                    isToday(day) ? "bg-blue-50" : ""
                  }`}
                  style={{ width: `${dayWidth}px` }}
                >
                  <div className={`text-xs font-bold ${isToday(day) ? "text-blue-600" : "text-slate-700"}`}>
                    {format(day, 'EEE', { locale: nl })}
                  </div>
                  <div className={`text-lg font-black ${isToday(day) ? "text-blue-600" : "text-slate-800"}`}>
                    {format(day, 'd')}
                  </div>
                  <div className="text-xs text-slate-500">
                    {format(day, 'MMM', { locale: nl })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Gantt Rows */}
        <div className="max-h-[600px] overflow-y-auto">
          {machines.map((machine, idx) => {
            const machineOrders = getOrdersForMachine(machine);
            
            return (
              <div
                key={machine}
                className={`flex border-b border-slate-200 hover:bg-slate-50 transition-colors ${
                  idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                }`}
              >
                {/* Machine Name */}
                <div className="w-48 flex-shrink-0 p-4 border-r-2 border-slate-200">
                  <div className="font-bold text-sm text-slate-800">{machine}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {machineOrders.length} orders
                  </div>
                </div>

                {/* Timeline */}
                <div className="flex-1 overflow-x-auto">
                  <div
                    className="relative h-20"
                    style={{ minWidth: `${viewRange * dayWidth}px` }}
                  >
                    {/* Day Grid Lines */}
                    {timelineDays.map((day, dayIdx) => (
                      <div
                        key={dayIdx}
                        className={`absolute top-0 h-full border-r ${
                          isToday(day) ? "border-blue-300 bg-blue-50/30" : "border-slate-100"
                        }`}
                        style={{ left: `${dayIdx * dayWidth}px`, width: `${dayWidth}px` }}
                      />
                    ))}

                    {/* Orders */}
                    {machineOrders.map(order => {
                      const style = getOrderStyle(order);
                      if (!style) return null;

                      return (
                        <div
                          key={order.id}
                          className={`absolute top-2 ${getOrderColor(order)} rounded-lg p-2 shadow-md hover:shadow-lg transition-shadow cursor-pointer group`}
                          style={style}
                        >
                          <div className="text-white text-xs font-bold truncate">
                            {order.orderId || order.item}
                          </div>
                          <div className="text-white text-xs opacity-90">
                            {order.plan} stuks
                          </div>
                          
                          {/* Tooltip on hover */}
                          <div className="hidden group-hover:block absolute bottom-full left-0 mb-2 bg-slate-900 text-white p-3 rounded-lg shadow-xl z-10 whitespace-nowrap text-xs">
                            <div className="font-bold mb-1">{order.orderId || order.item}</div>
                            <div>Item: {order.itemCode || order.extraCode}</div>
                            <div>Aantal: {order.plan} stuks</div>
                            <div>Machine: {order.machine}</div>
                            {order.plannedDate && (
                              <div>Datum: {format(new Date(order.plannedDate.seconds * 1000), 'dd-MM-yyyy')}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 bg-white rounded-2xl p-4 shadow-sm border-2 border-slate-200">
        <div className="flex items-center gap-6">
          <span className="text-sm font-bold text-slate-700">Status:</span>
          {[
            { status: "planned", label: "Gepland", color: "bg-blue-500" },
            { status: "in_production", label: "In Productie", color: "bg-orange-500" },
            { status: "quality_check", label: "Controle", color: "bg-purple-500" },
            { status: "ready_to_ship", label: "Verzendklaar", color: "bg-emerald-500" },
            { status: "shipped", label: "Verzonden", color: "bg-slate-400" }
          ].map(item => (
            <div key={item.status} className="flex items-center gap-2">
              <div className={`w-4 h-4 ${item.color} rounded`} />
              <span className="text-xs text-slate-600">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GanttChartView;
