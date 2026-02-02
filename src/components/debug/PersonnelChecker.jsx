import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { PATHS } from '../../config/dbPaths';
import { Database, CheckCircle, XCircle, Loader2 } from 'lucide-react';

/**
 * PersonnelChecker - Debug component om te controleren of personeel correct wordt opgeslagen
 */
const PersonnelChecker = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const checkData = async () => {
    setLoading(true);
    setError(null);
    try {
      const path = PATHS.PERSONNEL.join('/');
      console.log('🔍 Checking path:', path);
      
      const snap = await getDocs(collection(db, ...PATHS.PERSONNEL));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      console.log('✅ Found personnel:', items.length);
      console.log('📋 Items:', items);
      
      setData({
        path,
        count: items.length,
        items,
        exists: snap.size > 0
      });
    } catch (err) {
      console.error('❌ Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkData();
  }, []);

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white rounded-2xl shadow-2xl border-2 border-slate-200 p-6 z-50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database size={20} className="text-blue-600" />
          <h3 className="font-black text-sm uppercase">Personnel Check</h3>
        </div>
        <button onClick={checkData} disabled={loading}>
          <Loader2 size={16} className={loading ? 'animate-spin text-blue-600' : 'text-slate-400'} />
        </button>
      </div>

      {loading && (
        <div className="py-8 text-center">
          <Loader2 className="animate-spin mx-auto text-blue-600" size={32} />
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <XCircle size={16} className="text-rose-600" />
            <span className="font-bold text-xs text-rose-900">ERROR</span>
          </div>
          <p className="text-xs text-rose-700 font-mono">{error}</p>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-xl">
            <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">Firestore Path</div>
            <div className="text-xs font-mono text-slate-900">{data.path}</div>
          </div>

          <div className="flex items-center gap-2">
            {data.exists ? (
              <CheckCircle size={16} className="text-green-600" />
            ) : (
              <XCircle size={16} className="text-rose-600" />
            )}
            <span className="font-bold text-sm">
              {data.count} {data.count === 1 ? 'persoon' : 'personen'} gevonden
            </span>
          </div>

          {data.items.length > 0 && (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {data.items.map((item, idx) => (
                <div key={item.id} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-xs font-black text-slate-900">{item.name || 'Unnamed'}</div>
                  <div className="text-[10px] text-slate-500 font-mono">#{item.employeeNumber}</div>
                  {item.rotationSchedule?.enabled && (
                    <div className="mt-1 text-[9px] text-blue-700 font-bold">
                      ROTATIE: {item.rotationSchedule.shifts?.join(' → ')}
                    </div>
                  )}
                  {item.shiftId && (
                    <div className="mt-1 text-[9px] text-slate-600">
                      Shift: {item.shiftId}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {data.items.length === 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center">
              <p className="text-xs text-amber-800 font-bold">
                Geen personeelsleden gevonden in deze collectie
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PersonnelChecker;
