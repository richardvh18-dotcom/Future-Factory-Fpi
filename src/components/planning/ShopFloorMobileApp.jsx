import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Activity, 
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  Search,
  Filter,
  ChevronRight,
  BarChart3,
  Eye,
  MapPin,
  Zap,
  Package,
  PlayCircle,
  ScanLine,
  X
} from "lucide-react";
import { collection, onSnapshot, doc, updateDoc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { differenceInMinutes } from "date-fns";

/**
 * Mobile Inspector - Floor manager companion app
 * Voor teamleaders, QC en planners die rondlopen op de werkvloer
 * Overzicht van alle machines, downtimes, QC issues en order status
 */
const ShopFloorMobileApp = () => {
  const { user } = useAdminAuth();
  const [machines, setMachines] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [downtimeReports, setDowntimeReports] = useState([]);
  const [defectReports, setDefectReports] = useState([]);
  const [allTracked, setAllTracked] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all | active | issues
  const [activeView, setActiveView] = useState("overview"); // overview | downtime | quality | orders | scanner
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [jsQrLoaded, setJsQrLoaded] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const requestRef = useRef(null);
  const isScanningRef = useRef(false);
  const isProcessingFrameRef = useRef(false);

  useEffect(() => {
    // Load jsQR library
    const scriptId = "jsqr-scanner";
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

    // Load all machines/occupancy
    const unsubOccupancy = onSnapshot(
      collection(db, ...PATHS.OCCUPANCY),
      (snapshot) => {
        const occData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMachines(occData);
      }
    );

    // Load all orders
    const unsubPlanning = onSnapshot(
      collection(db, ...PATHS.PLANNING),
      (snapshot) => {
        const orders = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setAllOrders(orders);
      }
    );

    // Load tracked products
    const unsubTracked = onSnapshot(
      collection(db, ...PATHS.TRACKING),
      (snapshot) => {
        const tracked = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setAllTracked(tracked);
      }
    );

    // Load downtime reports
    const unsubDowntime = onSnapshot(
      collection(db, ...PATHS.DOWNTIME),
      (snapshot) => {
        const reports = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setDowntimeReports(reports);
      }
    );

    // Load defect reports
    const unsubDefects = onSnapshot(
      collection(db, ...PATHS.DEFECTS),
      (snapshot) => {
        const reports = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setDefectReports(reports);
      }
    );

    return () => {
      unsubOccupancy();
      unsubPlanning();
      unsubTracked();
      unsubDowntime();
      unsubDefects();
      stopCamera();
    };
  }, []);

  // Calculate machine statistics
  const machineStats = useMemo(() => {
    return machines.map(machine => {
      const machineOrders = allOrders.filter(o => o.machine === machine.machine);
      const activeOrder = machineOrders.find(o => o.status === "in_production");
      const machineDowntime = downtimeReports.filter(d => d.machine === machine.machine && d.status === "active");
      const machineDefects = defectReports.filter(d => d.machine === machine.machine && d.status === "open");
      
      const hasIssues = machineDowntime.length > 0 || machineDefects.length > 0;
      const isActive = activeOrder !== undefined;
      
      return {
        ...machine,
        activeOrder,
        ordersCount: machineOrders.length,
        downtimeCount: machineDowntime.length,
        defectCount: machineDefects.length,
        hasIssues,
        isActive,
        status: hasIssues ? "issue" : isActive ? "active" : "idle"
      };
    });
  }, [machines, allOrders, downtimeReports, defectReports]);

  // Filter machines
  const filteredMachines = useMemo(() => {
    let filtered = machineStats;
    
    // Filter by status
    if (filterStatus === "active") {
      filtered = filtered.filter(m => m.isActive);
    } else if (filterStatus === "issues") {
      filtered = filtered.filter(m => m.hasIssues);
    }
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(m => 
        m.machine?.toLowerCase().includes(term) ||
        m.operatorName?.toLowerCase().includes(term) ||
        m.activeOrder?.orderId?.toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }, [machineStats, filterStatus, searchTerm]);

  // Active issues summary
  const issuesSummary = useMemo(() => ({
    totalDowntime: downtimeReports.filter(d => d.status === "active").length,
    totalDefects: defectReports.filter(d => d.status === "open").length,
    machinesWithIssues: machineStats.filter(m => m.hasIssues).length,
    activeMachines: machineStats.filter(m => m.isActive).length
  }), [downtimeReports, defectReports, machineStats]);

  // Resolve downtime
  const resolveDowntime = async (downtimeId) => {
    await updateDoc(doc(db, ...PATHS.DOWNTIME, downtimeId), {
      status: "resolved",
      resolvedAt: serverTimestamp(),
      resolvedBy: user?.uid
    });
  };

  // Resolve defect
  const resolveDefect = async (defectId) => {
    await updateDoc(doc(db, ...PATHS.DEFECTS, defectId), {
      status: "resolved",
      resolvedAt: serverTimestamp(),
      resolvedBy: user?.uid
    });
  };

  // QR Scanner functions
  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        isScanningRef.current = true;
        
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        
        // Start scanning after video is ready
        requestRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (error) {
      console.error("Camera error:", error);
      alert("Kan camera niet starten. Controleer permissies.");
      setShowScanner(false);
    }
  };

  const stopCamera = () => {
    isScanningRef.current = false;
    isProcessingFrameRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
  };

  const scanFrame = () => {
    if (!isScanningRef.current || !videoRef.current || !canvasRef.current || !window.jsQR) {
      if (isScanningRef.current) {
        requestRef.current = requestAnimationFrame(scanFrame);
      }
      return;
    }

    // Prevent processor overload
    if (isProcessingFrameRef.current) {
      requestRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const video = videoRef.current;
    if (video.readyState === 4) { // HAVE_ENOUGH_DATA
      isProcessingFrameRef.current = true;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      // Use larger scan area for better detection
      const size = Math.min(video.videoWidth, video.videoHeight) * 0.8;
      const x = (video.videoWidth - size) / 2;
      const y = (video.videoHeight - size) / 2;

      canvas.width = size;
      canvas.height = size;
      
      ctx.drawImage(video, x, y, size, size, 0, 0, size, size);
      
      const imageData = ctx.getImageData(0, 0, size, size);

      try {
        const code = window.jsQR(imageData.data, size, size, {
          inversionAttempts: "attemptBoth"
        });

        if (code && code.data) {
          // QR code found!
          if (navigator.vibrate) navigator.vibrate(100);
          handleScan(code.data);
          return;
        }
      } catch (e) {
        console.error("Scan error:", e);
      } finally {
        isProcessingFrameRef.current = false;
      }
    }

    requestRef.current = requestAnimationFrame(scanFrame);
  };

  const handleScan = (scannedCode) => {
    stopCamera();
    
    // Search in tracked products
    const product = allTracked.find(p => 
      p.lotNumber === scannedCode || 
      p.orderId === scannedCode ||
      p.id === scannedCode
    );

    // Search in orders
    const order = allOrders.find(o => 
      o.orderId === scannedCode || 
      o.item === scannedCode ||
      o.id === scannedCode
    );

    if (product) {
      setScanResult({
        type: "product",
        data: product,
        code: scannedCode
      });
    } else if (order) {
      setScanResult({
        type: "order",
        data: order,
        code: scannedCode
      });
    } else {
      setScanResult({
        type: "unknown",
        code: scannedCode
      });
    }
  };

  const closeScanner = () => {
    stopCamera();
    setShowScanner(false);
    setScanResult(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="text-center text-white">
          <AlertTriangle className="mx-auto mb-4 text-amber-500" size={48} />
          <div className="text-xl font-bold mb-2">Niet ingelogd</div>
          <div className="text-sm text-slate-400">Log in om toegang te krijgen</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* QR Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black">
          <div className="relative h-full">
            {/* Close Button */}
            <button
              onClick={closeScanner}
              className="absolute top-4 right-4 z-10 p-3 bg-white rounded-full shadow-lg"
            >
              <X size={24} className="text-slate-900" />
            </button>

            {/* Scanner Result */}
            {scanResult ? (
              <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/90">
                <div className="bg-white rounded-3xl p-6 max-w-md w-full">
                  {scanResult.type === "product" ? (
                    <>
                      <div className="text-center mb-4">
                        <CheckCircle className="mx-auto text-emerald-500 mb-2" size={48} />
                        <div className="text-2xl font-black text-slate-800">Product Gevonden</div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Lotnummer</div>
                          <div className="text-lg font-bold text-slate-900">{scanResult.data.lotNumber}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Order</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.orderId}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Machine</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.machine}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Status</div>
                          <div className={`inline-block px-3 py-1 rounded-lg text-xs font-bold ${
                            scanResult.data.status === "In Production"
                              ? "bg-orange-100 text-orange-700"
                              : scanResult.data.status === "Released"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-700"
                          }`}>
                            {scanResult.data.status}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : scanResult.type === "order" ? (
                    <>
                      <div className="text-center mb-4">
                        <CheckCircle className="mx-auto text-blue-500 mb-2" size={48} />
                        <div className="text-2xl font-black text-slate-800">Order Gevonden</div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Order ID</div>
                          <div className="text-lg font-bold text-slate-900">{scanResult.data.orderId}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Item</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.item}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Machine</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.machine}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Status</div>
                          <div className={`inline-block px-3 py-1 rounded-lg text-xs font-bold ${
                            scanResult.data.status === "in_production"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-blue-100 text-blue-700"
                          }`}>
                            {scanResult.data.status}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-center mb-4">
                        <AlertTriangle className="mx-auto text-amber-500 mb-2" size={48} />
                        <div className="text-2xl font-black text-slate-800">Niet Gevonden</div>
                      </div>
                      <div className="text-center text-slate-600">
                        Code <span className="font-mono font-bold">{scanResult.code}</span> niet gevonden in systeem.
                      </div>
                    </>
                  )}
                  
                  <button
                    onClick={closeScanner}
                    className="w-full mt-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors"
                  >
                    Sluiten
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Camera View */}
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  autoPlay
                  muted
                />
                <canvas ref={canvasRef} className="hidden" />
                
                {/* Scan Overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-72 h-72">
                    {/* Scanning animation */}
                    <div className="absolute inset-0 border-4 border-white/30 rounded-3xl"></div>
                    <div className="absolute inset-0 border-4 border-indigo-500 rounded-3xl animate-pulse"></div>
                    
                    {/* Corner markers */}
                    <div className="absolute -top-2 -left-2 w-16 h-16 border-t-4 border-l-4 border-indigo-400 rounded-tl-3xl"></div>
                    <div className="absolute -top-2 -right-2 w-16 h-16 border-t-4 border-r-4 border-indigo-400 rounded-tr-3xl"></div>
                    <div className="absolute -bottom-2 -left-2 w-16 h-16 border-b-4 border-l-4 border-indigo-400 rounded-bl-3xl"></div>
                    <div className="absolute -bottom-2 -right-2 w-16 h-16 border-b-4 border-r-4 border-indigo-400 rounded-br-3xl"></div>
                  </div>
                </div>
                
                {/* Instructions */}
                <div className="absolute bottom-8 left-0 right-0 text-center px-4">
                  <div className="bg-black/70 backdrop-blur-sm px-6 py-4 rounded-2xl inline-block">
                    <div className="text-white font-bold text-lg mb-1">Scan QR Code</div>
                    <div className="text-xs text-white/70">Plaats de QR code in het midden van het vierkant</div>
                    {!jsQrLoaded && (
                      <div className="text-xs text-amber-300 mt-2">⏳ Scanner wordt geladen...</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-6 shadow-lg sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-white text-2xl font-black">Mobile Inspector</div>
            <div className="text-indigo-200 text-sm font-bold mt-1">
              Werkvloer Overzicht
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowScanner(true);
                setTimeout(() => {
                  if (jsQrLoaded) {
                    startCamera();
                  } else {
                    alert("QR Scanner wordt nog geladen, probeer opnieuw...");
                    setShowScanner(false);
                  }
                }, 200);
              }}
              className="p-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors"
            >
              <ScanLine className="text-white" size={24} />
            </button>
            <div className="bg-white/20 px-4 py-2 rounded-xl">
              <div className="text-white text-xs font-bold">{user?.displayName?.split(' ')[0] || 'Inspector'}</div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
            <div className="text-white/60 text-[10px] font-bold uppercase mb-1">Actief</div>
            <div className="text-white text-2xl font-black">{issuesSummary.activeMachines}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
            <div className="text-white/60 text-[10px] font-bold uppercase mb-1">Stilstand</div>
            <div className="text-white text-2xl font-black">{issuesSummary.totalDowntime}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
            <div className="text-white/60 text-[10px] font-bold uppercase mb-1">Defecten</div>
            <div className="text-white text-2xl font-black">{issuesSummary.totalDefects}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
            <div className="text-white/60 text-[10px] font-bold uppercase mb-1">Issues</div>
            <div className="text-white text-2xl font-black">{issuesSummary.machinesWithIssues}</div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="p-4 bg-white border-b border-slate-200 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Zoek machine, operator, order..."
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setFilterStatus("all")}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all ${
              filterStatus === "all"
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Alle ({machineStats.length})
          </button>
          <button
            onClick={() => setFilterStatus("active")}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all ${
              filterStatus === "active"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Actief ({issuesSummary.activeMachines})
          </button>
          <button
            onClick={() => setFilterStatus("issues")}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all ${
              filterStatus === "issues"
                ? "bg-red-600 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Issues ({issuesSummary.machinesWithIssues})
          </button>
        </div>
      </div>

      {/* View Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 py-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveView("overview")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeView === "overview"
                ? "bg-indigo-100 text-indigo-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            Overzicht
          </button>
          <button
            onClick={() => setActiveView("downtime")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeView === "downtime"
                ? "bg-orange-100 text-orange-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            Stilstand {issuesSummary.totalDowntime > 0 && (
              <span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                {issuesSummary.totalDowntime}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveView("quality")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeView === "quality"
                ? "bg-red-100 text-red-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            QC {issuesSummary.totalDefects > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                {issuesSummary.totalDefects}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveView("orders")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeView === "orders"
                ? "bg-blue-100 text-blue-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            Orders
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 pb-24 space-y-3">
        {activeView === "overview" && (
          <>
            {filteredMachines.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Filter size={48} className="mx-auto mb-4 opacity-30" />
                <div className="font-bold text-sm">Geen machines gevonden</div>
              </div>
            ) : (
              filteredMachines.map(machine => (
                <div
                  key={machine.id}
                  className={`bg-white rounded-2xl border-2 p-4 transition-all ${
                    machine.hasIssues 
                      ? "border-red-200 shadow-lg" 
                      : machine.isActive 
                        ? "border-emerald-200" 
                        : "border-slate-100"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin size={16} className="text-indigo-600" />
                        <div className="text-lg font-black text-slate-800">{machine.machine}</div>
                      </div>
                      <div className="text-sm text-slate-600 font-bold">
                        {machine.operatorName || "Geen operator"}
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-lg text-xs font-bold ${
                      machine.status === "issue" 
                        ? "bg-red-100 text-red-700"
                        : machine.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                    }`}>
                      {machine.status === "issue" ? "🔴 Issue" : machine.status === "active" ? "🟢 Actief" : "⚪ Idle"}
                    </div>
                  </div>

                  {/* Active Order */}
                  {machine.activeOrder && (
                    <div className="bg-blue-50 rounded-xl p-3 mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <PlayCircle size={14} className="text-blue-600" />
                        <div className="text-xs font-bold text-blue-900">In Productie</div>
                      </div>
                      <div className="text-sm font-black text-slate-800">
                        {machine.activeOrder.orderId || machine.activeOrder.item}
                      </div>
                      {machine.activeOrder.plan && (
                        <div className="text-xs text-slate-600 mt-1">
                          {machine.activeOrder.plan} stuks
                        </div>
                      )}
                    </div>
                  )}

                  {/* Issues */}
                  {machine.hasIssues && (
                    <div className="space-y-2">
                      {machine.downtimeCount > 0 && (
                        <div className="flex items-center gap-2 text-orange-700 bg-orange-50 px-3 py-2 rounded-lg">
                          <XCircle size={16} />
                          <span className="text-xs font-bold">{machine.downtimeCount} stilstand meldingen</span>
                        </div>
                      )}
                      {machine.defectCount > 0 && (
                        <div className="flex items-center gap-2 text-red-700 bg-red-50 px-3 py-2 rounded-lg">
                          <AlertTriangle size={16} />
                          <span className="text-xs font-bold">{machine.defectCount} kwaliteit issues</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-1 text-slate-600">
                      <Package size={14} />
                      <span className="text-xs font-bold">{machine.ordersCount} orders</span>
                    </div>
                    {machine.hoursPerWeek && (
                      <div className="flex items-center gap-1 text-slate-600">
                        <Clock size={14} />
                        <span className="text-xs font-bold">{machine.hoursPerWeek}h/week</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {activeView === "downtime" && (
          <>
            {downtimeReports.filter(d => d.status === "active").length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <CheckCircle size={48} className="mx-auto mb-4 text-emerald-300" />
                <div className="font-bold text-sm">Geen actieve stilstand meldingen</div>
              </div>
            ) : (
              downtimeReports
                .filter(d => d.status === "active")
                .map(downtime => (
                  <div key={downtime.id} className="bg-white rounded-2xl border-2 border-orange-200 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <XCircle className="text-orange-600" size={20} />
                          <div className="text-lg font-black text-slate-800">{downtime.machine}</div>
                        </div>
                        <div className="text-sm text-slate-600 font-bold">{downtime.reason}</div>
                      </div>
                      <div className="px-3 py-1 rounded-lg text-xs font-bold bg-orange-100 text-orange-700">
                        {downtime.estimatedMinutes || "?"} min
                      </div>
                    </div>
                    
                    <div className="text-xs text-slate-500 mb-3">
                      Gemeld door: {downtime.operatorName || "Onbekend"}
                    </div>

                    <button
                      onClick={() => resolveDowntime(downtime.id)}
                      className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition-colors"
                    >
                      ✅ Opgelost
                    </button>
                  </div>
                ))
            )}
          </>
        )}

        {activeView === "quality" && (
          <>
            {defectReports.filter(d => d.status === "open").length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <CheckCircle size={48} className="mx-auto mb-4 text-emerald-300" />
                <div className="font-bold text-sm">Geen openstaande QC issues</div>
              </div>
            ) : (
              defectReports
                .filter(d => d.status === "open")
                .map(defect => (
                  <div key={defect.id} className="bg-white rounded-2xl border-2 border-red-200 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="text-red-600" size={20} />
                          <div className="text-lg font-black text-slate-800">{defect.machine}</div>
                        </div>
                        <div className="text-sm text-slate-600 font-bold">{defect.defectType}</div>
                      </div>
                      <div className={`px-3 py-1 rounded-lg text-xs font-bold ${
                        defect.severity === "high" 
                          ? "bg-red-500 text-white" 
                          : defect.severity === "medium"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {defect.severity || "medium"}
                      </div>
                    </div>
                    
                    {defect.description && (
                      <div className="bg-slate-50 rounded-lg p-3 mb-3 text-sm text-slate-700">
                        {defect.description}
                      </div>
                    )}

                    <div className="text-xs text-slate-500 mb-3">
                      Order: {defect.orderId || "Onbekend"} • Gemeld door: {defect.operatorName || "Onbekend"}
                    </div>

                    <button
                      onClick={() => resolveDefect(defect.id)}
                      className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition-colors"
                    >
                      ✅ Opgelost
                    </button>
                  </div>
                ))
            )}
          </>
        )}

        {activeView === "orders" && (
          <>
            {allOrders.filter(o => o.status === "in_production" || o.status === "planned").length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Package size={48} className="mx-auto mb-4 opacity-30" />
                <div className="font-bold text-sm">Geen actieve orders</div>
              </div>
            ) : (
              allOrders
                .filter(o => o.status === "in_production" || o.status === "planned")
                .sort((a, b) => a.status === "in_production" ? -1 : 1)
                .map(order => (
                  <div key={order.id} className="bg-white rounded-2xl border-2 border-slate-200 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-lg font-black text-slate-800">
                          {order.orderId || order.item}
                        </div>
                        <div className="text-sm text-slate-600">{order.itemCode}</div>
                      </div>
                      <div className={`px-3 py-1 rounded-lg text-xs font-bold ${
                        order.status === "in_production"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-blue-100 text-blue-700"
                      }`}>
                        {order.status === "in_production" ? "In Productie" : "Gepland"}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <div className="flex items-center gap-1">
                        <MapPin size={14} />
                        <span className="font-bold">{order.machine}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Package size={14} />
                        <span className="font-bold">{order.plan} stuks</span>
                      </div>
                      {order.estimatedHours && (
                        <div className="flex items-center gap-1">
                          <Clock size={14} />
                          <span className="font-bold">{order.estimatedHours}h</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
            )}
          </>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 flex justify-around shadow-lg">
        <button
          onClick={() => setActiveView("overview")}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${
            activeView === "overview" 
              ? "bg-indigo-50 text-indigo-600" 
              : "text-slate-400"
          }`}
        >
          <Eye size={22} />
          <span className="text-[10px] font-bold">Overzicht</span>
        </button>
        <button
          onClick={() => setActiveView("downtime")}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors relative ${
            activeView === "downtime" 
              ? "bg-orange-50 text-orange-600" 
              : "text-slate-400"
          }`}
        >
          {issuesSummary.totalDowntime > 0 && (
            <div className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {issuesSummary.totalDowntime}
            </div>
          )}
          <XCircle size={22} />
          <span className="text-[10px] font-bold">Stilstand</span>
        </button>
        <button
          onClick={() => setActiveView("quality")}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors relative ${
            activeView === "quality" 
              ? "bg-red-50 text-red-600" 
              : "text-slate-400"
          }`}
        >
          {issuesSummary.totalDefects > 0 && (
            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {issuesSummary.totalDefects}
            </div>
          )}
          <AlertTriangle size={22} />
          <span className="text-[10px] font-bold">QC</span>
        </button>
        <button
          onClick={() => setActiveView("orders")}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${
            activeView === "orders" 
              ? "bg-blue-50 text-blue-600" 
              : "text-slate-400"
          }`}
        >
          <Package size={22} />
          <span className="text-[10px] font-bold">Orders</span>
        </button>
      </div>
    </div>
  );
};

export default ShopFloorMobileApp;
