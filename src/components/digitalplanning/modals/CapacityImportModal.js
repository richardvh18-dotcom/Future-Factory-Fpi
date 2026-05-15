import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from "react";
import { X, Upload, CheckCircle2, Loader2, Zap, AlertTriangle, } from "lucide-react";
import { db } from "../../../config/firebase";
import { processInforUpdate } from "../../../utils/infor_sync_service";
import { useNotifications } from '../../../contexts/NotificationContext';
const CapacityImportModal = ({ isOpen, onClose, onSuccess }) => {
    const { notify } = useNotifications();
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [stats, setStats] = useState(null);
    const fileInputRef = useRef(null);
    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file)
            return;
        setLoading(true);
        setStats(null);
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const XLSX = await import("xlsx");
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: "binary" });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                // We hebben de ruwe array van arrays nodig voor de service
                const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });
                if (!rawData || rawData.length < 2) {
                    notify("Bestand lijkt leeg of ongeldig.");
                    setLoading(false);
                    return;
                }
                setProcessing(true);
                // Roep de service aan om de data te verwerken
                // appId is niet strikt nodig omdat de service hardcoded paden gebruikt, maar we geven een default mee
                const result = await processInforUpdate(db, "fittings-app-v1", rawData);
                setStats(result);
                if (onSuccess)
                    onSuccess();
            }
            catch (err) {
                console.error("Import error:", err);
                notify("Fout bij verwerken bestand: " + err.message);
            }
            finally {
                setLoading(false);
                setProcessing(false);
                // Reset input
                if (fileInputRef.current)
                    fileInputRef.current.value = "";
            }
        };
        reader.readAsBinaryString(file);
    };
    if (!isOpen)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-2xl rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95", children: [_jsxs("div", { className: "p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "p-3 bg-purple-600 text-white rounded-2xl shadow-lg shadow-purple-200", children: _jsx(Zap, { size: 24 }) }), _jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-black text-slate-900 uppercase italic tracking-tight", children: "Uren & Normen Import" }), _jsx("p", { className: "text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 italic", children: "Update efficiency database" })] })] }), _jsx("button", { onClick: onClose, className: "p-3 hover:bg-slate-200 rounded-full text-slate-400 transition-colors", children: _jsx(X, { size: 24 }) })] }), _jsx("div", { className: "p-10", children: !stats ? (_jsxs("div", { onClick: () => !loading && fileInputRef.current?.click(), className: `border-4 border-dashed border-slate-100 rounded-[40px] p-16 text-center transition-all group ${loading ? 'opacity-50 cursor-wait' : 'hover:border-purple-400 hover:bg-purple-50/30 cursor-pointer'}`, children: [_jsx("input", { type: "file", ref: fileInputRef, onChange: handleFileChange, className: "hidden", accept: ".csv, .xlsx, .xls", disabled: loading }), loading || processing ? (_jsx(Loader2, { size: 64, className: "mx-auto text-purple-500 animate-spin mb-6" })) : (_jsx(Upload, { size: 64, className: "mx-auto text-slate-200 group-hover:text-purple-400 transition-colors mb-6" })), _jsx("h3", { className: "text-xl font-black text-slate-800 uppercase italic", children: loading ? "Verwerken..." : "Selecteer Infor Export" }), _jsx("p", { className: "text-slate-400 font-medium mt-2", children: "Upload het Excel bestand met uren en aantallen" })] })) : (_jsxs("div", { className: "text-center py-10", children: [_jsx("div", { className: "w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6", children: _jsx(CheckCircle2, { size: 40 }) }), _jsx("h3", { className: "text-2xl font-black text-slate-900 mb-2", children: "Import Succesvol!" }), _jsxs("p", { className: "text-slate-500 mb-8", children: ["Er zijn ", _jsx("b", { children: stats.countMatched }), " orders gematcht met de planning.", _jsx("br", {}), "Hiervan zijn er ", _jsx("b", { children: stats.countUpdated }), " bijgewerkt en ", _jsx("b", { children: stats.countDeleted }), " gearchiveerd."] }), stats.unmatchedOrders && stats.unmatchedOrders.length > 0 && (_jsxs("div", { className: "mb-8 text-left bg-amber-50 p-4 rounded-xl border border-amber-100", children: [_jsxs("h4", { className: "text-xs font-bold text-amber-800 uppercase mb-2 flex items-center gap-2", children: [_jsx(AlertTriangle, { size: 14 }), "Niet gevonden in planning (", stats.unmatchedOrders.length, ")"] }), _jsx("div", { className: "max-h-32 overflow-y-auto custom-scrollbar pr-2", children: _jsx("div", { className: "flex flex-wrap gap-2", children: stats.unmatchedOrders.map(id => (_jsx("span", { className: "text-[10px] bg-white border border-amber-200 px-2 py-1 rounded text-amber-900 font-mono font-bold", children: id }, id))) }) })] })), _jsx("button", { onClick: onClose, className: "bg-slate-900 text-white px-8 py-3 rounded-xl font-bold uppercase tracking-widest hover:bg-slate-800", children: "Sluiten" })] })) })] }) }));
};
export default CapacityImportModal;
