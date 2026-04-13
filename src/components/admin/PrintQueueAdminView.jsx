import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { PATHS } from '../../config/dbPaths';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Loader2, RefreshCw, Trash2, Wifi, WifiOff, AlertTriangle, CheckCircle } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { requeuePrintQueueJob, deletePrintQueueJob } from '../../services/planningSecurityService';

const StatusBadge = ({ status }) => {
  const config = {
    pending: { icon: <Loader2 className="animate-spin text-yellow-500" size={16} />, text: 'Wachtend', color: 'bg-yellow-100 text-yellow-800' },
    printing: { icon: <RefreshCw className="animate-spin text-blue-500" size={16} />, text: 'Printen', color: 'bg-blue-100 text-blue-800' },
    completed: { icon: <CheckCircle className="text-green-500" size={16} />, text: 'Voltooid', color: 'bg-green-100 text-green-800' },
    error: { icon: <AlertTriangle className="text-red-500" size={16} />, text: 'Fout', color: 'bg-red-100 text-red-800' },
  };
  const current = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${current.color}`}>
      {current.icon}
      {current.text}
    </span>
  );
};

const PrintQueueAdminView = () => {
  const { showError, showConfirm } = useNotifications();
  const [printJobs, setPrintJobs] = useState([]);
  const [listeners, setListeners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, ...PATHS.PRINT_QUEUE), orderBy('timestamp', 'desc'));
    const unsubscribeJobs = onSnapshot(q, (snapshot) => {
      setPrintJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    const listenersRef = collection(db, ...PATHS.PRINT_LISTENERS);
    const unsubscribeListeners = onSnapshot(listenersRef, (snapshot) => {
      setListeners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeJobs();
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
    if (!confirmed) return;
    try {
      await requeuePrintQueueJob({
        jobId,
        source: 'AdminPrintQueueAdminView',
      });
    } catch (e) {
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
    if (!confirmed) return;
    try {
      await deletePrintQueueJob({
        jobId,
        source: 'AdminPrintQueueAdminView',
      });
    } catch (e) {
      console.error(e);
      showError("Fout bij verwijderen");
    }
  };

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-2">Print Wachtrij Beheer</h1>
      <p className="text-slate-600 mb-6">Monitor de status van printopdrachten en verbonden printer listeners.</p>

      <div className="mb-8">
        <h2 className="text-xl font-bold mb-3">Printer Listeners</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {listeners.length > 0 ? listeners.map(listener => {
            const isOnline = listener.lastSeen?.toDate() > new Date(Date.now() - 30000); // Online if seen in last 30s
            return (
              <div key={listener.id} className={`p-4 rounded-lg border ${isOnline ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">{listener.id}</h3>
                  {isOnline ? <Wifi className="text-green-500" /> : <WifiOff className="text-red-500" />}
                </div>
                <p className={`text-sm ${isOnline ? 'text-green-700' : 'text-red-700'}`}>
                  Status: {isOnline ? 'Online' : 'Offline'}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Laatst gezien: {listener.lastSeen ? formatDistanceToNow(listener.lastSeen.toDate(), { addSuffix: true, locale: nl }) : 'nooit'}
                </p>
              </div>
            );
          }) : <p className="text-slate-500">Geen actieve listeners gevonden.</p>}
        </div>
      </div>

      <h2 className="text-xl font-bold mb-3">Print Taken</h2>
      <div className="bg-white shadow-md rounded-lg overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-500">
          <thead className="text-xs text-slate-700 uppercase bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3">Status</th>
              <th scope="col" className="px-6 py-3">Beschrijving</th>
              <th scope="col" className="px-6 py-3">Aangevraagd door</th>
              <th scope="col" className="px-6 py-3">Tijdstip</th>
              <th scope="col" className="px-6 py-3">Acties</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="5" className="text-center p-8"><Loader2 className="animate-spin inline-block" /></td></tr>}
            {!loading && printJobs.length === 0 && <tr><td colSpan="5" className="text-center p-8">De print wachtrij is leeg.</td></tr>}
            {printJobs.map(job => (
              <tr key={job.id} className="bg-white border-b hover:bg-slate-50">
                <td className="px-6 py-4">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-6 py-4 font-medium text-slate-900">
                  {job.description}
                  {job.stationId && <span className="ml-2 text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-bold">{job.stationId}</span>}
                  {job.status === 'error' && <p className="text-red-600 text-xs mt-1">{job.error}</p>}
                </td>
                <td className="px-6 py-4">{job.requesterEmail}</td>
                <td className="px-6 py-4">
                  {job.timestamp ? formatDistanceToNow(job.timestamp.toDate(), { addSuffix: true, locale: nl }) : '-'}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleReprint(job.id)} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-100 rounded-full" title="Opnieuw printen">
                      <RefreshCw size={16} />
                    </button>
                    <button onClick={() => handleDelete(job.id)} className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-100 rounded-full" title="Verwijderen">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PrintQueueAdminView;