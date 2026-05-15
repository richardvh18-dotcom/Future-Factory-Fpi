import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Loader2, X, ImageIcon } from "lucide-react";
import { collection, query, where, limit, getDocs } from "firebase/firestore";
import { db } from "../../../config/firebase";
const getAppId = () => {
    if (typeof window !== "undefined" && window.__app_id)
        return window.__app_id;
    return "fittings-app-v1";
};
const OperatorLinkModal = ({ order, onClose, onLinkProduct }) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const searchCatalog = async () => {
        if (!searchQuery || searchQuery.length < 2)
            return;
        setSearching(true);
        try {
            const appId = getAppId();
            const productsRef = collection(db, "artifacts", appId, "public", "data", "products");
            const q = query(productsRef, where("name", ">=", searchQuery), where("name", "<=", searchQuery + "\uf8ff"), limit(10));
            const snapshot = await getDocs(q);
            setSearchResults(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
        catch (err) {
            console.error("Zoekfout:", err);
        }
        finally {
            setSearching(false);
        }
    };
    const handleSave = (product) => {
        onLinkProduct(order.id, product);
        onClose();
    };
    return (_jsx("div", { className: "fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200", children: _jsxs("div", { className: "bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 scale-100 animate-in zoom-in-95 flex flex-col max-h-[80vh]", children: [_jsxs("div", { className: "p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-black text-gray-800 uppercase italic tracking-tight", children: "Koppel Product" }), _jsxs("p", { className: "text-xs text-gray-500 font-medium font-mono", children: ["Order: ", order.orderId] })] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-gray-200 rounded-full transition-colors", children: _jsx(X, { className: "w-6 h-6 text-slate-500" }) })] }), _jsxs("div", { className: "p-8 overflow-y-auto custom-scrollbar", children: [_jsxs("div", { className: "flex gap-2 mb-6", children: [_jsx("input", { type: "text", placeholder: "Zoek op productnaam...", className: "flex-1 p-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none", value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), onKeyDown: (e) => e.key === "Enter" && searchCatalog(), autoFocus: true }), _jsx("button", { onClick: searchCatalog, disabled: searching, className: "bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50", children: searching ? _jsx(Loader2, { className: "animate-spin" }) : "Zoek" })] }), _jsx("div", { className: "space-y-2", children: searchResults.map((prod) => (_jsxs("div", { onClick: () => handleSave(prod), className: "p-3 border rounded-xl hover:bg-blue-50 flex justify-between items-center transition-colors cursor-pointer", children: [_jsxs("div", { className: "flex items-center gap-3", children: [prod.imageUrl ? (_jsx("img", { src: prod.imageUrl, alt: "", className: "w-10 h-10 object-cover rounded-lg bg-gray-100" })) : (_jsx("div", { className: "w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-300", children: _jsx(ImageIcon, { size: 16 }) })), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-bold text-gray-800", children: prod.name }), _jsx("p", { className: "text-xs text-gray-400", children: prod.articleCode })] })] }), _jsx("div", { className: "bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm", children: "Kies" })] }, prod.id))) })] })] }) }));
};
export default OperatorLinkModal;
