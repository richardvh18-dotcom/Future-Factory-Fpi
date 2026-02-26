import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { 
  Printer, 
  Plus, 
  Trash2, 
  Save, 
  Wifi, 
  CheckCircle2, 
  AlertCircle, 
  Play,
  Monitor,
  X,
  Scan,
  MapPin,
  Edit,
  RefreshCw
} from "lucide-react";
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  serverTimestamp,
  getDoc
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";

const AdminPrinterManager = () => {
  const { t } = useTranslation();
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [availableStations, setAvailableStations] = useState([]);
  const [printerStatuses, setPrinterStatuses] = useState({});
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    ip: "",
    port: "9100",
    dpi: "203",
    width: "100",
    height: "50",
    darkness: "15",
    linkedStations: [], // Nieuw: Array van station IDs
    type: "network", // 'network' | 'zebra_local'
    isDefault: false
  });

  // Fetch printers
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "future-factory", "settings", "printers"), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPrinters(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Fetch stations voor koppeling
  useEffect(() => {
    const fetchStations = async () => {
      try {
        const docRef = doc(db, ...PATHS.FACTORY_CONFIG);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          const stations = [];
          (data.departments || []).forEach(dept => {
            (dept.stations || []).forEach(s => stations.push(s.name));
          });
          setAvailableStations([...new Set(stations)].sort());
        }
      } catch (e) { console.error("Err stations", e); }
    };
    fetchStations();
  }, []);

  const checkPrinterStatus = async (printer) => {
    if (printer.type !== 'network' || !printer.ip) return;
    
    setPrinterStatuses(prev => ({ ...prev, [printer.id]: 'checking' }));
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        await fetch(`http://${printer.ip}/`, { 
            method: 'GET', 
            mode: 'no-cors', 
            signal: controller.signal 
        });
        
        clearTimeout(timeoutId);
        setPrinterStatuses(prev => ({ ...prev, [printer.id]: 'online' }));
    } catch (err) {
        setPrinterStatuses(prev => ({ ...prev, [printer.id]: 'offline' }));
    }
  };

  const handleCheckAll = () => {
    printers.forEach(checkPrinterStatus);
  };

  useEffect(() => {
    if (printers.length > 0) {
        handleCheckAll();
    }
  }, [printers]);

  const handleSave = async () => {
    if (!formData.name) return alert(t('adminPrinterManager.nameRequired'));
    if (formData.type === "network" && !formData.ip) return alert(t('adminPrinterManager.ipRequiredForNetwork'));

    try {
      // Als deze default wordt, zet anderen uit
      if (formData.isDefault) {
        const updates = printers
          .filter(p => p.isDefault && p.id !== editingId)
          .map(p => updateDoc(doc(db, "future-factory", "settings", "printers", p.id), { isDefault: false }));
        await Promise.all(updates);
      }

      if (editingId) {
        await updateDoc(doc(db, "future-factory", "settings", "printers", editingId), {
          ...formData,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, "future-factory", "settings", "printers"), {
          ...formData,
          createdAt: serverTimestamp()
        });
      }

      setIsAdding(false);
      setEditingId(null);
      setFormData({ name: "", ip: "", port: "9100", dpi: "203", width: "100", height: "50", darkness: "15", linkedStations: [], type: "network", isDefault: false });
    } catch (err) {
      console.error("Error saving printer:", err);
      alert(t('adminPrinterManager.saveError') + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('adminPrinterManager.confirmDeletePrinter'))) return;
    try {
      await deleteDoc(doc(db, "future-factory", "settings", "printers", id));
    } catch (err) {
      console.error("Error deleting:", err);
    }
  };

  const handleSetDefault = async (id) => {
    try {
      // Zet alle anderen op false
      const updates = printers.map(p => 
        updateDoc(doc(db, "future-factory", "settings", "printers", p.id), { 
          isDefault: p.id === id 
        })
      );
      await Promise.all(updates);
    } catch (err) {
      console.error("Error setting default:", err);
    }
  };

  const handleTestPrint = async (printer) => {
    const dpi = printer.dpi ? parseInt(printer.dpi) : 203;
    const darkness = printer.darkness ? parseInt(printer.darkness) : 15;
    const scale = dpi / 203;

    const xQr = Math.round(50 * scale);
    const yQr = Math.round(50 * scale);
    const qrMag = Math.max(2, Math.round(4 * scale));
    const xText1 = Math.round(50 * scale);
    const yText1 = Math.round(160 * scale);
    const hText1 = Math.round(40 * scale);
    const xText2 = Math.round(50 * scale);
    const yText2 = Math.round(210 * scale);
    const hText2 = Math.round(30 * scale);

    const zpl = `^XA
~SD${darkness}
^FO${xQr},${yQr}^BQN,2,${qrMag}^FDQA,TEST-PRINT^FS
^FO${xText1},${yText1}^A0N,${hText1},${hText1}^FDTEST PRINT^FS
^FO${xText2},${yText2}^A0N,${hText2},${hText2}^FD${printer.name}^FS
^XZ`;

    if (printer.type === "network") {
      try {
        await fetch(`http://${printer.ip}/pstprnt`, { 
          method: "POST", 
          body: zpl, 
          mode: "no-cors" 
        });
        alert(`${t('adminPrinterManager.testCommandSentTo')} ${printer.ip}`);
      } catch (err) {
        alert(t('adminPrinterManager.connectionErrorNetwork') + err.message);
      }
    } else {
      alert(t('adminPrinterManager.localPrintersUseBrowserDialog'));
    }
  };

  const handleTestNewPrinter = async () => {
    if (formData.type !== "network" || !formData.ip) {
      alert(t('adminPrinterManager.enterValidIpFirst'));
      return;
    }
    
    const dpi = formData.dpi ? parseInt(formData.dpi) : 203;
    const darkness = formData.darkness ? parseInt(formData.darkness) : 15;
    const scale = dpi / 203;

    const xQr = Math.round(50 * scale);
    const yQr = Math.round(50 * scale);
    const qrMag = Math.max(2, Math.round(4 * scale));
    const xText1 = Math.round(50 * scale);
    const yText1 = Math.round(160 * scale);
    const hText1 = Math.round(40 * scale);
    const xText2 = Math.round(50 * scale);
    const yText2 = Math.round(210 * scale);
    const hText2 = Math.round(30 * scale);

    const zpl = `^XA
~SD${darkness}
^FO${xQr},${yQr}^BQN,2,${qrMag}^FDQA,TEST-SETUP^FS
^FO${xText1},${yText1}^A0N,${hText1},${hText1}^FDSETUP TEST^FS
^FO${xText2},${yText2}^A0N,${hText2},${hText2}^FD${formData.name || "Nieuwe Printer"}^FS
^XZ`;

    try {
      await fetch(`http://${formData.ip}/pstprnt`, { 
        method: "POST", 
        body: zpl, 
        mode: "no-cors" 
      });
      alert(`${t('adminPrinterManager.testCommandSentTo')} ${formData.ip}`);
    } catch (err) {
      alert(t('adminPrinterManager.connectionErrorIp') + err.message);
    }
  };

  const handleTestAlignment = async (data) => {
    if (data.type !== "network" || !data.ip) {
      alert(t('adminPrinterManager.onlyForNetworkPrinters'));
      return;
    }

    const dpi = data.dpi ? parseInt(data.dpi) : 203;
    const darkness = data.darkness ? parseInt(data.darkness) : 15;
    const widthMm = data.width ? parseInt(data.width) : 100;
    const heightMm = data.height ? parseInt(data.height) : 50;

    // Convert mm to dots (1 inch = 25.4 mm)
    const dotsPerMm = dpi / 25.4;
    const widthDots = Math.round(widthMm * dotsPerMm);
    const heightDots = Math.round(heightMm * dotsPerMm);
    
    // ZPL: Box met randen (4 dots dik)
    const zpl = `^XA
~SD${darkness}
^FO0,0^GB${widthDots},${heightDots},4^FS
^FO20,20^A0N,30,30^FD${widthMm}mm x ${heightMm}mm^FS
^FO20,60^A0N,25,25^FD${dpi} DPI - Alignment^FS
^XZ`;

    try {
      await fetch(`http://${data.ip}/pstprnt`, { method: "POST", body: zpl, mode: "no-cors" });
      alert(`${t('adminPrinterManager.alignmentTestSentTo')} ${data.ip}`);
    } catch (err) {
      alert(t('adminPrinterManager.connectionError') + err.message);
    }
  };

  const handleEdit = (printer) => {
    setFormData({
      name: printer.name || "",
      ip: printer.ip || "",
      port: printer.port || "9100",
      dpi: printer.dpi || "203",
      width: printer.width || "100",
      height: printer.height || "50",
      darkness: printer.darkness || "15",
      linkedStations: printer.linkedStations || [],
      type: printer.type || "network",
      isDefault: printer.isDefault || false
    });
    setEditingId(printer.id);
    setIsAdding(true);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase italic">{t('common.printerManagement')}</h2>
          <p className="text-sm text-slate-500 font-bold">{t('common.configurePrinters')}</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleCheckAll}
            className="p-2 bg-white border-2 border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 hover:text-blue-600 transition-all"
            title={t('adminPrinterManager.refreshStatus')}
          >
            <RefreshCw size={20} />
          </button>
          <button 
            onClick={() => {
              setEditingId(null);
              setFormData({ name: "", ip: "", port: "9100", dpi: "203", width: "100", height: "50", darkness: "15", linkedStations: [], type: "network", isDefault: false });
              setIsAdding(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-blue-700 transition-all"
          >
            <Plus size={16} /> {t('common.newPrinter')}
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-2xl border-2 border-blue-100 shadow-lg mb-8 animate-in slide-in-from-top-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-black text-slate-700 uppercase">{editingId ? t('adminPrinterManager.editPrinter') : t('adminPrinterManager.addNewPrinter')}</h3>
            <button onClick={() => { setIsAdding(false); setEditingId(null); }}><X size={20} className="text-slate-400" /></button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('adminPrinterManager.name')}</label>
              <input 
                type="text" 
                placeholder={t('adminPrinterManager.printerNamePlaceholder')}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            
            {/* Station Koppeling */}
            <div className="md:col-span-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
                    <MapPin size={14} /> {t('adminPrinterManager.linkToWorkstationOptional')}
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                    {formData.linkedStations.map(station => (
                        <span key={station} className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                            {station}
                            <button onClick={() => setFormData({...formData, linkedStations: formData.linkedStations.filter(s => s !== station)})} className="hover:text-blue-900"><X size={12} /></button>
                        </span>
                    ))}
                </div>
                <select 
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none"
                    onChange={(e) => {
                        if (e.target.value && !formData.linkedStations.includes(e.target.value)) {
                            setFormData({...formData, linkedStations: [...formData.linkedStations, e.target.value]});
                        }
                        e.target.value = "";
                    }}
                >
                    <option value="">{t('adminPrinterManager.addStationPlaceholder')}</option>
                    {availableStations.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('adminPrinterManager.connection')}</label>
              <div className="flex gap-2">
                <select 
                  className="w-1/3 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: e.target.value})}
                >
                  <option value="network">{t('adminPrinterManager.networkIp')}</option>
                  <option value="zebra_local">{t('adminPrinterManager.localUsb')}</option>
                </select>
                {formData.type === "network" ? (
                  <>
                    <input 
                      type="text" 
                      placeholder="192.168.x.x"
                      className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                      value={formData.ip}
                      onChange={e => setFormData({...formData, ip: e.target.value})}
                    />
                    <input 
                      type="text" 
                      placeholder="9100"
                      className="w-24 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500 text-center"
                      value={formData.port}
                      onChange={e => setFormData({...formData, port: e.target.value})}
                    />
                  </>
                ) : (
                  <div className="flex-1 p-3 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-400 italic flex items-center">
                    {t('adminPrinterManager.usesBrowserPrintDialog')}
                  </div>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-3 md:col-span-2">
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('adminPrinterManager.dpi')}</label>
                    <select className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold" value={formData.dpi} onChange={e => setFormData({...formData, dpi: e.target.value})}>
                        <option value="203">203 DPI</option>
                        <option value="300">300 DPI</option>
                        <option value="600">600 DPI</option>
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('adminPrinterManager.formatMm')}</label>
                    <div className="flex items-center gap-1">
                        <input type="number" className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold" placeholder="B" value={formData.width} onChange={e => setFormData({...formData, width: e.target.value})} />
                        <span className="text-slate-300">x</span>
                        <input type="number" className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold" placeholder="H" value={formData.height} onChange={e => setFormData({...formData, height: e.target.value})} />
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('adminPrinterManager.darkness')}</label>
                    <input type="number" min="0" max="30" className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold" value={formData.darkness} onChange={e => setFormData({...formData, darkness: e.target.value})} />
                </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-6">
            <input 
              type="checkbox" 
              id="isDefault"
              checked={formData.isDefault}
              onChange={e => setFormData({...formData, isDefault: e.target.checked})}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="isDefault" className="text-sm font-bold text-slate-700 cursor-pointer">
              {t('adminPrinterManager.setAsDefaultPrinter')}
            </label>
          </div>

          <div className="flex justify-end gap-3">
            {formData.type === "network" && (
              <div className="flex gap-2 mr-auto">
                <button 
                  onClick={handleTestNewPrinter}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg hover:bg-slate-200 flex items-center gap-2"
                >
                  <Wifi size={16} /> {t('adminPrinterManager.testConnection')}
                </button>
                <button 
                  onClick={() => handleTestAlignment(formData)}
                  className="px-4 py-2 bg-purple-50 text-purple-600 font-bold rounded-lg hover:bg-purple-100 flex items-center gap-2"
                >
                  <Scan size={16} /> {t('adminPrinterManager.testFrame')}
                </button>
              </div>
            )}
            <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-lg">{t('common.cancel')}</button>
            <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center gap-2">
              <Save size={16} /> {t('common.save')}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {printers.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-400 italic">{t('adminPrinterManager.noPrintersConfigured')}</div>
        )}
        
        {printers.map(printer => (
          <div key={printer.id} className={`bg-white p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${printer.isDefault ? 'border-emerald-400 shadow-sm' : 'border-slate-100'}`}>
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${printer.type === 'network' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                {printer.type === 'network' ? <Wifi size={24} /> : <Printer size={24} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-slate-800">{printer.name}</h3>
                  {printer.isDefault && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase rounded-md border border-emerald-200">{t('common.default')}</span>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-400 font-mono mt-0.5">
                  {printer.type === 'network' ? `IP: ${printer.ip}:${printer.port || 9100}` : t('adminPrinterManager.localUsb')}
                  {printer.type === 'network' && printer.dpi && <span className="ml-2 opacity-60 text-[10px]">({printer.dpi} DPI)</span>}
                </p>
                <p className="text-[10px] text-slate-400 mt-1 flex flex-wrap gap-1">
                    {printer.linkedStations && printer.linkedStations.length > 0 
                        ? printer.linkedStations.map(s => <span key={s} className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{s}</span>)
                        : <span className="italic opacity-50">{t('adminPrinterManager.noSpecificStations')}</span>}
                </p>
                {printer.type === 'network' && (
                  <div className="flex items-center gap-1.5 mt-2">
                      <div className={`w-2 h-2 rounded-full ${
                          printerStatuses[printer.id] === 'online' ? 'bg-emerald-500' : 
                          printerStatuses[printer.id] === 'offline' ? 'bg-rose-500' : 
                          'bg-slate-300 animate-pulse'
                      }`} />
                      <span className={`text-[9px] font-bold uppercase ${
                          printerStatuses[printer.id] === 'online' ? 'text-emerald-600' : 
                          printerStatuses[printer.id] === 'offline' ? 'text-rose-600' : 
                          'text-slate-400'
                      }`}>
                          {printerStatuses[printer.id] === 'online' ? t('adminPrinterManager.online') : 
                           printerStatuses[printer.id] === 'offline' ? t('adminPrinterManager.offline') : 
                           t('adminPrinterManager.connecting')}
                      </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!printer.isDefault && (
                <button 
                  onClick={() => handleSetDefault(printer.id)}
                  className="p-2 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  title={t('adminPrinterManager.makeDefault')}
                >
                  <CheckCircle2 size={18} />
                </button>
              )}
              <button 
                onClick={() => handleTestPrint(printer)}
                className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title={t('adminPrinterManager.testPrint')}
              >
                <Play size={18} />
              </button>
              <button 
                onClick={() => handleTestAlignment(printer)}
                className="p-2 text-slate-300 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                title={t('adminPrinterManager.testAlignmentFrame')}
              >
                <Scan size={18} />
              </button>
              <button 
                onClick={() => handleEdit(printer)}
                className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title={t('common.edit')}
              >
                <Edit size={18} />
              </button>
              <button 
                onClick={() => handleDelete(printer.id)}
                className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                title={t('common.delete')}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminPrinterManager;
