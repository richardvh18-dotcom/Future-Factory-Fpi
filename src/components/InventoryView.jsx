import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db, appId } from "../config/firebase";
import {
  Box,
  MapPin,
  Wrench,
  Search,
  qrCode,
  Truck,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

const InventoryView = () => {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "artifacts", appId, "public", "data", "inventory"),
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const updateLocation = async (itemId, newLoc) => {
    try {
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "inventory", itemId),
        {
          location: newLoc,
          lastUpdate: new Date(),
        }
      );
    } catch (err) {
      alert(err.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case t('inventory.status.available', 'Available'):
        return "bg-emerald-100 text-emerald-700";
      case t('inventory.status.in_use', 'In Use'):
        return "bg-blue-100 text-blue-700";
      case t('inventory.status.maintenance', 'Maintenance'):
        return "bg-amber-100 text-amber-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 font-sans">
      <header className="mb-8 border-b-2 border-slate-900 pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase italic">
            {t('inventory.title', 'Gereedschap & Voorraad')}
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
            {t('inventory.subtitle', 'Materiaalbeheer & Locatie Tracking')}
          </p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input
            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-sm text-sm"
            placeholder={t('inventory.search_placeholder', 'Zoek op ID of gereedschap...')}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items
          .filter((i) =>
            i.name.toLowerCase().includes(searchTerm.toLowerCase())
          )
          .map((item) => (
            <div
              key={item.id}
              className="bg-white border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="bg-slate-100 p-2 text-slate-600">
                  {item.category === "Tool" ? (
                    <Wrench size={20} />
                  ) : (
                    <Box size={20} />
                  )}
                </div>
                <span
                  className={`text-[10px] font-black uppercase px-2 py-1 ${getStatusColor(
                    t(`inventory.status.${item.status.toLowerCase().replace(/ /g, '_')}`, item.status)
                  )}`}
                >
                  {t(`inventory.status.${item.status.toLowerCase().replace(/ /g, '_')}`, item.status)}
                </span>
              </div>

              <h3 className="font-black text-slate-800 uppercase text-sm mb-1">
                {item.name}
              </h3>
              <p className="text-[10px] text-slate-400 font-mono mb-4">
                {t('inventory.id', 'ID')}: {item.id}
              </p>

              <div className="space-y-3 pt-4 border-t border-slate-50">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <MapPin size={14} className="text-blue-600" />
                  <span className="font-bold">{item.location}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Truck size={14} className="text-slate-400" />
                  <span>
                    {t('inventory.assigned_to', 'Toegewezen aan')}: <strong>{item.assignedTo || t('inventory.nobody', 'Niemand')}</strong>
                  </span>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button className="py-2 bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors">
                  {t('inventory.details', 'Details')}
                </button>
                <button className="py-2 border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-colors">
                  {t('inventory.move', 'Verplaats')}
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

export default InventoryView;
