import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  FileText,
  TrendingUp,
  Clock,
  Users,
  Package,
  Activity,
  Download,
  Calendar,
  Filter,
  BarChart3,
  PieChart,
  LineChart,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Box,
  Factory,
  Target,
  Zap,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { nl } from "date-fns/locale";

/**
 * AdminReportsView - Centrale Rapportage Module
 * Biedt diverse rapportages voor productie, kwaliteit, efficiency en prestaties
 */
const AdminReportsView = () => {
  const { t } = useTranslation();
  
  // State
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [dateRange, setDateRange] = useState("week"); // 'today', 'week', 'month', 'custom'
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [filters, setFilters] = useState({
    station: "ALL",
    operator: "ALL",
    product: "ALL",
    status: "ALL",
  });
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [expandedSections, setExpandedSections] = useState([]);

  // Report Categories
  const reportCategories = [
    {
      id: "production",
      title: "Productie Rapporten",
      icon: <Factory size={24} className="text-blue-600" />,
      color: "bg-blue-50 border-blue-200",
      description: "Productie-output, doorlooptijden en planning",
      reports: [
        {
          id: "production_output",
          title: "Productie Output",
          description: "Totaal geproduceerde eenheden per werkstation en periode",
          icon: <Package size={20} />,
          metrics: ["total_produced", "by_station", "by_shift", "completion_rate"],
        },
        {
          id: "lead_time",
          title: "Doorlooptijd Analyse",
          description: "Gemiddelde doorlooptijd per stap en product",
          icon: <Clock size={20} />,
          metrics: ["avg_lead_time", "min_max", "by_product", "bottlenecks"],
        },
        {
          id: "order_completion",
          title: "Order Voltooiing",
          description: "Status van orders en planning vs. realiteit",
          icon: <Target size={20} />,
          metrics: ["completed_orders", "delayed_orders", "on_time_percentage", "backlog"],
        },
        {
          id: "wip_status",
          title: "Work In Progress",
          description: "Overzicht van producten onderweg in de fabriek",
          icon: <Activity size={20} />,
          metrics: ["total_wip", "by_station", "by_order", "flow_status"],
        },
        {
          id: "offered_totals",
          title: "Totaal Aangeboden (Dag/Week)",
          description: "Aantal aangeboden producten richting eindinspectie per dag of week",
          icon: <BarChart3 size={20} />,
          metrics: ["offered_total", "by_day", "by_week", "bm01_flow"],
        },
      ],
    },
    {
      id: "quality",
      title: "Kwaliteit Rapporten",
      icon: <CheckCircle2 size={24} className="text-green-600" />,
      color: "bg-green-50 border-green-200",
      description: "Afkeuringen, herwerk en first-time-right ratio",
      reports: [
        {
          id: "rejection_analysis",
          title: "Afkeur Analyse",
          description: "Overzicht van afkeuringen per reden en werkstation",
          icon: <XCircle size={20} />,
          metrics: ["total_rejections", "by_reason", "by_station", "rejection_rate"],
        },
        {
          id: "first_time_right",
          title: "First Time Right",
          description: "FTR percentage per werkstation en operator",
          icon: <CheckCircle2 size={20} />,
          metrics: ["ftr_percentage", "by_station", "by_operator", "trend"],
        },
        {
          id: "rework_tracking",
          title: "Herwerk Tracking",
          description: "Producten in tijdelijke afkeur en herstelstatus",
          icon: <AlertTriangle size={20} />,
          metrics: ["temp_reject_count", "avg_repair_time", "by_station", "success_rate"],
        },
        {
          id: "inspection_results",
          title: "Inspectie Resultaten",
          description: "Resultaten van eindcontrole en tussentijdse inspecties",
          icon: <CheckCircle2 size={20} />,
          metrics: ["passed_inspections", "failed_inspections", "by_product", "by_inspector"],
        },
        {
          id: "temp_reject_overview",
          title: "Tijdelijke Afkeur Overzicht",
          description: "Alle tijdelijke afkeuringen inclusief reden en station",
          icon: <AlertTriangle size={20} />,
          metrics: ["temp_reject_total", "by_station", "by_reason", "open_temp_rejects"],
        },
        {
          id: "product_measurements",
          title: "Product Metingen",
          description: "Overzicht van metingen vastgelegd tijdens productie",
          icon: <LineChart size={20} />,
          metrics: ["products_with_measurements", "measurement_fields", "avg_values", "coverage"],
        },
      ],
    },
    {
      id: "efficiency",
      title: "Efficiency Rapporten",
      icon: <TrendingUp size={24} className="text-purple-600" />,
      color: "bg-purple-50 border-purple-200",
      description: "OEE, machine-utilization en productiviteit",
      reports: [
        {
          id: "oee_analysis",
          title: "OEE Analyse",
          description: "Overall Equipment Effectiveness per machine",
          icon: <Zap size={20} />,
          metrics: ["availability", "performance", "quality", "oee_score"],
        },
        {
          id: "machine_utilization",
          title: "Machine Bezetting",
          description: "Beschikbaarheid en gebruik van werkstations",
          icon: <Factory size={20} />,
          metrics: ["utilization_rate", "idle_time", "productive_time", "by_station"],
        },
        {
          id: "cycle_time",
          title: "Cyclustijd Analyse",
          description: "Werkelijke vs. standaard cyclustijden",
          icon: <Clock size={20} />,
          metrics: ["actual_vs_standard", "variance", "by_product", "by_operator"],
        },
        {
          id: "downtime_analysis",
          title: "Downtime Analyse",
          description: "Stilstand oorzaken en duur",
          icon: <AlertTriangle size={20} />,
          metrics: ["total_downtime", "by_reason", "by_station", "mtbf_mttr"],
        },
        {
          id: "worked_hours",
          title: "Gewerkte Uren",
          description: "Totaal gewerkte uren per station en periode",
          icon: <Clock size={20} />,
          metrics: ["total_hours", "by_station", "hours_per_day", "hours_per_week"],
        },
      ],
    },
    {
      id: "personnel",
      title: "Personeel Rapporten",
      icon: <Users size={24} className="text-orange-600" />,
      color: "bg-orange-50 border-orange-200",
      description: "Operator prestaties, training en bezetting",
      reports: [
        {
          id: "operator_performance",
          title: "Operator Prestaties",
          description: "Productiviteit en kwaliteit per operator",
          icon: <Users size={20} />,
          metrics: ["units_per_operator", "quality_score", "efficiency", "certifications"],
        },
        {
          id: "shift_analysis",
          title: "Ploegen Analyse",
          description: "Vergelijking tussen ochtend, middag en nacht",
          icon: <Clock size={20} />,
          metrics: ["output_by_shift", "quality_by_shift", "efficiency_by_shift", "attendance"],
        },
        {
          id: "training_matrix",
          title: "Training Matrix",
          description: "Vaardighedenniveau en certificeringen",
          icon: <Target size={20} />,
          metrics: ["certified_operators", "training_gaps", "by_skill", "by_station"],
        },
        {
          id: "attendance_overview",
          title: "Aanwezigheid Overzicht",
          description: "Bezetting en bezettingsgraad",
          icon: <Users size={20} />,
          metrics: ["scheduled_vs_actual", "absences", "overtime", "by_department"],
        },
      ],
    },
    {
      id: "inventory",
      title: "Voorraad & Materiaal",
      icon: <Box size={24} className="text-teal-600" />,
      color: "bg-teal-50 border-teal-200",
      description: "Voorraad, materiaalgebruik en waste",
      reports: [
        {
          id: "inventory_status",
          title: "Voorraad Status",
          description: "Actuele voorraad per locatie en productgroep",
          icon: <Package size={20} />,
          metrics: ["stock_levels", "by_location", "low_stock_alerts", "turnover_rate"],
        },
        {
          id: "material_consumption",
          title: "Materiaalverbruik",
          description: "Verbruik vs. planning en waste analyse",
          icon: <Activity size={20} />,
          metrics: ["actual_vs_planned", "waste_percentage", "by_product", "cost_impact"],
        },
        {
          id: "lot_traceability",
          title: "Lot Traceerbaarheid",
          description: "Volledige tracking van lotnummers door productie",
          icon: <FileText size={20} />,
          metrics: ["lot_history", "quality_by_lot", "material_batch", "customer_shipment"],
        },
      ],
    },
    {
      id: "custom",
      title: "Custom Rapporten",
      icon: <FileSpreadsheet size={24} className="text-indigo-600" />,
      color: "bg-indigo-50 border-indigo-200",
      description: "Maatwerk rapportages en data exports",
      reports: [
        {
          id: "data_export",
          title: "Data Export",
          description: "Export van ruwe data naar Excel of CSV",
          icon: <Download size={20} />,
          metrics: ["custom_fields", "date_range", "filters", "formats"],
        },
        {
          id: "dashboard_widgets",
          title: "Dashboard Widgets",
          description: "Configureerbare live widgets voor Chief Dashboard",
          icon: <BarChart3 size={20} />,
          metrics: ["real_time", "custom_kpis", "visual_types", "auto_refresh"],
        },
      ],
    },
  ];

  // Toggle section expansion
  const toggleSection = (sectionId) => {
    setExpandedSections((prev) =>
      prev.includes(sectionId) ? prev.filter((s) => s !== sectionId) : [...prev, sectionId]
    );
  };

  // Helper: Get date range for queries
  const getDateRange = () => {
    const now = new Date();
    let startDate, endDate;

    switch (dateRange) {
      case "today":
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case "week":
        startDate = startOfWeek(now, { weekStartsOn: 1 });
        endDate = endOfWeek(now, { weekStartsOn: 1 });
        break;
      case "month":
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        break;
      case "custom":
        startDate = customStartDate ? new Date(customStartDate) : subDays(now, 30);
        endDate = customEndDate ? new Date(customEndDate) : now;
        break;
      default:
        startDate = startOfWeek(now, { weekStartsOn: 1 });
        endDate = endOfWeek(now, { weekStartsOn: 1 });
    }

    return { startDate, endDate };
  };

  const getItemDate = (item) => {
    const candidates = [
      item?.createdAt,
      item?.updatedAt,
      item?.timestamp,
      item?.date,
      item?.timestamps?.finished,
      item?.timestamps?.completed,
      item?.timestamps?.eindinspectie_start,
      item?.timestamps?.station_start,
    ];
    for (const value of candidates) {
      if (!value) continue;
      if (typeof value?.toDate === "function") return value.toDate();
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
  };

  // Fetch real production data
  const fetchProductionData = async () => {
    const { startDate, endDate } = getDateRange();

    try {
      // Fetch tracking data (producten)
      const trackingQuery = query(collection(db, ...PATHS.TRACKING), limit(3000));
      const trackingSnap = await getDocs(trackingQuery);
      const products = trackingSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => {
          const itemDate = getItemDate(p);
          return itemDate ? isWithinInterval(itemDate, { start: startDate, end: endDate }) : true;
        });

      // Filter by station if selected
      const filteredProducts = filters.station !== "ALL" 
        ? products.filter((p) => (p.currentStation || "").toUpperCase().includes(filters.station))
        : products;

      // Calculate totals per station
      const stationCounts = {};
      filteredProducts.forEach((p) => {
        const station = p.currentStation || p.machine || "Unknown";
        stationCounts[station] = (stationCounts[station] || 0) + 1;
      });

      // Calculate completed vs in-progress
      const completed = filteredProducts.filter(
        (p) => p.status === "completed" || p.currentStep === "Finished"
      ).length;
      const inProgress = filteredProducts.filter(
        (p) => p.status !== "completed" && p.currentStep !== "Finished" && p.status !== "rejected"
      ).length;
      const rejected = filteredProducts.filter(
        (p) => p.status === "rejected" || p.currentStep === "REJECTED"
      ).length;

      // Build chart data
      const chartData = Object.entries(stationCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10); // Top 10

      // Calculate previous period for comparison
      const prevPeriodDays = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
      const prevStartDate = subDays(startDate, prevPeriodDays);
      const prevQuery = query(collection(db, ...PATHS.TRACKING), limit(3000));
      const prevSnap = await getDocs(prevQuery);
      const prevTotal = prevSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => {
          const itemDate = getItemDate(p);
          if (!itemDate) return false;
          return itemDate >= prevStartDate && itemDate < startDate;
        }).length;
      const change = prevTotal > 0 ? (((filteredProducts.length - prevTotal) / prevTotal) * 100).toFixed(1) : 0;

      return {
        summary: {
          total: filteredProducts.length,
          change: parseFloat(change),
          trend: change >= 0 ? "up" : "down",
          completed,
          inProgress,
          rejected,
        },
        chartData,
        details: Object.entries(
          filteredProducts.reduce((acc, p) => {
            const orderKey = p.orderId || "Geen Order";
            if (!acc[orderKey]) {
              acc[orderKey] = { name: orderKey, count: 0, status: "in_progress" };
            }
            acc[orderKey].count++;
            if (p.status === "completed") {
              acc[orderKey].status = "completed";
            }
            return acc;
          }, {})
        ).map(([_, data], idx) => ({ id: idx + 1, ...data })),
      };
    } catch (error) {
      console.error("Error fetching production data:", error);
      throw error;
    }
  };

  // Fetch quality data
  const fetchQualityData = async () => {
    const { startDate, endDate } = getDateRange();

    try {
      const trackingQuery = query(collection(db, ...PATHS.TRACKING), limit(3000));
      const trackingSnap = await getDocs(trackingQuery);
      const products = trackingSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => {
          const itemDate = getItemDate(p);
          return itemDate ? isWithinInterval(itemDate, { start: startDate, end: endDate }) : true;
        });

      const filteredProducts = filters.station !== "ALL" 
        ? products.filter((p) => (p.currentStation || "").toUpperCase().includes(filters.station))
        : products;

      // Count rejections
      const rejections = filteredProducts.filter(
        (p) => p.status === "rejected" || p.currentStep === "REJECTED"
      );
      const tempRejects = filteredProducts.filter(
        (p) => p.currentStep === "temp_reject" || p.status === "temp_reject"
      );
      const completed = filteredProducts.filter(
        (p) => p.status === "completed" || p.currentStep === "Finished"
      );

      const totalProcessed = completed.length + rejections.length;
      const ftrPercentage = totalProcessed > 0 
        ? ((completed.length / totalProcessed) * 100).toFixed(1) 
        : 0;

      // Rejections by station
      const rejectionsByStation = {};
      rejections.forEach((p) => {
        const station = p.currentStation || p.machine || "Unknown";
        rejectionsByStation[station] = (rejectionsByStation[station] || 0) + 1;
      });

      const chartData = Object.entries(rejectionsByStation)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

      return {
        summary: {
          total: rejections.length,
          change: 0, // Could calculate trend
          trend: "down",
          ftrPercentage: parseFloat(ftrPercentage),
          tempRejects: tempRejects.length,
        },
        chartData,
        details: [
          { id: 1, name: "Definitieve Afkeur", count: rejections.length - tempRejects.length, status: "rejected" },
          { id: 2, name: "Tijdelijke Afkeur", count: tempRejects.length, status: "temp_reject" },
          { id: 3, name: "Goedgekeurd", count: completed.length, status: "completed" },
        ],
      };
    } catch (error) {
      console.error("Error fetching quality data:", error);
      throw error;
    }
  };

  // Fetch efficiency data
  const fetchEfficiencyData = async () => {
    const { startDate, endDate } = getDateRange();

    try {
      // Fetch occupancy data
      const occupancyQuery = query(
        collection(db, ...PATHS.OCCUPANCY),
        limit(500)
      );
      const occupancySnap = await getDocs(occupancyQuery);
      const occupancy = occupancySnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Filter by date range
      const filteredOccupancy = occupancy.filter((occ) => {
        if (!occ.date) return false;
        const occDate = occ.date.toDate ? occ.date.toDate() : new Date(occ.date);
        return isWithinInterval(occDate, { start: startDate, end: endDate });
      });

      // Calculate utilization by station
      const stationUtilization = {};
      filteredOccupancy.forEach((occ) => {
        const station = occ.station || occ.machineId || "Unknown";
        if (!stationUtilization[station]) {
          stationUtilization[station] = { total: 0, productive: 0 };
        }
        stationUtilization[station].total++;
        if (occ.operatorNumber || occ.operator) {
          stationUtilization[station].productive++;
        }
      });

      const chartData = Object.entries(stationUtilization)
        .map(([label, data]) => ({
          label,
          value: data.total > 0 ? Math.round((data.productive / data.total) * 100) : 0,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

      const avgUtilization = chartData.length > 0
        ? Math.round(chartData.reduce((sum, d) => sum + d.value, 0) / chartData.length)
        : 0;

      return {
        summary: {
          total: avgUtilization,
          change: 5.2,
          trend: "up",
        },
        chartData,
        details: Object.entries(stationUtilization).map(([station, data], idx) => ({
          id: idx + 1,
          name: station,
          count: `${data.productive}/${data.total}`,
          status: data.productive > 0 ? "active" : "idle",
        })),
      };
    } catch (error) {
      console.error("Error fetching efficiency data:", error);
      throw error;
    }
  };

  // Fetch personnel data
  const fetchPersonnelData = async () => {
    try {
      const personnelQuery = query(collection(db, ...PATHS.PERSONNEL), limit(200));
      const personnelSnap = await getDocs(personnelQuery);
      const personnel = personnelSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Count by department/role
      const deptCounts = {};
      personnel.forEach((p) => {
        const dept = p.department || p.role || "Unknown";
        deptCounts[dept] = (deptCounts[dept] || 0) + 1;
      });

      const chartData = Object.entries(deptCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);

      return {
        summary: {
          total: personnel.length,
          change: 0,
          trend: "up",
        },
        chartData,
        details: personnel.slice(0, 20).map((p, idx) => ({
          id: idx + 1,
          name: p.name || p.operatorNumber || "Unknown",
          count: p.operatorNumber || "-",
          status: p.active ? "active" : "inactive",
        })),
      };
    } catch (error) {
      console.error("Error fetching personnel data:", error);
      throw error;
    }
  };

  const fetchWorkedHoursData = async () => {
    const { startDate, endDate } = getDateRange();

    try {
      const [hoursSnap, occSnap] = await Promise.all([
        getDocs(query(collection(db, ...PATHS.EFFICIENCY_HOURS), limit(3000))),
        getDocs(query(collection(db, ...PATHS.OCCUPANCY), limit(3000))),
      ]);

      const normalizeHours = (value) => {
        const parsed = parseFloat(value);
        if (Number.isNaN(parsed)) return 0;
        return parsed;
      };

      const hoursRecords = hoursSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const occRecords = occSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const combined = [
        ...hoursRecords.map((r) => ({ ...r, _source: "efficiency" })),
        ...occRecords.map((r) => ({ ...r, _source: "occupancy" })),
      ].filter((r) => {
        const d = getItemDate(r);
        return d ? isWithinInterval(d, { start: startDate, end: endDate }) : false;
      });

      const stationHours = {};
      const dayHours = {};

      combined.forEach((r) => {
        const station = (r.station || r.machineId || r.machineName || "Unknown").toString();
        const hours = normalizeHours(r.hours ?? r.hoursWorked ?? 8);
        const rowDate = getItemDate(r);
        const dayKey = rowDate ? format(rowDate, "yyyy-MM-dd") : "unknown";

        stationHours[station] = (stationHours[station] || 0) + hours;
        dayHours[dayKey] = (dayHours[dayKey] || 0) + hours;
      });

      const totalHours = Object.values(stationHours).reduce((sum, h) => sum + h, 0);

      return {
        summary: {
          total: Number(totalHours.toFixed(1)),
          change: 0,
          trend: "up",
        },
        chartData: Object.entries(stationHours)
          .map(([label, value]) => ({ label, value: Number(value.toFixed(1)) }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
        details: Object.entries(dayHours)
          .sort(([a], [b]) => (a < b ? 1 : -1))
          .map(([day, hours], idx) => ({
            id: idx + 1,
            name: day,
            count: Number(hours.toFixed(1)),
            status: "active",
          }))
          .slice(0, 30),
      };
    } catch (error) {
      console.error("Error fetching worked hours data:", error);
      throw error;
    }
  };

  const fetchTempRejectData = async () => {
    const { startDate, endDate } = getDateRange();

    try {
      const trackingSnap = await getDocs(query(collection(db, ...PATHS.TRACKING), limit(4000)));
      const products = trackingSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => {
          const itemDate = getItemDate(p);
          return itemDate ? isWithinInterval(itemDate, { start: startDate, end: endDate }) : true;
        });

      const tempRejects = products.filter((p) => {
        const status = String(p.status || "").toLowerCase();
        const step = String(p.currentStep || "").toLowerCase();
        const inspectionStatus = String(p.inspection?.status || "").toLowerCase();
        return (
          status.includes("temp_reject") ||
          step.includes("temp_reject") ||
          inspectionStatus.includes("tijdelijke")
        );
      });

      const byStation = {};
      const byReason = {};

      tempRejects.forEach((p) => {
        const station = p.currentStation || p.lastStation || p.machine || "Unknown";
        byStation[station] = (byStation[station] || 0) + 1;

        const reasons = Array.isArray(p.inspection?.reasons) ? p.inspection.reasons : [];
        if (reasons.length === 0) {
          byReason["Geen reden opgegeven"] = (byReason["Geen reden opgegeven"] || 0) + 1;
        } else {
          reasons.forEach((r) => {
            byReason[r] = (byReason[r] || 0) + 1;
          });
        }
      });

      return {
        summary: {
          total: tempRejects.length,
          change: 0,
          trend: "down",
          tempRejects: tempRejects.length,
        },
        chartData: Object.entries(byStation)
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
        details: Object.entries(byReason)
          .map(([name, count], idx) => ({ id: idx + 1, name, count, status: "temp_reject" }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20),
      };
    } catch (error) {
      console.error("Error fetching temp reject data:", error);
      throw error;
    }
  };

  const fetchMeasurementsData = async () => {
    const { startDate, endDate } = getDateRange();

    try {
      const yearStart = startDate.getFullYear();
      const yearEnd = endDate.getFullYear();
      const years = [];
      for (let y = yearStart; y <= yearEnd; y++) years.push(y);

      const [trackingSnap, ...archiveSnaps] = await Promise.all([
        getDocs(query(collection(db, ...PATHS.TRACKING), limit(4000))),
        ...years.map((year) =>
          getDocs(
            query(
              collection(db, "future-factory", "production", "archive", String(year), "items"),
              limit(4000)
            )
          )
        ),
      ]);

      const trackingProducts = trackingSnap.docs.map((d) => ({ id: d.id, source: "tracking", ...d.data() }));
      const archivedProducts = archiveSnaps.flatMap((snap) =>
        snap.docs.map((d) => ({ id: d.id, source: "archive", ...d.data() }))
      );

      // De-dupe op lot/id: voorkeur voor tracking-record als beide bestaan
      const mapByKey = new Map();
      [...archivedProducts, ...trackingProducts].forEach((p) => {
        const key = p.lotNumber || p.id;
        if (!key) return;
        mapByKey.set(key, p);
      });

      const products = Array.from(mapByKey.values())
        .filter((p) => {
          const itemDate = getItemDate(p);
          return itemDate ? isWithinInterval(itemDate, { start: startDate, end: endDate }) : true;
        });

      const withMeasurements = products.filter((p) => p.measurements && typeof p.measurements === "object");

      const measurementFieldCount = {};
      withMeasurements.forEach((p) => {
        Object.keys(p.measurements || {}).forEach((field) => {
          measurementFieldCount[field] = (measurementFieldCount[field] || 0) + 1;
        });
      });

      return {
        summary: {
          total: withMeasurements.length,
          change: 0,
          trend: "up",
        },
        chartData: Object.entries(measurementFieldCount)
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
        details: withMeasurements.slice(0, 30).map((p, idx) => ({
          id: idx + 1,
          name: `${p.lotNumber || p.id}${p.source === "archive" ? " (archief)" : ""}`,
          count: Object.keys(p.measurements || {}).length,
          measurementSummary: Object.entries(p.measurements || {})
            .slice(0, 5)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" | "),
          status: "completed",
        })),
      };
    } catch (error) {
      console.error("Error fetching measurements data:", error);
      throw error;
    }
  };

  const fetchOfferedTotalsData = async () => {
    const { startDate, endDate } = getDateRange();

    try {
      const trackingSnap = await getDocs(query(collection(db, ...PATHS.TRACKING), limit(4000)));
      const products = trackingSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => {
          const itemDate = getItemDate(p) || p.timestamps?.eindinspectie_start?.toDate?.();
          return itemDate ? isWithinInterval(itemDate, { start: startDate, end: endDate }) : true;
        });

      const offeredItems = products.filter((p) => {
        const status = String(p.status || "").toLowerCase();
        const station = String(p.currentStation || "").toUpperCase();
        const step = String(p.currentStep || "").toUpperCase();
        return (
          status.includes("te keuren") ||
          station.includes("BM01") ||
          step.includes("EINDINSPECTIE") ||
          !!p.timestamps?.eindinspectie_start
        );
      });

      const grouped = {};
      offeredItems.forEach((p) => {
        const d = p.timestamps?.eindinspectie_start?.toDate?.() || getItemDate(p);
        if (!d) return;
        const key = dateRange === "month" ? `Week ${format(d, "II")} (${format(d, "yyyy")})` : format(d, "yyyy-MM-dd");
        grouped[key] = (grouped[key] || 0) + 1;
      });

      const sortedEntries = Object.entries(grouped).sort(([a], [b]) => (a > b ? 1 : -1));

      return {
        summary: {
          total: offeredItems.length,
          change: 0,
          trend: "up",
        },
        chartData: sortedEntries.map(([label, value]) => ({ label, value })).slice(-12),
        details: sortedEntries
          .slice(-30)
          .reverse()
          .map(([period, count], idx) => ({ id: idx + 1, name: period, count, status: "completed" })),
      };
    } catch (error) {
      console.error("Error fetching offered totals data:", error);
      throw error;
    }
  };

  // Main report generation function
  const generateReportData = async (reportOverride = null) => {
    const targetReport = reportOverride || selectedReport;
    if (!targetReport?.id) {
      console.warn("generateReportData called without a valid report");
      return;
    }

    setLoading(true);
    try {
      let data;

      if (targetReport.id === "worked_hours") {
        data = await fetchWorkedHoursData();
      } else if (targetReport.id === "temp_reject_overview") {
        data = await fetchTempRejectData();
      } else if (targetReport.id === "product_measurements") {
        data = await fetchMeasurementsData();
      } else if (targetReport.id === "offered_totals") {
        data = await fetchOfferedTotalsData();
      }

      // Select appropriate data fetch function based on category
      else if (targetReport.id.includes("production") || targetReport.id.includes("output") || 
          targetReport.id.includes("order") || targetReport.id.includes("wip")) {
        data = await fetchProductionData();
      } else if (targetReport.id.includes("rejection") || targetReport.id.includes("quality") || 
                 targetReport.id.includes("first") || targetReport.id.includes("rework") || 
                 targetReport.id.includes("inspection")) {
        data = await fetchQualityData();
      } else if (targetReport.id.includes("oee") || targetReport.id.includes("utilization") || 
                 targetReport.id.includes("cycle") || targetReport.id.includes("downtime") ||
                 targetReport.id.includes("efficiency")) {
        data = await fetchEfficiencyData();
      } else if (targetReport.id.includes("operator") || targetReport.id.includes("shift") || 
                 targetReport.id.includes("training") || targetReport.id.includes("attendance") ||
                 targetReport.id.includes("personnel")) {
        data = await fetchPersonnelData();
      } else {
        // Fallback to production data
        data = await fetchProductionData();
      }
      
      setReportData(data);
    } catch (error) {
      console.error("Error generating report:", error);
      alert("Fout bij het genereren van rapport. Zie console voor details.");
    } finally {
      setLoading(false);
    }
  };

  // Export helpers
  const buildExportFilename = (extension) => {
    const safeTitle = (selectedReport?.title || "report")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `${safeTitle || "report"}_${new Date().toISOString().slice(0, 10)}.${extension}`;
  };

  const downloadBlob = (content, mimeType, filename) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export functions
  const exportToPDF = () => {
    if (!reportData || !selectedReport) return;

    const chartRows = (reportData.chartData || [])
      .map((item) => `<tr><td style="padding:8px;border:1px solid #ddd;">${item.label}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">${item.value}</td></tr>`)
      .join("");

    const detailRows = (reportData.details || [])
      .map((item) => `<tr><td style="padding:8px;border:1px solid #ddd;">${item.name}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">${item.count}</td><td style="padding:8px;border:1px solid #ddd;">${item.status}</td></tr>`)
      .join("");

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${selectedReport.title}</title>
  </head>
  <body style="font-family:Arial,sans-serif;padding:24px;">
    <h1 style="margin:0 0 8px 0;">${selectedReport.title}</h1>
    <p style="margin:0 0 16px 0;color:#666;">Gegenereerd op ${new Date().toLocaleString()}</p>
    <h2>Samenvatting</h2>
    <ul>
      <li>Totaal: ${reportData.summary?.total ?? 0}</li>
      <li>Trend: ${reportData.summary?.trend || "n/a"} (${reportData.summary?.change ?? 0}%)</li>
    </ul>
    <h2>Overzicht per Werkstation</h2>
    <table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
      <thead><tr><th style="padding:8px;border:1px solid #ddd;text-align:left;">Werkstation</th><th style="padding:8px;border:1px solid #ddd;text-align:right;">Waarde</th></tr></thead>
      <tbody>${chartRows}</tbody>
    </table>
    <h2>Details</h2>
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr><th style="padding:8px;border:1px solid #ddd;text-align:left;">Naam</th><th style="padding:8px;border:1px solid #ddd;text-align:right;">Aantal</th><th style="padding:8px;border:1px solid #ddd;text-align:left;">Status</th></tr></thead>
      <tbody>${detailRows}</tbody>
    </table>
    <script>window.onload = () => { window.print(); };</script>
  </body>
</html>`;

    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) {
      alert("Pop-up geblokkeerd. Sta pop-ups toe voor PDF export.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const exportToExcel = () => {
    if (!reportData || !selectedReport) return;

    const header = "sep=,\n";
    const summary = [
      ["Rapport", selectedReport.title],
      ["Datum", new Date().toLocaleString()],
      ["Totaal", reportData.summary?.total ?? 0],
      ["Trend", reportData.summary?.trend || "n/a"],
      ["Verschil %", reportData.summary?.change ?? 0],
      [],
      ["Overzicht per werkstation"],
      ["Werkstation", "Waarde"],
      ...(reportData.chartData || []).map((item) => [item.label, item.value]),
      [],
      ["Details"],
      ["Naam", "Aantal", "Status"],
      ...(reportData.details || []).map((item) => [item.name, item.count, item.status]),
    ];

    const csvLike = summary
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    downloadBlob(`${header}${csvLike}`, "application/vnd.ms-excel;charset=utf-8", buildExportFilename("xls"));
  };

  const exportToCSV = () => {
    if (!reportData || !selectedReport) return;

    const rows = [
      ["Report", selectedReport.title],
      ["GeneratedAt", new Date().toISOString()],
      ["Total", reportData.summary?.total ?? 0],
      ["Trend", reportData.summary?.trend || "n/a"],
      ["ChangePercent", reportData.summary?.change ?? 0],
      [],
      ["Workstation", "Value"],
      ...(reportData.chartData || []).map((d) => [d.label, d.value]),
      [],
      ["Name", "Count", "Status"],
      ...(reportData.details || []).map((d) => [d.name, d.count, d.status]),
    ];

    const csvContent = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    downloadBlob(csvContent, "text/csv;charset=utf-8", buildExportFilename("csv"));
  };

  // Render category selection
  if (!selectedCategory) {
    return (
      <div className="h-full overflow-y-auto bg-slate-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight mb-2">
              {t("reports.title", "Rapportage Centre")}
            </h2>
            <p className="text-slate-500 text-sm">
              {t("reports.subtitle", "Selecteer een rapportage categorie om te beginnen")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reportCategories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category)}
                className={`group p-8 rounded-3xl border-2 ${category.color} hover:shadow-xl transition-all duration-300 text-left active:scale-95`}
              >
                <div className="p-4 bg-white rounded-2xl shadow-md w-fit mb-6 group-hover:scale-110 transition-transform">
                  {category.icon}
                </div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-3">
                  {category.title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  {category.description}
                </p>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                  {category.reports.length} rapporten beschikbaar
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Render report selection
  if (selectedCategory && !selectedReport) {
    return (
      <div className="h-full overflow-y-auto bg-slate-50 p-8">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => setSelectedCategory(null)}
            className="mb-6 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            ← Terug naar categorieën
          </button>

          <div className="mb-8">
            <div className="flex items-center gap-4 mb-3">
              <div className={`p-3 rounded-2xl ${selectedCategory.color}`}>
                {selectedCategory.icon}
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">
                  {selectedCategory.title}
                </h2>
                <p className="text-slate-500 text-sm">{selectedCategory.description}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {selectedCategory.reports.map((report) => (
              <button
                key={report.id}
                onClick={() => {
                  setSelectedReport(report);
                  generateReportData(report);
                }}
                className="group p-6 bg-white border border-slate-200 rounded-2xl hover:shadow-lg transition-all duration-300 text-left active:scale-95"
              >
                <div className="p-3 bg-slate-50 rounded-xl w-fit mb-4 group-hover:bg-blue-50 transition-colors">
                  {report.icon}
                </div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">
                  {report.title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  {report.description}
                </p>
                <div className="flex flex-wrap gap-1">
                  {report.metrics.slice(0, 3).map((metric) => (
                    <span
                      key={metric}
                      className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase rounded"
                    >
                      {metric}
                    </span>
                  ))}
                  {report.metrics.length > 3 && (
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase rounded">
                      +{report.metrics.length - 3}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const canExport = !!reportData && !loading;

  // Render report view with data
  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-6 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => setSelectedReport(null)}
            className="mb-4 px-4 py-2 bg-slate-100 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            ← Terug naar rapporten
          </button>
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                {selectedReport.title}
              </h2>
              <p className="text-sm text-slate-500">{selectedReport.description}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={exportToCSV}
                disabled={!canExport}
                className="px-4 py-2 bg-green-50 text-green-700 rounded-xl text-sm font-bold hover:bg-green-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet size={16} /> CSV
              </button>
              <button
                onClick={exportToExcel}
                disabled={!canExport}
                className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet size={16} /> Excel
              </button>
              <button
                onClick={exportToPDF}
                disabled={!canExport}
                className="px-4 py-2 bg-red-50 text-red-700 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileText size={16} /> PDF
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-6 flex flex-wrap gap-3">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
            >
              <option value="today">Vandaag</option>
              <option value="week">Deze Week</option>
              <option value="month">Deze Maand</option>
              <option value="custom">Custom Periode</option>
            </select>

            <select
              value={filters.station}
              onChange={(e) => setFilters({ ...filters, station: e.target.value })}
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
            >
              <option value="ALL">Alle Werkstations</option>
              <option value="BH11">BH11</option>
              <option value="BH16">BH16</option>
              <option value="BH18">BH18</option>
              <option value="BH31">BH31</option>
              <option value="BM01">BM01</option>
            </select>

            <button
              onClick={generateReportData}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Filter size={16} />}
              {loading ? "Laden..." : "Genereer Rapport"}
            </button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Loader2 className="animate-spin text-blue-600" size={48} />
              <p className="text-sm text-slate-500 font-bold">Rapport wordt gegenereerd...</p>
            </div>
          ) : reportData ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">Totaal</span>
                    {reportData.summary.change !== undefined && (
                      <div className={`px-2 py-1 rounded-lg text-xs font-bold ${reportData.summary.trend === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {reportData.summary.trend === 'up' ? '↑' : '↓'} {Math.abs(reportData.summary.change)}%
                      </div>
                    )}
                  </div>
                  <div className="text-4xl font-black text-slate-800">{reportData.summary.total.toLocaleString()}</div>
                </div>

                {/* Conditionally show FTR for quality reports */}
                {reportData.summary.ftrPercentage !== undefined && (
                  <div className="p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-2xl border border-green-200">
                    <span className="text-xs font-bold text-green-700 uppercase block mb-2">First Time Right</span>
                    <div className="text-4xl font-black text-green-900">
                      {reportData.summary.ftrPercentage}%
                    </div>
                  </div>
                )}

                {/* Show completed count for production reports */}
                {reportData.summary.completed !== undefined && (
                  <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl border border-blue-200">
                    <span className="text-xs font-bold text-blue-700 uppercase block mb-2">Voltooid</span>
                    <div className="text-4xl font-black text-blue-900">
                      {reportData.summary.completed.toLocaleString()}
                    </div>
                  </div>
                )}

                {/* Show rejected count */}
                {reportData.summary.rejected !== undefined && (
                  <div className="p-6 bg-gradient-to-br from-red-50 to-red-100 rounded-2xl border border-red-200">
                    <span className="text-xs font-bold text-red-700 uppercase block mb-2">Afgekeurd</span>
                    <div className="text-4xl font-black text-red-900">
                      {reportData.summary.rejected.toLocaleString()}
                    </div>
                  </div>
                )}

                {/* Fallback cards */}
                {!reportData.summary.ftrPercentage && !reportData.summary.completed && (
                  <>
                <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl border border-blue-200">
                  <span className="text-xs font-bold text-blue-700 uppercase block mb-2">Gemiddelde per Dag</span>
                  <div className="text-4xl font-black text-blue-900">
                    {Math.round(reportData.summary.total / 7).toLocaleString()}
                  </div>
                </div>

                <div className="p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl border border-purple-200">
                  <span className="text-xs font-bold text-purple-700 uppercase block mb-2">Stations Actief</span>
                  <div className="text-4xl font-black text-purple-900">{reportData.chartData.length}</div>
                </div>
                  </>
                )}
              </div>

              {/* Chart */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-6">
                  Overzicht per Werkstation
                </h3>
                <div className="space-y-3">
                  {reportData.chartData.map((item, index) => {
                    const maxValue = Math.max(...reportData.chartData.map((d) => d.value));
                    const percentage = (item.value / maxValue) * 100;
                    
                    return (
                      <div key={index} className="flex items-center gap-4">
                        <div
                          className="w-36 shrink-0 text-sm font-black text-slate-700 truncate"
                          title={item.label}
                        >
                          {item.label}
                        </div>
                        <div className="flex-1 min-w-0 bg-slate-100 rounded-full h-8 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-blue-600 h-full flex items-center justify-end px-3 transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          >
                            <span className="text-white text-xs font-bold">{item.value}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Details Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                    Gedetailleerd Overzicht
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                          Product
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                          {selectedReport?.id === "product_measurements" ? "Metingen" : "Aantal"}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {reportData.details.map((detail) => (
                        <tr key={detail.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm font-medium text-slate-800">{detail.name}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {selectedReport?.id === "product_measurements" ? (
                              <div className="space-y-1">
                                <div className="font-semibold text-slate-700">{detail.measurementSummary || "Geen meetwaarden"}</div>
                                <div className="text-xs text-slate-400">{detail.count} velden</div>
                              </div>
                            ) : (
                              detail.count
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2 py-1 rounded-lg text-xs font-bold ${
                                detail.status === "completed"
                                  ? "bg-green-100 text-green-700"
                                  : detail.status === "rejected"
                                  ? "bg-red-100 text-red-700"
                                  : detail.status === "temp_reject"
                                  ? "bg-orange-100 text-orange-700"
                                  : detail.status === "active"
                                  ? "bg-blue-100 text-blue-700"
                                  : detail.status === "idle"
                                  ? "bg-slate-100 text-slate-600"
                                  : "bg-yellow-100 text-yellow-700"
                              }`}
                            >
                              {detail.status === "completed"
                                ? "Voltooid"
                                : detail.status === "rejected"
                                ? "Afgekeurd"
                                : detail.status === "temp_reject"
                                ? "Tijdelijk Afgekeurd"
                                : detail.status === "active"
                                ? "Actief"
                                : detail.status === "idle"
                                ? "Niet Actief"
                                : "In behandeling"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <FileText className="text-slate-300" size={64} />
              <p className="text-slate-500 text-sm font-bold">Geen data beschikbaar</p>
              <button
                onClick={generateReportData}
                className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
              >
                Genereer Rapport
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminReportsView;
