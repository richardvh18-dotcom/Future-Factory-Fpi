import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BookOpen } from 'lucide-react';
const AdminReferenceTable = () => {
    return (_jsxs("div", { className: "p-6 h-full flex flex-col", children: [_jsxs("div", { className: "flex items-center gap-3 mb-6", children: [_jsx("div", { className: "p-2 bg-amber-100 rounded-lg", children: _jsx(BookOpen, { className: "text-amber-600", size: 24 }) }), _jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-slate-900", children: "Technische Encyclopedie" }), _jsx("p", { className: "text-slate-500 text-sm", children: "Referentietabellen voor boringen en mof-maten." })] })] }), _jsx("div", { className: "flex-1 bg-white rounded-xl shadow-sm border border-slate-200 p-8 flex items-center justify-center text-slate-400 italic", children: "Selecteer een tabel in het menu om data te bekijken." })] }));
};
export default AdminReferenceTable;
