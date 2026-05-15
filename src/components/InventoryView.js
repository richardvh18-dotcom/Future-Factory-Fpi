import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { collection, onSnapshot } from "firebase/firestore";
import { db, appId } from "../config/firebase";
import { Box, MapPin, Wrench, Search, Truck } from "lucide-react";
const InventoryView = () => {
    const [items, setItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const { t } = useTranslation();
    useEffect(() => {
        const unsub = onSnapshot(collection(db, "artifacts", appId, "public", "data", "inventory"), (snap) => {
            setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, []);
    const getStatusColor = (status) => {
        switch (status) {
            case t('inventory.status.available', 'Available'): return "bg-emerald-100 text-emerald-700";
            case t('inventory.status.in_use', 'In Use'): return "bg-blue-100 text-blue-700";
            case t('inventory.status.maintenance', 'Maintenance'): return "bg-amber-100 text-amber-700";
            default: return "bg-slate-100 text-slate-700";
        }
    };
    return (_jsxs("div", { className: "max-w-7xl mx-auto p-6 font-sans", children: [_jsxs("header", { className: "mb-8 border-b-2 border-slate-900 pb-4 flex justify-between items-end", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-black text-slate-900 uppercase italic", children: t('inventory.title', 'Gereedschap & Voorraad') }), _jsx("p", { className: "text-slate-500 text-xs font-bold uppercase tracking-widest mt-1", children: t('inventory.subtitle', 'Materiaalbeheer & Locatie Tracking') })] }), _jsxs("div", { className: "relative w-72", children: [_jsx(Search, { className: "absolute left-3 top-3 text-slate-400", size: 18 }), _jsx("input", { className: "w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-sm text-sm", placeholder: t('inventory.search_placeholder', 'Zoek op ID of gereedschap...'), onChange: (e) => setSearchTerm(e.target.value) })] })] }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4", children: items
                    .filter((i) => i.name.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((item) => (_jsxs("div", { className: "bg-white border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all", children: [_jsxs("div", { className: "flex justify-between items-start mb-4", children: [_jsx("div", { className: "bg-slate-100 p-2 text-slate-600", children: item.category === "Tool" ? _jsx(Wrench, { size: 20 }) : _jsx(Box, { size: 20 }) }), _jsx("span", { className: `text-[10px] font-black uppercase px-2 py-1 ${getStatusColor(t(`inventory.status.${item.status.toLowerCase().replace(/ /g, '_')}`, item.status))}`, children: t(`inventory.status.${item.status.toLowerCase().replace(/ /g, '_')}`, item.status) })] }), _jsx("h3", { className: "font-black text-slate-800 uppercase text-sm mb-1", children: item.name }), _jsxs("p", { className: "text-[10px] text-slate-400 font-mono mb-4", children: [t('inventory.id', 'ID'), ": ", item.id] }), _jsxs("div", { className: "space-y-3 pt-4 border-t border-slate-50", children: [_jsxs("div", { className: "flex items-center gap-2 text-xs text-slate-600", children: [_jsx(MapPin, { size: 14, className: "text-blue-600" }), _jsx("span", { className: "font-bold", children: item.location })] }), _jsxs("div", { className: "flex items-center gap-2 text-xs text-slate-600", children: [_jsx(Truck, { size: 14, className: "text-slate-400" }), _jsxs("span", { children: [t('inventory.assigned_to', 'Toegewezen aan'), ": ", _jsx("strong", { children: item.assignedTo || t('inventory.nobody', 'Niemand') })] })] })] }), _jsxs("div", { className: "mt-5 grid grid-cols-2 gap-2", children: [_jsx("button", { className: "py-2 bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors", children: t('inventory.details', 'Details') }), _jsx("button", { className: "py-2 border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-colors", children: t('inventory.move', 'Verplaats') })] })] }, item.id))) })] }));
};
export default InventoryView;
