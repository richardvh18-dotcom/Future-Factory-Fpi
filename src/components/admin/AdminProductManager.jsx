import React, { useState } from "react";
import {
  Plus,
  ArrowLeft,
  Package,
  Loader2,
  ShieldCheck,
  Database,
  Search,
  LayoutDashboard,
  Zap,
} from "lucide-react";
import AdminProductListView from "./AdminProductListView";
import ProductForm from "./ProductForm";
import {
  addProduct,
  updateProduct,
  deleteProduct,
} from "../../utils/productHelpers";
import { useProductsData } from "../../hooks/useProductsData";

/**
 * AdminProductManager V6.2 - Core Catalog Controller
 * Beheert de orchestratie tussen de productlijst en het bewerkingsformulier.
 * Maakt gebruik van de nieuwe root-architectuur voor data-consistentie.
 */
const AdminProductManager = ({ user }) => {
  const [view, setView] = useState("list"); // 'list' of 'form'
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Haal live data op uit de root via de custom hook
  const { products, loading, refresh } = useProductsData(user);

  const handleCreateNew = () => {
    setSelectedProduct(null);
    setView("form");
  };

  const handleEdit = (product) => {
    setSelectedProduct(product);
    setView("form");
  };

  const handleCancel = () => {
    setSelectedProduct(null);
    setView("list");
  };

  const handleDelete = async (id) => {
    if (
      !window.confirm(
        "Weet je zeker dat je dit product wilt verwijderen uit de root database?"
      )
    )
      return;

    setActionLoading(true);
    try {
      await deleteProduct(id);
      if (refresh) await refresh();
    } catch (error) {
      console.error("Delete Error:", error);
      alert("Verwijderen mislukt: " + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSave = async (productData) => {
    setActionLoading(true);
    try {
      if (selectedProduct && selectedProduct.id) {
        await updateProduct(selectedProduct.id, productData);
      } else {
        await addProduct(productData);
      }

      handleCancel();
      if (refresh) await refresh();
    } catch (error) {
      console.error("Save Error:", error);
      alert("Opslaan mislukt: " + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col relative bg-slate-50 text-left animate-in fade-in duration-500">
      {/* === HEADER UNIT === */}
      <div className="bg-white border-b border-slate-200 p-8 flex flex-col md:flex-row justify-between items-center shrink-0 shadow-sm gap-6 relative z-10">
        <div className="flex items-center gap-6">
          <div className="p-4 bg-blue-600 text-white rounded-[20px] shadow-lg shadow-blue-200">
            <Package size={28} />
          </div>
          <div className="text-left">
            <h1 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
              Product <span className="text-blue-600">Manager</span>
            </h1>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-100 uppercase italic">
                <ShieldCheck size={10} /> Root Authorized
              </span>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                Systeem Catalogus v6.4
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleCreateNew}
          className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all active:scale-95 flex items-center gap-3"
        >
          <Plus size={18} strokeWidth={3} /> Nieuw Product Toevoegen
        </button>
      </div>

      {/* === MAIN CONTENT AREA === */}
      <div className="flex-1 overflow-hidden relative p-8 bg-slate-50/50">
        {/* Loading Overlay voor Globale Acties */}
        {actionLoading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/20 backdrop-blur-[2px] animate-in fade-in">
            <div className="bg-white p-8 rounded-[30px] shadow-2xl flex flex-col items-center gap-4">
              <Loader2 className="animate-spin text-blue-600" size={40} />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
                Database Bijwerken...
              </p>
            </div>
          </div>
        )}

        {/* De Product Lijst */}
        <div className="h-full bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden relative">
          {loading && !products?.length ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white gap-4">
              <Loader2 className="animate-spin text-blue-600" size={48} />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-300 italic">
                Catalogus Laden...
              </p>
            </div>
          ) : (
            <AdminProductListView
              products={products}
              onEdit={handleEdit}
              onDelete={handleDelete}
              user={user}
            />
          )}
        </div>
      </div>

      {/* === MODAL OVERLAY: PRODUCT FORM === */}
      {view === "form" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-6 animate-in fade-in duration-300">
          {/* Backdrop met Blur */}
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity"
            onClick={handleCancel}
          ></div>

          {/* Modal Container */}
          <div className="relative w-full h-full md:w-[96vw] md:h-[92vh] lg:max-w-screen-2xl bg-slate-50 md:rounded-[45px] shadow-[0_40px_100px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-500 border border-white/10">
            {/* Modal Top Bar */}
            <div className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Zap size={16} />
                </div>
                <h3 className="text-sm font-black uppercase italic text-slate-800 tracking-tight">
                  {selectedProduct
                    ? "Product Specificaties Wijzigen"
                    : "Nieuwe Configuratie Registreren"}
                </h3>
              </div>
              <button
                onClick={handleCancel}
                className="p-3 hover:bg-slate-100 rounded-2xl transition-all text-slate-400 hover:text-slate-900"
              >
                <X size={24} />
              </button>
            </div>

            {/* Formulier Content */}
            <div className="flex-1 overflow-hidden">
              <ProductForm
                initialData={selectedProduct}
                onSubmit={handleSave}
                onCancel={handleCancel}
                user={user}
              />
            </div>

            {/* Modal Bottom Guard */}
            <div className="h-4 bg-blue-600 w-full shrink-0"></div>
          </div>
        </div>
      )}

      {/* FOOTER AUDIT INFO */}
      <div className="bg-slate-950 p-4 border-t border-white/5 flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] px-10 shrink-0 relative z-10">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2">
            <Database size={14} className="text-blue-500" /> Storage: Cloud Root
          </span>
          <span className="flex items-center gap-2">
            <Zap size={14} className="text-emerald-500" /> Active Sync: Realtime
          </span>
        </div>
        <span className="opacity-30">Future Factory MES Core v6.11</span>
      </div>
    </div>
  );
};

/**
 * Interne X icon component voor de modal
 */
const X = ({ size, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

export default AdminProductManager;
