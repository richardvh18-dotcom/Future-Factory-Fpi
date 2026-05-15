import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Zap, ChevronRight, ChevronDown, ArrowLeft, ClipboardCheck, ScanBarcode, Trash2, FileText, AlertTriangle } from "lucide-react";
import { useNotifications } from "../../../contexts/NotificationContext";
const TerminalProductionView = ({ activeWikkelingen = [], lotConflictMeta = {}, selectedTrackedId, onSelectTracked, selectedWikkeling, onReleaseProduct, onCancelProduction, scanInput = "", setScanInput = () => { }, onScan = () => { }, scanInputRef, scannerMode = true, activeTab = "wikkelen" }) => {
    const { t } = useTranslation();
    const { showConfirm } = useNotifications();
    const itemRefs = useRef({});
    const [collapsedGroups, setCollapsedGroups] = useState({});
    const groupedSeries = useMemo(() => {
        const grouped = new Map();
        activeWikkelingen.forEach((item) => {
            const groupId = item?.seriesGroupId;
            if (!groupId)
                return;
            if (!grouped.has(groupId))
                grouped.set(groupId, []);
            grouped.get(groupId).push(item);
        });
        return grouped;
    }, [activeWikkelingen]);
    useEffect(() => {
        setCollapsedGroups((prev) => {
            const next = { ...prev };
            groupedSeries.forEach((group, groupId) => {
                if (group.length <= 1)
                    return;
                if (!(groupId in next))
                    next[groupId] = true;
            });
            Object.keys(next).forEach((groupId) => {
                const group = groupedSeries.get(groupId);
                if (!group || group.length <= 1) {
                    delete next[groupId];
                }
            });
            return next;
        });
    }, [groupedSeries]);
    const displayRows = useMemo(() => {
        const rendered = new Set();
        const rows = [];
        activeWikkelingen.forEach((item) => {
            const groupId = item?.seriesGroupId;
            const group = groupId ? groupedSeries.get(groupId) || [] : [];
            const isSeriesGroup = groupId && group.length > 1;
            if (isSeriesGroup && !rendered.has(groupId)) {
                rows.push({
                    id: `series_header_${groupId}`,
                    isSeriesHeader: true,
                    seriesGroupId: groupId,
                    orderId: group[0]?.orderId || item?.orderId || "-",
                    seriesUnits: group,
                    seriesCount: group.length,
                });
                rendered.add(groupId);
            }
            if (!isSeriesGroup || !collapsedGroups[groupId]) {
                rows.push(item);
            }
        });
        return rows;
    }, [activeWikkelingen, groupedSeries, collapsedGroups]);
    const selectedSeriesUnits = useMemo(() => {
        if (!selectedWikkeling?.seriesGroupId)
            return [];
        const group = groupedSeries.get(selectedWikkeling.seriesGroupId) || [];
        return group.length > 1 ? group : [];
    }, [selectedWikkeling, groupedSeries]);
    const [selectedMultiLots, setSelectedMultiLots] = useState([]);
    const isMultiSelectMode = selectedMultiLots.length > 0;
    const toggleMultiLot = (lotId) => {
        setSelectedMultiLots(prev => prev.includes(lotId) ? prev.filter(id => id !== lotId) : [...prev, lotId]);
    };
    const handleBulkRelease = async () => {
        if (selectedMultiLots.length === 0)
            return;
        const productsToRelease = activeWikkelingen.filter(p => selectedMultiLots.includes(p.id));
        if (productsToRelease.length === 0)
            return;
        const confirmed = await showConfirm({
            title: t("digitalplanning.terminal.bulk_release_title", "Meerdere producten gereedmelden"),
            message: t("digitalplanning.terminal.bulk_release_confirm_message", "Je staat op het punt om {{count}} verschillende producten tegelijk gereed te melden. Weet je dit zeker?", { count: productsToRelease.length }),
            confirmText: t("common.confirm", "Bevestigen"),
            cancelText: t("common.back", "Terug"),
            tone: "warning",
        });
        if (confirmed) {
            onReleaseProduct(productsToRelease[0], productsToRelease);
            setSelectedMultiLots([]);
            onSelectTracked(null);
        }
    };
    const handleSeriesRelease = async (mainProduct, seriesUnits) => {
        const confirmed = await showConfirm({
            title: t("digitalplanning.terminal.series_release_title", "Hele serie gereedmelden"),
            message: t("digitalplanning.terminal.series_release_confirm_message", "Je staat op het punt om de hele serie van {{count}} producten gereed te melden. Weet je dit zeker?", { count: seriesUnits.length }),
            confirmText: t("common.confirm", "Bevestigen"),
            cancelText: t("common.back", "Terug"),
            tone: "warning",
        });
        if (confirmed) {
            onReleaseProduct(mainProduct, seriesUnits);
        }
    };
    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName))
                return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (activeWikkelingen.length === 0)
                    return;
                const currentIndex = activeWikkelingen.findIndex(p => p.id === selectedTrackedId);
                let nextIndex;
                if (e.key === 'ArrowDown') {
                    nextIndex = currentIndex >= 0 ? (currentIndex + 1) % activeWikkelingen.length : 0;
                }
                else { // ArrowUp
                    nextIndex = currentIndex > 0 ? currentIndex - 1 : activeWikkelingen.length - 1;
                }
                const nextItem = activeWikkelingen[nextIndex];
                if (nextItem) {
                    onSelectTracked(nextItem.id);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeWikkelingen, selectedTrackedId, onSelectTracked]);
    // Scroll selected item into view
    useEffect(() => {
        if (selectedTrackedId && itemRefs.current[selectedTrackedId]) {
            itemRefs.current[selectedTrackedId].scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
        }
    }, [selectedTrackedId]);
    useEffect(() => {
        if (!scannerMode)
            return;
        const focusScanner = () => {
            scanInputRef?.current?.focus();
        };
        const handleDocumentClick = (event) => {
            const target = event?.target;
            if (!target)
                return;
            if (target.closest?.('input, textarea, select, button, a, [role="button"], [contenteditable="true"], [data-scan-ignore]')) {
                return;
            }
            focusScanner();
        };
        focusScanner();
        document.addEventListener("click", handleDocumentClick);
        return () => document.removeEventListener("click", handleDocumentClick);
    }, [scannerMode, scanInputRef]);
    return (_jsxs(_Fragment, { children: [_jsx("style", { children: `
        @keyframes scan-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.7); }
          50% { box-shadow: 0 0 0 10px rgba(249, 115, 22, 0); }
        }
        .scan-pulse-wikkelen {
          animation: scan-pulse 2s infinite;
        }
        @keyframes pulse-text {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .pulse-text-wikkelen {
          animation: pulse-text 1.5s ease-in-out infinite;
        }
      ` }), _jsxs("div", { className: `w-full lg:w-5/12 p-6 bg-white border-r border-slate-100 flex flex-col overflow-hidden ${selectedTrackedId ? "hidden lg:flex" : "flex"} text-left`, children: [_jsxs("div", { className: "mb-4 space-y-2", children: [_jsxs("div", { className: "flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-lg border border-orange-100 w-fit", children: [_jsx("div", { className: "w-2 h-2 bg-orange-500 rounded-full pulse-text-wikkelen" }), _jsxs("span", { className: "text-xs font-black text-orange-600 uppercase tracking-widest", children: ["\uD83D\uDD0D ", t('digitalplanning.terminal.ready_for_winding_scan', 'Klaar voor wikkelen scan')] })] }), _jsxs("div", { className: "relative", children: [_jsx(ScanBarcode, { className: "absolute left-4 top-1/2 -translate-y-1/2 text-orange-500 transition-all scan-pulse-wikkelen", size: 24 }), _jsx("input", { ref: scanInputRef, type: "text", value: scanInput, onChange: (e) => setScanInput(e.target.value), inputMode: scannerMode ? "none" : "text", onKeyDown: onScan, placeholder: t("digitalplanning.terminal.scan_lot_placeholder", "Scan lotnummer..."), className: "w-full pl-14 pr-4 py-4 bg-white border-2 border-orange-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-300 rounded-2xl font-bold text-lg shadow-sm outline-none transition-all placeholder:text-slate-300" })] })] }), _jsxs("div", { className: "flex justify-between items-center mb-6 px-2 text-left", children: [_jsxs("div", { className: "flex flex-col", children: [_jsxs("h3", { className: "text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2", children: [_jsx(Zap, { size: 16, className: "text-orange-500" }), " ", t("digitalplanning.terminal.active_winding", "Actieve wikkelingen")] }), isMultiSelectMode && (_jsxs("span", { className: "text-[10px] font-black text-emerald-600 uppercase mt-1 animate-pulse", children: [selectedMultiLots.length, " ", t("common.selected", "Geselecteerd")] }))] }), _jsxs("div", { className: "flex items-center gap-2", children: [isMultiSelectMode && (_jsxs("button", { onClick: handleBulkRelease, className: "bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-emerald-200 active:scale-95 transition-all flex items-center gap-2", children: [_jsx(ClipboardCheck, { size: 14 }), " ", t("common.ready", "Gereed")] })), _jsxs("button", { onClick: async () => {
                                            const confirmed = await showConfirm({
                                                title: t("digitalplanning.terminal.all_ready_title", "Alles gereedmelden"),
                                                message: t("digitalplanning.terminal.all_ready_confirm_message", "Je staat op het punt om ALLE {{count}} actieve wikkelingen in één keer gereed te melden. Weet je dit zeker?", { count: activeWikkelingen.length }),
                                                confirmText: t("common.confirm", "Bevestigen"),
                                                cancelText: t("common.back", "Terug"),
                                                tone: "danger",
                                            });
                                            if (confirmed) {
                                                onReleaseProduct(activeWikkelingen[0], activeWikkelingen);
                                                onSelectTracked(null);
                                            }
                                        }, className: "bg-slate-900 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase shadow-lg active:scale-95 transition-all flex items-center gap-2", children: [_jsx(Zap, { size: 14, className: "text-orange-400" }), " ", t("digitalplanning.terminal.all_ready", "Alles Gereed")] }), _jsx("span", { className: "bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[10px] font-black", children: activeWikkelingen.length })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto space-y-3 custom-scrollbar text-left text-left pb-24", style: { paddingBottom: "max(6rem, env(safe-area-inset-bottom))" }, children: displayRows.map((prod) => {
                            if (prod.isSeriesHeader) {
                                const isCollapsed = !!collapsedGroups[prod.seriesGroupId];
                                const firstSeriesUnit = prod.seriesUnits?.[0] || null;
                                return (_jsxs("div", { onClick: () => firstSeriesUnit && onSelectTracked(firstSeriesUnit.id), className: "p-4 rounded-[24px] border-2 bg-orange-50 border-orange-200 cursor-pointer", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsxs("h4", { className: "font-black italic leading-none mb-1", children: [t("productionStartModal.labels.order", "Order"), " ", prod.orderId] }), _jsx("p", { className: "text-[10px] font-bold text-orange-700 uppercase", children: t("digitalplanning.terminal.series_count", "Serie {{count}} stuks", { count: prod.seriesCount }) })] }), _jsxs("button", { onClick: () => setCollapsedGroups((prev) => ({
                                                        ...prev,
                                                        [prod.seriesGroupId]: !prev[prod.seriesGroupId],
                                                    })), className: "inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-orange-200 text-orange-700 text-[10px] font-black uppercase", children: [isCollapsed ? _jsx(ChevronRight, { size: 14 }) : _jsx(ChevronDown, { size: 14 }), isCollapsed ? t("digitalplanning.terminal.expand", "Uitklappen") : t("digitalplanning.terminal.collapse", "Inklappen")] })] }), _jsx("p", { className: "mt-2 text-[10px] font-bold text-orange-700/80 uppercase tracking-wide", children: t("digitalplanning.terminal.select_for_complete_right_panel", "Selecteer voor gereedmelden in rechterpaneel") })] }, prod.id));
                            }
                            const lotKey = String(prod?.lotNumber || "").trim().toUpperCase();
                            const conflict = lotConflictMeta[lotKey];
                            const hasLotConflict = Boolean(conflict?.hasConflict);
                            const isMultiSelected = selectedMultiLots.includes(prod.id);
                            return (_jsxs("div", { ref: el => (itemRefs.current[prod.id] = el), onClick: () => {
                                    if (activeTab === "wikkelen" && (prod.currentStation === "BH18" || prod.machine === "BH18")) {
                                        // BH18 Multi-select ondersteuning
                                        toggleMultiLot(prod.id);
                                    }
                                    onSelectTracked(prod.id);
                                }, className: `p-5 rounded-[30px] border-2 transition-all cursor-pointer flex items-center justify-between group ${selectedTrackedId === prod.id ? "bg-orange-50 border-orange-500 shadow-md" : (isMultiSelected ? "bg-emerald-50 border-emerald-500" : "bg-white border-slate-100")} text-left`, children: [_jsxs("div", { className: "flex items-center gap-4 text-left", children: [_jsx("div", { className: `p-3 rounded-2xl text-left ${isMultiSelected ? "bg-emerald-100 text-emerald-600" : "bg-orange-50 text-orange-600"}`, children: isMultiSelected ? _jsx(ClipboardCheck, { size: 20 }) : _jsx(Zap, { size: 20 }) }), _jsxs("div", { className: "text-left text-left", children: [_jsx("h4", { className: "font-black italic leading-none mb-1", children: prod.lotNumber }), _jsxs("p", { className: "text-[10px] font-bold text-slate-400 uppercase", children: [t("productionStartModal.labels.order", "Order"), ": ", prod.orderId] }), hasLotConflict && (_jsxs("p", { className: "mt-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-1", children: [_jsx(AlertTriangle, { size: 12 }), " ", t("digitalplanning.terminal.lot_conflict", "Lotconflict")] }))] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: async (e) => {
                                                    e.stopPropagation();
                                                    const confirmed = await showConfirm({
                                                        title: t("digitalplanning.terminal.cancel_production_title", "Productie annuleren"),
                                                        message: t("digitalplanning.terminal.cancel_production_message", "Weet je zeker dat je lot {{lot}} wilt annuleren? Dit kan niet ongedaan worden gemaakt.", { lot: prod.lotNumber }),
                                                        confirmText: t("digitalplanning.terminal.cancel_production_confirm", "Annuleren"),
                                                        cancelText: t("common.back", "Terug"),
                                                        tone: "danger",
                                                    });
                                                    if (!confirmed)
                                                        return;
                                                    onCancelProduction(prod.id);
                                                }, className: "p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity", title: t("digitalplanning.terminal.cancel_production", "Annuleer productie"), children: _jsx(Trash2, { size: 20 }) }), _jsx(ChevronRight, { size: 20, className: "text-slate-300" })] })] }, prod.id));
                        }) })] }), _jsx("div", { className: `flex-1 p-6 md:p-8 bg-slate-50 flex flex-col overflow-y-auto custom-scrollbar ${!selectedTrackedId ? "hidden lg:flex" : "flex"} text-left pb-24`, style: { paddingBottom: "max(6rem, env(safe-area-inset-bottom))" }, children: selectedWikkeling ? (() => {
                    const isMultiSelected = selectedMultiLots.includes(selectedWikkeling.id);
                    return (_jsxs("div", { className: "max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 text-left", children: [_jsxs("div", { className: "bg-slate-900 rounded-[35px] p-6 text-white flex justify-between items-center border-4 border-orange-500/20 relative overflow-hidden shadow-xl text-left", children: [_jsx("button", { onClick: () => onSelectTracked(null), className: "lg:hidden p-2 text-white/50 mr-2", children: _jsx(ArrowLeft, { size: 20 }) }), _jsxs("div", { className: "text-left flex-1", children: [_jsx("span", { className: "text-[8px] font-black text-orange-400 uppercase block mb-1 text-left", children: t("digitalplanning.terminal.dossier", "Dossier") }), _jsx("h2", { className: "text-3xl font-black italic leading-none text-left", children: selectedWikkeling.lotNumber })] }), _jsx("div", { className: "p-3 bg-orange-600 rounded-2xl shadow-lg animate-pulse", children: _jsx(Zap, { size: 24 }) })] }), selectedWikkeling.notes && (_jsxs("div", { className: "bg-amber-50 p-4 rounded-xl border border-amber-100", children: [_jsxs("h4", { className: "text-xs font-black text-amber-800 uppercase tracking-widest mb-2 flex items-center gap-2", children: [_jsx(FileText, { size: 14 }), " ", t("productionStartModal.labels.poTextNotes", "PO-tekst / opmerkingen")] }), _jsxs("p", { className: "text-sm font-medium text-slate-700 italic", children: ["\"", selectedWikkeling.notes, "\""] })] })), _jsxs("div", { className: "bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-8 text-left", children: [selectedSeriesUnits.length > 1 && (_jsxs("button", { onClick: () => handleSeriesRelease(selectedSeriesUnits[0], selectedSeriesUnits), className: "w-full py-4 bg-emerald-600 text-white rounded-[22px] font-black uppercase text-sm shadow-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 active:scale-95 group", children: [_jsx(ClipboardCheck, { size: 20 }), " ", t("digitalplanning.terminal.series_report_ready", "Serie gereedmelden"), " (", selectedSeriesUnits.length, "x)"] })), _jsxs("button", { onClick: () => {
                                            if (isMultiSelected) {
                                                handleBulkRelease();
                                            }
                                            else {
                                                onReleaseProduct(selectedWikkeling);
                                            }
                                        }, className: `w-full py-6 text-white rounded-[30px] font-black uppercase text-base shadow-xl transition-all flex items-center justify-center gap-4 active:scale-95 group ${isMultiSelected ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-900 hover:bg-emerald-600"}`, children: [_jsx(ClipboardCheck, { size: 28 }), isMultiSelected
                                                ? t("digitalplanning.terminal.bulk_report_ready", "Selectie gereedmelden")
                                                : t("digitalplanning.terminal.product_report_ready", "Product gereedmelden")] })] })] }));
                })() : (_jsxs("div", { className: "flex-1 flex flex-col items-center justify-center opacity-30 text-center text-left", children: [_jsx(Zap, { size: 80, className: "mb-6 text-slate-200" }), _jsx("h4", { className: "text-2xl font-black uppercase italic text-slate-300 text-left", children: t("digitalplanning.terminal.select_active_lot", "Selecteer actief lot") })] })) })] }));
};
export default TerminalProductionView;
