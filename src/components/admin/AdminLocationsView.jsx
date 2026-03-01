import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import {
  Wrench,
  MapPin,
  Search,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  PackageCheck,
  ShieldCheck,
  Database,
  Loader2,
} from "lucide-react";
import {
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { STANDARD_DIAMETERS } from "../../data/constants";

/**
 * AdminLocationsView V4.0 - Root Sync Edition
 * Beheert gereedschappen en stelling-locaties in de root.
 * Locatie: /future-factory/production/inventory/records/
 */
const AdminLocationsView = ({ canEdit = false }) => {
  const { t } = useTranslation();
  const [moffen, setMoffen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formState, setFormState] = useState({
    type: "TB",
    diameter: "200",
    pressure: "16",
    location: "",
    stock: 0,
    minStock: 5,
    toolName: "",
  });

  // 1. Live Sync met de Root INVENTORY collectie
  useEffect(() => {
    const colRef = collection(db, ...PATHS.INVENTORY);

    const unsubscribe = onSnapshot(
      colRef,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMoffen(data);
        setLoading(false);
      },
      (err) => {
        console.error("Fout bij laden inventaris:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredMoffen = useMemo(() => {
    return moffen
      .filter((m) =>
        `${m.type} ${m.diameter} ${m.location} ${m.toolName || ""}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => Number(a.diameter) - Number(b.diameter));
  }, [moffen, searchTerm]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);

    try {
      const docId =
        editingId ||
        `${formState.type}_ID${formState.diameter}_PN${formState.pressure}`.toUpperCase();
      const docRef = doc(db, ...PATHS.INVENTORY, docId);

      const data = {
        ...formState,
        id: docId,
        diameter: Number(formState.diameter),
        pressure: Number(formState.pressure),
        stock: Number(formState.stock),
        minStock: Number(formState.minStock),
        lastUpdated: serverTimestamp(),
        updatedBy: auth.currentUser?.email || "Admin",
      };

      await setDoc(docRef, data, { merge: true });

      await logActivity(
        auth.currentUser?.uid,
        editingId ? "TOOL_UPDATE" : "TOOL_ADD",
        `Gereedschap ${data.id} bijgewerkt op locatie ${data.location}`
      );

      setIsEditing(false);
      setEditingId(null);
    } catch (err) {
      console.error("Opslagfout:", err);
      alert("Kon gegevens niet opslaan.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (
      !window.confirm(t('adminLocations.confirmDelete'))
    )
      return;
    try {
      await deleteDoc(doc(db, ...PATHS.INVENTORY, id));
      await logActivity(
        auth.currentUser?.uid,
        "TOOL_DELETE",
        `Gereedschap ${id} verwijderd.`
      );
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading)
    return (
      <div className="p-20 text-center flex flex-col items-center gap-4 h-full justify-center">
        <Loader2 className="animate-spin text-blue-500" size={40} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          {t('adminLocations.syncingInventory')}
        </p>
      </div>
    );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 h-full flex flex-col text-left">
      {/* HEADER UNIT */}
      <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
          <Wrench size={120} />
        </div>
        <div className="flex items-center gap-6 relative z-10">
          <div className="p-4 bg-emerald-600 text-white rounded-3xl shadow-xl shadow-emerald-100">
            <Wrench size={32} />
          </div>
          <div className="text-left">
            <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
              {t('common.tools')} <span className="text-emerald-600">&</span> {t('common.stock')}
            </h2>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-100 uppercase italic">
                <ShieldCheck size={10} /> {t('common.rootProtected')}
              </span>
              <p className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">
                {t('common.target')}: /{PATHS.INVENTORY.join("/")}
              </p>
            </div>
          </div>
        </div>

        {canEdit && (
          <button
            onClick={() => {
              setEditingId(null);
              setFormState({
                type: "TB",
                diameter: "200",
                pressure: "16",
                location: "",
                stock: 0,
                minStock: 5,
                toolName: "",
              });
              setIsEditing(true);
            }}
            className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl flex items-center gap-3 hover:bg-blue-600 transition-all active:scale-95 relative z-10"
          >
            <Plus size={18} /> {t('adminLocations.registerNew')}
          </button>
        )}
      </div>

      {/* SEARCH BAR */}
      <div className="relative group">
        <Search
          className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors"
          size={22}
        />
        <input
          className="w-full pl-16 pr-8 py-5 bg-white border-2 border-slate-100 rounded-[30px] outline-none focus:border-blue-500 shadow-sm font-bold text-base transition-all placeholder:text-slate-300"
          placeholder={t('adminLocations.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* DATA GRID / TABLE */}
      <div className="bg-white rounded-[50px] border border-slate-200 shadow-sm overflow-hidden flex-1 mb-10">
        <div className="overflow-y-auto h-full custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-10 py-6">{t('specificationTypeIdPn')}</th>
                <th className="px-10 py-6">{t('storageLocation')}</th>
                <th className="px-10 py-6 text-center">{t('currentStock')}</th>
                {canEdit && <th className="px-10 py-6 text-right">{t('management')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredMoffen.map((m) => (
                <tr
                  key={m.id}
                  className="hover:bg-blue-50/30 group transition-all"
                >
                  <td className="px-10 py-5">
                    <div className="flex items-center gap-4">
                      <div className="px-3 py-1.5 bg-slate-900 text-white text-[10px] font-black rounded-lg uppercase italic shadow-sm">
                        {m.type}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-lg tracking-tighter italic">
                          ID {m.diameter}
                        </span>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          {t('pnBar', { pressure: m.pressure })}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-10 py-5">
                    <div className="flex items-center gap-2.5 text-blue-600 font-black italic uppercase tracking-tighter">
                      <MapPin size={16} className="text-blue-400" />
                      {m.location || t('adminLocations.noLocation')}
                    </div>
                  </td>
                  <td className="px-10 py-5 text-center">
                    <div className="inline-flex flex-col items-center">
                      <span
                        className={`text-2xl font-black italic tracking-tighter ${
                          m.stock <= m.minStock
                            ? "text-rose-600 animate-pulse"
                            : "text-slate-900"
                        }`}
                      >
                        {m.stock}
                      </span>
                      {m.stock <= m.minStock && (
                        <span className="text-[8px] font-black text-rose-500 uppercase mt-1">
                          {t('lowStock')}
                        </span>
                      )}
                    </div>
                  </td>

                  {canEdit && (
                    <td className="px-10 py-5 text-right opacity-0 group-hover:opacity-100 transition-all">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => {
                            setFormState(m);
                            setEditingId(m.id);
                            setIsEditing(true);
                          }}
                          className="p-3 bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(m.id)}
                          className="p-3 bg-slate-50 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {filteredMoffen.length === 0 && (
            <div className="p-32 text-center opacity-30 italic flex flex-col items-center gap-4">
              <Database size={64} className="text-slate-200" />
              <p className="text-sm font-black uppercase tracking-[0.3em] text-slate-400">
                {t('noToolsFound')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* EDIT MODAL */}
      {isEditing && canEdit && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[50px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/10">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-5">
                <div className="p-3.5 bg-emerald-600 text-white rounded-2xl shadow-xl shadow-emerald-200">
                  <PackageCheck size={28} />
                </div>
                <div className="text-left">
                  <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
                    {t('item')} <span className="text-emerald-600">{t('register')}</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1.5 italic">
                    {t('racksInventory')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditing(false)}
                className="p-3 hover:bg-slate-200 text-slate-300 rounded-2xl transition-all"
              >
                <X size={28} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-12 space-y-10">
              <div className="grid grid-cols-2 gap-8 text-left">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">
                    {t('type')}
                  </label>
                  <select
                    className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-800 outline-none focus:border-blue-500 appearance-none cursor-pointer"
                    value={formState.type}
                    onChange={(e) =>
                      setFormState({ ...formState, type: e.target.value })
                    }
                  >
                    <option value="TB">{t('tbTaperBell')}</option>
                    <option value="CB">{t('cbCylindricalBell')}</option>
                    <option value="ID">{t('idInnerDie')}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">
                    {t('diameter')}
                  </label>
                  <select
                    className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-800 outline-none focus:border-blue-500 appearance-none cursor-pointer"
                    value={formState.diameter}
                    onChange={(e) =>
                      setFormState({ ...formState, diameter: e.target.value })
                    }
                  >
                    {STANDARD_DIAMETERS.map((d) => (
                      <option key={d} value={d}>
                        {t('idMm', { id: d })}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2 text-left">
                <label className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] ml-2 italic">
                  {t('rackLocationCode')}
                </label>
                <div className="relative group">
                  <MapPin
                    className="absolute left-5 top-1/2 -translate-y-1/2 text-emerald-500 transition-transform group-focus-within:scale-125"
                    size={24}
                  />
                  <input
                    className="w-full pl-16 pr-6 py-5 bg-emerald-50/30 border-2 border-emerald-100 rounded-[25px] font-black text-xl text-slate-900 outline-none focus:border-emerald-500 shadow-inner tracking-widest"
                    placeholder="S-00-A"
                    value={formState.location}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        location: e.target.value.toUpperCase(),
                      })
                    }
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-50">
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">
                    {t('currentStock')}
                  </label>
                  <input
                    type="number"
                    className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-2xl text-center outline-none focus:border-blue-500"
                    value={formState.stock}
                    onChange={(e) =>
                      setFormState({ ...formState, stock: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-black text-rose-500 uppercase tracking-widest ml-2">
                    {t('minAlarmLimit')}
                  </label>
                  <input
                    type="number"
                    className="w-full p-5 bg-rose-50/30 border-2 border-rose-100 rounded-2xl font-black text-2xl text-center outline-none focus:border-rose-500"
                    value={formState.minStock}
                    onChange={(e) =>
                      setFormState({ ...formState, minStock: e.target.value })
                    }
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-7 bg-slate-900 text-white font-black uppercase text-sm tracking-[0.3em] rounded-[30px] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Save size={24} />
                )}
                {t('publishToRoot')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLocationsView;
