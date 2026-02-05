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
  Brain
} from "lucide-react";
import { collection, query, where, getDocs, onSnapshot, doc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { getISOWeek, startOfISOWeek, endOfISOWeek, format, subWeeks, addWeeks, startOfDay, endOfDay, startOfYear, endOfYear, subYears, isAfter, isBefore } from "date-fns";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import jsPDF from "jspdf";
import "jspdf-autotable";

/**
 * CapacityPlanningView
 * Vergelijkt beschikbare productie-uren met geplande uren
 * Toont het verschil tussen capaciteit en demand
 */
const CapacityPlanningView = () => {
  const { user, role, isAdmin } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [occupancy, setOccupancy] = useState([]);
  const [planningOrders, setPlanningOrders] = useState([]);
  const [timeStandards, setTimeStandards] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(new Date());
  const [selectedDepartment, setSelectedDepartment] = useState("ALLES");
  const [departments, setDepartments] = useState(["ALLES"]);
  const [factoryConfig, setFactoryConfig] = useState({ departments: [] });
  const [timePeriod, setTimePeriod] = useState("week"); // "week", "ytd", "year", "future", "yoy"
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [comparisonYear, setComparisonYear] = useState(new Date().getFullYear() - 1);

  // Auto-filter voor teamleaders
  const isTeamleader = role === "teamleader";
  const userDepartment = user?.department;
  const canChangeFilter = isAdmin || role === "engineer" || !isTeamleader;

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
    if (filterDepartmentName === "ALLES") return true;
    if (!departmentId) return false;
    
    // Zoek department in factory config via id
    const dept = factoryConfig.departments?.find(d => d.id === departmentId);
    if (!dept) return false;
    
    const deptName = dept.name.toLowerCase().trim();
    const filter = filterDepartmentName.toLowerCase().trim();
    
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
    if (isTeamleader && userDepartment) {
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
  }, [isTeamleader, userDepartment, departments]);

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
      const hours = parseFloat(occ.hoursWorked || 0);
      totalProductionHours += hours;
      
      // Check of station BH of BA is (werkelijke productie)
      const machineId = (occ.machineId || "").toUpperCase();
      if (machineId.startsWith("BH") || machineId.startsWith("BA")) {
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
      const orderDate = order.plannedDate ? new Date(order.plannedDate) : new Date();
      return orderDate >= periodStart && orderDate <= periodEnd;
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
        return matchesDepartment(order.departmentId, selectedDepartment);
      });
    }

    let totalPlannedUnits = 0;
    let estimatedHours = 0;
    let ordersWithStandards = 0;
    let ordersWithoutStandards = 0;

    periodOrders.forEach(order => {
      const planCount = parseInt(order.plan || 0);
      totalPlannedUnits += planCount;

      // Zoek standaard tijd voor dit product op deze machine
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
      }
    });

    return {
      totalPlannedUnits,
      estimatedHours: Math.round(estimatedHours * 10) / 10,
      ordersWithStandards,
      ordersWithoutStandards,
      totalOrders: periodOrders.length
    };
  }, [planningOrders, timeStandards, periodStart, periodEnd, selectedDepartment, factoryConfig, timePeriod]);

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
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
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
                
                {/* Action Buttons */}
                <button
                  onClick={exportToPDF}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 rounded-lg transition-colors text-xs font-bold ml-4"
                >
                  <FileDown size={14} />
                  PDF Export
                </button>
              </div>
            </div>
            
            {/* Department Filter */}
            <div className="flex items-center gap-2 mt-4">
              <label className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                Afdeling:
              </label>
              {canChangeFilter ? (
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {departments.map(dept => (
                    <option key={dept} value={dept} className="text-slate-900">
                      {dept}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-sm font-bold text-white flex items-center gap-2">
                  {selectedDepartment}
                  <span className="text-xs text-blue-300">(toegewezen)</span>
                </div>
              )}
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
            Alle uren
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
            Geplande uren
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

      {/* Warnings */}
      {demandMetrics.ordersWithoutStandards > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-amber-600 flex-shrink-0" size={20} />
          <div>
            <div className="text-sm font-bold text-amber-900">
              Ontbrekende Standaard Tijden
            </div>
            <div className="text-xs text-amber-700 mt-1">
              {demandMetrics.ordersWithoutStandards} orders hebben geen standaard productietijd ingesteld.
              Ga naar <strong>Productie Tijden</strong> om deze toe te voegen voor nauwkeurigere capaciteitsberekening.
            </div>
          </div>
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
              <span className="text-xs text-slate-600">Met standaard</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full"
                    style={{ 
                      width: `${demandMetrics.totalOrders > 0 
                        ? (demandMetrics.ordersWithStandards / demandMetrics.totalOrders) * 100 
                        : 0}%` 
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-16 text-right">
                  {demandMetrics.ordersWithStandards}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Zonder standaard</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 rounded-full"
                    style={{ 
                      width: `${demandMetrics.totalOrders > 0 
                        ? (demandMetrics.ordersWithoutStandards / demandMetrics.totalOrders) * 100 
                        : 0}%` 
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-800 w-16 text-right">
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
    </div>
  );
};

export default CapacityPlanningView;
