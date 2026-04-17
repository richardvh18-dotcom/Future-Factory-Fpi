import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { X, ArrowRight, Building2, Cpu } from "lucide-react";
import ConfirmationModal from "./modals/ConfirmationModal";

const ProductMoveModal = ({ product, onClose, onMove, allowedStations = [], currentDepartment }) => {
  const { t } = useTranslation();
  const [customStation, setCustomStation] = useState("");
  const [stationToConfirm, setStationToConfirm] = useState(null);

  const departments = [
    { id: "FITTINGS", label: "Fittings", inbox: "FITTINGS_INBOX" },
    { id: "PIPES", label: "Pipes", inbox: "PIPES_INBOX" },
    { id: "SPOOLS", label: "Spools", inbox: "SPOOLS_INBOX" }
  ];

  // Filter out current department from "Other Departments" list
  const otherDepartments = useMemo(() => {
    if (!currentDepartment) return departments;
    return departments.filter(d => d.id.toLowerCase() !== currentDepartment.toLowerCase());
  }, [currentDepartment]);

  const handleStationClick = (stationName) => {
    if (onMove) {
      setStationToConfirm(stationName);
    }
  };

  const handleConfirmMove = () => {
    if (stationToConfirm) {
      onMove(product.lotNumber, stationToConfirm);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[500] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-[30px] shadow-2xl w-full max-w-2xl p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-2xl font-black text-slate-800 uppercase italic">
              {t("digitalplanning.move_modal.title", "Verplaats Product")}
            </h3>
            <p className="text-sm text-slate-500 font-bold">
              Lot: {product?.lotNumber}
              {product?.currentStation && (
                <span className="ml-2 text-slate-400 font-normal">
                  • Huidig: {product.currentStation}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Current Department Stations */}
        <div className="mb-8">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Cpu size={14} /> Stations in {currentDepartment || "Afdeling"}
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {allowedStations.sort((a, b) => (a.name || "").localeCompare(b.name || "")).map((station) => (
              <button
                key={station.id}
                onClick={() => handleStationClick(station.name || station.id)}
                className="p-4 bg-slate-50 hover:bg-blue-50 border-2 border-slate-100 hover:border-blue-200 rounded-2xl text-sm font-bold text-slate-700 hover:text-blue-700 transition-all uppercase text-center"
              >
                {station.name || station.id}
              </button>
            ))}
            {allowedStations.length === 0 && (
              <div className="col-span-full text-center py-4 text-slate-400 italic text-sm">
                Geen stations gevonden in deze afdeling.
              </div>
            )}
          </div>
        </div>

        {/* Other Departments */}
        <div className="mb-8">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Building2 size={14} /> Naar Andere Afdeling
          </h4>
          <div className="grid grid-cols-2 gap-4">
            {otherDepartments.map((dept) => (
              <button
                key={dept.id}
                onClick={() => handleStationClick(dept.inbox)}
                className="p-4 bg-white border-2 border-slate-200 hover:border-purple-400 hover:bg-purple-50 rounded-2xl flex items-center justify-between group transition-all"
              >
                <span className="font-black text-slate-700 group-hover:text-purple-700 uppercase">{dept.label}</span>
                <ArrowRight size={18} className="text-slate-300 group-hover:text-purple-500" />
              </button>
            ))}
          </div>
        </div>

        {/* Manual Input Fallback */}
        <div className="pt-6 border-t border-slate-100">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
            Of typ handmatig
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customStation}
              onChange={(e) => setCustomStation(e.target.value)}
              placeholder="Station naam..."
              className="flex-1 p-3 rounded-xl border-2 border-slate-100 focus:border-blue-500 outline-none font-bold text-slate-700"
            />
            <button 
              onClick={() => handleStationClick(customStation)}
              disabled={!customStation}
              className="px-6 bg-slate-900 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Verplaats
            </button>
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={!!stationToConfirm}
        onClose={() => setStationToConfirm(null)}
        onConfirm={handleConfirmMove}
        title="Product Verplaatsen"
        message={`Weet je zeker dat je dit product wilt verplaatsen naar ${stationToConfirm}?`}
        confirmText="Ja, Verplaatsen"
      />
    </div>
  );
};

export default ProductMoveModal;