import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  ArrowLeft,
  FileSpreadsheet,
  AlertTriangle,
  ClipboardList,
  Download,
  Table,
  Plus,
  BrainCircuit,
  Menu,
  X,
  RefreshCw,
  Link2,
  Layers,
  Factory,
} from "lucide-react";
import { collection, query, onSnapshot, doc, writeBatch, serverTimestamp, updateDoc, where, addDoc, getDocs, limit, increment } from "firebase/firestore";
import { db, logActivity } from "../../config/firebase";
import { getISOWeek, format, subDays, startOfISOWeek, endOfISOWeek } from "date-fns";
import { PATHS, getArchiveItemsPath } from "../../config/dbPaths";
import * as XLSX from "xlsx";

// Helpers & Modals
import { normalizeMachine, PIPE_MACHINES } from "../../utils/hubHelpers";
import StationDetailModal from "./modals/StationDetailModal";
import TraceModal from "./modals/TraceModal";
import PlanningImportModal from "./modals/PlanningImportModal";
import { getStepForStation } from "../../utils/workstationLogic";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { getAuth } from "firebase/auth";
import { useNotifications } from "../../contexts/NotificationContext";
import { runBatchDrawingSync } from "../../utils/drawingLinker";
import TeamleaderDashboard from "../teamleader/TeamleaderDashboard";
import TeamleaderGanttView from "../teamleader/TeamleaderGanttView";
import TeamleaderEfficiencyView from "../teamleader/TeamleaderEfficiencyView";
import PersonnelOccupancyView from "../personnel/PersonnelOccupancyView";
import PlanningSidebar from "./PlanningSidebar";
import OrderDetail from "./OrderDetail";
import ProductDossierModal from "./modals/ProductDossierModal.jsx";
import AiPredictionView from "./AiPredictionView";

/**
 * TeamleaderHub V7.3 - Strict Filtering Update & Cleanup
 * Fix voor dubbele planning en vervuiling tussen afdelingen.
 * Gebruikt 'effectiveStations' als centrale bron van waarheid.
 */
const TeamleaderHub = React.memo(({
  onBack,
  onExit,
  fixedScope = "all",
  departmentName = "Algemeen",
  allowedMachines = [],
  title = "Teamleader Hub",
}) => {
  const { t } = useTranslation();
  const { user } = useAdminAuth();
  const navigate = useNavigate();

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const currentWeek = getISOWeek(new Date());

  const [activeTab, setActiveTab] = useState("dashboard");
  const [rawOrders, setRawOrders] = useState([]);
  const [rawProducts, setRawProducts] = useState([]);
  const [bezetting, setBezetting] = useState([]);
  const [archivedProducts, setArchivedProducts] = useState([]);
  const [factoryConfig, setFactoryConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedSidebarEntry, setSelectedSidebarEntry] = useState(null);
  const [isCopying, setIsCopying] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showAddOrderModal, setShowAddOrderModal] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [newOrderData, setNewOrderData] = useState({
    orderId: "",
    item: "",
    machine: "",
    plan: ""
  });
  const [departmentFilter, setDepartmentFilter] = useState("ALL"); // Nieuw filter
  const [showAiPrediction, setShowAiPrediction] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSyncingDrawings, setIsSyncingDrawings] = useState(false);
  const { showSuccess, showInfo, showWarning } = useNotifications();

  // Modals state
  const [activeKpi, setActiveKpi] = useState(null);
  const [lastKpi, setLastKpi] = useState(null);
  const [modalTitle, setModalTitle] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [viewingDossier, setViewingDossier] = useState(null);
  const [selectedStationDetail, setSelectedStationDetail] = useState(null);
  const [selectedOverproductionGroup, setSelectedOverproductionGroup] = useState(null);
  const [overproductionTargetOrderId, setOverproductionTargetOrderId] = useState("");
  const [overproductionManualStation, setOverproductionManualStation] = useState("");
  const [assigningOverproduction, setAssigningOverproduction] = useState(false);

  const handleOpenExtendedPersonnel = () => {
    navigate("/admin", {
      state: {
        openScreen: "personnel",
        personnelDate: todayStr,
        personnelTab: "assignment",
      },
    });
  };

  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    const unsubs = [];
    let loadedCount = 0;
    
    // Track which data sources have reported back (for faster perceived loading)
    const markStreamReady = () => {
      loadedCount++;
      // Stop loading as soon as orders + products are ready (most important data)
      if (loadedCount >= 2 && isMounted) {
        setLoading(false);
      }
    };

    const initData = async () => {

      const auth = getAuth();
      
      // Prevent fetching if user is guest
      if (!user.role || user.role === 'guest') {
        setLoading(false);
        return;
      }

      // Start loading immediately
      setLoading(true);
      setDbError(null);

      // Set up ALL listeners in parallel (not sequential!)
      // LISTENER 1: Orders
      const unsubOrders = onSnapshot(
        collection(db, ...PATHS.PLANNING),
        (snap) => {
          if (!isMounted) return;
          setRawOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          markStreamReady();
        },
        (err) => {
          if (!isMounted) return;
          console.error("Planning Sync Error:", err);
          setDbError(err.code || "permission-denied");
          markStreamReady(); // Still mark as ready even on error
        }
      );
      unsubs.push(unsubOrders);

      // LISTENER 2: Products (also starts immediately, in parallel)
      const unsubProds = onSnapshot(
        collection(db, ...PATHS.TRACKING),
        (snap) =>
          isMounted && setRawProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => {
          if (err.code === 'permission-denied') return;
          console.warn("Tracked Products Sync Error:", err.code);
          markStreamReady(); // Mark ready even on error
        }
      );
      unsubs.push(unsubProds);
      markStreamReady(); // Count products listener as ready immediately

      // LISTENER 3: Occupancy (lazy load after main data is ready)
      const unsubOcc = onSnapshot(
        collection(db, ...PATHS.OCCUPANCY),
        (snap) => {
          isMounted && setBezetting(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (err) => {
          if (err.code === 'permission-denied') return;
          console.warn("Occupancy Sync Error:", err.code);
        }
      );
      unsubs.push(unsubOcc);

      // LISTENER 4: Factory Config (lazy load, doesn't block loading)
      const unsubConfig = onSnapshot(
        doc(db, ...PATHS.FACTORY_CONFIG),
        (snap) => {
          if (isMounted && snap.exists()) setFactoryConfig(snap.data());
        },
        (err) => {
          if (err.code === 'permission-denied') return;
          console.warn("Factory Config Sync Error:", err);
        }
      );
      unsubs.push(unsubConfig);

      const now = new Date();
      const start = startOfISOWeek(now);
      const end = endOfISOWeek(now);
      const year = now.getFullYear();
      const unsubArchive = onSnapshot(
        query(
          collection(db, ...getArchiveItemsPath(year)),
          where("timestamps.finished", ">=", start),
          where("timestamps.finished", "<=", end)
        ),
        (snap) => {
          isMounted && setArchivedProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (err) => console.warn("Archive Sync Error (Week Stats):", err.code)
      );
      unsubs.push(unsubArchive);

      // Token refresh in background (optional, for edge cases)
      if (!auth.currentUser && user) {
        auth.onAuthStateChanged(() => {});
      }
      if (auth.currentUser) {
        auth.currentUser.getIdToken(true).catch(e => {
          console.warn("Token refresh failed:", e);
        });
      }
    };

    initData();

    return () => {
      isMounted = false;
      unsubs.forEach(unsub => unsub());
    };
  }, [user]);

  // Reset AI view bij wisselen van tab
  useEffect(() => {
    setShowAiPrediction(false);
  }, [activeTab]);

  // 1. CENTRALE STATION LOGICA
  // Bepaal welke stations van toepassing zijn. Dit is de enige bron van waarheid.
  const safeScope = (fixedScope || "all").toLowerCase();
  const scopeMap = { fittings: "fittings", pipes: "pipes", spools: "spools", pipe: "pipes" };
  const targetSlug = scopeMap[safeScope] || safeScope;
  
  const effectiveStations = useMemo(() => {
    let stations;

    // Zoek de juiste afdeling (indien niet 'all')
    let deptStations = [];
    if (factoryConfig && factoryConfig.departments && safeScope !== 'all') {
      const dept = factoryConfig.departments.find(
        (d) => d.slug === targetSlug || d.id === targetSlug || d.name?.toLowerCase() === targetSlug
      );
      deptStations = dept ? (dept.stations || []) : [];
    } else if (factoryConfig && factoryConfig.departments) {
      // safeScope is 'all' (Central Planner)
      // Filter op departmentFilter als die is ingesteld
      if (departmentFilter !== "ALL") {
         const filterSlug = departmentFilter.toLowerCase();
         const dept = factoryConfig.departments.find(
            (d) => d.slug === filterSlug || d.id === filterSlug || d.name?.toLowerCase() === filterSlug
         );
         deptStations = dept ? (dept.stations || []) : [];
      } else {
         deptStations = factoryConfig.departments.flatMap(d => d.stations || []);
      }
    }

    // A. Gebruik props als die er zijn (doorgegeven vanuit parent Hub)
    if (allowedMachines && allowedMachines.length > 0) {
      // Filter allowedMachines op alleen stations uit de juiste afdeling
      stations = allowedMachines.map(m => {
        const found = deptStations.find(s => normalizeMachine(s.name) === normalizeMachine(m));
        return found || null;
      }).filter(Boolean); // Verwijder nulls
    }
    // B. Fallback naar Factory Config op basis van scope (als props leeg zijn)
    else {
      stations = deptStations;
    }

    // C. FAILSAFE FILTERING OP NAAMCONVENTIES
    // Dit voorkomt dat configuratiefouten in de database leiden tot vervuiling in de UI
    if (safeScope === 'fittings') {
      // Fittings mag GEEN BA05, BA07, BA08, BA09 (pipes) tonen
      const excludedBA = ["BA05", "BA07", "BA08", "BA09"];
      stations = stations.filter(s => {
        const n = normalizeMachine(s.name || "");
        return !excludedBA.includes(n);
      });
    } else if (safeScope === 'pipes' || safeScope === 'pipe') {
      // Pipes mag GEEN 'BM' (Bovenloop), 'Mazak' of 'Nabewerking' bevatten
      stations = stations.filter(s => {
        const n = normalizeMachine(s.name || "");
        return !n.startsWith("BM") && !n.includes("MAZAK") && !n.includes("NABEWERK");
      });
      
      // Add SPOOLS_INBOX explicitly for pipe/spools scope
      if (!stations.some(s => s.name === "SPOOLS_INBOX")) {
          stations.push({ id: "SPOOLS_INBOX", name: "SPOOLS_INBOX", department: "pipes" });
      }
    }

    return stations;
  }, [allowedMachines, factoryConfig, fixedScope, safeScope, targetSlug, departmentFilter]);

  // 2. Genereer genormaliseerde lijst voor filtering
  const effectiveAllowedNorms = useMemo(() => {
     return effectiveStations
        .map(s => normalizeMachine(s.name))
        .filter(n => n && n !== "TEAMLEADER" && n !== "ALGEMEEN");
  }, [effectiveStations]);

  const dataStore = useMemo(() => {
    if (!rawOrders) return [];

    return rawOrders
      .map((o) => ({ ...o, normMachine: normalizeMachine(o.machine || "") }))
      .filter((o) => {
        // Order moet bij juiste afdeling horen
        if (targetSlug !== "all") {
          const dept = (o.department || "").toLowerCase();
          const origDept = (o.originalDepartment || "").toLowerCase();
          // Toon als het bij deze afdeling hoort OF als het hiervandaan komt (gedelegeerd)
          // FIX: Alleen filteren als er een expliciete afdeling is die NIET matcht.
          if (dept && dept !== targetSlug && origDept !== targetSlug) {
             return false;
          }
        }

        // 1. HARD EXCLUDES OP BASIS VAN SCOPE (FAILSAFE)
        // Dit voorkomt dat BA orders in Fittings verschijnen, zelfs als de config niet klopt
        if (targetSlug === 'fittings') {
            if (o.normMachine.startsWith("BA")) return false;
            // Extra failsafe: als station BA is, altijd uitsluiten
            if (o.station && normalizeMachine(o.station).startsWith("BA")) return false;
        }
        if (targetSlug === 'pipes' || targetSlug === 'pipe') {
            if (o.normMachine.startsWith("BM") || o.normMachine.includes("MAZAK") || o.normMachine.includes("NABEWERK")) return false;
            if (o.station && (normalizeMachine(o.station).startsWith("BM") || normalizeMachine(o.station).includes("MAZAK") || normalizeMachine(o.station).includes("NABEWERK"))) return false;
        }

        // Machine filter
        if (targetSlug === "all" && departmentFilter === "ALL") return true;

        if (effectiveAllowedNorms.length > 0) {
          // Special case for delegated orders (Outgoing or Incoming)
          if (o.delegatedTo || o.machine === "SPOOLS_INBOX") {
              return true;
          }

          if (o.normMachine) {
            return effectiveAllowedNorms.includes(o.normMachine);
          }
          // Als order GEEN machine heeft (backlog), toon hem wel (zodat planning niet 0 is)
          return true;
        }
        // Als er geen stations bekend zijn (en scope is niet 'all'), toon niets om vervuiling te voorkomen
        return false;
      });
  }, [rawOrders, effectiveAllowedNorms, fixedScope, targetSlug, departmentFilter]);

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return dataStore.find((o) => o.id === selectedOrderId || o.orderId === selectedOrderId);
  }, [dataStore, selectedOrderId]);

  const selectedDetailEntry = useMemo(() => {
    if (selectedOrder) return selectedOrder;
    if (selectedSidebarEntry?.isArchivedOrder) return selectedSidebarEntry;
    return null;
  }, [selectedOrder, selectedSidebarEntry]);

  const selectedSidebarEntryId = useMemo(() => {
    if (selectedSidebarEntry?.orderId) return selectedSidebarEntry.orderId;
    if (selectedSidebarEntry?.id) return selectedSidebarEntry.id;
    return selectedOrderId;
  }, [selectedSidebarEntry, selectedOrderId]);

  const canManageOverproduction = fixedScope === "all" && ["planner", "admin", "teamleader"].includes(user?.role);

  const overproductionGroups = useMemo(() => {
    const unresolved = rawProducts.filter((product) => {
      if (!product?.isOverproduction) return false;
      return String(product.orderId || "").trim().toUpperCase() === "NOG_TE_BEPALEN";
    });

    const grouped = new Map();
    unresolved.forEach((product) => {
      const originalOrderId = String(product.originalOrderId || "ONBEKEND").trim();
      const originMachine = String(product.originMachine || product.currentStation || "ONBEKEND").trim();
      const item = String(product.item || "").trim();
      const key = `${originalOrderId}__${originMachine}__${item}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          originalOrderId,
          originMachine,
          item,
          products: [],
          lotNumbers: [],
          count: 0,
          createdAtMs: 0,
        });
      }

      const entry = grouped.get(key);
      entry.products.push(product);
      entry.lotNumbers.push(String(product.lotNumber || product.id || "").trim());
      entry.count += 1;

      const createdAtMs = product.createdAt?.toMillis
        ? product.createdAt.toMillis()
        : new Date(product.createdAt || product.updatedAt || 0).getTime();
      entry.createdAtMs = Math.max(entry.createdAtMs || 0, Number.isFinite(createdAtMs) ? createdAtMs : 0);
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        lotNumbers: Array.from(new Set(group.lotNumbers.filter(Boolean))),
      }))
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  }, [rawProducts]);

  const resolveOverproductionRoute = (targetOrder, group, manualStation = "") => {
    const itemText = `${targetOrder?.item || ""} ${group?.item || ""}`.toUpperCase();
    const machineNorm = normalizeMachine(targetOrder?.machine || group?.originMachine || "");

    if (itemText.includes("FL")) {
      return { station: "Mazak", mode: "auto", label: "Mazak" };
    }

    if (PIPE_MACHINES.includes(machineNorm) || itemText.includes("PIPE") || itemText.includes("BUIS")) {
      const chosenStation = String(manualStation || "").trim();
      return { station: chosenStation || null, mode: "manual", label: chosenStation || "Handmatig kiezen" };
    }

    return { station: "Nabewerking", mode: "auto", label: "Nabewerking" };
  };

  const overproductionTargetCandidates = useMemo(() => {
    const input = String(overproductionTargetOrderId || "").trim().toLowerCase();
    const group = selectedOverproductionGroup;
    const sameItem = String(group?.item || "").trim().toLowerCase();

    return rawOrders
      .filter((order) => !["completed", "cancelled", "rejected", "shipped"].includes(String(order?.status || "").toLowerCase()))
      .filter((order) => {
        if (input) {
          return String(order.orderId || "").toLowerCase().includes(input);
        }
        if (!sameItem) return true;
        return String(order.item || "").trim().toLowerCase() === sameItem;
      })
      .sort((a, b) => String(a.orderId || "").localeCompare(String(b.orderId || "")))
      .slice(0, 12);
  }, [rawOrders, overproductionTargetOrderId, selectedOverproductionGroup]);

  const handleOpenOverproductionGroup = (group) => {
    setSelectedOverproductionGroup(group);
    setOverproductionTargetOrderId("");
    setOverproductionManualStation("");
  };

  const handleAssignOverproduction = async () => {
    if (!selectedOverproductionGroup) return;

    const targetOrderId = String(overproductionTargetOrderId || "").trim();
    if (!targetOrderId) {
      showWarning("Vul eerst een nieuw ordernummer in.");
      return;
    }

    const targetOrder = rawOrders.find((order) => String(order.orderId || "").trim().toUpperCase() === targetOrderId.toUpperCase());
    if (!targetOrder?.id) {
      showWarning(`Order ${targetOrderId} is nog niet zichtbaar in planning. Importeer of sync eerst de LN-order.`);
      return;
    }

    const route = resolveOverproductionRoute(targetOrder, selectedOverproductionGroup, overproductionManualStation);
    if (!route.station) {
      showWarning("Kies eerst het doelstation voor deze pipe-overproductie.");
      return;
    }

    setAssigningOverproduction(true);
    try {
      const batch = writeBatch(db);
      const routeState = getStepForStation(route.station);
      const nowIso = new Date().toISOString();

      selectedOverproductionGroup.products.forEach((product) => {
        batch.update(doc(db, ...PATHS.TRACKING, product.id), {
          orderId: targetOrder.orderId,
          currentStation: route.station,
          currentStep: routeState.currentStep || "Nabewerking",
          status: routeState.status || "Te Nabewerken",
          updatedAt: serverTimestamp(),
          overproductionResolvedAt: serverTimestamp(),
          overproductionResolvedBy: user?.email || "planner",
          overproductionAssignedOrderId: targetOrder.orderId,
          overproductionRoutingStation: route.station,
          note: `Overproductie gekoppeld aan order ${targetOrder.orderId} en doorgestuurd naar ${route.station}`,
          "timestamps.overproduction_assigned": serverTimestamp(),
          "timestamps.routing_override": nowIso,
        });
      });

      batch.update(doc(db, ...PATHS.PLANNING, targetOrder.id), {
        machine: route.station,
        status: routeState.status || "Te Nabewerken",
        lastUpdated: serverTimestamp(),
        overproductionLinkedCount: increment(selectedOverproductionGroup.count),
        overproductionLastLinkedAt: serverTimestamp(),
        overproductionSourceOrderId: selectedOverproductionGroup.originalOrderId,
      });

      const originalOrder = rawOrders.find((order) => String(order.orderId || "").trim() === selectedOverproductionGroup.originalOrderId);
      if (originalOrder?.id) {
        const startedField = `started_${String(selectedOverproductionGroup.originMachine || "").replace(/[^a-zA-Z0-9]/g, "_")}`;
        const currentStarted = Number(originalOrder[startedField] || 0);
        batch.update(doc(db, ...PATHS.PLANNING, originalOrder.id), {
          [startedField]: Math.max(0, currentStarted - selectedOverproductionGroup.count),
          lastUpdated: serverTimestamp(),
        });
      }

      await batch.commit();

      await addDoc(collection(db, ...PATHS.MESSAGES), {
        to: user?.email?.toLowerCase() || "admin",
        from: "SYSTEM",
        senderId: "system-auto",
        subject: `Overproductie gekoppeld: ${targetOrder.orderId}`,
        content: `${selectedOverproductionGroup.count} extra producten uit ${selectedOverproductionGroup.originalOrderId} zijn gekoppeld aan ${targetOrder.orderId} en doorgestuurd naar ${route.station}.`,
        timestamp: serverTimestamp(),
        read: false,
        archived: false,
        priority: "normal",
        type: "system",
      });

      await logActivity(
        user?.uid || "system",
        "OVERPRODUCTION_ASSIGN",
        `Overproductie gekoppeld: ${selectedOverproductionGroup.count} stuks van ${selectedOverproductionGroup.originalOrderId} -> ${targetOrder.orderId}, station ${route.station}`
      );

      showSuccess(`Overproductie gekoppeld aan ${targetOrder.orderId} en doorgestuurd naar ${route.station}.`);
      setSelectedOverproductionGroup(null);
      setOverproductionTargetOrderId("");
      setOverproductionManualStation("");
    } catch (err) {
      console.error("Fout bij koppelen overproductie:", err);
      showWarning(`Koppelen mislukt: ${err.message}`);
    } finally {
      setAssigningOverproduction(false);
    }
  };

  const handleSidebarSelect = async (entry) => {
    if (!entry) {
      setSelectedOrderId(null);
      setSelectedSidebarEntry(null);
      return;
    }

    const entryOrderId = String(entry.orderId || entry.id || "").trim();
    if (!entryOrderId) return;
    setSelectedSidebarEntry(entry);

    if (entry.isRejectEntry) {
      if (entry.orderId) {
        setSelectedOrderId(entry.orderId);
      } else {
        setSelectedOrderId(null);
      }
      return;
    }

    // History-items uit de sidebar zijn samenvattingen; haal het echte archiefitem op voor volledige history.
    if (entry.isArchivedOrder) {
      setSelectedOrderId(null);
      try {
        const baseYear = new Date().getFullYear();
        const years = [baseYear, baseYear - 1, baseYear - 2, baseYear - 3];
        const snapshots = await Promise.all(
          years.map((year) =>
            getDocs(
              query(
                collection(db, ...getArchiveItemsPath(year)),
                where("orderId", "==", entryOrderId),
                limit(100)
              )
            )
          )
        );

        const candidates = snapshots.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        const best = candidates
          .sort((a, b) => {
            const ta = a?.timestamps?.finished?.toMillis
              ? a.timestamps.finished.toMillis()
              : new Date(a?.timestamps?.finished || a?.updatedAt || 0).getTime();
            const tb = b?.timestamps?.finished?.toMillis
              ? b.timestamps.finished.toMillis()
              : new Date(b?.timestamps?.finished || b?.updatedAt || 0).getTime();
            return tb - ta;
          })[0];

        if (best) {
          const lotNumbers = Array.from(
            new Set(
              candidates
                .map((c) => String(c.lotNumber || c.activeLot || "").trim())
                .filter(Boolean)
            )
          );

          setSelectedSidebarEntry({
            ...entry,
            status: "completed",
            archived: true,
            isArchivedOrder: true,
            archivedCandidates: candidates,
            lotNumbers,
            lotNumbersText: lotNumbers.join(" "),
            machine: best.machine || best.originMachine || entry.machine,
            item: best.item || best.itemDescription || entry.item,
          });
          return;
        }
      } catch (err) {
        console.warn("Kon archiefdossier niet laden:", err);
      }

      // Fallback: toon samenvatting in rechterpaneel, zonder popup.
      const fallbackItem = {
        ...entry,
        status: "completed",
        archived: true,
        isArchivedOrder: true,
      };
      setSelectedSidebarEntry(fallbackItem);
      return;
    }

    setSelectedOrderId(entry.id || entryOrderId);
  };

  const handleOpenArchivedLotDossier = async (lotNumber) => {
    if (!selectedSidebarEntry?.isArchivedOrder) return;

    const lot = String(lotNumber || "").trim();
    const localCandidates = Array.isArray(selectedSidebarEntry.archivedCandidates)
      ? selectedSidebarEntry.archivedCandidates
      : [];

    let best = null;

    if (localCandidates.length > 0) {
      const scoped = lot
        ? localCandidates.filter((c) => String(c.lotNumber || c.activeLot || "").trim() === lot)
        : localCandidates;

      best = scoped.sort((a, b) => {
        const ta = a?.timestamps?.finished?.toMillis
          ? a.timestamps.finished.toMillis()
          : new Date(a?.timestamps?.finished || a?.updatedAt || 0).getTime();
        const tb = b?.timestamps?.finished?.toMillis
          ? b.timestamps.finished.toMillis()
          : new Date(b?.timestamps?.finished || b?.updatedAt || 0).getTime();
        return tb - ta;
      })[0] || null;
    }

    if (!best) {
      try {
        const orderId = String(selectedSidebarEntry.orderId || selectedSidebarEntry.id || "").trim();
        const baseYear = new Date().getFullYear();
        const years = [baseYear, baseYear - 1, baseYear - 2, baseYear - 3];
        const snaps = await Promise.all(
          years.map((year) =>
            getDocs(
              query(
                collection(db, ...getArchiveItemsPath(year)),
                where("orderId", "==", orderId),
                limit(150)
              )
            )
          )
        );

        const candidates = snaps
          .flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))
          .filter((c) => {
            if (!lot) return true;
            return String(c.lotNumber || c.activeLot || "").trim() === lot;
          });

        best = candidates.sort((a, b) => {
          const ta = a?.timestamps?.finished?.toMillis
            ? a.timestamps.finished.toMillis()
            : new Date(a?.timestamps?.finished || a?.updatedAt || 0).getTime();
          const tb = b?.timestamps?.finished?.toMillis
            ? b.timestamps.finished.toMillis()
            : new Date(b?.timestamps?.finished || b?.updatedAt || 0).getTime();
          return tb - ta;
        })[0] || null;
      } catch (err) {
        console.warn("Kon dossier voor lot niet laden:", err);
      }
    }

    if (best) {
      setViewingDossier({
        ...best,
        status: "completed",
        archived: true,
        isArchivedOrder: true,
      });
      return;
    }

    // Laatste fallback: open de samenvatting als dossier
    setViewingDossier({
      ...selectedSidebarEntry,
      status: "completed",
      archived: true,
      lotNumber: lot || selectedSidebarEntry.lotNumber,
    });
  };

  const getPriorityLevel = (order) => {
    const rawPriority = order?.priority;
    const normalizedPriority =
      rawPriority === true
        ? "high"
        : String(rawPriority || "").toLowerCase().trim();

    if (normalizedPriority === "immediate") return "immediate";
    if (normalizedPriority === "urgent") return "urgent";
    if (normalizedPriority === "high") return "high";
    if (order?.isMoved) return "high";
    if (order?.isUrgent) return "urgent";
    return "normal";
  };

  const isPriorityOrder = (order) => getPriorityLevel(order) !== "normal";

  // Dashboard Data Berekening
  const metrics = useMemo(() => {
    if (loading)
      return {
        totalPlanned: 0,
        activeCount: 0,
        finishedCount: 0,
        rejectedCount: 0,
        priorityCount: 0,
        bezettingAantal: 0,
        machineGridData: [],
      };

    const validOrderIds = new Set(dataStore.map((o) => o.orderId));

    // Gebruik de centraal berekende stations
    const stations = effectiveStations.filter(s => {
      const name = (s.name || "").toLowerCase();
      // Failsafe: als scope fittings is, sluit BA-machines uit
      if (safeScope === 'fittings') {
        if (name.startsWith('ba')) return false;
        // Alleen stations uit de afdeling 'fittings'
        if (s.department && s.department.toLowerCase() !== 'fittings') return false;
      }
      if (safeScope === 'pipes' || safeScope === 'pipe') {
        // Alleen stations uit de afdeling 'pipes'
        if (s.department && s.department.toLowerCase() !== 'pipes') return false;
      }
      // Voor andere scopes, filter op afdeling indien beschikbaar
      if (safeScope !== 'all' && s.department && s.department.toLowerCase() !== safeScope) return false;
      return name !== "teamleader" && name !== "algemeen";
    });

    const machineGridData = stations.map((station) => {
      const stationName = station.name;
      const stationId = station.id;

      const mProducts = rawProducts.filter(
        (p) => (p.machine || "").toLowerCase() === stationName.toLowerCase()
      );

      const mArchived = archivedProducts.filter(
        (p) => (p.machine || p.originMachine || "").toLowerCase() === stationName.toLowerCase()
      );
      
      const currentOccupancy = bezetting.filter((b) => {
          if (b.date !== todayStr) return false;
          const bId = (b.machineId || "").toLowerCase();
          const bName = (b.machineName || "").toLowerCase();
          const sId = (stationId || "").toLowerCase();
          const sName = (stationName || "").toLowerCase();
          
          return (sId && sId === bId) || (sName && sName === bId) || (sName && sName === bName);
      });

      const nameUpper = stationName.toUpperCase();
      const isBM01 = nameUpper.includes("BM01");
      const isNabewerking = nameUpper.includes("NABEWERK");
      const isMazak = nameUpper.includes("MAZAK");
      const isLossen = nameUpper.includes("LOSSEN");
      const isAlgemeen = nameUpper.includes("ALGEMEEN");
      
      const isDownstream = isBM01 || isNabewerking || isMazak || isLossen;

      let planned = 0;
      let active = 0;
      let finished = 0;

      if (isDownstream) {
          planned = 0;
          
          const checkActive = (p) => {
             const pStation = (p.currentStation || "").toUpperCase();
             const pStep = (p.currentStep || "").toUpperCase();
             const pStatus = (p.status || "").toUpperCase();
             
             const isActiveItem = !['COMPLETED', 'FINISHED', 'GEREED', 'REJECTED', 'AFKEUR'].includes(pStatus) && pStep !== 'FINISHED' && pStep !== 'REJECTED';
             if (!isActiveItem) return false;

             if (isBM01) return pStation.includes("BM01") || pStep.includes("INSPECTIE") || pStep === "BM01";
             if (isNabewerking) return pStation.includes("NABEWERK") || pStep.includes("NABEWERK");
             if (isMazak) return pStation.includes("MAZAK") || pStep.includes("MAZAK");
             if (isLossen) return pStation.includes("LOSSEN") || pStep.includes("LOSSEN");
             
             return false;
          };
          active = rawProducts.filter(checkActive).length;

          const checkFinished = (p) => {
             const pStatus = (p.status || "").toUpperCase();
             const pStep = (p.currentStep || "").toUpperCase();
             const isFinishedItem = ['COMPLETED', 'FINISHED', 'GEREED'].includes(pStatus) || pStep === 'FINISHED';
             if (!isFinishedItem) return false;

             const lastStation = (p.lastStation || "").toUpperCase();
             if (isBM01) return lastStation.includes("BM01");
             if (isNabewerking) return lastStation.includes("NABEWERK");
             if (isMazak) return lastStation.includes("MAZAK");
             if (isLossen) return lastStation.includes("LOSSEN");
             return false;
          };
          finished = rawProducts.filter(checkFinished).length + archivedProducts.filter(checkFinished).length;
      } else if (!isAlgemeen) {
          planned = dataStore
            .filter((o) => (o.machine || "").toLowerCase() === stationName.toLowerCase())
            .reduce((acc, o) => acc + Number(o.plan ?? o.toDoQty ?? o.quantity ?? 0), 0);
          active = mProducts.filter((p) => p.status === "In Production").length;
          finished = mProducts.filter((p) => p.status === "Finished").length + mArchived.length;
      }

      return {
        id: stationName,
        planned,
        finished,
        active,
        operatorCount: currentOccupancy.length,
        operatorNames: currentOccupancy.map((o) => o.operatorName).join(", "),
        isDownstream,
        isAlgemeen
      };
    });

    return {
      totalPlanned: dataStore
        .filter(o => !['cancelled', 'rejected', 'REJECTED'].includes(o.status))
        .reduce((acc, o) => acc + Number(o.plan ?? o.toDoQty ?? o.quantity ?? 0), 0),
      
      activeCount: rawProducts.filter((p) => {
        if (!validOrderIds.has(p.orderId)) return false;
        
        // STRICT FILTER OP MACHINE
        if (effectiveAllowedNorms.length > 0) {
            const m1 = normalizeMachine(p.machine || "");
            const m2 = normalizeMachine(p.originMachine || "");
            const m3 = normalizeMachine(p.currentStation || "");
            
            if (!effectiveAllowedNorms.includes(m1) && !effectiveAllowedNorms.includes(m2) && !effectiveAllowedNorms.includes(m3)) {
                return false;
            }
        }

        const status = p.status || "";
        const step = p.currentStep || "";

        const isFinished = ['Finished', 'completed', 'GEREED'].includes(status) || step === 'Finished';
        const isRejected = ['Rejected', 'rejected', 'AFKEUR'].includes(status) || step === 'REJECTED';
        
        if (isFinished || isRejected) return false;
        return true;
      }).length,

      finishedCount: (() => {
        const activeFinished = rawProducts.filter((p) => {
          if (!validOrderIds.has(p.orderId)) return false;
          
          if (effectiveAllowedNorms.length > 0) {
            const m1 = normalizeMachine(p.machine || "");
            const m2 = normalizeMachine(p.originMachine || "");
            const m3 = normalizeMachine(p.currentStation || "");
            if (!effectiveAllowedNorms.includes(m1) && !effectiveAllowedNorms.includes(m2) && !effectiveAllowedNorms.includes(m3)) return false;
          }

          const status = p.status || "";
          const step = p.currentStep || "";
          return ['Finished', 'completed', 'GEREED'].includes(status) || step === 'Finished';
        });
        const archivedFinished = archivedProducts.filter(p => validOrderIds.has(p.orderId));
        return activeFinished.length + archivedFinished.length;
      })(),

      rejectedCount: rawProducts.filter((p) => {
        if (!validOrderIds.has(p.orderId)) return false;
        
        if (effectiveAllowedNorms.length > 0) {
            const m1 = normalizeMachine(p.machine || "");
            const m2 = normalizeMachine(p.originMachine || "");
            const m3 = normalizeMachine(p.currentStation || "");
            if (!effectiveAllowedNorms.includes(m1) && !effectiveAllowedNorms.includes(m2) && !effectiveAllowedNorms.includes(m3)) return false;
        }

        const status = p.status || "";
        const step = p.currentStep || "";
        return ['Rejected', 'rejected', 'AFKEUR'].includes(status) || step === 'REJECTED';
      }).length,

      priorityCount: dataStore.filter((o) => isPriorityOrder(o)).length,

      tempRejectedCount: rawProducts.filter((p) => {
        if (!validOrderIds.has(p.orderId)) return false;
        return p.inspection?.status === "Tijdelijke afkeur";
      }).length,

      ...(() => {
        let totalHours = 0;
        let productionHours = 0;
        let supportHours = 0;
        let weeklyTotalHours = 0;
        let weeklyProductionHours = 0;
        let weeklySupportHours = 0;

        const relevantOccupancy = bezetting.filter((b) => {
            if (!b.date) return false;
            return stations.some(s => {
               const sId = (s.id || "").toLowerCase();
               const sName = (s.name || "").toLowerCase();
               const bId = (b.machineId || "").toLowerCase();
               const bName = (b.machineName || "").toLowerCase();
               return (sId && sId === bId) || (sName && sName === bId) || (sName && sName === bName);
            });
        });

        relevantOccupancy.forEach(b => {
            const val = b.hours ?? b.hoursWorked;
            const hours = parseFloat(val);
            const netHours = isNaN(hours) ? 8 : hours;
            
            if (b.date === todayStr) {
                totalHours += netHours;
                const machineId = (b.machineId || "").toUpperCase().replace(/\s/g, "");
                const isBH = machineId.includes("BH");
                const isBA = machineId.includes("BA") && !machineId.includes("NABEWERKING") && !machineId.includes("NABW");
                if (isBH || isBA) {
                    productionHours += netHours;
                } else {
                    supportHours += netHours;
                }
            }

            const bDate = new Date(b.date);
            if (getISOWeek(bDate) === currentWeek) {
                weeklyTotalHours += netHours;
                const machineId = (b.machineId || "").toUpperCase().replace(/\s/g, "");
                const isBH = machineId.includes("BH");
                const isBA = machineId.includes("BA") && !machineId.includes("NABEWERKING") && !machineId.includes("NABW");
                if (isBH || isBA) {
                    weeklyProductionHours += netHours;
                } else {
                    weeklySupportHours += netHours;
                }
            }
        });

        const efficiency = totalHours > 0 ? (productionHours / totalHours) * 100 : 0;
        const weeklyEfficiency = weeklyTotalHours > 0 ? (weeklyProductionHours / weeklyTotalHours) * 100 : 0;

        return {
            bezettingAantal: totalHours,
            productionHours,
            supportHours,
            efficiency,
            weeklyTotalHours,
            weeklyProductionHours,
            weeklySupportHours,
            weeklyEfficiency
        };
      })(),

      machineGridData,
    };
  }, [
    loading,
    dataStore,
    rawProducts,
    bezetting,
    factoryConfig,
    fixedScope,
    archivedProducts,
    effectiveAllowedNorms,
    effectiveStations,
    safeScope,
    todayStr,
    currentWeek
  ]);

  // Dynamische data berekening voor de modal, zodat deze live update
  const modalData = useMemo(() => {
    if (!activeKpi) return [];
    
    const validOrderIds = new Set(dataStore.map((o) => o.orderId));
    let data = [];

    if (activeKpi === "gepland") {
      data = dataStore.filter(o => !['cancelled', 'rejected', 'REJECTED'].includes(o.status));
    }
    
    else if (activeKpi === "in_proces") {
      data = rawProducts.filter((p) => {
         if (!validOrderIds.has(p.orderId)) return false;
         const status = p.status || "";
         const step = p.currentStep || "";
         const isFinished = ['Finished', 'completed', 'GEREED'].includes(status) || step === 'Finished';
         const isRejected = ['Rejected', 'rejected', 'AFKEUR'].includes(status) || step === 'REJECTED';
         return !isFinished && !isRejected;
      });
    }
    
    else if (activeKpi === "gereed") {
      const activeList = rawProducts.filter((p) => {
         if (!validOrderIds.has(p.orderId)) return false;
         const status = p.status || "";
         const step = p.currentStep || "";
         return ['Finished', 'completed', 'GEREED'].includes(status) || step === 'Finished';
      });
      const archivedList = archivedProducts.filter(p => validOrderIds.has(p.orderId));
      data = [...activeList, ...archivedList];
    }
    
    else if (activeKpi === "afkeur") {
      data = rawProducts.filter((p) => {
         if (!validOrderIds.has(p.orderId)) return false;
         const status = p.status || "";
         const step = p.currentStep || "";
         return ['Rejected', 'rejected', 'AFKEUR'].includes(status) || step === 'REJECTED';
      });
    }
    
    else if (["tijdelijke_afkeur", "temp_rejected", "tijdelijke afkeur", "tijdelijk_afkeur"].includes(activeKpi)) {
      data = rawProducts
        .filter((p) => {
            if (!validOrderIds.has(p.orderId)) return false;
            return p.inspection?.status === "Tijdelijke afkeur";
        })
        .sort((a, b) => new Date(a.inspection?.timestamp || 0) - new Date(b.inspection?.timestamp || 0));
    }
    
    else if (activeKpi === "bezetting") {
      const currentDayStr = format(new Date(), 'yyyy-MM-dd');
      data = bezetting
        .filter(b => b.date === currentDayStr)
        .map(b => ({
          ...b,
          lotNumber: b.operatorName,
          orderId: b.machineName || b.machineId,
          item: `${b.hours || 8} uur`,
          status: b.shift || "N/A"
        }));
    }

    else if (activeKpi === "prioriteit") {
      data = dataStore
        .filter((o) => isPriorityOrder(o))
        .sort((a, b) => {
          const rankA = getPriorityLevel(a) === "immediate" ? 3 : getPriorityLevel(a) === "urgent" ? 2 : 1;
          const rankB = getPriorityLevel(b) === "immediate" ? 3 : getPriorityLevel(b) === "urgent" ? 2 : 1;
          if (rankA !== rankB) return rankB - rankA;

          const dateA = a.dateObj ? new Date(a.dateObj).getTime() : Number.MAX_SAFE_INTEGER;
          const dateB = b.dateObj ? new Date(b.dateObj).getTime() : Number.MAX_SAFE_INTEGER;
          if (dateA !== dateB) return dateA - dateB;

          return String(a.orderId || "").localeCompare(String(b.orderId || ""));
        });
    }

    // Clean up machine names (remove _INBOX)
    return data.map(item => ({
        ...item,
        machine: item.machine ? item.machine.replace("_INBOX", "") : item.machine,
        currentStation: item.currentStation ? item.currentStation.replace("_INBOX", "") : item.currentStation
    }));
  }, [activeKpi, dataStore, rawProducts, archivedProducts, bezetting]);

  const handleKpiClick = (kpiId, label) => {
    setModalTitle(label);
    setActiveKpi(kpiId);
  };

  const handleDrawingSync = async () => {
    setIsSyncingDrawings(true);
    try {
      const count = await runBatchDrawingSync();
      if (count > 0) {
        showSuccess(`${count} order(s) gekoppeld aan tekeningen`);
      } else {
        showInfo("Geen nieuwe tekeningen gevonden om te koppelen");
      }
    } catch (err) {
      console.error("Drawing sync error:", err);
      showWarning("Fout bij synchroniseren tekeningen");
    } finally {
      setIsSyncingDrawings(false);
    }
  };

  const handleExport = () => {
    if (dataStore.length === 0) {
      alert("Geen data om te exporteren.");
      return;
    }
    const headers = ["Order", "Item", "Item Code", "Machine", "Plan", "Gereed", "Status", "Datum", "Afdeling"];
    const rows = dataStore.map(o => {
      const dateStr = o.dateObj ? format(o.dateObj, "yyyy-MM-dd") : "";
      return [
        o.orderId || "",
        `"${(o.item || "").replace(/"/g, '""')}"`,
        o.itemCode || "",
        o.machine || "",
        o.plan || 0,
        o.finishValue || 0,
        o.status || "",
        dateStr,
        o.department || ""
      ];
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `teamleader_export_${fixedScope}_${format(new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatMachineForPlanner = (machine) => {
    const raw = String(machine || "").trim().toUpperCase();
    if (!raw) return "ONBEKEND";
    if (raw.startsWith("40")) return raw;
    if (/^(BH|BM|BA|\d{4,5})/.test(raw)) return `40${raw}`;
    return raw;
  };

  const getOrderDate = (order) => {
    const value = order?.plannedDate || order?.date || order?.deliveryDate || null;
    if (!value) return null;
    if (value?.toDate) return value.toDate();
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  };

  const handlePlannerExcelExport = () => {
    if (dataStore.length === 0) {
      alert("Geen data om te exporteren.");
      return;
    }

    const filtered = dataStore.filter((o) => normalizeMachine(o.machine || "") !== "BH18");
    if (filtered.length === 0) {
      alert("Geen exportdata beschikbaar buiten BH18.");
      return;
    }

    const byMachine = filtered.reduce((acc, order) => {
      const machineKey = formatMachineForPlanner(order.machine || "ONBEKEND");
      if (!acc[machineKey]) acc[machineKey] = [];
      acc[machineKey].push(order);
      return acc;
    }, {});

    const workbook = XLSX.utils.book_new();

    Object.entries(byMachine)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([machine, orders]) => {
        const aoa = [];
        aoa.push([machine, "", "Printdatum:", format(new Date(), "M/d/yyyy")]);
        aoa.push([]);
        aoa.push([
          "Machine",
          "datum",
          "Week",
          "order",
          "PO Text",
          "Project",
          "Project Desc",
          "Manufactured Item",
          "Item Desc",
          "code",
          "Drawing",
          "Plan",
          "to do",
          "Gewikkeld",
          "Finish",
        ]);

        orders
          .slice()
          .sort((a, b) => {
            const ad = getOrderDate(a)?.getTime() || 0;
            const bd = getOrderDate(b)?.getTime() || 0;
            if (ad !== bd) return ad - bd;
            return String(a.orderId || "").localeCompare(String(b.orderId || ""));
          })
          .forEach((o) => {
            const date = getOrderDate(o);
            const week = o.weekNumber || (date ? getISOWeek(date) : "");
            const plan = parseInt(o.plan || o.quantity || 0, 10) || 0;
            const wrapped = parseInt(o.finishValue || o.wrapped || 0, 10) || 0;
            const toDo = Math.max(plan - wrapped, 0);
            const machineCode = formatMachineForPlanner(o.machine || machine);
            const dateValue = date ? format(date, "M/d/yyyy") : "";

            aoa.push([
              machineCode,
              dateValue,
              week,
              o.orderId || "",
              o.notes || o.poText || "",
              o.project || "",
              o.projectDesc || "",
              o.itemCode || "",
              o.item || o.itemDescription || "",
              o.extraCode || o.code || "",
              o.drawing || "",
              plan,
              toDo,
              wrapped,
              "",
            ]);
          });

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws["!cols"] = [
          { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 20 },
          { wch: 28 }, { wch: 28 }, { wch: 10 }, { wch: 18 }, { wch: 8 }, { wch: 8 },
          { wch: 10 }, { wch: 10 },
        ];

        XLSX.utils.book_append_sheet(workbook, ws, machine.slice(0, 31));
      });

    XLSX.writeFile(workbook, `planner_export_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const handleCopyYesterday = async (targetDeptId) => {
    const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const currentDayStr = format(new Date(), "yyyy-MM-dd");
    const yesterdayData = bezetting.filter(
      (o) => o.date === yesterdayStr && o.operatorNumber && o.departmentId === targetDeptId
    );

    if (yesterdayData.length === 0) {
      alert("Geen bezetting van gisteren gevonden voor deze afdeling.");
      return;
    }
    if (!window.confirm(`Wil je ${yesterdayData.length} toewijzingen van gisteren kopiëren naar vandaag?`)) return;

    setIsCopying(true);
    try {
      const batch = writeBatch(db);
      yesterdayData.forEach((old) => {
        const newId = `${currentDayStr}_${old.departmentId}_${old.machineId}_${old.operatorNumber}`.replace(/[^a-zA-Z0-9]/g, "_");
        const newRef = doc(db, ...PATHS.OCCUPANCY, newId);
        batch.set(newRef, { ...old, id: newId, date: currentDayStr, updatedAt: serverTimestamp() }, { merge: true });
      });
      await batch.commit();
      await logActivity(
        user?.uid || "system",
        "OCCUPANCY_COPY_YESTERDAY",
        `Bezetting gekopieerd van gisteren: afdeling ${targetDeptId}, aantal ${yesterdayData.length}`
      );
    } catch (err) {
      console.error("Fout bij kopiëren:", err);
      alert("Fout bij kopiëren: " + err.message);
    } finally {
      setIsCopying(false);
    }
  };

  const handleClearToday = async (targetDeptId) => {
    const currentDayStr = format(new Date(), "yyyy-MM-dd");
    const todayData = bezetting.filter(
      (o) => o.date === currentDayStr && o.departmentId === targetDeptId
    );

    if (todayData.length === 0) {
      alert("Geen bezetting gevonden voor vandaag om te wissen.");
      return;
    }
    if (!window.confirm(`Weet je zeker dat je de bezetting van VANDAAG (${todayData.length} items) voor deze afdeling wilt wissen?`)) return;

    setIsClearing(true);
    try {
      const batch = writeBatch(db);
      todayData.forEach((docItem) => {
        const ref = doc(db, ...PATHS.OCCUPANCY, docItem.id);
        batch.delete(ref);
      });
      await batch.commit();
      await logActivity(
        user?.uid || "system",
        "OCCUPANCY_CLEAR_TODAY",
        `Bezetting gewist voor vandaag: afdeling ${targetDeptId}, aantal ${todayData.length}`
      );
    } catch (err) {
      console.error("Fout bij wissen:", err);
      alert("Fout bij wissen: " + err.message);
    } finally {
      setIsClearing(false);
    }
  };

  const handleMoveLot = async (lotNumber, newStation) => {
    if (!lotNumber || !newStation) return;
    try {
      const productRef = doc(db, ...PATHS.TRACKING, lotNumber);
      
      // Bepaal direct de juiste status (bijv. Te Nabewerken)
      const nextState = getStepForStation(newStation);

      await updateDoc(productRef, {
        currentStation: newStation,
        currentStep: nextState.currentStep,
        status: nextState.status || "in_progress",
        isManualMove: true,
        updatedAt: serverTimestamp(),
        note: `Handmatig verplaatst naar ${newStation} door ${user?.email || 'Teamleader'}`
      });
      await logActivity(
        user?.uid || "system",
        "LOT_MANUAL_MOVE",
        `Teamleader verplaatsing: lot ${lotNumber} -> ${newStation}`
      );
      alert(`Product ${lotNumber} verplaatst naar ${newStation}`);
    } catch (err) {
      console.error("Fout bij verplaatsen:", err);
      alert("Fout bij verplaatsen: " + err.message);
    }
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!newOrderData.orderId || !newOrderData.item || !newOrderData.machine || !newOrderData.plan) {
      alert("Vul alle velden in.");
      return;
    }
    setCreatingOrder(true);
    try {
      await addDoc(collection(db, ...PATHS.PLANNING), {
        orderId: newOrderData.orderId,
        item: newOrderData.item,
        machine: newOrderData.machine,
        plan: Number(newOrderData.plan),
        status: "planned",
        createdAt: serverTimestamp(),
        week: getISOWeek(new Date()),
        year: new Date().getFullYear(),
      });
      await logActivity(
        user?.uid || "system",
        "ORDER_CREATE_MANUAL",
        `Teamleader order aangemaakt: ${newOrderData.orderId}, machine ${newOrderData.machine}, plan ${newOrderData.plan}`
      );
      setShowAddOrderModal(false);
      setNewOrderData({ orderId: "", item: "", machine: "", plan: "" });
    } catch (error) {
      console.error("Error creating order:", error);
      alert("Fout bij aanmaken order: " + error.message);
    } finally {
      setCreatingOrder(false);
    }
  };

  if (loading)
    return (
      <div className="flex h-full flex-col items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          {t('teamleader.loading_data', 'Productiedata synchroniseren...')}
        </p>
      </div>
    );

  if (!user?.role || user?.role === 'guest')
    return (
      <div className="h-full flex flex-col items-center justify-center p-10 text-center">
        <h3 className="text-xl font-black uppercase italic text-slate-400">{t('teamleader.access_denied', 'Toegang Beperkt')}</h3>
        <p className="text-slate-500 text-sm mt-2 max-w-xs">{t('teamleader.no_rights', 'Uw account heeft nog geen rechten om deze data te bekijken.')}</p>
        <button onClick={onBack || onExit} className="mt-8 px-8 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all">{t('common.back', 'Terug')}</button>
      </div>
    );

  if (dbError)
    return (
      <div className="h-full flex flex-col items-center justify-center p-10 text-center">
        <AlertTriangle size={48} className="text-rose-500 mb-4" />
        <h3 className="text-xl font-black uppercase italic">{t('teamleader.db_error_title', 'Database Verbindingsfout')}</h3>
        <p className="text-slate-500 text-sm mt-2 max-w-xs">{t('teamleader.db_error_desc', 'De app kon geen verbinding maken met Firestore (Fout: {{error}}).', { error: dbError })}</p>
        <button onClick={() => window.location.reload()} className="mt-8 px-8 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl">
          {t('teamleader.retry', 'Opnieuw Proberen')}
        </button>
      </div>
    );

  return (
    <div className="flex flex-col h-full bg-slate-50 text-left w-full animate-in fade-in duration-300 overflow-hidden relative">
      <div className="bg-white border-b border-slate-200 shrink-0 z-40 shadow-sm px-4 sm:px-6 py-3">
        <div className="flex justify-between items-center gap-4">
          <div className="flex items-center gap-4 w-full lg:w-auto">
            <button onClick={onBack || onExit} className="p-2 sm:p-3 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl transition-all active:scale-90 shrink-0">
              <ArrowLeft size={24} />
            </button>
            
            {/* Afdeling Filter (Alleen zichtbaar voor Central Planner / All Scope) */}
            {fixedScope === "all" && (
              <select 
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="bg-slate-100 border-none text-slate-700 text-sm rounded-xl focus:ring-blue-500 block p-2.5 font-bold outline-none cursor-pointer hover:bg-slate-200 transition-colors"
              >
                <option value="ALL">Alle Afdelingen</option>
                <option value="FITTINGS">Fittings</option>
                <option value="PIPES">Pipes</option>
                <option value="SPOOLS">Spools</option>
              </select>
            )}

            <div className="text-left">
              <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter leading-none whitespace-nowrap">{title}</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 truncate">{departmentName} {t('teamleader.dashboard', 'Dashboard')}</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex bg-slate-100 p-1 rounded-2xl overflow-x-auto max-w-full no-scrollbar w-full lg:w-auto justify-start lg:justify-center">
            <button onClick={() => setActiveTab("dashboard")} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === "dashboard" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t('teamleader.tab_dashboard', 'Dashboard')}</button>
            <button onClick={() => setActiveTab("planning")} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === "planning" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              <span>{t('teamleader.tab_full_list', 'Volledige Lijst')}</span>
              {canManageOverproduction && overproductionGroups.length > 0 && (
                <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center shadow-sm animate-pulse">
                  {overproductionGroups.length}
                </span>
              )}
            </button>
            <button onClick={() => setActiveTab("bezetting")} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === "bezetting" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t('teamleader.tab_personnel', 'Personeel')}</button>
            <button onClick={() => setActiveTab("efficiency")} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === "efficiency" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t('teamleader.tab_efficiency', 'Efficiëntie')}</button>
            <button onClick={() => setActiveTab("gantt")} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === "gantt" ? "bg-white text-orange-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t('teamleader.tab_gantt', 'Gantt-planning')}</button>
          </div>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-3 w-full lg:w-auto justify-end">
            {activeTab === "efficiency" && (
              <button 
                onClick={() => setShowAiPrediction(!showAiPrediction)} 
                className={`px-4 py-2 ${showAiPrediction ? 'bg-purple-700' : 'bg-purple-600'} text-white rounded-xl shadow-lg font-black text-[10px] uppercase tracking-wider flex items-center gap-2 active:scale-95 transition-all whitespace-nowrap hover:bg-purple-700`}
              >
                <BrainCircuit size={16} /> <span className="hidden sm:inline">AI Analyse</span>
              </button>
            )}
            <button onClick={handlePlannerExcelExport} className="p-2 bg-white border border-slate-200 text-emerald-700 rounded-xl shadow-sm hover:bg-emerald-50 transition-all" title={t('teamleader.export_planner_excel', 'Exporteer Planner Excel')}><Table size={20} /></button>
            <button onClick={handleExport} className="p-2 bg-white border border-slate-200 text-slate-600 rounded-xl shadow-sm hover:bg-slate-50 transition-all" title={t('teamleader.export_csv', 'Exporteer CSV')}><Download size={20} /></button>
            <button onClick={() => setShowAddOrderModal(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-xl shadow-lg font-black text-[10px] uppercase tracking-wider flex items-center gap-2 active:scale-95 transition-all whitespace-nowrap"><Plus size={16} /> <span className="hidden sm:inline">{t('teamleader.new_order', 'Nieuwe Order')}</span></button>
            <button onClick={() => setShowImportModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-xl shadow-lg font-black text-[10px] uppercase tracking-wider flex items-center gap-2 active:scale-95 transition-all whitespace-nowrap"><FileSpreadsheet size={16} /> <span className="hidden sm:inline">{t('teamleader.import', 'Import')}</span></button>
            <button onClick={handleDrawingSync} disabled={isSyncingDrawings} className="p-2 bg-white border border-slate-200 text-purple-600 rounded-xl shadow-sm hover:bg-purple-50 transition-all disabled:opacity-50" title="Sync Tekeningen"><RefreshCw size={20} className={isSyncingDrawings ? 'animate-spin' : ''} /></button>
          </div>

          {/* Mobile Menu Button */}
          <div className="lg:hidden relative">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 bg-gray-100 rounded-lg text-gray-600 active:bg-gray-200"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {isMobileMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 p-2 flex flex-col gap-1 z-50 animate-in slide-in-from-top-2">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 py-1">Navigatie</div>
                <button onClick={() => { setActiveTab("dashboard"); setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${activeTab === "dashboard" ? "bg-blue-50 text-blue-600" : "text-gray-500"}`}>{t('teamleader.tab_dashboard', 'Dashboard')}</button>
                <button onClick={() => { setActiveTab("planning"); setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full flex items-center justify-between ${activeTab === "planning" ? "bg-blue-50 text-blue-600" : "text-gray-500"}`}>
                  <span>{t('teamleader.tab_full_list', 'Volledige Lijst')}</span>
                  {canManageOverproduction && overproductionGroups.length > 0 && (
                    <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center shadow-sm">
                      {overproductionGroups.length}
                    </span>
                  )}
                </button>
                <button onClick={() => { setActiveTab("bezetting"); setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${activeTab === "bezetting" ? "bg-blue-50 text-blue-600" : "text-gray-500"}`}>{t('teamleader.tab_personnel', 'Personeel')}</button>
                <button onClick={() => { setActiveTab("efficiency"); setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${activeTab === "efficiency" ? "bg-blue-50 text-blue-600" : "text-gray-500"}`}>{t('teamleader.tab_efficiency', 'Efficiëntie')}</button>
                <button onClick={() => { setActiveTab("gantt"); setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${activeTab === "gantt" ? "bg-blue-50 text-blue-600" : "text-gray-500"}`}>{t('teamleader.tab_gantt', 'Gantt-planning')}</button>
                
                <div className="h-px bg-slate-100 my-1"></div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 py-1">Acties</div>
                
                {activeTab === "efficiency" && (
                  <button onClick={() => { setShowAiPrediction(!showAiPrediction); setIsMobileMenuOpen(false); }} className="px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full text-purple-600 hover:bg-purple-50 flex items-center gap-2">
                    <BrainCircuit size={16} /> AI Analyse
                  </button>
                )}
                <button onClick={() => { setShowAddOrderModal(true); setIsMobileMenuOpen(false); }} className="px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full text-emerald-600 hover:bg-emerald-50 flex items-center gap-2"><Plus size={16} /> {t('teamleader.new_order', 'Nieuwe Order')}</button>
                <button onClick={() => { setShowImportModal(true); setIsMobileMenuOpen(false); }} className="px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full text-blue-600 hover:bg-blue-50 flex items-center gap-2"><FileSpreadsheet size={16} /> {t('teamleader.import', 'Import')}</button>
                <button onClick={() => { handlePlannerExcelExport(); setIsMobileMenuOpen(false); }} className="px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full text-emerald-700 hover:bg-emerald-50 flex items-center gap-2"><Table size={16} /> {t('teamleader.export_planner_excel', 'Exporteer Planner Excel')}</button>
                <button onClick={() => { handleExport(); setIsMobileMenuOpen(false); }} className="px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full text-slate-600 hover:bg-slate-50 flex items-center gap-2"><Download size={16} /> {t('teamleader.export_csv', 'Exporteer CSV')}</button>
                <button onClick={() => { handleDrawingSync(); setIsMobileMenuOpen(false); }} disabled={isSyncingDrawings} className="px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full text-purple-600 hover:bg-purple-50 flex items-center gap-2 disabled:opacity-50"><RefreshCw size={16} className={isSyncingDrawings ? 'animate-spin' : ''} /> Sync Tekeningen</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6 w-full flex flex-col text-left">
        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          {activeTab === "dashboard" ? (
            <TeamleaderDashboard metrics={metrics} onKpiClick={handleKpiClick} onStationSelect={setSelectedStationDetail} />
          ) : activeTab === "bezetting" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-end">
                <button
                  onClick={handleOpenExtendedPersonnel}
                  className="px-4 py-2 bg-white border border-indigo-200 text-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 transition-all flex items-center gap-2 shadow-sm"
                  title="Open uitgebreide Personeel & Bezetting in Admin Hub"
                >
                  <Link2 size={14} /> Uitgebreide Personeel Module
                </button>
              </div>
              <PersonnelOccupancyView
                scope={departmentFilter !== "ALL" ? departmentFilter.toLowerCase() : fixedScope}
                onCopyYesterday={handleCopyYesterday}
                isCopying={isCopying}
                onClearToday={handleClearToday}
                isClearing={isClearing}
              />
            </div>
          ) : activeTab === "efficiency" ? (
            showAiPrediction ? (
              <AiPredictionView onClose={() => setShowAiPrediction(false)} />
            ) : (
              <TeamleaderEfficiencyView departmentName={departmentFilter !== "ALL" ? departmentFilter : departmentName} />
            )
          ) : activeTab === "gantt" ? (
            <TeamleaderGanttView metrics={metrics} />
          ) : (
            <div className="h-full flex gap-6 overflow-hidden">
              <div className={`shrink-0 flex flex-col min-h-0 transition-all duration-300 ${selectedDetailEntry ? 'hidden lg:flex w-[38rem]' : 'w-full lg:w-[38rem]'}`}>
                {canManageOverproduction && (
                  <div className="mb-4 shrink-0 rounded-[32px] border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-600 flex items-center gap-2">
                          <AlertTriangle size={14} /> Overproductie
                        </p>
                        <h3 className="text-lg font-black text-slate-900 italic mt-2">Openstaande extra producten</h3>
                        <p className="text-xs font-bold text-slate-500 mt-1">Koppel extras aan een nieuw LN-ordernummer en stuur ze direct door naar de juiste vervolgstap.</p>
                      </div>
                      <div className="px-3 py-2 rounded-2xl bg-white border border-amber-200 text-amber-700 text-sm font-black min-w-[3rem] text-center">
                        {overproductionGroups.length}
                      </div>
                    </div>

                    <div className="mt-4 space-y-3 max-h-[18rem] overflow-y-auto custom-scrollbar pr-1">
                      {overproductionGroups.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-amber-200 bg-white/70 px-4 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">
                          Geen openstaande overproductie
                        </div>
                      ) : (
                        overproductionGroups.map((group) => {
                          const sampleRoute = resolveOverproductionRoute({ machine: group.originMachine, item: group.item }, group, "");
                          return (
                            <button
                              key={group.key}
                              onClick={() => handleOpenOverproductionGroup(group)}
                              className="w-full rounded-2xl border border-amber-100 bg-white px-4 py-3 text-left hover:border-amber-300 hover:bg-amber-50/40 transition-all"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-black text-slate-900">{group.originalOrderId}</span>
                                    <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest">{group.count} extra</span>
                                  </div>
                                  <p className="text-xs font-bold text-slate-600 mt-1 truncate">{group.item || "Onbekend product"}</p>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-2">Bron: {group.originMachine || "-"} · Route: {sampleRoute.station || "Handmatig"}</p>
                                </div>
                                <div className="flex items-center gap-2 text-amber-600 font-black text-xs uppercase">
                                  <Layers size={14} /> {group.lotNumbers.length}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
                <div className="min-h-0 flex-1">
                  <PlanningSidebar
                    orders={dataStore}
                    trackedProducts={rawProducts}
                    enableRejectionScopes={true}
                    selectedOrderId={selectedSidebarEntryId}
                    onSelect={handleSidebarSelect}
                  />
                </div>
              </div>
              <div className={`flex-1 bg-white rounded-[40px] border border-slate-200 shadow-sm flex flex-col overflow-hidden ${selectedDetailEntry ? 'flex' : 'hidden lg:flex'}`}>
                {selectedOrder ? (
                  <OrderDetail 
                    order={selectedOrder} 
                    products={rawProducts} 
                    onClose={() => { setSelectedOrderId(null); setSelectedSidebarEntry(null); }} 
                    isManager={true} 
                    onMoveLot={handleMoveLot} 
                    onOpenDossier={setViewingDossier} 
                    showAllStations={true} 
                    currentDepartment={targetSlug}
                    allowedStations={effectiveStations}
                  />
                ) : selectedSidebarEntry?.isArchivedOrder ? (
                  <div className="h-full flex flex-col p-8 lg:p-10 text-left overflow-y-auto">
                    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-6">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">History / Archief</p>
                        <h3 className="text-2xl font-black text-slate-900 italic tracking-tight mt-1">{selectedSidebarEntry.orderId || selectedSidebarEntry.id || '-'}</h3>
                        <p className="text-sm font-bold text-slate-500 mt-1">{selectedSidebarEntry.item || selectedSidebarEntry.itemDescription || '-'}</p>
                      </div>
                      <button
                        onClick={() => { setSelectedOrderId(null); setSelectedSidebarEntry(null); }}
                        className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-200"
                      >
                        Sluiten
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</p>
                        <p className="text-sm font-bold text-slate-800 mt-1">Voltooid (Archief)</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Machine</p>
                        <p className="text-sm font-bold text-slate-800 mt-1">{selectedSidebarEntry.machine || selectedSidebarEntry.originMachine || '-'}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 md:col-span-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lotnummers</p>
                        {Array.isArray(selectedSidebarEntry.lotNumbers) && selectedSidebarEntry.lotNumbers.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {selectedSidebarEntry.lotNumbers.map((lot) => (
                              <div key={lot} className="flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 px-3 py-2">
                                <span className="text-sm font-bold text-slate-800 break-all">{lot}</span>
                                <button
                                  onClick={() => handleOpenArchivedLotDossier(lot)}
                                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700"
                                >
                                  Open dossier
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 px-3 py-2">
                            <span className="text-sm font-bold text-slate-800 break-all">{selectedSidebarEntry.lotNumber || selectedSidebarEntry.lotNumbersText || '-'}</span>
                            <button
                              onClick={() => handleOpenArchivedLotDossier(selectedSidebarEntry.lotNumber)}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700"
                            >
                              Open dossier
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-center items-center opacity-40 italic text-center">
                    <ClipboardList size={64} className="mb-4 text-slate-300" />
                    <p className="font-black uppercase tracking-widest text-xs text-slate-400">{t('teamleader.select_order', 'Selecteer een order uit de lijst')}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showImportModal && <PlanningImportModal isOpen={true} onClose={() => setShowImportModal(false)} />}
      
      {showAddOrderModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[30px] shadow-2xl p-8">
            <h3 className="text-xl font-black text-slate-800 uppercase italic mb-6">Nieuwe Order</h3>
            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Order Nummer</label>
                <input 
                  type="text" 
                  value={newOrderData.orderId} 
                  onChange={e => setNewOrderData({...newOrderData, orderId: e.target.value})}
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500"
                  placeholder="Bijv. TEST-PILOT-001"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Product</label>
                <input 
                  type="text" 
                  value={newOrderData.item} 
                  onChange={e => setNewOrderData({...newOrderData, item: e.target.value})}
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500"
                  placeholder="Bijv. GRE-160-PN16"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Machine</label>
                <select 
                  value={newOrderData.machine} 
                  onChange={e => setNewOrderData({...newOrderData, machine: e.target.value})}
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500"
                >
                  <option value="">Selecteer Machine...</option>
                  {effectiveStations.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Aantal</label>
                <input 
                  type="number" 
                  value={newOrderData.plan} 
                  onChange={e => setNewOrderData({...newOrderData, plan: e.target.value})}
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowAddOrderModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold uppercase text-xs">Annuleren</button>
                <button type="submit" disabled={creatingOrder} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase text-xs hover:bg-emerald-700">{creatingOrder ? "..." : "Aanmaken"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedStationDetail && <StationDetailModal stationId={selectedStationDetail} allOrders={dataStore} allProducts={rawProducts} allArchivedProducts={archivedProducts} onClose={() => setSelectedStationDetail(null)} />}
      
      <TraceModal 
        isOpen={!!activeKpi} 
        onClose={() => { setActiveKpi(null); setLastKpi(null); }} 
        title={modalTitle} 
        data={modalData} 
        onRowClick={(item) => { 
            setLastKpi(activeKpi);
            setActiveKpi(null); 
            setViewingDossier(item); 
        }} 
      />
      
      {viewingDossier && (
        <ProductDossierModal 
          isOpen={true} 
          product={viewingDossier} 
          onClose={() => { setViewingDossier(null); if (lastKpi) setActiveKpi(lastKpi); }} 
          orders={rawOrders} 
          onMoveLot={handleMoveLot} 
          currentDepartment={targetSlug}
          allowedStations={effectiveStations}
        />
      )}

      {selectedOverproductionGroup && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 bg-amber-50/70 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-600 flex items-center gap-2"><Link2 size={14} /> Overproductie koppelen</p>
                <h3 className="text-2xl font-black text-slate-900 italic mt-2">{selectedOverproductionGroup.originalOrderId}</h3>
                <p className="text-sm font-bold text-slate-500 mt-1">{selectedOverproductionGroup.count} extra producten · {selectedOverproductionGroup.item || "Onbekend product"}</p>
              </div>
              <button onClick={() => setSelectedOverproductionGroup(null)} className="p-2 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50">
                <X size={18} />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Lotnummers</p>
                <div className="flex flex-wrap gap-2">
                  {selectedOverproductionGroup.lotNumbers.map((lot) => (
                    <span key={lot} className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-black text-slate-700">{lot}</span>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Nieuw LN-ordernummer</label>
                <input
                  type="text"
                  value={overproductionTargetOrderId}
                  onChange={(e) => setOverproductionTargetOrderId(e.target.value.toUpperCase())}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-800 outline-none focus:border-blue-500"
                  placeholder="Bijv. 125874 of LN-NEW-001"
                />
                <div className="mt-3 space-y-2 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                  {overproductionTargetCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      onClick={() => setOverproductionTargetOrderId(String(candidate.orderId || ""))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50/40"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-900">{candidate.orderId}</p>
                          <p className="text-xs font-bold text-slate-500 mt-1">{candidate.item || "-"}</p>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{candidate.machine || "-"}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                const targetOrder = rawOrders.find((order) => String(order.orderId || "").trim().toUpperCase() === String(overproductionTargetOrderId || "").trim().toUpperCase());
                const route = resolveOverproductionRoute(targetOrder, selectedOverproductionGroup, overproductionManualStation);
                return (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vervolgroute</p>
                        <p className="text-sm font-black text-slate-900 mt-2">{route.station || "Nog bepalen"}</p>
                        <p className="text-xs font-bold text-slate-500 mt-1">
                          {route.mode === "auto"
                            ? "Deze order slaat Wikkelen en Lossen over en gaat direct naar het vervolgstation."
                            : "Pipes zijn nog niet vastgelegd; kies handmatig het doelstation."}
                        </p>
                      </div>
                      <div className="px-3 py-2 rounded-2xl bg-white border border-slate-200 text-xs font-black uppercase tracking-widest text-slate-600">
                        {route.mode === "auto" ? "Auto" : "Handmatig"}
                      </div>
                    </div>

                    {route.mode === "manual" && (
                      <div className="mt-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Doelstation pipes</label>
                        <select
                          value={overproductionManualStation}
                          onChange={(e) => setOverproductionManualStation(e.target.value)}
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500"
                        >
                          <option value="">Kies station...</option>
                          <option value="Nabewerking">Nabewerking</option>
                          <option value="Mazak">Mazak</option>
                          <option value="BM01">BM01</option>
                        </select>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setSelectedOverproductionGroup(null)} className="px-5 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-100">
                Annuleren
              </button>
              <button
                onClick={handleAssignOverproduction}
                disabled={assigningOverproduction}
                className="px-5 py-3 rounded-2xl bg-amber-500 text-white font-black text-xs uppercase tracking-widest hover:bg-amber-600 shadow-lg disabled:opacity-50 flex items-center gap-2"
              >
                {assigningOverproduction ? <Loader2 size={16} className="animate-spin" /> : <Factory size={16} />}
                {assigningOverproduction ? "Koppelen..." : "Koppel en stuur door"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default TeamleaderHub;
