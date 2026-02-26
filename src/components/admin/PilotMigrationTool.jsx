import React from 'react';
import { DatabaseZap, AlertTriangle } from 'lucide-react';

const PilotMigrationTool = () => {
  return (
    <div className="p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center max-w-2xl mx-auto mt-10">
        <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <DatabaseZap size={32} className="text-rose-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Pilot Migratie Tool</h2>
        <p className="text-slate-500 mb-8">
          Deze tool is bedoeld om data van de pilot-omgeving (BH18) veilig over te zetten naar de productie-omgeving.
        </p>
        
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left flex gap-3 mb-8">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="font-bold text-amber-800 text-sm">Nog niet beschikbaar</h3>
            <p className="text-amber-700 text-sm mt-1">
              Deze module wordt geactiveerd aan het einde van de pilot-fase.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PilotMigrationTool;