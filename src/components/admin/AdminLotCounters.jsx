import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Loader2, Hash, Calendar, Server } from 'lucide-react';

// Machine naar FPI code mapping (Consistent met ProductionStartModal)
const getMachineCode = (station) => {
  const map = {
    'BH18': '418',
    'BA07': '417'
  };
  return map[station] || station.replace(/\D/g,'').padStart(3, '0') || '999';
};

const AdminLotCounters = () => {
  const [counters, setCounters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Luister live naar de counters collectie
    const ref = collection(db, 'future-factory', 'production', 'counters');
    // We halen alles op (het zijn er niet veel door de auto-cleanup)
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.docs.map(doc => {
        // ID formaat is: STATION_YYWW (bijv. BH18_2609)
        const parts = doc.id.split('_');
        const station = parts[0];
        const dateCode = parts[1] || "????";
        
        return {
          id: doc.id,
          station,
          year: dateCode.substring(0, 2),
          week: dateCode.substring(2),
          lastSequence: doc.data().lastSequence,
          updatedAt: doc.data().updatedAt
        };
      });
      
      // Sorteer op Station -> Jaar -> Week
      setCounters(data.sort((a, b) => {
          if (a.station !== b.station) return a.station.localeCompare(b.station);
          return b.week - a.week; // Nieuwste week eerst
      }));
      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) return (
    <div className="p-8 flex justify-center items-center text-slate-400">
        <Loader2 className="animate-spin mr-2" /> Tellers laden...
    </div>
  );

  return (
    <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2 uppercase italic">
          <Hash className="text-blue-600" /> Lotnummer Tellers
        </h2>
        <span className="text-xs font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full">
            Live Database: /production/counters
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {counters.map(c => {
          const machineCode = getMachineCode(c.station);
          // Formaat: Bedrijf(40) + Jaar + Week + Machine + Land(40) + Volgnummer
          const fullLot = `40${c.year}${c.week}${machineCode}40${String(c.lastSequence).padStart(5, '0')}`;
          
          return (
          <div key={c.id} className="p-5 border-2 border-slate-100 rounded-2xl bg-slate-50/50 hover:border-blue-200 transition-all group">
            <div className="flex justify-between items-start mb-2">
              <span className="font-black text-slate-700 flex items-center gap-2 uppercase">
                <Server size={16} className="text-slate-400" /> {c.station}
              </span>
              <span className="text-[10px] font-black bg-white text-slate-500 px-2 py-1 rounded border border-slate-200 uppercase tracking-wider">
                Week {c.week} '{c.year}
              </span>
            </div>
            
            <div className="flex flex-col gap-1 my-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Laatst Gebruikt</span>
                <span className="text-xl font-black text-blue-600 tracking-tight font-mono select-all">
                {fullLot}
                </span>
            </div>

            <div className="text-[10px] text-slate-400 flex items-center gap-1.5 pt-3 border-t border-slate-200/60">
              <Calendar size={12} />
              Update: {c.updatedAt?.toDate ? c.updatedAt.toDate().toLocaleString('nl-NL') : 'Onbekend'}
            </div>
          </div>
        )})}
        
        {counters.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-400 italic text-sm border-2 border-dashed border-slate-100 rounded-2xl">
                Nog geen lotnummers gegenereerd deze week.
            </div>
        )}
      </div>
      
      <p className="text-[10px] text-slate-400 mt-6 italic text-center">
        * Tellers ouder dan 2 weken worden automatisch verwijderd bij een nieuwe productiestart.
        Voor volledige historie, raadpleeg het productdossier archief.
      </p>
    </div>
  );
};

export default AdminLotCounters;