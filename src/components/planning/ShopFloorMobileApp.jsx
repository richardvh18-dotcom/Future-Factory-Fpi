import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
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
import { collection, onSnapshot, doc } from "firebase/firestore";
import { db, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import MobileScanner from "../digitalplanning/MobileScanner";
import ProductMoveModal from "../digitalplanning/ProductMoveModal";
import { normalizeMachine } from "../../utils/hubHelpers.tsx";
import StatusBadge from "../digitalplanning/common/StatusBadge";
import {
  moveTrackedProductManual,
  markReadyForNextStep as markReadyForNextStepCallable,
  startTrackedProductRepair,
  reportShopFloorIssue,
  resolveShopFloorIssue,
} from "../../services/planningSecurityService";
import { useNotifications } from '../../contexts/NotificationContext';

/**
 * Mobile Inspector - Floor manager companion app
 * Voor teamleaders, QC en planners die rondlopen op de werkvloer
 * Overzicht van alle machines, downtimes, QC issues en order status
 */
const ShopFloorMobileApp = () => {
  const { t } = useTranslation();
  const { user, role } = useAdminAuth();
  const { notify } = useNotifications();
  const [machines, setMachines] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [downtimeReports, setDowntimeReports] = useState([]);
  const [allPersonnel, setAllPersonnel] = useState([]);
  const [defectReports, setDefectReports] = useState([]);
  const [allTracked, setAllTracked] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all | active | issues
  const [activeView, setActiveView] = useState("planning"); // planning | overview | downtime | quality | orders | scanner
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
  const [selectedMachineDetail, setSelectedMachineDetail] = useState(null); // For Teamleader: detailed machine view
  const [selectedProduct, setSelectedProduct] = useState(null); // For product dossier
  const [repairMode, setRepairMode] = useState(null); // null | productId
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const scrollContainerRef = useRef(null);
  
  // Planning Dashboard filters
  const [planningSearchTerm, setPlanningSearchTerm] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all"); // all | active | completed | defect | temp_reject
  const [readyForNextStepMode, setReadyForNextStepMode] = useState(null); // null | productId (voor snelle scan)

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

  const handleContainerScroll = (event) => {
    setIsHeaderCollapsed(event.currentTarget.scrollTop > 20);
  };

  const normalizeDepartmentLabel = (value) => String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^productie\s*-\s*/i, "")
    .replace(/\s+/g, " ");

  const inferDepartmentFromMachineCode = (value) => {
    const machine = normalizeMachine(String(value || "").trim()).toUpperCase();
    if (machine.startsWith("BH")) return "fittings";
    if (machine.startsWith("BA")) return "pipes";
    if (machine.startsWith("BM")) return "spools";
    return "";
  };

  const matchesDepartmentId = (departmentId, selectedDept) => {
    if (!departmentId || !selectedDept) return false;

    const id = String(departmentId).trim().toLowerCase();
    const filter = normalizeDepartmentLabel(selectedDept);

    if (id === filter) return true;
    if (id.includes(filter) || filter.includes(id)) return true;

    if (filter === "fittings" && id.includes("fitting")) return true;
    if (filter === "pipes" && (id.includes("pipe") || id.includes("pijp"))) return true;
    if (filter === "spools" && id.includes("spool")) return true;

    return false;
  };

  const findStationForMachine = (machineCode) => {
    const normalizedMachine = normalizeMachine(machineCode || "");
    return factoryStations.find((station) => {
      const stationName = normalizeMachine(station.name || station.id || "");
      return stationName === normalizedMachine;
    });
  };

  const matchesOrderDepartment = (order) => {
    if (selectedDepartment === "ALLES") return true;

    const station = findStationForMachine(order.machine);
    if (matchesSelectedDepartment(selectedDepartment, station?.departmentName, order.machine)) return true;
    if (matchesDepartmentId(order.departmentId, selectedDepartment)) return true;
    if (matchesDepartmentId(order.department, selectedDepartment)) return true;

    return false;
  };

  const matchesSelectedDepartment = (selectedDept, stationDepartmentName, machineCode) => {
    if (!selectedDept || normalizeDepartmentLabel(selectedDept) === "alles") return true;

    const filter = normalizeDepartmentLabel(selectedDept);
    const stationDept = normalizeDepartmentLabel(stationDepartmentName);
    const inferredDept = inferDepartmentFromMachineCode(machineCode);

    if (stationDept) {
      if (stationDept === filter) return true;
      if (stationDept.includes(filter) || filter.includes(stationDept)) return true;
    }

    if (inferredDept && inferredDept === filter) return true;

    return false;
  };

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
      filtered = filtered.filter(m =>
        matchesSelectedDepartment(selectedDepartment, m.department, m.machine || m.id)
      );
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
        return matchesOrderDepartment(o);
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
      await moveTrackedProductManual({
        productOrLotId: lotNumber,
        newStation,
        source: "ShopFloorMobile",
        actorLabel: user?.email || "Mobile User",
      });

      await logActivity(
        user?.uid,
        "MOBILE_LOT_MOVE",
        `Lot ${lotNumber} handmatig verplaatst naar ${newStation}`
      );
      
      setProductToMove(null);
      notify(`Product ${lotNumber} verplaatst naar ${newStation}`);
    } catch (err) {
      console.error("Fout bij verplaatsen:", err);
      notify("Fout bij verplaatsen: " + err.message);
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
      const station = findStationForMachine(machine);
      return matchesSelectedDepartment(selectedDepartment, station?.departmentName, machine);
    }).length;
  }, [allTracked, selectedDepartment, factoryStations]);

  // Get detailed order + product data for a specific machine (for TeamLeader view)
  const getOrdersForMachine = (machineName) => {
    const machineOrders = allOrders.filter(o => o.machine === machineName);
    return machineOrders.map(order => ({
      ...order,
      products: allTracked.filter(p => p.orderId === order.orderId)
    }));
  };

  const isTemporaryRejectedProduct = (product) => {
    const status = String(product?.status || "").trim().toLowerCase();
    const inspectionStatus = String(product?.inspection?.status || "").trim().toLowerCase();
    return ["temp_reject", "temp_rejected", "tijdelijke afkeur", "tijdelijk_afkeur"].includes(status)
      || inspectionStatus === "tijdelijke afkeur";
  };

  const isFinalRejectedProduct = (product) => {
    const status = String(product?.status || "").trim().toLowerCase();
    const step = String(product?.currentStep || "").trim().toUpperCase();
    const inspectionStatus = String(product?.inspection?.status || "").trim().toLowerCase();
    const archiveReason = String(product?.archiveReason || product?.archivedReason || "").trim().toLowerCase();

    return ["rejected", "afkeur", "definitieve afkeur"].includes(status)
      || step === "REJECTED"
      || inspectionStatus === "afkeur"
      || inspectionStatus === "definitieve afkeur"
      || archiveReason === "rejected";
  };

  const ordersForKpis = useMemo(() => {
    let orders = allOrders.map((order) => ({
      ...order,
      products: allTracked.filter((product) => product.orderId === order.orderId),
    }));

    if (selectedDepartment !== "ALLES") {
      orders = orders.filter((order) => matchesOrderDepartment(order));
    }

    if (selectedMachineFilter) {
      const filterNorm = normalizeMachine(selectedMachineFilter);
      orders = orders.filter((order) => normalizeMachine(order.machine) === filterNorm);
    }

    return orders;
  }, [allOrders, allTracked, selectedDepartment, selectedMachineFilter]);

  // Get all orders with products for planning dashboard
  const getDashboardOrders = useMemo(() => {
    let orders = allOrders.map(order => ({
      ...order,
      products: allTracked.filter(p => p.orderId === order.orderId),
      activeProductsCount: allTracked.filter(p => p.orderId === order.orderId && ['In Production', 'in_progress'].includes(p.status)).length,
      defectCount: defectReports.filter(d => d.orderId === order.orderId && d.status === 'open').length,
    }));

    // Department filter
    if (selectedDepartment !== "ALLES") {
      orders = orders.filter((o) => matchesOrderDepartment(o));
    }

    // Status filter
    if (orderStatusFilter !== "all") {
      orders = orders.filter(o => {
        if (orderStatusFilter === "active") return ['in_production', 'in_progress'].includes(o.status);
        if (orderStatusFilter === "completed") return o.status === 'completed';
        if (orderStatusFilter === "defect") return o.defectCount > 0;
        if (orderStatusFilter === "temp_reject") return o.status === 'temp_reject' || o.status === 'rejected';
        return true;
      });
    }

    // Search filter
    if (planningSearchTerm) {
      const term = planningSearchTerm.toLowerCase();
      orders = orders.filter(o => 
        o.orderId?.toLowerCase().includes(term) ||
        o.item?.toLowerCase().includes(term) ||
        o.itemCode?.toLowerCase().includes(term) ||
        o.machine?.toLowerCase().includes(term)
      );
    }

    return orders.sort((a, b) => {
      // Prioritize active orders
      const aActive = ['in_production', 'in_progress'].includes(a.status);
      const bActive = ['in_production', 'in_progress'].includes(b.status);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      // Then by date
      if (a.plannedDate?.seconds && b.plannedDate?.seconds) {
        return a.plannedDate.seconds - b.plannedDate.seconds;
      }
      return 0;
    });
  }, [allOrders, allTracked, defectReports, factoryStations, selectedDepartment, orderStatusFilter, planningSearchTerm]);

  // Active issues summary
  const issuesSummary = useMemo(() => ({
    totalDowntime: downtimeReports.filter(d => d.status === "active").length,
    totalDefects: defectReports.filter(d => d.status === "open").length,
    machinesWithIssues: machineStats.filter(m => m.hasIssues).length,
    activeMachines: machineStats.filter(m => m.isActive).length
  }), [downtimeReports, defectReports, machineStats]);

  const planningSummary = useMemo(() => ({
    totalOrders: ordersForKpis.length,
    activeOrders: ordersForKpis.filter((order) => ["in_production", "in_progress"].includes(String(order.status || "").toLowerCase())).length,
    temporaryRejectedOrders: ordersForKpis.filter((order) => order.products?.some(isTemporaryRejectedProduct)).length,
    finalRejectedOrders: ordersForKpis.filter((order) => {
      const status = String(order.status || "").trim().toLowerCase();
      return order.products?.some(isFinalRejectedProduct)
        || ["rejected", "afkeur", "definitieve afkeur"].includes(status)
        || Number(order.rejectedCount || 0) > 0;
    }).length,
  }), [ordersForKpis]);

  // Resolve downtime
  const resolveDowntime = async (downtimeId) => {
    await resolveShopFloorIssue({
      type: "downtime",
      issueId: downtimeId,
    });

    await logActivity(
      user?.uid,
      "DOWNTIME_RESOLVE",
      `Downtime melding opgelost via mobile app: ${downtimeId}`
    );
  };

  // Resolve defect
  const resolveDefect = async (defectId) => {
    await resolveShopFloorIssue({
      type: "defect",
      issueId: defectId,
    });

    await logActivity(
      user?.uid,
      "DEFECT_RESOLVE",
      `Defect melding opgelost via mobile app: ${defectId}`
    );
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

  // Mark product as ready for next step
  const markReadyForNextStep = async (product) => {
    if (!product || !product.id) return;
    try {
      await markReadyForNextStepCallable({
        productId: product.id,
      });

      await logActivity(
        user?.uid,
        "READY_FOR_NEXT_STEP",
        `Product ${product.lotNumber} gereed voor volgende stap gemarkeerd door ${user?.displayName || 'Inspector'}`
      );

      notify(`✅ ${product.lotNumber} gereed voor volgende stap`);
      setReadyForNextStepMode(null);
      setScanResult(null);
    } catch (err) {
      console.error("Fout bij gereed markeren:", err);
      notify("Fout bij gereed markeren");
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
          <div className="text-xl font-bold mb-2">{t("planning.shopFloor.notLoggedIn", "Niet ingelogd")}</div>
          <div className="text-sm text-slate-400">{t("planning.shopFloor.loginToAccess", "Log in om toegang te krijgen")}</div>
        </div>
      </div>
    );
  }

  const submitIssue = async () => {
    if (!scanResult?.data || !issueType) return;
    
    try {
      await reportShopFloorIssue({
        type: issueType,
        machine: scanResult.data.machine || t("planning.shopFloor.unknown", "Onbekend"),
        orderId: scanResult.data.orderId || scanResult.data.id || null,
        lotNumber: scanResult.data.lotNumber || null,
        description: issueDescription || "",
        operatorName: user.displayName || t("planning.shopFloor.operator", "Operator"),
      });

      await logActivity(
        user?.uid,
        "MESSAGE_SEND",
        `Teamleader-alert verzonden vanuit mobile app (${issueType}) voor machine ${scanResult.data.machine || t("planning.shopFloor.unknown", "Onbekend")}`
      );
      
      setShowIssueModal(false);
      setIssueDescription("");
      setIssueType(null);
      notify(t("planning.shopFloor.issueSent", "Melding succesvol verstuurd"));
    } catch (error) {
      console.error("Error reporting issue:", error);
      notify(t("planning.shopFloor.issueSendError", "Fout bij versturen melding."));
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
               <p className="text-[10px] font-bold text-slate-400 uppercase">{t("planning.shopFloor.scanner", "Scanner")}</p>
             </div>
           </div>
           <div className="bg-slate-100 px-3 py-1 rounded-full text-xs font-bold text-slate-600">
             {user?.displayName?.split(' ')[0] || t("planning.shopFloor.operatorShort", "Op")}
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
                  {scanResult.type === 'product' ? t("planning.shopFloor.productFound", "Product Gevonden") :
                   scanResult.type === 'order' ? t("planning.shopFloor.orderFound", "Order Gevonden") :
                   scanResult.type === 'personnel' ? t("planning.shopFloor.personnel", "Personeel") : t("planning.shopFloor.notFound", "Niet Gevonden")}
                </h2>
                
                <div className="w-full bg-slate-50 rounded-xl p-4 mb-6 text-left space-y-3">
                   {scanResult.data ? (
                     <>
                       {scanResult.data.lotNumber && (
                         <div>
                           <span className="text-[10px] font-bold text-slate-400 uppercase block">Lotnummer</span>
                           <span className="text-[10px] font-bold text-slate-400 uppercase block">{t("planning.shopFloor.lotNumber", "Lotnummer")}</span>
                           <span className="text-lg font-bold text-slate-900">{scanResult.data.lotNumber}</span>
                         </div>
                       )}
                       {(scanResult.data.orderId || scanResult.data.id) && (
                         <div>
                           <span className="text-[10px] font-bold text-slate-400 uppercase block">{t("planning.shopFloor.idOrder", "ID / Order")}</span>
                           <span className="text-base font-bold text-slate-900">{scanResult.data.orderId || scanResult.data.id}</span>
                         </div>
                       )}
                       {scanResult.data.status && (
                         <div>
                           <span className="text-[10px] font-bold text-slate-400 uppercase block">{t("planning.shopFloor.status", "Status")}</span>
                           <span className="inline-block px-2 py-1 bg-white rounded border border-slate-200 text-sm font-bold text-slate-700 mt-1">
                             {scanResult.data.status}
                           </span>
                         </div>
                       )}
                     </>
                   ) : (
                     <p className="text-slate-500 font-medium">{t("planning.shopFloor.noDataForCode", "Geen gegevens gevonden voor code:")} <span className="font-mono font-bold">{scanResult.code}</span></p>
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
                      {t("planning.shopFloor.defect", "Defect")}
                    </button>
                    <button 
                      onClick={() => {
                        setIssueType('downtime');
                        setShowIssueModal(true);
                      }}
                      className="py-4 bg-orange-50 text-orange-600 rounded-2xl font-bold text-xs uppercase flex flex-col items-center justify-center gap-2 border-2 border-orange-100 active:scale-95 transition-all"
                    >
                      <Clock size={24} />
                      {t("planning.shopFloor.downtime", "Stilstand")}
                    </button>
                  </div>
                )}

                <button 
                  onClick={closeScanner}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"
                >
                  {t("planning.shopFloor.nextScan", "Volgende Scan")}
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
                  <span className="text-2xl font-black uppercase tracking-widest">{t("planning.shopFloor.scanQr", "Scan QR")}</span>
                </button>

                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200">
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-2">{t("planning.shopFloor.orSearchManually", "Of zoek handmatig")}</label>
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
                      placeholder={t("planning.shopFloor.enterCode", "Code invoeren...")}
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
                   {issueType === 'defect' ? t("planning.shopFloor.reportDefect", "Defect Melden") : t("planning.shopFloor.reportDowntime", "Stilstand Melden")}
                 </h3>
                 <p className="text-sm text-slate-500 mb-4">
                   {scanResult?.data?.lotNumber ? `${t("planning.shopFloor.lot", "Lot")}: ${scanResult.data.lotNumber}` : `${t("planning.shopFloor.item", "Item")}: ${scanResult?.data?.orderId || t("planning.shopFloor.unknown", "Onbekend")}`}
                 </p>
                 
                 <textarea
                   className="w-full p-4 bg-slate-50 rounded-xl border-2 border-slate-100 font-bold text-slate-700 outline-none focus:border-blue-500 min-h-[120px] mb-4"
                   placeholder={t("planning.shopFloor.describeProblem", "Beschrijf het probleem...")}
                   value={issueDescription}
                   onChange={(e) => setIssueDescription(e.target.value)}
                 />
                 
                 <div className="flex gap-3">
                   <button 
                     onClick={() => setShowIssueModal(false)}
                     className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold uppercase text-xs"
                   >
                       {t("planning.shopFloor.cancel", "Annuleren")}
                   </button>
                   <button 
                     onClick={submitIssue}
                     className={`flex-1 py-3 text-white rounded-xl font-bold uppercase text-xs ${
                       issueType === 'defect' ? 'bg-red-600' : 'bg-orange-500'
                     }`}
                   >
                     {t("planning.shopFloor.send", "Versturen")}
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
                        <div className="text-2xl font-black text-slate-800">{t("planning.shopFloor.productFound", "Product Gevonden")}</div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">{t("planning.shopFloor.lotNumber", "Lotnummer")}</div>
                          <div className="text-lg font-bold text-slate-900">{scanResult.data.lotNumber}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">{t("planning.shopFloor.order", "Order")}</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.orderId}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">{t("planning.shopFloor.machine", "Machine")}</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.machine}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">{t("planning.shopFloor.status", "Status")}</div>
                          <StatusBadge status={scanResult.data.status} />
                        </div>
                      </div>
                      {(role === 'teamleader' || role === 'admin') && (
                        <button 
                          onClick={() => { setProductToMove(scanResult.data); closeScanner(); }}
                          className="w-full mt-2 py-3 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                        >
                          <ArrowRightLeft size={18} /> {t("planning.shopFloor.moveProduct", "Verplaats Product")}
                        </button>
                      )}
                    </>
                  ) : scanResult.type === "order" ? (
                    <>
                      <div className="text-center mb-4">
                        <CheckCircle className="mx-auto text-blue-500 mb-2" size={48} />
                        <div className="text-2xl font-black text-slate-800">{t("planning.shopFloor.orderFound", "Order Gevonden")}</div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">{t("planning.shopFloor.orderId", "Order ID")}</div>
                          <div className="text-lg font-bold text-slate-900">{scanResult.data.orderId}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">{t("planning.shopFloor.item", "Item")}</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.item}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">{t("planning.shopFloor.machine", "Machine")}</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.machine}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">{t("planning.shopFloor.status", "Status")}</div>
                          <StatusBadge status={scanResult.data.status} />
                        </div>
                      </div>
                      <button
                        onClick={() => { closeScanner(); setSelectedOrder(scanResult.data); }}
                        className="w-full mt-4 py-3 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-xl font-bold transition-colors"
                      >
                        {t("planning.shopFloor.viewDetails", "Bekijk Details")}
                      </button>
                    </>
                  ) : scanResult.type === "personnel" ? (
                    <>
                      <div className="text-center mb-4">
                        <UserCheck className="mx-auto text-purple-500 mb-2" size={48} />
                        <div className="text-2xl font-black text-slate-800">{t("planning.shopFloor.personnel", "Personeel")}</div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">{t("planning.shopFloor.name", "Naam")}</div>
                          <div className="text-lg font-bold text-slate-900">{scanResult.data.name}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">{t("planning.shopFloor.employeeNumber", "Personeelsnummer")}</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.employeeNumber}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">{t("planning.shopFloor.department", "Afdeling")}</div>
                          <div className="text-sm font-bold text-slate-700">{scanResult.data.departmentId || t("planning.shopFloor.general", "Algemeen")}</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-center mb-4">
                        <AlertTriangle className="mx-auto text-amber-500 mb-2" size={48} />
                        <div className="text-2xl font-black text-slate-800">{t("planning.shopFloor.notFound", "Niet Gevonden")}</div>
                      </div>
                      <div className="text-center text-slate-600">
                        {t("planning.shopFloor.codeNotFound", "Code")} <span className="font-mono font-bold">{scanResult.code}</span> {t("planning.shopFloor.notFoundInSystem", "niet gevonden in systeem.")}
                      </div>
                    </>
                  )}
                  
                  <button
                    onClick={closeScanner}
                    className="w-full mt-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors"
                  >
                    {t("planning.shopFloor.close", "Sluiten")}
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
                  {t("planning.shopFloor.orderDetails", "Order Details")}
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
                  <div className="text-[10px] font-black text-slate-400 uppercase mb-1">{t("planning.shopFloor.product", "Product")}</div>
                  <div className="font-bold text-slate-800 text-sm">{selectedOrder.itemCode || selectedOrder.item}</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="text-[10px] font-black text-slate-400 uppercase mb-1">{t("planning.shopFloor.quantity", "Aantal")}</div>
                  <div className="font-bold text-slate-800 text-sm">{t("planning.shopFloor.quantityPieces", "{{count}} stuks", { count: selectedOrder.plan || 0 })}</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="text-[10px] font-black text-slate-400 uppercase mb-1">{t("planning.shopFloor.machine", "Machine")}</div>
                  <div className="font-bold text-slate-800 text-sm">{selectedOrder.machine || t("planning.shopFloor.notAssigned", "Niet toegewezen")}</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="text-[10px] font-black text-slate-400 uppercase mb-1">{t("planning.shopFloor.plannedDate", "Geplande Datum")}</div>
                  <div className="font-bold text-slate-800 text-sm">
                    {selectedOrder.plannedDate?.seconds 
                      ? format(new Date(selectedOrder.plannedDate.seconds * 1000), 'dd MMM yyyy', { locale: nl })
                      : t("planning.shopFloor.notPlanned", "Niet gepland")}
                  </div>
                </div>
              </div>

              {/* Extra Info */}
              {selectedOrder.notes && (
                <div className="p-4 bg-yellow-50 rounded-2xl border border-yellow-100">
                  <div className="text-[10px] font-black text-yellow-600 uppercase mb-1 flex items-center gap-2">
                    <Info size={12} /> {t("planning.shopFloor.notes", "Notities")}
                  </div>
                  <p className="text-sm text-yellow-800 italic">"{selectedOrder.notes}"</p>
                </div>
              )}

              {/* Products List with Move Option */}
              {selectedOrderProducts.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Producten ({selectedOrderProducts.length})</h4>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">{t("planning.shopFloor.productsCount", "Producten ({{count}})", { count: selectedOrderProducts.length })}</h4>
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
                {t("planning.shopFloor.close", "Sluiten")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scrollable Content Container */}
      <div ref={scrollContainerRef} onScroll={handleContainerScroll} className="flex-1 overflow-y-auto custom-scrollbar pb-24">
      {/* Header */}
      <div className={`bg-gradient-to-br from-slate-900 via-indigo-800 to-cyan-700 shadow-lg sticky top-0 z-30 transition-all duration-300 ${isHeaderCollapsed ? "px-3 py-2" : "px-4 py-4"}`}>
        <div className={`flex items-center justify-between ${isHeaderCollapsed ? "mb-0" : "mb-4"}`}>
          <div>
            <div className={`text-white font-black transition-all duration-300 ${isHeaderCollapsed ? "text-lg" : "text-2xl"}`}>{t("planning.shopFloor.mobileInspector", "Mobile Inspector")}</div>
            <div className={`text-indigo-200 font-bold mt-1 transition-all duration-300 overflow-hidden ${isHeaderCollapsed ? "text-[0px] max-h-0 opacity-0 mt-0" : "text-sm max-h-10 opacity-100"}`}>
              {activeView === "planning"
                ? "Planning, afkeur en doorstroom in je broekzak"
                : t("planning.shopFloor.floorOverview", "Werkvloer Overzicht")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowScanner(true)}
              className={`bg-white/20 hover:bg-white/30 rounded-xl transition-colors ${isHeaderCollapsed ? "p-2" : "p-3"}`}
            >
              <ScanLine className="text-white" size={isHeaderCollapsed ? 18 : 24} />
            </button>
            <div className={`bg-white/20 px-4 py-2 rounded-xl transition-all duration-300 overflow-hidden ${isHeaderCollapsed ? "max-w-0 opacity-0 px-0 py-0" : "max-w-32 opacity-100"}`}>
              <div className="text-white text-xs font-bold">{user?.displayName?.split(' ')[0] || 'Inspector'}</div>
            </div>
          </div>
        </div>

        <div className={`grid grid-cols-2 gap-2 overflow-hidden transition-all duration-300 ${isHeaderCollapsed ? "max-h-0 opacity-0 mt-0 pointer-events-none" : "max-h-[220px] opacity-100 mt-3"}`}>
          <button
            onClick={() => setActiveView("planning")}
            className="bg-white/10 text-left backdrop-blur-sm rounded-2xl p-2.5 border border-white/10"
          >
            <div className="text-white/60 text-[10px] font-bold uppercase mb-1">Alle orders</div>
            <div className="text-white text-xl font-black">{planningSummary.totalOrders}</div>
            <div className="text-[10px] text-white/50 font-bold mt-1">Afdeling / machinefilter actief</div>
          </button>
          <button
            onClick={() => {
              setActiveView("planning");
              setOrderStatusFilter("active");
            }}
            className="bg-white/10 text-left backdrop-blur-sm rounded-2xl p-2.5 border border-white/10"
          >
            <div className="text-white/60 text-[10px] font-bold uppercase mb-1">Lopende orders</div>
            <div className="text-white text-xl font-black">{planningSummary.activeOrders}</div>
            <div className="text-[10px] text-white/50 font-bold mt-1">In productie of in voortgang</div>
          </button>
          <button
            onClick={() => {
              setActiveView("planning");
              setOrderStatusFilter("temp_reject");
            }}
            className="bg-amber-500/20 text-left backdrop-blur-sm rounded-2xl p-2.5 border border-amber-300/20"
          >
            <div className="text-amber-100 text-[10px] font-bold uppercase mb-1">Tijdelijke afkeur</div>
            <div className="text-white text-xl font-black">{planningSummary.temporaryRejectedOrders}</div>
            <div className="text-[10px] text-amber-100/80 font-bold mt-1">Orders met herstel of tijdelijke blokkade</div>
          </button>
          <button
            onClick={() => setActiveView("quality")}
            className="bg-rose-500/20 text-left backdrop-blur-sm rounded-2xl p-2.5 border border-rose-300/20"
          >
            <div className="text-rose-100 text-[10px] font-bold uppercase mb-1">Definitieve afkeur</div>
            <div className="text-white text-xl font-black">{planningSummary.finalRejectedOrders}</div>
            <div className="text-[10px] text-rose-100/80 font-bold mt-1">Definitief afgekeurde orders</div>
          </button>
        </div>

      </div>

      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="p-4 space-y-3">
          <div>
             {isDeptLocked ? (
               <div className="flex items-center gap-2 px-4 py-3 bg-slate-100 rounded-xl text-slate-600 font-bold text-sm w-full border border-slate-200">
                 <Building2 size={16} />
                 {selectedDepartment}
                 <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-500 ml-auto uppercase tracking-wider">{t("planning.shopFloor.assigned", "Toegewezen")}</span>
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

          {activeView === "overview" && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder={t("planning.shopFloor.searchPlaceholder", "Zoek machine, operator, order...")}
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
            </>
          )}

          <div className="flex gap-2 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveView("planning")}
            className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              activeView === "planning"
                ? "bg-indigo-100 text-indigo-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            📋 Planning
          </button>
          <button
            onClick={() => setActiveView("overview")}
            className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              activeView === "overview"
                ? "bg-indigo-100 text-indigo-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            🔧 Machines
          </button>
          <button
            onClick={() => setActiveView("downtime")}
            className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
              activeView === "downtime"
                ? "bg-orange-100 text-orange-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            ⏸️ Stilstand {issuesSummary.totalDowntime > 0 && (
              <span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                {issuesSummary.totalDowntime}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveView("quality")}
            className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
              activeView === "quality"
                ? "bg-red-100 text-red-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            🚩 QC {issuesSummary.totalDefects > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                {issuesSummary.totalDefects}
              </span>
            )}
          </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 space-y-3">
        {/* PLANNING DASHBOARD */}
        {activeView === "planning" && (
          <>
            {/* Planning Controls */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Zoek order ID, item code, machine..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  value={planningSearchTerm}
                  onChange={(e) => setPlanningSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                {[
                  { label: "Alle", value: "all" },
                  { label: "🟢 Actief", value: "active" },
                  { label: "✅ Gereed", value: "completed" },
                  { label: "🚩 Afkeur", value: "defect" },
                  { label: "❌ Geweigerd", value: "temp_reject" }
                ].map(filter => (
                  <button
                    key={filter.value}
                    onClick={() => setOrderStatusFilter(filter.value)}
                    className={`px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${
                      orderStatusFilter === filter.value
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Orders List */}
            {getDashboardOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Package size={48} className="mx-auto mb-4 opacity-30" />
                <div className="font-bold text-sm">Geen orders gevonden</div>
              </div>
            ) : (
              <div className="space-y-3">
                {getDashboardOrders.map(order => (
                  <PlanningOrderCard
                    key={order.id}
                    order={order}
                    onSelectOrder={() => setSelectedOrder(order)}
                    onScanReady={() => setReadyForNextStepMode(order.id)}
                    t={t}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeView === "overview" && (
          <>
            {filteredMachines.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Filter size={48} className="mx-auto mb-4 opacity-30" />
                <div className="font-bold text-sm">{t("planning.shopFloor.noMachinesFound", "Geen machines gevonden")}</div>
              </div>
            ) : (
              filteredMachines.map(machine => (
                <div
                  key={machine.id}
                  onClick={() => {
                    // Teamleaders/Planners: open detailed machine view
                    if (['teamleader', 'planner', 'admin'].includes(role)) {
                      setSelectedMachineDetail(machine);
                    } else {
                      // Fallback for others
                      setSelectedMachineFilter(machine.machine);
                      setActiveView("orders");
                    }
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
                          {machine.operatorName || t("planning.shopFloor.noOperator", "Geen operator")}
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
                      {machine.status === "issue" ? t("planning.shopFloor.issueStatus", "🔴 Issue") : machine.status === "active" ? t("planning.shopFloor.activeStatus", "🟢 Actief") : t("planning.shopFloor.idleStatus", "⚪ Idle")}
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
                        <div className="text-xs font-bold text-blue-900">{t("planning.shopFloor.inProduction", "In Productie")}</div>
                      </div>
                      <div className="text-sm font-black text-slate-800">
                        {machine.activeOrder.orderId || machine.activeOrder.item}
                      </div>
                      {machine.activeOrder.plan && (
                        <div className="text-xs text-slate-600 mt-1">
                          {t("planning.shopFloor.quantityPieces", "{{count}} stuks", { count: machine.activeOrder.plan })}
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
                          <span className="text-xs font-bold">{t("planning.shopFloor.downtimeReports", "{{count}} stilstand meldingen", { count: machine.downtimeCount })}</span>
                        </div>
                      )}
                      {machine.defectCount > 0 && (
                        <div className="flex items-center gap-2 text-red-700 bg-red-50 px-3 py-2 rounded-lg">
                          <AlertTriangle size={16} />
                          <span className="text-xs font-bold">{t("planning.shopFloor.qualityIssues", "{{count}} kwaliteit issues", { count: machine.defectCount })}</span>
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
                      <span className="text-xs font-bold">{t("planning.shopFloor.ordersCount", "{{count}} orders", { count: machine.ordersCount })}</span>
                    </button>
                    <div className="flex items-center gap-1 text-slate-600">
                      <Activity size={14} />
                      <span className="text-xs font-bold">{t("planning.shopFloor.activeCount", "{{count}} actief", { count: machine.activeProductsCount })}</span>
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
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 grid grid-cols-4 gap-2 shadow-lg z-20">
        <button
          onClick={() => setActiveView("planning")}
          className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl transition-colors ${
            activeView === "planning"
              ? "bg-indigo-50 text-indigo-600"
              : "text-slate-400"
          }`}
        >
          <ClipboardCheck size={20} />
          <span className="text-[10px] font-bold">Planning</span>
        </button>
        <button
          onClick={() => setActiveView("overview")}
          className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl transition-colors ${
            activeView === "overview" 
              ? "bg-indigo-50 text-indigo-600" 
              : "text-slate-400"
          }`}
        >
          <Eye size={22} />
          <span className="text-[10px] font-bold">Machines</span>
        </button>
        <button
          onClick={() => setActiveView("downtime")}
          className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl transition-colors relative ${
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
          className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl transition-colors relative ${
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

      {/* Teamleader: Machine Detail Modal */}
      {selectedMachineDetail && ['teamleader', 'planner', 'admin'].includes(role) && (
        <MachineDetailModal
          machine={selectedMachineDetail}
          orders={getOrdersForMachine(selectedMachineDetail.machine)}
          onClose={() => setSelectedMachineDetail(null)}
          onProductSelect={setSelectedProduct}
          onProductMove={setProductToMove}
          onRepairMode={setRepairMode}
          logActivity={logActivity}
          user={user}
          t={t}
        />
      )}

      {/* Product Dossier Modal */}
      {selectedProduct && (
        <ProductDossierModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onMove={() => {
            setProductToMove(selectedProduct);
            setSelectedProduct(null);
          }}
          onRepair={() => {
            setRepairMode(selectedProduct.id);
            setSelectedProduct(null);
          }}
          t={t}
        />
      )}

      {/* Repair Modal */}
      {repairMode && (
        <RepairModal
          productId={repairMode}
          product={allTracked.find(p => p.id === repairMode)}
          onClose={() => setRepairMode(null)}
          onSubmit={async (repairData) => {
            try {
              await startTrackedProductRepair({
                productId: repairMode,
                repairReason: repairData.reason,
              });
              await logActivity(
                user?.uid,
                "REPAIR_START",
                `Reparatie gestart voor product ${repairMode} door ${user?.displayName || 'TeamLeader'}`
              );
              notify("Reparatie gestart");
              setRepairMode(null);
            } catch (err) {
              console.error("Error starting repair:", err);
              notify("Fout bij starten reparatie");
            }
          }}
          t={t}
        />
      )}

      {/* Ready for Next Step Modal */}
      {readyForNextStepMode && (
        <ReadyForNextStepModal
          orderId={readyForNextStepMode}
          order={allOrders.find(o => o.id === readyForNextStepMode)}
          products={allTracked.filter(p => p.orderId === allOrders.find(o => o.id === readyForNextStepMode)?.orderId)}
          onClose={() => setReadyForNextStepMode(null)}
          onMarkReady={markReadyForNextStep}
          t={t}
        />
      )}
    </div>
  );
};

// ============================================
// Teamleader Machine Detail Modal
// ============================================
const MachineDetailModal = ({ machine, orders, onClose, onProductSelect, onProductMove, onRepairMode, logActivity, user, t }) => {
  const activeOrders = orders.filter(o => ['in_production', 'in_progress'].includes(o.status));
  const plannedOrders = orders.filter(o => ['planned', 'pending'].includes(o.status));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-black mb-1">{machine.machine}</h2>
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded">
                <UserCheck size={14} /> {machine.operatorName || 'Geen operator'}
              </div>
              <div className={`px-2 py-1 rounded font-bold text-xs ${
                machine.status === "issue" 
                  ? "bg-red-500" 
                  : machine.status === "active"
                    ? "bg-emerald-500"
                    : "bg-slate-500"
              }`}>
                {machine.status === "issue" ? "🔴 Issue" : machine.status === "active" ? "🟢 Actief" : "⚪ Idle"}
              </div>
              {machine.hasIssues && (
                <div className="flex items-center gap-1 bg-red-500/20 text-red-100 px-2 py-1 rounded text-xs font-bold">
                  {machine.downtimeCount > 0 && `${machine.downtimeCount} stilstanden`}
                  {machine.defectCount > 0 && (machine.downtimeCount > 0 ? " • " : "") + `${machine.defectCount} defecten`}
                </div>
              )}
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X size={28} />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 flex sticky top-0 bg-slate-50 z-10">
          <div className="flex-1 flex border-r border-slate-100">
            <div className="flex-1 py-3 px-4 font-bold text-center bg-white border-b-2 border-indigo-600 text-indigo-600">
              In Productie ({activeOrders.length})
            </div>
          </div>
          <div className="flex-1 flex border-l border-slate-100">
            <div className="flex-1 py-3 px-4 font-bold text-center text-slate-600 text-sm">
              Gepland ({plannedOrders.length})
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          
          {/* Active Orders */}
          {activeOrders.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Package size={40} className="mx-auto mb-2 opacity-30" />
              <div className="text-sm font-bold">Geen orders in productie</div>
            </div>
          ) : (
            activeOrders.map(order => (
              <OrderDetailCard
                key={order.id}
                order={order}
                products={order.products || []}
                onProductSelect={onProductSelect}
                onProductMove={onProductMove}
                onRepairMode={onRepairMode}
                t={t}
              />
            ))
          )}

          {/* Planned Orders */}
          {plannedOrders.length > 0 && (
            <div className="pt-4 border-t border-slate-200">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">📋 Geplande Orders</h3>
              <div className="space-y-2">
                {plannedOrders.map(order => (
                  <div key={order.id} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-bold text-sm text-slate-800">{order.orderId || order.item}</div>
                      <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded">{order.status}</span>
                    </div>
                    <div className="text-xs text-slate-600">{order.plan} stuks • {order.itemCode}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex gap-2">
          <button 
            onClick={onClose}
            className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition-colors"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};

// Order Detail Card Component
const OrderDetailCard = ({ order, products, onProductSelect, onProductMove, onRepairMode, t }) => {
  return (
    <div className="bg-white rounded-xl border-2 border-blue-100 overflow-hidden">
      
      {/* Order Header */}
      <div className="bg-blue-50 p-4 border-b border-blue-100">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h4 className="text-lg font-black text-slate-800">{order.orderId || order.item}</h4>
            <p className="text-sm text-slate-600">{order.itemCode}</p>
          </div>
          <div className="text-right">
            <div className="font-black text-indigo-600 text-xl">{order.plan || 0}</div>
            <div className="text-xs text-slate-500">stuks</div>
          </div>
        </div>
        {order.notes && (
          <div className="text-xs bg-yellow-50 border border-yellow-100 p-2 rounded text-slate-700 italic">
            💡 {order.notes}
          </div>
        )}
      </div>

      {/* Products List */}
      <div className="p-4 space-y-2">
        {products.length === 0 ? (
          <div className="text-sm text-slate-500 italic">Geen producten getrackt voor deze order</div>
        ) : (
          products.map(product => (
            <div key={product.id} className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center justify-between">
              <div className="flex-1">
                <div className="font-bold text-sm text-slate-800">{product.lotNumber}</div>
                <div className="text-xs text-slate-600">
                  {product.currentStation} • {product.status}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onProductSelect(product)}
                  className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                  title="Product dossier"
                >
                  <Eye size={16} />
                </button>
                {['In Production', 'in_progress'].includes(product.status) && (
                  <>
                    <button
                      onClick={() => onProductMove(product)}
                      className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
                      title="Verplaatsen"
                    >
                      <ArrowRightLeft size={16} />
                    </button>
                    <button
                      onClick={() => onRepairMode(product.id)}
                      className="p-2 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-lg transition-colors"
                      title="Reparatie"
                    >
                      <AlertTriangle size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ============================================
// Product Dossier Modal
// ============================================
const ProductDossierModal = ({ product, onClose, onMove, onRepair, t }) => {
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
        
        <div className="p-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-black mb-1">Product Dossier</h2>
            <p className="text-blue-100 text-sm">{product.lotNumber}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
          
          {/* Lot Info */}
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase mb-1">Lotnummer</div>
                <div className="text-lg font-black text-slate-800">{product.lotNumber}</div>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase mb-1">Order</div>
                <div className="text-lg font-black text-slate-800">{product.orderId || "N/A"}</div>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase mb-1">Status</div>
                <div className="font-bold text-sm">{product.status}</div>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase mb-1">Huidige Station</div>
                <div className="font-bold text-sm">{product.currentStation || "Onbekend"}</div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          {product.history && (
            <div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">📍 Geschiedenis</h3>
              <div className="space-y-2 text-sm">
                {product.history.slice(-5).reverse().map((entry, i) => (
                  <div key={i} className="flex gap-2 text-slate-600">
                    <div className="font-bold text-blue-600 min-w-[80px]">
                      {entry.station || entry.step || "N/A"}
                    </div>
                    <div>{entry.timestamp ? new Date(entry.timestamp.toDate ? entry.timestamp.toDate() : entry.timestamp).toLocaleString() : "N/A"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Defects */}
          {product.defects && product.defects.length > 0 && (
            <div className="bg-red-50 p-4 rounded-xl border border-red-100">
              <h3 className="text-xs font-black text-red-700 uppercase mb-2">🚩 Geregistreerde Defecten</h3>
              <div className="space-y-2">
                {product.defects.map((defect, i) => (
                  <div key={i} className="text-sm text-red-800">
                    • {defect.description || defect.type}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex gap-2">
          <button onClick={onMove} className="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
            <ArrowRightLeft size={18} /> Verplaatsen
          </button>
          <button onClick={onRepair} className="flex-1 py-3 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 transition-colors flex items-center justify-center gap-2">
            <AlertTriangle size={18} /> Reparatie
          </button>
          <button onClick={onClose} className="flex-1 py-3 bg-slate-300 text-slate-700 rounded-lg font-bold hover:bg-slate-400 transition-colors">
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// Repair Modal
// ============================================
const RepairModal = ({ productId, product, onClose, onSubmit, t }) => {
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
        
        <div className="p-6 bg-orange-600 text-white">
          <h2 className="text-2xl font-black mb-1">🔧 Reparatie Starten</h2>
          <p className="text-orange-100">{product?.lotNumber || productId}</p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Reparatie Reden</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Beschrijf het probleem..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:border-orange-500 outline-none resize-none"
              rows="4"
            />
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex gap-2">
          <button 
            onClick={onClose}
            className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-300 transition-colors"
          >
            Annuleren
          </button>
          <button 
            onClick={() => onSubmit({ reason })}
            className="flex-1 py-3 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 transition-colors"
          >
            Start Reparatie
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// Planning Order Card Component
// ============================================
const PlanningOrderCard = ({ order, onSelectOrder, onScanReady, t }) => {
  const getStatusColor = (status) => {
    if (['in_production', 'in_progress'].includes(status)) return "bg-emerald-50 border-emerald-200";
    if (['planned', 'pending'].includes(status)) return "bg-blue-50 border-blue-200";
    if (status === 'completed') return "bg-slate-50 border-slate-200";
    if (['temp_reject', 'rejected'].includes(status)) return "bg-red-50 border-red-200";
    return "bg-slate-50 border-slate-200";
  };

  const getStatusLabel = (status) => {
    if (['in_production', 'in_progress'].includes(status)) return "🟢 In Productie";
    if (['planned', 'pending'].includes(status)) return "📋 Gepland";
    if (status === 'completed') return "✅ Gereed";
    if (['temp_reject', 'rejected'].includes(status)) return "❌ Afgewezen";
    return status;
  };

  return (
    <div 
      onClick={onSelectOrder}
      className={`bg-white rounded-2xl border-2 p-4 cursor-pointer transition-all active:scale-95 ${getStatusColor(order.status)}`}
    >
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Ordernummer</div>
            <h3 className="text-lg font-black text-slate-800 break-words">{order.orderId || "Onbekend"}</h3>
          </div>
          <div>
            <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Productnaam</div>
            <p className="text-sm text-slate-700 font-bold break-words">{order.item || order.itemCode || "Onbekend product"}</p>
          </div>
        </div>
        <span className="text-xs font-bold px-2 py-1 bg-white rounded border border-slate-200">
          {order.plan || 0} stuks
        </span>
      </div>

      {/* Status & Stats */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-200">
        <div className="text-sm font-bold text-slate-700">{getStatusLabel(order.status)}</div>
        <div className="flex gap-3 text-xs">
          {order.activeProductsCount > 0 && (
            <div className="flex items-center gap-1 text-emerald-600 font-bold">
              <Activity size={14} /> {order.activeProductsCount} actief
            </div>
          )}
          {order.defectCount > 0 && (
            <div className="flex items-center gap-1 text-red-600 font-bold">
              <AlertTriangle size={14} /> {order.defectCount} afkeur
            </div>
          )}
        </div>
      </div>

      {/* Machine & Date */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-slate-600 font-bold">
          <MapPin size={16} /> {order.machine || "Niet toegewezen"}
        </div>
        <div className="text-xs text-slate-500">
          {order.plannedDate?.seconds 
            ? format(new Date(order.plannedDate.seconds * 1000), 'dd MMM', { locale: nl })
            : "Geen datum"}
        </div>
      </div>

      {/* Quick Action Buttons */}
      {['in_production', 'in_progress'].includes(order.status) && (
        <div className="mt-3 pt-3 border-t border-slate-200 flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onScanReady();
            }}
            className="flex-1 py-2 px-3 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle size={16} /> Gereed volgende stap
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================
// Ready for Next Step Modal
// ============================================
const ReadyForNextStepModal = ({ orderId, order, products, onClose, onMarkReady, t }) => {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [markMode, setMarkMode] = useState(false); // false = select | true = confirm

  if (markMode && selectedProduct) {
    return (
      <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
          <div className="p-6 bg-emerald-600 text-white">
            <h2 className="text-2xl font-black mb-1">✅ Gereed voor volgende stap</h2>
            <p className="text-emerald-100">{selectedProduct.lotNumber}</p>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <div className="text-sm font-bold text-slate-700 mb-2">Order:</div>
              <div className="text-lg font-black text-slate-800">{order?.orderId}</div>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-700 mb-2">Huide Station:</div>
              <div className="text-lg font-black text-slate-800">{selectedProduct.currentStation}</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg">
              <p className="text-sm text-emerald-800">
                Status wordt ingesteld op <strong>"Gereed voor volgende stap"</strong> en kan verplaatst worden naar de volgende werkstation.
              </p>
            </div>
          </div>

          <div className="p-4 border-t border-slate-200 bg-slate-50 flex gap-2">
            <button 
              onClick={() => setMarkMode(false)}
              className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-300 transition-colors"
            >
              Terug
            </button>
            <button 
              onClick={() => {
                onMarkReady(selectedProduct);
                onClose();
              }}
              className="flex-1 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors"
            >
              Bevestig ✅
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
        <div className="p-6 bg-emerald-600 text-white flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-black mb-1">Selecteer Product</h2>
            <p className="text-emerald-100">{order?.orderId}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
          {products.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Package size={40} className="mx-auto mb-2 opacity-30" />
              <div className="text-sm font-bold">Geen producten in deze order</div>
            </div>
          ) : (
            products.map(product => (
              <button
                key={product.id}
                onClick={() => {
                  setSelectedProduct(product);
                  setMarkMode(true);
                }}
                className="w-full text-left bg-slate-50 hover:bg-slate-100 p-4 rounded-xl border border-slate-200 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-slate-800">{product.lotNumber}</div>
                  <span className="text-xs font-bold px-2 py-1 bg-white rounded border border-slate-200">{product.status}</span>
                </div>
                <div className="text-sm text-slate-600">
                  {product.currentStation} • {product.currentStep || "Geen stap"}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <button 
            onClick={onClose}
            className="w-full py-3 bg-slate-300 text-slate-700 rounded-lg font-bold hover:bg-slate-400 transition-colors"
          >
            Annuleren
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShopFloorMobileApp;
