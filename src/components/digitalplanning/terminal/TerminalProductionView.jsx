import React from "react";
import { useTranslation } from "react-i18next";
import { Zap, ChevronRight, ArrowLeft, ClipboardCheck, ScanBarcode } from "lucide-react";

const TerminalProductionView = ({
  activeWikkelingen = [],
  selectedTrackedId,
  onSelectTracked,
  selectedWikkeling,
  onReleaseProduct,
  scanInput = "",
  setScanInput = () => {},
  onScan = () => {},
  scanInputRef,
  scannerMode = true
}) => {
  const { t } = useTranslation();
  
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
        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar text-left text-left">
          {activeWikkelingen.map((prod) => (
            <div
              key={prod.id} onClick={() => onSelectTracked(prod.id)}
              className={`p-5 rounded-[30px] border-2 transition-all cursor-pointer flex items-center justify-between ${
                selectedTrackedId === prod.id ? "bg-orange-50 border-orange-500 shadow-md" : "bg-white border-slate-100"
              } text-left`}
            >
              <div className="flex items-center gap-4 text-left">
                <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl text-left"><Zap size={20} /></div>
                <div className="text-left text-left">
                  <h4 className="font-black italic leading-none mb-1 text-left">{prod.lotNumber}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase text-left">Order: {prod.orderId}</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-300" />
            </div>
          ))}
        </div>
      </div>
      <div className={`flex-1 p-6 md:p-8 bg-slate-50 flex flex-col overflow-y-auto custom-scrollbar ${!selectedTrackedId ? "hidden lg:flex" : "flex"} text-left`}>
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
