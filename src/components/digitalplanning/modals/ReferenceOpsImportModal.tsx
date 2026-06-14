import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, Upload, Loader2, Database, CheckCircle, AlertTriangle, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { getFunctions, httpsCallable } from "firebase/functions";
import app from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";

/**
 * ReferenceOpsImportModal
 * Importeert de "Reference operations LN Frank.xlsx" stamdata naar Firestore,
 * zodat refOp-codes + beschrijvingen + classificaties database-gestuurd zijn
 * en niet hardcoded in de applicatie.
 *
 * Firestore pad: PATHS.REFERENCE_OPERATIONS (<refOpCode> als document-ID)
 * {
 *   code: "1715",
 *   description: "Moulded Fittings Production",
 *   type: "production" | "post" | "qc",
 *   site: "101",
 *   workCenters: ["01BM01", "01BG71", ...],
 *   descriptions: ["Moulded Fittings Production", ...],
 *   updatedAt: ISO string
 * }
 */
const ReferenceOpsImportModal = ({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess?: () => void }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<any>(null); // { records: [...], site: "101" }
  const [result, setResult] = useState<any>(null);  // { written, skipped }
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const functions = getFunctions(app, 'europe-west1');
  const importReferenceOperationsCallable = httpsCallable(functions, "importReferenceOperations");

  if (!isOpen) return null;

  const clean = (val: any) => String(val ?? "").trim();

  const deriveType = (descriptions: string[], workCenters: string[]) => {
    const combined = [...descriptions, ...workCenters]
      .map((s) => clean(s).toLowerCase())
      .join(" ");
    if (combined.includes("qc") || combined.includes("inspect") || combined.includes("hydro")) return "qc";
    if (combined.includes("finishing") || combined.includes("nabewerk") || combined.includes("hw finishing")) return "post";
    if (combined.includes("production") || combined.includes("wikkelen") || combined.includes("laminat")) return "production";
    return "production";
  };

  const parseRefOpsFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { cellDates: true });

    // Zoek "data" sheet
    const sheetName = wb.SheetNames.find((n: string) => n.toLowerCase() === "data") || wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (!rawRows.length) throw new Error("Geen rijen gevonden in het bestand.");

    // Header staat op rij 0 (index 0) in de reference ops file
    const headers = (rawRows[0] as any[]).map((h: any) => clean(h));
    const dataRows = rawRows.slice(1);

    const findCol = (candidates: string[]) => {
      const normalizedHeaders = headers.map((h: string) => h.toLowerCase());
      for (const c of candidates) {
        const idx = normalizedHeaders.findIndex((h: string) => h.includes(c.toLowerCase()));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const idxRefOp = findCol(["reference operation"]);
    const idxDesc = findCol(["description"]);
    // Fallback: description is soms een naamloze kolom direct na Reference Operation
    const descColFallback = idxRefOp !== -1 ? idxRefOp + 1 : -1;
    const idxSite = findCol(["site"]);
    const idxWc = findCol(["work center"]);

    if (idxRefOp === -1) throw new Error("Kolom 'Reference Operation' niet gevonden.");

    // Groepeer per refOp code, filter op Site 101
    const grouped = new Map<string, { workCenters: Set<string>; descriptions: Set<string> }>(); // code → { workCenters, descriptions }

    dataRows.forEach((row: any) => {
      const code = clean(row[idxRefOp]);
      if (!code || isNaN(Number(code))) return;

      const site = idxSite !== -1 ? clean(row[idxSite]) : "";
      // Numeriek vergelijken: "101.0" == 101
      const siteNum = parseFloat(site);
      if (!isNaN(siteNum) && siteNum !== 101) return;
      // Site als string: filter op "101" of leeg (dan alles)
      if (site && site !== "101" && site !== "101.0") return;

      const wc = idxWc !== -1 ? clean(row[idxWc]) : "";
      // Description: benoemde kolom of fallback positie
      const desc =
        idxDesc !== -1
          ? clean(row[idxDesc])
          : descColFallback !== -1
          ? clean(row[descColFallback])
          : "";

      if (!grouped.has(code)) {
        grouped.set(code, { workCenters: new Set(), descriptions: new Set() });
      }
      const entry = grouped.get(code);
      if (!entry) return;
      if (wc) entry.workCenters.add(wc);
      if (desc) entry.descriptions.add(desc);
    });

    if (!grouped.size) throw new Error("Geen geldige Reference Operation-rijen gevonden voor Site 101.");

    const records = Array.from(grouped.entries()).map(([code, { workCenters, descriptions }]) => {
      const wcsArr = Array.from(workCenters) as string[];
      const descsArr = Array.from(descriptions) as string[];
      const primaryDesc = descsArr[0] || code;
      const type = deriveType(descsArr, wcsArr);
      return {
        code,
        description: primaryDesc,
        descriptions: descsArr,
        type,
        site: "101",
        workCenters: wcsArr,
        updatedAt: new Date().toISOString(),
      };
    });

    return records;
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreview(null);
    setResult(null);
    setLoading(true);
    try {
      const records = await parseRefOpsFile(file);
      setPreview({ records });
    } catch (err: any) {
      setError(err.message || "Fout bij inlezen bestand.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!preview?.records?.length) return;
    setSaving(true);
    setError(null);
    try {
      const res = await importReferenceOperationsCallable({
        records: preview.records,
      });

      const payload = (res?.data || {}) as { written?: number; overwritten?: number };
      setResult({
        written: Number(payload.written || preview.records.length),
        skipped: Number(payload.overwritten || 0),
      });
      onSuccess?.();
    } catch (err: any) {
      const backendMsg = err?.message || err?.details?.message || err;
      setError("Fout bij backend import: " + backendMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setPreview(null);
    setResult(null);
    setError(null);
    setLoading(false);
    setSaving(false);
    onClose();
  };

  const typeColor = (type: string) => {
    if (type === "qc") return "bg-blue-100 text-blue-700";
    if (type === "post") return "bg-amber-100 text-amber-700";
    return "bg-emerald-100 text-emerald-700";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-50 rounded-xl">
              <Database size={20} className="text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase text-slate-800 tracking-tight">
                Reference Operations Import
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                LN Stamdata → Firestore (Site 101)
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
            {result ? t('common.close', 'Sluiten') : t('common.cancel', 'Annuleren')}
          <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 text-sm text-violet-800">
            <p className="font-bold mb-1">{t("referenceOpsImport.whatDoesThisImportDo", "Wat doet deze import?")}</p>
            <p className="text-xs leading-relaxed">
              {t("referenceOpsImport.loadsReferenceOperations", "Laadt de ")}<strong>{t("referenceOpsImport.fileName", "Reference operations LN Frank.xlsx")}</strong>{t("referenceOpsImport.masterDataToFirestore", " stamdata naar Firestore.")}
              Elke refOp-code (bv. 1715, 1020, 1740) krijgt een document met beschrijving en type
              (<em>{t("referenceOpsImport.typeValues", "production / post / qc")}</em>). {t("referenceOpsImport.replacesHardcodedClassifications", "Dit vervangt hardcoded classificaties in de app.")}
            </p>
          </div>

          {/* Upload */}
          {!result && (
            <div
              className="border-2 border-dashed border-violet-200 rounded-2xl p-8 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition-all"
              onClick={() => fileInputRef.current?.click()}
            >
              {loading ? (
                <Loader2 className="mx-auto animate-spin text-violet-500 mb-2" size={28} />
              ) : (
                <FileSpreadsheet className="mx-auto text-violet-400 mb-2" size={28} />
              )}
              <p className="font-bold text-slate-700 text-sm">
                {loading ? "Bestand inlezen…" : "Klik om Reference operations xlsx te selecteren"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Verwacht: "Reference operations LN Frank.xlsx" (tabblad "data", Site 101)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFile}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Preview tabel */}
          {preview && !result && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide">
                  Preview — {preview.records.length} codes gevonden
                </h3>
                <span className="text-xs text-slate-400">{t("referenceOpsImport.onlySite101", "Alleen Site 101")}</span>
              </div>
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2 font-black text-slate-600 uppercase tracking-wide">{t("referenceOpsImport.code", "Code")}</th>
                        <th className="text-left px-4 py-2 font-black text-slate-600 uppercase tracking-wide">{t("referenceOpsImport.description", "Omschrijving")}</th>
                        <th className="text-left px-4 py-2 font-black text-slate-600 uppercase tracking-wide">{t("referenceOpsImport.type", "Type")}</th>
                        <th className="text-left px-4 py-2 font-black text-slate-600 uppercase tracking-wide">{t("referenceOpsImport.workCenters", "WorkCenters")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.records.map((rec: { code: string; description?: string; type: string; workCenters: string[] }) => (
                        <tr key={rec.code} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-2 font-mono font-bold text-slate-800">{rec.code}</td>
                          <td className="px-4 py-2 text-slate-600">{rec.description || "—"}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${typeColor(rec.type)}`}>
                              {rec.type}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-400 font-mono text-[10px]">
                            {rec.workCenters.slice(0, 3).join(", ")}
                            {rec.workCenters.length > 3 && ` +${rec.workCenters.length - 3}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Type wordt afgeleid uit de WorkCenter-beschrijvingen.{" "}
                <strong className="text-slate-500">{t("referenceOpsImport.qc", "QC")}</strong> → qc,{" "}
                <strong className="text-slate-500">{t("referenceOpsImport.finishingPost", "Finishing / Nabewerken")}</strong> → post,{" "}
                overige → production.
              </p>
            </div>
          )}

          {/* Resultaat */}
          {result && (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <div className="p-4 bg-emerald-50 rounded-full">
                <CheckCircle size={32} className="text-emerald-500" />
              </div>
              <div className="text-center">
                <p className="font-black text-slate-800 text-lg">{result.written} codes opgeslagen</p>
                <p className="text-sm text-slate-500 mt-1">
                  Firestore pad:{" "}
                  <code className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">
                    {PATHS.REFERENCE_OPERATIONS.join("/")}
                  </code>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 shrink-0 flex justify-between items-center gap-3">
          <button
            onClick={handleClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-wider hover:bg-slate-50 transition-colors"
          >
            {result ? "Sluiten" : "Annuleren"}
          </button>

          {preview && !result && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {saving ? (
                  <><Loader2 size={14} className="animate-spin" /> {t('common.saving', 'Opslaan…')}</>
              ) : (
                  <><Upload size={14} /> {t('referenceOpsImport.saveToFirestore', 'Opslaan naar Firestore')}</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReferenceOpsImportModal;
