import { collection, collectionGroup, query, onSnapshot, doc, serverTimestamp, where, limit, getDocs, getDoc, arrayUnion, increment, addDoc, updateDoc } from "firebase/firestore";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, Loader2, Menu, X, Clock, Calendar, UserCheck, AlertTriangle } from "lucide-react";
import { useNFCReader, NFC_STATUS } from "../../hooks/useNFCReader";
import { db, logActivity } from "../../config/firebase";
import { PATHS, getArchiveItemsPath, getPathString } from "../../config/dbPaths";
import {
  rejectTrackedProductFinal,
  completeTrackedProduct,
  cancelTrackedProduction,
  moveTrackedProductManual,
  tempRejectTrackedProduct,
  advanceTrackedProduct,
  startWorkstationProductionRun,
  completeTrackedProductRepair,
  routeTrackedProductsToLossen,
  toggleTrackedProductPause,
  markTrackedProductReminder,
  linkPlanningOrderProduct,
  saveOccupancyAssignments,
  saveOccupancyAssignment,
  savePersonnelRecord,
  createProductionMessages,
} from "../../services/planningSecurityService";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { getAuth } from "firebase/auth";
import { useNotifications } from "../../contexts/NotificationContext";

import { getISOWeek, startOfISOWeek } from "date-fns";
import {
  WORKSTATIONS,
  getISOWeekInfo,
  isInspectionOverdue,
} from "../../utils/workstationLogic";
import { normalizeMachine, FITTING_MACHINES, PIPE_MACHINES, getStartedCounterField } from "../../utils/hubHelpers";
import { toDateSafe } from "../../utils/dateUtils";
import ActiveProductionView from "./views/ActiveProductionView";
import { subscribeTrackedProducts } from "../../utils/trackedProducts";
import { useWorkstationStore } from "./useWorkstationStore";
import { WorkstationModals } from "./WorkstationModals";

import Terminal from "./Terminal";
import Nabewerken from "./Nabewerken";
import LossenView from "./LossenView";
import MazakView from "./MazakView";
import GereedView from "./GereedView";
import BM01Hub from "./BM01Hub";

declare global {
  interface Window {
    __app_id?: string;
    MSStream?: unknown;
  }
  interface Navigator {
    standalone?: boolean;
  }
}

type TimestampLike = {
  toDate?: () => Date;
  seconds?: number;
};

type PlanningOrder = {
  id?: string;
  orderId?: string;
  orderNumber?: string;
  item?: string;
  productCode?: string;
  plan?: number | string;
  quantity?: number | string;
  status?: string;
  machine?: string;
  week?: number | string;
  weekNumber?: number | string;
  weekYear?: number | string;
  year?: number | string;
  dateObj?: Date;
  plannedDate?: unknown;
  createdAt?: TimestampLike | string | number | Date | null;
  updatedAt?: TimestampLike | string | number | Date | null;
  [key: string]: unknown;
};

type TrackedProductDoc = {
  id?: string;
  lotNumber?: string;
  orderId?: string;
  status?: string;
  currentStep?: string;
  currentStation?: string;
  lastStation?: string;
  originMachine?: string;
  item?: string;
  itemCode?: string;
  machine?: string;
  reminderSent?: boolean;
  inspection?: { status?: string; timestamp?: unknown };
  timestamps?: {
    station_start?: TimestampLike | string | number | Date | null;
    started?: TimestampLike | string | number | Date | null;
    wikkelen_start?: TimestampLike | string | number | Date | null;
    lossen_start?: TimestampLike | string | number | Date | null;
    wikkelen_end?: TimestampLike | string | number | Date | null;
    finished?: TimestampLike | string | number | Date | null;
  };
  createdAt?: TimestampLike | string | number | Date | null;
  updatedAt?: TimestampLike | string | number | Date | null;
  [key: string]: unknown;
};

type OccupancyEntry = {
  id?: string;
  machineId?: string;
  station?: string;
  date?: TimestampLike | string | number | Date | null;
  shift?: string;
  isActive?: boolean;
  checkedOutAt?: unknown;
  operatorNumber?: string;
  operatorName?: string;
  hoursWorked?: number | string;
  shiftEffectiveStart?: unknown;
  checkedInAt?: unknown;
  isSecondary?: boolean;
  hoursAdjusted?: boolean;
  [key: string]: unknown;
};

type PersonnelEntry = {
  id?: string;
  employeeNumber?: string;
  personnelNumber?: string;
  number?: string;
  name?: string;
  shiftId?: string;
  temporaryShiftOverride?: {
    enabled?: boolean;
    startDate?: string;
    endDate?: string;
    shiftId?: string;
  };
  rotationSchedule?: {
    enabled?: boolean;
    startWeek?: number;
    shifts?: string[];
  };
  [key: string]: unknown;
};

type AppUser = {
  uid?: string;
  email?: string | null;
  role?: string;
  [key: string]: unknown;
};

type WorkstationHubProps = {
  initialStationId?: string | { name?: string };
  onExit?: () => void;
  searchOrder?: string | null;
};

const getAppId = () => {
  if (typeof window !== "undefined" && window.__app_id) return window.__app_id;
  return "fittings-app-v1";
};

const LOSSEN_1218_SOURCE_STATIONS = new Set(["BH12"]);
const LOSSEN_1218_STATION_NAME = "LOSSEN 12/18";
// Stations waarbij operators ook automatisch worden ingelogd bij LOSSEN 12/18
const AUTO_LOSSEN_1218_SOURCE_STATIONS = new Set(["BH12", "BH15", "BH17", "BH18"]);

// Bepaal lossen route op basis van product type (TB/CB) en diameter
// TB 25-300mm  → tab lossen (lokaal)
// TB >= 300mm  → station LOSSEN (centraal)
// CB 25-350mm  → tab lossen (lokaal)
// CB >= 350mm  → station LOSSEN (centraal)
const getLossenRoute = (itemText: unknown, originStation = "") => {
  const originNorm = String(originStation || "").toUpperCase().replace(/\s/g, "");
  const text = String(itemText || "").toUpperCase();
  const hasFlange = text.includes("FL") || text.includes("FLANGE");

  if (originNorm === "BH31" || originNorm === "BH16") return { mode: "STATION", station: "LOSSEN" };
  if (originNorm === "BH17") return { mode: "STATION", station: "MAZAK" };
  
  if (originNorm === "BH15") {
    if (hasFlange) return { mode: "STATION", station: "MAZAK" };
    return { mode: "STATION", station: LOSSEN_1218_STATION_NAME };
  }
  
  if (originNorm === "BH11") {
    if (hasFlange) return { mode: "STATION", station: "MAZAK" };
    return { mode: "STATION", station: "LOSSEN" };
  }

  if (LOSSEN_1218_SOURCE_STATIONS.has(originNorm)) {
    return { mode: "STATION", station: LOSSEN_1218_STATION_NAME };
  }


  const isTB = text.includes("TB");
  const isCB = text.includes("CB");
  const isELB = text.includes("ELB");
  const isAB = /\bAB\b/.test(text) || text.includes("ABAB");
  const isSB = /\bSB\b/.test(text);
  const isElbow = isELB || isCB;

  // Alle AB en SB elbows altijd naar centraal LOSSEN
  if (isElbow && (isAB || isSB)) return { mode: "STATION", station: "LOSSEN" };

  const numberMatches = Array.from(text.matchAll(/\d{2,4}/g)).map((m) => Number(m[0]));
  const candidates = numberMatches.filter((n) => Number.isFinite(n) && n >= 25 && n <= 2000);
  const diameter = candidates.length > 0 ? candidates[0] : 0;

  if (isTB && diameter >= 300) return { mode: "STATION", station: "LOSSEN" };
  if ((isCB || isELB) && diameter >= 350) return { mode: "STATION", station: "LOSSEN" };
  
  return { mode: "TAB", station: originNorm || "" };
};

const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getYesterdayString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isDateWithinInclusiveRange = (dateStr: unknown, startDateStr: unknown, endDateStr: unknown) => {
  if (!dateStr || !startDateStr) return false;
  const from = String(startDateStr);
  const to = String(endDateStr || startDateStr);
  return dateStr >= from && dateStr <= to;
};

const normalizePlanningStatus = (status: unknown) => String(status || "").trim().toLowerCase();

const isInactivePlanningStatus = (status: unknown) => {
  const normalized = normalizePlanningStatus(status);
  return ["completed", "cancelled", "shipped", "rejected", "finished", "deleted"].includes(normalized);
};

const toFiniteNumber = (value: unknown) => {
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;

  const raw = String(value || "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(",", ".");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Dienst configuratie.
 * checkoutMinute = minuut van de dag waarop de dienst eindigt (voor auto-uitlog).
 * breakMinutes   = te verrekenen pauzetijd voor efficiency/uren (alleen voor DAGDIENST).
 */
export const SHIFT_CONFIG = {
  VROEG: { label: "VROEGE DIENST", checkinMinute: 6 * 60,       checkoutMinute: 14 * 60, breakMinutes: 0 },
  DAG:   { label: "DAGDIENST",     checkinMinute: 7 * 60 + 15,  checkoutMinute: 16 * 60, breakMinutes: 45 },
  LAAT:  { label: "LATE DIENST",   checkinMinute: 14 * 60,      checkoutMinute: 22 * 60, breakMinutes: 0 },
  NACHT: { label: "NACHTDIENST",   checkinMinute: 22 * 60,      checkoutMinute: 6 * 60,  breakMinutes: 0 },
};

type ShiftKey = keyof typeof SHIFT_CONFIG;

/**
 * Bereken de effectieve starttijd voor een ploeg.
 * De timer begint altijd op het officiële starttijdstip van de ploeg,
 * ongeacht of de operator eerder of later inlogt.
 */
const getShiftEffectiveStart = (shiftKey: ShiftKey, referenceDate = new Date()) => {
  const config = SHIFT_CONFIG[shiftKey];
  if (!config) return referenceDate;
  const startMinute = config.checkinMinute;
  const result = new Date(referenceDate);
  result.setHours(Math.floor(startMinute / 60), startMinute % 60, 0, 0);
  // NACHT-dienst start om 22:00 vorige dag als het nu na middernacht is (bijv. 01:00)
  if (shiftKey === "NACHT") {
    const nowMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
    if (nowMinutes < 12 * 60) {
      result.setDate(result.getDate() - 1);
    }
  }
  return result;
};

/**
 * Bepaal de dienstsleutel op basis van het huidige tijdstip.
 * Grenzen zijn gekozen op het midden tussen twee dienststartijden:
 *   VROEG  06:00 → check-in venster 05:00–07:14
 *   DAG    07:15 → check-in venster 07:15–13:44
 *   LAAT   13:50 → check-in venster 13:45–21:30
 *   NACHT  22:00 → rest
 */
const getCurrentShiftKey = (date = new Date()): ShiftKey => {
  const m = date.getHours() * 60 + date.getMinutes();
  if (m >= 5 * 60      && m < 7 * 60 + 15)  return "VROEG";
  if (m >= 7 * 60 + 15 && m < 13 * 60 + 45) return "DAG";
  if (m >= 13 * 60 + 45 && m < 21 * 60 + 30) return "LAAT";
  return "NACHT";
};

const getCurrentShiftLabel = (date = new Date()) => {
  const key = getCurrentShiftKey(date);
  return SHIFT_CONFIG[key]?.label ?? "NACHTDIENST";
};

const shiftMatchesBucket = (shiftLabel: unknown, bucket: ShiftKey) => {
  const label = String(shiftLabel || "").toUpperCase();
  if (bucket === "VROEG") return label.includes("VROEGE") || label.includes("OCHTEND") || label.includes("MORNING") || label.includes("EARLY");
  if (bucket === "DAG")   return label.includes("DAGDIENST") || label === "DAG" || label.includes("DAGPLOEG") || label.includes("DAY SHIFT");
  if (bucket === "LAAT")  return label.includes("LATE") || label.includes("AVOND") || label.includes("EVENING");
  if (bucket === "NACHT") return label.includes("NACHT") || label.includes("NIGHT");
  return false;
};

/**
 * Bepaal de dienstsleutel voor een persoon.
 * Leest eerst person.shiftId uit het personeelsbestand (bijv. "DAGDIENST", "VROEGE DIENST"),
 * en valt terug op kloktijd-detectie als het veld ontbreekt of niet herkend wordt.
 */
const resolveShiftKeyFromPerson = (person: PersonnelEntry | null | undefined): ShiftKey => {
  const todayStr = getTodayString();
  const override = person?.temporaryShiftOverride;
  const overrideShiftId =
    override?.enabled && isDateWithinInclusiveRange(todayStr, override?.startDate, override?.endDate)
      ? String(override?.shiftId || "")
      : "";

  // Ploegenrotatie: bepaal welke ploeg actief is op basis van het weeknummer
  let shiftIdFromRotation = "";
  if (!overrideShiftId && person?.rotationSchedule?.enabled && (person.rotationSchedule.shifts || []).length > 0) {
    const today = new Date();
    const currentWeekNum = getISOWeek(today);
    const startWeekNum = person.rotationSchedule.startWeek || 1;
    const rotationShifts = person.rotationSchedule.shifts || [];
    const weeksSinceStart = currentWeekNum - startWeekNum;
    const shiftIndex = ((weeksSinceStart % rotationShifts.length) + rotationShifts.length) % rotationShifts.length;
    shiftIdFromRotation = String(rotationShifts[shiftIndex] || "");
  }

  const raw = String(overrideShiftId || shiftIdFromRotation || person?.shiftId || "").toUpperCase().trim();
  if (!raw) return getCurrentShiftKey();
  // Directe match op sleutel (bijv. "DAG", "VROEG", "LAAT", "NACHT")
  if (raw in SHIFT_CONFIG) return raw as ShiftKey;
  // Match via label-logica
  for (const key of Object.keys(SHIFT_CONFIG) as ShiftKey[]) {
    if (shiftMatchesBucket(raw, key)) return key;
  }
  // Fallback: kloktijd
  return getCurrentShiftKey();
};

const WorkstationHub = ({ initialStationId, onExit, searchOrder }: WorkstationHubProps) => {
  const { t } = useTranslation();
  const { user: currentUser } = useAdminAuth() as { user: AppUser | null };
  const { showSuccess, showError, showInfo, showWarning, requestBrowserPermission, showConfirm , notify} = useNotifications();
  const navigate = useNavigate();
  const initialStationName = typeof initialStationId === "object" ? initialStationId?.name : initialStationId;

  const handleOperatorCheckout = async (occ: OccupancyEntry) => {
    if (!occ || !occ.id) return;
    
    const confirmMessage = t("digitalplanning.workstation.confirm_checkout_msg", { name: occ.operatorName, station: occ.machineId || selectedStation });
    const confirmed = await showConfirm({
      title: t("digitalplanning.workstation.confirm_checkout", "Uitloggen bevestigen"),
      message: confirmMessage || `Weet je zeker dat je ${occ.operatorName} wilt uitloggen van ${occ.machineId || selectedStation}?`,
      confirmText: t("digitalplanning.workstation.logout", "Uitloggen"),
      cancelText: t("common.cancel", "Annuleren"),
      tone: "danger",
    });

    if (!confirmed) return;

    try {
      const now = new Date();
      const previousHours = Number(occ.hoursWorked || 0);
      const checkedInDate = toDateSafe(occ.shiftEffectiveStart as any) || toDateSafe(occ.checkedInAt as any);
      const elapsedHours = checkedInDate ? Math.max(0, (now.getTime() - checkedInDate.getTime()) / 3600000) : 0;
      
      const breakHours = (SHIFT_CONFIG[occ.shiftKey as ShiftKey]?.breakMinutes ?? 0) / 60;
      const grossHours = Number((previousHours + elapsedHours).toFixed(2));
      const finalHours = occ.isSecondary
        ? 0
        : Math.max(0, Number((grossHours - breakHours).toFixed(2)));

      await saveOccupancyAssignment({
        assignmentId: occ.id,
        data: {
          hoursWorked: finalHours,
          hoursWorkedGross: occ.isSecondary ? 0 : grossHours,
          ...(breakHours > 0 && !occ.isSecondary ? { breakDeductedHours: breakHours } : {}),
          checkedOutAt: "__SERVER_TIMESTAMP__",
          isActive: false,
          updatedAt: "__SERVER_TIMESTAMP__",
        },
        source: "WorkstationHub.manualCheckout",
        actorLabel: currentUser?.email || "Operator",
      });

      await logWorkstationActivity(
        "OPERATOR_CHECKOUT",
        `Handmatige uitlog: ${occ.operatorName} op ${occ.machineId || selectedStation}`,
        { personnelNumber: occ.operatorNumber }
      );

      showSuccess(`${occ.operatorName} is uitgelogd.`);
    } catch (err) {
      console.error("Manual checkout failed:", err);
      showError("Uitloggen mislukt: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const [selectedStation, setSelectedStation] = useState(
    initialStationName || "BH11"
  );
  const activeTab = useWorkstationStore((state) => state.activeTab);
  const setActiveTab = useWorkstationStore((state) => state.setActiveTab);
  const [rawOrders, setRawOrders] = useState<PlanningOrder[]>([]);
  const [rawProducts, setRawProducts] = useState<TrackedProductDoc[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyEntry[]>([]);
  const [personnel, setPersonnel] = useState<PersonnelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSourceRefreshKey, setDataSourceRefreshKey] = useState(0);
  const [searchFilterOrder] = useState<string | null>(searchOrder || null);
  const [archivedStats, setArchivedStats] = useState<{ done: number; items: TrackedProductDoc[] }>({ done: 0, items: [] });
  
  // Huidige datum/tijd voor display
  const currentDate = new Date();
  const currentWeekInfo = getISOWeekInfo(currentDate);

  // Mobiel menu state
  const isMobileMenuOpen = useWorkstationStore((state) => state.isMobileMenuOpen);
  const setIsMobileMenuOpen = useWorkstationStore((state) => state.setIsMobileMenuOpen);
  const [checkedInOperator, setCheckedInOperator] = useState<PersonnelEntry | null>(null);
  const [dismissedPromptShift, setDismissedPromptShift] = useState<ShiftKey | null>(null);
  const [timeHeartbeat, setTimeHeartbeat] = useState<number>(Date.now());
  const [activeDowntime, setActiveDowntime] = useState<any>(null);

  useEffect(() => {
    if (!selectedStation) return;
    const q = query(
      collection(db, getPathString(PATHS.DOWNTIME)),
      where("machineId", "==", selectedStation),
      where("endTime", "==", null),
      limit(1)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setActiveDowntime({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setActiveDowntime(null);
      }
    });
    return () => unsubscribe();
  }, [selectedStation]);

  const toggleMachineStoring = async () => {
    if (activeDowntime) {
      const confirmed = await showConfirm({
        title: "Storing verholpen?",
        message: "Is de machine storing verholpen en kan de productie weer starten?",
        confirmText: "Ja, verholpen",
        cancelText: "Annuleren",
        tone: "default",
      });
      if (confirmed) {
        try {
          await logWorkstationActivity("MACHINE_UP", `Storing op ${selectedStation} verholpen.`);
          await updateDoc(doc(db, getPathString(PATHS.DOWNTIME), activeDowntime.id), {
            endTime: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          showSuccess("Storing succesvol afgemeld.");
        } catch (e) {
          console.error("Machine Storing Update Error:", e);
          showError("Kon storing niet afmelden. " + String(e));
        }
      }
    } else {
      const confirmed = await showConfirm({
        title: "Machine in storing?",
        message: "Wil je deze machine in storing melden? Productie kan niet gestart worden zolang de storing actief is.",
        confirmText: "Ja, in storing zetten",
        cancelText: "Annuleren",
        tone: "danger",
      });
      if (confirmed) {
        try {
          await logWorkstationActivity("MACHINE_DOWN", `Machine ${selectedStation} in storing gemeld.`);
          await addDoc(collection(db, getPathString(PATHS.DOWNTIME)), {
            machineId: selectedStation,
            startTime: serverTimestamp(),
            endTime: null,
            reportedBy: checkedInOperator?.name || currentUser?.email || "Onbekend",
            status: "STORING",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          showWarning("Machine staat nu in storing!");
        } catch (e) {
          console.error("Machine Storing Add Error:", e);
          showError("Kon storing niet aanmelden. " + String(e));
        }
      }
    }
  };
  const lastShiftRef = useRef<ShiftKey>(getCurrentShiftKey(new Date()));

  const logWorkstationActivity = async (action: string, details: string, options: { personnelNumber?: string } = {}) => {
    const baseDetails = String(details || "");
    const resolvedPersonnelNumber = String(
      options?.personnelNumber || checkedInOperator?.number || ""
    ).trim();

    const hasPersonnelNumberAlready = /personeelsnummer\s*:/i.test(baseDetails);
    const enrichedDetails =
      resolvedPersonnelNumber && !hasPersonnelNumberAlready
        ? `${baseDetails} | Personeelsnummer: ${resolvedPersonnelNumber}`
        : baseDetails;

    await logActivity(currentUser?.uid || "system", action, enrichedDetails);
  };

  // NFC scanner (Web NFC API — Android Chrome 89+)
  // handleOperatorShiftCheckinRef wordt hieronder ingesteld na de functiedefinitie
  const nfcPendingBadgeRef = useRef<string | null>(null);
  const handleOperatorShiftCheckinRef = useRef<((badgeOverride?: unknown) => Promise<void>) | null>(null);
  const nfc = useNFCReader((employeeNumber) => {
    useWorkstationStore.getState().setOperatorBadgeInput(employeeNumber);
    nfcPendingBadgeRef.current = employeeNumber;
    // Aanmelden via ref zodat we geen forward-reference nodig hebben
    setTimeout(() => {
      const badge = nfcPendingBadgeRef.current;
      if (badge && handleOperatorShiftCheckinRef.current) {
        nfcPendingBadgeRef.current = null;
        handleOperatorShiftCheckinRef.current(badge);
      }
    }, 150);
  });

  // Start NFC automatisch zodra de operator-aanmeldmodal opent.
  useEffect(() => {
    if (!useWorkstationStore.getState().showOperatorCheckinModal || !nfc.isSupported) return;
    if (nfc.status !== NFC_STATUS.IDLE) return;

    nfc.startScan();

    return () => {
      if (nfc.status === NFC_STATUS.SCANNING) {
        nfc.stopScan();
      }
    };
  }, [useWorkstationStore.getState().showOperatorCheckinModal, nfc]);
  const lastAutoCheckoutMinuteRef = useRef("");
  const lastAppliedInitialStationRef = useRef<string | null>(null);

  const currentAppId = getAppId();
  const isPostProcessing = [
    "mazak",
    "nabewerking",
    "nabewerken",
    "naharding",
    "oven/naharding",
    "oven",
    "bm01",
    "station bm01",
  ].includes((selectedStation || "").toLowerCase());

  const isBM01 = (selectedStation || "").toUpperCase().replace(/\s/g, "") === "BM01" || (selectedStation || "").toUpperCase().includes("BM01");
  const isLossen1218Station = (String(normalizeMachine(selectedStation) || "").toUpperCase().replace(/\s/g, "") === "LOSSEN12/18");
  const requiresShiftCheckin = !["admin", "teamleader", "planner"].includes(String(currentUser?.role || "").toLowerCase());
  const currentShiftKey = useMemo(() => getCurrentShiftKey(new Date(timeHeartbeat)), [timeHeartbeat]);

  // Initiele Tab en Station Setup
  useEffect(() => {
    if (!initialStationName) return;
    setSelectedStation(initialStationName);

    // Alleen bij echte stationwissel de standaard tab forceren.
    if (lastAppliedInitialStationRef.current === initialStationName) return;
    lastAppliedInitialStationRef.current = initialStationName;

    if (["Mazak", "Nabewerking", "Nabewerken"].includes(initialStationName)) {
      setActiveTab("winding");
      return;
    }
    setActiveTab("terminal");
  }, [initialStationName]);

  useEffect(() => {
    if (!requiresShiftCheckin || !selectedStation) return;
    setCheckedInOperator(null);
  }, [selectedStation, requiresShiftCheckin]);

  useEffect(() => {
    const timer = setInterval(() => setTimeHeartbeat(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return undefined;
  }, []);

  useEffect(() => {
    if (lastShiftRef.current !== currentShiftKey) {
      setDismissedPromptShift(null);
      lastShiftRef.current = currentShiftKey;
    }
  }, [currentShiftKey]);

  // Als searchOrder is meegegeven, zoek en select die order
  useEffect(() => {
    if (searchFilterOrder && rawOrders.length > 0) {
      const foundOrder = rawOrders.find((order: PlanningOrder) => 
        order.orderId === searchFilterOrder || order.id === searchFilterOrder
      );
      
      if (foundOrder) {
        useWorkstationStore.getState().setSelectedOrder(foundOrder);
        setActiveTab("terminal"); // Toon de orders tab
        showInfo(t("digitalplanning.workstation.order_loaded", { order: searchFilterOrder }));
      } else {
        showWarning(t("digitalplanning.workstation.order_not_found", { order: searchFilterOrder }));
      }
    }
  }, [searchFilterOrder, rawOrders]);

  // Helper functies voor iPad/Mobile support
  const requestNotificationPermission = async () => {
    await requestBrowserPermission();
  };

  const showInstallInstructions = () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      showInfo("1. Tik op de 'Deel' knop (vierkant met pijl omhoog)\n2. Scroll omlaag en kies 'Zet op beginscherm'", "Installeren op iPad");
    } else {
      showInfo("Gebruik het menu van je browser om de app te installeren via 'Toevoegen aan startscherm'.", "App installeren");
    }
  };

  // Detecteer of app al geïnstalleerd is (PWA)
  const isPWA = useMemo(() => {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (window.navigator && window.navigator.standalone === true);
  }, []);

  // Data Fetching (OPTIMIZED: Parallel listeners instead of sequential)
  useEffect(() => {
    if (!currentUser) return;
    
    // Prevent fetching if user is guest (no permissions)
    if (!currentUser.role || currentUser.role === 'guest') {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const unsubs: Array<() => void> = [];
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
      
      // Start loading immediately
      setLoading(true);
      
      // 1. Token refresh op achtergrond (niet-blokerend)
      if (auth.currentUser) {
        auth.currentUser.getIdToken(true).catch(e => 
          console.warn("Token refresh warning:", e)
        );
      }
      
      // 2. ALL listeners start in parallel (not sequential!)
      if (!isMounted) return;
      
      // LISTENER 1: Orders (root pad + scoped per-machine paden)
      let rootOrders: PlanningOrder[] = [];
      let scopedOrders: PlanningOrder[] = [];

      const mapOrderDoc = (docSnap: any): PlanningOrder | null => {
        const data = docSnap.data();
        const explicitScopeType = String(data?._scopeType || "").trim();
        const resolvedOrderId = String(data?.orderId || data?.orderNumber || "").trim();

        // Bescherm KPI's tegen vervuilde/structurele documenten in digital_planning.
        if (explicitScopeType && explicitScopeType !== "planning_order") return null;
        if (!resolvedOrderId) return null;

        let dateObj = data.plannedDate?.toDate ? data.plannedDate.toDate() : new Date();
        let { week, year } = getISOWeekInfo(dateObj);
        const sourceDataId = String(data?.id || "").trim();
        return {
          ...data,
          // id moet altijd de echte Firestore document-id blijven voor callables (save/move/cancel).
          id: docSnap.id,
          docId: docSnap.id,
          sourceDataId: sourceDataId || null,
          __docPath: docSnap.ref.path,
          sourcePath: data?.sourcePath || docSnap.ref.path,
          orderId: resolvedOrderId,
          item: data.item || data.productCode || t("digitalplanning.workstation.unknown_item"),
          plan: data.plan || data.quantity || 0,
          dateObj,
          weekNumber: parseInt(data.week || data.weekNumber || week),
          weekYear: parseInt(data.year || year),
        };
      };

      const mergeOrders = () => {
        if (!isMounted) return;
        const merged = new Map();

        const getMergeKey = (order: PlanningOrder) => {
          const pathKey = String(order?.__docPath || order?.sourcePath || "").trim();
          if (pathKey) return pathKey;

          const orderKey = String(order?.orderId || order?.id || "").trim();
          const machineKey = String(normalizeMachine(order?.machine || "") || "").trim();
          if (!orderKey) return "";
          return machineKey ? `${orderKey}::${machineKey}` : orderKey;
        };

        rootOrders.forEach((o) => {
          const key = getMergeKey(o);
          if (key) merged.set(key, o);
        });
        // Scoped docs overschrijven root docs
        scopedOrders.forEach((o) => {
          const key = getMergeKey(o);
          if (key) merged.set(key, o);
        });
        setRawOrders(Array.from(merged.values()));
      };

      const ordersRef = collection(db, getPathString(PATHS.PLANNING));
      const ordersQuery = query(ordersRef, limit(400));
      const unsubOrders = onSnapshot(ordersQuery, (snap) => {
        rootOrders = snap.docs
          .map(mapOrderDoc)
          .filter((o): o is PlanningOrder => Boolean(o))
          .filter((o) => {
            const s = String(o?.status || "").toLowerCase().trim();
            return !["completed", "cancelled", "shipped", "rejected", "finished"].includes(s);
          });
        mergeOrders();
        markStreamReady();
      }, (error) => {
        if (!isMounted) return;
        console.error("Orders sync error:", error);
        markStreamReady();
      });
      unsubs.push(unsubOrders);

      // Scoped per-machine orders (bijv. /digital_planning/Fittings/machines/40BH17/orders/)
      const unsubScopedOrders = onSnapshot(
        collectionGroup(db, "orders"),
        (snap) => {
          const planningPrefix = `${getPathString(PATHS.PLANNING)}/`;
          scopedOrders = snap.docs
            .filter((d) => {
              const path = d.ref.path || "";
              return (
                  path.startsWith(planningPrefix) &&
                path.includes("/machines/") &&
                path.includes("/orders/")
              );
            })
            .map(mapOrderDoc)
            .filter((o): o is PlanningOrder => Boolean(o))
            .filter((o) => {
              const s = String(o.status || "").toLowerCase();
              return !["completed", "cancelled", "shipped", "rejected", "finished"].includes(s);
            });
          mergeOrders();
          markStreamReady();
        },
        (err) => {
          if (!isMounted) return;
          console.error("WorkstationHub Scoped Orders Sync Error:", err);
        }
      );
      unsubs.push(unsubScopedOrders);
      
      // LISTENER 2: Products (also starts immediately, in parallel)
      const unsubProds = subscribeTrackedProducts({
        db,
        statusExclusions: ["completed", "shipped", "deleted", "archived_rejected"],
        maxItems: 200,
        onData: (items) => {
          if (isMounted) setRawProducts(items);
          markStreamReady();
        },
        onError: (error) => {
          console.warn("Tracking Sync Error:", error);
          markStreamReady();
        },
      });
      unsubs.push(unsubProds);
      
      // LISTENER 3: Occupancy (lazy load after main data is ready)
      const unsubOccupancy = onSnapshot(
        query(collection(db, getPathString(PATHS.OCCUPANCY)), where("date", "==", getTodayString()), limit(100)),
        (snap) => {
          if (isMounted) setOccupancy(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OccupancyEntry, "id">) })));
        },
        (error) => {
          console.warn("Occupancy Sync Error (filtered), fallback to limit:", error);
          // Fallback if index missing or date format mismatch
          onSnapshot(query(collection(db, getPathString(PATHS.OCCUPANCY)), limit(50)), (snap) => {
             if (isMounted) setOccupancy(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OccupancyEntry, "id">) })));
          });
        }
      );
      unsubs.push(unsubOccupancy);
      
      // LISTENER 4: Personnel (lazy load after main data is ready)
      const unsubPersonnel = onSnapshot(
        query(collection(db, getPathString(PATHS.PERSONNEL)), limit(300)),
        (snap) => {
          if (isMounted) setPersonnel(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PersonnelEntry, "id">) })));
        },
        (error) => console.warn("Personnel Sync Error:", error)
      );
      unsubs.push(unsubPersonnel);
    };
    initData();
    return () => {
      isMounted = false;
      unsubs.forEach(u => u());
    };
  }, [currentUser, dataSourceRefreshKey]);

  // Fetch archive stats (Huidige week)
  useEffect(() => {
      const now = new Date();
      const startOfWeek = startOfISOWeek(now);
      const year = now.getFullYear();
      
      const q = query(
          collection(db, getPathString(getArchiveItemsPath(year))),
          where("timestamps.finished", ">=", startOfWeek)
      );
      
      const unsub = onSnapshot(q, (snap) => {
          const items: TrackedProductDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TrackedProductDoc, "id">) }));
          setArchivedStats({ done: snap.size, items });
      }, (error) => console.warn("Archive Sync Error:", error));
      
      return () => unsub();
  }, []);

  // Reminder Logic
  useEffect(() => {
    const checkAndSendReminders = async () => {
      if (!rawProducts.length) return;

      const overdueItems = rawProducts.filter((p) => {
        const pMachine = String(p.originMachine || p.currentStation || "");
        const currentStationNorm = normalizeMachine(selectedStation);
        const pMachineNorm = normalizeMachine(pMachine);

        const isHere =
          p.currentStation === selectedStation ||
          pMachineNorm === currentStationNorm;
        if (!isHere) return false;

        const isTempReject = p.inspection?.status === "Tijdelijke afkeur";
        const isOverdue =
          isTempReject && isInspectionOverdue(p.inspection?.timestamp);
        const alreadySent = p.reminderSent === true;

        return isOverdue && !alreadySent;
      });

      for (const item of overdueItems) {
        try {
          await createProductionMessages({
            messages: [{
              title: t("digitalplanning.workstation.reminder_title"),
              message: t("digitalplanning.workstation.reminder_message", { lot: item.lotNumber, station: selectedStation }),
              subject: t("digitalplanning.workstation.reminder_title"),
              content: t("digitalplanning.workstation.reminder_message", { lot: item.lotNumber, station: selectedStation }),
              type: "alert",
              priority: "high",
              source: "WorkstationHub",
              relatedLot: item.lotNumber,
              targetRoles: ["teamleader", "admin"],
              targetGroup: "TEAMLEADERS",
              broadcastToAll: true,
              metadata: {
                kind: "inspection_overdue",
                station: selectedStation,
                lotNumber: item.lotNumber,
              },
            }],
            source: "WorkstationHub",
            actorLabel: currentUser?.email || "Operator",
          });

          await markTrackedProductReminder({
            productId: item.id || item.lotNumber,
            reminderSent: true,
            actorLabel: currentUser?.email || "Operator",
            source: "WorkstationHub",
          });
        } catch (err) {
          console.error(t("digitalplanning.workstation.reminder_error"), err);
        }
      }
    };
    const timer = setTimeout(checkAndSendReminders, 2000);
    return () => clearTimeout(timer);
  }, [rawProducts, selectedStation]);

  // Huidige operator voor dit werkstation berekenen // Shift color helper
  const getShiftColor = useCallback((shiftLabel: unknown) => {
    const label = String(shiftLabel || "").toUpperCase();
    if (label.includes(t("digitalplanning.workstation.shift_morning_label").toUpperCase()) || label.includes("MORNING") || label.includes("EARLY") || label.includes("VROEGE")) {
      return "bg-amber-100 text-amber-800 border-amber-300";
    }
    if (label.includes(t("digitalplanning.workstation.shift_evening_label").toUpperCase()) || label.includes("EVENING") || label.includes("LATE")) {
      return "bg-indigo-100 text-indigo-800 border-indigo-300";
    }
    if (label.includes(t("digitalplanning.workstation.shift_night_label").toUpperCase()) || label.includes("NIGHT")) {
      return "bg-purple-100 text-purple-800 border-purple-300";
    }
    if (label.includes(t("digitalplanning.workstation.shift_day_label").toUpperCase()) || label === t("digitalplanning.workstation.shift_daydienst_label").toUpperCase()) {
      return "bg-blue-100 text-blue-800 border-blue-300";
    }
    return "bg-slate-100 text-slate-800 border-slate-300";
  }, [t]);

  // Helper om te checken of een shift momenteel actief is
  const isShiftActive = useCallback((shiftLabel: unknown) => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute; // tijd in minuten sinds middernacht
    
    const label = String(shiftLabel || "").toUpperCase();
    
    // Ochtend: 05:30 - 14:00
    if (label.includes("OCHTEND") || label.includes("MORNING") || label.includes("EARLY") || label.includes("VROEGE")) {
      const startTime = 5 * 60 + 30; // 05:30
      const endTime = 14 * 60; // 14:00
      return currentTime >= startTime && currentTime < endTime;
    }
    
    // Avond: 14:00 - 22:30
    if (label.includes("AVOND") || label.includes("EVENING") || label.includes("LATE")) {
      const startTime = 14 * 60; // 14:00
      const endTime = 22 * 60 + 30; // 22:30
      return currentTime >= startTime && currentTime < endTime;
    }
    
    // Nacht: 22:30 - 05:30 (over middernacht heen)
    if (label.includes("NACHT") || label.includes("NIGHT")) {
      const startTime = 22 * 60 + 30; // 22:30
      const endTime = 5 * 60 + 30; // 05:30
      return currentTime >= startTime || currentTime < endTime;
    }
    
    // Dag: 07:15 - 16:00
    if (label.includes("DAG") || label === "DAGDIENST") {
      const startTime = 7 * 60 + 15; // 07:15
      const endTime = 16 * 60; // 16:00
      return currentTime >= startTime && currentTime < endTime;
    }
    
    // Standaard: altijd tonen als shift niet herkend wordt
    return true;
  }, []);
  // Alle operators voor dit station vandaag - ALLEEN DIE NU AAN HET WERK ZIJN
  const stationOccupancy = useMemo(() => {
    if (!selectedStation || occupancy.length === 0 || personnel.length === 0) return [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const normalizedStation = normalizeMachine(selectedStation);
    
    return occupancy
      .filter((occ) => {
        if (normalizeMachine(occ.machineId || occ.station) !== normalizedStation) return false;
        const isActiveOccupancy = occ.isActive !== false && !occ.checkedOutAt;
        if (!occ.date) return false;
        
        if (!isActiveOccupancy) return false;
        const occDate = toDateSafe(occ.date) || new Date(occ.date as string | number | Date);
        occDate.setHours(0, 0, 0, 0);
        
        if (occDate.getTime() !== today.getTime()) return false;
        
        // FILTER: Alleen tonen als de shift momenteel actief is
        return isShiftActive(occ.shift);
      })
      .map((occ: OccupancyEntry) => {
        const operator = personnel.find((p: PersonnelEntry) => p.id === occ.operatorNumber || p.employeeNumber === occ.operatorNumber);
        return {
          ...occ,
          operatorName: occ.operatorName || operator?.name || `Operator ${occ.operatorNumber}`,
          shift: occ.shift || "DAGDIENST"
        };
      });
  }, [selectedStation, occupancy, personnel, isShiftActive]);

  useEffect(() => {
    if (!requiresShiftCheckin || !selectedStation) return;
    if (useWorkstationStore.getState().showOperatorCheckinModal) return;
    if (stationOccupancy.length > 0) return;
    if (dismissedPromptShift === currentShiftKey) return;
    // Auto-popup tijdelijk uitgeschakeld — operator meldt zich aan via de knop in de header
    // useWorkstationStore.getState().setShowOperatorCheckinModal(true);
  }, [
    requiresShiftCheckin,
    selectedStation,
    useWorkstationStore.getState().showOperatorCheckinModal,
    stationOccupancy.length,
    dismissedPromptShift,
    currentShiftKey,
  ]);

  useEffect(() => {
    if (!selectedStation) return;

    const now = new Date(timeHeartbeat);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Bepaal welke shifts geëindigd zijn op basis van de huidige tijd (retroactief checken)
    const expiredBuckets: ShiftKey[] = [];
    
    // VROEG: eindigt om 14:00
    if (currentMinutes >= 14 * 60) expiredBuckets.push("VROEG");
    // DAG: eindigt om 16:00
    if (currentMinutes >= 16 * 60) expiredBuckets.push("DAG");
    // LAAT: eindigt om 22:00
    if (currentMinutes >= 22 * 60) expiredBuckets.push("LAAT");
    // NACHT: eindigt om 06:00
    if (currentMinutes >= 6 * 60 && currentMinutes < 22 * 60) expiredBuckets.push("NACHT");

    if (expiredBuckets.length === 0) return;

    // Voorkom dat we dit tig keer per dag per bucket runnen.
    // We maken een sleutel aan die maar 1x per minuut verandert en onthouden weke buckets we zojuist hebben geprobeerd.
    const minuteKey = `${getTodayString()}_${now.getHours()}_${now.getMinutes()}_${expiredBuckets.join('-')}`;
    if (lastAutoCheckoutMinuteRef.current === minuteKey) return;
    lastAutoCheckoutMinuteRef.current = minuteKey;

    const runAutoCheckout = async () => {
      try {
        const todayStr = getTodayString();
        
        // Voor de zekerheid vragen we actieve occupancy op voor VANDAAG en GISTEREN
        const yesterdayStr = getYesterdayString();

        const occSnapToday = await getDocs(
          query(collection(db, getPathString(PATHS.OCCUPANCY)), where("date", "==", todayStr), limit(500))
        );
        const occSnapYesterday = await getDocs(
          query(collection(db, getPathString(PATHS.OCCUPANCY)), where("date", "==", yesterdayStr), limit(500))
        );

        const allDocs = [...occSnapToday.docs, ...occSnapYesterday.docs];

        // Filter alle documenten die actief zijn en in een verstreken bucket vallen
        const toCheckout: OccupancyEntry[] = allDocs
          .map((d): OccupancyEntry => ({ id: d.id, ...(d.data() as Omit<OccupancyEntry, "id">) }))
          .filter((entry) => {
            const isActive = entry.isActive !== false && !entry.checkedOutAt;
            if (!isActive) return false;
            
            return expiredBuckets.some(bucket => shiftMatchesBucket(entry.shift, bucket));
          });

        if (toCheckout.length === 0) return;

        // Sluit ALLE actieve operators van de verstreken diensten
        await saveOccupancyAssignments({
          records: toCheckout.map((entry) => {
            // Vind de bucket die we gaan sluiten
            const targetBucket = expiredBuckets.find(b => shiftMatchesBucket(entry.shift, b)) as ShiftKey;
            
            const previousHours = Number(entry.hoursWorked || 0);
            const checkedInDate = toDateSafe(entry.shiftEffectiveStart as any) || toDateSafe(entry.checkedInAt as any);
            
            // LET OP: bij auto-checkout gebruiken we de officiële checkout-tijd van de shift, NIET de huidige tijd (now)
            // anders zou een iPad die pas om 18:00 aangaat, de VROEGE dienst uren tot 18:00 doorrekenen.
            const shiftCfg = SHIFT_CONFIG[targetBucket];
            const autoCheckoutDate = new Date(checkedInDate || now);
            if (targetBucket === "NACHT" && checkedInDate && checkedInDate.getHours() >= 12) {
              // NACHT dienst gestart gisteren
              autoCheckoutDate.setDate(autoCheckoutDate.getDate() + 1);
            }
            autoCheckoutDate.setHours(Math.floor(shiftCfg.checkoutMinute / 60), shiftCfg.checkoutMinute % 60, 0, 0);

            // Als checkin Date ontbreekt of als we cumulatief tellen, bescherm against weird values
            let elapsedHours = 0;
            if (checkedInDate && autoCheckoutDate > checkedInDate) {
              elapsedHours = (autoCheckoutDate.getTime() - checkedInDate.getTime()) / 3600000;
            }

            const breakHours = (shiftCfg?.breakMinutes ?? 0) / 60;
            const grossHours = Number((previousHours + Math.max(0, elapsedHours)).toFixed(2));
            const finalHours = entry.isSecondary
              ? 0
              : Math.max(0, Number((grossHours - breakHours).toFixed(2)));

            return {
              assignmentId: entry.id,
              data: {
                hoursWorked: finalHours,
                hoursWorkedGross: entry.isSecondary ? 0 : grossHours,
                ...(breakHours > 0 && !entry.isSecondary ? { breakDeductedHours: breakHours } : {}),
                checkedOutAt: autoCheckoutDate, // Officiele eindtijd
                isActive: false,
                autoCheckout: true,
                autoCheckoutShift: targetBucket,
                autoCheckoutRetroactive: true, // Marker
                updatedAt: "__SERVER_TIMESTAMP__",
              },
            };
          }),
          source: "WorkstationHub.autoCheckoutRetroactive",
          actorLabel: currentUser?.email || "System",
        });

        setCheckedInOperator(null);
        setDismissedPromptShift(null);
        showInfo(`${toCheckout.length} operator(s) automatisch uitgecheckt vanwege verstreken shift.`);

      } catch (err) {
        console.error("Auto shift checkout fout:", err);
      }
    };

    runAutoCheckout();
  }, [selectedStation, timeHeartbeat, showInfo]);

  const handleOperatorShiftCheckin = async (badgeOverride?: unknown) => {
    const resolveBadgeInput = (input: unknown) => {
      if (typeof input === "string" || typeof input === "number") return String(input).trim();
      if (input && typeof input === "object") {
        // React/DOM events, NFC payloads of object-structuren kunnen hier terechtkomen.
        const eventValue = (input as { target?: { value?: unknown }; currentTarget?: { value?: unknown } })?.target?.value ?? (input as { target?: { value?: unknown }; currentTarget?: { value?: unknown } })?.currentTarget?.value;
        if (eventValue !== undefined && eventValue !== null) return String(eventValue).trim();
        const objectBadge = (input as { employeeNumber?: unknown; badge?: unknown; uid?: unknown })?.employeeNumber ?? (input as { employeeNumber?: unknown; badge?: unknown; uid?: unknown })?.badge ?? (input as { employeeNumber?: unknown; badge?: unknown; uid?: unknown })?.uid;
        if (objectBadge !== undefined && objectBadge !== null) return String(objectBadge).trim();
      }
      return "";
    };

    const rawBadge = resolveBadgeInput(badgeOverride) || String(useWorkstationStore.getState().operatorBadgeInput || "").trim();
    if (!rawBadge) {
      showWarning("Scan of vul eerst een personeelsnummer in.", "Personeel");
      return;
    }
    // Registreer deze functie zodat de NFC hook hem kan aanroepen
    handleOperatorShiftCheckinRef.current = handleOperatorShiftCheckin;

    useWorkstationStore.getState().setIsCheckingInOperator(true);
    try {
      const normalizedBadge = rawBadge.toUpperCase();
      const normalizedAlphaNumericBadge = rawBadge.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      const numericBadge = rawBadge.replace(/\D/g, "");
      const normalizedNumericBadge = numericBadge.replace(/^0+/, "");
      const sameBadgeValue = (value: unknown) => {
        const candidate = String(value || "").trim();
        if (!candidate) return false;
        if (candidate.toUpperCase() === normalizedBadge) return true;
        const candidateAlphaNumeric = candidate.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        if (candidateAlphaNumeric && candidateAlphaNumeric === normalizedAlphaNumericBadge) return true;
        const candidateDigits = candidate.replace(/\D/g, "");
        if (!candidateDigits) return false;
        return candidateDigits.replace(/^0+/, "") === normalizedNumericBadge;
      };

      let person: PersonnelEntry | null = personnel.find((p: PersonnelEntry) => {
        const id = String(p.id || "").trim();
        const empNo = String(p.employeeNumber || "").trim();
        return sameBadgeValue(id) || sameBadgeValue(empNo);
      }) || null;

      if (!person) {
        const employeeCandidates = Array.from(new Set([
          rawBadge,
          normalizedBadge,
          numericBadge,
          normalizedNumericBadge,
        ].filter(Boolean)));

        for (const candidate of employeeCandidates) {
          const byEmployeeSnap = await getDocs(
            query(collection(db, getPathString(PATHS.PERSONNEL)), where("employeeNumber", "==", candidate), limit(1))
          );
          if (!byEmployeeSnap.empty) {
            const d = byEmployeeSnap.docs[0];
            person = { id: d.id, ...(d.data() as Omit<PersonnelEntry, "id">) };
            break;
          }

          const numericCandidate = Number(candidate);
          if (Number.isFinite(numericCandidate) && candidate !== String(numericCandidate)) {
            const byEmployeeNumericSnap = await getDocs(
              query(collection(db, getPathString(PATHS.PERSONNEL)), where("employeeNumber", "==", numericCandidate), limit(1))
            );
            if (!byEmployeeNumericSnap.empty) {
              const d = byEmployeeNumericSnap.docs[0];
              person = { id: d.id, ...(d.data() as Omit<PersonnelEntry, "id">) };
              break;
            }
          }
        }
      }

      // Probeer als NFC tag UID (gekoppeld via admin registratie)
      if (!person) {
        const mappingDocCandidates = Array.from(new Set([
          rawBadge,
          normalizedBadge,
          normalizedAlphaNumericBadge,
          rawBadge.replace(/\s+/g, "").toUpperCase(),
        ].filter(Boolean)));

        for (const mappingDocId of mappingDocCandidates) {
          const tagMapSnap = await getDoc(doc(db, `${getPathString(PATHS.NFC_TAG_MAPPINGS)}/${mappingDocId}`));
          if (tagMapSnap.exists()) {
            const mapping = tagMapSnap.data();
            const empNum = mapping.employeeNumber;
            const personSnap = await getDocs(
              query(collection(db, getPathString(PATHS.PERSONNEL)), where("employeeNumber", "==", empNum), limit(1))
            );
            if (!personSnap.empty) {
              person = { id: personSnap.docs[0].id, ...(personSnap.docs[0].data() as Omit<PersonnelEntry, "id">) };
              break;
            }
          }
        }
      }

      if (!person) {
        const docIdCandidates = Array.from(new Set([
          rawBadge,
          normalizedBadge,
          `P_${rawBadge}`,
          `P_${normalizedBadge}`,
          numericBadge ? `P_${numericBadge}` : "",
          normalizedNumericBadge ? `P_${normalizedNumericBadge}` : "",
        ].filter(Boolean)));

        for (const docIdCandidate of docIdCandidates) {
          const personDoc = await getDoc(doc(db, `${getPathString(PATHS.PERSONNEL)}/${docIdCandidate}`));
          if (personDoc.exists()) {
            person = { id: personDoc.id, ...(personDoc.data() as Omit<PersonnelEntry, "id">) };
            break;
          }
        }
      }

      if (!person) {
        showError(`Personeelsnummer ${rawBadge} niet gevonden in Personeel.`);
        return;
      }

      const now = new Date();
      const todayStr = getTodayString();
      const extractDigits = (value: unknown) => String(value || "").replace(/\D/g, "").replace(/^0+/, "");
      const personIdDigits = extractDigits(person.id);
      const badgeDigits = extractDigits(rawBadge);
      const operatorNumber = String(
        person.employeeNumber ||
        personIdDigits ||
        badgeDigits ||
        person.id ||
        rawBadge
      );

      const resolveOperatorName = (personRecord: PersonnelEntry, fallbackNumber: string) => {
        const directName =
          personRecord?.name ||
          personRecord?.displayName ||
          personRecord?.fullName ||
          personRecord?.operatorName ||
          [personRecord?.firstName, personRecord?.lastName].filter(Boolean).join(" ") ||
          [personRecord?.voornaam, personRecord?.achternaam].filter(Boolean).join(" ");

        if (String(directName || "").trim()) return String(directName).trim();

        const enriched = personnel.find((p) => {
          const id = String(p.id || "").trim();
          const empNo = String(p.employeeNumber || "").trim();
          if (sameBadgeValue(id) || sameBadgeValue(empNo)) return true;
          const pDigits = extractDigits(p.employeeNumber || p.id);
          const opDigits = extractDigits(fallbackNumber);
          return Boolean(pDigits && opDigits && pDigits === opDigits);
        });

        const enrichedName =
          enriched?.name ||
          enriched?.displayName ||
          enriched?.fullName ||
          enriched?.operatorName ||
          [enriched?.firstName, enriched?.lastName].filter(Boolean).join(" ") ||
          [enriched?.voornaam, enriched?.achternaam].filter(Boolean).join(" ");

        if (String(enrichedName || "").trim()) return String(enrichedName).trim();
        return `Operator ${fallbackNumber}`;
      };

      const resolvedOperatorName = resolveOperatorName(person, operatorNumber);

      const occSnap = await getDocs(
        query(collection(db, getPathString(PATHS.OCCUPANCY)), where("date", "==", todayStr), limit(300))
      );

      const activeEntries: OccupancyEntry[] = occSnap.docs
        .map((d): OccupancyEntry => ({ id: d.id, ...(d.data() as Omit<OccupancyEntry, "id">) }))
        .filter((entry) => {
          const sameOperator = String(entry.operatorNumber || "").toUpperCase() === operatorNumber.toUpperCase();
          const isActive = entry.isActive !== false && !entry.checkedOutAt;
          return sameOperator && isActive;
        });

      const currentMachineNormalized = String(normalizeMachine(selectedStation) || selectedStation || "").toUpperCase();
      const atpsPresenceMachine = "ATPS_AANWEZIGHEID";
      const otherActiveStations = Array.from(new Set(
        activeEntries
          .map((entry) => String(entry.machineId || "").trim())
          .filter(Boolean)
          .filter((machineId) => machineId.toUpperCase() !== atpsPresenceMachine)
          .filter((machineId) => String(normalizeMachine(machineId) || machineId).toUpperCase() !== currentMachineNormalized)
      ));

      const confirmMessage = otherActiveStations.length > 0
        ? `${resolvedOperatorName} inloggen op ${selectedStation}?\n\nDeze medewerker is nu nog ingelogd op: ${otherActiveStations.join(", ")}\nBij doorgaan wordt daar automatisch uitgelogd.`
        : `${resolvedOperatorName} inloggen op ${selectedStation}?`;

      const confirmedCheckin = await showConfirm({
        title: "Operator inloggen",
        message: confirmMessage,
        confirmText: "Inloggen",
        cancelText: "Annuleren",
        tone: "default",
      });

      if (!confirmedCheckin) {
        return;
      }

      if (activeEntries.length > 0) {
        await saveOccupancyAssignments({
          records: activeEntries.map((entry) => {
            const previousHours = Number(entry.hoursWorked || 0);
            const checkedInDate = toDateSafe(entry.shiftEffectiveStart as any) || toDateSafe(entry.checkedInAt as any);
            const elapsedHours = checkedInDate ? Math.max(0, (now.getTime() - checkedInDate.getTime()) / 3600000) : 0;
            const finalHours = entry.isSecondary ? 0 : Number((previousHours + elapsedHours).toFixed(2));
            return {
              assignmentId: entry.id,
              data: {
                hoursWorked: finalHours,
                checkedOutAt: "__SERVER_TIMESTAMP__",
                isActive: false,
                movedToMachineId: selectedStation,
                updatedAt: "__SERVER_TIMESTAMP__",
              },
            };
          }),
          source: "WorkstationHub.operatorCheckin.closePrevious",
          actorLabel: currentUser?.email || "Operator",
        });
      }

      // Bepaal dienst o.b.v. personeelsbestand (person.shiftId), kloktijd als fallback.
      const personShiftKey = resolveShiftKeyFromPerson(person);
      const personShiftLabel = SHIFT_CONFIG[personShiftKey]?.label ?? getCurrentShiftLabel();
      // Timer begint altijd op het officiële starttijdstip van de ploeg (geen vroeg/laat afronden)
      const shiftEffectiveStartDate = getShiftEffectiveStart(personShiftKey, now);
      const shiftEffectiveStartISO = shiftEffectiveStartDate.toISOString();

      const machineNorm = (normalizeMachine(selectedStation) || selectedStation || "").replace(/[^a-zA-Z0-9]/g, "_");
      const occId = `${todayStr}_${machineNorm}_${operatorNumber}_${Date.now()}`;

      await saveOccupancyAssignment({
        assignmentId: occId,
        data: {
        departmentId: person.departmentId || "fittings",
        machineId: selectedStation,
        operatorNumber,
        operatorName: resolvedOperatorName,
        date: todayStr,
        hoursWorked: 0,
        isPloeg: false,
        shift: personShiftLabel,
        shiftKey: personShiftKey,
        shiftEffectiveStart: shiftEffectiveStartISO,
        isLoan: false,
        checkedOutAt: null,
        isActive: true,
        source: "workstation_checkin",
        checkedInAt: "__SERVER_TIMESTAMP__",
        updatedAt: "__SERVER_TIMESTAMP__",
        // ATPS-koppeling voorbereiding:
        // atpsExported: false — wordt true zodra ATPS-export gerund wordt
        // hoursAdjusted: false — wordt true na teamleider uren-correctie
        // hoursAdjustedAt / hoursAdjustedBy worden ingevuld bij correctie
        atpsExported: false,
        hoursAdjusted: false,
        hoursAdjustedAt: null,
        hoursAdjustedBy: null,
        hoursCorrectionReason: null,

      },
        source: "WorkstationHub.operatorCheckin.primary",
        actorLabel: currentUser?.email || "Operator",
      });

      await logWorkstationActivity(
        "OPERATOR_CHECKIN",
        `Operator check-in: ${operatorNumber} op ${selectedStation}; eerdere actieve inschrijvingen gesloten: ${activeEntries.length}`,
        { personnelNumber: operatorNumber }
      );

      if (person.id) {
        await savePersonnelRecord({
          personId: person.id,
          data: {
            currentMachineId: selectedStation,
            lastBadgeScanAt: "__SERVER_TIMESTAMP__",
            lastBadgeScanBy: currentUser?.uid || null,
          },
          source: "WorkstationHub.operatorCheckin.personnel",
          actorLabel: currentUser?.email || "Operator",
        }).catch(() => {});
      }

      setCheckedInOperator({
        number: operatorNumber,
        name: resolvedOperatorName,
        machineId: selectedStation,
      });
      useWorkstationStore.getState().setOperatorBadgeInput("");

      if (activeEntries.length > 0) {
        if (otherActiveStations.length > 0) {
          showSuccess(`${resolvedOperatorName} ingelogd op ${selectedStation}. Automatisch uitgelogd op: ${otherActiveStations.join(", ")}.`);
        } else {
          showSuccess(`${resolvedOperatorName} overgezet naar ${selectedStation}.`);
        }
      } else {
        showSuccess(`${resolvedOperatorName} aangemeld op ${selectedStation}.`);
      }

      // Auto-login bij LOSSEN 12/18 voor BH12/BH15/BH17/BH18
      const selectedStationNormForAutoLogin = normalizeMachine(selectedStation).toUpperCase().replace(/\s/g, "");
      if (AUTO_LOSSEN_1218_SOURCE_STATIONS.has(selectedStationNormForAutoLogin)) {
        try {
          // Controleer of operator vandaag al een actief secondary-record heeft bij LOSSEN 12/18
          const lossen1218OccSnap = await getDocs(
            query(collection(db, getPathString(PATHS.OCCUPANCY)), where("date", "==", todayStr), limit(300))
          );
          const alreadyAtLossen1218 = lossen1218OccSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<OccupancyEntry, "id">) }))
            .some((e: OccupancyEntry) => {
              const eMachineNorm = normalizeMachine(e.machineId || "").toUpperCase().replace(/\s/g, "");
              const sameOp = String(e.operatorNumber || "").toUpperCase() === operatorNumber.toUpperCase();
              const isAtLossen1218 = eMachineNorm === "LOSSEN12/18";
              const isActive = e.isActive !== false && !e.checkedOutAt;
              return sameOp && isAtLossen1218 && isActive;
            });

          if (!alreadyAtLossen1218) {
            const lossen1218Norm = (normalizeMachine(LOSSEN_1218_STATION_NAME) || LOSSEN_1218_STATION_NAME).replace(/[^a-zA-Z0-9]/g, "_");
            const lossen1218OccId = `${todayStr}_${lossen1218Norm}_${operatorNumber}_auto_${Date.now()}`;
            await saveOccupancyAssignment({
              assignmentId: lossen1218OccId,
              data: {
              departmentId: person.departmentId || "fittings",
              machineId: LOSSEN_1218_STATION_NAME,
              operatorNumber,
              operatorName: resolvedOperatorName,
              date: todayStr,
              hoursWorked: 0,
              isPloeg: false,
              shift: personShiftLabel,
              shiftKey: personShiftKey,
              isLoan: false,
              isSecondary: true,        // Uren niet dubbeltellen
              primaryStation: selectedStation,
              checkedOutAt: null,
              isActive: true,
              source: "auto_lossen1218",
              checkedInAt: "__SERVER_TIMESTAMP__",
              updatedAt: "__SERVER_TIMESTAMP__",
            },
              source: "WorkstationHub.operatorCheckin.secondaryLossen1218",
              actorLabel: currentUser?.email || "Operator",
            });
          }
        } catch (err) {
          console.warn("Auto-login LOSSEN 12/18 mislukt (niet kritiek):", err);
        }
      }

      showInfo("Je kunt direct nog een operator scannen.");
    } catch (err) {
      console.error("Operator check-in fout:", err);
      showError(`Aanmelden op station mislukt: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      useWorkstationStore.getState().setIsCheckingInOperator(false);
    }
  };

  // Houd de check-in handler-ref actueel zodat NFC direct kan aanmelden.
  useEffect(() => {
    handleOperatorShiftCheckinRef.current = handleOperatorShiftCheckin;
  }, [handleOperatorShiftCheckin]);

  // Uren-correctie opslaan (teamleider)
  const handleSaveHourCorrection = async () => {
    const store = useWorkstationStore.getState();
    if (!store.hourCorrectionEntry) return;
    const newHours = parseFloat(String(store.correctedHours).replace(",", "."));
    if (isNaN(newHours) || newHours < 0) {
      showWarning("Vul een geldig aantal uren in (bijv. 6 of 6.5).");
      return;
    }
    store.setIsSavingCorrection(true);
    try {
      await saveOccupancyAssignment({
        assignmentId: store.hourCorrectionEntry.id,
        data: {
          hoursWorked: newHours,
          hoursAdjusted: true,
          hoursAdjustedAt: "__SERVER_TIMESTAMP__",
          hoursAdjustedBy: currentUser?.email || currentUser?.uid || "teamleader",
          hoursCorrectionReason: store.correctionReason.trim() || null,
          atpsExported: false, // markeer als nog niet geëxporteerd naar ATPS
          updatedAt: "__SERVER_TIMESTAMP__",
        },
        source: "WorkstationHub.hourCorrection",
        actorLabel: currentUser?.email || "Teamleider",
      });
      await logWorkstationActivity(
        "HOURS_CORRECTED",
        `Uren gecorrigeerd: ${store.hourCorrectionEntry.operatorName} op ${store.hourCorrectionEntry.machineId} → ${newHours}u (was ${store.hourCorrectionEntry.hoursWorked}u). Reden: ${store.correctionReason || "–"}`
      );
      showSuccess(`Uren bijgewerkt: ${store.hourCorrectionEntry.operatorName} → ${newHours} uur`);
      store.setShowHourCorrectionModal(false);
      store.setHourCorrectionEntry(null);
      store.setCorrectedHours("");
      store.setCorrectionReason("");
    } catch (err) {
      console.error("Uren correctie fout:", err);
      showError(`Opslaan mislukt: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      store.setIsSavingCorrection(false);
    }
  };

  // NIEUW: Rotatie logica voor operators (elke 10s wisselen)
  const [currentOperatorIndex, setCurrentOperatorIndex] = useState(0);

  useEffect(() => {
    if (stationOccupancy.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentOperatorIndex((prev) => (prev + 1) % stationOccupancy.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [stationOccupancy.length]);

  // Reset index bij verandering van lijst (bijv. station wissel)
  useEffect(() => setCurrentOperatorIndex(0), [stationOccupancy]);

  const stationActivityByOrder = useMemo(() => {
    const map = new Map();
    if (!selectedStation) return map;

    const stationNorm = normalizeMachine(selectedStation);
    const stationClean = String(stationNorm || "").toUpperCase().replace(/\s/g, "");
    const isNabewerkingStation = stationClean === "NABEWERKING" || stationClean === "NABEWERKEN" || stationClean.includes("NABEWERK");
    const isBH18Station = stationClean === "BH18";
    const isBm01Station = stationClean === "BM01" || stationClean.includes("BM01");
    const isWikkelToLossenSourceStation = ["BH12", "BH15", "BH17", "BH18"].includes(stationClean);

    const matchesStation = (value: unknown) => {
      const norm = normalizeMachine(value || "");
      if (!norm) return false;
      const clean = norm.toUpperCase().replace(/\s/g, "");
      if (isNabewerkingStation) {
        return clean === "NABEWERKING" || clean === "NABEWERKEN" || clean.includes("NABEWERK");
      }
      if (isBm01Station) {
        return clean === "BM01" || clean.includes("BM01");
      }
      return norm === stationNorm;
    };

    rawProducts.forEach((product) => {
      if (product.isVirtualLot) return;
      const orderId = String(product?.orderId || "").trim();
      if (!orderId) return;

      const isRelated = [
        product?.originMachine,
        product?.currentStation,
        product?.lastStation,
        product?.machine,
      ].some(matchesStation);
      if (!isRelated) return;

      const statusUpper = String(product?.status || "").toUpperCase();
      const stepUpper = String(product?.currentStep || "").toUpperCase();
      const isWaitingForLossen = stepUpper.includes("WACHT OP LOSSEN") || statusUpper.includes("WACHT OP LOSSEN") || statusUpper.includes("TE LOSSEN") || stepUpper === "LOSSEN";
      const isClosed =
        ["COMPLETED", "FINISHED", "GEREED", "REJECTED", "AFKEUR"].includes(statusUpper) ||
        stepUpper === "FINISHED" ||
        stepUpper === "REJECTED" ||
        (isWikkelToLossenSourceStation && !isBH18Station && isWaitingForLossen);

      const entry = map.get(orderId) || { active: 0, total: 0 };
      entry.total += 1;
      if (!isClosed) entry.active += 1;
      map.set(orderId, entry);
    });

    return map;
  }, [rawProducts, selectedStation]);

  // Bereken Derived Data (Memoized)
  const stationOrders = useMemo(() => {
    if (!selectedStation) return [];
    if (selectedStation === "BM01" || selectedStation === "Station BM01")
      return rawOrders;

    const currentStationNorm = normalizeMachine(selectedStation);
    const currentStationClean = String(currentStationNorm || "").toUpperCase().replace(/\s/g, "");
    const isLossen1218Station = currentStationClean === "LOSSEN12/18";
    const isBH18 = currentStationClean === "BH18";
    const isWikkelToLossenSourceStation = ["BH12", "BH15", "BH17", "BH18"].includes(currentStationClean);
    const lossen1218OrderMachines = new Set(["BH12", "BH15", "BH17", "BH18", "12", "15", "17", "18"]);

    const getLossen1218Candidates = (order: PlanningOrder) => {
      const values = [
        order?.machine,
        order?.originalMachine,
        order?.sourceStation,
        order?.returnStation,
        order?.station,
        order?.workstation,
        order?.machineId,
        order?.wc,
      ];

      const normalized = values
        .map((value) => String(normalizeMachine(value || "") || "").toUpperCase().trim())
        .filter(Boolean);

      const path = String(order?.__docPath || order?.sourcePath || "").toUpperCase();
      if (path.includes("BH12") || path.includes("40BH12")) normalized.push("BH12");
      if (path.includes("BH15") || path.includes("40BH15")) normalized.push("BH15");
      if (path.includes("BH17") || path.includes("40BH17")) normalized.push("BH17");
      if (path.includes("BH18") || path.includes("40BH18")) normalized.push("BH18");

      return normalized;
    };
    const isFittingsStation = FITTING_MACHINES
      .map((s) => normalizeMachine(s))
      .includes(currentStationNorm);
    const stationField = getStartedCounterField(selectedStation);

    const pipeStationsNorm = new Set(PIPE_MACHINES.map((s) => normalizeMachine(s)));
    const fittingStationsNorm = new Set(FITTING_MACHINES.map((s) => normalizeMachine(s)));

    const routePresenceByOrder: Record<string, { hasPipe: boolean; hasFitting: boolean }> = {};
    rawOrders.forEach((order: PlanningOrder) => {
      const orderId = String(order.orderId || "").trim();
      if (!orderId) return;

      const machineNorm = normalizeMachine(order.machine || "");
      if (!routePresenceByOrder[orderId]) {
        routePresenceByOrder[orderId] = { hasPipe: false, hasFitting: false };
      }

      if (pipeStationsNorm.has(machineNorm)) routePresenceByOrder[orderId].hasPipe = true;
      if (fittingStationsNorm.has(machineNorm)) routePresenceByOrder[orderId].hasFitting = true;
    });

    const pipeProgressCountByOrder = new Map();
    rawProducts.forEach((p) => {
      if (p.isVirtualLot) return;
      const orderId = String(p.orderId || "").trim();
      if (!orderId) return;

      const sourceStationNorm = normalizeMachine(
        p.originMachine || p.machine || p.currentStation || ""
      );
      if (!pipeStationsNorm.has(sourceStationNorm)) return;

      if (p.status === "rejected" || p.currentStep === "REJECTED") return;

      const stepUpper = String(p.currentStep || "").toUpperCase();
      const statusLower = String(p.status || "").toLowerCase();
      const hasProgress =
        statusLower === "completed" ||
        (stepUpper && stepUpper !== "WIKKELEN" && stepUpper !== "HOLD_AREA");

      if (hasProgress) {
        pipeProgressCountByOrder.set(
          orderId,
          (pipeProgressCountByOrder.get(orderId) || 0) + 1
        );
      }
    });
    
    const orderStats: Record<string, { started: number; finished: number }> = {};
    rawProducts.forEach((p: TrackedProductDoc) => {
      if (p.isVirtualLot) return;
      if (!p.orderId) return;
      if (p.status === "rejected" || p.currentStep === "REJECTED") return;

      if (!orderStats[p.orderId])
        orderStats[p.orderId] = { started: 0, finished: 0 };
      orderStats[p.orderId].started++;
      
      // FIX: 'Lossen' verwijderd uit active steps. Zodra een item op 'Lossen' staat, is het klaar voor de machine.
      const activeMachineSteps = ["Wikkelen", "HOLD_AREA"];
      const isFinishedForMachine = !activeMachineSteps.includes(String(p.currentStep || "")) || p.currentStep === "Finished" || p.status === "completed";
      if (isFinishedForMachine) orderStats[p.orderId].finished++;
    });

    const waitingForLossenOnlyByOrder = new Map();
    rawProducts.forEach((p) => {
      if (p.isVirtualLot) return;
      const orderId = String(p?.orderId || "").trim();
      if (!orderId) return;

      const stationNorm = normalizeMachine(p?.originMachine || p?.machine || p?.currentStation || "");
      if (stationNorm !== currentStationNorm) return;

      const statusUpper = String(p?.status || "").toUpperCase();
      const stepUpper = String(p?.currentStep || "").toUpperCase();
      const isActive =
        !["COMPLETED", "FINISHED", "GEREED", "REJECTED", "AFKEUR"].includes(statusUpper) &&
        stepUpper !== "FINISHED" &&
        stepUpper !== "REJECTED";
      if (!isActive) return;

      const entry = waitingForLossenOnlyByOrder.get(orderId) || { totalActive: 0, waitingForLossen: 0 };
      entry.totalActive += 1;
      if (stepUpper.includes("WACHT OP LOSSEN") || statusUpper.includes("WACHT OP LOSSEN") || statusUpper.includes("TE LOSSEN") || stepUpper === "LOSSEN") {
          entry.waitingForLossen += 1;
      }
      waitingForLossenOnlyByOrder.set(orderId, entry);
    });

    const baseStationOrders = rawOrders
      .filter((o) => {
        const orderIdForActivity = String(o.orderId || "").trim();
        const activityMeta = stationActivityByOrder.get(orderIdForActivity);
        const hasStationActivityCheck = (activityMeta?.active || 0) > 0;
        const docPath = String(o?.__docPath || o?.sourcePath || "").toUpperCase();
        const strictScopedStations = new Set(["BH12", "BH18"]);
        if (strictScopedStations.has(currentStationClean)) {
          const machineScopedSuffix = `/FITTINGS/MACHINES/40${currentStationClean}/`;
          const planningBasePath = String(getPathString(PATHS.PLANNING) || "").toUpperCase();
          const trackingBasePath = String(getPathString(PATHS.TRACKING) || "").toUpperCase();
          const strictPathNeedles = [
            `${planningBasePath}${machineScopedSuffix}`,
            `${trackingBasePath}${machineScopedSuffix}`,
          ].filter(Boolean);

          const hasStrictPathMatch = strictPathNeedles.some((needle) => docPath.includes(needle));
          if (!hasStrictPathMatch) {
            return false;
          }
        }
        
        // Bereken effectieve plan: respecteer handmatige verlagingen (plan < quantity)
        const rawQuantity = toFiniteNumber(o.quantity);
        const rawPlanVal = toFiniteNumber(o.plan);
        const plannedAmt = rawPlanVal > 0 && rawPlanVal < rawQuantity ? rawPlanVal : Math.max(rawQuantity, rawPlanVal);
        const actualStartedCount = orderStats[orderIdForActivity]?.started || 0;
        const isActiveStatus = !isInactivePlanningStatus(o.status);
        // Detecteer echt tekort (actuele lots > 0 maar < plan) om spookorders te vermijden
        const hasShortage = plannedAmt > 0 && actualStartedCount > 0 && actualStartedCount < plannedAmt;
        const isManuallyIncreased = rawPlanVal > rawQuantity;

        // Verberg gesloten orders tenzij er nog stationactiviteit is of het plan handmatig is verhoogd
        if (isInactivePlanningStatus(o.status) && !hasStationActivityCheck) {
            if (!(isManuallyIncreased && actualStartedCount < rawPlanVal)) {
                return false;
            }
        }

        // Cross-station N2100: toon order in Fittingen pas als Spoolbouw
        // voldoende output heeft opgeleverd (x van y gating).
        const orderId = String(o.orderId || "").trim().toUpperCase();
        if (isFittingsStation && orderId.startsWith("N2100")) {
          const orderKey = String(o.orderId || "").trim();
          const routeInfo = routePresenceByOrder[orderKey];
          const isHybrid = routeInfo?.hasPipe && routeInfo?.hasFitting;

          if (isHybrid) {
            const readyCount = pipeProgressCountByOrder.get(orderKey) || 0;
            const explicitReleaseCount = Number(
              o.releaseToFittingsAtCount || o.spoolReleaseCount || 0
            );
            const plannedCount = Math.max(0, Number(o.plan || o.quantity || 0));
            const requiredCount = explicitReleaseCount > 0
              ? explicitReleaseCount
              : Math.max(1, plannedCount);

            if (readyCount < requiredCount) {
              return false;
            }
          }
        }

          const orderMachineNorm = normalizeMachine(o.machine);
          const lossenCandidates = isLossen1218Station ? getLossen1218Candidates(o) : [];
          if (isLossen1218Station && lossenCandidates.some((candidate) => lossen1218OrderMachines.has(candidate))) {
            return true;
          }
          const startedAtStation = toFiniteNumber(stationField ? o?.[stationField] || 0 : 0);
          const planAtStation = plannedAmt;
          const effectiveStarted = (hasShortage && isActiveStatus) ? actualStartedCount : startedAtStation;
          const hasRemainingPlan = (effectiveStarted > 0 && planAtStation > effectiveStarted) || (hasShortage && isActiveStatus);
          const activityMetaForOrder = stationActivityByOrder.get(orderIdForActivity);
          const hasStationActivity = (activityMetaForOrder?.active || 0) > 0;

          // Wikkelstations (BH-machines): Orders filteren op basis van "To do".
          // Als de "To do" op 0 staat, moet de order uit de planning van de BH machine 
          // gefilterd worden. Ongeacht de staat van de rest (stroomafwaarts).
          if (isWikkelToLossenSourceStation) {
            const producedAtOrder = toFiniteNumber(o.produced);
            // actualStartedCount excludes rejected products in WorkstationHub
            const effectiveGood = Math.max(producedAtOrder, actualStartedCount);
            const exactToDo = Math.max(0, planAtStation - effectiveGood);

            if (exactToDo <= 0) {
              return false;
            }
          }

        const isStationMachineMatch =
          o.machine === selectedStation || orderMachineNorm === currentStationNorm;

        // Voorkom cross-station lekken: een order hoort alleen op dit workstation
        // als de machine matcht of er aantoonbare lokale stationactiviteit is.
        // Een generiek "remaining plan" op orderniveau is op zichzelf niet genoeg.
        return isStationMachineMatch || hasStationActivity;
      })
      .map((o: PlanningOrder) => {
        const orderIdKey = String(o.orderId || "");
        const stats = orderStats[orderIdKey] || { started: 0, finished: 0 };
        let startedAtStation = 0;
        if (stationField) {
          startedAtStation = toFiniteNumber((o as Record<string, unknown>)[String(stationField)]);
        }
        const remainingAtStation = Math.max(0, Number(o.quantity || o.plan || 0) - startedAtStation);
        
        return {
          ...o,
          liveToDo: remainingAtStation,
          liveFinish: stats.finished,
          startedAtStation: startedAtStation,
        };
      })
      .sort(
        (a, b) =>
          (a.dateObj?.getTime?.() || 0) - (b.dateObj?.getTime?.() || 0) ||
          String(a.orderId).localeCompare(String(b.orderId))
      );

    return baseStationOrders;
  }, [rawOrders, rawProducts, selectedStation, stationActivityByOrder]);

  const stationStats = useMemo(() => {
    const currentStationNorm = normalizeMachine(selectedStation);
    const cleanStationId = (currentStationNorm || "").toUpperCase().replace(/\s/g, "");

    const isBm01Station = cleanStationId.includes("BM01");
    const isLossenStation = cleanStationId === "LOSSEN";
    const isNabewerkingStation = cleanStationId === "NABEWERKING" || cleanStationId === "NABEWERKEN" || cleanStationId.includes("NABEWERK");
    const isMazakStation = cleanStationId === "MAZAK";
    const isDownstream = isBm01Station || isLossenStation || isNabewerkingStation || isMazakStation;

    if (isDownstream) {
        // BM01 Specifieke KPI Logica
      if (isBm01Station) {
            // Plan: Totaal van alle orders (want BM01 is centraal)
            let plan = 0;
            stationOrders.forEach(o => plan += Number(o.plan || 0));
            
            // Todo (Aan te bieden): Items die wachten op BM01
            let todo = 0;
            rawProducts.forEach(p => {
                 const pStationNorm = normalizeMachine(p.currentStation || "");
                 const pStepUpper = (p.currentStep || "").toUpperCase();
                 const isActive = p.status !== "completed" && p.currentStep !== "Finished" && p.status !== "rejected" && p.currentStep !== "REJECTED";
                 
                 if ((pStationNorm === currentStationNorm || pStepUpper.includes("INSPECTIE") || pStepUpper === "BM01") && isActive) {
                     todo++;
                 }
            });
            
            // Done (Gereed): Items uit archief + actieve finished items
            let done = archivedStats.done;
            rawProducts.forEach(p => {
                 if ((p.status === "completed" || p.currentStep === "Finished") && (p.currentStation === "GEREED" || p.lastStation === "BM01")) {
                     done++;
                 }
            });
            
            return { plan, todo, done };
        }

        const isActiveProduct = (p: TrackedProductDoc) => {
          const pStep = (p.currentStep || "").toUpperCase();
          const pStatus = String(p.status || "").toLowerCase();
          return pStep !== "FINISHED" && pStep !== "REJECTED" && pStatus !== "completed" && pStatus !== "rejected";
        };

        const todoCount = rawProducts.filter((p: TrackedProductDoc) => {
          const pStationNorm = normalizeMachine(p.currentStation || "");
          const pStep = p.currentStep || "";
          if (!isActiveProduct(p)) return false;

          if (isLossenStation) {
            return pStep === "Lossen" || pStationNorm === "LOSSEN";
          }
          if (isNabewerkingStation) {
            const pCleanUpper = (p.currentStation || "").toUpperCase().replace(/\s/g, "");
            const sCleanUpper = (p.currentStep || "").toUpperCase().replace(/\s/g, "");
            return pCleanUpper === "NABEWERKING" || pCleanUpper === "NABEWERKEN" || pCleanUpper === "NABW" || pCleanUpper.includes("NABEWERK") || sCleanUpper === "NABEWERKING" || sCleanUpper === "NABEWERKEN" || sCleanUpper === "NABW" || sCleanUpper.includes("NABEWERK");
          }
          if (isMazakStation) {
            return pStationNorm === "MAZAK";
          }
          return pStationNorm === currentStationNorm;
        }).length;

        const doneCount = rawProducts.filter((p: TrackedProductDoc) => {
          const pLastStationNorm = normalizeMachine(p.lastStation || "");
          const pStationNorm = normalizeMachine(p.currentStation || "");
          const isFinished = p.status === "completed" || p.currentStep === "Finished";

          if (isLossenStation) {
            // Alles dat Lossen al verlaten heeft of afgerond is na Lossen
            return pLastStationNorm === "LOSSEN" || (pStationNorm === "LOSSEN" && isFinished);
          }
          if (isNabewerkingStation) {
            const pLastCleanUpper = (p.lastStation || "").toUpperCase().replace(/\s/g, "");
            return pLastCleanUpper === "NABEWERKING" || pLastCleanUpper === "NABEWERKEN" || pLastCleanUpper === "NABW" || pLastCleanUpper.includes("NABEWERK") || ((pStationNorm === "NABEWERKING" || pStationNorm === "NABEWERKEN" || pStationNorm === "NABW" || pStationNorm.includes("NABEWERK")) && isFinished);
          }
          if (isMazakStation) {
            return pLastStationNorm === "MAZAK" || (pStationNorm === "MAZAK" && isFinished);
          }
          return pLastStationNorm === currentStationNorm || (pStationNorm === currentStationNorm && isFinished);
        }).length;

        return { plan: todoCount + doneCount, done: doneCount, todo: todoCount };
    }

    let plan = 0;
    let todo = 0;
    const stationField = getStartedCounterField(selectedStation);
    
    stationOrders.forEach((o: PlanningOrder) => {
      // Altijd dynamisch berekenen: plan - started_<machine>.
      const orderPlan = Number(o.plan || o.quantity || 0);
      let startedAtStation = 0;
      if (stationField) {
        startedAtStation = toFiniteNumber((o as Record<string, unknown>)[String(stationField)]);
      }
      const remainingQueue = Math.max(0, orderPlan - startedAtStation);
      
      todo += remainingQueue;
      
      const orderIdForActivity = String(o.orderId || "").trim();
      const activityMeta = stationActivityByOrder.get(orderIdForActivity);
      const activeFlowQty = activityMeta?.active || 0;
      
      plan += (remainingQueue + activeFlowQty);
    });

    // Wekelijkse 'Gereed' teller voor wikkelmachines
    let doneThisWeek = 0;
    const startOfWeekDate = startOfISOWeek(new Date());

    rawProducts.forEach((p: TrackedProductDoc) => {
       const pMachineNorm = normalizeMachine(p.originMachine || p.machine || "");
       if (pMachineNorm !== currentStationNorm) return;
       if (p.status === "rejected" || p.currentStep === "REJECTED") return;
       
       const stepUpper = (p.currentStep || "").toUpperCase();
       const isFinishedForMachine = stepUpper !== "WIKKELEN" && stepUpper !== "HOLD_AREA";
       
       if (isFinishedForMachine || p.status === "completed") {
           const eventDate = p.timestamps?.lossen_start || p.timestamps?.wikkelen_end || p.updatedAt || p.createdAt;
           const d = toDateSafe(eventDate);
           if (d && d >= startOfWeekDate) {
               doneThisWeek++;
           }
       }
    });

    (archivedStats.items || []).forEach((p: TrackedProductDoc) => {
       const pMachineNorm = normalizeMachine(p.originMachine || p.machine || "");
       if (pMachineNorm !== currentStationNorm) return;
       if (p.status === "rejected" || p.currentStep === "REJECTED") return;
       
       const eventDate = p.timestamps?.lossen_start || p.timestamps?.wikkelen_end || p.timestamps?.finished || p.archivedAt;
      const d = toDateSafe(eventDate as any);
       if (d && d >= startOfWeekDate) {
           doneThisWeek++;
       }
    });

    return { plan, done: doneThisWeek, todo };
  }, [stationOrders, rawProducts, selectedStation, archivedStats, stationActivityByOrder]);

  const activeUnitsHere = useMemo(() => {
    if (!selectedStation) return [];
    const currentStationNorm = normalizeMachine(selectedStation);
    const cleanStationId = (currentStationNorm || "").toUpperCase().replace(/\s/g, "");

    return rawProducts.filter((p) => {
      if (p.currentStep === "Finished" || p.currentStep === "REJECTED")
        return false;

      const pMachine = String(p.originMachine || p.currentStation || "");
      const pMachineNorm = normalizeMachine(pMachine);
      const pClean = (pMachineNorm || "").toUpperCase().replace(/\s/g, "");

      if (cleanStationId === "MAZAK")
        return pClean === "MAZAK";
      
      if (cleanStationId === "NABEWERKING" || cleanStationId === "NABEWERKEN" || cleanStationId.includes("NABEWERK")) {
        // Altijd hoofdletterongevoelig vergelijken
        const pCleanUpper = (p.currentStation || "").toUpperCase().replace(/\s/g, "");
        const match = (
          pCleanUpper === "NABEWERKING" || pCleanUpper === "NABEWERKEN" || pCleanUpper === "NABW" || pCleanUpper.includes("NABEWERK")
        );

        return match;
      }
      
      if (cleanStationId === "BM01" || cleanStationId.includes("BM01"))
        return pClean === "BM01" || pClean.includes("BM01");

      // NIEUW: BH31 (Reparatie) - Toon alles wat op dit station staat
      if (cleanStationId === "BH31") {
        return pClean === "BH31";
      }
      
      // Verberg items die in de wacht staan voor reparatie (Tijdelijke afkeur) op reguliere stations
      if (p.currentStep === "HOLD_AREA") return false;

      if (selectedStation.startsWith("BH")) {
        return (
          (pMachine === selectedStation ||
            pMachineNorm === currentStationNorm) &&
          (p.currentStep === "Wikkelen" || p.currentStep === "HOLD_AREA")
        );
      }
      return false;
    });
  }, [rawProducts, selectedStation]);

  const selectedStationNormForHeader = normalizeMachine(selectedStation);
  const selectedStationCleanForHeader = (selectedStationNormForHeader || "").toUpperCase().replace(/\s/g, "");
  const isBm01HeaderStation = selectedStationCleanForHeader.includes("BM01");
  const isWorkstationGereedTab =
    !isBm01HeaderStation &&
    selectedStationCleanForHeader !== "LOSSEN" &&
    selectedStationCleanForHeader !== "LOSSEN12/18" &&
    selectedStationCleanForHeader !== "MAZAK" &&
    selectedStationCleanForHeader !== "NABEWERKING" &&
    selectedStationCleanForHeader !== "NABEWERKEN" &&
    !selectedStationCleanForHeader.includes("NABEWERK");
  const isTwoKpiHeaderStation =
    selectedStationCleanForHeader === "LOSSEN" ||
    selectedStationCleanForHeader === "MAZAK" ||
    selectedStationCleanForHeader === "NABEWERKING" ||
    selectedStationCleanForHeader === "NABEWERKEN" ||
    selectedStationCleanForHeader.includes("NABEWERK");
  const todoHeaderLabel = isBm01HeaderStation
    ? t("digitalplanning.terminal.tab_to_offer")
    : t("digitalplanning.workstation.todo");

  // Handlers
  const handleBack = () => {
    if (onExit) {
      onExit();
    } else {
      navigate("/portal");
    }
  };

  const handleStartProduction = async (
    order: any,
    customLotNumber: string,
    stringCount = 1,
    _manualOrderInput?: string,
    _operatorInput?: string,
    _selectedOperatorName?: string,
    labelZplData?: string,
    labelTemplateId?: string,
    startOptions: any = {}
  ) => {
    if (!currentUser || !customLotNumber) return;
    
    if (activeDowntime) {
      showError("Machine staat momenteel in storing! Meld de storing eerst af via de knop bovenaan om productie te starten.");
      useWorkstationStore.getState().setShowStartModal(false);
      return;
    }

    const previousTab = activeTab;

    // Snellere UX: direct modal sluiten en naar Wikkelen schakelen,
    // terwijl de backend startflow op de achtergrond afrondt.
    useWorkstationStore.getState().setShowStartModal(false);
    if (!isPostProcessing && !isBM01) {
      setActiveTab("winding");
    }

    try {
      const explicitLotNumbers = Array.isArray(startOptions?.lotNumbers)
        ? startOptions.lotNumbers.map((entry: unknown) => String(entry || "").trim().toUpperCase()).filter(Boolean)
        : [];
      const batchCount = explicitLotNumbers.length > 0 ? explicitLotNumbers.length : Math.max(1, parseInt(String(stringCount), 10) || 1);
      const seriesGroupId = String(startOptions?.seriesGroupId || "").trim() || null;
      let overflowItems = [];

      const stationOperators = occupancy
        .filter((occ) => {
          if (occ.station !== selectedStation) return false;
          if (!occ.date) return false;
          const occDate = toDateSafe(occ.date as any) || new Date();
          occDate.setHours(0, 0, 0, 0);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return occDate.getTime() === today.getTime() && isShiftActive(occ.shift);
        })
        .map((occ) => occ.operatorNumber)
        .filter(Boolean);

      const startResult: any = await startWorkstationProductionRun({
        orderDocId: order.id,
        lotStart: customLotNumber,
        stringCount: batchCount,
        stationId: selectedStation,
        orderDocPath: order?.__docPath || "",
        orderSourcePath: order?.sourcePath || "",
        actorLabel: currentUser?.email || "Operator",
        labelZplData: typeof labelZplData === "string" ? labelZplData : "",
        labelTemplateId: labelTemplateId || "",
        seriesGroupId: seriesGroupId || "",
        isFlangeSeries: !!startOptions?.isFlangeSeries,
        lotNumbers: explicitLotNumbers,
        stationOperators,
        source: "WorkstationHub",
      });

      overflowItems = Array.isArray(startResult?.overflowLots) ? startResult.overflowLots : [];
      const autoAssignedOverflow = startResult?.autoAssignedOverflow || null;

      if (autoAssignedOverflow?.linkedCount > 0 && autoAssignedOverflow?.targetOrderId) {
        showSuccess(
          `${autoAssignedOverflow.linkedCount} extra stuk(s) automatisch gekoppeld aan order ${autoAssignedOverflow.targetOrderId}${autoAssignedOverflow.routeStation ? ` en doorgestuurd naar ${autoAssignedOverflow.routeStation}` : ""}.`
        );
      }

      if (overflowItems.length > 0) {
        await createProductionMessages({
          messages: [{
            from: "SYSTEM",
            senderId: currentUser?.uid || "system-auto",
            subject: `Overproductie op ${selectedStation}`,
            content: `${overflowItems.length} extra producten zijn aangemaakt vanuit order ${order.orderId}. Koppel deze aan een nieuw LN-ordernummer zodra beschikbaar. Lotnummers: ${overflowItems.join(", ")}`,
            title: `Overproductie op ${selectedStation}`,
            message: `${overflowItems.length} extra producten vanuit order ${order.orderId}. Lots: ${overflowItems.join(", ")}`,
            priority: "high",
            type: "warning",
            source: "WorkstationHub",
            targetRoles: ["planner", "admin"],
            targetGroup: "PLANNERS_AND_ADMINS",
            broadcastToAll: true,
            metadata: {
              kind: "overproduction",
              originalOrderId: order.orderId,
              originStation: selectedStation,
              lotNumbers: overflowItems,
              count: overflowItems.length,
            },
          }],
          source: "WorkstationHub",
          actorLabel: currentUser?.email || "Operator",
        });

        notify(
          `Let op: Er zijn ${overflowItems.length} producten meer gemaakt dan gepland.`
        );
      }

      await logWorkstationActivity(
        "ORDER_RELEASE",
        `Workstation start: order ${order.orderId}, station ${selectedStation}, lot start ${customLotNumber}, count ${stringCount}, overflow ${overflowItems.length}`
      );
    } catch (error) {
      console.error(error);
      if (!isPostProcessing && !isBM01) {
        setActiveTab(previousTab || "terminal");
      }
      throw error;
    }
  };

  // Handler voor handmatig verplaatsen van product (Nieuw toegevoegd voor Dossier)
  const handleMoveLot = async (lotNumber: string, newStation: string, options: any = {}) => {
    if (!lotNumber || !newStation) return;
    try {
      const isRepairMove = Boolean(options?.isRepairMove);
      const repairInstruction = String(options?.repairInstruction || "").trim();

      await moveTrackedProductManual({
        productOrLotId: lotNumber,
        newStation,
        isRepairMove,
        repairInstruction,
        source: "WorkstationHub",
        actorLabel: currentUser?.email || "Operator",
      });

      await logWorkstationActivity(
        "LOT_MANUAL_MOVE",
        `${isRepairMove ? "Workstation reparatie" : "Workstation move"}: lot ${lotNumber} -> ${newStation}${repairInstruction ? ` | instructie: ${repairInstruction}` : ""}`
      );
      showSuccess(`${isRepairMove ? "Reparatie" : "Product"} ${lotNumber} verplaatst naar ${newStation}`);
    } catch (err: unknown) {
      console.error("Fout bij verplaatsen:", err);
      showError("Fout bij verplaatsen: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handlePauseResume = async (product: TrackedProductDoc) => {
    if (!product) return;
    try {
      const isPaused = product.status === "PAUSED";

      await toggleTrackedProductPause({
        productId: product.id || product.lotNumber,
        actorLabel: currentUser?.email || "Operator",
        source: "WorkstationHub",
      });
      await logWorkstationActivity(
        isPaused ? "PRODUCTION_RESUME" : "PRODUCTION_PAUSE",
        `Workstation ${isPaused ? "resume" : "pause"}: lot ${product.lotNumber || product.id} op ${selectedStation}`
      );
      
      if (isPaused) showSuccess("Productie hervat");
      else showInfo("Productie gepauzeerd");
    } catch (err) {
      console.error("Fout bij pauzeren:", err);
      showError("Kon status niet wijzigen");
    }
  };

  const handleLinkProduct = async (docId: string, product: TrackedProductDoc) => {
    try {
      await linkPlanningOrderProduct({
        orderDocId: docId,
        productId: product.id,
        productImage: product.imageUrl || "",
      });
      await logWorkstationActivity(
        "ORDER_LINK_PRODUCT",
        `Order gelinkt: planning ${docId} -> product ${product?.id}`
      );
      showSuccess("Product succesvol gekoppeld!");
      useWorkstationStore.getState().setShowLinkModal(false);
      useWorkstationStore.getState().setOrderToLink(null);
    } catch (error) {
      console.error(error);
      showError("Kon product niet koppelen", "Koppelen mislukt");
    }
  };

  const handlePostProcessingFinish = async (status: string, data: any) => {
    const itemToFinish = useWorkstationStore.getState().itemToFinish;
    if (!itemToFinish) return;
    const productId = itemToFinish.id || itemToFinish.lotNumber;
    try {
      if (status === "completed") {
        const normalizedStation = String(selectedStation || "").toUpperCase().replace(/\s+/g, "");
        const isBM01 = normalizedStation === "BM01" || normalizedStation === "STATIONBM01" || normalizedStation.includes("BM01");
        const isNaharding = normalizedStation.includes("OVEN") || normalizedStation.includes("NAHARD");
        const finishType = isBM01 ? "post_inspection" : (isNaharding ? "archive" : "forward");
        await completeTrackedProduct({
          productId,
          finishType,
          fromStation: selectedStation,
          note: data.note || "",
          actorLabel: currentUser?.email,
          source: "WorkstationHub",
        });
        useWorkstationStore.getState().setFinishModalOpen(false);
        useWorkstationStore.getState().setItemToFinish(null);
        return;
      }

      if (status === "rejected") {
        await rejectTrackedProductFinal({
          productId,
          reasons: data.reasons || [],
          note: data.note || "",
          source: "WorkstationHub",
          actorLabel: currentUser?.email,
        });
        useWorkstationStore.getState().setFinishModalOpen(false);
        useWorkstationStore.getState().setItemToFinish(null);
        return;
      }

      await tempRejectTrackedProduct({
        productId,
        reasons: data.reasons || [],
        note: data.note || "",
        station: selectedStation,
        actorLabel: currentUser?.email || "Operator",
        previousStep: itemToFinish.currentStep,
        previousStatus: itemToFinish.status,
        source: "WorkstationHub",
      });
      await logWorkstationActivity(
        "QUALITY_TEMP_REJECT",
        `Post-processing: lot ${itemToFinish?.lotNumber || itemToFinish?.id}, station ${selectedStation}, status temp_reject`
      );
      useWorkstationStore.getState().setFinishModalOpen(false);
      useWorkstationStore.getState().setItemToFinish(null);
    } catch (error) {
      console.error("Fout bij afronden:", error);
      showError("Kon wijzigingen niet opslaan", "Fout bij opslaan");
    }
  };

  const handleProcessUnit = async (product: TrackedProductDoc, options: { bulkUnits?: TrackedProductDoc[] } = {}) => {
    const stationCheck = String(selectedStation).toLowerCase();

    // NIEUW: BH31 Reparatie flow
    if (stationCheck === "bh31") {
        useWorkstationStore.getState().setItemToRepair(product);
        useWorkstationStore.getState().setShowRepairModal(true);
        return;
    }

    if (
      stationCheck === "nabewerking" ||
      stationCheck === "mazak" ||
      stationCheck === "bm01" ||
      selectedStation === "Station BM01"
    ) {
      useWorkstationStore.getState().setItemToFinish(product);
      useWorkstationStore.getState().setFinishModalOpen(true);
      return;
    }

    // FIX: Handmatige verplaatsing door Teamleader
    // Bepaal dynamisch de juiste stap op basis van het nieuwe station
    if (product.isManualMove) {
      try {
        const targetStation = product.currentStation || selectedStation;
        const targetProductId = product.id || product.lotNumber;

        await advanceTrackedProduct({
          productId: targetProductId,
          nextStation: "",
          nextStep: String(product.currentStep || "").trim() || "Wikkelen",
          nextStatus: String(product.status || "").trim() || "In Production",
          lastStation: targetStation,
          note: product.note ? product.note + ` (Hervat op ${targetStation})` : `Hervat op ${targetStation}`,
          actorLabel: currentUser?.email || "Operator",
          previousStep: product.currentStep || "",
          historyAction: "Handmatige Verplaatsing Hervat",
          historyDetails: `Handmatige verplaatsing hervat op ${targetStation}`,
          clearManualMove: true,
          source: "WorkstationHub",
        });
        showSuccess(`Product ${product.lotNumber} correct ingesteld voor ${targetStation}`);
        return;
      } catch (error) {
        console.error("Fout bij doorsturen:", error);
        showError("Kon product niet doorsturen", "Fout");
        return;
      }
    }

    try {
      const bulkUnits = Array.isArray(options?.bulkUnits)
        ? options.bulkUnits.filter(Boolean)
        : [];
      const targets = bulkUnits.length > 0 ? bulkUnits : [product];

      // Haal operators op voor station "LOSSEN" (Centrale losplaats)
      const lossenOperators = occupancy
        .filter(occ => {
          const stationName = (occ.station || occ.machineId || "").toUpperCase();
          if (stationName !== "LOSSEN") return false;
          
          if (!occ.date) return false;
          const occDate = toDateSafe(occ.date as any) || new Date();
          occDate.setHours(0, 0, 0, 0);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          return occDate.getTime() === today.getTime() && isShiftActive(occ.shift);
        })
        .map(occ => occ.operatorNumber)
        .filter(Boolean);

      const routingResult: any = await routeTrackedProductsToLossen({
        productIds: targets.map((target) => target?.id || target?.lotNumber).filter(Boolean),
        originStation: selectedStation,
        centralStation: "LOSSEN",
        centralOperators: lossenOperators,
        actorLabel: currentUser?.email || "Operator",
        source: "WorkstationHub",
      });

      await logWorkstationActivity(
        "PRODUCT_TO_LOSSEN",
        `Doorgestuurd naar lossen: ${targets.length} lot(s), station ${selectedStation}`
      );
      if (routingResult?.switchedToLossenTab) {
        setActiveTab("lossen");
      }
    } catch (error) {
      console.error("Fout bij proces:", error);
      showError("Kon status niet updaten", "Fout bij proces");
    }
  };

  // NIEUW: Afhandelen van reparatie op BH31
  const handleRepairComplete = async (data: any) => {
      const itemToRepair = useWorkstationStore.getState().itemToRepair;
      if (!itemToRepair) return;
      try {
        await completeTrackedProductRepair({
          productId: itemToRepair.id || itemToRepair.lotNumber,
          station: "BH31",
          actions: data.actions || [],
          note: data.notes || "",
          actorLabel: currentUser?.email || "Operator",
          source: "WorkstationHub",
        });
          await logWorkstationActivity(
            "QUALITY_REPAIR_COMPLETE",
            `Reparatie afgerond: lot ${itemToRepair?.lotNumber || itemToRepair?.id}, BH31 -> BM01`
          );
          showSuccess(`Product ${itemToRepair.lotNumber} gerepareerd en doorgestuurd naar BM01`);
          useWorkstationStore.getState().setShowRepairModal(false);
          useWorkstationStore.getState().setItemToRepair(null);
      } catch (err) {
          console.error("Fout bij reparatie afronden:", err);
          showError("Kon reparatie niet opslaan");
      }
  };

  const handleOpenProductInfo = async (productId: string) => {
    try {
      const productSnap = await getDoc(
        doc(db, `${getPathString(PATHS.PRODUCTS)}/${productId}`)
      );
      if (productSnap.exists()) {
        useWorkstationStore.getState().setLinkedProductData({ id: productSnap.id, ...(productSnap.data() as Omit<TrackedProductDoc, "id">) });
      } else {
        showWarning(t("digitalplanning.workstation.product_not_found"), t("digitalplanning.workstation.not_found"));
      }
    } catch (error) {
      console.error(error);
      showError(t("digitalplanning.workstation.product_load_error"), t("digitalplanning.workstation.load_error"));
    }
  };

  const handleActiveUnitClick = (unit: TrackedProductDoc) => {
    const parentOrder = rawOrders.find((o) => o.orderId === unit.orderId);
    if (parentOrder && parentOrder.linkedProductId) {
      handleOpenProductInfo(String(parentOrder.linkedProductId));
    } else if (unit.originalOrderId) {
      const origOrder = rawOrders.find(
        (o) => o.orderId === unit.originalOrderId
      );
      if (origOrder && origOrder.linkedProductId)
        handleOpenProductInfo(String(origOrder.linkedProductId));
      else showWarning(t("digitalplanning.workstation.no_dossier_for_order", { order: unit.originalOrderId }), t("digitalplanning.workstation.dossier_missing"));
    } else {
      showWarning(t("digitalplanning.workstation.no_dossier_linked", { order: unit.orderId }), t("digitalplanning.workstation.dossier_missing"));
    }
  };

  // NIEUW: Handler voor annuleren productie (Prullenbak)
  const handleCancelProduction = async (productId: string) => {
    if (!productId) return;

    // Optioneel product opzoeken voor details (lotnummer), maar niet vereist
    const product = rawProducts.find(p => p.id === productId);
    const cancelProductRef = String(product?.__docPath || productId || "").trim();

    try {
      await cancelTrackedProduction({
        productId: cancelProductRef,
        selectedStation,
        source: "WorkstationHub",
        actorLabel: currentUser?.email,
      });

      await logWorkstationActivity(
        "PRODUCTION_CANCEL",
        `Production cancelled for lot ${product?.lotNumber || productId} on ${selectedStation}`
      );
      showSuccess(t("digitalplanning.workstation.cancel_success", "Productie geannuleerd"));
    } catch (err) {
      console.error("Error cancelling production:", err);
      showError(t("digitalplanning.workstation.cancel_error", "Fout bij annuleren"));
    }
  };

  // Pull to Refresh Logic
  const [pullStartY, setPullStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (contentRef.current && contentRef.current.scrollTop === 0) {
      setPullStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (pullStartY > 0 && contentRef.current && contentRef.current.scrollTop === 0) {
      const touchY = e.touches[0].clientY;
      const diff = touchY - pullStartY;
      if (diff > 0) {
        // Weerstand toevoegen (max 120px pull)
        setPullDistance(Math.min(diff * 0.4, 120));
      }
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 60) {
      setIsRefreshing(true);
      setTimeout(() => window.location.reload(), 500);
    } else {
      setPullDistance(0);
      setPullStartY(0);
    }
  };

  return (
    <>
    <div className="flex flex-col w-full h-[100dvh] bg-slate-50 text-slate-900">
      {/* HEADER */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="w-full px-2 sm:px-4 lg:px-8 py-1 sm:py-0">
          <div className="flex h-12 sm:h-16 items-center justify-between gap-1 sm:gap-3">
            {/* Linkerkant: Terug & Titel */}
            <div className="flex items-center shrink-0">
              <button
                onClick={handleBack}
                className="mr-1.5 sm:mr-4 px-2 py-1.5 sm:px-4 sm:py-2 bg-white border border-gray-200 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2 font-bold text-[10px] sm:text-xs uppercase tracking-wider shadow-sm"
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{t("digitalplanning.workstation.back")}</span>
              </button>
              <span className="text-sm sm:text-xl font-black text-gray-900 italic tracking-tight truncate max-w-[60px] xs:max-w-[100px] sm:max-w-none">
                {WORKSTATIONS.find((w) => w.id === selectedStation)?.name ||
                  selectedStation}
              </span>
            </div>

            {/* Mobiele Info (Midden) - Zichtbaar op kleine schermen in dezelfde regel */}
            <div className="flex lg:hidden flex-1 items-center justify-end min-w-0 gap-1 sm:gap-2">
              <div className="flex items-center bg-slate-50 rounded-md border border-slate-200 p-1 min-w-0 shadow-sm">
                <div className="flex items-center gap-1 overflow-hidden mr-1">
                  {stationOccupancy.length > 0 ? (
                    <span className={`px-1 py-0.5 rounded text-[9px] font-bold uppercase border truncate ${getShiftColor(stationOccupancy[0]?.shift)}`}>
                      {stationOccupancy[0]?.operatorName.split(' ')[0]}
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-slate-400 italic hidden xs:inline-block px-1">Geen</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    useWorkstationStore.getState().setShowOperatorCheckinModal(true);
                    useWorkstationStore.getState().setOperatorBadgeInput("");
                    setIsMobileMenuOpen(false);
                  }}
                  className="shrink-0 px-1.5 py-1 rounded bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest active:scale-95 shadow-sm"
                >
                  Inlog
                </button>
              </div>

              {/* Tijd Widget Mobiel */}
              <div className="shrink-0 flex items-center justify-center px-1.5 py-1 bg-white rounded-md border border-slate-200 text-center shadow-sm">
                <p className="text-[10px] font-bold text-slate-700">
                  {currentDate.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>

            {/* KPI Tegels */}
            <div className="hidden lg:flex items-center gap-2 ml-2 border-l border-slate-200 pl-4">
              {!isTwoKpiHeaderStation && (
                <div className="flex flex-col items-center px-3 py-1 bg-blue-50 rounded-lg border border-blue-100 min-w-[60px]">
                  <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest leading-none mb-0.5">{t("digitalplanning.dashboard.plan")}</span>
                  <span className="text-sm font-black text-blue-700 leading-none">{stationStats.plan}</span>
                </div>
              )}
              <div className="flex flex-col items-center px-3 py-1 bg-orange-50 rounded-lg border border-orange-100 min-w-[60px]">
                <span className="text-[8px] font-black text-orange-400 uppercase tracking-widest leading-none mb-0.5">
                  {todoHeaderLabel}
                </span>
                <span className="text-sm font-black text-orange-700 leading-none">{stationStats.todo}</span>
              </div>
              <div className="flex flex-col items-center px-3 py-1 bg-emerald-50 rounded-lg border border-emerald-100 min-w-[60px]">
                <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-0.5">{t("digitalplanning.dashboard.ready")}</span>
                <span className="text-sm font-black text-emerald-700 leading-none">{stationStats.done}</span>
              </div>
            </div>

            {/* Midden: Bezetting Info */}
            <button
              type="button"
              onClick={() => {
                useWorkstationStore.getState().setShowOperatorCheckinModal(true);
                useWorkstationStore.getState().setOperatorBadgeInput("");
              }}
              className="hidden xl:flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200 shadow-sm min-w-[200px] justify-center hover:bg-slate-50 transition-colors"
              title="Klik om operator aan te melden"
            >
              <Clock className="w-4 h-4 text-slate-500" />
              {stationOccupancy.length > 0 ? (
                <div
                  key={currentOperatorIndex}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase border animate-in fade-in slide-in-from-bottom-1 duration-500 ${getShiftColor(
                    stationOccupancy[currentOperatorIndex]?.shift
                  )}`}
                  title={`${stationOccupancy[currentOperatorIndex]?.operatorName} - ${stationOccupancy[currentOperatorIndex]?.shift}`}
                >
                  {stationOccupancy[currentOperatorIndex]?.operatorName}
                </div>
              ) : (
                <span className="text-xs font-bold text-slate-400 uppercase italic">{t("digitalplanning.workstation.no_operator")}</span>
              )}
            </button>

            {requiresShiftCheckin && checkedInOperator && (
              <div className="hidden xl:flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-200 shadow-sm">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-black text-emerald-700 uppercase">{checkedInOperator.name}</span>
              </div>
            )}

            <button
              onClick={toggleMachineStoring}
              className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg border shadow-sm transition-all active:scale-95 ${
                activeDowntime 
                  ? "bg-red-50 border-red-500 text-red-600 animate-pulse" 
                  : "bg-white border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200"
              }`}
              title={activeDowntime ? "Storing afmelden" : "Machine in storing melden"}
            >
              <AlertTriangle size={18} className={activeDowntime ? "text-red-500" : ""} />
              <span className={`text-xs font-black uppercase tracking-widest ${activeDowntime ? "text-red-600" : ""}`}>
                {activeDowntime ? "In Storing" : "Storing Melden"}
              </span>
            </button>

            {/* Rechts: Datum, Tijd & Week - helemaal rechts met flex-1 */}
            <div className="flex-1 hidden lg:flex justify-end items-center">
              <div className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <Calendar size={16} className="text-blue-600" />
                <div className="text-xs font-bold text-gray-700">
                  {t("common.week")} {currentWeekInfo.week} • {currentDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
                <div className="text-xs font-mono font-bold text-blue-600 border-l border-gray-300 pl-3">
                  {currentDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            {/* Rechterkant: Mobiel Menu Button */}
            <div className="flex items-center shrink-0 ml-1">
              {/* Mobiel Hamburger Menu */}
              <div className="lg:hidden relative">
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-1.5 sm:p-2 bg-gray-100 rounded-lg text-gray-600 active:bg-gray-200 shadow-sm"
                >
                  {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>

                {isMobileMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 p-2 flex flex-col gap-1 z-50 animate-in slide-in-from-top-2">
                    {/* KPI Info voor mobiel */}
                    <div className={`grid ${isTwoKpiHeaderStation ? 'grid-cols-2' : 'grid-cols-3'} gap-2 mb-2`}>
                      {!isTwoKpiHeaderStation && (
                        <div className="px-2 py-2 bg-blue-50 rounded-lg border border-blue-100 text-center">
                          <span className="text-[8px] font-black text-blue-400 uppercase block">{t("digitalplanning.dashboard.plan")}</span>
                          <span className="text-xs font-black text-blue-700">{stationStats.plan}</span>
                        </div>
                      )}
                      <div className="px-2 py-2 bg-orange-50 rounded-lg border border-orange-100 text-center">
                        <span className="text-[8px] font-black text-orange-400 uppercase block">{todoHeaderLabel}</span>
                        <span className="text-xs font-black text-orange-700">{stationStats.todo}</span>
                      </div>
                      <div className="px-2 py-2 bg-emerald-50 rounded-lg border border-emerald-100 text-center">
                        <span className="text-[8px] font-black text-emerald-400 uppercase block">{t("digitalplanning.dashboard.ready")}</span>
                        <span className="text-xs font-black text-emerald-700">{stationStats.done}</span>
                      </div>
                    </div>

                    {/* Bezetting Info voor mobiel */}
                    {stationOccupancy.length > 0 && (
                      <div className="px-3 py-3 bg-slate-50 rounded-lg border border-slate-200 mb-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2">
                          <Clock className="w-3 h-3" />
                          <span>{t("digitalplanning.workstation.scheduled_occupancy")}</span>
                        </div>
                        <div className="space-y-1.5">
                          {stationOccupancy.map((occ, idx) => (
                            <div
                              key={idx}
                              className={`px-2 py-1.5 rounded-md text-[10px] font-bold uppercase border ${getShiftColor(occ.shift)}`}
                            >
                              {occ.operatorName}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <button
                      onClick={() => {
                        setActiveTab("terminal");
                        setIsMobileMenuOpen(false);
                      }}
                      className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${
                        activeTab === "terminal"
                          ? "bg-blue-50 text-blue-600"
                          : "text-gray-500"
                      }`}
                    >
                      {t("digitalplanning.terminal.tab_planning")}
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab("winding");
                        setIsMobileMenuOpen(false);
                      }}
                      className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${
                        activeTab === "winding"
                          ? "bg-blue-50 text-blue-600"
                          : "text-gray-500"
                      }`}
                    >
                      {t("digitalplanning.hub.title")}
                    </button>
                    {![("BM01"), "Station BM01"].includes(
                      selectedStation
                    ) && isWorkstationGereedTab && (
                      <button
                        onClick={() => {
                          setActiveTab("lossen");
                          setIsMobileMenuOpen(false);
                        }}
                        className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${
                          activeTab === "lossen"
                            ? "bg-blue-50 text-blue-600"
                            : "text-gray-500"
                        }`}
                      >
                        Gereed
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setActiveTab("efficiency");
                        setIsMobileMenuOpen(false);
                      }}
                      className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${
                        activeTab === "efficiency"
                          ? "bg-blue-50 text-blue-600"
                          : "text-gray-500"
                      }`}
                    >
                      {t("common.efficiency")}
                    </button>
                    
                    {/* iPad/Mobile specifieke acties */}
                    <div className="h-px bg-slate-100 my-1"></div>
                    <button
                      onClick={requestNotificationPermission}
                      className="px-4 py-3 rounded-lg text-xs font-bold uppercase text-left w-full text-slate-500 hover:bg-slate-50 flex items-center gap-2"
                    >
                      🔔 Notificaties Aanzetten
                    </button>
                    {!isPWA && (
                      <button
                        onClick={showInstallInstructions}
                        className="px-4 py-3 rounded-lg text-xs font-bold uppercase text-left w-full text-slate-500 hover:bg-slate-50 flex items-center gap-2"
                      >
                        📱 App Installeren
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div 
        ref={contentRef}
        className={`flex-1 overflow-y-auto w-full bg-white ${activeTab === 'terminal' ? 'p-0' : 'p-2 sm:p-6 lg:p-8'} relative`}
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull to Refresh Indicator */}
        {(pullDistance > 0 || isRefreshing) && (
          <div 
            className="absolute top-4 left-0 w-full flex justify-center z-50 pointer-events-none"
            style={{ 
              transform: `translateY(${isRefreshing ? 10 : Math.max(0, pullDistance - 30)}px)`,
              opacity: Math.min(pullDistance / 40, 1),
              transition: isRefreshing ? 'transform 0.2s' : 'none'
            }}
          >
            <div className="bg-white p-2 rounded-full shadow-lg border border-slate-100">
              <Loader2 
                className={`text-blue-600 ${isRefreshing || pullDistance > 60 ? 'animate-spin' : ''}`} 
                size={24} 
                style={{ transform: !isRefreshing ? `rotate(${pullDistance * 3}deg)` : undefined }}
              />
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col justify-center items-center h-full gap-4">
            <Loader2 className="animate-spin rounded-full h-12 w-12 text-blue-600" />
            <div className="text-center">
              <p className="text-sm font-bold text-slate-600 uppercase tracking-wide">
                {t("digitalplanning.workstation.loading_station")} {selectedStation}
              </p>
              <p className="text-xs text-slate-400 mt-1">{t("digitalplanning.workstation.loading_data")}</p>
            </div>
          </div>
        ) : (!currentUser?.role || currentUser?.role === 'guest') ? (
          <div className="flex flex-col justify-center items-center h-full text-slate-400">
            <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-200 text-center max-w-md">
              <h3 className="text-lg font-black uppercase tracking-widest text-slate-700 mb-2">{t("digitalplanning.workstation.account_pending_title")}</h3>
              <p className="text-sm font-medium mb-6">{t("digitalplanning.workstation.account_pending_message")}</p>
              <button onClick={handleBack} className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors">
                {t("digitalplanning.workstation.back_to_portal")}
              </button>
            </div>
          </div>
        ) : (
          <>
            {activeTab === "winding" && (
              ((selectedStation || "").toUpperCase().replace(/\s/g, "").includes("NABEWERK")) ? (
            <Nabewerken products={rawProducts as any} orders={rawOrders as any} />
              ) : (
              <ActiveProductionView
                  activeUnits={activeUnitsHere as any}
              smartSuggestions={[] as any}
                  selectedStation={selectedStation}
                  onProcessUnit={handleProcessUnit}
                  
                  onClickUnit={handleActiveUnitClick}
                />
              )
            )}
            {activeTab === "lossen" && (
              <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {isWorkstationGereedTab ? (
                  <GereedView
                products={rawProducts as any}
                    stationId={selectedStation}
                  />
                ) : ((selectedStation || "").toUpperCase().replace(/\s/g, "").includes("NABEWERK")) ? (
              <Nabewerken products={rawProducts as any} orders={rawOrders as any} />
                ) : (String(selectedStation || "").toUpperCase().replace(/\s/g, "") === "MAZAK") ? (
                  <MazakView
                products={rawProducts as any}
                    stationId={selectedStation}
                  />
                ) : (
                <LossenView
                products={rawProducts as any}
                    stationId={selectedStation}
                    appId={currentAppId}
                  />
                )}
              </div>
            )}
            {activeTab === "terminal" && (
              <div className="h-full">
                {isBM01 ? (
                  <BM01Hub 
                    onBack={handleBack} 
                  orders={rawOrders as any}
                  products={rawProducts as any}
                    onMoveLot={handleMoveLot}
                  />
                ) : (
              <Terminal
                    initialStation={selectedStation}
                    orders={isLossen1218Station ? rawOrders : stationOrders}
                    onCancelProduction={handleCancelProduction}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      <WorkstationModals
        stationId={selectedStation}
        rawProducts={rawProducts}
        handleStartProduction={handleStartProduction}
        handleOpenProductInfo={handleOpenProductInfo}
        handleLinkProduct={handleLinkProduct}
        handlePostProcessingFinish={handlePostProcessingFinish}
        handleRepairComplete={handleRepairComplete}
        handleOperatorShiftCheckin={handleOperatorShiftCheckin}
        handleOperatorCheckout={handleOperatorCheckout}
        handleSaveHourCorrection={handleSaveHourCorrection}
        onDismissPromptShift={() => setDismissedPromptShift(currentShiftKey)}
        stationOccupancy={stationOccupancy}
        currentShiftKey={currentShiftKey}
        nfc={nfc}
        SHIFT_CONFIG={SHIFT_CONFIG}
        getShiftColor={getShiftColor}
        toFiniteNumber={toFiniteNumber}
        currentUser={currentUser}
        isPostProcessing={isPostProcessing}
        isBM01={isBM01}
      />
    </div>
    </>
  );
}
export default WorkstationHub;
