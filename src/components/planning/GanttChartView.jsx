import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { 
  Search,
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { collection, onSnapshot, doc } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { updateOrderPlannedDate } from "../../services/planningSecurityService";
import { 
  format, 
  startOfMonth,
  startOfWeek, 
  eachDayOfInterval,
  addDays,
  addMonths,
  subDays,
  subMonths,
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
const GanttChartView = (props = {}) => {
  const {
    planningOrders = null,
    trackedProducts = null,
  } = props || {};
  const { t } = useTranslation();
  const readPaths = PATHS;
  const [liveOrders, setLiveOrders] = useState([]);
  const [liveTrackedProducts, setLiveTrackedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [efficiencyData, setEfficiencyData] = useState({});
  const [viewStart, setViewStart] = useState(startOfMonth(new Date()));
  const [viewRange, setViewRange] = useState(30); // days
  const [viewMode, setViewMode] = useState("preset"); // preset | all
  const [dayWidth, setDayWidth] = useState(80);
  const [selectedDepartment, setSelectedDepartment] = useState("ALLES");
  const [orderSearchTerm, setOrderSearchTerm] = useState("");
  const [factoryConfig, setFactoryConfig] = useState(null);
  const [departments, setDepartments] = useState(["ALLES"]);
  const [collapsedMachines, setCollapsedMachines] = useState(new Set());
  const [expandedLaneMode, setExpandedLaneMode] = useState(false);
  const [selectedOrderBarId, setSelectedOrderBarId] = useState(null);
  const timelineScrollRef = useRef(null);
  const isAutoExtendingRef = useRef(false);
  const pendingPrependOffsetRef = useRef(0);
  const pendingScrollToDayRef = useRef(null);
  const headerPanRef = useRef({ active: false, startX: 0, startScrollLeft: 0 });
  const headerPanCooldownUntilRef = useRef(0);
  const edgeExtendLockRef = useRef({ left: false, right: false });
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(1200);

  const useProvidedOrders = Array.isArray(planningOrders);
  const useProvidedTrackedProducts = Array.isArray(trackedProducts);

  const orders = useMemo(
    () => (useProvidedOrders ? planningOrders : liveOrders),
    [useProvidedOrders, planningOrders, liveOrders]
  );

  const tracking = useMemo(
    () => (useProvidedTrackedProducts ? trackedProducts : liveTrackedProducts),
    [useProvidedTrackedProducts, trackedProducts, liveTrackedProducts]
  );

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

    if (useProvidedOrders) {
      setLoading(false);
      return undefined;
    }

    // Load orders
    const unsubOrders = onSnapshot(
      collection(db, ...readPaths.PLANNING),
      (snapshot) => {
        const ordersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setLiveOrders(ordersData);
        setLoading(false);
      }
    );

    return () => unsubOrders();
  }, [readPaths, useProvidedOrders]);

  useEffect(() => {
    if (!readPaths || useProvidedTrackedProducts) return undefined;

    const unsubTracking = onSnapshot(
      collection(db, ...readPaths.TRACKING),
      (snapshot) => {
        const products = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setLiveTrackedProducts(products);
      }
    );

    return () => unsubTracking();
  }, [readPaths, useProvidedTrackedProducts]);

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

  const machines = useMemo(() => {
    const uniqueMachines = [...new Set(orders.map((o) => o.machine).filter(Boolean))];
    return uniqueMachines.sort();
  }, [orders]);

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

  const normalizeMachineKey = (value) =>
    String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/^40/, "");

  const getOrderIdentity = (order) =>
    String(order?.orderId || order?.id || "").trim();

  const getOrderBarIdentity = (order) => {
    const idPart = String(order?.id || "").trim();
    const orderPart = String(order?.orderId || "").trim();
    const machinePart = String(order?.machine || "").trim();
    const plannedPart = parseDate(order?.plannedDate)?.toISOString?.() || "";
    const actualPart = parseDate(order?.actualStart)?.toISOString?.() || "";
    return [idPart, orderPart, machinePart, plannedPart, actualPart].join("|");
  };

  const getNumeric = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getPlannedUnits = (order) => {
    return Math.max(
      0,
      getNumeric(order?.plan || order?.plannedQuantity || order?.quantity || order?.qty)
    );
  };

  const getProducedUnits = (order, trackedFinishedCountByOrder) => {
    const orderId = getOrderIdentity(order);
    const trackedFinished = getNumeric(trackedFinishedCountByOrder.get(orderId));
    const fromOrder = Math.max(
      getNumeric(order?.produced),
      getNumeric(order?.finishedCount),
      getNumeric(order?.finishValue),
      getNumeric(order?.wrapped),
      getNumeric(order?.completed)
    );
    return Math.max(fromOrder, trackedFinished);
  };

  const hasOrderStartedForPrediction = (order, trackedFinishedCountByOrder) => {
    const status = String(order?.status || "").toLowerCase();
    const productionStatus =
      status.includes("in_progress") ||
      status.includes("in production") ||
      status.includes("production") ||
      status.includes("active") ||
      status.includes("start");

    const hasActualStart = Boolean(parseDate(order?.actualStart));
    const produced = Math.max(
      getNumeric(order?.produced),
      getNumeric(order?.finishedCount),
      getNumeric(order?.finishValue),
      getNumeric(order?.wrapped),
      getNumeric(order?.completed),
      getNumeric(trackedFinishedCountByOrder.get(getOrderIdentity(order)))
    );

    const hasStartedCounter = Object.entries(order || {}).some(([key, value]) => {
      if (!String(key || "").startsWith("started_")) return false;
      return getNumeric(value) > 0;
    });

    return productionStatus || hasActualStart || produced > 0 || hasStartedCounter;
  };

  const getDeliveryDay = (order) => {
    const delivery = parseDate(order?.deliveryDate || order?.plannedDeliveryDate || order?.dueDate || order?.rejectDate);
    return delivery ? startOfDay(delivery) : null;
  };

  const trackedFinishedByOrder = useMemo(() => {
    const byOrder = new Map();

    tracking.forEach((product) => {
      const orderId = String(product?.orderId || "").trim();
      if (!orderId) return;

      const status = String(product?.status || "").toLowerCase();
      const step = String(product?.currentStep || "").toLowerCase();
      const isFinished =
        status.includes("finish") ||
        status.includes("gereed") ||
        status.includes("completed") ||
        step.includes("finish");

      if (!isFinished) return;
      byOrder.set(orderId, (byOrder.get(orderId) || 0) + 1);
    });

    return byOrder;
  }, [tracking]);

  const machineThroughputPerDay = useMemo(() => {
    const now = new Date();
    const windowStart = subDays(now, 14);
    const machineStats = new Map();

    tracking.forEach((product) => {
      const machineKey = normalizeMachineKey(
        product?.machine || product?.originMachine || product?.currentStation || product?.lastStation
      );
      if (!machineKey) return;

      const status = String(product?.status || "").toLowerCase();
      const step = String(product?.currentStep || "").toLowerCase();
      const isFinished =
        status.includes("finish") ||
        status.includes("gereed") ||
        status.includes("completed") ||
        step.includes("finish");
      if (!isFinished) return;

      const eventDate =
        parseDate(product?.timestamps?.finished) ||
        parseDate(product?.updatedAt) ||
        parseDate(product?.lastUpdated) ||
        parseDate(product?.createdAt);
      if (!eventDate || eventDate < windowStart) return;

      const existing = machineStats.get(machineKey) || { count: 0 };
      existing.count += 1;
      machineStats.set(machineKey, existing);
    });

    const byMachine = new Map();
    machineStats.forEach((entry, machineKey) => {
      const unitsPerDay = entry.count / 14;
      byMachine.set(machineKey, Math.max(0.5, unitsPerDay));
    });

    return byMachine;
  }, [tracking]);

  const orderPredictionMap = useMemo(() => {
    const today = startOfDay(new Date());
    const groupedByMachine = new Map();

    orders.forEach((order) => {
      const machineKey = normalizeMachineKey(order?.machine);
      const orderId = getOrderIdentity(order);
      if (!machineKey || !orderId) return;

      const list = groupedByMachine.get(machineKey) || [];
      list.push(order);
      groupedByMachine.set(machineKey, list);
    });

    const predictions = new Map();

    groupedByMachine.forEach((machineOrders, machineKey) => {
      const unitsPerDay = machineThroughputPerDay.get(machineKey);
      if (!unitsPerDay) return; // geen trackingdata voor deze machine → geen voorspelling

      const sorted = [...machineOrders].sort((a, b) => {
        const aBounds = getOrderTimeBounds(a);
        const bBounds = getOrderTimeBounds(b);
        const aDate = aBounds?.startDay || getDeliveryDay(a) || today;
        const bDate = bBounds?.startDay || getDeliveryDay(b) || today;
        return aDate.getTime() - bDate.getTime();
      });

      let queueAheadUnits = 0;

      sorted.forEach((order) => {
        if (!hasOrderStartedForPrediction(order, trackedFinishedByOrder)) {
          return;
        }

        const orderId = getOrderIdentity(order);
        const planned = getPlannedUnits(order);
        const produced = getProducedUnits(order, trackedFinishedByOrder);
        const remaining = Math.max(0, planned - produced);
        const totalUnitsForQueue = queueAheadUnits + remaining;

        const requiredDays = totalUnitsForQueue > 0
          ? Math.ceil(totalUnitsForQueue / Math.max(0.5, unitsPerDay))
          : 0;
        const predictedReadyDay = addDays(today, Math.max(0, requiredDays - 1));
        const deliveryDay = getDeliveryDay(order);
        const slipDays = deliveryDay
          ? differenceInCalendarDays(predictedReadyDay, deliveryDay)
          : 0;

        const scheduleStatus =
          !deliveryDay
            ? "unknown"
            : slipDays > 0
              ? "behind"
              : slipDays < 0
                ? "ahead"
                : "on_time";

        predictions.set(orderId, {
          predictedReadyDay,
          scheduleStatus,
          slipDays,
          unitsPerDay,
          remainingUnits: remaining,
        });

        queueAheadUnits += remaining;
      });
    });

    return predictions;
  }, [orders, machineThroughputPerDay, trackedFinishedByOrder]);

  function getOrderTimeBounds(order) {
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
  }

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
    if (!timelineScrollRef.current) return;

    if (pendingScrollToDayRef.current instanceof Date) {
      const targetDay = startOfDay(pendingScrollToDayRef.current);
      const dayIndex = differenceInCalendarDays(targetDay, activeViewStart);
      const left = Math.max(0, dayIndex * effectiveDayWidth - effectiveDayWidth * 2);
      timelineScrollRef.current.scrollLeft = left;
      pendingScrollToDayRef.current = null;
      return;
    }

    const pendingOffset = pendingPrependOffsetRef.current;
    if (!pendingOffset) return;

    timelineScrollRef.current.scrollLeft += pendingOffset;
    pendingPrependOffsetRef.current = 0;
  }, [activeViewStart, activeViewRange, effectiveDayWidth]);

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
    const term = String(orderSearchTerm || "").trim().toLowerCase();

    return orders.filter(order => {
      if (
        order.machine !== machine ||
        !(order.plannedDate || ((order.status === 'in_progress' || order.status === 'in_production') && order.actualStart))
      ) {
        return false;
      }

      if (!term) return true;

      const haystack = [
        order?.orderId,
        order?.id,
        order?.item,
        order?.itemCode,
        order?.itemDescription,
        order?.extraCode,
        order?.machine,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
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

    const laidOutBars = expandedLaneMode
      ? bars.map((bar, idx) => ({ ...bar, lane: idx }))
      : (() => {
          const laneEndPositions = [];
          return bars.map((bar) => {
            let lane = laneEndPositions.findIndex((end) => bar.leftPx >= end + 4);
            if (lane === -1) {
              lane = laneEndPositions.length;
              laneEndPositions.push(0);
            }
            laneEndPositions[lane] = bar.leftPx + bar.widthPx;
            return { ...bar, lane };
          });
        })();

    const laneCount = Math.max(1, expandedLaneMode ? bars.length : new Set(laidOutBars.map((bar) => bar.lane)).size);
    const rowHeight = Math.max(80, laneCount * 26 + 12);
    return { laidOutBars, rowHeight };
  };

  // Handle Drag Start
  const handleDragStart = (e, order) => {
    if (useProvidedOrders) return;

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
      
      // Voorkom dat kleine, onbedoelde bewegingen direct een datumverschuiving geven.
      const minDragPx = Math.max(18, effectiveDayWidth * 0.25);
      if (Math.abs(deltaX) > minDragPx) {
        const newLeft = dragState.originalLeft + deltaX;
        const daysShift = Math.round(newLeft / effectiveDayWidth);
        const newDate = addDays(activeViewStart, daysShift);
        
        if (dragState.orderId) {
          try {
            await updateOrderPlannedDate({
              orderId: dragState.orderId,
              plannedDate: newDate,
            });
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
  }, [dragState, activeViewStart, effectiveDayWidth, useProvidedOrders]);

  useEffect(() => {
    const handleHeaderPanMove = (e) => {
      if (!headerPanRef.current.active || !timelineScrollRef.current) return;
      const deltaX = e.clientX - headerPanRef.current.startX;
      const PAN_SENSITIVITY = 0.9;
      timelineScrollRef.current.scrollLeft = headerPanRef.current.startScrollLeft - deltaX * PAN_SENSITIVITY;
    };

    const handleHeaderPanEnd = () => {
      if (!headerPanRef.current.active) return;
      headerPanRef.current.active = false;
      // Voorkom directe rand-extend direct na loslaten (voelt als random sprong).
      headerPanCooldownUntilRef.current = Date.now() + 220;
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleHeaderPanMove);
    window.addEventListener("mouseup", handleHeaderPanEnd);

    return () => {
      window.removeEventListener("mousemove", handleHeaderPanMove);
      window.removeEventListener("mouseup", handleHeaderPanEnd);
    };
  }, []);

  const handleHeaderPanStart = (e) => {
    if (e.button !== 0) return;
    if (!timelineScrollRef.current) return;

    e.preventDefault();
    headerPanRef.current = {
      active: true,
      startX: e.clientX,
      startScrollLeft: timelineScrollRef.current.scrollLeft,
    };
    document.body.style.userSelect = "none";
  };

  const handleTimelineScroll = (e) => {
    const el = e.currentTarget;
    if (!el) return;
    if (viewMode !== "preset") return;
    if (isAutoExtendingRef.current) return;
    if (headerPanRef.current.active) return;
    if (Date.now() < headerPanCooldownUntilRef.current) return;

    const EDGE_THRESHOLD = 96;
    const EDGE_UNLOCK_THRESHOLD = EDGE_THRESHOLD * 3;
    const CHUNK_DAYS = 7;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);

    // Unlock rand-locks zodra de gebruiker weer voldoende wegscrollt van de rand.
    if (el.scrollLeft > EDGE_UNLOCK_THRESHOLD) {
      edgeExtendLockRef.current.left = false;
    }
    if (el.scrollLeft < maxScroll - EDGE_UNLOCK_THRESHOLD) {
      edgeExtendLockRef.current.right = false;
    }

    // Bijna aan de rechterrand: voeg een maand toe aan de rechterkant.
    if (el.scrollLeft >= maxScroll - EDGE_THRESHOLD && !edgeExtendLockRef.current.right) {
      isAutoExtendingRef.current = true;
      edgeExtendLockRef.current.right = true;
      setViewRange((prev) => prev + CHUNK_DAYS);
      window.requestAnimationFrame(() => {
        isAutoExtendingRef.current = false;
      });
      return;
    }

    // Bijna aan de linkerrand: prepend een maand en corrigeer scrollpositie.
    if (el.scrollLeft <= EDGE_THRESHOLD && !edgeExtendLockRef.current.left) {
      isAutoExtendingRef.current = true;
      edgeExtendLockRef.current.left = true;
      pendingPrependOffsetRef.current += CHUNK_DAYS * effectiveDayWidth;
      setViewStart((prev) => subDays(prev, CHUNK_DAYS));
      setViewRange((prev) => prev + CHUNK_DAYS);
      window.requestAnimationFrame(() => {
        isAutoExtendingRef.current = false;
      });
    }
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
  const goToPreviousMonth = () => setViewStart(prev => subMonths(prev, 1));
  const goToNextMonth = () => setViewStart(prev => addMonths(prev, 1));
  const goToToday = () => {
    const today = new Date();
    setViewMode("preset");
    setViewRange(30);
    setViewStart(startOfMonth(today));
    pendingScrollToDayRef.current = today;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-3 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-xl p-3 mb-3 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-slate-800 leading-tight">
              {t("planning.gantt.titlePrefix")} <span className="text-blue-600">{t("planning.gantt.titleAccent")}</span>
            </h1>
            <p className="text-xs text-slate-600">
              {t("planning.gantt.subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Department Selector */}
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="px-2.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {departments.map(dept => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={orderSearchTerm}
                onChange={(e) => setOrderSearchTerm(e.target.value)}
                placeholder={t("planning.gantt.searchOrders", "Zoek order of item...")}
                className="pl-7 pr-2.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
              />
            </div>

            {/* View Range */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setViewMode("preset");
                  setViewRange(7);
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
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
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
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
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  viewMode === "preset" && viewRange === 30
                    ? "bg-blue-500 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t("planning.gantt.rangeMonth")}
              </button>
              <button
                onClick={() => setViewMode("all")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  viewMode === "all"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t("planning.gantt.rangeAllView")}
              </button>
            </div>

            {/* Stack mode */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md">
              <button
                onClick={() => setExpandedLaneMode(false)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${!expandedLaneMode ? "bg-white text-blue-600" : "text-slate-600"}`}
              >
                {t("planning.gantt.stackCompact", "Compact")}
              </button>
              <button
                onClick={() => setExpandedLaneMode(true)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${expandedLaneMode ? "bg-white text-blue-600" : "text-slate-600"}`}
              >
                {t("planning.gantt.stackExpanded", "Uitgeklapt")}
              </button>
            </div>

            {/* Zoom */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md">
              <button
                onClick={() => setDayWidth(60)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${dayWidth === 60 ? "bg-white text-blue-600" : "text-slate-600"}`}
              >
                {t("planning.gantt.zoomCompact")}
              </button>
              <button
                onClick={() => setDayWidth(80)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${dayWidth === 80 ? "bg-white text-blue-600" : "text-slate-600"}`}
              >
                {t("planning.gantt.zoomNormal")}
              </button>
              <button
                onClick={() => setDayWidth(120)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${dayWidth === 120 ? "bg-white text-blue-600" : "text-slate-600"}`}
              >
                {t("planning.gantt.zoomDetail")}
              </button>
            </div>

            {/* Machine controls */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md">
              <button
                onClick={expandAllMachines}
                className="px-2 py-0.5 rounded text-[10px] font-bold text-slate-700 hover:bg-white"
              >
                {t("planning.gantt.expandAll")}
              </button>
              <button
                onClick={collapseAllMachines}
                className="px-2 py-0.5 rounded text-[10px] font-bold text-slate-700 hover:bg-white"
              >
                {t("planning.gantt.collapseAll")}
              </button>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={goToPreviousMonth}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-bold transition-colors"
              >
                {t("planning.gantt.prevMonth", "-1 Maand")}
              </button>
              <button
                onClick={goToPreviousWeek}
                className="p-1.5 hover:bg-slate-100 rounded-md transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={goToToday}
                className="px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md text-[11px] font-bold transition-colors"
              >
                {t("planning.gantt.today")}
              </button>
              <button
                onClick={goToNextWeek}
                className="p-1.5 hover:bg-slate-100 rounded-md transition-colors"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={goToNextMonth}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-bold transition-colors"
              >
                {t("planning.gantt.nextMonth", "+1 Maand")}
              </button>
            </div>

            {viewMode === "all" && (
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 px-2.5 py-1 rounded-md">
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
          className="overflow-y-auto overflow-x-hidden max-h-[600px] select-none"
          onScroll={handleTimelineScroll}
        >
          <div style={{ minWidth: `${192 + timelineWidth}px` }}>
            {/* Timeline Header */}
            <div className="flex border-b-2 border-slate-200 bg-slate-50 sticky top-0 z-30">
              {/* Machine Column */}
              <div className="w-48 flex-shrink-0 p-2.5 border-r-2 border-slate-200 font-bold text-xs text-slate-700 sticky left-0 z-50 bg-slate-50 shadow-[2px_0_0_0_rgba(226,232,240,1)]">
                {t("planning.gantt.machine")}
              </div>

              {/* Days */}
              <div
                className="flex gantt-header-strip cursor-grab active:cursor-grabbing"
                style={{ width: `${timelineWidth}px` }}
                onMouseDown={handleHeaderPanStart}
              >
                {timelineDays.map((day, idx) => (
                  <div
                    key={idx}
                    className={`flex-shrink-0 border-r border-slate-200 p-1 text-center ${
                      isToday(day) ? "bg-blue-50" : ""
                    }`}
                    style={{ width: `${effectiveDayWidth}px` }}
                  >
                    <div className={`text-xs font-bold ${isToday(day) ? "text-blue-600" : "text-slate-700"}`}>
                      {format(day, 'EEE', { locale: nl })}
                    </div>
                    <div className={`text-base font-black ${isToday(day) ? "text-blue-600" : "text-slate-800"}`}>
                      {format(day, 'd')}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {format(day, 'MMM', { locale: nl })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Gantt Rows */}
            <div>
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
                    <div className={`w-48 flex-shrink-0 p-4 border-r-2 border-slate-200 sticky left-0 z-40 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50"} shadow-[2px_0_0_0_rgba(226,232,240,1)]`}>
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
                    <div className="relative" style={{ width: `${timelineWidth}px`, height: `${isCollapsed ? 44 : rowHeight}px` }}>
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
                        const stableOrderSelectionId = getOrderBarIdentity(order);
                        const isSelectedBar = selectedOrderBarId === stableOrderSelectionId;
                        const prediction = orderPredictionMap.get(getOrderIdentity(order));
                        const predictedDateLabel = prediction?.predictedReadyDay
                          ? format(prediction.predictedReadyDay, "dd-MM")
                          : "--";
                        const scheduleLabel =
                          prediction?.scheduleStatus === "behind"
                            ? t("planning.gantt.scheduleBehind", "Achter op schema")
                            : prediction?.scheduleStatus === "ahead"
                              ? t("planning.gantt.scheduleAhead", "Voor op schema")
                              : prediction?.scheduleStatus === "on_time"
                                ? t("planning.gantt.scheduleOnTime", "Op schema")
                                : t("planning.gantt.scheduleUnknown", "Onbekend");
                        const scheduleClass =
                          prediction?.scheduleStatus === "behind"
                            ? "text-rose-100"
                            : prediction?.scheduleStatus === "ahead"
                              ? "text-emerald-100"
                              : "text-amber-100";
                        const cssStyle = {
                          ...restStyle,
                          left: `${leftPx}px`,
                          width: `${widthPx}px`,
                          top: `${lane * 26 + 4}px`,
                          zIndex: dragState.isDragging && dragState.orderId === order.id
                            ? 80
                            : isSelectedBar
                              ? 120
                              : 10,
                        };

                        return (
                          <div
                            key={stableOrderSelectionId || `${order?.id || "order"}-${lane}`}
                            onMouseDown={(e) => {
                              handleDragStart(e, order);
                            }}
                            onClick={() =>
                              setSelectedOrderBarId((prev) =>
                                prev === stableOrderSelectionId ? null : stableOrderSelectionId
                              )
                            }
                            className={`gantt-order-bar absolute ${getOrderColor(order)} rounded-lg p-2 shadow-md hover:shadow-lg transition-shadow cursor-pointer group ${
                              prediction?.scheduleStatus === "behind"
                                ? "ring-2 ring-rose-300"
                                : prediction?.scheduleStatus === "ahead"
                                  ? "ring-2 ring-emerald-300"
                                  : ""
                            } ${isSelectedBar ? "ring-2 ring-blue-300" : ""}`}
                            style={cssStyle}
                          >
                            <div className="text-white text-xs font-bold truncate">
                              {order.orderId || "-"}
                            </div>
                            <div className="text-white text-xs opacity-90">
                              {(order.itemCode || order.item || "-")} · {getProducedUnits(order, trackedFinishedByOrder)}/{order.plan} stuks
                            </div>
                            <div className="text-white/90 text-[10px] truncate">
                              {order.itemDescription || order.item || ""}
                            </div>
                            {prediction && (
                              <div className={`text-[10px] font-bold truncate ${scheduleClass}`}>
                                {t("planning.gantt.predictedReady", "AI gereed")}: {predictedDateLabel}
                              </div>
                            )}

                            {/* Tooltip on hover */}
                            <div className={`${isSelectedBar ? "block" : "hidden"} absolute top-full left-0 mt-2 bg-slate-900 text-white p-3 rounded-lg shadow-xl z-[90] whitespace-nowrap text-xs`}>
                              <div className="font-bold mb-1">{order.orderId || order.item}</div>
                              <div>{t("planning.gantt.tooltipItem")}: {order.itemCode || "-"}</div>
                              <div>{t("planning.gantt.tooltipProduct", "Product")}: {order.itemDescription || order.item || "-"}</div>
                              <div>{t("planning.gantt.tooltipQuantity")}: {order.plan} {t("planning.gantt.pieces")}</div>
                              <div>{t("planning.gantt.tooltipProduced", "Gemaakt")}: {getProducedUnits(order, trackedFinishedByOrder)} / {order.plan} {t("planning.gantt.pieces")}</div>
                              <div>
                                {t("planning.gantt.tooltipTime")}: {Math.round(_totalHours * 10) / 10}u
                                {_isEfficiencyBased && <span className="text-emerald-300 ml-1 font-bold">(LN)</span>}
                              </div>
                              <div>{t("planning.gantt.tooltipMachine")}: {order.machine}</div>
                              {_startDate && <div>{t("planning.gantt.tooltipFrom")}: {format(_startDate, 'dd-MM-yyyy')}</div>}
                              {_endDate && <div>{t("planning.gantt.tooltipTo")}: {format(_endDate, 'dd-MM-yyyy')}</div>}
                              <div>{t("planning.gantt.tooltipLeadTime")}: {_leadWeeks} {t("planning.gantt.weeks")}</div>
                              {prediction && (
                                <div>
                                  {t("planning.gantt.tooltipPredictedReady", "Voorspelde gereeddatum")}: {prediction.predictedReadyDay ? format(prediction.predictedReadyDay, "dd-MM-yyyy") : "--"}
                                </div>
                              )}
                              {prediction?.scheduleStatus !== "unknown" && (
                                <div>
                                  {t("planning.gantt.tooltipSchedule", "Planningstatus")}: {scheduleLabel}
                                  {Number.isFinite(prediction?.slipDays)
                                    ? ` (${prediction.slipDays > 0 ? "+" : ""}${prediction.slipDays}d)`
                                    : ""}
                                </div>
                              )}
                              {prediction && (
                                <div>
                                  {t("planning.gantt.tooltipThroughput", "Tempo")}: {Math.round((prediction?.unitsPerDay || 0) * 10) / 10} {t("planning.gantt.pieces")}/dag
                                </div>
                              )}
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
            { status: "quality_check", label: t("planning.gantt.statusQualityCheck"), color: "bg-purple-500" },
            { status: "ready", label: t("planning.gantt.statusReady", "Gereed"), color: "bg-emerald-500" }
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
