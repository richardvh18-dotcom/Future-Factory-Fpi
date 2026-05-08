// @ts-nocheck
import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  History,
  Search,
  Filter,
  Download,
  Loader2,
  AlertCircle,
  Trash2,
  RefreshCw,
  ShieldCheck,
  ChevronRight,
  Database,
  Edit2,
  Save,
  X,
  Archive,
  FileText,
} from "lucide-react";
import {
  collection,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  writeBatch,
  doc,
  deleteDoc,
  updateDoc,
  startAfter,
} from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, parse, isValid } from "date-fns";
import { nl } from "date-fns/locale";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNotifications } from "../../contexts/NotificationContext";

const WEEK_INPUT_FORMAT = "RRRR-'W'II";

const toDateValue = (value) => {
  if (!value) return new Date();
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const stringifyValue = (value) => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return String(value);
  }
};

// --- Leesbare veldlabels voor audit diff ---
const FIELD_LABELS = {
  status: 'Status',
  currentStep: 'Stap',
  currentStation: 'Station',
  machine: 'Machine',
  lotNumber: 'Lotnummer',
  orderId: 'Order',
  itemCode: 'Artikelcode',
  item: 'Artikel',
  isVirtualLot: 'Virtueel lot',
  note: 'Notitie',
  stationLabel: 'Stationlabel',
  lastStation: 'Vorig station',
  labelLastPrint: 'Label geprint',
  labelTemplateId: 'Label template',
  updatedAt: 'Bijgewerkt',
  createdAt: 'Aangemaakt',
  virtualReason: 'Reden (virtueel)',
  virtualIssuedAt: 'Uitgegeven op',
  priority: 'Prioriteit',
  planningHidden: 'Verborgen in planning',
  deliveryDate: 'Leverdatum',
  quantity: 'Aantal',
  plan: 'Gepland',
  standardMinutes: 'Standaard (min)',
};

// Velden die te groot/irrelevant zijn voor de diff tabel
const SKIP_DIFF_FIELDS = new Set(['id', 'labelZPL', 'history']);

const formatTimestampValue = (value) => {
  if (!value) return null;
  if (value?.seconds != null) {
    try { return format(new Date(value.seconds * 1000), 'dd-MM-yyyy HH:mm:ss', { locale: nl }); } catch { return null; }
  }
  if (typeof value === 'string' && value.length > 10) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return format(d, 'dd-MM-yyyy HH:mm:ss', { locale: nl });
  }
  return null;
};

const getDiffFieldLabel = (key) => {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  if (key.startsWith('timestamps.')) {
    return '⏱ ' + key.replace('timestamps.', '').replace(/_/g, ' ');
  }
  return key;
};

const formatDiffValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'ja' : 'nee';
  const ts = formatTimestampValue(value);
  if (ts) return ts;
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
};

const SmartDiffView = ({ before, after }) => {
  const patchKeys = after && typeof after === 'object' ? Object.keys(after) : [];
  const visibleKeys = patchKeys.filter(k => !SKIP_DIFF_FIELDS.has(k));

  // Fallback: als after leeg is maar before er is, toon before-only tabel
  const showKeys = visibleKeys.length > 0 ? visibleKeys
    : (before && typeof before === 'object' ? Object.keys(before).filter(k => !SKIP_DIFF_FIELDS.has(k)) : []);

  if (showKeys.length === 0) {
    return <pre className="text-xs font-mono text-slate-500 break-all whitespace-pre-wrap">{JSON.stringify({ before, after }, null, 2)}</pre>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-separate border-spacing-y-0.5">
        <thead>
          <tr>
            <th className="text-left text-[9px] font-black text-slate-400 uppercase tracking-widest pb-2 pr-4 w-36">Veld</th>
            <th className="text-left text-[9px] font-black text-rose-400 uppercase tracking-widest pb-2 pr-4">Was</th>
            <th className="text-left text-[9px] font-black text-emerald-500 uppercase tracking-widest pb-2">Wordt</th>
          </tr>
        </thead>
        <tbody>
          {showKeys.map((key) => {
            const oldVal = before?.[key];
            const newVal = after?.[key];
            const oldStr = formatDiffValue(oldVal);
            const newStr = formatDiffValue(newVal);
            const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
            return (
              <tr key={key} className={changed ? 'bg-amber-50' : 'bg-slate-50'}>
                <td className="py-1 px-2 rounded-l-lg font-semibold text-slate-500 whitespace-nowrap pr-4">
                  {getDiffFieldLabel(key)}
                </td>
                <td className={`py-1 px-2 font-mono pr-4 max-w-[200px] break-all ${changed ? 'text-rose-600 line-through opacity-70' : 'text-slate-400'}`}>
                  {oldStr ?? <span className="italic opacity-30">—</span>}
                </td>
                <td className={`py-1 px-2 rounded-r-lg font-mono max-w-[200px] break-all ${changed ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                  {newStr ?? <span className="italic opacity-30">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const toReadableId = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parts = raw.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : raw;
};

const toReadableFieldValue = (value) => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return stringifyValue(value);
};

// Velden die technisch/intern zijn en niet getoond worden in de samenvatting
const SKIP_SUMMARY_KEYS = new Set([
  'before', 'after', 'orderDocPath', 'orderSourcePath', 'orderDocId',
  'message', 'orderId', 'stationId', 'machine', 'productId',
  'lotStart', 'totalToProduce', 'isVirtualLot', 'nextStep', 'nextStatus',
  'action', 'userEmail',
]);

const formatObjectDetails = (details) => {
  const d = details && typeof details === 'object' ? details : null;
  if (!d) return '';

  const parts = [];

  // "Order X op werkstation Y"
  const orderId = toReadableId(d.orderId || d.orderDocId || '');
  const station = d.stationId || d.machine || '';
  const product = toReadableId(d.productId || '');

  if (orderId && station) parts.push(`Order ${orderId} op werkstation ${station}`);
  else if (orderId) parts.push(`Order ${orderId}`);
  else if (station) parts.push(`Werkstation ${station}`);
  if (product) parts.push(`Product ${product}`);

  // "lotnummer Z · totaal N · (virtueel lot)"
  const lotParts = [];
  if (d.lotStart != null) lotParts.push(`lotnummer ${d.lotStart}`);
  if (d.totalToProduce != null) lotParts.push(`totaal ${d.totalToProduce}`);
  if (d.isVirtualLot) lotParts.push('(virtueel lot)');
  if (lotParts.length) parts.push(lotParts.join(', '));

  // Volgende stap / status
  if (d.nextStep) parts.push(`→ ${d.nextStep}`);
  else if (d.nextStatus) parts.push(`→ ${d.nextStatus}`);

  // Gebruiker
  if (d.userEmail) parts.push(`Gebruiker: ${d.userEmail}`);

  // Overige velden — geen lange paden
  const remaining = Object.entries(d)
    .filter(([k]) => !SKIP_SUMMARY_KEYS.has(k))
    .map(([k, v]) => {
      if (typeof v === 'string' && v.includes('/') && v.split('/').length > 3) return ''; // pad overslaan
      const rendered = toReadableFieldValue(v);
      return rendered ? `${FIELD_LABELS[k] || k}: ${rendered}` : '';
    })
    .filter(Boolean);

  parts.push(...remaining);

  return parts.join(' · ');
};

const getLogDetailsText = (log) => {
  const details = log?.details;
  if (typeof details === "string") return details;
  if (details && typeof details === "object") {
    if (typeof details.message === "string" && details.message.trim()) {
      return details.message;
    }
    const formatted = formatObjectDetails(details);
    if (formatted) return formatted;
    return stringifyValue(details);
  }
  return "";
};

const getLogMeta = (log) => {
  const details = log?.details && typeof log.details === "object" ? log.details : {};
  return {
    source: log?.source || details?.source || "",
    ipAddress: log?.ipAddress || details?.ipAddress || "",
    status: log?.status || details?.status || "",
  };
};

const getDiffPayload = (log) => {
  if (log?.changes && typeof log.changes === "object") return log.changes;
  const details = log?.details && typeof log.details === "object" ? log.details : {};
  if (details?.changes && typeof details.changes === "object") return details.changes;
  if (details?.before != null || details?.after != null) {
    return {
      oldValue: details.before ?? null,
      newValue: details.after ?? null,
    };
  }
  return null;
};

/**
 * AdminLogView V4.2 - Path Integrity Fix & Diff View
 * Herstelt het witte scherm door gebruik te maken van het gecorrigeerde 3-segmenten pad.
 * Inclusief ISO compliance features en Diff viewer.
 */
const AdminLogView = () => {
  const { t } = useTranslation();
  const { isAdmin } = useAdminAuth();
  const { showConfirm , notify} = useNotifications();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("ALL");
  const [periodFilter, setPeriodFilter] = useState("ALL");
  const [selectedDay, setSelectedDay] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedWeek, setSelectedWeek] = useState(format(new Date(), WEEK_INPUT_FORMAT));
  const [searchQuery, setSearchQuery] = useState("");
  const [lastVisibleDoc, setLastVisibleDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [rawJsonIds, setRawJsonIds] = useState(new Set());
  const toggleRawJson = (id) => setRawJsonIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [useYearMonthPrefilter, setUseYearMonthPrefilter] = useState(true);
  const PAGE_SIZE = 50;

  // ISO COMPLIANCE SWITCH
  // Zet op true voor live-gang om te voldoen aan ISO 9001/27001 (Audit Trail Integriteit)
  const READ_ONLY_MODE = true;

  // Correcte paden voor logs (hardcoded om mismatch met dbPaths te voorkomen)
  const LOG_PATH = ["future-factory", "audit", "logs"];
  const ARCHIVE_PATH = ["future-factory", "logs", "activity_logs_archive"];

  const actionTypes = [
    "PRODUCT_CREATE",
    "PRODUCT_UPDATE",
    "PRODUCT_DELETE",
    "MATRIX_UPDATE",
    "SETTINGS_UPDATE",
    "MASTER_SYNC",
    "LOGIN",
    "LOGIN_FAILED",
    "LOGOUT",
    "USER_ROLE_CHANGE",
    "USER_CREATE",
    "INSPECTION_COMPLETE",
    "ORDER_RELEASE",
    "DRILL_ADD",
    "TOOL_ADD",
    "TOOL_UPDATE",
    "TOOL_DELETE",
    "PLANNING_IMPORT",
    "AI_CHAT",
    "AI_UPLOAD",
    "AI_VERIFY"
  ];

  const getErrorMessage = (err) => {
    if (!err) return t('adminLogView.dbError') + 'onbekende fout';
    return err.code || err.message || String(err);
  };

  const parseWeekInput = (weekValue) => {
    if (!weekValue) return new Date();

    try {
      const parsedWeek = parse(weekValue, WEEK_INPUT_FORMAT, new Date());
      return isValid(parsedWeek) ? parsedWeek : new Date();
    } catch (err) {
      console.warn("Ongeldige weekfilter ontvangen:", weekValue, err);
      return new Date();
    }
  };

  const getPeriodRange = () => {
    if (periodFilter === "DAY") {
      const base = selectedDay ? new Date(selectedDay) : new Date();
      return { start: startOfDay(base), end: endOfDay(base) };
    }
    if (periodFilter === "WEEK") {
      const parsedWeek = parseWeekInput(selectedWeek);
      return {
        start: startOfWeek(parsedWeek, { weekStartsOn: 1 }),
        end: endOfWeek(parsedWeek, { weekStartsOn: 1 }),
      };
    }
    return null;
  };

  const getYearMonthKeysForRange = (range) => {
    if (!range?.start || !range?.end) return [];

    const keys = [];
    const cursor = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), 1));
    const endMonth = new Date(Date.UTC(range.end.getUTCFullYear(), range.end.getUTCMonth(), 1));

    while (cursor <= endMonth) {
      keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    return keys.slice(0, 10);
  };

  const buildQuery = (cursor = null, options = {}) => {
    const includeYearMonth = options?.includeYearMonth !== false;
    const colRef = collection(db, ...LOG_PATH);
    const constraints = [];

    if (filterType !== "ALL") {
      constraints.push(where("action", "==", filterType));
    }

    const range = getPeriodRange();
    if (range) {
      if (includeYearMonth) {
        const yearMonthKeys = getYearMonthKeysForRange(range);
        if (yearMonthKeys.length === 1) {
          constraints.push(where("yearMonth", "==", yearMonthKeys[0]));
        } else if (yearMonthKeys.length > 1) {
          constraints.push(where("yearMonth", "in", yearMonthKeys));
        }
      }

      constraints.push(where("timestamp", ">=", range.start));
      constraints.push(where("timestamp", "<=", range.end));
    }

    constraints.push(orderBy("timestamp", "desc"));
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(PAGE_SIZE));

    return query(colRef, ...constraints);
  };

  const fetchInitialLogs = async () => {
    setLoading(true);
    setError(null);
    setExpandedId(null);
    try {
      const range = getPeriodRange();
      let snapshot = await getDocs(buildQuery(null, { includeYearMonth: true }));
      let usedYearMonthFilter = true;

      // Compatibiliteit: oudere logs missen yearMonth en zouden anders niet zichtbaar zijn.
      if (range && snapshot.empty) {
        snapshot = await getDocs(buildQuery(null, { includeYearMonth: false }));
        usedYearMonthFilter = false;
      }

      const logData = snapshot.docs.map((logDoc) => ({
        id: logDoc.id,
        ...logDoc.data(),
        timestamp: toDateValue(logDoc.data().timestamp),
      }));
      setUseYearMonthPrefilter(usedYearMonthFilter);
      setLogs(logData);
      setLastVisibleDoc(snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error("Audit Sync Error:", err);
      if (err.code === "permission-denied") return;
      if (err.code === "failed-precondition") {
        setError(`${t('adminLogView.indexMissing')} - ${err.message}`);
      } else {
        setError(`${t('adminLogView.dbError')}${getErrorMessage(err)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchMoreLogs = async () => {
    if (!hasMore || !lastVisibleDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const snapshot = await getDocs(
        buildQuery(lastVisibleDoc, { includeYearMonth: useYearMonthPrefilter })
      );
      const moreLogs = snapshot.docs.map((logDoc) => ({
        id: logDoc.id,
        ...logDoc.data(),
        timestamp: toDateValue(logDoc.data().timestamp),
      }));
      setLogs((prev) => [...prev, ...moreLogs]);
      setLastVisibleDoc(snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : lastVisibleDoc);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error("Load more error:", err);
      notify(t('adminLogView.loadMoreError', 'Fout bij laden van meer logs.'));
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchInitialLogs();
  }, [filterType, periodFilter, selectedDay, selectedWeek]);

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const detailsText = getLogDetailsText(log).toLowerCase();
    const detailsRaw = stringifyValue(log.details).toLowerCase();
    return (
      String(log.userEmail || "").toLowerCase().includes(q) ||
      String(log.action || "").toLowerCase().includes(q) ||
      detailsText.includes(q) ||
      detailsRaw.includes(q)
    );
  });

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = [
      t('adminLogView.csvHeaders.date'),
      t('adminLogView.csvHeaders.time'),
      t('adminLogView.csvHeaders.action'),
      t('adminLogView.csvHeaders.user'),
      t('adminLogView.csvHeaders.details')
    ];
    const rows = filteredLogs.map((log) => [
      format(log.timestamp, "dd-MM-yyyy"),
      format(log.timestamp, "HH:mm:ss"),
      log.action,
      log.userEmail || t('common.system'),
      `"${getLogDetailsText(log).replace(/"/g, '""')}"`,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute(
      "download",
      `audit_log_${format(new Date(), "yyyyMMdd")}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = async () => {
    if (filteredLogs.length === 0) return;

    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const compact = (value, max = 160) => {
        const txt = String(value || "").replace(/\s+/g, " ").trim();
        if (!txt) return "-";
        return txt.length > max ? `${txt.slice(0, max - 1)}…` : txt;
      };

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      doc.setFontSize(18);
      doc.text(t('adminLogView.pdfTitle'), 14, 22);

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${t('adminLogView.generatedOn')}${format(new Date(), "dd-MM-yyyy HH:mm")}`, 14, 30);
      doc.text(`${t('adminLogView.totalRecords')}${filteredLogs.length}`, 14, 35);

      const tableColumn = [
        t('adminLogView.generatedOn', 'Tijdstip'),
        t('adminLogView.csvHeaders.action'),
        t('adminLogView.csvHeaders.user'),
        `${t('adminLogView.pdfHeaders.source')} / ${t('adminLogView.pdfHeaders.ip')}`,
        t('adminLogView.csvHeaders.details'),
      ];

      const tableRows = filteredLogs.map((log) => [
        format(log.timestamp, "dd-MM-yyyy HH:mm:ss"),
        compact(log.action, 40),
        compact(log.userEmail || t('common.system'), 44),
        compact(`${getLogMeta(log).source || '-'} | ${getLogMeta(log).ipAddress || '-'}`, 64),
        compact(getLogDetailsText(log) || "", 220),
      ]);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 45,
        margin: { left: 10, right: 10 },
        styles: {
          fontSize: 8,
          cellPadding: 2,
          overflow: 'linebreak',
          valign: 'top',
        },
        columnStyles: {
          0: { cellWidth: 34 },
          1: { cellWidth: 42 },
          2: { cellWidth: 52 },
          3: { cellWidth: 56 },
          4: { cellWidth: 93 },
        },
        rowPageBreak: 'avoid',
        headStyles: { fillColor: [15, 23, 42] },
      });

      doc.save(`audit_log_${format(new Date(), "yyyyMMdd")}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      notify(t('adminLogView.pdfError'));
    }
  };

  const handleClearAll = async () => {
    const confirmed = await showConfirm({
      title: t('adminLogView.clearAllTitle', 'Alle logs wissen'),
      message: t('adminLogView.confirmClearAll'),
      confirmText: t('common.delete', 'Verwijderen'),
      cancelText: t('common.cancel', 'Annuleren'),
      tone: 'danger',
    });
    if (!confirmed) return;
    setIsClearing(true);
    try {
      const batch = writeBatch(db);
      logs.forEach((log) => {
        const ref = doc(db, ...LOG_PATH, log.id);
        batch.delete(ref);
      });
      await batch.commit();
      await logActivity(auth.currentUser?.uid, "LOGS_CLEARED", "All logs cleared");
    } catch (err) {
      console.error("Clear error:", err);
      notify(t('adminLogView.clearError'));
    } finally {
      setIsClearing(false);
    }
  };

  const handleArchiveOld = async () => {
    const days = prompt(t('adminLogView.archivePromptDays'), "30");
    if (!days) return;
    const daysNum = parseInt(days);
    if (isNaN(daysNum)) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);

    const archiveConfirmed = await showConfirm({
      title: t('adminLogView.archiveTitle', 'Logs archiveren'),
      message: t('adminLogView.confirmArchive', { date: format(cutoffDate, "dd-MM-yyyy") }),
      confirmText: t('common.continue', 'Doorgaan'),
      cancelText: t('common.cancel', 'Annuleren'),
      tone: 'warning',
    });
    if (!archiveConfirmed) return;

    setIsClearing(true);
    try {
      const colRef = collection(db, ...LOG_PATH);
      const archiveRef = collection(db, ...ARCHIVE_PATH);
      
      // Query logs ouder dan cutoff
      const q = query(colRef, where("timestamp", "<", cutoffDate));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        notify(t('adminLogView.noLogsToArchive'));
        setIsClearing(false);
        return;
      }

      const total = snapshot.size;
      const BATCH_SIZE = 400;
      let processed = 0;

      // Process in batches
      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);
        
        chunk.forEach(docSnap => {
          const data = docSnap.data();
          const newDocRef = doc(archiveRef, docSnap.id);
          batch.set(newDocRef, data);
          batch.delete(docSnap.ref);
        });

        await batch.commit();
        processed += chunk.length;
      }

      notify(t('adminLogView.archiveSuccess', { count: processed }));
      await logActivity(auth.currentUser?.uid, "LOGS_ARCHIVED", `Archived ${processed} logs`);
    } catch (err) {
      console.error("Archive error:", err);
      notify(t('adminLogView.archiveError') + err.message);
    } finally {
      setIsClearing(false);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await showConfirm({
      title: t('adminLogView.deleteLogTitle', 'Log verwijderen'),
      message: t('adminLogView.confirmDelete'),
      confirmText: t('common.delete', 'Verwijderen'),
      cancelText: t('common.cancel', 'Annuleren'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, ...LOG_PATH, id));
      await logActivity(auth.currentUser?.uid, "LOG_DELETE", `Log deleted: ${id}`);
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      await updateDoc(doc(db, ...LOG_PATH, editingId), {
        details: editValue
      });
      setEditingId(null);
    } catch (err) {
      console.error("Update error:", err);
      notify(t('adminLogView.updateFailed'));
    }
  };

  const getActionColor = (action) => {
    const normalized = String(action || "").toUpperCase();
    if (normalized.includes("DELETE") || normalized.includes("FAILED"))
      return "bg-rose-50 text-rose-600 border-rose-100";
    if (normalized.includes("CREATE") || normalized.includes("ADD") || normalized.includes("IMPORT") || normalized === "LOGIN")
      return "bg-emerald-50 text-emerald-600 border-emerald-100";
    if (normalized.includes("UPDATE") || normalized.includes("CHANGE"))
      return "bg-blue-50 text-blue-600 border-blue-100";
    return "bg-slate-50 text-slate-500 border-slate-100";
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50 animate-in fade-in duration-500 text-left overflow-hidden">
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 p-8 flex flex-col md:flex-row justify-between items-center shrink-0 shadow-sm gap-6">
        <div className="flex items-center gap-6 text-left">
          <div className="p-4 bg-slate-900 text-white rounded-[20px] shadow-lg">
            <History size={28} />
          </div>
          <div className="text-left">
            <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
              {t('common.activity')} <span className="text-blue-600">{t('common.audit')}</span>
            </h2>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-3 py-1 rounded-lg border border-blue-100 italic uppercase">
                {logs.length} {t('common.recordsInMemory')}
              </span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <ShieldCheck size={12} className="text-emerald-500" /> {t('adminLogView.rootPrefix')}
                {LOG_PATH.join("/")}
              </span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 border-l border-slate-200 pl-3">
                {t('common.isoCompliant')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!READ_ONLY_MODE && (
            <>
              <button
                onClick={handleArchiveOld}
                disabled={isClearing}
                className="p-4 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all shadow-sm border border-slate-100 disabled:opacity-50"
                title={t('adminLogView.archiveOldLogs')}
              >
                {isClearing ? <Loader2 size={20} className="animate-spin" /> : <Archive size={20} />}
              </button>
              {isAdmin && (
                <button
                  onClick={handleClearAll}
                  disabled={isClearing || logs.length === 0}
                  className="p-4 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all shadow-sm border border-slate-100 disabled:opacity-50"
                  title={t('adminLogView.clearLogsDev')}
                >
                  {isClearing ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
                </button>
              )}
            </>
          )}
          <button
            onClick={fetchInitialLogs}
            className="p-4 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all shadow-sm border border-slate-100"
            title={t('adminLogView.refreshLogs', 'Ververs logs')}
          >
            <RefreshCw
              size={20}
              className={loading ? "animate-spin text-blue-500" : ""}
            />
          </button>
            <div className="flex gap-2">
              <button
                onClick={handleExportCSV}
                className="px-6 py-4 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-50 transition-all shadow-sm active:scale-95 flex items-center gap-2"
                title={t('adminLogView.exportCSV')}
              >
                <Download size={18} /> {t('adminLogView.csvAbbrev')}
              </button>
              <button
                onClick={handleExportPDF}
                className="px-6 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-blue-600 transition-all shadow-xl active:scale-95 flex items-center gap-2"
                title={t('adminLogView.exportPDF')}
              >
                <FileText size={18} /> {t('adminLogView.pdfAbbrev')}
              </button>
            </div>
        </div>
      </div>

      {error && (
        <div className="mx-8 mt-6 bg-rose-50 border-2 border-rose-100 p-4 rounded-2xl flex items-center gap-4 text-rose-600 animate-in shake">
          <AlertCircle size={20} />
          <div className="text-xs font-bold break-words flex-1">
            <span className="font-black uppercase tracking-widest mr-2">{t('adminLogView.scanInterrupted')}:</span>
            {(() => {
              const urlRegex = /(https?:\/\/[^\s]+)/g;
              const parts = error.split(urlRegex);
              if (parts.length === 1) return error;
              return parts.map((part, i) => 
                part.match(urlRegex) ? (
                  <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800 font-black bg-white px-2 py-0.5 rounded border border-blue-200 mx-1">
                    Create Index &rarr;
                  </a>
                ) : <span key={i}>{part}</span>
              );
            })()}
          </div>
        </div>
      )}

      {/* FILTERS */}
      <div className="p-6 bg-white border-b border-slate-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
        <div className="relative group">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors"
            size={18}
          />
          <input
            type="text"
            placeholder={t('adminLogView.searchPlaceholder')}
            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-blue-500 transition-all shadow-inner"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="relative">
          <Filter
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
            size={18}
          />
          <select
            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-700 outline-none focus:border-blue-500 appearance-none cursor-pointer"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="ALL">{t('adminLogView.allActivities')}</option>
            {actionTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <ChevronRight
            size={16}
            className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 rotate-90"
          />
        </div>

        <div className="relative">
          <Filter
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
            size={18}
          />
          <select
            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-700 outline-none focus:border-blue-500 appearance-none cursor-pointer"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
          >
            <option value="ALL">{t('adminLogView.periodAll', 'Alle periodes')}</option>
            <option value="DAY">{t('adminLogView.periodDay', 'Per dag')}</option>
            <option value="WEEK">{t('adminLogView.periodWeek', 'Per week')}</option>
          </select>
          <ChevronRight
            size={16}
            className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 rotate-90"
          />
        </div>

        {periodFilter === "DAY" && (
          <input
            type="date"
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-blue-500"
          />
        )}

        {periodFilter === "WEEK" && (
          <input
            type="week"
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-blue-500"
          />
        )}

        <div className="flex items-center justify-end px-4 gap-6 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
            <span>
              {t('adminLogView.result')}
              <span className="text-blue-600">{filteredLogs.length}</span>
            </span>
          </div>
        </div>
      </div>

      {/* LOG FEED */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="w-full mx-auto space-y-2 pb-40">
          {loading ? (
            <div className="py-20 text-center flex flex-col items-center gap-4 opacity-50">
              <Loader2 className="animate-spin text-blue-500" size={40} />
              <p className="text-[10px] font-black uppercase tracking-[0.4em]">
                {t('adminLogView.auditSync')}
              </p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-32 text-center bg-white rounded-[40px] border-2 border-dashed border-slate-100">
              <Database size={64} className="mx-auto mb-4 text-slate-200" />
              <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-300">
                {t('adminLogView.noLogsFound')}
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const diffPayload = getDiffPayload(log);
              const meta = getLogMeta(log);

              return (
              <div
                key={log.id}
                onClick={() => diffPayload && setExpandedId(expandedId === log.id ? null : log.id)}
                className={`bg-white p-5 rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all group flex flex-col gap-4 ${diffPayload ? "cursor-pointer" : ""}`}
              >
                <div className="grid grid-cols-1 md:grid-cols-[130px_minmax(180px,240px)_minmax(120px,180px)_minmax(0,1fr)_auto] gap-4 md:gap-5 w-full items-start md:items-center">
                <div className="min-w-0 flex flex-col md:pr-3 md:border-r border-slate-50">
                  <span className="text-xs font-black text-slate-900 tracking-tighter italic break-words">
                    {format(log.timestamp, "dd MMM yyyy", { locale: nl })}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase break-words">
                    {format(log.timestamp, "HH:mm:ss")}
                  </span>
                </div>
                <div className="min-w-0 flex items-center gap-3 overflow-hidden md:pr-3 md:border-r border-slate-50 text-left">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-[11px] shadow-lg shrink-0">
                    {log.userEmail?.charAt(0).toUpperCase() || "S"}
                  </div>
                  <div className="flex flex-col overflow-hidden min-w-0">
                    <span className="text-xs font-black text-slate-700 uppercase tracking-tight truncate">
                      {log.userEmail || t('common.system')}
                    </span>
                    <span className="text-[8px] font-mono text-slate-300 uppercase truncate">
                      UID: {log.userId?.substring(0, 8)}
                    </span>
                  </div>
                </div>
                <div className="min-w-0 flex md:justify-center md:pr-3 md:border-r border-slate-50">
                  <span
                    className={`max-w-full px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm break-words ${getActionColor(
                      log.action
                    )}`}
                  >
                    {log.action
                      ?.replace("PRODUCT_", "")
                      .replace("MATRIX_", "")
                      .replace("TOOL_", "")}
                  </span>
                </div>
                <div className="min-w-0 text-left">
                  {editingId === log.id ? (
                    <div className="flex items-center gap-2">
                      <input 
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full p-2 border border-blue-300 rounded-lg text-sm font-bold text-slate-700 outline-none"
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                      <button onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100">
                        <Save size={16} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="p-2 bg-slate-50 text-slate-500 rounded-lg hover:bg-slate-100">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      {rawJsonIds.has(log.id) ? (
                        <pre className="text-[10px] font-mono text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100 break-all whitespace-pre-wrap overflow-auto max-h-64">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      ) : (
                        <p className="text-sm font-bold text-slate-600 leading-snug group-hover:text-blue-600 transition-colors break-words whitespace-pre-wrap overflow-hidden">
                          {getLogDetailsText(log) || t('adminLogView.detailsPlaceholder')}
                        </p>
                      )}
                      {(meta.source || meta.ipAddress || meta.status) && !rawJsonIds.has(log.id) && (
                        <div className="flex flex-wrap items-center gap-2 mt-2 opacity-60 group-hover:opacity-100 transition-opacity min-w-0">
                          {meta.source && <span className="max-w-full text-[9px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 border border-slate-200 break-all">{t('adminLogView.sourcePrefix')} {meta.source}</span>}
                            {meta.ipAddress && <span className="max-w-full text-[9px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 border border-slate-200 break-all">{t('adminLogView.ipPrefix')} {meta.ipAddress}</span>}
                            {meta.status && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${String(meta.status).toUpperCase() === 'SUCCESS' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                    {meta.status}
                                </span>
                            )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  {!editingId && !READ_ONLY_MODE && (
                    <>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditingId(log.id); setEditValue(getLogDetailsText(log) || ""); }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(log.id); }}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleRawJson(log.id); }}
                    title="Toon ruwe JSON"
                    className={`p-1.5 rounded-lg transition-all text-[9px] font-black font-mono tracking-tight ${
                      rawJsonIds.has(log.id)
                        ? 'bg-slate-200 text-slate-700'
                        : 'text-slate-300 hover:text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {'{ }'}
                  </button>
                  {diffPayload && (
                    <ChevronRight size={16} className={`text-slate-300 transition-transform ${expandedId === log.id ? 'rotate-90' : ''}`} />
                  )}
                </div>
                </div>

                {/* DIFF VIEW */}
                {expandedId === log.id && diffPayload && (
                  <div className="pt-4 border-t border-slate-100 animate-in slide-in-from-top-2 cursor-default" onClick={(e) => e.stopPropagation()}>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <History size={12} /> {t('adminLogView.changeHistory')}
                    </h4>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <SmartDiffView before={diffPayload?.oldValue} after={diffPayload?.newValue} />
                    </div>
                  </div>
                )}
              </div>
            );
            })
          )}

          {!loading && filteredLogs.length > 0 && hasMore && (
            <div className="pt-4 flex justify-center">
              <button
                onClick={fetchMoreLogs}
                disabled={loadingMore}
                className="px-6 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loadingMore ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {t('adminLogView.loadMoreBottom', 'Laad meer')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLogView;
