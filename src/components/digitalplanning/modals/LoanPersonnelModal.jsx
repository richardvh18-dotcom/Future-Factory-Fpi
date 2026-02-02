import React, { useState, useEffect } from "react";
import { X, ArrowRight, Users, Building2, Clock } from "lucide-react";
import { doc, setDoc, collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";
import { format, parse } from "date-fns";

/**
 * LoanPersonnelModal - Personeel uitlenen aan andere afdelingen (V2)
 * - Teamleaders kunnen tijdelijk personeel aan een andere afdeling uitlenen
 * - Uitgeleende persoon krijgt de shift-tijden van de doelafdeling
 */
const LoanPersonnelModal = ({ isOpen, onClose, person, currentDepartment }) => {
  const [targetDepartment, setTargetDepartment] = useState("");
  const [targetStation, setTargetStation] = useState("");
  const [targetShift, setTargetShift] = useState("");
  const [departments, setDepartments] = useState([]);
  const [saving, setSaving] = useState(false);

  const todayStr = format(new Date(), "yyyy-MM-dd");

  // Laad factory configuratie
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = onSnapshot(
      doc(db, ...PATHS.FACTORY_CONFIG),
      (snap) => {
        if (snap.exists()) {
          const config = snap.data();
          // Filter huidige afdeling uit
          const otherDepts = (config.departments || []).filter(
            d => d.id !== currentDepartment.id
          );
          setDepartments(otherDepts);
        }
      }
    );

    return () => unsubscribe();
  }, [isOpen, currentDepartment]);

  const selectedDept = departments.find(d => d.id === targetDepartment);
  const availableStations = selectedDept ? selectedDept.stations || [] : [];
  const availableShifts = selectedDept ? selectedDept.shifts || [] : [];

  // Bereken shift uren
  const calculateShiftHours = (shiftObj) => {
    try {
      const start = parse(shiftObj.start, 'HH:mm', new Date());
      const end = parse(shiftObj.end, 'HH:mm', new Date());
      let diff = (end - start) / (1000 * 60 * 60);
      if (diff < 0) diff += 24;
      const deduction = shiftObj.id === "DAGDIENST" ? 0.75 : 0; // Pauze aftrek voor dagdienst
      return Math.max(0, diff - deduction);
    } catch (e) {
      return 8.0;
    }
  };

  const selectedShift = availableShifts.find(s => s.id === targetShift);
  const shiftHours = selectedShift ? calculateShiftHours(selectedShift) : 0;

  const handleLoan = async () => {
    if (!targetDepartment || !targetStation || !targetShift || !person) return;

    setSaving(true);
    try {
      const selectedShiftData = availableShifts.find(s => s.id === targetShift);
      if (!selectedShiftData) {
        alert("Selecteer een geldige shift.");
        setSaving(false);
        return;
      }

      // Maak een nieuwe occupancy record voor de doelstation met de NIEUWE shift-tijden
      const loanId = `loan_${person.operatorNumber}_${targetDepartment}_${Date.now()}`;
      await setDoc(doc(db, ...PATHS.OCCUPANCY, loanId), {
        operatorNumber: person.operatorNumber,
        operatorName: person.operatorName,
        machineId: targetStation,
        departmentId: targetDepartment,
        date: todayStr,
        shift: selectedShiftData.label,
        shiftStart: selectedShiftData.start,
        shiftEnd: selectedShiftData.end,
        hoursWorked: calculateShiftHours(selectedShiftData),
        isPloeg: selectedShiftData.id !== "DAGDIENST",
        isLoan: true,
        loanFromDepartment: currentDepartment.id,
        loanFromStation: person.machineId,
        originalShift: person.shift, // Bewaar originele shift voor referentie
        timestamp: new Date().toISOString()
      });

      onClose();
    } catch (error) {
      console.error("Fout bij uitlenen personeel:", error);
      alert("Er is een fout opgetreden bij het uitlenen van personeel.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-[40px] shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-8 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-3xl font-black uppercase italic tracking-tighter">
                Personeel Uitlenen
              </h2>
              <p className="text-sm text-blue-100 mt-2 font-bold">
                Tijdelijk toewijzen aan andere afdeling
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          {/* Huidige situatie */}
          <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-slate-800 rounded-xl">
                <Users size={20} className="text-white" />
              </div>
              <h3 className="text-lg font-black text-slate-800 uppercase italic">
                Huidige Toewijzing
              </h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-600">Naam:</span>
                <span className="text-sm font-black text-slate-900 uppercase italic">
                  {person?.operatorName}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-600">Afdeling:</span>
                <span className="text-sm font-black text-slate-900 uppercase italic">
                  {currentDepartment?.name}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-600">Station:</span>
                <span className="text-sm font-black text-slate-900 uppercase italic">
                  {person?.machineId}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-600">Shift:</span>
                <span className="text-sm font-black text-slate-900">
                  {person?.shiftStart} - {person?.shiftEnd}
                </span>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="p-3 bg-blue-100 rounded-full">
              <ArrowRight size={24} className="text-blue-600" />
            </div>
          </div>

          {/* Nieuwe toewijzing */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-600 rounded-xl">
                <Building2 size={20} className="text-white" />
              </div>
              <h3 className="text-lg font-black text-slate-800 uppercase italic">
                Uitlenen Aan
              </h3>
            </div>

            {/* Afdeling selectie */}
            <div>
              <label className="block text-xs font-black text-slate-600 uppercase tracking-widest mb-2">
                Doel Afdeling
              </label>
              <select
                value={targetDepartment}
                onChange={(e) => {
                  setTargetDepartment(e.target.value);
                  setTargetStation(""); // Reset station bij afdeling wijziging
                }}
                className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-900 focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="">-- Selecteer afdeling --</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Station selectie */}
            {targetDepartment && (
              <div className="animate-in slide-in-from-top-2 duration-300">
                <label className="block text-xs font-black text-slate-600 uppercase tracking-widest mb-2">
                  Doel Station
                </label>
                <select
                  value={targetStation}
                  onChange={(e) => setTargetStation(e.target.value)}
                  className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-900 focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="">-- Selecteer station --</option>
                  {availableStations.map((station) => (
                    <option key={station.id} value={station.name}>
                      {station.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Shift selectie */}
            {targetDepartment && (
              <div className="animate-in slide-in-from-top-2 duration-300">
                <label className="block text-xs font-black text-slate-600 uppercase tracking-widest mb-2">
                  Shift Planning
                </label>
                <select
                  value={targetShift}
                  onChange={(e) => setTargetShift(e.target.value)}
                  className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-900 focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="">-- Selecteer shift --</option>
                  {availableShifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.label} ({shift.start} - {shift.end})
                    </option>
                  ))}
                </select>
                {selectedShift && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold text-blue-900">Gewerkte uren:</span>
                      <span className="font-black text-blue-600">{shiftHours.toFixed(1)} uur</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Info bericht */}
          <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <Clock size={20} className="text-amber-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-900">
                  <strong>Let op:</strong> De persoon krijgt de shift-tijden van de gekozen afdeling en shift.
                  De originele planning blijft behouden voor referentie.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 bg-slate-50 flex justify-end gap-4 border-t-2 border-slate-200">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-white border-2 border-slate-200 rounded-2xl font-black text-slate-700 uppercase text-sm hover:bg-slate-100 transition-all"
          >
            Annuleren
          </button>
          <button
            onClick={handleLoan}
            disabled={!targetDepartment || !targetStation || !targetShift || saving}
            className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-black uppercase text-sm hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Bezig...
              </>
            ) : (
              <>
                <ArrowRight size={16} />
                Uitlenen
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoanPersonnelModal;
