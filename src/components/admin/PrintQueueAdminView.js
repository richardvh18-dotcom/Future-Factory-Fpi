import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { collection, collectionGroup, onSnapshot, orderBy, query } from 'firebase/firestore';
import { PATHS } from '../../config/dbPaths';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Loader2, RefreshCw, Trash2, Wifi, WifiOff, AlertTriangle, CheckCircle } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { requeuePrintQueueJob, deletePrintQueueJob } from '../../services/planningSecurityService';
const StatusBadge = ({ status }) => {
    const config = {
        pending: { icon: _jsx(Loader2, { className: "animate-spin text-yellow-500", size: 16 }), text: 'Wachtend', color: 'bg-yellow-100 text-yellow-800' },
        printing: { icon: _jsx(RefreshCw, { className: "animate-spin text-blue-500", size: 16 }), text: 'Printen', color: 'bg-blue-100 text-blue-800' },
        completed: { icon: _jsx(CheckCircle, { className: "text-green-500", size: 16 }), text: 'Voltooid', color: 'bg-green-100 text-green-800' },
        error: { icon: _jsx(AlertTriangle, { className: "text-red-500", size: 16 }), text: 'Fout', color: 'bg-red-100 text-red-800' },
    };
    const current = config[status] || config.pending;
    return (_jsxs("span", { className: `inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${current.color}`, children: [current.icon, current.text] }));
};
const PrintQueueAdminView = () => {
    const { showError, showConfirm } = useNotifications();
    const [printJobs, setPrintJobs] = useState([]);
    const [listeners, setListeners] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let rootJobs = [];
        let scopedJobs = [];
        const normalizeJob = (docSnap) => {
            const data = docSnap.data() || {};
            const isQueueJob = Boolean(data.printerId || data.zpl || data.status || data.metadata?.description);
            if (!isQueueJob)
                return null;
            const normalizedTimestamp = data.timestamp || data.createdAt || null;
            return {
                id: docSnap.id,
                ...data,
                description: data.description || data.metadata?.description || '',
                requesterEmail: data.requesterEmail || data.metadata?.requesterEmail || data.metadata?.requesterName || '-',
                timestamp: normalizedTimestamp,
            };
        };
        const tsToMillis = (ts) => {
            if (!ts)
                return 0;
            if (typeof ts.toDate === 'function')
                return ts.toDate().getTime();
            const parsed = new Date(ts);
            return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
        };
        const printQueuePathFragment = `/${PATHS.PRINT_QUEUE.join('/')}/`;
        const mergeJobs = () => {
            const byId = new Map();
            rootJobs.forEach((job) => {
                if (job?.id)
                    byId.set(job.id, job);
            });
            // Scoped jobs krijgen voorrang op legacy root docs.
            scopedJobs.forEach((job) => {
                if (job?.id)
                    byId.set(job.id, job);
            });
            const merged = Array.from(byId.values()).sort((a, b) => tsToMillis(b.timestamp) - tsToMillis(a.timestamp));
            setPrintJobs(merged);
            setLoading(false);
        };
        const rootQ = query(collection(db, ...PATHS.PRINT_QUEUE), orderBy('createdAt', 'desc'));
        const unsubscribeRoot = onSnapshot(rootQ, (snapshot) => {
            rootJobs = snapshot.docs.map(normalizeJob).filter(Boolean);
            mergeJobs();
        }, () => {
            rootJobs = [];
            mergeJobs();
        });
        const scopedQ = collectionGroup(db, 'items');
        const unsubscribeScoped = onSnapshot(scopedQ, (snapshot) => {
            scopedJobs = snapshot.docs
                .filter((docSnap) => String(docSnap.ref?.path || '').includes(printQueuePathFragment))
                .map(normalizeJob)
                .filter((job) => job && String(job._scopeType || 'print_queue').trim() === 'print_queue');
            mergeJobs();
        }, () => {
            scopedJobs = [];
            mergeJobs();
        });
        const listenersRef = collection(db, ...PATHS.PRINT_LISTENERS);
        const unsubscribeListeners = onSnapshot(listenersRef, (snapshot) => {
            setListeners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => {
            unsubscribeRoot();
            unsubscribeScoped();
            unsubscribeListeners();
        };
    }, []);
    const handleReprint = async (jobId) => {
        const confirmed = await showConfirm({
            title: 'Taak opnieuw printen',
            message: 'Weet u zeker dat u deze taak opnieuw wilt printen?',
            confirmText: 'Opnieuw printen',
            cancelText: 'Annuleren',
            tone: 'warning',
        });
        if (!confirmed)
            return;
        try {
            await requeuePrintQueueJob({
                jobId,
                source: 'AdminPrintQueueAdminView',
            });
        }
        catch (e) {
            console.error(e);
            showError("Fout bij opnieuw printen");
        }
    };
    const handleDelete = async (jobId) => {
        const confirmed = await showConfirm({
            title: 'Printtaak verwijderen',
            message: 'Weet u zeker dat u deze taak permanent wilt verwijderen?',
            confirmText: 'Verwijderen',
            cancelText: 'Annuleren',
            tone: 'danger',
        });
        if (!confirmed)
            return;
        try {
            await deletePrintQueueJob({
                jobId,
                source: 'AdminPrintQueueAdminView',
            });
        }
        catch (e) {
            console.error(e);
            showError("Fout bij verwijderen");
        }
    };
    return (_jsxs("div", { className: "p-4 md:p-8", children: [_jsx("h1", { className: "text-3xl font-bold mb-2", children: "Print Wachtrij Beheer" }), _jsx("p", { className: "text-slate-600 mb-6", children: "Monitor de status van printopdrachten en verbonden printer listeners." }), _jsxs("div", { className: "mb-8", children: [_jsx("h2", { className: "text-xl font-bold mb-3", children: "Printer Listeners" }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: listeners.length > 0 ? listeners.map(listener => {
                            const isOnline = listener.lastSeen?.toDate() > new Date(Date.now() - 30000); // Online if seen in last 30s
                            return (_jsxs("div", { className: `p-4 rounded-lg border ${isOnline ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`, children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h3", { className: "font-bold text-lg", children: listener.id }), isOnline ? _jsx(Wifi, { className: "text-green-500" }) : _jsx(WifiOff, { className: "text-red-500" })] }), _jsxs("p", { className: `text-sm ${isOnline ? 'text-green-700' : 'text-red-700'}`, children: ["Status: ", isOnline ? 'Online' : 'Offline'] }), _jsxs("p", { className: "text-xs text-slate-500 mt-2", children: ["Laatst gezien: ", listener.lastSeen ? formatDistanceToNow(listener.lastSeen.toDate(), { addSuffix: true, locale: nl }) : 'nooit'] })] }, listener.id));
                        }) : _jsx("p", { className: "text-slate-500", children: "Geen actieve listeners gevonden." }) })] }), _jsx("h2", { className: "text-xl font-bold mb-3", children: "Print Taken" }), _jsx("div", { className: "bg-white shadow-md rounded-lg overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm text-left text-slate-500", children: [_jsx("thead", { className: "text-xs text-slate-700 uppercase bg-slate-50", children: _jsxs("tr", { children: [_jsx("th", { scope: "col", className: "px-6 py-3", children: "Status" }), _jsx("th", { scope: "col", className: "px-6 py-3", children: "Beschrijving" }), _jsx("th", { scope: "col", className: "px-6 py-3", children: "Aangevraagd door" }), _jsx("th", { scope: "col", className: "px-6 py-3", children: "Tijdstip" }), _jsx("th", { scope: "col", className: "px-6 py-3", children: "Acties" })] }) }), _jsxs("tbody", { children: [loading && _jsx("tr", { children: _jsx("td", { colSpan: "5", className: "text-center p-8", children: _jsx(Loader2, { className: "animate-spin inline-block" }) }) }), !loading && printJobs.length === 0 && _jsx("tr", { children: _jsx("td", { colSpan: "5", className: "text-center p-8", children: "De print wachtrij is leeg." }) }), printJobs.map(job => (_jsxs("tr", { className: "bg-white border-b hover:bg-slate-50", children: [_jsx("td", { className: "px-6 py-4", children: _jsx(StatusBadge, { status: job.status }) }), _jsxs("td", { className: "px-6 py-4 font-medium text-slate-900", children: [job.description, job.stationId && _jsx("span", { className: "ml-2 text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-bold", children: job.stationId }), job.status === 'error' && _jsx("p", { className: "text-red-600 text-xs mt-1", children: job.error })] }), _jsx("td", { className: "px-6 py-4", children: job.requesterEmail }), _jsx("td", { className: "px-6 py-4", children: job.timestamp ? formatDistanceToNow(job.timestamp.toDate(), { addSuffix: true, locale: nl }) : '-' }), _jsx("td", { className: "px-6 py-4", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => handleReprint(job.id), className: "p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-100 rounded-full", title: "Opnieuw printen", children: _jsx(RefreshCw, { size: 16 }) }), _jsx("button", { onClick: () => handleDelete(job.id), className: "p-2 text-slate-500 hover:text-red-600 hover:bg-red-100 rounded-full", title: "Verwijderen", children: _jsx(Trash2, { size: 16 }) })] }) })] }, job.id)))] })] }) })] }));
};
export default PrintQueueAdminView;
