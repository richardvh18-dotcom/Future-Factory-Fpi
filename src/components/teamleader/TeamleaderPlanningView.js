import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ClipboardList } from "lucide-react";
import PlanningSidebar from "../digitalplanning/PlanningSidebar";
import OrderDetail from "../digitalplanning/OrderDetail";
const TeamleaderPlanningView = ({ orders, products, selectedOrderId, onSelectOrder, selectedOrder }) => {
    return (_jsxs("div", { className: "h-full flex gap-6 overflow-hidden", children: [_jsx("div", { className: "w-80 shrink-0 flex flex-col min-h-0", children: _jsx(PlanningSidebar, { orders: orders, selectedOrderId: selectedOrderId, onSelect: onSelectOrder }) }), _jsx("div", { className: "flex-1 bg-white rounded-[40px] border border-slate-200 shadow-sm flex flex-col overflow-hidden", children: selectedOrder ? (_jsx(OrderDetail, { order: selectedOrder, products: products, onClose: () => onSelectOrder(null), isManager: true, showAllStations: true })) : (_jsxs("div", { className: "flex-1 flex flex-col justify-center items-center opacity-40 italic text-center", children: [_jsx(ClipboardList, { size: 64, className: "mb-4 text-slate-300" }), _jsx("p", { className: "font-black uppercase tracking-widest text-xs text-slate-400", children: "Selecteer een order uit de lijst" })] })) })] }));
};
export default TeamleaderPlanningView;
