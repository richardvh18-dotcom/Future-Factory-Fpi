import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  PlayCircle,
  Printer,
  RefreshCw,
  QrCode,
  Layers,
  X,
  Keyboard,
  Activity,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Database
} from "lucide-react";
import { collection, getDocs, query, where, onSnapshot, doc, getDoc, setDoc, deleteDoc, serverTimestamp, runTransaction, limit } from "firebase/firestore";

import { db, auth, logActivity } from "../../../config/firebase"; 
import { PATHS, getArchiveItemsPath } from "../../../config/dbPaths";
import {
  filterLabelsByProduct,
} from "../../../utils/labelHelpers";
import { getFlangeSeriesInfo } from "../../../utils/flangeSeriesHelper";
import { lookupProductByManufacturedId } from "../../../utils/conversionLogic";
import { useNotifications } from "../../../contexts/NotificationContext";
import { generatePrintData } from "../../../utils/zplHelper";
import { getDriver } from "../../../utils/printerDrivers";
import { queuePrintJob } from "../../../services/printService.js";
import LabelVisualPreview from "../../printer/LabelVisualPreview";
import { useLabelPreview } from "../../../hooks/useLabelPreview";

const PIXELS_PER_MM = 3.78;
const LOT_ARCHIVE_LOOKBACK_YEARS = 6;

// Functie om ISO week en bijbehorend ISO jaar te berekenen
const getIsoWeekAndYear = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return { week: String(weekNo).padStart(2, '0'), year: String(year) };
};

// Machine naar FPI code mapping
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

const getNormalizedPrinterDpi = (printer, fallback = 203) => {
  const parsed = Number.parseInt(printer?.dpi, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const resolved = getDriver(printer);
  return Number.isFinite(resolved?.nativeDpi) && resolved.nativeDpi > 0
    ? resolved.nativeDpi
    : fallback;
};

const ProductionStartModal = ({
  order,
  isOpen,
  onClose,
  onStart,
  stationId = "",
  existingProducts = [],
}) => {
  const { showSuccess, showError } = useNotifications();
  const [mode, setMode] = useState("manual"); // Standaard manueel voor pilot
  const [lotNumber, setLotNumber] = useState("");
  const [stringCount, setStringCount] = useState("1");
  const [labelCount, setLabelCount] = useState("1");
  const [manualLotInput, setManualLotInput] = useState("");
  const [manualOrderInput, setManualOrderInput] = useState("");
  const [assignedOperators, setAssignedOperators] = useState([]);
  const [operatorInput, setOperatorInput] = useState("");
  
  // Refs voor autofocus bij barcode scanning
  const orderInputRef = useRef(null);
  const lotInputRef = useRef(null);
  const manualLotAutoStartTimeoutRef = useRef(null);
  const lastLotInputAtRef = useRef(0);
  const previousLotInputRef = useRef("");
  const scannerLikeLotInputRef = useRef(false);
  const [orderValidated, setOrderValidated] = useState(false);
  const [orderError, setOrderError] = useState("");

  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [previewZoom, setPreviewZoom] = useState(1);
  const location = useLocation();
  
  const [savedPrinters, setSavedPrinters] = useState([]);
  const [generalSettings, setGeneralSettings] = useState({ flangeSeriesRules: [] });
  const [toolingMolds, setToolingMolds] = useState([]);
  const [relatedItemCodes, setRelatedItemCodes] = useState([]);
  const [printConfig, setPrintConfig] = useState({
    mode: "queue", 
    printerIp: "",
    printerId: ""
  });

  const PRODUCT_TYPES = ["EST", "CST", "EWT", "EMT"]; // Veelvoorkomende types voor filtering

  const containerRef = useRef(null);
  const previewAreaRef = useRef(null);

  const [isCheckingLot, setIsCheckingLot] = useState(false);
  const [lotError, setLotError] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const isManualMode = mode === "manual";
  const flangeSeriesInfo = useMemo(
    () =>
      getFlangeSeriesInfo(
        order,
        generalSettings?.flangeSeriesRules,
        toolingMolds,
        stationId,
        relatedItemCodes
      ),
    [order, generalSettings?.flangeSeriesRules, toolingMolds, stationId, relatedItemCodes]
  );
  const isFlangeOrder = !!flangeSeriesInfo?.isFlange;

  const sanitizePositiveIntInput = (value) => {
    const digitsOnly = String(value ?? "").replace(/\D/g, "");
    return digitsOnly;
  };

  const normalizePositiveIntInput = (value, fallback = 1) => {
    const parsed = parseInt(String(value || ""), 10);
    return String(Number.isFinite(parsed) && parsed > 0 ? parsed : fallback);
  };

  const printerHasStation = (printer, station) => {
    if (!printer || !station) return false;
    const linked = Array.isArray(printer.linkedStations) ? printer.linkedStations : [];
    const queue = Array.isArray(printer.queueStations) ? printer.queueStations : [];
    return [...linked, ...queue].includes(station);
  };

  const resolveTargetPrinter = (printerList, station) => {
    const globalDefault = (printerList || []).find((p) => p.isDefault);
    const stationPrinter = (printerList || []).find((p) => printerHasStation(p, station));
    // Prioriteit: expliciete standaardprinter > station-mapping
    // Dit voorkomt dat oude stationkoppelingen (bijv. Lighthouse) de nieuwe standaard (ZM400) overrulen.
    return globalDefault || stationPrinter || null;
  };

  const resolveTargetPrinterAsync = async () => {
    const currentResolved = resolveTargetPrinter(savedPrinters, stationId);
    if (currentResolved) return currentResolved;

    const currentById = printConfig.printerId
      ? savedPrinters.find((p) => p.id === printConfig.printerId)
      : null;
    if (currentById) return currentById;

    const prnPaths = PATHS?.PRINTERS || ['future-factory', 'settings', 'printers'];
    const snap = await getDocs(collection(db, ...prnPaths));
    const fetchedPrinters = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const fetchedResolved = resolveTargetPrinter(fetchedPrinters, stationId);
    if (fetchedResolved) return fetchedResolved;

    const fetchedById = printConfig.printerId
      ? fetchedPrinters.find((p) => p.id === printConfig.printerId)
      : null;
    return fetchedById || null;
  };

  const productForPreview = useMemo(() => ({
    ...order,
    orderNumber: isManualMode ? manualOrderInput || order.orderId : order.orderId,
    productId: order.itemCode,
    description: order.item,
    lotNumber: isManualMode ? manualLotInput : (lotNumber || "LADEN..."),
  }), [order, isManualMode, manualOrderInput, manualLotInput, lotNumber]);

  const { selectedLabel, previewData, availableLabels: allLabels, loadingLabels } = useLabelPreview(productForPreview, selectedLabelId);

  useEffect(() => {
    if (isOpen) {
      setLabelCount((prev) => normalizePositiveIntInput(prev, parseInt(stringCount, 10) || 1));
    }
  }, [isOpen, stringCount]);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = onSnapshot(
      doc(db, ...PATHS.GENERAL_SETTINGS),
      (snap) => {
        if (snap.exists()) {
          setGeneralSettings((prev) => ({ ...prev, ...(snap.data() || {}) }));
        }
      },
      (err) => {
        console.error("Kon algemene instellingen niet laden:", err);
      }
    );
    return () => unsub();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const sourceCode = String(order?.itemCode || order?.item || "").trim();
    if (!sourceCode) {
      setRelatedItemCodes([]);
      return;
    }

    const loadConversionCodes = async () => {
      try {
        const conversion = await lookupProductByManufacturedId(null, sourceCode);
        if (!active) return;
        const candidates = Array.from(
          new Set(
            [
              sourceCode,
              conversion?.manufacturedId,
              conversion?.targetProductId,
              conversion?.id,
            ]
              .map((value) => String(value || "").trim())
              .filter(Boolean)
          )
        );
        setRelatedItemCodes(candidates);
      } catch (error) {
        console.error("Kon conversiecodes niet laden voor mallenmatch:", error);
        setRelatedItemCodes([sourceCode]);
      }
    };

    loadConversionCodes();
    return () => {
      active = false;
    };
  }, [isOpen, order?.itemCode, order?.item]);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = onSnapshot(
      collection(db, ...PATHS.TOOLING_MOLDS),
      (snap) => {
        const rows = snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
        setToolingMolds(rows);
      },
      (err) => {
        console.error("Kon gereedschap/mallen niet laden:", err);
        setToolingMolds([]);
      }
    );
    return () => unsub();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isFlangeOrder) return;
    const cavityCount = Math.max(1, Number(flangeSeriesInfo?.cavityCount || 1));
    setStringCount((prev) => (String(prev || "") === "1" ? String(cavityCount) : prev));
    if (mode === "auto") {
      setLabelCount("0");
    }
  }, [isOpen, mode, isFlangeOrder, flangeSeriesInfo?.cavityCount]);

  const availableLabels = useMemo(() => {
    if (!allLabels || allLabels.length === 0) return [];
    let filteredLabels = filterLabelsByProduct(allLabels, order, { excludeTempOrderLabels: true });
    
    // Sortering voor BH18: Grote labels eerst
    if (stationId === 'BH18') {
        filteredLabels.sort((a, b) => {
            const aLarge = a.height >= 45 || a.name?.toLowerCase().includes("groot") || a.name?.toLowerCase().includes("standard");
            const bLarge = b.height >= 45 || b.name?.toLowerCase().includes("groot") || b.name?.toLowerCase().includes("standard");
            if (aLarge && !bLarge) return -1;
            if (!aLarge && bLarge) return 1;
            return 0;
        });
    }

    return filteredLabels;
  }, [allLabels, order, stationId]);

  // Autofocus naar ordernummer bij openen in manuele modus
  useEffect(() => {
    if (isOpen && mode === "manual" && orderInputRef.current) {
      setTimeout(() => {
        orderInputRef.current?.focus();
      }, 300);
    }
  }, [isOpen, mode]);

  // 1. Label Templates & Rules Laden
  useEffect(() => {
    const setDefaultLabel = () => {
      if (!isOpen || loadingLabels || availableLabels.length === 0) return;
      
      try {
        if (availableLabels.length > 0) {
          // NIEUW: Kies bij voorkeur een flens of code label
          const preferred = availableLabels.find(t => 
            t.tags?.includes("FLENZEN") ||
            t.tags?.includes("FLENS") ||
            t.tags?.includes("FLANGE") ||
            t.tags?.includes("CODE")
          );

          if (preferred) {
            if (preferred.id !== selectedLabelId) setSelectedLabelId(preferred.id);
            return;
          }

          // FL-orders moeten altijd een klein voorbeeldlabel gebruiken.
          const preferSmall = isFlangeOrder;
          // Voor niet-FL: BH18 krijgt standaard groot, overige stations klein.
          const preferLarge = !preferSmall && stationId === 'BH18';
          
          let defaultLabel = preferLarge ? availableLabels.find(
            (l) => (l.height >= 45 && !l.name?.toLowerCase().includes("smal")) || 
                   l.name?.toLowerCase().includes("groot") || 
                   l.name?.toLowerCase().includes("standard")
          ) : availableLabels.find(
            (l) => l.name?.toLowerCase().includes("smal") || l.height < 45
          );

          const labelToSelect = defaultLabel?.id || availableLabels[0]?.id;
          
          if (labelToSelect && labelToSelect !== selectedLabelId) {
             setSelectedLabelId(labelToSelect);
          }
          
        }
      } catch (e) {
        console.error("Fout bij laden labels:", e);
      }
    };
    setDefaultLabel();
  }, [isOpen, order, availableLabels, loadingLabels, stationId, isFlangeOrder, selectedLabelId]);
  
  // 1b. Operators ophalen voor dit station
  useEffect(() => {
    const fetchOccupancy = async () => {
      if (!isOpen || !stationId) return;
      const today = new Date().toISOString().split('T')[0];
      try {
        const occPaths = PATHS?.OCCUPANCY || ['future-factory', 'personnel', 'occupancy'];
        const q = query(
          collection(db, ...occPaths),
          where("machineId", "==", stationId),
          where("date", "==", today)
        );
        const snapshot = await getDocs(q);
        const operators = snapshot.docs.map(doc => ({
          number: doc.data().operatorNumber,
          name: doc.data().operatorName
        }));
        setAssignedOperators(operators);
        if (operators.length === 1) {
          setOperatorInput(operators[0].number);
        } else {
          setOperatorInput("");
        }
      } catch (err) {
        console.error("Kon operators niet ophalen", err);
      }
    };
    fetchOccupancy();
  }, [isOpen, stationId]);

  // 1c. Printers ophalen
  useEffect(() => {
    if(!isOpen) return;
    try {
        const prnPaths = PATHS?.PRINTERS || ['future-factory', 'settings', 'printers'];
        const printersRef = collection(db, ...prnPaths);
        const unsub = onSnapshot(printersRef, (snap) => {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setSavedPrinters(list);
          const targetPrinter = resolveTargetPrinter(list, stationId);

          if (targetPrinter) {
            // Default naar 'queue' als er een printer is geconfigureerd voor dit station.
            // De gebruiker kan dit handmatig aanpassen met de print-mode knoppen.
            setPrintConfig(prev => ({
              ...prev,
              mode: 'queue',
              printerId: prev.printerId || targetPrinter.id
            }));
          }
        });
        return () => unsub();
    } catch(e) {
        console.error("Kon printers niet laden", e);
    }
  }, [stationId, isOpen]);

  // --- SLIMME LOTNUMMER GENERATOR (FPI STANDAARD) ---

  const checkLotNumberExists = async (lotToCheck) => {
    if (!lotToCheck) return false;
    try {
      const normalizedLot = String(lotToCheck || "").trim().toUpperCase();
      if (!normalizedLot) return false;

      // 1) Lokale context check (realtime meegegeven producten in de modal)
      const localExists = (existingProducts || []).some((p) => {
        const lot = String(p?.lotNumber || "").trim().toUpperCase();
        const activeLot = String(p?.activeLot || "").trim().toUpperCase();
        return lot === normalizedLot || activeLot === normalizedLot;
      });
      if (localExists) return true;

      // 2) Actieve tracking check (bron van waarheid voor lopende productie)
      const trackingRef = collection(db, ...PATHS.TRACKING);
      const trackingByLotSnap = await getDocs(query(trackingRef, where("lotNumber", "==", normalizedLot), limit(1)));
      if (!trackingByLotSnap.empty) return true;

      // 3) Legacy active production check (orders met activeLot)
      const actPaths = PATHS?.ACTIVE_PRODUCTION || ["future-factory", "production", "active"];
      const activeRef = collection(db, ...actPaths);
      const activeLotSnap = await getDocs(query(activeRef, where("activeLot", "==", normalizedLot), limit(1)));
      if (!activeLotSnap.empty) return true;

      // 4) Multi-year archive check (failsafe tegen hergebruik van historische lotnummers)
      const currentYear = new Date().getFullYear();
      const yearsToCheck = Array.from({ length: LOT_ARCHIVE_LOOKBACK_YEARS }, (_, idx) => currentYear - idx);

      for (const year of yearsToCheck) {
        const archiveRef = collection(db, ...getArchiveItemsPath(year));
        const archiveSnap = await getDocs(query(archiveRef, where("lotNumber", "==", normalizedLot), limit(1)));
        if (!archiveSnap.empty) return true;
      }

      return false;
    } catch (error) {
      console.error("Fout bij lot validatie:", error);
      return false;
    }
  };

  const getHighestSequenceForBaseLot = async (baseLotStr, stationId, weekSuffix) => {
    let maxSeq = 0;
    
    const safeStationId = (stationId || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const counterDocId = `${safeStationId}_${weekSuffix}`;
    const counterRef = doc(db, "future-factory", "production", "counters", counterDocId);

    try {
        const counterSnap = await getDoc(counterRef);
        if (counterSnap.exists()) {
            return counterSnap.data().lastSequence || 0;
        }
    } catch (e) {
        console.error("Fout bij lezen counter:", e);
    }

    const extractSeq = (lot) => {
        if (!lot || !lot.startsWith(baseLotStr)) return 0;
        const seqStr = lot.substring(baseLotStr.length).replace(/[^0-9]/g, '');
        const seq = parseInt(seqStr, 10);
        return isNaN(seq) ? 0 : seq;
    };

    existingProducts?.forEach(p => {
        const seq = extractSeq(p.lotNumber || p.activeLot);
        if (seq > maxSeq) maxSeq = seq;
    });

    try {
        const activePath = PATHS?.ACTIVE_PRODUCTION || ['future-factory', 'production', 'active'];
        const activeRef = collection(db, ...activePath);
        const activeSnap = await getDocs(activeRef);
        activeSnap.forEach(doc => {
            const data = doc.data();
            const seq = extractSeq(data.lotNumber || data.activeLot);
            if (seq > maxSeq) maxSeq = seq;
        });

        const archiveRef = collection(db, ...getArchiveItemsPath(new Date().getFullYear()));
        const q = query(
            archiveRef, 
            where("lotNumber", ">=", baseLotStr),
            where("lotNumber", "<=", baseLotStr + '\uf8ff')
        );
        const archiveSnap = await getDocs(q);
        archiveSnap.forEach(doc => {
            const seq = extractSeq(doc.data().lotNumber);
            if (seq > maxSeq) maxSeq = seq;
        });

    } catch (error) {
        console.error("Fout bij ophalen max sequence:", error);
    }

    try {
        await setDoc(counterRef, { lastSequence: maxSeq, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) { console.error("Kon counter niet initialiseren", e); }

    return maxSeq;
  };

  const consumeRecycledSequence = async (baseLot, station, weekSuffix) => {
    const safeStationId = (station || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const counterDocId = `${safeStationId}_${weekSuffix}`;
    const counterRef = doc(db, "future-factory", "production", "counters", counterDocId);
    const counterSnap = await getDoc(counterRef);
    if (!counterSnap.exists()) return null;

    const data = counterSnap.data() || {};
    const recycled = Array.isArray(data.recycledSequences)
      ? data.recycledSequences
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n > 0)
          .sort((a, b) => a - b)
      : [];

    for (const seq of recycled) {
      const candidate = `${baseLot}${String(seq).padStart(4, '0')}`;
      const exists = await checkLotNumberExists(candidate);
      if (!exists) {
        const nextRecycled = recycled.filter((n) => n !== seq);
        await setDoc(counterRef, { recycledSequences: nextRecycled, updatedAt: serverTimestamp() }, { merge: true });
        return candidate;
      }
    }

    return null;
  };

  const claimAutoLotRange = async (count = 1) => {
    const quantity = Math.max(1, parseInt(String(count || 1), 10) || 1);
    const d = new Date();
    const iso = getIsoWeekAndYear(d);

    const bedrijf = "40";
    const jaar = iso.year.slice(-2);
    const week = iso.week;
    const machine = getMachineCode(stationId);
    const land = "40";

    const baseLot = `${bedrijf}${jaar}${week}${machine}${land}`;
    const safeStationId = (stationId || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const counterDocId = `${safeStationId}_${jaar}${week}`;
    const counterRef = doc(db, "future-factory", "production", "counters", counterDocId);

    return runTransaction(db, async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const counterData = counterSnap.exists() ? (counterSnap.data() || {}) : {};

      const lastSequence = Number.isFinite(Number(counterData.lastSequence))
        ? Number(counterData.lastSequence)
        : 0;

      const recycled = Array.isArray(counterData.recycledSequences)
        ? Array.from(new Set(counterData.recycledSequences
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n > 0)))
            .sort((a, b) => a - b)
        : [];

      const maxAttempts = 250;
      let attempts = 0;
      let recycledIndex = 0;
      let sequenceToTry = recycled.length > 0 && quantity === 1 ? recycled[0] : (lastSequence + 1);

      while (attempts < maxAttempts) {
        attempts += 1;
        const usingRecycled = quantity === 1 && recycledIndex < recycled.length && sequenceToTry === recycled[recycledIndex];
        let hasCollision = false;

        if (sequenceToTry <= 0 || sequenceToTry + quantity - 1 > 9999) {
          hasCollision = true;
        }

        if (!hasCollision) {
          for (let i = 0; i < quantity; i++) {
            const seq = sequenceToTry + i;
            const candidateLot = `${baseLot}${String(seq).padStart(4, "0")}`;
            const candidateRef = doc(db, ...PATHS.TRACKING, candidateLot);
            const candidateSnap = await tx.get(candidateRef);
            if (candidateSnap.exists()) {
              hasCollision = true;
              break;
            }
          }
        }

        if (!hasCollision) {
          const nextRecycled = usingRecycled
            ? recycled.filter((n) => n !== sequenceToTry)
            : recycled;
          const newLast = Math.max(lastSequence, sequenceToTry + quantity - 1);

          tx.set(counterRef, {
            lastSequence: newLast,
            recycledSequences: nextRecycled,
            updatedAt: serverTimestamp(),
          }, { merge: true });

          return `${baseLot}${String(sequenceToTry).padStart(4, "0")}`;
        }

        if (usingRecycled) {
          recycledIndex += 1;
          if (recycledIndex < recycled.length) {
            sequenceToTry = recycled[recycledIndex];
          } else {
            sequenceToTry = Math.max(lastSequence + 1, sequenceToTry + 1);
          }
        } else {
          sequenceToTry += 1;
        }
      }

      throw new Error("Geen uniek lotnummer beschikbaar voor deze machine/week.");
    });
  };

  useEffect(() => {
    let isMounted = true;

    const generateRobustLotNumber = async () => {
      if (!isOpen || !order || mode !== "auto") return;
      setIsCheckingLot(true);

      try {
        const d = new Date();
        const iso = getIsoWeekAndYear(d);
        
        const bedrijf = "40";
        const jaar = iso.year.slice(-2);
        const week = iso.week;
        const machine = getMachineCode(stationId);
        const land = "40";

        const baseLot = `${bedrijf}${jaar}${week}${machine}${land}`;
        const weekSuffix = `${jaar}${week}`;

        const recycledLot = await consumeRecycledSequence(baseLot, stationId, weekSuffix);
        if (recycledLot) {
          if (isMounted) {
            setLotNumber(recycledLot);
            setLotError("");
          }
          return;
        }

        const highestSeq = await getHighestSequenceForBaseLot(baseLot, stationId, weekSuffix);
        
        let counter = highestSeq + 1;
        
        let newLotNumber = `${baseLot}${String(counter).padStart(4, '0')}`;

        while (await checkLotNumberExists(newLotNumber)) {
            counter++;
            newLotNumber = `${baseLot}${String(counter).padStart(4, '0')}`;
            if (counter > 9999) break; 
        }

        if (isMounted) {
            setLotNumber(newLotNumber);
            setLotError("");
        }
      } catch (error) {
        console.error("Error setting lot number", error);
        if (isMounted) setLotError("Waarschuwing: Kan uniciteit niet garanderen.");
      } finally {
        if (isMounted) setIsCheckingLot(false);
      }
    };

    generateRobustLotNumber();

    if (isOpen && mode === "manual") {
      setManualLotInput("");
      setManualOrderInput("");
      setLotError("");
    }

    return () => { isMounted = false; };
  }, [isOpen, order, mode, stationId]);

  const updateCounterOnStart = async (usedLotNumber, count) => {
      if (!usedLotNumber || mode !== "auto") return;
      try {
          const d = new Date();
          const iso = getIsoWeekAndYear(d);
          const year = iso.year.slice(-2);
          const week = iso.week;
          
          const safeStationId = (stationId || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9]/g, "");
          const counterDocId = `${safeStationId}_${year}${week}`;
          const counterRef = doc(db, "future-factory", "production", "counters", counterDocId);
          
          const currentSeq = parseInt(usedLotNumber.slice(-5), 10);
          const newMax = currentSeq + (count - 1);
          const counterSnap = await getDoc(counterRef);
          const counterData = counterSnap.exists() ? (counterSnap.data() || {}) : {};
          const recycled = Array.isArray(counterData.recycledSequences)
            ? counterData.recycledSequences.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
            : [];
          const nextRecycled = recycled.filter((n) => n !== currentSeq);

          await setDoc(counterRef, { lastSequence: newMax, recycledSequences: nextRecycled, updatedAt: serverTimestamp() }, { merge: true });

          const twoWeeksAgo = new Date();
          twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
          const isoOld = getIsoWeekAndYear(twoWeeksAgo);
          const oldDocId = `${safeStationId}_${isoOld.year.slice(-2)}${isoOld.week}`;
          
          await deleteDoc(doc(db, "future-factory", "production", "counters", oldDocId)).catch(() => {});

      } catch (e) { console.error("Kon counter niet updaten:", e); }
  };

  useEffect(() => {
    const previewEl = previewAreaRef.current || containerRef.current;
    if (!previewEl || !selectedLabel) return;

    const recalc = () => {
      const availableW = Math.max(120, previewEl.clientWidth - 24);
      const availableH = Math.max(120, previewEl.clientHeight - 24);
      const labelW = selectedLabel.width * PIXELS_PER_MM;
      const labelH = selectedLabel.height * PIXELS_PER_MM;

      if (labelW > 0 && labelH > 0) {
        const nextZoom = Math.min(5, availableW / labelW, availableH / labelH);
        setPreviewZoom(Math.max(0.45, nextZoom));
      }
    };

    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(previewEl);
    return () => ro.disconnect();
  }, [selectedLabel, isOpen]);

  const handleManualOrderChange = async (e) => {
    const value = e.target.value.toUpperCase();
    setManualOrderInput(value);
    setOrderError("");
    setOrderValidated(false);
    scannerLikeLotInputRef.current = false;

    if (value.trim().length >= 4) {
      const expectedOrderId = order?.orderId?.toUpperCase();
      if (expectedOrderId && value.trim() === expectedOrderId) {
        setOrderValidated(true);
        setOrderError("");
        setTimeout(() => {
          lotInputRef.current?.focus();
        }, 100);
      } else if (value.trim().length >= expectedOrderId?.length) {
        setOrderError("Ordernummer komt niet overeen!");
      }
    }
  };

  const handleManualLotChange = async (e) => {
    const value = e.target.value.toUpperCase();
    const now = Date.now();
    const previousValue = previousLotInputRef.current;
    const deltaLength = value.length - previousValue.length;
    const deltaTime = now - lastLotInputAtRef.current;
    const looksScannerLike = deltaLength > 1 || (deltaLength === 1 && lastLotInputAtRef.current > 0 && deltaTime < 40);

    setManualLotInput(value);
    setLotNumber(value);
    setLotError("");

    if (!value.trim()) {
      scannerLikeLotInputRef.current = false;
    } else if (looksScannerLike) {
      scannerLikeLotInputRef.current = true;
    }

    previousLotInputRef.current = value;
    lastLotInputAtRef.current = now;
  };

  const canStartManual = isManualMode && orderValidated && !!manualLotInput.trim() && !orderError && !lotError && !isCheckingLot;
  const canStartAuto = !isManualMode && !!lotNumber && !isCheckingLot && !lotError;

  const handleStartProduction = async () => {
    if (isStarting) return;
    if (isManualMode && !canStartManual) return;
    if (!isManualMode && !canStartAuto) return;

    scannerLikeLotInputRef.current = false;

    if (!isManualMode && !isFlangeOrder && !selectedLabel) {
      alert("Selecteer eerst een label formaat.");
      return;
    }

    setIsStarting(true);
    try {
      let targetPrinter = null;
      let effectiveLotNumber = isManualMode ? manualLotInput.trim() : lotNumber;
      let printData = null;
      let counterClaimed = false;
      const totalToProduce = isManualMode
        ? Math.max(1, parseInt(stringCount, 10) || 1)
        : isFlangeOrder
        ? Math.max(1, Number(flangeSeriesInfo?.cavityCount || 1))
        : Math.max(1, parseInt(stringCount, 10) || 1);
      const labelsToPrint = isFlangeOrder ? 0 : Math.max(1, parseInt(labelCount, 10) || 1);
      const seriesGroupId = totalToProduce > 1
        ? `${String(order?.orderId || "ORDER").replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`
        : null;

      if (!isManualMode) {
        targetPrinter = await resolveTargetPrinterAsync();
        effectiveLotNumber = await claimAutoLotRange(totalToProduce);
        counterClaimed = true;
        setLotNumber(effectiveLotNumber);

        // Failsafe: ook na counter-claim expliciet controleren op bestaand lot (tracking + archief).
        const autoStartSeq = parseInt(String(effectiveLotNumber || "").slice(-4), 10);
        if (!Number.isFinite(autoStartSeq)) {
          throw new Error("Kan lotnummerreeks niet valideren.");
        }

        for (let i = 0; i < totalToProduce; i++) {
          const candidateLot = `${String(effectiveLotNumber).slice(0, -4)}${String(autoStartSeq + i).padStart(4, "0")}`;
          const exists = await checkLotNumberExists(candidateLot);
          if (exists) {
            throw new Error(`Lotnummer ${candidateLot} bestaat al (actief of archief). Probeer opnieuw.`);
          }
        }

        if (!isFlangeOrder && selectedLabel) {
          const dpiForPrint = getNormalizedPrinterDpi(targetPrinter, 203);
          const printPreviewData = {
            ...previewData,
            lotNumber: effectiveLotNumber,
          };
          printData = await generatePrintData(selectedLabel, printPreviewData, dpiForPrint);
        }
      } else {
        // Manual mode moet ook altijd uniciteit afdwingen voor we starten.
        const manualExists = await checkLotNumberExists(effectiveLotNumber);
        if (manualExists) {
          setLotError(`Lotnummer ${effectiveLotNumber} bestaat al (actief of archief).`);
          throw new Error(`Lotnummer ${effectiveLotNumber} bestaat al (actief of archief).`);
        }

        if (totalToProduce > 1) {
          const prefix = String(effectiveLotNumber || "").slice(0, -4);
          const startSeq = parseInt(String(effectiveLotNumber || "").slice(-4), 10);
          if (!prefix || !Number.isFinite(startSeq)) {
            throw new Error("Voor een string-run moet het handmatige lotnummer eindigen op 4 cijfers (bijv. ...0001).");
          }
          for (let i = 1; i < totalToProduce; i++) {
            const candidateLot = `${prefix}${String(startSeq + i).padStart(4, "0")}`;
            const exists = await checkLotNumberExists(candidateLot);
            if (exists) {
              throw new Error(`Lotnummer ${candidateLot} bestaat al (actief of archief). Kies een ander start-lot.`);
            }
          }
        }
      }

      if (!counterClaimed) {
        await updateCounterOnStart(effectiveLotNumber, totalToProduce);
      }
      await logActivity(auth.currentUser?.uid, "ORDER_RELEASE", `Order started: ${order.orderId}, Lot: ${effectiveLotNumber}`);

      await onStart(
        order,
        effectiveLotNumber,
        totalToProduce,
        isManualMode ? manualOrderInput : order.orderId,
        operatorInput,
        selectedOperatorName,
        printData,
        !isManualMode ? selectedLabelId : null,
        {
          isFlangeSeries: isFlangeOrder,
          seriesGroupId,
          skipStartLabel: isFlangeOrder,
        }
      );

      if (!isFlangeOrder && printConfig.mode === "queue" && labelsToPrint > 0 && selectedLabel && printData) {
        try {
          if (targetPrinter) {
            const queueJobId = await queuePrintJob(
              targetPrinter.id,
              printData,
              {
                description: `Label voor ${order.orderId} (Lot: ${effectiveLotNumber}) (x${labelsToPrint})`,
                quantity: labelsToPrint,
                orderId: order.orderId,
                lotNumber: effectiveLotNumber,
                stationId: stationId || "Onbekend",
                targetPrinterName: targetPrinter.name,
                width: parseInt(selectedLabel.width),
                height: parseInt(selectedLabel.height),
                variables: previewData,
                templateId: selectedLabel.id
              }
            );
            console.log("[ProductionStartModal] Queue print job created:", queueJobId, "printer:", targetPrinter.id);
            showSuccess(`${labelsToPrint} label(s) naar de wachtrij gestuurd voor printer: ${targetPrinter.name}`);
          } else {
            showError(`Order gestart, maar geen printer geconfigureerd voor station '${stationId}' en er is geen standaard printer ingesteld. Ga naar Admin > Printer Beheer.`);
          }
        } catch (printError) {
          console.error(printError);
          alert(`Order gestart, maar printen mislukte: ${printError.message}`);
          showError(`Order gestart, maar printen mislukte: ${printError.message}`);
        }
      }
    } catch (e) {
      console.error(e);
      showError(e.message || "Order starten mislukt.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleManualLotKeyDown = async (e) => {
    if ((e.key === "Enter" || e.key === "Tab") && canStartManual) {
      e.preventDefault();
      await handleStartProduction();
    }
  };

  useEffect(() => {
    if (manualLotAutoStartTimeoutRef.current) {
      clearTimeout(manualLotAutoStartTimeoutRef.current);
      manualLotAutoStartTimeoutRef.current = null;
    }

    if (!isManualMode || !canStartManual || isStarting || !scannerLikeLotInputRef.current) {
      return;
    }

    const snapshotLot = manualLotInput.trim();
    if (snapshotLot.length < 6) {
      return;
    }

    manualLotAutoStartTimeoutRef.current = setTimeout(() => {
      if (
        scannerLikeLotInputRef.current &&
        manualLotInput.trim() === snapshotLot &&
        document.activeElement === lotInputRef.current
      ) {
        void handleStartProduction();
      }
    }, 120);

    return () => {
      if (manualLotAutoStartTimeoutRef.current) {
        clearTimeout(manualLotAutoStartTimeoutRef.current);
        manualLotAutoStartTimeoutRef.current = null;
      }
    };
  }, [isManualMode, canStartManual, isStarting, manualLotInput, handleStartProduction]);

  useEffect(() => {
    if (!isOpen) return;
    return () => {
      if (manualLotAutoStartTimeoutRef.current) {
        clearTimeout(manualLotAutoStartTimeoutRef.current);
        manualLotAutoStartTimeoutRef.current = null;
      }
    };
  }, [isOpen]);

  const selectedOperatorName = assignedOperators.find(op => op.number === operatorInput)?.name;
  const showPreviewPane = mode !== "manual";

  if (!isOpen || !order || location.pathname.includes("/login")) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-2 md:p-4 backdrop-blur-md animate-in fade-in">
      <div className={`bg-white w-full max-w-6xl h-full md:h-[85vh] rounded-[40px] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-white/10 transition-all duration-300`}>
        {/* LINKS: CONFIGURATIE */}
        <div className={`${showPreviewPane ? "w-full md:w-1/3" : "w-full"} p-4 ${showPreviewPane ? "border-r" : ""} border-slate-100 flex flex-col bg-slate-50/50 overflow-y-auto custom-scrollbar`}>
          <div className="flex justify-between items-start mb-4">
            <div className="text-left">
              <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">
                Order Start
              </h2>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 text-left italic">
                {stationId}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4 flex-1 text-left">
            {/* Dossier info kaart */}
            <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm text-left">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="p-1.5 bg-slate-900 text-white rounded-lg">
                  <FileText size={14} />
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  Werkorder
                </span>
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none italic">
                {order.orderId}
              </h3>
              <p className="text-[10px] font-bold text-slate-500 mt-1.5 truncate uppercase">
                {order.item}
              </p>
              {order.drawing && (
                <div className="mt-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tekening</span>
                  <p className="text-xs font-bold text-slate-700">{order.drawing}</p>
                </div>
              )}
              {order.notes && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">PO Text / Opmerkingen</span>
                  <p className="text-xs font-medium text-slate-600 italic">{order.notes}</p>
                </div>
              )}
            </div>

            {/* Operator Selection */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Operator (Nr)
              </label>
              {assignedOperators.length > 1 ? (
                <div className="relative">
                  <select
                    value={operatorInput}
                    onChange={(e) => setOperatorInput(e.target.value)}
                    className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-600 shadow-sm appearance-none cursor-pointer"
                  >
                    <option value="">Kies operator...</option>
                    {assignedOperators.map((op) => (
                      <option key={op.number} value={op.number}>
                        {op.number} - {op.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ▼
                  </div>
                </div>
              ) : (
                <input
                  type="text"
                  value={operatorInput}
                  onChange={(e) => setOperatorInput(e.target.value)}
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-600 shadow-sm"
                  placeholder="Personeelsnummer"
                />
              )}
            </div>

            {/* Mode switcher */}
            <div className="flex bg-slate-200 p-1 rounded-xl">
              <button
                onClick={() => setMode("auto")}
                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${
                  mode === "auto"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                <RefreshCw size={12} /> Auto
              </button>
              <button
                onClick={() => setMode("manual")}
                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${
                  mode === "manual"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                <Keyboard size={12} /> Manueel
              </button>
            </div>

            {/* Lot invoer sectie */}
            {mode === "auto" ? (
              <div className="space-y-3 animate-in slide-in-from-top-2 text-left">
                <div className="bg-slate-900 p-4 rounded-2xl text-center shadow-xl border border-white/5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-5">
                    <QrCode size={48} />
                  </div>
                  <span className="text-[8px] font-black text-blue-400 uppercase tracking-[0.3em] block mb-1.5">
                    Huidig Lotnummer
                  </span>
                  <div className="flex justify-center items-center gap-2">
                    <div className={`text-2xl font-mono font-black ${lotError ? 'text-red-400' : 'text-white'} italic tracking-tighter`}>
                      {lotNumber || "LADEN..."}
                    </div>
                    {isCheckingLot && <Loader2 className="animate-spin text-white/50" size={16} />}
                  </div>
                  {lotError && <p className="text-red-400 text-xs mt-2 font-bold">{lotError}</p>}
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    Totaal Aantal
                  </label>
                  <div className="flex items-center gap-3 bg-white p-3 rounded-xl border-2 border-slate-100 focus-within:border-blue-500 transition-all shadow-sm">
                    <Layers size={18} className="text-blue-500" />
                    <input
                      type="number"
                      min="1"
                      value={stringCount}
                      onChange={(e) => setStringCount(sanitizePositiveIntInput(e.target.value))}
                      onBlur={() => setStringCount((prev) => normalizePositiveIntInput(prev))}
                      className="w-full font-black text-slate-800 outline-none text-lg"
                    />
                  </div>
                  {isFlangeOrder && (
                    <p className="text-[10px] font-bold text-emerald-700 mt-1 ml-1">
                      Flens-serie helper actief: {flangeSeriesInfo?.matchedTooling?.name || flangeSeriesInfo?.matchedTooling?.itemCode || flangeSeriesInfo?.matchedRule?.matcher || "standaard"} = {stringCount} per mal
                    </p>
                  )}
                </div>
                {!isFlangeOrder && (
                  <div className="space-y-1 text-left">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                      Aantal Labels Printen
                    </label>
                    <div className="flex items-center gap-3 bg-white p-3 rounded-xl border-2 border-slate-100 focus-within:border-blue-500 transition-all shadow-sm">
                      <Printer size={18} className="text-blue-500" />
                      <input
                        type="number"
                        min="1"
                        value={labelCount}
                        onChange={(e) => setLabelCount(sanitizePositiveIntInput(e.target.value))}
                        onBlur={() => setLabelCount((prev) => normalizePositiveIntInput(prev))}
                        className="w-full font-black text-slate-800 outline-none text-lg"
                      />
                    </div>
                  </div>
                )}
                {isFlangeOrder && (
                  <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold">
                    Voor flenzen worden bij start geen labels geprint. Labelprint gebeurt later bij Mazak.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 animate-in slide-in-from-top-2 text-left">
                <div className="space-y-1 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    Aantal in String
                  </label>
                  <div className="flex items-center gap-3 bg-white p-3 rounded-xl border-2 border-slate-100 focus-within:border-blue-500 transition-all shadow-sm">
                    <Layers size={18} className="text-blue-500" />
                    <input
                      type="number"
                      min="1"
                      value={stringCount}
                      onChange={(e) => setStringCount(sanitizePositiveIntInput(e.target.value))}
                      onBlur={() => setStringCount((prev) => normalizePositiveIntInput(prev))}
                      className="w-full font-black text-slate-800 outline-none text-lg"
                    />
                  </div>
                  {isFlangeOrder && (
                    <p className="text-[10px] font-bold text-emerald-700 mt-1 ml-1">
                      Mal-match actief: {flangeSeriesInfo?.matchedTooling?.name || flangeSeriesInfo?.matchedTooling?.itemCode || flangeSeriesInfo?.matchedRule?.matcher || "standaard"} = advies {flangeSeriesInfo?.cavityCount || 1}
                    </p>
                  )}
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    Ordernummer (scannen of invullen)
                  </label>
                  <div className="relative">
                    <input
                      ref={orderInputRef}
                      type="text"
                      value={manualOrderInput}
                      onChange={handleManualOrderChange}
                      placeholder={order?.orderId || "N2000000"}
                      className={`w-full p-3 bg-white border-2 rounded-2xl font-mono text-lg font-black uppercase outline-none shadow-sm text-center placeholder:text-slate-300 ${
                        orderError 
                          ? "border-red-500 focus:border-red-600 text-red-600" 
                          : orderValidated
                          ? "border-emerald-500 focus:border-emerald-600 text-emerald-600"
                          : "border-slate-100 focus:border-blue-600 text-slate-800"
                      }`}
                      required
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {orderError ? (
                        <AlertTriangle className="text-red-500" size={20} />
                      ) : orderValidated ? (
                        <CheckCircle2 className="text-emerald-500" size={20} />
                      ) : null}
                    </div>
                  </div>
                  {orderError && (
                    <p className="text-xs font-bold text-red-500 mt-1 pl-2">{orderError}</p>
                  )}
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    Lotnummer (scannen of invullen)
                  </label>
                  <div className="relative">
                    <input
                      ref={lotInputRef}
                      type="text"
                      value={manualLotInput}
                      onChange={handleManualLotChange}
                      onKeyDown={handleManualLotKeyDown}
                      placeholder="Handmatig Lot"
                      disabled={!orderValidated}
                      className={`w-full p-3 bg-white border-2 rounded-2xl font-mono text-xl font-black uppercase outline-none shadow-sm text-center placeholder:text-slate-300 ${
                        lotError 
                          ? "border-red-500 focus:border-red-600 text-red-600" 
                          : !lotError && manualLotInput.trim().length === 15
                          ? "border-emerald-500 focus:border-emerald-600 text-slate-800"
                          : "border-slate-100 focus:border-blue-600 text-slate-800"
                      } ${!orderValidated ? 'opacity-50 cursor-not-allowed' : ''}`}
                      required
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {isCheckingLot ? (
                        <Loader2 className="animate-spin text-blue-500" size={20} />
                      ) : lotError ? (
                        <AlertTriangle className="text-red-500" size={20} />
                      ) : manualLotInput.trim().length === 15 ? (
                        <CheckCircle2 className="text-emerald-500" size={20} />
                      ) : null}
                    </div>
                  </div>
                  {lotError && (
                    <p className="text-xs font-bold text-red-500 mt-1 pl-2">{lotError}</p>
                  )}
                </div>
              </div>
            )}

            {/* Label selectie */}
            {!isManualMode && !isFlangeOrder && <div className="pt-3 border-t border-slate-200 text-left">
              <label className="text-[9px] font-black text-slate-400 uppercase block mb-1.5 ml-2 flex items-center gap-2">
                Label Formaat
              </label>
              {loadingLabels ? (
                <div className="p-3 text-center text-xs text-slate-400 italic flex items-center justify-start gap-2">
                  <Loader2 size={14} className="animate-spin" /> Labels laden...
                </div>
              ) : availableLabels.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-700 flex items-center gap-2">
                  <AlertTriangle size={16} />
                  <span>Geen geschikte labels gevonden.</span>
                </div>
              ) : (
                <div className="relative group">
                  <select
                    value={selectedLabelId || ""}
                    onChange={(e) => setSelectedLabelId(e.target.value)}
                    className="w-full p-3 bg-white border-2 border-slate-100 rounded-xl text-xs font-black text-slate-700 outline-none focus:border-blue-600 shadow-sm appearance-none cursor-pointer group-hover:border-slate-300"
                  >
                    {availableLabels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.width}x{l.height}mm)
                      </option>
                    ))}
                  </select>
                  <Printer
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                </div>
              )}
            </div>}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-5 bg-white border-2 border-slate-100 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-100 transition-all"
            >
              Annuleren
            </button>
            <button
              onClick={handleStartProduction}
              disabled={
                isStarting ||
                (isManualMode && !canStartManual) ||
                (!isManualMode && !canStartAuto)
              }
              className={`flex-[2] py-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.15em] shadow-xl transition-all flex items-center justify-center gap-3 active:scale-95 ${
                isManualMode && canStartManual
                  ? "bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/50 animate-pulse"
                  : "bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
              }`}
            >
              {isCheckingLot || isStarting ? <Loader2 className="animate-spin" size={20} /> : <PlayCircle size={20} />} 
              {isStarting ? "Starten..." : (selectedOperatorName ? `Start (${operatorInput})` : "Order Starten")}
            </button>
          </div>
        </div>

        {/* RECHTS: DESIGN PREVIEW & PRINT ACTIE */}
        {showPreviewPane && <div
          ref={containerRef}
          className="flex-1 bg-slate-900 p-6 flex flex-col items-center justify-between relative overflow-hidden text-left"
        >
          <div className="absolute top-4 left-4 text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2 text-left">
            <Activity size={12} className="text-emerald-500" /> Etiket Preview
          </div>

          <div ref={previewAreaRef} className="flex-1 flex items-center justify-center w-full min-h-0 py-4">
            {mode === "manual" && (!manualLotInput || !manualOrderInput) ? (
              <div className="text-slate-700 p-20 border-2 border-dashed border-slate-800 rounded-[50px] text-xs uppercase font-black tracking-widest italic">
                Vul order en lot in...
              </div>
            ) : (
              selectedLabel ? (
                <LabelVisualPreview
                  label={selectedLabel}
                  data={previewData}
                  zoom={previewZoom}
                  className="shadow-[0_0_100px_rgba(0,0,0,0.8)] relative transition-all duration-500 origin-center border-2 border-white/10"
                />
              ) : (
                <div className="text-slate-700 p-20 border-2 border-dashed border-slate-800 rounded-[50px] animate-pulse text-xs uppercase font-black tracking-widest italic">
                  Ontwerp laden...
                </div>
              )
            )}
          </div>

          {/* --- PRINT AREA (ALLEEN PRINT KNOP) --- */}
          <div className="w-full max-w-sm bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-md mb-2 flex flex-col gap-3 animate-in slide-in-from-bottom-6 duration-700 text-left">
            <div className="flex justify-center items-center px-1">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Database size={12} className="text-purple-400" />
                Printen via Wachtrij
              </span>
            </div>

            <p className="text-[8px] text-slate-500 text-center font-bold uppercase tracking-tighter opacity-50">
              Label wordt automatisch geprint bij starten
            </p>
          </div>
        </div>}
      </div>
    </div>
  );
};

export default ProductionStartModal;
