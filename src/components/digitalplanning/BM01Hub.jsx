import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Search, FileText, Layers, Calendar, ClipboardCheck, History, Package, ChevronLeft, ChevronRight, CheckCircle2, Printer, X, Download, ScanBarcode } from "lucide-react";
import { format, isValid, isSameDay, subDays, addDays, startOfISOWeek, endOfISOWeek, isWithinInterval } from "date-fns";
import { nl } from "date-fns/locale";
import OrderDetail from "./OrderDetail";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";
import ProductDossierModal from "./modals/ProductDossierModal";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs, setDoc, deleteDoc, onSnapshot, arrayUnion } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import StatusBadge from "./common/StatusBadge";

const BM01Hub = React.memo(({ orders = [], products = [], onMoveLot }) => {
    const { t } = useTranslation();
    const { user } = useAdminAuth();
  // AANGEPAST: Standaard view op 'inspectie' (Aan te bieden)
  const [activeTab, setActiveTab] = useState("inspectie");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [viewingDossier, setViewingDossier] = useState(null);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [archivedProducts, setArchivedProducts] = useState([]);
  const [viewMode, setViewMode] = useState("day"); // 'day' or 'week'
  
  const [scanInput, setScanInput] = useState("");
  const scanInputRef = useRef(null);

  // Auto-focus logic voor scanner
  useEffect(() => {
    const handleClick = (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(e.target.tagName)) return;
        
        if (activeTab === "inspectie" && !showFinishModal && !viewingDossier && !selectedOrder) {
            scanInputRef.current?.focus();
        }
    };
    
    if (activeTab === "inspectie") {
        scanInputRef.current?.focus();
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [activeTab, showFinishModal, viewingDossier, selectedOrder]);

  const handleScan = (e) => {
    if (e.key === 'Enter') {
        const code = scanInput.trim();
        if (!code) return;
        
        const found = bm01Products.find(i => 
            (i.lotNumber || "").toLowerCase() === code.toLowerCase() || 
            (i.orderId || "").toLowerCase() === code.toLowerCase()
        );
        
        if (found) {
            handleItemClick(found);
            setScanInput("");
        } else {
            alert(`Item ${code} niet gevonden in de lijst 'Aan te bieden'.`);
            setScanInput("");
        }
    }
  };

  const filteredOrders = useMemo(() => {
    let res = orders;
    // Filter afgeronde/geannuleerde orders eruit voor de actieve planning
    res = res.filter(o => o.status !== "completed" && o.status !== "cancelled");

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      res = res.filter(o => 
        (o.orderId || "").toLowerCase().includes(lower) || 
        (o.item || "").toLowerCase().includes(lower) ||
        (o.machine || "").toLowerCase().includes(lower) ||
        (o.itemCode || "").toLowerCase().includes(lower) // Zoeken op Manufactured Item
      );
    }
    
    // Sorteer: Urgentie eerst, dan leverdatum
    return res.sort((a, b) => {
        if (a.isUrgent && !b.isUrgent) return -1;
        if (!a.isUrgent && b.isUrgent) return 1;
        
        const dateA = a.deliveryDate?.toDate ? a.deliveryDate.toDate() : new Date(a.deliveryDate || 0);
        const dateB = b.deliveryDate?.toDate ? b.deliveryDate.toDate() : new Date(b.deliveryDate || 0);
        
        return dateA - dateB;
    });
  }, [orders, searchTerm]);

  // Filter producten specifiek voor BM01 (Aan te bieden tab)
  // Dit zorgt ervoor dat items met stap 'Eindinspectie' of station 'BM01' correct worden doorgegeven
  const bm01Products = useMemo(() => {
    return products.filter(p => {
        const station = (p.currentStation || "").toUpperCase().replace(/\s/g, "");
        const step = (p.currentStep || "").toUpperCase();
        
        // Ruimere matching voor BM01/Inspectie
        const isMatch = station.includes("BM01") || step.includes("INSPECTIE") || step === "EINDINSPECTIE" || step === "BM01" || step === "BM01";
        
        const isRejected = p.status === "rejected" || p.currentStep === "REJECTED";
        const isFinished = p.currentStep === "Finished" || station === "GEREED";
        
        return isMatch && !isFinished && !isRejected;
    });
  }, [products]);

  // Fetch archived products for selected date
  useEffect(() => {
    if (activeTab !== "completed") return;

    const year = selectedDate.getFullYear();
    let start, end;

    if (viewMode === "day") {
        start = new Date(selectedDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(selectedDate);
        end.setHours(23, 59, 59, 999);
    } else {
        start = startOfISOWeek(selectedDate);
        start.setHours(0, 0, 0, 0);
        end = endOfISOWeek(selectedDate);
        end.setHours(23, 59, 59, 999);
    }

    // Luister naar de archief collectie voor de geselecteerde periode
    const archiveRef = collection(db, "future-factory", "production", "archive", String(year), "items");
    const q = query(
        archiveRef,
        where("timestamps.finished", ">=", start),
        where("timestamps.finished", "<=", end)
    );

    const unsub = onSnapshot(q, (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setArchivedProducts(items);
    }, (err) => {
        console.error("Fout bij ophalen archief:", err);
    });

    return () => unsub();
  }, [selectedDate, activeTab, viewMode]);

  // Filter producten die gereed zijn (Aangeboden tab) op basis van geselecteerde datum
  // Combineert actieve producten (die nog niet gearchiveerd zijn) en gearchiveerde producten
  const completedProducts = useMemo(() => {
    const activeFinished = products.filter(p => {
        const isFinished = p.status === 'completed' || p.currentStep === 'Finished' || p.currentStation === 'GEREED';
        if (!isFinished) return false;

        // Bepaal datum van afronding
        let finishDate = null;
        if (p.timestamps?.finished) {
            finishDate = p.timestamps.finished.toDate ? p.timestamps.finished.toDate() : new Date(p.timestamps.finished);
        } else if (p.updatedAt) {
            finishDate = p.updatedAt.toDate ? p.updatedAt.toDate() : new Date(p.updatedAt);
        }

        if (!finishDate) return false;

        if (viewMode === "day") {
            return isSameDay(finishDate, selectedDate);
        } else {
            const start = startOfISOWeek(selectedDate);
            const end = endOfISOWeek(selectedDate);
            return isWithinInterval(finishDate, { start, end });
        }
    });

    // Combineer met gearchiveerde producten (voorkom dubbelen op ID)
    const combined = [...activeFinished];
    archivedProducts.forEach(archived => {
        if (!combined.some(p => p.id === archived.id)) {
            combined.push(archived);
        }
    });

    return combined.sort((a, b) => {
        const tA = a.timestamps?.finished?.seconds || a.updatedAt?.seconds || 0;
        const tB = b.timestamps?.finished?.seconds || b.updatedAt?.seconds || 0;
        return tB - tA;
    });
  }, [products, archivedProducts, selectedDate, viewMode]);

  const handleItemClick = (item) => {
    setSelectedProduct(item);
    setShowFinishModal(true);
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
    setShowFinishModal(false);
  };

  const handlePostProcessingFinish = async (status, data) => {
    if (!selectedProduct) return;
    
    try {
      const productRef = doc(db, ...PATHS.TRACKING, selectedProduct.id || selectedProduct.lotNumber);
      
      const updates = {
        updatedAt: serverTimestamp(),
        note: data.note || "",
        processedBy: user?.email || "Unknown",
      };
      
      // Maak history entry aan voor de laatste stap
      const historyEntry = {
          action: status === "completed" ? "Stap Voltooid" : (status === "temp_reject" ? "Tijdelijke Afkeur" : "Definitieve Afkeur"),
          timestamp: new Date().toISOString(),
          user: user?.email || "Operator",
          station: "BM01",
          details: status === "completed" ? "Eindinspectie voltooid & Aangeboden" : `Reden: ${data.reasons?.join(", ")}`
      };

      if (status === "completed") {
          updates.currentStation = "GEREED";
          updates.currentStep = "Finished";
          updates.status = "completed";
          // AANGEPAST: lastStation instellen zodat KPI's correct tellen dat het van BM01 kwam
          updates.lastStation = "BM01";
          updates["timestamps.finished"] = serverTimestamp();

          // ARCHIVERING LOGICA
          const year = new Date().getFullYear();
          const archiveRef = doc(db, "future-factory", "production", "archive", String(year), "items", selectedProduct.id || selectedProduct.lotNumber);
          
          // Voeg updates toe aan het product object voor archivering
          const finalData = { 
              ...selectedProduct, 
              ...updates,
              // Zorg dat timestamps correct zijn (serverTimestamp werkt niet direct in object copy, dus gebruik new Date() voor archief)
              updatedAt: new Date(),
              timestamps: {
                  ...selectedProduct.timestamps,
                  finished: new Date()
              },
              // Voeg de laatste historie stap toe aan de array (belangrijk voor archief!)
              history: [...(selectedProduct.history || []), historyEntry]
          };

          // 1. Sla op in archief
          await setDoc(archiveRef, finalData);
          
          // 2. Verwijder uit actieve tracking
          await deleteDoc(productRef);

          handleCloseModal();
          return; // Stop hier, want product bestaat niet meer in tracking
      } else if (status === "temp_reject") {
        // Voeg history toe aan updates voor updateDoc
        updates.history = arrayUnion(historyEntry);
        
        updates.inspection = {
          status: "Tijdelijke afkeur",
          reasons: data.reasons,
          timestamp: new Date().toISOString(),
        };
        updates.currentStep = "HOLD_AREA";
      } else if (status === "rejected") {
        // Voeg history toe aan updates voor updateDoc
        updates.history = arrayUnion(historyEntry);
        
        updates.status = "rejected";
        updates.currentStep = "REJECTED";
        updates.currentStation = "AFKEUR";
        updates.inspection = {
          status: "Afkeur",
          reasons: data.reasons,
          timestamp: new Date().toISOString(),
        };
        
        // Update order teller bij definitieve afkeur
        if (selectedProduct.orderId && selectedProduct.orderId !== "NOG_TE_BEPALEN") {
             try {
                const orderQuery = query(
                  collection(db, ...PATHS.PLANNING),
                  where("orderId", "==", selectedProduct.orderId)
                );
                const orderSnap = await getDocs(orderQuery);
                
                if (!orderSnap.empty) {
                  const orderDoc = orderSnap.docs[0];
                  const orderData = orderDoc.data();
                  const originStation = selectedProduct.originMachine || selectedProduct.currentStation;
                  const stationField = `started_${(originStation || "").replace(/[^a-zA-Z0-9]/g, '_')}`;
                  const currentStarted = orderData[stationField] || 0;
                  
                  if (currentStarted > 0) {
                    await updateDoc(doc(db, ...PATHS.PLANNING, orderDoc.id), {
                      [stationField]: currentStarted - 1,
                    });
                  }
                }
              } catch (err) {
                console.error("Fout bij updaten order teller:", err);
              }
        }
      }

      await updateDoc(productRef, updates);
      handleCloseModal();
    } catch (error) {
      console.error("Fout bij afronden:", error);
    }
  };

  const handleExport = () => {
      if (completedProducts.length === 0) return;
      
      const headers = ["Order", "Lot", "Item", "Item Code", "Gereed Datum", "Tijd"];
      const rows = completedProducts.map(p => {
          const date = p.timestamps?.finished?.toDate ? p.timestamps.finished.toDate() : new Date(p.timestamps?.finished || p.updatedAt);
          return [
              p.orderId || "",
              p.lotNumber || "",
              `"${(p.item || "").replace(/"/g, '""')}"`,
              p.itemCode || "",
              format(date, "yyyy-MM-dd"),
              format(date, "HH:mm")
          ];
      });
      
      const csvContent = "data:text/csv;charset=utf-8," 
          + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
          
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `bm01_export_${viewMode}_${format(selectedDate, "yyyy-MM-dd")}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleAddQcNote = async (noteText) => {
      if (!viewingDossier || !noteText.trim()) return;
      
      try {
          const product = viewingDossier;
          let ref;
          
          // Check of het product in het archief zit (op basis van ID in de geladen archivedProducts lijst)
          const isArchived = archivedProducts.some(p => p.id === product.id);
          
          if (isArchived) {
              // Bepaal jaar voor archief pad
              const date = product.timestamps?.finished?.toDate ? product.timestamps.finished.toDate() : new Date(product.timestamps?.finished || product.updatedAt);
              const year = date.getFullYear();
              ref = doc(db, "future-factory", "production", "archive", String(year), "items", product.id);
          } else {
              // Actieve tracking
              ref = doc(db, ...PATHS.TRACKING, product.id);
          }

          const noteObj = {
              text: noteText,
              timestamp: new Date().toISOString(),
              user: user?.email || "BM01 Operator"
          };

          await updateDoc(ref, {
              qcNotes: arrayUnion(noteObj)
          });
          
          // Update lokale state voor directe feedback in de modal
          setViewingDossier(prev => ({
              ...prev,
              qcNotes: [...(prev.qcNotes || []), noteObj]
          }));
      } catch (err) {
          console.error("Fout bij opslaan notitie:", err);
          alert("Kon rapport niet opslaan: " + err.message);
      }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in">
      {/* Custom Tabs Header voor BM01 */}
      <div className="p-2 bg-white border-b border-slate-200 shrink-0 shadow-sm">
        <div className="flex justify-center overflow-x-auto">
            <div className="flex bg-slate-100 p-1 rounded-2xl w-full max-w-2xl min-w-[320px]">
                <button 
                    onClick={() => setActiveTab("planning")}
                    className={`flex-1 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "planning" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                    {t('bm01.planning_total')}
                </button>
                <button 
                    onClick={() => setActiveTab("inspectie")}
                    className={`flex-1 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "inspectie" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                    {t('bm01.to_offer')}
                </button>
                <button 
                    onClick={() => setActiveTab("completed")}
                    className={`flex-1 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "completed" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                    {t('bm01.offered')}
                </button>
            </div>
        </div>
      </div>

      <style>{`
        @keyframes scan-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.7); }
          50% { box-shadow: 0 0 0 10px rgba(168, 85, 247, 0); }
        }
        @keyframes pulse-text {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .scan-pulse-bm01 {
          animation: scan-pulse 2s infinite;
        }
        .pulse-text-bm01 {
          animation: pulse-text 1.5s ease-in-out infinite;
        }
      `}</style>
      <div className="flex-1 overflow-hidden relative">
        {activeTab === "planning" ? (
            <div className="h-full flex flex-col p-4 max-w-6xl mx-auto w-full">
                <div className="relative mb-4 shrink-0">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                            type="text" 
                            placeholder={t('bm01.search_placeholder', 'Zoek op order, item, code of machine...')} 
                            className="w-full pl-14 pr-6 py-4 rounded-2xl border-2 border-slate-200 font-bold text-slate-700 focus:border-blue-500 outline-none shadow-sm transition-all"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                    {filteredOrders.length === 0 ? (
                        <div className="text-center py-20 opacity-40">
                            <Layers size={64} className="mx-auto mb-4 text-slate-300" />
                            <p className="font-black uppercase tracking-widest text-slate-400">{t('bm01.no_orders', 'Geen orders gevonden')}</p>
                        </div>
                    ) : (
                        filteredOrders.map(order => {
                            // Robust date parsing for Excel imports
                            let dDate = null;
                            const rawDate = order.deliveryDate;
                            if (rawDate) {
                                if (rawDate.toDate) dDate = rawDate.toDate();
                                else if (!isNaN(rawDate) && Number(rawDate) > 30000 && Number(rawDate) < 100000) {
                                    dDate = new Date(Math.round((Number(rawDate) - 25569) * 86400 * 1000));
                                } else {
                                    dDate = new Date(rawDate);
                                }
                            }
                            const plan = Number(order.plan || 0);
                            const produced = products.filter(p => p.orderId === order.orderId).length;
                            const remaining = Math.max(0, plan - produced);

                            return (
                                <div 
                                    key={order.id} 
                                    onClick={() => setSelectedOrder(order)}
                                    className="bg-white p-5 rounded-[25px] border border-slate-100 shadow-sm hover:shadow-md transition-all flex justify-between items-center group cursor-pointer"
                                >
                                    <div className="flex items-center gap-5 overflow-hidden">
                                        <div className={`p-4 rounded-2xl shrink-0 ${order.isUrgent ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                            <FileText size={24} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-black text-lg text-slate-800 tracking-tight">{order.orderId}</h4>
                                                <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg font-black uppercase tracking-wider border border-slate-200">
                                                    {order.machine || t('common.unknown', 'Onbekend')}
                                                </span>
                                                <StatusBadge status={order.status} />
                                                {order.isUrgent && <span className="text-[9px] bg-red-100 text-red-600 px-2 py-0.5 rounded-lg font-black uppercase tracking-wider">{t('bm01.urgent', 'SPOED')}</span>}
                                            </div>
                                            <p className="text-xs text-slate-500 font-bold uppercase truncate">{order.item}</p>
                                            {order.itemCode && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{order.itemCode}</p>}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0 pl-4 border-l border-slate-100 ml-4">
                                        <span className="block text-xl font-black text-slate-900">{plan} <span className="text-xs text-slate-400 font-bold">{t('bm01.st', 'ST')}</span></span>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mt-1">
                                            {t('bm01.remaining', 'Nog')}: <span className="text-slate-700">{remaining}</span>
                                        </span>
                                        <div className="flex items-center justify-end gap-1.5 mt-2 text-slate-400">
                                            <Calendar size={12} />
                                            <span className="text-[10px] font-bold uppercase">
                                                {isValid(dDate) ? format(dDate, "dd MMM", { locale: nl }) : t('bm01.no_date', 'Geen datum')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        ) : activeTab === "inspectie" ? (
            <div className="h-full w-full">
                <div className="h-full flex flex-col p-4 max-w-6xl mx-auto w-full overflow-y-auto custom-scrollbar space-y-3">
                    {/* Scan Indicator & Input */}
                    <div className="shrink-0 space-y-2 mb-4">
                        {/* Indicator Label */}
                        <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 rounded-lg border border-purple-100 w-fit">
                            <div className="w-2 h-2 bg-purple-500 rounded-full pulse-text-bm01"></div>
                            <span className="text-xs font-black text-purple-600 uppercase tracking-widest">
                                🔍 {t('bm01.ready_for_inspection_scan', 'Klaar voor inspectie scan')}
                            </span>
                        </div>
                        {/* Scan Input */}
                        <div className="relative">
                            <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-500 transition-all scan-pulse-bm01" size={24} />
                            <input
                                ref={scanInputRef}
                                type="text"
                                value={scanInput}
                                onChange={(e) => setScanInput(e.target.value)}
                                onKeyDown={handleScan}
                                placeholder="Scan lotnummer voor inspectie..."
                                className="w-full pl-14 pr-4 py-4 bg-white border-2 border-purple-100 focus:border-purple-500 focus:ring-2 focus:ring-purple-300 rounded-2xl font-bold text-lg shadow-sm outline-none transition-all placeholder:text-slate-300"
                                autoFocus
                            />
                        </div>
                    </div>

                    {bm01Products.length === 0 ? (
                        <div className="text-center py-20 opacity-40">
                            <Package size={64} className="mx-auto mb-4 text-slate-300" />
                            <p className="font-black uppercase tracking-widest text-slate-400">{t('bm01.no_items_inspect')}</p>
                        </div>
                    ) : (
                        bm01Products.map(item => (
                            <div 
                                key={item.id}
                                className="bg-white p-5 rounded-[25px] border border-slate-100 shadow-sm hover:shadow-md transition-all flex justify-between items-center group"
                            >
                                <div className="flex items-center gap-5 overflow-hidden">
                                    <div className="p-4 rounded-2xl shrink-0 bg-purple-50 text-purple-600">
                                        <ClipboardCheck size={24} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-black text-lg text-slate-800 tracking-tight">{item.lotNumber}</h4>
                                            <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg font-black uppercase tracking-wider border border-slate-200">
                                                {item.orderId}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 font-bold uppercase truncate">{item.item}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <History size={10} className="text-slate-400" />
                                            <span className="text-[10px] text-slate-400 font-bold uppercase">
                                                {t('bm01.from')}: {item.lastStation || t('common.unknown')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right shrink-0 pl-4 border-l border-slate-100 ml-4">
                                    <button
                                        onClick={() => handleItemClick(item)}
                                        className="px-6 py-3 bg-purple-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-purple-700 transition-all shadow-lg active:scale-95"
                                    >
                                        {t('bm01.report_ready')}
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        ) : (
            /* AANGEBODEN / GEREED TAB */
            <div className="h-full flex flex-col p-4 max-w-6xl mx-auto w-full">
                {/* Datum Navigatie */}
                <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-4">
                    <div className="flex items-center bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                        <button onClick={() => setSelectedDate(d => viewMode === 'day' ? subDays(d, 1) : subDays(d, 7))} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500">
                            <ChevronLeft size={20} />
                        </button>
                        <div className="flex items-center gap-2 px-4 min-w-[200px] justify-center">
                            <Calendar size={16} className="text-emerald-500" />
                            <span className="font-black text-slate-700 uppercase tracking-wide text-xs">
                                {viewMode === 'day' 
                                    ? format(selectedDate, "EEEE d MMMM", { locale: nl })
                                    : `Week ${format(selectedDate, "w")} (${format(startOfISOWeek(selectedDate), "d MMM")} - ${format(endOfISOWeek(selectedDate), "d MMM")})`
                                }
                            </span>
                        </div>
                        <button onClick={() => setSelectedDate(d => viewMode === 'day' ? addDays(d, 1) : addDays(d, 7))} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                    
                    <div className="flex gap-2">
                        <div className="flex bg-white p-1 rounded-xl border border-slate-100 shadow-sm">
                            <button 
                                onClick={() => setViewMode("day")}
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === "day" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                            >
                                {t('bm01.day')}
                            </button>
                            <button 
                                onClick={() => setViewMode("week")}
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === "week" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                            >
                                {t('bm01.week')}
                            </button>
                        </div>

                        <button 
                            onClick={handleExport}
                            className="p-3 bg-white hover:bg-emerald-50 text-emerald-600 border border-slate-100 rounded-xl transition-colors shadow-sm"
                            title="Export CSV"
                        >
                            <Download size={20} />
                        </button>
                        
                        <button 
                            onClick={() => setShowPrintModal(true)}
                            className="p-3 bg-white hover:bg-blue-50 text-blue-600 border border-slate-100 rounded-xl transition-colors shadow-sm"
                            title="Print QR Overzicht"
                        >
                            <Printer size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
                    {completedProducts.length === 0 ? (
                        <div className="text-center py-20 opacity-40">
                            <CheckCircle2 size={64} className="mx-auto mb-4 text-slate-300" />
                            <p className="font-black uppercase tracking-widest text-slate-400">{t('bm01.no_offered_items')}</p>
                        </div>
                    ) : (
                        completedProducts.map(item => (
                            <div key={item.id} className="bg-white p-5 rounded-[25px] border border-slate-100 shadow-sm flex justify-between items-center opacity-75 hover:opacity-100 transition-opacity">
                                <div className="flex items-center gap-5">
                                    <div className="p-4 rounded-2xl shrink-0 bg-emerald-50 text-emerald-600">
                                        <CheckCircle2 size={24} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-black text-lg text-slate-800 tracking-tight">{item.lotNumber}</h4>
                                            <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg font-black uppercase tracking-wider border border-slate-200">
                                                {item.orderId}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 font-bold uppercase truncate">{item.item}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] text-emerald-600 font-bold uppercase">
                                                Gereedgemeld om {item.timestamps?.finished ? format(item.timestamps.finished.toDate ? item.timestamps.finished.toDate() : new Date(item.timestamps.finished), "HH:mm") : "--:--"}
                                            </span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setViewingDossier(item);
                                                }}
                                                className="ml-4 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors"
                                            >
                                                <FileText size={12} /> {t('bm01.dossier')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )}
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-5xl h-[85vh] rounded-[40px] shadow-2xl overflow-hidden flex flex-col">
                <OrderDetail 
                    order={selectedOrder}
                    products={products}
                    onClose={() => setSelectedOrder(null)}
                    showAllStations={true}
                    onMoveLot={onMoveLot}
                    isManager={true}
                />
            </div>
        </div>
      )}

      {showFinishModal && selectedProduct && (
        <PostProcessingFinishModal
            product={selectedProduct}
            onClose={handleCloseModal}
            onConfirm={handlePostProcessingFinish}
            currentStation="BM01"
        />
      )}

      {viewingDossier && (
        <ProductDossierModal
            isOpen={true}
            product={viewingDossier}
            onClose={() => setViewingDossier(null)}
            onAddNote={handleAddQcNote}
            orders={orders}
            onMoveLot={onMoveLot}
        />
      )}

      {/* PRINT / SCAN MODAL */}
      {showPrintModal && (
        <div className="fixed inset-0 z-[200] bg-white overflow-y-auto animate-in fade-in">
            <div className="p-8 max-w-4xl mx-auto print:p-0 print:max-w-none">
                {/* Header - Hidden on Print */}
                <div className="flex justify-between items-center mb-8 print:hidden">
                    <div>
                        <h2 className="text-2xl font-black uppercase italic text-slate-900">{t('bm01.daily_overview')}</h2>
                        <p className="text-slate-500 font-bold">{format(selectedDate, "EEEE d MMMM yyyy", { locale: nl })}</p>
                    </div>
                    <div className="flex gap-4">
                        <button 
                            onClick={() => window.print()}
                            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 shadow-lg"
                        >
                            <Printer size={16} /> {t('bm01.print_pdf')}
                        </button>
                        <button 
                            onClick={() => setShowPrintModal(false)}
                            className="p-3 hover:bg-slate-100 rounded-xl text-slate-500"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Print Header - Visible only on Print */}
                <div className="hidden print:block mb-8 border-b-2 border-slate-900 pb-4">
                    <h1 className="text-2xl font-black uppercase">{t('bm01.daily_overview_offered')}</h1>
                    <p className="text-lg">{format(selectedDate, "EEEE d MMMM yyyy", { locale: nl })}</p>
                </div>

                {/* Content */}
                <div className="space-y-6 print:space-y-0 print:grid print:grid-cols-2 print:gap-x-4 print:gap-y-2 print:content-start">
                    {completedProducts.length === 0 ? (
                        <p className="text-center text-slate-400 italic py-10">{t('bm01.no_products_date')}</p>
                    ) : (
                        completedProducts.map((item, index) => (
                            <div key={item.id} className="border-b border-slate-200 pb-6 mb-6 break-inside-avoid print:border print:border-slate-300 print:p-2 print:mb-0 print:rounded-lg print:pb-1 print:break-inside-avoid">
                                <div className="flex justify-between items-start mb-4 print:mb-1">
                                    <div className="min-w-0 overflow-hidden">
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs font-black text-slate-400 uppercase print:text-[8px]">#{index + 1}</span>
                                            <span className="hidden print:inline text-[8px] font-bold text-slate-500 truncate">{item.itemCode}</span>
                                        </div>
                                        <h3 className="text-xl font-black text-slate-900 print:text-xs print:leading-tight truncate">{item.item}</h3>
                                        <p className="text-sm text-slate-500 font-bold print:hidden">{item.itemCode}</p>
                                    </div>
                                    <div className="text-right shrink-0 ml-1">
                                        <span className="block text-sm font-bold text-slate-900 print:text-[8px]">{item.timestamps?.finished ? format(item.timestamps.finished.toDate ? item.timestamps.finished.toDate() : new Date(item.timestamps.finished), "HH:mm") : "--:--"}</span>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-8 print:gap-2">
                                    {/* Order QR */}
                                    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 print:border-0 print:bg-transparent print:p-0 print:gap-2">
                                        <img 
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${item.orderId}`} 
                                            alt={`QR Order ${item.orderId}`}
                                            className="w-24 h-24 mix-blend-multiply print:w-10 print:h-10"
                                        />
                                        <div className="min-w-0 overflow-hidden">
                                            <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest print:hidden">{t('bm01.order_number')}</span>
                                            <span className="block text-xl font-black font-mono text-slate-900 print:text-[10px] truncate">{item.orderId}</span>
                                        </div>
                                    </div>

                                    {/* Lot QR */}
                                    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 print:border-0 print:bg-transparent print:p-0 print:gap-2">
                                        <img 
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${item.lotNumber}`} 
                                            alt={`QR Lot ${item.lotNumber}`}
                                            className="w-24 h-24 mix-blend-multiply print:w-10 print:h-10"
                                        />
                                        <div className="min-w-0 overflow-hidden">
                                            <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest print:hidden">{t('bm01.lot_number')}</span>
                                            <span className="block text-xl font-black font-mono text-slate-900 break-all print:text-[10px] truncate">{item.lotNumber}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
});

export default BM01Hub;
