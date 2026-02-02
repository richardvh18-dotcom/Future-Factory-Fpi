import React, { useState, useEffect, useRef, useMemo } from "react";
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
} from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { generateLotNumber } from "../../../utils/lotLogic";
import {
  processLabelData,
  resolveLabelContent,
} from "../../../utils/labelHelpers";

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
  const [mode, setMode] = useState("auto");
  const [lotNumber, setLotNumber] = useState("");
  const [stringCount, setStringCount] = useState(1);
  const [manualLotInput, setManualLotInput] = useState("");

  const [availableLabels, setAvailableLabels] = useState([]);
  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [loadingLabels, setLoadingLabels] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);

  const containerRef = useRef(null);

  // 1. Label Templates Laden
  useEffect(() => {
    const fetchLabels = async () => {
      if (!isOpen) return;
      setLoadingLabels(true);
      try {
        const labelsRef = collection(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "label_templates"
        );
        const querySnapshot = await getDocs(labelsRef);
        const labels = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setAvailableLabels(labels);

        if (labels.length > 0) {
          // Kies standaard een smal label voor de meeste stations
          let defaultLabel = labels.find(
            (l) => l.name.toLowerCase().includes("smal") || l.height < 45
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
  }, [isOpen, appId]);

  // 2. Lotnummer generatie
  useEffect(() => {
    if (isOpen && order && mode === "auto") {
      setLotNumber(generateLotNumber(stationId, existingProducts || []));
    }
  }, [isOpen, order, mode, stationId, existingProducts]);

  // 3. Data voor preview
  const previewData = useMemo(() => {
    if (!order) return {};
    return processLabelData({
      ...order,
      orderNumber: order.orderId,
      productId: order.itemCode,
      description: order.item,
      lotNumber: lotNumber || "26-01-XXXX",
    });
  }, [order, lotNumber]);

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
  const handlePrint = () => {
    if (!selectedLabel) return;
    
    const quantity = prompt("Hoeveel labels wilt u printen?", "1");
    if (!quantity || isNaN(quantity) || parseInt(quantity) < 1) return;
    
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

  if (!isOpen || !order) return null;

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
                    Lot Handmatig Invoeren
                  </label>
                  <input
                    type="text"
                    value={manualLotInput}
                    onChange={(e) => {
                      setManualLotInput(e.target.value.toUpperCase());
                      setLotNumber(e.target.value.toUpperCase());
                    }}
                    placeholder="YY-WW-XXXX"
                    className="w-full p-3 bg-white border-2 border-slate-100 rounded-2xl font-mono text-xl font-black uppercase outline-none focus:border-blue-600 shadow-sm text-center"
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
                  stringCount
                )
              }
              disabled={!lotNumber}
              className="flex-[2] py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.15em] shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
            >
              <PlayCircle size={20} /> Order Starten
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
            {selectedLabel ? (
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
                          fontFamily: "sans-serif",
                          fontWeight: el.isBold ? "900" : "normal",
                          whiteSpace: "nowrap",
                          lineHeight: "1",
                        }}
                      >
                        {displayContent}
                      </div>
                    );

                  if (el.type === "barcode")
                    return (
                      <div key={index} style={baseStyle}>
                        <img
                          src={getBarcodeUrl(displayContent)}
                          alt="BC"
                          className="w-full h-full object-fill"
                        />
                      </div>
                    );

                  if (el.type === "qr")
                    return (
                      <div key={index} style={baseStyle}>
                        <img
                          src={getQRCodeUrl(displayContent)}
                          alt="QR"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    );

                  return null;
                })}
              </div>
            ) : (
              <div className="text-slate-700 p-20 border-2 border-dashed border-slate-800 rounded-[50px] animate-pulse text-xs uppercase font-black tracking-widest italic">
                Ontwerp laden...
              </div>
            )}
          </div>

          {/* --- PRINT AREA (ALLEEN PRINT KNOP) --- */}
          <div className="w-full max-w-sm bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-md mb-2 flex flex-col gap-3 animate-in slide-in-from-bottom-6 duration-700 text-left">
            <div className="flex justify-between items-center px-2">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                Printer
              </span>
              <span className="text-[8px] font-black text-blue-500 uppercase bg-blue-500/10 px-2 py-0.5 rounded tracking-tighter">
                Standaard
              </span>
            </div>

            <button
              onClick={handlePrint}
              disabled={!selectedLabel}
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-sm tracking-[0.2em] shadow-2xl shadow-blue-900/40 hover:bg-blue-500 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-30"
            >
              <Printer size={22} />
              Print Label
            </button>

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
