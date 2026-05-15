import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { X, ArrowRight, Building2, Cpu } from "lucide-react";
import ConfirmationModal from "./modals/ConfirmationModal.tsx";
const ProductMoveModal = ({ product, onClose, onMove, allowedStations = [], currentDepartment }) => {
    const { t } = useTranslation();
    const [customStation, setCustomStation] = useState("");
    const [stationToConfirm, setStationToConfirm] = useState(null);
    const departments = [
        { id: "FITTINGS", label: "Fittings", inbox: "FITTINGS_INBOX" },
        { id: "PIPES", label: "Pipes", inbox: "PIPES_INBOX" },
        { id: "SPOOLS", label: "Spools", inbox: "SPOOLS_INBOX" }
    ];
    // Filter out current department from "Other Departments" list
    const otherDepartments = useMemo(() => {
        if (!currentDepartment)
            return departments;
        return departments.filter(d => d.id.toLowerCase() !== currentDepartment.toLowerCase());
    }, [currentDepartment]);
    const handleStationClick = (stationName) => {
        if (onMove) {
            setStationToConfirm(stationName);
        }
    };
    const handleConfirmMove = () => {
        if (stationToConfirm) {
            onMove(product.lotNumber, stationToConfirm);
            onClose();
        }
    };
    return (_jsxs("div", { className: "fixed inset-0 z-[500] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in", children: [_jsxs("div", { className: "bg-white rounded-[24px] sm:rounded-[30px] shadow-2xl w-full max-w-2xl p-5 sm:p-8 max-h-[90vh] overflow-y-auto custom-scrollbar", children: [_jsxs("div", { className: "flex justify-between items-center mb-6", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-2xl font-black text-slate-800 uppercase italic", children: t("digitalplanning.move_modal.title", "Verplaats Product") }), _jsxs("p", { className: "text-sm text-slate-500 font-bold", children: ["Lot: ", product?.lotNumber, product?.currentStation && (_jsxs("span", { className: "ml-2 text-slate-400 font-normal", children: ["\u2022 Huidig: ", product.currentStation] }))] })] }), _jsx("button", { onClick: onClose, className: "p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors", children: _jsx(X, { size: 24 }) })] }), _jsxs("div", { className: "mb-8", children: [_jsxs("h4", { className: "text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2", children: [_jsx(Cpu, { size: 14 }), " Stations in ", currentDepartment || "Afdeling"] }), _jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-3 gap-3", children: [allowedStations.sort((a, b) => (a.name || "").localeCompare(b.name || "")).map((station) => (_jsx("button", { onClick: () => handleStationClick(station.name || station.id), className: "p-4 bg-slate-50 hover:bg-blue-50 border-2 border-slate-100 hover:border-blue-200 rounded-2xl text-sm font-bold text-slate-700 hover:text-blue-700 transition-all uppercase text-center", children: station.name || station.id }, station.id))), allowedStations.length === 0 && (_jsx("div", { className: "col-span-full text-center py-4 text-slate-400 italic text-sm", children: "Geen stations gevonden in deze afdeling." }))] })] }), _jsxs("div", { className: "mb-8", children: [_jsxs("h4", { className: "text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2", children: [_jsx(Building2, { size: 14 }), " Naar Andere Afdeling"] }), _jsx("div", { className: "grid grid-cols-2 gap-4", children: otherDepartments.map((dept) => (_jsxs("button", { onClick: () => handleStationClick(dept.inbox), className: "p-4 bg-white border-2 border-slate-200 hover:border-purple-400 hover:bg-purple-50 rounded-2xl flex items-center justify-between group transition-all", children: [_jsx("span", { className: "font-black text-slate-700 group-hover:text-purple-700 uppercase", children: dept.label }), _jsx(ArrowRight, { size: 18, className: "text-slate-300 group-hover:text-purple-500" })] }, dept.id))) })] }), _jsxs("div", { className: "pt-6 border-t border-slate-100", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block", children: "Of typ handmatig" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", value: customStation, onChange: (e) => setCustomStation(e.target.value), placeholder: "Station naam...", className: "flex-1 p-3 rounded-xl border-2 border-slate-100 focus:border-blue-500 outline-none font-bold text-slate-700" }), _jsx("button", { onClick: () => handleStationClick(customStation), disabled: !customStation, className: "px-6 bg-slate-900 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed", children: "Verplaats" })] })] })] }), _jsx(ConfirmationModal, { isOpen: !!stationToConfirm, onClose: () => setStationToConfirm(null), onConfirm: handleConfirmMove, title: "Product Verplaatsen", message: `Weet je zeker dat je dit product wilt verplaatsen naar ${stationToConfirm}?`, confirmText: "Ja, Verplaatsen" })] }));
};
export default ProductMoveModal;
