import React, { useState, useEffect } from "react";
import {
  Clock,
  Upload,
  Download,
  Trash2,
  Plus,
  Save,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Edit2
} from "lucide-react";
import {
  collection,
  query,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  addDoc,
  getDocs,
  getDoc
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { formatMinutes } from "../../utils/efficiencyCalculator";

/**
 * ProductionTimeStandardsManager
 * Beheer standaard productietijden per product per machine
 */
const ProductionTimeStandardsManager = () => {
  const [standards, setStandards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [filter, setFilter] = useState("");
  const [editMode, setEditMode] = useState(null);
  const [availableItemCodes, setAvailableItemCodes] = useState([]);
  const [availableMachines, setAvailableMachines] = useState([]);
  
  // New entry form
  const [newEntry, setNewEntry] = useState({
    itemCode: "",
    machine: "",
    standardMinutes: "",
    description: ""
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load item codes from conversion mapping
        const conversionSnapshot = await getDocs(collection(db, ...PATHS.CONVERSION_MATRIX));
        const itemCodes = new Set();
        conversionSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.itemCode) itemCodes.add(data.itemCode);
          if (data.productCode) itemCodes.add(data.productCode);
        });
        setAvailableItemCodes([...itemCodes].sort());

        // Load machines from factory config
        const factoryDoc = await getDoc(doc(db, ...PATHS.FACTORY_CONFIG));
        if (factoryDoc.exists()) {
          const config = factoryDoc.data();
          const machines = new Set();
          
          // Extract all stations from all departments
          Object.values(config.departments || {}).forEach(dept => {
            (dept.stations || []).forEach(station => {
              if (station.id) machines.add(station.id);
              if (station.name && station.name !== station.id) machines.add(station.name);
            });
          });
          
          setAvailableMachines([...machines].sort());
        }
      } catch (error) {
        console.error("Error loading reference data:", error);
      }
    };

    loadData();

    // Listen to standards collection
    const q = query(collection(db, ...PATHS.PRODUCTION_STANDARDS));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setStandards(data);
        setLoading(false);
      },
      (err) => {
        console.error("Error loading standards:", err);
        setStatus({ type: "error", message: "Fout bij laden van standaarden" });
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filteredStandards = standards.filter(std => {
    if (!filter) return true;
    const term = filter.toLowerCase();
    return (
      std.itemCode?.toLowerCase().includes(term) ||
      std.machine?.toLowerCase().includes(term) ||
      std.description?.toLowerCase().includes(term)
    );
  });

  const handleAddNew = async () => {
    if (!newEntry.itemCode || !newEntry.machine || !newEntry.standardMinutes) {
      setStatus({ type: "error", message: "Item code, machine en tijd zijn verplicht" });
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, ...PATHS.PRODUCTION_STANDARDS), {
        itemCode: newEntry.itemCode.trim(),
        machine: newEntry.machine.trim(),
        standardMinutes: parseFloat(newEntry.standardMinutes),
        description: newEntry.description.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setNewEntry({ itemCode: "", machine: "", standardMinutes: "", description: "" });
      setStatus({ type: "success", message: "Standaard toegevoegd" });
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      console.error("Error adding standard:", error);
      setStatus({ type: "error", message: "Fout bij toevoegen" });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id, updates) => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, ...PATHS.PRODUCTION_STANDARDS, id),
        { ...updates, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setEditMode(null);
      setStatus({ type: "success", message: "Standaard bijgewerkt" });
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      console.error("Error updating standard:", error);
      setStatus({ type: "error", message: "Fout bij bijwerken" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Weet je zeker dat je deze standaard wilt verwijderen?")) return;
    
    try {
      await deleteDoc(doc(db, ...PATHS.PRODUCTION_STANDARDS, id));
      setStatus({ type: "success", message: "Standaard verwijderd" });
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      console.error("Error deleting standard:", error);
      setStatus({ type: "error", message: "Fout bij verwijderen" });
    }
  };

  const handleImportCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        // Expected headers: itemCode, machine, standardMinutes, description
        const itemCodeIdx = headers.indexOf('itemcode') >= 0 ? headers.indexOf('itemcode') : 0;
        const machineIdx = headers.indexOf('machine') >= 0 ? headers.indexOf('machine') : 1;
        const minutesIdx = headers.indexOf('standardminutes') >= 0 ? headers.indexOf('standardminutes') : 2;
        const descIdx = headers.indexOf('description') >= 0 ? headers.indexOf('description') : 3;

        setSaving(true);
        let imported = 0;
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const values = line.split(',').map(v => v.trim());
          const itemCode = values[itemCodeIdx];
          const machine = values[machineIdx];
          const minutes = parseFloat(values[minutesIdx]);
          const description = values[descIdx] || "";

          if (itemCode && machine && !isNaN(minutes)) {
            await addDoc(collection(db, ...PATHS.PRODUCTION_STANDARDS), {
              itemCode,
              machine,
              standardMinutes: minutes,
              description,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            imported++;
          }
        }

        setStatus({ 
          type: "success", 
          message: `${imported} standaarden geïmporteerd` 
        });
        setTimeout(() => setStatus(null), 3000);
      } catch (error) {
        console.error("CSV import error:", error);
        setStatus({ type: "error", message: "Fout bij importeren CSV" });
      } finally {
        setSaving(false);
        e.target.value = "";
      }
    };
    
    reader.readAsText(file);
  };

  const handleExportCSV = () => {
    const csv = [
      "itemCode,machine,standardMinutes,description",
      ...standards.map(std => 
        `${std.itemCode},${std.machine},${std.standardMinutes},${std.description || ""}`
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `production_standards_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-slate-900 p-8 rounded-[40px] text-white relative overflow-hidden shadow-xl border border-white/5">
        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
          <Clock size={150} />
        </div>
        <div className="relative z-10">
          <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
            Productie <span className="text-blue-500">Tijd Standaarden</span>
          </h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">
            Verwachte productietijden per product per machine
          </p>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs font-mono text-emerald-400">
              📊 {standards.length} standaarden
            </span>
          </div>
        </div>
      </div>

      {/* Status */}
      {status && (
        <div className={`flex items-center gap-3 p-4 rounded-2xl border ${
          status.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-bold">{status.message}</span>
        </div>
      )}

      {/* Actions Bar */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest cursor-pointer hover:bg-blue-700 transition">
            <Upload size={16} />
            Import CSV
            <input
              type="file"
              accept=".csv"
              onChange={handleImportCSV}
              disabled={saving}
              className="hidden"
            />
          </label>
          
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition"
          >
            <Download size={16} />
            Export CSV
          </button>

          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Zoeken..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-sm focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-start gap-2 text-xs text-blue-700">
              <FileSpreadsheet size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-bold">CSV Format:</div>
                <code className="text-[10px] block mt-1">itemCode,machine,standardMinutes,description</code>
                <div className="text-[10px] mt-1">Voorbeeld: A2E5,BH11,45,Wavistrong 160mm DN125</div>
              </div>
            </div>
          </div>
          
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-start gap-2 text-xs text-emerald-700">
              <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-bold">Automatisch Ophalen:</div>
                <div className="text-[10px] mt-1">
                  Item Codes worden automatisch geladen uit <code className="bg-emerald-100 px-1 rounded">/conversions/mapping</code>
                  <br />
                  Machines worden geladen uit <code className="bg-emerald-100 px-1 rounded">/factory_config</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add New Form */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="text-blue-600" size={20} />
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
            Nieuwe Standaard Toevoegen
          </h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <input
              type="text"
              list="itemCodeList"
              placeholder="Item Code *"
              value={newEntry.itemCode}
              onChange={(e) => setNewEntry({ ...newEntry, itemCode: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-sm focus:border-blue-500 outline-none"
            />
            <datalist id="itemCodeList">
              {availableItemCodes.map(code => (
                <option key={code} value={code} />
              ))}
            </datalist>
            <div className="text-[10px] text-slate-500 mt-1">
              {availableItemCodes.length} codes beschikbaar
            </div>
          </div>
          <div>
            <input
              type="text"
              list="machineList"
              placeholder="Machine *"
              value={newEntry.machine}
              onChange={(e) => setNewEntry({ ...newEntry, machine: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-sm focus:border-blue-500 outline-none"
            />
            <datalist id="machineList">
              {availableMachines.map(machine => (
                <option key={machine} value={machine} />
              ))}
            </datalist>
            <div className="text-[10px] text-slate-500 mt-1">
              {availableMachines.length} machines beschikbaar
            </div>
          </div>
          <input
            type="number"
            placeholder="Minuten *"
            value={newEntry.standardMinutes}
            onChange={(e) => setNewEntry({ ...newEntry, standardMinutes: e.target.value })}
            className="px-4 py-3 rounded-xl border-2 border-slate-200 text-sm focus:border-blue-500 outline-none"
          />
          <input
            type="text"
            placeholder="Beschrijving"
            value={newEntry.description}
            onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
            className="px-4 py-3 rounded-xl border-2 border-slate-200 text-sm focus:border-blue-500 outline-none"
          />
        </div>

        <button
          onClick={handleAddNew}
          disabled={saving}
          className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
          Toevoegen
        </button>
      </div>

      {/* Standards List */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4">
          Huidige Standaarden ({filteredStandards.length})
        </h3>

        {filteredStandards.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Clock size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-sm font-bold">Geen standaarden gevonden</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredStandards.map(std => (
              <div
                key={std.id}
                className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100"
              >
                {editMode === std.id ? (
                  // Edit mode
                  <div className="flex-1 grid grid-cols-4 gap-3">
                    <input
                      type="text"
                      defaultValue={std.itemCode}
                      id={`edit-item-${std.id}`}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                    <input
                      type="text"
                      defaultValue={std.machine}
                      id={`edit-machine-${std.id}`}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                    <input
                      type="number"
                      defaultValue={std.standardMinutes}
                      id={`edit-minutes-${std.id}`}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const itemCode = document.getElementById(`edit-item-${std.id}`).value;
                          const machine = document.getElementById(`edit-machine-${std.id}`).value;
                          const minutes = parseFloat(document.getElementById(`edit-minutes-${std.id}`).value);
                          handleUpdate(std.id, { itemCode, machine, standardMinutes: minutes });
                        }}
                        className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
                      >
                        <Save size={14} />
                      </button>
                      <button
                        onClick={() => setEditMode(null)}
                        className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="font-bold text-slate-800">{std.itemCode}</div>
                        <div className="text-xs text-slate-500">→</div>
                        <div className="text-sm text-slate-600">{std.machine}</div>
                      </div>
                      {std.description && (
                        <div className="text-xs text-slate-500 mt-1">{std.description}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-2xl font-black text-blue-600">
                          {formatMinutes(std.standardMinutes)}
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest">
                          Standaard Tijd
                        </div>
                      </div>
                      <button
                        onClick={() => setEditMode(std.id)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(std.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductionTimeStandardsManager;
