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
  BoxSelect,
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
} from "lucide-react";
import {
  doc,
  setDoc,
  getDocs,
  collection,
  deleteDoc,
  query,
  limit,
  serverTimestamp,
  onSnapshot,
  where,
} from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";

// Importeer de logica en constanten uit het hulpbestand
import {
  LABEL_SIZES,
  processLabelData,
  resolveLabelContent,
} from "../../utils/labelHelpers";
import { generateZPL, downloadZPL } from "../../utils/zplHelper";

const PIXELS_PER_MM = 3.78;
const SNAP_THRESHOLD_MM = 1.5;

/**
 * AdminLabelDesigner V4.2 - Standalone Admin Edition
 * Beheert labelontwerpen in de root: /future-factory/settings/label_templates/records/
 * Verplaatst van matrixmanager naar hoofd admin map.
 */
const AdminLabelDesigner = ({ onBack }) => {
  const { t } = useTranslation();
  const [labelName, setLabelName] = useState(t('adminLabelDesigner.newLabel'));
  const [selectedSizeKey, setSelectedSizeKey] = useState("Standard");
  const [labelWidth, setLabelWidth] = useState(LABEL_SIZES.Standard.width);
  const [labelHeight, setLabelHeight] = useState(LABEL_SIZES.Standard.height);

  const [elements, setElements] = useState([]);
  const [selectedElementId, setSelectedElementId] = useState(null);
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

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

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

  const filteredVariables = useMemo(() => {
      if (selectedLogicCode) {
          const rule = labelLogicRules.find(r => r.productCode === selectedLogicCode);
          return rule?.variables?.map(v => v.name).sort() || [];
      }
      const vars = new Set();
      labelLogicRules.forEach(r => {
          r.variables?.forEach(v => { if(v.name) vars.add(v.name); });
      });
      return Array.from(vars).sort();
  }, [labelLogicRules, selectedLogicCode]);

  useEffect(() => {
    if (selectedSizeKey !== "Custom" && LABEL_SIZES[selectedSizeKey]) {
      setLabelWidth(LABEL_SIZES[selectedSizeKey].width);
      setLabelHeight(LABEL_SIZES[selectedSizeKey].height);
    }
  }, [selectedSizeKey]);

  // 2. Data Preview Handlers
  const fetchLiveOrders = async () => {
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

  const handleSearchOrder = async (queryText) => {
    if (!queryText) {
        fetchLiveOrders(); // Reset naar standaard lijst als leeg
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

    const zpl = await generateZPL(labelConfig, data);
    downloadZPL(zpl, `${labelName.replace(/\s+/g, "_")}_preview.zpl`);
  };

  // 3. Designer Acties
  const addElement = (type) => {
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
    setSelectedElementId(newElement.id);
    setHasUnsavedChanges(true);
  };

  const updateElement = (id, updates) => {
    setElements(
      elements.map((el) => (el.id === id ? { ...el, ...updates } : el))
    );
    setHasUnsavedChanges(true);
  };

  const removeElement = (id) => {
    setElements(elements.filter((el) => el.id !== id));
    if (selectedElementId === id) setSelectedElementId(null);
    setHasUnsavedChanges(true);
  };

  const alignCenter = (axis) => {
    if (!selectedElementId) return;
    const el = elements.find((e) => e.id === selectedElementId);
    if (axis === "x")
      updateElement(el.id, { x: (labelWidth - (el.width || 0)) / 2 });
    else if (axis === "y")
      updateElement(el.id, { y: (labelHeight - (el.height || 0)) / 2 });
  };

  // 4. Drag Engine met Snapping
  const handleMouseDown = (e, id) => {
    e.stopPropagation();
    setSelectedElementId(id);
    const element = elements.find((el) => el.id === id);
    const labelCenterX = labelWidth / 2;
    const labelCenterY = labelHeight / 2;
    const startX = e.clientX;
    const startY = e.clientY;

    const handleMouseMove = (moveEvent) => {
      const deltaX = (moveEvent.clientX - startX) / zoom / PIXELS_PER_MM;
      const deltaY = (moveEvent.clientY - startY) / zoom / PIXELS_PER_MM;
      let newX = Math.max(0, element.x + deltaX);
      let newY = Math.max(0, element.y + deltaY);

      const activeGuidelines = [];
      const myWidth = element.width || 0;
      const myHeight = element.height || 0;
      const myCenterX = newX + myWidth / 2;
      const myCenterY = newY + myHeight / 2;

      if (Math.abs(myCenterX - labelCenterX) < SNAP_THRESHOLD_MM) {
        newX = labelCenterX - myWidth / 2;
        activeGuidelines.push({ type: "vertical", pos: labelCenterX });
      }
      if (Math.abs(myCenterY - labelCenterY) < SNAP_THRESHOLD_MM) {
        newY = labelCenterY - myHeight / 2;
        activeGuidelines.push({ type: "horizontal", pos: labelCenterY });
      }

      setGuidelines(activeGuidelines);
      updateElement(id, { x: newX, y: newY });
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
  const saveLabel = async (nameOverride = null) => {
    const nameToUse = nameOverride || labelName;
    if (!nameToUse.trim()) return alert(t('adminLabelDesigner.enterLabelName'));
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

      await setDoc(docRef, {
        name: nameToUse,
        sizeKey: selectedSizeKey || "Custom",
        width: labelWidth || 0,
        height: labelHeight || 0,
        elements: sanitizedElements,
        lastUpdated: serverTimestamp(),
        updatedBy: "Admin Designer",
      });
      await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Label template saved: ${nameToUse}`);
      setHasUnsavedChanges(false);
      
      if (nameOverride) {
          setLabelName(nameToUse);
          alert(t('adminLabelDesigner.labelSavedAs', { name: nameToUse }));
      } else {
          alert(t('adminLabelDesigner.labelSaved'));
      }
    } catch (e) {
      console.error("Save error:", e);
      alert(t('adminLabelDesigner.saveError') + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAs = () => {
      const newName = prompt(t('adminLabelDesigner.enterNameForNew'), `${labelName}${t('adminLabelDesigner.copySuffix')}`);
      if (newName && newName.trim()) {
          saveLabel(newName);
      }
  };

  const duplicateLabel = async (label) => {
    const newName = `${label.name}${t('adminLabelDesigner.copySuffix')}`;
    if (!window.confirm(t('adminLabelDesigner.confirmDuplicate', { name: newName }))) return;
    
    setIsLoading(true);
    try {
      const labelId = newName.trim().replace(/[^a-zA-Z0-9-_]/g, "_").toLowerCase() + "_" + Date.now();
      const docRef = doc(db, ...PATHS.LABEL_TEMPLATES, labelId);

      const labelData = { ...label };
      delete labelData.id;

      await setDoc(docRef, {
        ...labelData,
        name: newName,
        lastUpdated: serverTimestamp(),
        updatedBy: "Admin Designer",
      });
    } catch (e) {
      console.error("Duplicate error:", e);
      alert(t('adminLabelDesigner.duplicateError') + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteLabel = async (id) => {
    if (!window.confirm(t('adminLabelDesigner.confirmDelete'))) return;
    try {
      await deleteDoc(doc(db, ...PATHS.LABEL_TEMPLATES, id));
      await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Label template deleted: ${id}`);
    } catch (e) {
      console.error("Delete error:", e);
      alert(t('adminLabelDesigner.deleteError'));
    }
  };

  const selectedElement = elements.find((el) => el.id === selectedElementId);

  return (
    <div className="flex flex-col h-full w-full bg-slate-100 overflow-hidden text-left animate-in fade-in">
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 px-8 py-3 flex justify-between items-center shadow-sm z-20 shrink-0 h-20">
        <div className="flex items-center gap-6">
          <button
            onClick={onBack}
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
            onClick={handleDownloadZPL}
            className="p-3 bg-white border-2 border-slate-100 text-slate-600 hover:text-blue-600 hover:border-blue-100 rounded-2xl transition-all shadow-sm"
            title="Download ZPL Preview"
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
              <option value="Custom">{t('customSize')}</option>
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

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar text-left">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
              {t('myTemplates')}
            </h3>
            <div className="space-y-2">
              {savedLabels.map((l) => (
                <div
                  key={l.id}
                  onClick={() => {
                    if (hasUnsavedChanges && !window.confirm(t('adminLabelDesigner.overwriteConfirm'))) return;
                    setLabelName(l.name);
                    setLabelWidth(l.width);
                    setLabelHeight(l.height);
                    if (l.sizeKey) setSelectedSizeKey(l.sizeKey);
                    setElements(l.elements || []);
                    setSelectedElementId(null);
                    setHasUnsavedChanges(false);
                  }}
                  className="group p-4 bg-slate-50 hover:bg-white rounded-[20px] cursor-pointer border-2 border-transparent hover:border-blue-500 transition-all relative shadow-sm"
                >
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateLabel(l);
                      }}
                      className="p-1.5 bg-white text-blue-600 rounded-lg shadow-sm border border-blue-100 hover:bg-blue-50"
                      title={t('adminLabelDesigner.duplicateTitle')}
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteLabel(l.id);
                      }}
                      className="p-1.5 bg-white text-rose-600 rounded-lg shadow-sm border border-rose-100 hover:bg-rose-50"
                      title={t('adminLabelDesigner.deleteTitle')}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <p className="font-black text-[11px] text-slate-800 uppercase italic tracking-tight">
                    {l.name}
                  </p>
                  <p className="text-[9px] font-mono font-bold text-slate-400 mt-1">
                    {l.width}x{l.height}{t('mm')}
                  </p>
                </div>
              ))}
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
                onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}
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
          </div>

          <div
            className="w-full h-full flex items-center justify-center p-20 overflow-auto"
            onClick={() => setSelectedElementId(null)}
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
                      selectedElementId === el.id
                        ? "ring-2 ring-blue-500 ring-offset-4 bg-blue-50/20"
                        : "hover:ring-1 hover:ring-blue-300"
                    } p-0.5`}
                  >
                    {el.type === "text" && (() => {
                      const { content } = resolveLabelContent(el, previewData);
                      const hasContent = content !== null && content !== undefined && String(content).trim() !== "";
                      return (
                        <div
                          className="leading-tight"
                          style={{
                            fontSize: `${el.fontSize * zoom}px`,
                            fontWeight: el.isBold ? "900" : "normal",
                            fontFamily: el.fontFamily,
                            width: `${el.width * PIXELS_PER_MM * zoom}px`,
                            height: el.height
                              ? `${el.height * PIXELS_PER_MM * zoom}px`
                              : "auto",
                            backgroundColor: el.isInverse ? "black" : "transparent",
                            color: hasContent ? (el.isInverse ? "white" : "black") : "#cbd5e1",
                            textAlign: el.align || "left",
                            overflow: "hidden",
                            whiteSpace: "pre-wrap",
                            overflowWrap: "break-word",
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
          <div className="p-6 border-b border-slate-50 bg-slate-50/50">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest italic flex items-center gap-2">
              <Settings size={14} /> {t('common.inspector')}
            </h3>
          </div>

          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar text-left">
            {!selectedElement ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-50 py-20">
                <BoxSelect size={64} className="animate-pulse" />
                <p className="text-[9px] font-black uppercase tracking-widest mt-4">
                  {t('selectElement')}
                </p>
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
                      <label className="text-[8px] font-black text-slate-400 uppercase ml-1">{t('rotation')}</label>
                       <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-100">
                          <button onClick={() => updateElement(selectedElement.id, { rotation: (selectedElement.rotation || 0) - 90 })} className="p-1 hover:bg-white rounded shadow-sm text-slate-600"><RotateCcw size={14} /></button>
                          <span className="flex-1 text-center text-xs font-bold text-slate-700">{selectedElement.rotation || 0}°</span>
                          <button onClick={() => updateElement(selectedElement.id, { rotation: (selectedElement.rotation || 0) + 90 })} className="p-1 hover:bg-white rounded shadow-sm text-slate-600"><RotateCw size={14} /></button>
                       </div>
                    </div>

                    {selectedElement.type === 'text' && (
                        <div className="space-y-1.5">
                            <label className="text-[8px] font-black text-slate-400 uppercase ml-1">{t('fontSizePt')}</label>
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
                            <label className="text-[8px] font-black text-slate-400 uppercase ml-1">{t('textAlignment')}</label>
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
                            <span className="text-xs font-bold text-slate-600">{t('bold')}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input 
                                type="checkbox" 
                                checked={selectedElement.isInverse || false} 
                                onChange={(e) => updateElement(selectedElement.id, { isInverse: e.target.checked })}
                                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-slate-300"
                            />
                            <span className="text-xs font-bold text-slate-600">{t('inverse')}</span>
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

                <button
                  onClick={() => removeElement(selectedElement.id)}
                  className="w-full py-4 mt-8 bg-rose-50 text-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center justify-center gap-2 border border-rose-100 active:scale-95"
                >
                  <Trash2 size={16} /> {t('removeElement')}
                </button>
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
            
            <div className="p-4 border-b border-slate-100 bg-white">
                <div className="relative">
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
    </div>
  );
};

export default AdminLabelDesigner;
