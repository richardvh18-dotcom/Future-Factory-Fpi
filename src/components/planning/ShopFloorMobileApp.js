import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Activity, CheckCircle, XCircle, AlertTriangle, Clock, Search, Filter, Eye, MapPin, Package, PlayCircle, ScanLine, UserCheck, X, Info, Building2, ClipboardCheck, ArrowRight, ArrowRightLeft } from "lucide-react";
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
import { moveTrackedProductManual, markReadyForNextStep as markReadyForNextStepCallable, startTrackedProductRepair, reportShopFloorIssue, resolveShopFloorIssue, } from "../../services/planningSecurityService";
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
        if (!PATHS || !PATHS.FACTORY_CONFIG)
            return;
        // Load factory config for full machine list
        const unsubConfig = onSnapshot(doc(db, ...PATHS.FACTORY_CONFIG), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const stations = [];
                const depts = ["ALLES"];
                if (data.departments) {
                    data.departments.forEach(dept => {
                        if (dept.isActive !== false)
                            depts.push(dept.name);
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
        });
        // Load all machines/occupancy
        const unsubOccupancy = onSnapshot(collection(db, ...PATHS.OCCUPANCY), (snapshot) => {
            const occData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setMachines(occData);
        });
        // Load all orders
        const unsubPlanning = onSnapshot(collection(db, ...PATHS.PLANNING), (snapshot) => {
            const orders = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setAllOrders(orders);
        });
        // Load tracked products
        const unsubTracked = onSnapshot(collection(db, ...PATHS.TRACKING), (snapshot) => {
            const tracked = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setAllTracked(tracked);
        });
        // Load downtime reports
        const unsubDowntime = onSnapshot(collection(db, ...PATHS.DOWNTIME), (snapshot) => {
            const reports = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setDowntimeReports(reports);
        });
        // Load defect reports
        const unsubDefects = onSnapshot(collection(db, ...PATHS.DEFECTS), (snapshot) => {
            const reports = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setDefectReports(reports);
        });
        // Load personnel
        const unsubPersonnel = onSnapshot(collection(db, ...PATHS.PERSONNEL), (snapshot) => {
            const people = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllPersonnel(people);
        });
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
            }
            else if (user.department.toUpperCase() !== "ALLES") {
                setSelectedDepartment(user.department);
            }
        }
        else if (["planner", "admin", "manager"].includes(role)) {
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
        if (machine.startsWith("BH"))
            return "fittings";
        if (machine.startsWith("BA"))
            return "pipes";
        if (machine.startsWith("BM"))
            return "spools";
        return "";
    };
    const matchesDepartmentId = (departmentId, selectedDept) => {
        if (!departmentId || !selectedDept)
            return false;
        const id = String(departmentId).trim().toLowerCase();
        const filter = normalizeDepartmentLabel(selectedDept);
        if (id === filter)
            return true;
        if (id.includes(filter) || filter.includes(id))
            return true;
        if (filter === "fittings" && id.includes("fitting"))
            return true;
        if (filter === "pipes" && (id.includes("pipe") || id.includes("pijp")))
            return true;
        if (filter === "spools" && id.includes("spool"))
            return true;
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
        if (selectedDepartment === "ALLES")
            return true;
        const station = findStationForMachine(order.machine);
        if (matchesSelectedDepartment(selectedDepartment, station?.departmentName, order.machine))
            return true;
        if (matchesDepartmentId(order.departmentId, selectedDepartment))
            return true;
        if (matchesDepartmentId(order.department, selectedDepartment))
            return true;
        return false;
    };
    const matchesSelectedDepartment = (selectedDept, stationDepartmentName, machineCode) => {
        if (!selectedDept || normalizeDepartmentLabel(selectedDept) === "alles")
            return true;
        const filter = normalizeDepartmentLabel(selectedDept);
        const stationDept = normalizeDepartmentLabel(stationDepartmentName);
        const inferredDept = inferDepartmentFromMachineCode(machineCode);
        if (stationDept) {
            if (stationDept === filter)
                return true;
            if (stationDept.includes(filter) || filter.includes(stationDept))
                return true;
        }
        if (inferredDept && inferredDept === filter)
            return true;
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
            const activeProducts = allTracked.filter(p => (p.machine === name || p.currentStation === name) &&
                (p.status === "In Production" || p.status === "in_progress")).length;
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
            filtered = filtered.filter(m => matchesSelectedDepartment(selectedDepartment, m.department, m.machine || m.id));
        }
        // Filter by status
        if (filterStatus === "active") {
            filtered = filtered.filter(m => m.isActive);
        }
        else if (filterStatus === "issues") {
            filtered = filtered.filter(m => m.hasIssues);
        }
        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(m => m.machine?.toLowerCase().includes(term) ||
                m.operatorName?.toLowerCase().includes(term) ||
                m.activeOrder?.orderId?.toLowerCase().includes(term));
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
        if (!selectedOrder)
            return [];
        return allTracked.filter(p => p.orderId === selectedOrder.orderId);
    }, [selectedOrder, allTracked]);
    // Handle moving a product
    const handleMoveLot = async (lotNumber, newStation) => {
        if (!lotNumber || !newStation)
            return;
        try {
            await moveTrackedProductManual({
                productOrLotId: lotNumber,
                newStation,
                source: "ShopFloorMobile",
                actorLabel: user?.email || "Mobile User",
            });
            await logActivity(user?.uid, "MOBILE_LOT_MOVE", `Lot ${lotNumber} handmatig verplaatst naar ${newStation}`);
            setProductToMove(null);
            notify(`Product ${lotNumber} verplaatst naar ${newStation}`);
        }
        catch (err) {
            console.error("Fout bij verplaatsen:", err);
            notify("Fout bij verplaatsen: " + err.message);
        }
    };
    // Calculate active products count based on selected department
    const activeProductsCount = useMemo(() => {
        return allTracked.filter(p => {
            // Check if product is active
            const isActive = p.status === "In Production" || p.status === "in_progress";
            if (!isActive)
                return false;
            // Check department
            if (selectedDepartment === "ALLES")
                return true;
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
                if (orderStatusFilter === "active")
                    return ['in_production', 'in_progress'].includes(o.status);
                if (orderStatusFilter === "completed")
                    return o.status === 'completed';
                if (orderStatusFilter === "defect")
                    return o.defectCount > 0;
                if (orderStatusFilter === "temp_reject")
                    return o.status === 'temp_reject' || o.status === 'rejected';
                return true;
            });
        }
        // Search filter
        if (planningSearchTerm) {
            const term = planningSearchTerm.toLowerCase();
            orders = orders.filter(o => o.orderId?.toLowerCase().includes(term) ||
                o.item?.toLowerCase().includes(term) ||
                o.itemCode?.toLowerCase().includes(term) ||
                o.machine?.toLowerCase().includes(term));
        }
        return orders.sort((a, b) => {
            // Prioritize active orders
            const aActive = ['in_production', 'in_progress'].includes(a.status);
            const bActive = ['in_production', 'in_progress'].includes(b.status);
            if (aActive && !bActive)
                return -1;
            if (!aActive && bActive)
                return 1;
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
        await logActivity(user?.uid, "DOWNTIME_RESOLVE", `Downtime melding opgelost via mobile app: ${downtimeId}`);
    };
    // Resolve defect
    const resolveDefect = async (defectId) => {
        await resolveShopFloorIssue({
            type: "defect",
            issueId: defectId,
        });
        await logActivity(user?.uid, "DEFECT_RESOLVE", `Defect melding opgelost via mobile app: ${defectId}`);
    };
    const handleScan = (rawCode) => {
        if (!rawCode)
            return;
        const scannedCode = rawCode.trim();
        const lowerCode = scannedCode.toLowerCase();
        // Search in tracked products
        const product = allTracked.find(p => (p.lotNumber && p.lotNumber.toLowerCase() === lowerCode) ||
            (p.orderId && p.orderId.toLowerCase() === lowerCode) ||
            p.id === scannedCode);
        // Search in orders
        const order = allOrders.find(o => (o.orderId && o.orderId.toLowerCase() === lowerCode) ||
            (o.item && o.item.toLowerCase() === lowerCode) ||
            (o.itemCode && o.itemCode.toLowerCase() === lowerCode) ||
            (o.extraCode && o.extraCode.toLowerCase() === lowerCode) ||
            o.id === scannedCode);
        // Search in personnel
        const person = allPersonnel.find(p => (p.employeeNumber && p.employeeNumber.toLowerCase() === lowerCode) ||
            p.id === scannedCode);
        if (product) {
            setScanResult({
                type: "product",
                data: product,
                code: scannedCode
            });
        }
        else if (order) {
            setScanResult({
                type: "order",
                data: order,
                code: scannedCode,
                onClick: () => setSelectedOrder(order) // Allow clicking to open details
            });
        }
        else if (person) {
            setScanResult({
                type: "personnel",
                data: person,
                code: scannedCode
            });
        }
        else {
            setScanResult({
                type: "unknown",
                code: scannedCode
            });
        }
    };
    // Mark product as ready for next step
    const markReadyForNextStep = async (product) => {
        if (!product || !product.id)
            return;
        try {
            await markReadyForNextStepCallable({
                productId: product.id,
            });
            await logActivity(user?.uid, "READY_FOR_NEXT_STEP", `Product ${product.lotNumber} gereed voor volgende stap gemarkeerd door ${user?.displayName || 'Inspector'}`);
            notify(`✅ ${product.lotNumber} gereed voor volgende stap`);
            setReadyForNextStepMode(null);
            setScanResult(null);
        }
        catch (err) {
            console.error("Fout bij gereed markeren:", err);
            notify("Fout bij gereed markeren");
        }
    };
    const closeScanner = () => {
        setShowScanner(false);
        setScanResult(null);
    };
    if (!user) {
        return (_jsx("div", { className: "min-h-screen bg-slate-900 flex items-center justify-center p-6", children: _jsxs("div", { className: "text-center text-white", children: [_jsx(AlertTriangle, { className: "mx-auto mb-4 text-amber-500", size: 48 }), _jsx("div", { className: "text-xl font-bold mb-2", children: t("planning.shopFloor.notLoggedIn", "Niet ingelogd") }), _jsx("div", { className: "text-sm text-slate-400", children: t("planning.shopFloor.loginToAccess", "Log in om toegang te krijgen") })] }) }));
    }
    const submitIssue = async () => {
        if (!scanResult?.data || !issueType)
            return;
        try {
            await reportShopFloorIssue({
                type: issueType,
                machine: scanResult.data.machine || t("planning.shopFloor.unknown", "Onbekend"),
                orderId: scanResult.data.orderId || scanResult.data.id || null,
                lotNumber: scanResult.data.lotNumber || null,
                description: issueDescription || "",
                operatorName: user.displayName || t("planning.shopFloor.operator", "Operator"),
            });
            await logActivity(user?.uid, "MESSAGE_SEND", `Teamleader-alert verzonden vanuit mobile app (${issueType}) voor machine ${scanResult.data.machine || t("planning.shopFloor.unknown", "Onbekend")}`);
            setShowIssueModal(false);
            setIssueDescription("");
            setIssueType(null);
            notify(t("planning.shopFloor.issueSent", "Melding succesvol verstuurd"));
        }
        catch (error) {
            console.error("Error reporting issue:", error);
            notify(t("planning.shopFloor.issueSendError", "Fout bij versturen melding."));
        }
    };
    // OPERATOR VIEW (Simplified)
    if (role === "operator") {
        return (_jsxs("div", { className: "h-[100dvh] bg-slate-50 flex flex-col overflow-hidden", children: [_jsxs("div", { className: "bg-white p-4 shadow-sm flex justify-between items-center z-10", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "bg-blue-600 p-2 rounded-lg text-white", children: _jsx(ScanLine, { size: 20 }) }), _jsxs("div", { children: [_jsx("h1", { className: "font-black text-lg text-slate-800 leading-none", children: "Operator" }), _jsx("p", { className: "text-[10px] font-bold text-slate-400 uppercase", children: t("planning.shopFloor.scanner", "Scanner") })] })] }), _jsx("div", { className: "bg-slate-100 px-3 py-1 rounded-full text-xs font-bold text-slate-600", children: user?.displayName?.split(' ')[0] || t("planning.shopFloor.operatorShort", "Op") })] }), _jsxs("div", { className: "flex-1 p-4 flex flex-col overflow-y-auto custom-scrollbar", children: [scanResult ? (_jsxs("div", { className: "flex-1 bg-white rounded-3xl shadow-sm border border-slate-200 p-6 flex flex-col items-center text-center animate-in zoom-in duration-300", children: [_jsxs("div", { className: "mb-6", children: [scanResult.type === 'product' && _jsx(Package, { size: 64, className: "text-emerald-500" }), scanResult.type === 'order' && _jsx(ClipboardCheck, { size: 64, className: "text-blue-500" }), scanResult.type === 'personnel' && _jsx(UserCheck, { size: 64, className: "text-purple-500" }), scanResult.type === 'unknown' && _jsx(AlertTriangle, { size: 64, className: "text-amber-500" })] }), _jsx("h2", { className: "text-2xl font-black text-slate-800 mb-2", children: scanResult.type === 'product' ? t("planning.shopFloor.productFound", "Product Gevonden") :
                                        scanResult.type === 'order' ? t("planning.shopFloor.orderFound", "Order Gevonden") :
                                            scanResult.type === 'personnel' ? t("planning.shopFloor.personnel", "Personeel") : t("planning.shopFloor.notFound", "Niet Gevonden") }), _jsx("div", { className: "w-full bg-slate-50 rounded-xl p-4 mb-6 text-left space-y-3", children: scanResult.data ? (_jsxs(_Fragment, { children: [scanResult.data.lotNumber && (_jsxs("div", { children: [_jsx("span", { className: "text-[10px] font-bold text-slate-400 uppercase block", children: "Lotnummer" }), _jsx("span", { className: "text-[10px] font-bold text-slate-400 uppercase block", children: t("planning.shopFloor.lotNumber", "Lotnummer") }), _jsx("span", { className: "text-lg font-bold text-slate-900", children: scanResult.data.lotNumber })] })), (scanResult.data.orderId || scanResult.data.id) && (_jsxs("div", { children: [_jsx("span", { className: "text-[10px] font-bold text-slate-400 uppercase block", children: t("planning.shopFloor.idOrder", "ID / Order") }), _jsx("span", { className: "text-base font-bold text-slate-900", children: scanResult.data.orderId || scanResult.data.id })] })), scanResult.data.status && (_jsxs("div", { children: [_jsx("span", { className: "text-[10px] font-bold text-slate-400 uppercase block", children: t("planning.shopFloor.status", "Status") }), _jsx("span", { className: "inline-block px-2 py-1 bg-white rounded border border-slate-200 text-sm font-bold text-slate-700 mt-1", children: scanResult.data.status })] }))] })) : (_jsxs("p", { className: "text-slate-500 font-medium", children: [t("planning.shopFloor.noDataForCode", "Geen gegevens gevonden voor code:"), " ", _jsx("span", { className: "font-mono font-bold", children: scanResult.code })] })) }), scanResult.type !== 'personnel' && (_jsxs("div", { className: "grid grid-cols-2 gap-3 mb-4 w-full", children: [_jsxs("button", { onClick: () => {
                                                setIssueType('defect');
                                                setShowIssueModal(true);
                                            }, className: "py-4 bg-red-50 text-red-600 rounded-2xl font-bold text-xs uppercase flex flex-col items-center justify-center gap-2 border-2 border-red-100 active:scale-95 transition-all", children: [_jsx(AlertTriangle, { size: 24 }), t("planning.shopFloor.defect", "Defect")] }), _jsxs("button", { onClick: () => {
                                                setIssueType('downtime');
                                                setShowIssueModal(true);
                                            }, className: "py-4 bg-orange-50 text-orange-600 rounded-2xl font-bold text-xs uppercase flex flex-col items-center justify-center gap-2 border-2 border-orange-100 active:scale-95 transition-all", children: [_jsx(Clock, { size: 24 }), t("planning.shopFloor.downtime", "Stilstand")] })] })), _jsx("button", { onClick: closeScanner, className: "w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all", children: t("planning.shopFloor.nextScan", "Volgende Scan") })] })) : showScanner ? (_jsx(MobileScanner, { onScan: handleScan, onClose: () => setShowScanner(false) })) : (_jsxs("div", { className: "flex-1 flex flex-col gap-4 justify-center", children: [_jsxs("button", { onClick: () => setShowScanner(true), className: "flex-1 bg-blue-600 text-white rounded-[2rem] shadow-xl shadow-blue-200 flex flex-col items-center justify-center gap-4 active:scale-95 transition-all hover:bg-blue-700", children: [_jsx("div", { className: "bg-white/20 p-6 rounded-full", children: _jsx(ScanLine, { size: 48 }) }), _jsx("span", { className: "text-2xl font-black uppercase tracking-widest", children: t("planning.shopFloor.scanQr", "Scan QR") })] }), _jsxs("div", { className: "bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200", children: [_jsx("label", { className: "text-xs font-bold text-slate-400 uppercase block mb-2", children: t("planning.shopFloor.orSearchManually", "Of zoek handmatig") }), _jsxs("form", { onSubmit: (e) => {
                                                e.preventDefault();
                                                if (operatorCode) {
                                                    handleScan(operatorCode);
                                                    setOperatorCode("");
                                                }
                                            }, className: "flex gap-2", children: [_jsx("input", { type: "text", value: operatorCode, onChange: (e) => setOperatorCode(e.target.value), className: "flex-1 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800 outline-none focus:border-blue-500 transition-all", placeholder: t("planning.shopFloor.enterCode", "Code invoeren...") }), _jsx("button", { type: "submit", className: "bg-slate-900 text-white px-6 rounded-xl font-bold", children: _jsx(ArrowRight, { size: 20 }) })] })] })] })), showIssueModal && (_jsx("div", { className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl", children: [_jsx("h3", { className: "text-xl font-black text-slate-800 mb-2", children: issueType === 'defect' ? t("planning.shopFloor.reportDefect", "Defect Melden") : t("planning.shopFloor.reportDowntime", "Stilstand Melden") }), _jsx("p", { className: "text-sm text-slate-500 mb-4", children: scanResult?.data?.lotNumber ? `${t("planning.shopFloor.lot", "Lot")}: ${scanResult.data.lotNumber}` : `${t("planning.shopFloor.item", "Item")}: ${scanResult?.data?.orderId || t("planning.shopFloor.unknown", "Onbekend")}` }), _jsx("textarea", { className: "w-full p-4 bg-slate-50 rounded-xl border-2 border-slate-100 font-bold text-slate-700 outline-none focus:border-blue-500 min-h-[120px] mb-4", placeholder: t("planning.shopFloor.describeProblem", "Beschrijf het probleem..."), value: issueDescription, onChange: (e) => setIssueDescription(e.target.value) }), _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { onClick: () => setShowIssueModal(false), className: "flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold uppercase text-xs", children: t("planning.shopFloor.cancel", "Annuleren") }), _jsx("button", { onClick: submitIssue, className: `flex-1 py-3 text-white rounded-xl font-bold uppercase text-xs ${issueType === 'defect' ? 'bg-red-600' : 'bg-orange-500'}`, children: t("planning.shopFloor.send", "Versturen") })] })] }) }))] })] }));
    }
    const isDeptLocked = role === "teamleader";
    return (_jsxs("div", { className: "h-[100dvh] bg-slate-50 flex flex-col overflow-hidden relative", children: [showScanner && (scanResult ? (_jsx("div", { className: "fixed inset-0 z-[9999] bg-black", children: _jsxs("div", { className: "relative h-full", children: [_jsx("button", { onClick: closeScanner, className: "absolute top-4 right-4 z-10 p-3 bg-white rounded-full shadow-lg", children: _jsx(X, { size: 24, className: "text-slate-900" }) }), _jsx("div", { className: "absolute inset-0 flex items-center justify-center p-6 bg-black/90", children: _jsxs("div", { className: "bg-white rounded-3xl p-6 max-w-md w-full", children: [scanResult.type === "product" ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "text-center mb-4", children: [_jsx(CheckCircle, { className: "mx-auto text-emerald-500 mb-2", size: 48 }), _jsx("div", { className: "text-2xl font-black text-slate-800", children: t("planning.shopFloor.productFound", "Product Gevonden") })] }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { children: [_jsx("div", { className: "text-xs font-bold text-slate-500 uppercase mb-1", children: t("planning.shopFloor.lotNumber", "Lotnummer") }), _jsx("div", { className: "text-lg font-bold text-slate-900", children: scanResult.data.lotNumber })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-bold text-slate-500 uppercase mb-1", children: t("planning.shopFloor.order", "Order") }), _jsx("div", { className: "text-sm font-bold text-slate-700", children: scanResult.data.orderId })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-bold text-slate-500 uppercase mb-1", children: t("planning.shopFloor.machine", "Machine") }), _jsx("div", { className: "text-sm font-bold text-slate-700", children: scanResult.data.machine })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-bold text-slate-500 uppercase mb-1", children: t("planning.shopFloor.status", "Status") }), _jsx(StatusBadge, { status: scanResult.data.status })] })] }), (role === 'teamleader' || role === 'admin') && (_jsxs("button", { onClick: () => { setProductToMove(scanResult.data); closeScanner(); }, className: "w-full mt-2 py-3 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold transition-colors flex items-center justify-center gap-2", children: [_jsx(ArrowRightLeft, { size: 18 }), " ", t("planning.shopFloor.moveProduct", "Verplaats Product")] }))] })) : scanResult.type === "order" ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "text-center mb-4", children: [_jsx(CheckCircle, { className: "mx-auto text-blue-500 mb-2", size: 48 }), _jsx("div", { className: "text-2xl font-black text-slate-800", children: t("planning.shopFloor.orderFound", "Order Gevonden") })] }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { children: [_jsx("div", { className: "text-xs font-bold text-slate-500 uppercase mb-1", children: t("planning.shopFloor.orderId", "Order ID") }), _jsx("div", { className: "text-lg font-bold text-slate-900", children: scanResult.data.orderId })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-bold text-slate-500 uppercase mb-1", children: t("planning.shopFloor.item", "Item") }), _jsx("div", { className: "text-sm font-bold text-slate-700", children: scanResult.data.item })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-bold text-slate-500 uppercase mb-1", children: t("planning.shopFloor.machine", "Machine") }), _jsx("div", { className: "text-sm font-bold text-slate-700", children: scanResult.data.machine })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-bold text-slate-500 uppercase mb-1", children: t("planning.shopFloor.status", "Status") }), _jsx(StatusBadge, { status: scanResult.data.status })] })] }), _jsx("button", { onClick: () => { closeScanner(); setSelectedOrder(scanResult.data); }, className: "w-full mt-4 py-3 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-xl font-bold transition-colors", children: t("planning.shopFloor.viewDetails", "Bekijk Details") })] })) : scanResult.type === "personnel" ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "text-center mb-4", children: [_jsx(UserCheck, { className: "mx-auto text-purple-500 mb-2", size: 48 }), _jsx("div", { className: "text-2xl font-black text-slate-800", children: t("planning.shopFloor.personnel", "Personeel") })] }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { children: [_jsx("div", { className: "text-xs font-bold text-slate-500 uppercase mb-1", children: t("planning.shopFloor.name", "Naam") }), _jsx("div", { className: "text-lg font-bold text-slate-900", children: scanResult.data.name })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-bold text-slate-500 uppercase mb-1", children: t("planning.shopFloor.employeeNumber", "Personeelsnummer") }), _jsx("div", { className: "text-sm font-bold text-slate-700", children: scanResult.data.employeeNumber })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-bold text-slate-500 uppercase mb-1", children: t("planning.shopFloor.department", "Afdeling") }), _jsx("div", { className: "text-sm font-bold text-slate-700", children: scanResult.data.departmentId || t("planning.shopFloor.general", "Algemeen") })] })] })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "text-center mb-4", children: [_jsx(AlertTriangle, { className: "mx-auto text-amber-500 mb-2", size: 48 }), _jsx("div", { className: "text-2xl font-black text-slate-800", children: t("planning.shopFloor.notFound", "Niet Gevonden") })] }), _jsxs("div", { className: "text-center text-slate-600", children: [t("planning.shopFloor.codeNotFound", "Code"), " ", _jsx("span", { className: "font-mono font-bold", children: scanResult.code }), " ", t("planning.shopFloor.notFoundInSystem", "niet gevonden in systeem.")] })] })), _jsx("button", { onClick: closeScanner, className: "w-full mt-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors", children: t("planning.shopFloor.close", "Sluiten") })] }) })] }) })) : (_jsx(MobileScanner, { onScan: handleScan, onClose: closeScanner }))), selectedOrder && (_jsx("div", { className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-lg rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]", children: [_jsxs("div", { className: "p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-xl font-black text-slate-800 uppercase italic tracking-tighter", children: selectedOrder.orderId || selectedOrder.item }), _jsx("p", { className: "text-xs font-bold text-slate-500 uppercase tracking-widest", children: t("planning.shopFloor.orderDetails", "Order Details") })] }), _jsx("button", { onClick: () => setSelectedOrder(null), className: "p-2 hover:bg-slate-200 rounded-full transition-colors", children: _jsx(X, { size: 24, className: "text-slate-500" }) })] }), _jsxs("div", { className: "p-6 overflow-y-auto space-y-6", children: [_jsx("div", { className: "flex justify-center", children: _jsx(StatusBadge, { status: selectedOrder.status || "Gepland" }) }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "p-4 bg-slate-50 rounded-2xl border border-slate-100", children: [_jsx("div", { className: "text-[10px] font-black text-slate-400 uppercase mb-1", children: "Product" }), _jsx("div", { className: "text-[10px] font-black text-slate-400 uppercase mb-1", children: t("planning.shopFloor.product", "Product") }), _jsx("div", { className: "font-bold text-slate-800 text-sm", children: selectedOrder.itemCode || selectedOrder.item })] }), _jsxs("div", { className: "p-4 bg-slate-50 rounded-2xl border border-slate-100", children: [_jsx("div", { className: "text-[10px] font-black text-slate-400 uppercase mb-1", children: t("planning.shopFloor.quantity", "Aantal") }), _jsx("div", { className: "font-bold text-slate-800 text-sm", children: t("planning.shopFloor.quantityPieces", "{{count}} stuks", { count: selectedOrder.plan || 0 }) })] }), _jsxs("div", { className: "p-4 bg-slate-50 rounded-2xl border border-slate-100", children: [_jsx("div", { className: "text-[10px] font-black text-slate-400 uppercase mb-1", children: t("planning.shopFloor.machine", "Machine") }), _jsx("div", { className: "font-bold text-slate-800 text-sm", children: selectedOrder.machine || t("planning.shopFloor.notAssigned", "Niet toegewezen") })] }), _jsxs("div", { className: "p-4 bg-slate-50 rounded-2xl border border-slate-100", children: [_jsx("div", { className: "text-[10px] font-black text-slate-400 uppercase mb-1", children: t("planning.shopFloor.plannedDate", "Geplande Datum") }), _jsx("div", { className: "font-bold text-slate-800 text-sm", children: selectedOrder.plannedDate?.seconds
                                                        ? format(new Date(selectedOrder.plannedDate.seconds * 1000), 'dd MMM yyyy', { locale: nl })
                                                        : t("planning.shopFloor.notPlanned", "Niet gepland") })] })] }), selectedOrder.notes && (_jsxs("div", { className: "p-4 bg-yellow-50 rounded-2xl border border-yellow-100", children: [_jsxs("div", { className: "text-[10px] font-black text-yellow-600 uppercase mb-1 flex items-center gap-2", children: [_jsx(Info, { size: 12 }), " ", t("planning.shopFloor.notes", "Notities")] }), _jsxs("p", { className: "text-sm text-yellow-800 italic", children: ["\"", selectedOrder.notes, "\""] })] })), selectedOrderProducts.length > 0 && (_jsxs("div", { className: "mt-6 pt-6 border-t border-slate-100", children: [_jsxs("h4", { className: "text-xs font-black text-slate-400 uppercase tracking-widest mb-3", children: ["Producten (", selectedOrderProducts.length, ")"] }), _jsx("h4", { className: "text-xs font-black text-slate-400 uppercase tracking-widest mb-3", children: t("planning.shopFloor.productsCount", "Producten ({{count}})", { count: selectedOrderProducts.length }) }), _jsx("div", { className: "space-y-2", children: selectedOrderProducts.map(p => (_jsxs("div", { className: "bg-slate-50 p-3 rounded-xl flex justify-between items-center border border-slate-100", children: [_jsxs("div", { children: [_jsx("div", { className: "font-bold text-sm text-slate-800", children: p.lotNumber }), _jsxs("div", { className: "text-xs text-slate-500", children: [p.currentStation, " \u2022 ", p.status] })] }), _jsx("button", { onClick: () => setProductToMove(p), className: "p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-blue-600 shadow-sm", children: _jsx(ArrowRightLeft, { size: 16 }) })] }, p.id))) })] }))] }), _jsx("div", { className: "p-4 border-t border-slate-100 bg-slate-50/50", children: _jsx("button", { onClick: () => setSelectedOrder(null), className: "w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-800 transition-all", children: t("planning.shopFloor.close", "Sluiten") }) })] }) })), _jsxs("div", { ref: scrollContainerRef, onScroll: handleContainerScroll, className: "flex-1 overflow-y-auto custom-scrollbar pb-24", children: [_jsxs("div", { className: `bg-gradient-to-br from-slate-900 via-indigo-800 to-cyan-700 shadow-lg sticky top-0 z-30 transition-all duration-300 ${isHeaderCollapsed ? "px-3 py-2" : "px-4 py-4"}`, children: [_jsxs("div", { className: `flex items-center justify-between ${isHeaderCollapsed ? "mb-0" : "mb-4"}`, children: [_jsxs("div", { children: [_jsx("div", { className: `text-white font-black transition-all duration-300 ${isHeaderCollapsed ? "text-lg" : "text-2xl"}`, children: t("planning.shopFloor.mobileInspector", "Mobile Inspector") }), _jsx("div", { className: `text-indigo-200 font-bold mt-1 transition-all duration-300 overflow-hidden ${isHeaderCollapsed ? "text-[0px] max-h-0 opacity-0 mt-0" : "text-sm max-h-10 opacity-100"}`, children: activeView === "planning"
                                                    ? "Planning, afkeur en doorstroom in je broekzak"
                                                    : t("planning.shopFloor.floorOverview", "Werkvloer Overzicht") })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => setShowScanner(true), className: `bg-white/20 hover:bg-white/30 rounded-xl transition-colors ${isHeaderCollapsed ? "p-2" : "p-3"}`, children: _jsx(ScanLine, { className: "text-white", size: isHeaderCollapsed ? 18 : 24 }) }), _jsx("div", { className: `bg-white/20 px-4 py-2 rounded-xl transition-all duration-300 overflow-hidden ${isHeaderCollapsed ? "max-w-0 opacity-0 px-0 py-0" : "max-w-32 opacity-100"}`, children: _jsx("div", { className: "text-white text-xs font-bold", children: user?.displayName?.split(' ')[0] || 'Inspector' }) })] })] }), _jsxs("div", { className: `grid grid-cols-2 gap-2 overflow-hidden transition-all duration-300 ${isHeaderCollapsed ? "max-h-0 opacity-0 mt-0 pointer-events-none" : "max-h-[220px] opacity-100 mt-3"}`, children: [_jsxs("button", { onClick: () => setActiveView("planning"), className: "bg-white/10 text-left backdrop-blur-sm rounded-2xl p-2.5 border border-white/10", children: [_jsx("div", { className: "text-white/60 text-[10px] font-bold uppercase mb-1", children: "Alle orders" }), _jsx("div", { className: "text-white text-xl font-black", children: planningSummary.totalOrders }), _jsx("div", { className: "text-[10px] text-white/50 font-bold mt-1", children: "Afdeling / machinefilter actief" })] }), _jsxs("button", { onClick: () => {
                                            setActiveView("planning");
                                            setOrderStatusFilter("active");
                                        }, className: "bg-white/10 text-left backdrop-blur-sm rounded-2xl p-2.5 border border-white/10", children: [_jsx("div", { className: "text-white/60 text-[10px] font-bold uppercase mb-1", children: "Lopende orders" }), _jsx("div", { className: "text-white text-xl font-black", children: planningSummary.activeOrders }), _jsx("div", { className: "text-[10px] text-white/50 font-bold mt-1", children: "In productie of in voortgang" })] }), _jsxs("button", { onClick: () => {
                                            setActiveView("planning");
                                            setOrderStatusFilter("temp_reject");
                                        }, className: "bg-amber-500/20 text-left backdrop-blur-sm rounded-2xl p-2.5 border border-amber-300/20", children: [_jsx("div", { className: "text-amber-100 text-[10px] font-bold uppercase mb-1", children: "Tijdelijke afkeur" }), _jsx("div", { className: "text-white text-xl font-black", children: planningSummary.temporaryRejectedOrders }), _jsx("div", { className: "text-[10px] text-amber-100/80 font-bold mt-1", children: "Orders met herstel of tijdelijke blokkade" })] }), _jsxs("button", { onClick: () => setActiveView("quality"), className: "bg-rose-500/20 text-left backdrop-blur-sm rounded-2xl p-2.5 border border-rose-300/20", children: [_jsx("div", { className: "text-rose-100 text-[10px] font-bold uppercase mb-1", children: "Definitieve afkeur" }), _jsx("div", { className: "text-white text-xl font-black", children: planningSummary.finalRejectedOrders }), _jsx("div", { className: "text-[10px] text-rose-100/80 font-bold mt-1", children: "Definitief afgekeurde orders" })] })] })] }), _jsx("div", { className: "bg-white border-b border-slate-200 shadow-sm", children: _jsxs("div", { className: "p-4 space-y-3", children: [_jsx("div", { children: isDeptLocked ? (_jsxs("div", { className: "flex items-center gap-2 px-4 py-3 bg-slate-100 rounded-xl text-slate-600 font-bold text-sm w-full border border-slate-200", children: [_jsx(Building2, { size: 16 }), selectedDepartment, _jsx("span", { className: "text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-500 ml-auto uppercase tracking-wider", children: t("planning.shopFloor.assigned", "Toegewezen") })] })) : (_jsxs("div", { className: "relative w-full", children: [_jsx(Building2, { className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400", size: 16 }), _jsx("select", { value: selectedDepartment, onChange: (e) => setSelectedDepartment(e.target.value), className: "w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all appearance-none", children: departments.map(dept => (_jsx("option", { value: dept, children: dept }, dept))) })] })) }), activeView === "overview" && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "relative", children: [_jsx(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400", size: 18 }), _jsx("input", { type: "text", placeholder: t("planning.shopFloor.searchPlaceholder", "Zoek machine, operator, order..."), className: "w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value) })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { onClick: () => setFilterStatus("all"), className: `flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all ${filterStatus === "all"
                                                        ? "bg-indigo-600 text-white"
                                                        : "bg-slate-100 text-slate-600"}`, children: ["Alle (", machineStats.length, ")"] }), _jsxs("button", { onClick: () => setFilterStatus("active"), className: `flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all ${filterStatus === "active"
                                                        ? "bg-emerald-600 text-white"
                                                        : "bg-slate-100 text-slate-600"}`, children: ["Actief (", issuesSummary.activeMachines, ")"] }), _jsxs("button", { onClick: () => setFilterStatus("issues"), className: `flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all ${filterStatus === "issues"
                                                        ? "bg-red-600 text-white"
                                                        : "bg-slate-100 text-slate-600"}`, children: ["Issues (", issuesSummary.machinesWithIssues, ")"] })] })] })), _jsxs("div", { className: "flex gap-2 overflow-x-auto custom-scrollbar", children: [_jsx("button", { onClick: () => setActiveView("planning"), className: `px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${activeView === "planning"
                                                ? "bg-indigo-100 text-indigo-700"
                                                : "text-slate-500 hover:bg-slate-50"}`, children: "\uD83D\uDCCB Planning" }), _jsx("button", { onClick: () => setActiveView("overview"), className: `px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${activeView === "overview"
                                                ? "bg-indigo-100 text-indigo-700"
                                                : "text-slate-500 hover:bg-slate-50"}`, children: "\uD83D\uDD27 Machines" }), _jsxs("button", { onClick: () => setActiveView("downtime"), className: `px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${activeView === "downtime"
                                                ? "bg-orange-100 text-orange-700"
                                                : "text-slate-500 hover:bg-slate-50"}`, children: ["\u23F8\uFE0F Stilstand ", issuesSummary.totalDowntime > 0 && (_jsx("span", { className: "bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full", children: issuesSummary.totalDowntime }))] }), _jsxs("button", { onClick: () => setActiveView("quality"), className: `px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${activeView === "quality"
                                                ? "bg-red-100 text-red-700"
                                                : "text-slate-500 hover:bg-slate-50"}`, children: ["\uD83D\uDEA9 QC ", issuesSummary.totalDefects > 0 && (_jsx("span", { className: "bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full", children: issuesSummary.totalDefects }))] })] })] }) }), _jsxs("div", { className: "p-4 space-y-3", children: [activeView === "planning" && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-sm", children: [_jsxs("div", { className: "relative", children: [_jsx(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400", size: 18 }), _jsx("input", { type: "text", placeholder: "Zoek order ID, item code, machine...", className: "w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all", value: planningSearchTerm, onChange: (e) => setPlanningSearchTerm(e.target.value) })] }), _jsx("div", { className: "flex gap-2 flex-wrap", children: [
                                                    { label: "Alle", value: "all" },
                                                    { label: "🟢 Actief", value: "active" },
                                                    { label: "✅ Gereed", value: "completed" },
                                                    { label: "🚩 Afkeur", value: "defect" },
                                                    { label: "❌ Geweigerd", value: "temp_reject" }
                                                ].map(filter => (_jsx("button", { onClick: () => setOrderStatusFilter(filter.value), className: `px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${orderStatusFilter === filter.value
                                                        ? "bg-indigo-600 text-white"
                                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`, children: filter.label }, filter.value))) })] }), getDashboardOrders.length === 0 ? (_jsxs("div", { className: "text-center py-12 text-slate-400", children: [_jsx(Package, { size: 48, className: "mx-auto mb-4 opacity-30" }), _jsx("div", { className: "font-bold text-sm", children: "Geen orders gevonden" })] })) : (_jsx("div", { className: "space-y-3", children: getDashboardOrders.map(order => (_jsx(PlanningOrderCard, { order: order, onSelectOrder: () => setSelectedOrder(order), onScanReady: () => setReadyForNextStepMode(order.id), t: t }, order.id))) }))] })), activeView === "overview" && (_jsx(_Fragment, { children: filteredMachines.length === 0 ? (_jsxs("div", { className: "text-center py-12 text-slate-400", children: [_jsx(Filter, { size: 48, className: "mx-auto mb-4 opacity-30" }), _jsx("div", { className: "font-bold text-sm", children: t("planning.shopFloor.noMachinesFound", "Geen machines gevonden") })] })) : (filteredMachines.map(machine => (_jsxs("div", { onClick: () => {
                                        // Teamleaders/Planners: open detailed machine view
                                        if (['teamleader', 'planner', 'admin'].includes(role)) {
                                            setSelectedMachineDetail(machine);
                                        }
                                        else {
                                            // Fallback for others
                                            setSelectedMachineFilter(machine.machine);
                                            setActiveView("orders");
                                        }
                                    }, className: `bg-white rounded-2xl border-2 p-4 transition-all cursor-pointer ${machine.hasIssues
                                        ? "border-red-200 shadow-lg"
                                        : machine.isActive
                                            ? "border-emerald-200"
                                            : "border-slate-100 hover:border-blue-300"}`, children: [_jsxs("div", { className: "flex items-start justify-between mb-3", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx(MapPin, { size: 16, className: "text-indigo-600" }), _jsx("div", { className: "text-lg font-black text-slate-800", children: machine.machine })] }), _jsxs("div", { className: "flex items-center gap-1.5 text-sm text-slate-600 font-bold", children: [_jsx(UserCheck, { size: 14, className: machine.operatorName ? "text-emerald-600" : "text-slate-300" }), _jsxs("span", { className: machine.operatorName ? "text-slate-800" : "text-slate-400 italic", children: [machine.operatorName || "Geen operator", machine.operatorName || t("planning.shopFloor.noOperator", "Geen operator")] })] })] }), _jsx("div", { className: `px-3 py-1 rounded-lg text-xs font-bold ${machine.status === "issue"
                                                        ? "bg-red-100 text-red-700"
                                                        : machine.status === "active"
                                                            ? "bg-emerald-100 text-emerald-700"
                                                            : "bg-slate-100 text-slate-600"}`, children: machine.status === "issue" ? t("planning.shopFloor.issueStatus", "🔴 Issue") : machine.status === "active" ? t("planning.shopFloor.activeStatus", "🟢 Actief") : t("planning.shopFloor.idleStatus", "⚪ Idle") })] }), machine.activeOrder && (_jsxs("div", { className: "bg-blue-50 rounded-xl p-3 mb-3 cursor-pointer hover:bg-blue-100 transition-colors", onClick: (e) => {
                                                e.stopPropagation(); // Voorkom dat de kaart-klik ook afgaat
                                                setSelectedOrder(machine.activeOrder);
                                            }, children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx(PlayCircle, { size: 14, className: "text-blue-600" }), _jsx("div", { className: "text-xs font-bold text-blue-900", children: t("planning.shopFloor.inProduction", "In Productie") })] }), _jsx("div", { className: "text-sm font-black text-slate-800", children: machine.activeOrder.orderId || machine.activeOrder.item }), machine.activeOrder.plan && (_jsx("div", { className: "text-xs text-slate-600 mt-1", children: t("planning.shopFloor.quantityPieces", "{{count}} stuks", { count: machine.activeOrder.plan }) }))] })), machine.hasIssues && (_jsxs("div", { className: "space-y-2", children: [machine.downtimeCount > 0 && (_jsxs("div", { className: "flex items-center gap-2 text-orange-700 bg-orange-50 px-3 py-2 rounded-lg", children: [_jsx(XCircle, { size: 16 }), _jsx("span", { className: "text-xs font-bold", children: t("planning.shopFloor.downtimeReports", "{{count}} stilstand meldingen", { count: machine.downtimeCount }) })] })), machine.defectCount > 0 && (_jsxs("div", { className: "flex items-center gap-2 text-red-700 bg-red-50 px-3 py-2 rounded-lg", children: [_jsx(AlertTriangle, { size: 16 }), _jsx("span", { className: "text-xs font-bold", children: t("planning.shopFloor.qualityIssues", "{{count}} kwaliteit issues", { count: machine.defectCount }) })] }))] })), _jsxs("div", { className: "flex items-center gap-4 mt-3 pt-3 border-t border-slate-100", children: [_jsxs("button", { onClick: () => {
                                                        setSelectedMachineFilter(machine.machine);
                                                        setActiveView("orders");
                                                    }, className: "flex items-center gap-1 text-slate-600 hover:text-blue-600 transition-colors", children: [_jsx(Package, { size: 14 }), _jsx("span", { className: "text-xs font-bold", children: t("planning.shopFloor.ordersCount", "{{count}} orders", { count: machine.ordersCount }) })] }), _jsxs("div", { className: "flex items-center gap-1 text-slate-600", children: [_jsx(Activity, { size: 14 }), _jsx("span", { className: "text-xs font-bold", children: t("planning.shopFloor.activeCount", "{{count}} actief", { count: machine.activeProductsCount }) })] }), machine.hoursPerWeek && (_jsxs("div", { className: "flex items-center gap-1 text-slate-600", children: [_jsx(Clock, { size: 14 }), _jsxs("span", { className: "text-xs font-bold", children: [machine.hoursPerWeek, "h/week"] })] }))] })] }, machine.id)))) })), activeView === "downtime" && (_jsx(_Fragment, { children: downtimeReports.filter(d => d.status === "active").length === 0 ? (_jsxs("div", { className: "text-center py-12 text-slate-400", children: [_jsx(CheckCircle, { size: 48, className: "mx-auto mb-4 text-emerald-300" }), _jsx("div", { className: "font-bold text-sm", children: "Geen actieve stilstand meldingen" })] })) : (downtimeReports
                                    .filter(d => d.status === "active")
                                    .map(downtime => (_jsxs("div", { className: "bg-white rounded-2xl border-2 border-orange-200 p-4", children: [_jsxs("div", { className: "flex items-start justify-between mb-3", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx(XCircle, { className: "text-orange-600", size: 20 }), _jsx("div", { className: "text-lg font-black text-slate-800", children: downtime.machine })] }), _jsx("div", { className: "text-sm text-slate-600 font-bold", children: downtime.reason })] }), _jsxs("div", { className: "px-3 py-1 rounded-lg text-xs font-bold bg-orange-100 text-orange-700", children: [downtime.estimatedMinutes || "?", " min"] })] }), _jsxs("div", { className: "text-xs text-slate-500 mb-3", children: ["Gemeld door: ", downtime.operatorName || "Onbekend"] }), _jsx("button", { onClick: () => resolveDowntime(downtime.id), className: "w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition-colors", children: "\u2705 Opgelost" })] }, downtime.id)))) })), activeView === "quality" && (_jsx(_Fragment, { children: defectReports.filter(d => d.status === "open").length === 0 ? (_jsxs("div", { className: "text-center py-12 text-slate-400", children: [_jsx(CheckCircle, { size: 48, className: "mx-auto mb-4 text-emerald-300" }), _jsx("div", { className: "font-bold text-sm", children: "Geen openstaande QC issues" })] })) : (defectReports
                                    .filter(d => d.status === "open")
                                    .map(defect => (_jsxs("div", { className: "bg-white rounded-2xl border-2 border-red-200 p-4", children: [_jsxs("div", { className: "flex items-start justify-between mb-3", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx(AlertTriangle, { className: "text-red-600", size: 20 }), _jsx("div", { className: "text-lg font-black text-slate-800", children: defect.machine })] }), _jsx("div", { className: "text-sm text-slate-600 font-bold", children: defect.defectType })] }), _jsx("div", { className: `px-3 py-1 rounded-lg text-xs font-bold ${defect.severity === "high"
                                                        ? "bg-red-500 text-white"
                                                        : defect.severity === "medium"
                                                            ? "bg-orange-100 text-orange-700"
                                                            : "bg-yellow-100 text-yellow-700"}`, children: defect.severity || "medium" })] }), defect.description && (_jsx("div", { className: "bg-slate-50 rounded-lg p-3 mb-3 text-sm text-slate-700", children: defect.description })), _jsxs("div", { className: "text-xs text-slate-500 mb-3", children: ["Order: ", defect.orderId || "Onbekend", " \u2022 Gemeld door: ", defect.operatorName || "Onbekend"] }), _jsx("button", { onClick: () => resolveDefect(defect.id), className: "w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition-colors", children: "\u2705 Opgelost" })] }, defect.id)))) })), activeView === "orders" && (_jsxs(_Fragment, { children: [selectedMachineFilter && (_jsxs("div", { className: "flex items-center justify-between bg-blue-50 p-3 rounded-xl mb-3 border border-blue-100 animate-in fade-in slide-in-from-top-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Filter, { size: 16, className: "text-blue-600" }), _jsxs("span", { className: "text-sm font-bold text-blue-800", children: ["Machine: ", selectedMachineFilter] })] }), _jsx("button", { onClick: () => setSelectedMachineFilter(null), className: "p-1 bg-white rounded-lg text-blue-600 hover:bg-blue-100 transition-colors", children: _jsx(X, { size: 16 }) })] })), filteredOrders.filter(o => ["in_production", "in_progress", "planned", "delegated", "pending"].includes(o.status)).length === 0 ? (_jsxs("div", { className: "text-center py-12 text-slate-400", children: [_jsx(Package, { size: 48, className: "mx-auto mb-4 opacity-30" }), _jsx("div", { className: "font-bold text-sm", children: "Geen actieve orders" })] })) : (filteredOrders
                                        .filter(o => ["in_production", "in_progress", "planned", "delegated", "pending"].includes(o.status))
                                        .sort((a, b) => {
                                        const isActiveA = a.status === "in_production" || a.status === "in_progress";
                                        const isActiveB = b.status === "in_production" || b.status === "in_progress";
                                        if (isActiveA && !isActiveB)
                                            return -1;
                                        if (!isActiveA && isActiveB)
                                            return 1;
                                        return 0;
                                    })
                                        .map(order => (_jsxs("div", { className: "bg-white rounded-2xl border-2 border-slate-200 p-4 cursor-pointer hover:border-indigo-300 transition-all active:scale-95", onClick: () => setSelectedOrder(order), children: [_jsxs("div", { className: "flex items-start justify-between mb-2", children: [_jsxs("div", { children: [_jsx("div", { className: "text-lg font-black text-slate-800", children: order.orderId || order.item }), _jsx("div", { className: "text-sm text-slate-600", children: order.itemCode })] }), _jsx(StatusBadge, { status: order.status })] }), _jsxs("div", { className: "flex items-center gap-4 text-sm text-slate-600", children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx(MapPin, { size: 14 }), _jsx("span", { className: "font-bold", children: order.machine })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx(Package, { size: 14 }), _jsxs("span", { className: "font-bold", children: [order.plan, " stuks"] })] }), order.estimatedHours && (_jsxs("div", { className: "flex items-center gap-1", children: [_jsx(Clock, { size: 14 }), _jsxs("span", { className: "font-bold", children: [order.estimatedHours, "h"] })] }))] })] }, order.id))))] }))] })] }), _jsxs("div", { className: "fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 grid grid-cols-4 gap-2 shadow-lg z-20", children: [_jsxs("button", { onClick: () => setActiveView("planning"), className: `flex flex-col items-center gap-1 px-2 py-2 rounded-xl transition-colors ${activeView === "planning"
                            ? "bg-indigo-50 text-indigo-600"
                            : "text-slate-400"}`, children: [_jsx(ClipboardCheck, { size: 20 }), _jsx("span", { className: "text-[10px] font-bold", children: "Planning" })] }), _jsxs("button", { onClick: () => setActiveView("overview"), className: `flex flex-col items-center gap-1 px-2 py-2 rounded-xl transition-colors ${activeView === "overview"
                            ? "bg-indigo-50 text-indigo-600"
                            : "text-slate-400"}`, children: [_jsx(Eye, { size: 22 }), _jsx("span", { className: "text-[10px] font-bold", children: "Machines" })] }), _jsxs("button", { onClick: () => setActiveView("downtime"), className: `flex flex-col items-center gap-1 px-2 py-2 rounded-xl transition-colors relative ${activeView === "downtime"
                            ? "bg-orange-50 text-orange-600"
                            : "text-slate-400"}`, children: [issuesSummary.totalDowntime > 0 && (_jsx("div", { className: "absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center", children: issuesSummary.totalDowntime })), _jsx(XCircle, { size: 22 }), _jsx("span", { className: "text-[10px] font-bold", children: "Stilstand" })] }), _jsxs("button", { onClick: () => setActiveView("quality"), className: `flex flex-col items-center gap-1 px-2 py-2 rounded-xl transition-colors relative ${activeView === "quality"
                            ? "bg-red-50 text-red-600"
                            : "text-slate-400"}`, children: [issuesSummary.totalDefects > 0 && (_jsx("div", { className: "absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center", children: issuesSummary.totalDefects })), _jsx(AlertTriangle, { size: 22 }), _jsx("span", { className: "text-[10px] font-bold", children: "QC" })] })] }), productToMove && (_jsx(ProductMoveModal, { product: productToMove, onClose: () => setProductToMove(null), onMove: handleMoveLot, allowedStations: factoryStations, currentDepartment: selectedDepartment !== "ALLES" ? selectedDepartment : null })), selectedMachineDetail && ['teamleader', 'planner', 'admin'].includes(role) && (_jsx(MachineDetailModal, { machine: selectedMachineDetail, orders: getOrdersForMachine(selectedMachineDetail.machine), onClose: () => setSelectedMachineDetail(null), onProductSelect: setSelectedProduct, onProductMove: setProductToMove, onRepairMode: setRepairMode, logActivity: logActivity, user: user, t: t })), selectedProduct && (_jsx(ProductDossierModal, { product: selectedProduct, onClose: () => setSelectedProduct(null), onMove: () => {
                    setProductToMove(selectedProduct);
                    setSelectedProduct(null);
                }, onRepair: () => {
                    setRepairMode(selectedProduct.id);
                    setSelectedProduct(null);
                }, t: t })), repairMode && (_jsx(RepairModal, { productId: repairMode, product: allTracked.find(p => p.id === repairMode), onClose: () => setRepairMode(null), onSubmit: async (repairData) => {
                    try {
                        await startTrackedProductRepair({
                            productId: repairMode,
                            repairReason: repairData.reason,
                        });
                        await logActivity(user?.uid, "REPAIR_START", `Reparatie gestart voor product ${repairMode} door ${user?.displayName || 'TeamLeader'}`);
                        notify("Reparatie gestart");
                        setRepairMode(null);
                    }
                    catch (err) {
                        console.error("Error starting repair:", err);
                        notify("Fout bij starten reparatie");
                    }
                }, t: t })), readyForNextStepMode && (_jsx(ReadyForNextStepModal, { orderId: readyForNextStepMode, order: allOrders.find(o => o.id === readyForNextStepMode), products: allTracked.filter(p => p.orderId === allOrders.find(o => o.id === readyForNextStepMode)?.orderId), onClose: () => setReadyForNextStepMode(null), onMarkReady: markReadyForNextStep, t: t }))] }));
};
// ============================================
// Teamleader Machine Detail Modal
// ============================================
const MachineDetailModal = ({ machine, orders, onClose, onProductSelect, onProductMove, onRepairMode, logActivity, user, t }) => {
    const activeOrders = orders.filter(o => ['in_production', 'in_progress'].includes(o.status));
    const plannedOrders = orders.filter(o => ['planned', 'pending'].includes(o.status));
    return (_jsx("div", { className: "fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300", children: [_jsxs("div", { className: "p-6 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex justify-between items-start", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-3xl font-black mb-1", children: machine.machine }), _jsxs("div", { className: "flex items-center gap-3 flex-wrap text-sm", children: [_jsxs("div", { className: "flex items-center gap-1 bg-white/20 px-2 py-1 rounded", children: [_jsx(UserCheck, { size: 14 }), " ", machine.operatorName || 'Geen operator'] }), _jsx("div", { className: `px-2 py-1 rounded font-bold text-xs ${machine.status === "issue"
                                                ? "bg-red-500"
                                                : machine.status === "active"
                                                    ? "bg-emerald-500"
                                                    : "bg-slate-500"}`, children: machine.status === "issue" ? "🔴 Issue" : machine.status === "active" ? "🟢 Actief" : "⚪ Idle" }), machine.hasIssues && (_jsxs("div", { className: "flex items-center gap-1 bg-red-500/20 text-red-100 px-2 py-1 rounded text-xs font-bold", children: [machine.downtimeCount > 0 && `${machine.downtimeCount} stilstanden`, machine.defectCount > 0 && (machine.downtimeCount > 0 ? " • " : "") + `${machine.defectCount} defecten`] }))] })] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-white/20 rounded-lg transition-colors", children: _jsx(X, { size: 28 }) })] }), _jsxs("div", { className: "border-b border-slate-200 flex sticky top-0 bg-slate-50 z-10", children: [_jsx("div", { className: "flex-1 flex border-r border-slate-100", children: _jsxs("div", { className: "flex-1 py-3 px-4 font-bold text-center bg-white border-b-2 border-indigo-600 text-indigo-600", children: ["In Productie (", activeOrders.length, ")"] }) }), _jsx("div", { className: "flex-1 flex border-l border-slate-100", children: _jsxs("div", { className: "flex-1 py-3 px-4 font-bold text-center text-slate-600 text-sm", children: ["Gepland (", plannedOrders.length, ")"] }) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4", children: [activeOrders.length === 0 ? (_jsxs("div", { className: "text-center py-8 text-slate-400", children: [_jsx(Package, { size: 40, className: "mx-auto mb-2 opacity-30" }), _jsx("div", { className: "text-sm font-bold", children: "Geen orders in productie" })] })) : (activeOrders.map(order => (_jsx(OrderDetailCard, { order: order, products: order.products || [], onProductSelect: onProductSelect, onProductMove: onProductMove, onRepairMode: onRepairMode, t: t }, order.id)))), plannedOrders.length > 0 && (_jsxs("div", { className: "pt-4 border-t border-slate-200", children: [_jsx("h3", { className: "text-xs font-black text-slate-400 uppercase tracking-wider mb-3", children: "\uD83D\uDCCB Geplande Orders" }), _jsx("div", { className: "space-y-2", children: plannedOrders.map(order => (_jsxs("div", { className: "bg-slate-50 p-3 rounded-lg border border-slate-100", children: [_jsxs("div", { className: "flex justify-between items-start mb-1", children: [_jsx("div", { className: "font-bold text-sm text-slate-800", children: order.orderId || order.item }), _jsx("span", { className: "text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded", children: order.status })] }), _jsxs("div", { className: "text-xs text-slate-600", children: [order.plan, " stuks \u2022 ", order.itemCode] })] }, order.id))) })] }))] }), _jsx("div", { className: "p-4 border-t border-slate-200 bg-slate-50 flex gap-2", children: _jsx("button", { onClick: onClose, className: "flex-1 py-3 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition-colors", children: "Sluiten" }) })] }) }));
};
// Order Detail Card Component
const OrderDetailCard = ({ order, products, onProductSelect, onProductMove, onRepairMode, t }) => {
    return (_jsxs("div", { className: "bg-white rounded-xl border-2 border-blue-100 overflow-hidden", children: [_jsxs("div", { className: "bg-blue-50 p-4 border-b border-blue-100", children: [_jsxs("div", { className: "flex justify-between items-start mb-2", children: [_jsxs("div", { children: [_jsx("h4", { className: "text-lg font-black text-slate-800", children: order.orderId || order.item }), _jsx("p", { className: "text-sm text-slate-600", children: order.itemCode })] }), _jsxs("div", { className: "text-right", children: [_jsx("div", { className: "font-black text-indigo-600 text-xl", children: order.plan || 0 }), _jsx("div", { className: "text-xs text-slate-500", children: "stuks" })] })] }), order.notes && (_jsxs("div", { className: "text-xs bg-yellow-50 border border-yellow-100 p-2 rounded text-slate-700 italic", children: ["\uD83D\uDCA1 ", order.notes] }))] }), _jsx("div", { className: "p-4 space-y-2", children: products.length === 0 ? (_jsx("div", { className: "text-sm text-slate-500 italic", children: "Geen producten getrackt voor deze order" })) : (products.map(product => (_jsxs("div", { className: "bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center justify-between", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "font-bold text-sm text-slate-800", children: product.lotNumber }), _jsxs("div", { className: "text-xs text-slate-600", children: [product.currentStation, " \u2022 ", product.status] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => onProductSelect(product), className: "p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors", title: "Product dossier", children: _jsx(Eye, { size: 16 }) }), ['In Production', 'in_progress'].includes(product.status) && (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => onProductMove(product), className: "p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors", title: "Verplaatsen", children: _jsx(ArrowRightLeft, { size: 16 }) }), _jsx("button", { onClick: () => onRepairMode(product.id), className: "p-2 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-lg transition-colors", title: "Reparatie", children: _jsx(AlertTriangle, { size: 16 }) })] }))] })] }, product.id)))) })] }));
};
// ============================================
// Product Dossier Modal
// ============================================
const ProductDossierModal = ({ product, onClose, onMove, onRepair, t }) => {
    return (_jsx("div", { className: "fixed inset-0 z-[75] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95", children: [_jsxs("div", { className: "p-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white flex justify-between items-start", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-black mb-1", children: "Product Dossier" }), _jsx("p", { className: "text-blue-100 text-sm", children: product.lotNumber })] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-white/20 rounded-lg", children: _jsx(X, { size: 24 }) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4", children: [_jsx("div", { className: "bg-blue-50 p-4 rounded-xl border border-blue-100", children: _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("div", { className: "text-xs font-bold text-slate-500 uppercase mb-1", children: "Lotnummer" }), _jsx("div", { className: "text-lg font-black text-slate-800", children: product.lotNumber })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-bold text-slate-500 uppercase mb-1", children: "Order" }), _jsx("div", { className: "text-lg font-black text-slate-800", children: product.orderId || "N/A" })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-bold text-slate-500 uppercase mb-1", children: "Status" }), _jsx("div", { className: "font-bold text-sm", children: product.status })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-bold text-slate-500 uppercase mb-1", children: "Huidige Station" }), _jsx("div", { className: "font-bold text-sm", children: product.currentStation || "Onbekend" })] })] }) }), product.history && (_jsxs("div", { children: [_jsx("h3", { className: "text-xs font-black text-slate-400 uppercase tracking-wider mb-3", children: "\uD83D\uDCCD Geschiedenis" }), _jsx("div", { className: "space-y-2 text-sm", children: product.history.slice(-5).reverse().map((entry, i) => (_jsxs("div", { className: "flex gap-2 text-slate-600", children: [_jsx("div", { className: "font-bold text-blue-600 min-w-[80px]", children: entry.station || entry.step || "N/A" }), _jsx("div", { children: entry.timestamp ? new Date(entry.timestamp.toDate ? entry.timestamp.toDate() : entry.timestamp).toLocaleString() : "N/A" })] }, i))) })] })), product.defects && product.defects.length > 0 && (_jsxs("div", { className: "bg-red-50 p-4 rounded-xl border border-red-100", children: [_jsx("h3", { className: "text-xs font-black text-red-700 uppercase mb-2", children: "\uD83D\uDEA9 Geregistreerde Defecten" }), _jsx("div", { className: "space-y-2", children: product.defects.map((defect, i) => (_jsxs("div", { className: "text-sm text-red-800", children: ["\u2022 ", defect.description || defect.type] }, i))) })] }))] }), _jsxs("div", { className: "p-4 border-t border-slate-200 bg-slate-50 flex gap-2", children: [_jsxs("button", { onClick: onMove, className: "flex-1 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2", children: [_jsx(ArrowRightLeft, { size: 18 }), " Verplaatsen"] }), _jsxs("button", { onClick: onRepair, className: "flex-1 py-3 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 transition-colors flex items-center justify-center gap-2", children: [_jsx(AlertTriangle, { size: 18 }), " Reparatie"] }), _jsx("button", { onClick: onClose, className: "flex-1 py-3 bg-slate-300 text-slate-700 rounded-lg font-bold hover:bg-slate-400 transition-colors", children: "Sluiten" })] })] }) }));
};
// ============================================
// Repair Modal
// ============================================
const RepairModal = ({ productId, product, onClose, onSubmit, t }) => {
    const [reason, setReason] = useState("");
    return (_jsx("div", { className: "fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95", children: [_jsxs("div", { className: "p-6 bg-orange-600 text-white", children: [_jsx("h2", { className: "text-2xl font-black mb-1", children: "\uD83D\uDD27 Reparatie Starten" }), _jsx("p", { className: "text-orange-100", children: product?.lotNumber || productId })] }), _jsx("div", { className: "p-6 space-y-4", children: _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-slate-500 uppercase block mb-2", children: "Reparatie Reden" }), _jsx("textarea", { value: reason, onChange: (e) => setReason(e.target.value), placeholder: "Beschrijf het probleem...", className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:border-orange-500 outline-none resize-none", rows: "4" })] }) }), _jsxs("div", { className: "p-4 border-t border-slate-200 bg-slate-50 flex gap-2", children: [_jsx("button", { onClick: onClose, className: "flex-1 py-3 bg-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-300 transition-colors", children: "Annuleren" }), _jsx("button", { onClick: () => onSubmit({ reason }), className: "flex-1 py-3 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 transition-colors", children: "Start Reparatie" })] })] }) }));
};
// ============================================
// Planning Order Card Component
// ============================================
const PlanningOrderCard = ({ order, onSelectOrder, onScanReady, t }) => {
    const getStatusColor = (status) => {
        if (['in_production', 'in_progress'].includes(status))
            return "bg-emerald-50 border-emerald-200";
        if (['planned', 'pending'].includes(status))
            return "bg-blue-50 border-blue-200";
        if (status === 'completed')
            return "bg-slate-50 border-slate-200";
        if (['temp_reject', 'rejected'].includes(status))
            return "bg-red-50 border-red-200";
        return "bg-slate-50 border-slate-200";
    };
    const getStatusLabel = (status) => {
        if (['in_production', 'in_progress'].includes(status))
            return "🟢 In Productie";
        if (['planned', 'pending'].includes(status))
            return "📋 Gepland";
        if (status === 'completed')
            return "✅ Gereed";
        if (['temp_reject', 'rejected'].includes(status))
            return "❌ Afgewezen";
        return status;
    };
    return (_jsxs("div", { onClick: onSelectOrder, className: `bg-white rounded-2xl border-2 p-4 cursor-pointer transition-all active:scale-95 ${getStatusColor(order.status)}`, children: [_jsxs("div", { className: "flex items-start justify-between mb-3 gap-3", children: [_jsxs("div", { className: "flex-1 min-w-0 space-y-2", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[10px] font-black text-slate-400 uppercase mb-1", children: "Ordernummer" }), _jsx("h3", { className: "text-lg font-black text-slate-800 break-words", children: order.orderId || "Onbekend" })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[10px] font-black text-slate-400 uppercase mb-1", children: "Productnaam" }), _jsx("p", { className: "text-sm text-slate-700 font-bold break-words", children: order.item || order.itemCode || "Onbekend product" })] })] }), _jsxs("span", { className: "text-xs font-bold px-2 py-1 bg-white rounded border border-slate-200", children: [order.plan || 0, " stuks"] })] }), _jsxs("div", { className: "flex items-center justify-between mb-3 pb-3 border-b border-slate-200", children: [_jsx("div", { className: "text-sm font-bold text-slate-700", children: getStatusLabel(order.status) }), _jsxs("div", { className: "flex gap-3 text-xs", children: [order.activeProductsCount > 0 && (_jsxs("div", { className: "flex items-center gap-1 text-emerald-600 font-bold", children: [_jsx(Activity, { size: 14 }), " ", order.activeProductsCount, " actief"] })), order.defectCount > 0 && (_jsxs("div", { className: "flex items-center gap-1 text-red-600 font-bold", children: [_jsx(AlertTriangle, { size: 14 }), " ", order.defectCount, " afkeur"] }))] })] }), _jsxs("div", { className: "flex items-center justify-between text-sm", children: [_jsxs("div", { className: "flex items-center gap-2 text-slate-600 font-bold", children: [_jsx(MapPin, { size: 16 }), " ", order.machine || "Niet toegewezen"] }), _jsx("div", { className: "text-xs text-slate-500", children: order.plannedDate?.seconds
                            ? format(new Date(order.plannedDate.seconds * 1000), 'dd MMM', { locale: nl })
                            : "Geen datum" })] }), ['in_production', 'in_progress'].includes(order.status) && (_jsx("div", { className: "mt-3 pt-3 border-t border-slate-200 flex gap-2", children: _jsxs("button", { onClick: (e) => {
                        e.stopPropagation();
                        onScanReady();
                    }, className: "flex-1 py-2 px-3 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2", children: [_jsx(CheckCircle, { size: 16 }), " Gereed volgende stap"] }) }))] }));
};
// ============================================
// Ready for Next Step Modal
// ============================================
const ReadyForNextStepModal = ({ orderId, order, products, onClose, onMarkReady, t }) => {
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [markMode, setMarkMode] = useState(false); // false = select | true = confirm
    if (markMode && selectedProduct) {
        return (_jsx("div", { className: "fixed inset-0 z-[85] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95", children: [_jsxs("div", { className: "p-6 bg-emerald-600 text-white", children: [_jsx("h2", { className: "text-2xl font-black mb-1", children: "\u2705 Gereed voor volgende stap" }), _jsx("p", { className: "text-emerald-100", children: selectedProduct.lotNumber })] }), _jsxs("div", { className: "p-6 space-y-4", children: [_jsxs("div", { children: [_jsx("div", { className: "text-sm font-bold text-slate-700 mb-2", children: "Order:" }), _jsx("div", { className: "text-lg font-black text-slate-800", children: order?.orderId })] }), _jsxs("div", { children: [_jsx("div", { className: "text-sm font-bold text-slate-700 mb-2", children: "Huide Station:" }), _jsx("div", { className: "text-lg font-black text-slate-800", children: selectedProduct.currentStation })] }), _jsx("div", { className: "bg-emerald-50 border border-emerald-200 p-3 rounded-lg", children: _jsxs("p", { className: "text-sm text-emerald-800", children: ["Status wordt ingesteld op ", _jsx("strong", { children: "\"Gereed voor volgende stap\"" }), " en kan verplaatst worden naar de volgende werkstation."] }) })] }), _jsxs("div", { className: "p-4 border-t border-slate-200 bg-slate-50 flex gap-2", children: [_jsx("button", { onClick: () => setMarkMode(false), className: "flex-1 py-3 bg-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-300 transition-colors", children: "Terug" }), _jsx("button", { onClick: () => {
                                    onMarkReady(selectedProduct);
                                    onClose();
                                }, className: "flex-1 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors", children: "Bevestig \u2705" })] })] }) }));
    }
    return (_jsx("div", { className: "fixed inset-0 z-[85] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95", children: [_jsxs("div", { className: "p-6 bg-emerald-600 text-white flex justify-between items-start", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-black mb-1", children: "Selecteer Product" }), _jsx("p", { className: "text-emerald-100", children: order?.orderId })] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-white/20 rounded-lg", children: _jsx(X, { size: 24 }) })] }), _jsx("div", { className: "flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2", children: products.length === 0 ? (_jsxs("div", { className: "text-center py-8 text-slate-400", children: [_jsx(Package, { size: 40, className: "mx-auto mb-2 opacity-30" }), _jsx("div", { className: "text-sm font-bold", children: "Geen producten in deze order" })] })) : (products.map(product => (_jsxs("button", { onClick: () => {
                            setSelectedProduct(product);
                            setMarkMode(true);
                        }, className: "w-full text-left bg-slate-50 hover:bg-slate-100 p-4 rounded-xl border border-slate-200 transition-colors", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("div", { className: "font-bold text-slate-800", children: product.lotNumber }), _jsx("span", { className: "text-xs font-bold px-2 py-1 bg-white rounded border border-slate-200", children: product.status })] }), _jsxs("div", { className: "text-sm text-slate-600", children: [product.currentStation, " \u2022 ", product.currentStep || "Geen stap"] })] }, product.id)))) }), _jsx("div", { className: "p-4 border-t border-slate-200 bg-slate-50", children: _jsx("button", { onClick: onClose, className: "w-full py-3 bg-slate-300 text-slate-700 rounded-lg font-bold hover:bg-slate-400 transition-colors", children: "Annuleren" }) })] }) }));
};
export default ShopFloorMobileApp;
