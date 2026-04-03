import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Zap, ChevronRight, ArrowLeft, ClipboardCheck, ScanBarcode, Trash2, FileText, AlertTriangle } from "lucide-react";

const TerminalProductionView = ({
  activeWikkelingen = [],
  lotConflictMeta = {},
  selectedTrackedId,
  onSelectTracked,
  selectedWikkeling,
  onReleaseProduct,
  onCancelProduction,
  scanInput = "",
  setScanInput = () => {},
  onScan = () => {},
  scanInputRef,
  scannerMode = true
}) => {
  const { t } = useTranslation();
  const itemRefs = useRef({});

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();

        if (activeWikkelingen.length === 0) return;

        const currentIndex = activeWikkelingen.findIndex(p => p.id === selectedTrackedId);

        let nextIndex;
        if (e.key === 'ArrowDown') {
          nextIndex = currentIndex >= 0 ? (currentIndex + 1) % activeWikkelingen.length : 0;
        } else { // ArrowUp
          nextIndex = currentIndex > 0 ? currentIndex - 1 : activeWikkelingen.length - 1;
        }

        const nextItem = activeWikkelingen[nextIndex];
        if (nextItem) {
          onSelectTracked(nextItem.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeWikkelingen, selectedTrackedId, onSelectTracked]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedTrackedId && itemRefs.current[selectedTrackedId]) {
      itemRefs.current[selectedTrackedId].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedTrackedId]);
  
  return (
    <>
      <style>{`
        @keyframes scan-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.7); }
          50% { box-shadow: 0 0 0 10px rgba(249, 115, 22, 0); }
        }
        .scan-pulse-wikkelen {
          animation: scan-pulse 2s infinite;
        }
        @keyframes pulse-text {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .pulse-text-wikkelen {
          animation: pulse-text 1.5s ease-in-out infinite;
        }
      `}</style>
      <div className={`w-full lg:w-5/12 p-6 bg-white border-r border-slate-100 flex flex-col overflow-hidden ${selectedTrackedId ? "hidden lg:flex" : "flex"} text-left`}>
        {/* Scan Indicator & Input */}
        <div className="mb-4 space-y-2">
          {/* Indicator Label */}
          <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-lg border border-orange-100 w-fit">
            <div className="w-2 h-2 bg-orange-500 rounded-full pulse-text-wikkelen"></div>
            <span className="text-xs font-black text-orange-600 uppercase tracking-widest">
              🔍 {t('digitalplanning.terminal.ready_for_winding_scan', 'Klaar voor wikkelen scan')}
            </span>
          </div>
          {/* Scan Input */}
          <div className="relative">
            <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-500 transition-all scan-pulse-wikkelen" size={24} />
            <input
              ref={scanInputRef}
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              inputMode={scannerMode ? "none" : "text"}
              onKeyDown={onScan}
              placeholder="Scan lotnummer..."
              className="w-full pl-14 pr-4 py-4 bg-white border-2 border-orange-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-300 rounded-2xl font-bold text-lg shadow-sm outline-none transition-all placeholder:text-slate-300"
            />
          </div>
        </div>

        <div className="flex justify-between items-center mb-6 px-2 text-left">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Zap size={16} className="text-orange-500" /> Actieve Wikkelingen
          </h3>
          <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[10px] font-black">{activeWikkelingen.length}</span>
        </div>
        <div
          className="flex-1 overflow-y-auto space-y-3 custom-scrollbar text-left text-left pb-24"
          style={{ paddingBottom: "max(6rem, env(safe-area-inset-bottom))" }}
        >
          {activeWikkelingen.map((prod) => {
            const lotKey = String(prod?.lotNumber || "").trim().toUpperCase();
            const conflict = lotConflictMeta[lotKey];
            const hasLotConflict = Boolean(conflict?.hasConflict);

            return (
              <div
                key={prod.id}
                ref={el => (itemRefs.current[prod.id] = el)}
                onClick={() => onSelectTracked(prod.id)}
                className={`p-5 rounded-[30px] border-2 transition-all cursor-pointer flex items-center justify-between group ${
                  selectedTrackedId === prod.id ? "bg-orange-50 border-orange-500 shadow-md" : "bg-white border-slate-100"
                } text-left`}
              >
                <div className="flex items-center gap-4 text-left">
                  <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl text-left"><Zap size={20} /></div>
                  <div className="text-left text-left">
                    <h4 className="font-black italic leading-none mb-1">{prod.lotNumber}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Order: {prod.orderId}</p>
                    {hasLotConflict && (
                      <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-1">
                        <AlertTriangle size={12} /> Lot conflict
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Weet je zeker dat je lot ${prod.lotNumber} wilt annuleren? Dit kan niet ongedaan worden gemaakt.`)) {
                        onCancelProduction(prod.id);
                      }
                    }}
                    className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Annuleer productie"
                  >
                    <Trash2 size={20} />
                  </button>
                  <ChevronRight size={20} className="text-slate-300" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div
        className={`flex-1 p-6 md:p-8 bg-slate-50 flex flex-col overflow-y-auto custom-scrollbar ${!selectedTrackedId ? "hidden lg:flex" : "flex"} text-left pb-24`}
        style={{ paddingBottom: "max(6rem, env(safe-area-inset-bottom))" }}
      >
         {selectedWikkeling ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 text-left">
            <div className="bg-slate-900 rounded-[35px] p-6 text-white flex justify-between items-center border-4 border-orange-500/20 relative overflow-hidden shadow-xl text-left">
              <button onClick={() => onSelectTracked(null)} className="lg:hidden p-2 text-white/50 mr-2"><ArrowLeft size={20} /></button>
              <div className="text-left flex-1">
                <span className="text-[8px] font-black text-orange-400 uppercase block mb-1 text-left">Dossier</span>
                <h2 className="text-3xl font-black italic leading-none text-left">{selectedWikkeling.lotNumber}</h2>
              </div>
              <div className="p-3 bg-orange-600 rounded-2xl shadow-lg animate-pulse"><Zap size={24} /></div>
            </div>
            
            {selectedWikkeling.notes && (
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                <h4 className="text-xs font-black text-amber-800 uppercase tracking-widest mb-2 flex items-center gap-2"><FileText size={14} /> PO Text / Opmerkingen</h4>
                <p className="text-sm font-medium text-slate-700 italic">"{selectedWikkeling.notes}"</p>
              </div>
            )}

            <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-8 text-left">
              <button onClick={() => onReleaseProduct(selectedWikkeling)} className="w-full py-6 bg-slate-900 text-white rounded-[30px] font-black uppercase text-base shadow-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-4 active:scale-95 group">
                <ClipboardCheck size={28} /> Product Gereedmelden
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center text-left">
            <Zap size={80} className="mb-6 text-slate-200" />
            <h4 className="text-2xl font-black uppercase italic text-slate-300 text-left">Selecteer actief lot</h4>
          </div>
        )}
      </div>
    </>
  );
};

export default TerminalProductionView;
