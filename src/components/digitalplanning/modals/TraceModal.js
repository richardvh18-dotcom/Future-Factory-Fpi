import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useMemo } from "react";
import { X, FileText, Box, ArrowUp, ArrowDown, Search, User, ChevronLeft, ChevronRight, Archive, } from "lucide-react";
import { format, formatDistanceStrict } from "date-fns";
import { nl } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { toDateSafe } from "../../../utils/dateUtils";
import StatusBadge from "../common/StatusBadge";
import jsPDF from "jspdf";
import "jspdf-autotable";
/**
 * TraceModal - Toont de gedetailleerde lijst die hoort bij een KPI tegel.
 */
const TraceModal = ({ isOpen, onClose, title, data = [], onRowClick, onRowAction = null, rowActionLabel = "", weekNavigation = null }) => {
    const { t } = useTranslation();
    const [sortConfig, setSortConfig] = useState({ key: 'updatedAt', direction: 'desc' });
    const [searchTerm, setSearchTerm] = useState("");
    const getPriorityLevel = (item) => {
        const rawPriority = item?.priority;
        const normalizedPriority = rawPriority === true
            ? "high"
            : String(rawPriority || "").toLowerCase().trim();
        if (normalizedPriority === "immediate")
            return "immediate";
        if (normalizedPriority === "urgent")
            return "urgent";
        if (normalizedPriority === "high")
            return "high";
        if (item?.isMoved)
            return "high";
        if (item?.isUrgent)
            return "urgent";
        return "normal";
    };
    const getPriorityBadge = (item) => {
        const level = getPriorityLevel(item);
        if (level === "immediate") {
            return { label: t('digitalplanning.trace_modal.priority_immediate', '1st Prio'), className: "bg-rose-100 text-rose-700 border border-rose-200" };
        }
        if (level === "urgent") {
            return { label: t('digitalplanning.trace_modal.priority_urgent', 'Urgent'), className: "bg-orange-100 text-orange-700 border border-orange-200" };
        }
        if (level === "high") {
            return { label: t('digitalplanning.trace_modal.priority', 'Priority'), className: "bg-amber-100 text-amber-700 border border-amber-200" };
        }
        return null;
    };
    const filteredData = useMemo(() => {
        if (!searchTerm)
            return data;
        const lowerTerm = searchTerm.toLowerCase();
        return data.filter((item) => {
            return ((item.lotNumber || "").toLowerCase().includes(lowerTerm) ||
                (item.orderId || "").toLowerCase().includes(lowerTerm) ||
                (item.item || "").toLowerCase().includes(lowerTerm) ||
                (item.itemCode || "").toLowerCase().includes(lowerTerm) ||
                (item.operatorName || "").toLowerCase().includes(lowerTerm) ||
                (item.machine || item.stationLabel || "").toLowerCase().includes(lowerTerm) ||
                (item.status || "").toLowerCase().includes(lowerTerm));
        });
    }, [data, searchTerm]);
    const sortedData = useMemo(() => {
        if (!filteredData)
            return [];
        let sortableItems = [...filteredData];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];
                // Speciale handling voor datums en fallbacks
                if (sortConfig.key === 'updatedAt') {
                    const getDate = (obj) => obj.updatedAt || obj.lastUpdated || obj.createdAt;
                    const getMillis = (d) => toDateSafe(d)?.getTime() || 0;
                    aValue = getMillis(getDate(a));
                    bValue = getMillis(getDate(b));
                }
                else {
                    // String handling
                    aValue = aValue ? String(aValue).toLowerCase() : "";
                    bValue = bValue ? String(bValue).toLowerCase() : "";
                }
                if (aValue < bValue)
                    return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue)
                    return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [filteredData, sortConfig]);
    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };
    const formatDisplayDate = (dateInput) => {
        const date = toDateSafe(dateInput);
        if (!date)
            return "-";
        try {
            return format(date, "dd-MM-yyyy HH:mm");
        }
        catch {
            return "-";
        }
    };
    const SortIcon = ({ columnKey }) => {
        if (sortConfig.key !== columnKey)
            return _jsx("div", { className: "w-3 h-3" }); // Placeholder
        return sortConfig.direction === 'asc' ? _jsx(ArrowUp, { size: 12 }) : _jsx(ArrowDown, { size: 12 });
    };
    const handleExportPDF = () => {
        const doc = new jsPDF('landscape');
        doc.setFontSize(16);
        doc.text(`${title} - Export`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Datum gegenereerd: ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, 14, 22);
        const getDwellTime = (product) => {
            let startTime = new Date();
            if (product.updatedAt) {
                startTime = typeof product.updatedAt.toDate === 'function' ? product.updatedAt.toDate() : new Date(product.updatedAt);
            }
            else if (product.createdAt) {
                startTime = typeof product.createdAt.toDate === 'function' ? product.createdAt.toDate() : new Date(product.createdAt);
            }
            if (isNaN(startTime.getTime()))
                return "Onbekend";
            return formatDistanceStrict(startTime, new Date(), { locale: nl });
        };
        const tableData = sortedData.map(product => [
            product.lotNumber || "Onbekend",
            product.orderId || product.orderNumber || "Onbekend",
            product.item || product.description || "Onbekend",
            product.originMachine || product.machine || "Onbekend",
            product.currentStation || product.machine || product.stationLabel || "Onbekend",
            product.status || product.currentStep || "Onbekend",
            getDwellTime(product)
        ]);
        doc.autoTable({
            startY: 28,
            head: [['Lotnummer', 'Ordernummer', 'Product', 'Oorsprong', 'Huidig Station', 'Status', 'Verblijftijd']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235], textColor: 255 },
            styles: { fontSize: 9 }
        });
        doc.save(`Export_${String(title).replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    };
    if (!isOpen)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300", children: _jsxs("div", { className: "bg-white w-full max-w-5xl h-[95vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95", children: [_jsxs("div", { className: "p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50 shrink-0", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "p-3 bg-slate-900 text-white rounded-2xl shadow-lg", children: _jsx(FileText, { size: 24 }) }), _jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-black text-slate-900 uppercase italic tracking-tighter", children: title }), _jsxs("p", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1", children: [t('digitalplanning.trace_modal.total_found', 'Total: {{count}} items found', { count: filteredData.length }), " ", searchTerm && t('digitalplanning.trace_modal.of_total', '(of {{count}})', { count: data.length })] })] })] }), _jsxs("div", { className: "w-full sm:max-w-2xl flex flex-col sm:flex-row gap-2", children: [weekNavigation && (_jsxs("div", { className: "flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-2 py-2 shadow-sm", children: [_jsx("button", { type: "button", onClick: weekNavigation.onPrevious, className: "p-2 rounded-lg hover:bg-slate-100 text-slate-600", title: t('digitalplanning.trace_modal.previous_week', 'Previous week'), children: _jsx(ChevronLeft, { size: 16 }) }), _jsx("span", { className: "text-[11px] font-black uppercase tracking-wider text-slate-700 whitespace-nowrap", children: weekNavigation.label }), _jsx("button", { type: "button", onClick: weekNavigation.onNext, disabled: !weekNavigation.canGoNext, className: "p-2 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed", title: t('digitalplanning.trace_modal.next_week', 'Next week'), children: _jsx(ChevronRight, { size: 16 }) }), _jsx("button", { type: "button", onClick: weekNavigation.onCurrentWeek, className: "px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600", children: t('digitalplanning.trace_modal.this_week', 'This week') })] })), _jsxs("div", { className: "relative w-full sm:max-w-xs sm:ml-auto", children: [_jsx(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400", size: 16 }), _jsx("input", { type: "text", placeholder: t('digitalplanning.trace_modal.search_placeholder', 'Search...'), value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), className: "w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-all shadow-sm", autoFocus: true })] }), _jsxs("button", { onClick: handleExportPDF, disabled: sortedData.length === 0, className: "p-3 sm:px-4 bg-white text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed", title: t('common.export_pdf', 'Exporteer naar PDF'), children: [_jsx(FileText, { size: 16 }), " ", _jsx("span", { className: "text-xs font-bold uppercase tracking-widest hidden sm:inline", children: "PDF" })] })] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors", children: _jsx(X, { size: 28 }) })] }), _jsx("div", { className: "flex-1 flex flex-col min-h-0 p-6 bg-white", children: filteredData.length === 0 ? (_jsxs("div", { className: "flex-1 overflow-y-auto custom-scrollbar py-20 text-center opacity-30", children: [_jsx(Box, { size: 64, className: "mx-auto mb-4" }), _jsx("p", { className: "font-black uppercase tracking-widest text-xs", children: t('digitalplanning.trace_modal.no_data_for_selection', 'No data available for this selection') })] })) : (_jsx("div", { className: "flex-1 border border-slate-100 rounded-2xl overflow-hidden flex flex-col shadow-sm", children: _jsx("div", { className: "flex-1 overflow-y-auto custom-scrollbar relative", children: _jsxs("table", { className: "w-full text-left text-xs border-collapse", children: [_jsx("thead", { className: "bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-20 shadow-sm", children: _jsxs("tr", { children: [_jsx("th", { className: "px-6 py-3 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none", onClick: () => requestSort('lotNumber'), children: _jsxs("div", { className: "flex items-center gap-1", children: [t('digitalplanning.trace_modal.identification', 'Identification'), " ", _jsx(SortIcon, { columnKey: "lotNumber" })] }) }), _jsx("th", { className: "px-6 py-3 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none", onClick: () => requestSort('item'), children: _jsxs("div", { className: "flex items-center gap-1", children: [t('digitalplanning.trace_modal.product_info', 'Product Info'), " ", _jsx(SortIcon, { columnKey: "item" })] }) }), _jsx("th", { className: "px-6 py-3 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none", onClick: () => requestSort('machine'), children: _jsxs("div", { className: "flex items-center gap-1", children: [t('digitalplanning.trace_modal.station', 'Station'), " ", _jsx(SortIcon, { columnKey: "machine" })] }) }), _jsx("th", { className: "px-6 py-3 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none", onClick: () => requestSort('status'), children: _jsxs("div", { className: "flex items-center gap-1", children: [t('digitalplanning.trace_modal.status', 'Status'), " ", _jsx(SortIcon, { columnKey: "status" })] }) }), _jsx("th", { className: "px-6 py-3 text-right bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none", onClick: () => requestSort('updatedAt'), children: _jsxs("div", { className: "flex items-center justify-end gap-1", children: [t('digitalplanning.trace_modal.last_update', 'Last Update'), " ", _jsx(SortIcon, { columnKey: "updatedAt" })] }) }), onRowAction && (_jsx("th", { className: "px-6 py-3 text-right bg-slate-50 border-b border-slate-200", children: _jsx("div", { className: "flex items-center justify-end gap-1", children: rowActionLabel || t('digitalplanning.trace_modal.action', 'Action') }) }))] }) }), _jsx("tbody", { className: "divide-y divide-slate-100 bg-white", children: sortedData.map((item, idx) => ((() => {
                                            const priorityBadge = getPriorityBadge(item);
                                            const priorityLevel = getPriorityLevel(item);
                                            return (_jsxs("tr", { className: `hover:bg-blue-50/30 transition-colors group cursor-pointer border-l-4 ${priorityLevel === "immediate"
                                                    ? "border-l-rose-400"
                                                    : priorityLevel === "urgent"
                                                        ? "border-l-orange-400"
                                                        : priorityLevel === "high"
                                                            ? "border-l-amber-400"
                                                            : "border-l-transparent"}`, onClick: () => onRowClick && onRowClick(item), children: [_jsxs("td", { className: "px-6 py-4", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx("div", { className: "font-black text-slate-900 text-sm", children: item.lotNumber || item.orderId }), priorityBadge && (_jsx("span", { className: `px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${priorityBadge.className}`, children: priorityBadge.label }))] }), item.lotNumber && (_jsxs("div", { className: "text-[9px] font-bold text-slate-400 uppercase", children: [t('digitalplanning.trace_modal.order', 'Order'), ": ", item.orderId] }))] }), _jsxs("td", { className: "px-6 py-4", children: [_jsx("div", { className: "font-bold text-slate-700 truncate max-w-[200px]", children: item.item || t('digitalplanning.trace_modal.no_description', 'No description') }), _jsx("div", { className: "text-[10px] font-mono text-slate-400", children: item.itemCode || item.productId })] }), _jsxs("td", { className: "px-6 py-4", children: [_jsx("span", { className: "px-3 py-1 bg-white border border-slate-200 rounded-lg font-black text-blue-600 uppercase italic", children: item.machine || item.stationLabel || "-" }), (item.operatorName || item.operator) && (_jsxs("div", { className: "text-[9px] font-bold text-slate-400 mt-1.5 flex items-center gap-1", children: [_jsx(User, { size: 10 }), item.operatorName || (item.operator && item.operator.split('@')[0])] }))] }), _jsx("td", { className: "px-6 py-4", children: _jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx(StatusBadge, { status: item.status }), priorityBadge && (_jsx("span", { className: `px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${priorityBadge.className}`, children: priorityBadge.label }))] }) }), _jsx("td", { className: "px-6 py-4 text-right", children: _jsx("div", { className: "text-slate-900 font-bold", children: formatDisplayDate(item.updatedAt || item.lastUpdated || item.createdAt) }) }), onRowAction && (_jsx("td", { className: "px-6 py-4 text-right", children: _jsxs("button", { type: "button", onClick: (e) => {
                                                                e.stopPropagation();
                                                                onRowAction(item);
                                                            }, className: "inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-700 hover:bg-rose-100", children: [_jsx(Archive, { size: 14 }), rowActionLabel || t('digitalplanning.trace_modal.action', 'Action')] }) }))] }, idx));
                                        })())) })] }) }) })) }), _jsx("div", { className: "p-6 bg-slate-50 border-t border-slate-100 flex justify-end", children: _jsx("button", { onClick: onClose, className: "px-8 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all", children: t('common.close', 'Close') }) })] }) }));
};
export default TraceModal;
