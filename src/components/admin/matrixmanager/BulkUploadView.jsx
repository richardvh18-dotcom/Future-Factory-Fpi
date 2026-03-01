import React, { useState, useEffect } from "react";
import {
  FileUp,
  Database,
  CheckCircle2,
  Loader2,
  Table,
  AlertCircle,
  ShieldAlert,
  FileSpreadsheet,
  Clipboard,
  Zap,
  X,
  FileCheck,
  FileText,
  Info,
  Save,
} from "lucide-react";
import { doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";

/**
 * BulkUploadView V3.0 - Root Path Edition
 * Ondersteunt: XLSX Import, Plakken uit Excel, Validatie.
 * ALLES wordt nu opgeslagen in: /future-factory/production/dimensions/...
 */
const BulkUploadView = () => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [targetKey, setTargetKey] = useState("FITTING_SPECS");
  const [previewData, setPreviewData] = useState([]);
  const [pastedText, setPastedText] = useState("");
  const [validationErrors, setValidationErrors] = useState([]);
  const [isVerified, setIsVerified] = useState(false);
  const [xlsxReady, setXlsxReady] = useState(false);

  // Mapping van UI selectie naar PATHS keys
  const COLLECTIONS = [
    { id: "FITTING_SPECS", label: "Fitting Afmetingen (Basis - CB)" },
    { id: "SOCKET_SPECS", label: "Socket Afmetingen (*_Socket - CB)" },
    { id: "CB_DIMENSIONS", label: "Mof Afmetingen (CB)" },
    { id: "TB_DIMENSIONS", label: "Mof Afmetingen (TB)" },
    { id: "BORE_DIMENSIONS", label: "Boring Afmetingen (Bore)" },
  ];

  // Header definities voor templates
  const TEMPLATE_CONFIG = {
    FITTING_SPECS: ["id", "TW", "L", "Lo", "R", "Weight", "articleCode"],
    SOCKET_SPECS: ["id", "TWcb", "BD", "W"],
    CB_DIMENSIONS: ["id", "B1", "B2", "BA", "A"],
    TB_DIMENSIONS: ["id", "B1", "B2", "BA", "A", "TWtb", "BD", "W"],
    BORE_DIMENSIONS: ["id", "k", "d", "n", "b"],
  };

  // Laad XLSX bibliotheek dynamisch in
  useEffect(() => {
    if (window.XLSX) {
      setXlsxReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    script.async = true;
    script.onload = () => setXlsxReady(true);
    document.head.appendChild(script);
  }, []);

  const downloadTemplate = (format = "excel") => {
    const headers = TEMPLATE_CONFIG[targetKey];
    const fileName = `template_${targetKey.toLowerCase()}`;

    if (format === "excel" && window.XLSX) {
      const ws = window.XLSX.utils.aoa_to_sheet([headers]);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "Template");
      window.XLSX.writeFile(wb, `${fileName}.xlsx`);
    } else {
      const csvContent = "data:text/csv;charset=utf-8," + headers.join(",");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${fileName}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const parseRawData = (rows) => {
    setIsVerified(false);
    setValidationErrors([]);
    const cleanRows = rows.filter((row) => {
      const keys = Object.keys(row).filter((k) => k.trim() !== "");
      return keys.length > 0;
    });
    setPreviewData(cleanRows);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !xlsxReady) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = window.XLSX.read(data, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(firstSheet);
      parseRawData(rows);
    };
    reader.readAsArrayBuffer(file);
  };

  const handlePaste = (e) => {
    const text = e.target.value;
    setPastedText(text);
    if (!text.trim()) return;
    const lines = text.split("\n").filter((line) => line.trim());
    const rawHeaders = lines[0].split("\t").map((h) => h.trim());
    const headers = rawHeaders.filter((h) => h !== "");

    const rows = lines.slice(1).map((line) => {
      const values = line.split("\t");
      const obj = {};
      headers.forEach((h, i) => {
        if (!h) return;
        let val = values[i]?.trim() || "";
        const cleanHeader = h.toLowerCase();
        if (
          val !== "" &&
          !isNaN(val) &&
          !["id", "articlecode", "drawing"].includes(cleanHeader)
        ) {
          val = Number(val);
        }
        obj[h] = val;
      });
      return obj;
    });
    parseRawData(rows);
  };

  const validateData = () => {
    const errors = [];
    if (previewData.length === 0)
      errors.push("Geen data gevonden om te controleren.");
    previewData.forEach((row, index) => {
      if (!row.id) errors.push(`Rij ${index + 1}: Het veld 'id' is verplicht.`);
      Object.keys(row).forEach((key) => {
        if (key === "" || key === "undefined") {
          errors.push(
            `Rij ${
              index + 1
            }: Bevat een kolom zonder naam. Verwijder lege kolommen uit Excel.`
          );
        }
      });
    });

    const uniqueErrors = [...new Set(errors)];
    setValidationErrors(uniqueErrors);

    if (uniqueErrors.length === 0 && previewData.length > 0) {
      setIsVerified(true);
      setStatus({
        type: "success",
        msg: "Data validatie succesvol. Klaar voor import.",
      });
    } else {
      setIsVerified(false);
      setStatus({
        type: "error",
        msg: "Controle mislukt. Corrigeer de fouten.",
      });
    }
  };

  const processImport = async () => {
    if (!isVerified || loading) return;
    setLoading(true);
    const batch = writeBatch(db);
    let count = 0;

    try {
      // Haal het juiste pad op uit dbPaths.js
      const pathArray = PATHS[targetKey];

      previewData.forEach((row) => {
        if (!row.id) return;
        const cleanEntry = {};
        Object.entries(row).forEach(([k, v]) => {
          if (k.trim() !== "" && k !== "undefined") cleanEntry[k] = v;
        });

        const docRef = doc(db, ...pathArray, String(row.id).trim());
        batch.set(
          docRef,
          {
            ...cleanEntry,
            lastUpdated: serverTimestamp(),
            updatedBy: "Bulk Hub V3.0",
          },
          { merge: true }
        );
        count++;
      });

      await batch.commit();
      setStatus({
        type: "success",
        msg: `Import voltooid: ${count} items naar root.`,
      });
      setPreviewData([]);
      setPastedText("");
      setIsVerified(false);
    } catch (error) {
      console.error("Batch Error:", error);
      setStatus({ type: "error", msg: "Import error: " + error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 text-left pb-20">
      {/* 1. SELECTIE & TEMPLATES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-6 flex flex-col text-left">
          <h3 className="text-lg font-black uppercase italic text-slate-800 flex items-center gap-3">
            <Database size={20} className="text-blue-600" /> 1. Categorie
          </h3>
          <div className="space-y-2 flex-1">
            {COLLECTIONS.map((col) => (
              <button
                key={col.id}
                onClick={() => {
                  setTargetKey(col.id);
                  setPreviewData([]);
                  setIsVerified(false);
                  setStatus(null);
                }}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all flex items-center justify-between ${
                  targetKey === col.id
                    ? "border-blue-600 bg-blue-50/50 text-blue-900 shadow-md"
                    : "border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200"
                }`}
              >
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {col.label}
                </span>
                {targetKey === col.id && <CheckCircle2 size={14} />}
              </button>
            ))}
          </div>

          <div className="pt-4 space-y-3">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Sjablonen:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => downloadTemplate("excel")}
                className="py-3 bg-emerald-50 text-emerald-700 rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-2 hover:bg-emerald-100 border border-emerald-200 transition-all"
              >
                <FileSpreadsheet size={14} /> Excel
              </button>
              <button
                onClick={() => downloadTemplate("csv")}
                className="py-3 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-2 hover:bg-slate-200 border border-slate-200 transition-all"
              >
                <FileText size={14} /> CSV
              </button>
            </div>
          </div>
        </div>

        {/* 2. DATA INPUT */}
        <div className="lg:col-span-2 bg-slate-900 p-8 rounded-[40px] text-white shadow-2xl space-y-6 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <FileSpreadsheet size={150} />
          </div>

          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <h3 className="text-xl font-black uppercase italic flex items-center gap-3 text-left">
              <Clipboard className="text-emerald-400" /> 2. Data Hub
            </h3>
            <div className="flex items-center gap-2 text-[9px] font-mono text-emerald-400 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
              <ShieldAlert size={12} /> Target: /{PATHS[targetKey]?.join("/")}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
            <div className="space-y-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                A. Upload XLSX / CSV
              </p>
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-700 rounded-[35px] hover:border-emerald-500 transition-all cursor-pointer bg-white/5 hover:bg-white/10 group">
                <FileUp className="w-10 h-10 mb-2 text-slate-500 group-hover:text-emerald-400 transition-all" />
                <span className="text-[10px] text-slate-400 font-black uppercase italic text-center">
                  Bestand Sleep of Klik
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                />
              </label>
            </div>

            <div className="space-y-4 text-left">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">
                B. Plakken uit Excel
              </p>
              <textarea
                className="w-full h-40 bg-white/5 border-2 border-slate-700 rounded-[35px] p-5 text-[10px] font-mono outline-none focus:border-emerald-500 focus:bg-white/10 transition-all placeholder:text-slate-600 shadow-inner"
                placeholder="Kopieer cellen in Excel en plak hier..."
                value={pastedText}
                onChange={handlePaste}
              />
            </div>
          </div>

          {previewData.length > 0 && (
            <div className="flex gap-3 pt-6 relative z-10 animate-in slide-in-from-bottom-2">
              <button
                onClick={validateData}
                className={`flex-1 py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all flex items-center justify-center gap-3 ${
                  isVerified
                    ? "bg-emerald-500 text-white"
                    : "bg-blue-600 text-white hover:bg-blue-500"
                }`}
              >
                {isVerified ? <FileCheck size={20} /> : <Zap size={20} />}{" "}
                Validatie Starten
              </button>

              <button
                onClick={processImport}
                disabled={!isVerified || loading}
                className="flex-1 py-5 bg-white text-slate-900 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:bg-emerald-400 disabled:opacity-30 transition-all flex items-center justify-center gap-3 active:scale-95"
              >
                {loading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Save size={20} />
                )}{" "}
                Start Root Import
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ERROR FEEDBACK */}
      {validationErrors.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-100 p-8 rounded-[40px] space-y-3 animate-in zoom-in shadow-sm">
          <div className="flex items-center gap-3 text-rose-600 mb-4 font-black uppercase text-sm">
            <AlertCircle size={24} /> Validatie Fouten Gevonden
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-bold text-rose-500 list-inside list-disc">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* STATUS OVERLAY */}
      {status && (
        <div
          className={`p-6 rounded-[30px] flex items-center gap-4 border-2 shadow-lg animate-in slide-in-from-top-4 ${
            status.type === "success"
              ? "bg-emerald-50 border-emerald-100 text-emerald-700"
              : "bg-blue-50 border-blue-100 text-blue-700"
          }`}
        >
          {status.type === "success" ? (
            <CheckCircle2 size={28} />
          ) : (
            <Info size={28} />
          )}
          <p className="text-sm font-black uppercase tracking-widest">
            {status.msg}
          </p>
          <button
            onClick={() => setStatus(null)}
            className="ml-auto opacity-30 hover:opacity-100"
          >
            <X size={24} />
          </button>
        </div>
      )}

      {/* PREVIEW TABEL */}
      {previewData.length > 0 && (
        <div className="bg-white rounded-[45px] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-700 text-left">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3 text-left">
              <Table size={20} className="text-slate-400" />
              <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest italic">
                Data Preview ({previewData.length} records)
              </h4>
            </div>
            <button
              onClick={() => {
                setPreviewData([]);
                setPastedText("");
                setIsVerified(false);
              }}
              className="text-[10px] font-black text-rose-500 uppercase hover:underline"
            >
              Wissen
            </button>
          </div>
          <div className="overflow-x-auto max-h-[400px] custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="bg-white text-[10px] font-black text-slate-400 uppercase tracking-widest border-b sticky top-0 z-10 shadow-sm">
                <tr>
                  {Object.keys(previewData[0])
                    .filter((k) => k.trim() !== "")
                    .map((h) => (
                      <th key={h} className="px-8 py-5">
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewData.map((row, i) => (
                  <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                    {Object.entries(row)
                      .filter(([k]) => k.trim() !== "")
                      .map(([, v], j) => (
                        <td
                          key={j}
                          className="px-8 py-4 text-[11px] font-bold text-slate-600 font-mono italic"
                        >
                          {String(v)}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* GUIDELINES */}
      <div className="p-10 bg-blue-50 rounded-[50px] border-2 border-blue-100 flex items-start gap-6 shadow-inner text-left">
        <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg">
          <Info size={24} />
        </div>
        <div className="space-y-3">
          <h4 className="text-sm font-black uppercase text-blue-900 tracking-widest italic text-left">
            Bulk Hub Root Protocols:
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px] font-bold text-blue-700/70 uppercase leading-relaxed text-left">
            <p>1. Kolom 'id' is VERPLICHT voor elk record (bv: ID350_PN8).</p>
            <p>2. Het systeem negeert automatisch lege rijen en kolommen.</p>
            <p>
              3. Validatie checkt op unieke ID's en Firestore compatibiliteit.
            </p>
            <p>4. Voor mof-maten (CB/TB) gebruik: B1, B2, BA, A, etc.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkUploadView;
