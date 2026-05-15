import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Users, Clock, AlertTriangle, CheckCircle2, Calendar, BarChart3, Activity, Target, Zap, Loader2, TrendingDown, AlertCircle, ChevronLeft, ChevronRight, FileDown, Brain, Upload, ChevronDown, ChevronUp, LayoutDashboard, BarChart2 } from "lucide-react";
import { collection, collectionGroup, onSnapshot, doc, getDocs, query, limit } from "firebase/firestore";
import { db } from "../../config/firebase";
import { getPlanningArchivePath, PATHS, } from "../../config/dbPaths";
import { getISOWeek, startOfISOWeek, endOfISOWeek, format, subWeeks, addWeeks, startOfYear, endOfYear } from "date-fns";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import CapacityImportModal from "../digitalplanning/modals/CapacityImportModal";
import EfficiencyDashboard from "../digitalplanning/EfficiencyDashboard";
import GanttChartView from "./GanttChartView";
import TimeTrackingView from "./TimeTrackingView";
import WorkloadHeatmapView from "./WorkloadHeatmapView";
import { normalizeMachine } from "../../utils/hubHelpers.tsx";
import { getDeliveryPlanningState, resolveDeliveryDate, toDateSafe } from "../../utils/dateUtils";
import { subscribeScopedEfficiencyHours } from "../../utils/efficiencyScopedReader";
/**
 * CapacityPlanningView
 * Vergelijkt beschikbare productie-uren met geplande uren
 * Toont het verschil tussen capaciteit en demand
 */
const CapacityPlanningView = ({ initialDepartment, lockDepartment = false, onNavigate }) => {
    const { t } = useTranslation();
    const { user, role, isAdmin } = useAdminAuth();
    const readDb = db;
    const readPaths = PATHS;
    const [loading, setLoading] = useState(true);
    const [occupancy, setOccupancy] = useState([]);
    const [planningOrders, setPlanningOrders] = useState([]);
    const [activePlanningOrders, setActivePlanningOrders] = useState([]);
    const [archivedPlanningOrders, setArchivedPlanningOrders] = useState([]);
    const [timeStandards, setTimeStandards] = useState([]);
    const [efficiencyData, setEfficiencyData] = useState({});
    const [selectedWeek, setSelectedWeek] = useState(new Date());
    const [selectedDepartment, setSelectedDepartment] = useState(initialDepartment || "ALLES");
    const [departments, setDepartments] = useState(["ALLES"]);
    const [factoryConfig, setFactoryConfig] = useState({ departments: [] });
    const [timePeriod, setTimePeriod] = useState("week"); // "week", "ytd", "year", "future", "yoy"
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [comparisonYear, setComparisonYear] = useState(new Date().getFullYear() - 1);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showMissingStandards, setShowMissingStandards] = useState(false);
    const [activeTab, setActiveTab] = useState("capacity");
    const planningBucketsRef = useRef({});
    // Auto-filter voor teamleaders
    const isTeamleader = role === "teamleader";
    const userDepartment = user?.department;
    const canChangeFilter = !lockDepartment && (isAdmin || role === "engineer" || !isTeamleader);
    const currentWeek = getISOWeek(selectedWeek);
    const weekStart = startOfISOWeek(selectedWeek);
    const weekEnd = endOfISOWeek(selectedWeek);
    // Datums berekenen op basis van timePeriod
    let periodStart, periodEnd, periodLabel;
    switch (timePeriod) {
        case "week":
            periodStart = weekStart;
            periodEnd = weekEnd;
            periodLabel = `Week ${currentWeek} • ${format(weekStart, 'd MMM')} - ${format(weekEnd, 'd MMM yyyy')}`;
            break;
        case "ytd":
            periodStart = startOfYear(new Date(selectedYear, 0, 1));
            periodEnd = new Date(); // Tot vandaag
            periodLabel = `YTD ${selectedYear} • ${format(periodStart, 'd MMM')} - ${format(periodEnd, 'd MMM yyyy')}`;
            break;
        case "year":
            periodStart = startOfYear(new Date(selectedYear, 0, 1));
            periodEnd = endOfYear(new Date(selectedYear, 11, 31));
            periodLabel = `Hele jaar ${selectedYear} • ${format(periodStart, 'd MMM')} - ${format(periodEnd, 'd MMM yyyy')}`;
            break;
        case "future":
            periodStart = new Date();
            periodEnd = addWeeks(new Date(), 12); // 12 weken vooruit
            periodLabel = `Komende 12 weken • ${format(periodStart, 'd MMM')} - ${format(periodEnd, 'd MMM yyyy')}`;
            break;
        case "yoy":
            periodStart = startOfYear(new Date(selectedYear, 0, 1));
            periodEnd = new Date(); // Tot vandaag, maar dan vorig jaar
            periodLabel = `Vergelijking ${comparisonYear} vs ${selectedYear}`;
            break;
        default:
            periodStart = weekStart;
            periodEnd = weekEnd;
            periodLabel = `Week ${currentWeek}`;
    }
    const archivePlanningYears = useMemo(() => {
        const nowYear = new Date().getFullYear();
        const minYear = Math.min(2020, selectedYear || nowYear, comparisonYear || nowYear);
        const maxYear = Math.max(nowYear, selectedYear || nowYear, comparisonYear || nowYear);
        const years = [];
        for (let year = minYear; year <= maxYear; year += 1) {
            years.push(year);
        }
        return years;
    }, [selectedYear, comparisonYear]);
    // Helper functie voor department matching via departmentId
    const matchesDepartment = (departmentId, filterDepartmentName) => {
        if (!filterDepartmentName || filterDepartmentName.trim().toLowerCase() === "alles")
            return true;
        if (!departmentId)
            return false;
        // Zoek department in factory config via id (case-insensitive)
        const dept = factoryConfig.departments?.find(d => {
            if (!d.id || !departmentId)
                return false;
            return String(d.id).trim().toLowerCase() === String(departmentId).trim().toLowerCase();
        });
        if (!dept)
            return false;
        const deptName = (dept.name || "").toLowerCase().trim();
        const filter = (filterDepartmentName || "").toLowerCase().trim();
        // Exacte match
        if (deptName === filter)
            return true;
        // Department name bevat filter (bijv. "Productie - Fittings" bevat "Fittings")
        if (deptName.includes(filter))
            return true;
        // Filter bevat department name
        if (filter.includes(deptName))
            return true;
        return false;
    };
    // Load departments from factory structure
    useEffect(() => {
        if (!readPaths || !readPaths.FACTORY_CONFIG)
            return;
        const docRef = doc(readDb, ...readPaths.FACTORY_CONFIG);
        const unsub = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setFactoryConfig(data);
                const depts = Array.isArray(data.departments)
                    ? data.departments.filter(d => d.isActive).map(d => d.name)
                    : [];
                setDepartments(["ALLES", ...depts]);
            }
        });
        return () => unsub();
    }, [readDb, readPaths]);
    // Auto-filter voor teamleaders op hun afdeling
    useEffect(() => {
        if (!initialDepartment && isTeamleader && userDepartment) {
            // Zoek matching department (kan "Productie - Fittings" vs "Fittings" zijn)
            const matchingDept = departments.find(d => d === userDepartment ||
                d.includes(userDepartment) ||
                userDepartment.includes(d));
            if (matchingDept) {
                setSelectedDepartment(matchingDept);
            }
            else if (userDepartment !== "ALLES") {
                // Fallback naar user department als het niet in de lijst staat
                setSelectedDepartment(userDepartment);
            }
        }
    }, [isTeamleader, userDepartment, departments, initialDepartment]);
    // Update selectedDepartment als initialDepartment verandert (bijv. navigatie)
    useEffect(() => {
        if (initialDepartment && departments.length > 0) {
            if (initialDepartment === "ALLES") {
                setSelectedDepartment("ALLES");
                return;
            }
            // Probeer te matchen met beschikbare departments
            const match = departments.find(d => d.toLowerCase() === initialDepartment.toLowerCase() ||
                d.toLowerCase().includes(initialDepartment.toLowerCase()) ||
                initialDepartment.toLowerCase().includes(d.toLowerCase()));
            setSelectedDepartment(match || initialDepartment);
        }
    }, [initialDepartment, departments]);
    useEffect(() => {
        if (!readPaths || !readPaths.PLANNING) {
            console.error("PATHS configuration missing in CapacityPlanningView");
            setLoading(false);
            return;
        }
        setLoading(true);
        // Load occupancy data
        const unsubOcc = onSnapshot(collection(readDb, ...readPaths.OCCUPANCY), (snapshot) => {
            setOccupancy(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        const mergePlanningBuckets = () => {
            const mergedMap = new Map();
            Object.values(planningBucketsRef.current).forEach((rows) => {
                (rows || []).forEach((row, idx) => {
                    const key = String(row.orderId || row.id || `${row.machine || ""}-${row.item || ""}-${idx}`).trim();
                    if (!key)
                        return;
                    mergedMap.set(key, row);
                });
            });
            setActivePlanningOrders(Array.from(mergedMap.values()));
        };
        const unsubRootPlanning = onSnapshot(collection(readDb, ...readPaths.PLANNING), (snapshot) => {
            planningBucketsRef.current.root = snapshot.docs.map((docEntry) => ({
                id: docEntry.id,
                __docPath: docEntry.ref.path,
                ...docEntry.data(),
            }));
            mergePlanningBuckets();
            setLoading(false);
        }, (error) => {
            console.warn("Planning root listener failed:", error);
            planningBucketsRef.current.root = [];
            mergePlanningBuckets();
            setLoading(false);
        });
        const unsubScopedPlanning = onSnapshot(collectionGroup(readDb, "orders"), (snapshot) => {
            planningBucketsRef.current.scoped = snapshot.docs
                .filter((d) => {
                const path = d.ref.path || "";
                return (path.includes("/production/digital_planning/") &&
                    path.includes("/machines/") &&
                    path.includes("/orders/"));
            })
                .map((docEntry) => ({ id: docEntry.id, __docPath: docEntry.ref.path, ...docEntry.data() }));
            mergePlanningBuckets();
            setLoading(false);
        }, (error) => {
            console.warn("Planning scoped listener failed:", error);
            planningBucketsRef.current.scoped = [];
            mergePlanningBuckets();
            setLoading(false);
        });
        // Load time standards
        const unsubStandards = onSnapshot(collection(readDb, ...readPaths.PRODUCTION_STANDARDS), (snapshot) => {
            setTimeStandards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => {
            unsubOcc();
            unsubRootPlanning();
            unsubScopedPlanning();
            unsubStandards();
        };
    }, [readDb, readPaths]);
    useEffect(() => {
        let cancelled = false;
        const loadArchivePlanning = async () => {
            try {
                const archiveBuckets = await Promise.all(archivePlanningYears.map(async (year) => {
                    const snapshot = await getDocs(query(collection(readDb, ...getPlanningArchivePath(year)), limit(8000)));
                    return { year, snapshot };
                }));
                if (cancelled)
                    return;
                const rows = archiveBuckets.flatMap(({ year, snapshot }) => snapshot.docs.map((entry) => ({
                    id: entry.id,
                    ...entry.data(),
                    _archiveYear: year,
                    _archived: true,
                })));
                setArchivedPlanningOrders(rows);
            }
            catch (error) {
                console.warn("Archive planning load failed:", error);
                if (!cancelled)
                    setArchivedPlanningOrders([]);
            }
        };
        loadArchivePlanning();
        return () => {
            cancelled = true;
        };
    }, [readDb, archivePlanningYears]);
    useEffect(() => {
        const deduped = new Map();
        // First archived, then active so active records win on key collisions.
        [...archivedPlanningOrders, ...activePlanningOrders].forEach((order, index) => {
            const key = String(order.orderId || order.id || "").trim() ||
                `fallback-${order.machine || ""}-${order.item || ""}-${order.plannedDate || order.date || index}`;
            deduped.set(key, order);
        });
        setPlanningOrders(Array.from(deduped.values()));
    }, [activePlanningOrders, archivedPlanningOrders]);
    // Load efficiency/imported hours
    useEffect(() => {
        if (!readPaths || !readPaths.EFFICIENCY_HOURS)
            return;
        const unsubEfficiency = subscribeScopedEfficiencyHours({
            db: readDb,
            mode: "active",
            onData: (rows) => {
                const data = {};
                rows.forEach((row) => {
                    const key = String(row.orderId || row.id || "").trim();
                    if (!key)
                        return;
                    data[key] = row;
                });
                setEfficiencyData(data);
            },
            onError: (error) => {
                console.warn("Scoped efficiency listener failed:", error);
                setEfficiencyData({});
            },
        });
        return () => unsubEfficiency();
    }, [readDb, readPaths]);
    // Bereken beschikbare capaciteit
    const capacityMetrics = useMemo(() => {
        // Filter occupancy voor de geselecteerde periode
        let periodOccupancy = occupancy.filter(occ => {
            const occDate = new Date(occ.date);
            return occDate >= periodStart && occDate <= periodEnd;
        });
        // Debug: toon unieke departments in occupancy data
        if (selectedDepartment !== "ALLES") {
            const uniqueDeptIds = [...new Set(periodOccupancy.map(o => o.departmentId))];
            const uniqueDeptNames = uniqueDeptIds.map(id => {
                const dept = factoryConfig.departments?.find(d => d.id === id);
                return dept ? dept.name : id;
            });
            console.log("📊 Department IDs in occupancy:", uniqueDeptIds);
            console.log("📊 Department Names:", uniqueDeptNames);
            console.log("🔍 Filtering for:", selectedDepartment);
        }
        // Filter op afdeling als niet "ALLES"
        if (selectedDepartment !== "ALLES") {
            periodOccupancy = periodOccupancy.filter(occ => {
                return matchesDepartment(occ.departmentId, selectedDepartment);
            });
        }
        // Bereken totale uren en splits op in productie vs support
        let totalTheoreticalHours = 0; // Bruto uren (voor weergave/vergelijking)
        let totalProductionHours = 0; // Effectieve netto uren
        let realProductionHours = 0;
        let supportHours = 0;
        periodOccupancy.forEach(occ => {
            let baseHours = parseFloat(occ.hoursWorked || occ.hours || 0);
            // Future Factory regel: standaard werkdag is 7 netto uren (8u min 1u pauze)
            if (!baseHours || baseHours === 8) {
                baseHours = 7;
            }
            totalTheoreticalHours += baseHours;
            // Efficiency Factor 85% inbouwen voor de effectieve netto capaciteit
            const effectiveHours = baseHours * 0.85;
            totalProductionHours += effectiveHours;
            // Check of station BH of BA is (werkelijke productie)
            // UPDATE: Ruimere check voor Mazak, Nabewerking en ID variaties (st_bh...)
            const mId = (occ.machineId || "").toUpperCase();
            const mName = (occ.machineName || "").toUpperCase();
            const idStr = mId + " " + mName;
            const isProduction = idStr.includes("BH") || idStr.includes("BA") || idStr.includes("MAZAK") || idStr.includes("NABEWERK");
            if (isProduction) {
                realProductionHours += effectiveHours;
            }
            else {
                supportHours += effectiveHours;
            }
        });
        // Bereken rand-uren (setup, pauze, overhead) op basis van het verschil
        const totalScheduledHours = totalTheoreticalHours;
        const overheadHours = totalScheduledHours - totalProductionHours;
        // Unieke operators deze periode
        const uniqueOperators = new Set(periodOccupancy.map(o => o.operatorNumber));
        const operatorCount = uniqueOperators.size;
        return {
            totalProductionHours: Math.round(totalProductionHours * 10) / 10,
            realProductionHours: Math.round(realProductionHours * 10) / 10,
            supportHours: Math.round(supportHours * 10) / 10,
            overheadHours: Math.round(overheadHours * 10) / 10,
            totalScheduledHours: Math.round(totalScheduledHours * 10) / 10,
            operatorCount,
            efficiency: 85, // Vastgesteld op 85% volgens de matrix (of je kunt het berekenen als je dynamische downtime hebt)
            productionRatio: totalProductionHours > 0
                ? Math.round((realProductionHours / totalProductionHours) * 100)
                : 0
        };
    }, [occupancy, periodStart, periodEnd, selectedDepartment, factoryConfig, timePeriod]);
    const getOrderPlanningStartDate = (order) => {
        const planned = toDateSafe(order?.plannedDate);
        if (planned)
            return planned;
        const delivery = resolveDeliveryDate(order?.deliveryDate, order?.plannedDeliveryDate, order?.dueDate, order?.deadline);
        const planningState = getDeliveryPlanningState(delivery, {
            productionLeadDays: 21,
            finishBufferDays: 3,
        });
        return planningState.productionStartDate || null;
    };
    // Bereken geplande uren op basis van orders en standaard tijden
    const demandMetrics = useMemo(() => {
        const getSplitHours = (order) => {
            const bh = parseFloat(order.plannedHoursBH || 0) || 0;
            const nab = parseFloat(order.plannedHoursNabewerken || 0) || 0;
            const bm01 = parseFloat(order.plannedHoursBM01 || 0) || 0;
            return { bh, nab, bm01, total: bh + nab + bm01 };
        };
        // Filter orders voor de geselecteerde periode
        let periodOrders = planningOrders.filter(order => {
            const orderDate = getOrderPlanningStartDate(order) || new Date();
            const status = (order.status || '').toLowerCase();
            if (status === 'cancelled')
                return false;
            // 1. Toekomst negeren
            if (orderDate > periodEnd)
                return false;
            // 2. Verleden: Alleen meenemen als NIET afgerond (Backlog)
            const isCompleted = ['completed', 'shipped', 'gereed', 'finished'].includes(status);
            if (orderDate < periodStart && isCompleted)
                return false;
            return true;
        });
        // Debug: toon unieke departments in planning data
        if (selectedDepartment !== "ALLES") {
            const uniqueDeptIds = [...new Set(periodOrders.map(o => o.departmentId))];
            const uniqueDeptNames = uniqueDeptIds.map(id => {
                const dept = factoryConfig.departments?.find(d => d.id === id);
                return dept ? dept.name : id;
            });
            console.log("📋 Department IDs in planning:", uniqueDeptIds);
            console.log("📋 Department Names:", uniqueDeptNames);
        }
        // DEBUG: Toon alle machines die in de database gevonden zijn voordat er gefilterd wordt
        console.log("🔍 Machines in database (Raw):", [...new Set(planningOrders.map(o => o.machine))]);
        // Filter op afdeling als niet "ALLES"
        if (selectedDepartment !== "ALLES") {
            periodOrders = periodOrders.filter(order => {
                // normalizeMachine strips LN-prefix "40" (bijv. "40BH18" → "BH18")
                const machine = normalizeMachine(order.machine || "");
                const selDept = selectedDepartment.toUpperCase();
                if (selDept === "FITTINGS" && (machine.startsWith("BH") || machine === "BM18"))
                    return true;
                if (selDept === "PIPES" && machine.startsWith("BA"))
                    return true;
                // Anders: standaard department check
                return matchesDepartment(order.departmentId, selectedDepartment);
            });
        }
        let totalPlannedUnits = 0;
        let estimatedHours = 0;
        let ordersWithStandards = 0;
        let ordersWithoutStandards = 0;
        let hoursFromEfficiency = 0;
        let ordersWithEfficiency = 0;
        let missingStandardsList = [];
        periodOrders.forEach(order => {
            const planCount = parseInt(order.plan || order.quantity || 0);
            totalPlannedUnits += planCount;
            const importedPlannedHours = parseFloat(order.plannedHours || 0) || 0;
            const splitHours = getSplitHours(order);
            // 1. Check eerst of er specifieke uren zijn geïmporteerd (Infor LN) - case-insensitive match
            let importedInfo = efficiencyData[order.orderId];
            if (!importedInfo && order.orderId) {
                // Probeer case-insensitive match
                const key = Object.keys(efficiencyData).find(k => k.toLowerCase() === order.orderId.toLowerCase());
                if (key)
                    importedInfo = efficiencyData[key];
            }
            if (importedInfo && importedInfo.minutesPerUnit) {
                // Gebruik de geïmporteerde 'norm' per stuk (productie + nabewerken)
                const hoursNeeded = (importedInfo.minutesPerUnit * planCount) / 60;
                // Voeg Eindinspectie (QC) uren toe — staan apart in qcTimeTotal, niet in minutesPerUnit
                const qcQty = importedInfo.quantity || 1;
                const qcHours = qcQty > 0 ? ((importedInfo.qcTimeTotal || 0) / qcQty * planCount) / 60 : 0;
                estimatedHours += hoursNeeded + qcHours;
                ordersWithStandards++;
                hoursFromEfficiency += hoursNeeded + qcHours;
                ordersWithEfficiency++;
            }
            else if (splitHours.total > 0) {
                // Nieuwe PlanningImportModal met gesplitste stationuren (1715/1740/1020).
                estimatedHours += splitHours.total;
                ordersWithStandards++;
            }
            else if (importedPlannedHours > 0) {
                // Nieuwe planning import (plannedHours) direct gebruiken als vraag in uren.
                estimatedHours += importedPlannedHours;
                ordersWithStandards++;
            }
            else {
                // 2. Fallback: Zoek standaard tijd voor dit product op deze machine
                const standard = timeStandards.find(std => std.itemCode === order.item &&
                    std.machine === order.machine);
                if (standard && planCount > 0) {
                    const hoursNeeded = (standard.standardMinutes * planCount) / 60;
                    estimatedHours += hoursNeeded;
                    ordersWithStandards++;
                }
                else if (planCount > 0) {
                    ordersWithoutStandards++;
                    missingStandardsList.push(order);
                }
            }
        });
        return {
            totalPlannedUnits,
            estimatedHours: Math.round(estimatedHours * 10) / 10,
            ordersWithStandards,
            ordersWithoutStandards,
            totalOrders: periodOrders.length,
            hoursFromEfficiency: Math.round(hoursFromEfficiency * 10) / 10,
            ordersWithEfficiency,
            missingStandardsList
        };
    }, [planningOrders, timeStandards, efficiencyData, periodStart, periodEnd, selectedDepartment, factoryConfig, timePeriod]);
    // Bereken balans per machine (Vraag vs Aanbod)
    const machineBreakdown = useMemo(() => {
        const breakdown = {};
        // Geeft het QC/Eindinspectie station terug op basis van hoofdmachine
        const getQcStation = (machineName) => {
            if (machineName.startsWith("BH"))
                return "BM01";
            if (machineName.startsWith("BA"))
                return "BA01";
            return "BM01"; // Default fallback
        };
        const addDemandToMachine = (machineName, hours) => {
            const normalizedMachine = normalizeMachine(machineName || "");
            const safeHours = parseFloat(hours || 0) || 0;
            if (!normalizedMachine || safeHours <= 0)
                return;
            if (!breakdown[normalizedMachine])
                breakdown[normalizedMachine] = { capacity: 0, demand: 0 };
            breakdown[normalizedMachine].demand += safeHours;
        };
        // 1. Capaciteit per machine (Occupancy)
        occupancy.forEach(occ => {
            const occDate = new Date(occ.date);
            if (occDate < periodStart || occDate > periodEnd)
                return;
            // Filter by department
            if (selectedDepartment !== "ALLES" && !matchesDepartment(occ.departmentId, selectedDepartment))
                return;
            const machine = normalizeMachine(occ.machineId || occ.machineName || "");
            if (!machine)
                return;
            if (!breakdown[machine])
                breakdown[machine] = { capacity: 0, demand: 0 };
            // Toepassen van de Future Factory Capaciteitsmatrix regel (7 netto uren, 85% efficiency)
            let baseHours = parseFloat(occ.hoursWorked || occ.hours || 0);
            if (!baseHours || baseHours === 8) {
                baseHours = 7;
            }
            const effectiveHours = baseHours * 0.85;
            breakdown[machine].capacity += effectiveHours;
        });
        // 2. Vraag per machine (Orders)
        planningOrders.forEach(order => {
            const orderDate = getOrderPlanningStartDate(order) || new Date();
            const status = (order.status || '').toLowerCase();
            if (status === 'cancelled')
                return;
            // 1. Toekomst negeren
            if (orderDate > periodEnd)
                return;
            // 2. Verleden: Alleen meenemen als NIET afgerond (Backlog)
            const isCompleted = ['completed', 'shipped', 'gereed', 'finished'].includes(status);
            if (orderDate < periodStart && isCompleted)
                return;
            // Filter by department, maar neem altijd mee als machine bij afdeling hoort
            const machine = normalizeMachine(order.machine || "");
            if (!machine)
                return;
            const selDept = selectedDepartment.toUpperCase();
            if (selectedDepartment !== "ALLES") {
                if (!((selDept === "FITTINGS" && machine.startsWith("BH")) || (selDept === "PIPES" && machine.startsWith("BA")) || matchesDepartment(order.departmentId, selectedDepartment))) {
                    return;
                }
            }
            if (!breakdown[machine])
                breakdown[machine] = { capacity: 0, demand: 0 };
            const splitBH = parseFloat(order.plannedHoursBH || 0) || 0;
            const splitNabewerken = parseFloat(order.plannedHoursNabewerken || 0) || 0;
            const splitBM01 = parseFloat(order.plannedHoursBM01 || 0) || 0;
            const hasSplitHours = splitBH > 0 || splitNabewerken > 0 || splitBM01 > 0;
            if (hasSplitHours) {
                // Zet importuren op de juiste stations:
                // 1715 -> hoofdmachine (BH), 1740 -> NABEWERKING, 1020 -> BM01.
                addDemandToMachine(machine, splitBH);
                addDemandToMachine("NABEWERKING", splitNabewerken);
                addDemandToMachine("BM01", splitBM01);
                return;
            }
            let hoursNeeded = 0;
            // Case-insensitive efficiencyData lookup
            let importedInfo = efficiencyData[order.orderId];
            if (!importedInfo && order.orderId) {
                const key = Object.keys(efficiencyData).find(k => k.toLowerCase() === order.orderId.toLowerCase());
                if (key)
                    importedInfo = efficiencyData[key];
            }
            const planCount = parseInt(order.plan || order.quantity || 0);
            const importedPlannedHours = parseFloat(order.plannedHours || 0) || 0;
            if (importedInfo) {
                // Check of we gesplitste data hebben (Productie vs Nabewerking)
                // Dit komt uit de Infor LN import (op 20 vs op 30)
                if (importedInfo.productionTimeTotal !== undefined || importedInfo.postProcessingTimeTotal !== undefined) {
                    const qty = importedInfo.quantity || 1;
                    // 1. Productie Tijd -> Gaat naar de geplande machine (bv. BH11)
                    const prodTotal = importedInfo.productionTimeTotal || 0;
                    const prodPerUnit = qty > 0 ? prodTotal / qty : 0;
                    hoursNeeded = (prodPerUnit * planCount) / 60;
                    // 2. Nabewerking Tijd -> Gaat naar 'NABEWERKING' station
                    const postTotal = importedInfo.postProcessingTimeTotal || 0;
                    if (postTotal > 0) {
                        const postPerUnit = qty > 0 ? postTotal / qty : 0;
                        const postHours = (postPerUnit * planCount) / 60;
                        const postMachine = "NABEWERKING";
                        if (!breakdown[postMachine])
                            breakdown[postMachine] = { capacity: 0, demand: 0 };
                        breakdown[postMachine].demand += postHours;
                    }
                    // 3. Eindinspectie (QC) Tijd -> Gaat naar het QC station van de afdeling
                    const qcTotal = importedInfo.qcTimeTotal || 0;
                    if (qcTotal > 0) {
                        const qcPerUnit = qty > 0 ? qcTotal / qty : 0;
                        const qcHoursNeeded = (qcPerUnit * planCount) / 60;
                        const qcStation = getQcStation(machine);
                        if (!breakdown[qcStation])
                            breakdown[qcStation] = { capacity: 0, demand: 0 };
                        breakdown[qcStation].demand += qcHoursNeeded;
                    }
                }
                else if (importedInfo.minutesPerUnit) {
                    // Fallback voor oude imports zonder splitsing
                    hoursNeeded = (importedInfo.minutesPerUnit * planCount) / 60;
                }
            }
            else if (importedPlannedHours > 0) {
                hoursNeeded = importedPlannedHours;
            }
            else {
                const standard = timeStandards.find(std => std.itemCode === order.item &&
                    std.machine === order.machine);
                if (standard) {
                    hoursNeeded = (standard.standardMinutes * planCount) / 60;
                }
            }
            breakdown[machine].demand += hoursNeeded;
        });
        // 2b. Consolidatie: Voeg varianten van Nabewerking samen (NABEWERKEN -> NABEWERKING)
        const targetKey = "NABEWERKING";
        const aliases = ["NABEWERKEN", "NABW"];
        aliases.forEach(alias => {
            if (breakdown[alias]) {
                if (!breakdown[targetKey])
                    breakdown[targetKey] = { capacity: 0, demand: 0 };
                breakdown[targetKey].capacity += breakdown[alias].capacity;
                breakdown[targetKey].demand += breakdown[alias].demand;
                delete breakdown[alias];
            }
        });
        // 3. Formatteren en Sorteren
        return Object.entries(breakdown)
            .map(([machine, data]) => ({
            machine,
            capacity: Math.round(data.capacity * 10) / 10,
            demand: Math.round(data.demand * 10) / 10,
            gap: Math.round((data.capacity - data.demand) * 10) / 10,
            utilization: data.capacity > 0 ? Math.round((data.demand / data.capacity) * 100) : 0,
            status: (data.capacity - data.demand) >= 0 ? 'surplus' : 'shortage'
        }))
            .filter(item => {
            // Verberg Teamleader en inactieve stations
            if (item.machine.includes("TEAMLEADER"))
                return false;
            return item.capacity > 0 || item.demand > 0;
        })
            .sort((a, b) => {
            const nameA = a.machine;
            const nameB = b.machine;
            const isBHA = nameA.startsWith("BH");
            const isBHB = nameB.startsWith("BH");
            // 1. BH Stations eerst (numeriek)
            if (isBHA && isBHB) {
                const numA = parseInt(nameA.replace(/\D/g, '')) || 0;
                const numB = parseInt(nameB.replace(/\D/g, '')) || 0;
                return numA - numB;
            }
            if (isBHA)
                return -1;
            if (isBHB)
                return 1;
            // 2. Specifieke volgorde voor overige
            const priorityOrder = ["ALGEMEEN", "NABEWERK", "BM01", "BA01", "MAZAK", "LOSSEN"];
            const getPriority = (name) => {
                const idx = priorityOrder.findIndex(k => name.includes(k));
                return idx !== -1 ? idx : 999;
            };
            const prioA = getPriority(nameA);
            const prioB = getPriority(nameB);
            if (prioA !== prioB)
                return prioA - prioB;
            // 3. Alfabetisch voor de rest
            return nameA.localeCompare(nameB);
        });
    }, [occupancy, planningOrders, efficiencyData, timeStandards, periodStart, periodEnd, selectedDepartment]);
    // Bereken verschil
    const gap = useMemo(() => {
        // Gebruik realProductionHours voor vergelijking met planning
        const difference = capacityMetrics.realProductionHours - demandMetrics.estimatedHours;
        const percentage = demandMetrics.estimatedHours > 0
            ? Math.round((difference / demandMetrics.estimatedHours) * 100)
            : 0;
        return {
            hours: Math.round(difference * 10) / 10,
            percentage,
            status: difference >= 0 ? 'surplus' : 'shortage'
        };
    }, [capacityMetrics, demandMetrics]);
    // Knelpunten analyse
    const bottlenecks = useMemo(() => {
        const issues = [];
        // Te weinig capaciteit
        if (gap.status === 'shortage' && Math.abs(gap.hours) > 10) {
            issues.push({
                type: 'capacity_shortage',
                severity: 'high',
                title: 'Capaciteitstekort',
                description: `${Math.abs(gap.hours)}u te kort voor geplande productie`,
                icon: AlertTriangle,
                color: 'text-red-500'
            });
        }
        // Orders zonder tijdstandaarden
        if (demandMetrics.ordersWithoutStandards > 0) {
            const percentage = Math.round((demandMetrics.ordersWithoutStandards / demandMetrics.totalOrders) * 100);
            issues.push({
                type: 'missing_standards',
                severity: percentage > 50 ? 'high' : 'medium',
                title: 'Ontbrekende Productietijden',
                description: `${demandMetrics.ordersWithoutStandards} orders (${percentage}%) zonder standaardtijden`,
                icon: Clock,
                color: percentage > 50 ? 'text-orange-500' : 'text-yellow-500'
            });
        }
        // Lage efficiency
        if (capacityMetrics.efficiency < 70) {
            issues.push({
                type: 'low_efficiency',
                severity: 'medium',
                title: 'Lage Efficiency',
                description: `Slechts ${capacityMetrics.efficiency}% van beschikbare tijd productief`,
                icon: TrendingDown,
                color: 'text-yellow-500'
            });
        }
        // Te weinig operators
        if (capacityMetrics.operatorCount < 3) {
            issues.push({
                type: 'low_staffing',
                severity: 'medium',
                title: 'Onderbezetting',
                description: `Slechts ${capacityMetrics.operatorCount} operators deze week`,
                icon: Users,
                color: 'text-yellow-500'
            });
        }
        return issues;
    }, [gap, capacityMetrics, demandMetrics]);
    // Voorspelling voor volgende weken (simpel trend-based)
    const prediction = useMemo(() => {
        const currentCapacity = capacityMetrics.realProductionHours;
        const currentDemand = demandMetrics.estimatedHours;
        // Simpele voorspelling: assumeer 10% groei in demand
        const predictedDemand = currentDemand * 1.1;
        const predictedGap = currentCapacity - predictedDemand;
        return {
            nextWeekDemand: Math.round(predictedDemand * 10) / 10,
            nextWeekGap: Math.round(predictedGap * 10) / 10,
            trend: predictedGap < 0 ? 'increasing_pressure' : 'manageable',
            confidence: demandMetrics.ordersWithStandards > 0 ? 'medium' : 'low'
        };
    }, [capacityMetrics, demandMetrics]);
    // PDF Export functie
    const exportToPDF = async () => {
        const [{ default: jsPDF }] = await Promise.all([
            import("jspdf"),
            import("jspdf-autotable"),
        ]);
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        // Titel
        doc.setFontSize(20);
        doc.text("Capaciteitsrapport", 14, 20);
        // Subtitle
        doc.setFontSize(12);
        doc.text(`Week ${currentWeek} • ${format(weekStart, 'd MMM')} - ${format(weekEnd, 'd MMM yyyy')}`, 14, 28);
        doc.text(`Afdeling: ${selectedDepartment}`, 14, 34);
        // Capaciteit sectie
        doc.setFontSize(14);
        doc.text("Beschikbare Capaciteit", 14, 45);
        doc.autoTable({
            startY: 50,
            head: [['Metric', 'Waarde']],
            body: [
                ['Totaal Uren', `${capacityMetrics.totalProductionHours}u`],
                ['Productie Uren (BH/BA)', `${capacityMetrics.realProductionHours}u`],
                ['Support Uren', `${capacityMetrics.supportHours}u`],
                ['Overhead', `${capacityMetrics.overheadHours}u`],
                ['Operators', capacityMetrics.operatorCount],
                ['Efficiency', `${capacityMetrics.efficiency}%`]
            ],
            theme: 'striped'
        });
        // Vraag sectie
        const yPos = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(14);
        doc.text("Geplande Vraag", 14, yPos);
        doc.autoTable({
            startY: yPos + 5,
            head: [['Metric', 'Waarde']],
            body: [
                ['Geplande Eenheden', demandMetrics.totalPlannedUnits],
                ['Geschatte Uren', `${demandMetrics.estimatedHours}u`],
                ['Orders met Tijden', demandMetrics.ordersWithStandards],
                ['Orders zonder Tijden', demandMetrics.ordersWithoutStandards]
            ],
            theme: 'striped'
        });
        // Gap analyse
        const yPos2 = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(14);
        doc.text("Gap Analyse", 14, yPos2);
        doc.autoTable({
            startY: yPos2 + 5,
            head: [['Metric', 'Waarde']],
            body: [
                ['Verschil', `${gap.hours}u`],
                ['Percentage', `${gap.percentage}%`],
                ['Status', gap.status === 'surplus' ? 'Overcapaciteit' : 'Tekort']
            ],
            theme: 'striped'
        });
        // Knelpunten
        if (bottlenecks.length > 0) {
            const yPos3 = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(14);
            doc.text("Knelpunten", 14, yPos3);
            doc.autoTable({
                startY: yPos3 + 5,
                head: [['Type', 'Beschrijving', 'Prioriteit']],
                body: bottlenecks.map(b => [b.title, b.description, b.severity.toUpperCase()]),
                theme: 'striped'
            });
        }
        // Voettekst
        doc.setFontSize(8);
        doc.text(`Gegenereerd: ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, 14, doc.internal.pageSize.height - 10);
        doc.text(`Gebruiker: ${user?.name || user?.email}`, pageWidth - 14, doc.internal.pageSize.height - 10, { align: 'right' });
        // Download
        doc.save(`capaciteit_week${currentWeek}_${selectedDepartment}.pdf`);
    };
    // Week navigatie functies
    const goToPreviousWeek = () => {
        setSelectedWeek(prev => subWeeks(prev, 1));
    };
    const goToNextWeek = () => {
        setSelectedWeek(prev => addWeeks(prev, 1));
    };
    if (loading) {
        return (_jsx("div", { className: "flex items-center justify-center p-12", children: _jsx(Loader2, { className: "animate-spin text-blue-600", size: 32 }) }));
    }
    return (_jsxs("div", { className: "flex flex-col h-full overflow-hidden", children: [_jsx("div", { className: "px-4 pt-4", children: _jsx("div", { className: "inline-flex items-center rounded-xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-widest border-slate-300 bg-slate-100 text-slate-700", children: "Databron: Productie" }) }), _jsxs("div", { className: "bg-white border-b border-slate-200 px-6 py-3 flex flex-col xl:flex-row justify-between items-center gap-4 shrink-0 z-30 shadow-sm", children: [_jsx("div", { className: "hidden xl:block flex-1" }), _jsx("div", { className: "flex bg-slate-100 p-1 rounded-xl overflow-x-auto max-w-full no-scrollbar shrink-0 justify-center", children: [
                            { id: "capacity", label: t("planning.capacity.tabs.capacity", "Capaciteit"), icon: BarChart3 },
                            { id: "efficiency", label: t("planning.capacity.tabs.efficiency", "Efficiency"), icon: Activity },
                            { id: "gantt", label: t("planning.capacity.tabs.gantt", "Gantt"), icon: LayoutDashboard },
                            { id: "timetracking", label: t("planning.capacity.tabs.timetracking", "Time Tracking"), icon: Clock },
                            { id: "heatmap", label: t("planning.capacity.tabs.heatmap", "Heatmap"), icon: BarChart2 },
                        ].map((tab) => (_jsxs("button", { onClick: () => setActiveTab(tab.id), className: `flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id
                                ? "bg-slate-200 text-slate-900 shadow-sm"
                                : "text-slate-500 hover:text-slate-700 hover:bg-white/60"}`, children: [_jsx(tab.icon, { size: 14 }), tab.label] }, tab.id))) }), _jsx("div", { className: "flex items-center gap-4 w-full xl:flex-1 justify-end", children: activeTab === "capacity" && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("label", { className: "text-xs text-slate-500 font-bold uppercase tracking-widest hidden sm:block", children: t("planning.capacity.department", "Afdeling:") }), canChangeFilter ? (_jsx("div", { className: "relative", children: _jsx("select", { value: selectedDepartment, onChange: (e) => setSelectedDepartment(e.target.value), className: "bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 font-bold pr-8", children: departments.map(dept => (_jsx("option", { value: dept, children: dept }, dept))) }) })) : (_jsxs("div", { className: "bg-slate-100 border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold text-slate-700 flex items-center gap-2", children: [selectedDepartment, _jsx("span", { className: "text-xs text-blue-500", children: t("planning.capacity.assigned", "(toegewezen)") })] }))] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("button", { onClick: () => setShowImportModal(true), className: "flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors text-xs font-bold", children: [_jsx(Upload, { size: 16 }), _jsx("span", { className: "hidden sm:inline", children: t("planning.capacity.upload", "Upload") })] }), _jsxs("button", { onClick: exportToPDF, className: "flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors text-xs font-bold", children: [_jsx(FileDown, { size: 16 }), _jsx("span", { className: "hidden sm:inline", children: "PDF" })] })] })] })) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto custom-scrollbar", children: [activeTab === "capacity" && (_jsx("div", { className: "p-6", children: _jsxs("div", { className: "max-w-7xl mx-auto space-y-6 w-full", children: [_jsxs("div", { className: "bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[40px] text-white relative overflow-hidden shadow-xl border border-white/5", children: [_jsx("div", { className: "absolute top-0 right-0 p-8 opacity-5 rotate-12", children: _jsx(BarChart3, { size: 150 }) }), _jsx("div", { className: "relative z-10", children: _jsx("div", { className: "flex items-start justify-between", children: _jsxs("div", { className: "flex-1", children: [_jsxs("h2", { className: "text-2xl font-black uppercase italic tracking-tighter leading-none", children: [t("planning.capacity.titlePrefix", "Capaciteits"), " ", _jsx("span", { className: "text-blue-400", children: t("planning.capacity.titleAccent", "Planning") })] }), _jsxs("div", { className: "flex items-center gap-4 mt-4", children: [_jsx("div", { className: "flex gap-2", children: [
                                                                        { value: "week", label: t("planning.capacity.periods.week", "Week"), icon: "📅" },
                                                                        { value: "ytd", label: t("planning.capacity.periods.ytd", "YTD"), icon: "📈" },
                                                                        { value: "year", label: t("planning.capacity.periods.year", "Jaar"), icon: "📊" },
                                                                        { value: "future", label: t("planning.capacity.periods.future", "Toekomst"), icon: "🔮" },
                                                                        { value: "yoy", label: t("planning.capacity.periods.yoy", "YoY Vergelijking"), icon: "📉" }
                                                                    ].map(option => (_jsxs("button", { onClick: () => setTimePeriod(option.value), className: `px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${timePeriod === option.value
                                                                            ? "bg-blue-500/30 border border-blue-400/50 text-white"
                                                                            : "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"}`, children: [option.icon, " ", option.label] }, option.value))) }), ["ytd", "year", "yoy"].includes(timePeriod) && (_jsx("select", { value: selectedYear, onChange: (e) => setSelectedYear(parseInt(e.target.value)), className: "px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-400", children: [selectedYear, selectedYear - 1, selectedYear - 2].map(year => (_jsx("option", { value: year, className: "text-slate-900", children: year }, year))) })), timePeriod === "yoy" && (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-xs text-slate-400", children: t("planning.capacity.vs", "vs") }), _jsx("select", { value: comparisonYear, onChange: (e) => setComparisonYear(parseInt(e.target.value)), className: "px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-400", children: [selectedYear - 1, selectedYear - 2, selectedYear - 3].map(year => (_jsx("option", { value: year, className: "text-slate-900", children: year }, year))) })] })), timePeriod === "week" && (_jsxs("div", { className: "flex items-center gap-2 ml-auto", children: [_jsx("button", { onClick: goToPreviousWeek, className: "p-1 hover:bg-white/10 rounded-lg transition-colors", children: _jsx(ChevronLeft, { size: 16 }) }), _jsx("span", { className: "text-xs text-slate-400 font-bold uppercase tracking-widest min-w-[200px] text-center", children: periodLabel }), _jsx("button", { onClick: goToNextWeek, className: "p-1 hover:bg-white/10 rounded-lg transition-colors", children: _jsx(ChevronRight, { size: 16 }) })] })), timePeriod !== "week" && (_jsx("span", { className: "text-xs text-slate-400 font-bold uppercase tracking-widest ml-auto", children: periodLabel }))] })] }) }) })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", children: [_jsxs("div", { className: "bg-white border-2 border-slate-200 rounded-2xl p-6", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx(Users, { className: "text-slate-600", size: 24 }), _jsx("span", { className: "px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-black", children: t("planning.capacity.metrics.total", "Totaal") })] }), _jsxs("div", { className: "text-4xl font-black text-slate-600 mb-2", children: [capacityMetrics.totalProductionHours, "u"] }), _jsx("div", { className: "text-xs text-slate-500 uppercase tracking-widest font-bold", children: t("planning.capacity.metrics.availableHours", "Beschikbare Mens-uren") }), _jsxs("div", { className: "mt-4 pt-4 border-t border-slate-100 space-y-2", children: [_jsxs("div", { className: "flex justify-between text-xs", children: [_jsx("span", { className: "text-slate-600", children: t("planning.capacity.metrics.operators", "Operators") }), _jsx("span", { className: "font-bold", children: capacityMetrics.operatorCount })] }), _jsxs("div", { className: "flex justify-between text-xs", children: [_jsx("span", { className: "text-slate-600", children: t("planning.capacity.metrics.overhead", "Overhead") }), _jsxs("span", { className: "font-bold", children: [capacityMetrics.overheadHours, "u"] })] })] })] }), _jsxs("div", { className: "bg-white border-2 border-emerald-200 rounded-2xl p-6", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx(Activity, { className: "text-emerald-600", size: 24 }), _jsx("span", { className: "px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black", children: t("planning.capacity.metrics.production", "Productie") })] }), _jsxs("div", { className: "text-4xl font-black text-emerald-600 mb-2", children: [capacityMetrics.realProductionHours, "u"] }), _jsx("div", { className: "text-xs text-slate-500 uppercase tracking-widest font-bold", children: t("planning.capacity.metrics.bhbaStations", "BH/BA stations") }), _jsxs("div", { className: "mt-4 pt-4 border-t border-slate-100 space-y-2", children: [_jsxs("div", { className: "flex justify-between text-xs", children: [_jsx("span", { className: "text-slate-600", children: t("planning.capacity.metrics.ratio", "Ratio") }), _jsxs("span", { className: "font-bold", children: [capacityMetrics.productionRatio, "%"] })] }), _jsxs("div", { className: "flex justify-between text-xs", children: [_jsx("span", { className: "text-slate-600", children: t("planning.capacity.metrics.support", "Support") }), _jsxs("span", { className: "font-bold", children: [capacityMetrics.supportHours, "u"] })] })] })] }), _jsxs("div", { className: "bg-white border-2 border-blue-200 rounded-2xl p-6", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx(Calendar, { className: "text-blue-600", size: 24 }), _jsx("span", { className: "px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-black", children: t("planning.capacity.metrics.planning", "Planning") })] }), _jsxs("div", { className: "text-4xl font-black text-blue-600 mb-2", children: [demandMetrics.estimatedHours, "u"] }), _jsx("div", { className: "text-xs text-slate-500 uppercase tracking-widest font-bold", children: t("planning.capacity.metrics.requiredOrderHours", "Benodigde Order-uren") }), _jsxs("div", { className: "mt-4 pt-4 border-t border-slate-100 space-y-2", children: [_jsxs("div", { className: "flex justify-between text-xs", children: [_jsx("span", { className: "text-slate-600", children: t("planning.capacity.metrics.orders", "Orders") }), _jsx("span", { className: "font-bold", children: demandMetrics.totalOrders })] }), _jsxs("div", { className: "flex justify-between text-xs", children: [_jsx("span", { className: "text-slate-600", children: t("planning.capacity.metrics.units", "Units") }), _jsx("span", { className: "font-bold", children: demandMetrics.totalPlannedUnits })] }), _jsxs("div", { className: "flex justify-between text-xs", children: [_jsx("span", { className: "text-slate-600", children: t("planning.capacity.metrics.withStandard", "Met standaard") }), _jsxs("span", { className: "font-bold", children: [demandMetrics.ordersWithStandards, "/", demandMetrics.totalOrders] })] }), demandMetrics.hoursFromEfficiency > 0 && (_jsxs("div", { className: "flex justify-between text-xs pt-2 mt-2 border-t border-slate-100", children: [_jsx("span", { className: "text-purple-600 font-bold", children: t("planning.capacity.metrics.fromEfficiency", "Uit Efficiency") }), _jsxs("span", { className: "font-black text-purple-600", children: [demandMetrics.hoursFromEfficiency, "u (", demandMetrics.ordersWithEfficiency, ")"] })] }))] })] }), _jsxs("div", { className: `bg-white border-2 rounded-2xl p-6 ${gap.status === 'surplus'
                                                ? 'border-emerald-200'
                                                : 'border-rose-200'}`, children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [gap.status === 'surplus' ? (_jsx(CheckCircle2, { className: "text-emerald-600", size: 24 })) : (_jsx(AlertTriangle, { className: "text-rose-600", size: 24 })), _jsx("span", { className: `px-3 py-1 rounded-full text-xs font-black ${gap.status === 'surplus'
                                                                ? 'bg-emerald-100 text-emerald-700'
                                                                : 'bg-rose-100 text-rose-700'}`, children: gap.status === 'surplus' ? t("planning.capacity.metrics.surplus", "Overschot") : t("planning.capacity.metrics.shortage", "Tekort") })] }), _jsxs("div", { className: `text-4xl font-black mb-2 ${gap.status === 'surplus' ? 'text-emerald-600' : 'text-rose-600'}`, children: [gap.status === 'surplus' ? '+' : '', gap.hours, "u"] }), _jsx("div", { className: "text-xs text-slate-500 uppercase tracking-widest font-bold", children: gap.status === 'surplus' ? t("planning.capacity.metrics.overcapacity", "Overcapaciteit") : t("planning.capacity.metrics.undercapacity", "Ondercapaciteit") }), _jsx("div", { className: "mt-4 pt-4 border-t border-slate-100", children: _jsxs("div", { className: "flex justify-between text-xs", children: [_jsx("span", { className: "text-slate-600", children: t("planning.capacity.metrics.percentage", "Percentage") }), _jsxs("span", { className: `font-black ${gap.status === 'surplus' ? 'text-emerald-600' : 'text-rose-600'}`, children: [gap.percentage > 0 ? '+' : '', gap.percentage, "%"] })] }) })] })] }), _jsxs("div", { className: "bg-white border-2 border-slate-200 rounded-2xl p-6", children: [_jsxs("h3", { className: "text-sm font-black uppercase tracking-widest text-slate-700 mb-4 flex items-center gap-2", children: [_jsx(Activity, { size: 18 }), t("planning.capacity.machineBalance", "Machine Capaciteit Balans")] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4", children: [machineBreakdown.map((item) => (_jsxs("div", { className: `p-4 rounded-xl border-2 ${item.status === 'shortage'
                                                        ? 'bg-red-50 border-red-100'
                                                        : 'bg-emerald-50 border-emerald-100'}`, children: [_jsxs("div", { className: "flex justify-between items-start mb-2", children: [_jsx("span", { className: "font-black text-slate-800 text-lg", children: item.machine }), _jsx("span", { className: `text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wider ${item.status === 'shortage'
                                                                        ? 'bg-red-100 text-red-700'
                                                                        : 'bg-emerald-100 text-emerald-700'}`, children: item.status === 'shortage' ? t("planning.capacity.metrics.shortage", "Tekort") : t("planning.capacity.metrics.surplus", "Overschot") })] }), _jsxs("div", { className: "space-y-1.5 text-xs", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-500 font-bold", children: t("planning.capacity.machine.availablePeople", "Beschikbaar (Mensen):") }), _jsxs("span", { className: "font-bold text-slate-700", children: [item.capacity, "u"] })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-500 font-bold", children: t("planning.capacity.machine.requiredOrders", "Nodig (Orders):") }), _jsxs("span", { className: "font-bold text-slate-700", children: [item.demand, "u"] })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-500 font-bold", children: t("planning.capacity.machine.utilization", "Bezettingsgraad:") }), _jsxs("span", { className: `font-bold ${item.utilization > 100 ? 'text-red-600' : 'text-slate-700'}`, children: [item.utilization, "%"] })] }), _jsxs("div", { className: `flex justify-between pt-2 border-t ${item.status === 'shortage' ? 'border-red-200' : 'border-emerald-200'}`, children: [_jsx("span", { className: "font-black uppercase", children: t("planning.capacity.machine.difference", "Verschil:") }), _jsxs("span", { className: `font-black text-sm ${item.status === 'shortage' ? 'text-red-600' : 'text-emerald-600'}`, children: [item.gap > 0 ? '+' : '', item.gap, "u"] })] })] })] }, item.machine))), machineBreakdown.length === 0 && (_jsx("div", { className: "col-span-full text-center py-8 text-slate-400 italic text-xs", children: t("planning.capacity.noDataForPeriod", "Geen data beschikbaar voor deze periode/afdeling.") }))] })] }), demandMetrics.ordersWithoutStandards > 0 && (_jsxs("div", { className: "bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col gap-3", children: [_jsxs("div", { className: "flex items-start gap-3", children: [_jsx(AlertTriangle, { className: "text-amber-600 flex-shrink-0", size: 20 }), _jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-sm font-bold text-amber-900", children: t("planning.capacity.missingStandardsTitle", "Ontbrekende Standaard Tijden") }), _jsxs("div", { className: "text-xs text-amber-700 mt-1", children: [t("planning.capacity.missingStandardsMessage", "{{count}} orders hebben geen standaard productietijd ingesteld.", { count: demandMetrics.ordersWithoutStandards }), onNavigate ? (_jsx("button", { onClick: () => onNavigate("production_standards"), className: "underline font-bold hover:text-amber-900 ml-1", children: t("planning.capacity.goToProductionTimes", "Ga naar Productie Tijden") })) : (_jsxs("span", { children: [" ", t("planning.capacity.goTo", "Ga naar"), " ", _jsx("strong", { children: t("planning.capacity.productionTimes", "Productie Tijden") })] })), t("planning.capacity.missingStandardsSuffix", "om deze toe te voegen voor nauwkeurigere capaciteitsberekening.")] }), _jsxs("button", { onClick: () => setShowMissingStandards(!showMissingStandards), className: "flex items-center gap-1 text-xs font-bold text-amber-800 mt-2 hover:text-amber-900 transition-colors", children: [showMissingStandards ? t("planning.capacity.hideList", "Verberg lijst") : t("planning.capacity.showList", "Toon lijst"), showMissingStandards ? _jsx(ChevronUp, { size: 14 }) : _jsx(ChevronDown, { size: 14 })] })] })] }), showMissingStandards && (_jsx("div", { className: "bg-white/60 rounded-xl border border-amber-200 overflow-hidden animate-in slide-in-from-top-2", children: _jsx("div", { className: "max-h-60 overflow-y-auto custom-scrollbar", children: _jsxs("table", { className: "w-full text-left text-xs", children: [_jsx("thead", { className: "bg-amber-100/50 text-amber-900 font-bold sticky top-0", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2", children: t("planning.capacity.table.order", "Order") }), _jsx("th", { className: "px-3 py-2", children: t("planning.capacity.table.itemCode", "Item Code") }), _jsx("th", { className: "px-3 py-2", children: t("planning.capacity.table.description", "Omschrijving") }), _jsx("th", { className: "px-3 py-2", children: t("planning.capacity.table.machine", "Machine") }), _jsx("th", { className: "px-3 py-2 text-right", children: t("planning.capacity.table.quantity", "Aantal") })] }) }), _jsx("tbody", { className: "divide-y divide-amber-100", children: demandMetrics.missingStandardsList.map(order => (_jsxs("tr", { className: "hover:bg-amber-50/50 transition-colors", children: [_jsx("td", { className: "px-3 py-2 font-mono font-bold text-amber-800", children: order.orderId }), _jsx("td", { className: "px-3 py-2 font-mono text-amber-900", children: order.itemCode || "-" }), _jsx("td", { className: "px-3 py-2 text-amber-900 truncate max-w-[150px]", title: order.item, children: order.item }), _jsx("td", { className: "px-3 py-2 text-amber-800", children: order.machine }), _jsx("td", { className: "px-3 py-2 text-right text-amber-900 font-bold", children: order.plan })] }, order.id))) })] }) }) }))] })), _jsxs("div", { className: "bg-white border-2 border-slate-200 rounded-2xl p-6", children: [_jsxs("h3", { className: "text-sm font-black uppercase tracking-widest text-slate-700 mb-4 flex items-center gap-2", children: [_jsx(Target, { size: 18 }), t("planning.capacity.recommendationsTitle", "Aanbevelingen")] }), _jsxs("div", { className: "space-y-3", children: [gap.status === 'shortage' ? (_jsx(_Fragment, { children: _jsxs("div", { className: "flex items-start gap-3 p-3 bg-rose-50 rounded-xl", children: [_jsx(AlertTriangle, { className: "text-rose-600 flex-shrink-0 mt-0.5", size: 16 }), _jsxs("div", { className: "text-xs", children: [_jsx("div", { className: "font-bold text-rose-900", children: t("planning.capacity.recommendations.shortageTitle", "Onderbezetting") }), _jsx("div", { className: "text-rose-700 mt-1", children: t("planning.capacity.recommendations.shortageText", "Er zijn {{hours}} uur te weinig. Overweeg extra shifts, overuren, of herplan niet-kritische orders.", { hours: Math.abs(gap.hours) }) })] })] }) })) : (_jsx(_Fragment, { children: _jsxs("div", { className: "flex items-start gap-3 p-3 bg-emerald-50 rounded-xl", children: [_jsx(CheckCircle2, { className: "text-emerald-600 flex-shrink-0 mt-0.5", size: 16 }), _jsxs("div", { className: "text-xs", children: [_jsx("div", { className: "font-bold text-emerald-900", children: t("planning.capacity.recommendations.availableTitle", "Capaciteit Beschikbaar") }), _jsx("div", { className: "text-emerald-700 mt-1", children: t("planning.capacity.recommendations.availableText", "Er zijn {{hours}} uur over. Mogelijkheden: extra orders aannemen, preventief onderhoud, training, of proces optimalisatie.", { hours: gap.hours }) })] })] }) })), capacityMetrics.efficiency < 70 && (_jsxs("div", { className: "flex items-start gap-3 p-3 bg-amber-50 rounded-xl", children: [_jsx(Zap, { className: "text-amber-600 flex-shrink-0 mt-0.5", size: 16 }), _jsxs("div", { className: "text-xs", children: [_jsx("div", { className: "font-bold text-amber-900", children: t("planning.capacity.recommendations.lowEfficiencyTitle", "Lage Efficiency") }), _jsx("div", { className: "text-amber-700 mt-1", children: t("planning.capacity.recommendations.lowEfficiencyText", "Slechts {{efficiency}}% van de tijd wordt productief gebruikt. Analyseer waar tijd verloren gaat: setup, wachttijden, materiaal tekorten?", { efficiency: capacityMetrics.efficiency }) })] })] }))] })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsxs("div", { className: "bg-white border-2 border-slate-200 rounded-2xl p-6", children: [_jsx("h3", { className: "text-sm font-black uppercase tracking-widest text-slate-700 mb-4", children: t("planning.capacity.hoursDistribution", "Uren Verdeling") }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-xs text-slate-600", children: t("planning.capacity.breakdown.productionBhba", "Productie (BH/BA)") }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-32 h-2 bg-slate-100 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full bg-emerald-500 rounded-full", style: { width: `${capacityMetrics.productionRatio}%` } }) }), _jsxs("span", { className: "text-xs font-bold text-slate-800 w-16 text-right", children: [capacityMetrics.realProductionHours, "u"] })] })] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-xs text-slate-600", children: t("planning.capacity.metrics.support", "Support") }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-32 h-2 bg-slate-100 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full bg-slate-400 rounded-full", style: { width: `${100 - capacityMetrics.productionRatio}%` } }) }), _jsxs("span", { className: "text-xs font-bold text-slate-800 w-16 text-right", children: [capacityMetrics.supportHours, "u"] })] })] }), _jsxs("div", { className: "flex items-center justify-between pt-3 border-t border-slate-100", children: [_jsx("span", { className: "text-xs text-slate-600", children: t("planning.capacity.metrics.overhead", "Overhead") }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-32 h-2 bg-slate-100 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full bg-amber-500 rounded-full", style: { width: `${100 - capacityMetrics.efficiency}%` } }) }), _jsxs("span", { className: "text-xs font-bold text-slate-800 w-16 text-right", children: [capacityMetrics.overheadHours, "u"] })] })] })] })] }), _jsxs("div", { className: "bg-white border-2 border-slate-200 rounded-2xl p-6", children: [_jsx("h3", { className: "text-sm font-black uppercase tracking-widest text-slate-700 mb-4", children: t("planning.capacity.planningStatus", "Planning Status") }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-xs text-slate-600", children: t("planning.capacity.status.inforLn", "Infor LN (Efficiency)") }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-24 h-2 bg-slate-100 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full bg-purple-500 rounded-full", style: {
                                                                                    width: `${demandMetrics.totalOrders > 0
                                                                                        ? (demandMetrics.ordersWithEfficiency / demandMetrics.totalOrders) * 100
                                                                                        : 0}%`
                                                                                } }) }), _jsx("span", { className: "text-xs font-bold text-slate-800 w-12 text-right", children: demandMetrics.ordersWithEfficiency })] })] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-xs text-slate-600", children: t("planning.capacity.status.standardDb", "Standaard DB") }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-24 h-2 bg-slate-100 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full bg-blue-500 rounded-full", style: {
                                                                                    width: `${demandMetrics.totalOrders > 0
                                                                                        ? ((demandMetrics.ordersWithStandards - demandMetrics.ordersWithEfficiency) / demandMetrics.totalOrders) * 100
                                                                                        : 0}%`
                                                                                } }) }), _jsx("span", { className: "text-xs font-bold text-slate-800 w-12 text-right", children: demandMetrics.ordersWithStandards - demandMetrics.ordersWithEfficiency })] })] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-xs text-slate-600", children: t("planning.capacity.status.withoutData", "Zonder data") }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-24 h-2 bg-slate-100 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full bg-amber-500 rounded-full", style: {
                                                                                    width: `${demandMetrics.totalOrders > 0
                                                                                        ? (demandMetrics.ordersWithoutStandards / demandMetrics.totalOrders) * 100
                                                                                        : 0}%`
                                                                                } }) }), _jsx("span", { className: "text-xs font-bold text-slate-800 w-12 text-right", children: demandMetrics.ordersWithoutStandards })] })] })] })] })] }), bottlenecks.length > 0 && (_jsxs("div", { className: "bg-white border-2 border-red-200 rounded-2xl p-6", children: [_jsxs("div", { className: "flex items-center gap-2 mb-4", children: [_jsx(AlertCircle, { className: "text-red-600", size: 20 }), _jsx("h3", { className: "text-sm font-black uppercase tracking-widest text-slate-700", children: t("planning.capacity.bottlenecksTitle", "Geïdentificeerde Knelpunten") })] }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: bottlenecks.map((bottleneck, idx) => {
                                                const Icon = bottleneck.icon;
                                                return (_jsx("div", { className: `p-4 rounded-xl border-2 ${bottleneck.severity === 'high' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`, children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx(Icon, { className: bottleneck.color, size: 20 }), _jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "font-bold text-sm text-slate-800", children: bottleneck.title }), _jsx("div", { className: "text-xs text-slate-600 mt-1", children: bottleneck.description }), _jsxs("div", { className: `text-xs font-bold mt-2 ${bottleneck.severity === 'high' ? 'text-red-600' : 'text-amber-600'}`, children: [t("planning.capacity.priority", "Prioriteit"), ": ", bottleneck.severity.toUpperCase()] })] })] }) }, idx));
                                            }) })] })), _jsxs("div", { className: "bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200 rounded-2xl p-6", children: [_jsxs("div", { className: "flex items-center gap-2 mb-4", children: [_jsx(Brain, { className: "text-purple-600", size: 20 }), _jsx("h3", { className: "text-sm font-black uppercase tracking-widest text-slate-700", children: t("planning.capacity.predictionTitle", "Voorspelling Volgende Week") }), _jsx("span", { className: "text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full font-bold", children: "BETA" })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [_jsxs("div", { className: "bg-white rounded-xl p-4 border border-purple-100", children: [_jsx("div", { className: "text-xs text-slate-600 uppercase tracking-wider mb-1", children: t("planning.capacity.prediction.expectedDemand", "Verwachte Vraag") }), _jsxs("div", { className: "text-2xl font-black text-purple-600", children: [prediction.nextWeekDemand, "u"] }), _jsx("div", { className: "text-xs text-slate-500 mt-1", children: t("planning.capacity.prediction.trendGrowth", "+10% trend groei") })] }), _jsxs("div", { className: "bg-white rounded-xl p-4 border border-purple-100", children: [_jsx("div", { className: "text-xs text-slate-600 uppercase tracking-wider mb-1", children: t("planning.capacity.prediction.predictedGap", "Voorspeld Verschil") }), _jsxs("div", { className: `text-2xl font-black ${prediction.nextWeekGap >= 0 ? 'text-emerald-600' : 'text-red-600'}`, children: [prediction.nextWeekGap, "u"] }), _jsx("div", { className: "text-xs text-slate-500 mt-1", children: prediction.trend === 'increasing_pressure' ? t("planning.capacity.prediction.increasingPressure", "⚠️ Toenemende druk") : t("planning.capacity.prediction.manageable", "✓ Beheersbaar") })] }), _jsxs("div", { className: "bg-white rounded-xl p-4 border border-purple-100", children: [_jsx("div", { className: "text-xs text-slate-600 uppercase tracking-wider mb-1", children: t("planning.capacity.prediction.confidence", "Betrouwbaarheid") }), _jsx("div", { className: `text-2xl font-black ${prediction.confidence === 'high' ? 'text-emerald-600' :
                                                                prediction.confidence === 'medium' ? 'text-amber-600' : 'text-slate-400'}`, children: prediction.confidence === 'high' ? t("planning.capacity.prediction.high", "Hoog") : prediction.confidence === 'medium' ? t("planning.capacity.prediction.medium", "Middel") : t("planning.capacity.prediction.low", "Laag") }), _jsx("div", { className: "text-xs text-slate-500 mt-1", children: demandMetrics.ordersWithStandards > 0 ? t("planning.capacity.prediction.ordersWithData", "{{count}} orders met data", { count: demandMetrics.ordersWithStandards }) : t("planning.capacity.prediction.insufficientData", "Onvoldoende data") })] })] }), _jsx("div", { className: "mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100", children: _jsxs("div", { className: "flex items-start gap-2", children: [_jsx(AlertCircle, { className: "text-blue-600 flex-shrink-0 mt-0.5", size: 14 }), _jsxs("div", { className: "text-xs text-blue-800", children: [_jsx("strong", { children: "Let op:" }), " Deze voorspelling is gebaseerd op historische trends en aannames. Gebruik dit als indicatie, niet als absolute waarheid. Houd rekening met seizoensinvloeden, geplande stilstand, en externe factoren."] })] }) })] }), _jsx(CapacityImportModal, { isOpen: showImportModal, onClose: () => setShowImportModal(false), onSuccess: () => {
                                        console.log("Uren geïmporteerd");
                                    } })] }) })), activeTab === "efficiency" && _jsx(EfficiencyDashboard, {}), activeTab === "gantt" && _jsx(GanttChartView, {}), activeTab === "timetracking" && (_jsx(TimeTrackingView, { initialDepartment: selectedDepartment })), activeTab === "heatmap" && _jsx(WorkloadHeatmapView, {})] })] }));
};
export default CapacityPlanningView;
