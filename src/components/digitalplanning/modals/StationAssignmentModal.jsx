import React, { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";

/**
 * StationAssignmentModal
 * Toewijzen van personeel aan werkstations
 */
const StationAssignmentModal = ({ stationId, onClose, department }) => {
  const [personnel, setPersonnel] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedOperator, setSelectedOperator] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load personeel
        const personelSnapshot = await getDocs(collection(db, ...PATHS.PERSONNEL));
        setPersonnel(personelSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));

        // Load huidige toewijzingen voor dit station vandaag
        const today = new Date().toISOString().split('T')[0];
        const assignQuery = query(
          collection(db, ...PATHS.OCCUPANCY),
          where("machineId", "==", stationId),
          where("date", "==", today)
        );
        const assignSnapshot = await getDocs(assignQuery);
        setAssignments(assignSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      } catch (error) {
        console.error("Error loading data:", error);
        setStatus({ type: "error", message: "Fout bij laden van gegevens" });
        setLoading(false);
      }
    };

    loadData();
  }, [stationId]);

  const handleAssign = async () => {
    if (!selectedOperator) {
      setStatus({ type: "error", message: "Selecteer een operator" });
      return;
    }

    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const currentWeek = new Date().getISOWeek ? new Date().getISOWeek() : 1;
      const operator = personnel.find(p => p.id === selectedOperator);

      const docRef = doc(
        collection(db, ...PATHS.OCCUPANCY),
        `${stationId}-${selectedOperator}-${today}`
      );

      await setDoc(docRef, {
        machineId: stationId,
        operatorNumber: operator.employeeNumber || selectedOperator,
        operatorName: operator.name,
        date: today,
        week: currentWeek,
        departmentId: department,
        hoursWorked: 8, // Default dagshift
        shiftType: "DAG",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setAssignments([
        ...assignments,
        {
          id: `${stationId}-${selectedOperator}-${today}`,
          operatorNumber: operator.employeeNumber || selectedOperator,
          operatorName: operator.name,
          machineId: stationId,
          date: today,
          hoursWorked: 8,
        },
      ]);

      setSelectedOperator("");
      setStatus({ type: "success", message: "Personeelslid toegewezen" });
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      console.error("Error assigning operator:", error);
      setStatus({ type: "error", message: "Fout bij toewijzing" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (assignmentId) => {
    if (!window.confirm("Verwijderen?")) return;

    try {
      await deleteDoc(doc(db, ...PATHS.OCCUPANCY, assignmentId));
      setAssignments(assignments.filter(a => a.id !== assignmentId));
      setStatus({ type: "success", message: "Toewijzing verwijderd" });
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      console.error("Error removing assignment:", error);
      setStatus({ type: "error", message: "Fout bij verwijdering" });
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full">
          <Loader2 className="animate-spin text-blue-600 mx-auto" size={32} />
        </div>
      </div>
    );
  }

  const availableOperators = personnel.filter(
    p => !assignments.some(a => a.operatorNumber === p.employeeNumber)
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black uppercase text-slate-800">
            Station: {stationId}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
          >
            <X size={20} />
          </button>
        </div>

        {status && (
          <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 text-sm font-bold ${
            status.type === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700"
          }`}>
            {status.type === "success" ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            {status.message}
          </div>
        )}

        {/* Assignment Form */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-xs font-black text-slate-600 uppercase block mb-2">
              Operator toevoegen
            </label>
            <div className="flex gap-2">
              <select
                value={selectedOperator}
                onChange={(e) => setSelectedOperator(e.target.value)}
                className="flex-1 px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none"
              >
                <option value="">Selecteer...</option>
                {availableOperators.map(op => (
                  <option key={op.id} value={op.id}>
                    {op.name} ({op.employeeNumber})
                  </option>
                ))}
              </select>
              <button
                onClick={handleAssign}
                disabled={saving || !selectedOperator}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs disabled:opacity-50 transition"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Current Assignments */}
        <div>
          <label className="text-xs font-black text-slate-600 uppercase block mb-2">
            Huidige toewijzingen ({assignments.length})
          </label>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {assignments.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Geen toewijzingen</p>
            ) : (
              assignments.map(assignment => (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100"
                >
                  <div>
                    <div className="text-sm font-bold text-slate-800">
                      {assignment.operatorName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {assignment.hoursWorked}u
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(assignment.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="w-full mt-6 px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-black text-xs uppercase tracking-widest transition"
        >
          Sluit
        </button>
      </div>
    </div>
  );
};

export default StationAssignmentModal;
