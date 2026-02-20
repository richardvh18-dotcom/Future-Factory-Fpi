import React, { useState, useMemo } from "react";
import {
  X,
  Info,
  Clock,
  CheckCircle2,
  Ruler,
  ShieldCheck,
  Box,
  History,
  Activity,
  User,
  Folder,
  FileText,
  Calendar,
  AlertTriangle,
  Plus,
  ArrowRightLeft,
  RefreshCw,
  Loader2,
  Star,
  Zap,
} from "lucide-react";
import StatusBadge from "../common/StatusBadge";
import { WORKSTATIONS } from "../../../utils/workstationLogic";
import { format } from "date-fns";
import { getISOWeekInfo } from "../../../utils/hubHelpers";
import { findDrawingForOrder, syncOrderDrawing } from "../../../utils/drawingLinker.js";
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";
import { useAdminAuth } from "../../../hooks/useAdminAuth";
import ProductDetailModal from "../../products/ProductDetailModal";

/**
 * ProductDossierModal: Toont proces-stappen, kwaliteitsmetingen en order-info.
 * Ondersteunt nu ook het toevoegen van QC rapporten/klachten en het verplaatsen van producten.
 */
const ProductDossierModal = ({
  isOpen,
  product,
  onClose,
  orders = [],
  onAddNote,
  onMoveLot,
}) => {
  const [newNote, setNewNote] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [targetStation, setTargetStation] = useState("");
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [catalogProduct, setCatalogProduct] = useState(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [historyWithOperators, setHistoryWithOperators] = useState([]);
  const { role } = useAdminAuth();
  const canEditPriority = ["admin", "planner", "teamleader"].includes(role);

  const handleDrawingSync = async () => {
    if (!parentOrder.itemCode) return;
    setIsSyncing(true);
    const drawing = await findDrawingForOrder(parentOrder);
    if (drawing) {
      await syncOrderDrawing(parentOrder.id, drawing);
    }
    setIsSyncing(false);
  };

  const handleSetPriority = async (level) => {
    if (!parentOrder.id) return;
    // Toggle logic: als huidige priority gelijk is aan gekozen level, zet uit (false)
    const currentPrio = parentOrder.priority === true ? "high" : parentOrder.priority;
    const newPriority = currentPrio === level ? false : level;

    try {
      const orderRef = doc(db, ...PATHS.PLANNING, parentOrder.id);
      await updateDoc(orderRef, {
        priority: newPriority,
        lastUpdated: new Date()
      });

      // Update history in the product dossier (Tracked Product)
      if (product.id) {
        const collectionPath = product.id === parentOrder.id ? PATHS.PLANNING : PATHS.TRACKING;
        const productRef = doc(db, ...collectionPath, product.id);

        await updateDoc(productRef, {
          history: arrayUnion({
            station: "PLANNING",
            user: role || "Admin",
            action: "Prioriteit Wijziging",
            details: `Prioriteit gewijzigd naar: ${newPriority ? (newPriority === true ? "HIGH" : newPriority.toUpperCase()) : "NORMAAL"}`,
            time: new Date().toISOString()
          }),
          lastUpdated: new Date()
        });
      }
    } catch (e) {
      console.error("Fout bij wijzigen prioriteit:", e);
    }
  };

  if (!isOpen || !product) return null;

  const parentOrder = orders.find((o) => o.orderId === product.orderId) || {};
  const hasDrawing = parentOrder.drawing && parentOrder.drawing !== "-" && parentOrder.drawing !== "";

  const handleOpenDetail = async () => {
    if (!hasDrawing) return;
    
    setLoadingCatalog(true);
    try {
      const appId = window.__app_id || "fittings-app-v1";
      const productsRef = collection(db, "artifacts", appId, "public", "data", "products");
      
      // Zoek op tekening nummer
      const q = query(productsRef, where("drawing", "==", parentOrder.drawing));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        setCatalogProduct({ id: snap.docs[0].id, ...snap.docs[0].data() });
        setShowDetailModal(true);
      } else {
        alert("Geen product gevonden in catalogus met deze tekening.");
      }
    } catch (e) {
      console.error("Fout bij openen product detail:", e);
    } finally {
      setLoadingCatalog(false);
    }
  };

  // FIX: Stations lijst opschonen (BH31 toevoegen, dubbele BM01 verwijderen)
  const sortedStations = useMemo(() => {
    const stations = [...WORKSTATIONS];
    
    // Check of BH31 ontbreekt en voeg toe
    if (!stations.find(s => s.id === "BH31")) {
      stations.push({ id: "BH31", name: "BH31" });
    }

    // Filter "Station BM01" en duplicaten
    const uniqueStations = stations.filter((s, index, self) => 
      index === self.findIndex((t) => t.id === s.id) && 
      s.id !== "Station BM01" && s.name !== "Station BM01"
    );

    return uniqueStations.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }, []);

  // Effect: Verrijk historie met operator data uit occupancy als deze ontbreekt
  React.useEffect(() => {
    const enrichHistory = async () => {
      if (!product?.history) {
        setHistoryWithOperators([]);
        return;
      }

      const enriched = await Promise.all(product.history.map(async (entry) => {
        // Als operator al bekend is in de entry, gebruik die
        if (entry.operator || entry.operatorNumber || entry.operatorName) return entry;
        
        // Als we geen station of tijd hebben, kunnen we niet zoeken
        if (!entry.station || (!entry.timestamp && !entry.time)) return entry;

        try {
          const ts = entry.timestamp?.toDate ? entry.timestamp.toDate() : new Date(entry.timestamp || entry.time);
          if (isNaN(ts.getTime())) return entry;
          
          const dateStr = ts.toISOString().split('T')[0];
          const station = entry.station;

          // Zoek in occupancy (eerst exact, dan uppercase)
          let q = query(
            collection(db, ...PATHS.OCCUPANCY),
            where("date", "==", dateStr),
            where("machineId", "==", station)
          );
          let snap = await getDocs(q);

          if (snap.empty) {
             q = query(collection(db, ...PATHS.OCCUPANCY), where("date", "==", dateStr), where("machineId", "==", station.toUpperCase()));
             snap = await getDocs(q);
          }

          if (!snap.empty) {
            const opData = snap.docs[0].data();
            return { ...entry, operatorName: opData.operatorName, operatorNumber: opData.operatorNumber };
          }
        } catch (e) {
          console.warn("Kon historie niet verrijken:", e);
        }
        return entry;
      }));
      setHistoryWithOperators(enriched);
    };
    enrichHistory();
  }, [product, isOpen]);

  const formatDeadline = (val) => {
    if (!val) return "-";
    if (val?.toDate) return format(val.toDate(), "dd-MM-yyyy");
    const date = new Date(val);
    if (!isNaN(date.getTime())) return format(date, "dd-MM-yyyy");
    return String(val);
  };

  const normalizeMachine = (val) => {
    if (!val) return "-";
    const str = String(val).toUpperCase();
    return str.startsWith("40") ? str.substring(2) : str;
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[250] flex items-center justify-center p-4 lg:p-10 animate-in fade-in">
        <div className="bg-white w-full max-w-5xl rounded-[50px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh] text-left">
          {/* Header */}
          <div className="p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
            <div className="flex items-center gap-6">
              <div className="p-4 bg-blue-500 rounded-3xl shadow-lg">
                <Box size={32} />
              </div>
              <div>
                <h3 className="text-3xl font-black italic uppercase tracking-tight text-left">
                  Product <span className="text-blue-400">Dossier</span>
                </h3>
                <div className="text-left mt-1">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Lotnummer: {product.lotNumber}
                  </p>
                  <p className="text-lg font-black text-white uppercase italic leading-none mt-1">
                    {product.item || parentOrder.item || "Onbekend Item"}
                  </p>
                  {(product.extraCode || parentOrder.extraCode) && (
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mt-1">
                      Code: {product.extraCode || parentOrder.extraCode}
                    </p>
                  )}
                  {(parentOrder.priority || parentOrder.isMoved) && (
                    <p className={`text-xs font-bold uppercase tracking-wider mt-1 flex items-center gap-1 ${
                      parentOrder.priority === "immediate" ? "text-rose-500" :
                      parentOrder.priority === "urgent" ? "text-orange-500" :
                      "text-amber-400"
                    }`}>
                      <ArrowRightLeft size={12} /> 
                      {parentOrder.isMoved ? "Verplaatst" : ""}
                      {parentOrder.isMoved && parentOrder.priority ? " & " : ""}
                      {parentOrder.priority === "immediate" ? "1e Prio" : 
                       parentOrder.priority === "urgent" ? "Spoed" : 
                       (parentOrder.priority === "high" || parentOrder.priority === true) ? "Prio" : ""}
                    </p>
                  )}
                  {canEditPriority && parentOrder.id && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        onClick={() => handleSetPriority("high")}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${
                          parentOrder.priority === "high" || parentOrder.priority === true
                            ? "bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20"
                            : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10"
                        }`}
                      >
                        <Star size={12} fill={parentOrder.priority === "high" || parentOrder.priority === true ? "currentColor" : "none"} />
                        Prio
                      </button>
                      <button
                        onClick={() => handleSetPriority("urgent")}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${
                          parentOrder.priority === "urgent"
                            ? "bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20"
                            : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10"
                        }`}
                      >
                        <AlertTriangle size={12} fill={parentOrder.priority === "urgent" ? "currentColor" : "none"} />
                        Spoed
                      </button>
                      <button
                        onClick={() => handleSetPriority("immediate")}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${
                          parentOrder.priority === "immediate"
                            ? "bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/20"
                            : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10"
                        }`}
                      >
                        <Zap size={12} fill={parentOrder.priority === "immediate" ? "currentColor" : "none"} />
                        1e Prio
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl transition-all"
            >
              <X size={28} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-10">
            {/* Order Context */}
            <section className="grid grid-cols-1 lg:grid-cols-4 gap-6 bg-blue-50/50 p-8 rounded-[40px] border border-blue-100">
              <div className="lg:col-span-4 flex items-center gap-2 mb-2">
                <button
                  onClick={handleOpenDetail}
                  disabled={!hasDrawing || loadingCatalog}
                  className={`p-1 -ml-1 rounded-lg transition-all ${
                    hasDrawing 
                      ? "hover:bg-blue-100 cursor-pointer text-blue-600" 
                      : "cursor-default text-blue-600"
                  }`}
                  title={hasDrawing ? "Open Product Detail" : ""}
                >
                  {loadingCatalog ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                </button>
                <h4 className="font-black text-xs uppercase text-blue-900 tracking-widest">
                  Order Informatie (Excel Context)
                </h4>
              </div>
              <div>
                <span className="text-[9px] font-black text-blue-400 uppercase">
                  Klant
                </span>
                <p className="text-sm font-bold text-slate-800">
                  {parentOrder.customer || "-"}
                </p>
              </div>
              <div>
                <span className="text-[9px] font-black text-blue-400 uppercase">
                  Project
                </span>
                <p className="text-sm font-bold text-slate-800">
                  {parentOrder.project || "-"}
                </p>
              </div>
              <div>
                <span className="text-[9px] font-black text-blue-400 uppercase flex items-center gap-2">
                  Tekening
                  {(!parentOrder.drawing || parentOrder.drawing === "-" || parentOrder.drawing === "") && (
                    <button 
                      onClick={handleDrawingSync} 
                      disabled={isSyncing}
                      className="p-1 hover:bg-blue-100 rounded-full transition-colors"
                      title="Zoek tekening in catalogus"
                    >
                      <RefreshCw size={10} className={isSyncing ? "animate-spin text-blue-600" : "text-slate-400"} />
                    </button>
                  )}
                </span>
                <p className="text-sm font-bold text-slate-800">
                  {parentOrder.drawing || "-"}
                </p>
              </div>
              <div>
                <span className="text-[9px] font-black text-blue-400 uppercase">
                  Deadline
                </span>
                <p className="text-sm font-bold text-slate-800">
                  {formatDeadline(parentOrder.deliveryDate)}
                </p>
              </div>
              <div>
                <span className="text-[9px] font-black text-blue-400 uppercase">
                  Start Productie
                </span>
                <p className="text-sm font-bold text-slate-800">
                  {formatDeadline(product.startTime || product.createdAt)}
                </p>
              </div>
              {/* Extra info uit kolom H (vaak notes of po text) */}
              {parentOrder.notes && (
                <div className="lg:col-span-4 mt-2 pt-4 border-t border-blue-200/50">
                  <span className="text-[9px] font-black text-blue-400 uppercase">
                    Extra Info (Import)
                  </span>
                  <p className="text-sm font-medium text-slate-700 italic">
                    {parentOrder.notes}
                  </p>
                </div>
              )}
            </section>

            {/* Actual Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">
                  Huidige Fase
                </span>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                    <Activity size={20} />
                  </div>
                  <span className="text-lg font-black text-slate-800 uppercase italic">
                    {product.currentStep}
                  </span>
                </div>
              </div>
              <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">
                  Kwaliteit Status
                </span>
                <StatusBadge
                  label={product.inspection?.status || "Niet gecontroleerd"}
                />
              </div>
            </div>

            {/* Extra Info: Opmerkingen, Metingen & Inspectie */}
            {(product.note ||
              product.measurements ||
              (product.inspection && product.inspection.reasons)) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Opmerkingen */}
                {product.note && (
                  <div className="p-6 bg-amber-50 rounded-[32px] border border-amber-100">
                    <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block mb-2 flex items-center gap-2">
                      <Info size={14} /> Opmerking
                    </span>
                    <p className="text-sm font-medium text-slate-700 italic">
                      "{product.note}"
                    </p>
                  </div>
                )}

                {/* Inspectie Redenen (bij afkeur/herstel) */}
                {product.inspection?.reasons &&
                  product.inspection.reasons.length > 0 && (
                    <div className="p-6 bg-rose-50 rounded-[32px] border border-rose-100">
                      <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest block mb-2 flex items-center gap-2">
                        <AlertTriangle size={14} /> Inspectie Bevindingen
                      </span>
                      <ul className="list-disc list-inside text-sm font-bold text-rose-700">
                        {product.inspection.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                {/* Metingen */}
                {product.measurements && (
                  <div className="p-6 bg-indigo-50 rounded-[32px] border border-indigo-100">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-2 flex items-center gap-2">
                      <Ruler size={14} /> Metingen
                    </span>
                    <div className="space-y-1">
                      {Object.entries(product.measurements).map(
                        ([key, val]) => (
                          <div
                            key={key}
                            className="flex justify-between text-xs border-b border-indigo-100/50 pb-1 last:border-0"
                          >
                            <span className="font-bold text-slate-600 uppercase">
                              {key}:
                            </span>
                            <span className="font-mono font-black text-slate-800">
                              {val}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* QC / Klachten Sectie */}
            {(onAddNote ||
              (product.qcNotes && product.qcNotes.length > 0)) && (
              <div className="p-8 bg-rose-50 rounded-[40px] border border-rose-100">
                <h4 className="flex items-center gap-3 font-black text-sm uppercase text-rose-800 mb-6 pb-4 border-b border-rose-200">
                  <AlertTriangle className="text-rose-500" size={20} />{" "}
                  Kwaliteitsrapporten & Klachten
                </h4>

                {product.qcNotes && product.qcNotes.length > 0 ? (
                  <div className="space-y-4 mb-6">
                    {product.qcNotes.map((note, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-4 rounded-2xl border border-rose-100 shadow-sm"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">
                            {note.user || "Systeem"}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {new Date(note.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 font-medium whitespace-pre-wrap">
                          {note.text}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-rose-400 italic mb-6">
                    Nog geen meldingen geregistreerd in dit dossier.
                  </p>
                )}

                {onAddNote &&
                  (isAdding ? (
                    <div className="bg-white p-4 rounded-2xl border border-rose-200 animate-in fade-in slide-in-from-bottom-2">
                      <textarea
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-rose-500 min-h-[100px] mb-3"
                        placeholder="Beschrijf de klacht, oorzaak en actie..."
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        autoFocus
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            if (newNote.trim()) {
                              onAddNote(newNote);
                              setNewNote("");
                              setIsAdding(false);
                            }
                          }}
                          className="px-6 py-2 bg-rose-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-rose-700 transition-all"
                        >
                          Rapport Opslaan
                        </button>
                        <button
                          onClick={() => setIsAdding(false)}
                          className="px-6 py-2 bg-white text-slate-500 border border-slate-200 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
                        >
                          Annuleren
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsAdding(true)}
                      className="px-6 py-3 bg-white text-rose-600 border-2 border-rose-100 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-rose-50 hover:border-rose-200 transition-all flex items-center gap-2"
                    >
                      <Plus size={16} /> Nieuwe Melding Toevoegen
                    </button>
                  ))}
              </div>
            )}

            {/* History */}
            <div>
              <h4 className="flex items-center gap-3 font-black text-sm uppercase text-slate-800 mb-6 pb-4 border-b">
                <History className="text-blue-500" /> Volledige Proces Historie
              </h4>
              <div className="space-y-3">
                {(historyWithOperators.length > 0 ? historyWithOperators : product.history)?.map((entry, idx) => (
                  <div key={idx} className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-white shadow-sm flex items-center justify-center shrink-0">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    </div>
                    <div 
                      className="bg-slate-50 flex-1 p-5 rounded-2xl border border-slate-100 flex justify-between items-center hover:bg-blue-50/50 transition-colors cursor-help"
                      title={`Operator: ${entry.operatorName || entry.operator || (entry.user && entry.user.includes('@') ? entry.user.split('@')[0] : entry.user) || "Onbekend"}`}
                    >
                      <div>
                        <p className="text-xs font-black text-slate-700 uppercase">
                          {entry.station}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400">
                          {entry.operatorNumber || entry.operatorName || entry.operator || (entry.user && entry.user.includes('@') ? entry.user.split('@')[0] : entry.user) || "Systeem"}
                        </p>
                        {(entry.action || entry.details) && (
                          <p className="text-[10px] font-medium text-slate-600 mt-1 italic">
                            {entry.action} {entry.details ? `- ${entry.details}` : ""}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] font-mono font-bold text-slate-400">
                        {(() => {
                          const val = entry.time || entry.timestamp;
                          if (!val) return "-";
                          const date = val.toDate ? val.toDate() : new Date(val);
                          return isNaN(date.getTime()) ? "-" : date.toLocaleString("nl-NL");
                        })()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4 text-left">
              <ShieldCheck size={24} className="text-blue-500" />
              <p className="text-[10px] font-bold text-slate-500 uppercase leading-tight">
                Digitaal dossier conform KMS FPI-GRE (ISO 9001 Traceability)
              </p>
            </div>
            <div className="flex gap-3">
              {isMoving ? (
                <div className="flex items-center gap-2 animate-in slide-in-from-right-2">
                  <select
                    value={targetStation}
                    onChange={(e) => setTargetStation(e.target.value)}
                    className="px-4 py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-xs text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option value="">Kies station...</option>
                    {sortedStations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={async () => {
                      if (!targetStation) return;
                      setOverrideLoading(true);
                      await onMoveLot(product.id, targetStation);

                      // 1. Update history on the tracked product
                      const productRef = doc(db, ...PATHS.TRACKING, product.id);
                      await updateDoc(productRef, {
                        history: arrayUnion({
                          station: product.currentStation || "Dossier",
                          user: role || "Systeem",
                          action: "Handmatige Verplaatsing",
                          details: `Verplaatst naar station: ${targetStation}`,
                          time: new Date().toISOString(),
                        }),
                      });

                      // 2. Update the planning order to reflect the move for terminal views
                      if (parentOrder.id) {
                        const now = new Date();
                        const { week: currentWeek, year: currentYear } = getISOWeekInfo(now);
                        const planningOrderRef = doc(db, ...PATHS.PLANNING, parentOrder.id);
                        await updateDoc(planningOrderRef, {
                          machine: targetStation,
                          normMachine: normalizeMachine(targetStation),
                          isMoved: true,
                          weekNumber: currentWeek,
                          weekYear: currentYear,
                          lastUpdated: new Date(),
                        });
                      }

                      setOverrideLoading(false);
                      setIsMoving(false);
                      onClose();
                    }}
                    disabled={overrideLoading || !targetStation}
                    className="px-6 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all"
                  >
                    {overrideLoading ? "..." : "Bevestig"}
                  </button>
                  <button
                    onClick={() => setIsMoving(false)}
                    className="px-6 py-4 bg-white border-2 border-slate-200 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all"
                  >
                    Annuleer
                  </button>
                </div>
              ) : (
                <>
                  {onMoveLot && (
                    <button
                      onClick={() => setIsMoving(true)}
                      className="px-6 py-4 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all flex items-center gap-2"
                    >
                      <ArrowRightLeft size={16} /> Verplaats
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl"
                  >
                    Sluiten
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showDetailModal && catalogProduct && (
        <ProductDetailModal
          product={catalogProduct}
          onClose={() => setShowDetailModal(false)}
        />
      )}
    </>
  );
};

export default ProductDossierModal;
