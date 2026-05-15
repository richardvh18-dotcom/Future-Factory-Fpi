import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { X, MapPin, User, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";
import { toDateSafe } from "../../../utils/dateUtils";
const ProductJourneyModal = ({ product, onClose }) => {
    const [enrichedHistory, setEnrichedHistory] = useState([]);
    // Effect: Verrijk historie met operator data uit occupancy als deze ontbreekt
    useEffect(() => {
        const enrichHistory = async () => {
            if (!product?.history) {
                setEnrichedHistory([]);
                return;
            }
            const enriched = await Promise.all(product.history.map(async (entry) => {
                // Als operator al bekend is in de entry, gebruik die
                if (entry.operator || entry.operatorNumber || entry.operatorName)
                    return entry;
                // Als we geen station of tijd hebben, kunnen we niet zoeken
                if (!entry.station || (!entry.timestamp && !entry.time))
                    return entry;
                try {
                    const ts = toDateSafe(entry.timestamp || entry.time);
                    if (!ts || isNaN(ts.getTime()))
                        return entry;
                    const dateStr = ts.toISOString().split('T')[0];
                    const station = entry.station;
                    // Zoek in occupancy (eerst exact, dan uppercase)
                    let q = query(collection(db, ...PATHS.OCCUPANCY), where("date", "==", dateStr), where("machineId", "==", station));
                    let snap = await getDocs(q);
                    if (snap.empty) {
                        q = query(collection(db, ...PATHS.OCCUPANCY), where("date", "==", dateStr), where("machineId", "==", station.toUpperCase()));
                        snap = await getDocs(q);
                    }
                    if (!snap.empty) {
                        const opData = snap.docs[0].data();
                        return { ...entry, operatorName: opData.operatorName, operatorNumber: opData.operatorNumber };
                    }
                }
                catch (e) {
                    console.warn("Kon historie niet verrijken:", e);
                }
                return entry;
            }));
            // Sorteer de verrijkte historie
            const sorted = enriched.sort((a, b) => {
                const tA = toDateSafe(a.timestamp || a.time)?.getTime() || 0;
                const tB = toDateSafe(b.timestamp || b.time)?.getTime() || 0;
                return tA - tB;
            });
            setEnrichedHistory(sorted);
        };
        enrichHistory();
    }, [product]);
    if (!product)
        return null;
    const history = enrichedHistory.length > 0 ? enrichedHistory : [...(product.history || [])].sort((a, b) => {
        const tA = toDateSafe(a.timestamp || a.time)?.getTime() || 0;
        const tB = toDateSafe(b.timestamp || b.time)?.getTime() || 0;
        return tA - tB;
    });
    const formatTime = (val) => {
        const date = toDateSafe(val);
        if (!date || isNaN(date.getTime()))
            return "-";
        return format(date, "dd MMM HH:mm", { locale: nl });
    };
    return (_jsx("div", { className: "fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95", children: [_jsxs("div", { className: "p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0", children: [_jsxs("div", { children: [_jsxs("h3", { className: "text-xl font-black text-slate-900 uppercase italic tracking-tighter", children: ["Product ", _jsx("span", { className: "text-blue-600", children: "Route" })] }), _jsxs("div", { className: "flex items-center gap-2 mt-1", children: [_jsx("span", { className: "px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-black uppercase", children: product.lotNumber }), _jsx("span", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest", children: product.itemCode })] })] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-white rounded-xl transition-all shadow-sm text-slate-400 hover:text-slate-600", children: _jsx(X, { size: 20 }) })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-8 custom-scrollbar bg-white", children: _jsxs("div", { className: "relative pl-4 space-y-0", children: [_jsx("div", { className: "absolute left-[19px] top-4 bottom-4 w-0.5 bg-slate-100" }), history.map((step, idx) => (_jsxs("div", { className: "relative flex gap-6 pb-8 last:pb-0 group", children: [_jsx("div", { className: "relative z-10 flex-shrink-0 w-10 h-10 rounded-full bg-white border-4 border-blue-50 flex items-center justify-center shadow-sm group-hover:border-blue-100 transition-colors", children: _jsx("div", { className: "w-2.5 h-2.5 bg-blue-500 rounded-full" }) }), _jsxs("div", { className: "flex-1 bg-slate-50 p-4 rounded-2xl border border-slate-100 group-hover:border-blue-200 group-hover:shadow-md transition-all cursor-help", title: `Operator: ${step.operatorName || step.operator || (step.user && step.user.includes('@') ? step.user.split('@')[0] : step.user) || "Onbekend"}${step.operatorNumber ? ` (${step.operatorNumber})` : ""}`, children: [_jsxs("div", { className: "flex justify-between items-start mb-2", children: [_jsx("span", { className: "font-black text-slate-800 uppercase text-xs tracking-tight", children: step.action || "Actie onbekend" }), _jsx("span", { className: "text-[9px] font-mono font-bold text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-100", children: formatTime(step.timestamp) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsxs("div", { className: "flex items-center gap-1.5 text-[10px] font-bold text-slate-500", children: [_jsx(MapPin, { size: 12, className: "text-blue-400" }), step.station || step.machine || "Station?"] }), (step.user || step.operatorName || step.operatorNumber) && (_jsxs("div", { className: "flex items-center gap-1.5 text-[10px] font-bold text-slate-500 justify-end", children: [_jsx(User, { size: 12, className: "text-slate-400" }), _jsx("span", { className: "truncate max-w-[80px]", children: step.operatorName || step.operatorNumber || (step.user && step.user.includes('@') ? step.user.split('@')[0] : step.user) })] }))] }), step.details && step.details !== step.action && (_jsxs("p", { className: "mt-2 text-[10px] text-slate-400 italic border-t border-slate-200/50 pt-2", children: ["\"", step.details, "\""] }))] })] }, idx))), _jsxs("div", { className: "relative flex gap-6 pt-8", children: [_jsx("div", { className: "relative z-10 flex-shrink-0 w-10 h-10 rounded-full bg-emerald-50 border-4 border-emerald-100 flex items-center justify-center shadow-sm animate-pulse", children: _jsx(CheckCircle2, { size: 16, className: "text-emerald-600" }) }), _jsxs("div", { className: "flex-1 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100", children: [_jsx("span", { className: "text-[10px] font-black text-emerald-600 uppercase tracking-widest block mb-1", children: "Huidige Positie" }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "font-black text-slate-800 text-sm", children: product.currentStation }), _jsx("span", { className: "px-2 py-1 bg-white rounded-lg text-[9px] font-bold text-emerald-600 border border-emerald-100 uppercase", children: product.status })] })] })] })] }) })] }) }));
};
export default ProductJourneyModal;
