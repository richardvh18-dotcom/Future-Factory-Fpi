import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, Loader2, Menu, X, Layers, Clock, Tv } from "lucide-react";
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  addDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useAdminAuth } from "../../hooks/useAdminAuth";

import {
  WORKSTATIONS,
  getISOWeekInfo,
  isInspectionOverdue,
} from "../../utils/workstationLogic";
import { normalizeMachine } from "../../utils/hubHelpers";
import PlanningListView from "./views/PlanningListView";
import ActiveProductionView from "./views/ActiveProductionView";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";

import Terminal from "./Terminal";
import LossenView from "./LossenView";
import ProductDetailModal from "../products/ProductDetailModal";
import ProductionStartModal from "./modals/ProductionStartModal";
import OperatorLinkModal from "./modals/OperatorLinkModal";

const COLLECTION_NAME = "digital_planning";

const getAppId = () => {
  if (typeof window !== "undefined" && window.__app_id) return window.__app_id;
  return "fittings-app-v1";
};

// Machine Config
const FITTING_MACHINES = [
  "BM01",
  "BH11",
  "BH12",
  "BH15",
  "BH16",
  "BH17",
  "BH18",
  "BH31",
  "Mazak",
  "Nabewerking",
];
const PIPE_MACHINES = ["BH05", "BH07", "BH08", "BH09"];

const WorkstationHub = ({ initialStationId, onExit }) => {
  const { t } = useTranslation();
  const { user: currentUser } = useAdminAuth();
  const navigate = useNavigate();

  const [selectedStation, setSelectedStation] = useState(
    initialStationId || "BH11"
  );
  const [activeTab, setActiveTab] = useState("planning");
  const [rawOrders, setRawOrders] = useState([]);
  const [rawProducts, setRawProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Mobiel menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Modals & Selecties
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showStartModal, setShowStartModal] = useState(false);
  const [linkedProductData, setLinkedProductData] = useState(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [orderToLink, setOrderToLink] = useState(null);
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [itemToFinish, setItemToFinish] = useState(null);

  const currentAppId = getAppId();
  const isPostProcessing = [
    "mazak",
    "nabewerking",
    "bm01",
    "station bm01",
  ].includes((selectedStation || "").toLowerCase());

  // Initiele Tab en Station Setup
  useEffect(() => {
    if (initialStationId) {
      setSelectedStation(initialStationId);
      if (
        ["Mazak", "Nabewerking", "BM01", "Station BM01"].includes(
          initialStationId
        )
      ) {
        setActiveTab("winding");
      } else {
        setActiveTab("planning");
      }
    }
  }, [initialStationId]);

  // Data Fetching
  useEffect(() => {
    setLoading(true);

    const ordersRef = collection(db, ...PATHS.PLANNING);
    const unsubOrders = onSnapshot(query(ordersRef), (snap) => {
      const loadedOrders = snap.docs.map((doc) => {
        const data = doc.data();
        let dateObj = data.plannedDate?.toDate
          ? data.plannedDate.toDate()
          : new Date();
        let { week, year } = getISOWeekInfo(dateObj);

        return {
          id: doc.id,
          ...data,
          orderId: data.orderId || data.orderNumber || doc.id,
          item: data.item || data.productCode || "Onbekend Item",
          plan: data.plan || data.quantity || 0,
          dateObj: dateObj,
          weekNumber: parseInt(data.week || data.weekNumber || week),
          weekYear: parseInt(data.year || year),
        };
      });
      setRawOrders(loadedOrders);
      setLoading(false);
    });

    const unsubProds = onSnapshot(
      query(collection(db, ...PATHS.TRACKING)),
      (snap) => {
        setRawProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );

    return () => {
      unsubOrders();
      unsubProds();
    };
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
          await addDoc(
            collection(db, ...PATHS.MESSAGES),
            {
              title: "⏰ Automatische Reminder: Tijdelijke Afkeur",
              message: `Product ${item.lotNumber} ligt al meer dan 7 dagen op ${selectedStation} ter reparatie. Graag actie.`,
              type: "alert",
              status: "unread",
              createdAt: serverTimestamp(),
              source: "WorkstationHub",
              relatedLot: item.lotNumber,
            }
          );

          const productRef = doc(
            db,
            ...PATHS.TRACKING,
            item.id || item.lotNumber
          );
          await updateDoc(productRef, {
            reminderSent: true,
            reminderSentAt: serverTimestamp(),
          });
        } catch (err) {
          console.error("Fout bij versturen auto-reminder:", err);
        }
      }
    };
    const timer = setTimeout(checkAndSendReminders, 2000);
    return () => clearTimeout(timer);
  }, [rawProducts, selectedStation]);

  // Bereken Derived Data (Memoized)
  const stationOrders = useMemo(() => {
    if (!selectedStation) return [];
    if (selectedStation === "BM01" || selectedStation === "Station BM01")
      return rawOrders;

    const currentStationNorm = normalizeMachine(selectedStation);
    const orderStats = {};
    rawProducts.forEach((p) => {
      if (!p.orderId) return;
      if (p.status === "rejected" || p.currentStep === "REJECTED") return;

      if (!orderStats[p.orderId])
        orderStats[p.orderId] = { started: 0, finished: 0 };
      orderStats[p.orderId].started++;
      if (p.currentStep === "Finished") orderStats[p.orderId].finished++;
    });

    return rawOrders
      .filter((o) => {
        if (o.status === "cancelled") return false;
        const orderMachineNorm = normalizeMachine(o.machine);
        return (
          o.machine === selectedStation ||
          orderMachineNorm === currentStationNorm
        );
      })
      .map((o) => {
        const stats = orderStats[o.orderId] || { started: 0, finished: 0 };
        return {
          ...o,
          liveToDo: Math.max(0, Number(o.plan || 0) - stats.started),
          liveFinish: stats.finished,
        };
      })
      .sort(
        (a, b) =>
          a.dateObj - b.dateObj ||
          String(a.orderId).localeCompare(String(b.orderId))
      );
  }, [rawOrders, rawProducts, selectedStation]);

  const activeUnitsHere = useMemo(() => {
    if (!selectedStation) return [];
    const currentStationNorm = normalizeMachine(selectedStation);
    return rawProducts.filter((p) => {
      if (p.currentStep === "Finished" || p.currentStep === "REJECTED")
        return false;

      const pMachine = String(p.originMachine || p.currentStation || "");
      const pMachineNorm = normalizeMachine(pMachine);

      if (selectedStation === "Mazak")
        return p.currentStation === "Mazak" || p.currentStation === "MAZAK";
      if (selectedStation === "Nabewerking")
        return (
          p.currentStation === "Nabewerking" || p.currentStation === "NABW"
        );
      if (selectedStation === "BM01" || selectedStation === "Station BM01")
        return p.currentStation === "BM01";

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

  // Handlers
  const handleBack = () => {
    if (onExit) {
      onExit();
    } else {
      navigate("/portal");
    }
  };

  const handleStartProduction = async (
    order,
    customLotNumber,
    stringCount = 1,
    isPrinterEnabled = false,
    selectedLabel = null
  ) => {
    if (!currentUser || !customLotNumber) return;
    try {
      const now = new Date();
      const prefix = customLotNumber.slice(0, -4);
      const startSeq = parseInt(customLotNumber.slice(-4), 10);
      let overflowItems = [];

      for (let i = 0; i < stringCount; i++) {
        const currentSeq = startSeq + i;
        const currentLotNumber = `${prefix}${String(currentSeq).padStart(
          4,
          "0"
        )}`;
        const productRef = doc(
          db,
          ...PATHS.TRACKING,
          currentLotNumber
        );

        const currentStartedCount = rawProducts.filter(
          (p) => p.orderId === order.orderId
        ).length;
        const plannedAmount = Number(order.plan || 0);
        const isOverflow = currentStartedCount + i + 1 > plannedAmount;

        const unitData = {
          lotNumber: currentLotNumber,
          orderId: isOverflow ? "NOG_TE_BEPALEN" : order.orderId,
          item: order.item,
          drawing: order.drawing || "",
          originMachine: selectedStation,
          currentStation: selectedStation,
          currentStep: "Wikkelen",
          status: "in_progress",
          startTime: now.toISOString(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          operator: currentUser.email,
        };
        if (isOverflow) {
          unitData.isOverproduction = true;
          unitData.originalOrderId = order.orderId;
          unitData.note = "Overproductie uit string-run";
          overflowItems.push(currentLotNumber);
        }
        await setDoc(productRef, unitData);
      }

      if (overflowItems.length > 0) {
        await addDoc(
          collection(db, ...PATHS.MESSAGES),
          {
            title: "⚠ Overproductie Melding",
            message: `Op ${selectedStation} zijn ${overflowItems.length} extra producten gemaakt.`,
            type: "warning",
            status: "unread",
            createdAt: serverTimestamp(),
            source: "WorkstationHub",
          }
        );
        alert(
          `Let op: Er zijn ${overflowItems.length} producten meer gemaakt dan gepland.`
        );
      }

      if (order.status !== "completed") {
        await updateDoc(
          doc(db, ...PATHS.PLANNING, order.id),
          {
            status: "in_progress",
            lastUpdated: serverTimestamp(),
          }
        );
      }
      setShowStartModal(false);
    } catch (error) {
      console.error(error);
      alert("Fout bij starten: " + error.message);
    }
  };

  const handleLinkProduct = async (docId, product) => {
    try {
      await updateDoc(
        doc(db, ...PATHS.PLANNING, docId),
        {
          linkedProductId: product.id,
          linkedProductImage: product.imageUrl,
          lastUpdated: new Date(),
        }
      );
      alert("Gekoppeld!");
      setShowLinkModal(false);
      setOrderToLink(null);
    } catch (error) {
      alert("Koppelen mislukt");
    }
  };

  const handlePostProcessingFinish = async (status, data) => {
    if (!itemToFinish) return;
    try {
      const productRef = doc(
        db,
        ...PATHS.TRACKING,
        itemToFinish.id || itemToFinish.lotNumber
      );
      const updates = {
        updatedAt: serverTimestamp(),
        note: data.note || "",
        processedBy: currentUser?.email || "Unknown",
      };

      if (status === "completed") {
        if (selectedStation === "BM01" || selectedStation === "Station BM01") {
          updates.currentStation = "GEREED";
          updates.currentStep = "Finished";
          updates.status = "completed";
        } else {
          updates.currentStation = "BM01";
          updates.currentStep = "Eindinspectie";
        }
      } else if (status === "temp_reject") {
        updates.inspection = {
          status: "Tijdelijke afkeur",
          reasons: data.reasons,
          timestamp: new Date().toISOString(),
        };
        updates.currentStep = "HOLD_AREA";
      } else if (status === "rejected") {
        updates.status = "rejected";
        updates.currentStep = "REJECTED";
        updates.currentStation = "AFKEUR";
        updates.inspection = {
          status: "Afkeur",
          reasons: data.reasons,
          timestamp: new Date().toISOString(),
        };
      }
      await updateDoc(productRef, updates);
      setFinishModalOpen(false);
      setItemToFinish(null);
    } catch (error) {
      console.error("Fout bij afronden:", error);
      alert("Fout bij opslaan.");
    }
  };

  const handleProcessUnit = async (product) => {
    const stationCheck = String(selectedStation).toLowerCase();

    if (
      stationCheck === "nabewerking" ||
      stationCheck === "mazak" ||
      stationCheck === "bm01" ||
      selectedStation === "Station BM01"
    ) {
      setItemToFinish(product);
      setFinishModalOpen(true);
      return;
    }

    try {
      const productRef = doc(
        db,
        ...PATHS.TRACKING,
        product.id || product.lotNumber
      );
      await updateDoc(productRef, {
        currentStep: "Lossen",
        updatedAt: serverTimestamp(),
      });
      setActiveTab("lossen");
    } catch (error) {
      console.error("Fout bij proces:", error);
      alert("Fout bij updaten status");
    }
  };

  const handleOpenProductInfo = async (productId) => {
    try {
      const productSnap = await getDoc(
        doc(db, ...PATHS.PRODUCTS, productId)
      );
      if (productSnap.exists()) {
        setLinkedProductData({ id: productSnap.id, ...productSnap.data() });
      } else {
        alert("Product niet gevonden.");
      }
    } catch (error) {
      console.error(error);
      alert("Fout bij laden.");
    }
  };

  const handleActiveUnitClick = (unit) => {
    const parentOrder = rawOrders.find((o) => o.orderId === unit.orderId);
    if (parentOrder && parentOrder.linkedProductId) {
      handleOpenProductInfo(parentOrder.linkedProductId);
    } else if (unit.originalOrderId) {
      const origOrder = rawOrders.find(
        (o) => o.orderId === unit.originalOrderId
      );
      if (origOrder && origOrder.linkedProductId)
        handleOpenProductInfo(origOrder.linkedProductId);
      else alert(`Geen dossier bij order ${unit.originalOrderId}`);
    } else {
      alert(`Geen dossier gekoppeld aan order ${unit.orderId}`);
    }
  };

  return (
    <div className="flex flex-col w-full h-[100dvh] bg-gray-50/50">
      {/* HEADER */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            {/* Linkerkant: Terug & Titel */}
            <div className="flex items-center">
              <button
                onClick={handleBack}
                className="mr-2 sm:mr-4 px-3 py-1.5 sm:px-4 sm:py-2 bg-white border border-gray-200 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2 font-bold text-[10px] sm:text-xs uppercase tracking-wider"
              >
                <LogOut className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Terug</span>
              </button>
              <span className="text-lg sm:text-xl font-black text-gray-900 italic tracking-tight truncate max-w-[150px] sm:max-w-none">
                {WORKSTATIONS.find((w) => w.id === selectedStation)?.name ||
                  selectedStation}
              </span>
            </div>

            {/* Rechterkant: Navigatie Menu */}
            <div className="flex items-center">
              {/* Desktop Tabs */}
              <nav className="hidden md:flex space-x-1 bg-gray-100 p-1 rounded-xl">
                {!isPostProcessing && (
                  <button
                    onClick={() => setActiveTab("planning")}
                    className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${
                      activeTab === "planning"
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Planning
                  </button>
                )}
                <button
                  onClick={() => setActiveTab("winding")}
                  className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${
                    activeTab === "winding"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {selectedStation === "BM01" ||
                  selectedStation === "Station BM01"
                    ? "Inspectie"
                    : "Productie"}
                </button>
                {!["BM01", "Station BM01", "Mazak", "Nabewerking"].includes(
                  selectedStation
                ) && (
                  <button
                    onClick={() => setActiveTab("lossen")}
                    className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${
                      activeTab === "lossen"
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Lossen
                  </button>
                )}
                <button
                  onClick={() => setActiveTab("terminal")}
                  className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${
                    activeTab === "terminal"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Terminal
                </button>
              </nav>

              {/* Mobiel Hamburger Menu */}
              <div className="md:hidden relative ml-2">
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-2 bg-gray-100 rounded-lg text-gray-600 active:bg-gray-200"
                >
                  {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>

                {isMobileMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-200 p-2 flex flex-col gap-1 z-50 animate-in slide-in-from-top-2">
                    {!isPostProcessing && (
                      <button
                        onClick={() => {
                          setActiveTab("planning");
                          setIsMobileMenuOpen(false);
                        }}
                        className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${
                          activeTab === "planning"
                            ? "bg-blue-50 text-blue-600"
                            : "text-gray-500"
                        }`}
                      >
                        Planning
                      </button>
                    )}
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
                      {selectedStation === "BM01" ||
                      selectedStation === "Station BM01"
                        ? "Inspectie"
                        : "Productie"}
                    </button>
                    {!["BM01", "Station BM01", "Mazak", "Nabewerking"].includes(
                      selectedStation
                    ) && (
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
                        Lossen
                      </button>
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
                      Terminal
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-y-auto w-full p-2 sm:p-6 lg:p-8">
        {loading ? (
          <div className="flex flex-col justify-center items-center h-full">
            <Loader2 className="animate-spin rounded-full h-12 w-12 text-blue-600 mb-4" />
          </div>
        ) : (
          <>
            {activeTab === "planning" && (
              <PlanningListView
                stationOrders={stationOrders}
                selectedStation={selectedStation}
                onStartProduction={(o) => {
                  setSelectedOrder(o);
                  setShowStartModal(true);
                }}
                onLinkOrder={(o) => {
                  setOrderToLink(o);
                  setShowLinkModal(true);
                }}
                onOpenInfo={handleOpenProductInfo}
              />
            )}
            {activeTab === "winding" && (
              <ActiveProductionView
                activeUnits={activeUnitsHere}
                smartSuggestions={isPostProcessing ? [] : []}
                selectedStation={selectedStation}
                onProcessUnit={handleProcessUnit}
                onClickUnit={handleActiveUnitClick}
              />
            )}
            {activeTab === "lossen" && (
              <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <LossenView
                  currentUser={currentUser}
                  products={rawProducts}
                  currentStation={selectedStation}
                  stationId={selectedStation}
                  appId={currentAppId}
                />
              </div>
            )}
            {activeTab === "terminal" && (
              <div className="h-full">
                <Terminal
                  currentUser={currentUser}
                  initialStation={selectedStation}
                  products={rawProducts}
                  onBack={() => setActiveTab("planning")}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* MODALS */}
      <ProductionStartModal
        order={selectedOrder}
        isOpen={showStartModal}
        onClose={() => setShowStartModal(false)}
        onStart={handleStartProduction}
        stationId={selectedStation}
        existingProducts={rawProducts}
        onOpenProductInfo={handleOpenProductInfo}
      />
      {linkedProductData && (
        <ProductDetailModal
          product={linkedProductData}
          onClose={() => setLinkedProductData(null)}
          userRole={currentUser?.role || "operator"}
        />
      )}
      {showLinkModal && orderToLink && (
        <OperatorLinkModal
          order={orderToLink}
          onClose={() => {
            setShowLinkModal(false);
            setOrderToLink(null);
          }}
          onLinkProduct={handleLinkProduct}
        />
      )}
      {finishModalOpen && itemToFinish && (
        <PostProcessingFinishModal
          product={itemToFinish}
          onClose={() => {
            setFinishModalOpen(false);
            setItemToFinish(null);
          }}
          onConfirm={handlePostProcessingFinish}
          currentStation={selectedStation}
        />
      )}
    </div>
  );
};

export default WorkstationHub;
