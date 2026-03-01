import React, { useState, useEffect, useMemo } from "react";
import { 
  Activity, 
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Search,
  Filter,
  Eye,
  MapPin,
  Package,
  PlayCircle,
  ScanLine,
  UserCheck,
  X,
  Info,
  Building2,
  ClipboardCheck,
  ArrowRight,
  ArrowRightLeft
} from "lucide-react";
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, addDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import MobileScanner from "../digitalplanning/MobileScanner";
import ProductMoveModal from "../digitalplanning/ProductMoveModal";
import { getStepForStation } from "../../utils/workstationLogic";
import { normalizeMachine } from "../../utils/hubHelpers";
import StatusBadge from "../digitalplanning/common/StatusBadge";

/**
 * Mobile Inspector - Floor manager companion app
 * Voor teamleaders, QC en planners die rondlopen op de werkvloer
 * Overzicht van alle machines, downtimes, QC issues en order status
 */
const ShopFloorMobileApp = () => {
  const { user, role } = useAdminAuth();
  const [machines, setMachines] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [downtimeReports, setDowntimeReports] = useState([]);
  const [allPersonnel, setAllPersonnel] = useState([]);
  const [defectReports, setDefectReports] = useState([]);
  const [allTracked, setAllTracked] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all | active | issues
  const [activeView, setActiveView] = useState("overview"); // overview | downtime | quality | orders | scanner
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [factoryStations, setFactoryStations] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [departments, setDepartments] = useState(["ALLES"]);
  const [selectedDepartment, setSelectedDepartment] = useState("ALLES");
  const [operatorCode, setOperatorCode] = useState("");
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueType, setIssueType] = useState(null);
  const [issueDescription, setIssueDescription] = useState("");
  const [productToMove, setProductToMove] = useState(null);
  const [selectedMachineFilter, setSelectedMachineFilter] = useState(null);

  useEffect(() => {
    if (!PATHS || !PATHS.FACTORY_CONFIG) return;

    // Load factory config for full machine list
    const unsubConfig = onSnapshot(
      doc(db, ...PATHS.FACTORY_CONFIG),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const stations = [];
          const depts = ["ALLES"];
          if (data.departments) {
            data.departments.forEach(dept => {
              if (dept.isActive !== false) depts.push(dept.name);
              if (dept.stations) {
                dept.stations.forEach(station => {
                  stations.push({
                    ...station,
                    departmentName: dept.name
                  });
                });
              }
            });
          }
          setFactoryStations(stations);
          setDepartments(depts);
        }
      }
    );

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

    // Load personnel
    const unsubPersonnel = onSnapshot(
      collection(db, ...PATHS.PERSONNEL),
      (snapshot) => {
        const people = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllPersonnel(people);
      }
    );

    return () => {
      unsubOccupancy();
      unsubPlanning();
      unsubTracked();
      unsubDowntime();
      unsubDefects();
      unsubPersonnel();
      unsubConfig();
    };
  }, []);

  // Auto-select department for team leaders & planners
  useEffect(() => {
    if (role === "teamleader" && user?.department) {
      // Case-insensitive match
      const match = departments.find(d => d.toLowerCase() === user.department.toLowerCase());
      if (match) {
        setSelectedDepartment(match);
      } else if (user.department.toUpperCase() !== "ALLES") {
        setSelectedDepartment(user.department);
      }
    } else if (["planner", "admin", "manager"].includes(role)) {
      setSelectedDepartment("ALLES");
    }
  }, [role, user, departments]);

  // Calculate machine statistics
  const machineStats = useMemo(() => {
    // Use factory config as base, fallback to occupancy data if config not loaded
    const baseList = factoryStations.length > 0
      ? factoryStations.map(s => ({ 
        machine: s.name, 
        id: s.id, 
        department: s.departmentName 
      }))
      : [...new Set(machines.map(m => m.machine || m.machineId).filter(Boolean))]
          .map(name => ({ machine: name, id: name }));

    const todayStr = new Date().toISOString().split('T')[0];

    return baseList.map(baseMachine => {
      const name = baseMachine.machine;
      
      // Find active occupancy for TODAY
      const activeOccupancy = machines.filter(m => {
        const mName = m.machine || m.machineId || m.station;
        const normMName = (mName || "").toUpperCase().replace(/\s/g, "");
        const normName = (name || "").toUpperCase().replace(/\s/g, "");
        const normId = (baseMachine.id || "").toUpperCase().replace(/\s/g, "");
        
        const isMatch = normMName === normName || (m.machineId && String(m.machineId).toUpperCase().replace(/\s/g, "") === normId);
        
        const mDate = m.date?.toDate ? m.date.toDate().toISOString().split('T')[0] : m.date;
        return isMatch && mDate === todayStr && m.operatorName;
      });

      const operatorNames = [...new Set(activeOccupancy.map(o => o.operatorName))].join(", ");

      const machineOrders = allOrders.filter(o => o.machine === name);
      const activeOrder = machineOrders.find(o => o.status === "in_production" || o.status === "in_progress");
      const machineDowntime = downtimeReports.filter(d => d.machine === name && d.status === "active");
      const machineDefects = defectReports.filter(d => d.machine === name && d.status === "open");
      
      const activeProducts = allTracked.filter(p => 
        (p.machine === name || p.currentStation === name) && 
        (p.status === "In Production" || p.status === "in_progress")
      ).length;

      const hasIssues = machineDowntime.length > 0 || machineDefects.length > 0;
      const isActive = activeOrder !== undefined;
      
      return {
        ...baseMachine,
        operatorName: operatorNames,
        activeOrder,
        ordersCount: machineOrders.length,
        downtimeCount: machineDowntime.length,
        defectCount: machineDefects.length,
        activeProductsCount: activeProducts,
        hasIssues,
        isActive,
        status: hasIssues ? "issue" : isActive ? "active" : "idle"
      };
    });
  }, [factoryStations, machines, allOrders, downtimeReports, defectReports, allTracked]);

  // Filter machines
  const filteredMachines = useMemo(() => {
    let filtered = machineStats;
    
    // Filter by Department
    if (selectedDepartment !== "ALLES") {
      filtered = filtered.filter(m => m.department === selectedDepartment);
    }

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
  }, [machineStats, filterStatus, searchTerm, selectedDepartment]);

  // Filter orders based on selected department
  const filteredOrders = useMemo(() => {
    let orders = allOrders;
    
    if (selectedDepartment !== "ALLES") {
      orders = orders.filter(o => {
        // Find station in factoryStations to check department
        const station = factoryStations.find(s => s.name === o.machine || s.id === o.machine);
        return station ? station.departmentName === selectedDepartment : false;
      });
    }

    if (selectedMachineFilter) {
      // Gebruik normalizeMachine voor robuustere matching (bv. "BH11" vs "BH 11")
      const filterNorm = normalizeMachine(selectedMachineFilter);
      orders = orders.filter(o => normalizeMachine(o.machine) === filterNorm);
    }
    
    return orders;
  }, [allOrders, selectedDepartment, factoryStations, selectedMachineFilter]);

  // Get products for selected order
  const selectedOrderProducts = useMemo(() => {
    if (!selectedOrder) return [];
    return allTracked.filter(p => p.orderId === selectedOrder.orderId);
  }, [selectedOrder, allTracked]);

  // Handle moving a product
  const handleMoveLot = async (lotNumber, newStation) => {
    if (!lotNumber || !newStation) return;
    try {
      const productRef = doc(db, ...PATHS.TRACKING, lotNumber);
      
      const nextState = getStepForStation(newStation);

      await updateDoc(productRef, {
        currentStation: newStation,
        currentStep: nextState.currentStep,
        status: nextState.status || "in_progress",
        isManualMove: true,
        updatedAt: serverTimestamp(),
        note: `Handmatig verplaatst naar ${newStation} door ${user?.email || 'Mobile User'}`
      });
      
      setProductToMove(null);
      alert(`Product ${lotNumber} verplaatst naar ${newStation}`);
    } catch (err) {
      console.error("Fout bij verplaatsen:", err);
      alert("Fout bij verplaatsen: " + err.message);
    }
  };

  // Calculate active products count based on selected department
  const activeProductsCount = useMemo(() => {
    return allTracked.filter(p => {
      // Check if product is active
      const isActive = p.status === "In Production" || p.status === "in_progress";
      if (!isActive) return false;

      // Check department
      if (selectedDepartment === "ALLES") return true;
      
      const machine = p.machine || p.currentStation;
      const station = factoryStations.find(s => s.name === machine || s.id === machine);
      return station ? station.departmentName === selectedDepartment : false;
    }).length;
  }, [allTracked, selectedDepartment, factoryStations]);

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

  const handleScan = (rawCode) => {
    if (!rawCode) return;
    const scannedCode = rawCode.trim();
    const lowerCode = scannedCode.toLowerCase();
    
    // Search in tracked products
    const product = allTracked.find(p => 
      (p.lotNumber && p.lotNumber.toLowerCase() === lowerCode) || 
      (p.orderId && p.orderId.toLowerCase() === lowerCode) ||
      p.id === scannedCode
    );

    // Search in orders
    const order = allOrders.find(o => 
      (o.orderId && o.orderId.toLowerCase() === lowerCode) || 
      (o.item && o.item.toLowerCase() === lowerCode) ||
      (o.itemCode && o.itemCode.toLowerCase() === lowerCode) ||
      (o.extraCode && o.extraCode.toLowerCase() === lowerCode) ||
      o.id === scannedCode
    );

    // Search in personnel
    const person = allPersonnel.find(p => 
      (p.employeeNumber && p.employeeNumber.toLowerCase() === lowerCode) || 
      p.id === scannedCode
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
        code: scannedCode,
        onClick: () => setSelectedOrder(order) // Allow clicking to open details
      });
    } else if (person) {
      setScanResult({
        type: "personnel",
        data: person,
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

  const submitIssue = async () => {
    if (!scanResult?.data || !issueType) return;
    
    try {
      const commonData = {
        machine: scanResult.data.machine || "Onbekend",
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        operatorName: user.displayName || "Operator",
        orderId: scanResult.data.orderId || scanResult.data.id || null
      };

      if (issueType === 'downtime') {
        await addDoc(collection(db, ...PATHS.DOWNTIME), {
          ...commonData,
          reason: issueDescription || "Gemeld door operator",
          status: "active",
          type: "unplanned"
        });
      } else {
        await addDoc(collection(db, ...PATHS.DEFECTS), {
          ...commonData,
          defectType: "Operator Melding",
          description: issueDescription || "Defect gemeld via scanner",
          severity: "medium",
          status: "open",
          lotNumber: scanResult.data.lotNumber || null,
        });
      }

      // Stuur notificatie naar teamleider (Alert)
      await addDoc(collection(db, ...PATHS.MESSAGES), {
        title: issueType === 'downtime' ? "⚠️ Stilstand Gemeld" : "🚩 Defect Gemeld",
        message: `${user.displayName || 'Operator'} meldt ${issueType === 'downtime' ? 'stilstand' : 'defect'} op ${commonData.machine}: ${issueDescription || 'Geen toelichting'}`,
        type: "alert",
        priority: "high",
        status: "unread",
        read: false,
        createdAt: serverTimestamp(),
        timestamp: serverTimestamp(),
        source: "ShopFloorMobile",
        targetGroup: "TEAMLEADERS"
      });
      
      setShowIssueModal(false);
      setIssueDescription("");
      setIssueType(null);
      alert("Melding succesvol verstuurd");
    } catch (error) {
      console.error("Error reporting issue:", error);
      alert("Fout bij versturen melding.");
    }
  };

  // OPERATOR VIEW (Simplified)
  if (role === "operator") {
    return (
      <div className="h-[100dvh] bg-slate-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white p-4 shadow-sm flex justify-between items-center z-10">
           <div className="flex items-center gap-2">
             <div className="bg-blue-600 p-2 rounded-lg text-white">
               <ScanLine size={20} />
             </div>
             <div>
               <h1 className="font-black text-lg text-slate-800 leading-none">Operator</h1>
               <p className="text-[10px] font-bold text-slate-400 uppercase">Scanner</p>
             </div>
           </div>
           <div className="bg-slate-100 px-3 py-1 rounded-full text-xs font-bold text-slate-600">
             {user?.displayName?.split(' ')[0] || 'Op'}
           </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-4 flex flex-col overflow-y-auto custom-scrollbar">
           {scanResult ? (
             <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-200 p-6 flex flex-col items-center text-center animate-in zoom-in duration-300">
                <div className="mb-6">
                  {scanResult.type === 'product' && <Package size={64} className="text-emerald-500" />}
                  {scanResult.type === 'order' && <ClipboardCheck size={64} className="text-blue-500" />}
                  {scanResult.type === 'personnel' && <UserCheck size={64} className="text-purple-500" />}
                  {scanResult.type === 'unknown' && <AlertTriangle size={64} className="text-amber-500" />}
                </div>
                
                <h2 className="text-2xl font-black text-slate-800 mb-2">
                  {scanResult.type === 'product' ? 'Product Gevonden' :
                   scanResult.type === 'order' ? 'Order Gevonden' :
                   scanResult.type === 'personnel' ? 'Personeel' : 'Niet Gevonden'}
                </h2>
                
                <div className="w-full bg-slate-50 rounded-xl p-4 mb-6 text-left space-y-3">
                   {scanResult.data ? (
                     <>
                       {scanResult.data.lotNumber && (
                         <div>
                           <span className="text-[10px] font-bold text-slate-400 uppercase block">Lotnummer</span>
                           <span className="text-lg font-bold text-slate-900">{scanResult.data.lotNumber}</span>
                         </div>
                       )}
                       {(scanResult.data.orderId || scanResult.data.id) && (
                         <div>
                           <span className="text-[10px] font-bold text-slate-400 uppercase block">ID / Order</span>
                           <span className="text-base font-bold text-slate-900">{scanResult.data.orderId || scanResult.data.id}</span>
                         </div>
                       )}
                       {scanResult.data.status && (
                         <div>
                           <span className="text-[10px] font-bold text-slate-400 uppercase block">Status</span>
                           <span className="inline-block px-2 py-1 bg-white rounded border border-slate-200 text-sm font-bold text-slate-700 mt-1">
                             {scanResult.data.status}
                           </span>
                         </div>
                       )}
                     </>
                   ) : (
                     <p className="text-slate-500 font-medium">Geen gegevens gevonden voor code: <span className="font-mono font-bold">{scanResult.code}</span></p>
                   )}
                </div>

                {scanResult.type !== 'personnel' && (
                  <div className="grid grid-cols-2 gap-3 mb-4 w-full">
                    <button 
                      onClick={() => {
                        setIssueType('defect');
                        setShowIssueModal(true);
                      }}
                      className="py-4 bg-red-50 text-red-600 rounded-2xl font-bold text-xs uppercase flex flex-col items-center justify-center gap-2 border-2 border-red-100 active:scale-95 transition-all"
                    >
                      <AlertTriangle size={24} />
                      Defect
                    </button>
                    <button 
                      onClick={() => {
                        setIssueType('downtime');
                        setShowIssueModal(true);
                      }}
                      className="py-4 bg-orange-50 text-orange-600 rounded-2xl font-bold text-xs uppercase flex flex-col items-center justify-center gap-2 border-2 border-orange-100 active:scale-95 transition-all"
                    >
                      <Clock size={24} />
                      Stilstand
                    </button>
                  </div>
                )}

                <button 
                  onClick={closeScanner}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"
                >
                  Volgende Scan
                </button>
             </div>
           ) : showScanner ? (
             <MobileScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
           ) : (
             <div className="flex-1 flex flex-col gap-4 justify-center">
                <button
                  onClick={() => setShowScanner(true)}
                  className="flex-1 bg-blue-600 text-white rounded-[2rem] shadow-xl shadow-blue-200 flex flex-col items-center justify-center gap-4 active:scale-95 transition-all hover:bg-blue-700"
                >
                  <div className="bg-white/20 p-6 rounded-full">
                    <ScanLine size={48} />
                  </div>
                  <span className="text-2xl font-black uppercase tracking-widest">Scan QR</span>
                </button>

                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200">
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-2">Of zoek handmatig</label>
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      if(operatorCode) {
                        handleScan(operatorCode);
                        setOperatorCode("");
                      }
                    }}
                    className="flex gap-2"
                  >
                    <input 
                      type="text" 
                      value={operatorCode}
                      onChange={(e) => setOperatorCode(e.target.value)}
                      className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800 outline-none focus:border-blue-500 transition-all"
                      placeholder="Code invoeren..."
                    />
                    <button type="submit" className="bg-slate-900 text-white px-6 rounded-xl font-bold">
                      <ArrowRight size={20} />
                    </button>
                  </form>
                </div>
             </div>
           )}

           {/* Issue Reporting Modal for Operator */}
           {showIssueModal && (
             <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
               <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl">
                 <h3 className="text-xl font-black text-slate-800 mb-2">
                   {issueType === 'defect' ? 'Defect Melden' : 'Stilstand Melden'}
                 </h3>
                 <p className="text-sm text-slate-500 mb-4">
                   {scanResult?.data?.lotNumber ? `Lot: ${scanResult.data.lotNumber}` : `Item: ${scanResult?.data?.orderId || 'Onbekend'}`}
                 </p>
                 
                 <textarea
                   className="w-full p-4 bg-slate-50 rounded-xl border-2 border-slate-100 font-bold text-slate-700 outline-none focus:border-blue-500 min-h-[120px] mb-4"
                   placeholder="Beschrijf het probleem..."
                   value={issueDescription}
                   onChange={(e) => setIssueDescription(e.target.value)}
                 />
                 
                 <div className="flex gap-3">
                   <button 
                     onClick={() => setShowIssueModal(false)}
                     className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold uppercase text-xs"
                   >
                     Annuleren
                   </button>
                   <button 
                     onClick={submitIssue}
                     className={`flex-1 py-3 text-white rounded-xl font-bold uppercase text-xs ${
                       issueType === 'defect' ? 'bg-red-600' : 'bg-orange-500'
                     }`}
                   >
                     Versturen
                   </button>
                 </div>
               </div>
             </div>
           )}
        </div>
      </div>
    );
  }

  const isDeptLocked = role === "teamleader";

  return (
    <div className="h-[100dvh] bg-slate-50 flex flex-col overflow-hidden relative">
      {/* QR Scanner Modal */}
      {showScanner && (
        scanResult ? (
          <div className="fixed inset-0 z-[9999] bg-black">
            <div className="relative h-full">
              {/* Close Button */}
              <button
                onClick={closeScanner}
                className="absolute top-4 right-4 z-10 p-3 bg-white rounded-full shadow-lg"
              >
                <X size={24} className="text-slate-900" />
              </button>

              {/* Scanner Result */}
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
                          <StatusBadge status={scanResult.data.status} />
                        </div>
                      </div>
                      {(role === 'teamleader' || role === 'admin') && (
                        <button 
                          onClick={() => { setProductToMove(scanResult.data); closeScanner(); }}
                          className="w-full mt-2 py-3 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                        >
                          <ArrowRightLeft size={18} /> Verplaats Product
                        </button>
                      )}
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
                          <StatusBadge status={scanResult.data.status} />
                        </div>
                      </div>
                      <button
                        onClick={() => { closeScanner(); setSelectedOrder(scanResult.data); }}
                        className="w-full mt-4 py-3 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-xl font-bold transition-colors"
                      >
                        Bekijk Details
                      </button>
                    </>
                  ) : scanResult.type === "personnel" ? (
                    <>
                      <div className="text-center mb-4">
                        <UserCheck className="mx-auto text-purple-500 mb-2" size={48} />
                        <div className="text-2xl font-black text-slate-800">Personeel</div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Naam</div>
                          <div className="text-lg font-bold text-slate-900">{scanResult.data.name}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Personeelsnummer</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.employeeNumber}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">Afdeling</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.departmentId || "Algemeen"}</div>
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
            </div>
          </div>
        ) : (
          <MobileScanner onScan={handleScan} onClose={closeScanner} />
        )
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">
                  {selectedOrder.orderId || selectedOrder.item}
                </h3>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Order Details
                </p>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={24} className="text-slate-500" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Status Badge */}
              <div className="flex justify-center">
                 <StatusBadge status={selectedOrder.status || "Gepland"} />
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Product</div>
                  <div className="font-bold text-slate-800 text-sm">{selectedOrder.itemCode || selectedOrder.item}</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Aantal</div>
                  <div className="font-bold text-slate-800 text-sm">{selectedOrder.plan || 0} stuks</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Machine</div>
                  <div className="font-bold text-slate-800 text-sm">{selectedOrder.machine || "Niet toegewezen"}</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Geplande Datum</div>
                  <div className="font-bold text-slate-800 text-sm">
                    {selectedOrder.plannedDate?.seconds 
                      ? format(new Date(selectedOrder.plannedDate.seconds * 1000), 'dd MMM yyyy', { locale: nl })
                      : "Niet gepland"}
                  </div>
                </div>
              </div>

              {/* Extra Info */}
              {selectedOrder.notes && (
                <div className="p-4 bg-yellow-50 rounded-2xl border border-yellow-100">
                  <div className="text-[10px] font-black text-yellow-600 uppercase mb-1 flex items-center gap-2">
                    <Info size={12} /> Notities
                  </div>
                  <p className="text-sm text-yellow-800 italic">"{selectedOrder.notes}"</p>
                </div>
              )}

              {/* Products List with Move Option */}
              {selectedOrderProducts.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Producten ({selectedOrderProducts.length})</h4>
                  <div className="space-y-2">
                    {selectedOrderProducts.map(p => (
                      <div key={p.id} className="bg-slate-50 p-3 rounded-xl flex justify-between items-center border border-slate-100">
                        <div>
                          <div className="font-bold text-sm text-slate-800">{p.lotNumber}</div>
                          <div className="text-xs text-slate-500">{p.currentStation} • {p.status}</div>
                        </div>
                        <button 
                          onClick={() => setProductToMove(p)}
                          className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-blue-600 shadow-sm"
                        >
                          <ArrowRightLeft size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
              <button 
                onClick={() => setSelectedOrder(null)}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-800 transition-all"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scrollable Content Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-24">
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
              onClick={() => setShowScanner(true)}
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
            <div className="text-white text-2xl font-black flex items-baseline gap-1">
              {issuesSummary.activeMachines}
              <span className="text-sm font-bold opacity-60">/ {activeProductsCount}</span>
            </div>
            <div className="text-[8px] text-white/40 font-bold uppercase mt-1">Machines / Producten</div>
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
        {/* Department Selector */}
        <div>
           {isDeptLocked ? (
             <div className="flex items-center gap-2 px-4 py-3 bg-slate-100 rounded-xl text-slate-600 font-bold text-sm w-full border border-slate-200">
               <Building2 size={16} />
               {selectedDepartment}
               <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-500 ml-auto uppercase tracking-wider">Toegewezen</span>
             </div>
           ) : (
             <div className="relative w-full">
               <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
               <select
                 value={selectedDepartment}
                 onChange={(e) => setSelectedDepartment(e.target.value)}
                 className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all appearance-none"
               >
                 {departments.map(dept => (
                   <option key={dept} value={dept}>{dept}</option>
                 ))}
               </select>
             </div>
           )}
        </div>

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
            onClick={() => { setActiveView("orders"); setSelectedMachineFilter(null); }}
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
      <div className="p-4 space-y-3">
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
                  onClick={() => {
                    setSelectedMachineFilter(machine.machine);
                    setActiveView("orders");
                  }}
                  className={`bg-white rounded-2xl border-2 p-4 transition-all cursor-pointer ${
                    machine.hasIssues 
                      ? "border-red-200 shadow-lg" 
                      : machine.isActive 
                        ? "border-emerald-200" 
                        : "border-slate-100 hover:border-blue-300"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin size={16} className="text-indigo-600" />
                        <div className="text-lg font-black text-slate-800">{machine.machine}</div>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-slate-600 font-bold">
                        <UserCheck size={14} className={machine.operatorName ? "text-emerald-600" : "text-slate-300"} />
                        <span className={machine.operatorName ? "text-slate-800" : "text-slate-400 italic"}>
                          {machine.operatorName || "Geen operator"}
                        </span>
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
                    <div 
                      className="bg-blue-50 rounded-xl p-3 mb-3 cursor-pointer hover:bg-blue-100 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation(); // Voorkom dat de kaart-klik ook afgaat
                        setSelectedOrder(machine.activeOrder);
                      }}
                    >
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
                    <button 
                      onClick={() => {
                        setSelectedMachineFilter(machine.machine);
                        setActiveView("orders");
                      }}
                      className="flex items-center gap-1 text-slate-600 hover:text-blue-600 transition-colors"
                    >
                      <Package size={14} />
                      <span className="text-xs font-bold">{machine.ordersCount} orders</span>
                    </button>
                    <div className="flex items-center gap-1 text-slate-600">
                      <Activity size={14} />
                      <span className="text-xs font-bold">{machine.activeProductsCount} actief</span>
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
            {selectedMachineFilter && (
              <div className="flex items-center justify-between bg-blue-50 p-3 rounded-xl mb-3 border border-blue-100 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2">
                  <Filter size={16} className="text-blue-600" />
                  <span className="text-sm font-bold text-blue-800">
                    Machine: {selectedMachineFilter}
                  </span>
                </div>
                <button 
                  onClick={() => setSelectedMachineFilter(null)}
                  className="p-1 bg-white rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {filteredOrders.filter(o => ["in_production", "in_progress", "planned", "delegated", "pending"].includes(o.status)).length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Package size={48} className="mx-auto mb-4 opacity-30" />
                <div className="font-bold text-sm">Geen actieve orders</div>
              </div>
            ) : (
              filteredOrders
                .filter(o => ["in_production", "in_progress", "planned", "delegated", "pending"].includes(o.status))
                .sort((a, b) => {
                    const isActiveA = a.status === "in_production" || a.status === "in_progress";
                    const isActiveB = b.status === "in_production" || b.status === "in_progress";
                    if (isActiveA && !isActiveB) return -1;
                    if (!isActiveA && isActiveB) return 1;
                    return 0;
                })
                .map(order => (
                  <div 
                    key={order.id} 
                    className="bg-white rounded-2xl border-2 border-slate-200 p-4 cursor-pointer hover:border-indigo-300 transition-all active:scale-95"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-lg font-black text-slate-800">
                          {order.orderId || order.item}
                        </div>
                        <div className="text-sm text-slate-600">{order.itemCode}</div>
                      </div>
                      <StatusBadge status={order.status} />
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
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 flex justify-around shadow-lg z-20">
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
          onClick={() => { setActiveView("orders"); setSelectedMachineFilter(null); }}
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

      {/* Product Move Modal */}
      {productToMove && (
        <ProductMoveModal
          product={productToMove}
          onClose={() => setProductToMove(null)}
          onMove={handleMoveLot}
          allowedStations={factoryStations}
          currentDepartment={selectedDepartment !== "ALLES" ? selectedDepartment : null}
        />
      )}
    </div>
  );
};

export default ShopFloorMobileApp;
