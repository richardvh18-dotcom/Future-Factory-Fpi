import React from 'react';
import { AlertTriangle, LogOut, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * AutoLogoutWarning Component
 * Waarschuwing die verschijnt voordat gebruiker automatisch wordt uitgelogd
 */
const AutoLogoutWarning = ({ remainingTime, onDismiss }) => {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-[3rem] max-w-md w-full shadow-2xl border-4 border-orange-200 animate-in zoom-in-95 slide-in-from-bottom-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 p-6 rounded-t-[2.5rem] text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-20">
            <AlertTriangle size={80} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle size={28} className="animate-pulse" />
              <h2 className="text-xl font-black uppercase tracking-tight">
                {t('auth.auto_logout.title', 'Inactiviteit Gedetecteerd')}
              </h2>
            </div>
            <p className="text-sm font-medium text-orange-100">
              {t('auth.auto_logout.subtitle', 'Je sessie verloopt binnenkort')}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="p-8 text-center">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-orange-100 rounded-full mb-4">
              <LogOut size={40} className="text-orange-600" />
            </div>
            <p className="text-slate-700 font-medium text-lg leading-relaxed">
              {t('auth.auto_logout.message', 
                'Je wordt over {{time}} minuten automatisch uitgelogd wegens inactiviteit.', 
                { time: remainingTime }
              )}
            </p>
          </div>

          <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-4 mb-6">
            <p className="text-sm font-bold text-orange-800">
              {t('auth.auto_logout.action_prompt', 
                'Klik hieronder om ingelogd te blijven'
              )}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button
              onClick={onDismiss}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-wider hover:shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <X size={18} />
              {t('auth.auto_logout.stay_logged_in', 'Blijf Ingelogd')}
            </button>
            
            <p className="text-xs text-slate-500 font-medium">
              {t('auth.auto_logout.auto_logout_info', 
                'Je wordt automatisch uitgelogd na {{timeout}} minuten inactiviteit.', 
                { timeout: 60 }
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoLogoutWarning;
