/* eslint-disable */
import React, { useState, useEffect } from "react";
import { X, Nfc, Trash2, Plus } from "lucide-react";
import { useNotifications } from "../../contexts/NotificationContext";
import { useNFCReader, NFC_STATUS } from "../../hooks/useNFCReader";
import { collection, getDocs, query, where, setDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS, getPathString } from "../../config/dbPaths";
import { useTranslation } from "react-i18next";

type PersonnelRecord = {
  id: string;
  name?: string;
  employeeNumber?: string;
  departmentId?: string;
  [key: string]: unknown;
};

type MappingRecord = {
  id: string;
  tagId?: string;
  employeeNumber?: string;
  employeeName?: string;
  department?: string | null;
  registeredAt?: { seconds?: number };
  [key: string]: unknown;
};

type NFCTagRegistrationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  personnel?: PersonnelRecord[];
  preselectedEmployeeNumber?: string;
};

const colPath = (path: string[]) => collection(db, getPathString(path));
const docPath = (path: string[], id: string) => doc(db, `${getPathString(path)}/${id}`);

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

const NFCTagRegistrationModal = ({ isOpen, onClose, personnel = [], preselectedEmployeeNumber = "" }: NFCTagRegistrationModalProps) => {
  const { t } = useTranslation();
  const { notify, showSuccess, showError, showWarning } = useNotifications();

  const normalizeTagId = (value: unknown) =>
    String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

  const normalizeEmployeeNumber = (value: unknown) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase();

  // State
  const [scannedTagId, setScannedTagId] = useState("");
  const [selectedEmployeeNumber, setSelectedEmployeeNumber] = useState("");
  const [manualEmployeeNumber, setManualEmployeeNumber] = useState("");
  const [mappings, setMappings] = useState<MappingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // NFC scan callback — registreer tag wanneer gelezen
  const nfc = useNFCReader((tagId: string) => {
    const cleaned = normalizeTagId(tagId);
    if (!cleaned) {
      showWarning("Lege of ongeldige tagwaarde ontvangen");
      return;
    }
    setScannedTagId(cleaned);
    showSuccess(`Tag gelezen: ${cleaned.slice(0, 8)}...`);
  });

  // Laad bestaande koppelingen
  useEffect(() => {
    if (!isOpen) return;
    loadMappings();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const preset = normalizeEmployeeNumber(preselectedEmployeeNumber);
    if (!preset) return;
    setSelectedEmployeeNumber(preset);
    setManualEmployeeNumber("");
  }, [isOpen, preselectedEmployeeNumber]);

  const loadMappings = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(colPath(PATHS.NFC_TAG_MAPPINGS));
      setMappings(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as MappingRecord[]);
    } catch (err: unknown) {
      console.error("Error loading NFC mappings:", err);
      showError("Kon koppelingen niet laden");
    } finally {
      setLoading(false);
    }
  };

  const handleScanClick = () => {
    if (nfc.status === NFC_STATUS.SCANNING) {
      nfc.stopScan();
      return;
    }
    if (!nfc.isSupported) {
      showWarning("Web NFC werkt alleen in Chrome op Android (https). Gebruik anders handmatige UID invoer.");
      return;
    }
    nfc.startScan();
  };

  // Opslaan
  const handleSaveMapping = async () => {
    if (!scannedTagId) {
      showWarning("Scan eerst een tag");
      return;
    }
    const resolvedEmployeeNumber = normalizeEmployeeNumber(
      selectedEmployeeNumber || manualEmployeeNumber
    );
    if (!resolvedEmployeeNumber) {
      showWarning("Selecteer een personeelslid");
      return;
    }

    const normalizedTagId = normalizeTagId(scannedTagId);
    if (!normalizedTagId) {
      showWarning("Tag ID is ongeldig");
      return;
    }

    // Controleer duplicaten
    if (mappings.some((m) => normalizeTagId(m.tagId) === normalizedTagId)) {
      showWarning("Deze tag is al gekoppeld");
      return;
    }

    setSaving(true);
    try {
      const docId = normalizedTagId; // Gebruik genormaliseerde UID als document ID
      const employee = personnel.find((p) => {
        const candidate = normalizeEmployeeNumber(p.employeeNumber);
        if (candidate && candidate === resolvedEmployeeNumber) return true;
        const candidateDigits = String(p.employeeNumber || "").replace(/\D/g, "").replace(/^0+/, "");
        const resolvedDigits = resolvedEmployeeNumber.replace(/\D/g, "").replace(/^0+/, "");
        return Boolean(candidateDigits && resolvedDigits && candidateDigits === resolvedDigits);
      });

      if (!employee) {
        showWarning(`Personeelsnummer ${resolvedEmployeeNumber} niet gevonden`);
        setSaving(false);
        return;
      }

      await setDoc(docPath(PATHS.NFC_TAG_MAPPINGS, docId), {
        tagId: normalizedTagId,
        employeeNumber: String(employee.employeeNumber || resolvedEmployeeNumber),
        employeeName: employee?.name || "Onbekend",
        department: employee?.departmentId || null,
        registeredAt: serverTimestamp(),
        registeredBy: "admin", // Later: huidge user email
      });

      showSuccess(`${employee?.name || resolvedEmployeeNumber} gekoppeld aan tag`);
      setScannedTagId("");
      setSelectedEmployeeNumber("");
      setManualEmployeeNumber("");
      await loadMappings();
    } catch (err: unknown) {
      console.error("Error saving mapping:", err);
      showError("Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  };

  // Verwijderen
  const handleDeleteMapping = async (mappingId: string) => {
    if (!window.confirm("Koppeling verwijderen?")) return;
    try {
      await deleteDoc(docPath(PATHS.NFC_TAG_MAPPINGS, mappingId));
      showSuccess("Koppeling verwijderd");
      await loadMappings();
    } catch (err: unknown) {
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
                onClick={handleScanClick}
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
                onChange={(e) => setScannedTagId(normalizeTagId(e.target.value))}
                placeholder={t("placeholders.adminNfcTagHexExample", "Bijv. F1D4A2B9...")}
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
                onChange={(e) => {
                  setSelectedEmployeeNumber(e.target.value);
                  if (e.target.value) setManualEmployeeNumber("");
                }}
                className="w-full p-3 rounded-xl border-2 border-blue-200 font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
              >
                <option value="">{t('nfc.selectEmployee', '— Selecteer personeelslid —')}</option>
                {personnel.map((p) => (
                  <option key={p.id} value={p.employeeNumber}>
                    {p.name} ({p.employeeNumber})
                  </option>
                ))}
              </select>
              <div className="mt-2">
                <label className="text-[10px] font-black text-blue-700 uppercase tracking-widest block mb-2">
                  Of handmatig personeelsnummer
                </label>
                <input
                  type="text"
                  value={manualEmployeeNumber}
                  onChange={(e) => {
                    setManualEmployeeNumber(e.target.value);
                    if (e.target.value.trim()) setSelectedEmployeeNumber("");
                  }}
                  placeholder={t("placeholders.adminNfcOperatorExample", "Bijv. 12345")}
                  className="w-full p-3 rounded-xl border-2 border-blue-200 font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>

            {/* Opslaan knop */}
            <button
              onClick={handleSaveMapping}
              disabled={!scannedTagId || !(selectedEmployeeNumber || manualEmployeeNumber) || saving}
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
                      {mapping.registeredAt?.seconds && (
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
