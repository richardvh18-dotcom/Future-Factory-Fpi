import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../config/firebase';
import { collection, query, where, getDocs, limit, doc, getDoc, documentId, onSnapshot } from 'firebase/firestore';
import { PATHS } from '../../config/dbPaths';
import { Loader2, Printer, Search, Send, X, Tag, ChevronDown, Usb } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { generatePrintData, generateLotBatchZPL } from '../../utils/zplHelper';
import { getDriver } from '../../utils/printerDrivers';
import { getISOWeekInfo, getStationMachineCode } from '../../utils/lotLogic';
import AutoScaledLabelPreview from './AutoScaledLabelPreview';
import { useLabelPreview } from '../../hooks/useLabelPreview';
import { processLabelData, applyLabelLogic, filterTempOrderLabelsByProduct, resolveLabelContent } from '../../utils/labelHelpers';

const stationNameFromValue = (stationValue) => {
  if (!stationValue) return '';
  if (typeof stationValue === 'string') return stationValue.trim();
  if (typeof stationValue === 'object') {
    return String(
      stationValue.name || stationValue.station || stationValue.id || stationValue.code || ''
    ).trim();
  }
  return String(stationValue).trim();
};

const getOrderLabelOrder = (item = {}) =>
  item.orderId ||
  item.orderNumber ||
  item.Order ||
  item.Productieorder ||
  item.order ||
  item.originalOrderId ||
  item.id ||
  "ONBEKEND";

const getOrderLabelItemCode = (item = {}) =>
  item.itemCode ||
  item.productCode ||
  item.articleCode ||
  item.productId ||
  item.Item ||
  item.Artikel ||
  item.item ||
  "";

const getOrderLabelDescription = (item = {}) =>
  item.itemDescription ||
  item.description ||
  item.Description ||
  item.Omschrijving ||
  item.item ||
  "";

// --- Helper voor Tijdelijke Labels ---
const TempLabelItem = ({ item, labelTemplates, labelRules, onPrint, isExpanded, onToggle, printerDpi = 203 }) => {
  const itemDisplay = getOrderLabelDescription(item) || getOrderLabelItemCode(item);

  const topOptions = useMemo(() => {
    const normalizedProduct = {
      itemCode: getOrderLabelItemCode(item),
      productId: item.productId || getOrderLabelItemCode(item),
      description: getOrderLabelDescription(item),
      item: item.item || getOrderLabelDescription(item),
      extraCode: item.extraCode || item.Code || ''
    };

    return filterTempOrderLabelsByProduct(labelTemplates || [], normalizedProduct);
  }, [item, labelTemplates]);

  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  useEffect(() => {
     if (topOptions.length > 0) {
       const isValidSelection = topOptions.some(t => t.id === selectedTemplateId);
       if (!selectedTemplateId || !isValidSelection) {
         setSelectedTemplateId(topOptions[0]?.id || "");
       }
     } else if (selectedTemplateId) {
       setSelectedTemplateId("");
     }
    }, [topOptions, selectedTemplateId]);

    const selectedTemplate = topOptions.find(t => t.id === selectedTemplateId) || topOptions[0];
  
  const previewData = useMemo(() => {
    if (!isExpanded) return {};
    const order = getOrderLabelOrder(item);
    const itemCode = getOrderLabelItemCode(item);
    const desc = getOrderLabelDescription(item);

    const labelData = processLabelData({
        ...item,
        orderNumber: order,
        productId: itemCode,
        description: desc,
        lotNumber: item.lotNumber || order
    });
    return applyLabelLogic(labelData, labelRules || []);
  }, [item, labelRules, isExpanded]);

  return (
    <div className={`p-0 bg-white border-2 hover:border-emerald-300 rounded-[24px] transition-all shadow-sm hover:shadow-md group overflow-hidden ${isExpanded ? 'border-emerald-500' : 'border-slate-100'}`}>
      <div 
        className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex-1">
          <p className="text-xl font-black text-slate-800 tracking-tight leading-none mb-1">
            {getOrderLabelOrder(item)}
          </p>
          {itemDisplay && (
            <p className="text-sm font-bold text-slate-600 tracking-wider mb-0.5 mt-2">
              {itemDisplay}
            </p>
          )}
        </div>
        <div className="shrink-0 w-full sm:w-auto flex justify-end">
           <button 
             className={`p-3 rounded-full transition-colors flex items-center justify-center ${isExpanded ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-50 text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-600'}`}
           >
             <ChevronDown size={20} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
           </button>
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex flex-col md:flex-row gap-6 animate-in slide-in-from-top-2">
          <div className="flex-1 flex flex-col gap-4">
            <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Label Formaat / Template</label>
                {topOptions.length > 0 ? (
                  <select 
                    className="w-full p-4 border-2 border-slate-200 rounded-xl text-sm font-bold bg-white outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                    value={selectedTemplateId}
                    onChange={e => setSelectedTemplateId(e.target.value)}
                  >
                    {topOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                ) : (
                  <div className="text-xs text-orange-500 italic p-4 bg-orange-50 rounded-xl border border-orange-100">Geen tijdelijke labels met passende tags gevonden voor dit product.</div>
                )}
            </div>
            
            <button 
              onClick={() => onPrint(item, selectedTemplateId)} 
              disabled={!selectedTemplateId || topOptions.length === 0}
              className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 disabled:opacity-50 mt-auto"
            >
              <Printer size={18} /> Etiket Printen
            </button>
          </div>
          
          <div className="w-full md:w-96 lg:w-[450px] shrink-0 flex flex-col items-center justify-center bg-white border-2 border-slate-200 p-4 rounded-3xl relative min-h-[250px] shadow-inner">
             <span className="absolute top-4 left-4 text-[10px] font-black text-slate-400 uppercase tracking-widest z-10">Live Preview</span>
             {selectedTemplate ? (
                 <div className="w-full h-full flex items-center justify-center pt-8 pb-2">
                    <AutoScaledLabelPreview label={selectedTemplate} data={previewData} printerDpi={printerDpi} />
                 </div>
             ) : (
                 <span className="text-xs text-slate-400 italic">Selecteer een template</span>
             )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Modal: Tijdelijke Labels Zoeken ---
const TempLabelModal = ({ onClose, onPrint, labelTemplates = [], labelRules = [], printerDpi = 203 }) => {
  const { t } = useTranslation();
  const [orderStr, setOrderStr] = useState("");
  const [results, setResults] = useState([]);
  const [initialList, setInitialList] = useState([]);
  const [loadingInitialList, setLoadingInitialList] = useState(true);
  const [loading, setLoading] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState(null);

  const normalizeText = (value) => String(value || "").toLowerCase().trim();

  useEffect(() => {
    let isMounted = true;

    const loadInitialList = async () => {
      setLoadingInitialList(true);
      try {
        const [tempSnap, planSnap] = await Promise.all([
          getDocs(query(collection(db, ...PATHS.TEMP_PLANNING), limit(120))),
          getDocs(query(collection(db, ...PATHS.PLANNING), limit(120))),
        ]);

        if (!isMounted) return;

        const rows = [];
        const pushRows = (snap) => {
          snap.docs.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        };

        pushRows(tempSnap);
        pushRows(planSnap);

        const dedup = [];
        const seen = new Set();
        rows.forEach((r) => {
          if (seen.has(r.id)) return;
          seen.add(r.id);
          dedup.push(r);
        });

        dedup.sort((a, b) =>
          String(getOrderLabelOrder(a)).localeCompare(
            String(getOrderLabelOrder(b)),
            undefined,
            { numeric: true }
          )
        );

        setInitialList(dedup);
      } catch (err) {
        console.error("Fout bij laden order labels lijst:", err);
      } finally {
        if (isMounted) setLoadingInitialList(false);
      }
    };

    loadInitialList();

    return () => {
      isMounted = false;
    };
  }, []);

  const displayItems = orderStr.trim() ? results : initialList;

  useEffect(() => {
    if (displayItems.length === 1) {
        setExpandedItemId(displayItems[0].id || 0);
    } else {
        setExpandedItemId(null);
    }
  }, [displayItems]);

  const handleSearch = async () => {
    if (!orderStr.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setResults([]);
    setExpandedItemId(null);
    try {
      let searchStr = orderStr.trim().toUpperCase();
      // Als de gebruiker per ongeluk een heel databasepad plakt, pak het laatste stuk (de ID)
      if (searchStr.includes('/')) {
        searchStr = searchStr.split('/').filter(Boolean).pop();
      }

      // Genereer logische FPI voorvoegsels
      let searchOptions = [searchStr];
      const digitsMatch = searchStr.match(/\d+/);
      if (digitsMatch) {
          const digits = digitsMatch[0];
          if (digits.length >= 3) {
              searchOptions.push(`N${digits}`);
              searchOptions.push(`N20${digits}`);
              searchOptions.push(`N200${digits}`);
              searchOptions.push(`N21${digits}`);
              searchOptions.push(`N210${digits}`);
              searchOptions.push(`P${digits}`);
          }
      }

      const uniqueOptions = Array.from(new Set(searchOptions)).slice(0, 15);
      const colRef = collection(db, ...PATHS.TEMP_PLANNING);
      const planRef = collection(db, ...PATHS.PLANNING);
      
      let foundDocs = new Map();
      const addDocs = (snap) => {
        if (snap && snap.docs) {
          snap.docs.forEach(d => foundDocs.set(d.id, { id: d.id, ...d.data() }));
        }
      };

      // 1. Direct op Document ID proberen
      for (const opt of uniqueOptions) {
          try {
              const docRef = doc(db, ...PATHS.TEMP_PLANNING, opt);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                  foundDocs.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
              }
              const planDocRef = doc(db, ...PATHS.PLANNING, opt);
              const planDocSnap = await getDoc(planDocRef);
              if (planDocSnap.exists()) {
                  foundDocs.set(planDocSnap.id, { id: planDocSnap.id, ...planDocSnap.data() });
              }
                } catch {
                  continue;
                }
      }

      // 2. Parallelle exacte zoekopdrachten
      const exactQueries = [
        getDocs(query(colRef, where("orderId", "in", uniqueOptions))),
        getDocs(query(colRef, where("orderNumber", "in", uniqueOptions))),
        getDocs(query(colRef, where("Order", "in", uniqueOptions))),
        getDocs(query(colRef, where("Productieorder", "in", uniqueOptions))),
        getDocs(query(colRef, where("order", "in", uniqueOptions))),
        getDocs(query(colRef, where("originalOrderId", "in", uniqueOptions))),
        getDocs(query(colRef, where("itemCode", "in", uniqueOptions))),
        getDocs(query(colRef, where("productCode", "in", uniqueOptions))),
        getDocs(query(colRef, where("articleCode", "in", uniqueOptions))),
        getDocs(query(colRef, where("Item", "in", uniqueOptions))),
        getDocs(query(colRef, where("Artikel", "in", uniqueOptions))),
        getDocs(query(colRef, where("itemDescription", "in", uniqueOptions))),
        getDocs(query(planRef, where("orderId", "in", uniqueOptions))),
        getDocs(query(planRef, where("orderNumber", "in", uniqueOptions))),
        getDocs(query(planRef, where("Order", "in", uniqueOptions))),
        getDocs(query(planRef, where("Productieorder", "in", uniqueOptions))),
        getDocs(query(planRef, where("order", "in", uniqueOptions))),
        getDocs(query(planRef, where("originalOrderId", "in", uniqueOptions))),
        getDocs(query(planRef, where("itemCode", "in", uniqueOptions))),
        getDocs(query(planRef, where("productCode", "in", uniqueOptions))),
        getDocs(query(planRef, where("articleCode", "in", uniqueOptions))),
        getDocs(query(planRef, where("Item", "in", uniqueOptions))),
        getDocs(query(planRef, where("Artikel", "in", uniqueOptions))),
        getDocs(query(planRef, where("itemDescription", "in", uniqueOptions)))
      ];
      const exactSnaps = await Promise.all(exactQueries.map(p => p.catch(() => null)));
      exactSnaps.forEach(addDocs);
        
      // 3. 'Begint met' zoekopdrachten (als we nog weinig of niks hebben)
      if (foundDocs.size < 5 && searchStr.length >= 3) {
        const startOptions = [searchStr];
        if (digitsMatch && digitsMatch[0].length >= 3) {
            startOptions.push(`N200${digitsMatch[0]}`);
            startOptions.push(`N20${digitsMatch[0]}`);
            startOptions.push(`N210${digitsMatch[0]}`);
            startOptions.push(`N21${digitsMatch[0]}`);
        }
        
        const startsWithQueries = [];
        Array.from(new Set(startOptions)).forEach(opt => {
            startsWithQueries.push(getDocs(query(colRef, where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("orderNumber", ">=", opt), where("orderNumber", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("Order", ">=", opt), where("Order", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("item", ">=", opt), where("item", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("itemDescription", ">=", opt), where("itemDescription", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("productCode", ">=", opt), where("productCode", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("description", ">=", opt), where("description", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(planRef, where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(planRef, where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(10))));
          startsWithQueries.push(getDocs(query(planRef, where("orderNumber", ">=", opt), where("orderNumber", "<=", opt + "\uf8ff"), limit(10))));
          startsWithQueries.push(getDocs(query(planRef, where("Order", ">=", opt), where("Order", "<=", opt + "\uf8ff"), limit(10))));
          startsWithQueries.push(getDocs(query(planRef, where("Productieorder", ">=", opt), where("Productieorder", "<=", opt + "\uf8ff"), limit(10))));
          startsWithQueries.push(getDocs(query(planRef, where("order", ">=", opt), where("order", "<=", opt + "\uf8ff"), limit(10))));
          startsWithQueries.push(getDocs(query(planRef, where("item", ">=", opt), where("item", "<=", opt + "\uf8ff"), limit(10))));
          startsWithQueries.push(getDocs(query(planRef, where("itemDescription", ">=", opt), where("itemDescription", "<=", opt + "\uf8ff"), limit(10))));
          startsWithQueries.push(getDocs(query(planRef, where("productCode", ">=", opt), where("productCode", "<=", opt + "\uf8ff"), limit(10))));
          startsWithQueries.push(getDocs(query(planRef, where("description", ">=", opt), where("description", "<=", opt + "\uf8ff"), limit(10))));
        });

        const startSnaps = await Promise.all(startsWithQueries.map(p => p.catch(() => null)));
        startSnaps.forEach(addDocs);
      }
      
      const queryText = normalizeText(orderStr);
      const clientMatches = initialList.filter((item) => {
        const orderText = normalizeText(getOrderLabelOrder(item));
        const productText = normalizeText([
          item.item,
          item.itemDescription,
          item.itemCode,
          item.productCode,
          item.articleCode,
          item.Item,
          item.Artikel,
          item.description,
          item.Description,
          item.Omschrijving,
        ].filter(Boolean).join(' '));
        return orderText.includes(queryText) || productText.includes(queryText);
      });

      const merged = new Map();
      Array.from(foundDocs.values()).forEach((item) => merged.set(item.id, item));
      clientMatches.forEach((item) => merged.set(item.id, item));
      setResults(Array.from(merged.values()));
    } catch (e) {
      console.error("Zoekfout temp labels:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-4xl rounded-[40px] shadow-2xl overflow-hidden relative border border-slate-100">
        {/* Achtergrond Decoratie */}
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Tag size={180} className="text-slate-900 -rotate-12" />
        </div>

        <div className="p-8 md:p-10 relative z-10 flex flex-col h-full max-h-[90vh]">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl shadow-sm border border-amber-100/50">
                <Tag size={28} strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none mb-1">
                  Order <span className="text-amber-600">Labels</span>
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Legacy / Nood-etiketten zoeken
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors"><X size={20} /></button>
          </div>

          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6 shrink-0">
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-500 transition-colors" size={18} />
              <input 
                type="text" 
                placeholder={t('printer.searchOrderPlaceholder', 'ZOEK OP ORDER OF PRODUCT')}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold uppercase outline-none focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all text-sm text-slate-900 placeholder:text-slate-400"
                value={orderStr}
                onChange={(e) => setOrderStr(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <button 
              onClick={handleSearch} 
              disabled={loading} 
              className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-amber-500 transition-all flex items-center justify-center gap-2 shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : "Zoeken"}
            </button>
          </div>

          {/* Results Area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2 pb-2">
            {displayItems.length > 0 && (
              <div className="space-y-3">
                {displayItems.map((item, idx) => (
                  <TempLabelItem 
                    key={idx} 
                    item={item} 
                    labelTemplates={labelTemplates} 
                    labelRules={labelRules}
                    onPrint={onPrint} 
                    isExpanded={expandedItemId === (item.id || idx)}
                    onToggle={() => setExpandedItemId(expandedItemId === (item.id || idx) ? null : (item.id || idx))}
                    printerDpi={printerDpi}
                  />
                ))}
              </div>
            )}
            
            {loadingInitialList && !orderStr.trim() && (
              <div className="py-12 border-2 border-dashed border-slate-200 rounded-[30px] flex flex-col items-center justify-center text-center bg-slate-50/50">
                <Loader2 className="animate-spin text-slate-400 mb-3" size={24} />
                <p className="text-xs text-slate-400 font-medium">Lijst laden...</p>
              </div>
            )}

            {results.length === 0 && orderStr.trim() && !loading && (
              <div className="py-12 border-2 border-dashed border-slate-200 rounded-[30px] flex flex-col items-center justify-center text-center bg-slate-50/50">
                <div className="p-4 bg-slate-100 text-slate-400 rounded-full mb-3">
                  <Search size={24} />
                </div>
                <p className="text-sm font-black text-slate-600 uppercase tracking-widest">Niets Gevonden</p>
                <p className="text-xs text-slate-400 font-medium mt-1">Geen order of product gevonden voor "{orderStr}".</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const LotPrintModal = ({ onClose, departmentGroups, onPrintBatch, printer }) => {
  const [departmentKey, setDepartmentKey] = useState(departmentGroups[0]?.key || "");
  const [station, setStation] = useState(departmentGroups[0]?.stations?.[0] || "");
  const [weekOffset, setWeekOffset] = useState(0); // -1,0,1
  const [count, setCount] = useState("1");
  const [startNum, setStartNum] = useState("1");
  const [loading, setLoading] = useState(false);

  const currentDepartment = useMemo(
    () => departmentGroups.find((d) => d.key === departmentKey) || departmentGroups[0] || null,
    [departmentGroups, departmentKey]
  );
  const availableStations = currentDepartment?.stations || [];
  const parsedStartNum = Math.max(1, parseInt(startNum, 10) || 1);
  const parsedCount = Math.max(1, Math.min(100, parseInt(count, 10) || 1));

  useEffect(() => {
    if (departmentGroups.length > 0 && !departmentGroups.some((d) => d.key === departmentKey)) {
      setDepartmentKey(departmentGroups[0].key);
      return;
    }
    if (availableStations.length > 0 && !availableStations.includes(station)) {
      setStation(availableStations[0]);
    }
  }, [departmentGroups, departmentKey, availableStations, station]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!station) {
      notify("Geen station beschikbaar in factory config.");
      return;
    }
    setLoading(true);
    try {
      const now = new Date();
      now.setDate(now.getDate() + (Number(weekOffset) * 7));
      const { week, year } = getISOWeekInfo(now);
      const yy = String(year).slice(-2);
      const ww = String(week).padStart(2, '0');
      const machineCode = getStationMachineCode(station);
      const baseLot = `40${yy}${ww}${machineCode}40`;

      const lots = [];
      for (let i = 0; i < parsedCount; i++) {
        const currentNum = String(parsedStartNum + i).padStart(4, '0');
        lots.push(`${baseLot}${currentNum}`);
      }

      const parsedDpi = printer?.dpi ? parseInt(printer.dpi, 10) : NaN;
      const fallbackDpi = getDriver(printer)?.nativeDpi;
      const dpi = Number.isFinite(parsedDpi) && parsedDpi > 0
        ? parsedDpi
        : (Number.isFinite(fallbackDpi) && fallbackDpi > 0 ? fallbackDpi : 203);
      const darkness = printer?.darkness ? parseInt(printer.darkness, 10) : 15;
      const zplBatch = generateLotBatchZPL({
        lots,
        printerDpi: dpi,
        darkness,
      });

      await onPrintBatch(zplBatch, lots.length);
      notify(`${parsedCount} lotnummer(s) direct geprint via USB!`);
    } catch (err) {
      notify("Fout bij genereren: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const previewNow = new Date();
  previewNow.setDate(previewNow.getDate() + (Number(weekOffset) * 7));
  const { week: previewWeek, year: previewYear } = getISOWeekInfo(previewNow);
  const previewYY = String(previewYear).slice(-2);
  const previewWW = String(previewWeek).padStart(2, '0');
  const previewMachineCode = getStationMachineCode(station);
  const previewBaseLot = `40${previewYY}${previewWW}${previewMachineCode}40`;
  const previewLots = Array.from({ length: Math.min(5, Math.max(1, parsedCount)) }, (_, i) => {
    const seq = parsedStartNum + i;
    return `${previewBaseLot}${String(seq).padStart(4, '0')}`;
  });

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-[30px] shadow-2xl p-8 my-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
            <Printer className="text-blue-500" /> Lotnummers Printen
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Afdeling</label>
            <select
              value={departmentKey}
              onChange={(e) => setDepartmentKey(e.target.value)}
              className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
              disabled={departmentGroups.length === 0}
            >
              {departmentGroups.length === 0 && <option value="">Geen afdelingen gevonden</option>}
              {departmentGroups.map((group) => (
                <option key={group.key} value={group.key}>{group.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Station / Machine</label>
            <select value={station} onChange={e => setStation(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50" disabled={availableStations.length === 0}>
              {availableStations.length === 0 && <option value="">Geen stations gevonden</option>}
              {availableStations.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Week</label>
            <select value={String(weekOffset)} onChange={(e) => setWeekOffset(parseInt(e.target.value, 10) || 0)} className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50">
              <option value="-1">Vorige week</option>
              <option value="0">Huidige week</option>
              <option value="1">Volgende week</option>
            </select>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">ISO week {previewWW}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Start Volgnummer</label>
              <input
                type="number"
                min="1"
                max="9999"
                inputMode="numeric"
                value={startNum}
                onChange={(e) => setStartNum(e.target.value)}
                onBlur={() => setStartNum(String(parsedStartNum))}
                className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Aantal Labels</label>
              <input
                type="number"
                min="1"
                max="100"
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                onBlur={() => setCount(String(parsedCount))}
                className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
              />
            </div>
          </div>
          <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 flex flex-col items-center mt-2">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest w-full text-left">Live Preview (max 5)</p>
            <div className="w-full border border-slate-200 rounded-xl overflow-hidden bg-white" style={{ maxWidth: '90mm' }}>
              {previewLots.map((lot) => (
                <div key={lot} className="w-full h-[13mm] px-2 flex items-center gap-2 border-b border-dashed border-slate-300 last:border-b-0" style={{ maxWidth: '90mm' }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(lot)}`}
                    alt="QR links"
                    className="w-8 h-8 object-contain"
                  />
                  <p className="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-[0.08em] leading-none break-all flex-1 text-center">
                    {lot}
                  </p>
                </div>
              ))}
              {parsedCount > 5 && (
                <p className="text-[11px] font-bold text-slate-500 text-center">+{parsedCount - 5} extra labels worden geprint</p>
              )}
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full mt-4 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all flex justify-center items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Printer size={18} />}
            Genereer & Print
          </button>
        </form>
      </div>
    </div>
  );
};

const PrintStationView = () => {
  const { t } = useTranslation();
  const [lotNumber, setLotNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [productData, setProductData] = useState(null);
  const [error, setError] = useState('');
  const { showSuccess, showError , notify} = useNotifications();

  const [selectedLabelId, setSelectedLabelId] = useState('');
  const [showTempModal, setShowTempModal] = useState(false);
  const [showLotModal, setShowLotModal] = useState(false);
  const [labelTemplates, setLabelTemplates] = useState([]);
  const [labelRules, setLabelRules] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [factoryConfig, setFactoryConfig] = useState(null);

  const { selectedLabel, previewData, availableLabels } = useLabelPreview(productData, selectedLabelId);

  // --- USB State & Logic ---
  const [usbDevice, setUsbDevice] = useState(null);

  useEffect(() => {
    const restoreUsbConnection = async () => {
      if (!('usb' in navigator)) return;
      const savedVendor = localStorage.getItem('usb_printer_vendor');
      const savedProduct = localStorage.getItem('usb_printer_product');
      if (savedVendor && savedProduct) {
        try {
          const devices = await navigator.usb.getDevices();
          const match = devices.find(d => 
            d.vendorId === parseInt(savedVendor) && 
            d.productId === parseInt(savedProduct)
          );
          if (match) setUsbDevice(match);
        } catch (err) {
          console.warn("Kon USB printer niet automatisch herstellen:", err);
        }
      }
    };
    restoreUsbConnection();
  }, []);

  const handleConnectUsb = async () => {
    try {
      const device = await navigator.usb.requestDevice({ filters: [] });
      setUsbDevice(device);
      localStorage.setItem('usb_printer_vendor', device.vendorId);
      localStorage.setItem('usb_printer_product', device.productId);
      showSuccess(`Verbonden met USB printer: ${device.productName}`);
    } catch (err) {
      showError("USB Koppelen mislukt: " + err.message);
    }
  };

  const printRawUsb = async (device, content) => {
    if (!device) throw new Error("Geen printer verbonden");
    if (!device.opened) await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);
    try { await device.claimInterface(0); } catch {
      void 0;
    }

    const encoder = new globalThis.TextEncoder();
    const data = encoder.encode(content);
    const interface0 = device.configuration.interfaces[0];
    const endpoint = interface0?.alternate?.endpoints.find(e => e.direction === 'out');
    const endpointNumber = endpoint ? endpoint.endpointNumber : 1;

    await device.transferOut(endpointNumber, data);
  };

  useEffect(() => {
    const unsubTemplates = onSnapshot(collection(db, ...PATHS.LABEL_TEMPLATES), (snap) => {
      setLabelTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubRules = onSnapshot(collection(db, ...PATHS.LABEL_LOGIC), (snap) => {
      setLabelRules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubPrinters = onSnapshot(collection(db, ...PATHS.PRINTERS), (snap) => {
      setPrinters(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubTemplates();
      unsubRules();
      unsubPrinters();
    };
  }, []);

  useEffect(() => {
    const unsubFactory = onSnapshot(doc(db, ...PATHS.FACTORY_CONFIG), (snap) => {
      setFactoryConfig(snap.exists() ? snap.data() : null);
    });
    return () => unsubFactory();
  }, []);

  const activeQueuePrinter = useMemo(() => {
    if (usbDevice) {
      const matched = printers.find(
        (p) => p.vendorId === usbDevice.vendorId && p.productId === usbDevice.productId
      );
      if (matched) return matched;
    }
    return printers.find((p) => p.isDefault) || printers[0] || null;
  }, [printers, usbDevice]);

  const stationGroups = useMemo(() => {
    if (!activeQueuePrinter) return [];
    const stations = Array.isArray(activeQueuePrinter.queueStations)
      ? activeQueuePrinter.queueStations
      : (activeQueuePrinter.linkedStations || []);
    return Array.from(new Set(stations.map(stationNameFromValue).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [activeQueuePrinter]);

  const departmentGroups = useMemo(() => {
    const departments = Array.isArray(factoryConfig?.departments) ? factoryConfig.departments : [];
    const fromConfig = departments
      .map((dept, idx) => {
        const stations = Array.from(new Set((dept?.stations || [])
          .map(stationNameFromValue)
          .filter(Boolean)))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        if (stations.length === 0) return null;

        const key = String(dept?.slug || dept?.id || `dept-${idx}`);
        const label = String(dept?.name || dept?.slug || dept?.id || `Afdeling ${idx + 1}`);
        return { key, label, stations };
      })
      .filter(Boolean);

    if (fromConfig.length > 0) return fromConfig;

    return stationGroups.length > 0
      ? [{ key: 'all-stations', label: 'Alle stations', stations: stationGroups }]
      : [];
  }, [factoryConfig, stationGroups]);

  const printerDpi = useMemo(() => {
    const parsed = parseInt(activeQueuePrinter?.dpi, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    const fallback = getDriver(activeQueuePrinter)?.nativeDpi;
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 203;
  }, [activeQueuePrinter]);

  const printerDarkness = useMemo(() => {
    const parsed = parseInt(activeQueuePrinter?.darkness, 10);
    return Number.isFinite(parsed) ? parsed : 15;
  }, [activeQueuePrinter]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!lotNumber) return;

    setIsLoading(true);
    setProductData(null);
    setError('');

    try {
      let foundDoc = null;
      // Zoek in actieve productie
      const activeRef = collection(db, ...PATHS.ACTIVE_PRODUCTION);
      const qActive = query(activeRef, where('lotNumber', '==', lotNumber.toUpperCase()), limit(1));
      const activeSnap = await getDocs(qActive);

      if (!activeSnap.empty) {
        foundDoc = activeSnap.docs[0];
      } else {
        // Zoek in archief (vereist mogelijk index)
        const archiveRef = collection(db, ...PATHS.PRODUCTION_ARCHIVE);
        const qArchive = query(archiveRef, where('lotNumber', '==', lotNumber.toUpperCase()), limit(1));
        const archiveSnap = await getDocs(qArchive);
        if (!archiveSnap.empty) {
          foundDoc = archiveSnap.docs[0];
        }
      }

      if (foundDoc) {
        setProductData({ id: foundDoc.id, ...foundDoc.data() });
      } else {
        setError(`Lotnummer ${lotNumber} niet gevonden.`);
        showError(`Lotnummer ${lotNumber} niet gevonden.`);
      }
    } catch (err) {
      console.error("Fout bij zoeken:", err);
      setError("Er is een fout opgetreden bij het zoeken.");
      showError("Zoekfout: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTempLegacyPrint = async (orderData, templateId) => {
    const template = labelTemplates.find(t => t.id === templateId);
    const dpi = printerDpi;
    const dotsPerMm = dpi / 25.4;
    const darkness = printerDarkness;

    const order = getOrderLabelOrder(orderData);
    const item = getOrderLabelItemCode(orderData);
    const desc = getOrderLabelDescription(orderData);

    let zpl;

    if (template) {
        const labelData = processLabelData({
            ...orderData,
            orderNumber: order,
            productId: item,
            description: desc,
            lotNumber: orderData.lotNumber || order
        });
        const processedData = applyLabelLogic(labelData, labelRules);
        zpl = await generatePrintData(template, processedData, dpi, resolveLabelContent, t);
    } else {
        zpl = `^XA
^PW${Math.round(90 * dotsPerMm)}
~SD${darkness}
^FO${Math.round(5 * dotsPerMm)},${Math.round(5 * dotsPerMm)}^A0N,${Math.round(8 * dotsPerMm)},${Math.round(6 * dotsPerMm)}^FDOrder: ${order}^FS
^FO${Math.round(5 * dotsPerMm)},${Math.round(15 * dotsPerMm)}^A0N,${Math.round(6 * dotsPerMm)},${Math.round(5 * dotsPerMm)}^FDItem: ${item}^FS
^FO${Math.round(5 * dotsPerMm)},${Math.round(25 * dotsPerMm)}^A0N,${Math.round(5 * dotsPerMm)},${Math.round(4 * dotsPerMm)}^FD${desc.substring(0, 40)}^FS
^FO${Math.round(60 * dotsPerMm)},${Math.round(5 * dotsPerMm)}^BQN,2,${Math.max(2, Math.round(4 * dpi / 203))}^FDQA,${order}^FS
^XZ`;
    }

    try {
      let deviceToUse = usbDevice;
      if (!deviceToUse) {
        // Geen printer gekoppeld, direct foutmelding tonen
        showError("Geen USB-printer gekoppeld. Koppel eerst een printer via de knop rechtsboven.");
        return;
      }

      await printRawUsb(deviceToUse, zpl);
      showSuccess(`Label voor ${order} direct geprint via USB!`);
      setShowTempModal(false);
      return;
    } catch (e) {
      showError("Print Fout: " + e.message);
    }
  };

  const handlePrint = async () => {
    if (!selectedLabel || !productData) {
      showError("Selecteer een product en een label voordat u print.");
      return;
    }
    setIsLoading(true);
    try {
      const printData = await generatePrintData(selectedLabel, previewData, printerDpi, resolveLabelContent, t);
      
      let deviceToUse = usbDevice;
      if (!deviceToUse) {
        deviceToUse = await navigator.usb.requestDevice({ filters: [] });
        setUsbDevice(deviceToUse);
        localStorage.setItem('usb_printer_vendor', deviceToUse.vendorId);
        localStorage.setItem('usb_printer_product', deviceToUse.productId);
      }

      await printRawUsb(deviceToUse, printData);
      showSuccess(`Label voor lot ${productData.lotNumber} direct geprint via USB!`);
      
      setProductData(null);
      setLotNumber('');
    } catch (err) {
      console.error("Fout bij direct printen:", err);
      showError("Print Fout: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDirectLotPrintBatch = async (batchData, lotCount) => {
    let deviceToUse = usbDevice;
    if (!deviceToUse) {
      deviceToUse = await navigator.usb.requestDevice({ filters: [] });
      setUsbDevice(deviceToUse);
      localStorage.setItem('usb_printer_vendor', deviceToUse.vendorId);
      localStorage.setItem('usb_printer_product', deviceToUse.productId);
    }

    await printRawUsb(deviceToUse, batchData);
    showSuccess(`${lotCount} lotnummer(s) direct geprint via USB!`);
  };

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <Printer className="text-slate-800" size={32} />
            <h1 className="text-3xl font-bold text-slate-800">Centraal Printstation</h1>
          </div>
          <div className="flex items-center gap-3">
            {('usb' in navigator) && (
              <button 
                onClick={handleConnectUsb}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider transition-all shadow-sm border-2 ${
                  usbDevice ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                }`}
              >
                <Usb size={16} className={usbDevice ? "text-green-500" : ""} />
                <span className="hidden sm:inline">{usbDevice ? `USB: ${usbDevice.productName}` : 'Koppel USB Printer'}</span>
              </button>
            )}
            <button
              onClick={() => setShowLotModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-blue-700 transition-all shadow-sm w-fit"
            >
              <Printer size={16} /> Lotnummers
            </button>
            <button
              onClick={() => setShowTempModal(true)}
              className="bg-amber-500 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-amber-600 transition-all shadow-sm w-fit"
            >
              <Tag size={16} /> Order Labels
            </button>
          </div>
        </div>
        
        <p className="text-slate-600 mb-8">Scan of typ een lotnummer om een label te (her)printen. De printopdracht wordt naar de centrale printer bij BH18 gestuurd.</p>

        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value.toUpperCase())}
              placeholder="Scan of typ lotnummer..."
              className="w-full p-3 pl-10 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </div>
          <button type="submit" disabled={isLoading || !lotNumber} className="bg-slate-800 text-white px-6 py-3 rounded-lg font-semibold hover:bg-slate-700 disabled:bg-slate-400 flex items-center gap-2">
            {isLoading ? <Loader2 className="animate-spin" /> : <Search size={20} />}
            <span>Zoek</span>
          </button>
        </form>

        {error && <div className="text-red-600 bg-red-100 p-4 rounded-lg mb-8">{error}</div>}

        {productData && (
          <div className="bg-white p-6 rounded-lg shadow-md animate-in fade-in">
            <h2 className="text-2xl font-bold mb-4">Product Gevonden: {productData.lotNumber}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p><strong>Order:</strong> {productData.orderId}</p>
                <p><strong>Artikel:</strong> {productData.itemCode}</p>
                <p><strong>Omschrijving:</strong> {productData.item}</p>
                
                <div className="mt-4">
                  <label htmlFor="label-select" className="block text-sm font-medium text-slate-700 mb-1">Kies Label Template</label>
                  <select
                    id="label-select"
                    value={selectedLabelId}
                    onChange={(e) => setSelectedLabelId(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-md"
                  >
                    {availableLabels.map(l => <option key={l.id} value={l.id}>{l.name} ({l.width}x{l.height}mm)</option>)}
                  </select>
                </div>

                <button onClick={handlePrint} disabled={isLoading} className="mt-6 w-full bg-blue-600 text-white px-6 py-4 rounded-lg font-bold text-lg hover:bg-blue-500 disabled:bg-blue-300 flex items-center justify-center gap-3">
                  {isLoading ? <Loader2 className="animate-spin" /> : <Send size={24} />}
                  <span>Stuur naar Printer</span>
                </button>
              </div>
              <div className="bg-slate-800 p-4 rounded-lg">
                <h3 className="text-white font-bold mb-2">Label Preview</h3>
                {selectedLabel ? <AutoScaledLabelPreview label={selectedLabel} data={previewData} className="mx-auto" printerDpi={printerDpi} /> : <p className="text-slate-400">Selecteer een label</p>}
              </div>
            </div>
          </div>
        )}
        
        {showTempModal && (
          <TempLabelModal onClose={() => setShowTempModal(false)} onPrint={handleTempLegacyPrint} labelTemplates={labelTemplates} labelRules={labelRules} printerDpi={printerDpi} />
        )}
        {showLotModal && (
          <LotPrintModal onClose={() => setShowLotModal(false)} departmentGroups={departmentGroups} onPrintBatch={handleDirectLotPrintBatch} printer={activeQueuePrinter} />
        )}
      </div>
    </div>
  );
};

export default PrintStationView;
