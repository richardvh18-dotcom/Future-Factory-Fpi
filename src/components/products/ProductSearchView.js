import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { useProductsData } from "../../hooks/useProductsData";
import ProductFilterSidebar from "./ProductFilterSidebar";
import ProductCard from "./ProductCard";
import ProductDetailModal from "./ProductDetailModal";
import { Search, ChevronDown, Layers, Box, Filter } from "lucide-react";
import { useAdminAuth } from "../../hooks/useAdminAuth";
// Simple AutoSizer implementation to avoid external dependency issues
const AutoSizer = ({ children }) => {
    const ref = useRef(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    useEffect(() => {
        if (!ref.current)
            return;
        const observer = new ResizeObserver((entries) => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                setSize({ width, height });
            }
        });
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);
    return (_jsx("div", { ref: ref, style: { width: "100%", height: "100%", overflow: "hidden" }, children: size.width > 0 && size.height > 0 && children(size) }));
};
// Simple List implementation to replace react-window and avoid import issues
const List = forwardRef(({ height, width, itemCount, itemSize, children: Row, itemData }, ref) => {
    useImperativeHandle(ref, () => ({
        resetAfterIndex: () => { },
        scrollTo: () => { },
        scrollToItem: () => { },
    }));
    return (_jsx("div", { style: { height, width, overflowY: 'auto', overflowX: 'hidden' }, children: Array.from({ length: itemCount }).map((_, index) => (_jsx("div", { style: { height: typeof itemSize === 'function' ? itemSize(index) : itemSize, width: '100%' }, children: _jsx(Row, { index: index, style: { height: '100%', width: '100%' }, data: itemData }) }, index))) }));
});
const ProductSearchView = ({ showFilters, setShowFilters }) => {
    const { user } = useAdminAuth();
    const { products, loading, error } = useProductsData(user);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [expandedGroups, setExpandedGroups] = useState({});
    // Standaard filters
    const [filters, setFilters] = useState({
        type: "-",
        diameter: "-",
        pressure: "-",
        connection: "-",
        angle: "-",
        radius: "-",
        boring: "-",
        productLabel: "-",
    });
    // --- 1. Unieke waardes berekenen ---
    const getUniqueValues = (key) => {
        if (!products)
            return [];
        return products
            .map((p) => p[key])
            .filter((v) => v !== undefined && v !== null && v !== "")
            .filter((value, index, self) => self.indexOf(value) === index)
            .sort();
    };
    const uniqueTypes = useMemo(() => getUniqueValues("type"), [products]);
    const uniqueDiameters = useMemo(() => getUniqueValues("diameter"), [products]);
    const uniquePressures = useMemo(() => getUniqueValues("pressure"), [products]);
    const uniqueConnections = useMemo(() => getUniqueValues("connection"), [products]);
    const uniqueAngles = useMemo(() => getUniqueValues("angle"), [products]);
    const uniqueRadii = useMemo(() => getUniqueValues("radius"), [products]);
    const uniqueBorings = useMemo(() => getUniqueValues("boring"), [products]);
    const uniqueLabels = useMemo(() => getUniqueValues("productLabel"), [products]);
    // --- 2. Filter Logica ---
    const filteredProducts = useMemo(() => {
        if (!products)
            return [];
        return products.filter((product) => {
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = !searchTerm ||
                (product.productCode &&
                    product.productCode.toLowerCase().includes(searchLower)) ||
                (product.type && product.type.toLowerCase().includes(searchLower)) ||
                (product.description &&
                    product.description.toLowerCase().includes(searchLower));
            if (!matchesSearch)
                return false;
            if (filters.type !== "-" && product.type !== filters.type)
                return false;
            if (filters.diameter !== "-" &&
                String(product.diameter) !== filters.diameter)
                return false;
            if (filters.pressure !== "-" &&
                String(product.pressure) !== filters.pressure)
                return false;
            if (filters.connection !== "-" &&
                product.connection !== filters.connection)
                return false;
            if (filters.angle !== "-" && String(product.angle) !== filters.angle)
                return false;
            if (filters.radius !== "-" && String(product.radius) !== filters.radius)
                return false;
            if (filters.boring !== "-" && product.boring !== filters.boring)
                return false;
            if (filters.productLabel !== "-" &&
                product.productLabel !== filters.productLabel)
                return false;
            return true;
        });
    }, [products, searchTerm, filters]);
    // --- 3. Groeperings Logica ---
    const groupedProducts = useMemo(() => {
        const groups = {};
        filteredProducts.forEach((p) => {
            const typeStr = p.type || "Overig";
            const angleStr = p.angle ? `${p.angle}°` : "";
            const connStr = p.connection || "";
            const groupName = `${typeStr} ${angleStr} ${connStr}`
                .trim()
                .toUpperCase();
            if (!groups[groupName])
                groups[groupName] = [];
            groups[groupName].push(p);
        });
        return Object.keys(groups)
            .sort()
            .reduce((acc, key) => {
            acc[key] = groups[key];
            return acc;
        }, {});
    }, [filteredProducts]);
    const toggleGroup = (groupName) => {
        setExpandedGroups((prev) => ({
            ...prev,
            [groupName]: !prev[groupName],
        }));
    };
    // --- 4. Virtualized List Component ---
    const VirtualizedProductList = ({ width, height, groupedProducts, expandedGroups, toggleGroup, onSelectProduct }) => {
        const columnCount = useMemo(() => {
            if (width >= 1280)
                return 5;
            if (width >= 1024)
                return 4;
            if (width >= 768)
                return 3;
            if (width >= 640)
                return 2;
            return 1;
        }, [width]);
        const flattenedItems = useMemo(() => {
            const items = [];
            Object.entries(groupedProducts).forEach(([groupName, products]) => {
                items.push({ type: 'header', groupName, count: products.length });
                if (expandedGroups[groupName]) {
                    for (let i = 0; i < products.length; i += columnCount) {
                        items.push({
                            type: 'row',
                            products: products.slice(i, i + columnCount),
                            key: `${groupName}_row_${i}`
                        });
                    }
                }
            });
            return items;
        }, [groupedProducts, expandedGroups, columnCount]);
        const listRef = useRef(null);
        useEffect(() => {
            if (listRef.current) {
                listRef.current.resetAfterIndex(0);
            }
        }, [flattenedItems]);
        const getItemSize = (index) => {
            const item = flattenedItems[index];
            return item.type === 'header' ? 100 : 450;
        };
        const Row = ({ index, style, data }) => {
            const { items, toggleGroup, expandedGroups, onSelectProduct, columnCount } = data;
            const item = items[index];
            if (item.type === 'header') {
                const isExpanded = !!expandedGroups[item.groupName];
                return (_jsx("div", { style: { ...style, height: 80 }, className: "px-4 md:px-8 py-2", children: _jsxs("button", { onClick: () => toggleGroup(item.groupName), className: `w-full flex items-center justify-between p-5 rounded-[2rem] border transition-all duration-300 ${isExpanded
                            ? "bg-white border-slate-200 shadow-xl"
                            : "bg-white/50 border-transparent hover:bg-white hover:border-slate-200"}`, children: [_jsxs("div", { className: "flex items-center gap-6", children: [_jsx("div", { className: `p-3 rounded-2xl transition-all duration-500 shadow-sm ${isExpanded
                                            ? "bg-blue-600 text-white rotate-0"
                                            : "bg-white text-slate-400 -rotate-90 border border-slate-100"}`, children: _jsx(ChevronDown, { size: 20, strokeWidth: 3 }) }), _jsx("div", { className: "flex flex-col text-left", children: _jsxs("h3", { className: "text-[15px] font-black text-slate-900 uppercase italic tracking-wider flex items-center gap-4", children: [item.groupName, _jsxs("span", { className: `text-[9px] px-3 py-1 rounded-full normal-case font-black not-italic transition-all border ${isExpanded
                                                        ? "bg-blue-50 text-blue-600 border-blue-100"
                                                        : "bg-slate-100 text-slate-500 border-slate-200"}`, children: [item.count, " items"] })] }) })] }), _jsx("div", { className: "h-px bg-slate-100 flex-1 mx-10 hidden lg:block opacity-60" }), _jsx(Layers, { size: 22, className: `transition-all duration-500 ${isExpanded ? "text-blue-500 scale-110" : "text-slate-200"}` })] }) }));
            }
            return (_jsx("div", { style: style, className: "px-4 md:px-8", children: _jsx("div", { className: "grid gap-6", style: { gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }, children: item.products.map(product => (_jsx(ProductCard, { product: product, onSelect: () => onSelectProduct(product), onClick: () => onSelectProduct(product) }, product.id || product.productCode))) }) }));
        };
        return (_jsx(List, { ref: listRef, height: height, width: width, itemCount: flattenedItems.length, itemSize: getItemSize, itemData: { items: flattenedItems, toggleGroup, expandedGroups, onSelectProduct, columnCount }, children: Row }));
    };
    // --- Render ---
    if (loading)
        return (_jsx("div", { className: "p-10 text-center text-slate-500", children: "Catalogus laden..." }));
    if (error)
        return (_jsxs("div", { className: "p-10 text-center text-red-500", children: ["Fout bij laden: ", error] }));
    return (_jsxs("div", { className: "flex h-[calc(100vh-64px)] bg-slate-50 overflow-hidden relative", children: [_jsx(ProductFilterSidebar, { isOpen: showFilters, toggleSidebar: () => setShowFilters(!showFilters), filters: filters, setFilters: setFilters, uniqueTypes: uniqueTypes, uniqueDiameters: uniqueDiameters, uniquePressures: uniquePressures, uniqueConnections: uniqueConnections, uniqueAngles: uniqueAngles, uniqueRadii: uniqueRadii, uniqueBorings: uniqueBorings, uniqueLabels: uniqueLabels }), selectedProduct && (_jsx(ProductDetailModal, { product: selectedProduct, onClose: () => setSelectedProduct(null) })), _jsxs("div", { className: "flex-1 flex flex-col min-w-0", children: [_jsxs("div", { className: "bg-white border-b border-slate-200 p-4 flex items-center justify-between gap-4 shrink-0 z-10", children: [_jsxs("button", { className: `flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all font-bold text-xs uppercase tracking-wider border ${showFilters
                                    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"}`, onClick: () => setShowFilters(!showFilters), children: [_jsx(Filter, { size: 16, className: showFilters ? "fill-emerald-600/20" : "" }), _jsx("span", { className: "hidden sm:inline", children: "Filters" })] }), _jsxs("div", { className: "relative flex-1 max-w-2xl mx-auto", children: [_jsx("div", { className: "absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none", children: _jsx(Search, { className: "h-5 w-5 text-slate-400" }) }), _jsx("input", { type: "text", placeholder: "Zoek op artikelnummer, type of omschrijving...", className: "w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value) })] }), _jsx("div", { className: "hidden sm:flex items-center justify-end min-w-[80px]", children: _jsxs("span", { className: "text-xs font-bold uppercase tracking-wider text-slate-400", children: [filteredProducts.length, " Items"] }) })] }), _jsx("div", { className: "flex-1 overflow-hidden pb-0", children: filteredProducts.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center p-20 m-6 bg-white rounded-[3rem] border-2 border-dashed border-slate-200 animate-in", children: [_jsx(Box, { className: "text-slate-200 mb-6", size: 60 }), _jsxs("p", { className: "text-slate-400 font-black uppercase tracking-widest text-[10px] italic text-center", children: ["Geen producten gevonden in de catalogus.", _jsx("br", {}), "Probeer de filters aan te passen."] }), _jsx("button", { onClick: () => {
                                        setFilters({
                                            type: "-",
                                            diameter: "-",
                                            pressure: "-",
                                            connection: "-",
                                            angle: "-",
                                            radius: "-",
                                            boring: "-",
                                            productLabel: "-",
                                        });
                                        setSearchTerm("");
                                    }, className: "mt-4 text-emerald-600 font-medium hover:underline", children: "Reset filters" })] })) : (_jsx(AutoSizer, { children: ({ height, width }) => (_jsx(VirtualizedProductList, { height: height, width: width, groupedProducts: groupedProducts, expandedGroups: expandedGroups, toggleGroup: toggleGroup, onSelectProduct: setSelectedProduct })) })) })] })] }));
};
export default ProductSearchView;
