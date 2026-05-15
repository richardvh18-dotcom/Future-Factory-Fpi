import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Search, ChevronLeft, ChevronRight, Layers, FileText, ArrowLeft, PlayCircle, AlertCircle, FileImage, RefreshCw, Factory, Briefcase, PauseCircle, History, Calendar, } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { getArchiveItemsPath } from "../../../config/dbPaths";
import { manualSyncDrawings } from "../../../utils/manualSyncDrawings";
import { format, differenceInDays, startOfDay, getISOWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { toDateSafe } from "../../../utils/dateUtils";
import StatusBadge from "../common/StatusBadge";
import { useNotifications } from '../../../contexts/NotificationContext';
const TerminalPlanningView = ({ orders = [], selectedOrderId, onSelectOrder, searchTerm, onSearchChange, onDateChange, showAllWeeks, onToggleAllWeeks, targetWeekNum, productionProgressMap = {}, rejectedCountMap = {}, isBM01, onStartProduction, selectedOrder, trackedProducts = [], onViewDrawing, optimizationPanel, }) => {
    const itemRefs = useRef({});
    const { t } = useTranslation();
    // --- Helpers ---
    const parseDateSafe = (dateInput) => {
        return toDateSafe(dateInput);
    };
    const getUrgencyColor = (dateInput) => {
        const d = parseDateSafe(dateInput);
        if (!d)
            return "text-slate-400";
        const today = startOfDay(new Date());
        const deliveryDate = startOfDay(d);
        const daysUntil = differenceInDays(deliveryDate, today);
        if (daysUntil <= 7)
            return "text-red-600 font-black"; // 1 week: Rood
        if (daysUntil <= 14)
            return "text-blue-600 font-black"; // 2 weken: Blauw
        return "text-slate-600 font-bold"; // > 2 weken: Standaard
    };
    const formatDateWithWeek = (dateInput, fallback = "--") => {
        const parsedDate = parseDateSafe(dateInput);
        if (!parsedDate)
            return fallback;
        const week = String(getISOWeek(parsedDate)).padStart(2, "0");
        return `W${week}  ${format(parsedDate, "dd MMM yyyy", { locale: nl })}`;
    };
    const getOrderDisplayName = (order) => {
        // Geef voorkeur aan de Omschrijving (AH) uit LN
        return (order?.itemDescription || order?.item || order?.itemCode || t("digitalplanning.terminal.unknown_product", "Onbekend product"));
    };
    const getPriorityLevel = (order) => {
        const rawPriority = order?.priority;
        const normalizedPriority = rawPriority === true
            ? "high"
            : String(rawPriority || "").toLowerCase().trim();
        if (normalizedPriority === "immediate")
            return "immediate";
        if (normalizedPriority === "urgent")
            return "urgent";
        if (normalizedPriority === "high")
            return "high";
        if (order?.isMoved)
            return "high";
        return "normal";
    };
    const getPriorityRank = (order) => {
        const level = getPriorityLevel(order);
        if (level === "immediate")
            return 3;
        if (level === "urgent")
            return 2;
        if (level === "high")
            return 1;
        return 0;
    };
    const getPriorityBadgeStyles = (order) => {
        const level = getPriorityLevel(order);
        if (level === "immediate") {
            return {
                label: "1e Prio",
                className: "bg-rose-100 text-rose-700 border border-rose-200",
            };
        }
        if (level === "urgent") {
            return {
                label: t("digitalplanning.order_detail.urgent", "SPOED"),
                className: "bg-orange-100 text-orange-700 border border-orange-200",
            };
        }
        if (level === "high") {
            return {
                label: t("digitalplanning.terminal.priority", "Prio"),
                className: "bg-amber-100 text-amber-700 border border-amber-200",
            };
        }
        return null;
    };
    const hasLinkedDrawing = (order) => {
        const drawingValue = String(order?.drawing || "").trim();
        const drawingUrlValue = String(order?.drawingUrl || "").trim();
        return ((drawingValue !== "" && drawingValue !== "-") ||
            drawingUrlValue !== "");
    };
    const getOrderTileTintClass = (order) => {
        const matchText = [order?.itemCode, order?.item, order?.itemDescription, order?.extraCode]
            .filter(Boolean)
            .join(" ")
            .toUpperCase();
        if (matchText.includes("EMT")) {
            return "border-sky-200 bg-sky-50 hover:border-sky-300";
        }
        if (matchText.includes("CST")) {
            return "border-slate-300 bg-slate-100 hover:border-slate-400";
        }
        return "border-slate-100 bg-white hover:border-slate-200";
    };
    const getOrderTypeBadge = (order) => {
        const matchText = [order?.itemCode, order?.item, order?.itemDescription, order?.extraCode]
            .filter(Boolean)
            .join(" ")
            .toUpperCase();
        if (matchText.includes("EMT")) {
            return {
                label: "EMT",
                className: "bg-sky-100 text-sky-700 border border-sky-200",
            };
        }
        if (matchText.includes("CST")) {
            return {
                label: "CST",
                className: "bg-slate-200 text-slate-700 border border-slate-300",
            };
        }
        return null;
    };
    const sortedOrders = React.useMemo(() => {
        if (!orders)
            return [];
        return [...orders].sort((a, b) => {
            const aPriorityRank = getPriorityRank(a);
            const bPriorityRank = getPriorityRank(b);
            if (aPriorityRank !== bPriorityRank)
                return bPriorityRank - aPriorityRank;
            // Sorteer op leverdatum (AQ) voor de beste flow
            const dateA = parseDateSafe(a.plannedDeliveryDate || a.deliveryDate || a.plannedDate);
            const dateB = parseDateSafe(b.plannedDeliveryDate || b.deliveryDate || b.plannedDate);
            if (dateA && dateB)
                return dateA - dateB;
            return 0;
        });
    }, [orders]);
    const { notify } = useNotifications();
    const [isSyncing, setIsSyncing] = React.useState(false);
    const [syncProgress, setSyncProgress] = React.useState(0);
    const [missingItems, setMissingItems] = React.useState([]);
    const [showMissingModal, setShowMissingModal] = React.useState(false);
    const handleSyncDrawings = async () => {
        if (isSyncing)
            return;
        setIsSyncing(true);
        setSyncProgress(0);
        setMissingItems([]);
        setShowMissingModal(false);
        try {
            const results = await manualSyncDrawings((current, total, partialResults) => {
                const pct = total > 0 ? Math.round((current / total) * 100) : 0;
                setSyncProgress(pct);
                if (Array.isArray(partialResults)) {
                    const partialMissing = partialResults
                        .filter((r) => r && r.found === false)
                        .map((r) => r.code)
                        .filter(Boolean);
                    setMissingItems(partialMissing);
                }
            });
            const foundCount = (results || []).filter((r) => r?.found).length;
            const notFoundCodes = (results || [])
                .filter((r) => r && r.found === false)
                .map((r) => r.code)
                .filter(Boolean);
            setMissingItems(notFoundCodes);
            if (notFoundCodes.length > 0) {
                setShowMissingModal(true);
            }
            notify(t("digitalplanning.terminal.sync_ready", "Sync gereed. Matches: {{foundCount}}. Niet gevonden: {{missingCount}}.", {
                foundCount,
                missingCount: notFoundCodes.length,
            }));
        }
        catch (error) {
            console.error("Sync tekeningen mislukt:", error);
            notify(t("digitalplanning.terminal.sync_failed", "Sync mislukt: {{message}}", {
                message: error?.message || t("common.unknown", "Onbekend"),
            }));
        }
        finally {
            setIsSyncing(false);
            setSyncProgress(0);
        }
    };
    const getOrderTotalPlan = (order) => {
        const quantity = Number(order?.quantity);
        const plan = Number(order?.plan);
        const toDoQty = Number(order?.toDoQty);
        if (Number.isFinite(quantity) && quantity > 0)
            return quantity;
        if (Number.isFinite(plan) && plan > 0)
            return plan;
        if (Number.isFinite(toDoQty) && toDoQty > 0)
            return toDoQty;
        return 1;
    };
    // Bouw de orderlijst op met weekdividers wanneer alles getoond wordt
    const renderedOrderList = React.useMemo(() => {
        const now = new Date();
        const nowWeek = getISOWeek(now);
        const nowYear = now.getFullYear();
        const seenWeeks = new Set();
        const items = [];
        sortedOrders.forEach((order) => {
            const produced = Math.max(productionProgressMap[String(order.orderId || "").trim()] || 0, Number(order.trackedFinishedCount) || 0, Number(order.produced) || 0);
            const rejectedCount = rejectedCountMap[String(order.orderId || "").trim()] || 0;
            const total = getOrderTotalPlan(order);
            const deliveryDate = order.plannedDeliveryDate || order.deliveryDate;
            const displayName = getOrderDisplayName(order);
            const urgencyClass = getUrgencyColor(deliveryDate);
            const drawingLinked = hasLinkedDrawing(order);
            const priorityBadge = getPriorityBadgeStyles(order);
            const priorityLevel = getPriorityLevel(order);
            const typeTintClass = getOrderTileTintClass(order);
            const typeBadge = getOrderTypeBadge(order);
            const priorityCardClass = order.status === 'on_hold'
                ? "border-orange-300 bg-orange-50/60 opacity-70"
                : priorityLevel === "immediate"
                    ? "border-rose-400 bg-rose-50/40 hover:border-rose-500"
                    : priorityLevel === "urgent"
                        ? "border-orange-400 bg-orange-50/40 hover:border-orange-500"
                        : priorityLevel === "high"
                            ? "border-amber-400 bg-amber-50/40 hover:border-amber-500"
                            : typeTintClass;
            const isNewOrder = (() => {
                const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
                const val = order.createdAt || order.importDate;
                if (!val)
                    return false;
                const ms = typeof val?.toMillis === 'function' ? val.toMillis() : new Date(val).getTime();
                return Number.isFinite(ms) && ms > fortyEightHoursAgo;
            })();
            // Weekdivider injecteren (alleen in alles-modus)
            if (showAllWeeks) {
                const d = parseDateSafe(order.plannedDeliveryDate || order.deliveryDate || order.plannedDate);
                if (d) {
                    const week = getISOWeek(d);
                    const year = d.getFullYear();
                    const weekKey = `${year}-${week}`;
                    if (!seenWeeks.has(weekKey)) {
                        seenWeeks.add(weekKey);
                        const weekNum = String(week).padStart(2, '0');
                        const isPast = d < now;
                        const isCurrentWeek = week === nowWeek && year === nowYear;
                        items.push(_jsxs("div", { className: `flex items-center gap-3 px-1 pt-2 pb-1 ${isPast && !isCurrentWeek ? 'opacity-50' : ''}`, children: [_jsxs("div", { className: `px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${isCurrentWeek
                                        ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                                        : isPast
                                            ? 'bg-slate-200 text-slate-500'
                                            : 'bg-slate-100 text-slate-500'}`, children: ["Week ", weekNum, isCurrentWeek && _jsx("span", { className: "ml-1 opacity-70", children: " \u2022 Nu" })] }), _jsx("div", { className: "flex-1 h-px bg-slate-100" })] }, `week-${weekKey}`));
                    }
                }
            }
            items.push(_jsxs("div", { ref: (el) => (itemRefs.current[order.id] = el), onClick: () => onSelectOrder(order.id), className: `min-h-[100px] px-4 py-3 rounded-3xl border-2 transition-all flex items-center justify-between relative overflow-hidden cursor-pointer ${selectedOrderId === order.id
                    ? "bg-emerald-50 border-emerald-500 shadow-md shadow-emerald-100 translate-x-1"
                    : priorityCardClass}`, children: [isNewOrder && (_jsx("div", { className: "absolute top-0 right-0 px-4 py-1 bg-blue-500 text-white text-[9px] font-black uppercase tracking-widest rounded-bl-2xl shadow-sm z-10", children: t("digitalplanning.terminal.new_order", "Nieuw") })), _jsxs("div", { className: "flex items-center gap-4 flex-1 overflow-hidden", children: [_jsx("div", { onClick: (e) => {
                                    if (drawingLinked && onViewDrawing) {
                                        e.stopPropagation();
                                        onViewDrawing(order.drawing);
                                    }
                                }, className: `p-2.5 rounded-2xl shrink-0 transition-all ${drawingLinked
                                    ? "bg-blue-100 text-blue-600 cursor-pointer hover:bg-blue-200 active:scale-95"
                                    : "bg-slate-50 text-slate-300"}`, title: drawingLinked ? t("digitalplanning.order_detail.view_drawing", "Bekijk tekening/productkaart") : "", children: _jsx(FileImage, { size: 22 }) }), _jsxs("div", { className: "flex-1 overflow-hidden", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx("span", { className: "text-sm font-black text-slate-900", children: order.orderId }), priorityBadge && (_jsx("span", { className: `text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-wide ${priorityBadge.className}`, children: priorityBadge.label }))] }), _jsx("h4", { className: "font-black text-base leading-tight truncate uppercase text-slate-800 mb-1", children: displayName }), (order.extraCode && order.extraCode !== "-") || typeBadge ? (_jsxs("div", { className: "flex items-center gap-1.5 mb-1 flex-wrap", children: [order.extraCode && order.extraCode !== "-" && (_jsx("span", { className: "inline-block px-2.5 py-1 bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-[11px] font-black uppercase tracking-wide", children: order.extraCode })), typeBadge && (_jsx("span", { className: `inline-block px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wide ${typeBadge.className}`, children: typeBadge.label }))] })) : null, order.projectDesc && (_jsxs("p", { className: "text-[10px] font-bold text-blue-500 uppercase truncate flex items-center gap-1", children: [_jsx(Briefcase, { size: 10 }), " ", order.projectDesc] })), (order.poText || order.notes) && (_jsxs("div", { className: "mt-1.5 rounded-lg border border-amber-400 bg-amber-100 px-2 py-0.5 animate-pulse shadow-md shadow-amber-300/50", children: [_jsx("p", { className: "text-[9px] font-black uppercase tracking-wide text-amber-800", children: "PO Text" }), _jsx("p", { className: "truncate text-[10px] font-bold text-amber-900", children: order.poText || order.notes })] }))] })] }), _jsxs("div", { className: "flex flex-col items-end gap-1.5 text-right shrink-0 ml-4", children: [_jsx("div", { className: "flex items-center gap-2", children: _jsx(StatusBadge, { status: order.status }) }), _jsxs("div", { className: "flex flex-col items-end", children: [_jsxs("span", { className: "text-xs font-black text-slate-900", children: [t("digitalplanning.terminal.made", "Gemaakt"), ": ", produced, " / ", total, " ST"] }), rejectedCount > 0 && (_jsxs("span", { className: "text-[10px] font-black text-rose-600 uppercase", children: [t("status.rejected", "Afkeur"), ": ", rejectedCount] })), _jsx("span", { className: `text-xs uppercase tracking-tighter ${urgencyClass}`, children: formatDateWithWeek(deliveryDate) })] })] })] }, order.id));
        });
        return items;
    }, [sortedOrders, showAllWeeks, selectedOrderId, productionProgressMap, rejectedCountMap]);
    // Scroll selected item into view
    useEffect(() => {
        if (selectedOrderId && itemRefs.current[selectedOrderId]) {
            itemRefs.current[selectedOrderId].scrollIntoView({
                behavior: "smooth",
                block: "nearest",
            });
        }
    }, [selectedOrderId]);
    const selectedOrderTotal = selectedOrder
        ? getOrderTotalPlan(selectedOrder)
        : 0;
    const selectedOrderProduced = selectedOrder
        ? Math.max(productionProgressMap[String(selectedOrder.orderId || "").trim()] || 0, Number(selectedOrder.trackedFinishedCount) || 0, Number(selectedOrder.produced) || 0)
        : 0;
    const selectedOrderRejected = selectedOrder
        ? rejectedCountMap[String(selectedOrder.orderId || "").trim()] || 0
        : 0;
    const selectedOrderTypeBadge = selectedOrder
        ? getOrderTypeBadge(selectedOrder)
        : null;
    const activeSelectedOrderLots = React.useMemo(() => {
        const orderId = String(selectedOrder?.orderId || "").trim().toUpperCase();
        if (!orderId)
            return [];
        return Array.from(new Set(trackedProducts
            .filter((p) => String(p?.orderId || "").trim().toUpperCase() === orderId)
            .map((p) => String(p?.lotNumber || p?.id || "").trim())
            .filter(Boolean))).sort((a, b) => a.localeCompare(b));
    }, [trackedProducts, selectedOrder?.orderId]);
    const [archivedSelectedOrderLots, setArchivedSelectedOrderLots] = React.useState([]);
    useEffect(() => {
        let isMounted = true;
        const loadArchivedLots = async () => {
            const orderId = String(selectedOrder?.orderId || "").trim();
            if (!orderId) {
                if (isMounted)
                    setArchivedSelectedOrderLots([]);
                return;
            }
            const currentYear = new Date().getFullYear();
            const yearsToCheck = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4, currentYear - 5];
            const lots = new Set();
            await Promise.all(yearsToCheck.map(async (year) => {
                try {
                    const snap = await getDocs(query(collection(db, ...getArchiveItemsPath(year)), where("orderId", "==", orderId)));
                    snap.docs.forEach((docSnap) => {
                        const data = docSnap.data() || {};
                        const lot = String(data?.lotNumber || docSnap.id || "").trim();
                        if (lot)
                            lots.add(lot);
                    });
                }
                catch {
                    // Laat 1 mislukte jaarquery de rest niet blokkeren.
                }
            }));
            if (!isMounted)
                return;
            setArchivedSelectedOrderLots(Array.from(lots).sort((a, b) => a.localeCompare(b)));
        };
        loadArchivedLots();
        return () => {
            isMounted = false;
        };
    }, [selectedOrder?.orderId]);
    const selectedOrderLots = React.useMemo(() => {
        const merged = new Set([...activeSelectedOrderLots, ...archivedSelectedOrderLots]);
        return Array.from(merged).sort((a, b) => a.localeCompare(b));
    }, [activeSelectedOrderLots, archivedSelectedOrderLots]);
    const activeLotSet = React.useMemo(() => new Set(activeSelectedOrderLots.map((lot) => String(lot || "").trim())), [activeSelectedOrderLots]);
    const archivedLotSet = React.useMemo(() => new Set(archivedSelectedOrderLots.map((lot) => String(lot || "").trim())), [archivedSelectedOrderLots]);
    const selectedOrderProducedDisplay = Math.max(Number(selectedOrderProduced) || 0, selectedOrderLots.length);
    const selectedOrderEffectiveGood = Math.max(selectedOrderProducedDisplay - (Number(selectedOrderRejected) || 0), 0);
    const selectedOrderTodoDisplay = Math.max((Number(selectedOrderTotal) || 0) - selectedOrderEffectiveGood, 0);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: `w-full lg:w-7/12 p-4 md:p-6 bg-white border-r border-slate-100 flex flex-col overflow-hidden ${selectedOrderId ? "hidden lg:flex" : "flex"} text-left`, children: [_jsxs("div", { className: "mb-4 flex flex-col lg:flex-row lg:items-center gap-3", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx(Search, { className: "absolute left-4 top-1/2 -translate-y-1/2 text-slate-300", size: 18 }), _jsx("input", { type: "text", placeholder: t("digitalplanning.terminal.search_order_product_project", "Zoek order, product of project..."), className: "w-full pl-12 pr-10 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-base font-bold outline-none focus:border-blue-500 transition-all shadow-sm", value: searchTerm, onChange: (e) => onSearchChange(e.target.value) })] }), _jsxs("div", { className: "flex gap-2 shrink-0 items-center", children: [!isBM01 && !showAllWeeks && onDateChange && (_jsxs("div", { className: "flex items-center gap-1 bg-white border-2 border-slate-100 rounded-2xl shadow-sm overflow-hidden", children: [_jsx("button", { onClick: () => onDateChange('prev'), className: "px-2 py-3 text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-all", title: t("common.previousWeek", "Vorige week"), children: _jsx(ChevronLeft, { size: 16 }) }), _jsxs("button", { onClick: () => onDateChange('reset'), className: "px-4 py-3 font-black text-sm uppercase tracking-widest text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-all whitespace-nowrap", title: t("common.currentWeek", "Huidige week"), children: ["W", String(targetWeekNum).padStart(2, '0')] }), _jsx("button", { onClick: () => onDateChange('next'), className: "px-2 py-3 text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-all", title: t("common.nextWeek", "Volgende week"), children: _jsx(ChevronRight, { size: 16 }) })] })), !isBM01 && (_jsxs("button", { onClick: onToggleAllWeeks, className: `px-4 py-3 rounded-2xl border-2 transition-all font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-sm ${showAllWeeks
                                            ? "bg-slate-900 border-slate-900 text-white"
                                            : "bg-white border-slate-100 text-slate-400 hover:text-slate-600"}`, children: [_jsx(Layers, { size: 16 }), " ", showAllWeeks ? t("common.week", "Week") : t("common.all", "Alles")] })), _jsx("button", { onClick: handleSyncDrawings, disabled: isSyncing, className: "p-3 rounded-2xl border border-slate-100 bg-white text-slate-400 hover:text-blue-600 transition-all", title: isSyncing ? t("digitalplanning.terminal.sync_in_progress", "Sync bezig... {{progress}}%", { progress: syncProgress }) : t("digitalplanning.terminal.sync_drawings", "Sync tekeningen"), children: _jsx(RefreshCw, { size: 18, className: isSyncing ? "animate-spin" : "" }) }), isSyncing && (_jsxs("span", { className: "px-2 py-1 text-[10px] font-black rounded-lg bg-blue-50 text-blue-700 border border-blue-100", children: [syncProgress, "%"] }))] })] }), _jsx("div", { className: "flex-1 min-h-0 overflow-y-auto space-y-3 custom-scrollbar pr-1 pb-10", children: sortedOrders.length === 0 ? (_jsxs("div", { className: "p-20 text-center flex flex-col items-center opacity-20", children: [_jsx(Layers, { size: 60, className: "mb-4" }), _jsx("p", { className: "font-black uppercase italic tracking-widest", children: t("digitalplanning.sidebar.no_results", "Geen resultaten") })] })) : renderedOrderList })] }), _jsx("div", { className: `flex-1 p-6 md:p-8 bg-slate-50 flex flex-col overflow-y-auto custom-scrollbar ${!selectedOrderId ? "hidden lg:flex" : "flex"}`, children: selectedOrder ? (_jsxs("div", { className: "space-y-6 animate-in slide-in-from-right-4 duration-500", children: [_jsxs("div", { className: "bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden", children: [_jsx("div", { className: "absolute top-0 right-0 p-8 opacity-10", children: _jsx(Factory, { size: 120 }) }), _jsxs("div", { className: "flex justify-between items-start mb-8 relative z-10", children: [_jsxs("div", { children: [_jsx("button", { onClick: () => onSelectOrder(null), className: "lg:hidden p-2 bg-white/10 rounded-full mb-4 inline-block", children: _jsx(ArrowLeft, { size: 20 }) }), _jsx("span", { className: "text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] block mb-2", children: t("digitalplanning.order_detail.view_dossier", "Bekijk uitgebreid dossier") }), _jsx("h2", { className: "text-4xl font-black italic tracking-tighter leading-none mb-2", children: selectedOrder.orderId }), _jsx("p", { className: "text-lg font-black text-white leading-tight uppercase italic max-w-3xl", children: getOrderDisplayName(selectedOrder) }), _jsx("p", { className: "text-xs font-bold text-white/60 mt-1", children: selectedOrder.itemCode || "-" }), _jsxs("div", { className: "flex items-center gap-3 flex-wrap", children: [getPriorityBadgeStyles(selectedOrder) && (_jsx("span", { className: `px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wide ${getPriorityBadgeStyles(selectedOrder).className}`, children: getPriorityBadgeStyles(selectedOrder).label })), selectedOrderTypeBadge && (_jsx("span", { className: `px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wide ${selectedOrderTypeBadge.className}`, children: selectedOrderTypeBadge.label })), selectedOrder.extraCode && selectedOrder.extraCode !== "-" && (_jsx("span", { className: "bg-amber-400 text-amber-900 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wide", children: selectedOrder.extraCode }))] })] }), _jsx(StatusBadge, { status: selectedOrder.status })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-5 gap-6 border-t border-white/10 pt-8 relative z-10", children: [_jsxs("div", { children: [_jsx("p", { className: "text-[10px] font-black text-white/40 uppercase mb-1", children: t("digitalplanning.order_detail.delivery_date_aq", "Leverdatum (AQ)") }), _jsx("p", { className: `text-lg font-black ${getUrgencyColor(selectedOrder.plannedDeliveryDate || selectedOrder.deliveryDate)}`, children: formatDateWithWeek(selectedOrder.plannedDeliveryDate || selectedOrder.deliveryDate, t("digitalplanning.na", "N.v.t.")) })] }), _jsxs("div", { children: [_jsx("p", { className: "text-[10px] font-black text-white/40 uppercase mb-1", children: t("digitalplanning.order_detail.total_plan", "Orderhoeveelheid") }), _jsxs("p", { className: "text-lg font-black", children: [selectedOrderTotal, " ", t("digitalplanning.terminal.pieces", "stuks")] })] }), _jsxs("div", { children: [_jsx("p", { className: "text-[10px] font-black text-white/40 uppercase mb-1", children: t("digitalplanning.terminal.made", "Gemaakt") }), _jsxs("p", { className: "text-lg font-black text-blue-300", children: [selectedOrderProducedDisplay, " ", t("digitalplanning.terminal.pieces", "stuks")] })] }), _jsxs("div", { children: [_jsx("p", { className: "text-[10px] font-black text-white/40 uppercase mb-1", children: t("status.rejected", "Afkeur") }), _jsxs("p", { className: "text-lg font-black text-rose-300", children: [selectedOrderRejected, " ", t("digitalplanning.terminal.pieces", "stuks")] })] }), _jsxs("div", { children: [_jsx("p", { className: "text-[10px] font-black text-white/40 uppercase mb-1", children: t("digitalplanning.order_detail.todo_amount", "Te doen") }), _jsxs("p", { className: "text-lg font-black text-amber-300", children: [selectedOrderTodoDisplay, " ", t("digitalplanning.terminal.pieces", "stuks")] })] })] })] }), (() => {
                            const poText = String(selectedOrder.notes || selectedOrder.poText || "").trim();
                            if (!poText || poText === "-")
                                return null;
                            return (_jsxs("div", { className: "bg-amber-400 rounded-[2rem] px-6 py-4 flex items-start gap-3 shadow-md shadow-amber-100", children: [_jsx("span", { className: "text-amber-900 mt-0.5 shrink-0", children: _jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("line", { x1: "12", y1: "8", x2: "12", y2: "12" }), _jsx("line", { x1: "12", y1: "16", x2: "12.01", y2: "16" })] }) }), _jsxs("div", { children: [_jsx("p", { className: "text-[9px] font-black text-amber-900/60 uppercase tracking-widest mb-0.5", children: "PO Text / Opmerking" }), _jsx("p", { className: "text-sm font-black text-amber-900 leading-snug", children: poText })] })] }));
                        })(), !onStartProduction && (_jsxs("div", { className: "bg-white rounded-[2.5rem] p-6 border border-slate-100 shadow-sm", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsxs("h4", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2", children: [_jsx(Layers, { size: 14 }), " Lotnummers (", selectedOrderLots.length, ")"] }), _jsxs("span", { className: "text-[10px] font-bold text-slate-500 uppercase", children: ["actief ", activeSelectedOrderLots.length, " | archief ", archivedSelectedOrderLots.length] })] }), selectedOrderLots.length === 0 ? (_jsx("p", { className: "text-xs text-slate-400 italic", children: "Geen lotnummers gevonden voor deze order." })) : (_jsx("div", { className: "rounded-2xl border border-slate-200 bg-slate-50 p-3", children: _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-2", children: selectedOrderLots.map((lot) => {
                                            const lotKey = String(lot || "").trim();
                                            const isArchivedLot = archivedLotSet.has(lotKey);
                                            const isActiveLot = activeLotSet.has(lotKey);
                                            const lotClass = isArchivedLot
                                                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                                : isActiveLot
                                                    ? "border-blue-200 bg-blue-50 text-blue-900"
                                                    : "border-slate-200 bg-white text-slate-700";
                                            return (_jsx("div", { className: `px-3 py-2 rounded-xl border text-xs font-black tracking-wide ${lotClass}`, children: lot }, lot));
                                        }) }) }))] })), onStartProduction && (_jsx("div", { className: "bg-white rounded-[2.5rem] p-6 border border-slate-100 shadow-sm", children: _jsxs("div", { className: "flex flex-col gap-4", children: [selectedOrder.status === 'on_hold' ? (_jsxs("div", { className: "w-full py-6 bg-orange-100 text-orange-700 rounded-[1.5rem] font-black uppercase text-lg flex items-center justify-center gap-4 border-2 border-orange-200", children: [_jsx(PauseCircle, { size: 28 }), " ", t("digitalplanning.terminal.order_on_hold", "Order on hold")] })) : (_jsxs("button", { onClick: () => onStartProduction(true), className: "w-full py-6 bg-blue-600 text-white rounded-[1.5rem] font-black uppercase text-lg shadow-xl shadow-blue-200 hover:bg-blue-700 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center justify-center gap-4", children: [_jsx(PlayCircle, { size: 28 }), " ", t("digitalplanning.order_detail.start_production", "Start Productie")] })), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("button", { onClick: () => {
                                                    if (onViewDrawing) {
                                                        onViewDrawing(selectedOrder.drawing);
                                                    }
                                                }, className: `py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 ${selectedOrder.drawing && selectedOrder.drawing !== "-" && selectedOrder.drawing !== ""
                                                    ? "bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100"
                                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`, children: [_jsx(FileImage, { size: 16 }), " ", t("digitalplanning.order_detail.view_drawing", "Bekijk tekening/productkaart"), selectedOrder.drawing && selectedOrder.drawing !== "-" && selectedOrder.drawing !== "" && (_jsx("span", { className: "ml-1 w-2 h-2 bg-blue-500 rounded-full" }))] }), _jsxs("button", { className: "py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2", children: [_jsx(AlertCircle, { size: 16 }), " ", t("digitalplanning.terminal.quality_requirements", "Kwaliteitseisen")] })] })] }) })), _jsxs("div", { className: "bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm space-y-8", children: [_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-8", children: _jsxs("section", { className: "bg-slate-50 p-6 rounded-3xl border border-slate-100", children: [_jsx("h4", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3", children: t("digitalplanning.order_detail.project_details", "Project Details") }), _jsx("p", { className: "text-base font-black text-slate-700 uppercase", children: selectedOrder.projectDesc || t("digitalplanning.terminal.no_project_name", "Geen projectnaam") }), _jsxs("p", { className: "text-xs font-bold text-slate-400 mt-1", children: [t("digitalplanning.terminal.customer", "Klant"), ": ", selectedOrder.customer || t("common.unknown", "Onbekend")] }), selectedOrder.extraCode && selectedOrder.extraCode !== "-" && (_jsxs("p", { className: "text-xs font-bold text-slate-500 mt-1", children: ["Code: ", _jsx("span", { className: "text-amber-600 font-black", children: selectedOrder.extraCode })] }))] }) }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-8 border-t pt-8", children: _jsxs("section", { className: "bg-slate-50 p-6 rounded-3xl border border-slate-100", children: [_jsxs("h4", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2", children: [_jsx(History, { size: 14 }), " ", t("digitalplanning.order_detail.administration", "Administratie")] }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex justify-between items-center border-b border-slate-200 pb-2", children: [_jsxs("span", { className: "text-[11px] font-bold text-slate-500 uppercase", children: [t("digitalplanning.order_detail.creation_date_ln", "Aanmaakdatum LN"), ":"] }), _jsxs("span", { className: "text-sm font-black text-blue-600 flex items-center gap-2", children: [_jsx(Calendar, { size: 14 }), " ", selectedOrder.orderCreationDate || t("digitalplanning.terminal.not_available", "Niet beschikbaar")] })] }), _jsxs("div", { className: "flex justify-between items-center", children: [_jsxs("span", { className: "text-[11px] font-bold text-slate-500 uppercase", children: [t("productionStartModal.labels.drawing", "Tekening"), ":"] }), _jsx("span", { className: "text-sm font-black text-slate-700", children: selectedOrder.drawing || "-" })] })] })] }) }), optimizationPanel, onStartProduction && (_jsxs("section", { className: "bg-slate-50 p-6 rounded-3xl border border-slate-100", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsxs("h4", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2", children: [_jsx(Layers, { size: 14 }), " Lotnummers (", selectedOrderLots.length, ")"] }), _jsxs("span", { className: "text-[10px] font-bold text-slate-500 uppercase", children: ["actief ", activeSelectedOrderLots.length, " | archief ", archivedSelectedOrderLots.length] })] }), selectedOrderLots.length === 0 ? (_jsx("p", { className: "text-xs text-slate-400 italic", children: "Geen lotnummers gevonden voor deze order." })) : (_jsx("div", { className: "max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 custom-scrollbar", children: _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-2", children: selectedOrderLots.map((lot) => {
                                                    const lotKey = String(lot || "").trim();
                                                    const isArchivedLot = archivedLotSet.has(lotKey);
                                                    const isActiveLot = activeLotSet.has(lotKey);
                                                    const lotClass = isArchivedLot
                                                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                                        : isActiveLot
                                                            ? "border-blue-200 bg-blue-50 text-blue-900"
                                                            : "border-slate-200 bg-white text-slate-700";
                                                    return (_jsx("div", { className: `px-3 py-2 rounded-xl border text-xs font-black tracking-wide ${lotClass}`, children: lot }, lot));
                                                }) }) }))] }))] })] })) : (_jsxs("div", { className: "flex-1 flex flex-col items-center justify-center opacity-20", children: [_jsx("div", { className: "w-32 h-32 bg-slate-200 rounded-full flex items-center justify-center mb-6", children: _jsx(FileText, { size: 48, className: "text-slate-400" }) }), _jsx("h4", { className: "text-2xl font-black uppercase italic tracking-tighter", children: t("teamleader.select_order", "Selecteer een order uit de lijst") })] })) }), showMissingModal && (_jsx("div", { className: "fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4", children: _jsxs("div", { className: "w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h3", { className: "text-lg font-black text-slate-900 uppercase", children: t("digitalplanning.terminal.unlinked_codes", "Niet gekoppelde codes") }), _jsx("button", { type: "button", onClick: () => setShowMissingModal(false), className: "px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 font-bold text-xs uppercase", children: t("common.close", "Sluiten") })] }), _jsx("p", { className: "text-sm text-slate-600 mb-4", children: t("digitalplanning.terminal.missing_codes_description", "Deze codes zijn tijdens de sync nog niet gevonden in catalogus/conversiematrix.") }), _jsx("div", { className: "max-h-72 overflow-y-auto border border-slate-100 rounded-xl p-3 bg-slate-50", children: missingItems.length === 0 ? (_jsx("p", { className: "text-sm text-slate-500 italic", children: t("digitalplanning.terminal.all_codes_linked", "Alles gekoppeld.") })) : (_jsx("ul", { className: "space-y-1", children: missingItems.slice(0, 200).map((code, idx) => (_jsx("li", { className: "text-xs font-mono text-slate-700", children: code }, `${code}-${idx}`))) })) })] }) }))] }));
};
export default TerminalPlanningView;
