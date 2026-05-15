import React, { FC } from "react";
import { useLocation } from "react-router-dom";
import { X, Settings2, Loader2, Save, Trash2 } from "lucide-react";

/**
 * Modal voor het aanpassen of verwijderen van orders door Admins/Teamleaders.
 */

interface Station {
  id: string;
  type?: string;
  [key: string]: any;
}

interface FormData {
  id?: string;
  machine?: string;
  plan?: string | number;
  activeLot?: string;
  [key: string]: any;
}

interface OrderEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  formData: FormData;
  setFormData: (data: FormData) => void;
  onSave: () => void;
  onDelete: (id?: string) => void;
  loading: boolean;
  stations: Station[];
}

const OrderEditModal: FC<OrderEditModalProps> = ({
  isOpen,
  onClose,
  formData,
  setFormData,
  onSave,
  onDelete,
  loading,
  stations,
}) => {
  const location = useLocation();

  if (!isOpen || location.pathname.includes("/login")) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[150] flex items-center justify-center p-8 animate-in fade-in">
      <div className="bg-white w-full max-w-2xl rounded-[50px] shadow-2xl border border-slate-100 flex flex-col animate-in zoom-in-95 duration-500 overflow-hidden text-left">
        <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500 rounded-2xl shadow-lg">
              <Settings2 size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black italic uppercase leading-none">
                Order Management
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                Aanpassing & Beheer
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-all"
          >
            <X size={24} />
          </button>
        </div>
        <div className="p-10 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">
                Machine
              </label>
              <select
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 transition-all"
                value={formData.machine || ""}
                onChange={(e) =>
                  setFormData({ ...formData, machine: e.target.value })
                }
              >
                {stations
                  .filter((s: Station) => s.type === "machine")
                  .map((stationItem: Station) => (
                    <option key={stationItem.id} value={stationItem.id}>
                      {stationItem.id}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">
                Plan Aantal
              </label>
              <input
                type="number"
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 transition-all"
                value={formData.plan || ""}
                onChange={(e) =>
                  setFormData({ ...formData, plan: e.target.value })
                }
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">
                Actief Lotnummer
              </label>
              <input
                type="text"
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 transition-all"
                value={formData.activeLot || ""}
                onChange={(e) => setFormData({ ...formData, activeLot: e.target.value })}
                placeholder="Bijv. 26-01-0001"
              />
            </div>
          </div>
          <div className="pt-8 border-t border-slate-100 flex flex-col gap-3">
            <button
              onClick={onSave}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Save size={18} />
              )}{" "}
              Wijzigingen Opslaan
            </button>
            <button
              onClick={() => onDelete(formData.id)}
              className="w-full py-4 text-xs font-black text-red-500 hover:bg-red-50 rounded-2xl transition-all uppercase flex items-center justify-center gap-2 underline tracking-widest"
            >
              <Trash2 size={16} /> Order Verwijderen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderEditModal;
