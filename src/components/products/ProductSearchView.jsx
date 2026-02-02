import React, { useState, useMemo } from "react";
import { useProductsData } from "../../hooks/useProductsData";
import ProductFilterSidebar from "./ProductFilterSidebar";
import ProductCard from "./ProductCard";
import ProductDetailModal from "./ProductDetailModal";
import { Search, ChevronDown, Layers, Box, Filter } from "lucide-react";
import { useAdminAuth } from "../../hooks/useAdminAuth";

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
    if (!products) return [];
    return products
      .map((p) => p[key])
      .filter((v) => v !== undefined && v !== null && v !== "")
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort();
  };

  const uniqueTypes = useMemo(() => getUniqueValues("type"), [products]);
  const uniqueDiameters = useMemo(
    () => getUniqueValues("diameter"),
    [products]
  );
  const uniquePressures = useMemo(
    () => getUniqueValues("pressure"),
    [products]
  );
  const uniqueConnections = useMemo(
    () => getUniqueValues("connection"),
    [products]
  );
  const uniqueAngles = useMemo(() => getUniqueValues("angle"), [products]);
  const uniqueRadii = useMemo(() => getUniqueValues("radius"), [products]);
  const uniqueBorings = useMemo(() => getUniqueValues("boring"), [products]);
  const uniqueLabels = useMemo(
    () => getUniqueValues("productLabel"),
    [products]
  );

  // --- 2. Filter Logica ---
  const filteredProducts = useMemo(() => {
    if (!products) return [];

    return products.filter((product) => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        (product.productCode &&
          product.productCode.toLowerCase().includes(searchLower)) ||
        (product.type && product.type.toLowerCase().includes(searchLower)) ||
        (product.description &&
          product.description.toLowerCase().includes(searchLower));

      if (!matchesSearch) return false;

      if (filters.type !== "-" && product.type !== filters.type) return false;
      if (
        filters.diameter !== "-" &&
        String(product.diameter) !== filters.diameter
      )
        return false;
      if (
        filters.pressure !== "-" &&
        String(product.pressure) !== filters.pressure
      )
        return false;
      if (
        filters.connection !== "-" &&
        product.connection !== filters.connection
      )
        return false;
      if (filters.angle !== "-" && String(product.angle) !== filters.angle)
        return false;
      if (filters.radius !== "-" && String(product.radius) !== filters.radius)
        return false;
      if (filters.boring !== "-" && product.boring !== filters.boring)
        return false;
      if (
        filters.productLabel !== "-" &&
        product.productLabel !== filters.productLabel
      )
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

      if (!groups[groupName]) groups[groupName] = [];
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

  // --- Render ---
  if (loading)
    return (
      <div className="p-10 text-center text-slate-500">Catalogus laden...</div>
    );
  if (error)
    return (
      <div className="p-10 text-center text-red-500">
        Fout bij laden: {error}
      </div>
    );

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-50 overflow-hidden relative">
      {/* 1. De Filter Sidebar */}
      <ProductFilterSidebar
        isOpen={showFilters}
        toggleSidebar={() => setShowFilters(!showFilters)}
        filters={filters}
        setFilters={setFilters}
        uniqueTypes={uniqueTypes}
        uniqueDiameters={uniqueDiameters}
        uniquePressures={uniquePressures}
        uniqueConnections={uniqueConnections}
        uniqueAngles={uniqueAngles}
        uniqueRadii={uniqueRadii}
        uniqueBorings={uniqueBorings}
        uniqueLabels={uniqueLabels}
      />

      {/* 2. Detail Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* 3. Hoofd Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbalk met Zoekveld & Filter Knop */}
        <div className="bg-white border-b border-slate-200 p-4 flex items-center justify-between gap-4 shrink-0 z-10">
          {/* Linker Kant: Filter Knop */}
          <button
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all font-bold text-xs uppercase tracking-wider border ${
              showFilters
                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
            }`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter
              size={16}
              className={showFilters ? "fill-emerald-600/20" : ""}
            />
            <span className="hidden sm:inline">Filters</span>
          </button>

          {/* Midden: Zoekbalk */}
          <div className="relative flex-1 max-w-2xl mx-auto">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Zoek op artikelnummer, type of omschrijving..."
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Rechter Kant: Teller */}
          <div className="hidden sm:flex items-center justify-end min-w-[80px]">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {filteredProducts.length} Items
            </span>
          </div>
        </div>

        {/* Scrollbaar Gebied met Groepen */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-40">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-20 m-6 bg-white rounded-[3rem] border-2 border-dashed border-slate-200 animate-in">
              <Box className="text-slate-200 mb-6" size={60} />
              <p className="text-slate-400 font-black uppercase tracking-widest text-[10px] italic text-center">
                Geen producten gevonden in de catalogus.
                <br />
                Probeer de filters aan te passen.
              </p>
              <button
                onClick={() => {
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
                }}
                className="mt-4 text-emerald-600 font-medium hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="space-y-4 text-left">
              {Object.entries(groupedProducts).map(([groupName, items]) => {
                const isExpanded = !!expandedGroups[groupName];

                return (
                  <div
                    key={groupName}
                    className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300"
                  >
                    <button
                      onClick={() => toggleGroup(groupName)}
                      className={`w-full flex items-center justify-between p-5 rounded-[2rem] border transition-all duration-300 ${
                        isExpanded
                          ? "bg-white border-slate-200 shadow-xl"
                          : "bg-white/50 border-transparent hover:bg-white hover:border-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-6">
                        <div
                          className={`p-3 rounded-2xl transition-all duration-500 shadow-sm ${
                            isExpanded
                              ? "bg-blue-600 text-white rotate-0"
                              : "bg-white text-slate-400 -rotate-90 border border-slate-100"
                          }`}
                        >
                          <ChevronDown size={20} strokeWidth={3} />
                        </div>

                        <div className="flex flex-col text-left">
                          <h3 className="text-[15px] font-black text-slate-900 uppercase italic tracking-wider flex items-center gap-4">
                            {groupName}
                            <span
                              className={`text-[9px] px-3 py-1 rounded-full normal-case font-black not-italic transition-all border ${
                                isExpanded
                                  ? "bg-blue-50 text-blue-600 border-blue-100"
                                  : "bg-slate-100 text-slate-500 border-slate-200"
                              }`}
                            >
                              {items.length} items
                            </span>
                          </h3>
                        </div>
                      </div>

                      <div className="h-px bg-slate-100 flex-1 mx-10 hidden lg:block opacity-60"></div>

                      <Layers
                        size={22}
                        className={`transition-all duration-500 ${
                          isExpanded
                            ? "text-blue-500 scale-110"
                            : "text-slate-200"
                        }`}
                      />
                    </button>

                    {isExpanded && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 px-2 animate-in slide-in-from-top-4">
                        {items.map((product) => (
                          <ProductCard
                            key={product.id || product.productCode}
                            product={product}
                            // FIX: Beide props meegeven om crashes te voorkomen
                            onSelect={() => setSelectedProduct(product)}
                            onClick={() => setSelectedProduct(product)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductSearchView;
