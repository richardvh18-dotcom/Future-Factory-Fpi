import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Lock, Unlock } from "lucide-react";
import { collection, collectionGroup, onSnapshot, doc } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { updateOrderPlannedDate } from "../../services/planningSecurityService";
import { format, startOfMonth, startOfWeek, eachDayOfInterval, addDays, addMonths, subDays, subMonths, differenceInDays, differenceInCalendarDays, differenceInCalendarWeeks, startOfDay, isToday } from "date-fns";
import { nl } from "date-fns/locale";
import { getDeliveryPlanningState, resolveDeliveryDate, toDateSafe } from "../../utils/dateUtils";
import { getOrderFinishedUnits } from "../../utils/planningProgress";
import { subscribeScopedEfficiencyHours } from "../../utils/efficiencyScopedReader";
import { normalizeMachine } from "../../utils/hubHelpers.tsx";
/**
 * GanttChartView - Timeline visualization for order planning
 * Shows orders on a timeline per machine/department
 */
const GanttChartView = (props = {}) => {
    const { planningOrders = null, trackedProducts = null, } = props || {};
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
    const [selectedMachine, setSelectedMachine] = useState("ALLES");
    const [selectedStatus, setSelectedStatus] = useState("all");
    const [orderSearchTerm, setOrderSearchTerm] = useState("");
    const [dragUnlocked, setDragUnlocked] = useState(false);
    const [factoryConfig, setFactoryConfig] = useState(null);
    const [departments, setDepartments] = useState(["ALLES"]);
    const [collapsedMachines, setCollapsedMachines] = useState(new Set());
    const [expandedLaneMode, setExpandedLaneMode] = useState(false);
    const [selectedOrderBarId, setSelectedOrderBarId] = useState(null);
    const [selectedOrderPopup, setSelectedOrderPopup] = useState(null);
    const timelineScrollRef = useRef(null);
    const isAutoExtendingRef = useRef(false);
    const pendingPrependOffsetRef = useRef(0);
    const pendingScrollToDayRef = useRef(null);
    const headerPanRef = useRef({ active: false, startX: 0, startScrollLeft: 0 });
    const headerPanCooldownUntilRef = useRef(0);
    const edgeExtendLockRef = useRef({ left: false, right: false });
    const [timelineViewportWidth, setTimelineViewportWidth] = useState(1200);
    const initializedViewRef = useRef(false);
    const useProvidedOrders = Array.isArray(planningOrders);
    const useProvidedTrackedProducts = Array.isArray(trackedProducts);
    const orders = useMemo(() => (useProvidedOrders ? planningOrders : liveOrders), [useProvidedOrders, planningOrders, liveOrders]);
    const tracking = useMemo(() => (useProvidedTrackedProducts ? trackedProducts : liveTrackedProducts), [useProvidedTrackedProducts, trackedProducts, liveTrackedProducts]);
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
        return toDateSafe(dateInput);
    };
    useEffect(() => {
        if (!readPaths)
            return;
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
        if (!readPaths)
            return;
        if (useProvidedOrders) {
            setLoading(false);
            return undefined;
        }
        let rootOrders = [];
        let scopedOrders = [];
        const mergeOrders = () => {
            const merged = new Map();
            [...rootOrders, ...scopedOrders].forEach((order, idx) => {
                const key = String(order.orderId || order.id || `order-${idx}`).trim();
                if (!key)
                    return;
                merged.set(key, order);
            });
            setLiveOrders(Array.from(merged.values()));
            setLoading(false);
        };
        const unsubRootOrders = onSnapshot(collection(db, ...readPaths.PLANNING), (snapshot) => {
            rootOrders = snapshot.docs.map((docSnap) => ({ id: docSnap.id, __docPath: docSnap.ref.path, ...docSnap.data() }));
            mergeOrders();
        }, () => {
            rootOrders = [];
            mergeOrders();
        });
        const unsubScopedOrders = onSnapshot(collectionGroup(db, "orders"), (snapshot) => {
            scopedOrders = snapshot.docs
                .filter((d) => {
                const path = d.ref.path || "";
                return (path.includes("/production/digital_planning/") &&
                    path.includes("/machines/") &&
                    path.includes("/orders/"));
            })
                .map((docSnap) => ({ id: docSnap.id, __docPath: docSnap.ref.path, ...docSnap.data() }));
            mergeOrders();
        }, () => {
            scopedOrders = [];
            mergeOrders();
        });
        return () => {
            unsubRootOrders();
            unsubScopedOrders();
        };
    }, [readPaths, useProvidedOrders]);
    useEffect(() => {
        if (!readPaths || useProvidedTrackedProducts)
            return undefined;
        let rootTracked = [];
        let scopedTracked = [];
        const mergeTracked = () => {
            const merged = new Map();
            [...rootTracked, ...scopedTracked].forEach((row, idx) => {
                const key = String(row.__docPath || row.id || `tracked-${idx}`).trim();
                if (!key)
                    return;
                merged.set(key, row);
            });
            setLiveTrackedProducts(Array.from(merged.values()));
        };
        const unsubRootTracking = onSnapshot(collection(db, ...readPaths.TRACKING), (snapshot) => {
            rootTracked = snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                __docPath: docSnap.ref.path,
                ...docSnap.data(),
            }));
            mergeTracked();
        }, () => {
            rootTracked = [];
            mergeTracked();
        });
        const unsubScopedTracking = onSnapshot(collectionGroup(db, "items"), (snapshot) => {
            scopedTracked = snapshot.docs
                .filter((d) => {
                const path = d.ref.path || "";
                return path.includes("/production/tracked_products/") && path.includes("/items/");
            })
                .map((docSnap) => ({
                id: docSnap.id,
                __docPath: docSnap.ref.path,
                ...docSnap.data(),
            }));
            mergeTracked();
        }, () => {
            scopedTracked = [];
            mergeTracked();
        });
        return () => {
            unsubRootTracking();
            unsubScopedTracking();
        };
    }, [readPaths, useProvidedTrackedProducts]);
    // Load efficiency/imported hours
    useEffect(() => {
        if (!readPaths)
            return;
        const unsubEfficiency = subscribeScopedEfficiencyHours({
            db,
            mode: "active",
            onData: (rows) => {
                const data = {};
                rows.forEach((row) => {
                    const key = String(row.orderId || row.id || "").trim();
                    if (!key)
                        return;
                    data[key] = row;
                });
                setEfficiencyData(data);
            },
            onError: (error) => {
                console.warn("Scoped efficiency listener failed:", error);
                setEfficiencyData({});
            },
        });
        return () => unsubEfficiency();
    }, [readPaths]);
    const machines = useMemo(() => {
        const uniqueMachines = [...new Set(orders.map((o) => normalizeMachine(o.machine)).filter(Boolean))];
        return uniqueMachines.sort();
    }, [orders]);
    // Filter machines based on selected department
    const visibleMachines = useMemo(() => {
        let filtered = machines;
        if (selectedDepartment !== "ALLES" && factoryConfig) {
            const dept = factoryConfig.departments.find(d => d.name === selectedDepartment);
            if (!dept)
                return [];
            const deptStationNames = (dept.stations || []).map(s => normalizeMachine(s.name));
            filtered = machines.filter(m => deptStationNames.includes(normalizeMachine(m)));
        }
        if (selectedMachine !== "ALLES") {
            filtered = filtered.filter((m) => normalizeMachine(m) === normalizeMachine(selectedMachine));
        }
        return filtered;
    }, [machines, selectedDepartment, selectedMachine, factoryConfig]);
    useEffect(() => {
        if (selectedMachine === "ALLES")
            return;
        if (!machines.includes(normalizeMachine(selectedMachine))) {
            setSelectedMachine("ALLES");
        }
    }, [machines, selectedMachine]);
    const normalizeMachineKey = (value) => normalizeMachine(value);
    const getOrderIdentity = (order) => String(order?.orderId || order?.id || "").trim();
    const getOrderBarIdentity = (order) => {
        const idPart = String(order?.id || "").trim();
        const orderPart = String(order?.orderId || "").trim();
        const machinePart = normalizeMachine(order?.machine || "");
        return [idPart, orderPart, machinePart].join("|");
    };
    const getPopupPosition = (clientX, clientY) => {
        const popupWidth = 320;
        const popupHeight = 260;
        const margin = 16;
        const maxLeft = Math.max(margin, window.innerWidth - popupWidth - margin);
        const maxTop = Math.max(margin, window.innerHeight - popupHeight - margin);
        return {
            left: Math.min(maxLeft, clientX + 16),
            top: Math.min(maxTop, clientY + 16),
        };
    };
    const getNumeric = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const getPlannedUnits = (order) => {
        return Math.max(0, getNumeric(order?.plan || order?.plannedQuantity || order?.quantity || order?.qty));
    };
    const getProducedUnits = (order, trackedFinishedCountByOrder) => {
        return getOrderFinishedUnits(order, { trackedFinishedCountByOrder });
    };
    const hasOrderStartedForPrediction = (order, trackedFinishedCountByOrder) => {
        const status = String(order?.status || "").toLowerCase();
        const productionStatus = status.includes("in_progress") ||
            status.includes("in production") ||
            status.includes("production") ||
            status.includes("active") ||
            status.includes("start");
        const hasActualStart = Boolean(parseDate(order?.actualStart));
        const produced = getOrderFinishedUnits(order, { trackedFinishedCountByOrder });
        const hasStartedCounter = Object.entries(order || {}).some(([key, value]) => {
            if (!String(key || "").startsWith("started_"))
                return false;
            return getNumeric(value) > 0;
        });
        return productionStatus || hasActualStart || produced > 0 || hasStartedCounter;
    };
    const getDeliveryDay = (order) => {
        const delivery = resolveDeliveryDate(order?.deliveryDate, order?.plannedDeliveryDate, order?.dueDate, order?.deadline, order?.rejectDate);
        return delivery ? startOfDay(delivery) : null;
    };
    const trackedFinishedByOrder = useMemo(() => {
        const byOrder = new Map();
        tracking.forEach((product) => {
            const orderId = String(product?.orderId || "").trim();
            if (!orderId)
                return;
            const status = String(product?.status || "").toLowerCase();
            const step = String(product?.currentStep || "").toLowerCase();
            const isFinished = status.includes("finish") ||
                status.includes("gereed") ||
                status.includes("completed") ||
                step.includes("finish");
            if (!isFinished)
                return;
            byOrder.set(orderId, (byOrder.get(orderId) || 0) + 1);
        });
        return byOrder;
    }, [tracking]);
    const getCompletedTrackedItemsForOrder = (order) => {
        const orderId = getOrderIdentity(order);
        if (!orderId)
            return [];
        return tracking.filter((product) => {
            const trackedOrderId = String(product?.orderId || "").trim();
            if (trackedOrderId !== orderId)
                return false;
            const status = String(product?.status || "").toLowerCase();
            const step = String(product?.currentStep || "").toLowerCase();
            return (status.includes("finish") ||
                status.includes("gereed") ||
                status.includes("completed") ||
                step.includes("finish"));
        });
    };
    const getOrderProductionProfile = (order) => {
        const completedItems = getCompletedTrackedItemsForOrder(order);
        if (completedItems.length === 0)
            return null;
        const dayMap = new Map();
        completedItems.forEach((item) => {
            const eventDate = parseDate(item?.timestamps?.finished) ||
                parseDate(item?.completedAt) ||
                parseDate(item?.archivedAt) ||
                parseDate(item?.updatedAt) ||
                parseDate(item?.createdAt);
            if (!eventDate)
                return;
            const day = startOfDay(eventDate);
            const key = format(day, "yyyy-MM-dd");
            dayMap.set(key, {
                day,
                count: (dayMap.get(key)?.count || 0) + 1,
            });
        });
        const sortedDays = Array.from(dayMap.values()).sort((a, b) => a.day.getTime() - b.day.getTime());
        if (sortedDays.length === 0)
            return null;
        const firstDay = sortedDays[0].day;
        const lastDay = sortedDays[sortedDays.length - 1].day;
        const spanDays = Math.max(1, differenceInCalendarDays(lastDay, firstDay) + 1);
        const totalProduced = sortedDays.reduce((sum, entry) => sum + entry.count, 0);
        const activeDays = sortedDays.length;
        return {
            totalProduced,
            firstDay,
            lastDay,
            activeDays,
            spanDays,
            avgPerCalendarDay: totalProduced / spanDays,
            avgPerActiveDay: totalProduced / activeDays,
        };
    };
    const machineThroughputPerDay = useMemo(() => {
        const now = new Date();
        const windowStart = subDays(now, 21);
        const machineStats = new Map();
        tracking.forEach((product) => {
            const machineKey = normalizeMachineKey(product?.machine || product?.originMachine || product?.currentStation || product?.lastStation);
            if (!machineKey)
                return;
            const status = String(product?.status || "").toLowerCase();
            const step = String(product?.currentStep || "").toLowerCase();
            const isFinished = status.includes("finish") ||
                status.includes("gereed") ||
                status.includes("completed") ||
                step.includes("finish");
            if (!isFinished)
                return;
            const eventDate = parseDate(product?.timestamps?.finished) ||
                parseDate(product?.updatedAt) ||
                parseDate(product?.lastUpdated) ||
                parseDate(product?.createdAt);
            if (!eventDate || eventDate < windowStart)
                return;
            const existing = machineStats.get(machineKey) || { count: 0 };
            existing.count += 1;
            machineStats.set(machineKey, existing);
        });
        const byMachine = new Map();
        machineStats.forEach((entry, machineKey) => {
            const unitsPerDay = entry.count / 21;
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
            if (!machineKey || !orderId)
                return;
            const list = groupedByMachine.get(machineKey) || [];
            list.push(order);
            groupedByMachine.set(machineKey, list);
        });
        const predictions = new Map();
        groupedByMachine.forEach((machineOrders, machineKey) => {
            const unitsPerDay = machineThroughputPerDay.get(machineKey);
            if (!unitsPerDay)
                return; // geen trackingdata voor deze machine → geen voorspelling
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
                const orderProfile = getOrderProductionProfile(order);
                const planned = getPlannedUnits(order);
                const produced = getProducedUnits(order, trackedFinishedByOrder);
                const remaining = Math.max(0, planned - produced);
                const effectiveUnitsPerDay = Math.max(0.25, orderProfile?.totalProduced >= 2
                    ? (orderProfile?.avgPerCalendarDay || unitsPerDay)
                    : unitsPerDay);
                const predictionStartDay = orderProfile?.lastDay && orderProfile.lastDay > today
                    ? orderProfile.lastDay
                    : today;
                const totalUnitsForQueue = (orderProfile ? 0 : queueAheadUnits) + remaining;
                const requiredDays = totalUnitsForQueue > 0
                    ? Math.ceil(totalUnitsForQueue / effectiveUnitsPerDay)
                    : 0;
                const predictedReadyDay = addDays(predictionStartDay, Math.max(0, requiredDays - 1));
                const deliveryDay = getDeliveryDay(order);
                const slipDays = deliveryDay
                    ? differenceInCalendarDays(predictedReadyDay, deliveryDay)
                    : 0;
                const scheduleStatus = !deliveryDay
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
                    unitsPerDay: effectiveUnitsPerDay,
                    remainingUnits: remaining,
                    predictedBy: orderProfile?.totalProduced >= 2 ? "order_history" : "machine_history",
                });
                if (!orderProfile) {
                    queueAheadUnits += remaining;
                }
            });
        });
        return predictions;
    }, [orders, machineThroughputPerDay, trackedFinishedByOrder, tracking]);
    // Bereken werkelijke doorlooptijd o.b.v. tracked producten
    function getActualOrderDuration(order, trackedItems) {
        const orderId = getOrderIdentity(order);
        const orderTracked = trackedItems.filter(t => {
            const tOrderId = String(t?.orderId || "").trim();
            return tOrderId === orderId;
        });
        if (orderTracked.length === 0)
            return null;
        // Groepeer per dag
        const dayMap = new Map();
        orderTracked.forEach(item => {
            const eventDate = parseDate(item?.timestamps?.finished) ||
                parseDate(item?.createdAt) ||
                parseDate(item?.timestamps?.started);
            if (!eventDate)
                return;
            const dayKey = format(startOfDay(eventDate), 'yyyy-MM-dd');
            dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + 1);
        });
        if (dayMap.size === 0)
            return null;
        const sortedDays = Array.from(dayMap.keys()).sort();
        const firstDay = parseDate(sortedDays[0]);
        const lastDay = parseDate(sortedDays[sortedDays.length - 1]);
        if (!firstDay || !lastDay)
            return null;
        const actualStartDay = startOfDay(firstDay);
        const actualEndDay = startOfDay(lastDay);
        const actualDays = Math.max(1, differenceInCalendarDays(actualEndDay, actualStartDay) + 1);
        const totalProduced = orderTracked.length;
        const avgPerDay = totalProduced / actualDays;
        return {
            actualStartDay,
            actualEndDay,
            actualDays,
            totalProduced,
            avgPerDay,
        };
    }
    function getOrderTimeBounds(order) {
        const deliveryDate = resolveDeliveryDate(order?.deliveryDate, order?.plannedDeliveryDate, order?.dueDate, order?.deadline, order?.rejectDate);
        const planningState = getDeliveryPlanningState(deliveryDate, {
            productionLeadDays: 21,
            finishBufferDays: 3,
        });
        const startDateRaw = order.plannedDate ||
            ((order.status === 'in_progress' || order.status === 'in_production') ? order.actualStart : null) ||
            planningState.productionStartDate;
        const startDate = parseDate(startDateRaw);
        if (!startDate)
            return null;
        let totalHours;
        const importedInfo = efficiencyData[order.orderId];
        const isEfficiencyBased = Boolean(importedInfo && importedInfo.minutesPerUnit);
        if (isEfficiencyBased) {
            const planCount = parseInt(order.plan) || 0;
            totalHours = (importedInfo.minutesPerUnit * planCount) / 60;
        }
        else {
            totalHours = parseFloat(order.estimatedHours) || 0;
            if (totalHours === 0) {
                totalHours = (parseInt(order.plan) || 0) * 0.08;
            }
        }
        const explicitDeliveryDate = deliveryDate ? parseDate(deliveryDate) : null;
        const fallbackEndDate = addDays(startDate, Math.max(1, Math.ceil(totalHours / 8)) - 1);
        const endDate = explicitDeliveryDate || fallbackEndDate;
        const startDay = startOfDay(startDate);
        const endDay = startOfDay(endDate);
        const safeEndDay = endDay < startDay ? startDay : endDay;
        // Voeg actuele duur toe (o.b.v. tracking)
        const actualDuration = getActualOrderDuration(order, tracking);
        return {
            startDay,
            endDay: safeEndDay,
            totalHours,
            isEfficiencyBased,
            leadWeeks: Math.max(1, differenceInCalendarWeeks(safeEndDay, startDay, { weekStartsOn: 1 }) + 1),
            actualDuration,
        };
    }
    const allViewBounds = useMemo(() => {
        let minStart = null;
        let maxEnd = null;
        orders.forEach((order) => {
            const bounds = getOrderTimeBounds(order);
            if (!bounds)
                return;
            if (!minStart || bounds.startDay < minStart)
                minStart = bounds.startDay;
            if (!maxEnd || bounds.endDay > maxEnd)
                maxEnd = bounds.endDay;
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
        if (viewMode !== "all")
            return dayWidth;
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
                if (prev.has(machine))
                    next.add(machine);
            });
            return next;
        });
    }, [visibleMachines]);
    useEffect(() => {
        if (!selectedOrderBarId)
            return;
        const stillExists = orders.some((order) => getOrderBarIdentity(order) === selectedOrderBarId);
        if (!stillExists) {
            setSelectedOrderBarId(null);
            setSelectedOrderPopup(null);
        }
    }, [orders, selectedOrderBarId]);
    useEffect(() => {
        if (!visibleMachines.length)
            return;
        setCollapsedMachines(new Set(visibleMachines));
    }, [selectedDepartment, selectedMachine]);
    useEffect(() => {
        if (initializedViewRef.current)
            return;
        initializedViewRef.current = true;
        const today = new Date();
        setViewMode("all");
        setViewStart(startOfDay(today));
        pendingScrollToDayRef.current = today;
    }, []);
    // Calculate timeline days
    const timelineDays = useMemo(() => {
        return eachDayOfInterval({
            start: activeViewStart,
            end: addDays(activeViewStart, activeViewRange - 1)
        });
    }, [activeViewStart, activeViewRange]);
    const timelineWidth = useMemo(() => activeViewRange * effectiveDayWidth, [activeViewRange, effectiveDayWidth]);
    useEffect(() => {
        if (!timelineScrollRef.current)
            return;
        if (pendingScrollToDayRef.current instanceof Date) {
            const targetDay = startOfDay(pendingScrollToDayRef.current);
            const dayIndex = differenceInCalendarDays(targetDay, activeViewStart);
            const left = Math.max(0, dayIndex * effectiveDayWidth - effectiveDayWidth * 2);
            timelineScrollRef.current.scrollLeft = left;
            pendingScrollToDayRef.current = null;
            return;
        }
        const pendingOffset = pendingPrependOffsetRef.current;
        if (!pendingOffset)
            return;
        timelineScrollRef.current.scrollLeft += pendingOffset;
        pendingPrependOffsetRef.current = 0;
    }, [activeViewStart, activeViewRange, effectiveDayWidth]);
    useEffect(() => {
        const updateViewportWidth = () => {
            if (!timelineScrollRef.current)
                return;
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
            const machineMatch = normalizeMachine(order.machine) === normalizeMachine(machine);
            const hasTimeBounds = Boolean(getOrderTimeBounds(order));
            const normalizedStatus = String(order?.status || "").toLowerCase();
            const isDone = normalizedStatus.includes("gereed") ||
                normalizedStatus.includes("finish") ||
                normalizedStatus.includes("complete") ||
                normalizedStatus.includes("shipped");
            if (!machineMatch ||
                !hasTimeBounds) {
                return false;
            }
            if (selectedStatus === "active" && isDone)
                return false;
            if (selectedStatus === "done" && !isDone)
                return false;
            if (!term)
                return true;
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
            if (!style)
                return null;
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
        if (useProvidedOrders || !dragUnlocked)
            return;
        e.preventDefault();
        e.stopPropagation();
        const dateToUse = order.plannedDate || ((order.status === 'in_progress' || order.status === 'in_production') ? order.actualStart : null);
        const orderDate = parseDate(dateToUse);
        if (!orderDate)
            return;
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
            if (!dragState.isDragging)
                return;
            setDragState(prev => ({ ...prev, currentX: e.clientX }));
        };
        const handleMouseUp = async (e) => {
            if (!dragState.isDragging)
                return;
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
                        await logActivity(auth.currentUser?.uid, "ORDER_DATE_MOVE", `Gantt geplande datum aangepast voor order ${dragState.orderId} naar ${newDate.toISOString().slice(0, 10)}`);
                    }
                    catch (error) {
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
            if (!headerPanRef.current.active || !timelineScrollRef.current)
                return;
            const deltaX = e.clientX - headerPanRef.current.startX;
            const PAN_SENSITIVITY = 0.9;
            timelineScrollRef.current.scrollLeft = headerPanRef.current.startScrollLeft - deltaX * PAN_SENSITIVITY;
        };
        const handleHeaderPanEnd = () => {
            if (!headerPanRef.current.active)
                return;
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
        if (e.button !== 0)
            return;
        if (!timelineScrollRef.current)
            return;
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
        if (!el)
            return;
        if (viewMode !== "preset")
            return;
        if (isAutoExtendingRef.current)
            return;
        if (headerPanRef.current.active)
            return;
        if (Date.now() < headerPanCooldownUntilRef.current)
            return;
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
            if (next.has(machine))
                next.delete(machine);
            else
                next.add(machine);
            return next;
        });
    };
    const collapseAllMachines = () => setCollapsedMachines(new Set(visibleMachines));
    const expandAllMachines = () => setCollapsedMachines(new Set());
    // Calculate order position and width
    const getOrderStyle = (order) => {
        const bounds = getOrderTimeBounds(order);
        if (!bounds)
            return null;
        const { startDay, endDay: safeEndDay, totalHours, isEfficiencyBased, leadWeeks } = bounds;
        const isDraggingThis = dragState.isDragging && dragState.orderId === order.id;
        const daysFromViewStart = differenceInDays(startDay, activeViewStart);
        let leftPx = daysFromViewStart * effectiveDayWidth;
        let zIndex = 10;
        let cursor = dragUnlocked ? 'grab' : 'default';
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
        if (!isDraggingThis && !overlapsView)
            return null;
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
        if (status.includes("plan") || status.includes("pending") || status.includes("open"))
            return "bg-blue-500";
        if (status.includes("prod") || status.includes("progress") || status.includes("active") || status.includes("start"))
            return "bg-orange-500";
        if (status.includes("check") || status.includes("qual") || status.includes("inspect"))
            return "bg-purple-500";
        if (status.includes("ready") || status.includes("compl") || status.includes("finish") || status.includes("gereed"))
            return "bg-emerald-500";
        if (status.includes("ship") || status.includes("verzonden"))
            return "bg-slate-400";
        return "bg-blue-500";
    };
    // Navigation
    const goToPreviousWeek = () => setViewStart(prev => subDays(prev, 7));
    const goToNextWeek = () => setViewStart(prev => addDays(prev, 7));
    const goToPreviousMonth = () => setViewStart(prev => subMonths(prev, 1));
    const goToNextMonth = () => setViewStart(prev => addMonths(prev, 1));
    const applyPresetViewFromToday = (days) => {
        const today = startOfDay(new Date());
        setViewMode("preset");
        setViewRange(days);
        setViewStart(today);
        pendingScrollToDayRef.current = today;
    };
    const applyAllViewFromToday = () => {
        const today = startOfDay(new Date());
        setViewMode("all");
        pendingScrollToDayRef.current = today;
    };
    const goToToday = () => {
        const today = new Date();
        setViewMode("all");
        setViewStart(startOfDay(today));
        pendingScrollToDayRef.current = today;
    };
    const dayInputValue = format(viewStart, "yyyy-MM-dd");
    const monthInputValue = format(viewStart, "yyyy-MM");
    const weekInputValue = `${format(startOfWeek(viewStart, { weekStartsOn: 1 }), "yyyy")}-W${String(differenceInCalendarWeeks(startOfWeek(viewStart, { weekStartsOn: 1 }), startOfWeek(new Date(format(viewStart, 'yyyy'), 0, 4), { weekStartsOn: 1 }), { weekStartsOn: 1 }) + 1).padStart(2, "0")}`;
    const handleDayJump = (value) => {
        if (!value)
            return;
        const next = startOfDay(new Date(`${value}T00:00:00`));
        if (!Number.isNaN(next.getTime())) {
            setViewMode("preset");
            setViewRange(7);
            setViewStart(next);
        }
    };
    const handleMonthJump = (value) => {
        if (!value)
            return;
        const [year, month] = value.split("-").map(Number);
        const next = startOfMonth(new Date(year, month - 1, 1));
        if (!Number.isNaN(next.getTime())) {
            setViewMode("preset");
            setViewRange(30);
            setViewStart(next);
        }
    };
    const handleWeekJump = (value) => {
        const match = String(value || "").match(/^(\d{4})-W(\d{2})$/);
        if (!match)
            return;
        const year = Number(match[1]);
        const week = Number(match[2]);
        const jan4 = new Date(year, 0, 4);
        const firstIsoWeek = startOfWeek(jan4, { weekStartsOn: 1 });
        const next = addDays(firstIsoWeek, (week - 1) * 7);
        if (!Number.isNaN(next.getTime())) {
            setViewMode("preset");
            setViewRange(14);
            setViewStart(next);
        }
    };
    if (loading) {
        return (_jsx("div", { className: "flex items-center justify-center p-12", children: _jsx("div", { className: "animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" }) }));
    }
    return (_jsxs("div", { className: "p-3 bg-slate-50 min-h-screen", children: [_jsx("div", { className: "bg-white rounded-xl p-3 mb-3 shadow-sm border border-slate-200", children: _jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-xl font-black text-slate-800 leading-tight", children: [t("planning.gantt.titlePrefix"), " ", _jsx("span", { className: "text-blue-600", children: t("planning.gantt.titleAccent") })] }), _jsx("p", { className: "text-xs text-slate-600", children: t("planning.gantt.subtitle") })] }), _jsxs("div", { className: "flex items-center gap-2 flex-wrap justify-end", children: [_jsx("select", { value: selectedDepartment, onChange: (e) => setSelectedDepartment(e.target.value), className: "px-2.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500", children: departments.map(dept => (_jsx("option", { value: dept, children: dept }, dept))) }), _jsxs("select", { value: selectedMachine, onChange: (e) => setSelectedMachine(e.target.value), className: "px-2.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500", children: [_jsx("option", { value: "ALLES", children: "Alle machines" }), machines.map((machine) => (_jsx("option", { value: machine, children: machine }, machine)))] }), _jsxs("select", { value: selectedStatus, onChange: (e) => setSelectedStatus(e.target.value), className: "px-2.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500", children: [_jsx("option", { value: "all", children: "Alle status" }), _jsx("option", { value: "active", children: "In behandeling" }), _jsx("option", { value: "done", children: "Gereed" })] }), _jsxs("div", { className: "relative", children: [_jsx(Search, { size: 13, className: "absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" }), _jsx("input", { type: "text", value: orderSearchTerm, onChange: (e) => setOrderSearchTerm(e.target.value), placeholder: t("planning.gantt.searchOrders", "Zoek order of item..."), className: "pl-7 pr-2.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]" })] }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("button", { onClick: () => applyPresetViewFromToday(7), className: `px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${viewMode === "preset" && viewRange === 7
                                                ? "bg-blue-500 text-white"
                                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`, children: t("planning.gantt.rangeWeek") }), _jsx("button", { onClick: () => applyPresetViewFromToday(14), className: `px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${viewMode === "preset" && viewRange === 14
                                                ? "bg-blue-500 text-white"
                                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`, children: t("planning.gantt.rangeTwoWeeks") }), _jsx("button", { onClick: () => applyPresetViewFromToday(30), className: `px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${viewMode === "preset" && viewRange === 30
                                                ? "bg-blue-500 text-white"
                                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`, children: t("planning.gantt.rangeMonth") }), _jsx("button", { onClick: applyAllViewFromToday, className: `px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${viewMode === "all"
                                                ? "bg-indigo-600 text-white"
                                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`, children: t("planning.gantt.rangeAllView") })] }), _jsxs("div", { className: "flex items-center gap-1 bg-slate-100 p-0.5 rounded-md", children: [_jsx("button", { onClick: () => setExpandedLaneMode(false), className: `px-2 py-0.5 rounded text-[10px] font-bold ${!expandedLaneMode ? "bg-white text-blue-600" : "text-slate-600"}`, children: t("planning.gantt.stackCompact", "Compact") }), _jsx("button", { onClick: () => setExpandedLaneMode(true), className: `px-2 py-0.5 rounded text-[10px] font-bold ${expandedLaneMode ? "bg-white text-blue-600" : "text-slate-600"}`, children: t("planning.gantt.stackExpanded", "Uitgeklapt") })] }), _jsxs("div", { className: "flex items-center gap-1 bg-slate-100 p-0.5 rounded-md", children: [_jsx("button", { onClick: () => setDayWidth(60), className: `px-2 py-0.5 rounded text-[10px] font-bold ${dayWidth === 60 ? "bg-white text-blue-600" : "text-slate-600"}`, children: t("planning.gantt.zoomCompact") }), _jsx("button", { onClick: () => setDayWidth(80), className: `px-2 py-0.5 rounded text-[10px] font-bold ${dayWidth === 80 ? "bg-white text-blue-600" : "text-slate-600"}`, children: t("planning.gantt.zoomNormal") }), _jsx("button", { onClick: () => setDayWidth(120), className: `px-2 py-0.5 rounded text-[10px] font-bold ${dayWidth === 120 ? "bg-white text-blue-600" : "text-slate-600"}`, children: t("planning.gantt.zoomDetail") })] }), _jsxs("div", { className: "flex items-center gap-1 bg-slate-100 p-0.5 rounded-md", children: [_jsx("button", { onClick: expandAllMachines, className: "px-2 py-0.5 rounded text-[10px] font-bold text-slate-700 hover:bg-white", children: t("planning.gantt.expandAll") }), _jsx("button", { onClick: collapseAllMachines, className: "px-2 py-0.5 rounded text-[10px] font-bold text-slate-700 hover:bg-white", children: t("planning.gantt.collapseAll") })] }), _jsxs("button", { onClick: () => setDragUnlocked((prev) => !prev), className: `flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${dragUnlocked
                                        ? "bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200"
                                        : "bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200"}`, title: dragUnlocked ? "Verslepen uitschakelen" : "Verslepen inschakelen", children: [dragUnlocked ? _jsx(Unlock, { size: 14 }) : _jsx(Lock, { size: 14 }), dragUnlocked ? "Unlock" : "Lock"] }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("input", { type: "date", value: dayInputValue, onChange: (e) => handleDayJump(e.target.value), className: "px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-bold text-slate-700", title: "Spring naar dag" }), _jsx("input", { type: "week", value: weekInputValue, onChange: (e) => handleWeekJump(e.target.value), className: "px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-bold text-slate-700", title: "Spring naar week" }), _jsx("input", { type: "month", value: monthInputValue, onChange: (e) => handleMonthJump(e.target.value), className: "px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-bold text-slate-700", title: "Spring naar maand" }), _jsx("button", { onClick: goToPreviousMonth, className: "px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-bold transition-colors", children: t("planning.gantt.prevMonth", "-1 Maand") }), _jsx("button", { onClick: goToPreviousWeek, className: "p-1.5 hover:bg-slate-100 rounded-md transition-colors", children: _jsx(ChevronLeft, { size: 16 }) }), _jsx("button", { onClick: goToToday, className: "px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md text-[11px] font-bold transition-colors", children: t("planning.gantt.today") }), _jsx("button", { onClick: goToNextWeek, className: "p-1.5 hover:bg-slate-100 rounded-md transition-colors", children: _jsx(ChevronRight, { size: 16 }) }), _jsx("button", { onClick: goToNextMonth, className: "px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-bold transition-colors", children: t("planning.gantt.nextMonth", "+1 Maand") })] }), viewMode === "all" && (_jsx("div", { className: "text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 px-2.5 py-1 rounded-md", children: t("planning.gantt.visibleDays", { count: Math.min(35, visibleDaysCount), max: 35 }) }))] })] }) }), _jsx("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200 overflow-hidden", children: _jsx("div", { ref: timelineScrollRef, className: "overflow-y-auto overflow-x-auto max-h-[600px] select-none", onScroll: handleTimelineScroll, children: _jsxs("div", { style: { minWidth: `${192 + timelineWidth}px` }, children: [_jsxs("div", { className: "flex border-b-2 border-slate-200 bg-slate-50 sticky top-0 z-30", children: [_jsx("div", { className: "w-48 flex-shrink-0 p-2.5 border-r-2 border-slate-200 font-bold text-xs text-slate-700 sticky left-0 z-50 bg-slate-50 shadow-[2px_0_0_0_rgba(226,232,240,1)]", children: t("planning.gantt.machine") }), _jsx("div", { className: "flex gantt-header-strip cursor-grab active:cursor-grabbing", style: { width: `${timelineWidth}px` }, onMouseDown: handleHeaderPanStart, children: timelineDays.map((day, idx) => (_jsxs("div", { className: `flex-shrink-0 border-r border-slate-200 p-1 text-center ${isToday(day) ? "bg-blue-50" : ""}`, style: { width: `${effectiveDayWidth}px` }, children: [_jsx("div", { className: `text-xs font-bold ${isToday(day) ? "text-blue-600" : "text-slate-700"}`, children: format(day, 'EEE', { locale: nl }) }), _jsx("div", { className: `text-base font-black ${isToday(day) ? "text-blue-600" : "text-slate-800"}`, children: format(day, 'd') }), _jsx("div", { className: "text-[10px] text-slate-500", children: format(day, 'MMM', { locale: nl }) })] }, idx))) })] }), _jsx("div", { children: visibleMachines.map((machine, idx) => {
                                    const machineOrders = getOrdersForMachine(machine);
                                    const { laidOutBars, rowHeight } = getMachineLayout(machineOrders);
                                    const isCollapsed = collapsedMachines.has(machine);
                                    return (_jsxs("div", { className: `flex border-b border-slate-200 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`, children: [_jsx("div", { className: `w-48 flex-shrink-0 p-4 border-r-2 border-slate-200 sticky left-0 z-40 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50"} shadow-[2px_0_0_0_rgba(226,232,240,1)]`, children: _jsxs("button", { onClick: () => toggleMachineCollapsed(machine), className: "w-full flex items-center justify-between text-left", children: [_jsxs("div", { children: [_jsx("div", { className: "font-bold text-sm text-slate-800", children: machine }), _jsx("div", { className: "text-xs text-slate-500 mt-1", children: t("planning.gantt.ordersCount", { count: machineOrders.length }) })] }), _jsx("span", { className: "text-slate-500", children: isCollapsed ? _jsx(ChevronDown, { size: 16 }) : _jsx(ChevronUp, { size: 16 }) })] }) }), _jsxs("div", { className: "relative", style: { width: `${timelineWidth}px`, height: `${isCollapsed ? 44 : rowHeight}px` }, children: [timelineDays.map((day, dayIdx) => (_jsx("div", { className: `absolute top-0 h-full border-r ${isToday(day) ? "border-blue-300 bg-blue-50/30" : "border-slate-100"}`, style: { left: `${dayIdx * effectiveDayWidth}px`, width: `${effectiveDayWidth}px` } }, dayIdx))), timelineDays.some((day) => isToday(day)) && (_jsx("div", { className: "absolute top-0 h-full w-0.5 bg-blue-500 z-[5]", style: { left: `${timelineDays.findIndex((day) => isToday(day)) * effectiveDayWidth}px` } })), !isCollapsed && (() => {
                                                        // Maak index-map van datum naar pixel-positie
                                                        const dayIndexMap = new Map();
                                                        timelineDays.forEach((day, idx) => {
                                                            const dayKey = format(day, 'yyyy-MM-dd');
                                                            dayIndexMap.set(dayKey, idx);
                                                        });
                                                        return laidOutBars.map(({ order, style, lane }) => {
                                                            const { _totalHours, _isEfficiencyBased, _startDate, _endDate, _leadWeeks, leftPx, widthPx, ...restStyle } = style || {};
                                                            const stableOrderSelectionId = getOrderBarIdentity(order);
                                                            const isSelectedBar = selectedOrderBarId === stableOrderSelectionId;
                                                            const prediction = orderPredictionMap.get(getOrderIdentity(order));
                                                            const predictedDateLabel = prediction?.predictedReadyDay
                                                                ? format(prediction.predictedReadyDay, "dd-MM")
                                                                : "--";
                                                            const scheduleLabel = prediction?.scheduleStatus === "behind"
                                                                ? t("planning.gantt.scheduleBehind", "Achter op schema")
                                                                : prediction?.scheduleStatus === "ahead"
                                                                    ? t("planning.gantt.scheduleAhead", "Voor op schema")
                                                                    : prediction?.scheduleStatus === "on_time"
                                                                        ? t("planning.gantt.scheduleOnTime", "Op schema")
                                                                        : t("planning.gantt.scheduleUnknown", "Onbekend");
                                                            const scheduleClass = prediction?.scheduleStatus === "behind"
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
                                                            const productLabel = String(order.itemDescription || order.item || order.itemCode || "").trim();
                                                            const orderWithProductLabel = [
                                                                order.orderId || "-",
                                                                productLabel,
                                                            ]
                                                                .filter(Boolean)
                                                                .join(" - ");
                                                            let actualBarColor = getOrderColor(order);
                                                            const bounds = getOrderTimeBounds(order);
                                                            if (bounds?.actualDuration && bounds.actualDuration.actualEndDay) {
                                                                // Markeer orders die klaar zijn met groene overlay
                                                                if (bounds.actualDuration.totalProduced >= order.plan) {
                                                                    actualBarColor = "bg-emerald-600";
                                                                }
                                                            }
                                                            return (_jsxs("div", { onMouseDown: (e) => {
                                                                    handleDragStart(e, order);
                                                                }, onClick: (e) => {
                                                                    const nextId = selectedOrderBarId === stableOrderSelectionId ? null : stableOrderSelectionId;
                                                                    setSelectedOrderBarId(nextId);
                                                                    setSelectedOrderPopup(nextId
                                                                        ? {
                                                                            id: stableOrderSelectionId,
                                                                            order,
                                                                            position: getPopupPosition(e.clientX, e.clientY),
                                                                        }
                                                                        : null);
                                                                }, className: `gantt-order-bar-wrapper absolute group`, style: { ...cssStyle, width: 'auto' }, children: [_jsxs("div", { className: `gantt-order-bar absolute ${getOrderColor(order)} rounded-lg p-2 shadow-md hover:shadow-lg transition-shadow cursor-pointer ${prediction?.scheduleStatus === "behind"
                                                                            ? "ring-2 ring-rose-300"
                                                                            : prediction?.scheduleStatus === "ahead"
                                                                                ? "ring-2 ring-emerald-300"
                                                                                : ""} ${isSelectedBar ? "ring-2 ring-blue-300" : ""}`, style: { ...cssStyle, width: `${widthPx}px`, cursor: dragUnlocked ? cssStyle.cursor : 'pointer' }, children: [_jsx("div", { className: "text-white text-xs font-bold truncate", children: orderWithProductLabel }), _jsxs("div", { className: "text-white text-xs opacity-90", children: [(order.itemCode || order.item || "-"), " \u00B7 ", getProducedUnits(order, trackedFinishedByOrder), "/", order.plan, " stuks"] }), _jsx("div", { className: "text-white/90 text-[10px] truncate", children: order.itemDescription || order.item || "" }), prediction && (_jsxs("div", { className: `text-[10px] font-bold truncate ${scheduleClass}`, children: [t("planning.gantt.predictedReady", "AI gereed"), ": ", predictedDateLabel] }))] }), bounds?.actualDuration && isSelectedBar && (_jsx("div", { className: "absolute bg-emerald-500 opacity-80 rounded-b-lg", style: {
                                                                            left: 0,
                                                                            top: '100%',
                                                                            width: `${widthPx}px`,
                                                                            height: '3px',
                                                                            marginTop: '-1px',
                                                                        }, title: `Werkelijk: ${bounds.actualDuration.actualDays} dagen, ${bounds.actualDuration.totalProduced} stuks` }))] }, stableOrderSelectionId || `${order?.id || "order"}-${lane}`));
                                                        });
                                                    })()] })] }, machine));
                                }) })] }) }) }), selectedOrderPopup?.order && (() => {
                const order = selectedOrderPopup.order;
                const stableOrderSelectionId = getOrderBarIdentity(order);
                const prediction = orderPredictionMap.get(getOrderIdentity(order));
                const bounds = getOrderTimeBounds(order);
                const scheduleLabel = prediction?.scheduleStatus === "behind"
                    ? t("planning.gantt.scheduleBehind", "Achter op schema")
                    : prediction?.scheduleStatus === "ahead"
                        ? t("planning.gantt.scheduleAhead", "Voor op schema")
                        : prediction?.scheduleStatus === "on_time"
                            ? t("planning.gantt.scheduleOnTime", "Op schema")
                            : t("planning.gantt.scheduleUnknown", "Onbekend");
                if (selectedOrderBarId !== stableOrderSelectionId)
                    return null;
                return (_jsxs("div", { className: "fixed z-[140] w-[320px] rounded-xl bg-slate-900 text-white p-3 shadow-2xl text-xs", style: {
                        left: `${selectedOrderPopup.position.left}px`,
                        top: `${selectedOrderPopup.position.top}px`,
                    }, children: [_jsxs("div", { className: "flex items-start justify-between gap-3 mb-2", children: [_jsx("div", { className: "font-bold", children: order.orderId || order.item }), _jsx("button", { type: "button", onClick: () => {
                                        setSelectedOrderBarId(null);
                                        setSelectedOrderPopup(null);
                                    }, className: "text-slate-300 hover:text-white font-bold", children: "x" })] }), _jsxs("div", { children: [t("planning.gantt.tooltipItem"), ": ", order.itemCode || "-"] }), _jsxs("div", { children: [t("planning.gantt.tooltipProduct", "Product"), ": ", order.itemDescription || order.item || "-"] }), _jsxs("div", { children: [t("planning.gantt.tooltipQuantity"), ": ", order.plan, " ", t("planning.gantt.pieces")] }), _jsxs("div", { children: [t("planning.gantt.tooltipProduced", "Gemaakt"), ": ", getProducedUnits(order, trackedFinishedByOrder), " / ", order.plan, " ", t("planning.gantt.pieces")] }), _jsxs("div", { children: [t("planning.gantt.tooltipMachine"), ": ", order.machine] }), bounds && (_jsxs(_Fragment, { children: [_jsxs("div", { children: [t("planning.gantt.tooltipTime"), ": ", Math.round((bounds.totalHours || 0) * 10) / 10, "u", bounds.isEfficiencyBased && _jsx("span", { className: "text-emerald-300 ml-1 font-bold", children: "(LN)" })] }), bounds.startDay && _jsxs("div", { children: [t("planning.gantt.tooltipFrom"), ": ", format(bounds.startDay, 'dd-MM-yyyy')] }), bounds.endDay && _jsxs("div", { children: [t("planning.gantt.tooltipTo"), ": ", format(bounds.endDay, 'dd-MM-yyyy')] }), _jsxs("div", { children: [t("planning.gantt.tooltipLeadTime"), ": ", bounds.leadWeeks, " ", t("planning.gantt.weeks")] })] })), bounds?.actualDuration && (_jsxs("div", { className: "border-t border-emerald-400 pt-2 mt-2", children: [_jsx("div", { className: "font-bold text-emerald-400", children: "Werkelijke duur:" }), _jsxs("div", { children: [bounds.actualDuration.actualDays, " dagen (", Math.round(bounds.actualDuration.actualDays / 7 * 10) / 10, " wk)"] }), _jsxs("div", { children: [bounds.actualDuration.totalProduced, " stuks, ~", Math.round(bounds.actualDuration.avgPerDay * 10) / 10, "/dag"] })] })), prediction && (_jsxs("div", { className: "border-t border-slate-700 pt-2 mt-2 space-y-1", children: [_jsxs("div", { children: [t("planning.gantt.tooltipPredictedReady", "Voorspelde gereeddatum"), ": ", prediction.predictedReadyDay ? format(prediction.predictedReadyDay, "dd-MM-yyyy") : "--"] }), _jsxs("div", { children: [t("planning.gantt.tooltipPredictionSource", "Voorspelling op basis van"), ": ", prediction.predictedBy === "order_history"
                                            ? t("planning.gantt.predictionSourceOrderHistory", "orderhistorie")
                                            : t("planning.gantt.predictionSourceMachineHistory", "machinehistorie")] }), _jsxs("div", { children: [t("planning.gantt.tooltipSchedule", "Planningstatus"), ": ", scheduleLabel, Number.isFinite(prediction?.slipDays)
                                            ? ` (${prediction.slipDays > 0 ? "+" : ""}${prediction.slipDays}d)`
                                            : ""] }), _jsxs("div", { children: [t("planning.gantt.tooltipThroughput", "Tempo"), ": ", Math.round((prediction?.unitsPerDay || 0) * 10) / 10, " ", t("planning.gantt.pieces"), "/dag"] })] }))] }));
            })(), _jsx("div", { className: "mt-6 bg-white rounded-2xl p-4 shadow-sm border-2 border-slate-200", children: _jsxs("div", { className: "flex items-center gap-6", children: [_jsx("span", { className: "text-sm font-bold text-slate-700", children: t("planning.gantt.status") }), [
                            { status: "planned", label: t("planning.gantt.statusPlanned"), color: "bg-blue-500" },
                            { status: "in_production", label: t("planning.gantt.statusInProduction"), color: "bg-orange-500" },
                            { status: "quality_check", label: t("planning.gantt.statusQualityCheck"), color: "bg-purple-500" },
                            { status: "ready", label: t("planning.gantt.statusReady", "Gereed"), color: "bg-emerald-500" }
                        ].map(item => (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: `w-4 h-4 ${item.color} rounded` }), _jsx("span", { className: "text-xs text-slate-600", children: item.label })] }, item.status)))] }) })] }));
};
export default GanttChartView;
