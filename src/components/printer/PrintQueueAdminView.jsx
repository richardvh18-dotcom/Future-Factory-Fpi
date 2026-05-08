import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { db } from '../../config/firebase';
import {
  collection, collectionGroup, onSnapshot, orderBy, query, doc,
  where, getDocs, limit, getDoc, documentId
} from 'firebase/firestore';
import { PATHS } from '../../config/dbPaths';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  Loader2, RefreshCw, Trash2, AlertTriangle, CheckCircle,
  Printer, Usb, Play, ArrowLeft, Zap, Search, Hash,
  RotateCcw, Eye, X, Tag, ChevronDown
} from 'lucide-react';
import { generatePrintData, generateLotBatchZPL } from '../../utils/zplHelper';
import { getDriver } from '../../utils/printerDrivers';
import { processLabelData, resolveLabelContent, applyLabelLogic, filterTempOrderLabelsByProduct } from '../../utils/labelHelpers';
import { getISOWeekInfo, getStationMachineCode } from '../../utils/lotLogic';
import {
  transitionPrintQueueJobStatus,
  requeuePrintQueueJob,
  deletePrintQueueJob,
  queuePrintJob,
} from '../../services/planningSecurityService';
import { requestUsbDevice, printRawUsbToDevice, isUsbDirectSupported as usbDirectSupported } from '../../utils/usbPrintService';
import AutoScaledLabelPreview from './AutoScaledLabelPreview.tsx';
import { useNotifications } from '../../contexts/NotificationContext';

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

const PREVIEW_ROLL_WIDTH_MM = 90;

// Local Helper: StatusBadge
const StatusBadge = ({ status }) => {
  const config = {
    pending: { icon: <Loader2 className="animate-spin text-yellow-500" size={16} />, text: 'Wachtend', color: 'bg-yellow-100 text-yellow-800' },
    printing: { icon: <RefreshCw className="animate-spin text-blue-500" size={16} />, text: 'Printen', color: 'bg-blue-100 text-blue-800' },
    completed: { icon: <CheckCircle className="text-green-500" size={16} />, text: 'Voltooid', color: 'bg-green-100 text-green-800' },
    error: { icon: <AlertTriangle className="text-red-500" size={16} />, text: 'Fout', color: 'bg-red-100 text-red-800' },
    processing: { icon: <RefreshCw className="animate-spin text-blue-500" size={16} />, text: 'Verwerken', color: 'bg-blue-100 text-blue-800' }
  };
  const current = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${current.color}`}>
      {current.icon}
      {current.text}
    </span>
  );
};

// Local Helper: WebUSB logic
const isUsbDirectSupported = () => usbDirectSupported();

const printRawUsb = async (device, content) => {
  return printRawUsbToDevice({ device, content });
};

const normalizeQueuePrintPayload = (content, quantity) => {
  const base = String(content || "").trim();
  if (!base) return "";
  const qty = Number.isFinite(Number(quantity)) && Number(quantity) > 0
    ? Math.max(1, Math.floor(Number(quantity)))
    : 1;
  return Array.from({ length: qty }, () => base).join("\n");
};

// --- Helper voor Tijdelijke Labels ---
const TempLabelItem = ({ item, labelTemplates, labelRules, isExpanded, onToggle, printerDpi = 300, handleTempLegacyPrint }) => {
  const itemDisplay = item.item || item.description || item.Description || item.Omschrijving || item.itemCode || item.Item || item.Artikel || "";

  const topOptions = useMemo(() => {
    const normalizedProduct = {
      itemCode: item.itemCode || item.Item || item.Artikel || item.item || '',
      productId: item.productId || item.itemCode || item.Item || item.Artikel || item.item || '',
      description: item.description || item.Description || item.Omschrijving || '',
      item: item.item || item.description || item.Description || item.Omschrijving || '',
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
    const order = item.orderId || item.Order || item.Productieorder || item.id || "ONBEKEND";
    const itemCode = item.itemCode || item.item || item.Item || item.Artikel || "";
    const desc = item.description || item.Description || item.Omschrijving || "";

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
            {item.orderId || item.Order || item.Productieorder || item.id || "ONBEKEND"}
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
              onClick={() => handleTempLegacyPrint(item, selectedTemplateId)} 
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
const TempLabelModal = ({ onClose, labelTemplates = [], labelRules = [], printerDpi = 300, usbDevice, setUsbDevice, activeQueuePrinter, selectedStation }) => {
  const { t } = useTranslation();
  const { notify } = useNotifications();

  // Printfunctie nu binnen de modal zodat t altijd beschikbaar is
  const handleTempLegacyPrint = async (orderData, templateId) => {
    const template = labelTemplates.find(t => t.id === templateId);
    const dpi = printerDpi;
    const dotsPerMm = dpi / 25.4;
    const darkness = 15; // of printerDarkness als beschikbaar

    const order = orderData.orderId || orderData.Order || orderData.Productieorder || orderData.id || "ONBEKEND";
    const item = orderData.itemCode || orderData.item || orderData.Item || orderData.Artikel || "";
    const desc = orderData.description || orderData.Description || orderData.Omschrijving || "";

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
      zpl = `^XA\n^PW${Math.round(90 * dotsPerMm)}\n~SD${darkness}\n^FO${Math.round(5 * dotsPerMm)},${Math.round(5 * dotsPerMm)}^A0N,${Math.round(8 * dotsPerMm)},${Math.round(6 * dotsPerMm)}^FDOrder: ${order}^FS\n^FO${Math.round(5 * dotsPerMm)},${Math.round(15 * dotsPerMm)}^A0N,${Math.round(6 * dotsPerMm)},${Math.round(5 * dotsPerMm)}^FDItem: ${item}^FS\n^FO${Math.round(5 * dotsPerMm)},${Math.round(25 * dotsPerMm)}^A0N,${Math.round(5 * dotsPerMm)},${Math.round(4 * dotsPerMm)}^FD${desc.substring(0, 40)}^FS\n^FO${Math.round(60 * dotsPerMm)},${Math.round(5 * dotsPerMm)}^BQN,2,${Math.max(2, Math.round(4 * dpi / 203))}^FDQA,${order}^FS\n^XZ`;
    }

    try {
      let deviceToUse = usbDevice;
      if (!deviceToUse && isUsbDirectSupported()) {
        deviceToUse = await requestUsbDevice(activeQueuePrinter || {});
        setUsbDevice(deviceToUse);
      }

      if (deviceToUse) {
        await printRawUsb(deviceToUse, zpl);
        notify(t("common.printLabelDirectUsb", { order }));
        return;
      }

      if (activeQueuePrinter?.id) {
        await queuePrintJob(
          activeQueuePrinter.id,
          zpl,
          {
            description: `Order label voor ${order}`,
            quantity: 1,
            orderId: order,
            lotNumber: orderData.lotNumber || order,
            stationId: selectedStation || 'PRINT_QUEUE_ADMIN',
            targetPrinterName: activeQueuePrinter.name,
            width: parseInt(template?.width || 90, 10),
            height: parseInt(template?.height || 40, 10),
            variables: {
              orderNumber: order,
              productId: item,
              description: desc,
            },
            templateId: template?.id || null,
            source: 'temp_order_labels'
          }
        );
        notify(t("common.printLabelQueued", { order, printer: activeQueuePrinter.name }));
        return;
      }

      throw new Error('Geen directe USB printer gekoppeld en geen wachtrijprinter geconfigureerd.');
    } catch (e) {
      notify(t("common.printErrorMessage", { message: e.message }));
    }
  };
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
        const [tempSnap, planSnap, trackSnap, scopedOrdersSnap] = await Promise.all([
          getDocs(query(collection(db, ...PATHS.TEMP_PLANNING), limit(120))),
          getDocs(query(collection(db, ...PATHS.PLANNING), limit(120))),
          getDocs(query(collection(db, ...PATHS.TRACKING), limit(120))),
          getDocs(query(collectionGroup(db, 'orders'), limit(120))),
        ]);

        if (!isMounted) return;

        const rows = [];
        const pushRows = (snap) => {
          snap.docs.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        };

        pushRows(tempSnap);
        pushRows(planSnap);
        pushRows(trackSnap);
        pushRows(scopedOrdersSnap);

        const dedup = [];
        const seen = new Set();
        rows.forEach((r) => {
          if (seen.has(r.id)) return;
          seen.add(r.id);
          dedup.push(r);
        });

        dedup.sort((a, b) =>
          String(a.orderId || a.Order || a.Productieorder || a.id).localeCompare(
            String(b.orderId || b.Order || b.Productieorder || b.id),
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
            if (!searchStr.startsWith('N') && !searchStr.startsWith('P')) {
              searchOptions.push(`N${digits}`);
              searchOptions.push(`N20${digits}`);
              searchOptions.push(`N200${digits}`);
              searchOptions.push(`N21${digits}`);
              searchOptions.push(`N210${digits}`);
              searchOptions.push(`P${digits}`);
            }
          }
      }

      const uniqueOptions = Array.from(new Set(searchOptions)).slice(0, 15);
      const colRef = collection(db, ...PATHS.TEMP_PLANNING);
      const planRef = collection(db, ...PATHS.PLANNING);
        const trackRef = collection(db, ...PATHS.TRACKING);
      
      let foundDocs = new Map();
      const addDocs = (snap) => {
        if (snap && snap.docs) {
          snap.docs.forEach(d => foundDocs.set(d.id, { id: d.id, ...d.data() }));
        }
      };

      // 0. Scoped machine orders zoeken (collectionGroup voor alle 'orders' onder alle machines)
      try {
        const scopedQueries = [
          getDocs(query(collectionGroup(db, 'orders'), where('id', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('orderId', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('orderNumber', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('Order', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('order', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('originalOrderId', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('itemCode', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('productCode', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('articleCode', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('Item', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('Artikel', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('itemDescription', 'in', uniqueOptions))),
        ];
        const scopedSnaps = await Promise.all(scopedQueries.map(p => p.catch(() => null)));
        scopedSnaps.forEach(addDocs);
      } catch (err) {
        console.warn('Fout bij zoeken in scoped orders:', err);
      }

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
              const trackDocRef = doc(db, ...PATHS.TRACKING, opt);
              const trackDocSnap = await getDoc(trackDocRef);
              if (trackDocSnap.exists()) {
                  foundDocs.set(trackDocSnap.id, { id: trackDocSnap.id, ...trackDocSnap.data() });
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
        getDocs(query(planRef, where("itemDescription", "in", uniqueOptions))),
        getDocs(query(trackRef, where("orderId", "in", uniqueOptions))),
        getDocs(query(trackRef, where("orderNumber", "in", uniqueOptions))),
        getDocs(query(trackRef, where("Order", "in", uniqueOptions))),
        getDocs(query(trackRef, where("order", "in", uniqueOptions))),
        getDocs(query(trackRef, where("originalOrderId", "in", uniqueOptions))),
        getDocs(query(trackRef, where("itemCode", "in", uniqueOptions))),
        getDocs(query(trackRef, where("item", "in", uniqueOptions))),
        getDocs(query(trackRef, where("itemDescription", "in", uniqueOptions))),
        getDocs(query(trackRef, where("productCode", "in", uniqueOptions)))
      ];
      const exactSnaps = await Promise.all(exactQueries.map(p => p.catch(() => null)));
      exactSnaps.forEach(addDocs);
        
      // 3. 'Begint met' zoekopdrachten (als we nog weinig of niks hebben)
      if (foundDocs.size < 5 && searchStr.length >= 3) {
        const startOptions = [searchStr];
        if (digitsMatch && digitsMatch[0].length >= 3) {
            if (!searchStr.startsWith('N') && !searchStr.startsWith('P')) {
                startOptions.push(`N200${digitsMatch[0]}`);
                startOptions.push(`N20${digitsMatch[0]}`);
                startOptions.push(`N210${digitsMatch[0]}`);
                startOptions.push(`N21${digitsMatch[0]}`);
            }
        }
        
        const startsWithQueries = [];
        Array.from(new Set(startOptions)).forEach(opt => {
            startsWithQueries.push(getDocs(query(colRef, where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("orderNumber", ">=", opt), where("orderNumber", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("Order", ">=", opt), where("Order", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("Productieorder", ">=", opt), where("Productieorder", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("order", ">=", opt), where("order", "<=", opt + "\uf8ff"), limit(10))));
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
            startsWithQueries.push(getDocs(query(trackRef, where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(trackRef, where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(trackRef, where("orderNumber", ">=", opt), where("orderNumber", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(trackRef, where("Order", ">=", opt), where("Order", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(trackRef, where("order", ">=", opt), where("order", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(trackRef, where("item", ">=", opt), where("item", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(trackRef, where("itemDescription", ">=", opt), where("itemDescription", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(trackRef, where("productCode", ">=", opt), where("productCode", "<=", opt + "\uf8ff"), limit(10))));
        });

        const startSnaps = await Promise.all(startsWithQueries.map(p => p.catch(() => null)));
        startSnaps.forEach(addDocs);
      }
      
      const queryText = normalizeText(orderStr);
      const clientMatches = initialList.filter((item) => {
        const orderText = normalizeText([
          item.orderId,
          item.orderNumber,
          item.Order,
          item.Productieorder,
          item.order,
          item.originalOrderId,
          item.id,
        ].filter(Boolean).join(' '));
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
              <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl shadow-sm border border-emerald-100/50">
                <Tag size={28} strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none mb-1">
                  Order <span className="text-emerald-600">Labels</span>
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
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
              <input 
                type="text" 
                placeholder={t('printer.searchOrderPlaceholder', 'ZOEK OP ORDER OF PRODUCT')}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold uppercase outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm text-slate-900 placeholder:text-slate-400"
                value={orderStr}
                onChange={(e) => setOrderStr(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <button 
              onClick={handleSearch} 
              disabled={loading} 
              className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : t("common.search")}
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
                    isExpanded={expandedItemId === (item.id || idx)}
                    onToggle={() => setExpandedItemId(expandedItemId === (item.id || idx) ? null : (item.id || idx))}
                    printerDpi={printerDpi}
                    handleTempLegacyPrint={handleTempLegacyPrint}
                  />
                ))}
              </div>
            )}
            
            {loadingInitialList && !orderStr.trim() && (
              <div className="py-12 border-2 border-dashed border-slate-200 rounded-[30px] flex flex-col items-center justify-center text-center bg-slate-50/50">
                <Loader2 className="animate-spin text-slate-400 mb-3" size={24} />
                <p className="text-xs text-slate-400 font-medium">{t("common.loadingList")}</p>
              </div>
            )}

            {results.length === 0 && orderStr.trim() && !loading && (
              <div className="py-12 border-2 border-dashed border-slate-200 rounded-[30px] flex flex-col items-center justify-center text-center bg-slate-50/50">
                <div className="p-4 bg-slate-100 text-slate-400 rounded-full mb-3">
                  <Search size={24} />
                </div>
                <p className="text-sm font-black text-slate-600 uppercase tracking-widest">{t("common.nothingFound")}</p>
                <p className="text-xs text-slate-400 font-medium mt-1">{t("common.noOrderOrProductFoundFor", { query: orderStr })}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Modal: Lotnummers Printen ---
const LotPrintModal = ({ onClose, departmentGroups, onPrintBatch, printer }) => {
  const { t } = useTranslation();
  const { notify } = useNotifications();
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
      notify(t("common.noStationAvailable"));
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
      notify(t("common.lotsPrintedDirectUsb", { count: parsedCount }));
    } catch(err) {
      console.error(err);
      notify(t("common.generationError", { message: err.message }));
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
            <Printer className="text-blue-500" /> {t("common.printLotNumbers")}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>
        
        <form onSubmit={handleGenerate} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.department")}</label>
            <select
              value={departmentKey}
              onChange={e => setDepartmentKey(e.target.value)}
              className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
              disabled={departmentGroups.length === 0}
            >
              {departmentGroups.length === 0 && <option value="">{t("common.noDepartmentsFound")}</option>}
              {departmentGroups.map(group => <option key={group.key} value={group.key}>{group.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.stationMachine")}</label>
            <select value={station} onChange={e => setStation(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50" disabled={availableStations.length === 0}>
              {availableStations.length === 0 && <option value="">{t("common.noStationsFound")}</option>}
              {availableStations.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.week")}</label>
            <select value={String(weekOffset)} onChange={(e) => setWeekOffset(parseInt(e.target.value, 10) || 0)} className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50">
              <option value="-1">{t("common.previousWeek")}</option>
              <option value="0">{t("common.currentWeek")}</option>
              <option value="1">{t("common.nextWeek")}</option>
            </select>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{t("common.isoWeek", { week: previewWW })}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.startSequenceNumber")}</label>
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
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.numberOfLabels")}</label>
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
            <p className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest w-full text-left">{t("common.livePreviewMax", { max: 5 })}</p>
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
                <p className="text-[11px] font-bold text-slate-500 text-center">{t("common.extraLabelsPrinted", { count: parsedCount - 5 })}</p>
              )}
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full mt-4 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all flex justify-center items-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Printer size={18} />}
            {t("common.generateAndPrint")}
          </button>
        </form>
      </div>
    </div>
  );
};

const PrintQueueAdminView = () => {
  const { role } = useAdminAuth();
  const { t } = useTranslation();
  const { showConfirm , notify} = useNotifications();
  const canManage = ['admin', 'teamleader', 'planner'].includes(role);

  const [printJobs, setPrintJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printers, setPrinters] = useState([]);
  const [usbDevice, setUsbDevice] = useState(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const [showTempModal, setShowTempModal] = useState(false);
  const [showLotModal, setShowLotModal] = useState(false);
  
  // Nieuwe state voor navigatie en reprint
  const [viewMode, setViewMode] = useState('overview'); // 'overview' | 'station'
  const [selectedStation, setSelectedStation] = useState(null);
  const [reprintSearch, setReprintSearch] = useState('');
  const [reprintResult, setReprintResult] = useState(null);
  const [labelTemplates, setLabelTemplates] = useState([]);
  const [labelRules, setLabelRules] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLabelId, setSelectedLabelId] = useState('');
  const [previewJob, setPreviewJob] = useState(null);
  const [previewSize, setPreviewSize] = useState("3.54x5.91");
  const [previewSizeLabel, setPreviewSizeLabel] = useState("90x150 mm");
  const [factoryConfig, setFactoryConfig] = useState(null);

  useEffect(() => {
    if (previewJob?.metadata?.width && previewJob?.metadata?.height) {
        const widthMm = PREVIEW_ROLL_WIDTH_MM;
        const heightMm = Number(previewJob.metadata.height);
        const widthInches = (widthMm / 25.4).toFixed(2);
        const heightInches = (heightMm / 25.4).toFixed(2);
        setPreviewSize(`${widthInches}x${heightInches}`);
        setPreviewSizeLabel(`${widthMm}x${heightMm} mm`);
    }
  }, [previewJob]);

  useEffect(() => {
    // 1. Probeer automatisch te verbinden met een eerder gekozen USB printer
    const restoreUsbConnection = async () => {
      if (!isUsbDirectSupported()) return;
      
      const savedVendor = localStorage.getItem('usb_printer_vendor');
      const savedProduct = localStorage.getItem('usb_printer_product');
      
      if (savedVendor && savedProduct) {
        try {
          const devices = await navigator.usb.getDevices();
          const match = devices.find(d => 
            d.vendorId === parseInt(savedVendor) && 
            d.productId === parseInt(savedProduct)
          );
          if (match) {
            setUsbDevice(match);
          }
        } catch (err) {
          console.warn("Kon USB printer niet automatisch herstellen:", err);
        }
      }
    };
    restoreUsbConnection();

    // Printers ophalen
    const unsubPrinters = onSnapshot(collection(db, ...PATHS.PRINTERS), (snapshot) => {
      setPrinters(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Haal label templates op voor reprint
    const templatesRef = collection(db, ...PATHS.LABEL_TEMPLATES);
    const unsubTemplates = onSnapshot(templatesRef, (snap) => {
      setLabelTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Haal label logic op
    const logicRef = collection(db, ...PATHS.LABEL_LOGIC);
    const unsubLogic = onSnapshot(logicRef, (snap) => {
      setLabelRules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    let rootJobs = [];
    let scopedJobs = [];

    const normalizeJob = (docSnap) => {
      const data = docSnap.data() || {};
      const isQueueJob = Boolean(data.printerId || data.zpl || data.status || data.metadata?.description);
      if (!isQueueJob) return null;
      return { id: docSnap.id, ...data };
    };

    const tsToMillis = (ts) => {
      if (!ts) return 0;
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      const parsed = new Date(ts);
      return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
    };

    const printQueuePathFragment = `/${PATHS.PRINT_QUEUE.join('/')}/`;

    const mergeJobs = () => {
      const byId = new Map();
      rootJobs.forEach((job) => {
        if (job?.id) byId.set(job.id, job);
      });
      // Scoped docs krijgen voorrang op legacy root docs.
      scopedJobs.forEach((job) => {
        if (job?.id) byId.set(job.id, job);
      });
      const merged = Array.from(byId.values()).sort((a, b) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt));
      setPrintJobs(merged);
      setLoading(false);
    };

    const rootQ = query(collection(db, ...PATHS.PRINT_QUEUE), orderBy('createdAt', 'desc'));
    const unsubscribeRoot = onSnapshot(rootQ, (snapshot) => {
      rootJobs = snapshot.docs.map(normalizeJob).filter(Boolean);
      mergeJobs();
    }, (err) => {
      console.error('Error fetching legacy print jobs:', err);
      rootJobs = [];
      mergeJobs();
    });

    const scopedQ = collectionGroup(db, 'items');
    const unsubscribeScoped = onSnapshot(scopedQ, (snapshot) => {
      scopedJobs = snapshot.docs
        .filter((docSnap) => String(docSnap.ref?.path || '').includes(printQueuePathFragment))
        .map(normalizeJob)
        .filter((job) => job && String(job._scopeType || 'print_queue').trim() === 'print_queue');
      mergeJobs();
    }, (err) => {
      console.error('Error fetching scoped print jobs:', err);
      scopedJobs = [];
      mergeJobs();
    });

    return () => {
      unsubPrinters();
      unsubscribeRoot();
      unsubscribeScoped();
      unsubTemplates();
      unsubLogic();
    };
  }, []);

  useEffect(() => {
    const unsubFactory = onSnapshot(doc(db, ...PATHS.FACTORY_CONFIG), (snap) => {
      setFactoryConfig(snap.exists() ? snap.data() : null);
    });

    return () => {
      unsubFactory();
    };
  }, []);

  // Auto-print logica
  useEffect(() => {
    const matchedPrinter = usbDevice
      ? printers.find((p) => p.vendorId === usbDevice.vendorId && p.productId === usbDevice.productId)
      : null;
    const currentPrinterId = matchedPrinter?.id || printers.find((p) => p.isDefault)?.id || printers[0]?.id || null;
    if (!autoPrint || !usbDevice || isProcessing || !currentPrinterId) return;

    const pendingJobs = printJobs.filter((j) => {
      if (j.status !== 'pending') return false;
      if (j.printerId !== currentPrinterId) return false;
      if (!selectedStation) return true;
      return j.metadata?.stationId === selectedStation || j.metadata?.targetPrinterName === selectedStation;
    });

    if (pendingJobs.length > 0) {
      const processQueue = async () => {
        setIsProcessing(true);
        for (const job of pendingJobs) {
          try {
            await handlePrintJob(job);
          } catch (e) {
            console.error(`Auto-print failed for ${job.id}:`, e);
            setAutoPrint(false);
            setError(`Auto-print gestopt. Fout bij printen taak ${job.id}: ${e.message}`);
            break;
          }
        }
        setIsProcessing(false);
      };
      processQueue();
    }
  }, [printJobs, autoPrint, usbDevice, isProcessing, selectedStation, printers]);

  const filteredJobs = useMemo(() => {
    let jobs = printJobs;
    const matchedPrinter = usbDevice
      ? printers.find((p) => p.vendorId === usbDevice.vendorId && p.productId === usbDevice.productId)
      : null;
    const currentPrinterId = matchedPrinter?.id || printers.find((p) => p.isDefault)?.id || printers[0]?.id || null;

    if (currentPrinterId) {
      jobs = jobs.filter((j) => j.printerId === currentPrinterId);
    }
    
    // Filter op station als er een geselecteerd is
    if (selectedStation) {
      jobs = jobs.filter(j => j.metadata?.stationId === selectedStation || j.metadata?.targetPrinterName === selectedStation);
    } else if (role !== 'admin') {
      // Standaard filter voor niet-admins
      const allowedPrinterIds = printers.map(p => p.id);
      jobs = jobs.filter(job => allowedPrinterIds.includes(job.printerId));
    }
    
    return jobs;
  }, [printJobs, printers, role, selectedStation, usbDevice]);

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

  const handleConnectUsb = async () => {
    setError('');
    try {
      const device = await navigator.usb.requestDevice({ filters: [] });
      setUsbDevice(device);
      // Sla de printer op voor de volgende keer
      localStorage.setItem('usb_printer_vendor', device.vendorId);
      localStorage.setItem('usb_printer_product', device.productId);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDirectLotPrintBatch = async (batchData) => {
    let deviceToUse = usbDevice;
    if (!deviceToUse) {
      deviceToUse = await navigator.usb.requestDevice({ filters: [] });
      setUsbDevice(deviceToUse);
      localStorage.setItem('usb_printer_vendor', deviceToUse.vendorId);
      localStorage.setItem('usb_printer_product', deviceToUse.productId);
    }

    await printRawUsb(deviceToUse, batchData);
    setError('');
  };

  const handlePrintJob = async (job) => {
    if (!usbDevice) throw new Error("Geen USB printer verbonden.");
    await transitionPrintQueueJobStatus({
      jobId: job.id,
      status: 'printing',
      source: 'PrintQueueAdminView',
    });
    try {
      // Use printData (standard) or zpl field
      const content = job.printData || job.zpl;
      if (!content) throw new Error("Geen printdata gevonden in job.");
      const quantity = getJobQuantity(job) || 1;
      const payload = normalizeQueuePrintPayload(content, quantity);

      await printRawUsb(usbDevice, payload);
      await transitionPrintQueueJobStatus({
        jobId: job.id,
        status: 'completed',
        source: 'PrintQueueAdminView',
      });
    } catch (e) {
      await transitionPrintQueueJobStatus({
        jobId: job.id,
        status: 'error',
        error: e.message,
        source: 'PrintQueueAdminView',
      });
      throw e;
    }
  };

  const handleReprint = async (jobId) => {
    const confirmed = await showConfirm({
      title: 'Taak opnieuw printen',
      message: 'Weet u zeker dat u deze taak opnieuw wilt printen?',
      confirmText: 'Opnieuw printen',
      cancelText: 'Annuleren',
      tone: 'warning',
    });
    if (!confirmed) return;
    await requeuePrintQueueJob({
      jobId,
      source: 'PrintQueueAdminView',
    });
  };

  const handleDelete = async (jobId) => {
    const confirmed = await showConfirm({
      title: 'Printtaak verwijderen',
      message: 'Weet u zeker dat u deze taak permanent wilt verwijderen?',
      confirmText: 'Verwijderen',
      cancelText: 'Annuleren',
      tone: 'danger',
    });
    if (!confirmed) return;
    await deletePrintQueueJob({
      jobId,
      source: 'PrintQueueAdminView',
    });
  };

  const getJobSizeLabel = (job) => {
    const height = Number(job?.metadata?.height);
    if (!height) return null;
    return `${PREVIEW_ROLL_WIDTH_MM}x${height} mm`;
  };

  const getJobQuantity = (job) => {
    const quantity = Number(job?.metadata?.quantity);
    if (Number.isFinite(quantity) && quantity > 0) return quantity;
    const description = String(job?.metadata?.description || job?.description || '');
    const match = description.match(/\(x(\d+)\)/i);
    return match ? Number(match[1]) : null;
  };

  const handleSearchProduct = async (e) => {
    e.preventDefault();
    if (!reprintSearch.trim()) return;
    
    setIsSearching(true);
    setReprintResult(null);
    setError('');

    const searchStr = reprintSearch.trim().toUpperCase();
    try {
      const trackingRef = collection(db, ...PATHS.TRACKING);
      const q = query(trackingRef, where("lotNumber", "==", searchStr), limit(1));
      const snap = await getDocs(q);

      if (!snap.empty) {
        setReprintResult({ id: snap.docs[0].id, ...snap.docs[0].data(), source: 'active' });
        if (!selectedLabelId && labelTemplates.length > 0) {
            const defaultTpl = labelTemplates.find(t => t.name.toLowerCase().includes("standaard")) || labelTemplates[0];
            setSelectedLabelId(defaultTpl.id);
        }
      } else {
        const currentYear = new Date().getFullYear();
        const archiveRef = collection(db, "future-factory", "production", "archive", String(currentYear), "items");
        const qArch = query(archiveRef, where("lotNumber", "==", searchStr), limit(1));
        const snapArch = await getDocs(qArch);
        
        if (!snapArch.empty) {
          setReprintResult({ id: snapArch.docs[0].id, ...snapArch.docs[0].data(), source: 'archive' });
          if (!selectedLabelId && labelTemplates.length > 0) {
             setSelectedLabelId(labelTemplates[0].id);
          }
        } else {
          setError("Lotnummer niet gevonden.");
        }
      }
    } catch (err) {
      console.error(err);
      setError("Fout bij zoeken: " + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const reprintPreviewData = useMemo(() => {
    if (!reprintResult) return {};
    const baseData = processLabelData({
      ...reprintResult,
      orderNumber: reprintResult.orderId,
      productId: reprintResult.itemCode,
      description: reprintResult.item
    });
    return applyLabelLogic(baseData, labelRules);
  }, [reprintResult, labelRules]);

  const selectedLabelTemplate = useMemo(() => labelTemplates.find(t => t.id === selectedLabelId), [labelTemplates, selectedLabelId]);

  const handleReprintLabel = async (type) => {
    if (!reprintResult || !usbDevice) {
      setError("Geen product gevonden of geen printer verbonden.");
      return;
    }

    setIsProcessing(true);
    try {
      let zpl = "";
      
      if (type === 'simple') {
        zpl = `^XA
^FO50,50^BQN,2,6^FDQA,${reprintResult.lotNumber}^FS
^FO50,200^A0N,50,50^FD${reprintResult.lotNumber}^FS
^FO50,260^A0N,30,30^FD${reprintResult.itemCode || ""}^FS
^XZ`;
      } else if (reprintResult.labelZPL) {
        zpl = reprintResult.labelZPL;
        console.log("Herdruk via opgeslagen ZPL.");
      } else {
        const template = selectedLabelTemplate || labelTemplates[0];
        if (!template) throw new Error("Geen label template beschikbaar.");

        const labelData = processLabelData({
          ...reprintResult,
          orderNumber: reprintResult.orderId,
          productId: reprintResult.itemCode,
          description: reprintResult.item
        });
        
        // Gebruik generatePrintData (consistent met rest van app)
        const processedData = applyLabelLogic(labelData, labelRules);
        zpl = await generatePrintData(template, processedData, printerDpi, resolveLabelContent, t);
      }

      await printRawUsb(usbDevice, zpl);
      setReprintSearch("");
      setReprintResult(null);
      notify("Label geprint!");
    } catch (err) {
      setError("Print fout: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };


  return (
    <div className="p-4 md:p-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-4">
            {viewMode === 'station' && (
              <button 
                onClick={() => { setViewMode('overview'); setSelectedStation(null); }}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                <ArrowLeft size={24} />
              </button>
            )}
            <div>
              <h1 className="text-3xl font-bold mb-1">{selectedStation ? `Station: ${selectedStation}` : 'Print Stations'}</h1>
              <p className="text-slate-600 text-sm">Beheer printopdrachten en herprint labels.</p>
            </div>
          </div>
        </div>
        {isUsbDirectSupported() && (
          <div className="flex items-center gap-3">
            {usbDevice && (
              <button
                onClick={() => setAutoPrint(!autoPrint)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs uppercase transition-all border-2 ${
                  autoPrint 
                    ? 'bg-blue-600 text-white border-blue-600 shadow-lg animate-pulse' 
                    : 'bg-white text-slate-400 border-slate-200'
                }`}
                title="Print nieuwe opdrachten automatisch zodra ze binnenkomen"
              >
                <Zap size={16} fill={autoPrint ? "currentColor" : "none"} />
                {autoPrint ? "Auto-Print AAN" : "Auto-Print UIT"}
              </button>
            )}
            
            <button 
              onClick={handleConnectUsb}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs uppercase transition-all border-2 ${
                usbDevice ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
              }`}
            >
              {usbDevice ? <Usb className="text-green-500" /> : <Usb />}
              {usbDevice ? `Verbonden: ${usbDevice.productName}` : 'Verbind USB Printer'}
            </button>
          </div>
        )}
      </div>
      
      {/* TEGELS VOOR OPERATORS (LOTNUMMERS & TIJDELIJKE LABELS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Tegel: Lotnummers Printen */}
        <button
          type="button"
          onClick={() => setShowLotModal(true)}
          className="flex items-center gap-4 bg-white border-2 border-slate-200 hover:border-blue-500 rounded-2xl p-4 transition-all hover:shadow-lg group text-left"
        >
          <div className="p-4 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <Printer size={24} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
              Lotnummers Afdrukken
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Genereer en print een serie nieuwe FPI lotnummers
            </p>
          </div>
        </button>

        {/* Tegel: Tijdelijke Labels */}
        <button
          type="button"
          onClick={() => setShowTempModal(true)}
          className="flex items-center gap-4 bg-white border-2 border-slate-200 hover:border-emerald-500 rounded-2xl p-4 transition-all hover:shadow-lg group text-left"
        >
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <Tag size={24} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
              Order Labels
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Print snelle labels voor onderhanden werk of afkeur
            </p>
          </div>
        </button>
      </div>

      {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2"><AlertTriangle size={20}/> {error}</div>}

      {viewMode === 'overview' ? (
      <div className="mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {stationGroups.map(station => {
            const pendingCount = printJobs.filter((j) => {
              if (j.status !== 'pending') return false;
              if (activeQueuePrinter?.id && j.printerId !== activeQueuePrinter.id) return false;
              return j.metadata?.stationId === station || j.metadata?.targetPrinterName === station;
            }).length;
            
            return (
              <button 
                key={station} 
                onClick={() => { setSelectedStation(station); setViewMode('station'); }}
                className={`p-6 rounded-2xl border-2 transition-all text-left relative group hover:-translate-y-1 ${
                  pendingCount > 0 
                    ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-100' 
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-md'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="p-3 bg-white rounded-xl shadow-sm">
                    <Printer className={pendingCount > 0 ? "text-blue-600" : "text-slate-400"} size={24} />
                  </div>
                  {pendingCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse">
                      {pendingCount}
                    </span>
                  )}
                </div>
                <h3 className="font-black text-xl text-slate-800 mt-4 uppercase tracking-tight">{station}</h3>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Print Queue</p>
              </button>
            );
          })}
          
          {stationGroups.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-400 italic">
              Geen Queue Stations geconfigureerd. Stel ze in via Printer Beheer - Queue Stations.
            </div>
          )}
        </div>
      </div>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-right-4">
          {/* REPRINT SECTION */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2">
              <RotateCcw size={16} /> Label Herprinten / Beschadigd
            </h3>
            <div className="flex gap-4 items-start">
              <form onSubmit={handleSearchProduct} className="flex-1 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    value={reprintSearch}
                    onChange={(e) => setReprintSearch(e.target.value.toUpperCase())}
                    placeholder="Scan of typ lotnummer..."
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 outline-none font-bold uppercase"
                  />
                </div>
                <button type="submit" disabled={isSearching} className="px-6 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-colors">
                  {isSearching ? <Loader2 className="animate-spin" /> : "Zoek"}
                </button>
              </form>
            </div>

            {reprintResult && (
              <div className="mt-4 p-6 bg-white rounded-xl border border-blue-100 shadow-sm animate-in fade-in">
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                        <h4 className="font-black text-lg text-slate-800 mb-2">{reprintResult.lotNumber}</h4>
                        <div className="space-y-1 text-sm text-slate-600">
                            <p><span className="font-bold text-slate-400 w-20 inline-block">Item:</span> {reprintResult.item}</p>
                            <p><span className="font-bold text-slate-400 w-20 inline-block">Code:</span> {reprintResult.itemCode}</p>
                            <p><span className="font-bold text-slate-400 w-20 inline-block">Order:</span> {reprintResult.orderId}</p>
                        </div>
                        
                        <div className="mt-4">
                            <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Template</label>
                            <select 
                                value={selectedLabelId}
                                onChange={(e) => setSelectedLabelId(e.target.value)}
                                className="w-full p-2 border rounded-lg text-sm"
                            >
                                {labelTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    <div className="border-l border-slate-100 pl-6 flex flex-col items-center justify-center bg-slate-50/50 rounded-r-xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Preview</p>
                        <AutoScaledLabelPreview label={selectedLabelTemplate} data={reprintPreviewData} className="w-64" printerDpi={printerDpi} />
                    </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button 
                    onClick={() => handleReprintLabel('simple')}
                    disabled={!usbDevice || isProcessing}
                    className="px-4 py-2 bg-white border-2 border-slate-200 text-slate-600 hover:border-blue-500 hover:text-blue-600 rounded-lg font-bold text-xs uppercase tracking-wider transition-all"
                  >
                    <Hash size={14} className="inline mr-1" /> Alleen Nummer
                  </button>
                  <button 
                    onClick={() => handleReprintLabel('full')}
                    disabled={!usbDevice || isProcessing}
                    className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-bold text-xs uppercase tracking-wider transition-all shadow-md"
                  >
                    <Printer size={14} className="inline mr-1" /> Volledig Label
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* QUEUE LIST */}
          <div>
      <h2 className="text-xl font-bold mb-3">Print Taken</h2>
      <div className="bg-white shadow-md rounded-lg overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-500">
          <thead className="text-xs text-slate-700 uppercase bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3">Status</th>
              <th scope="col" className="px-6 py-3">Beschrijving</th>
              <th scope="col" className="px-6 py-3">Printer</th>
              <th scope="col" className="px-6 py-3">Aangevraagd door</th>
              <th scope="col" className="px-6 py-3">Tijdstip</th>
              <th scope="col" className="px-6 py-3">Acties</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="6" className="text-center p-8"><Loader2 className="animate-spin inline-block" /></td></tr>}
            {!loading && filteredJobs.length === 0 && <tr><td colSpan="6" className="text-center p-8">De wachtrij voor uw stations is leeg.</td></tr>}
            {filteredJobs.map(job => (
              <tr key={job.id} className="bg-white border-b hover:bg-slate-50">
                <td className="px-6 py-4">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-6 py-4 font-medium text-slate-900">
                  {job.metadata?.description || job.description}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {job.metadata?.stationId && <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-bold">{job.metadata.stationId}</span>}
                    {getJobSizeLabel(job) && <span className="text-[10px] bg-blue-50 px-2 py-0.5 rounded text-blue-700 font-bold">{getJobSizeLabel(job)}</span>}
                    {getJobQuantity(job) && <span className="text-[10px] bg-emerald-50 px-2 py-0.5 rounded text-emerald-700 font-bold">Aantal: {getJobQuantity(job)}</span>}
                  </div>
                  {job.status === 'error' && <p className="text-red-600 text-xs mt-1">{job.error}</p>}
                </td>
                <td className="px-6 py-4">
                  <span className="font-bold text-slate-600 text-xs">
                    {job.metadata?.targetPrinterName || job.printerId || 'Standaard'}
                  </span>
                </td>
                <td className="px-6 py-4">{job.metadata?.requesterEmail || job.createdBy}</td>
                <td className="px-6 py-4">
                  {job.createdAt ? formatDistanceToNow(job.createdAt.toDate(), { addSuffix: true, locale: nl }) : '-'}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {job.status === 'pending' && (
                      <>
                      <button onClick={() => setPreviewJob(job)} className="p-2 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-full" title="Bekijk Label">
                        <Eye size={16} />
                      </button>
                      <button 
                        onClick={async () => {
                          setIsProcessing(true);
                          try { await handlePrintJob(job); } 
                          catch(e) { setError(e.message); }
                          finally { setIsProcessing(false); }
                        }} 
                        disabled={!usbDevice || isProcessing || !canManage} 
                        className="p-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed" 
                        title="Nu Printen"
                      >
                        <Play size={16} />
                      </button>
                      </>
                    )}
                    <button onClick={() => handleReprint(job.id)} disabled={!canManage} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-100 rounded-full disabled:opacity-50" title="Opnieuw printen">
                      <RefreshCw size={16} />
                    </button>
                    <button onClick={() => handleDelete(job.id)} disabled={!canManage} className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-100 rounded-full disabled:opacity-50" title="Verwijderen">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
          </div>
        </div>
      )}

      {/* ZPL Preview Modal voor Queue Items */}
      {previewJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                     <div className="flex items-center gap-3">
                        <h3 className="font-bold text-slate-800">Label Voorbeeld</h3>
                        <span className="text-[10px] font-bold uppercase text-slate-500">{previewSizeLabel}</span>
                     </div>
                    <button onClick={() => setPreviewJob(null)} className="p-1 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                </div>
                <div className="p-8 flex justify-center items-center bg-slate-100 min-h-[300px] overflow-hidden">
                    {(() => {
                        // Controleer of de job gekoppeld is aan een bekende interne template
                        const template = labelTemplates.find(t => t.id === previewJob.metadata?.templateId);
                        
                        if (template) {
                            return (
                                <div className="w-full max-w-sm flex justify-center bg-white shadow-xl border border-slate-200 p-2 rounded-lg">
                                    <AutoScaledLabelPreview 
                                        label={template} 
                                        data={previewJob.metadata?.variables || {}} 
                                      printerDpi={printerDpi}
                                    />
                                </div>
                            );
                        }
                        
                        // Fallback naar de externe Labelary API als het pure (legacy) ZPL is
                        return (
                            <img 
                                src={`https://api.labelary.com/v1/printers/8dpmm/labels/${previewSize}/0/${encodeURIComponent(previewJob.zpl || previewJob.printData || "")}`} 
                                alt="Label Preview" 
                                className="shadow-lg max-w-full border bg-white"
                            />
                        );
                    })()}
                </div>
                <div className="p-4 text-center text-xs text-slate-400">
                    {labelTemplates.some(t => t.id === previewJob.metadata?.templateId) 
                        ? "Interne Visual Preview (AutoScaled)" 
                        : "Gegenereerd via Labelary API"}
                </div>
            </div>
        </div>
      )}

      {showTempModal && (
        <TempLabelModal
          onClose={() => setShowTempModal(false)}
          labelTemplates={labelTemplates}
          labelRules={labelRules}
          printerDpi={printerDpi}
          usbDevice={usbDevice}
          setUsbDevice={setUsbDevice}
          activeQueuePrinter={activeQueuePrinter}
          selectedStation={selectedStation}
        />
      )}

      {showLotModal && (
        <LotPrintModal onClose={() => setShowLotModal(false)} departmentGroups={departmentGroups} onPrintBatch={handleDirectLotPrintBatch} printer={activeQueuePrinter} />
      )}
    </div>
  );
};

export default PrintQueueAdminView;
