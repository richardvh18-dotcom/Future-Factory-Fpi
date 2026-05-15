import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type ActiveToast = {
  id: number | string;
  title: string;
  message?: string;
  type: ToastType;
  duration: number;
  count?: number;
};

type NotificationToastApi = {
  activeToast: ActiveToast | null;
  queuedCount: number;
  removeToast: (id: number | string) => void;
};

const ToastContainer = () => {
  const { activeToast, queuedCount, removeToast } = useNotifications() as NotificationToastApi;

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5" />;
      case 'error':
        return <XCircle className="w-5 h-5" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5" />;
      case 'info':
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  const getIconColors = (type: ToastType) => {
    switch (type) {
      case 'success':
        return 'text-emerald-600';
      case 'error':
        return 'text-rose-600';
      case 'warning':
        return 'text-amber-600';
      case 'info':
      default:
        return 'text-blue-600';
    }
  };

  const getSurface = (type: ToastType) => {
    switch (type) {
      case 'success':
        return 'border-emerald-300/70 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(209,250,229,0.94))] text-emerald-950 shadow-emerald-200/70';
      case 'error':
        return 'border-rose-300/70 bg-[linear-gradient(135deg,rgba(255,241,242,0.98),rgba(255,228,230,0.94))] text-rose-950 shadow-rose-200/70';
      case 'warning':
        return 'border-amber-300/70 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(254,243,199,0.94))] text-amber-950 shadow-amber-200/70';
      case 'info':
      default:
        return 'border-sky-300/70 bg-[linear-gradient(135deg,rgba(239,246,255,0.98),rgba(224,242,254,0.94))] text-slate-950 shadow-sky-200/70';
    }
  };

  const getAccent = (type: ToastType) => {
    switch (type) {
      case 'success':
        return 'from-emerald-500 via-emerald-400 to-lime-300';
      case 'error':
        return 'from-rose-600 via-rose-500 to-orange-300';
      case 'warning':
        return 'from-amber-500 via-yellow-400 to-orange-300';
      case 'info':
      default:
        return 'from-sky-600 via-cyan-500 to-emerald-300';
    }
  };

  if (!activeToast) return null;

  // Fout/waarschuwing → midden in beeld, met overlay (blokkerend)
  const isBlocking = activeToast.type === 'error' || activeToast.type === 'warning';

  if (isBlocking) {
    return (
      <div className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
        <div className="absolute inset-0 bg-slate-950/10 backdrop-blur-[1px]" />

        <div
          key={activeToast.id}
          className={`pointer-events-auto relative w-full max-w-2xl overflow-hidden rounded-[26px] border shadow-[0_30px_75px_-30px_rgba(15,23,42,0.55)] backdrop-blur-xl animate-in ${getSurface(activeToast.type)}`}
        >
          <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${getAccent(activeToast.type)}`} />

          <div className="flex items-start gap-4 px-4 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
            <div className={`mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white/75 shadow-inner ${getIconColors(activeToast.type)}`}>
              {getIcon(activeToast.type)}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-800 sm:text-xs">
                  {activeToast.title}
                </h4>
                {activeToast.count > 1 && (
                  <span className="inline-flex items-center rounded-full bg-black/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700">
                    {activeToast.count}x
                  </span>
                )}
                {queuedCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 shadow-sm">
                    +{queuedCount} in rij
                  </span>
                )}
              </div>

              {activeToast.message && (
                <p className="mt-2 whitespace-pre-line pr-2 text-sm font-medium leading-6 text-slate-700 sm:text-[15px]">
                  {activeToast.message}
                </p>
              )}
            </div>

            <button
              onClick={() => removeToast(activeToast.id)}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-black/10 bg-white/70 text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
              aria-label="Sluiten"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-4 pb-4 sm:px-6 sm:pb-5">
            <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${getAccent(activeToast.type)}`}
                style={{
                  width: '100%',
                  animation: `shrink-width ${activeToast.duration}ms linear forwards`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Succes/info → rechts onder in beeld, niet-blokkerend (geen overlay)
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[9999] flex flex-col items-end gap-2 sm:bottom-6 sm:right-6">
      <div
        key={activeToast.id}
        className={`pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl border shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] backdrop-blur-xl animate-in slide-in-from-right-5 ${getSurface(activeToast.type)}`}
      >
        <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${getAccent(activeToast.type)}`} />

        <div className="flex items-start gap-3 px-4 pb-3 pt-4">
          <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/75 shadow-inner ${getIconColors(activeToast.type)}`}>
            {getIcon(activeToast.type)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-800">
                {activeToast.title}
              </h4>
              {activeToast.count > 1 && (
                <span className="inline-flex items-center rounded-full bg-black/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-700">
                  {activeToast.count}x
                </span>
              )}
              {queuedCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-600 shadow-sm">
                  +{queuedCount}
                </span>
              )}
            </div>

            {activeToast.message && (
              <p className="mt-1 whitespace-pre-line pr-1 text-xs font-medium leading-5 text-slate-700">
                {activeToast.message}
              </p>
            )}
          </div>

          <button
            onClick={() => removeToast(activeToast.id)}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white/70 text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
            aria-label="Sluiten"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="px-4 pb-3">
          <div className="h-1 overflow-hidden rounded-full bg-black/10">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${getAccent(activeToast.type)}`}
              style={{
                width: '100%',
                animation: `shrink-width ${activeToast.duration}ms linear forwards`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToastContainer;

