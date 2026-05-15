import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { DatabaseZap, AlertTriangle, Search, Wrench, CheckCircle2, XCircle, SkipForward, RotateCcw, ChevronDown, ChevronRight, Loader2, ShieldAlert, } from 'lucide-react';
import { runMigrationTool } from '../../services/planningSecurityService';
import { useAdminAuth } from '../../hooks/useAdminAuth';
const StatusBadge = ({ status }) => {
    if (status === 'FIXED')
        return (_jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest", children: [_jsx(CheckCircle2, { size: 11 }), " Hersteld"] }));
    if (status === 'SKIPPED')
        return (_jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest", children: [_jsx(SkipForward, { size: 11 }), " Overgeslagen"] }));
    if (status === 'ERROR')
        return (_jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-black uppercase tracking-widest", children: [_jsx(XCircle, { size: 11 }), " Fout"] }));
    return null;
};
const CollectionLabel = ({ collection }) => {
    const isArchive = /\/archive\//.test(collection);
    return (_jsx("span", { className: `text-[10px] font-bold px-1.5 py-0.5 rounded ${isArchive ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'}`, children: isArchive ? 'Archief' : 'Tracked' }));
};
/**
 * PilotMigrationTool — Admin-only doc-id mismatch repair UI.
 *
 * Flow:
 *   1. (Optional) Enter a specific order ID to scope the scan.
 *   2. Click "Scan" → Cloud Function runs dry-run, returns mismatches.
 *   3. Review the list of mismatches with old/new doc IDs.
 *   4. Click "Repareer alles" → Cloud Function applies fixes with audit log.
 *   5. See results per row + rollback info (old IDs that were deleted).
 */
const PilotMigrationTool = () => {
    const { role } = useAdminAuth();
    const [orderIdInput, setOrderIdInput] = useState('');
    const [scanResult, setScanResult] = useState(null); // { mismatches: [] }
    const [applyResult, setApplyResult] = useState(null); // { results: [], totalFixed }
    const [scanning, setScanning] = useState(false);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState(null);
    const [expandedRows, setExpandedRows] = useState(new Set());
    const isAdmin = role === 'admin';
    const handleScan = async () => {
        setError(null);
        setScanResult(null);
        setApplyResult(null);
        setScanning(true);
        try {
            const result = await runMigrationTool({
                mode: 'scan',
                orderId: orderIdInput.trim().toUpperCase() || undefined,
            });
            setScanResult(result);
        }
        catch (err) {
            setError(err?.message || 'Scan mislukt.');
        }
        finally {
            setScanning(false);
        }
    };
    const handleApply = async () => {
        if (!scanResult?.mismatches?.length)
            return;
        setError(null);
        setApplying(true);
        try {
            const result = await runMigrationTool({
                mode: 'apply',
                mismatches: scanResult.mismatches,
            });
            setApplyResult(result);
            setScanResult(null);
        }
        catch (err) {
            setError(err?.message || 'Reparatie mislukt.');
        }
        finally {
            setApplying(false);
        }
    };
    const toggleRow = (idx) => {
        setExpandedRows((prev) => {
            const next = new Set(prev);
            next.has(idx) ? next.delete(idx) : next.add(idx);
            return next;
        });
    };
    if (!isAdmin) {
        return (_jsxs("div", { className: "p-6 flex items-start gap-4 bg-rose-50 border border-rose-200 rounded-2xl max-w-xl mx-auto mt-10", children: [_jsx(ShieldAlert, { className: "text-rose-600 shrink-0 mt-0.5", size: 24 }), _jsxs("div", { children: [_jsx("h3", { className: "font-black text-rose-800 uppercase text-sm tracking-widest", children: "Geen toegang" }), _jsx("p", { className: "text-rose-700 text-sm mt-1", children: "Alleen admins kunnen de migratie tool gebruiken." })] })] }));
    }
    return (_jsxs("div", { className: "p-6 space-y-6 max-w-4xl mx-auto", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center shrink-0", children: _jsx(DatabaseZap, { size: 24, className: "text-rose-600" }) }), _jsxs("div", { children: [_jsx("h2", { className: "text-xl font-black text-slate-800 uppercase tracking-tight", children: "Doc-ID Migratie Tool" }), _jsx("p", { className: "text-slate-500 text-sm", children: "Scant en herstelt omgenummerde lots waarbij de doc-id prefix niet overeenkomt met het orderId veld." })] })] }), _jsxs("div", { className: "bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3", children: [_jsx(AlertTriangle, { className: "text-amber-600 shrink-0 mt-0.5", size: 18 }), _jsxs("div", { className: "text-amber-800 text-sm", children: [_jsx("strong", { children: "Let op:" }), " \"Repareer alles\" verplaatst documenten permanent. Elke operatie wordt gelogd in het audit-log. Gebruik eerst altijd de dry-run scan."] })] }), _jsxs("div", { className: "bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4", children: [_jsx("h3", { className: "font-black text-slate-700 uppercase text-[11px] tracking-widest", children: "1. Scan" }), _jsxs("div", { className: "flex gap-3 items-end", children: [_jsxs("div", { className: "flex-1", children: [_jsx("label", { className: "block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5", children: "Order ID (optioneel \u2014 leeg = volledige sweep)" }), _jsx("input", { type: "text", value: orderIdInput, onChange: (e) => setOrderIdInput(e.target.value.toUpperCase()), placeholder: "bijv. N20024782", className: "w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300" })] }), _jsxs("button", { onClick: handleScan, disabled: scanning || applying, className: "flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-700 transition-all disabled:opacity-50 shrink-0", children: [scanning ? _jsx(Loader2, { size: 14, className: "animate-spin" }) : _jsx(Search, { size: 14 }), scanning ? 'Scannen...' : 'Scan (dry-run)'] })] })] }), error && (_jsxs("div", { className: "bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3", children: [_jsx(XCircle, { className: "text-rose-600 shrink-0 mt-0.5", size: 18 }), _jsx("p", { className: "text-rose-800 text-sm", children: error })] })), scanResult && (_jsxs("div", { className: "bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h3", { className: "font-black text-slate-700 uppercase text-[11px] tracking-widest", children: "2. Scan resultaat" }), _jsx("span", { className: `text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${scanResult.mismatches.length === 0
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-700'}`, children: scanResult.mismatches.length === 0
                                    ? 'Geen mismatches'
                                    : `${scanResult.mismatches.length} mismatch${scanResult.mismatches.length !== 1 ? 'es' : ''} gevonden` })] }), scanResult.mismatches.length === 0 ? (_jsxs("div", { className: "flex items-center gap-3 text-emerald-700 py-4", children: [_jsx(CheckCircle2, { size: 20 }), _jsx("p", { className: "text-sm font-bold", children: "Alle doc-ids zijn correct. Geen actie nodig." })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar", children: scanResult.mismatches.map((m, idx) => (_jsxs("div", { className: "border border-slate-100 rounded-xl overflow-hidden", children: [_jsxs("button", { onClick: () => toggleRow(idx), className: "w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left", children: [_jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [expandedRows.has(idx) ? _jsx(ChevronDown, { size: 14, className: "shrink-0 text-slate-400" }) : _jsx(ChevronRight, { size: 14, className: "shrink-0 text-slate-400" }), _jsx(CollectionLabel, { collection: m.collection }), _jsx("span", { className: "font-mono text-sm text-rose-600 font-bold truncate", children: m.oldDocId }), _jsx("span", { className: "text-slate-400 text-xs shrink-0", children: "\u2192" }), _jsx("span", { className: "font-mono text-sm text-emerald-700 font-bold truncate", children: m.newDocId })] }), _jsx("span", { className: "text-[10px] text-slate-400 font-mono shrink-0 ml-3", children: m.orderId })] }), expandedRows.has(idx) && (_jsxs("div", { className: "px-4 pb-3 pt-0 bg-slate-50 border-t border-slate-100 text-xs text-slate-600 space-y-1", children: [_jsxs("div", { children: [_jsx("strong", { children: "Collectie:" }), " ", _jsx("span", { className: "font-mono", children: m.collection })] }), m.lotNumber && _jsxs("div", { children: [_jsx("strong", { children: "Lot:" }), " ", m.lotNumber] }), m.machine && _jsxs("div", { children: [_jsx("strong", { children: "Machine:" }), " ", m.machine] }), m.staleFieldsId && _jsxs("div", { className: "text-amber-700", children: [_jsx("strong", { children: "Stale fields.id:" }), " ", m.staleFieldsId, " \u2192 wordt ook hersteld naar ", m.newDocId] }), _jsxs("div", { className: "pt-1 text-slate-400 italic", children: ["Rollback: bewaar de oude doc-id ", _jsx("span", { className: "font-mono", children: m.oldDocId }), " als referentie."] })] }))] }, idx))) }), _jsxs("div", { className: "pt-2 flex items-center gap-3", children: [_jsxs("button", { onClick: handleApply, disabled: applying || scanning, className: "flex items-center gap-2 px-6 py-2.5 bg-rose-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-rose-700 transition-all disabled:opacity-50", children: [applying ? _jsx(Loader2, { size: 14, className: "animate-spin" }) : _jsx(Wrench, { size: 14 }), applying ? 'Bezig...' : `Repareer alles (${scanResult.mismatches.length})`] }), _jsxs("button", { onClick: () => { setScanResult(null); setOrderIdInput(''); }, disabled: applying, className: "flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50", children: [_jsx(RotateCcw, { size: 14 }), " Reset"] })] })] }))] })), applyResult && (_jsxs("div", { className: "bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h3", { className: "font-black text-slate-700 uppercase text-[11px] tracking-widest", children: "3. Resultaat" }), _jsxs("span", { className: "text-[10px] font-black px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 uppercase tracking-widest", children: [applyResult.totalFixed, " hersteld"] })] }), _jsx("div", { className: "space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar", children: applyResult.results.map((r, idx) => (_jsxs("div", { className: "flex items-start gap-3 px-4 py-3 border border-slate-100 rounded-xl", children: [_jsx(StatusBadge, { status: r.status }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx("span", { className: "font-mono text-sm text-slate-600 truncate", children: r.oldDocId }), r.status === 'FIXED' && (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-slate-400 text-xs", children: "\u2192" }), _jsx("span", { className: "font-mono text-sm text-emerald-700 truncate", children: r.newDocId })] }))] }), r.reason && _jsx("p", { className: "text-[11px] text-slate-400 mt-0.5", children: r.reason }), r.status === 'FIXED' && (_jsxs("p", { className: "text-[11px] text-slate-400 mt-0.5", children: ["Rollback: oud doc-id was ", _jsx("span", { className: "font-mono", children: r.oldDocId })] }))] }), _jsx(CollectionLabel, { collection: r.collection })] }, idx))) }), _jsxs("p", { className: "text-xs text-slate-400 pt-1", children: ["Alle operaties zijn gelogd in het audit-log onder actie ", _jsx("code", { className: "font-mono", children: "MIGRATION_DOC_ID_REPAIR" }), "."] }), _jsxs("button", { onClick: () => { setApplyResult(null); setScanResult(null); setOrderIdInput(''); }, className: "flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all", children: [_jsx(RotateCcw, { size: 14 }), " Nieuwe scan"] })] }))] }));
};
export default PilotMigrationTool;
