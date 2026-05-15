import React from "react";
import { useNavigate } from "react-router-dom";
import { X, Layers, Monitor, Clock, Tv } from "lucide-react";
import { FITTING_MACHINES, PIPE_MACHINES } from "../../../utils/hubHelpers.tsx";

const TerminalSelectionModal = ({ onClose }) => {
  const navigate = useNavigate();

  const handleSelect = (machine) => {
    navigate(`/terminal/${machine}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl border border-gray-100 flex flex-col overflow-hidden max-h-[80vh]">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-xl font-black text-slate-800 uppercase italic">
              Selecteer Workstation
            </h3>
            <p className="text-xs text-gray-500">
              Kies een machine om de terminal te openen
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X size={24} className="text-slate-500" />
          </button>
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Layers size={14} /> Fittings & Specials
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {FITTING_MACHINES.map((m) => (
                  <button
                    key={m}
                    onClick={() => handleSelect(m)}
                    className="p-4 bg-white border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 rounded-xl font-black text-slate-700 hover:text-blue-700 transition-all text-sm flex flex-col items-center gap-2 group"
                  >
                    <Monitor
                      size={24}
                      className="text-slate-300 group-hover:text-blue-500"
                    />
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Clock size={14} /> Pipes & Spools
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {PIPE_MACHINES.map((m) => (
                  <button
                    key={m}
                    onClick={() => handleSelect(m)}
                    className="p-4 bg-white border-2 border-slate-100 hover:border-cyan-500 hover:bg-cyan-50 rounded-xl font-black text-slate-700 hover:text-cyan-700 transition-all text-sm flex flex-col items-center gap-2 group"
                  >
                    <Tv
                      size={24}
                      className="text-slate-300 group-hover:text-cyan-500"
                    />
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TerminalSelectionModal;
