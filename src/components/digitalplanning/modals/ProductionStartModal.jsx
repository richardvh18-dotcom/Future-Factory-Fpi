import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  PlayCircle,
  Printer,
  RefreshCw,
  Edit3,
  QrCode,
  CheckCircle,
  Layers,
  Loader2,
  X,
  Keyboard,
  Activity,
  FileText,
  Code,
  Wifi,
} from "lucide-react";
import { collection, getDocs, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { generateLotNumber } from "../../../utils/lotLogic";
import { getLotPlaceholder } from "../../../utils/lotPlaceholder";
import {
  processLabelData,
  resolveLabelContent,
  applyLabelLogic,
} from "../../../utils/labelHelpers";
import { generateZPL, downloadZPL } from "../../../utils/zplHelper";

const PIXELS_PER_MM = 3.78;
const appId = typeof __app_id !== "undefined" ? __app_id : "fittings-app-v1";

const getQRCodeUrl = (data) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=${encodeURIComponent(
    data
  )}`;

const getBarcodeUrl = (data) =>
  `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(
    data
  )}&scale=3&height=10&incltext&guardwhitespace`;

const ProductionStartModal = ({
  order,
  isOpen,
  onClose,
  onStart,
  stationId = "",
  existingProducts = [],
}) => {
  const [mode, setMode] = useState("manual");
  const [lotNumber, setLotNumber] = useState("");
  const [stringCount, setStringCount] = useState(1);
  const [manualLotInput, setManualLotInput] = useState("");
  const [manualOrderInput, setManualOrderInput] = useState("");
  const [assignedOperators, setAssignedOperators] = useState([]);
  const [operatorInput, setOperatorInput] = useState("");

  const [availableLabels, setAvailableLabels] = useState([]);
  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [loadingLabels, setLoadingLabels] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const location = useLocation();
  
  const [savedPrinters, setSavedPrinters] = useState([]);
  const [printConfig, setPrintConfig] = useState({
    mode: "standard", // 'standard' | 'network'
    printerIp: ""
  });

  const [labelRules, setLabelRules] = useState([]);
  const containerRef = useRef(null);

  // 1. Label Templates Laden
  useEffect(() => {
    const fetchLabels = async () => {
      if (!isOpen) return;
      setLoadingLabels(true);
      try {
        // Gebruik hetzelfde Firestore-path als AdminLabelDesigner
        // /future-factory/settings/label_templates
        const labelsRef = collection(db, "future-factory", "settings", "label_templates");
        const querySnapshot = await getDocs(labelsRef);
        const labels = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setAvailableLabels(labels);

        if (labels.length > 0) {
          // Kies standaard een smal label voor de meeste stations
          let defaultLabel = labels.find(
            (l) => l.name?.toLowerCase().includes("smal") || l.height < 45
          );
          setSelectedLabelId(defaultLabel?.id || labels[0].id);
        }
      } catch (e) {
        console.error("Fout bij laden labels:", e);
      } finally {
        setLoadingLabels(false);
      }
    };
    fetchLabels();

    // Fetch Label Logic Rules
    const rulesRef = collection(db, "future-factory", "settings", "label_logic");
    getDocs(rulesRef).then(snap => {
      setLabelRules(snap.docs.map(d => d.data()));
    }).catch(err => console.error("Error loading label rules", err));
  }, [isOpen]);

  // 1b. Operators ophalen voor dit station
  useEffect(() => {
    const fetchOccupancy = async () => {
      if (!isOpen || !stationId) return;
      
      const today = new Date().toISOString().split('T')[0];
      
      try {
        const q = query(
          collection(db, "future-factory", "production", "machine_occupancy"),
          where("machineId", "==", stationId),
          where("date", "==", today)
        );
        
        const snapshot = await getDocs(q);
        const operators = snapshot.docs.map(doc => ({
          number: doc.data().operatorNumber,
          name: doc.data().operatorName
        }));
        
        setAssignedOperators(operators);
        
        // Als er precies 1 operator is, vul deze alvast in
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
    const printersRef = collection(db, "future-factory", "settings", "printers");
    const unsub = onSnapshot(printersRef, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSavedPrinters(list);
      
      // Automatisch printer selecteren: Eerst kijken naar station koppeling, dan naar global default
      const stationPrinter = list.find(p => p.linkedStations && p.linkedStations.includes(stationId));
      const globalDefault = list.find(p => p.isDefault);
      const targetPrinter = stationPrinter || globalDefault;

      if (targetPrinter) {
        if (targetPrinter.type === 'network') {
            setPrintConfig(prev => ({ ...prev, mode: 'network', printerIp: targetPrinter.ip }));
        } else {
            setPrintConfig(prev => ({ ...prev, mode: 'standard' }));
        }
      }
    });
    return () => unsub();
  }, [stationId, isOpen]);

  // 2. Lotnummer generatie
  useEffect(() => {
    if (isOpen && order && mode === "auto") {
      if (order.lotNumber) {
        setLotNumber(order.lotNumber);
      } else if (order.activeLot) {
        setLotNumber(order.activeLot);
      } else {
        setLotNumber(generateLotNumber(stationId, existingProducts || []));
      }
    }
    if (isOpen && mode === "manual") {
      setManualLotInput("");
      setManualOrderInput("");
    }
  }, [isOpen, order, mode, stationId, existingProducts]);

  // 3. Data voor preview
  const previewData = useMemo(() => {
    if (!order) return {};
    const baseData = processLabelData({
      ...order,
      orderNumber: order.orderId,
      productId: order.itemCode,
      description: order.item,
      lotNumber: lotNumber || "26-01-XXXX",
    });
    
    return applyLabelLogic(baseData, labelRules);
  }, [order, lotNumber, labelRules]);

  const selectedLabel = useMemo(
    () => availableLabels.find((l) => l.id === selectedLabelId),
    [availableLabels, selectedLabelId]
  );

  // 4. Zoom berekening voor preview venster
  useEffect(() => {
    if (containerRef.current && selectedLabel) {
      const containerW = containerRef.current.clientWidth - 60;
      const containerH = containerRef.current.clientHeight - 180;
      const labelW = selectedLabel.width * PIXELS_PER_MM;
      const labelH = selectedLabel.height * PIXELS_PER_MM;
      setPreviewZoom(Math.min(1.4, containerW / labelW, containerH / labelH));
    }
  }, [selectedLabel, isOpen]);

  // 5. Browser Print Functie
  const handlePrint = async () => {
    if (!selectedLabel) return;
    
    const quantityStr = prompt("Hoeveel labels wilt u printen?", "1");
    const quantity = parseInt(quantityStr);
    if (!quantity || isNaN(quantity) || quantity < 1) return;
    
    // NETWERK PRINT (ZPL)
    if (printConfig.mode === "network") {
      if (!printConfig.printerIp) {
        alert("Selecteer eerst een netwerkprinter.");
        return;
      }
      
      const selectedPrinter = savedPrinters.find(p => p.ip === printConfig.printerIp);
      const darkness = selectedPrinter?.darkness ? parseInt(selectedPrinter.darkness) : 15;
      const dpi = selectedPrinter?.dpi ? parseInt(selectedPrinter.dpi) : 203;
      
      let zpl = await generateZPL(selectedLabel, previewData, dpi);
      // Voeg darkness toe als het er nog niet in zit
      if (!zpl.includes("~SD")) zpl = `~SD${darkness}\n${zpl}`;

      try {
        for (let i = 0; i < quantity; i++) {
           await fetch(`http://${printConfig.printerIp}/pstprnt`, { method: "POST", body: zpl, mode: "no-cors" });
        }
        alert(`Opdracht verzonden naar ${selectedPrinter?.name || printConfig.printerIp}`);
      } catch (e) {
        alert("Fout bij printen naar netwerkprinter: " + e.message);
      }
      return;
    }

    // STANDAARD BROWSER PRINT
    
    const printWindow = window.open("", "_blank", "width=800,height=600");
    const labelW = selectedLabel.width;
    const labelH = selectedLabel.height;

    const htmlContent = `
      <html>
        <head>
          <style>
            @page { size: ${labelW}mm ${labelH}mm; margin: 0; }
            body { margin: 0; padding: 0; width: ${labelW}mm; height: ${labelH}mm; overflow: hidden; font-family: sans-serif; background: white; }
            .canvas { position: relative; width: 100%; height: 100%; }
            .el { position: absolute; color: black; line-height: 1; transform-origin: top left; }
            img { display: block; width: 100%; height: 100%; object-fit: contain; }
          </style>
          <script>
            window.onload = function() {
              for (let i = 0; i < ${quantity}; i++) {
                window.print();
              }
              window.close();
            };
          </script>
        </head>
        <body>
          <div class="canvas">
            ${selectedLabel.elements
              ?.map((el) => {
                const res = resolveLabelContent(el, previewData);
                const style = `left:${el.x}mm; top:${el.y}mm; width:${
                  el.width || "auto"
                }mm; height:${el.height || "auto"}mm; font-size:${
                  el.fontSize
                }px; font-weight:${
                  el.isBold ? "900" : "normal"
                }; transform: rotate(${el.rotation || 0}deg); font-family: sans-serif; white-space: nowrap;`;
                if (el.type === "text")
                  return `<div class="el" style="${style}">${res.content}</div>`;
                if (el.type === "qr")
                  return `<div class="el" style="${style}"><img src="${getQRCodeUrl(
                    res.content
                  )}"></div>`;
                if (el.type === "barcode")
                  return `<div class="el" style="${style}"><img src="${getBarcodeUrl(
                    res.content
                  )}"></div>`;
                return "";
              })
              .join("")}
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleZPLDownload = async () => {
    if (!selectedLabel) return;
    const zpl = await generateZPL(selectedLabel, previewData);
    downloadZPL(zpl, `label_${order.orderId}_${lotNumber}.zpl`);
  };

  // Helper voor weergave geselecteerde operator
  const selectedOperatorName = assignedOperators.find(op => op.number === operatorInput)?.name;

  if (!isOpen || !order || location.pathname.includes("/login")) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-2 md:p-4 backdrop-blur-md animate-in fade-in">
      <div className="bg-white w-full max-w-6xl h-full md:h-[85vh] rounded-[40px] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-white/10">
        {/* LINKS: CONFIGURATIE */}
        <div className="w-full md:w-1/3 p-4 border-r border-slate-100 flex flex-col bg-slate-50/50 overflow-y-auto custom-scrollbar">
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
              <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between items-center">
                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Actueel Lot</span>
                 <span className="text-xs font-mono font-black text-blue-600">{lotNumber || "-"}</span>
              </div>
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
                  <div className="text-2xl font-mono font-black text-white italic tracking-tighter">
                    {lotNumber}
                  </div>
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
                      onChange={(e) =>
                        setStringCount(parseInt(e.target.value) || 1)
                      }
                      className="w-full font-black text-slate-800 outline-none text-lg"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 animate-in slide-in-from-top-2 text-left">
                <div className="space-y-1 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    Ordernummer (scannen of invullen)
                  </label>
                  <input
                    type="text"
                    value={manualOrderInput}
                    onChange={(e) => setManualOrderInput(e.target.value.toUpperCase())}
                    placeholder={"N2000000"}
                    className="w-full p-3 bg-white border-2 border-slate-100 rounded-2xl font-mono text-lg font-black uppercase outline-none focus:border-blue-600 shadow-sm text-center"
                    required
                  />
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    Lotnummer (scannen of invullen)
                  </label>
                  <input
                    type="text"
                    value={manualLotInput}
                    onChange={(e) => {
                      setManualLotInput(e.target.value.toUpperCase());
                      setLotNumber(e.target.value.toUpperCase());
                    }}
                    placeholder={getLotPlaceholder(stationId)}
                    className="w-full p-3 bg-white border-2 border-slate-100 rounded-2xl font-mono text-xl font-black uppercase outline-none focus:border-blue-600 shadow-sm text-center placeholder:text-slate-300"
                    required
                  />
                </div>
              </div>
            )}

            {/* Label selectie */}
            <div className="pt-3 border-t border-slate-200 text-left">
              <label className="text-[9px] font-black text-slate-400 uppercase block mb-1.5 ml-2">
                Label Formaat
              </label>
              <div className="relative group">
                <select
                  value={selectedLabelId}
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
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-5 bg-white border-2 border-slate-100 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-100 transition-all"
            >
              Annuleer
            </button>
            <button
              onClick={() =>
                onStart(
                  order,
                  mode === "auto" ? lotNumber : manualLotInput,
                  stringCount,
                  manualOrderInput,
                  operatorInput,
                  selectedOperatorName // Geef ook de naam mee voor historie
                )
              }
              disabled={
                (mode === "manual" && (!manualOrderInput || !manualLotInput)) ||
                (mode === "auto" && !lotNumber)
              }
              className="flex-[2] py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.15em] shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
            >
              <PlayCircle size={20} /> {selectedOperatorName ? `Start (${operatorInput})` : "Order Starten"}
            </button>
          </div>
        </div>

        {/* RECHTS: DESIGN PREVIEW & PRINT ACTIE */}
        <div
          ref={containerRef}
          className="flex-1 bg-slate-900 p-6 flex flex-col items-center justify-between relative overflow-hidden text-left"
        >
          <div className="absolute top-4 left-4 text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2 text-left">
            <Activity size={12} className="text-emerald-500" /> Etiket Preview
          </div>

          <div className="flex-1 flex items-center justify-center w-full min-h-0 py-8">
            {mode === "manual" ? null : (
              selectedLabel ? (
                <div
                  className="bg-white shadow-[0_0_100px_rgba(0,0,0,0.8)] relative transition-all duration-500 origin-center overflow-hidden border-2 border-white/10"
                  style={{
                    width: `${
                      selectedLabel.width * PIXELS_PER_MM * previewZoom
                    }px`,
                    height: `${
                      selectedLabel.height * PIXELS_PER_MM * previewZoom
                    }px`,
                  }}
                >
                  {selectedLabel.elements?.map((el, index) => {
                    const resolved = resolveLabelContent(el, previewData);
                    const displayContent = resolved.content;
                    const baseStyle = {
                      position: "absolute",
                      left: `${el.x * PIXELS_PER_MM * previewZoom}px`,
                      top: `${el.y * PIXELS_PER_MM * previewZoom}px`,
                      width: el.width
                        ? `${el.width * PIXELS_PER_MM * previewZoom}px`
                        : "auto",
                      height: el.height
                        ? `${el.height * PIXELS_PER_MM * previewZoom}px`
                        : "auto",
                      color: "black",
                      transform: `rotate(${el.rotation || 0}deg)`,
                      transformOrigin: "top left",
                      overflow: "hidden",
                      textAlign: "left",
                    };

                    if (el.type === "text")
                      return (
                        <div
                          key={index}
                          style={{
                            ...baseStyle,
                            fontSize: `${el.fontSize * previewZoom}px`,
                            fontWeight: el.isBold ? "900" : "normal",
                            fontFamily: el.fontFamily || "Arial, sans-serif",
                            width: `${el.width * PIXELS_PER_MM * previewZoom}px`,
                            height: el.height
                              ? `${el.height * PIXELS_PER_MM * previewZoom}px`
                              : "auto",
                            textAlign: el.align || "left",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            lineHeight: "1",
                          }}
                        >
                          {displayContent}
                        </div>
                      );

                    if (el.type === "line")
                      return (
                        <div
                          key={index}
                          style={{
                            ...baseStyle,
                            width: `${el.width * PIXELS_PER_MM * previewZoom}px`,
                            height: `${el.height * PIXELS_PER_MM * previewZoom}px`,
                            backgroundColor: "black",
                          }}
                        />
                      );

                    if (el.type === "box")
                      return (
                        <div
                          key={index}
                          style={{
                            ...baseStyle,
                            width: `${el.width * PIXELS_PER_MM * previewZoom}px`,
                            height: `${el.height * PIXELS_PER_MM * previewZoom}px`,
                            border: `${(el.thickness || 1) * PIXELS_PER_MM * previewZoom}px solid black`,
                            boxSizing: "border-box",
                          }}
                        />
                      );

                    if (el.type === "barcode" || el.type === "qr")
                      return (
                        <div
                          key={index}
                          style={{
                            ...baseStyle,
                            width: `${(el.width || 30) * PIXELS_PER_MM * previewZoom}px`,
                            height: `${(el.height || 30) * PIXELS_PER_MM * previewZoom}px`,
                            background: "#f8fafc",
                            border: "1px solid #cbd5e1",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {el.type === "barcode" ? (
                            <img
                              src={getBarcodeUrl(displayContent)}
                              alt="BC"
                              style={{ width: "80%", height: "80%", objectFit: "fill" }}
                            />
                          ) : (
                            <img
                              src={getQRCodeUrl(displayContent)}
                              alt="QR"
                              style={{ width: "80%", height: "80%", objectFit: "contain" }}
                            />
                          )}
                        </div>
                      );

                    return null;
                  })}
                </div>
              ) : (
                <div className="text-slate-700 p-20 border-2 border-dashed border-slate-800 rounded-[50px] animate-pulse text-xs uppercase font-black tracking-widest italic">
                  Ontwerp laden...
                </div>
              )
            )}
          </div>

          {/* --- PRINT AREA (ALLEEN PRINT KNOP) --- */}
          <div className="w-full max-w-sm bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-md mb-2 flex flex-col gap-3 animate-in slide-in-from-bottom-6 duration-700 text-left">
            <div className="flex justify-between items-center px-1">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Printer</span>
              <div className="flex bg-slate-800/50 p-0.5 rounded-lg border border-white/10">
                <button 
                  onClick={() => setPrintConfig({...printConfig, mode: 'standard'})}
                  className={`px-2 py-1 rounded-md text-[8px] font-black uppercase transition-all ${printConfig.mode === 'standard' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  PDF
                </button>
                <button 
                  onClick={() => setPrintConfig({...printConfig, mode: 'network'})}
                  className={`px-2 py-1 rounded-md text-[8px] font-black uppercase transition-all flex items-center gap-1 ${printConfig.mode === 'network' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  <Wifi size={8} /> IP
                </button>
              </div>
            </div>

            {printConfig.mode === 'network' && (
              <select 
                value={printConfig.printerIp}
                onChange={(e) => setPrintConfig({...printConfig, printerIp: e.target.value})}
                className="w-full p-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] font-bold text-slate-300 outline-none focus:border-blue-500"
              >
                <option value="">-- Kies Printer --</option>
                {savedPrinters.map(p => (
                  <option key={p.id} value={p.ip}>{p.name} ({p.ip})</option>
                ))}
              </select>
            )}

            <div className="flex gap-2">
                <button
                onClick={handlePrint}
                disabled={!selectedLabel}
                className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-sm tracking-[0.2em] shadow-2xl shadow-blue-900/40 hover:bg-blue-500 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-30"
                >
                <Printer size={22} />
                Print
                </button>

                <button
                onClick={handleZPLDownload}
                disabled={!selectedLabel}
                className="px-4 py-4 bg-slate-800 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-30"
                title="Download ZPL (Zebra)"
                >
                <Code size={18} />
                ZPL
                </button>
            </div>
            <p className="text-[8px] text-slate-500 text-center font-bold uppercase tracking-tighter opacity-50">
              Selecteer aantal bij print prompt
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductionStartModal;
