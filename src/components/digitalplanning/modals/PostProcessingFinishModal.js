import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { CheckCircle, AlertTriangle, XCircle, AlertOctagon, Check, X, Loader2, Save, } from "lucide-react";
import { serverTimestamp, addDoc, collection } from "firebase/firestore";
import { db, auth, logActivity } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";
import { REJECTION_REASONS } from "../../../utils/workstationLogic";
import { useNotifications } from "../../../contexts/NotificationContext";
import { useTranslation } from "react-i18next";
const REJECTION_REASON_FALLBACKS = {
    "rejection.surfaceDamage": "Oppervlakteschade",
    "rejection.dimensionDeviation": "Maatafwijking (TW/TF/W)",
    "rejection.qualityInsufficient": "Kwaliteit onvoldoende",
    "rejection.incorrectLabel": "Onjuist label",
    "rejection.linerDamaged": "Liner beschadigd",
    "rejection.other": "Overig",
};
const PostProcessingFinishModal = ({ product, onClose, onConfirm, currentStation, }) => {
    const { t } = useTranslation();
    const { showWarning } = useNotifications();
    const [status, setStatus] = useState("completed");
    const [selectedReasons, setSelectedReasons] = useState([]);
    const [note, setNote] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const getReasonLabel = (reasonKey) => {
        const translated = t(reasonKey);
        if (translated && translated !== reasonKey)
            return translated;
        return REJECTION_REASON_FALLBACKS[reasonKey] || reasonKey;
    };
    const toggleReason = (reason) => {
        setSelectedReasons((prev) => prev.includes(reason)
            ? prev.filter((r) => r !== reason)
            : [...prev, reason]);
    };
    const handleConfirm = async () => {
        if (status !== "completed" && selectedReasons.length === 0) {
            showWarning("Selecteer minimaal één reden voor afkeur", "Incompleet");
            return;
        }
        setIsProcessing(true);
        // Definitieve afkeur + order-update lopen server-side via callable in onConfirm.
        // Stuur notificatie naar teamleider bij afkeur
        if (status === "rejected" || status === "temp_reject") {
            try {
                await addDoc(collection(db, ...PATHS.MESSAGES), {
                    to: "FITTINGS_TEAM",
                    subject: status === "rejected" ? "Definitieve Afkeur Melding" : "Tijdelijke Afkeur Melding",
                    content: `Product ${product?.lotNumber} is ${status === "rejected" ? "afgekeurd" : "tijdelijk afgekeurd"} op station ${currentStation}. Reden: ${selectedReasons.map((r) => getReasonLabel(r)).join(", ")}`,
                    type: "alert",
                    priority: "high",
                    read: false,
                    timestamp: serverTimestamp()
                });
            }
            catch (e) {
                console.error("Kon notificatie niet versturen", e);
            }
        }
        await logActivity(auth.currentUser?.uid || "system", status === "completed" ? "POST_PROCESS_COMPLETE" : status === "temp_reject" ? "QUALITY_TEMP_REJECT" : "QUALITY_REJECT_FINAL", `PostProcessing modal: lot ${product?.lotNumber || product?.id}, station ${currentStation}, status ${status}, reasons ${selectedReasons.join(", ") || "-"}`);
        await onConfirm(status, { reasons: selectedReasons, note });
        setIsProcessing(false);
    };
    // Bepaal tekst voor de groene knop
    const getOkButtonText = () => {
        if (currentStation === "BM01")
            return "Afronden / Gereed";
        return "Naar Eindinspectie (BM01)";
    };
    return (_jsx("div", { className: "fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-2 sm:p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col border border-slate-200 max-h-[96dvh]", children: [_jsxs("div", { className: "bg-slate-50 px-3 py-2.5 sm:px-6 sm:py-4 border-b border-slate-200 flex justify-between items-center shrink-0", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-base sm:text-xl font-black text-slate-800 uppercase tracking-tight", children: "Kwaliteitscontrole & Afronden" }), _jsx("p", { className: "text-[11px] sm:text-xs text-slate-500 font-mono font-bold", children: product.lotNumber })] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-slate-200 rounded-full", children: _jsx(X, { size: 20, className: "text-slate-400" }) })] }), _jsxs("div", { className: "p-3 sm:p-6 space-y-3 sm:space-y-6 overflow-y-auto custom-scrollbar", children: [_jsxs("div", { className: "grid grid-cols-1 min-[480px]:grid-cols-3 gap-2 sm:gap-3", children: [_jsxs("button", { onClick: () => setStatus("completed"), className: `p-2 sm:p-3 rounded-xl border-2 flex flex-row min-[480px]:flex-col items-center justify-start min-[480px]:justify-center gap-2 transition-all ${status === "completed"
                                        ? "border-green-500 bg-green-50 text-green-700 shadow-md transform scale-105"
                                        : "border-slate-100 hover:border-green-200 text-slate-400"}`, children: [_jsx(CheckCircle, { size: 20, className: "sm:w-6 sm:h-6 shrink-0" }), _jsx("span", { className: "font-black text-[10px] sm:text-xs leading-tight uppercase text-left min-[480px]:text-center", children: "Goed" })] }), _jsxs("button", { onClick: () => setStatus("temp_reject"), className: `p-2 sm:p-3 rounded-xl border-2 flex flex-row min-[480px]:flex-col items-center justify-start min-[480px]:justify-center gap-2 transition-all ${status === "temp_reject"
                                        ? "border-orange-500 bg-orange-50 text-orange-700 shadow-md transform scale-105"
                                        : "border-slate-100 hover:border-orange-200 text-slate-400"}`, children: [_jsx(AlertTriangle, { size: 20, className: "sm:w-6 sm:h-6 shrink-0" }), _jsx("span", { className: "font-black text-[10px] sm:text-xs leading-tight uppercase text-left min-[480px]:text-center", children: "Tijdelijke afkeur" })] }), _jsxs("button", { onClick: () => setStatus("rejected"), className: `p-2 sm:p-3 rounded-xl border-2 flex flex-row min-[480px]:flex-col items-center justify-start min-[480px]:justify-center gap-2 transition-all ${status === "rejected"
                                        ? "border-red-500 bg-red-50 text-red-700 shadow-md transform scale-105"
                                        : "border-slate-100 hover:border-red-200 text-slate-400"}`, children: [_jsx(XCircle, { size: 20, className: "sm:w-6 sm:h-6 shrink-0" }), _jsx("span", { className: "font-black text-[10px] sm:text-xs leading-tight uppercase text-left min-[480px]:text-center", children: "Definitieve afkeur" })] })] }), status !== "completed" && (_jsxs("div", { className: "bg-red-50 p-3 sm:p-4 rounded-xl border border-red-100 animate-in slide-in-from-top-2", children: [_jsxs("h4", { className: "font-bold text-red-900 text-[11px] sm:text-xs uppercase mb-2.5 sm:mb-3 flex items-center gap-2", children: [_jsx(AlertOctagon, { size: 14 }), " Reden van", " ", status === "temp_reject" ? "Tijdelijke afkeur" : "Definitieve afkeur"] }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-2", children: REJECTION_REASONS.map((reason) => (_jsxs("div", { onClick: () => toggleReason(reason), className: `p-2 rounded-lg border cursor-pointer text-xs font-medium transition-all flex items-center gap-2 ${selectedReasons.includes(reason)
                                            ? "bg-white border-red-500 text-red-700 shadow-sm"
                                            : "bg-white/50 border-transparent text-slate-500 hover:bg-white"}`, children: [_jsx("div", { className: `w-3 h-3 rounded-full border flex items-center justify-center ${selectedReasons.includes(reason)
                                                    ? "bg-red-500 border-red-500"
                                                    : "border-slate-300"}`, children: selectedReasons.includes(reason) && (_jsx(Check, { size: 8, className: "text-white" })) }), getReasonLabel(reason)] }, reason))) })] })), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold uppercase text-slate-400 mb-2", children: "Opmerking (Optioneel)" }), _jsx("textarea", { value: note, onChange: (e) => setNote(e.target.value), className: "w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none", placeholder: "Bijv. kras op flensvlak...", rows: 3 })] })] }), _jsxs("div", { className: "bg-slate-50 p-3 sm:p-4 border-t border-slate-200 flex flex-col-reverse min-[480px]:flex-row min-[480px]:justify-end gap-2 sm:gap-3 shrink-0", children: [_jsx("button", { onClick: onClose, className: "w-full min-[480px]:w-auto px-4 py-2 rounded-lg text-slate-500 font-bold hover:bg-slate-200 text-sm", children: "Annuleren" }), _jsxs("button", { onClick: handleConfirm, disabled: isProcessing, className: `w-full min-[480px]:w-auto px-4 sm:px-6 py-2 rounded-lg font-bold text-white text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 ${status === "completed"
                                ? "bg-blue-600 hover:bg-blue-700"
                                : "bg-red-600 hover:bg-red-700"}`, children: [isProcessing ? (_jsx(Loader2, { size: 14, className: "animate-spin" })) : (_jsx(Save, { size: 16 })), status === "completed" ? getOkButtonText() : "Opslaan"] })] })] }) }));
};
export default PostProcessingFinishModal;
