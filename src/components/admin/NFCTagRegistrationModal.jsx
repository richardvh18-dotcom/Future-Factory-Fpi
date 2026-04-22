import React, { useState, useEffect } from "react";
import { X, Nfc, Trash2, Plus } from "lucide-react";
import { useNotifications } from "../../contexts/NotificationContext";
import { useNFCReader, NFC_STATUS } from "../../hooks/useNFCReader";
import { collection, getDocs, query, where, setDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useTranslation } from "react-i18next";

/**
 * NFCTagRegistrationModal — Admin tool
 *
 * Koppel NFC-tags (druppels) aan personeelsleden.
 * Ondersteunt:
 * - Web NFC API (NDEF Text records) → nieuwe tags
 * - Native wrapper (postMessage) → bestaande ATPS-druppels (low-level UID)
 *
 * Het systeem probeert eerst de mapping te checken; zo niet, fallback naar handmatig NDEF.
 */

const NFCTagRegistrationModal = ({ isOpen, onClose, personnel = [] }) => {
  const { t } = useTranslation();
  const { notify, showSuccess, showError, showWarning } = useNotifications();

  // State
  const [scannedTagId, setScannedTagId] = useState("");
  const [selectedEmployeeNumber, setSelectedEmployeeNumber] = useState("");
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // NFC scan callback — registreer tag wanneer gelezen
  const nfc = useNFCReader((tagId) => {
    const cleaned = String(tagId).trim().toUpperCase();
    setScannedTagId(cleaned);
    showSuccess(`Tag gelezen: ${cleaned.slice(0, 8)}...`);
  });

  // Laad bestaande koppelingen
  useEffect(() => {
    if (!isOpen) return;
    loadMappings();
  }, [isOpen]);

  const loadMappings = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, ...PATHS.NFC_TAG_MAPPINGS));
      setMappings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error loading NFC mappings:", err);
      showError("Kon koppelingen niet laden");
    } finally {
      setLoading(false);
    }
  };

  // Opslaan
  const handleSaveMapping = async () => {
    if (!scannedTagId) {
      showWarning("Scan eerst een tag");
      return;
    }
    if (!selectedEmployeeNumber) {
      showWarning("Selecteer een personeelslid");
      return;
    }

    // Controleer duplicaten
    if (mappings.some((m) => m.tagId === scannedTagId)) {
      showWarning("Deze tag is al gekoppeld");
      return;
    }

    setSaving(true);
    try {
      const docId = scannedTagId; // Gebruik UID als document ID
      const employee = personnel.find(
        (p) => p.employeeNumber === selectedEmployeeNumber
      );

      await setDoc(doc(db, ...PATHS.NFC_TAG_MAPPINGS, docId), {
        tagId: scannedTagId,
        employeeNumber: selectedEmployeeNumber,
        employeeName: employee?.name || "Onbekend",
        department: employee?.departmentId || null,
        registeredAt: serverTimestamp(),
        registeredBy: "admin", // Later: huidge user email
      });

      showSuccess(`${employee?.name || selectedEmployeeNumber} gekoppeld aan tag`);
      setScannedTagId("");
      setSelectedEmployeeNumber("");
      await loadMappings();
    } catch (err) {
      console.error("Error saving mapping:", err);
      showError("Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  };

  // Verwijderen
  const handleDeleteMapping = async (mappingId) => {
    if (!window.confirm("Koppeling verwijderen?")) return;
    try {
      await deleteDoc(doc(db, ...PATHS.NFC_TAG_MAPPINGS, mappingId));
      showSuccess("Koppeling verwijderd");
      await loadMappings();
    } catch (err) {
      console.error("Error deleting mapping:", err);
      showError("Verwijderen mislukt");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[140] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-600 text-white">
              <Nfc size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">
                NFC-tags koppelen
              </h2>
              <p className="text-xs text-slate-500 font-bold">
                Druppels aan personeelsleden registreren
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Registratie sectie */}
          <div className="space-y-4 p-4 rounded-2xl border-2 border-blue-200 bg-blue-50">
            <h3 className="text-sm font-black text-blue-900 uppercase tracking-widest">
              Nieuwe tag registreren
            </h3>

            {/* NFC Scan knop */}
            <div>
              <button
                onClick={nfc.status === NFC_STATUS.SCANNING ? nfc.stopScan : nfc.startScan}
                disabled={!nfc.isSupported}
                className={`w-full py-4 rounded-xl font-black uppercase text-sm flex items-center justify-center gap-2 transition-all ${
                  nfc.status === NFC_STATUS.SCANNING
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse"
                    : nfc.status === NFC_STATUS.SUCCESS
                    ? "bg-emerald-100 text-emerald-700 border-2 border-emerald-300"
                    : nfc.status === NFC_STATUS.ERROR
                    ? "bg-red-50 text-red-600 border-2 border-red-200"
                    : "bg-blue-100 hover:bg-blue-200 text-blue-700 border-2 border-blue-300"
                }`}
              >
                <Nfc size={18} />
                {nfc.status === NFC_STATUS.SCANNING
                  ? "NFC actief — houd tag voor lezer..."
                  : nfc.status === NFC_STATUS.SUCCESS
                  ? `Tag gelezen ✓`
                  : nfc.status === NFC_STATUS.ERROR
                  ? nfc.errorMessage || "NFC fout"
                  : nfc.isSupported
                  ? "Tag scannen"
                  : "NFC niet ondersteund op dit toestel"}
              </button>
              {!nfc.isSupported && (
                <p className="text-xs text-slate-500 mt-2 italic">
                  NFC alleen beschikbaar op Android Chrome 89+
                </p>
              )}
            </div>

            {/* Tag ID input (ook handmatig) */}
            <div>
              <label className="text-[10px] font-black text-blue-700 uppercase tracking-widest block mb-2">
                Tag ID / UID (gescanned of handmatig)
              </label>
              <input
                type="text"
                value={scannedTagId}
                onChange={(e) => setScannedTagId(e.target.value.toUpperCase())}
                placeholder="Bijv. F1D4A2B9..."
                className="w-full p-3 rounded-xl border-2 border-blue-200 font-mono text-sm text-blue-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
              />
              <p className="text-[10px] text-blue-600 mt-1">
                UID van bestaande ATPS-druppel of NDEF tag ID
              </p>
            </div>

            {/* Personeelslid selecteren */}
            <div>
              <label className="text-[10px] font-black text-blue-700 uppercase tracking-widest block mb-2">
                Personeelslid
              </label>
              <select
                value={selectedEmployeeNumber}
                onChange={(e) => setSelectedEmployeeNumber(e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-blue-200 font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
              >
                <option value="">— Selecteer personeelslid —</option>
                {personnel.map((p) => (
                  <option key={p.id} value={p.employeeNumber}>
                    {p.name} ({p.employeeNumber})
                  </option>
                ))}
              </select>
            </div>

            {/* Opslaan knop */}
            <button
              onClick={handleSaveMapping}
              disabled={!scannedTagId || !selectedEmployeeNumber || saving}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs tracking-widest disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              {saving ? "Opslaan..." : "Koppeling opslaan"}
            </button>
          </div>

          {/* Bestaande koppelingen */}
          <div className="space-y-3">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
              Bestaande koppelingen ({mappings.length})
            </h3>

            {loading ? (
              <div className="p-4 text-center text-slate-500 font-bold">
                Laden...
              </div>
            ) : mappings.length === 0 ? (
              <div className="p-4 text-center text-slate-400 italic text-sm">
                Geen koppelingen geregistreerd
              </div>
            ) : (
              <div className="grid gap-2">
                {mappings.map((mapping) => (
                  <div
                    key={mapping.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-[11px] font-mono bg-slate-200 px-2 py-1 rounded text-slate-800">
                          {mapping.tagId}
                        </code>
                        <span className="text-xs font-bold text-slate-700">
                          →
                        </span>
                        <span className="text-sm font-bold text-slate-900">
                          {mapping.employeeName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold">
                          ({mapping.employeeNumber})
                        </span>
                        {mapping.department && (
                          <span className="text-[10px] px-2 py-1 rounded-full bg-slate-200 text-slate-600 font-bold">
                            {mapping.department}
                          </span>
                        )}
                      </div>
                      {mapping.registeredAt && (
                        <p className="text-[10px] text-slate-400 mt-1">
                          Geregistreerd:{" "}
                          {new Date(mapping.registeredAt.seconds * 1000).toLocaleDateString("nl-NL")}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteMapping(mapping.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                      title="Koppeling verwijderen"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-6 border-t border-slate-200 bg-slate-50">
          <p className="text-xs text-slate-500 font-bold">
            💡 Tip: Scan de druppels waarmee medewerkers inloggen. Het systeem herkennt ze dan automatisch.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm uppercase"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};

export default NFCTagRegistrationModal;
