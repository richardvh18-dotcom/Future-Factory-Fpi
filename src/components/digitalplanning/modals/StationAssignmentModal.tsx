import React, { useState, useEffect } from "react";
import i18n from "i18next";
import { useLocation } from "react-router-dom";
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
  query,
  where,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { db } from "../../../config/firebase";
import { getPathString, PATHS } from "../../../config/dbPaths";
import { useNotifications } from "../../../contexts/NotificationContext";
import { assignPersonnelToStation, removePersonnelAssignment } from "../../../services/planningSecurityService";

type StationAssignmentModalProps = {
  stationId: string;
  onClose: () => void;
  department?: string;
};

type PersonnelItem = {
  id: string;
  name?: string;
  employeeNumber?: string;
  [key: string]: unknown;
};

type AssignmentItem = {
  id: string;
  operatorNumber?: string;
  operatorName?: string;
  machineId?: string;
  date?: string;
  hoursWorked?: number;
  [key: string]: unknown;
};

type StatusMessage = {
  type: "success" | "error";
  message: string;
};

/**
 * StationAssignmentModal
 * Toewijzen van personeel aan werkstations
 */
const StationAssignmentModal = ({ stationId, onClose, department }: StationAssignmentModalProps) => {
  const { showConfirm } = useNotifications() as {
    showConfirm: (options: {
      title: string;
      message: string;
      confirmText: string;
      cancelText: string;
      tone: "danger" | "warning" | "default";
    }) => Promise<boolean>;
  };
  const [personnel, setPersonnel] = useState<PersonnelItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [selectedOperator, setSelectedOperator] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const location = useLocation();
  const auth = getAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(!!auth.currentUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
    });
    return () => unsubscribe();
  }, [auth]);

  useEffect(() => {
    let isMounted = true;
    if (!isAuthenticated) return;

    const loadData = async () => {
      try {
        // Load personeel
        const personelSnapshot = await getDocs(collection(db, getPathString(PATHS.PERSONNEL as string[])));
        const personnelItems = personelSnapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as PersonnelItem[];
        if (isMounted) {
          setPersonnel(personnelItems);
        }

        // Load huidige toewijzingen voor dit station vandaag
        const today = new Date().toISOString().split('T')[0];
        const assignQuery = query(
          collection(db, getPathString(PATHS.OCCUPANCY as string[])),
          where("machineId", "==", stationId),
          where("date", "==", today)
        );
        const assignSnapshot = await getDocs(assignQuery);
        const assignmentItems = assignSnapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as AssignmentItem[];
        if (isMounted) {
          setAssignments(assignmentItems);
          setLoading(false);
        }
      } catch (error: unknown) {
        console.error("Error loading data:", error);
        if (isMounted) {
          setStatus({ type: "error", message: "Fout bij laden van gegevens" });
          setLoading(false);
        }
      }
    };

    if (stationId) loadData();
    return () => { isMounted = false; };
  }, [stationId, isAuthenticated]);

  const handleAssign = async () => {
    if (!selectedOperator) {
      setStatus({ type: "error", message: "Selecteer een operator" });
      return;
    }

    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const operator = personnel.find(p => p.id === selectedOperator);
      await assignPersonnelToStation({
        stationId,
        operatorId: selectedOperator,
        operatorNumber: operator?.employeeNumber || selectedOperator,
        operatorName: operator?.name || selectedOperator,
        date: today,
        departmentId: department,
        hoursWorked: 8,
        shiftType: "DAG",
        source: "StationAssignmentModal",
        actorLabel: auth.currentUser?.email,
      });

      setAssignments([
        ...assignments,
        {
          id: `${stationId}-${selectedOperator}-${today}`,
          operatorNumber: operator?.employeeNumber || selectedOperator,
          operatorName: operator?.name,
          machineId: stationId,
          date: today,
          hoursWorked: 8,
        },
      ]);

      setSelectedOperator("");
      setStatus({ type: "success", message: "Personeelslid toegewezen" });
      setTimeout(() => setStatus(null), 3000);
    } catch (error: unknown) {
      console.error("Error assigning operator:", error);
      setStatus({ type: "error", message: "Fout bij toewijzing" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (assignmentId: string) => {
    const confirmed = await showConfirm({
      title: "Toewijzing verwijderen",
      message: "Verwijderen?",
      confirmText: "Verwijderen",
      cancelText: "Annuleren",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      await removePersonnelAssignment({
        assignmentId,
        stationId,
        source: "StationAssignmentModal",
        actorLabel: auth.currentUser?.email,
      });
      setAssignments(assignments.filter(a => a.id !== assignmentId));
      setStatus({ type: "success", message: "Toewijzing verwijderd" });
      setTimeout(() => setStatus(null), 3000);
    } catch (error: unknown) {
      console.error("Error removing assignment:", error);
      setStatus({ type: "error", message: "Fout bij verwijdering" });
    }
  };

  // Beveiliging: Render niets als uitgelogd of op login pagina
  if (!isAuthenticated || !auth.currentUser || location.pathname.includes("/login") || window.location.pathname.includes("/login")) return null;

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
                <option value="">{i18n.t('common.select', 'Selecteer...')}</option>
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
              <p className="text-xs text-slate-500 italic">{i18n.t('stationAssignment.noAssignments', 'Geen toewijzingen')}</p>
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
