import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Trash2,
  Save,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Database,
  Filter,
  Target,
  ShieldCheck,
  ChevronRight,
  Hash,
  Activity,
  Info,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
} from "firebase/firestore";
import { db, auth } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";

/**
 * BoreDimensionsManager V4.0 - Root Integrated
 * Beheert de technische boorpatronen (PCD, Gaten, Boutmaten) in de root.
 * Locatie: /future-factory/production/dimensions/bore/records/
 */
const BoreDimensionsManager = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState(null);

  // Formulier state
  const [formData, setFormData] = useState({
    type: "", // Bijv. "ASA 150"
    diameter: "", // Bijv. "200"
    BoltCircle: "",
    Holes: "",
    HoleDiameter: "",
    Weight: "",
  });

  const specFields = [
    { id: "BoltCircle", label: "PCD (Steekcirkel)", unit: "mm" },
    { id: "Holes", label: "Aantal Gaten", unit: "n" },
    { id: "HoleDiameter", label: "Gat Diameter", unit: "mm" },
    { id: "Weight", label: "Flens Gewicht", unit: "kg" },
  ];

  // 1. Live Sync met de Root BORE_DIMENSIONS collectie
  useEffect(() => {
    const colRef = collection(db, ...PATHS.BORE_DIMENSIONS);

    const unsubscribe = onSnapshot(
      query(colRef),
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Sortering op ID (Type + Maat)
        setItems(
          data.sort((a, b) =>
            a.id.localeCompare(b.id, undefined, { numeric: true })
          )
        );
        setLoading(false);
      },
      (err) => {
        console.error("Fout bij laden boringen:", err);
        // FIX: Voorkom foutmelding bij uitloggen
        if (err.code === 'permission-denied') return;
        setStatus({ type: "error", msg: "Database toegang geweigerd." });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleInputChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Boring ${id} definitief verwijderen uit de root?`))
      return;
    try {
      await deleteDoc(doc(db, ...PATHS.BORE_DIMENSIONS, id));
      setStatus({ type: "success", msg: "Item verwijderd uit de root." });
    } catch (error) {
      setStatus({ type: "error", msg: "Verwijderen mislukt." });
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.type || !formData.diameter) {
      setStatus({ type: "error", msg: "Vul Type en Diameter in." });
      return;
    }

    setSaving(true);
    setStatus(null);

    // GENERATIE ID: TYPE_IDxxx (Bijv: ASA_150_ID200)
    const cleanType = formData.type.trim().replace(/\s+/g, "_").toUpperCase();
    const docId = `${cleanType}_ID${formData.diameter}`;

    try {
      const docRef = doc(db, ...PATHS.BORE_DIMENSIONS, docId);
      await setDoc(
        docRef,
        {
          ...formData,
          id: docId,
          diameter: Number(formData.diameter),
          lastUpdated: serverTimestamp(),
          updatedBy: auth.currentUser?.email || "Admin",
        },
        { merge: true }
      );

      setStatus({
        type: "success",
        msg: `Boring ${docId} succesvol vastgelegd!`,
      });
      // Reset Maat & Specs, behoud Type voor snelle invoer
      setFormData((prev) => ({
        ...prev,
        diameter: "",
        BoltCircle: "",
        Holes: "",
        HoleDiameter: "",
        Weight: "",
      }));
    } catch (error) {
      console.error(error);
      setStatus({ type: "error", msg: "Opslaan mislukt." });
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return items.filter(
      (i) =>
        i.id.toLowerCase().includes(term) ||
        i.type?.toLowerCase().includes(term)
    );
  }, [items, searchTerm]);

  if (loading)
    return (
      <div className="p-20 text-center flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 italic">
          Bore Records Syncing...
        </p>
      </div>
    );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 text-left pb-32">
      {/* HEADER UNIT */}
      <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
          <Target size={120} />
        </div>
        <div className="flex items-center gap-6 relative z-10">
          <div className="p-4 bg-purple-600 text-white rounded-[22px] shadow-xl shadow-purple-200">
            <Database size={32} />
          </div>
          <div className="text-left">
            <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
              Boring <span className="text-purple-600">Manager</span>
            </h2>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-100 uppercase italic">
                <ShieldCheck size={10} /> Root Protected
              </span>
              <p className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">
                Node: /{PATHS.BORE_DIMENSIONS.join("/")}
              </p>
            </div>
          </div>
        </div>

        {status && (
          <div
            className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 animate-in slide-in-from-right-2 ${
              status.type === "success"
                ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                : "bg-rose-50 text-rose-600 border border-rose-100"
            }`}
          >
            {status.type === "success" ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            {status.msg}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LINKS: INPUT FORMULIER */}
        <form
          onSubmit={handleSave}
          className="lg:col-span-4 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-8 text-left sticky top-8"
        >
          <div className="space-y-6">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3 italic">
              <Plus size={16} className="text-purple-600" /> Nieuwe Configuratie
            </h3>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                  Type Boring
                </label>
                <input
                  required
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all text-sm shadow-inner"
                  placeholder="Bijv: DIN 2576"
                  value={formData.type}
                  onChange={(e) => handleInputChange("type", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                  Diameter (mm)
                </label>
                <div className="relative group">
                  <Hash
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-purple-500 transition-colors"
                    size={18}
                  />
                  <input
                    type="number"
                    required
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all text-sm shadow-inner"
                    placeholder="200"
                    value={formData.diameter}
                    onChange={(e) =>
                      handleInputChange("diameter", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">
                Technische Specs
              </label>
              <div className="grid grid-cols-2 gap-4">
                {specFields.map((field) => (
                  <div key={field.id} className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-500 uppercase ml-2">
                      {field.label}
                    </label>
                    <div className="relative group">
                      <input
                        type="text"
                        className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-purple-500 transition-all text-xs"
                        placeholder="0.0"
                        value={formData[field.id]}
                        onChange={(e) =>
                          handleInputChange(field.id, e.target.value)
                        }
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-300 uppercase">
                        {field.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-5 bg-slate-900 text-white rounded-[25px] font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:bg-purple-600 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {saving ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Save size={18} />
              )}{" "}
              Vastleggen in Root
            </button>
          </div>
        </form>

        {/* RECHTS: DATA OVERZICHT */}
        <div className="lg:col-span-8 space-y-6">
          <div className="relative group">
            <Search
              className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-purple-500 transition-colors"
              size={22}
            />
            <input
              className="w-full pl-16 pr-8 py-5 bg-white border-2 border-slate-100 rounded-[30px] outline-none focus:border-purple-500 shadow-sm font-bold text-base transition-all placeholder:text-slate-300"
              placeholder="Zoek op ID of Type (bijv. ASA 150)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="bg-white rounded-[50px] border border-slate-200 shadow-sm overflow-hidden min-h-[500px]">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-10 py-6">Database Sleutel (ID)</th>
                    <th className="px-10 py-6">Type</th>
                    <th className="px-10 py-6 text-center">Specificaties</th>
                    <th className="px-10 py-6 text-right">Acties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan="4"
                        className="py-32 text-center opacity-30 italic"
                      >
                        <Database
                          size={64}
                          className="mx-auto mb-4 text-slate-200"
                        />
                        <p className="text-sm font-black uppercase tracking-[0.3em] text-slate-400">
                          Geen records gevonden
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-purple-50/30 group transition-all"
                      >
                        <td className="px-10 py-5">
                          <code className="text-xs font-black text-purple-600 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-100 uppercase tracking-tight">
                            {item.id}
                          </code>
                        </td>
                        <td className="px-10 py-5">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-900 text-white rounded-lg text-[9px] font-black italic shadow-sm uppercase">
                              {item.type}
                            </div>
                            <span className="font-black text-slate-900 text-lg tracking-tighter italic">
                              ID {item.diameter}
                            </span>
                          </div>
                        </td>
                        <td className="px-10 py-5">
                          <div className="flex flex-wrap justify-center gap-2">
                            {specFields.map((field) => (
                              <div
                                key={field.id}
                                className="bg-white border border-slate-200 px-2 py-1 rounded-lg flex items-center gap-1.5"
                              >
                                <span className="text-[8px] font-black text-slate-400 uppercase">
                                  {field.id}:
                                </span>
                                <span className="text-[10px] font-black text-slate-700">
                                  {item[field.id] || "-"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-10 py-5 text-right opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-3 bg-slate-50 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            title="Permanent Verwijderen"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* INFO FOOTER */}
      <div className="bg-slate-900 p-10 rounded-[50px] text-white/50 text-[10px] font-black uppercase tracking-[0.2em] flex flex-col md:flex-row items-center gap-8 relative overflow-hidden border border-white/5">
        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
          <Database size={150} />
        </div>
        <div className="p-4 bg-purple-600 rounded-3xl shadow-lg text-white shrink-0">
          <Activity size={32} />
        </div>
        <div className="text-left flex-1 relative z-10 leading-relaxed">
          <h4 className="text-white text-sm mb-2 italic tracking-tight uppercase leading-none">
            Engineering Control Protocol
          </h4>
          Deze boringen worden gebruikt voor de calculatie van flenzen en
          koppelingen. Elk nieuw record dat hier wordt toegevoegd is direct
          beschikbaar in de{" "}
          <span className="text-blue-400 italic">Matrix Logic Engine</span>
          voor alle terminals en configurators.
        </div>
      </div>
    </div>
  );
};

export default BoreDimensionsManager;
