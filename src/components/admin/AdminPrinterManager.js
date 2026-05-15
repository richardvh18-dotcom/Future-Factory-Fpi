import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { Printer, Plus, Trash2, Save, CheckCircle2, Play, X, MapPin, Edit, Usb, List, Server, QrCode, Hash, Tag, Search, Crosshair } from "lucide-react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, setDoc, serverTimestamp, getDoc, getDocs, query, where, limit, documentId } from "firebase/firestore";
import { useNotifications } from "../../contexts/NotificationContext";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { isUsbDirectSupported, requestUsbDevice, printRawUsb } from "../../utils/usbPrintService";
// Parse USB ID strings (e.g., "1234" or "0x1234") to numbers
const parseUsbId = (idStr) => {
    if (!idStr)
        return undefined;
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
    if (type === 'zebra_local')
        return CONNECTION_TYPES.WEBUSB;
    if (type === CONNECTION_TYPES.WEBUSB || type === CONNECTION_TYPES.WINDOWS_HOST || type === CONNECTION_TYPES.NETWORK) {
        return type;
    }
    return CONNECTION_TYPES.WEBUSB;
};
const getConnectionLabel = (type) => {
    const normalized = normalizePrinterType(type);
    if (normalized === CONNECTION_TYPES.WINDOWS_HOST)
        return 'Windows Host';
    if (normalized === CONNECTION_TYPES.NETWORK)
        return 'Netwerk (IP)';
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
    driverModel: "", // bijv. 'zebra-zm400-300' of 'lighthouse-cjpro2'
};
const parseMm = (value, fallback = 0) => {
    const parsed = Number.parseFloat(String(value ?? "").replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeRollType = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'continuous' || raw === 'mark')
        return raw;
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
    if (mediaMode)
        zpl += `${mediaMode}\n`; // cut-mode vroeg in format
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
    if (!station)
        return "999";
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
    if (map[baseStation])
        return map[baseStation];
    const digits = baseStation.replace(/\D/g, "");
    if (!digits)
        return "999";
    if (digits.length === 3)
        return digits;
    if (digits.length === 1)
        return `40${digits}`;
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
    return (_jsx("div", { className: "fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in overflow-y-auto", children: _jsxs("div", { className: "bg-white w-full max-w-2xl rounded-[30px] shadow-2xl p-8 my-auto", children: [_jsxs("div", { className: "flex justify-between items-center mb-6", children: [_jsxs("h3", { className: "text-xl font-black text-slate-800 uppercase italic flex items-center gap-2", children: [_jsx(Hash, { className: "text-blue-600" }), " Lotnummers Printen"] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-slate-100 rounded-full", children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold uppercase text-slate-500 mb-1 block", children: "Station" }), _jsx("select", { className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm", value: config.station, onChange: e => setConfig({ ...config, station: e.target.value }), children: stations.map(s => _jsx("option", { value: s, children: s }, s)) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold uppercase text-slate-500 mb-1 block", children: "Week" }), _jsxs("select", { className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm", value: String(config.weekOffset), onChange: e => setConfig({ ...config, weekOffset: parseInt(e.target.value, 10) || 0 }), children: [_jsx("option", { value: "-1", children: "Vorige week" }), _jsx("option", { value: "0", children: "Huidige week" }), _jsx("option", { value: "1", children: "Volgende week" })] }), _jsxs("p", { className: "mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider", children: ["ISO week ", iso.week] })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold uppercase text-slate-500 mb-1 block", children: "Start Volgnummer" }), _jsx("input", { type: "number", min: "1", max: "9999", className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm", value: config.startSeq, onChange: e => setConfig({ ...config, startSeq: e.target.value }), onBlur: () => setConfig(prev => ({ ...prev, startSeq: String(parsedStartSeq) })) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold uppercase text-slate-500 mb-1 block", children: "Aantal Labels" }), _jsx("input", { type: "number", min: "1", className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm", value: config.count, onChange: e => setConfig({ ...config, count: e.target.value }), onBlur: () => setConfig(prev => ({ ...prev, count: String(parsedCount) })) })] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold uppercase text-slate-500 mb-2 block", children: "Print Modus" }), _jsxs("div", { className: "flex gap-4", children: [_jsxs("label", { className: "flex items-center gap-2 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200 flex-1", children: [_jsx("input", { type: "radio", name: "mode", checked: config.mode === 'sequential', onChange: () => setConfig({ ...config, mode: 'sequential' }) }), _jsx("span", { className: "text-sm font-bold", children: "Oplopend" })] }), _jsxs("label", { className: "flex items-center gap-2 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200 flex-1", children: [_jsx("input", { type: "radio", name: "mode", checked: config.mode === 'identical', onChange: () => setConfig({ ...config, mode: 'identical' }) }), _jsx("span", { className: "text-sm font-bold", children: "Identiek" })] })] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold uppercase text-slate-500 mb-1 block", children: "Printer" }), _jsx("select", { className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm", value: config.printerId, onChange: e => setConfig({ ...config, printerId: e.target.value }), children: printers.map(p => _jsxs("option", { value: p.id, children: [p.name, " (", p.type, ")"] }, p.id)) })] }), _jsxs("div", { className: "bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 flex flex-col items-center", children: [_jsx("p", { className: "text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest w-full text-left", children: "Live Preview (max 5)" }), _jsxs("div", { className: "w-full border border-slate-200 rounded-xl overflow-hidden bg-white", style: { maxWidth: '90mm' }, children: [previewLots.map((lot) => (_jsxs("div", { className: "w-full h-[13mm] px-2 flex items-center gap-2 border-b border-dashed border-slate-300 last:border-b-0", style: { maxWidth: '90mm' }, children: [_jsx(InternalQrImage, { value: lot, size: 128, alt: "QR Preview Links", className: "w-8 h-8 object-contain" }), _jsx("p", { className: "text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-[0.08em] leading-none break-all flex-1 text-center", children: lot })] }, lot))), parsedCount > 5 && (_jsxs("p", { className: "text-[11px] font-bold text-slate-500 text-center", children: ["+", parsedCount - 5, " extra labels worden geprint"] }))] })] }), _jsxs("button", { onClick: () => onPrint({
                                ...config,
                                startSeq: parsedStartSeq,
                                count: parsedCount,
                            }), className: "w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg", children: [_jsx(Printer, { size: 20 }), " Start Printopdracht"] })] })] }) }));
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
                if (!isMounted)
                    return;
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
                    if (seen.has(r.id))
                        return;
                    seen.add(r.id);
                    dedup.push(r);
                });
                dedup.sort((a, b) => String(a.orderDisplay).localeCompare(String(b.orderDisplay), undefined, { numeric: true }));
                setInitialList(dedup);
            }
            catch (err) {
                console.error("❌ Fout bij laden order labels lijst:", err);
            }
            finally {
                if (isMounted)
                    setLoadingInitialList(false);
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
                    if (docSnap.exists())
                        foundDocs.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
                    const planDocRef = doc(db, ...PATHS.PLANNING, opt);
                    const planDocSnap = await getDoc(planDocRef);
                    if (planDocSnap.exists())
                        foundDocs.set(planDocSnap.id, { id: planDocSnap.id, ...planDocSnap.data() });
                    const trackDocRef = doc(db, ...PATHS.TRACKING, opt);
                    const trackDocSnap = await getDoc(trackDocRef);
                    if (trackDocSnap.exists())
                        foundDocs.set(trackDocSnap.id, { id: trackDocSnap.id, ...trackDocSnap.data() });
                }
                catch {
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
        }
        catch (e) {
            console.error("❌ Zoekfout temp labels:", e);
            console.error("Search string was:", orderStr);
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsx("div", { className: "fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-2xl rounded-[30px] shadow-2xl p-8", children: [_jsxs("div", { className: "flex justify-between items-center mb-6", children: [_jsxs("h3", { className: "text-xl font-black text-slate-800 uppercase italic flex items-center gap-2", children: [_jsx(Tag, { className: "text-amber-500" }), " Legacy Order Labels"] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-slate-100 rounded-full", children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "flex gap-2 mb-6", children: [_jsx("input", { type: "text", placeholder: t('printer.searchOrderPlaceholder', 'TYP ORDERNUMMER (BIJV. N20000)'), className: "flex-1 p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold uppercase outline-none focus:border-amber-500", value: orderStr, onChange: (e) => setOrderStr(e.target.value), onKeyDown: (e) => e.key === 'Enter' && handleSearch() }), _jsxs("button", { onClick: handleSearch, disabled: loading, className: "px-6 bg-slate-900 text-white rounded-2xl font-black uppercase text-sm hover:bg-slate-800 transition-all flex items-center gap-2", children: [_jsx(Search, { size: 18 }), " Zoek"] })] }), _jsxs("div", { className: "mb-4", children: [_jsx("label", { className: "text-xs font-bold uppercase text-slate-500 mb-1 block", children: "Printer" }), _jsx("select", { className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm", value: printerId, onChange: (e) => setPrinterId(e.target.value), children: printers.map(p => _jsx("option", { value: p.id, children: p.name }, p.id)) })] }), (results.length > 0 || (!orderStr.trim() && initialList.length > 0)) && (_jsx("div", { className: "space-y-2 mb-2 max-h-[48vh] overflow-y-auto custom-scrollbar pr-2", children: (orderStr.trim() ? results : initialList).map((item, idx) => {
                        const orderDisplay = item.orderId || item.Order || item.Productieorder || item.order || item.id || "-";
                        const productDisplay = item.item || item.itemCode || item.Item || item.Artikel || item.description || item.Description || item.Omschrijving || "-";
                        return (_jsxs("button", { onClick: () => onPrint(item, printerId), className: "w-full p-4 bg-white border border-slate-200 hover:border-amber-300 hover:bg-amber-50/30 rounded-2xl transition-all text-left flex items-center justify-between gap-4", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-sm font-black text-slate-800 truncate", children: orderDisplay }), _jsx("p", { className: "text-xs font-bold text-slate-500 truncate", children: productDisplay })] }), _jsx("span", { className: "text-[10px] font-black uppercase tracking-wider text-amber-600 shrink-0", children: "Print" })] }, `${item.id || orderDisplay}-${idx}`));
                    }) })), loadingInitialList && !orderStr.trim() && (_jsx("p", { className: "text-center py-8 text-slate-400 font-bold italic", children: "Lijst laden..." })), results.length === 0 && orderStr.trim() && !loading && (_jsx("p", { className: "text-center py-8 text-slate-400 font-bold italic", children: "Geen order gevonden in tijdelijke import." }))] }) }));
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
        if (suggestionX !== null)
            setManualXMm(suggestionX.toFixed(2));
        if (suggestionY !== null)
            setManualYMm(suggestionY.toFixed(2));
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
        }
        catch (err) {
            setPreviewError("Preview genereren mislukt: " + err.message);
        }
    };
    return (_jsx("div", { className: "fixed inset-0 z-[220] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in overflow-y-auto", children: _jsxs("div", { className: "bg-white w-full max-w-2xl rounded-[30px] shadow-2xl p-8 my-auto", children: [_jsxs("div", { className: "flex justify-between items-center mb-5", children: [_jsxs("h3", { className: "text-xl font-black text-slate-800 uppercase italic flex items-center gap-2", children: [_jsx(Crosshair, { className: "text-blue-600" }), " Print Calibratie - ", printer?.name || "Printer"] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-slate-100 rounded-full", children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 mb-4", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold uppercase text-slate-500 mb-1 block", children: "Calibratie Labelformaat" }), _jsxs("select", { className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm", value: String(labelHeightMm), onChange: (e) => setLabelHeightMm(parseInt(e.target.value, 10) || 40), children: [_jsx("option", { value: "40", children: "90 x 40 mm" }), _jsx("option", { value: "65", children: "90 x 65 mm" })] })] }), _jsx("div", { className: "flex items-end", children: _jsxs("button", { onClick: () => onPrint({ labelHeightMm }), className: "w-full py-3 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2", children: [_jsx(Printer, { size: 18 }), " Print Kruisjes"] }) })] }), _jsxs("div", { className: "bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4", children: [_jsx("p", { className: "text-[11px] font-black text-slate-500 uppercase tracking-wider mb-3", children: "Snel berekenen op basis van marges" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold uppercase text-slate-500 mb-1 block", children: "Gemeten vrije marge links (mm)" }), _jsx("input", { type: "number", step: "0.1", className: "w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm", value: measuredLeftMm, onChange: (e) => setMeasuredLeftMm(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold uppercase text-slate-500 mb-1 block", children: "Gemeten vrije marge rechts (mm)" }), _jsx("input", { type: "number", step: "0.1", className: "w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm", value: measuredRightMm, onChange: (e) => setMeasuredRightMm(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold uppercase text-slate-500 mb-1 block", children: "Gemeten vrije marge boven (mm)" }), _jsx("input", { type: "number", step: "0.1", className: "w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm", value: measuredTopMm, onChange: (e) => setMeasuredTopMm(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold uppercase text-slate-500 mb-1 block", children: "Gemeten vrije marge onder (mm)" }), _jsx("input", { type: "number", step: "0.1", className: "w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm", value: measuredBottomMm, onChange: (e) => setMeasuredBottomMm(e.target.value) })] })] }), suggestionX !== null && (_jsxs("p", { className: "mt-3 text-sm font-bold text-blue-700", children: ["Suggestie X-correctie: ", suggestionX > 0 ? '+' : '', suggestionX.toFixed(2), " mm", _jsx("span", { className: "text-slate-500 font-semibold", children: " (positief = naar rechts)" })] })), suggestionY !== null && (_jsxs("p", { className: "mt-1 text-sm font-bold text-blue-700", children: ["Suggestie Y-correctie: ", suggestionY > 0 ? '+' : '', suggestionY.toFixed(2), " mm", _jsx("span", { className: "text-slate-500 font-semibold", children: " (positief = naar beneden)" })] }))] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3 mb-5", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold uppercase text-slate-500 mb-1 block", children: "Offset X (mm)" }), _jsx("input", { type: "number", step: "0.1", className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm", value: manualXMm, onChange: (e) => setManualXMm(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold uppercase text-slate-500 mb-1 block", children: "Offset Y (mm)" }), _jsx("input", { type: "number", step: "0.1", className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm", value: manualYMm, onChange: (e) => setManualYMm(e.target.value) })] })] }), _jsx("div", { className: "mb-5", children: _jsx("button", { onClick: handleUseSuggestions, disabled: suggestionX === null && suggestionY === null, className: "px-4 py-2 bg-white border border-slate-300 rounded-lg font-black text-xs uppercase tracking-wider hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed", children: "Gebruik suggesties" }) }), _jsxs("div", { className: "bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5", children: [_jsxs("div", { className: "flex flex-col md:flex-row md:items-center md:justify-between gap-3", children: [_jsx("p", { className: "text-xs font-bold uppercase text-slate-500", children: "Preview v\u00F3\u00F3r printen" }), _jsx("button", { onClick: handlePreview, className: "px-4 py-2 bg-white border border-slate-300 rounded-lg font-black text-xs uppercase tracking-wider hover:bg-slate-100", children: "Preview Genereren" })] }), previewError && _jsx("p", { className: "mt-2 text-xs font-bold text-rose-600", children: previewError }), previewUrl && (_jsx("div", { className: "mt-3 bg-white border border-slate-200 rounded-xl p-3 overflow-auto", children: _jsx("img", { src: previewUrl, alt: "Calibratie preview", className: "max-w-full h-auto" }) }))] }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { onClick: onClose, className: "px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-lg", children: "Sluiten" }), _jsx("button", { onClick: () => onApply({
                                calibrationOffsetXMm: parseMm(manualXMm, 0),
                                calibrationOffsetYMm: parseMm(manualYMm, 0),
                            }), className: "px-5 py-2 bg-emerald-600 text-white font-black rounded-lg hover:bg-emerald-700", children: "Opslaan als Printer Offset" })] })] }) }));
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
                    if (name)
                        stations.push(name);
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
            await logActivity(auth.currentUser?.uid, 'SETTINGS_UPDATE', `Windows Print Host Mode ${next ? 'enabled' : 'disabled'}`);
            setWindowsHostMode(next);
            showSuccess(`Windows Print Host modus ${next ? 'AAN' : 'UIT'} gezet.`);
        }
        catch (err) {
            console.error('Toggle windows host mode error:', err);
            showError('Opslaan van Windows Print Host modus mislukt: ' + err.message);
        }
        finally {
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
        }
        catch (err) {
            console.error("Queue stations save error:", err);
            showError("Opslaan queue stations mislukt: " + err.message);
        }
        finally {
            setIsSavingQueueStations(false);
        }
    };
    const handleAddQueueStation = async () => {
        const station = queueStationToAdd.trim();
        if (!station)
            return;
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
        if (!formData.name)
            return showError(t('adminPrinterManager.nameRequired'));
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
            }
            else {
                await addDoc(collection(db, ...PATHS.PRINTERS), {
                    ...payload,
                    createdAt: serverTimestamp()
                });
            }
            await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Printer saved: ${formData.name}`);
            setIsAdding(false);
            setEditingId(null);
            setFormData(DEFAULT_PRINTER_FORM);
        }
        catch (err) {
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
        if (!confirmed)
            return;
        try {
            await deleteDoc(doc(db, ...PATHS.PRINTERS, id));
            await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Printer deleted: ${id}`);
        }
        catch (err) {
            console.error("Error deleting:", err);
        }
    };
    const handleSetDefault = async (id) => {
        try {
            // Zet alle anderen op false
            const updates = printers.map(p => updateDoc(doc(db, ...PATHS.PRINTERS, p.id), {
                isDefault: p.id === id
            }));
            await Promise.all(updates);
            await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Printer default set to: ${id}`);
        }
        catch (err) {
            console.error("Error setting default:", err);
        }
    };
    const handleApplyCalibration = async (printer, payload) => {
        if (!printer?.id)
            return;
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
        }
        catch (err) {
            console.error("Calibration save error:", err);
            showError("Calibratie opslaan mislukt: " + err.message);
        }
    };
    const handleCalibrationPrint = async (printer, { labelHeightMm }) => {
        if (!printer)
            return;
        try {
            const rollWidthMm = resolveRollWidthMm(printer);
            const zpl = buildCalibrationCrossZpl({ printer, labelWidthMm: rollWidthMm, labelHeightMm });
            const result = await sendPrintJob(printer, zpl, {
                description: `Calibratieprint ${rollWidthMm}x${labelHeightMm}mm`,
                width: rollWidthMm,
                height: labelHeightMm
            }, { allowQueueFallback: false });
            showSuccess(result.mode === 'queue'
                ? `Calibratieprint in wachtrij gezet voor ${printer.name}.`
                : `Calibratieprint ${rollWidthMm}x${labelHeightMm}mm verzonden naar ${printer.name}.`);
            setCalibrationPrinter(null);
            setShowTestMenu(null);
        }
        catch (err) {
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
            }
            catch (err) {
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
                    throw new Error("Directe testprint mislukt: USB-interface is bezet of toegang geweigerd. Sluit andere USB-sessies en probeer opnieuw (zonder wachtrij-fallback).", { cause: err });
                }
                if (isAccessIssue) {
                    throw new Error("USB toegang geweigerd. Controleer browserrechten en of de printer door een ander systeemproces/driver is bezet. " +
                        "Op Windows kan dit door de systeemdriver komen; op Chromebook vaak door geweigerde USB-permissie of een bezette interface.", { cause: err });
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
        if (!printer)
            return showError("Selecteer een printer.");
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
        const textX = Math.max(textAreaStartDots, textAreaStartDots + Math.round((textAreaWidthDots - estimatedTextWidthDots) / 2));
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
            showSuccess(result.mode === 'queue'
                ? `${config.count} labels in wachtrij gezet voor ${printer.name}.`
                : `${config.count} labels verzonden naar ${printer.name}.`);
            setShowLotModal(false);
        }
        catch (e) {
            showError(`Print via ${printer.name} mislukt: ${e.message}`);
        }
    };
    const handleTempLegacyPrint = async (orderData, targetPrinterId) => {
        const printer = printers.find(p => p.id === targetPrinterId);
        if (!printer)
            return showError("Printer niet gevonden.");
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
            showSuccess(result.mode === 'queue'
                ? `Legacy label voor ${order} in wachtrij gezet voor ${printer.name}`
                : `Legacy label voor ${order} verzonden naar ${printer.name}`);
        }
        catch (e) {
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
        }
        catch (err) {
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
                if (vendorId && productId)
                    return d.vendorId === vendorId && d.productId === productId;
                if (vendorId)
                    return d.vendorId === vendorId;
                return true;
            });
            for (const d of matching) {
                try {
                    if (d.opened)
                        await d.close();
                }
                catch {
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
        }
        catch (err) {
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
            showSuccess(result.mode === 'queue'
                ? `Testprint in wachtrij gezet voor ${printer.name}.`
                : t('adminPrinterManager.usbDirectPrintSent'));
        }
        catch (err) {
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
            showSuccess(result.mode === 'queue'
                ? `Testlabel van ${lengthMm}mm in wachtrij gezet voor ${printer.name}.`
                : `Testlabel van ${lengthMm}mm verzonden naar ${printer.name}.`);
        }
        catch (err) {
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
            }
            else {
                doc.save('OK-QR-A4.pdf');
                showInfo('Pop-up geblokkeerd, PDF is gedownload als bestand.');
            }
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        }
        catch (err) {
            if (popup && !popup.closed)
                popup.close();
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
    return (_jsxs("div", { className: "p-6 max-w-4xl mx-auto", children: [_jsxs("div", { className: "flex justify-between items-center mb-6", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-black text-slate-800 uppercase italic", children: t('common.printerManagement') }), _jsx("p", { className: "text-sm text-slate-500 font-bold", children: t('common.configurePrinters') })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { onClick: () => setShowTempModal(true), className: "bg-amber-500 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-amber-600 transition-all shadow-sm", children: [_jsx(Tag, { size: 16 }), " Order Labels"] }), _jsxs("button", { onClick: () => setShowLotModal(true), className: "bg-purple-600 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-purple-700 transition-all", children: [_jsx(Hash, { size: 16 }), " Lotnummers"] }), _jsxs("button", { onClick: handlePrintA4QrPdf, className: "bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-emerald-700 transition-all", children: [_jsx(QrCode, { size: 16 }), " Print 'OK' QR (A4)"] }), _jsxs("button", { onClick: () => {
                                    setEditingId(null);
                                    setFormData(DEFAULT_PRINTER_FORM);
                                    setIsAdding(true);
                                }, className: "bg-blue-600 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-blue-700 transition-all", children: [_jsx(Plus, { size: 16 }), " ", t('common.newPrinter')] })] })] }), _jsxs("div", { className: "flex gap-2 border-b border-slate-200 pb-1 mb-6", children: [_jsxs("button", { onClick: () => setActiveTab("config"), className: `px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 ${activeTab === "config" ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200"}`, children: [_jsx(Printer, { size: 16 }), " Printer Config"] }), _jsxs("button", { onClick: () => setActiveTab("queue-stations"), className: `px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 ${activeTab === "queue-stations" ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200"}`, children: [_jsx(MapPin, { size: 16 }), " Queue Stations"] }), _jsxs("button", { onClick: () => setActiveTab("queue"), className: `px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 ${activeTab === "queue" ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200"}`, children: [_jsx(List, { size: 16 }), " Print Wachtrij"] })] }), activeTab === "config" && (_jsxs(_Fragment, { children: [_jsx("div", { className: "bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-6", children: _jsxs("div", { className: "flex flex-col md:flex-row md:items-center md:justify-between gap-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-black text-slate-400 uppercase tracking-widest mb-1", children: "Tijdelijke Pilot Modus" }), _jsxs("h3", { className: "text-base font-black text-slate-800 uppercase flex items-center gap-2", children: [_jsx(Server, { size: 16 }), " Windows Print Host"] }), _jsx("p", { className: "text-sm text-slate-500 font-semibold mt-1", children: "Schakel hier centraal tussen bestaande USB/WebUSB flow en tijdelijke Windows-printerdialoog flow (op de host-pc)." })] }), _jsx("button", { onClick: handleToggleWindowsHostMode, disabled: savingWindowsHostMode, className: `px-4 py-2 rounded-xl font-black uppercase text-xs tracking-widest transition-all border-2 disabled:opacity-60 disabled:cursor-not-allowed ${windowsHostMode
                                        ? 'bg-amber-600 text-white border-amber-600'
                                        : 'bg-white text-slate-600 border-slate-300 hover:border-amber-300'}`, children: savingWindowsHostMode ? 'Opslaan...' : (windowsHostMode ? 'Windows Host AAN' : 'Windows Host UIT') })] }) }), isAdding && (_jsxs("div", { className: "bg-white p-6 rounded-2xl border-2 border-blue-100 shadow-lg mb-8 animate-in slide-in-from-top-2", children: [_jsxs("div", { className: "flex justify-between items-center mb-4", children: [_jsx("h3", { className: "font-black text-slate-700 uppercase", children: editingId ? t('adminPrinterManager.editPrinter') : t('adminPrinterManager.addNewPrinter') }), _jsx("button", { onClick: () => { setIsAdding(false); setEditingId(null); }, children: _jsx(X, { size: 20, className: "text-slate-400" }) })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 mb-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: t('adminPrinterManager.name') }), _jsx("input", { type: "text", placeholder: t('adminPrinterManager.printerNamePlaceholder'), className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500", value: formData.name, onChange: e => setFormData({ ...formData, name: e.target.value }) })] }), _jsxs("div", { className: "md:col-span-2 bg-slate-50 p-3 rounded-xl border border-slate-200", children: [_jsxs("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2", children: [_jsx(MapPin, { size: 14 }), " ", t('adminPrinterManager.linkToWorkstationOptional')] }), _jsx("div", { className: "flex flex-wrap gap-2 mb-2", children: formData.linkedStations.map(station => (_jsxs("span", { className: "bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1", children: [station, _jsx("button", { onClick: () => setFormData({ ...formData, linkedStations: formData.linkedStations.filter(s => s !== station) }), className: "hover:text-blue-900", children: _jsx(X, { size: 12 }) })] }, station))) }), _jsxs("select", { className: "w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none", onChange: (e) => {
                                                    if (e.target.value && !formData.linkedStations.includes(e.target.value)) {
                                                        setFormData({ ...formData, linkedStations: [...formData.linkedStations, e.target.value] });
                                                    }
                                                    e.target.value = "";
                                                }, children: [_jsx("option", { value: "", children: t('adminPrinterManager.addStationPlaceholder') }), availableStations.map(s => _jsx("option", { value: s, children: s }, s))] })] }), _jsxs("div", { className: "md:col-span-2", children: [_jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: t('adminPrinterManager.connection') }), _jsx("div", { className: "flex gap-2", children: _jsxs("select", { className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500", value: formData.type, onChange: e => setFormData({ ...formData, type: normalizePrinterType(e.target.value) }), children: [_jsx("option", { value: CONNECTION_TYPES.WEBUSB, children: "WebUSB / Zadig" }), _jsx("option", { value: CONNECTION_TYPES.WINDOWS_HOST, children: "Direct via Windows Host" }), _jsx("option", { value: CONNECTION_TYPES.NETWORK, children: "Netwerk (IP)" })] }) }), normalizePrinterType(formData.type) === CONNECTION_TYPES.WEBUSB && (_jsx("div", { className: "mt-2 p-3 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-500 italic flex flex-col justify-center", children: _jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { children: formData.deviceName ? `Gekoppeld: ${formData.deviceName}` : "Directe USB Print" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("button", { onClick: handlePairUsb, className: "text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-blue-50 text-blue-600 font-bold flex items-center gap-1", children: [_jsx(Usb, { size: 14 }), formData.vendorId ? "Opnieuw Koppelen" : "Koppel Printer"] }), _jsx("button", { onClick: handleUsbResetReconnect, className: "text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-amber-50 text-amber-700 font-bold", children: "USB Reset + Reconnect" })] })] }) })), normalizePrinterType(formData.type) === CONNECTION_TYPES.WINDOWS_HOST && (_jsx("div", { className: "mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm font-semibold text-amber-800", children: "Deze printer gebruikt de Windows-printer op de host-pc via de printwachtrij/browserdialoog." })), normalizePrinterType(formData.type) === CONNECTION_TYPES.NETWORK && (_jsxs("div", { className: "mt-2 grid grid-cols-1 md:grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-bold text-slate-400 uppercase mb-1", children: "IP Adres" }), _jsx("input", { type: "text", placeholder: "Bijv. 192.168.1.120", className: "w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500", value: formData.ip, onChange: (e) => setFormData({ ...formData, ip: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-bold text-slate-400 uppercase mb-1", children: "Poort" }), _jsx("input", { type: "number", min: "1", max: "65535", className: "w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500", value: formData.port, onChange: (e) => setFormData({ ...formData, port: e.target.value || '9100' }) })] })] }))] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-500 uppercase mb-1", children: t('adminPrinterManager.protocol') }), _jsx("select", { className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500", value: formData.protocol, onChange: e => setFormData({ ...formData, protocol: e.target.value }), children: PRINTER_PROTOCOLS.map(protocol => (_jsx("option", { value: protocol, children: t(`adminPrinterManager.protocol${protocol.toUpperCase()}`) }, protocol))) })] }), _jsxs("div", { className: "grid grid-cols-2 md:grid-cols-5 gap-3 md:col-span-2", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-bold text-slate-400 uppercase mb-1", children: t('adminPrinterManager.dpi') }), _jsxs("select", { className: "w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold", value: formData.dpi, onChange: e => setFormData({ ...formData, dpi: e.target.value }), children: [_jsx("option", { value: "203", children: "203 DPI" }), _jsx("option", { value: "300", children: "300 DPI" }), _jsx("option", { value: "600", children: "600 DPI" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-bold text-slate-400 uppercase mb-1", children: "Rol Breedte (mm)" }), _jsx("input", { type: "number", min: "20", step: "1", className: "w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold", placeholder: "90", value: formData.rollWidthMm, onChange: e => setFormData({ ...formData, rollWidthMm: e.target.value, width: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-bold text-slate-400 uppercase mb-1", children: "Rol Type" }), _jsxs("select", { className: "w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold", value: normalizeRollType(formData.rollType), onChange: e => setFormData({ ...formData, rollType: normalizeRollType(e.target.value) }), children: [_jsx("option", { value: "gap", children: "Stickerrol met onderbreking (GAP)" }), _jsx("option", { value: "continuous", children: "Continue rol" }), _jsx("option", { value: "mark", children: "Black mark rol" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-bold text-slate-400 uppercase mb-1", children: t('adminPrinterManager.darkness') }), _jsx("input", { type: "number", min: "0", max: "30", className: "w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold", value: formData.darkness, onChange: e => setFormData({ ...formData, darkness: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-bold text-slate-400 uppercase mb-1", children: "Speed (ips)" }), _jsx("input", { type: "number", min: "1", max: "14", className: "w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold", value: formData.speed, onChange: e => setFormData({ ...formData, speed: e.target.value }) })] })] }), _jsxs("div", { className: "md:col-span-2", children: [_jsx("label", { className: "block text-[10px] font-bold text-slate-400 uppercase mb-1", children: "Driver Model" }), _jsxs("select", { className: "w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold", value: formData.driverModel, onChange: e => {
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
                                                }, children: [_jsx("option", { value: "", children: "\u2014 Automatisch detecteren (op naam/DPI) \u2014" }), Object.values(PRINTER_DRIVERS).map(d => (_jsx("option", { value: d.id, children: d.label }, d.id)))] }), _jsx("p", { className: "text-[9px] text-slate-400 mt-1", children: "Selecteer een driver voor correcte DPI, cut-commando en backfeed-gedrag. Laat leeg voor automatische detectie op naamhint." })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3 md:col-span-2", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-bold text-slate-400 uppercase mb-1", children: "Calibratie X Offset (mm)" }), _jsx("input", { type: "number", step: "0.1", className: "w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold", value: formData.calibrationOffsetXMm, onChange: e => setFormData({ ...formData, calibrationOffsetXMm: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-bold text-slate-400 uppercase mb-1", children: "Calibratie Y Offset (mm)" }), _jsx("input", { type: "number", step: "0.1", className: "w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold", value: formData.calibrationOffsetYMm, onChange: e => setFormData({ ...formData, calibrationOffsetYMm: e.target.value }) })] })] })] }), _jsxs("div", { className: "flex items-center gap-2 mb-6", children: [_jsx("input", { type: "checkbox", id: "isDefault", checked: formData.isDefault, onChange: e => setFormData({ ...formData, isDefault: e.target.checked }), className: "w-5 h-5 text-blue-600 rounded focus:ring-blue-500" }), _jsx("label", { htmlFor: "isDefault", className: "text-sm font-bold text-slate-700 cursor-pointer", children: t('adminPrinterManager.setAsDefaultPrinter') })] }), _jsxs("div", { className: "flex justify-end gap-3", children: [_jsx("button", { onClick: () => { setIsAdding(false); setEditingId(null); }, className: "px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-lg", children: t('common.cancel') }), _jsxs("button", { onClick: handleSave, className: "px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center gap-2", children: [_jsx(Save, { size: 16 }), " ", t('common.save')] })] })] })), showLotModal && (_jsx(LotPrintModal, { onClose: () => setShowLotModal(false), stations: availableStations, printers: printers, onPrint: handleBulkLotPrint })), showTempModal && (_jsx(TempLabelModal, { onClose: () => setShowTempModal(false), printers: printers, onPrint: handleTempLegacyPrint })), calibrationPrinter && (_jsx(CalibrationModal, { printer: calibrationPrinter, onClose: () => setCalibrationPrinter(null), onPrint: (cfg) => handleCalibrationPrint(calibrationPrinter, cfg), onApply: (payload) => handleApplyCalibration(calibrationPrinter, payload) })), _jsxs("div", { className: "grid gap-4", children: [printers.length === 0 && !loading && (_jsx("div", { className: "text-center py-12 text-slate-400 italic", children: t('adminPrinterManager.noPrintersConfigured') })), printers.map(printer => ((() => {
                                const printerType = normalizePrinterType(printer.type);
                                const iconColors = printerType === CONNECTION_TYPES.NETWORK
                                    ? 'bg-blue-50 text-blue-600'
                                    : printerType === CONNECTION_TYPES.WINDOWS_HOST
                                        ? 'bg-amber-50 text-amber-600'
                                        : 'bg-orange-50 text-orange-600';
                                return (_jsxs("div", { className: `bg-white p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${printer.isDefault ? 'border-emerald-400 shadow-sm' : 'border-slate-100'}`, children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: `p-3 rounded-xl ${iconColors}`, children: _jsx(Printer, { size: 24 }) }), _jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("h3", { className: "font-black text-slate-800", children: printer.name }), printer.isDefault && (_jsx("span", { className: "px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase rounded-md border border-emerald-200", children: t('adminPrinterManager.default', 'Standaard') }))] }), _jsxs("p", { className: "text-xs font-bold text-slate-400 font-mono mt-0.5", children: [printerType === CONNECTION_TYPES.WEBUSB && (printer.deviceName ? `USB: ${printer.deviceName}` : "WebUSB / Zadig"), printerType === CONNECTION_TYPES.WINDOWS_HOST && "Windows Host Print", printerType === CONNECTION_TYPES.NETWORK && (printer.ip ? `IP: ${printer.ip}:${printer.port || '9100'}` : "Netwerk printer (IP nog leeg)"), printer.dpi && _jsxs("span", { className: "ml-2 opacity-60 text-[10px]", children: ["(", printer.dpi, " DPI)"] })] }), _jsxs("p", { className: "text-[10px] text-slate-500 mt-1 font-bold uppercase", children: [t('adminPrinterManager.protocol'), ": ", ((printer.protocol || 'zpl')).toUpperCase(), " | ", getConnectionLabel(printer.type)] }), _jsxs("p", { className: "text-[10px] text-slate-500 mt-1 font-bold uppercase", children: ["Calibratie: X ", parseMm(printer.calibrationOffsetXMm, 0), "mm | Y ", parseMm(printer.calibrationOffsetYMm, 0), "mm"] }), _jsxs("p", { className: "text-[10px] text-slate-500 mt-1 font-bold uppercase", children: ["Rol: ", resolveRollWidthMm(printer), "mm | Type: ", normalizeRollType(printer.rollType)] }), _jsxs("p", { className: "text-[10px] text-slate-500 mt-1 font-bold uppercase", children: ["Print: Darkness ", printer.darkness || getDriver(printer).defaultDarkness, " | Speed ", printer.speed || getDriver(printer).defaultSpeed, " ips"] }), _jsx("p", { className: "text-[10px] text-slate-400 mt-1 flex flex-wrap gap-1", children: printer.linkedStations && printer.linkedStations.length > 0
                                                                ? printer.linkedStations.map(s => _jsx("span", { className: "bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200", children: s }, s))
                                                                : _jsx("span", { className: "italic opacity-50", children: t('adminPrinterManager.noSpecificStations') }) })] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [!printer.isDefault && (_jsx("button", { onClick: () => handleSetDefault(printer.id), className: "p-2 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors", title: t('adminPrinterManager.makeDefault'), children: _jsx(CheckCircle2, { size: 18 }) })), _jsxs("div", { className: "relative", children: [_jsx("button", { onClick: () => setShowTestMenu(printer.id === showTestMenu ? null : printer.id), disabled: printerType !== CONNECTION_TYPES.WEBUSB, className: "p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors", title: printerType === CONNECTION_TYPES.WEBUSB ? t('adminPrinterManager.testPrint') : 'Testprint is alleen beschikbaar voor WebUSB/Zadig printers', children: _jsx(Play, { size: 18 }) }), showTestMenu === printer.id && (_jsxs("div", { className: "absolute right-0 bottom-full mb-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-10 py-1", children: [_jsx("div", { className: "px-3 py-1 text-[10px] font-bold text-slate-400 uppercase", children: "Test Lengtes" }), _jsx("button", { onClick: () => handleLengthTestPrint(printer, 25), className: "block w-full text-left px-3 py-2 text-xs hover:bg-slate-50", children: "Test 90x25mm" }), _jsx("button", { onClick: () => handleLengthTestPrint(printer, 50), className: "block w-full text-left px-3 py-2 text-xs hover:bg-slate-50", children: "Test 90x50mm" }), _jsx("button", { onClick: () => handleLengthTestPrint(printer, 100), className: "block w-full text-left px-3 py-2 text-xs hover:bg-slate-50", children: "Test 90x100mm" }), _jsx("div", { className: "h-px bg-slate-100 my-1" }), _jsx("button", { onClick: () => handleTestPrint(printer), className: "block w-full text-left px-3 py-2 text-xs hover:bg-slate-50", children: "Standaard Testlabel" }), _jsx("button", { onClick: () => { setShowTestMenu(null); setCalibrationPrinter(printer); }, className: "block w-full text-left px-3 py-2 text-xs hover:bg-slate-50", children: "Calibratie print + offsets" })] }))] }), _jsx("button", { onClick: () => handleEdit(printer), className: "p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors", title: t('common.edit'), children: _jsx(Edit, { size: 18 }) }), _jsx("button", { onClick: () => handleDelete(printer.id), className: "p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors", title: t('common.delete'), children: _jsx(Trash2, { size: 18 }) })] })] }, printer.id));
                            })()))] })] })), activeTab === "queue-stations" && (_jsxs("div", { className: "bg-white rounded-2xl border border-slate-200 shadow-sm p-6", children: [_jsx("h3", { className: "text-lg font-black text-slate-800 uppercase mb-1", children: "Queue Stations" }), _jsx("p", { className: "text-sm text-slate-500 font-semibold mb-4", children: "Koppel stations per printer voor Print Stations en Print Wachtrij. Stations komen uit factory config." }), _jsxs("div", { className: "mb-4", children: [_jsx("label", { className: "block text-xs font-bold uppercase text-slate-500 mb-1", children: "Printer" }), _jsxs("select", { value: selectedQueuePrinterId, onChange: (e) => {
                                    setSelectedQueuePrinterId(e.target.value);
                                    setQueueStationToAdd("");
                                }, className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm", disabled: printers.length === 0 || isSavingQueueStations, children: [printers.length === 0 && _jsx("option", { value: "", children: "Geen printers" }), printers.map((p) => (_jsx("option", { value: p.id, children: p.name }, p.id)))] })] }), _jsxs("div", { className: "flex flex-col md:flex-row gap-3 mb-4", children: [_jsxs("select", { value: queueStationToAdd, onChange: (e) => setQueueStationToAdd(e.target.value), className: "flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm", disabled: availableStations.length === 0 || isSavingQueueStations || !selectedQueuePrinterId, children: [_jsx("option", { value: "", children: "Selecteer station uit factory config..." }), availableStations
                                        .filter((s) => !queueStations.includes(s))
                                        .map((s) => (_jsx("option", { value: s, children: s }, s)))] }), _jsx("button", { onClick: handleAddQueueStation, disabled: !queueStationToAdd || isSavingQueueStations || !selectedQueuePrinterId, className: "px-4 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed", children: isSavingQueueStations ? "Opslaan..." : "Toevoegen" })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [queueStations.length === 0 && (_jsx("p", { className: "text-sm text-slate-400 italic", children: "Nog geen queue stations geselecteerd." })), queueStations.map((station) => (_jsxs("span", { className: "bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border border-blue-200", children: [station, _jsx("button", { onClick: () => handleRemoveQueueStation(station), className: "hover:text-blue-900", disabled: isSavingQueueStations, title: "Verwijderen", children: _jsx(X, { size: 12 }) })] }, station)))] })] })), activeTab === "queue" && (_jsx("div", { className: "bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden", children: _jsx(PrintQueueAdminView, {}) }))] }));
};
export default AdminPrinterManager;
