// @ts-nocheck
import React, { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Save,
  Type,
  ScanBarcode,
  QrCode,
  Trash2,
  Settings,
  Grid,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Database,
  X,
  Loader2,
  Minus,
  Square,
  Copy,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ShieldCheck,
  Image as ImageIcon,
  Upload,
  Code,
  FilePlus,
  Search,
  Undo,
  Plus,
} from "lucide-react";
import {
  doc,
  setDoc,
  getDocs,
  collection,
  query,
  limit,
  serverTimestamp,
  onSnapshot,
  where,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";

// Importeer de logica en constanten uit het hulpbestand
import {
  LABEL_SIZES,
  processLabelData,
  resolveLabelContent,
} from "../../utils/labelHelpers";
import { generatePrintData, downloadZPL } from "../../utils/zplHelper";
import { getDriver } from "../../utils/printerDrivers";
import { useNotifications } from '../../contexts/NotificationContext';

/**
 * CRITICAL DPI PARITY: designer moet dezelfde schaal gebruiken als preview
 * zodat wat je ontwerpt exact overeenkomt met wat wordt geprint
 */
const CSS_PIXELS_PER_POINT = 96 / 72;
const SNAP_THRESHOLD_MM = 1.5;
const DEFAULT_PRINTER_DPI = 203;

/**
 * Berekent PIXELS_PER_MM voor gegeven printer-DPI
 * Hiermee wordt designer gesynchroniseerd met print-output
 */
const getPixelsPerMm = (printerDpi = DEFAULT_PRINTER_DPI) => {
  return (printerDpi || DEFAULT_PRINTER_DPI) / 25.4;
};
const PIXELS_PER_MM = getPixelsPerMm(DEFAULT_PRINTER_DPI);

const getLongestPreviewLineLength = (value) => {
  const lines = String(value || "").split(/\r?\n/);
  return lines.reduce((maxLen, line) => Math.max(maxLen, line.length), 0);
};

const getResolvedPreviewMaxLines = (element, baseFontPx, rotation = 0, zoom = 1, pixelsPerMm = 8.0) => {
  const explicitMaxLines = Number(element.maxLines);
  if (Number.isFinite(explicitMaxLines) && explicitMaxLines > 0) {
    return Math.max(1, Math.floor(explicitMaxLines));
  }

  const normalizedRotation = ((Number(rotation) || 0) % 360 + 360) % 360;
  const isVerticalRotation = normalizedRotation === 90 || normalizedRotation === 270;
  const blockHeightMm = isVerticalRotation
    ? (element.width || element.height || 0)
    : (element.height || 0);

  if (!blockHeightMm || !baseFontPx) return 1;

  const blockHeightPx = blockHeightMm * pixelsPerMm * zoom;
  const estimatedLineHeightPx = Math.max(1, baseFontPx * 1.05);
  return Math.max(1, Math.floor((blockHeightPx * 0.92) / estimatedLineHeightPx));
};

const getPreviewTextStyle = (element, content, zoom, rotation = 0, pixelsPerMm = 8.0) => {
  const normalizedRotation = ((Number(rotation) || 0) % 360 + 360) % 360;
  const isVerticalRotation = normalizedRotation === 90 || normalizedRotation === 270;
  const baseFontPx = (element.fontSize || 10) * CSS_PIXELS_PER_POINT * zoom;
  const maxLines = getResolvedPreviewMaxLines(element, baseFontPx, normalizedRotation, zoom, pixelsPerMm);

  if (isVerticalRotation) {
    const runLengthMm = element.height || element.width || 0;
    const runLengthPx = runLengthMm * pixelsPerMm * zoom;
    const lineBudgetMm = element.width || element.height || 0;
    const lineBudgetPx = lineBudgetMm * pixelsPerMm * zoom;

    if (runLengthPx > 0) {
      const longestLineLength = Math.max(1, getLongestPreviewLineLength(content));
      const estimatedLongestWrappedLine = Math.max(1, Math.ceil(longestLineLength / maxLines));
      const widthLimitedFontPx = (runLengthPx * 0.92) / (estimatedLongestWrappedLine * 0.52);
      const heightLimitedFontPx = lineBudgetPx ? (lineBudgetPx * 0.9) / maxLines : baseFontPx;
      const fittedFontPx = Math.max(1, Math.min(baseFontPx, widthLimitedFontPx, heightLimitedFontPx));
      return {
        fontSize: `${fittedFontPx}px`,
        lineHeight: "1.05",
      };
    }

    return {
      fontSize: `${baseFontPx}px`,
      lineHeight: "1.05",
    };
  }

  const effectiveWidthMm = isVerticalRotation
    ? (element.height || element.width || 0)
    : (element.width || 0);
  const blockWidthPx = effectiveWidthMm * pixelsPerMm * zoom;
  const blockHeightPx = element.height
    ? element.height * pixelsPerMm * zoom
    : null;

  if (!blockWidthPx) {
    return {
      fontSize: `${baseFontPx}px`,
      lineHeight: "1.05",
    };
  }

  const longestLineLength = Math.max(1, getLongestPreviewLineLength(content));
  const estimatedLongestWrappedLine = Math.max(1, Math.ceil(longestLineLength / maxLines));
  const widthLimitedFontPx = (blockWidthPx * 0.92) / (estimatedLongestWrappedLine * 0.52);
  const heightLimitedFontPx = blockHeightPx
    ? (blockHeightPx * 0.9) / maxLines
    : baseFontPx;
  const fittedFontPx = Math.max(1, Math.min(baseFontPx, widthLimitedFontPx, heightLimitedFontPx));

  return {
    fontSize: `${fittedFontPx}px`,
    lineHeight: "1.05",
  };
};
const LABEL_FOLDER_OPTIONS = [
  "Tijdelijk Wavistrong",
  "Tijdelijk Fibermar",
  "Tijdelijk Code",
  "Wavistrong",
  "Fibermar",
  "Code",
  "Flenzen",
];

/**
 * AdminLabelDesigner V4.2 - Standalone Admin Edition
 * Beheert labelontwerpen in de root: /future-factory/settings/label_templates/records/
 * Verplaatst van matrixmanager naar hoofd admin map.
 */
const AdminLabelDesigner = ({ onBack, openLabelId = null }) => {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const [labelName, setLabelName] = useState(t('adminLabelDesigner.newLabel'));
  const [selectedSizeKey, setSelectedSizeKey] = useState("Standard");
  const [labelWidth, setLabelWidth] = useState(LABEL_SIZES.Standard.width);
  const [labelHeight, setLabelHeight] = useState(LABEL_SIZES.Standard.height);
  const [labelTags, setLabelTags] = useState([]);
  const [labelFolder, setLabelFolder] = useState("");
  const [showTagManager, setShowTagManager] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  const [elements, setElements] = useState([]);
  const [selectedElementIds, setSelectedElementIds] = useState([]);
  const [zoom, setZoom] = useState(1.2);
  const [showGrid, setShowGrid] = useState(true);
  const [guidelines, setGuidelines] = useState([]);

  const [previewData, setPreviewData] = useState(null);
  const [showDataModal, setShowDataModal] = useState(false);
  const [availableOrders, setAvailableOrders] = useState([]);

  const [savedLabels, setSavedLabels] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [labelLogicRules, setLabelLogicRules] = useState([]);
  const [selectedLogicCode, setSelectedLogicCode] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Nieuwe state voor afdelingen
  const [departments, setDepartments] = useState([]);
  const [assignedDepartment, setAssignedDepartment] = useState("All");
  const [history, setHistory] = useState([]);
  const [stationFilter, setStationFilter] = useState("");

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastOpenedFromPropRef = useRef(null);

  // 1. Live Sync met de Root
  useEffect(() => {
    const colRef = collection(db, ...PATHS.LABEL_TEMPLATES);
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        setSavedLabels(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.error("Sync Error:", err)
    );

    return () => unsub();
  }, []);

  // 1b. Fetch Label Logic Rules
  useEffect(() => {
    const logicRef = collection(db, ...PATHS.LABEL_LOGIC);
    const unsub = onSnapshot(logicRef, (snap) => {
        const rules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setLabelLogicRules(rules);
    });
    return () => unsub();
  }, []);

  // 1c. Fetch Departments for assignment
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const docRef = doc(db, ...PATHS.FACTORY_CONFIG);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setDepartments(snap.data().departments || []);
        }
      } catch (e) {
        console.error("Error fetching departments:", e);
      }
    };
    fetchDepartments();
  }, []);

  const allStations = useMemo(() => {
    const stations = new Set();
    departments.forEach(dept => {
      if (dept.stations) {
        dept.stations.forEach(s => stations.add(s.name));
      }
    });
    return Array.from(stations).sort();
  }, [departments]);

  // Helper voor navigatie beveiliging (Dirty State Check)
  const confirmDiscardChanges = () => {
    if (!hasUnsavedChanges) return true;
    return window.confirm(t('adminLabelDesigner.overwriteConfirm', 'Je hebt niet-opgeslagen wijzigingen. Wil je deze negeren en doorgaan zonder op te slaan?'));
  };

  const loadLabelIntoDesigner = (label) => {
    if (!label) return;
    if (!confirmDiscardChanges()) return;

    setLabelName(label.name);
    setLabelWidth(label.width);
    setLabelHeight(label.height);
    if (label.sizeKey) setSelectedSizeKey(label.sizeKey);
    setAssignedDepartment(label.department || "All");
    setLabelTags(label.tags || []);
    setLabelFolder(label.folder || inferFolderFromTags(label.tags || []));
    setElements(label.elements || []);
    setSelectedElementIds([]);
    setHasUnsavedChanges(false);
  };

  useEffect(() => {
    if (!openLabelId) return;
    if (lastOpenedFromPropRef.current === openLabelId) return;
    if (!savedLabels || savedLabels.length === 0) return;

    const targetLabel = savedLabels.find(l => l.id === openLabelId);
    if (!targetLabel) return;

    loadLabelIntoDesigner(targetLabel);
    lastOpenedFromPropRef.current = openLabelId;
  }, [openLabelId, savedLabels]);

  const handleBack = () => {
    if (confirmDiscardChanges()) {
      onBack();
    }
  };

  const selectedElement = elements.find((el) => el.id === selectedElementIds[selectedElementIds.length - 1]);

  const filteredVariables = useMemo(() => {
      // Start with a set of all possible dynamic variables from all logic rules.
      const allVars = new Set();
      labelLogicRules.forEach(r => {
          r.variables?.forEach(v => { if(v.name) allVars.add(v.name); });
      });

      // If a specific product code is selected to filter the list
      if (selectedLogicCode) {
          const rule = labelLogicRules.find(r => r.productCode === selectedLogicCode);
          const ruleVars = new Set(rule?.variables?.map(v => v.name) || []);
          
          // Always add the currently selected element's variable to the list,
          // so it's visible even if it doesn't belong to the filtered rule.
          if (selectedElement?.variable) {
              ruleVars.add(selectedElement.variable);
          }
          return Array.from(ruleVars).sort();
      }
      
      // If no filter is active, show all variables.
      // Also ensure the current element's variable is present, just in case it's orphaned.
      if (selectedElement?.variable) {
        allVars.add(selectedElement.variable);
      }

      return Array.from(allVars).sort();
  }, [labelLogicRules, selectedLogicCode, selectedElement]);

  useEffect(() => {
    if (selectedSizeKey !== "Custom" && LABEL_SIZES[selectedSizeKey]) {
      setLabelWidth(LABEL_SIZES[selectedSizeKey].width);
      setLabelHeight(LABEL_SIZES[selectedSizeKey].height);
    }
  }, [selectedSizeKey]);

  // Helper om alle unieke tags te verzamelen
  const allUniqueTags = useMemo(() => {
    const tags = new Set();
    savedLabels.forEach(l => {
      if (l.tags && Array.isArray(l.tags)) {
        l.tags.forEach(t => tags.add(t));
      }
    });
    return Array.from(tags).sort();
  }, [savedLabels]);

  const inferFolderFromTags = (tags = []) => {
    const upperTags = tags.map(t => String(t).toUpperCase());
    const isTemp = upperTags.includes("TIJDELIJK") || upperTags.includes("TEMP");
    const hasWavi = upperTags.includes("WAVISTRONG");
    const hasFiber = upperTags.includes("FIBERMAR");
    const hasCode = upperTags.includes("CODE");
    const hasFlenzen = upperTags.includes("FLENS") || upperTags.includes("FLENZEN");

    if (isTemp && hasWavi) return "Tijdelijk Wavistrong";
    if (isTemp && hasFiber) return "Tijdelijk Fibermar";
    if (isTemp && hasCode) return "Tijdelijk Code";
    if (hasWavi) return "Wavistrong";
    if (hasFiber) return "Fibermar";
    if (hasCode) return "Code";
    if (hasFlenzen) return "Flenzen";
    return "";
  };

  const deleteTagGlobally = async (tagToDelete) => {
    if (!window.confirm(t('adminLabelDesigner.confirmGlobalTagDelete', `Weet je zeker dat je de tag '${tagToDelete}' overal wilt verwijderen? Dit past ${savedLabels.filter(l => l.tags?.includes(tagToDelete)).length} templates aan.`))) return;
    
    setIsLoading(true);
    try {
      const batch = writeBatch(db);
      let count = 0;
      
      savedLabels.forEach(label => {
        if (label.tags && label.tags.includes(tagToDelete)) {
          const newTags = label.tags.filter(t => t !== tagToDelete);
          const docRef = doc(db, ...PATHS.LABEL_TEMPLATES, label.id);
          batch.update(docRef, { tags: newTags, lastUpdated: serverTimestamp() });
          count++;
        }
      });

      if (count > 0) {
        await batch.commit();
        if (labelTags.includes(tagToDelete)) {
            setLabelTags(labelTags.filter(t => t !== tagToDelete));
        }
        notify(`Tag '${tagToDelete}' is verwijderd van ${count} templates.`);
      }
    } catch (e) {
      console.error("Tag delete error:", e);
      notify("Fout bij verwijderen tag: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Data Preview Handlers
  const fetchLiveOrders = async () => {
    setStationFilter("");
    setIsLoading(true);
    try {
      const q = query(collection(db, ...PATHS.PLANNING), limit(15));
      const snapshot = await getDocs(q);
      setAvailableOrders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setShowDataModal(true);
    } catch (e) {
      console.error("Fout bij ophalen orders:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStationFilterChange = async (station) => {
    setStationFilter(station);
    setIsLoading(true);
    try {
      let q;
      if (station) {
        q = query(collection(db, ...PATHS.PLANNING), where("machine", "==", station), limit(500));
      } else {
        q = query(collection(db, ...PATHS.PLANNING), limit(15));
      }
      const snapshot = await getDocs(q);
      setAvailableOrders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Filter fout:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchOrder = async (queryText) => {
    if (!queryText) {
        handleStationFilterChange(stationFilter); // Reset naar huidig filter
        return;
    }
    setIsLoading(true);
    try {
      const term = queryText.trim();
      // Zoek op orderId (start met...)
      const q = query(collection(db, ...PATHS.PLANNING), where("orderId", ">=", term), where("orderId", "<=", term + "\uf8ff"), limit(20));
      const snapshot = await getDocs(q);
      setAvailableOrders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Zoekfout:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const selectOrderForPreview = (order) => {
    setPreviewData(processLabelData(order));
    setShowDataModal(false);
  };

  const handleDownloadZPL = async () => {
    const data = previewData || {
      lotNumber: "TEST-LOT-001",
      orderId: "TEST-ORDER",
      itemCode: "TEST-ITEM",
      item: "Test Product Description",
      description: "Test Product Description",
      date: new Date().toLocaleDateString("nl-NL"),
    };

    const labelConfig = {
      width: labelWidth,
      height: labelHeight,
      elements: elements,
    };

    let resolvedDpi = 203;
    try {
      const printerSnap = await getDocs(collection(db, ...PATHS.PRINTERS));
      const printers = printerSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const targetPrinter = printers.find((p) => p.isDefault) || printers[0] || null;
      const driver = getDriver(targetPrinter);
      if (Number.isFinite(driver?.nativeDpi) && driver.nativeDpi > 0) {
        resolvedDpi = driver.nativeDpi;
      }
    } catch (e) {
      console.warn("Kon printer-DPI niet bepalen, fallback naar 203 DPI:", e);
    }

    const printData = await generatePrintData(labelConfig, data, resolvedDpi, resolveLabelContent, t);
    downloadZPL(printData, `${labelName.replace(/\s+/g, "_")}_preview.zpl`);
  };

  const addToHistory = () => {
    setHistory(prev => [...prev, { 
      elements: [...elements],
      labelWidth,
      labelHeight,
      selectedSizeKey,
      assignedDepartment,
      labelTags: [...labelTags],
      labelFolder,
    }]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setElements(previous.elements);
    setLabelWidth(previous.labelWidth);
    setLabelHeight(previous.labelHeight);
    setSelectedSizeKey(previous.selectedSizeKey);
    setAssignedDepartment(previous.assignedDepartment);
    setLabelTags(previous.labelTags || []);
    setLabelFolder(previous.labelFolder || "");
    setHistory(prev => prev.slice(0, -1));
  };

  const handleCopyFrom = (sourceId) => {
    const sourceLabel = savedLabels.find(l => l.id === sourceId);
    if (!sourceLabel) return;

    if (!confirmDiscardChanges()) {
        return;
    }

    addToHistory();

    setLabelWidth(sourceLabel.width);
    setLabelHeight(sourceLabel.height);
    if (sourceLabel.sizeKey) setSelectedSizeKey(sourceLabel.sizeKey);
    setAssignedDepartment(sourceLabel.department || "All");
    setLabelTags([]); // Reset tags bij kopiëren van ontwerp om vervuiling te voorkomen
    setLabelFolder("");
    
    const copiedElements = (sourceLabel.elements || []).map(el => ({
        ...el,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5)
    }));
    
    setElements(copiedElements);
    setSelectedElementIds([]);
    setHasUnsavedChanges(true);
  };

  const handleNewDesign = () => {
    if (!confirmDiscardChanges()) return;
    setLabelName(t('adminLabelDesigner.newLabel'));
    setLabelWidth(LABEL_SIZES.Standard.width);
    setLabelHeight(LABEL_SIZES.Standard.height);
    setSelectedSizeKey("Standard");
    setAssignedDepartment("All");
    setLabelTags([]);
    setLabelFolder("");
    setElements([]);
    setSelectedElementIds([]);
    setHasUnsavedChanges(false);
    setHistory([]);
  };

  // 6. Keyboard Navigation (Pijltjestoetsen voor precisie)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (selectedElementIds.length === 0) return;

      const isArrowKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
      if (!isArrowKey) return;

      e.preventDefault();

      // Voeg toe aan geschiedenis bij start van beweging (niet bij repeat)
      if (!e.repeat) {
          addToHistory();
      }

      const step = e.shiftKey ? 1 : 0.1; // 1mm (Shift) of 0.1mm (Precies)
      let dx = 0;
      let dy = 0;

      switch (e.key) {
        case 'ArrowUp': dy = -step; break;
        case 'ArrowDown': dy = step; break;
        case 'ArrowLeft': dx = -step; break;
        case 'ArrowRight': dx = step; break;
      }

      setElements(prev => prev.map(el => {
        if (selectedElementIds.includes(el.id)) {
          const newX = Math.round((el.x + dx) * 100) / 100;
          const newY = Math.round((el.y + dy) * 100) / 100;
          return { ...el, x: Math.max(0, newX), y: Math.max(0, newY) };
        }
        return el;
      }));
      setHasUnsavedChanges(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementIds, elements, labelWidth, labelHeight, selectedSizeKey, assignedDepartment, labelTags, labelFolder]);

  // 3. Designer Acties
  const addElement = (type) => {
    addToHistory();
    const newElement = {
      id: Date.now().toString(),
      type,
      x: 5,
      y: 5,
      width:
        type === "text" ? 40 : type === "line" ? 30 : type === "box" ? 30 : type === "image" ? 20 : 20,
      height:
        type === "text" ? 10 : type === "line" ? 0.5 : type === "box" ? 20 : type === "image" ? 20 : 20,
      thickness: type === "box" ? 0.5 : null,
      content:
        type === "text"
          ? t('adminLabelDesigner.manualTextContent')
          : type === "barcode"
          ? "123456"
          : type === "image" ? "" : "QR_DATA",
      fontSize: 10,
      align: "left",
      fontFamily: "Arial",
      isBold: false,
      rotation: 0,
      variable: "",
    };
    setElements([...elements, newElement]);
    setSelectedElementIds([newElement.id]);
    setHasUnsavedChanges(true);
  };

  const updateElement = (id, updates) => {
    setElements(
      elements.map((el) => (selectedElementIds.includes(el.id) ? { ...el, ...updates } : el))
    );
    setHasUnsavedChanges(true);
  };

  const removeSelected = () => {
    addToHistory();
    setElements(elements.filter((el) => !selectedElementIds.includes(el.id)));
    setSelectedElementIds([]);
    setHasUnsavedChanges(true);
  };

  const duplicateSelected = () => {
    if (selectedElementIds.length === 0) return;
    addToHistory();
    
    const newElements = [];
    const newSelection = [];

    elements.forEach(el => {
        if (selectedElementIds.includes(el.id)) {
            const copy = {
                ...el,
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                x: (el.x || 0) + 2,
                y: (el.y || 0) + 2
            };
            newElements.push(copy);
            newSelection.push(copy.id);
        }
    });

    setElements(prev => [...prev, ...newElements]);
    setSelectedElementIds(newSelection);
    setHasUnsavedChanges(true);
  };

  const alignCenter = (axis) => {
    if (selectedElementIds.length === 0) return;
    addToHistory();
    setElements(elements.map((el) => {
        if (selectedElementIds.includes(el.id)) {
            const updates = {};
            if (axis === "x") updates.x = (labelWidth - (el.width || 0)) / 2;
            else if (axis === "y") updates.y = (labelHeight - (el.height || 0)) / 2;
            return { ...el, ...updates };
        }
        return el;
    }));
  };

  // 4. Drag Engine met Snapping
  const handleMouseDown = (e, id) => {
    e.stopPropagation();
    addToHistory();
    
    let newSelection = [...selectedElementIds];
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
        if (newSelection.includes(id)) {
            newSelection = newSelection.filter(sid => sid !== id);
        } else {
            newSelection.push(id);
        }
    } else {
        if (!newSelection.includes(id)) {
            newSelection = [id];
        }
    }
    setSelectedElementIds(newSelection);

    if (!newSelection.includes(id)) return;

    const startX = e.clientX;
    const startY = e.clientY;
    
    const initialPositions = {};
    newSelection.forEach(sid => {
        const el = elements.find(e => e.id === sid);
        if (el) initialPositions[sid] = { x: el.x, y: el.y };
    });

    const handleMouseMove = (moveEvent) => {
      const pixelsPerMm = getPixelsPerMm(DEFAULT_PRINTER_DPI);
      const deltaX = (moveEvent.clientX - startX) / zoom / pixelsPerMm;
      const deltaY = (moveEvent.clientY - startY) / zoom / pixelsPerMm;

      const primaryEl = elements.find(e => e.id === id);
      const initialPrimary = initialPositions[id];
      
      let snapDeltaX = 0;
      let snapDeltaY = 0;
      const activeGuidelines = [];

      if (primaryEl && initialPrimary) {
          const primaryNewX = Math.max(0, initialPrimary.x + deltaX);
          const primaryNewY = Math.max(0, initialPrimary.y + deltaY);
          
          const labelCenterX = labelWidth / 2;
          const labelCenterY = labelHeight / 2;
          
          const myWidth = primaryEl.width || 0;
          const myHeight = primaryEl.height || 0;
          const myCenterX = primaryNewX + myWidth / 2;
          const myCenterY = primaryNewY + myHeight / 2;

          if (Math.abs(myCenterX - labelCenterX) < SNAP_THRESHOLD_MM) {
            snapDeltaX = (labelCenterX - myWidth / 2) - primaryNewX;
            activeGuidelines.push({ type: "vertical", pos: labelCenterX });
          }
          if (Math.abs(myCenterY - labelCenterY) < SNAP_THRESHOLD_MM) {
            snapDeltaY = (labelCenterY - myHeight / 2) - primaryNewY;
            activeGuidelines.push({ type: "horizontal", pos: labelCenterY });
          }
      }
      setGuidelines(activeGuidelines);

      const finalDeltaX = deltaX + snapDeltaX;
      const finalDeltaY = deltaY + snapDeltaY;

      setElements(prevElements => prevElements.map(el => {
          if (newSelection.includes(el.id)) {
              const init = initialPositions[el.id];
              if (init) {
                  return {
                      ...el,
                      x: Math.max(0, init.x + finalDeltaX),
                      y: Math.max(0, init.y + finalDeltaY)
                  };
              }
          }
          return el;
      }));
      setHasUnsavedChanges(true);
    };

    const handleMouseUp = () => {
      setGuidelines([]);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // 5. Opslaan
  const saveLabel = async (nameOverride = null, tagsOverride = null) => {
    const nameToUse = nameOverride || labelName;
    if (!nameToUse.trim()) return notify(t('adminLabelDesigner.enterLabelName'));
    setIsLoading(true);
    try {
      const labelId = nameToUse.trim().replace(/[^a-zA-Z0-9-_]/g, "_").toLowerCase();
      const docRef = doc(db, ...PATHS.LABEL_TEMPLATES, labelId);

      // Sanitize elements to ensure no undefined values (Firestore rejects undefined)
      const sanitizedElements = elements.map(el => {
        const cleanEl = { ...el };
        Object.keys(cleanEl).forEach(key => {
          if (cleanEl[key] === undefined) {
            cleanEl[key] = null;
          }
        });
        return cleanEl;
      });

      const tagsToSave = tagsOverride !== null ? tagsOverride : (labelTags || []);

      await setDoc(docRef, {
        name: nameToUse,
        sizeKey: selectedSizeKey || "Custom",
        width: labelWidth || 0,
        height: labelHeight || 0,
        elements: sanitizedElements,
        department: assignedDepartment,
        tags: tagsToSave,
        folder: labelFolder || null,
        lastUpdated: serverTimestamp(),
        updatedBy: "Admin Designer",
      });
      await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Label template saved: ${nameToUse}`);
      setHasUnsavedChanges(false);
      
      if (nameOverride) {
          setLabelName(nameToUse);
          if (tagsOverride !== null) setLabelTags(tagsOverride);
          notify(t('adminLabelDesigner.labelSavedAs', { name: nameToUse }));
      } else {
          notify(t('adminLabelDesigner.labelSaved'));
      }
    } catch (e) {
      console.error("Save error:", e);
      notify(t('adminLabelDesigner.saveError') + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAs = () => {
      const newName = prompt(t('adminLabelDesigner.enterNameForNew'), `${labelName}${t('adminLabelDesigner.copySuffix')}`);
      if (newName && newName.trim()) {
          saveLabel(newName, []); // Reset tags bij 'Opslaan Als' (nieuwe kopie)
      }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-100 overflow-hidden text-left animate-in fade-in">
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 px-8 py-3 flex justify-between items-center shadow-sm z-20 shrink-0 h-20">
        <div className="flex items-center gap-6">
          <button
            onClick={handleBack}
            className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all flex items-center gap-2 group"
          >
            <X
              size={18}
              className="group-hover:rotate-90 transition-transform"
            />
          </button>
          <div className="text-left">
            <h1 className="font-black text-slate-900 text-lg uppercase italic tracking-tighter leading-none">
              {t('label')} <span className="text-blue-600">{t('architect')}</span>
            </h1>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 flex items-center gap-1.5">
              <ShieldCheck size={10} className="text-emerald-500" /> {t('rootSync')}: /{PATHS.LABEL_TEMPLATES.join("/")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
             <input 
                type="text" 
                value={labelName} 
                onChange={(e) => { setLabelName(e.target.value); setHasUnsavedChanges(true); }}
                className="w-40 px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black text-slate-700 outline-none focus:border-blue-500 transition-all placeholder:text-slate-300"
                placeholder={t('adminLabelDesigner.labelNamePlaceholder')}
             />
          </div>
          <button
            onClick={handleNewDesign}
            className="p-3 bg-white border-2 border-slate-100 text-slate-600 hover:text-blue-600 hover:border-blue-100 rounded-2xl transition-all shadow-sm"
            title={t('common.new')}
          >
            <Plus size={18} />
          </button>
          <button
            onClick={handleDownloadZPL}
            className="p-3 bg-white border-2 border-slate-100 text-slate-600 hover:text-blue-600 hover:border-blue-100 rounded-2xl transition-all shadow-sm"
            title={t('adminLabelDesigner.downloadZplPreview', 'Download ZPL Preview')}
          >
            <Code size={18} />
          </button>
          <button
            onClick={fetchLiveOrders}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest border-2 transition-all ${
              previewData
                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                : "bg-white text-slate-600 border-slate-100 hover:bg-slate-50"
            }`}
          >
            <Database size={14} />
            {previewData ? t('liveDataLinked') : t('linkLiveOrder')}
          </button>

          <div className="flex items-center gap-2 bg-slate-50 border-2 border-slate-100 rounded-2xl p-1" title={t('adminLabelDesigner.copyFromTooltip', 'Kopieer ontwerp')}>
             <div className="pl-3 text-slate-400"><Copy size={14} /></div>
             <select
              onChange={(e) => handleCopyFrom(e.target.value)}
              className="bg-transparent text-[10px] font-black uppercase outline-none pr-4 py-2 cursor-pointer max-w-[100px]"
              value=""
            >
              <option value="" disabled>{t('common.copy', 'Kopieer...')}</option>
              {savedLabels.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border-2 border-slate-100 rounded-2xl p-1">
            <select
              value={selectedSizeKey}
              onChange={(e) => { setSelectedSizeKey(e.target.value); setHasUnsavedChanges(true); }}
              className="bg-transparent text-[10px] font-black uppercase outline-none px-4 py-2 cursor-pointer"
            >
              {Object.keys(LABEL_SIZES).map((s) => (
                <option key={s} value={s}>
                  {LABEL_SIZES[s].name}
                </option>
              ))}
              <option value="Custom">{t('common.customSize')}</option>
            </select>
            {selectedSizeKey === "Custom" && (
              <div className="flex items-center gap-1 pr-2 border-l border-slate-200 pl-2 animate-in fade-in slide-in-from-left-2">
                <input
                  type="number"
                  value={labelWidth}
                  onChange={(e) => { setLabelWidth(Number(e.target.value)); setHasUnsavedChanges(true); }}
                  className="w-10 bg-transparent text-[10px] font-bold text-center outline-none border-b border-slate-300 focus:border-blue-500"
                  title={t('widthMm')}
                />
                <span className="text-[10px] text-slate-400">x</span>
                <input
                  type="number"
                  value={labelHeight}
                  onChange={(e) => { setLabelHeight(Number(e.target.value)); setHasUnsavedChanges(true); }}
                  className="w-10 bg-transparent text-[10px] font-bold text-center outline-none border-b border-slate-300 focus:border-blue-500"
                  title={t('heightMm')}
                />
                <span className="text-[10px] text-slate-400">mm</span>
              </div>
            )}
          </div>

          {/* Nieuwe Department Selector */}
          <div className="flex items-center gap-2 bg-slate-50 border-2 border-slate-100 rounded-2xl p-1">
            <select
              value={assignedDepartment}
              onChange={(e) => { setAssignedDepartment(e.target.value); setHasUnsavedChanges(true); }}
              className="bg-transparent text-[10px] font-black uppercase outline-none px-4 py-2 cursor-pointer max-w-[150px]"
            >
              <option value="All">{t('adminUsers.allDepartments', 'Alle Afdelingen')}</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSaveAs}
            disabled={isLoading}
            className="p-4 bg-slate-100 text-slate-600 rounded-2xl hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm active:scale-95 border-2 border-transparent hover:border-blue-100"
            title={t('adminLabelDesigner.saveAsTitle')}
          >
            <FilePlus size={18} />
          </button>

          <button
            onClick={() => saveLabel()}
            disabled={isLoading}
            className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-blue-600 transition-all shadow-xl active:scale-95 flex items-center gap-3"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Save size={16} />
            )} {t('save')}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT BAR: TOOLS */}
        <div className="w-72 bg-white border-r border-slate-200 flex flex-col z-10 shrink-0">
          <div className="p-6 border-b border-slate-50">
            <h3 className="text-[10px] font-black uppercase text-slate-400 mb-5 tracking-widest">
              {t('components')}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { type: "text", label: t('manualText'), icon: Type },
                { type: "line", label: t('line'), icon: Minus },
                { type: "box", label: t('box'), icon: Square },
                { type: "barcode", label: t('barcode'), icon: ScanBarcode },
                { type: "qr", label: t('qrCode'), icon: QrCode },
                { type: "image", label: t('image'), icon: ImageIcon },
              ].map((tool) => (
                <button
                  key={tool.type}
                  onClick={() => addElement(tool.type)}
                  className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 border-2 border-transparent hover:border-blue-100 rounded-[25px] transition-all group active:scale-90"
                >
                  <tool.icon
                    size={22}
                    className="mb-2 text-slate-400 group-hover:text-blue-500"
                  />
                  <span className="text-[9px] font-black uppercase tracking-tighter">
                    {tool.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar text-left flex flex-col">
            <div className="text-[11px] text-slate-500 font-semibold bg-slate-50 border border-slate-200 rounded-2xl p-4">
              {t('adminLabelDesigner.templatesOverviewMoved')}
            </div>
          </div>
        </div>

        {/* CANVAS AREA */}
        <div className="flex-1 bg-slate-200 relative overflow-hidden flex flex-col items-center justify-center">
          <div className="absolute top-6 bg-white/90 backdrop-blur rounded-full px-6 py-3 shadow-2xl border border-slate-200 flex items-center gap-6 z-10">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
              >
                <ZoomOut size={18} />
              </button>
              <span className="text-xs font-black text-slate-800 w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(4, z + 0.1))}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
              >
                <ZoomIn size={18} />
              </button>
            </div>
            <div className="w-px h-5 bg-slate-200"></div>
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`p-2 rounded-xl transition-all ${
                showGrid ? "bg-blue-100 text-blue-600" : "text-slate-400"
              }`}
            >
              <Grid size={18} />
            </button>
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              className={`p-2 rounded-xl transition-all ${
                history.length > 0 ? "text-slate-600 hover:bg-slate-100" : "text-slate-300 cursor-not-allowed"
              }`}
              title={t('common.undo', 'Ongedaan maken')}
            >
              <Undo size={18} />
            </button>
          </div>

          <div
            className="w-full h-full flex items-center justify-center p-20 overflow-auto"
            onClick={() => setSelectedElementIds([])}
          >
            <div
              ref={canvasRef}
              className="bg-white shadow-2xl relative transition-all duration-75 overflow-hidden border border-slate-300"
              style={{
                width: `${labelWidth * PIXELS_PER_MM * zoom}px`,
                height: `${labelHeight * PIXELS_PER_MM * zoom}px`,
                backgroundImage: showGrid
                  ? "radial-gradient(#cbd5e1 1px, transparent 1px)"
                  : "none",
                backgroundSize: `${10 * PIXELS_PER_MM * zoom}px ${
                  10 * PIXELS_PER_MM * zoom
                }px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* GUIDELINES */}
              {guidelines.map((g, i) => (
                <div
                  key={i}
                  className="absolute bg-blue-500/50 z-30 pointer-events-none"
                  style={{
                    left:
                      g.type === "vertical"
                        ? `${g.pos * PIXELS_PER_MM * zoom}px`
                        : 0,
                    top:
                      g.type === "horizontal"
                        ? `${g.pos * PIXELS_PER_MM * zoom}px`
                        : 0,
                    width: g.type === "vertical" ? "1px" : "100%",
                    height: g.type === "horizontal" ? "1px" : "100%",
                  }}
                />
              ))}

              {elements.map((el) => (
                <div
                  key={el.id}
                  onMouseDown={(e) => handleMouseDown(e, el.id)}
                  className="absolute cursor-move group select-none"
                  style={{
                    left: `${el.x * PIXELS_PER_MM * zoom}px`,
                    top: `${el.y * PIXELS_PER_MM * zoom}px`,
                    transform: `rotate(${el.rotation || 0}deg)`,
                    transformOrigin: "top left",
                  }}
                >
                  <div
                    className={`transition-all ${
                      selectedElementIds.includes(el.id)
                        ? "ring-2 ring-blue-500 ring-offset-4 bg-blue-50/20"
                        : "hover:ring-1 hover:ring-blue-300"
                    } p-0.5`}
                  >
                    {el.type === "text" && (() => {
                      const { content } = resolveLabelContent(el, previewData);
                      const hasContent = content !== null && content !== undefined && String(content).trim() !== "";
                      const normalizedRotation = ((Number(el.rotation) || 0) % 360 + 360) % 360;
                      const isVerticalRotation = normalizedRotation === 90 || normalizedRotation === 270;
                      const previewTextStyle = getPreviewTextStyle(el, content, zoom, normalizedRotation);
                      return (
                        <div
                          className="leading-tight"
                          style={{
                            ...previewTextStyle,
                            fontWeight: el.isBold ? "900" : "normal",
                            fontFamily: el.fontFamily,
                            width: isVerticalRotation
                              ? `${(el.height || el.width || 1) * PIXELS_PER_MM * zoom}px`
                              : `${el.width * PIXELS_PER_MM * zoom}px`,
                            height: isVerticalRotation
                              ? `${(el.width || el.height || 1) * PIXELS_PER_MM * zoom}px`
                              : (el.height
                                ? `${el.height * PIXELS_PER_MM * zoom}px`
                                : "auto"),
                            backgroundColor: el.isInverse ? "black" : "transparent",
                            color: hasContent ? (el.isInverse ? "white" : "black") : "#cbd5e1",
                            textAlign: el.align || "left",
                            overflow: "hidden",
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                            wordBreak: "normal",
                          }}
                        >
                          {hasContent ? content : t('adminLabelDesigner.noData')}
                        </div>
                      );
                    })()}
                    {el.type === "line" && (
                      <div
                        style={{
                          width: `${el.width * PIXELS_PER_MM * zoom}px`,
                          height: `${el.height * PIXELS_PER_MM * zoom}px`,
                          backgroundColor: "black",
                        }}
                      />
                    )}
                    {el.type === "box" && (
                      <div
                        style={{
                          width: `${el.width * PIXELS_PER_MM * zoom}px`,
                          height: `${el.height * PIXELS_PER_MM * zoom}px`,
                          border: `${
                            (el.thickness || 1) * PIXELS_PER_MM * zoom
                          }px solid black`,
                          boxSizing: "border-box",
                        }}
                      />
                    )}
                    {(el.type === "barcode" || el.type === "qr") && (
                      <div
                        className="bg-slate-50 border border-slate-300 flex items-center justify-center"
                        style={{
                          width: `${(el.width || 30) * PIXELS_PER_MM * zoom}px`,
                          height: `${
                            (el.height || 30) * PIXELS_PER_MM * zoom
                          }px`,
                        }}
                      >
                        <ScanBarcode
                          size={24 * zoom}
                          className="text-slate-400"
                        />
                      </div>
                    )}
                    {el.type === "image" && (
                      <div
                        style={{
                          width: `${(el.width || 20) * PIXELS_PER_MM * zoom}px`,
                          height: `${(el.height || 20) * PIXELS_PER_MM * zoom}px`,
                          display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden"
                        }}
                      >
                        {el.content ? <img src={el.content} alt="img" style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} /> : <ImageIcon size={24 * zoom} className="text-slate-300" />}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT SIDEBAR: PROPERTIES */}
        <div className="w-80 bg-white border-l border-slate-200 flex flex-col z-10 shrink-0 shadow-2xl">
          <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between gap-3">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest italic flex items-center gap-2">
              <Settings size={14} /> {t('common.inspector')}
            </h3>
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-all ${
                history.length > 0
                  ? "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                  : "bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed"
              }`}
              title={t('common.undo', 'Ongedaan maken')}
            >
              {t('common.undo', 'Undo')}
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar text-left">
            {!selectedElement ? (
              <div className="space-y-6 animate-in slide-in-from-right-2">
                <div className="border-b border-slate-100 pb-4">
                  <div className="mb-4">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                      Vaste Map
                    </h4>
                    <select
                      value={labelFolder}
                      onChange={(e) => {
                        addToHistory();
                        setLabelFolder(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-all"
                    >
                      <option value="">Geen vaste map</option>
                      {LABEL_FOLDER_OPTIONS.map(folder => (
                        <option key={folder} value={folder}>{folder}</option>
                      ))}
                    </select>
                    <p className="text-[9px] text-slate-400 italic leading-relaxed mt-2">
                      Kies een vaste map voor ordening in Label Manager.
                    </p>
                  </div>

                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                      Label Koppelingen (Tags)
                    </h4>
                    <button
                      onClick={() => setShowTagManager(true)}
                      className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Settings size={10} /> {t('adminLabelDesigner.manageTags', 'Beheer')}
                    </button>
                  </div>
                  <div className="space-y-3">
                    <input
                      type="text" 
                      placeholder={t('adminLabelDesigner.tagPlaceholder', 'bv. Wavistrong, EMT, EST')}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-all"
                      onBlur={(e) => {
                        const val = e.target.value;
                        if (val) {
                          const newTags = val.split(',').map(t => t.trim().toUpperCase()).filter(t => t);
                          const uniqueNewTags = [...new Set(newTags)].filter(t => !labelTags.includes(t));
                          if (uniqueNewTags.length > 0) {
                            addToHistory();
                            setLabelTags([...labelTags, ...uniqueNewTags]);
                            setHasUnsavedChanges(true);
                          }
                          e.target.value = '';
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = e.target.value;
                          if (val) {
                            const newTags = val.split(',').map(t => t.trim().toUpperCase()).filter(t => t);
                            const uniqueNewTags = [...new Set(newTags)].filter(t => !labelTags.includes(t));
                            if (uniqueNewTags.length > 0) {
                              addToHistory();
                              setLabelTags([...labelTags, ...uniqueNewTags]);
                              setHasUnsavedChanges(true);
                            }
                            e.target.value = '';
                          }
                        }
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      {labelTags.map(tag => (
                        <span key={tag} className="bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 border border-blue-100">
                          {tag}
                          <button onClick={() => {
                            addToHistory();
                            setLabelTags(labelTags.filter(t => t !== tag));
                            setHasUnsavedChanges(true);
                          }} className="hover:text-blue-800"><X size={10} /></button>
                        </span>
                      ))}
                    </div>
                    <p className="text-[9px] text-slate-400 italic leading-relaxed">
                      {t('adminLabelDesigner.tagHelpText', 'Voeg tags toe om dit label te koppelen aan specifieke productsoorten. Als er geen tags zijn, is dit label beschikbaar voor alle producten.')}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-in slide-in-from-right-2">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left block ml-1">
                    {t('contentAndVariable')}
                  </label>
                  {selectedElement.type === "image" ? (
                    <div className="flex flex-col gap-3">
                       {selectedElement.content && (
                          <div className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center p-2">
                             <img src={selectedElement.content} className="max-w-full max-h-full object-contain" alt="preview" />
                          </div>
                       )}
                       <button 
                         onClick={() => fileInputRef.current?.click()}
                         className="w-full py-3 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold border border-blue-100 hover:bg-blue-100 transition-all flex items-center justify-center gap-2"
                       >
                         <Upload size={14} /> {t('uploadImage')}
                       </button>
                       <input 
                          type="file" 
                          ref={fileInputRef} 
                          className="hidden" 
                          accept="image/*"
                          onChange={(e) => {
                             const file = e.target.files[0];
                             if(file) {
                               const reader = new FileReader();
                               reader.onload = (ev) => {
                                  updateElement(selectedElement.id, { content: ev.target.result });
                               };
                               reader.readAsDataURL(file);
                             }
                          }}
                       />
                    </div>
                  ) : (
                    <>
                      <div className="mb-2">
                          <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 block mb-1">{t('filterProductCode')}</label>
                          <select
                              value={selectedLogicCode}
                              onChange={(e) => setSelectedLogicCode(e.target.value)}
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none text-slate-600"
                          >
                              <option value="">{t('allVariables')}</option>
                              {labelLogicRules.sort((a,b) => a.productCode.localeCompare(b.productCode)).map(r => (
                                  <option key={r.id} value={r.productCode}>{r.productCode}</option>
                              ))}
                          </select>
                      </div>
                      <select
                        value={selectedElement.variable}
                        onChange={(e) =>
                          updateElement(selectedElement.id, {
                            variable: e.target.value,
                            content: e.target.value
                              ? `{${e.target.value}}`
                              : t('manualText'),
                          })
                        }
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-xs font-bold"
                      >
                        <option value="">{t('staticText')}</option>
                        <option value="lotNumber">{t('lotNumber')}</option>
                        <option value="orderId">{t('orderNumber')}</option>
                        <option value="itemCode">{t('itemCode')}</option>
                        <option value="productType">{t('productType')}</option>
                        <option value="diameter">{t('diameterDn')}</option>
                        <option value="pressure">{t('pressurePn')}</option>
                        <option value="innerDiameter">{t('innerDiameter')}</option>
                        <option value="nprs">{t('nprs')}</option>
                        <option value="pq">{t('pq')}</option>
                        <option value="temperature">{t('temperatureLimit')}</option>
                        <option value="date">{t('productionDate')}</option>
                        <option value="idLine">ID Line</option>
                        <option value="pressureLine">Pressure Line</option>
                        <option value="pressureLineEmt">Pressure Line EMT</option>
                        <option value="connectionLine">Connection Line</option>
                        <option value="radiusText">Radius Text</option>
                        <option value="jointCode">Joint Code A2G3</option>
                        <option value="extraCode">Extra Code</option>
                        <option value="flangeIdLine">Flange ID Line</option>
                        <option value="flangePressureLine">Flange Pressure Line</option>
                        <option value="flangeConnectionLine">Flange Connection Line</option>
                        <option value="flangeDrillingLine">Flange Drilling Line</option>
                        {filteredVariables.length > 0 && (
                            <optgroup label={selectedLogicCode ? t('variablesFor', { code: selectedLogicCode }) : t('allDynamicVariables')}>
                                {filteredVariables.map(v => (
                                    <option key={v} value={v}>{v}</option>
                                ))}
                            </optgroup>
                        )}
                      </select>
                      {!selectedElement.variable && (
                        <input
                          type="text"
                          value={selectedElement.content}
                          onChange={(e) =>
                            updateElement(selectedElement.id, {
                              content: e.target.value,
                            })
                          }
                          className="w-full bg-white border-2 border-slate-100 rounded-xl p-3 text-xs font-bold outline-none focus:border-blue-500"
                          placeholder={t('freeTextPlaceholder')}
                        />
                      )}
                    </>
                  )}
                </div>

                <div className="space-y-4 pt-6 border-t border-slate-50">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left block ml-1">
                    {t('layoutAlignment')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => alignCenter("x")}
                      className="flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-blue-50 rounded-xl text-[10px] font-black uppercase transition-all"
                    >
                      <AlignHorizontalJustifyCenter size={14} /> {t('centerX')}
                    </button>
                    <button
                      onClick={() => alignCenter("y")}
                      className="flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-blue-50 rounded-xl text-[10px] font-black uppercase transition-all"
                    >
                      <AlignVerticalJustifyCenter size={14} /> {t('centerY')}
                    </button>
                  </div>
                </div>

                <div className="space-y-4 pt-6 border-t border-slate-50">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left block ml-1">
                    {t('styling')}
                  </label>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[8px] font-black text-slate-400 uppercase ml-1">{t('rotation', 'Rotation')}</label>
                       <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-100">
                          <button onClick={() => updateElement(selectedElement.id, { rotation: (selectedElement.rotation || 0) - 90 })} className="p-1 hover:bg-white rounded shadow-sm text-slate-600"><RotateCcw size={14} /></button>
                          <span className="flex-1 text-center text-xs font-bold text-slate-700">{selectedElement.rotation || 0}°</span>
                          <button onClick={() => updateElement(selectedElement.id, { rotation: (selectedElement.rotation || 0) + 90 })} className="p-1 hover:bg-white rounded shadow-sm text-slate-600"><RotateCw size={14} /></button>
                       </div>
                    </div>

                    {selectedElement.type === 'text' && (
                        <div className="space-y-1.5">
                            <label className="text-[8px] font-black text-slate-400 uppercase ml-1">{t('fontSizePt', 'Grootte (pt)')}</label>
                            <input 
                                type="number" 
                                value={selectedElement.fontSize || 10} 
                                onChange={(e) => updateElement(selectedElement.id, { fontSize: parseInt(e.target.value) })}
                                className="w-full p-2 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold text-center outline-none focus:border-blue-500"
                            />
                        </div>
                    )}
                  </div>

                  {selectedElement.type === 'text' && (
                    <div className="flex flex-col gap-2 pt-2">
                        <div className="space-y-1.5">
                            <label className="text-[8px] font-black text-slate-400 uppercase ml-1">{t('textAlignment', 'Tekst Uitlijning')}</label>
                            <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-100">
                                <button 
                                    onClick={() => updateElement(selectedElement.id, { align: 'left' })}
                                    className={`flex-1 p-1.5 rounded flex justify-center ${(!selectedElement.align || selectedElement.align === 'left') ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                                    title={t('adminLabelDesigner.alignLeft')}
                                >
                                    <AlignLeft size={14} />
                                </button>
                                <button 
                                    onClick={() => updateElement(selectedElement.id, { align: 'center' })}
                                    className={`flex-1 p-1.5 rounded flex justify-center ${selectedElement.align === 'center' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                                    title={t('adminLabelDesigner.alignCenter')}
                                >
                                    <AlignCenter size={14} />
                                </button>
                                <button 
                                    onClick={() => updateElement(selectedElement.id, { align: 'right' })}
                                    className={`flex-1 p-1.5 rounded flex justify-center ${selectedElement.align === 'right' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                                    title={t('adminLabelDesigner.alignRight')}
                                >
                                    <AlignRight size={14} />
                                </button>
                            </div>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input 
                                type="checkbox" 
                                checked={selectedElement.isBold || false} 
                                onChange={(e) => updateElement(selectedElement.id, { isBold: e.target.checked })}
                                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-slate-300"
                            />
                            <span className="text-xs font-bold text-slate-600">{t('bold', 'Vetgedrukt (Bold)')}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input 
                                type="checkbox" 
                                checked={selectedElement.isInverse || false} 
                                onChange={(e) => updateElement(selectedElement.id, { isInverse: e.target.checked })}
                                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-slate-300"
                            />
                            <span className="text-xs font-bold text-slate-600">{t('inverse', 'Inverse (Wit op Zwart)')}</span>
                        </label>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-50">
                  <div className="space-y-1.5 text-left">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-1">
                      {t('widthMm')}
                    </label>
                    <input
                      type="number"
                      value={Math.round(selectedElement.width)}
                      onChange={(e) =>
                        updateElement(selectedElement.id, {
                          width: Number(e.target.value),
                        })
                      }
                      className="w-full bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-mono text-xs font-bold text-center"
                    />
                  </div>
                  <div className="space-y-1.5 text-left">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-1">
                      {t('heightMm')}
                    </label>
                    <input
                      type="number"
                      value={Math.round(selectedElement.height || 0)}
                      onChange={(e) =>
                        updateElement(selectedElement.id, {
                          height: Number(e.target.value),
                        })
                      }
                      className="w-full bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-mono text-xs font-bold text-center"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-8">
                  <button
                    onClick={duplicateSelected}
                    className="flex-1 py-4 bg-blue-50 text-blue-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-100 transition-all flex items-center justify-center gap-2 border border-blue-100 active:scale-95"
                    title={t('duplicateElement', 'Dupliceer')}
                  >
                    <Copy size={16} /> {t('duplicate', 'Dupliceer')}
                  </button>
                  <button
                    onClick={removeSelected}
                    className="flex-1 py-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center justify-center gap-2 border border-rose-100 active:scale-95"
                    title={t('removeElement', 'Verwijder')}
                  >
                    <Trash2 size={16} /> {t('delete', 'Verwijder')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DATA SELECTION MODAL */}
      {showDataModal && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-2xl rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-black text-slate-800 uppercase text-sm tracking-wide">
                {t('selectLiveOrder')}
              </h3>
              <button onClick={() => setShowDataModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder={t('searchOrderPlaceholder')} 
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm outline-none focus:border-blue-500 transition-all"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleSearchOrder(e.target.value);
                            }
                        }}
                    />
                </div>
                <div className="w-full sm:w-1/3">
                    <select
                        value={stationFilter}
                        onChange={(e) => handleStationFilterChange(e.target.value)}
                        className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm outline-none focus:border-blue-500 transition-all"
                    >
                        <option value="">{t('adminLabelDesigner.allStations', 'Alle Stations')}</option>
                        {allStations.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/30">
              {isLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div>
              ) : availableOrders.length === 0 ? (
                <div className="text-center py-10 text-slate-400 italic text-xs">{t('noOrdersFound')}</div>
              ) : (
                <div className="space-y-2">
                  {availableOrders.map(order => (
                    <button
                      key={order.id}
                      onClick={() => selectOrderForPreview(order)}
                      className="w-full text-left p-4 bg-white border border-slate-100 rounded-xl hover:border-blue-400 hover:shadow-md transition-all group"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-black text-slate-800">{order.orderId}</span>
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{order.status || "N/A"}</span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium truncate">{order.item || "Geen omschrijving"}</p>
                      <div className="flex gap-2 mt-2">
                         {order.itemCode && <span className="text-[9px] font-mono bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">{order.itemCode}</span>}
                         {order.lotNumber && <span className="text-[9px] font-mono bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-100">{order.lotNumber}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAG MANAGER MODAL */}
      {showTagManager && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-black text-slate-800 uppercase text-sm tracking-wide">
                {t('adminLabelDesigner.tagManagement', 'Tag Beheer')}
              </h3>
              <button onClick={() => setShowTagManager(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar">
              <p className="text-xs text-slate-500 mb-4">
                {t('adminLabelDesigner.tagManagerHelpText', 'Klik op een tag om deze toe te voegen aan (of te verwijderen van) het huidige ontwerp.')}
              </p>
              
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input 
                  type="text" 
                  placeholder={t('adminLabelDesigner.searchTags', 'Zoek tags...')}
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {allUniqueTags.filter(t => t.toLowerCase().includes(tagSearch.toLowerCase())).length === 0 ? (
                  <span className="text-xs text-slate-400 italic">{t('adminLabelDesigner.noTagsFound', 'Geen tags gevonden.')}</span>
                ) : (
                  allUniqueTags
                    .filter(t => t.toLowerCase().includes(tagSearch.toLowerCase()))
                    .map(tag => {
                      const isSelected = labelTags.includes(tag);
                      return (
                    <div key={tag} className={`group flex items-center gap-1 border rounded-lg pl-3 pr-1 py-1 transition-all ${isSelected ? 'bg-blue-100 border-blue-300' : 'bg-slate-100 hover:bg-blue-50 border-slate-200 hover:border-blue-200'}`}>
                      <button 
                        onClick={() => {
                          addToHistory();
                          if (isSelected) {
                            setLabelTags(labelTags.filter(t => t !== tag));
                          } else {
                            setLabelTags([...labelTags, tag]);
                          }
                          setHasUnsavedChanges(true);
                        }}
                        className={`text-xs font-bold ${isSelected ? 'text-blue-700' : 'text-slate-700 group-hover:text-blue-700'}`}
                      >
                        {tag}
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTagGlobally(tag);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                        title={t('adminLabelDesigner.deleteTagGlobally', 'Verwijder overal')}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )})
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLabelDesigner;
