import React, { useState, useMemo, useEffect } from "react";
import {
  Calendar,
  Search,
  ArrowRight,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  CalendarDays,
  Activity,
  Clock,
  FileText,
  Briefcase,
  Layers,
  Info,
  X,
  Printer,
  ExternalLink,
  MapPin,
} from "lucide-react";
import {
  format,
  isValid,
  getISOWeek,
  getISOWeekYear,
  addWeeks,
  subWeeks,
  parseISO,
  differenceInDays,
} from "date-fns";
import { nl } from "date-fns/locale";

// Importeer de centrale StatusBadge (vanuit ../common/)
import StatusBadge from "../common/StatusBadge";
import { syncMissingDrawings } from "../../../utils/planningSyncLogic";

const parseDateSafe = (dateInput) => {
  if (!dateInput) return null;
  if (dateInput.toDate) return dateInput.toDate();
  const d = new Date(dateInput);
  if (isValid(d)) return d;
  const dIso = parseISO(dateInput);
  return isValid(dIso) ? dIso : null;
};

// --- SUB-COMPONENT: DETAIL VIEW ---
const OrderDetailPane = ({ order, onClose }) => {
  if (!order) return null;

  return (
    <div className="flex flex-col h-full bg-slate-50 border-l border-slate-200 animate-in slide-in-from-right-4 duration-300">
      <div className="bg-white p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl">
            <FileText size={24} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase italic">
                {order.orderId}
              </h2>
              {/* StatusBadge ook hier toegevoegd voor duidelijkheid */}
              <StatusBadge status={order.status} />
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 text-left">
              Gedetailleerd Order Dossier
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-left">
        <div className="bg-white p-6 rounded-[30px] border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] flex items-center gap-2 mb-4">
            <Briefcase size={14} /> Project Informatie
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                Project ID
              </span>
              <span className="text-sm font-bold text-slate-700">
                {order.project || "-"}
              </span>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                Extra Code
              </span>
              <span className="text-sm font-black text-blue-600">
                {order.extraCode || "Geen"}
              </span>
            </div>
            <div className="col-span-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                Project Omschrijving
              </span>
              <span className="text-sm font-medium text-slate-600">
                {order.projectDesc || "Geen project beschrijving beschikbaar."}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 p-8 rounded-[40px] shadow-xl relative overflow-hidden text-white">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Layers size={160} />
          </div>
          <div className="relative z-10 space-y-4">
            <div>
              <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest block mb-2">
                Manufactured Item Code
              </span>
              <p className="text-xl font-mono font-black tracking-tight break-all text-white leading-tight">
                {order.itemCode || order.productId}
              </p>
            </div>
            <div className="pt-4 border-t border-white/10">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                Item Beschrijving
              </span>
              <p className="text-sm font-medium italic text-slate-300">
                {order.item || "-"}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[30px] border border-slate-200 shadow-sm">
          <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] flex items-center gap-2 mb-6">
            <Calendar size={14} /> Planning & Levering
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                Week
              </span>
              <span className="text-xl font-black text-slate-800 italic">
                W{order.weekNumber || "-"}
              </span>
            </div>
            <div>
              <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                Aantal
              </span>
              <span className="text-xl font-black text-slate-800 italic">
                {order.plan || 1} ST
              </span>
            </div>
            <div>
              <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                Machine
              </span>
              <span className="text-xl font-black text-blue-600 italic uppercase">
                {order.machine || "-"}
              </span>
            </div>
            <div className="col-span-2 pt-4 border-t border-slate-100">
              <div className="flex justify-between items-end">
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                    Uiterste Leverdatum
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    {order.deliveryDate
                      ? format(
                          parseDateSafe(order.deliveryDate),
                          "eeee dd MMMM yyyy",
                          { locale: nl }
                        )
                      : "-"}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-black text-blue-500 uppercase block mb-1">
                    Geplande Start (-2w)
                  </span>
                  <span className="text-sm font-black text-blue-600 underline underline-offset-4">
                    {order.plannedDate
                      ? format(parseDateSafe(order.plannedDate), "dd-MM-yyyy")
                      : "-"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {(order.poText || order.notes) && (
          <div className="bg-amber-50 p-6 rounded-[30px] border border-amber-100 space-y-3">
            <h3 className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-2">
              <Info size={14} /> PO Tekst / Instructies
            </h3>
            <p className="text-sm text-amber-900 font-medium leading-relaxed italic">
              {order.poText || order.notes}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 pt-4 pb-12">
          <button className="flex items-center justify-center gap-2 py-4 bg-white border-2 border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all">
            <Printer size={16} /> Werkbon Printen
          </button>
          {order.drawingUrl && (
            <a
              href={order.drawingUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 py-4 bg-blue-600 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
            >
              <MapPin size={16} /> Tekening{" "}
              <ExternalLink size={12} className="opacity-50" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
const PlanningListView = ({
  orders = [],
  onSelectOrder,
  selectedOrder,
  activeTab,
  onTabChange,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAllWeeks, setShowAllWeeks] = useState(false);

  const [referenceDate, setReferenceDate] = useState(new Date());
  const selectedWeek = getISOWeek(referenceDate);
  const selectedYear = getISOWeekYear(referenceDate);

  const appId = typeof __app_id !== "undefined" ? __app_id : "fittings-app-v1";

  // --- AUTOMATISCHE FILTER LOGICA ONDERSTEUNING ---
  // Bij Wikkelen/Lossen springt het filter op 'Alle'
  // Bij Te Doen springt het filter terug op de geselecteerde week
  useEffect(() => {
    if (activeTab === "actief" || activeTab === "lossen") {
      setShowAllWeeks(true);
    } else if (activeTab === "planning") {
      setShowAllWeeks(false);
    }
  }, [activeTab]);

  const getUrgencyStyles = (deliveryDate) => {
    const d = parseDateSafe(deliveryDate);
    if (!d) return "text-slate-400";
    const today = new Date();
    const daysUntilDelivery = differenceInDays(d, today);
    if (daysUntilDelivery <= 7) return "text-red-600 font-black";
    if (daysUntilDelivery <= 14) return "text-blue-600 font-black";
    return "text-slate-900 font-bold";
  };

  const handleSyncDrawings = async () => {
    setIsSyncing(true);
    try {
      await syncMissingDrawings(appId);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // DYNAMISCHE FILTER OP BASIS VAN TAB
      const targetStatus = activeTab === "planning" ? "pending" : "in_progress";
      if (order.status !== targetStatus) return false;

      const term = searchTerm.toLowerCase();
      const matchesSearch =
        (order.orderId || "").toLowerCase().includes(term) ||
        (order.itemCode || "").toLowerCase().includes(term) ||
        (order.item || "").toLowerCase().includes(term) ||
        (order.project || "").toLowerCase().includes(term);

      if (showAllWeeks) return matchesSearch;

      const orderWeek = order.weekNumber;
      if (orderWeek) return matchesSearch && orderWeek === selectedWeek;

      const d = parseDateSafe(order.plannedDate || order.deliveryDate);
      if (!d) return matchesSearch && searchTerm.length > 0;

      const matchesWeek =
        getISOWeek(d) === selectedWeek && getISOWeekYear(d) === selectedYear;
      return matchesSearch && matchesWeek;
    });
  }, [orders, searchTerm, selectedWeek, selectedYear, showAllWeeks, activeTab]);

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden">
      {/* LINKER KOLOM: DE LIJST */}
      <div
        className={`flex flex-col h-full bg-white transition-all duration-500 ${
          selectedOrder
            ? "w-full lg:w-1/2 border-r border-slate-200 shadow-2xl z-20"
            : "w-full"
        }`}
      >
        {/* TABS SELECTIE */}
        <div className="flex p-1 bg-slate-100/80 gap-1 border-b border-slate-200 shrink-0">
          <button
            onClick={() => onTabChange("planning")}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
              activeTab === "planning"
                ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                : "text-slate-500"
            }`}
          >
            Te Doen
          </button>
          <button
            onClick={() => onTabChange("actief")}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
              activeTab === "actief"
                ? "bg-white text-emerald-600 shadow-sm border border-slate-200"
                : "text-slate-500"
            }`}
          >
            Wikkelen
          </button>
          <button
            onClick={() => onTabChange("lossen")}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
              activeTab === "lossen"
                ? "bg-white text-orange-600 shadow-sm border border-slate-200"
                : "text-slate-500"
            }`}
          >
            Lossen
          </button>
        </div>

        {/* FILTER BALK */}
        <div className="p-4 border-b border-slate-100 space-y-4 bg-white shrink-0">
          <div className="flex justify-between items-center bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
            <button
              onClick={() => {
                setReferenceDate(subWeeks(referenceDate, 1));
                setShowAllWeeks(false);
              }}
              className="p-2 hover:bg-white rounded-xl text-slate-400 transition-all active:scale-90"
              disabled={showAllWeeks && activeTab !== "planning"}
            >
              <ChevronLeft size={20} />
            </button>
            <div className="text-center px-4">
              <span className="text-[10px] font-black uppercase tracking-tighter text-slate-400 block mb-0.5">
                Week
              </span>
              <span className="text-lg font-black text-slate-800">
                {showAllWeeks ? "Alle" : selectedWeek}
              </span>
            </div>
            <button
              onClick={() => {
                setReferenceDate(addWeeks(referenceDate, 1));
                setShowAllWeeks(false);
              }}
              className="p-2 hover:bg-white rounded-xl text-slate-400 transition-all active:scale-90"
              disabled={showAllWeeks && activeTab !== "planning"}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"
                size={16}
              />
              <input
                type="text"
                placeholder="Zoek order, project of item..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowAllWeeks(!showAllWeeks)}
              className={`p-2.5 rounded-xl border transition-all ${
                showAllWeeks
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-400 border-slate-200"
              }`}
            >
              <ListFilter size={18} />
            </button>
            <button
              onClick={handleSyncDrawings}
              disabled={isSyncing}
              className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 border border-indigo-100 transition-all active:scale-95"
            >
              {isSyncing ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <RefreshCw size={18} />
              )}
            </button>
          </div>
        </div>

        {/* LIJST WEERGAVE */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar bg-slate-50/50">
          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                {activeTab === "actief" ? (
                  <Activity size={24} className="text-emerald-200" />
                ) : (
                  <CalendarDays size={24} className="text-slate-200" />
                )}
              </div>
              <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest leading-relaxed">
                Geen orders gevonden
              </p>
            </div>
          ) : (
            filteredOrders.map((order) => (
              <div
                key={order.id}
                onClick={() => onSelectOrder && onSelectOrder(order)}
                className={`p-5 rounded-[22px] border shadow-sm cursor-pointer transition-all group active:scale-[0.98] ${
                  selectedOrder?.id === order.id
                    ? "bg-blue-50 border-blue-200 ring-2 ring-blue-500/10"
                    : "bg-white border-slate-200/60 hover:border-blue-400"
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex flex-col text-left">
                    <span className="font-black text-slate-900 text-sm tracking-tight">
                      {order.orderId || order.orderNumber}
                    </span>
                    {order.project && (
                      <div className="flex items-center gap-1 mt-0.5 opacity-60">
                        <Briefcase size={10} className="text-slate-500" />
                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter">
                          {order.project}
                        </span>
                      </div>
                    )}
                  </div>
                  <StatusBadge status={order.status} />
                </div>

                <p className="text-xs font-bold text-slate-500 truncate mb-4 text-left">
                  {order.itemCode || order.productId}
                </p>

                <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[10px] uppercase tracking-widest flex items-center gap-2 ${getUrgencyStyles(
                        order.deliveryDate
                      )}`}
                    >
                      <Calendar size={12} className="opacity-50" />
                      {order.plannedDate
                        ? format(parseDateSafe(order.plannedDate), "dd MMM", {
                            locale: nl,
                          })
                        : "Geen datum"}
                    </span>
                    {order.deliveryDate && (
                      <span className="text-[9px] text-slate-300 font-bold uppercase flex items-center gap-1 border-l border-slate-100 pl-3">
                        <Clock size={10} />
                        E: {format(parseDateSafe(order.deliveryDate), "dd-MM")}
                      </span>
                    )}
                  </div>
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-sm ${
                      selectedOrder?.id === order.id
                        ? "bg-blue-600 text-white"
                        : "bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white"
                    }`}
                  >
                    <ArrowRight size={14} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RECHTER KOLOM: DETAIL DOSSIER (Voor Teamleader/Planner) */}
      <div
        className={`hidden lg:flex flex-1 h-full transition-all duration-500 ${
          selectedOrder
            ? "opacity-100 translate-x-0"
            : "opacity-0 translate-x-full absolute"
        }`}
      >
        <OrderDetailPane
          order={selectedOrder}
          onClose={() => onSelectOrder(null)}
        />
      </div>

      {/* MOBIEL OVERLAY (Wanneer order geselecteerd is op mobiel) */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[100] bg-white lg:hidden">
          <OrderDetailPane
            order={selectedOrder}
            onClose={() => onSelectOrder(null)}
          />
        </div>
      )}
    </div>
  );
};

export default PlanningListView;
