import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { getReadPaths } from "../../config/dbPaths";
import { 
  format, 
  startOfWeek, 
  eachDayOfInterval,
  addDays,
  subDays,
  differenceInDays,
  differenceInCalendarDays,
  differenceInCalendarWeeks,
  startOfDay,
  isToday
} from "date-fns";
import { nl } from "date-fns/locale";

/**
 * GanttChartView - Timeline visualization for order planning
 * Shows orders on a timeline per machine/department
 */
const GanttChartView = ({ dataSourceMode = "current" }) => {
  const { t } = useTranslation();
  const usePilotReadData = dataSourceMode === "pilot-read";
  const readPaths = useMemo(() => getReadPaths(usePilotReadData), [usePilotReadData]);
  const [orders, setOrders] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [efficiencyData, setEfficiencyData] = useState({});
  const [viewStart, setViewStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [viewRange, setViewRange] = useState(14); // days
  const [viewMode, setViewMode] = useState("preset"); // preset | all
  const [dayWidth, setDayWidth] = useState(80);
  const [selectedDepartment, setSelectedDepartment] = useState("ALLES");
  const [factoryConfig, setFactoryConfig] = useState(null);
  const [departments, setDepartments] = useState(["ALLES"]);
  const [collapsedMachines, setCollapsedMachines] = useState(new Set());
  const timelineScrollRef = useRef(null);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(1200);
  const [isPanning, setIsPanning] = useState(false);
  const [panState, setPanState] = useState({ startX: 0, startScrollLeft: 0 });

  // Drag state
  const [dragState, setDragState] = useState({
    isDragging: false,
    orderId: null,
    startX: 0,
    currentX: 0,
    originalLeft: 0
  });

  // Helper voor robuuste datum parsing
  const parseDate = (dateInput) => {
    if (!dateInput) return null;
    if (dateInput.toDate) return dateInput.toDate(); // Firestore Timestamp
    if (dateInput instanceof Date) return dateInput;
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
  };

  useEffect(() => {
    if (!readPaths) return;

    // Load factory config for departments
    const docRef = doc(db, ...readPaths.FACTORY_CONFIG);
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setFactoryConfig(data);
        const depts = Array.isArray(data.departments) 
          ? data.departments.filter(d => d.isActive !== false).map(d => d.name)
          : [];
        setDepartments(["ALLES", ...depts]);
      }
    });
    return () => unsub();
  }, [readPaths]);

  useEffect(() => {
    if (!readPaths) return;

    // Load orders
    const unsubOrders = onSnapshot(
      collection(db, ...readPaths.PLANNING),
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
  }, [readPaths]);

  // Load efficiency/imported hours
  useEffect(() => {
    if (!readPaths) return;

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
    return () => unsubEfficiency();
  }, [readPaths]);

  // Filter machines based on selected department
  const visibleMachines = useMemo(() => {
    if (selectedDepartment === "ALLES" || !factoryConfig) {
      return machines;
    }
    
    const dept = factoryConfig.departments.find(d => d.name === selectedDepartment);
    if (!dept) return [];
    
    // Normalisatie helper voor flexibele matching (bijv. "40BH11", "BH11" of "BH 11")
    const normalize = (s) =>
      String(s || "")
        .toUpperCase()
        .replace(/\s/g, "")
        .replace(/^40/, "");
    
    const deptStationNames = (dept.stations || []).map(s => normalize(s.name));
    // Filter machines that are in the selected department
    return machines.filter(m => deptStationNames.includes(normalize(m)));
  }, [machines, selectedDepartment, factoryConfig]);

  const getOrderTimeBounds = (order) => {
    const startDateRaw = order.plannedDate || ((order.status === 'in_progress' || order.status === 'in_production') ? order.actualStart : null);
    const startDate = parseDate(startDateRaw);
    if (!startDate) return null;

    let totalHours;
    const importedInfo = efficiencyData[order.orderId];
    const isEfficiencyBased = Boolean(importedInfo && importedInfo.minutesPerUnit);

    if (isEfficiencyBased) {
      const planCount = parseInt(order.plan) || 0;
      totalHours = (importedInfo.minutesPerUnit * planCount) / 60;
    } else {
      totalHours = parseFloat(order.estimatedHours) || 0;
      if (totalHours === 0) {
        totalHours = (parseInt(order.plan) || 0) * 0.08;
      }
    }

    const explicitDeliveryDate = parseDate(order.deliveryDate || order.plannedDeliveryDate);
    const fallbackEndDate = addDays(startDate, Math.max(1, Math.ceil(totalHours / 8)) - 1);
    const endDate = explicitDeliveryDate || fallbackEndDate;

    const startDay = startOfDay(startDate);
    const endDay = startOfDay(endDate);
    const safeEndDay = endDay < startDay ? startDay : endDay;

    return {
      startDay,
      endDay: safeEndDay,
      totalHours,
      isEfficiencyBased,
      leadWeeks: Math.max(0, differenceInCalendarWeeks(safeEndDay, startDay, { weekStartsOn: 1 })),
    };
  };

  const allViewBounds = useMemo(() => {
    let minStart = null;
    let maxEnd = null;

    orders.forEach((order) => {
      const bounds = getOrderTimeBounds(order);
      if (!bounds) return;

      if (!minStart || bounds.startDay < minStart) minStart = bounds.startDay;
      if (!maxEnd || bounds.endDay > maxEnd) maxEnd = bounds.endDay;
    });

    if (!minStart || !maxEnd) {
      const fallbackStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      return { start: fallbackStart, range: 35 };
    }

    return {
      start: minStart,
      range: Math.max(1, differenceInCalendarDays(maxEnd, minStart) + 1),
    };
  }, [orders, efficiencyData]);

  const activeViewStart = viewMode === "all" ? allViewBounds.start : viewStart;
  const activeViewRange = viewMode === "all" ? allViewBounds.range : viewRange;

  const effectiveDayWidth = useMemo(() => {
    if (viewMode !== "all") return dayWidth;
    const timelineArea = Math.max(300, timelineViewportWidth - 192);
    const minWidthForMax35VisibleDays = timelineArea / 35;
    return Math.max(dayWidth, minWidthForMax35VisibleDays);
  }, [viewMode, dayWidth, timelineViewportWidth]);

  const visibleDaysCount = useMemo(() => {
    const timelineArea = Math.max(300, timelineViewportWidth - 192);
    return Math.max(1, Math.floor(timelineArea / effectiveDayWidth));
  }, [timelineViewportWidth, effectiveDayWidth]);

  useEffect(() => {
    setCollapsedMachines((prev) => {
      const next = new Set();
      visibleMachines.forEach((machine) => {
        if (prev.has(machine)) next.add(machine);
      });
      return next;
    });
  }, [visibleMachines]);

  // Calculate timeline days
  const timelineDays = useMemo(() => {
    return eachDayOfInterval({
      start: activeViewStart,
      end: addDays(activeViewStart, activeViewRange - 1)
    });
  }, [activeViewStart, activeViewRange]);

  const timelineWidth = useMemo(() => activeViewRange * effectiveDayWidth, [activeViewRange, effectiveDayWidth]);

  useEffect(() => {
    const updateViewportWidth = () => {
      if (!timelineScrollRef.current) return;
      setTimelineViewportWidth(timelineScrollRef.current.clientWidth || 1200);
    };

    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  // Get orders for a machine
  const getOrdersForMachine = (machine) => {
    return orders.filter(order => 
      order.machine === machine &&
      (order.plannedDate || ((order.status === 'in_progress' || order.status === 'in_production') && order.actualStart))
    );
  };

  const getMachineLayout = (machineOrders) => {
    const bars = machineOrders
      .map((order) => {
        const style = getOrderStyle(order);
        if (!style) return null;
        const leftPx = Number(style.leftPx || 0);
        const widthPx = Number(style.widthPx || 0);
        return { order, style, leftPx, widthPx };
      })
      .filter(Boolean)
      .sort((a, b) => a.leftPx - b.leftPx || a.widthPx - b.widthPx);

    const laneEndPositions = [];
    const laidOutBars = bars.map((bar) => {
      let lane = laneEndPositions.findIndex((end) => bar.leftPx >= end + 4);
      if (lane === -1) {
        lane = laneEndPositions.length;
        laneEndPositions.push(0);
      }
      laneEndPositions[lane] = bar.leftPx + bar.widthPx;
      return { ...bar, lane };
    });

    const laneCount = Math.max(1, laneEndPositions.length);
    const rowHeight = Math.max(80, laneCount * 26 + 12);
    return { laidOutBars, rowHeight };
  };

  // Handle Drag Start
  const handleDragStart = (e, order) => {
    if (usePilotReadData) return;

    e.preventDefault();
    e.stopPropagation();

    const dateToUse = order.plannedDate || ((order.status === 'in_progress' || order.status === 'in_production') ? order.actualStart : null);
    const orderDate = parseDate(dateToUse);
    
    if (!orderDate) return;

    const daysFromStart = differenceInDays(orderDate, activeViewStart);
    const currentLeft = daysFromStart * effectiveDayWidth;

    setDragState({
      isDragging: true,
      orderId: order.id,
      startX: e.clientX,
      currentX: e.clientX,
      originalLeft: currentLeft
    });
  };

  // Global Drag Listeners
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragState.isDragging) return;
      setDragState(prev => ({ ...prev, currentX: e.clientX }));
    };

    const handleMouseUp = async (e) => {
      if (!dragState.isDragging) return;

      const deltaX = e.clientX - dragState.startX;
      
      // Alleen updaten als er daadwerkelijk gesleept is (> 5px)
      if (Math.abs(deltaX) > 5) {
        const newLeft = dragState.originalLeft + deltaX;
        const daysShift = Math.round(newLeft / effectiveDayWidth);
        const newDate = addDays(activeViewStart, daysShift);
        
        if (dragState.orderId) {
          try {
            const orderRef = doc(db, ...readPaths.PLANNING, dragState.orderId);
            await updateDoc(orderRef, { plannedDate: newDate });
            await logActivity(
              auth.currentUser?.uid,
              "ORDER_DATE_MOVE",
              `Gantt geplande datum aangepast voor order ${dragState.orderId} naar ${newDate.toISOString().slice(0, 10)}`
            );
          } catch (error) {
            console.error("Error updating order date:", error);
          }
        }
      }

      setDragState({ isDragging: false, orderId: null, startX: 0, currentX: 0, originalLeft: 0 });
    };

    if (dragState.isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, activeViewStart, effectiveDayWidth, readPaths]);

  // Mouse grab-to-scroll voor horizontale timeline navigatie
  useEffect(() => {
    const handlePanMove = (e) => {
      if (!isPanning || !timelineScrollRef.current) return;
      const deltaX = e.clientX - panState.startX;
      timelineScrollRef.current.scrollLeft = panState.startScrollLeft - deltaX;
    };

    const handlePanEnd = () => {
      if (!isPanning) return;
      setIsPanning(false);
    };

    if (isPanning) {
      window.addEventListener("mousemove", handlePanMove);
      window.addEventListener("mouseup", handlePanEnd);
    }

    return () => {
      window.removeEventListener("mousemove", handlePanMove);
      window.removeEventListener("mouseup", handlePanEnd);
    };
  }, [isPanning, panState]);

  const handleTimelinePanStart = (e) => {
    if (e.button !== 0) return;
    if (!timelineScrollRef.current) return;
    if (e.target.closest(".gantt-order-bar")) return;
    if (e.target.closest("button,select,input,textarea,a")) return;

    e.preventDefault();

    setIsPanning(true);
    setPanState({
      startX: e.clientX,
      startScrollLeft: timelineScrollRef.current.scrollLeft,
    });
  };

  const handleTimelineWheel = (e) => {
    if (!timelineScrollRef.current) return;

    const horizontalIntent = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (!horizontalIntent) return;

    e.preventDefault();
    const scrollDelta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
    timelineScrollRef.current.scrollLeft += scrollDelta;
  };

  const toggleMachineCollapsed = (machine) => {
    setCollapsedMachines((prev) => {
      const next = new Set(prev);
      if (next.has(machine)) next.delete(machine);
      else next.add(machine);
      return next;
    });
  };

  const collapseAllMachines = () => setCollapsedMachines(new Set(visibleMachines));
  const expandAllMachines = () => setCollapsedMachines(new Set());

  // Calculate order position and width
  const getOrderStyle = (order) => {
    const bounds = getOrderTimeBounds(order);
    if (!bounds) return null;
    const { startDay, endDay: safeEndDay, totalHours, isEfficiencyBased, leadWeeks } = bounds;

    const isDraggingThis = dragState.isDragging && dragState.orderId === order.id;
    const daysFromViewStart = differenceInDays(startDay, activeViewStart);
    
    
    let leftPx = daysFromViewStart * effectiveDayWidth;
    let zIndex = 10;
    let cursor = 'grab';
    let boxShadow = '';

    if (isDraggingThis) {
        const deltaX = dragState.currentX - dragState.startX;
        leftPx = dragState.originalLeft + deltaX;
        zIndex = 50;
        cursor = 'grabbing';
        boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1)';
    }
    
    // Toon ook orders die deels in beeld vallen (bijv. gestart vorige week, leverdatum deze week).
    const orderStartOffset = differenceInCalendarDays(startDay, activeViewStart);
    const orderEndOffset = differenceInCalendarDays(safeEndDay, activeViewStart);
    const visibleRangeStart = 0;
    const visibleRangeEnd = activeViewRange - 1;
    const overlapsView = orderEndOffset >= visibleRangeStart && orderStartOffset <= visibleRangeEnd;
    if (!isDraggingThis && !overlapsView) return null;

    const barDays = Math.max(1, differenceInCalendarDays(safeEndDay, startDay) + 1);
    const widthPx = Math.max(20, barDays * effectiveDayWidth);

    return {
      leftPx,
      widthPx,
      zIndex,
      cursor,
      boxShadow,
      _totalHours: totalHours, // Internal use
      _isEfficiencyBased: isEfficiencyBased,
      _startDate: startDay,
      _endDate: safeEndDay,
      _leadWeeks: leadWeeks
    };
  };

  // Get order color based on status
  const getOrderColor = (order) => {
    const status = (order.status || "pending").toLowerCase();
    
    if (status.includes("plan") || status.includes("pending") || status.includes("open")) return "bg-blue-500";
    if (status.includes("prod") || status.includes("progress") || status.includes("active") || status.includes("start")) return "bg-orange-500";
    if (status.includes("check") || status.includes("qual") || status.includes("inspect")) return "bg-purple-500";
    if (status.includes("ready") || status.includes("compl") || status.includes("finish") || status.includes("gereed")) return "bg-emerald-500";
    if (status.includes("ship") || status.includes("verzonden")) return "bg-slate-400";
    
    return "bg-blue-500";
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
              {t("planning.gantt.titlePrefix")} <span className="text-blue-600">{t("planning.gantt.titleAccent")}</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {t("planning.gantt.subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Department Selector */}
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {departments.map(dept => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            {/* View Range */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setViewMode("preset");
                  setViewRange(7);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "preset" && viewRange === 7
                    ? "bg-blue-500 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t("planning.gantt.rangeWeek")}
              </button>
              <button
                onClick={() => {
                  setViewMode("preset");
                  setViewRange(14);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "preset" && viewRange === 14
                    ? "bg-blue-500 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t("planning.gantt.rangeTwoWeeks")}
              </button>
              <button
                onClick={() => {
                  setViewMode("preset");
                  setViewRange(30);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "preset" && viewRange === 30
                    ? "bg-blue-500 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t("planning.gantt.rangeMonth")}
              </button>
              <button
                onClick={() => setViewMode("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "all"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t("planning.gantt.rangeAllView")}
              </button>
            </div>

            {/* Zoom */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setDayWidth(60)}
                className={`px-2 py-1 rounded text-[10px] font-bold ${dayWidth === 60 ? "bg-white text-blue-600" : "text-slate-600"}`}
              >
                {t("planning.gantt.zoomCompact")}
              </button>
              <button
                onClick={() => setDayWidth(80)}
                className={`px-2 py-1 rounded text-[10px] font-bold ${dayWidth === 80 ? "bg-white text-blue-600" : "text-slate-600"}`}
              >
                {t("planning.gantt.zoomNormal")}
              </button>
              <button
                onClick={() => setDayWidth(120)}
                className={`px-2 py-1 rounded text-[10px] font-bold ${dayWidth === 120 ? "bg-white text-blue-600" : "text-slate-600"}`}
              >
                {t("planning.gantt.zoomDetail")}
              </button>
            </div>

            {/* Machine controls */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={expandAllMachines}
                className="px-2 py-1 rounded text-[10px] font-bold text-slate-700 hover:bg-white"
              >
                {t("planning.gantt.expandAll")}
              </button>
              <button
                onClick={collapseAllMachines}
                className="px-2 py-1 rounded text-[10px] font-bold text-slate-700 hover:bg-white"
              >
                {t("planning.gantt.collapseAll")}
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
                {t("planning.gantt.today")}
              </button>
              <button
                onClick={goToNextWeek}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {viewMode === "all" && (
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg">
                {t("planning.gantt.visibleDays", { count: Math.min(35, visibleDaysCount), max: 35 })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Gantt Chart */}
      <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 overflow-hidden">
        <div
          ref={timelineScrollRef}
          className={`overflow-x-auto select-none ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
          onMouseDown={handleTimelinePanStart}
          onWheel={handleTimelineWheel}
        >
          <div style={{ minWidth: `${192 + timelineWidth}px` }}>
            {/* Timeline Header */}
            <div className="flex border-b-2 border-slate-200 bg-slate-50">
              {/* Machine Column */}
              <div className="w-48 flex-shrink-0 p-4 border-r-2 border-slate-200 font-bold text-sm text-slate-700 sticky left-0 z-20 bg-slate-50">
                {t("planning.gantt.machine")}
              </div>

              {/* Days */}
              <div className="flex gantt-header-strip" style={{ width: `${timelineWidth}px` }} onMouseDown={handleTimelinePanStart}>
                {timelineDays.map((day, idx) => (
                  <div
                    key={idx}
                    className={`flex-shrink-0 border-r border-slate-200 p-2 text-center ${
                      isToday(day) ? "bg-blue-50" : ""
                    }`}
                    style={{ width: `${effectiveDayWidth}px` }}
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

            {/* Gantt Rows */}
            <div className="max-h-[600px] overflow-y-auto">
              {visibleMachines.map((machine, idx) => {
                const machineOrders = getOrdersForMachine(machine);
                const { laidOutBars, rowHeight } = getMachineLayout(machineOrders);
                const isCollapsed = collapsedMachines.has(machine);

                return (
                  <div
                    key={machine}
                    className={`flex border-b border-slate-200 hover:bg-slate-50 transition-colors ${
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                    }`}
                  >
                    {/* Machine Name */}
                    <div className={`w-48 flex-shrink-0 p-4 border-r-2 border-slate-200 sticky left-0 z-10 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                      <button
                        onClick={() => toggleMachineCollapsed(machine)}
                        className="w-full flex items-center justify-between text-left"
                      >
                        <div>
                          <div className="font-bold text-sm text-slate-800">{machine}</div>
                          <div className="text-xs text-slate-500 mt-1">
                            {t("planning.gantt.ordersCount", { count: machineOrders.length })}
                          </div>
                        </div>
                        <span className="text-slate-500">
                          {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                        </span>
                      </button>
                    </div>

                    {/* Timeline */}
                    <div className="relative overflow-hidden" style={{ width: `${timelineWidth}px`, height: `${isCollapsed ? 44 : rowHeight}px` }}>
                      {/* Day Grid Lines */}
                      {timelineDays.map((day, dayIdx) => (
                        <div
                          key={dayIdx}
                          className={`absolute top-0 h-full border-r ${
                            isToday(day) ? "border-blue-300 bg-blue-50/30" : "border-slate-100"
                          }`}
                          style={{ left: `${dayIdx * effectiveDayWidth}px`, width: `${effectiveDayWidth}px` }}
                        />
                      ))}

                      {/* Today Line */}
                      {timelineDays.some((day) => isToday(day)) && (
                        <div
                          className="absolute top-0 h-full w-0.5 bg-blue-500 z-[5]"
                          style={{ left: `${timelineDays.findIndex((day) => isToday(day)) * effectiveDayWidth}px` }}
                        />
                      )}

                      {/* Orders */}
                      {!isCollapsed && laidOutBars.map(({ order, style, lane }) => {
                        const { _totalHours, _isEfficiencyBased, _startDate, _endDate, _leadWeeks, leftPx, widthPx, ...restStyle } = style || {};
                        const cssStyle = {
                          ...restStyle,
                          left: `${leftPx}px`,
                          width: `${widthPx}px`,
                          top: `${lane * 26 + 4}px`,
                        };

                        return (
                          <div
                            key={order.id}
                            onMouseDown={(e) => handleDragStart(e, order)}
                            className={`gantt-order-bar absolute ${getOrderColor(order)} rounded-lg p-2 shadow-md hover:shadow-lg transition-shadow cursor-pointer group`}
                            style={cssStyle}
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
                              <div>{t("planning.gantt.tooltipItem")}: {order.itemCode || order.extraCode}</div>
                              <div>{t("planning.gantt.tooltipQuantity")}: {order.plan} {t("planning.gantt.pieces")}</div>
                              <div>
                                {t("planning.gantt.tooltipTime")}: {Math.round(_totalHours * 10) / 10}u
                                {_isEfficiencyBased && <span className="text-emerald-300 ml-1 font-bold">(LN)</span>}
                              </div>
                              <div>{t("planning.gantt.tooltipMachine")}: {order.machine}</div>
                              {_startDate && <div>{t("planning.gantt.tooltipFrom")}: {format(_startDate, 'dd-MM-yyyy')}</div>}
                              {_endDate && <div>{t("planning.gantt.tooltipTo")}: {format(_endDate, 'dd-MM-yyyy')}</div>}
                              <div>{t("planning.gantt.tooltipLeadTime")}: {_leadWeeks} {t("planning.gantt.weeks")}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 bg-white rounded-2xl p-4 shadow-sm border-2 border-slate-200">
        <div className="flex items-center gap-6">
          <span className="text-sm font-bold text-slate-700">{t("planning.gantt.status")}</span>
          {[
            { status: "planned", label: t("planning.gantt.statusPlanned"), color: "bg-blue-500" },
            { status: "in_production", label: t("planning.gantt.statusInProduction"), color: "bg-orange-500" },
            { status: "quality_check", label: t("planning.gantt.statusQualityCheck"), color: "bg-purple-500" }
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
