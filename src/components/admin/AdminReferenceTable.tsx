import React from 'react';
import i18n from 'i18next';
import { BookOpen } from 'lucide-react';

const AdminReferenceTable = () => {
  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-amber-100 rounded-lg">
          <BookOpen className="text-amber-600" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{i18n.t('adminReference.title', 'Technische Encyclopedie')}</h1>
          <p className="text-slate-500 text-sm">{i18n.t('adminReference.subtitle', 'Referentietabellen voor boringen en mof-maten.')}</p>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 p-8 flex items-center justify-center text-slate-400 italic">
        {i18n.t('adminReference.selectTablePrompt', 'Selecteer een tabel in het menu om data te bekijken.')}
      </div>
    </div>
  );
};

export default AdminReferenceTable;