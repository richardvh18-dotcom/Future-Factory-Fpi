import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  Search,
  ArrowLeft,
  X,
  Loader2,
  FileText,
  Zap,
  ArrowRight,
  Scan,
  AlertCircle,
  Volume2,
  CheckCircle2,
  Maximize,
} from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";

/**
 * MobileScanner V26 - Focus op Helderheid & Snelheid.
 * Verwijdert zware filters voor een lichter beeld en snellere QR-detectie.
 */
const MobileScanner = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [allOrders, setAllOrders] = useState([]);
  const [allTracked, setAllTracked] = useState([]);

  // UI & Scan States
  const [activeMode, setActiveMode] = useState("idle");
  const [searchTerm, setSearchTerm] = useState("");
  const [cameraError, setCameraError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [jsQrLoaded, setJsQrLoaded] = useState(false);

  // Refs voor de engine
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const requestRef = useRef(null);
  const isScanningRef = useRef(false);
  const isProcessingFrameRef = useRef(false);

  const appId = typeof __app_id !== "undefined" ? __app_id : "fittings-app-v1";

  // 1. Initialisatie van de externe Scan Engine (jsQR)
  useEffect(() => {
    const scriptId = "jsqr-engine-v26";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
      script.async = true;
      script.onload = () => setJsQrLoaded(true);
      document.head.appendChild(script);
    } else {
      setJsQrLoaded(true);
    }

    // Synchroniseer met de database voor direct resultaat na een scan
    const unsubOrders = onSnapshot(
      collection(db, ...PATHS.PLANNING),
      (snap) => {
        setAllOrders(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
      (error) => {
        console.error("Orders listener error:", error);
      }
    );

    const unsubProducts = onSnapshot(
      collection(db, ...PATHS.TRACKING),
      (snap) => {
        setAllTracked(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (error) => {
        console.error("Products listener error:", error);
        setLoading(false);
      }
    );

    return () => {
      console.log("[MobileScanner] Cleanup: listeners worden afgesloten");
      unsubOrders();
      unsubProducts();
      stopCamera();
    };
  }, []); // Leeg array - de listeners moeten één keer worden opgezet bij mount

  // 2. Camera aansturing
  const startCamera = async () => {
    setCameraError(null);
    setIsSuccess(false);
    setActiveMode("camera");

    try {
      const constraints = {
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        isScanningRef.current = true;
        isProcessingFrameRef.current = false;

        // Controleer of het toestel een zaklamp heeft
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities
          ? track.getCapabilities()
          : {};
        setHasFlash(!!capabilities.torch);

        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();

        // Start de analyse-loop
        requestRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err) {
      console.error("Camera fout:", err);
      setCameraError("Camera niet bereikbaar. Controleer uw instellingen.");
      setActiveMode("idle");
    }
  };

  const toggleFlash = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    try {
      const newFlashState = !flashOn;
      await track.applyConstraints({ advanced: [{ torch: newFlashState }] });
      setFlashOn(newFlashState);
    } catch (err) {
      console.warn("Zaklamp niet ondersteund door browser/hardware");
    }
  };

  const stopCamera = () => {
    isScanningRef.current = false;
    isProcessingFrameRef.current = false;
    setFlashOn(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    setActiveMode("idle");
  };

  // 3. De Scan Engine (Geoptimaliseerd voor snelheid)
  const scanFrame = async () => {
    if (
      !isScanningRef.current ||
      !videoRef.current ||
      !canvasRef.current ||
      !window.jsQR
    ) {
      if (isScanningRef.current)
        requestRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    // Voorkom dat de processor overbelast raakt
    if (isProcessingFrameRef.current) {
      requestRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const video = videoRef.current;
    if (video.readyState === 4) {
      isProcessingFrameRef.current = true;

      const canvas = canvasRef.current;
      const context = canvas.getContext("2d", { willReadFrequently: true });

      // Gebruik een ruimer focus gebied voor betere herkenning
      const size = Math.min(video.videoWidth, video.videoHeight) * 0.8;
      const x = (video.videoWidth - size) / 2;
      const y = (video.videoHeight - size) / 2;

      canvas.width = size;
      canvas.height = size;

      // Kopieer het beeld van de camera naar het onzichtbare canvas
      context.drawImage(video, x, y, size, size, 0, 0, size, size);

      const imageData = context.getImageData(0, 0, size, size);

      try {
        // Analyseer de pixels op zoek naar een QR patroon
        const code = window.jsQR(imageData.data, size, size, {
          inversionAttempts: "attemptBoth",
        });

        if (code && code.data) {
          // QR GEVONDEN!
          if (navigator.vibrate) navigator.vibrate(100);
          setIsSuccess(true);
          setSearchTerm(code.data);

          // Korte pauze voor visuele feedback
          setTimeout(() => {
            stopCamera();
          }, 500);
          return;
        }
      } catch (e) {
        console.error("Scan error:", e);
      } finally {
        isProcessingFrameRef.current = false;
      }
    }

    // Probeer het opnieuw bij het volgende beeldje (frame)
    requestRef.current = requestAnimationFrame(scanFrame);
  };

  // 4. Filteren van database resultaten op basis van gescande code
  const searchResults = useMemo(() => {
    const term = (searchTerm || "").toLowerCase().trim();
    if (!term) return [];

    const matchedOrders = allOrders
      .filter(
        (o) =>
          (o.orderId || "").toLowerCase().includes(term) ||
          (o.itemCode || "").toLowerCase().includes(term) ||
          (o.item || "").toLowerCase().includes(term)
      )
      .map((o) => ({ ...o, searchType: "order", displayId: o.orderId }));

    const matchedTracked = allTracked
      .filter(
        (p) =>
          (p.lotNumber || "").toLowerCase().includes(term) ||
          (p.orderId || "").toLowerCase().includes(term) ||
          (p.itemCode || "").toLowerCase().includes(term)
      )
      .map((p) => ({ ...p, searchType: "lot", displayId: p.lotNumber }));

    return [...matchedTracked, ...matchedOrders].slice(0, 15);
  }, [allOrders, allTracked, searchTerm]);

  const handleOpenItem = (item) => {
    const machineId = item.machine || item.stationLabel;
    if (machineId) {
      navigate(`/terminal/${machineId}`, { state: { selectedId: item.id } });
    } else {
      alert("Geen machine gekoppeld aan dit item.");
    }
  };

  if (loading || !jsQrLoaded)
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <Loader2 className="animate-spin text-blue-500 mb-6" size={56} />
        <p className="text-xs font-black uppercase tracking-widest italic animate-pulse">
          Systeem laden...
        </p>
      </div>
    );

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col z-[200] animate-in fade-in overflow-hidden text-left">
      {/* HEADER */}
      <div className="p-6 bg-white border-b border-slate-200 flex items-center justify-between shadow-sm shrink-0">
        <button
          onClick={() => navigate("/portal")}
          className="p-3 -ml-3 text-slate-400 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft size={28} />
        </button>
        <div className="text-center">
          <h1 className="text-xl font-black uppercase italic tracking-tighter leading-none">
            Global <span className="text-blue-600">Scanner</span>
          </h1>
          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            Industrial Vision Core
          </p>
        </div>
        <div className="w-10"></div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 pb-32">
        {/* SCAN TRIGGER */}
        <div className="space-y-4">
          <button
            onClick={startCamera}
            className="w-full py-12 bg-blue-600 text-white rounded-[45px] shadow-2xl shadow-blue-200 flex flex-col items-center justify-center gap-5 active:scale-95 transition-all border-4 border-blue-400/20 group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/20 to-transparent opacity-50"></div>
            <div className="p-6 bg-white/10 rounded-[30px] backdrop-blur-md relative z-10 group-hover:scale-110 transition-transform">
              <Scan size={56} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="text-center relative z-10">
              <span className="font-black uppercase tracking-[0.3em] text-sm block">
                Open Camera Scanner
              </span>
              <span className="text-[10px] font-bold text-blue-100/60 uppercase mt-2 italic tracking-widest">
                Richt op de QR op de bon
              </span>
            </div>
          </button>
        </div>

        {/* ZOEKBALK / HANDMATIG */}
        <div className="space-y-6">
          <div className="relative group">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors"
              size={24}
            />
            <input
              type="text"
              placeholder="Zoek Order, Lot of Item..."
              className="w-full pl-14 pr-12 py-7 bg-white border-2 border-slate-100 rounded-[30px] shadow-sm outline-none focus:border-blue-500 font-bold transition-all text-lg"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic ml-4">
              Resultaten ({searchResults.length})
            </h3>

            <div className="grid grid-cols-1 gap-3">
              {searchResults.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleOpenItem(item)}
                  className="bg-white p-7 rounded-[40px] border border-slate-100 shadow-sm flex items-center justify-between active:scale-95 transition-all group hover:border-blue-300 animate-in slide-in-from-bottom-2"
                >
                  <div className="flex items-center gap-6 text-left overflow-hidden">
                    <div
                      className={`p-4 rounded-[20px] shrink-0 ${
                        item.searchType === "lot"
                          ? "bg-orange-50 text-orange-600"
                          : "bg-blue-50 text-blue-600"
                      }`}
                    >
                      {item.searchType === "lot" ? (
                        <Zap size={32} />
                      ) : (
                        <FileText size={32} />
                      )}
                    </div>
                    <div className="overflow-hidden">
                      <h4 className="font-black text-slate-900 leading-none mb-2 text-xl italic tracking-tighter">
                        {item.displayId}
                      </h4>
                      <p className="text-xs font-bold text-slate-400 uppercase truncate pr-4">
                        {item.item || item.itemCode}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-3 shrink-0">
                    <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl uppercase tracking-tighter border border-slate-200">
                      {item.machine || "Planning"}
                    </span>
                    <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
                      <ArrowRight size={20} />
                    </div>
                  </div>
                </div>
              ))}
              {searchTerm && searchResults.length === 0 && (
                <div className="py-24 text-center bg-white rounded-[60px] border-2 border-dashed border-slate-100 opacity-60">
                  <AlertCircle
                    size={64}
                    className="mx-auto text-slate-200 mb-4"
                  />
                  <p className="text-sm font-black uppercase tracking-widest text-slate-400">
                    Niets gevonden
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- CAMERA OVERLAY (VIEWFINDER) --- */}
      {activeMode === "camera" && (
        <div className="fixed inset-0 z-[300] bg-black flex flex-col animate-in fade-in">
          <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent z-[320]">
            <button
              onClick={stopCamera}
              className="p-4 bg-white/10 rounded-full text-white active:scale-90 transition-all border border-white/10 backdrop-blur-md shadow-2xl"
            >
              <X size={32} />
            </button>
            <div className="text-center">
              <span className="font-black uppercase tracking-[0.4em] text-[11px] text-white italic drop-shadow-lg block">
                QR Scanner
              </span>
              <span className="text-[8px] font-bold text-blue-400 uppercase tracking-widest">
                Active Precision Scan
              </span>
            </div>
            {hasFlash ? (
              <button
                onClick={toggleFlash}
                className={`p-4 rounded-full transition-all border border-white/10 backdrop-blur-md ${
                  flashOn
                    ? "bg-amber-400 text-slate-900 shadow-[0_0_25px_rgba(251,191,36,0.6)]"
                    : "bg-white/10 text-white"
                }`}
              >
                <Zap size={24} />
              </button>
            ) : (
              <div className="w-16"></div>
            )}
          </div>

          <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-slate-950">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* SCAN KADER */}
            <div className="absolute inset-0 z-[310] flex items-center justify-center">
              <div className="absolute inset-0 bg-black/30"></div>

              <div
                className={`relative w-80 h-80 bg-transparent rounded-[60px] flex flex-col items-center justify-center transition-all duration-500 border-4 ${
                  isSuccess
                    ? "border-emerald-400 scale-110 shadow-[0_0_50px_rgba(16,185,129,0.5)]"
                    : "border-white/60"
                }`}
              >
                <div
                  className={`absolute top-0 left-0 w-full h-1.5 shadow-[0_0_25px_rgba(59,130,246,0.9)] animate-scanner-line ${
                    isSuccess ? "bg-emerald-400" : "bg-blue-500"
                  }`}
                ></div>

                {isSuccess ? (
                  <div className="animate-in zoom-in text-emerald-400 flex flex-col items-center gap-4 bg-black/40 p-6 rounded-full backdrop-blur-sm">
                    <CheckCircle2 size={80} strokeWidth={3} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-6">
                    <Maximize
                      size={80}
                      className="text-white/20 animate-pulse"
                    />
                    <span className="text-[9px] font-black text-white/50 uppercase tracking-[0.4em] drop-shadow-md">
                      Centraal Uitlijnen
                    </span>
                  </div>
                )}

                {/* Duidelijke Hoeken */}
                <div
                  className={`absolute -top-3 -left-3 w-16 h-16 border-t-8 border-l-8 rounded-tl-3xl transition-colors ${
                    isSuccess ? "border-emerald-400" : "border-blue-500"
                  }`}
                ></div>
                <div
                  className={`absolute -top-3 -right-3 w-16 h-16 border-t-8 border-r-8 rounded-tr-3xl transition-colors ${
                    isSuccess ? "border-emerald-400" : "border-blue-500"
                  }`}
                ></div>
                <div
                  className={`absolute -bottom-3 -left-3 w-16 h-16 border-b-8 border-l-8 rounded-bl-3xl transition-colors ${
                    isSuccess ? "border-emerald-400" : "border-blue-500"
                  }`}
                ></div>
                <div
                  className={`absolute -bottom-3 -right-3 w-16 h-16 border-b-8 border-r-8 rounded-br-3xl transition-colors ${
                    isSuccess ? "border-emerald-400" : "border-blue-500"
                  }`}
                ></div>
              </div>
            </div>

            {cameraError && (
              <div className="absolute bottom-40 left-8 right-8 p-6 bg-red-600 text-white rounded-3xl text-center text-xs font-black uppercase shadow-2xl z-[350] border-2 border-red-400">
                {cameraError}
              </div>
            )}
          </div>

          <div className="p-10 bg-slate-900 border-t border-white/10 z-[320] shadow-2xl">
            <p className="text-blue-400 text-[10px] font-black uppercase tracking-[0.3em] text-center mb-8 flex items-center justify-center gap-3 opacity-90 leading-none">
              Plaats de QR-code in het witte kader
            </p>
            <button
              onClick={stopCamera}
              className="w-full py-6 bg-white/5 hover:bg-white/10 border-2 border-white/20 text-white rounded-[35px] font-black uppercase text-xs tracking-widest active:scale-95 transition-all shadow-lg"
            >
              Scanner Sluiten
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scanner-line {
            0% { top: 0%; opacity: 0; }
            15% { opacity: 1; }
            85% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
        }
        .animate-scanner-line {
            animation: scanner-line 2.0s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default MobileScanner;
