import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useRef } from "react";
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
const ReferenceOpsImportModal = ({ isOpen, onClose, onSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState(null); // { records: [...], site: "101" }
    const [result, setResult] = useState(null); // { written, skipped }
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);
    const functions = getFunctions(app);
    const importReferenceOperationsCallable = httpsCallable(functions, "importReferenceOperations");
    if (!isOpen)
        return null;
    const clean = (val) => String(val ?? "").trim();
    const deriveType = (descriptions, workCenters) => {
        const combined = [...descriptions, ...workCenters]
            .map((s) => clean(s).toLowerCase())
            .join(" ");
        if (combined.includes("qc") || combined.includes("inspect") || combined.includes("hydro"))
            return "qc";
        if (combined.includes("finishing") || combined.includes("nabewerk") || combined.includes("hw finishing"))
            return "post";
        if (combined.includes("production") || combined.includes("wikkelen") || combined.includes("laminat"))
            return "production";
        return "production";
    };
    const parseRefOpsFile = async (file) => {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { cellDates: true });
        // Zoek "data" sheet
        const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === "data") || wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (!rawRows.length)
            throw new Error("Geen rijen gevonden in het bestand.");
        // Header staat op rij 0 (index 0) in de reference ops file
        const headers = rawRows[0].map((h) => clean(h));
        const dataRows = rawRows.slice(1);
        const findCol = (candidates) => {
            const normalizedHeaders = headers.map((h) => h.toLowerCase());
            for (const c of candidates) {
                const idx = normalizedHeaders.findIndex((h) => h.includes(c.toLowerCase()));
                if (idx !== -1)
                    return idx;
            }
            return -1;
        };
        const idxRefOp = findCol(["reference operation"]);
        const idxDesc = findCol(["description"]);
        // Fallback: description is soms een naamloze kolom direct na Reference Operation
        const descColFallback = idxRefOp !== -1 ? idxRefOp + 1 : -1;
        const idxSite = findCol(["site"]);
        const idxWc = findCol(["work center"]);
        if (idxRefOp === -1)
            throw new Error("Kolom 'Reference Operation' niet gevonden.");
        // Groepeer per refOp code, filter op Site 101
        const grouped = new Map(); // code → { workCenters: Set, descriptions: Set }
        dataRows.forEach((row) => {
            const code = clean(row[idxRefOp]);
            if (!code || isNaN(Number(code)))
                return;
            const site = idxSite !== -1 ? clean(row[idxSite]) : "";
            // Numeriek vergelijken: "101.0" == 101
            const siteNum = parseFloat(site);
            if (!isNaN(siteNum) && siteNum !== 101)
                return;
            // Site als string: filter op "101" of leeg (dan alles)
            if (site && site !== "101" && site !== "101.0")
                return;
            const wc = idxWc !== -1 ? clean(row[idxWc]) : "";
            // Description: benoemde kolom of fallback positie
            const desc = idxDesc !== -1
                ? clean(row[idxDesc])
                : descColFallback !== -1
                    ? clean(row[descColFallback])
                    : "";
            if (!grouped.has(code)) {
                grouped.set(code, { workCenters: new Set(), descriptions: new Set() });
            }
            const entry = grouped.get(code);
            if (wc)
                entry.workCenters.add(wc);
            if (desc)
                entry.descriptions.add(desc);
        });
        if (!grouped.size)
            throw new Error("Geen geldige Reference Operation-rijen gevonden voor Site 101.");
        const records = Array.from(grouped.entries()).map(([code, { workCenters, descriptions }]) => {
            const wcsArr = Array.from(workCenters);
            const descsArr = Array.from(descriptions);
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
    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file)
            return;
        setError(null);
        setPreview(null);
        setResult(null);
        setLoading(true);
        try {
            const records = await parseRefOpsFile(file);
            setPreview({ records });
        }
        catch (err) {
            setError(err.message || "Fout bij inlezen bestand.");
        }
        finally {
            setLoading(false);
            if (fileInputRef.current)
                fileInputRef.current.value = "";
        }
    };
    const handleSave = async () => {
        if (!preview?.records?.length)
            return;
        setSaving(true);
        setError(null);
        try {
            const res = await importReferenceOperationsCallable({
                records: preview.records,
            });
            const payload = res?.data || {};
            setResult({
                written: Number(payload.written || preview.records.length),
                skipped: Number(payload.overwritten || 0),
            });
            onSuccess?.();
        }
        catch (err) {
            const backendMsg = err?.message || err?.details?.message || err;
            setError("Fout bij backend import: " + backendMsg);
        }
        finally {
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
    const typeColor = (type) => {
        if (type === "qc")
            return "bg-blue-100 text-blue-700";
        if (type === "post")
            return "bg-amber-100 text-amber-700";
        return "bg-emerald-100 text-emerald-700";
    };
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4", children: _jsxs("div", { className: "bg-white rounded-[28px] shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]", children: [_jsxs("div", { className: "flex items-center justify-between p-6 border-b border-slate-100 shrink-0", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "p-2 bg-violet-50 rounded-xl", children: _jsx(Database, { size: 20, className: "text-violet-600" }) }), _jsxs("div", { children: [_jsx("h2", { className: "text-lg font-black uppercase text-slate-800 tracking-tight", children: "Reference Operations Import" }), _jsx("p", { className: "text-xs text-slate-500 font-medium", children: "LN Stamdata \u2192 Firestore (Site 101)" })] })] }), _jsx("button", { onClick: handleClose, className: "p-2 hover:bg-slate-100 rounded-xl transition-colors", children: _jsx(X, { size: 20, className: "text-slate-500" }) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar", children: [_jsxs("div", { className: "bg-violet-50 border border-violet-100 rounded-2xl p-4 text-sm text-violet-800", children: [_jsx("p", { className: "font-bold mb-1", children: "Wat doet deze import?" }), _jsxs("p", { className: "text-xs leading-relaxed", children: ["Laadt de ", _jsx("strong", { children: "Reference operations LN Frank.xlsx" }), " stamdata naar Firestore. Elke refOp-code (bv. 1715, 1020, 1740) krijgt een document met beschrijving en type (", _jsx("em", { children: "production / post / qc" }), "). Dit vervangt hardcoded classificaties in de app."] })] }), !result && (_jsxs("div", { className: "border-2 border-dashed border-violet-200 rounded-2xl p-8 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition-all", onClick: () => fileInputRef.current?.click(), children: [loading ? (_jsx(Loader2, { className: "mx-auto animate-spin text-violet-500 mb-2", size: 28 })) : (_jsx(FileSpreadsheet, { className: "mx-auto text-violet-400 mb-2", size: 28 })), _jsx("p", { className: "font-bold text-slate-700 text-sm", children: loading ? "Bestand inlezen…" : "Klik om Reference operations xlsx te selecteren" }), _jsx("p", { className: "text-xs text-slate-400 mt-1", children: "Verwacht: \"Reference operations LN Frank.xlsx\" (tabblad \"data\", Site 101)" }), _jsx("input", { ref: fileInputRef, type: "file", accept: ".xlsx,.xls", className: "hidden", onChange: handleFile })] })), error && (_jsxs("div", { className: "flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm", children: [_jsx(AlertTriangle, { size: 18, className: "shrink-0 mt-0.5" }), _jsx("span", { children: error })] })), preview && !result && (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsxs("h3", { className: "font-black text-slate-700 text-sm uppercase tracking-wide", children: ["Preview \u2014 ", preview.records.length, " codes gevonden"] }), _jsx("span", { className: "text-xs text-slate-400", children: "Alleen Site 101" })] }), _jsx("div", { className: "rounded-2xl border border-slate-200 overflow-hidden", children: _jsx("div", { className: "overflow-x-auto max-h-64", children: _jsxs("table", { className: "w-full text-xs", children: [_jsx("thead", { className: "bg-slate-50 sticky top-0", children: _jsxs("tr", { children: [_jsx("th", { className: "text-left px-4 py-2 font-black text-slate-600 uppercase tracking-wide", children: "Code" }), _jsx("th", { className: "text-left px-4 py-2 font-black text-slate-600 uppercase tracking-wide", children: "Omschrijving" }), _jsx("th", { className: "text-left px-4 py-2 font-black text-slate-600 uppercase tracking-wide", children: "Type" }), _jsx("th", { className: "text-left px-4 py-2 font-black text-slate-600 uppercase tracking-wide", children: "WorkCenters" })] }) }), _jsx("tbody", { children: preview.records.map((rec) => (_jsxs("tr", { className: "border-t border-slate-100 hover:bg-slate-50", children: [_jsx("td", { className: "px-4 py-2 font-mono font-bold text-slate-800", children: rec.code }), _jsx("td", { className: "px-4 py-2 text-slate-600", children: rec.description || "—" }), _jsx("td", { className: "px-4 py-2", children: _jsx("span", { className: `px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${typeColor(rec.type)}`, children: rec.type }) }), _jsxs("td", { className: "px-4 py-2 text-slate-400 font-mono text-[10px]", children: [rec.workCenters.slice(0, 3).join(", "), rec.workCenters.length > 3 && ` +${rec.workCenters.length - 3}`] })] }, rec.code))) })] }) }) }), _jsxs("p", { className: "text-xs text-slate-400 mt-2", children: ["Type wordt afgeleid uit de WorkCenter-beschrijvingen.", " ", _jsx("strong", { className: "text-slate-500", children: "QC" }), " \u2192 qc,", " ", _jsx("strong", { className: "text-slate-500", children: "Finishing / Nabewerken" }), " \u2192 post,", " ", "overige \u2192 production."] })] })), result && (_jsxs("div", { className: "flex flex-col items-center justify-center gap-4 py-8", children: [_jsx("div", { className: "p-4 bg-emerald-50 rounded-full", children: _jsx(CheckCircle, { size: 32, className: "text-emerald-500" }) }), _jsxs("div", { className: "text-center", children: [_jsxs("p", { className: "font-black text-slate-800 text-lg", children: [result.written, " codes opgeslagen"] }), _jsxs("p", { className: "text-sm text-slate-500 mt-1", children: ["Firestore pad:", " ", _jsx("code", { className: "bg-slate-100 px-2 py-0.5 rounded text-xs font-mono", children: PATHS.REFERENCE_OPERATIONS.join("/") })] })] })] }))] }), _jsxs("div", { className: "p-6 border-t border-slate-100 shrink-0 flex justify-between items-center gap-3", children: [_jsx("button", { onClick: handleClose, className: "px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-wider hover:bg-slate-50 transition-colors", children: result ? "Sluiten" : "Annuleren" }), preview && !result && (_jsx("button", { onClick: handleSave, disabled: saving, className: "px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-colors disabled:opacity-50", children: saving ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { size: 14, className: "animate-spin" }), " Opslaan\u2026"] })) : (_jsxs(_Fragment, { children: [_jsx(Upload, { size: 14 }), " Opslaan naar Firestore"] })) }))] })] }) }));
};
export default ReferenceOpsImportModal;
