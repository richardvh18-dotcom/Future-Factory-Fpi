import React from "react";

const TerminalManualInput = ({ 
  isOpen, 
  onClose, 
  value, 
  onChange, 
  onSearch 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in text-left">
      <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl overflow-hidden p-10 text-left">
        <h3 className="text-xl font-black uppercase italic mb-6">Snel Zoeken</h3>
        <input
          autoFocus 
          type="text" 
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl text-2xl font-mono font-black text-slate-900 outline-none focus:border-blue-600 transition-all uppercase text-center"
          placeholder="NUMMER..."
        />
        <div className="flex gap-4 mt-8">
          <button 
            onClick={onClose} 
            className="flex-1 py-4 text-slate-400 font-black uppercase text-[10px]"
          >
            Annuleren
          </button>
          <button
            onClick={onSearch}
            className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all"
          >
            Zoeken
          </button>
        </div>
      </div>
    </div>
  );
};

export default TerminalManualInput;
