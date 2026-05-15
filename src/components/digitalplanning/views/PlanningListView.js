import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useMemo, useEffect } from "react";
import { Calendar, Search, ArrowRight, RefreshCw, Loader2, ChevronLeft, ChevronRight, ListFilter, CalendarDays, Activity, Clock, FileText, Briefcase, Layers, Info, X, Printer, ExternalLink, MapPin, } from "lucide-react";
import { format, getISOWeek, getISOWeekYear, addWeeks, subWeeks, } from "date-fns";
import { nl } from "date-fns/locale";
import { getDeliveryPlanningState, resolveDeliveryDate, toDateSafe } from "../../../utils/dateUtils";
// Importeer de centrale StatusBadge (vanuit ../common/)
import StatusBadge from "../common/StatusBadge";
import { syncMissingDrawings } from "../../../utils/planningSyncLogic";
const parseDateSafe = (dateInput) => {
    return toDateSafe(dateInput);
};
const formatDateLabel = (dateInput, pattern, options = {}, fallback = "-") => {
    const parsedDate = parseDateSafe(dateInput);
    return parsedDate ? format(parsedDate, pattern, options) : fallback;
};
const getOrderDeliveryDate = (order) => resolveDeliveryDate(order?.deliveryDate, order?.plannedDeliveryDate, order?.plannedDate, order?.date, order?.deadline);
// --- SUB-COMPONENT: DETAIL VIEW ---
const OrderDetailPane = ({ order, onClose }) => {
    if (!order)
        return null;
    return (_jsxs("div", { className: "flex flex-col h-full bg-slate-50 border-l border-slate-200 animate-in slide-in-from-right-4 duration-300", children: [_jsxs("div", { className: "bg-white p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 z-10 shadow-sm", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "p-3 bg-slate-900 text-white rounded-2xl", children: _jsx(FileText, { size: 24 }) }), _jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("h2", { className: "text-2xl font-black text-slate-900 tracking-tighter uppercase italic", children: order.orderId }), _jsx(StatusBadge, { status: order.status })] }), _jsx("p", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 text-left", children: "Gedetailleerd Order Dossier" })] })] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors", children: _jsx(X, { size: 24 }) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-left", children: [_jsxs("div", { className: "bg-white p-6 rounded-[30px] border border-slate-200 shadow-sm space-y-4", children: [_jsxs("h3", { className: "text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] flex items-center gap-2 mb-4", children: [_jsx(Briefcase, { size: 14 }), " Project Informatie"] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "p-4 bg-slate-50 rounded-2xl border border-slate-100", children: [_jsx("span", { className: "text-[9px] font-black text-slate-400 uppercase block mb-1", children: "Project ID" }), _jsx("span", { className: "text-sm font-bold text-slate-700", children: order.project || "-" })] }), _jsxs("div", { className: "p-4 bg-slate-50 rounded-2xl border border-slate-100", children: [_jsx("span", { className: "text-[9px] font-black text-slate-400 uppercase block mb-1", children: "Extra Code" }), _jsx("span", { className: "text-sm font-black text-blue-600", children: order.extraCode || "Geen" })] }), _jsxs("div", { className: "col-span-2 p-4 bg-slate-50 rounded-2xl border border-slate-100", children: [_jsx("span", { className: "text-[9px] font-black text-slate-400 uppercase block mb-1", children: "Project Omschrijving" }), _jsx("span", { className: "text-sm font-medium text-slate-600", children: order.projectDesc || "Geen project beschrijving beschikbaar." })] })] })] }), _jsxs("div", { className: "bg-slate-900 p-8 rounded-[40px] shadow-xl relative overflow-hidden text-white", children: [_jsx("div", { className: "absolute top-0 right-0 p-8 opacity-5", children: _jsx(Layers, { size: 160 }) }), _jsxs("div", { className: "relative z-10 space-y-4", children: [_jsxs("div", { children: [_jsx("span", { className: "text-[9px] font-black text-blue-400 uppercase tracking-widest block mb-2", children: "Manufactured Item Code" }), _jsx("p", { className: "text-xl font-mono font-black tracking-tight break-all text-white leading-tight", children: order.itemCode || order.productId })] }), _jsxs("div", { className: "pt-4 border-t border-white/10", children: [_jsx("span", { className: "text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1", children: "Item Beschrijving" }), _jsx("p", { className: "text-sm font-medium italic text-slate-300", children: order.item || "-" })] })] })] }), _jsxs("div", { className: "bg-white p-6 rounded-[30px] border border-slate-200 shadow-sm", children: [_jsxs("h3", { className: "text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] flex items-center gap-2 mb-6", children: [_jsx(Calendar, { size: 14 }), " Planning & Levering"] }), _jsxs("div", { className: "grid grid-cols-2 lg:grid-cols-3 gap-6", children: [_jsxs("div", { children: [_jsx("span", { className: "text-[9px] font-black text-slate-400 uppercase block mb-1", children: "Week" }), _jsxs("span", { className: "text-xl font-black text-slate-800 italic", children: ["W", order.weekNumber || "-"] })] }), _jsxs("div", { children: [_jsx("span", { className: "text-[9px] font-black text-slate-400 uppercase block mb-1", children: "Aantal" }), _jsxs("span", { className: "text-xl font-black text-slate-800 italic", children: [order.plan || 1, " ST"] })] }), _jsxs("div", { children: [_jsx("span", { className: "text-[9px] font-black text-slate-400 uppercase block mb-1", children: "Machine" }), _jsx("span", { className: "text-xl font-black text-blue-600 italic uppercase", children: order.machine || "-" })] }), _jsx("div", { className: "col-span-2 pt-4 border-t border-slate-100", children: _jsxs("div", { className: "flex justify-between items-end", children: [_jsxs("div", { children: [_jsx("span", { className: "text-[9px] font-black text-slate-400 uppercase block mb-1", children: "Uiterste Leverdatum" }), _jsx("span", { className: "text-sm font-bold text-slate-900", children: formatDateLabel(order.deliveryDate, "eeee dd MMMM yyyy", {
                                                                locale: nl,
                                                            }) })] }), _jsxs("div", { className: "text-right", children: [_jsx("span", { className: "text-[9px] font-black text-blue-500 uppercase block mb-1", children: "Geplande Start (-3w)" }), _jsx("span", { className: "text-sm font-black text-blue-600 underline underline-offset-4", children: (() => {
                                                                const deliveryDate = getOrderDeliveryDate(order);
                                                                const planningState = getDeliveryPlanningState(deliveryDate, {
                                                                    productionLeadDays: 21,
                                                                    finishBufferDays: 3,
                                                                });
                                                                return planningState.productionStartDate
                                                                    ? formatDateLabel(planningState.productionStartDate, "dd-MM-yyyy")
                                                                    : formatDateLabel(order.plannedDate, "dd-MM-yyyy");
                                                            })() })] })] }) })] })] }), (order.poText || order.notes) && (_jsxs("div", { className: "bg-amber-50 p-6 rounded-[30px] border border-amber-100 space-y-3", children: [_jsxs("h3", { className: "text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-2", children: [_jsx(Info, { size: 14 }), " PO Tekst / Instructies"] }), _jsx("p", { className: "text-sm text-amber-900 font-medium leading-relaxed italic", children: order.poText || order.notes })] })), _jsxs("div", { className: "grid grid-cols-2 gap-4 pt-4 pb-12", children: [_jsxs("button", { className: "flex items-center justify-center gap-2 py-4 bg-white border-2 border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all", children: [_jsx(Printer, { size: 16 }), " Werkbon Printen"] }), order.drawingUrl && (_jsxs("a", { href: order.drawingUrl, target: "_blank", rel: "noreferrer", className: "flex items-center justify-center gap-2 py-4 bg-blue-600 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all", children: [_jsx(MapPin, { size: 16 }), " Tekening", " ", _jsx(ExternalLink, { size: 12, className: "opacity-50" })] }))] })] })] }));
};
// --- MAIN COMPONENT ---
const PlanningListView = ({ orders = [], onSelectOrder, selectedOrder, activeTab, onTabChange, }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);
    const [showAllWeeks, setShowAllWeeks] = useState(false);
    const [referenceDate, setReferenceDate] = useState(new Date());
    const selectedWeek = getISOWeek(referenceDate);
    const selectedYear = getISOWeekYear(referenceDate);
    const appId = typeof __app_id !== "undefined" ? __app_id : "fittings-app-v1";
    // --- AUTOMATISCHE FILTER LOGICA ONDERSTEUNING ---
    // Bij Wikkelen/Lossen springt het filter op 'Alle'
    // Bij Te Doen springt het filter terug op de geselecteerde week
    useEffect(() => {
        if (activeTab === "actief" || activeTab === "lossen") {
            setShowAllWeeks(true);
        }
        else if (activeTab === "planning") {
            setShowAllWeeks(false);
        }
    }, [activeTab]);
    const getUrgencyStyles = (deliveryDate) => {
        const planningState = getDeliveryPlanningState(deliveryDate, {
            productionLeadDays: 21,
            finishBufferDays: 3,
        });
        if (planningState.state === "overdue")
            return "text-rose-700 font-black";
        if (planningState.state === "finish_due")
            return "text-red-600 font-black";
        if (planningState.state === "in_production_window")
            return "text-blue-600 font-black";
        if (planningState.state === "planned")
            return "text-slate-900 font-bold";
        return "text-slate-400";
    };
    const handleSyncDrawings = async () => {
        setIsSyncing(true);
        try {
            await syncMissingDrawings(appId);
        }
        catch (err) {
            console.error(err);
        }
        finally {
            setIsSyncing(false);
        }
    };
    const filteredOrders = useMemo(() => {
        return orders.filter((order) => {
            // DYNAMISCHE FILTER OP BASIS VAN TAB
            const targetStatus = activeTab === "planning" ? "pending" : "in_progress";
            if (order.status !== targetStatus)
                return false;
            const term = searchTerm.toLowerCase();
            const matchesSearch = (order.orderId || "").toLowerCase().includes(term) ||
                (order.itemCode || "").toLowerCase().includes(term) ||
                (order.item || "").toLowerCase().includes(term) ||
                (order.project || "").toLowerCase().includes(term);
            if (showAllWeeks)
                return matchesSearch;
            const orderWeek = order.weekNumber;
            if (orderWeek)
                return matchesSearch && orderWeek === selectedWeek;
            const d = parseDateSafe(order.plannedDate || order.deliveryDate);
            if (!d)
                return matchesSearch && searchTerm.length > 0;
            const matchesWeek = getISOWeek(d) === selectedWeek && getISOWeekYear(d) === selectedYear;
            return matchesSearch && matchesWeek;
        });
    }, [orders, searchTerm, selectedWeek, selectedYear, showAllWeeks, activeTab]);
    return (_jsxs("div", { className: "flex h-full bg-slate-50 overflow-hidden", children: [_jsxs("div", { className: `flex flex-col h-full bg-white transition-all duration-500 ${selectedOrder
                    ? "w-full lg:w-1/2 border-r border-slate-200 shadow-2xl z-20"
                    : "w-full"}`, children: [_jsxs("div", { className: "flex p-1 bg-slate-100/80 gap-1 border-b border-slate-200 shrink-0", children: [_jsx("button", { onClick: () => onTabChange("planning"), className: `flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === "planning"
                                    ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                                    : "text-slate-500"}`, children: "Te Doen" }), _jsx("button", { onClick: () => onTabChange("actief"), className: `flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === "actief"
                                    ? "bg-white text-emerald-600 shadow-sm border border-slate-200"
                                    : "text-slate-500"}`, children: "Wikkelen" }), _jsx("button", { onClick: () => onTabChange("lossen"), className: `flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === "lossen"
                                    ? "bg-white text-orange-600 shadow-sm border border-slate-200"
                                    : "text-slate-500"}`, children: "Lossen" })] }), _jsxs("div", { className: "p-4 border-b border-slate-100 space-y-4 bg-white shrink-0", children: [_jsxs("div", { className: "flex justify-between items-center bg-slate-50 p-1.5 rounded-2xl border border-slate-100", children: [_jsx("button", { onClick: () => {
                                            setReferenceDate(subWeeks(referenceDate, 1));
                                            setShowAllWeeks(false);
                                        }, className: "p-2 hover:bg-white rounded-xl text-slate-400 transition-all active:scale-90", disabled: showAllWeeks && activeTab !== "planning", children: _jsx(ChevronLeft, { size: 20 }) }), _jsxs("div", { className: "text-center px-4", children: [_jsx("span", { className: "text-[10px] font-black uppercase tracking-tighter text-slate-400 block mb-0.5", children: "Week" }), _jsx("span", { className: "text-lg font-black text-slate-800", children: showAllWeeks ? "Alle" : selectedWeek })] }), _jsx("button", { onClick: () => {
                                            setReferenceDate(addWeeks(referenceDate, 1));
                                            setShowAllWeeks(false);
                                        }, className: "p-2 hover:bg-white rounded-xl text-slate-400 transition-all active:scale-90", disabled: showAllWeeks && activeTab !== "planning", children: _jsx(ChevronRight, { size: 20 }) })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-300", size: 16 }), _jsx("input", { type: "text", placeholder: "Zoek order, project of item...", className: "w-full pl-9 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value) })] }), _jsx("button", { onClick: () => setShowAllWeeks(!showAllWeeks), className: `p-2.5 rounded-xl border transition-all ${showAllWeeks
                                            ? "bg-blue-600 text-white border-blue-600"
                                            : "bg-white text-slate-400 border-slate-200"}`, children: _jsx(ListFilter, { size: 18 }) }), _jsx("button", { onClick: handleSyncDrawings, disabled: isSyncing, className: "p-2.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 border border-indigo-100 transition-all active:scale-95", children: isSyncing ? (_jsx(Loader2, { size: 18, className: "animate-spin" })) : (_jsx(RefreshCw, { size: 18 })) })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar bg-slate-50/50", children: filteredOrders.length === 0 ? (_jsxs("div", { className: "p-12 text-center flex flex-col items-center", children: [_jsx("div", { className: "w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4", children: activeTab === "actief" ? (_jsx(Activity, { size: 24, className: "text-emerald-200" })) : (_jsx(CalendarDays, { size: 24, className: "text-slate-200" })) }), _jsx("p", { className: "text-slate-400 font-black uppercase text-[10px] tracking-widest leading-relaxed", children: "Geen orders gevonden" })] })) : (filteredOrders.map((order) => (_jsxs("div", { onClick: () => onSelectOrder && onSelectOrder(order), className: `p-5 rounded-[22px] border shadow-sm cursor-pointer transition-all group active:scale-[0.98] ${selectedOrder?.id === order.id
                                ? "bg-blue-50 border-blue-200 ring-2 ring-blue-500/10"
                                : "bg-white border-slate-200/60 hover:border-blue-400"}`, children: [_jsxs("div", { className: "flex justify-between items-start mb-3", children: [_jsxs("div", { className: "flex flex-col text-left", children: [_jsx("span", { className: "font-black text-slate-900 text-sm tracking-tight", children: order.orderId || order.orderNumber }), order.project && (_jsxs("div", { className: "flex items-center gap-1 mt-0.5 opacity-60", children: [_jsx(Briefcase, { size: 10, className: "text-slate-500" }), _jsx("span", { className: "text-[9px] font-bold text-slate-600 uppercase tracking-tighter", children: order.project })] }))] }), _jsx(StatusBadge, { status: order.status })] }), _jsx("p", { className: "text-xs font-bold text-slate-500 truncate mb-4 text-left", children: order.itemCode || order.productId }), _jsxs("div", { className: "flex items-center justify-between pt-3 border-t border-slate-50", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("span", { className: `text-[10px] uppercase tracking-widest flex items-center gap-2 ${getUrgencyStyles(getOrderDeliveryDate(order))}`, children: [_jsx(Calendar, { size: 12, className: "opacity-50" }), formatDateLabel(getDeliveryPlanningState(getOrderDeliveryDate(order), {
                                                            productionLeadDays: 21,
                                                            finishBufferDays: 3,
                                                        }).productionStartDate || order.plannedDate, "dd MMM", { locale: nl }, "Geen datum")] }), getOrderDeliveryDate(order) && (_jsxs("span", { className: "text-[9px] text-slate-300 font-bold uppercase flex items-center gap-1 border-l border-slate-100 pl-3", children: [_jsx(Clock, { size: 10 }), "E: ", formatDateLabel(getOrderDeliveryDate(order), "dd-MM")] }))] }), _jsx("div", { className: `w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-sm ${selectedOrder?.id === order.id
                                                ? "bg-blue-600 text-white"
                                                : "bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white"}`, children: _jsx(ArrowRight, { size: 14 }) })] })] }, order.id)))) })] }), _jsx("div", { className: `hidden lg:flex flex-1 h-full transition-all duration-500 ${selectedOrder
                    ? "opacity-100 translate-x-0"
                    : "opacity-0 translate-x-full absolute"}`, children: _jsx(OrderDetailPane, { order: selectedOrder, onClose: () => onSelectOrder(null) }) }), selectedOrder && (_jsx("div", { className: "fixed inset-0 z-[100] bg-white lg:hidden", children: _jsx(OrderDetailPane, { order: selectedOrder, onClose: () => onSelectOrder(null) }) }))] }));
};
export default PlanningListView;
