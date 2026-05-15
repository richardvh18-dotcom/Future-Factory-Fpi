import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useNotifications } from '../../contexts/NotificationContext';
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Edit2, Trash2, CheckCircle, Search, ChevronDown, AlertOctagon, Package, Filter, ShieldCheck, History, Box, Layers, Loader2, } from "lucide-react";
import { verifyProduct } from "../../utils/productHelpers";
import VerificationBadge from "./VerificationBadge.tsx";
import { VERIFICATION_STATUS } from "../../data/constants";
/**
 * AdminProductListView V6.0 - Advanced Catalog Manager
 * Toont de productcatalogus uit de root: /future-factory/production/products/
 * Bevat gegroepeerde weergave en verificatie-workflow.
 */
const AdminProductListView = ({ products = [], onDelete, onEdit, onRefresh, user }) => {
    const { t } = useTranslation();
    const { notify } = useNotifications();
    const [processingId, setProcessingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterType, setFilterType] = useState("All");
    const safeProducts = useMemo(() => (Array.isArray(products) ? products.filter((p) => p && typeof p === "object") : []), [products]);
    // State voor open/dichtgeklapte groepen (Standaard: eerste groep open)
    const [expandedGroups, setExpandedGroups] = useState({
        "⚠️ Te Verifiëren": true,
    });
    // 1. FILTERING
    const filteredProducts = useMemo(() => {
        if (!safeProducts.length)
            return [];
        const term = searchTerm.toLowerCase();
        const includesTerm = (value) => String(value || "").toLowerCase().includes(term);
        return safeProducts.filter((product) => {
            const matchesSearch = includesTerm(product.name) ||
                includesTerm(product.displayId) ||
                includesTerm(product.articleCode) ||
                includesTerm(product.extraCode);
            const matchesType = filterType === "All" || product.type === filterType;
            return matchesSearch && matchesType;
        });
    }, [safeProducts, searchTerm, filterType]);
    // 2. GROUPING LOGIC
    const groupedData = useMemo(() => {
        const groups = {};
        const PENDING_KEY = "⚠️ Te Verifiëren";
        filteredProducts.forEach((product) => {
            let groupKey = product.type || "Overige";
            if (product.verificationStatus === VERIFICATION_STATUS.PENDING) {
                groupKey = PENDING_KEY;
            }
            if (!groups[groupKey])
                groups[groupKey] = [];
            groups[groupKey].push(product);
        });
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            if (a === PENDING_KEY)
                return -1;
            if (b === PENDING_KEY)
                return 1;
            return a.localeCompare(b);
        });
        return { groups, sortedKeys, PENDING_KEY };
    }, [filteredProducts]);
    const toggleGroup = (groupKey) => {
        setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
    };
    const handleEditClick = (event, product) => {
        event.stopPropagation();
        if (onEdit)
            onEdit(product);
    };
    const handleDeleteClick = (event, productId) => {
        event.stopPropagation();
        if (typeof onDelete === "function") {
            onDelete(productId);
        }
    };
    const handleVerify = async (product) => {
        if (!user)
            return;
        setProcessingId(product.id);
        try {
            // De helper 'verifyProduct' schrijft direct naar de nieuwe root
            const result = await verifyProduct(product.id, user, product);
            if (!result.success) {
                notify(result.message);
            }
            else {
                if (typeof onRefresh === "function") {
                    await onRefresh();
                }
                notify("Product succesvol geverifieerd.");
            }
        }
        catch (error) {
            console.error("Verificatie fout:", error);
            notify(`Verificatie mislukt: ${error?.message || "Onbekende fout"}`);
        }
        finally {
            setProcessingId(null);
        }
    };
    const canVerify = (product) => {
        if (product.verificationStatus !== VERIFICATION_STATUS.PENDING)
            return false;
        // Blokkeer als de huidige gebruiker de laatste wijziging heeft gedaan (4-eyes principle)
        // TIJDELIJK UITGESCHAKELD: Zelf-verificatie toegestaan voor testen
        // if (product.lastModifiedBy === user?.uid) return false;
        return true;
    };
    const uniqueTypes = useMemo(() => ["All", ...new Set(safeProducts.map((p) => p.type).filter(Boolean))].sort(), [safeProducts]);
    return (_jsxs("div", { className: "h-full flex flex-col animate-in fade-in duration-500 text-left", children: [_jsxs("div", { className: "mb-8 flex flex-col lg:flex-row justify-between items-stretch gap-4 bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm", children: [_jsxs("div", { className: "relative flex-1 group", children: [_jsx(Search, { className: "absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors", size: 20 }), _jsx("input", { type: "text", placeholder: t('adminProductListView.searchPlaceholder'), className: "w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-[22px] outline-none focus:border-blue-500 focus:bg-white transition-all font-bold text-sm shadow-inner placeholder:text-slate-300", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value) })] }), _jsxs("div", { className: "flex gap-3", children: [_jsxs("div", { className: "relative", children: [_jsx(Filter, { className: "absolute left-4 top-1/2 -translate-y-1/2 text-slate-400", size: 16 }), _jsx("select", { className: "pl-10 pr-10 py-4 bg-white border-2 border-slate-100 rounded-[22px] text-xs font-black uppercase tracking-widest outline-none focus:border-blue-500 appearance-none cursor-pointer min-w-[180px] shadow-sm", value: filterType, onChange: (e) => setFilterType(e.target.value), children: uniqueTypes.map((typeOption) => (_jsx("option", { value: typeOption, children: typeOption === "All" ? t('adminProductListView.allTypes') : typeOption }, typeOption))) }), _jsx(ChevronDown, { size: 14, className: "absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" })] }), _jsxs("div", { className: "hidden xl:flex items-center px-6 bg-slate-900 rounded-[22px] text-white gap-4", children: [_jsxs("div", { className: "flex flex-col", children: [_jsx("span", { className: "text-[8px] font-black text-blue-400 uppercase tracking-widest", children: t('adminProductListView.totalItems') }), _jsx("span", { className: "text-sm font-black italic", children: products.length })] }), _jsx("div", { className: "w-px h-6 bg-white/10" }), _jsxs("div", { className: "flex flex-col", children: [_jsx("span", { className: "text-[8px] font-black text-orange-400 uppercase tracking-widest", children: t('adminProductListView.toValidate') }), _jsx("span", { className: "text-sm font-black italic", children: products.filter((p) => p.verificationStatus === VERIFICATION_STATUS.PENDING).length })] })] })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto space-y-6 custom-scrollbar pb-32", children: groupedData.sortedKeys.length === 0 ? (_jsxs("div", { className: "p-20 text-center flex flex-col items-center justify-center bg-white rounded-[40px] border-2 border-dashed border-slate-100 opacity-50", children: [_jsx(Package, { size: 64, className: "text-slate-200 mb-4" }), _jsx("p", { className: "text-sm font-black uppercase tracking-[0.2em] text-slate-400 italic", children: t('adminProductListView.noProductsFound') })] })) : (groupedData.sortedKeys.map((groupKey) => {
                    const isPendingGroup = groupKey === groupedData.PENDING_KEY;
                    const items = groupedData.groups[groupKey];
                    const isOpen = expandedGroups[groupKey];
                    return (_jsxs("div", { className: `bg-white rounded-[35px] border-2 transition-all duration-500 overflow-hidden ${isPendingGroup
                            ? "border-orange-100 shadow-xl shadow-orange-900/5 ring-4 ring-orange-500/5"
                            : "border-slate-50 shadow-sm"}`, children: [_jsxs("button", { onClick: () => toggleGroup(groupKey), className: `w-full flex items-center justify-between p-6 text-left transition-all ${isOpen
                                    ? "bg-slate-50/50 border-b border-slate-50"
                                    : "hover:bg-slate-50"}`, children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: `p-2.5 rounded-xl transition-colors ${isPendingGroup
                                                    ? "bg-orange-500 text-white shadow-lg"
                                                    : "bg-slate-900 text-white"}`, children: isPendingGroup ? (_jsx(AlertOctagon, { size: 18 })) : (_jsx(Layers, { size: 18 })) }), _jsxs("div", { children: [_jsx("h3", { className: `font-black uppercase italic tracking-tighter text-base leading-none ${isPendingGroup ? "text-orange-700" : "text-slate-800"}`, children: groupKey }), _jsxs("p", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1", children: [items.length, " ", t('adminProductListView.productsInCategory')] })] })] }), _jsxs("div", { className: "flex items-center gap-4", children: [isPendingGroup && (_jsxs("span", { className: "hidden sm:flex items-center gap-2 px-4 py-1.5 bg-orange-100 text-orange-600 rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse border border-orange-200", children: [_jsx(ShieldCheck, { size: 12 }), " ", t('adminProductListView.qualityControlRequired')] })), _jsx("div", { className: `p-2 rounded-full bg-slate-100 text-slate-400 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`, children: _jsx(ChevronDown, { size: 20 }) })] })] }), isOpen && (_jsx("div", { className: "overflow-x-auto animate-in slide-in-from-top-2 duration-300", children: _jsxs("table", { className: "w-full text-left text-xs border-collapse", children: [_jsx("thead", { className: "bg-slate-50/50 border-b border-slate-50 font-black text-slate-400 uppercase tracking-[0.2em]", children: _jsxs("tr", { children: [_jsx("th", { className: "px-8 py-4 w-1/4", children: t('adminProductListView.identification') }), _jsx("th", { className: "px-8 py-4", children: t('adminProductListView.statusIntegrity') }), _jsx("th", { className: "px-8 py-4", children: t('adminProductListView.configuration') }), _jsx("th", { className: "px-8 py-4", children: t('adminProductListView.connection') }), _jsx("th", { className: "px-8 py-4 text-right", children: t('adminProductListView.management') })] }) }), _jsx("tbody", { className: "divide-y divide-slate-50", children: items.map((p) => (_jsxs("tr", { className: "hover:bg-blue-50/30 transition-all group border-l-4 border-l-transparent hover:border-l-blue-500", children: [_jsx("td", { className: "px-8 py-5", children: _jsxs("div", { className: "flex flex-col", children: [_jsx("span", { className: "font-black text-slate-900 text-base italic tracking-tighter leading-none mb-1.5", children: p.displayId || p.name || p.id }), p.articleCode && (_jsxs("div", { className: "flex items-center gap-1.5 text-[9px] font-mono font-bold text-slate-400 uppercase", children: [_jsx(Box, { size: 10 }), " ", p.articleCode] }))] }) }), _jsx("td", { className: "px-8 py-5", children: _jsx(VerificationBadge, { status: p.verificationStatus, verifiedBy: p.verifiedBy }) }), _jsx("td", { className: "px-8 py-5", children: _jsxs("div", { className: "flex flex-col gap-1.5", children: [_jsxs("div", { className: "flex items-center gap-2 font-mono font-bold text-slate-600", children: [_jsxs("span", { className: "bg-slate-100 px-2 py-1 rounded text-slate-800 italic", children: ["DN ", p.dn || p.diameter] }), _jsx("span", { className: "text-slate-300", children: "/" }), _jsxs("span", { className: "bg-blue-50 px-2 py-1 rounded text-blue-700 italic", children: ["PN ", p.pn || p.pressure || "-"] })] }), p.extraCode && p.extraCode !== "-" && (_jsxs("span", { className: "text-[9px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded w-fit border border-purple-100", children: [t('adminProductListView.code'), ": ", p.extraCode] }))] }) }), _jsx("td", { className: "px-8 py-5", children: _jsx("span", { className: "px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase italic tracking-widest shadow-sm", children: p.couplingType || p.connection || t('adminProductListView.standard') }) }), _jsx("td", { className: "px-8 py-5 text-right", children: _jsxs("div", { className: "flex justify-end items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all", children: [canVerify(p) && (_jsxs("button", { type: "button", onClick: () => handleVerify(p), disabled: processingId === p.id, className: "bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center gap-2 hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all active:scale-95 disabled:opacity-50", children: [processingId === p.id ? (_jsx(Loader2, { size: 14, className: "animate-spin" })) : (_jsx(CheckCircle, { size: 14 })), t('adminProductListView.verify')] })), _jsx("button", { type: "button", onClick: (event) => handleEditClick(event, p), className: "p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all", title: t('adminProductListView.edit'), children: _jsx(Edit2, { size: 18 }) }), _jsx("button", { type: "button", onClick: (event) => handleDeleteClick(event, p.id), className: "p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all", title: t('adminProductListView.deleteFromRoot'), children: _jsx(Trash2, { size: 18 }) })] }) })] }, p.id))) })] }) }))] }, groupKey));
                })) }), _jsx("div", { className: "fixed bottom-8 left-1/2 -translate-x-1/2 z-10 w-full max-w-2xl px-6 pointer-events-none", children: _jsxs("div", { className: "bg-slate-900/90 backdrop-blur-md p-4 rounded-[25px] border border-white/10 shadow-2xl flex items-center justify-between text-white overflow-hidden relative", children: [_jsx("div", { className: "absolute top-0 right-0 p-4 opacity-5 rotate-12", children: _jsx(ShieldCheck, { size: 60 }) }), _jsxs("div", { className: "flex items-center gap-4 relative z-10", children: [_jsx("div", { className: "p-2 bg-blue-600 rounded-xl shadow-lg", children: _jsx(History, { size: 16 }) }), _jsxs("div", { className: "text-left", children: [_jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-blue-400 leading-none mb-1", children: t('adminProductListView.auditProtocol') }), _jsx("p", { className: "text-[9px] font-bold text-slate-400 uppercase tracking-tighter italic leading-none", children: t('adminProductListView.catalogLiveFrom') })] })] }), _jsx("div", { className: "text-right relative z-10 pr-2", children: _jsxs("span", { className: "text-[10px] font-black text-emerald-400 uppercase tracking-widest", children: [filteredProducts.length, " ", t('adminProductListView.items')] }) })] }) })] }));
};
export default AdminProductListView;
