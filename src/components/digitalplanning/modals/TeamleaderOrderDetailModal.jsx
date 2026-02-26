import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Calendar,
  Clock,
  MapPin,
  FileText,
  Activity,
  CheckCircle,
  AlertTriangle,
  AlertOctagon,
  Zap,
  Droplets,
  Ruler,
  ArrowRight,
  History
} from "lucide-react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "../../../config/firebase.js";
import StatusBadge from "../common/StatusBadge.jsx";

const getAppId = () => {
  if (typeof window !== "undefined" && window.__app_id) return window.__app_id;
  return "fittings-app-v1";
};

// Helper voor datum weergave
const formatDate = (timestamp) => {
  if (!timestamp) return "-";
  // Support voor Firestore Timestamp en JS Date
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const TeamleaderOrderDetailModal = ({ order, onClose }) => {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOnlyRejects, setShowOnlyRejects] = useState(false);
  const appId = getAppId();

  // Bepaal materiaal type voor badges
  const getMaterialInfo = (itemString) => {
    const upperItem = (itemString || "").toUpperCase();
    if (upperItem.includes("CST")) return { type: "CST", icon: <Zap size={14} />, color: "orange" };
    if (upperItem.includes("EWT")) return { type: "EWT", icon: <Droplets size={14} />, color: "cyan" };
    return { type: "EST", icon: null, color: "slate" };
  };

  const matInfo = getMaterialInfo(order?.item);

  // NIEUW: Bepaal de processtappen o.b.v. FL in de naam
  const processSteps = useMemo(() => {
    const itemStr = (order?.item || "").toUpperCase();
    
    // Als het een FL product is (Flens/Flenzen?) -> Mazak route
    if (itemStr.includes("FL")) {
        return ["Wikkelen", "Lossen", "Mazak", "Eindinspectie", "Klaar"];
    }
    
    // Standaard route
    return ["Wikkelen", "Lossen", "Nabewerking", "Eindinspectie", "Klaar"];
  }, [order?.item]);

  // NIEUW: Bepaal huidige stap voor highlighting
  const currentStepIndex = useMemo(() => {
    if (!order) return -1;
    if (order.status === "completed") return 4; // Klaar

    const machine = (order.machine || "").toUpperCase();
    
    if (machine === "BM01" || machine.includes("INSPECTIE")) return 3; // Eindinspectie
    if (machine === "MAZAK") return 2; // Mazak
    if (machine === "NABEWERKING" || machine === "NABW") return 2; // Nabewerking (of Mazak, afh van route)
    if (machine.includes("BH")) return 0; // Wikkelen
    
    // Fallback logic
    return 0; 
  }, [order, processSteps]);

  // Bereken aantal afgekeurde producten
  const rejectedCount = useMemo(() => {
    const unitRejects = units.filter(u => ['rejected', 'Rejected'].includes(u.status)).length;
    return unitRejects || order.rejectedCount || 0;
  }, [units, order]);

  // Haal gekoppelde productie-units op
  useEffect(() => {
    const fetchUnits = async () => {
      if (!order?.orderId || !appId) return;
      
      try {
        const q = query(
          collection(db, "artifacts", appId, "public", "data", "tracked_products"),
          where("orderId", "==", order.orderId)
        );
        
        const snapshot = await getDocs(q);
        const loadedUnits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Sorteer op lotnummer
        loadedUnits.sort((a, b) => a.lotNumber.localeCompare(b.lotNumber));
        setUnits(loadedUnits);
      } catch (err) {
        console.error("Fout bij laden units:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUnits();
  }, [order, appId]);

  if (!order) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-start shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">{order.orderId}</h2>
              <StatusBadge status={order.status} />
              {/* Materiaal Badge */}
              {matInfo.type !== "EST" && (
                <span className={`px-2 py-0.5 rounded text-xs font-bold border flex items-center gap-1 bg-${matInfo.color}-100 text-${matInfo.color}-700 border-${matInfo.color}-200`}>
                  {matInfo.icon} {matInfo.type}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-gray-600">{order.item}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-white hover:bg-gray-200 rounded-full transition-colors text-gray-500 hover:text-gray-800 border border-gray-200 shadow-sm"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          
          {/* Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            
            {/* Planning & Tijd */}
            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
              <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Calendar size={14} /> Planning & Tijd
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Geplande Datum (Deadline)</p>
                  <p className="text-sm font-medium text-gray-900">
                    {order.plannedDate ? formatDate(order.plannedDate) : "Niet ingesteld"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Startdatum Productie</p>
                  <p className="text-sm font-medium text-gray-900">
                    {order.startDate ? formatDate(order.startDate) : units.length > 0 ? formatDate(units[0].startTime) : "Nog niet gestart"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Week</p>
                  <p className="text-sm font-medium text-gray-900">Week {order.weekNumber || "?"} ({order.year || new Date().getFullYear()})</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Tekening</p>
                  <p className="text-sm font-medium text-gray-900">{order.drawing || "-"}</p>
                </div>
              </div>
            </div>

            {/* Locatie & Status */}
            <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100">
              <h3 className="text-xs font-bold text-purple-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                <MapPin size={14} /> Locatie & Proces
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Huidige Machine/Station</p>
                  <p className="text-sm font-black text-gray-900 flex items-center gap-2">
                    {order.machine || "Onbekend"}
                    {order.status === 'in_progress' && <span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span>}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Voortgang</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-purple-500" 
                        style={{ width: `${Math.min(100, ((order.produced || units.filter(u => u.status === 'completed').length) / (order.quantity || 1)) * 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-xs font-bold text-purple-700">
                      {order.produced || units.filter(u => u.status === 'completed').length} / {order.quantity}
                    </span>
                  </div>
                </div>
                {rejectedCount > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Kwaliteit (Afkeur)</p>
                    <div className="flex items-center gap-2 mt-1 text-rose-600 font-bold text-sm">
                        <AlertOctagon size={16} />
                        <span>{rejectedCount} {rejectedCount === 1 ? 'stuk' : 'stuks'} afgekeurd</span>
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Vervolgstappen</p>
                  <div className="text-xs text-gray-700 flex flex-wrap gap-1 mt-1 items-center">
                    {processSteps.map((step, index) => {
                        const isActive = index === currentStepIndex;
                        const isPast = index < currentStepIndex;
                        
                        return (
                            <React.Fragment key={step}>
                                <span className={`px-2 py-0.5 border rounded-md transition-colors ${
                                    isActive 
                                        ? "bg-purple-600 text-white font-bold border-purple-600 shadow-sm" 
                                        : isPast 
                                            ? "bg-purple-100 text-purple-400 border-purple-100 line-through decoration-purple-300"
                                            : "bg-white text-gray-500 border-gray-200"
                                }`}>
                                    {step}
                                </span>
                                {index < processSteps.length - 1 && (
                                    <ArrowRight size={10} className={isActive || isPast ? "text-purple-300" : "text-gray-300"} />
                                )}
                            </React.Fragment>
                        );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Opmerkingen & Specs */}
            <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100">
              <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileText size={14} /> PO Text / Opmerkingen
              </h3>
              <div className="h-full">
                {order.notes ? (
                  <p className="text-sm text-gray-700 italic bg-white p-3 rounded-lg border border-amber-100 shadow-sm min-h-[80px]">
                    "{order.notes}"
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 italic bg-white/50 p-3 rounded-lg border border-dashed border-amber-200 min-h-[80px] flex items-center justify-center">
                    Geen opmerkingen toegevoegd.
                  </p>
                )}
                {/* Waarschuwingen automatisch tonen */}
                {matInfo.type === "CST" && (
                  <div className="mt-3 bg-orange-100 text-orange-800 p-2 rounded text-xs font-bold flex items-center gap-2">
                    <AlertTriangle size={14} /> LET OP: Carbon Toevoegen!
                  </div>
                )}
                {matInfo.type === "EWT" && (
                  <div className="mt-3 bg-cyan-100 text-cyan-800 p-2 rounded text-xs font-bold flex items-center gap-2">
                    <AlertTriangle size={14} /> LET OP: EWT Specificaties!
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Details Tabel (Units & Metingen) */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Activity size={20} className="text-blue-600" /> 
                Productie Details & Metingen
              </h3>
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors select-none">
                <input 
                  type="checkbox" 
                  checked={showOnlyRejects}
                  onChange={(e) => setShowOnlyRejects(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-rose-500 border-gray-300 w-4 h-4"
                />
                <span className={`text-[10px] font-black uppercase tracking-wide ${showOnlyRejects ? "text-rose-600" : "text-slate-500"}`}>
                  Alleen Afkeur
                </span>
              </label>
            </div>
            
            {loading ? (
              <div className="p-8 text-center text-gray-400 animate-pulse">Laden van details...</div>
            ) : units.length > 0 ? (
              <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-bold">
                    <tr>
                      <th className="px-4 py-3">Lotnummer</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Locatie</th>
                      <th className="px-4 py-3">Laatste Update</th>
                      <th className="px-4 py-3 flex items-center gap-1"><Ruler size={12}/> Metingen (Ø / WD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {units.filter(u => !showOnlyRejects || ['rejected', 'Rejected'].includes(u.status)).length === 0 && showOnlyRejects && (
                      <tr>
                        <td colSpan="5" className="p-8 text-center text-slate-400 text-xs italic">
                          Geen afgekeurde producten gevonden in deze order.
                        </td>
                      </tr>
                    )}
                    {units.filter(u => !showOnlyRejects || ['rejected', 'Rejected'].includes(u.status)).map((unit) => {
                      const isRejected = ['rejected', 'Rejected'].includes(unit.status);
                      return (
                      <tr key={unit.id} className={`transition-colors ${isRejected ? "bg-rose-50 hover:bg-rose-100" : "hover:bg-blue-50/50"}`}>
                        <td className="px-4 py-3 font-bold text-gray-900 font-mono">{unit.lotNumber}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                            unit.status === 'completed' ? 'bg-green-100 text-green-700' :
                            unit.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                            isRejected ? 'bg-rose-100 text-rose-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {unit.status === 'in_progress' ? 'Actief' : unit.status === 'completed' ? 'Gereed' : isRejected ? 'Afkeur' : unit.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{unit.currentStation || "-"}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          <div className="flex items-center gap-1">
                            <History size={12} />
                            {formatDate(unit.updatedAt || unit.createdAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {/* Mockup voor metingen, of echte data als beschikbaar */}
                          {unit.measurements ? (
                            <span className="text-xs font-mono text-slate-700">
                              Ø: {unit.measurements.diameter || "-"} | W: {unit.measurements.wallThickness || "-"}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Geen data</span>
                          )}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-500">
                Nog geen productie-units gestart voor deze order.
              </div>
            )}
          </div>

        </div>
        
        {/* Footer Actions */}
        <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-end gap-3 shrink-0">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-100 transition-colors"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeamleaderOrderDetailModal;