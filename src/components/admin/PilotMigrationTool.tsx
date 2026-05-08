// @ts-nocheck
import React, { useState } from 'react';
import {
  DatabaseZap,
  AlertTriangle,
  Search,
  Wrench,
  CheckCircle2,
  XCircle,
  SkipForward,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { runMigrationTool } from '../../services/planningSecurityService';
import { useAdminAuth } from '../../hooks/useAdminAuth';

const StatusBadge = ({ status }) => {
  if (status === 'FIXED') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest">
      <CheckCircle2 size={11} /> Hersteld
    </span>
  );
  if (status === 'SKIPPED') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest">
      <SkipForward size={11} /> Overgeslagen
    </span>
  );
  if (status === 'ERROR') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-black uppercase tracking-widest">
      <XCircle size={11} /> Fout
    </span>
  );
  return null;
};

const CollectionLabel = ({ collection }) => {
  const isArchive = /\/archive\//.test(collection);
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isArchive ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'}`}>
      {isArchive ? 'Archief' : 'Tracked'}
    </span>
  );
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
    } catch (err) {
      setError(err?.message || 'Scan mislukt.');
    } finally {
      setScanning(false);
    }
  };

  const handleApply = async () => {
    if (!scanResult?.mismatches?.length) return;
    setError(null);
    setApplying(true);
    try {
      const result = await runMigrationTool({
        mode: 'apply',
        mismatches: scanResult.mismatches,
      });
      setApplyResult(result);
      setScanResult(null);
    } catch (err) {
      setError(err?.message || 'Reparatie mislukt.');
    } finally {
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
    return (
      <div className="p-6 flex items-start gap-4 bg-rose-50 border border-rose-200 rounded-2xl max-w-xl mx-auto mt-10">
        <ShieldAlert className="text-rose-600 shrink-0 mt-0.5" size={24} />
        <div>
          <h3 className="font-black text-rose-800 uppercase text-sm tracking-widest">Geen toegang</h3>
          <p className="text-rose-700 text-sm mt-1">Alleen admins kunnen de migratie tool gebruiken.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center shrink-0">
          <DatabaseZap size={24} className="text-rose-600" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Doc-ID Migratie Tool</h2>
          <p className="text-slate-500 text-sm">
            Scant en herstelt omgenummerde lots waarbij de doc-id prefix niet overeenkomt met het orderId veld.
          </p>
        </div>
      </div>

      {/* Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
        <div className="text-amber-800 text-sm">
          <strong>Let op:</strong> "Repareer alles" verplaatst documenten permanent. Elke operatie wordt gelogd in het audit-log.
          Gebruik eerst altijd de dry-run scan.
        </div>
      </div>

      {/* Scan controls */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="font-black text-slate-700 uppercase text-[11px] tracking-widest">1. Scan</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
              Order ID (optioneel — leeg = volledige sweep)
            </label>
            <input
              type="text"
              value={orderIdInput}
              onChange={(e) => setOrderIdInput(e.target.value.toUpperCase())}
              placeholder="bijv. N20024782"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <button
            onClick={handleScan}
            disabled={scanning || applying}
            className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-700 transition-all disabled:opacity-50 shrink-0"
          >
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {scanning ? 'Scannen...' : 'Scan (dry-run)'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3">
          <XCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
          <p className="text-rose-800 text-sm">{error}</p>
        </div>
      )}

      {/* Scan results */}
      {scanResult && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-700 uppercase text-[11px] tracking-widest">2. Scan resultaat</h3>
            <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${
              scanResult.mismatches.length === 0
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-700'
            }`}>
              {scanResult.mismatches.length === 0
                ? 'Geen mismatches'
                : `${scanResult.mismatches.length} mismatch${scanResult.mismatches.length !== 1 ? 'es' : ''} gevonden`}
            </span>
          </div>

          {scanResult.mismatches.length === 0 ? (
            <div className="flex items-center gap-3 text-emerald-700 py-4">
              <CheckCircle2 size={20} />
              <p className="text-sm font-bold">Alle doc-ids zijn correct. Geen actie nodig.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                {scanResult.mismatches.map((m, idx) => (
                  <div key={idx} className="border border-slate-100 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleRow(idx)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {expandedRows.has(idx) ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />}
                        <CollectionLabel collection={m.collection} />
                        <span className="font-mono text-sm text-rose-600 font-bold truncate">{m.oldDocId}</span>
                        <span className="text-slate-400 text-xs shrink-0">→</span>
                        <span className="font-mono text-sm text-emerald-700 font-bold truncate">{m.newDocId}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-3">{m.orderId}</span>
                    </button>
                    {expandedRows.has(idx) && (
                      <div className="px-4 pb-3 pt-0 bg-slate-50 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                        <div><strong>Collectie:</strong> <span className="font-mono">{m.collection}</span></div>
                        {m.lotNumber && <div><strong>Lot:</strong> {m.lotNumber}</div>}
                        {m.machine && <div><strong>Machine:</strong> {m.machine}</div>}
                        {m.staleFieldsId && <div className="text-amber-700"><strong>Stale fields.id:</strong> {m.staleFieldsId} → wordt ook hersteld naar {m.newDocId}</div>}
                        <div className="pt-1 text-slate-400 italic">Rollback: bewaar de oude doc-id <span className="font-mono">{m.oldDocId}</span> als referentie.</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  onClick={handleApply}
                  disabled={applying || scanning}
                  className="flex items-center gap-2 px-6 py-2.5 bg-rose-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-rose-700 transition-all disabled:opacity-50"
                >
                  {applying ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
                  {applying ? 'Bezig...' : `Repareer alles (${scanResult.mismatches.length})`}
                </button>
                <button
                  onClick={() => { setScanResult(null); setOrderIdInput(''); }}
                  disabled={applying}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  <RotateCcw size={14} /> Reset
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Apply results */}
      {applyResult && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-700 uppercase text-[11px] tracking-widest">3. Resultaat</h3>
            <span className="text-[10px] font-black px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 uppercase tracking-widest">
              {applyResult.totalFixed} hersteld
            </span>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
            {applyResult.results.map((r, idx) => (
              <div key={idx} className="flex items-start gap-3 px-4 py-3 border border-slate-100 rounded-xl">
                <StatusBadge status={r.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-slate-600 truncate">{r.oldDocId}</span>
                    {r.status === 'FIXED' && (
                      <>
                        <span className="text-slate-400 text-xs">→</span>
                        <span className="font-mono text-sm text-emerald-700 truncate">{r.newDocId}</span>
                      </>
                    )}
                  </div>
                  {r.reason && <p className="text-[11px] text-slate-400 mt-0.5">{r.reason}</p>}
                  {r.status === 'FIXED' && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Rollback: oud doc-id was <span className="font-mono">{r.oldDocId}</span>
                    </p>
                  )}
                </div>
                <CollectionLabel collection={r.collection} />
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-400 pt-1">
            Alle operaties zijn gelogd in het audit-log onder actie <code className="font-mono">MIGRATION_DOC_ID_REPAIR</code>.
          </p>

          <button
            onClick={() => { setApplyResult(null); setScanResult(null); setOrderIdInput(''); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all"
          >
            <RotateCcw size={14} /> Nieuwe scan
          </button>
        </div>
      )}
    </div>
  );
};

export default PilotMigrationTool;
