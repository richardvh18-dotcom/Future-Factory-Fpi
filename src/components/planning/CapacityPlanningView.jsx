import React, { useState, useEffect, useMemo } from "react";
import {
  TrendingUp,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  BarChart3,
  Activity,
  Target,
  Zap,
  Package,
  Loader2,
  Download,
  TrendingDown,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileDown,
  History,
  Brain,
  Upload,
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  BarChart2
} from "lucide-react";
import { collection, query, where, getDocs, onSnapshot, doc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { getISOWeek, startOfISOWeek, endOfISOWeek, format, subWeeks, addWeeks, startOfDay, endOfDay, startOfYear, endOfYear, subYears, isAfter, isBefore } from "date-fns";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import jsPDF from "jspdf";
import "jspdf-autotable";
import CapacityImportModal from "../digitalplanning/modals/CapacityImportModal";
import EfficiencyDashboard from "../digitalplanning/EfficiencyDashboard";
import GanttChartView from "./GanttChartView";
import TimeTrackingView from "./TimeTrackingView";
import WorkloadHeatmapView from "./WorkloadHeatmapView";
import { normalizeMachine } from "../../utils/hubHelpers";

/**
 * CapacityPlanningView
 * Vergelijkt beschikbare productie-uren met geplande uren
 * Toont het verschil tussen capaciteit en demand
 */
const CapacityPlanningView = ({ initialDepartment, lockDepartment = false, onNavigate }) => {
  const { user, role, isAdmin } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [occupancy, setOccupancy] = useState([]);
  const [planningOrders, setPlanningOrders] = useState([]);
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

  // Auto-filter voor teamleaders
  const isTeamleader = role === "teamleader";
  const userDepartment = user?.department;
  const canChangeFilter = !lockDepartment && (isAdmin || role === "engineer" || !isTeamleader);

  const currentWeek = getISOWeek(selectedWeek);
  const weekStart = startOfISOWeek(selectedWeek);
  const weekEnd = endOfISOWeek(selectedWeek);

  // Datums berekenen op basis van timePeriod
  let periodStart, periodEnd, periodLabel;
  
  switch(timePeriod) {
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

  // Helper functie voor department matching via departmentId
  const matchesDepartment = (departmentId, filterDepartmentName) => {
    if (!filterDepartmentName || filterDepartmentName.trim().toLowerCase() === "alles") return true;
    if (!departmentId) return false;

    // Zoek department in factory config via id (case-insensitive)
    const dept = factoryConfig.departments?.find(d => {
      if (!d.id || !departmentId) return false;
      return String(d.id).trim().toLowerCase() === String(departmentId).trim().toLowerCase();
    });
    if (!dept) return false;

    const deptName = (dept.name || "").toLowerCase().trim();
    const filter = (filterDepartmentName || "").toLowerCase().trim();

    // Exacte match
    if (deptName === filter) return true;

    // Department name bevat filter (bijv. "Productie - Fittings" bevat "Fittings")
    if (deptName.includes(filter)) return true;

    // Filter bevat department name
    if (filter.includes(deptName)) return true;

    return false;
  };

  // Load departments from factory structure
  useEffect(() => {
    const docRef = doc(db, ...PATHS.FACTORY_CONFIG);
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
  }, []);

  // Auto-filter voor teamleaders op hun afdeling
  useEffect(() => {
    if (!initialDepartment && isTeamleader && userDepartment) {
      // Zoek matching department (kan "Productie - Fittings" vs "Fittings" zijn)
      const matchingDept = departments.find(d => 
        d === userDepartment || 
        d.includes(userDepartment) || 
        userDepartment.includes(d)
      );
      if (matchingDept) {
        setSelectedDepartment(matchingDept);
      } else if (userDepartment !== "ALLES") {
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
      const match = departments.find(d => 
        d.toLowerCase() === initialDepartment.toLowerCase() ||
        d.toLowerCase().includes(initialDepartment.toLowerCase()) ||
        initialDepartment.toLowerCase().includes(d.toLowerCase())
      );
      setSelectedDepartment(match || initialDepartment);
    }
  }, [initialDepartment, departments]);

  useEffect(() => {
    setLoading(true);

    // Load occupancy data
    const unsubOcc = onSnapshot(
      collection(db, ...PATHS.OCCUPANCY),
      (snapshot) => {
        setOccupancy(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    // Load planning orders
    const unsubPlanning = onSnapshot(
      collection(db, ...PATHS.PLANNING),
      (snapshot) => {
        setPlanningOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      }
    );

    // Load time standards
    const unsubStandards = onSnapshot(
      collection(db, ...PATHS.PRODUCTION_STANDARDS),
      (snapshot) => {
        setTimeStandards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    return () => {
      unsubOcc();
      unsubPlanning();
      unsubStandards();
    };
  }, []);

  // Load efficiency/imported hours
  useEffect(() => {
    const unsubEfficiency = onSnapshot(
      collection(db, "future-factory", "production", "efficiency_hours"),
      (snapshot) => {
        const data = {};
        snapshot.docs.forEach((doc) => {
          data[doc.id] = doc.data();
        });
        setEfficiencyData(data);
      }
    );
    return () => unsubEfficiency();
  }, []);

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
    let totalProductionHours = 0;
    let realProductionHours = 0;
    let supportHours = 0;
    
    periodOccupancy.forEach(occ => {
      const hours = parseFloat(occ.hoursWorked || occ.hours || 0);
      totalProductionHours += hours;
      
      // Check of station BH of BA is (werkelijke productie)
      // UPDATE: Ruimere check voor Mazak, Nabewerking en ID variaties (st_bh...)
      const mId = (occ.machineId || "").toUpperCase();
      const mName = (occ.machineName || "").toUpperCase();
      const idStr = mId + " " + mName;

      const isProduction = idStr.includes("BH") || idStr.includes("BA") || idStr.includes("MAZAK") || idStr.includes("NABEWERK");

      if (isProduction) {
        realProductionHours += hours;
      } else {
        supportHours += hours;
      }
    });

    // Bereken rand-uren (setup, pauze, overhead)
    // Aanname: 8 uur per dag - hoursWorked = overhead
    const totalScheduledHours = periodOccupancy.reduce((sum, occ) => {
      return sum + 8; // Standaard werkdag
    }, 0);

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
      efficiency: totalScheduledHours > 0 
        ? Math.round((totalProductionHours / totalScheduledHours) * 100) 
        : 0,
      productionRatio: totalProductionHours > 0
        ? Math.round((realProductionHours / totalProductionHours) * 100)
        : 0
    };
  }, [occupancy, periodStart, periodEnd, selectedDepartment, factoryConfig, timePeriod]);

  // Bereken geplande uren op basis van orders en standaard tijden
  const demandMetrics = useMemo(() => {
    // Filter orders voor de geselecteerde periode
    let periodOrders = planningOrders.filter(order => {
      let orderDate = new Date();
      if (order.plannedDate) {
        if (order.plannedDate.toDate) orderDate = order.plannedDate.toDate();
        else orderDate = new Date(order.plannedDate);
      }
      
      const status = (order.status || '').toLowerCase();
      if (status === 'cancelled') return false;

      // 1. Toekomst negeren
      if (orderDate > periodEnd) return false;

      // 2. Verleden: Alleen meenemen als NIET afgerond (Backlog)
      const isCompleted = ['completed', 'shipped', 'gereed', 'finished'].includes(status);
      if (orderDate < periodStart && isCompleted) return false;

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

    // Filter op afdeling als niet "ALLES"
    if (selectedDepartment !== "ALLES") {
      periodOrders = periodOrders.filter(order => {
        // Altijd meenemen als machine bij de afdeling hoort
        const machine = (order.machine || "").toUpperCase();
        const selDept = selectedDepartment.toUpperCase();
        if (selDept === "FITTINGS" && machine.startsWith("BH")) return true;
        if (selDept === "PIPES" && machine.startsWith("BA")) return true;
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
      const planCount = parseInt(order.plan || 0);
      totalPlannedUnits += planCount;

      // 1. Check eerst of er specifieke uren zijn geïmporteerd (Infor LN) - case-insensitive match
      let importedInfo = efficiencyData[order.orderId];
      if (!importedInfo && order.orderId) {
        // Probeer case-insensitive match
        const key = Object.keys(efficiencyData).find(k => k.toLowerCase() === order.orderId.toLowerCase());
        if (key) importedInfo = efficiencyData[key];
      }

      if (importedInfo && importedInfo.minutesPerUnit) {
        // Gebruik de geïmporteerde 'norm' per stuk
        const hoursNeeded = (importedInfo.minutesPerUnit * planCount) / 60;
        estimatedHours += hoursNeeded;
        ordersWithStandards++;
        hoursFromEfficiency += hoursNeeded;
        ordersWithEfficiency++;
      } else {
        // 2. Fallback: Zoek standaard tijd voor dit product op deze machine
        const standard = timeStandards.find(std => 
          std.itemCode === order.item && 
          std.machine === order.machine
        );

        if (standard && planCount > 0) {
          const hoursNeeded = (standard.standardMinutes * planCount) / 60;
          estimatedHours += hoursNeeded;
          ordersWithStandards++;
        } else if (planCount > 0) {
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

    // 1. Capaciteit per machine (Occupancy)
    occupancy.forEach(occ => {
      const occDate = new Date(occ.date);
      if (occDate < periodStart || occDate > periodEnd) return;
      
      // Filter by department
      if (selectedDepartment !== "ALLES" && !matchesDepartment(occ.departmentId, selectedDepartment)) return;

      const machine = normalizeMachine(occ.machineId || occ.machineName || "");
      if (!machine) return;
      
      if (!breakdown[machine]) breakdown[machine] = { capacity: 0, demand: 0 };
      breakdown[machine].capacity += parseFloat(occ.hoursWorked || occ.hours || 0);
    });

    // 2. Vraag per machine (Orders)
    planningOrders.forEach(order => {
      let orderDate = new Date();
      if (order.plannedDate) {
        if (order.plannedDate.toDate) orderDate = order.plannedDate.toDate();
        else orderDate = new Date(order.plannedDate);
      }

      const status = (order.status || '').toLowerCase();
      if (status === 'cancelled') return;

      // 1. Toekomst negeren
      if (orderDate > periodEnd) return;

      // 2. Verleden: Alleen meenemen als NIET afgerond (Backlog)
      const isCompleted = ['completed', 'shipped', 'gereed', 'finished'].includes(status);
      if (orderDate < periodStart && isCompleted) return;

      // Filter by department, maar neem altijd mee als machine bij afdeling hoort
      const machine = normalizeMachine(order.machine || "");
      if (!machine) return;
      const selDept = selectedDepartment.toUpperCase();
      if (selectedDepartment !== "ALLES") {
        if (!( (selDept === "FITTINGS" && machine.startsWith("BH")) || (selDept === "PIPES" && machine.startsWith("BA")) || matchesDepartment(order.departmentId, selectedDepartment) )) {
          return;
        }
      }

      if (!breakdown[machine]) breakdown[machine] = { capacity: 0, demand: 0 };

      let hoursNeeded = 0;
      // Case-insensitive efficiencyData lookup
      let importedInfo = efficiencyData[order.orderId];
      if (!importedInfo && order.orderId) {
        const key = Object.keys(efficiencyData).find(k => k.toLowerCase() === order.orderId.toLowerCase());
        if (key) importedInfo = efficiencyData[key];
      }
      const planCount = parseInt(order.plan || 0);

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
                if (!breakdown[postMachine]) breakdown[postMachine] = { capacity: 0, demand: 0 };
                breakdown[postMachine].demand += postHours;
            }
        } else if (importedInfo.minutesPerUnit) {
            // Fallback voor oude imports zonder splitsing
            hoursNeeded = (importedInfo.minutesPerUnit * planCount) / 60;
        }
      } else {
        const standard = timeStandards.find(std => 
          std.itemCode === order.item && 
          std.machine === order.machine
        );
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
        if (!breakdown[targetKey]) breakdown[targetKey] = { capacity: 0, demand: 0 };
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
        if (item.machine.includes("TEAMLEADER")) return false;
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
        if (isBHA) return -1;
        if (isBHB) return 1;
        
        // 2. Specifieke volgorde voor overige
        const priorityOrder = ["ALGEMEEN", "NABEWERK", "MAZAK", "LOSSEN"];
        
        const getPriority = (name) => {
          const idx = priorityOrder.findIndex(k => name.includes(k));
          return idx !== -1 ? idx : 999;
        };

        const prioA = getPriority(nameA);
        const prioB = getPriority(nameB);

        if (prioA !== prioB) return prioA - prioB;
        
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
  const exportToPDF = () => {
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
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* White Toolbar Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-col xl:flex-row justify-between items-center gap-4 shrink-0 z-30 shadow-sm">
        
        {/* Left Spacer for Centering (Desktop) */}
        <div className="hidden xl:block flex-1"></div>
        
        {/* Tabs Navigation */}
        <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto max-w-full no-scrollbar shrink-0 justify-center">
          {[
            { id: "capacity", label: "Capaciteit", icon: BarChart3 },
            { id: "efficiency", label: "Efficiency", icon: Activity },
            { id: "gantt", label: "Gantt", icon: LayoutDashboard },
            { id: "timetracking", label: "Time Tracking", icon: Clock },
            { id: "heatmap", label: "Heatmap", icon: BarChart2 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-slate-200 text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/60"
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Controls (Right) */}
        <div className="flex items-center gap-4 w-full xl:flex-1 justify-end">
          {activeTab === "capacity" && (
            <>
            {/* Department Filter */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-500 font-bold uppercase tracking-widest hidden sm:block">
                Afdeling:
              </label>
              {canChangeFilter ? (
                <div className="relative">
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 font-bold pr-8"
                  >
                    {departments.map(dept => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="bg-slate-100 border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold text-slate-700 flex items-center gap-2">
                  {selectedDepartment}
                  <span className="text-xs text-blue-500">(toegewezen)</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors text-xs font-bold"
              >
                <Upload size={16} />
                <span className="hidden sm:inline">Upload</span>
              </button>
              <button
                onClick={exportToPDF}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors text-xs font-bold"
              >
                <FileDown size={16} />
                <span className="hidden sm:inline">PDF</span>
              </button>
            </div>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === "capacity" && (
        <div className="p-6">
        <div className="max-w-7xl mx-auto space-y-6 w-full">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[40px] text-white relative overflow-hidden shadow-xl border border-white/5">
        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
          <BarChart3 size={150} />
        </div>
        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
                Capaciteits <span className="text-blue-400">Planning</span>
              </h2>
              <div className="flex items-center gap-4 mt-4">
                {/* Time Period Selector */}
                <div className="flex gap-2">
                  {[
                    { value: "week", label: "Week", icon: "📅" },
                    { value: "ytd", label: "YTD", icon: "📈" },
                    { value: "year", label: "Jaar", icon: "📊" },
                    { value: "future", label: "Toekomst", icon: "🔮" },
                    { value: "yoy", label: "YoY Vergelijking", icon: "📉" }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setTimePeriod(option.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        timePeriod === option.value
                          ? "bg-blue-500/30 border border-blue-400/50 text-white"
                          : "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      {option.icon} {option.label}
                    </button>
                  ))}
                </div>

                {/* Year Selector (voor YTD, Year, YoY) */}
                {["ytd", "year", "yoy"].includes(timePeriod) && (
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {[selectedYear, selectedYear - 1, selectedYear - 2].map(year => (
                      <option key={year} value={year} className="text-slate-900">
                        {year}
                      </option>
                    ))}
                  </select>
                )}

                {/* Comparison Year (voor YoY) */}
                {timePeriod === "yoy" && (
                  <>
                    <span className="text-xs text-slate-400">vs</span>
                    <select
                      value={comparisonYear}
                      onChange={(e) => setComparisonYear(parseInt(e.target.value))}
                      className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      {[selectedYear - 1, selectedYear - 2, selectedYear - 3].map(year => (
                        <option key={year} value={year} className="text-slate-900">
                          {year}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                {/* Week Navigator (alleen voor week view) */}
                {timePeriod === "week" && (
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      onClick={goToPreviousWeek}
                      className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-widest min-w-[200px] text-center">
                      {periodLabel}
                    </span>
                    <button
                      onClick={goToNextWeek}
                      className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}

                {/* Period Label (voor andere views) */}
                {timePeriod !== "week" && (
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-widest ml-auto">
                    {periodLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Totaal Beschikbare Uren */}
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <Users className="text-slate-600" size={24} />
            <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-black">
              Totaal
            </span>
          </div>
          <div className="text-4xl font-black text-slate-600 mb-2">
            {capacityMetrics.totalProductionHours}u
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
            Beschikbare Mens-uren
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Operators</span>
              <span className="font-bold">{capacityMetrics.operatorCount}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Overhead</span>
              <span className="font-bold">{capacityMetrics.overheadHours}u</span>
            </div>
          </div>
        </div>

        {/* Werkelijke Productie Uren (BH/BA) */}
        <div className="bg-white border-2 border-emerald-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <Activity className="text-emerald-600" size={24} />
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black">
              Productie
            </span>
          </div>
          <div className="text-4xl font-black text-emerald-600 mb-2">
            {capacityMetrics.realProductionHours}u
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
            BH/BA stations
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Ratio</span>
              <span className="font-bold">{capacityMetrics.productionRatio}%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Support</span>
              <span className="font-bold">{capacityMetrics.supportHours}u</span>
            </div>
          </div>
        </div>

        {/* Geplande Vraag */}
        <div className="bg-white border-2 border-blue-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <Calendar className="text-blue-600" size={24} />
            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-black">
              Planning
            </span>
          </div>
          <div className="text-4xl font-black text-blue-600 mb-2">
            {demandMetrics.estimatedHours}u
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
            Benodigde Order-uren
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Orders</span>
              <span className="font-bold">{demandMetrics.totalOrders}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Units</span>
              <span className="font-bold">{demandMetrics.totalPlannedUnits}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Met standaard</span>
              <span className="font-bold">{demandMetrics.ordersWithStandards}/{demandMetrics.totalOrders}</span>
            </div>
            {demandMetrics.hoursFromEfficiency > 0 && (
              <div className="flex justify-between text-xs pt-2 mt-2 border-t border-slate-100">
                <span className="text-purple-600 font-bold">Uit Efficiency</span>
                <span className="font-black text-purple-600">{demandMetrics.hoursFromEfficiency}u ({demandMetrics.ordersWithEfficiency})</span>
              </div>
            )}
          </div>
        </div>

        {/* Verschil */}
        <div className={`bg-white border-2 rounded-2xl p-6 ${
          gap.status === 'surplus' 
            ? 'border-emerald-200' 
            : 'border-rose-200'
        }`}>
          <div className="flex items-center justify-between mb-4">
            {gap.status === 'surplus' ? (
              <CheckCircle2 className="text-emerald-600" size={24} />
            ) : (
              <AlertTriangle className="text-rose-600" size={24} />
            )}
            <span className={`px-3 py-1 rounded-full text-xs font-black ${
              gap.status === 'surplus'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-700'
            }`}>
              {gap.status === 'surplus' ? 'Overschot' : 'Tekort'}
            </span>
          </div>
          <div className={`text-4xl font-black mb-2 ${
            gap.status === 'surplus' ? 'text-emerald-600' : 'text-rose-600'
          }`}>
            {gap.status === 'surplus' ? '+' : ''}{gap.hours}u
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
            {gap.status === 'surplus' ? 'Overcapaciteit' : 'Ondercapaciteit'}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Percentage</span>
              <span className={`font-black ${
                gap.status === 'surplus' ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {gap.percentage > 0 ? '+' : ''}{gap.percentage}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Machine Capaciteit Balans (NIEUW) */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4 flex items-center gap-2">
          <Activity size={18} />
          Machine Capaciteit Balans
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {machineBreakdown.map((item) => (
            <div 
              key={item.machine} 
              className={`p-4 rounded-xl border-2 ${
                item.status === 'shortage' 
                  ? 'bg-red-50 border-red-100' 
                  : 'bg-emerald-50 border-emerald-100'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-black text-slate-800 text-lg">{item.machine}</span>
                <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wider ${
                  item.status === 'shortage' 
                    ? 'bg-red-100 text-red-700' 
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {item.status === 'shortage' ? 'Tekort' : 'Overschot'}
                </span>
              </div>
              
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Beschikbaar (Mensen):</span>
                  <span className="font-bold text-slate-700">{item.capacity}u</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Nodig (Orders):</span>
                  <span className="font-bold text-slate-700">{item.demand}u</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Bezettingsgraad:</span>
                  <span className={`font-bold ${item.utilization > 100 ? 'text-red-600' : 'text-slate-700'}`}>
                    {item.utilization}%
                  </span>
                </div>
                <div className={`flex justify-between pt-2 border-t ${
                  item.status === 'shortage' ? 'border-red-200' : 'border-emerald-200'
                }`}>
                  <span className="font-black uppercase">Verschil:</span>
                  <span className={`font-black text-sm ${
                    item.status === 'shortage' ? 'text-red-600' : 'text-emerald-600'
                  }`}>
                    {item.gap > 0 ? '+' : ''}{item.gap}u
                  </span>
                </div>
              </div>
            </div>
          ))}
          
          {machineBreakdown.length === 0 && (
            <div className="col-span-full text-center py-8 text-slate-400 italic text-xs">
              Geen data beschikbaar voor deze periode/afdeling.
            </div>
          )}
        </div>
      </div>

      {/* Warnings */}
      {demandMetrics.ordersWithoutStandards > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-600 flex-shrink-0" size={20} />
            <div className="flex-1">
              <div className="text-sm font-bold text-amber-900">
                Ontbrekende Standaard Tijden
              </div>
              <div className="text-xs text-amber-700 mt-1">
                {demandMetrics.ordersWithoutStandards} orders hebben geen standaard productietijd ingesteld.
                {onNavigate ? (
                  <button onClick={() => onNavigate("production_standards")} className="underline font-bold hover:text-amber-900 ml-1">
                    Ga naar Productie Tijden
                  </button>
                ) : (
                  <span> Ga naar <strong>Productie Tijden</strong></span>
                )}
                 om deze toe te voegen voor nauwkeurigere capaciteitsberekening.
              </div>
              <button 
                onClick={() => setShowMissingStandards(!showMissingStandards)}
                className="flex items-center gap-1 text-xs font-bold text-amber-800 mt-2 hover:text-amber-900 transition-colors"
              >
                {showMissingStandards ? "Verberg lijst" : "Toon lijst"} 
                {showMissingStandards ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          </div>

          {showMissingStandards && (
            <div className="bg-white/60 rounded-xl border border-amber-200 overflow-hidden animate-in slide-in-from-top-2">
              <div className="max-h-60 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-xs">
                  <thead className="bg-amber-100/50 text-amber-900 font-bold sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Order</th>
                      <th className="px-3 py-2">Item Code</th>
                      <th className="px-3 py-2">Omschrijving</th>
                      <th className="px-3 py-2">Machine</th>
                      <th className="px-3 py-2 text-right">Aantal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {demandMetrics.missingStandardsList.map(order => (
                      <tr key={order.id} className="hover:bg-amber-50/50 transition-colors">
                        <td className="px-3 py-2 font-mono font-bold text-amber-800">{order.orderId}</td>
                        <td className="px-3 py-2 font-mono text-amber-900">{order.itemCode || "-"}</td>
                        <td className="px-3 py-2 text-amber-900 truncate max-w-[150px]" title={order.item}>{order.item}</td>
                        <td className="px-3 py-2 text-amber-800">{order.machine}</td>
                        <td className="px-3 py-2 text-right text-amber-900 font-bold">{order.plan}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4 flex items-center gap-2">
          <Target size={18} />
          Aanbevelingen
        </h3>
        <div className="space-y-3">
          {gap.status === 'shortage' ? (
            <>
              <div className="flex items-start gap-3 p-3 bg-rose-50 rounded-xl">
                <AlertTriangle className="text-rose-600 flex-shrink-0 mt-0.5" size={16} />
                <div className="text-xs">
                  <div className="font-bold text-rose-900">Onderbezetting</div>
                  <div className="text-rose-700 mt-1">
                    Er zijn {Math.abs(gap.hours)} uur te weinig. Overweeg extra shifts, overuren, of herplan niet-kritische orders.
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3 p-3 bg-emerald-50 rounded-xl">
                <CheckCircle2 className="text-emerald-600 flex-shrink-0 mt-0.5" size={16} />
                <div className="text-xs">
                  <div className="font-bold text-emerald-900">Capaciteit Beschikbaar</div>
                  <div className="text-emerald-700 mt-1">
                    Er zijn {gap.hours} uur over. Mogelijkheden: extra orders aannemen, preventief onderhoud, training, of proces optimalisatie.
                  </div>
                </div>
              </div>
            </>
          )}
          
          {capacityMetrics.efficiency < 70 && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl">
              <Zap className="text-amber-600 flex-shrink-0 mt-0.5" size={16} />
              <div className="text-xs">
                <div className="font-bold text-amber-900">Lage Efficiency</div>
                <div className="text-amber-700 mt-1">
                  Slechts {capacityMetrics.efficiency}% van de tijd wordt productief gebruikt. 
                  Analyseer waar tijd verloren gaat: setup, wachttijden, materiaal tekorten?
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4">
            Uren Verdeling
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Productie (BH/BA)</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${capacityMetrics.productionRatio}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-16 text-right">
                  {capacityMetrics.realProductionHours}u
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Support</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-slate-400 rounded-full"
                    style={{ width: `${100 - capacityMetrics.productionRatio}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-16 text-right">
                  {capacityMetrics.supportHours}u
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-600">Overhead</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${100 - capacityMetrics.efficiency}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-16 text-right">
                  {capacityMetrics.overheadHours}u
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4">
            Planning Status
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Infor LN (Efficiency)</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 rounded-full"
                    style={{ 
                      width: `${demandMetrics.totalOrders > 0 
                        ? (demandMetrics.ordersWithEfficiency / demandMetrics.totalOrders) * 100 
                        : 0}%` 
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-12 text-right">
                  {demandMetrics.ordersWithEfficiency}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Standaard DB</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full"
                    style={{ 
                      width: `${demandMetrics.totalOrders > 0 
                        ? ((demandMetrics.ordersWithStandards - demandMetrics.ordersWithEfficiency) / demandMetrics.totalOrders) * 100 
                        : 0}%` 
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-12 text-right">
                  {demandMetrics.ordersWithStandards - demandMetrics.ordersWithEfficiency}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Zonder data</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 rounded-full"
                    style={{ 
                      width: `${demandMetrics.totalOrders > 0 
                        ? (demandMetrics.ordersWithoutStandards / demandMetrics.totalOrders) * 100 
                        : 0}%` 
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-12 text-right">
                  {demandMetrics.ordersWithoutStandards}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Knelpunten Analyse */}
      {bottlenecks.length > 0 && (
        <div className="bg-white border-2 border-red-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="text-red-600" size={20} />
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
              Geïdentificeerde Knelpunten
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {bottlenecks.map((bottleneck, idx) => {
              const Icon = bottleneck.icon;
              return (
                <div key={idx} className={`p-4 rounded-xl border-2 ${
                  bottleneck.severity === 'high' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                }`}>
                  <div className="flex items-start gap-3">
                    <Icon className={bottleneck.color} size={20} />
                    <div className="flex-1">
                      <div className="font-bold text-sm text-slate-800">{bottleneck.title}</div>
                      <div className="text-xs text-slate-600 mt-1">{bottleneck.description}</div>
                      <div className={`text-xs font-bold mt-2 ${
                        bottleneck.severity === 'high' ? 'text-red-600' : 'text-amber-600'
                      }`}>
                        Prioriteit: {bottleneck.severity.toUpperCase()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Voorspelling */}
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="text-purple-600" size={20} />
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
            Voorspelling Volgende Week
          </h3>
          <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full font-bold">
            BETA
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-4 border border-purple-100">
            <div className="text-xs text-slate-600 uppercase tracking-wider mb-1">Verwachte Vraag</div>
            <div className="text-2xl font-black text-purple-600">{prediction.nextWeekDemand}u</div>
            <div className="text-xs text-slate-500 mt-1">+10% trend groei</div>
          </div>
          
          <div className="bg-white rounded-xl p-4 border border-purple-100">
            <div className="text-xs text-slate-600 uppercase tracking-wider mb-1">Voorspeld Verschil</div>
            <div className={`text-2xl font-black ${prediction.nextWeekGap >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {prediction.nextWeekGap}u
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {prediction.trend === 'increasing_pressure' ? '⚠️ Toenemende druk' : '✓ Beheersbaar'}
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-4 border border-purple-100">
            <div className="text-xs text-slate-600 uppercase tracking-wider mb-1">Betrouwbaarheid</div>
            <div className={`text-2xl font-black ${
              prediction.confidence === 'high' ? 'text-emerald-600' : 
              prediction.confidence === 'medium' ? 'text-amber-600' : 'text-slate-400'
            }`}>
              {prediction.confidence === 'high' ? 'Hoog' : prediction.confidence === 'medium' ? 'Middel' : 'Laag'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {demandMetrics.ordersWithStandards > 0 ? `${demandMetrics.ordersWithStandards} orders met data` : 'Onvoldoende data'}
            </div>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
          <div className="flex items-start gap-2">
            <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={14} />
            <div className="text-xs text-blue-800">
              <strong>Let op:</strong> Deze voorspelling is gebaseerd op historische trends en aannames. 
              Gebruik dit als indicatie, niet als absolute waarheid. Houd rekening met seizoensinvloeden, 
              geplande stilstand, en externe factoren.
            </div>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      <CapacityImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          console.log("Uren geïmporteerd");
        }}
      />
      </div>
      </div>
      )}
      
      {activeTab === "efficiency" && <EfficiencyDashboard />}
      {activeTab === "gantt" && <GanttChartView />}
      {activeTab === "timetracking" && <TimeTrackingView />}
      {activeTab === "heatmap" && <WorkloadHeatmapView />}
    </div>
    </div>
  );
};

export default CapacityPlanningView;
