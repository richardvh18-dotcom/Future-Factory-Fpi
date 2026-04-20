import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { collection, onSnapshot } from "firebase/firestore";
import { db, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { rejectTrackedProductFinal, completeTrackedProduct, tempRejectTrackedProduct, advanceTrackedProduct } from "../../services/planningSecurityService";
import { Package,
    Loader2,
    ClipboardCheck,
    History,
    ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
    ScanBarcode,
    Keyboard } from "lucide-react";
import ProductReleaseModal from "./modals/ProductReleaseModal";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";
import { normalizeMachine } from "../../utils/hubHelpers";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { getNextFlowState } from "../../utils/workstationLogic";
import { useNotifications } from '../../contexts/NotificationContext';
import { subscribeTrackedProducts } from "../../utils/trackedProducts";

const QR_CODE_OK_CONFIRMATION = 'FPI-ACTION-APPROVE-OK';
const LOSSEN_1218_SOURCE_STATIONS = new Set(["BH12", "BH15", "BH17"]);
const LOSSEN_1218_STATION_NORM = "LOSSEN12/18";

// Helper voor diameter (simpel)
const getDiameter = (str) => {
  const text = String(str || "").toUpperCase();
  const numberMatches = Array.from(text.matchAll(/\d{2,4}/g)).map((m) => Number(m[0]));
  const candidates = numberMatches.filter((n) => Number.isFinite(n) && n >= 25 && n <= 2000);
  
  return candidates.length > 0 ? candidates[0] : 0;
};

const shouldGoToCentralLossen = (item) => {
  const originNorm = normalizeMachine(item?.originMachine || item?.machine || item?.currentStation || "");
  if (LOSSEN_1218_SOURCE_STATIONS.has(originNorm)) return true;

  const itemStr = String(item?.item || "").toUpperCase();
  const d = getDiameter(item?.item || "");
  const isTB = itemStr.includes("TB");
  const isCB = itemStr.includes("CB");
  const isELB = itemStr.includes("ELB");
  const isAB = /\bAB\b/.test(itemStr);
  const isSB = /\bSB\b/.test(itemStr);
  const isElbow = isELB || isCB;

  // Alle AB en SB elbows altijd naar centraal LOSSEN
  if (isElbow && (isAB || isSB)) return true;

  // BH18 business rule: Elbows met AB-mof gaan altijd naar centraal LOSSEN (oude regel, nu afgevangen door regel hierboven)

  // TB >= 300mm naar centraal, < 300mm lokaal
  if (isTB && d >= 300) return true;
  // CB/ELB >= 350mm naar centraal, < 350mm lokaal
  if ((isCB || isELB) && d >= 350) return true;

  return false;
};

const isTruthyRoutingFlag = (value) => {
  if (value === true || value === 1) return true;
  const normalized = String(value || "").trim().toLowerCase();
  return ["true", "1", "yes", "ja", "nabewerking", "te nabewerken", "post_processing", "post processing"].includes(normalized);
};

const hasNabewerkingFlag = (item) => {
  if (!item || typeof item !== "object") return false;

  const directFlagFields = [
    "nabewerking",
    "nabewerken",
    "teNabewerken",
    "te_nabewerken",
    "needsNabewerking",
    "requiresNabewerking",
    "postProcessing",
    "post_processing",
    "needsPostProcessing",
    "requiresPostProcessing",
    "isPostProcessing",
  ];

  if (directFlagFields.some((field) => isTruthyRoutingFlag(item?.[field]))) {
    return true;
  }

  const routingHints = [
    item?.nextStation,
    item?.routeStation,
    item?.targetStation,
    item?.returnStation,
    item?.route?.nextStation,
  ];
  if (routingHints.some((value) => String(value || "").toUpperCase().replace(/\s/g, "").includes("NABEWERK"))) {
    return true;
  }

  return Object.entries(item).some(([key, value]) => {
    const keyLower = String(key || "").toLowerCase();
    if (!/(nabewerk|post.?process)/.test(keyLower)) return false;
    return isTruthyRoutingFlag(value);
  });
};

/**
 * LossenView - Beheert de inkomende producten voor een specifiek werkstation.
 * Gefikst: BH31 naar Nabewerking flow hersteld door betere normalisatie.
 * Update: Gebruikt nu 'products' prop indien beschikbaar om dubbele fetching te voorkomen.
 */
const LossenView = ({ stationId, appId, products = [] }) => {
  const { t } = useTranslation();
  const { user } = useAdminAuth();
  const { notify } = useNotifications();
  const [items, setItems] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [bulkSeriesProducts, setBulkSeriesProducts] = useState([]);
  const [showActionModal, setShowActionModal] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [scanInput, setScanInput] = useState("");
  const [scannerMode, setScannerMode] = useState(true);
  const scanInputRef = useRef(null);
  const selectedProductRef = useRef(null); // Ref om huidige selectie bij te houden tijdens async acties

  // Sync ref met state
  useEffect(() => {
    selectedProductRef.current = selectedProduct;
  }, [selectedProduct]);

  // Auto-focus logic voor scanner: altijd focus bij laden en als scannerMode aan staat
  useEffect(() => {
    if (!scannerMode) return;
    // Focus direct bij laden of als scannerMode aan gaat
    scanInputRef.current?.focus();
    // Ook bij click buiten input, behalve op interactieve elementen
    const handleClick = (e) => {
      const target = e?.target;
      if (!target) return;
      if (target.closest?.('input, textarea, select, button, a, [role="button"], [contenteditable="true"], [data-scan-ignore]')) return;
      if (!showActionModal) scanInputRef.current?.focus();
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showActionModal, scannerMode]);

  // Focus scanveld bij eerste render (ook als scannerMode uit staat)
  useEffect(() => {
    scanInputRef.current?.focus();
  }, []);

  const handleScan = async (e) => {
    if (e.key === 'Enter') {
      const code = scanInput.trim().toUpperCase();
      if (!code) return;

      // --- Goedkeuren met QR-code ---
      if (code === QR_CODE_OK_CONFIRMATION && selectedProduct) {
        setScanInput("");
        const productToProcess = selectedProduct;
        if (isAdvancedStation) {
          await handlePostProcessingFinish('completed', { note: 'Goedgekeurd via QR Scan' }, productToProcess);
        } else {
          notify(
            t(
              "lossen.measurement_required_for_ok_qr",
              "Let op: Voor Lossen is een meting verplicht. Vul de meetwaarden in op het scherm in plaats van de OK-QR te scannen."
            )
          );
        }
        return;
      }

      const found = items.find(i => 
        (i.lotNumber || "").toLowerCase() === code.toLowerCase() || 
        (i.orderId || "").toLowerCase() === code.toLowerCase()
      );

      if (found) {
        handleItemClick(found);
        setScanInput("");
        // Direct popup openen na scan
        setTimeout(() => {
          setShowActionModal(true);
        }, 0);
      } else {
        notify(t('lossen.item_not_found', 'Item {{code}} niet gevonden', { code }));
        setScanInput("");
        setSelectedProduct(null);
      }
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 50);
    }
  };

  // Haal occupancy data op voor operator tracking
  useEffect(() => {
    const unsub = onSnapshot(collection(db, ...PATHS.OCCUPANCY), (snap) => {
      setOccupancy(snap.docs.map(d => d.data()));
    });
    return () => unsub();
  }, []);

  // Helper om te checken of een shift momenteel actief is
  const isShiftActive = (shiftLabel) => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;
    const label = (shiftLabel || "").toUpperCase();
    
    if (label.includes("OCHTEND") || label.includes("MORNING") || label.includes("EARLY")) {
      return currentTime >= 5 * 60 + 30 && currentTime < 14 * 60;
    }
    if (label.includes("AVOND") || label.includes("EVENING") || label.includes("LATE")) {
      return currentTime >= 14 * 60 && currentTime < 22 * 60 + 30;
    }
    if (label.includes("NACHT") || label.includes("NIGHT")) {
      return currentTime >= 22 * 60 + 30 || currentTime < 5 * 60 + 30;
    }
    if (label.includes("DAG") || label === "DAGDIENST") {
      return currentTime >= 7 * 60 + 15 && currentTime < 16 * 60;
    }
    return true;
  };

  // Bereken actieve operators voor dit station
  const activeOperators = useMemo(() => {
    if (!stationId || occupancy.length === 0) return [];
    const currentStation = normalizeMachine(stationId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return occupancy.filter(occ => {
      const occStation = normalizeMachine(occ.station || occ.machineId || "");
      if (occStation !== currentStation) return false;
      const occDate = occ.date.toDate ? occ.date.toDate() : new Date(occ.date);
      occDate.setHours(0, 0, 0, 0);
      return occDate.getTime() === today.getTime() && isShiftActive(occ.shift);
    }).map(o => o.operatorNumber).filter(Boolean);
  }, [occupancy, stationId]);

  useEffect(() => {
    if (!stationId) return;

    // Verwerkingslogica losgekoppeld zodat deze voor zowel prop als snapshot werkt
    const processData = (sourceData) => {
      const currentStationNorm = normalizeMachine(stationId);
        const cleanStationId = (currentStationNorm || "").toUpperCase().replace(/\s/g, "");
        const isBM01Station = cleanStationId === "BM01" || cleanStationId === "STATIONBM01" || (currentStationNorm || "").toUpperCase().includes("BM01");
        const isMazakStation = cleanStationId === "MAZAK";
        const isNabewerkingStation = cleanStationId === "NABEWERKING" || cleanStationId === "NABW" || cleanStationId.includes("NABEWERK");

      const filtered = sourceData.filter((item) => {
        const stepUpper = String(item.currentStep || "").toUpperCase().trim();
        const statusUpper = String(item.status || "").toUpperCase().trim();
        const inspectionStatus = String(item.inspection?.status || "").toUpperCase().trim();

          const isDefRejected =
            inspectionStatus === "AFKEUR" ||
            statusUpper === "REJECTED" ||
            statusUpper === "AFKEUR" ||
            stepUpper === "REJECTED";
          if (isDefRejected) return false;

          const isTempRejected = inspectionStatus === "TIJDELIJKE AFKEUR" || stepUpper === "HOLD_AREA";
          if (isTempRejected && !isNabewerkingStation) return false;

        // Filter op currentStation die overeenkomt met dit werkstation
        // Fallback naar 'machine' (origin) als currentStation niet is gezet
        const itemStationNorm = normalizeMachine(item.currentStation || item.machine || "");
          const isDownstreamStation = isBM01Station || isMazakStation || isNabewerkingStation;

        if (!isDownstreamStation) {
          const isLossenCandidate =
            stepUpper.includes("LOSSEN") ||
            statusUpper === "TE LOSSEN" ||
            itemStationNorm === "LOSSEN" ||
            itemStationNorm === LOSSEN_1218_STATION_NORM;

          // Toon op wikkel/lossen-stations alleen items die daadwerkelijk in de lossen-fase zitten.
          if (!isLossenCandidate) return false;
        }
        
        let isOurStation = itemStationNorm === currentStationNorm;

        // FIX: Als item op 'Lossen' staat, toon het alleen op het station van herkomst als het NIET naar centraal Lossen hoort
        if (!isOurStation && (item.currentStep === "Lossen" || item.currentStep === "Wacht op Lossen" || normalizeMachine(item.currentStation) === "LOSSEN")) {
          const originNorm = normalizeMachine(item.originMachine || item.machine || "");
          if (originNorm === currentStationNorm) {
            // BH18: toon lokaal alle niet-centrale Lossen-items, ook als legacy data currentStation op LOSSEN heeft gezet.
            if ((currentStationNorm === "BH18" || currentStationNorm === "18") && !shouldGoToCentralLossen(item)) {
                isOurStation = true;
            } else if (!(currentStationNorm === "BH18" || currentStationNorm === "18")) {
                isOurStation = true;
            }
          }
        }

        // FIX: Flexibele matching voor Nabewerking (Nabewerking vs Nabewerken)
        if (isNabewerkingStation) {
          const itemClean = (itemStationNorm || "").toUpperCase().replace(/\s/g, "");
          const stepClean = (item.currentStep || "").toUpperCase().replace(/\s/g, "");
          const statusClean = (item.status || "").toUpperCase().replace(/\s/g, "");

          if (itemClean === "NABEWERKING" || itemClean === "NABEWERKEN" || itemClean === "NABW" || itemClean.includes("NABEWERK") ||
              stepClean === "NABEWERKING" || stepClean === "NABEWERKEN" || stepClean.includes("NABEWERK") || 
              statusClean.includes("NABEWERK") ||
              hasNabewerkingFlag(item)) {
            isOurStation = true;
          }
        }

        // FIX: Flexibele matching voor Mazak
          if (isMazakStation) {
          const statusClean = (item.status || "").toUpperCase().replace(/\s/g, "");
          if (statusClean.includes("MAZAK")) isOurStation = true;
        }

        // FIX: Flexibele matching voor BM01
          if (isBM01Station) {
          const itemClean = (itemStationNorm || "").toUpperCase().replace(/\s/g, "");
          const stepClean = (item.currentStep || "").toUpperCase().replace(/\s/g, "");
          const statusClean = (item.status || "").toUpperCase().replace(/\s/g, "");
          if (itemClean === "BM01" || itemClean === "STATIONBM01" || itemClean.includes("BM01") ||
              stepClean === "EINDINSPECTIE" || stepClean === "INSPECTIE" || stepClean.includes("INSPECTIE") || stepClean === "BM01" ||
              statusClean.includes("BM01")) {
            isOurStation = true;
          }
        }

        // --- CENTRAAL LOSSEN LOGICA ---
        // Als we naar het station "LOSSEN" kijken, toon dan ook items van specifieke machines
        if (currentStationNorm === "LOSSEN" || currentStationNorm === LOSSEN_1218_STATION_NORM) {
          const origin = normalizeMachine(item.originMachine || item.machine || "");
          const originLabel = normalizeMachine(item.stationLabel || "");
          const current = normalizeMachine(item.currentStation || "");

          const lossen1218Origins = ["BH12", "BH15", "BH17", "12", "15", "17"];
          const lossenOrigins = ["BH18", "18", "BH31", "BH16", "BH11", "31", "16", "11"];
          const isLossen1218Station = currentStationNorm === LOSSEN_1218_STATION_NORM;

          let targetMachines = isLossen1218Station ? lossen1218Origins : [...lossenOrigins, ...lossen1218Origins];
          let useStrictFilter = false;

          // Filter op toegewezen stations van de gebruiker (indien specifiek ingesteld)
          if (user && user.allowedStations && user.allowedStations.length > 0) {
             const userTargets = user.allowedStations
                .map(s => normalizeMachine(s))
                .filter(s => s !== "LOSSEN" && s !== "TEAMLEADER");
             
             if (userTargets.length > 0) {
                 targetMachines = userTargets;
                 useStrictFilter = true;
             }
          }

           if (targetMachines.includes(origin) || targetMachines.includes(originLabel) || targetMachines.includes(current)) {
             if (lossen1218Origins.includes(origin) || lossen1218Origins.includes(originLabel) || lossen1218Origins.includes(current)) {
               isOurStation = isLossen1218Station;
             } else if (["BH18", "18"].includes(origin) || ["BH18", "18"].includes(originLabel) || ["BH18", "18"].includes(current)) {
               if (shouldGoToCentralLossen(item)) {
                 isOurStation = !isLossen1218Station;
               } else {
                 isOurStation = false;
               }
             } else {
                 isOurStation = !isLossen1218Station;
             }
           } else if (!useStrictFilter && (lossen1218Origins.includes(origin) || lossen1218Origins.includes(originLabel) || lossen1218Origins.includes(current))) {
             isOurStation = isLossen1218Station;
           } else if (!useStrictFilter && isLossen1218Station && (["BH18", "18"].includes(origin) || ["BH18", "18"].includes(originLabel) || ["BH18", "18"].includes(current))) {
             // BH18-producten die NIET naar centraal lossen gaan, tonen op LOSSEN12/18
             if (!shouldGoToCentralLossen(item)) {
               isOurStation = true;
             }
          }

        }

        return isOurStation;
      });

      const sorted = filtered.sort((a, b) => {
        const tA = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
        const tB = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
        return tB - tA;
      });

      setItems(sorted);
      setLoading(false);
    };

    // Als 'products' prop is meegegeven, gebruik die direct.
    // Anders, zet een snapshot listener op.
    if (products && products.length > 0) {
      processData(products);
      setLoading(false);

      // Optioneel: toch een listener opzetten voor live updates, maar de eerste render is snel.
      const unsub = subscribeTrackedProducts({
        db,
        statusExclusions: ["completed", "shipped", "deleted"],
        onData: (sourceData) => {
          processData(sourceData);
        },
        onError: (err) => {
        console.error("Error in LossenView snapshot:", err);
        setLoading(false);
        },
      });
      return () => unsub();

    } else {
      const unsub = subscribeTrackedProducts({
        db,
        statusExclusions: ["completed", "shipped", "deleted"],
        onData: (sourceData) => {
          processData(sourceData);
        },
        onError: (err) => {
        console.error("Error in LossenView snapshot:", err);
        setLoading(false);
        },
      });
      return () => unsub();
    }
  }, [stationId, user, products]); // Dependency op 'products' toegevoegd

  const handleItemClick = (item) => {
    if (supportsSeriesGrouping && item?.seriesGroupId) {
      const sameSeries = items.filter(
        (seriesItem) =>
          seriesItem.seriesGroupId === item.seriesGroupId &&
          String(seriesItem.status || "").toUpperCase() !== "REJECTED" &&
          String(seriesItem.currentStep || "").toUpperCase() !== "REJECTED"
      );
      setBulkSeriesProducts(sameSeries.length > 1 ? sameSeries : []);
    } else {
      setBulkSeriesProducts([]);
    }
    setSelectedProduct(item);
    // Direct het modal openen in plaats van het detail panel te tonen
    setShowActionModal(true);
  };

  const handleOpenActionModal = () => {
    if (!selectedProduct) return;
    setShowActionModal(true);
  };

  const handleCloseModal = () => {
    setBulkSeriesProducts([]);
    setSelectedProduct(null);
    setShowActionModal(false);
  };

  const currentStationNorm = useMemo(() => normalizeMachine(stationId), [stationId]);
  const isBM01 = currentStationNorm === "BM01";
  const isMazak = currentStationNorm === "MAZAK";
  const isNabewerking = currentStationNorm === "NABEWERKING" || currentStationNorm === "NABW" || currentStationNorm.includes("NABEWERK");
  const supportsSeriesGrouping = !isBM01 && !isMazak && !isNabewerking;

  const viewTitle = useMemo(() => {
    if (isBM01 || isMazak || isNabewerking) return t('bm01.to_offer');
    if (currentStationNorm === "LOSSEN" || currentStationNorm === LOSSEN_1218_STATION_NORM) return t('lossen.wait_for_unload');
    return t('lossen.waiting_receipt');
  }, [isBM01, isMazak, isNabewerking, currentStationNorm, t]);
  const isAdvancedStation = isBM01 || isMazak || isNabewerking;

  const groupedSeries = useMemo(() => {
    if (!supportsSeriesGrouping) return new Map();
    const grouped = new Map();
    items.forEach((item) => {
      const groupId = item?.seriesGroupId;
      if (!groupId) return;
      if (!grouped.has(groupId)) grouped.set(groupId, []);
      grouped.get(groupId).push(item);
    });
    return grouped;
  }, [items, supportsSeriesGrouping]);

  useEffect(() => {
    setCollapsedGroups((prev) => {
      const next = { ...prev };
      groupedSeries.forEach((group, groupId) => {
        if (group.length <= 1) return;
        if (!(groupId in next)) next[groupId] = true;
      });
      Object.keys(next).forEach((groupId) => {
        const group = groupedSeries.get(groupId);
        if (!group || group.length <= 1) delete next[groupId];
      });
      return next;
    });
  }, [groupedSeries]);

  const displayRows = useMemo(() => {
    const rendered = new Set();
    const rows = [];

    items.forEach((item) => {
      const groupId = item?.seriesGroupId;
      const group = groupId ? groupedSeries.get(groupId) || [] : [];
      const isSeriesGroup = groupId && group.length > 1;

      if (isSeriesGroup && !rendered.has(groupId)) {
        rows.push({
          id: `series_header_${groupId}`,
          isSeriesHeader: true,
          seriesGroupId: groupId,
          orderId: group[0]?.orderId || item?.orderId || "-",
          seriesCount: group.length,
          seriesUnits: group,
        });
        rendered.add(groupId);
      }

      if (!isSeriesGroup || !collapsedGroups[groupId]) {
        rows.push(item);
      }
    });

    return rows;
  }, [items, groupedSeries, collapsedGroups]);

  // --- NIEUW: Aparte handler voor afronden in Lossen vs. Nabewerking ---
  const handlePostProcessingFinish = async (status, data, productOverride = null) => {
    const product = productOverride || selectedProduct;
    if (!product) return;

    const productId = product.id || product.lotNumber;
    try {
      if (status === "completed" && isAdvancedStation) {
        const finishType = stationId === "BM01" ? "archive" : "forward";
        await completeTrackedProduct({
          productId,
          finishType,
          fromStation: stationId,
          note: data.note || "",
          actorLabel: user?.email || "Operator",
          source: "LossenView",
        });
        await logActivity(
          user?.uid || "system",
          "POST_PROCESS_COMPLETE",
          `${stationId} afgerond${finishType === "archive" ? " en gearchiveerd" : " → BM01"}: lot ${product.lotNumber || productId}`
        );
        if (selectedProductRef.current?.id === product.id) handleCloseModal();
        return;
      }

      if (status === "rejected") {
        await rejectTrackedProductFinal({
          productId,
          reasons: data.reasons || [],
          note: data.note || "",
          source: "LossenView",
          actorLabel: user?.email || "Operator",
        });
        await logActivity(
          user?.uid || "system",
          "QUALITY_REJECT_FINAL",
          `Lossen Definitieve afkeur en gearchiveerd: lot ${product.lotNumber || productId}`
        );
        if (selectedProductRef.current?.id === product.id) handleCloseModal();
        return;
      }

      if (status === "temp_reject") {
        await tempRejectTrackedProduct({
          productId,
          reasons: data.reasons || [],
          note: data.note || "",
          station: stationId,
          actorLabel: user?.email || "Operator",
          source: "LossenView",
        });
      } else if (status === "completed" && !isAdvancedStation) {
        const flowState = getNextFlowState("FINISH_WINDING");
        await advanceTrackedProduct({
          productId,
          nextStation: flowState.currentStation || stationId,
          nextStep: flowState.currentStep || "Lossen",
          nextStatus: flowState.status || "In Productie",
          lastStation: stationId,
          note: data.note || "",
          actorLabel: user?.email || "Operator",
          previousStep: product.currentStep || stationId,
          historyAction: "Stap Voltooid",
          historyDetails: "Verwerking afgerond",
          source: "LossenView",
        });
      }
      await logActivity(
        user?.uid || "system",
        status === "completed" ? "POST_PROCESS_COMPLETE" : "QUALITY_TEMP_REJECT",
        `Lossen afhandeling: lot ${product.lotNumber || productId}, station ${stationId}, status ${status}`
      );
      if (selectedProductRef.current?.id === product.id) handleCloseModal();
    } catch (error) {
      console.error("Fout bij afronden:", error);
    }
  };

  if (loading)
    return (
      <div className="p-12 text-center flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );

  return (
    <div className="flex h-full overflow-hidden bg-white">
      
      {/* Pulse animatie stylesheet */}
      <style>{`
        @keyframes scan-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
          50% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
        }
        .scan-pulse {
          animation: scan-pulse 2s infinite;
        }
        @keyframes pulse-text {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .pulse-text {
          animation: pulse-text 1.5s ease-in-out infinite;
        }
      `}</style>

      {showActionModal && selectedProduct && (
        <ProductReleaseModal
          isOpen={true}
          product={selectedProduct}
          bulkProducts={bulkSeriesProducts}
          forceLossenMode={true}
          onClose={handleCloseModal}
          appId={appId}
          activeOperators={activeOperators}
          autoFocus={false}
        />
      )}

        {/* INKOMEND VIEW */}
        <>
          <div className="w-full p-3 pb-32 space-y-2 overflow-y-auto custom-scrollbar" style={{ paddingBottom: "max(8rem, env(safe-area-inset-bottom))" }}>
          <div className="mb-4 space-y-2">
            <div className="flex justify-between items-end">
                {/* Scan Indicator Label */}
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-100 w-fit">
                <div className="w-2 h-2 bg-blue-500 rounded-full pulse-text"></div>
                <span className="text-xs font-black text-blue-600 uppercase tracking-widest">
                    🔍 {t('lossen.ready_to_scan', 'Klaar voor scan')}
                </span>
                </div>

                {/* Scanner Mode Toggle */}
                <button 
                    onClick={() => setScannerMode(!scannerMode)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-bold text-xs uppercase tracking-widest transition-all ${scannerMode ? 'bg-purple-100 border-purple-200 text-purple-700' : 'bg-white border-slate-200 text-slate-400'}`}
                  title={scannerMode ? t("digitalplanning.terminal.scanner_keyboard_hidden", "Toetsenbord verborgen (Scanner modus)") : t("digitalplanning.terminal.normal_input", "Normale invoer")}
                >
                    {scannerMode ? <ScanBarcode size={16} /> : <Keyboard size={16} />}
                  {scannerMode ? t("digitalplanning.terminal.scanner_mode", "Scanner modus") : t("digitalplanning.terminal.keyboard", "Toetsenbord")}
                </button>
            </div>
            {/* Scan Input Field */}
            <div className="relative">
              <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 transition-all scan-pulse" size={24} />
              <input
                  ref={scanInputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  inputMode={scannerMode ? "none" : "text"}
                  onKeyDown={handleScan}
                  placeholder={t("digitalplanning.terminal.scan_lot_or_order", "Scan lotnummer of order...")}
                  className="w-full pl-14 pr-4 py-4 bg-white border-2 border-blue-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-300 rounded-2xl font-bold text-lg shadow-sm outline-none transition-all placeholder:text-slate-300"
              />
            </div>
          </div>

          {items.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200 opacity-40">
              <Package size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {t('lossen.no_incoming_items', { station: stationId })}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-2 ml-2">
                <ArrowRight size={14} className="text-emerald-500" />
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {viewTitle} ({items.length})
                </h3>
              </div>
              {displayRows.map((item) => {
                if (item.isSeriesHeader) {
                  const isCollapsed = !!collapsedGroups[item.seriesGroupId];
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleItemClick(item.seriesUnits[0])}
                      className="bg-blue-50 border border-blue-200 rounded-[14px] p-2.5 cursor-pointer w-full"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[7px] font-black text-blue-500 uppercase tracking-widest">{t("digitalplanning.terminal.series", "Serie")}</p>
                          <p className="text-sm font-black text-blue-900">{t("productionStartModal.labels.order", "Order")} {item.orderId}</p>
                          <p className="text-[8px] font-bold text-blue-700 uppercase">{t("digitalplanning.terminal.series_count", "Serie {{count}} stuks", { count: item.seriesCount })}</p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCollapsedGroups((prev) => ({
                              ...prev,
                              [item.seriesGroupId]: !prev[item.seriesGroupId],
                            }));
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-700 text-[7px] font-black uppercase flex-shrink-0"
                        >
                          {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`bg-white border rounded-[14px] p-3 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all group animate-in slide-in-from-bottom-2 cursor-pointer w-full
                      ${selectedProduct?.id === item.id ? 'border-purple-400 ring-2 ring-purple-200' : 'border-slate-100'}`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="text-left flex-1 min-w-0">
                        <span className="text-[7px] font-black text-slate-400 uppercase block mb-0.5">
                          {t('lossen.lot_number')}
                        </span>
                        <span className="font-black text-slate-900 text-2xl tracking-tighter italic">
                          {item.lotNumber}
                        </span>
                        <p className="text-[10px] font-bold text-slate-600 mt-0.5">
                          {item.item}
                        </p>
                      </div>
                      <div className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-lg text-[7px] font-black uppercase whitespace-nowrap">
                        {t('lossen.received')}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-100 mt-1.5">
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                        {t('lossen.manufactured_item')}
                      </p>
                      <p className="text-[9px] font-mono font-bold text-slate-700 truncate">
                        {item.itemCode}
                      </p>
                      {item.lastStation && (
                        <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-slate-200/60 opacity-80">
                          <History size={8} className="text-blue-500" />
                          <span className="text-[6.5px] font-black text-slate-500 uppercase italic">
                            {isBM01 ? t('lossen.from') + ": " : t('lossen.origin') + ": "}{item.lastStation}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>

      </>
    </div>
  );
};

export default LossenView;
