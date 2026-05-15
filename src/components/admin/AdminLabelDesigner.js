import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Save, Type, ScanBarcode, QrCode, Trash2, Settings, Grid, ZoomIn, ZoomOut, RotateCw, RotateCcw, AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, Database, X, Loader2, Minus, Square, Copy, AlignLeft, AlignCenter, AlignRight, ShieldCheck, Image as ImageIcon, Upload, Code, FilePlus, Search, Undo, Plus, } from "lucide-react";
import { doc, setDoc, getDocs, collection, query, limit, serverTimestamp, onSnapshot, where, getDoc, writeBatch, } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
// Importeer de logica en constanten uit het hulpbestand
import { LABEL_SIZES, processLabelData, resolveLabelContent, } from "../../utils/labelHelpers";
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
    if (!blockHeightMm || !baseFontPx)
        return 1;
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
        const unsub = onSnapshot(colRef, (snap) => {
            setSavedLabels(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, (err) => console.error("Sync Error:", err));
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
            }
            catch (e) {
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
        if (!hasUnsavedChanges)
            return true;
        return window.confirm(t('adminLabelDesigner.overwriteConfirm', 'Je hebt niet-opgeslagen wijzigingen. Wil je deze negeren en doorgaan zonder op te slaan?'));
    };
    const loadLabelIntoDesigner = (label) => {
        if (!label)
            return;
        if (!confirmDiscardChanges())
            return;
        setLabelName(label.name);
        setLabelWidth(label.width);
        setLabelHeight(label.height);
        if (label.sizeKey)
            setSelectedSizeKey(label.sizeKey);
        setAssignedDepartment(label.department || "All");
        setLabelTags(label.tags || []);
        setLabelFolder(label.folder || inferFolderFromTags(label.tags || []));
        setElements(label.elements || []);
        setSelectedElementIds([]);
        setHasUnsavedChanges(false);
    };
    useEffect(() => {
        if (!openLabelId)
            return;
        if (lastOpenedFromPropRef.current === openLabelId)
            return;
        if (!savedLabels || savedLabels.length === 0)
            return;
        const targetLabel = savedLabels.find(l => l.id === openLabelId);
        if (!targetLabel)
            return;
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
            r.variables?.forEach(v => { if (v.name)
                allVars.add(v.name); });
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
        if (isTemp && hasWavi)
            return "Tijdelijk Wavistrong";
        if (isTemp && hasFiber)
            return "Tijdelijk Fibermar";
        if (isTemp && hasCode)
            return "Tijdelijk Code";
        if (hasWavi)
            return "Wavistrong";
        if (hasFiber)
            return "Fibermar";
        if (hasCode)
            return "Code";
        if (hasFlenzen)
            return "Flenzen";
        return "";
    };
    const deleteTagGlobally = async (tagToDelete) => {
        if (!window.confirm(t('adminLabelDesigner.confirmGlobalTagDelete', `Weet je zeker dat je de tag '${tagToDelete}' overal wilt verwijderen? Dit past ${savedLabels.filter(l => l.tags?.includes(tagToDelete)).length} templates aan.`)))
            return;
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
        }
        catch (e) {
            console.error("Tag delete error:", e);
            notify("Fout bij verwijderen tag: " + e.message);
        }
        finally {
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
        }
        catch (e) {
            console.error("Fout bij ophalen orders:", e);
        }
        finally {
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
            }
            else {
                q = query(collection(db, ...PATHS.PLANNING), limit(15));
            }
            const snapshot = await getDocs(q);
            setAvailableOrders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
        catch (e) {
            console.error("Filter fout:", e);
        }
        finally {
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
        }
        catch (e) {
            console.error("Zoekfout:", e);
        }
        finally {
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
        }
        catch (e) {
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
        if (history.length === 0)
            return;
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
        if (!sourceLabel)
            return;
        if (!confirmDiscardChanges()) {
            return;
        }
        addToHistory();
        setLabelWidth(sourceLabel.width);
        setLabelHeight(sourceLabel.height);
        if (sourceLabel.sizeKey)
            setSelectedSizeKey(sourceLabel.sizeKey);
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
        if (!confirmDiscardChanges())
            return;
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
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))
                return;
            if (selectedElementIds.length === 0)
                return;
            const isArrowKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
            if (!isArrowKey)
                return;
            e.preventDefault();
            // Voeg toe aan geschiedenis bij start van beweging (niet bij repeat)
            if (!e.repeat) {
                addToHistory();
            }
            const step = e.shiftKey ? 1 : 0.1; // 1mm (Shift) of 0.1mm (Precies)
            let dx = 0;
            let dy = 0;
            switch (e.key) {
                case 'ArrowUp':
                    dy = -step;
                    break;
                case 'ArrowDown':
                    dy = step;
                    break;
                case 'ArrowLeft':
                    dx = -step;
                    break;
                case 'ArrowRight':
                    dx = step;
                    break;
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
            width: type === "text" ? 40 : type === "line" ? 30 : type === "box" ? 30 : type === "image" ? 20 : 20,
            height: type === "text" ? 10 : type === "line" ? 0.5 : type === "box" ? 20 : type === "image" ? 20 : 20,
            thickness: type === "box" ? 0.5 : null,
            content: type === "text"
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
        setElements(elements.map((el) => (selectedElementIds.includes(el.id) ? { ...el, ...updates } : el)));
        setHasUnsavedChanges(true);
    };
    const removeSelected = () => {
        addToHistory();
        setElements(elements.filter((el) => !selectedElementIds.includes(el.id)));
        setSelectedElementIds([]);
        setHasUnsavedChanges(true);
    };
    const duplicateSelected = () => {
        if (selectedElementIds.length === 0)
            return;
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
        if (selectedElementIds.length === 0)
            return;
        addToHistory();
        setElements(elements.map((el) => {
            if (selectedElementIds.includes(el.id)) {
                const updates = {};
                if (axis === "x")
                    updates.x = (labelWidth - (el.width || 0)) / 2;
                else if (axis === "y")
                    updates.y = (labelHeight - (el.height || 0)) / 2;
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
            }
            else {
                newSelection.push(id);
            }
        }
        else {
            if (!newSelection.includes(id)) {
                newSelection = [id];
            }
        }
        setSelectedElementIds(newSelection);
        if (!newSelection.includes(id))
            return;
        const startX = e.clientX;
        const startY = e.clientY;
        const initialPositions = {};
        newSelection.forEach(sid => {
            const el = elements.find(e => e.id === sid);
            if (el)
                initialPositions[sid] = { x: el.x, y: el.y };
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
        if (!nameToUse.trim())
            return notify(t('adminLabelDesigner.enterLabelName'));
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
                if (tagsOverride !== null)
                    setLabelTags(tagsOverride);
                notify(t('adminLabelDesigner.labelSavedAs', { name: nameToUse }));
            }
            else {
                notify(t('adminLabelDesigner.labelSaved'));
            }
        }
        catch (e) {
            console.error("Save error:", e);
            notify(t('adminLabelDesigner.saveError') + e.message);
        }
        finally {
            setIsLoading(false);
        }
    };
    const handleSaveAs = () => {
        const newName = prompt(t('adminLabelDesigner.enterNameForNew'), `${labelName}${t('adminLabelDesigner.copySuffix')}`);
        if (newName && newName.trim()) {
            saveLabel(newName, []); // Reset tags bij 'Opslaan Als' (nieuwe kopie)
        }
    };
    return (_jsxs("div", { className: "flex flex-col h-full w-full bg-slate-100 overflow-hidden text-left animate-in fade-in", children: [_jsxs("div", { className: "bg-white border-b border-slate-200 px-8 py-3 flex justify-between items-center shadow-sm z-20 shrink-0 h-20", children: [_jsxs("div", { className: "flex items-center gap-6", children: [_jsx("button", { onClick: handleBack, className: "p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all flex items-center gap-2 group", children: _jsx(X, { size: 18, className: "group-hover:rotate-90 transition-transform" }) }), _jsxs("div", { className: "text-left", children: [_jsxs("h1", { className: "font-black text-slate-900 text-lg uppercase italic tracking-tighter leading-none", children: [t('label'), " ", _jsx("span", { className: "text-blue-600", children: t('architect') })] }), _jsxs("p", { className: "text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 flex items-center gap-1.5", children: [_jsx(ShieldCheck, { size: 10, className: "text-emerald-500" }), " ", t('rootSync'), ": /", PATHS.LABEL_TEMPLATES.join("/")] })] })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "relative group", children: _jsx("input", { type: "text", value: labelName, onChange: (e) => { setLabelName(e.target.value); setHasUnsavedChanges(true); }, className: "w-40 px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black text-slate-700 outline-none focus:border-blue-500 transition-all placeholder:text-slate-300", placeholder: t('adminLabelDesigner.labelNamePlaceholder') }) }), _jsx("button", { onClick: handleNewDesign, className: "p-3 bg-white border-2 border-slate-100 text-slate-600 hover:text-blue-600 hover:border-blue-100 rounded-2xl transition-all shadow-sm", title: t('common.new'), children: _jsx(Plus, { size: 18 }) }), _jsx("button", { onClick: handleDownloadZPL, className: "p-3 bg-white border-2 border-slate-100 text-slate-600 hover:text-blue-600 hover:border-blue-100 rounded-2xl transition-all shadow-sm", title: t('adminLabelDesigner.downloadZplPreview', 'Download ZPL Preview'), children: _jsx(Code, { size: 18 }) }), _jsxs("button", { onClick: fetchLiveOrders, className: `flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest border-2 transition-all ${previewData
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                    : "bg-white text-slate-600 border-slate-100 hover:bg-slate-50"}`, children: [_jsx(Database, { size: 14 }), previewData ? t('liveDataLinked') : t('linkLiveOrder')] }), _jsxs("div", { className: "flex items-center gap-2 bg-slate-50 border-2 border-slate-100 rounded-2xl p-1", title: t('adminLabelDesigner.copyFromTooltip', 'Kopieer ontwerp'), children: [_jsx("div", { className: "pl-3 text-slate-400", children: _jsx(Copy, { size: 14 }) }), _jsxs("select", { onChange: (e) => handleCopyFrom(e.target.value), className: "bg-transparent text-[10px] font-black uppercase outline-none pr-4 py-2 cursor-pointer max-w-[100px]", value: "", children: [_jsx("option", { value: "", disabled: true, children: t('common.copy', 'Kopieer...') }), savedLabels.map(l => (_jsx("option", { value: l.id, children: l.name }, l.id)))] })] }), _jsxs("div", { className: "flex items-center gap-2 bg-slate-50 border-2 border-slate-100 rounded-2xl p-1", children: [_jsxs("select", { value: selectedSizeKey, onChange: (e) => { setSelectedSizeKey(e.target.value); setHasUnsavedChanges(true); }, className: "bg-transparent text-[10px] font-black uppercase outline-none px-4 py-2 cursor-pointer", children: [Object.keys(LABEL_SIZES).map((s) => (_jsx("option", { value: s, children: LABEL_SIZES[s].name }, s))), _jsx("option", { value: "Custom", children: t('common.customSize') })] }), selectedSizeKey === "Custom" && (_jsxs("div", { className: "flex items-center gap-1 pr-2 border-l border-slate-200 pl-2 animate-in fade-in slide-in-from-left-2", children: [_jsx("input", { type: "number", value: labelWidth, onChange: (e) => { setLabelWidth(Number(e.target.value)); setHasUnsavedChanges(true); }, className: "w-10 bg-transparent text-[10px] font-bold text-center outline-none border-b border-slate-300 focus:border-blue-500", title: t('widthMm') }), _jsx("span", { className: "text-[10px] text-slate-400", children: "x" }), _jsx("input", { type: "number", value: labelHeight, onChange: (e) => { setLabelHeight(Number(e.target.value)); setHasUnsavedChanges(true); }, className: "w-10 bg-transparent text-[10px] font-bold text-center outline-none border-b border-slate-300 focus:border-blue-500", title: t('heightMm') }), _jsx("span", { className: "text-[10px] text-slate-400", children: "mm" })] }))] }), _jsx("div", { className: "flex items-center gap-2 bg-slate-50 border-2 border-slate-100 rounded-2xl p-1", children: _jsxs("select", { value: assignedDepartment, onChange: (e) => { setAssignedDepartment(e.target.value); setHasUnsavedChanges(true); }, className: "bg-transparent text-[10px] font-black uppercase outline-none px-4 py-2 cursor-pointer max-w-[150px]", children: [_jsx("option", { value: "All", children: t('adminUsers.allDepartments', 'Alle Afdelingen') }), departments.map(d => (_jsx("option", { value: d.id, children: d.name }, d.id)))] }) }), _jsx("button", { onClick: handleSaveAs, disabled: isLoading, className: "p-4 bg-slate-100 text-slate-600 rounded-2xl hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm active:scale-95 border-2 border-transparent hover:border-blue-100", title: t('adminLabelDesigner.saveAsTitle'), children: _jsx(FilePlus, { size: 18 }) }), _jsxs("button", { onClick: () => saveLabel(), disabled: isLoading, className: "bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-blue-600 transition-all shadow-xl active:scale-95 flex items-center gap-3", children: [isLoading ? (_jsx(Loader2, { className: "animate-spin", size: 16 })) : (_jsx(Save, { size: 16 })), " ", t('save')] })] })] }), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsxs("div", { className: "w-72 bg-white border-r border-slate-200 flex flex-col z-10 shrink-0", children: [_jsxs("div", { className: "p-6 border-b border-slate-50", children: [_jsx("h3", { className: "text-[10px] font-black uppercase text-slate-400 mb-5 tracking-widest", children: t('components') }), _jsx("div", { className: "grid grid-cols-2 gap-3", children: [
                                            { type: "text", label: t('manualText'), icon: Type },
                                            { type: "line", label: t('line'), icon: Minus },
                                            { type: "box", label: t('box'), icon: Square },
                                            { type: "barcode", label: t('barcode'), icon: ScanBarcode },
                                            { type: "qr", label: t('qrCode'), icon: QrCode },
                                            { type: "image", label: t('image'), icon: ImageIcon },
                                        ].map((tool) => (_jsxs("button", { onClick: () => addElement(tool.type), className: "flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 border-2 border-transparent hover:border-blue-100 rounded-[25px] transition-all group active:scale-90", children: [_jsx(tool.icon, { size: 22, className: "mb-2 text-slate-400 group-hover:text-blue-500" }), _jsx("span", { className: "text-[9px] font-black uppercase tracking-tighter", children: tool.label })] }, tool.type))) })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-6 custom-scrollbar text-left flex flex-col", children: _jsx("div", { className: "text-[11px] text-slate-500 font-semibold bg-slate-50 border border-slate-200 rounded-2xl p-4", children: t('adminLabelDesigner.templatesOverviewMoved') }) })] }), _jsxs("div", { className: "flex-1 bg-slate-200 relative overflow-hidden flex flex-col items-center justify-center", children: [_jsxs("div", { className: "absolute top-6 bg-white/90 backdrop-blur rounded-full px-6 py-3 shadow-2xl border border-slate-200 flex items-center gap-6 z-10", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: () => setZoom((z) => Math.max(0.2, z - 0.1)), className: "p-1.5 hover:bg-slate-100 rounded-lg text-slate-400", children: _jsx(ZoomOut, { size: 18 }) }), _jsxs("span", { className: "text-xs font-black text-slate-800 w-12 text-center", children: [Math.round(zoom * 100), "%"] }), _jsx("button", { onClick: () => setZoom((z) => Math.min(4, z + 0.1)), className: "p-1.5 hover:bg-slate-100 rounded-lg text-slate-400", children: _jsx(ZoomIn, { size: 18 }) })] }), _jsx("div", { className: "w-px h-5 bg-slate-200" }), _jsx("button", { onClick: () => setShowGrid(!showGrid), className: `p-2 rounded-xl transition-all ${showGrid ? "bg-blue-100 text-blue-600" : "text-slate-400"}`, children: _jsx(Grid, { size: 18 }) }), _jsx("button", { onClick: handleUndo, disabled: history.length === 0, className: `p-2 rounded-xl transition-all ${history.length > 0 ? "text-slate-600 hover:bg-slate-100" : "text-slate-300 cursor-not-allowed"}`, title: t('common.undo', 'Ongedaan maken'), children: _jsx(Undo, { size: 18 }) })] }), _jsx("div", { className: "w-full h-full flex items-center justify-center p-20 overflow-auto", onClick: () => setSelectedElementIds([]), children: _jsxs("div", { ref: canvasRef, className: "bg-white shadow-2xl relative transition-all duration-75 overflow-hidden border border-slate-300", style: {
                                        width: `${labelWidth * PIXELS_PER_MM * zoom}px`,
                                        height: `${labelHeight * PIXELS_PER_MM * zoom}px`,
                                        backgroundImage: showGrid
                                            ? "radial-gradient(#cbd5e1 1px, transparent 1px)"
                                            : "none",
                                        backgroundSize: `${10 * PIXELS_PER_MM * zoom}px ${10 * PIXELS_PER_MM * zoom}px`,
                                    }, onClick: (e) => e.stopPropagation(), children: [guidelines.map((g, i) => (_jsx("div", { className: "absolute bg-blue-500/50 z-30 pointer-events-none", style: {
                                                left: g.type === "vertical"
                                                    ? `${g.pos * PIXELS_PER_MM * zoom}px`
                                                    : 0,
                                                top: g.type === "horizontal"
                                                    ? `${g.pos * PIXELS_PER_MM * zoom}px`
                                                    : 0,
                                                width: g.type === "vertical" ? "1px" : "100%",
                                                height: g.type === "horizontal" ? "1px" : "100%",
                                            } }, i))), elements.map((el) => (_jsx("div", { onMouseDown: (e) => handleMouseDown(e, el.id), className: "absolute cursor-move group select-none", style: {
                                                left: `${el.x * PIXELS_PER_MM * zoom}px`,
                                                top: `${el.y * PIXELS_PER_MM * zoom}px`,
                                                transform: `rotate(${el.rotation || 0}deg)`,
                                                transformOrigin: "top left",
                                            }, children: _jsxs("div", { className: `transition-all ${selectedElementIds.includes(el.id)
                                                    ? "ring-2 ring-blue-500 ring-offset-4 bg-blue-50/20"
                                                    : "hover:ring-1 hover:ring-blue-300"} p-0.5`, children: [el.type === "text" && (() => {
                                                        const { content } = resolveLabelContent(el, previewData);
                                                        const hasContent = content !== null && content !== undefined && String(content).trim() !== "";
                                                        const normalizedRotation = ((Number(el.rotation) || 0) % 360 + 360) % 360;
                                                        const isVerticalRotation = normalizedRotation === 90 || normalizedRotation === 270;
                                                        const previewTextStyle = getPreviewTextStyle(el, content, zoom, normalizedRotation);
                                                        return (_jsx("div", { className: "leading-tight", style: {
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
                                                            }, children: hasContent ? content : t('adminLabelDesigner.noData') }));
                                                    })(), el.type === "line" && (_jsx("div", { style: {
                                                            width: `${el.width * PIXELS_PER_MM * zoom}px`,
                                                            height: `${el.height * PIXELS_PER_MM * zoom}px`,
                                                            backgroundColor: "black",
                                                        } })), el.type === "box" && (_jsx("div", { style: {
                                                            width: `${el.width * PIXELS_PER_MM * zoom}px`,
                                                            height: `${el.height * PIXELS_PER_MM * zoom}px`,
                                                            border: `${(el.thickness || 1) * PIXELS_PER_MM * zoom}px solid black`,
                                                            boxSizing: "border-box",
                                                        } })), (el.type === "barcode" || el.type === "qr") && (_jsx("div", { className: "bg-slate-50 border border-slate-300 flex items-center justify-center", style: {
                                                            width: `${(el.width || 30) * PIXELS_PER_MM * zoom}px`,
                                                            height: `${(el.height || 30) * PIXELS_PER_MM * zoom}px`,
                                                        }, children: _jsx(ScanBarcode, { size: 24 * zoom, className: "text-slate-400" }) })), el.type === "image" && (_jsx("div", { style: {
                                                            width: `${(el.width || 20) * PIXELS_PER_MM * zoom}px`,
                                                            height: `${(el.height || 20) * PIXELS_PER_MM * zoom}px`,
                                                            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden"
                                                        }, children: el.content ? _jsx("img", { src: el.content, alt: "img", style: { width: "100%", height: "100%", objectFit: "contain" }, draggable: false }) : _jsx(ImageIcon, { size: 24 * zoom, className: "text-slate-300" }) }))] }) }, el.id)))] }) })] }), _jsxs("div", { className: "w-80 bg-white border-l border-slate-200 flex flex-col z-10 shrink-0 shadow-2xl", children: [_jsxs("div", { className: "p-6 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between gap-3", children: [_jsxs("h3", { className: "text-[10px] font-black uppercase text-slate-500 tracking-widest italic flex items-center gap-2", children: [_jsx(Settings, { size: 14 }), " ", t('common.inspector')] }), _jsx("button", { onClick: handleUndo, disabled: history.length === 0, className: `px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-all ${history.length > 0
                                            ? "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                                            : "bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed"}`, title: t('common.undo', 'Ongedaan maken'), children: t('common.undo', 'Undo') })] }), _jsx("div", { className: "p-6 overflow-y-auto flex-1 custom-scrollbar text-left", children: !selectedElement ? (_jsx("div", { className: "space-y-6 animate-in slide-in-from-right-2", children: _jsxs("div", { className: "border-b border-slate-100 pb-4", children: [_jsxs("div", { className: "mb-4", children: [_jsx("h4", { className: "text-xs font-black text-slate-400 uppercase tracking-widest mb-2", children: "Vaste Map" }), _jsxs("select", { value: labelFolder, onChange: (e) => {
                                                            addToHistory();
                                                            setLabelFolder(e.target.value);
                                                            setHasUnsavedChanges(true);
                                                        }, className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-all", children: [_jsx("option", { value: "", children: "Geen vaste map" }), LABEL_FOLDER_OPTIONS.map(folder => (_jsx("option", { value: folder, children: folder }, folder)))] }), _jsx("p", { className: "text-[9px] text-slate-400 italic leading-relaxed mt-2", children: "Kies een vaste map voor ordening in Label Manager." })] }), _jsxs("div", { className: "flex justify-between items-center mb-4", children: [_jsx("h4", { className: "text-xs font-black text-slate-400 uppercase tracking-widest", children: "Label Koppelingen (Tags)" }), _jsxs("button", { onClick: () => setShowTagManager(true), className: "text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1", children: [_jsx(Settings, { size: 10 }), " ", t('adminLabelDesigner.manageTags', 'Beheer')] })] }), _jsxs("div", { className: "space-y-3", children: [_jsx("input", { type: "text", placeholder: t('adminLabelDesigner.tagPlaceholder', 'bv. Wavistrong, EMT, EST'), className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-all", onBlur: (e) => {
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
                                                        }, onKeyDown: (e) => {
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
                                                        } }), _jsx("div", { className: "flex flex-wrap gap-2", children: labelTags.map(tag => (_jsxs("span", { className: "bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 border border-blue-100", children: [tag, _jsx("button", { onClick: () => {
                                                                        addToHistory();
                                                                        setLabelTags(labelTags.filter(t => t !== tag));
                                                                        setHasUnsavedChanges(true);
                                                                    }, className: "hover:text-blue-800", children: _jsx(X, { size: 10 }) })] }, tag))) }), _jsx("p", { className: "text-[9px] text-slate-400 italic leading-relaxed", children: t('adminLabelDesigner.tagHelpText', 'Voeg tags toe om dit label te koppelen aan specifieke productsoorten. Als er geen tags zijn, is dit label beschikbaar voor alle producten.') })] })] }) })) : (_jsxs("div", { className: "space-y-8 animate-in slide-in-from-right-2", children: [_jsxs("div", { className: "space-y-4", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest text-left block ml-1", children: t('contentAndVariable') }), selectedElement.type === "image" ? (_jsxs("div", { className: "flex flex-col gap-3", children: [selectedElement.content && (_jsx("div", { className: "w-full h-24 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center p-2", children: _jsx("img", { src: selectedElement.content, className: "max-w-full max-h-full object-contain", alt: "preview" }) })), _jsxs("button", { onClick: () => fileInputRef.current?.click(), className: "w-full py-3 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold border border-blue-100 hover:bg-blue-100 transition-all flex items-center justify-center gap-2", children: [_jsx(Upload, { size: 14 }), " ", t('uploadImage')] }), _jsx("input", { type: "file", ref: fileInputRef, className: "hidden", accept: "image/*", onChange: (e) => {
                                                                const file = e.target.files[0];
                                                                if (file) {
                                                                    const reader = new FileReader();
                                                                    reader.onload = (ev) => {
                                                                        updateElement(selectedElement.id, { content: ev.target.result });
                                                                    };
                                                                    reader.readAsDataURL(file);
                                                                }
                                                            } })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-2", children: [_jsx("label", { className: "text-[9px] font-bold text-slate-400 uppercase ml-1 block mb-1", children: t('filterProductCode') }), _jsxs("select", { value: selectedLogicCode, onChange: (e) => setSelectedLogicCode(e.target.value), className: "w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none text-slate-600", children: [_jsx("option", { value: "", children: t('allVariables') }), labelLogicRules.sort((a, b) => a.productCode.localeCompare(b.productCode)).map(r => (_jsx("option", { value: r.productCode, children: r.productCode }, r.id)))] })] }), _jsxs("select", { value: selectedElement.variable, onChange: (e) => updateElement(selectedElement.id, {
                                                                variable: e.target.value,
                                                                content: e.target.value
                                                                    ? `{${e.target.value}}`
                                                                    : t('manualText'),
                                                            }), className: "w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-xs font-bold", children: [_jsx("option", { value: "", children: t('staticText') }), _jsx("option", { value: "lotNumber", children: t('lotNumber') }), _jsx("option", { value: "orderId", children: t('orderNumber') }), _jsx("option", { value: "itemCode", children: t('itemCode') }), _jsx("option", { value: "productType", children: t('productType') }), _jsx("option", { value: "diameter", children: t('diameterDn') }), _jsx("option", { value: "pressure", children: t('pressurePn') }), _jsx("option", { value: "innerDiameter", children: t('innerDiameter') }), _jsx("option", { value: "nprs", children: t('nprs') }), _jsx("option", { value: "pq", children: t('pq') }), _jsx("option", { value: "temperature", children: t('temperatureLimit') }), _jsx("option", { value: "date", children: t('productionDate') }), _jsx("option", { value: "idLine", children: "ID Line" }), _jsx("option", { value: "pressureLine", children: "Pressure Line" }), _jsx("option", { value: "pressureLineEmt", children: "Pressure Line EMT" }), _jsx("option", { value: "connectionLine", children: "Connection Line" }), _jsx("option", { value: "radiusText", children: "Radius Text" }), _jsx("option", { value: "jointCode", children: "Joint Code A2G3" }), _jsx("option", { value: "extraCode", children: "Extra Code" }), _jsx("option", { value: "flangeIdLine", children: "Flange ID Line" }), _jsx("option", { value: "flangePressureLine", children: "Flange Pressure Line" }), _jsx("option", { value: "flangeConnectionLine", children: "Flange Connection Line" }), _jsx("option", { value: "flangeDrillingLine", children: "Flange Drilling Line" }), filteredVariables.length > 0 && (_jsx("optgroup", { label: selectedLogicCode ? t('variablesFor', { code: selectedLogicCode }) : t('allDynamicVariables'), children: filteredVariables.map(v => (_jsx("option", { value: v, children: v }, v))) }))] }), !selectedElement.variable && (_jsx("input", { type: "text", value: selectedElement.content, onChange: (e) => updateElement(selectedElement.id, {
                                                                content: e.target.value,
                                                            }), className: "w-full bg-white border-2 border-slate-100 rounded-xl p-3 text-xs font-bold outline-none focus:border-blue-500", placeholder: t('freeTextPlaceholder') }))] }))] }), _jsxs("div", { className: "space-y-4 pt-6 border-t border-slate-50", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest text-left block ml-1", children: t('layoutAlignment') }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsxs("button", { onClick: () => alignCenter("x"), className: "flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-blue-50 rounded-xl text-[10px] font-black uppercase transition-all", children: [_jsx(AlignHorizontalJustifyCenter, { size: 14 }), " ", t('centerX')] }), _jsxs("button", { onClick: () => alignCenter("y"), className: "flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-blue-50 rounded-xl text-[10px] font-black uppercase transition-all", children: [_jsx(AlignVerticalJustifyCenter, { size: 14 }), " ", t('centerY')] })] })] }), _jsxs("div", { className: "space-y-4 pt-6 border-t border-slate-50", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest text-left block ml-1", children: t('styling') }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-[8px] font-black text-slate-400 uppercase ml-1", children: t('rotation', 'Rotation') }), _jsxs("div", { className: "flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-100", children: [_jsx("button", { onClick: () => updateElement(selectedElement.id, { rotation: (selectedElement.rotation || 0) - 90 }), className: "p-1 hover:bg-white rounded shadow-sm text-slate-600", children: _jsx(RotateCcw, { size: 14 }) }), _jsxs("span", { className: "flex-1 text-center text-xs font-bold text-slate-700", children: [selectedElement.rotation || 0, "\u00B0"] }), _jsx("button", { onClick: () => updateElement(selectedElement.id, { rotation: (selectedElement.rotation || 0) + 90 }), className: "p-1 hover:bg-white rounded shadow-sm text-slate-600", children: _jsx(RotateCw, { size: 14 }) })] })] }), selectedElement.type === 'text' && (_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-[8px] font-black text-slate-400 uppercase ml-1", children: t('fontSizePt', 'Grootte (pt)') }), _jsx("input", { type: "number", value: selectedElement.fontSize || 10, onChange: (e) => updateElement(selectedElement.id, { fontSize: parseInt(e.target.value) }), className: "w-full p-2 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold text-center outline-none focus:border-blue-500" })] }))] }), selectedElement.type === 'text' && (_jsxs("div", { className: "flex flex-col gap-2 pt-2", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-[8px] font-black text-slate-400 uppercase ml-1", children: t('textAlignment', 'Tekst Uitlijning') }), _jsxs("div", { className: "flex bg-slate-50 p-1 rounded-lg border border-slate-100", children: [_jsx("button", { onClick: () => updateElement(selectedElement.id, { align: 'left' }), className: `flex-1 p-1.5 rounded flex justify-center ${(!selectedElement.align || selectedElement.align === 'left') ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`, title: t('adminLabelDesigner.alignLeft'), children: _jsx(AlignLeft, { size: 14 }) }), _jsx("button", { onClick: () => updateElement(selectedElement.id, { align: 'center' }), className: `flex-1 p-1.5 rounded flex justify-center ${selectedElement.align === 'center' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`, title: t('adminLabelDesigner.alignCenter'), children: _jsx(AlignCenter, { size: 14 }) }), _jsx("button", { onClick: () => updateElement(selectedElement.id, { align: 'right' }), className: `flex-1 p-1.5 rounded flex justify-center ${selectedElement.align === 'right' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`, title: t('adminLabelDesigner.alignRight'), children: _jsx(AlignRight, { size: 14 }) })] })] }), _jsxs("label", { className: "flex items-center gap-2 cursor-pointer select-none", children: [_jsx("input", { type: "checkbox", checked: selectedElement.isBold || false, onChange: (e) => updateElement(selectedElement.id, { isBold: e.target.checked }), className: "rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-slate-300" }), _jsx("span", { className: "text-xs font-bold text-slate-600", children: t('bold', 'Vetgedrukt (Bold)') })] }), _jsxs("label", { className: "flex items-center gap-2 cursor-pointer select-none", children: [_jsx("input", { type: "checkbox", checked: selectedElement.isInverse || false, onChange: (e) => updateElement(selectedElement.id, { isInverse: e.target.checked }), className: "rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-slate-300" }), _jsx("span", { className: "text-xs font-bold text-slate-600", children: t('inverse', 'Inverse (Wit op Zwart)') })] })] }))] }), _jsxs("div", { className: "grid grid-cols-2 gap-4 pt-6 border-t border-slate-50", children: [_jsxs("div", { className: "space-y-1.5 text-left", children: [_jsx("label", { className: "text-[8px] font-black text-slate-400 uppercase ml-1", children: t('widthMm') }), _jsx("input", { type: "number", value: Math.round(selectedElement.width), onChange: (e) => updateElement(selectedElement.id, {
                                                                width: Number(e.target.value),
                                                            }), className: "w-full bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-mono text-xs font-bold text-center" })] }), _jsxs("div", { className: "space-y-1.5 text-left", children: [_jsx("label", { className: "text-[8px] font-black text-slate-400 uppercase ml-1", children: t('heightMm') }), _jsx("input", { type: "number", value: Math.round(selectedElement.height || 0), onChange: (e) => updateElement(selectedElement.id, {
                                                                height: Number(e.target.value),
                                                            }), className: "w-full bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-mono text-xs font-bold text-center" })] })] }), _jsxs("div", { className: "flex gap-3 mt-8", children: [_jsxs("button", { onClick: duplicateSelected, className: "flex-1 py-4 bg-blue-50 text-blue-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-100 transition-all flex items-center justify-center gap-2 border border-blue-100 active:scale-95", title: t('duplicateElement', 'Dupliceer'), children: [_jsx(Copy, { size: 16 }), " ", t('duplicate', 'Dupliceer')] }), _jsxs("button", { onClick: removeSelected, className: "flex-1 py-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center justify-center gap-2 border border-rose-100 active:scale-95", title: t('removeElement', 'Verwijder'), children: [_jsx(Trash2, { size: 16 }), " ", t('delete', 'Verwijder')] })] })] })) })] })] }), showDataModal && (_jsx("div", { className: "fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-2xl rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]", children: [_jsxs("div", { className: "p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50", children: [_jsx("h3", { className: "font-black text-slate-800 uppercase text-sm tracking-wide", children: t('selectLiveOrder') }), _jsx("button", { onClick: () => setShowDataModal(false), className: "p-2 hover:bg-slate-200 rounded-full transition-colors", children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "p-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row gap-3", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx(Search, { className: "absolute left-4 top-1/2 -translate-y-1/2 text-slate-400", size: 18 }), _jsx("input", { type: "text", placeholder: t('searchOrderPlaceholder'), className: "w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm outline-none focus:border-blue-500 transition-all", onKeyDown: (e) => {
                                                if (e.key === 'Enter') {
                                                    handleSearchOrder(e.target.value);
                                                }
                                            } })] }), _jsx("div", { className: "w-full sm:w-1/3", children: _jsxs("select", { value: stationFilter, onChange: (e) => handleStationFilterChange(e.target.value), className: "w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm outline-none focus:border-blue-500 transition-all", children: [_jsx("option", { value: "", children: t('adminLabelDesigner.allStations', 'Alle Stations') }), allStations.map(s => (_jsx("option", { value: s, children: s }, s)))] }) })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/30", children: isLoading ? (_jsx("div", { className: "flex justify-center py-10", children: _jsx(Loader2, { className: "animate-spin text-blue-500" }) })) : availableOrders.length === 0 ? (_jsx("div", { className: "text-center py-10 text-slate-400 italic text-xs", children: t('noOrdersFound') })) : (_jsx("div", { className: "space-y-2", children: availableOrders.map(order => (_jsxs("button", { onClick: () => selectOrderForPreview(order), className: "w-full text-left p-4 bg-white border border-slate-100 rounded-xl hover:border-blue-400 hover:shadow-md transition-all group", children: [_jsxs("div", { className: "flex justify-between items-start mb-1", children: [_jsx("span", { className: "font-black text-slate-800", children: order.orderId }), _jsx("span", { className: "text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded", children: order.status || "N/A" })] }), _jsx("p", { className: "text-xs text-slate-500 font-medium truncate", children: order.item || "Geen omschrijving" }), _jsxs("div", { className: "flex gap-2 mt-2", children: [order.itemCode && _jsx("span", { className: "text-[9px] font-mono bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100", children: order.itemCode }), order.lotNumber && _jsx("span", { className: "text-[9px] font-mono bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-100", children: order.lotNumber })] })] }, order.id))) })) })] }) })), showTagManager && (_jsx("div", { className: "fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-md rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]", children: [_jsxs("div", { className: "p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50", children: [_jsx("h3", { className: "font-black text-slate-800 uppercase text-sm tracking-wide", children: t('adminLabelDesigner.tagManagement', 'Tag Beheer') }), _jsx("button", { onClick: () => setShowTagManager(false), className: "p-2 hover:bg-slate-200 rounded-full transition-colors", children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "p-6 overflow-y-auto custom-scrollbar", children: [_jsx("p", { className: "text-xs text-slate-500 mb-4", children: t('adminLabelDesigner.tagManagerHelpText', 'Klik op een tag om deze toe te voegen aan (of te verwijderen van) het huidige ontwerp.') }), _jsxs("div", { className: "relative mb-4", children: [_jsx(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400", size: 14 }), _jsx("input", { type: "text", placeholder: t('adminLabelDesigner.searchTags', 'Zoek tags...'), value: tagSearch, onChange: (e) => setTagSearch(e.target.value), className: "w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500", autoFocus: true })] }), _jsx("div", { className: "flex flex-wrap gap-2", children: allUniqueTags.filter(t => t.toLowerCase().includes(tagSearch.toLowerCase())).length === 0 ? (_jsx("span", { className: "text-xs text-slate-400 italic", children: t('adminLabelDesigner.noTagsFound', 'Geen tags gevonden.') })) : (allUniqueTags
                                        .filter(t => t.toLowerCase().includes(tagSearch.toLowerCase()))
                                        .map(tag => {
                                        const isSelected = labelTags.includes(tag);
                                        return (_jsxs("div", { className: `group flex items-center gap-1 border rounded-lg pl-3 pr-1 py-1 transition-all ${isSelected ? 'bg-blue-100 border-blue-300' : 'bg-slate-100 hover:bg-blue-50 border-slate-200 hover:border-blue-200'}`, children: [_jsx("button", { onClick: () => {
                                                        addToHistory();
                                                        if (isSelected) {
                                                            setLabelTags(labelTags.filter(t => t !== tag));
                                                        }
                                                        else {
                                                            setLabelTags([...labelTags, tag]);
                                                        }
                                                        setHasUnsavedChanges(true);
                                                    }, className: `text-xs font-bold ${isSelected ? 'text-blue-700' : 'text-slate-700 group-hover:text-blue-700'}`, children: tag }), _jsx("button", { onClick: (e) => {
                                                        e.stopPropagation();
                                                        deleteTagGlobally(tag);
                                                    }, className: "p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors", title: t('adminLabelDesigner.deleteTagGlobally', 'Verwijder overal'), children: _jsx(Trash2, { size: 12 }) })] }, tag));
                                    })) })] })] }) }))] }));
};
export default AdminLabelDesigner;
