import React, { useState, useMemo } from "react";
import {
  Edit2,
  Trash2,
  CheckCircle,
  Search,
  ChevronDown,
  ChevronRight,
  AlertOctagon,
  Package,
  Filter,
  ShieldCheck,
  History,
  Box,
  Layers,
  Loader2,
} from "lucide-react";
import { verifyProduct } from "../../utils/productHelpers";
import VerificationBadge from "./VerificationBadge";
import { VERIFICATION_STATUS } from "../../data/constants";

/**
 * AdminProductListView V6.0 - Advanced Catalog Manager
 * Toont de productcatalogus uit de root: /future-factory/production/products/
 * Bevat gegroepeerde weergave en verificatie-workflow.
 */
const AdminProductListView = ({ products = [], onDelete, onEdit, user }) => {
  const [processingId, setProcessingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("All");

  // State voor open/dichtgeklapte groepen (Standaard: eerste groep open)
  const [expandedGroups, setExpandedGroups] = useState({
    "⚠️ Te Verifiëren": true,
  });

  // 1. FILTERING
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const term = searchTerm.toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        product.name?.toLowerCase().includes(term) ||
        product.displayId?.toLowerCase().includes(term) ||
        product.articleCode?.toLowerCase().includes(term) ||
        product.extraCode?.toLowerCase().includes(term);

      const matchesType = filterType === "All" || product.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [products, searchTerm, filterType]);

  // 2. GROUPING LOGIC
  const groupedData = useMemo(() => {
    const groups = {};
    const PENDING_KEY = "⚠️ Te Verifiëren";

    filteredProducts.forEach((product) => {
      let groupKey = product.type || "Overige";
      if (product.verificationStatus === VERIFICATION_STATUS.PENDING) {
        groupKey = PENDING_KEY;
      }

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(product);
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === PENDING_KEY) return -1;
      if (b === PENDING_KEY) return 1;
      return a.localeCompare(b);
    });

    return { groups, sortedKeys, PENDING_KEY };
  }, [filteredProducts]);

  const toggleGroup = (groupKey) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const handleVerify = async (product) => {
    if (!user) return;
    setProcessingId(product.id);
    try {
      // De helper 'verifyProduct' schrijft direct naar de nieuwe root
      const result = await verifyProduct(product.id, user, product);
      if (!result.success) alert(result.message);
    } catch (error) {
      console.error("Verificatie fout:", error);
    } finally {
      setProcessingId(null);
    }
  };

  const canVerify = (product) => {
    if (product.verificationStatus !== VERIFICATION_STATUS.PENDING)
      return false;
    // Blokkeer als de huidige gebruiker de laatste wijziging heeft gedaan (4-eyes principle)
    if (product.lastModifiedBy === user?.uid) return false;
    return true;
  };

  const uniqueTypes = useMemo(
    () => ["All", ...new Set(products.map((p) => p.type))].sort(),
    [products]
  );

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 text-left">
      {/* 1. ADVANCED TOOLBAR */}
      <div className="mb-8 flex flex-col lg:flex-row justify-between items-stretch gap-4 bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
        <div className="relative flex-1 group">
          <Search
            className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors"
            size={20}
          />
          <input
            type="text"
            placeholder="Zoek op ID, Type, Artikelcode of Omschrijving..."
            className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-[22px] outline-none focus:border-blue-500 focus:bg-white transition-all font-bold text-sm shadow-inner placeholder:text-slate-300"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <div className="relative">
            <Filter
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <select
              className="pl-10 pr-10 py-4 bg-white border-2 border-slate-100 rounded-[22px] text-xs font-black uppercase tracking-widest outline-none focus:border-blue-500 appearance-none cursor-pointer min-w-[180px] shadow-sm"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              {uniqueTypes.map((t) => (
                <option key={t} value={t}>
                  {t === "All" ? "Alle Types" : t}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
          </div>

          <div className="hidden xl:flex items-center px-6 bg-slate-900 rounded-[22px] text-white gap-4">
            <div className="flex flex-col">
              <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">
                Totaal Items
              </span>
              <span className="text-sm font-black italic">
                {products.length}
              </span>
            </div>
            <div className="w-px h-6 bg-white/10"></div>
            <div className="flex flex-col">
              <span className="text-[8px] font-black text-orange-400 uppercase tracking-widest">
                Te Valideren
              </span>
              <span className="text-sm font-black italic">
                {
                  products.filter(
                    (p) => p.verificationStatus === VERIFICATION_STATUS.PENDING
                  ).length
                }
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. GROUPED LIST AREA */}
      <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar pb-32">
        {groupedData.sortedKeys.length === 0 ? (
          <div className="p-20 text-center flex flex-col items-center justify-center bg-white rounded-[40px] border-2 border-dashed border-slate-100 opacity-50">
            <Package size={64} className="text-slate-200 mb-4" />
            <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 italic">
              Geen producten gevonden die voldoen aan de criteria
            </p>
          </div>
        ) : (
          groupedData.sortedKeys.map((groupKey) => {
            const isPendingGroup = groupKey === groupedData.PENDING_KEY;
            const items = groupedData.groups[groupKey];
            const isOpen = expandedGroups[groupKey];

            return (
              <div
                key={groupKey}
                className={`bg-white rounded-[35px] border-2 transition-all duration-500 overflow-hidden ${
                  isPendingGroup
                    ? "border-orange-100 shadow-xl shadow-orange-900/5 ring-4 ring-orange-500/5"
                    : "border-slate-50 shadow-sm"
                }`}
              >
                {/* GROUP HEADER */}
                <button
                  onClick={() => toggleGroup(groupKey)}
                  className={`w-full flex items-center justify-between p-6 text-left transition-all ${
                    isOpen
                      ? "bg-slate-50/50 border-b border-slate-50"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2.5 rounded-xl transition-colors ${
                        isPendingGroup
                          ? "bg-orange-500 text-white shadow-lg"
                          : "bg-slate-900 text-white"
                      }`}
                    >
                      {isPendingGroup ? (
                        <AlertOctagon size={18} />
                      ) : (
                        <Layers size={18} />
                      )}
                    </div>
                    <div>
                      <h3
                        className={`font-black uppercase italic tracking-tighter text-base leading-none ${
                          isPendingGroup ? "text-orange-700" : "text-slate-800"
                        }`}
                      >
                        {groupKey}
                      </h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {items.length} Producten in deze categorie
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {isPendingGroup && (
                      <span className="hidden sm:flex items-center gap-2 px-4 py-1.5 bg-orange-100 text-orange-600 rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse border border-orange-200">
                        <ShieldCheck size={12} /> Quality Control Required
                      </span>
                    )}
                    <div
                      className={`p-2 rounded-full bg-slate-100 text-slate-400 transition-transform duration-300 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    >
                      <ChevronDown size={20} />
                    </div>
                  </div>
                </button>

                {/* GROUP CONTENT */}
                {isOpen && (
                  <div className="overflow-x-auto animate-in slide-in-from-top-2 duration-300">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50/50 border-b border-slate-50 font-black text-slate-400 uppercase tracking-[0.2em]">
                        <tr>
                          <th className="px-8 py-4 w-1/4">Identificatie</th>
                          <th className="px-8 py-4">Status & Integriteit</th>
                          <th className="px-8 py-4">Configuratie</th>
                          <th className="px-8 py-4">Verbinding</th>
                          <th className="px-8 py-4 text-right">Beheer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {items.map((p) => (
                          <tr
                            key={p.id}
                            className="hover:bg-blue-50/30 transition-all group border-l-4 border-l-transparent hover:border-l-blue-500"
                          >
                            <td className="px-8 py-5">
                              <div className="flex flex-col">
                                <span className="font-black text-slate-900 text-base italic tracking-tighter leading-none mb-1.5">
                                  {p.displayId || p.name || p.id}
                                </span>
                                {p.articleCode && (
                                  <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-slate-400 uppercase">
                                    <Box size={10} /> {p.articleCode}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-8 py-5">
                              <VerificationBadge
                                status={p.verificationStatus}
                                verifiedBy={p.verifiedBy}
                              />
                            </td>
                            <td className="px-8 py-5">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2 font-mono font-bold text-slate-600">
                                  <span className="bg-slate-100 px-2 py-1 rounded text-slate-800 italic">
                                    DN {p.dn || p.diameter}
                                  </span>
                                  <span className="text-slate-300">/</span>
                                  <span className="bg-blue-50 px-2 py-1 rounded text-blue-700 italic">
                                    PN {p.pn || p.pressure || "-"}
                                  </span>
                                </div>
                                {p.extraCode && p.extraCode !== "-" && (
                                  <span className="text-[9px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded w-fit border border-purple-100">
                                    Code: {p.extraCode}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-8 py-5">
                              <span className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase italic tracking-widest shadow-sm">
                                {p.couplingType || p.connection || "Standard"}
                              </span>
                            </td>

                            <td className="px-8 py-5 text-right">
                              <div className="flex justify-end items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                {canVerify(p) && (
                                  <button
                                    onClick={() => handleVerify(p)}
                                    disabled={processingId === p.id}
                                    className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center gap-2 hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all active:scale-95 disabled:opacity-50"
                                  >
                                    {processingId === p.id ? (
                                      <Loader2
                                        size={14}
                                        className="animate-spin"
                                      />
                                    ) : (
                                      <CheckCircle size={14} />
                                    )}
                                    Verifiëren
                                  </button>
                                )}
                                <button
                                  onClick={() => onEdit && onEdit(p)}
                                  className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                  title="Bewerken"
                                >
                                  <Edit2 size={18} />
                                </button>
                                <button
                                  onClick={() => onDelete(p.id)}
                                  className="p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                  title="Verwijderen uit root"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 3. INFO FOOTER */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-10 w-full max-w-2xl px-6 pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md p-4 rounded-[25px] border border-white/10 shadow-2xl flex items-center justify-between text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-5 rotate-12">
            <ShieldCheck size={60} />
          </div>
          <div className="flex items-center gap-4 relative z-10">
            <div className="p-2 bg-blue-600 rounded-xl shadow-lg">
              <History size={16} />
            </div>
            <div className="text-left">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 leading-none mb-1">
                Audit Protocol V6
              </p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter italic leading-none">
                Catalogus Live vanuit: /future-factory/production/products
              </p>
            </div>
          </div>
          <div className="text-right relative z-10 pr-2">
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
              {filteredProducts.length} Items
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminProductListView;
