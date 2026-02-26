import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { db, appId, logActivity, auth } from "../../config/firebase";
import {
  Ruler,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Info,
  Search,
} from "lucide-react";
import { STANDARD_DIAMETERS, STANDARD_PRESSURES } from "../../data/constants";

const AdminDrillingView = () => {
  const { t } = useTranslation();
  const [drillData, setDrillData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [searchTerm, setSearchTerm] = useState("");

  // Form voor nieuwe dimensie
  const [formData, setFormData] = useState({
    dn: "100",
    pn: "10",
    pcd: "", // Pitch Circle Diameter
    holes: "8",
    holeSize: "18",
    thread: "M16",
  });

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "artifacts", appId, "public", "data", "drilling_dims"),
      (snap) => {
        setDrillData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    const docId = `DN${formData.dn}_PN${formData.pn}`;
    try {
      await setDoc(
        doc(db, "artifacts", appId, "public", "data", "drilling_dims", docId),
        formData
      );
      logActivity(
        auth.currentUser,
        "DRILL_ADD",
        t('adminDrilling.patternAdded', { docId })
      );
      setFormData({
        ...formData,
        pcd: "",
        holes: "8",
        holeSize: "18",
        thread: "M16",
      });
    } catch (err) {
      alert(err.message);
    }
  };

  const saveEdit = async (id) => {
    try {
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "drilling_dims", id),
        editData
      );
      setEditingId(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredData = drillData
    .filter((d) => d.dn.includes(searchTerm) || d.pn.includes(searchTerm))
    .sort((a, b) => parseInt(a.dn) - parseInt(b.dn));

  if (loading)
    return (
      <div className="p-10 text-center animate-pulse">{t('adminDrilling.loadingDimensions')}</div>
    );

  return (
    <div className="max-w-6xl mx-auto p-6 animate-in fade-in">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-slate-800 flex items-center gap-3 tracking-tighter uppercase">
            <Ruler className="text-blue-600" size={32} /> {t('drillDimensions')}
          </h2>
          <p className="text-slate-500 font-medium">
            {t('manageCircles')}
          </p>
        </div>
        <div className="relative w-64">
          <Search
            className="absolute left-3 top-2.5 text-slate-400"
            size={16}
          />
          <input
            className="w-full pl-10 pr-4 py-2 bg-white border rounded-xl text-sm"
            placeholder={t('adminDrilling.filterDn')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </header>

      {/* TOEVOEG FORMULIER */}
      <section className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mb-8">
        <form
          onSubmit={handleAdd}
          className="grid grid-cols-2 md:grid-cols-6 gap-4 items-end"
        >
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">
              {t('dnMm')}
            </label>
            <select
              className="w-full p-2 bg-slate-50 border rounded-lg text-sm"
              value={formData.dn}
              onChange={(e) => setFormData({ ...formData, dn: e.target.value })}
            >
              {STANDARD_DIAMETERS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">
              {t('pn')}
            </label>
            <select
              className="w-full p-2 bg-slate-50 border rounded-lg text-sm"
              value={formData.pn}
              onChange={(e) => setFormData({ ...formData, pn: e.target.value })}
            >
              {STANDARD_PRESSURES.map((p) => (
                <option key={p} value={p}>
                  PN {p}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 font-bold text-blue-600">
              {t('pcdPitch')}
            </label>
            <input
              required
              className="w-full p-2 bg-blue-50 border border-blue-100 rounded-lg text-sm"
              placeholder="mm"
              value={formData.pcd}
              onChange={(e) =>
                setFormData({ ...formData, pcd: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">
              {t('holesN')}
            </label>
            <input
              required
              className="w-full p-2 bg-slate-50 border rounded-lg text-sm"
              placeholder={t('adminDrilling.count')}
              value={formData.holes}
              onChange={(e) =>
                setFormData({ ...formData, holes: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">
              {t('holeThread')}
            </label>
            <input
              required
              className="w-full p-2 bg-slate-50 border rounded-lg text-sm"
              placeholder={t('adminDrilling.exampleThread')}
              value={formData.thread}
              onChange={(e) =>
                setFormData({ ...formData, thread: e.target.value })
              }
            />
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white p-2.5 rounded-lg font-black text-xs uppercase hover:bg-blue-700 transition-all"
          >
            {t('add')}
          </button>
        </form>
      </section>

      {/* DATA TABEL */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <tr>
              <th className="px-6 py-4">{t('scaleDnPn')}</th>
              <th className="px-6 py-4">{t('pcdMm')}</th>
              <th className="px-6 py-4">{t('holes')}</th>
              <th className="px-6 py-4">{t('boltSize')}</th>
              <th className="px-6 py-4 text-right">{t('actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredData.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                {editingId === d.id ? (
                  <>
                    <td className="px-6 py-2 font-bold text-blue-600">
                      DN{d.dn} PN{d.pn}
                    </td>
                    <td className="px-6 py-2">
                      <input
                        className="w-20 p-1 border rounded bg-blue-50 font-bold"
                        value={editData.pcd}
                        onChange={(e) =>
                          setEditData({ ...editData, pcd: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-6 py-2">
                      <input
                        className="w-16 p-1 border rounded"
                        value={editData.holes}
                        onChange={(e) =>
                          setEditData({ ...editData, holes: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-6 py-2">
                      <input
                        className="w-20 p-1 border rounded"
                        value={editData.thread}
                        onChange={(e) =>
                          setEditData({ ...editData, thread: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-6 py-2 text-right space-x-2">
                      <button
                        onClick={() => saveEdit(d.id)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg"
                      >
                        <X size={16} />
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-black text-slate-800 tracking-tighter">
                          DN {d.dn}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          {t('pressureClass')} PN {d.pn}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-blue-600">
                      {d.pcd} mm
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {d.holes} {t('holesLabel')}
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-medium">
                      {d.thread}
                    </td>
                    <td className="px-6 py-4 text-right space-x-1">
                      <button
                        onClick={() => {
                          setEditingId(d.id);
                          setEditData(d);
                        }}
                        className="p-2 text-slate-300 hover:text-blue-600 transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() =>
                          deleteDoc(
                            doc(
                              db,
                              "artifacts",
                              appId,
                              "public",
                              "data",
                              "drilling_dims",
                              d.id
                            )
                          )
                        }
                        className="p-2 text-slate-300 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDrillingView;
