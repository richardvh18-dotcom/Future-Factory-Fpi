// @ts-nocheck
import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { 
  Printer, 
  Plus, 
  Trash2, 
  Save, 
  CheckCircle2, 
  Play,
  X,
  MapPin,
  Edit,
  Usb,
  List,
  Server,
  QrCode,
  Hash,
  Tag,
  Search,
  Crosshair
} from "lucide-react";
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  setDoc,
  serverTimestamp,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  documentId
} from "firebase/firestore";
import { useNotifications } from "../../contexts/NotificationContext";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { isUsbDirectSupported, requestUsbDevice, printRawUsb } from "../../utils/usbPrintService";

// Parse USB ID strings (e.g., "1234" or "0x1234") to numbers
const parseUsbId = (idStr) => {
  if (!idStr) return undefined;
  const trimmed = String(idStr).trim();
  const parsed = parseInt(trimmed.startsWith('0x') ? trimmed : "0x" + trimmed, 16);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};
import { getDriver, applyCalibration, PRINTER_DRIVERS } from "../../utils/printerDrivers";
import { queuePrintJob } from "../../services/planningSecurityService";
import PrintQueueAdminView from "../printer/PrintQueueAdminView";
import InternalQrImage from "../../utils/InternalQrImage.tsx";

const PRINTER_PROTOCOLS = ["zpl", "epl", "tspl", "escpos", "custom"];
const PRINT_SETTINGS_KEY = 'printConfig';
const CONNECTION_TYPES = {
  WEBUSB: 'webusb',
  WINDOWS_HOST: 'windows_host',
  NETWORK: 'network',
};

const normalizePrinterType = (type) => {
  if (type === 'zebra_local') return CONNECTION_TYPES.WEBUSB;
  if (type === CONNECTION_TYPES.WEBUSB || type === CONNECTION_TYPES.WINDOWS_HOST || type === CONNECTION_TYPES.NETWORK) {
    return type;
  }
  return CONNECTION_TYPES.WEBUSB;
};

const getConnectionLabel = (type) => {
  const normalized = normalizePrinterType(type);
  if (normalized === CONNECTION_TYPES.WINDOWS_HOST) return 'Windows Host';
  if (normalized === CONNECTION_TYPES.NETWORK) return 'Netwerk (IP)';
  return 'WebUSB / Zadig';
};

const DEFAULT_PRINTER_FORM = {
  name: "",
  ip: "",
  port: "9100",
  protocol: "zpl",
  dpi: "203",
  width: "90",
  height: "50",
  rollWidthMm: "90",
  rollType: "gap", // gap (stickers), continuous (doorlopend), mark (black mark)
  darkness: "15",
  speed: "3",
  linkedStations: [],
  type: CONNECTION_TYPES.WEBUSB,
  isDefault: false,
  vendorId: null,
  productId: null,
  deviceName: "",
  calibrationOffsetXMm: "0",
  calibrationOffsetYMm: "0",
  driverModel: "",  // bijv. 'zebra-zm400-300' of 'lighthouse-cjpro2'
};

const parseMm = (value, fallback = 0) => {
  const parsed = Number.parseFloat(String(value ?? "").replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeRollType = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'continuous' || raw === 'mark') return raw;
  return 'gap';
};

const resolveRollWidthMm = (printerLike = {}) => {
  return parseMm(printerLike.rollWidthMm ?? printerLike.width, 90);
};

const mmToDots = (mm, dpi = 203) => Math.round((Number(mm) || 0) * (dpi / 25.4));

// applyCalibrationToRawZpl is vervangen door applyCalibration() uit printerDrivers.js.
// buildCalibrationCrossZpl gebruikt nu getDriver() voor correcte DPI-berekening.

const buildCalibrationCrossZpl = ({ printer, labelWidthMm = 90, labelHeightMm = 40 }) => {
  const driver = getDriver(printer);
  const dpi = driver.nativeDpi;
  const darkness = printer?.darkness ? parseInt(printer.darkness, 10) : driver.defaultDarkness;
  const printSpeed = printer?.speed ? parseInt(printer.speed, 10) : driver.defaultSpeed;
  const toDots = (mm) => mmToDots(mm, dpi);

  const widthDots = toDots(labelWidthMm);
  const heightDots = toDots(labelHeightMm);
  const centerX = Math.round(widthDots / 2);
  const centerY = Math.round(heightDots / 2);

  const margin = toDots(2);
  const crossHalf = toDots(8);
  const tick = toDots(1.4);
  const tickLen = toDots(2.4);
  const bottomTextY = Math.max(toDots(2), heightDots - toDots(4));

  const mediaMode = driver?.mediaMode ?? '^MMC';

  let zpl = "^XA\n";
  if (mediaMode) zpl += `${mediaMode}\n`; // cut-mode vroeg in format
  zpl += `~SD${darkness}\n`;
  zpl += `^PR${printSpeed}\n`;
  zpl += `^PW${widthDots}\n`;
  zpl += `^LL${heightDots}\n`;
  zpl += `^FO${margin},${margin}^GB${Math.max(1, widthDots - (margin * 2))},${Math.max(1, heightDots - (margin * 2))},2^FS\n`;
  zpl += `^FO${centerX - crossHalf},${centerY}^GB${crossHalf * 2},1,1^FS\n`;
  zpl += `^FO${centerX},${centerY - crossHalf}^GB1,${crossHalf * 2},1^FS\n`;

  const topMarks = [10, 20, 30, 40, 50, 60, 70, 80].filter((m) => m < (labelWidthMm - 4));
  topMarks.forEach((markMm) => {
    const x = toDots(markMm);
    zpl += `^FO${x},${margin}^GB1,${tickLen},1^FS\n`;
    zpl += `^FO${x - tick},${margin + tickLen + toDots(0.4)}^A0N,${toDots(1.7)},${toDots(1.4)}^FD${markMm}^FS\n`;

    const bottomTickY = heightDots - margin - tickLen;
    const bottomLabelY = heightDots - margin - tickLen - toDots(2.2);
    zpl += `^FO${x},${bottomTickY}^GB1,${tickLen},1^FS\n`;
    zpl += `^FO${x - tick},${bottomLabelY}^A0N,${toDots(1.7)},${toDots(1.4)}^FD${markMm}^FS\n`;
  });

  const leftMarks = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
    .filter((m) => m < (labelHeightMm - 3));
  leftMarks.forEach((markMm) => {
    const y = toDots(markMm);
    zpl += `^FO${margin},${y}^GB${tickLen},1,1^FS\n`;
    zpl += `^FO${margin + tickLen + toDots(0.4)},${y - tick}^A0N,${toDots(1.6)},${toDots(1.3)}^FD${markMm}^FS\n`;

    const rightTickX = widthDots - margin - tickLen;
    const rightLabelX = widthDots - margin - tickLen - toDots(5.2);
    zpl += `^FO${rightTickX},${y}^GB${tickLen},1,1^FS\n`;
    zpl += `^FO${rightLabelX},${y - tick}^A0N,${toDots(1.6)},${toDots(1.3)}^FD${markMm}^FS\n`;
  });

  zpl += `^FO${toDots(3)},${toDots(4)}^A0N,${toDots(2.5)},${toDots(2.2)}^FDCALIB ${labelWidthMm}x${labelHeightMm}mm^FS\n`;
  zpl += `^FO${toDots(3)},${toDots(7.5)}^A0N,${toDots(2.2)},${toDots(2)}^FDMidden kruis = referentie^FS\n`;
  zpl += `^FO${toDots(3)},${bottomTextY}^A0N,${toDots(2.2)},${toDots(2)}^FDMeet L/R en B/O en geef correctie in mm op^FS\n`;
  zpl += "^PQ1,0,1,Y\n"; // print en snij calibratie label
  zpl += "^XZ";

  return applyCalibration(zpl, printer, driver);
};

const buildLabelaryPreviewUrl = ({ zpl, dpi = 203, widthMm = 90, heightMm = 40 }) => {
  // dpmm: Labelary ondersteunt 6, 8, 12, 24 (dpm = dots per mm)
  const dpmm = dpi >= 500 ? 24 : dpi >= 250 ? 12 : dpi >= 150 ? 8 : 6;
  const widthInch = (widthMm / 25.4).toFixed(2);
  const heightInch = (heightMm / 25.4).toFixed(2);
  return `https://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${widthInch}x${heightInch}/0/${encodeURIComponent(zpl)}`;
};

// Helpers voor Lotnummer generatie
const getMachineCode = (station) => {
  if (!station) return "999";
  const normalized = String(station).toUpperCase().trim();
  const baseStation = normalized.startsWith('40') ? normalized.substring(2) : normalized;
  
  const map = {
    'BH11': '411',
    'BH12': '412',
    'BH15': '415',
    'BH16': '416',
    'BH17': '417',
    'BH18': '418',
    'BH31': '431',
    'BH05': '405',
    'BH07': '407',
    'BH08': '408',
    'BH09': '409',
    'BA05': '405',
    'BA07': '417'
  };
  
  if (map[baseStation]) return map[baseStation];

  const digits = baseStation.replace(/\D/g, "");
  if (!digits) return "999";
  
  if (digits.length === 3) return digits;
  if (digits.length === 1) return `40${digits}`;
  return `4${digits.slice(-2).padStart(2, "0")}`;
};

const getIsoWeekAndYear = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return { week: String(weekNo).padStart(2, '0'), year: String(year) };
};

const LotPrintModal = ({ onClose, stations, printers, onPrint }) => {
  const [config, setConfig] = useState({
    station: stations[0] || "",
    weekOffset: 0, // -1 = vorige week, 0 = huidige week, 1 = volgende week
    startSeq: "1",
    count: "1",
    mode: 'sequential', // 'sequential' | 'identical'
    printerId: printers.find(p => p.isDefault)?.id || printers[0]?.id || ""
  });

  const parsedStartSeq = Math.max(1, Math.min(9999, parseInt(config.startSeq, 10) || 1));
  const parsedCount = Math.max(1, Math.min(100, parseInt(config.count, 10) || 1));

  const previewDate = new Date();
  previewDate.setDate(previewDate.getDate() + (Number(config.weekOffset) * 7));
  const iso = getIsoWeekAndYear(previewDate);
  const machineCode = getMachineCode(config.station);
  const baseLot = `40${iso.year.slice(-2)}${iso.week}${machineCode}40`;
  const previewLots = Array.from({ length: Math.min(5, Math.max(1, parsedCount)) }, (_, i) => {
    const seqNum = config.mode === 'sequential' ? parsedStartSeq + i : parsedStartSeq;
    return `${baseLot}${String(seqNum).padStart(4, '0')}`;
  });

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-[30px] shadow-2xl p-8 my-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
            <Hash className="text-blue-600" /> Lotnummers Printen
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Station</label>
              <select 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                value={config.station}
                onChange={e => setConfig({...config, station: e.target.value})}
              >
                {stations.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Week</label>
              <select
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                value={String(config.weekOffset)}
                onChange={e => setConfig({ ...config, weekOffset: parseInt(e.target.value, 10) || 0 })}
              >
                <option value="-1">Vorige week</option>
                <option value="0">Huidige week</option>
                <option value="1">Volgende week</option>
              </select>
              <p className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">ISO week {iso.week}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Start Volgnummer</label>
              <input 
                type="number" 
                min="1"
                max="9999"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                value={config.startSeq}
                onChange={e => setConfig({...config, startSeq: e.target.value})}
                onBlur={() => setConfig(prev => ({ ...prev, startSeq: String(parsedStartSeq) }))}
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Aantal Labels</label>
              <input 
                type="number" 
                min="1"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                value={config.count}
                onChange={e => setConfig({...config, count: e.target.value})}
                onBlur={() => setConfig(prev => ({ ...prev, count: String(parsedCount) }))}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-slate-500 mb-2 block">Print Modus</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200 flex-1">
                <input type="radio" name="mode" checked={config.mode === 'sequential'} onChange={() => setConfig({...config, mode: 'sequential'})} />
                <span className="text-sm font-bold">Oplopend</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200 flex-1">
                <input type="radio" name="mode" checked={config.mode === 'identical'} onChange={() => setConfig({...config, mode: 'identical'})} />
                <span className="text-sm font-bold">Identiek</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Printer</label>
            <select 
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
              value={config.printerId}
              onChange={e => setConfig({...config, printerId: e.target.value})}
            >
              {printers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
            </select>
          </div>

          <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 flex flex-col items-center">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest w-full text-left">Live Preview (max 5)</p>
            <div className="w-full border border-slate-200 rounded-xl overflow-hidden bg-white" style={{ maxWidth: '90mm' }}>
              {previewLots.map((lot) => (
                <div key={lot} className="w-full h-[13mm] px-2 flex items-center gap-2 border-b border-dashed border-slate-300 last:border-b-0" style={{ maxWidth: '90mm' }}>
                  <InternalQrImage value={lot} size={128} alt="QR Preview Links" className="w-8 h-8 object-contain" />
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

          <button 
            onClick={() => onPrint({
              ...config,
              startSeq: parsedStartSeq,
              count: parsedCount,
            })}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            <Printer size={20} /> Start Printopdracht
          </button>
        </div>
      </div>
    </div>
  );
};

// Tijdelijke legacy label modal (tot 30 maart)
const TempLabelModal = ({ onClose, printers, onPrint }) => {
  const { t } = useTranslation();
  const [orderStr, setOrderStr] = useState("");
  const [results, setResults] = useState([]);
  const [initialList, setInitialList] = useState([]);
  const [loadingInitialList, setLoadingInitialList] = useState(true);
  const [loading, setLoading] = useState(false);
  const [printerId, setPrinterId] = useState(printers.find(p => p.isDefault)?.id || printers[0]?.id || "");

  const normalizeText = (value) => String(value || "").toLowerCase().trim();

  useEffect(() => {
    let isMounted = true;

    const loadInitialList = async () => {
      setLoadingInitialList(true);
      try {
        const [tempSnap, planSnap, trackSnap] = await Promise.all([
          getDocs(query(collection(db, ...PATHS.TEMP_PLANNING), limit(120))),
          getDocs(query(collection(db, ...PATHS.PLANNING), limit(120))),
          getDocs(query(collection(db, ...PATHS.TRACKING), limit(120))),
        ]);

        if (!isMounted) return;

        const rows = [];
        const pushRows = (snap) => {
          snap.docs.forEach((d) => {
            const data = d.data() || {};
            rows.push({
              id: d.id,
              ...data,
              orderDisplay: data.orderId || data.Order || data.Productieorder || data.order || d.id,
              productDisplay: data.item || data.itemCode || data.Item || data.Artikel || data.description || data.Description || data.Omschrijving || "-",
            });
          });
        };

        pushRows(tempSnap);
        pushRows(planSnap);
        pushRows(trackSnap);
        console.log("📋 InitialList loaded:", rows.length, "items (temp:", tempSnap.docs.length, "plan:", planSnap.docs.length, "track:", trackSnap.docs.length, ")");

        const dedup = [];
        const seen = new Set();
        rows.forEach((r) => {
          if (seen.has(r.id)) return;
          seen.add(r.id);
          dedup.push(r);
        });

        dedup.sort((a, b) => String(a.orderDisplay).localeCompare(String(b.orderDisplay), undefined, { numeric: true }));
        setInitialList(dedup);
      } catch (err) {
        console.error("❌ Fout bij laden order labels lijst:", err);
      } finally {
        if (isMounted) setLoadingInitialList(false);
      }
    };

    loadInitialList();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSearch = async () => {
    if (!orderStr.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setResults([]);
    try {
      let searchStr = orderStr.trim().toUpperCase();
      if (searchStr.includes('/')) {
        searchStr = searchStr.split('/').filter(Boolean).pop();
      }

      let searchOptions = [searchStr];
      const digitsMatch = searchStr.match(/\d+/);
      if (digitsMatch) {
          const digits = digitsMatch[0];
          if (digits.length >= 3) {
              // Check if searchStr already starts with a prefix, if not add variations
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
      console.log("🔍 Search options:", uniqueOptions);
      const colRef = collection(db, ...PATHS.TEMP_PLANNING);
      const planRef = collection(db, ...PATHS.PLANNING);
      const trackRef = collection(db, ...PATHS.TRACKING);
      let foundDocs = new Map();
      const addDocs = (snap) => {
        if (snap && snap.docs) {
          snap.docs.forEach(d => foundDocs.set(d.id, { id: d.id, ...d.data() }));
        }
      };
      
      for (const opt of uniqueOptions) {
          try {
              const docRef = doc(db, ...PATHS.TEMP_PLANNING, opt);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) foundDocs.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
              
              const planDocRef = doc(db, ...PATHS.PLANNING, opt);
              const planDocSnap = await getDoc(planDocRef);
              if (planDocSnap.exists()) foundDocs.set(planDocSnap.id, { id: planDocSnap.id, ...planDocSnap.data() });
              
              const trackDocRef = doc(db, ...PATHS.TRACKING, opt);
              const trackDocSnap = await getDoc(trackDocRef);
              if (trackDocSnap.exists()) foundDocs.set(trackDocSnap.id, { id: trackDocSnap.id, ...trackDocSnap.data() });
          } catch {
        // Ignore missing documents
      }
      }
      
      const exactQueries = [
        getDocs(query(colRef, where("orderId", "in", uniqueOptions))),
        getDocs(query(colRef, where("Order", "in", uniqueOptions))),
        getDocs(query(colRef, where("Productieorder", "in", uniqueOptions))),
        getDocs(query(colRef, where("order", "in", uniqueOptions))),
        getDocs(query(colRef, where("itemCode", "in", uniqueOptions))),
        getDocs(query(colRef, where("Item", "in", uniqueOptions))),
        getDocs(query(colRef, where("Artikel", "in", uniqueOptions))),
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
        getDocs(query(trackRef, where("itemDescription", "in", uniqueOptions)))
      ];
      const exactSnaps = await Promise.all(exactQueries.map(p => p.catch(() => null)));
      exactSnaps.forEach(addDocs);
      console.log("📦 After exact queries, found:", foundDocs.size);

      if (foundDocs.size < 5 && searchStr.length >= 3) {
        const startOptions = [searchStr];
        if (digitsMatch && digitsMatch[0].length >= 3) {
            // Only add prefix variations if searchStr doesn't already start with a prefix
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
        console.log("📦 After range queries, found:", foundDocs.size);
      }

      const queryText = normalizeText(orderStr);
      const clientMatches = initialList.filter((item) => {
        const orderText = normalizeText(item.orderId || item.Order || item.Productieorder || item.order || item.id);
        const productText = normalizeText(item.item || item.itemCode || item.Item || item.Artikel || item.description || item.Description || item.Omschrijving);
        return orderText.includes(queryText) || productText.includes(queryText);
      });
      console.log("🔎 Client-side matches:", clientMatches.length);

      const merged = new Map();
      Array.from(foundDocs.values()).forEach((item) => merged.set(item.id, item));
      clientMatches.forEach((item) => merged.set(item.id, item));

      const finalResults = Array.from(merged.values());
      console.log("✅ Final results:", finalResults.length);
      setResults(finalResults);
    } catch (e) {
      console.error("❌ Zoekfout temp labels:", e);
      console.error("Search string was:", orderStr);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-2xl rounded-[30px] shadow-2xl p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
            <Tag className="text-amber-500" /> Legacy Order Labels
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="flex gap-2 mb-6">
          <input 
            type="text" 
            placeholder={t('printer.searchOrderPlaceholder', 'TYP ORDERNUMMER (BIJV. N20000)')}
            className="flex-1 p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold uppercase outline-none focus:border-amber-500"
            value={orderStr}
            onChange={(e) => setOrderStr(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch} disabled={loading} className="px-6 bg-slate-900 text-white rounded-2xl font-black uppercase text-sm hover:bg-slate-800 transition-all flex items-center gap-2">
            <Search size={18} /> Zoek
          </button>
        </div>

        <div className="mb-4">
          <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Printer</label>
          <select 
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
            value={printerId}
            onChange={(e) => setPrinterId(e.target.value)}
          >
            {printers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {(results.length > 0 || (!orderStr.trim() && initialList.length > 0)) && (
          <div className="space-y-2 mb-2 max-h-[48vh] overflow-y-auto custom-scrollbar pr-2">
            {(orderStr.trim() ? results : initialList).map((item, idx) => {
              const orderDisplay = item.orderId || item.Order || item.Productieorder || item.order || item.id || "-";
              const productDisplay = item.item || item.itemCode || item.Item || item.Artikel || item.description || item.Description || item.Omschrijving || "-";

              return (
                <button
                  key={`${item.id || orderDisplay}-${idx}`}
                  onClick={() => onPrint(item, printerId)}
                  className="w-full p-4 bg-white border border-slate-200 hover:border-amber-300 hover:bg-amber-50/30 rounded-2xl transition-all text-left flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-800 truncate">{orderDisplay}</p>
                    <p className="text-xs font-bold text-slate-500 truncate">{productDisplay}</p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 shrink-0">Print</span>
                </button>
              );
            })}
          </div>
        )}

        {loadingInitialList && !orderStr.trim() && (
          <p className="text-center py-8 text-slate-400 font-bold italic">Lijst laden...</p>
        )}

        {results.length === 0 && orderStr.trim() && !loading && (
          <p className="text-center py-8 text-slate-400 font-bold italic">Geen order gevonden in tijdelijke import.</p>
        )}
      </div>
    </div>
  );
};

const CalibrationModal = ({ printer, onClose, onPrint, onApply }) => {
  const [labelHeightMm, setLabelHeightMm] = useState(40);
  const [manualXMm, setManualXMm] = useState(String(parseMm(printer?.calibrationOffsetXMm, 0)));
  const [manualYMm, setManualYMm] = useState(String(parseMm(printer?.calibrationOffsetYMm, 0)));
  const [measuredLeftMm, setMeasuredLeftMm] = useState("");
  const [measuredRightMm, setMeasuredRightMm] = useState("");
  const [measuredTopMm, setMeasuredTopMm] = useState("");
  const [measuredBottomMm, setMeasuredBottomMm] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState("");

  const measuredLeft = parseMm(measuredLeftMm, NaN);
  const measuredRight = parseMm(measuredRightMm, NaN);
  const measuredTop = parseMm(measuredTopMm, NaN);
  const measuredBottom = parseMm(measuredBottomMm, NaN);
  const suggestionX = Number.isFinite(measuredLeft) && Number.isFinite(measuredRight)
    ? ((measuredRight - measuredLeft) / 2)
    : null;
  const suggestionY = Number.isFinite(measuredTop) && Number.isFinite(measuredBottom)
    ? ((measuredBottom - measuredTop) / 2)
    : null;

  const handleUseSuggestions = () => {
    if (suggestionX !== null) setManualXMm(suggestionX.toFixed(2));
    if (suggestionY !== null) setManualYMm(suggestionY.toFixed(2));
  };

  const handlePreview = () => {
    try {
      setPreviewError("");
      const previewPrinter = {
        ...printer,
        calibrationOffsetXMm: String(parseMm(manualXMm, 0)),
        calibrationOffsetYMm: String(parseMm(manualYMm, 0)),
      };
      const zpl = buildCalibrationCrossZpl({
        printer: previewPrinter,
        labelWidthMm: resolveRollWidthMm(previewPrinter),
        labelHeightMm,
      });
      const dpi = getDriver(previewPrinter).nativeDpi;
      setPreviewUrl(buildLabelaryPreviewUrl({ zpl, dpi, widthMm: resolveRollWidthMm(previewPrinter), heightMm: labelHeightMm }));
    } catch (err) {
      setPreviewError("Preview genereren mislukt: " + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-[30px] shadow-2xl p-8 my-auto">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
            <Crosshair className="text-blue-600" /> Print Calibratie - {printer?.name || "Printer"}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Calibratie Labelformaat</label>
            <select
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
              value={String(labelHeightMm)}
              onChange={(e) => setLabelHeightMm(parseInt(e.target.value, 10) || 40)}
            >
              <option value="40">90 x 40 mm</option>
              <option value="65">90 x 65 mm</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => onPrint({ labelHeightMm })}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
            >
              <Printer size={18} /> Print Kruisjes
            </button>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-3">Snel berekenen op basis van marges</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Gemeten vrije marge links (mm)</label>
              <input type="number" step="0.1" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm" value={measuredLeftMm} onChange={(e) => setMeasuredLeftMm(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Gemeten vrije marge rechts (mm)</label>
              <input type="number" step="0.1" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm" value={measuredRightMm} onChange={(e) => setMeasuredRightMm(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Gemeten vrije marge boven (mm)</label>
              <input type="number" step="0.1" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm" value={measuredTopMm} onChange={(e) => setMeasuredTopMm(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Gemeten vrije marge onder (mm)</label>
              <input type="number" step="0.1" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm" value={measuredBottomMm} onChange={(e) => setMeasuredBottomMm(e.target.value)} />
            </div>
          </div>
          {suggestionX !== null && (
            <p className="mt-3 text-sm font-bold text-blue-700">
              Suggestie X-correctie: {suggestionX > 0 ? '+' : ''}{suggestionX.toFixed(2)} mm
              <span className="text-slate-500 font-semibold"> (positief = naar rechts)</span>
            </p>
          )}
          {suggestionY !== null && (
            <p className="mt-1 text-sm font-bold text-blue-700">
              Suggestie Y-correctie: {suggestionY > 0 ? '+' : ''}{suggestionY.toFixed(2)} mm
              <span className="text-slate-500 font-semibold"> (positief = naar beneden)</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          <div>
            <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Offset X (mm)</label>
            <input type="number" step="0.1" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm" value={manualXMm} onChange={(e) => setManualXMm(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Offset Y (mm)</label>
            <input type="number" step="0.1" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm" value={manualYMm} onChange={(e) => setManualYMm(e.target.value)} />
          </div>
        </div>

        <div className="mb-5">
          <button
            onClick={handleUseSuggestions}
            disabled={suggestionX === null && suggestionY === null}
            className="px-4 py-2 bg-white border border-slate-300 rounded-lg font-black text-xs uppercase tracking-wider hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Gebruik suggesties
          </button>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-xs font-bold uppercase text-slate-500">Preview vóór printen</p>
            <button
              onClick={handlePreview}
              className="px-4 py-2 bg-white border border-slate-300 rounded-lg font-black text-xs uppercase tracking-wider hover:bg-slate-100"
            >
              Preview Genereren
            </button>
          </div>
          {previewError && <p className="mt-2 text-xs font-bold text-rose-600">{previewError}</p>}
          {previewUrl && (
            <div className="mt-3 bg-white border border-slate-200 rounded-xl p-3 overflow-auto">
              <img src={previewUrl} alt="Calibratie preview" className="max-w-full h-auto" />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-lg">Sluiten</button>
          <button
            onClick={() => onApply({
              calibrationOffsetXMm: parseMm(manualXMm, 0),
              calibrationOffsetYMm: parseMm(manualYMm, 0),
            })}
            className="px-5 py-2 bg-emerald-600 text-white font-black rounded-lg hover:bg-emerald-700"
          >
            Opslaan als Printer Offset
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminPrinterManager = () => {
  const { t } = useTranslation();
  const { showSuccess, showError, showInfo, showConfirm } = useNotifications();
  const [activeTab, setActiveTab] = useState("config"); // 'config' | 'queue-stations' | 'queue'
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [availableStations, setAvailableStations] = useState([]);
  const [selectedQueuePrinterId, setSelectedQueuePrinterId] = useState("");
  const [queueStations, setQueueStations] = useState([]);
  const [queueStationToAdd, setQueueStationToAdd] = useState("");
  const [isSavingQueueStations, setIsSavingQueueStations] = useState(false);
  const [showLotModal, setShowLotModal] = useState(false);
  const [showTempModal, setShowTempModal] = useState(false);
  const [showTestMenu, setShowTestMenu] = useState(null);
  const [calibrationPrinter, setCalibrationPrinter] = useState(null);
  const [windowsHostMode, setWindowsHostMode] = useState(false);
  const [savingWindowsHostMode, setSavingWindowsHostMode] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState(DEFAULT_PRINTER_FORM);

  // Fetch printers
  useEffect(() => {
    const unsub = onSnapshot(collection(db, ...PATHS.PRINTERS), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPrinters(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedQueuePrinterId && printers.length > 0) {
      const defaultPrinter = printers.find((p) => p.isDefault) || printers[0];
      setSelectedQueuePrinterId(defaultPrinter.id);
    }
  }, [printers, selectedQueuePrinterId]);

  // Sync huidige queue stations op basis van geselecteerde printer
  useEffect(() => {
    const selectedPrinter = printers.find((p) => p.id === selectedQueuePrinterId);
    if (!selectedPrinter) {
      setQueueStations([]);
      return;
    }
    const stations = Array.isArray(selectedPrinter.queueStations)
      ? selectedPrinter.queueStations
      : (selectedPrinter.linkedStations || []);
    setQueueStations(Array.from(new Set(stations)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
  }, [printers, selectedQueuePrinterId]);

  // Fetch stations uit factory config
  useEffect(() => {
    const unsub = onSnapshot(doc(db, ...PATHS.FACTORY_CONFIG), (snap) => {
      if (!snap.exists()) {
        setAvailableStations([]);
        return;
      }

      const data = snap.data();
      const stations = [];
      (data.departments || []).forEach(dept => {
        (dept.stations || []).forEach(s => {
          const name = String(s?.name || "").trim();
          if (name) stations.push(name);
        });
      });

      setAvailableStations(Array.from(new Set(stations)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
    }, (e) => {
      console.error("Err stations", e);
    });

    return () => unsub();
  }, []);

  // Centrale printmodus instelling (AAN/UIT) voor tijdelijke Windows print-host flow
  useEffect(() => {
    const unsub = onSnapshot(doc(db, ...PATHS.GENERAL_SETTINGS), (snap) => {
      const data = snap.data() || {};
      const cfg = data?.[PRINT_SETTINGS_KEY] || {};
      setWindowsHostMode(Boolean(cfg.windowsHostModeEnabled));
    }, (err) => {
      console.error('Windows host mode listen error:', err);
    });

    return () => unsub();
  }, []);

  const handleToggleWindowsHostMode = async () => {
    const next = !windowsHostMode;
    setSavingWindowsHostMode(true);
    try {
      await setDoc(doc(db, ...PATHS.GENERAL_SETTINGS), {
        [PRINT_SETTINGS_KEY]: {
          windowsHostModeEnabled: next,
          updatedAt: serverTimestamp(),
          updatedBy: {
            uid: auth.currentUser?.uid || null,
            email: auth.currentUser?.email || null,
          },
        },
      }, { merge: true });

      await logActivity(
        auth.currentUser?.uid,
        'SETTINGS_UPDATE',
        `Windows Print Host Mode ${next ? 'enabled' : 'disabled'}`
      );

      setWindowsHostMode(next);
      showSuccess(`Windows Print Host modus ${next ? 'AAN' : 'UIT'} gezet.`);
    } catch (err) {
      console.error('Toggle windows host mode error:', err);
      showError('Opslaan van Windows Print Host modus mislukt: ' + err.message);
    } finally {
      setSavingWindowsHostMode(false);
    }
  };

  const saveQueueStations = async (nextStations) => {
    if (!selectedQueuePrinterId) {
      showError("Kies eerst een printer.");
      return;
    }
    setIsSavingQueueStations(true);
    try {
      await updateDoc(doc(db, ...PATHS.PRINTERS, selectedQueuePrinterId), {
        queueStations: nextStations,
        updatedAt: serverTimestamp(),
      });
      await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Queue stations updated for printer ${selectedQueuePrinterId} (${nextStations.length})`);
    } catch (err) {
      console.error("Queue stations save error:", err);
      showError("Opslaan queue stations mislukt: " + err.message);
    } finally {
      setIsSavingQueueStations(false);
    }
  };

  const handleAddQueueStation = async () => {
    const station = queueStationToAdd.trim();
    if (!station) return;
    if (queueStations.includes(station)) {
      setQueueStationToAdd("");
      return;
    }
    const next = [...queueStations, station].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    setQueueStations(next);
    setQueueStationToAdd("");
    await saveQueueStations(next);
  };

  const handleRemoveQueueStation = async (station) => {
    const next = queueStations.filter(s => s !== station);
    setQueueStations(next);
    await saveQueueStations(next);
  };

  // Network status checks removed as we focus on USB/Queue

  const handleSave = async () => {
    if (!formData.name) return showError(t('adminPrinterManager.nameRequired'));
    if (normalizePrinterType(formData.type) === CONNECTION_TYPES.NETWORK && !String(formData.ip || '').trim()) {
      return showError('IP adres is verplicht voor netwerkprinters.');
    }

    try {
      const normalizedRollWidth = String(Math.max(20, resolveRollWidthMm(formData)));
      const parsedSpeed = parseInt(formData.speed, 10);
      const normalizedSpeed = String(Number.isFinite(parsedSpeed) ? Math.min(14, Math.max(1, parsedSpeed)) : 3);
      const payload = {
        ...formData,
        rollWidthMm: normalizedRollWidth,
        speed: normalizedSpeed,
        rollType: normalizeRollType(formData.rollType),
        // Legacy compat: bestaand veld blijft gevuld voor oude flows.
        width: normalizedRollWidth,
      };

      // Als deze default wordt, zet anderen uit
      if (formData.isDefault) {
        const updates = printers
          .filter(p => p.isDefault && p.id !== editingId)
          .map(p => updateDoc(doc(db, ...PATHS.PRINTERS, p.id), { isDefault: false }));
        await Promise.all(updates);
      }

      if (editingId) {
        await updateDoc(doc(db, ...PATHS.PRINTERS, editingId), {
          ...payload,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, ...PATHS.PRINTERS), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }

      await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Printer saved: ${formData.name}`);

      setIsAdding(false);
      setEditingId(null);
      setFormData(DEFAULT_PRINTER_FORM);
    } catch (err) {
      console.error("Error saving printer:", err);
      showError(t('adminPrinterManager.saveError') + err.message);
    }
  };

  const getQueueMetadataBase = (printer) => ({
    source: 'admin-printer-manager',
    targetPrinterName: printer?.name || 'Onbekende printer',
    protocol: (printer?.protocol || 'zpl').toLowerCase(),
    stationId: 'ADMIN'
  });

  const handleDelete = async (id) => {
    const confirmed = await showConfirm({
      title: t('adminPrinterManager.deletePrinterTitle', 'Printer verwijderen'),
      message: t('adminPrinterManager.confirmDeletePrinter'),
      confirmText: t('common.delete', 'Verwijderen'),
      cancelText: t('common.cancel', 'Annuleren'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, ...PATHS.PRINTERS, id));
      await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Printer deleted: ${id}`);
    } catch (err) {
      console.error("Error deleting:", err);
    }
  };

  const handleSetDefault = async (id) => {
    try {
      // Zet alle anderen op false
      const updates = printers.map(p => 
        updateDoc(doc(db, ...PATHS.PRINTERS, p.id), { 
          isDefault: p.id === id 
        })
      );
      await Promise.all(updates);
      await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Printer default set to: ${id}`);
    } catch (err) {
      console.error("Error setting default:", err);
    }
  };

  const handleApplyCalibration = async (printer, payload) => {
    if (!printer?.id) return;
    try {
      await updateDoc(doc(db, ...PATHS.PRINTERS, printer.id), {
        calibrationOffsetXMm: String(payload.calibrationOffsetXMm ?? 0),
        calibrationOffsetYMm: String(payload.calibrationOffsetYMm ?? 0),
        updatedAt: serverTimestamp(),
      });
      await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Printer calibration updated: ${printer.name}`);
      showSuccess(`Calibratie opgeslagen voor ${printer.name}.`);
      setCalibrationPrinter(null);
      setShowTestMenu(null);
    } catch (err) {
      console.error("Calibration save error:", err);
      showError("Calibratie opslaan mislukt: " + err.message);
    }
  };

  const handleCalibrationPrint = async (printer, { labelHeightMm }) => {
    if (!printer) return;
    try {
      const rollWidthMm = resolveRollWidthMm(printer);
      const zpl = buildCalibrationCrossZpl({ printer, labelWidthMm: rollWidthMm, labelHeightMm });
      const result = await sendPrintJob(printer, zpl, {
        description: `Calibratieprint ${rollWidthMm}x${labelHeightMm}mm`,
        width: rollWidthMm,
        height: labelHeightMm
      }, { allowQueueFallback: false });
      showSuccess(
        result.mode === 'queue'
          ? `Calibratieprint in wachtrij gezet voor ${printer.name}.`
          : `Calibratieprint ${rollWidthMm}x${labelHeightMm}mm verzonden naar ${printer.name}.`
      );
      setCalibrationPrinter(null);
      setShowTestMenu(null);
    } catch (err) {
      showError("Calibratie print mislukt: " + err.message);
    }
  };

  // Print dispatch: WebUSB direct voor webusb-printers, anders via wachtrij.
  const sendPrintJob = async (printerData, printContent, metadata = {}, options = {}) => {
    const { allowQueueFallback = true } = options;
    const printerType = normalizePrinterType(printerData?.type);

    if (printerType === CONNECTION_TYPES.WEBUSB) {
      if (!isUsbDirectSupported()) {
        throw new Error('WebUSB wordt niet ondersteund in deze browser.');
      }

      try {
        await printRawUsb({ content: printContent, printer: printerData || {} });
        return { mode: 'webusb' };
      } catch (err) {
        console.error("USB print error:", err);
        const message = String(err?.message || "");
        const isAccessIssue = err?.name === 'SecurityError' || /access denied|permission|toegang/i.test(message);
        const isClaimIssue = /claiminterface|claim interface|unable to claim/i.test(message);

        // Praktische fallback: als WebUSB-interface bezet is (veelvoorkomend op Windows/Zadig),
        // stuur dezelfde opdracht naar de queue zodat printen toch doorgaat.
        if (allowQueueFallback && (isAccessIssue || isClaimIssue) && printerData?.id) {
          await queuePrintJob(printerData.id, printContent, {
            ...getQueueMetadataBase(printerData),
            ...metadata,
            fallbackReason: isClaimIssue ? 'webusb-claim-interface' : 'webusb-access'
          });
          return { mode: 'queue' };
        }

        if (!allowQueueFallback && (isAccessIssue || isClaimIssue)) {
          throw new Error(
            "Directe testprint mislukt: USB-interface is bezet of toegang geweigerd. Sluit andere USB-sessies en probeer opnieuw (zonder wachtrij-fallback).",
            { cause: err }
          );
        }

        if (isAccessIssue) {
          throw new Error(
            "USB toegang geweigerd. Controleer browserrechten en of de printer door een ander systeemproces/driver is bezet. " +
            "Op Windows kan dit door de systeemdriver komen; op Chromebook vaak door geweigerde USB-permissie of een bezette interface.",
            { cause: err }
          );
        }
        throw new Error(`USB print mislukt: ${message || 'onbekende fout'}`, { cause: err });
      }
    }

    if (!allowQueueFallback) {
      throw new Error('Deze test gebruikt alleen directe USB-print en mag niet naar de wachtrij. Kies een WebUSB-printer.');
    }

    if (!printerData?.id) {
      throw new Error('Geen geldige printer-ID voor wachtrijprint.');
    }

    await queuePrintJob(printerData.id, printContent, {
      ...getQueueMetadataBase(printerData),
      ...metadata
    });
    return { mode: 'queue' };
  };

  const handleBulkLotPrint = async (config) => {
    const printer = printers.find(p => p.id === config.printerId);
    if (!printer) return showError("Selecteer een printer.");

    const lotDate = new Date();
    lotDate.setDate(lotDate.getDate() + (Number(config.weekOffset) * 7));
    const iso = getIsoWeekAndYear(lotDate);
    const machineCode = getMachineCode(config.station);
    const baseLot = `40${iso.year.slice(-2)}${iso.week}${machineCode}40`;

    const driver = getDriver(printer);
    const darkness = printer.darkness ? parseInt(printer.darkness) : driver.defaultDarkness;
    const printSpeed = printer.speed ? parseInt(printer.speed, 10) : driver.defaultSpeed;
    const dotsPerMm = driver.dotsPerMm;
    const rollWidthMm = resolveRollWidthMm(printer);

    const lots = [];
    for (let i = 0; i < config.count; i++) {
      const seqNum = config.mode === 'sequential' ? config.startSeq + i : config.startSeq;
      lots.push(`${baseLot}${String(seqNum).padStart(4, '0')}`);
    }

    let batchData = "";
    const labelH = 13; // mm
    const gapH = 2; // mm
    const qrCellWidth = 3; // ~8x8mm op 203dpi
    const qrY = Math.round(2.5 * dotsPerMm);
    const leftQrX = Math.round(2 * dotsPerMm);
    const qrSizeMm = 8;
    const leftMarginMm = 2;
    const rightMarginMm = 2;
    const gapAfterQrMm = 2;
    const textY = Math.round(4 * dotsPerMm);
    const fontHeightDots = Math.round(6 * dotsPerMm); // hoogte
    const fontWidthDots = Math.round(7 * dotsPerMm); // ruimer opgezet
    const lotChars = 15;
    const textAreaStartDots = Math.round((leftMarginMm + qrSizeMm + gapAfterQrMm) * dotsPerMm);
    const textAreaWidthDots = Math.round((rollWidthMm - rightMarginMm - (leftMarginMm + qrSizeMm + gapAfterQrMm)) * dotsPerMm);
    const estimatedTextWidthDots = lotChars * fontWidthDots;
    const textX = Math.max(
      textAreaStartDots,
      textAreaStartDots + Math.round((textAreaWidthDots - estimatedTextWidthDots) / 2)
    );

    batchData += `SIZE ${rollWidthMm} mm,${labelH} mm\r\nGAP ${gapH} mm,0 mm\r\nDENSITY ${darkness}\r\nSPEED ${printSpeed}\r\nDIRECTION 0,0\r\n`;
    lots.forEach((lot) => {
      batchData += `CLS\r\n`;
      batchData += `QRCODE ${leftQrX},${qrY},L,${qrCellWidth},A,0,M2,S3,"${lot}"\r\n`;
      batchData += `TEXT ${textX},${textY},"ARIAL.TTF",0,${fontWidthDots},${fontHeightDots},"${lot}"\r\n`;
      batchData += `BAR ${Math.round(2 * dotsPerMm)},${Math.round(12.4 * dotsPerMm)},${Math.round(86 * dotsPerMm)},1\r\n`;
      batchData += `PRINT 1,1\r\n`;
    });
    // Altijd 1 knipopdracht na de volledige batch (4, 10, 100, ...)
    batchData += `CUT\r\n`;
    batchData = applyCalibration(batchData, printer, getDriver(printer));

    try {
      const result = await sendPrintJob(printer, batchData, {
        description: `Lotnummer batch (${config.count})`,
        quantity: Number(config.count) || 1
      });
      showSuccess(
        result.mode === 'queue'
          ? `${config.count} labels in wachtrij gezet voor ${printer.name}.`
          : `${config.count} labels verzonden naar ${printer.name}.`
      );
      setShowLotModal(false);
    } catch (e) {
      showError(`Print via ${printer.name} mislukt: ${e.message}`);
    }
  };

  const handleTempLegacyPrint = async (orderData, targetPrinterId) => {
    const printer = printers.find(p => p.id === targetPrinterId);
    if (!printer) return showError("Printer niet gevonden.");
    
    const driver = getDriver(printer);
    const darkness = printer.darkness ? parseInt(printer.darkness) : driver.defaultDarkness;
    const printSpeed = printer.speed ? parseInt(printer.speed, 10) : driver.defaultSpeed;
    const dotsPerMm = driver.dotsPerMm;
    
    const order = orderData.Order || orderData.Productieorder || "ONBEKEND";
    const item = orderData.Item || orderData.Artikel || "";
    const desc = orderData.Description || orderData.Omschrijving || "";
    
    // Tijdelijk basis ZPL zonder verplichte lotnummers
    // Pas dit eventueel later aan via de LabelDesigner
    const qrMag = Math.max(2, Math.round(4 * driver.nativeDpi / 203));
    let zpl = `^XA
^PW${Math.round(90 * dotsPerMm)}
~SD${darkness}
^PR${printSpeed}
^FO${Math.round(5 * dotsPerMm)},${Math.round(5 * dotsPerMm)}^A0N,${Math.round(8 * dotsPerMm)},${Math.round(6 * dotsPerMm)}^FDOrder: ${order}^FS
^FO${Math.round(5 * dotsPerMm)},${Math.round(15 * dotsPerMm)}^A0N,${Math.round(6 * dotsPerMm)},${Math.round(5 * dotsPerMm)}^FDItem: ${item}^FS
^FO${Math.round(5 * dotsPerMm)},${Math.round(25 * dotsPerMm)}^A0N,${Math.round(5 * dotsPerMm)},${Math.round(4 * dotsPerMm)}^FD${desc.substring(0, 40)}^FS
^FO${Math.round(60 * dotsPerMm)},${Math.round(5 * dotsPerMm)}^BQN,2,${qrMag}^FDQA,${order}^FS
^XZ`;
    zpl = applyCalibration(zpl, printer, driver);

    try {
      const result = await sendPrintJob(printer, zpl, {
        description: `Legacy label voor ${order}`,
        orderId: order
      });
      showSuccess(
        result.mode === 'queue'
          ? `Legacy label voor ${order} in wachtrij gezet voor ${printer.name}`
          : `Legacy label voor ${order} verzonden naar ${printer.name}`
      );
    } catch (e) {
      showError("Print Fout: " + e.message);
    }
  };

  const handlePairUsb = async () => {
    if (normalizePrinterType(formData.type) !== CONNECTION_TYPES.WEBUSB) {
      showInfo('USB koppelen is alleen nodig bij verbindingstype WebUSB / Zadig.');
      return;
    }

    try {
      const device = await navigator.usb.requestDevice({ filters: [] });
      setFormData(prev => ({
        ...prev,
        vendorId: device.vendorId,
        productId: device.productId,
        deviceName: device.productName || "USB Printer"
      }));
    } catch (err) {
      console.error("Pairing error:", err);
      if (err.name !== 'NotFoundError') {
          showError("Koppelen geannuleerd of mislukt: " + err.message);
      }
    }
  };

  const handleUsbResetReconnect = async () => {
    if (normalizePrinterType(formData.type) !== CONNECTION_TYPES.WEBUSB) {
      showInfo('USB reset is alleen beschikbaar voor WebUSB / Zadig.');
      return;
    }

    try {
      const vendorId = parseUsbId(formData.vendorId);
      const productId = parseUsbId(formData.productId);

      // Sluit bestaande browser-USB sessies zodat reconnect schoon kan starten.
      const devices = await navigator.usb.getDevices();
      const matching = devices.filter((d) => {
        if (vendorId && productId) return d.vendorId === vendorId && d.productId === productId;
        if (vendorId) return d.vendorId === vendorId;
        return true;
      });

      for (const d of matching) {
        try {
          if (d.opened) await d.close();
        } catch {
          // best effort close
        }
      }

      const device = await requestUsbDevice({ vendorId, productId });
      setFormData(prev => ({
        ...prev,
        vendorId: device.vendorId,
        productId: device.productId,
        deviceName: device.productName || 'USB Printer',
      }));

      showSuccess(`USB opnieuw gekoppeld: ${device.productName || 'Onbekende printer'}`);
    } catch (err) {
      console.error('USB reset/reconnect error:', err);
      if (err?.name !== 'NotFoundError') {
        showError('USB reset/reconnect mislukt: ' + (err?.message || 'onbekende fout'));
      }
    }
  };

  const buildProtocolTestPayload = (printer, { lengthMm = 50, title = 'TEST PRINT' } = {}) => {
    const protocol = (printer?.protocol || "zpl").toLowerCase();
    const testDriver = getDriver(printer);
    const dpi = testDriver.nativeDpi;
    const darkness = printer?.darkness ? parseInt(printer.darkness, 10) : testDriver.defaultDarkness;
    const printSpeed = printer?.speed ? parseInt(printer.speed, 10) : testDriver.defaultSpeed;
    const widthMm = resolveRollWidthMm(printer);
    const rollType = normalizeRollType(printer?.rollType);
    const widthDots = Math.round(widthMm * testDriver.dotsPerMm);
    const heightDots = Math.round(lengthMm * testDriver.dotsPerMm);

    if (protocol === 'tspl') {
      return [
        `SIZE ${widthMm} mm,${lengthMm} mm`,
        rollType === 'continuous' ? 'GAP 0 mm,0 mm' : 'GAP 2 mm,0 mm',
        `DENSITY ${darkness}`,
        `SPEED ${printSpeed}`,
        'DIRECTION 0,0',
        'CLS',
        `TEXT 24,20,"3",0,1,1,"${title}"`,
        `TEXT 24,55,"2",0,1,1,"${printer.name || 'PRINTER'}"`,
        `TEXT 24,85,"2",0,1,1,"${dpi} DPI"`,
        'BAR 20,115,640,2',
        'PRINT 1,1'
      ].join('\r\n') + '\r\n';
    }

    if (protocol === 'epl') {
      return [
        'N',
        `q${widthDots}`,
        `Q${heightDots},24`,
        `D${Math.max(1, Math.min(15, Math.round(darkness / 2)))}`,
        `A20,20,0,4,1,1,N,"${title}"`,
        `A20,70,0,3,1,1,N,"${printer.name || 'PRINTER'}"`,
        `A20,105,0,2,1,1,N,"${dpi} DPI"`,
        `LO20,140,${Math.max(100, widthDots - 40)},2`,
        'P1'
      ].join('\n') + '\n';
    }

    // ZPL/default: bewust zonder QR voor maximale firmware-compatibiliteit.
    let zpl = `^XA
~SD${darkness}
^PR${printSpeed}
^PW${widthDots}
^LL${heightDots}
^FO20,20^GB${Math.max(100, widthDots - 40)},${Math.max(60, heightDots - 40)},2^FS
^FO40,45^A0N,42,34^FD${title}^FS
^FO40,95^A0N,30,24^FD${printer.name || 'PRINTER'}^FS
^FO40,130^A0N,28,22^FD${dpi} DPI^FS
^XZ`;

    return applyCalibration(zpl, printer, getDriver(printer));
  };

  const handleTestPrint = async (printer) => {
    const payload = buildProtocolTestPayload(printer, { lengthMm: 50, title: 'TEST PRINT' });
    setShowTestMenu(null);

    try {
      const result = await sendPrintJob(printer, payload, {
        description: `Testprint 90x50mm (${printer?.name || 'printer'})`
      }, { allowQueueFallback: false });
      showSuccess(
        result.mode === 'queue'
          ? `Testprint in wachtrij gezet voor ${printer.name}.`
          : t('adminPrinterManager.usbDirectPrintSent')
      );
    } catch (err) {
      showError("USB Print Fout: " + err.message);
    }
  };

  const handleLengthTestPrint = async (printer, lengthMm) => {
    const payload = buildProtocolTestPayload(printer, {
      lengthMm,
      title: `TEST ${lengthMm}MM`,
    });
    setShowTestMenu(null);

    try {
      const result = await sendPrintJob(printer, payload, {
        description: `Lengte testprint ${lengthMm}mm (${printer?.name || 'printer'})`,
        height: lengthMm
      }, { allowQueueFallback: false });
      showSuccess(
        result.mode === 'queue'
          ? `Testlabel van ${lengthMm}mm in wachtrij gezet voor ${printer.name}.`
          : `Testlabel van ${lengthMm}mm verzonden naar ${printer.name}.`
      );
    } catch (err) {
      showError("Test Print Fout: " + err.message);
    }
  };

  const handlePrintA4QrPdf = async () => {
    const qrContent = 'FPI-ACTION-APPROVE-OK';
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    const doc = new jsPDF('p', 'mm', 'a4');
    const qrSize = 100; // 10cm in mm
    const pageWidth = 210;
    const pageHeight = 297;
    const x = (pageWidth - qrSize) / 2;
    const y = (pageHeight - qrSize) / 2 - 20; // Iets hoger dan het midden

    try {
      const qrDataUrl = await QRCode.toDataURL(qrContent, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 1200,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      doc.addImage(qrDataUrl, 'PNG', x, y, qrSize, qrSize);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('SCAN: OK / GEREED', pageWidth / 2, y + qrSize + 15, { align: 'center' });

      const blob = doc.output('blob');
      const blobUrl = URL.createObjectURL(blob);

      if (popup) {
        popup.location.href = blobUrl;
      } else {
        doc.save('OK-QR-A4.pdf');
        showInfo('Pop-up geblokkeerd, PDF is gedownload als bestand.');
      }

      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err) {
      if (popup && !popup.closed) popup.close();
      console.error('A4 QR PDF error:', err);
      showError('A4 PDF genereren mislukt: ' + (err?.message || 'onbekende fout'));
    }
  };

  const handleEdit = (printer) => {
    setFormData({
      name: printer.name || "",
      ip: printer.ip || "",
      port: printer.port || "9100",
      protocol: printer.protocol || "zpl",
      dpi: printer.dpi || "203",
      width: String(resolveRollWidthMm(printer)),
      height: printer.height || "50",
      rollWidthMm: String(resolveRollWidthMm(printer)),
      rollType: normalizeRollType(printer.rollType),
      darkness: printer.darkness || "15",
      speed: printer.speed || String(getDriver(printer).defaultSpeed),
      linkedStations: printer.linkedStations || [],
      type: normalizePrinterType(printer.type),
      isDefault: printer.isDefault || false,
      vendorId: printer.vendorId ?? null,
      productId: printer.productId ?? null,
      deviceName: printer.deviceName || "",
      calibrationOffsetXMm: String(parseMm(printer.calibrationOffsetXMm, 0)),
      calibrationOffsetYMm: String(parseMm(printer.calibrationOffsetYMm, 0)),
      driverModel: printer.driverModel || "",
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
            onClick={() => setShowTempModal(true)}
            className="bg-amber-500 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-amber-600 transition-all shadow-sm"
          >
            <Tag size={16} /> Order Labels
          </button>
          <button
            onClick={() => setShowLotModal(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-purple-700 transition-all"
          >
            <Hash size={16} /> Lotnummers
          </button>
          <button 
            onClick={handlePrintA4QrPdf}
            className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-emerald-700 transition-all"
          >
            <QrCode size={16} /> Print 'OK' QR (A4)
          </button>
          <button 
            onClick={() => {
              setEditingId(null);
              setFormData(DEFAULT_PRINTER_FORM);
              setIsAdding(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-blue-700 transition-all"
          >
            <Plus size={16} /> {t('common.newPrinter')}
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-2 border-b border-slate-200 pb-1 mb-6">
        <button
          onClick={() => setActiveTab("config")}
          className={`px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 ${
            activeTab === "config" ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <Printer size={16} /> Printer Config
        </button>
        <button
          onClick={() => setActiveTab("queue-stations")}
          className={`px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 ${
            activeTab === "queue-stations" ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <MapPin size={16} /> Queue Stations
        </button>
        <button
          onClick={() => setActiveTab("queue")}
          className={`px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 ${
            activeTab === "queue" ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <List size={16} /> Print Wachtrij
        </button>
      </div>

      {activeTab === "config" && (
      <>
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Tijdelijke Pilot Modus</p>
            <h3 className="text-base font-black text-slate-800 uppercase flex items-center gap-2">
              <Server size={16} /> Windows Print Host
            </h3>
            <p className="text-sm text-slate-500 font-semibold mt-1">
              Schakel hier centraal tussen bestaande USB/WebUSB flow en tijdelijke Windows-printerdialoog flow (op de host-pc).
            </p>
          </div>
          <button
            onClick={handleToggleWindowsHostMode}
            disabled={savingWindowsHostMode}
            className={`px-4 py-2 rounded-xl font-black uppercase text-xs tracking-widest transition-all border-2 disabled:opacity-60 disabled:cursor-not-allowed ${
              windowsHostMode
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-slate-600 border-slate-300 hover:border-amber-300'
            }`}
          >
            {savingWindowsHostMode ? 'Opslaan...' : (windowsHostMode ? 'Windows Host AAN' : 'Windows Host UIT')}
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
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: normalizePrinterType(e.target.value)})}
                >
                  <option value={CONNECTION_TYPES.WEBUSB}>WebUSB / Zadig</option>
                  <option value={CONNECTION_TYPES.WINDOWS_HOST}>Direct via Windows Host</option>
                  <option value={CONNECTION_TYPES.NETWORK}>Netwerk (IP)</option>
                </select>
              </div>
              
              {normalizePrinterType(formData.type) === CONNECTION_TYPES.WEBUSB && (
                  <div className="mt-2 p-3 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-500 italic flex flex-col justify-center">
                  <div className="flex items-center justify-between gap-2">
                        <span>{formData.deviceName ? `Gekoppeld: ${formData.deviceName}` : "Directe USB Print"}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={handlePairUsb} className="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-blue-50 text-blue-600 font-bold flex items-center gap-1">
                        <Usb size={14} />
                        {formData.vendorId ? "Opnieuw Koppelen" : "Koppel Printer"}
                      </button>
                      <button onClick={handleUsbResetReconnect} className="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-amber-50 text-amber-700 font-bold">
                        USB Reset + Reconnect
                      </button>
                    </div>
                    </div>
                  </div>
              )}

              {normalizePrinterType(formData.type) === CONNECTION_TYPES.WINDOWS_HOST && (
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm font-semibold text-amber-800">
                  Deze printer gebruikt de Windows-printer op de host-pc via de printwachtrij/browserdialoog.
                </div>
              )}

              {normalizePrinterType(formData.type) === CONNECTION_TYPES.NETWORK && (
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">IP Adres</label>
                    <input
                      type="text"
                      placeholder="Bijv. 192.168.1.120"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500"
                      value={formData.ip}
                      onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Poort</label>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: e.target.value || '9100' })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('adminPrinterManager.protocol')}</label>
              <select
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                value={formData.protocol}
                onChange={e => setFormData({...formData, protocol: e.target.value})}
              >
                {PRINTER_PROTOCOLS.map(protocol => (
                  <option key={protocol} value={protocol}>{t(`adminPrinterManager.protocol${protocol.toUpperCase()}`)}</option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:col-span-2">
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('adminPrinterManager.dpi')}</label>
                    <select className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold" value={formData.dpi} onChange={e => setFormData({...formData, dpi: e.target.value})}>
                        <option value="203">203 DPI</option>
                        <option value="300">300 DPI</option>
                        <option value="600">600 DPI</option>
                    </select>
                </div>
                <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Rol Breedte (mm)</label>
                <input
                  type="number"
                  min="20"
                  step="1"
                  className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold"
                  placeholder="90"
                  value={formData.rollWidthMm}
                  onChange={e => setFormData({ ...formData, rollWidthMm: e.target.value, width: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Rol Type</label>
                <select
                  className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold"
                  value={normalizeRollType(formData.rollType)}
                  onChange={e => setFormData({ ...formData, rollType: normalizeRollType(e.target.value) })}
                >
                  <option value="gap">Stickerrol met onderbreking (GAP)</option>
                  <option value="continuous">Continue rol</option>
                  <option value="mark">Black mark rol</option>
                </select>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('adminPrinterManager.darkness')}</label>
                    <input type="number" min="0" max="30" className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold" value={formData.darkness} onChange={e => setFormData({...formData, darkness: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Speed (ips)</label>
                  <input type="number" min="1" max="14" className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold" value={formData.speed} onChange={e => setFormData({...formData, speed: e.target.value})} />
                </div>
            </div>

            {/* Driver Model Selector */}
            <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Driver Model</label>
                <select
                    className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold"
                    value={formData.driverModel}
                    onChange={e => {
                        const driverKey = e.target.value;
                        const driverDef = PRINTER_DRIVERS[driverKey];
                        // Sync DPI en darkness automatisch mee als driver gekozen wordt
                        setFormData({
                            ...formData,
                            driverModel: driverKey,
                            ...(driverDef ? {
                                dpi: String(driverDef.nativeDpi),
                                darkness: String(driverDef.defaultDarkness),
                              speed: String(driverDef.defaultSpeed),
                            } : {})
                        });
                    }}
                >
                    <option value="">— Automatisch detecteren (op naam/DPI) —</option>
                    {Object.values(PRINTER_DRIVERS).map(d => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                </select>
                <p className="text-[9px] text-slate-400 mt-1">
                    Selecteer een driver voor correcte DPI, cut-commando en backfeed-gedrag. Laat leeg voor automatische detectie op naamhint.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:col-span-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Calibratie X Offset (mm)</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold"
                  value={formData.calibrationOffsetXMm}
                  onChange={e => setFormData({ ...formData, calibrationOffsetXMm: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Calibratie Y Offset (mm)</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold"
                  value={formData.calibrationOffsetYMm}
                  onChange={e => setFormData({ ...formData, calibrationOffsetYMm: e.target.value })}
                />
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
            <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-lg">{t('common.cancel')}</button>
            <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center gap-2">
              <Save size={16} /> {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {showLotModal && (
        <LotPrintModal onClose={() => setShowLotModal(false)} stations={availableStations} printers={printers} onPrint={handleBulkLotPrint} />
      )}

      {showTempModal && (
        <TempLabelModal onClose={() => setShowTempModal(false)} printers={printers} onPrint={handleTempLegacyPrint} />
      )}

      {calibrationPrinter && (
        <CalibrationModal
          printer={calibrationPrinter}
          onClose={() => setCalibrationPrinter(null)}
          onPrint={(cfg) => handleCalibrationPrint(calibrationPrinter, cfg)}
          onApply={(payload) => handleApplyCalibration(calibrationPrinter, payload)}
        />
      )}

      <div className="grid gap-4">
        {printers.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-400 italic">{t('adminPrinterManager.noPrintersConfigured')}</div>
        )}
        
        {printers.map(printer => (
          (() => {
            const printerType = normalizePrinterType(printer.type);
            const iconColors = printerType === CONNECTION_TYPES.NETWORK
              ? 'bg-blue-50 text-blue-600'
              : printerType === CONNECTION_TYPES.WINDOWS_HOST
                ? 'bg-amber-50 text-amber-600'
                : 'bg-orange-50 text-orange-600';

            return (
          <div key={printer.id} className={`bg-white p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${printer.isDefault ? 'border-emerald-400 shadow-sm' : 'border-slate-100'}`}>
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${iconColors}`}>
                <Printer size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-slate-800">{printer.name}</h3>
                  {printer.isDefault && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase rounded-md border border-emerald-200">{t('adminPrinterManager.default', 'Standaard')}</span>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-400 font-mono mt-0.5">
                  {printerType === CONNECTION_TYPES.WEBUSB && (printer.deviceName ? `USB: ${printer.deviceName}` : "WebUSB / Zadig")}
                  {printerType === CONNECTION_TYPES.WINDOWS_HOST && "Windows Host Print"}
                  {printerType === CONNECTION_TYPES.NETWORK && (printer.ip ? `IP: ${printer.ip}:${printer.port || '9100'}` : "Netwerk printer (IP nog leeg)")}
                  {printer.dpi && <span className="ml-2 opacity-60 text-[10px]">({printer.dpi} DPI)</span>}
                </p>
                <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase">
                  {t('adminPrinterManager.protocol')}: {((printer.protocol || 'zpl')).toUpperCase()} | {getConnectionLabel(printer.type)}
                </p>
                <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase">
                  Calibratie: X {parseMm(printer.calibrationOffsetXMm, 0)}mm | Y {parseMm(printer.calibrationOffsetYMm, 0)}mm
                </p>
                <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase">
                  Rol: {resolveRollWidthMm(printer)}mm | Type: {normalizeRollType(printer.rollType)}
                </p>
                <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase">
                  Print: Darkness {printer.darkness || getDriver(printer).defaultDarkness} | Speed {printer.speed || getDriver(printer).defaultSpeed} ips
                </p>
                <p className="text-[10px] text-slate-400 mt-1 flex flex-wrap gap-1">
                    {printer.linkedStations && printer.linkedStations.length > 0 
                        ? printer.linkedStations.map(s => <span key={s} className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{s}</span>)
                        : <span className="italic opacity-50">{t('adminPrinterManager.noSpecificStations')}</span>}
                </p>
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
              <div className="relative">
                <button 
                  onClick={() => setShowTestMenu(printer.id === showTestMenu ? null : printer.id)}
                  disabled={printerType !== CONNECTION_TYPES.WEBUSB}
                  className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title={printerType === CONNECTION_TYPES.WEBUSB ? t('adminPrinterManager.testPrint') : 'Testprint is alleen beschikbaar voor WebUSB/Zadig printers'}
                >
                  <Play size={18} />
                </button>
                {showTestMenu === printer.id && (
                  <div className="absolute right-0 bottom-full mb-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-10 py-1">
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase">Test Lengtes</div>
                    <button onClick={() => handleLengthTestPrint(printer, 25)} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">Test 90x25mm</button>
                    <button onClick={() => handleLengthTestPrint(printer, 50)} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">Test 90x50mm</button>
                    <button onClick={() => handleLengthTestPrint(printer, 100)} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">Test 90x100mm</button>
                    <div className="h-px bg-slate-100 my-1"></div>
                    <button onClick={() => handleTestPrint(printer)} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">Standaard Testlabel</button>
                    <button onClick={() => { setShowTestMenu(null); setCalibrationPrinter(printer); }} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">Calibratie print + offsets</button>
                  </div>
                )}
              </div>
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
            );
          })()
        ))}
      </div>
      </>
      )}

      {activeTab === "queue-stations" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-black text-slate-800 uppercase mb-1">Queue Stations</h3>
          <p className="text-sm text-slate-500 font-semibold mb-4">
            Koppel stations per printer voor Print Stations en Print Wachtrij. Stations komen uit factory config.
          </p>

          <div className="mb-4">
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Printer</label>
            <select
              value={selectedQueuePrinterId}
              onChange={(e) => {
                setSelectedQueuePrinterId(e.target.value);
                setQueueStationToAdd("");
              }}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
              disabled={printers.length === 0 || isSavingQueueStations}
            >
              {printers.length === 0 && <option value="">Geen printers</option>}
              {printers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <select
              value={queueStationToAdd}
              onChange={(e) => setQueueStationToAdd(e.target.value)}
              className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
              disabled={availableStations.length === 0 || isSavingQueueStations || !selectedQueuePrinterId}
            >
              <option value="">Selecteer station uit factory config...</option>
              {availableStations
                .filter((s) => !queueStations.includes(s))
                .map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
            </select>
            <button
              onClick={handleAddQueueStation}
              disabled={!queueStationToAdd || isSavingQueueStations || !selectedQueuePrinterId}
              className="px-4 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingQueueStations ? "Opslaan..." : "Toevoegen"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {queueStations.length === 0 && (
              <p className="text-sm text-slate-400 italic">Nog geen queue stations geselecteerd.</p>
            )}
            {queueStations.map((station) => (
              <span key={station} className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border border-blue-200">
                {station}
                <button
                  onClick={() => handleRemoveQueueStation(station)}
                  className="hover:text-blue-900"
                  disabled={isSavingQueueStations}
                  title="Verwijderen"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {activeTab === "queue" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <PrintQueueAdminView />
        </div>
      )}
    </div>
  );
};

export default AdminPrinterManager;