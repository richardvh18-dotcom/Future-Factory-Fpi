import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Layers, Calendar, ClipboardCheck, History, Package, ChevronLeft, ChevronRight, CheckCircle2, Printer, X, Download, ScanBarcode, Keyboard } from "lucide-react";
import { format, isValid, isSameDay, subDays, addDays, startOfISOWeek, endOfISOWeek, isWithinInterval } from "date-fns";
import { nl } from "date-fns/locale";
import QRCode from "qrcode";
import OrderDetail from "./OrderDetail";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";
import ProductDossierModal from "./modals/ProductDossierModal";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { collection, query, where, getDocs, onSnapshot, limit } from "firebase/firestore";
import { db, logActivity } from "../../config/firebase";
import { PATHS, getArchiveItemsPath } from "../../config/dbPaths";
import { rejectTrackedProductFinal, completeTrackedProduct, tempRejectTrackedProduct, appendQcNote } from "../../services/planningSecurityService";
import { getStartedCounterField } from "../../utils/hubHelpers";
import InternalQrImage from "../../utils/InternalQrImage";
import PlanningSidebar from "./PlanningSidebar";
import { useNotifications } from '../../contexts/NotificationContext';

const QR_CODE_OK_CONFIRMATION = 'FPI-ACTION-APPROVE-OK';

const escapeHtml = (value) =>
    String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

const BM01Hub = React.memo(({ orders = [], products = [], onMoveLot }) => {
    const { t } = useTranslation();
    const { user } = useAdminAuth();
  // AANGEPAST: Standaard view op 'inspectie' (Aan te bieden)
  const { notify } = useNotifications();
  const [activeTab, setActiveTab] = useState("inspectie");
    const [selectedOrderId, setSelectedOrderId] = useState(null);
    const [selectedSidebarEntry, setSelectedSidebarEntry] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [viewingDossier, setViewingDossier] = useState(null);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [archivedProducts, setArchivedProducts] = useState([]);
  const [viewMode, setViewMode] = useState("day"); // 'day' or 'week'
  
  const [scanInput, setScanInput] = useState("");
  const [scannerMode, setScannerMode] = useState(true);
  const scanInputRef = useRef(null);
  const selectedProductRef = useRef(null); // Ref voor race-condition preventie

    const focusScanInput = () => {
        const input = scanInputRef.current;
        if (!input) return;
        input.focus({ preventScroll: true });
    };

    const scheduleScanFocus = () => {
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(() => {
                focusScanInput();
                setTimeout(focusScanInput, 0);
            });
            return;
        }
        setTimeout(focusScanInput, 0);
    };

  // Sync ref met state
  useEffect(() => {
    selectedProductRef.current = selectedProduct;
  }, [selectedProduct]);

  // Auto-focus logic voor scanner
    useEffect(() => {
        if (!scannerMode) return;
        // Focus direct bij laden of als scannerMode aan gaat
        scheduleScanFocus();
        // Ook bij click buiten input, behalve op interactieve elementen
        const handleClick = (e) => {
            const target = e?.target;
            if (!target) return;
            if (target.closest?.('input, textarea, select, button, a, [role="button"], [contenteditable="true"], [data-scan-ignore]')) return;
            if (activeTab === "inspectie" && !showFinishModal && !viewingDossier && !selectedOrderId) {
                scheduleScanFocus();
            }
        };
        const handleWindowFocus = () => {
            if (activeTab === "inspectie" && !showFinishModal && !viewingDossier && !selectedOrderId) {
                scheduleScanFocus();
            }
        };
        document.addEventListener('click', handleClick);
        window.addEventListener('focus', handleWindowFocus);
        return () => {
            document.removeEventListener('click', handleClick);
            window.removeEventListener('focus', handleWindowFocus);
        };
    }, [activeTab, showFinishModal, viewingDossier, selectedOrderId, scannerMode]);

    // Focus scanveld bij eerste render (ook als scannerMode uit staat)
    useEffect(() => {
        scheduleScanFocus();
    }, []);

    const handleScan = async (e) => {
        if (e.key === 'Enter') {
            const code = scanInput.trim().toUpperCase();
            if (!code) return;

            // Debug: log scan
            console.debug('[BM01] Scan ontvangen:', code, 'selectedProduct:', selectedProduct);

            // Goedkeuren met QR-code (OK QR)
            if (code === QR_CODE_OK_CONFIRMATION && selectedProduct) {
                setScanInput("");
                await handlePostProcessingFinish('completed', { note: 'Goedgekeurd via QR Scan' }, selectedProduct);
                return;
            }

            // Zoek product op lotnummer
            const found = bm01Products.find(i => (i.lotNumber || "").toUpperCase() === code);
            if (found) {
                setSelectedProduct(found);
                setShowFinishModal(true); // Direct popup openen
                setScanInput("");
                // Debug: log gevonden product
                console.debug('[BM01] Product gevonden en popup geopend:', found);
            } else {
                notify(`Item ${code} niet gevonden in de lijst 'Aan te bieden'.`);
                setScanInput("");
                setSelectedProduct(null);
            }
            // Na scan altijd weer focus op het scanveld
            setTimeout(() => {
                scheduleScanFocus();
            }, 50);
        }
    };

    const planningOrders = useMemo(() => {
        return (orders || []).filter(o => o.status !== "completed" && o.status !== "cancelled");
    }, [orders]);

    const selectedOrder = useMemo(() => {
        if (!selectedOrderId) return null;
        return planningOrders.find((o) => o.id === selectedOrderId || o.orderId === selectedOrderId);
    }, [planningOrders, selectedOrderId]);

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

    const handleSidebarSelect = async (entry) => {
        if (!entry) {
            setSelectedOrderId(null);
            setSelectedSidebarEntry(null);
            return;
        }

        const entryOrderId = String(entry.orderId || entry.id || "").trim();
        if (!entryOrderId) return;
        setSelectedSidebarEntry(entry);

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

            setSelectedSidebarEntry({
                ...entry,
                status: "completed",
                archived: true,
                isArchivedOrder: true,
            });
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

        setViewingDossier({
            ...selectedSidebarEntry,
            status: "completed",
            archived: true,
            lotNumber: lot || selectedSidebarEntry.lotNumber,
        });
    };

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
    const archiveRef = collection(db, ...getArchiveItemsPath(year));
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
    setSelectedProduct(item); // Selecteer item
    setShowFinishModal(true); // Open modal voor handmatige actie
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
    setShowFinishModal(false);
        setTimeout(scheduleScanFocus, 50);
  };

  const handlePostProcessingFinish = async (status, data, productOverride = null) => {
    const product = productOverride || selectedProduct;
    if (!product) return;

    const productId = product.id || product.lotNumber;
    try {
      if (status === "completed") {
        await completeTrackedProduct({
          productId,
          finishType: "archive",
          fromStation: "BM01",
          note: data.note || "",
          actorLabel: user?.email || "Operator",
          source: "BM01Hub",
        });
        await logActivity(
          user?.uid || "system",
          "POST_PROCESS_COMPLETE",
          `BM01 afgerond en gearchiveerd: lot ${product.lotNumber || productId}`
        );
        if (selectedProductRef.current?.id === product.id) handleCloseModal();
        return;
      }

      if (status === "rejected") {
        await rejectTrackedProductFinal({
          productId,
          reasons: data.reasons || [],
          note: data.note || "",
          source: "BM01Hub",
          actorLabel: user?.email || "Operator",
        });
        await logActivity(
          user?.uid || "system",
          "QUALITY_REJECT_FINAL",
          `BM01 Definitieve afkeur en gearchiveerd: lot ${product.lotNumber || productId}`
        );
        if (selectedProductRef.current?.id === product.id) handleCloseModal();
        return;
      }

            await tempRejectTrackedProduct({
                productId,
                reasons: data.reasons || [],
                note: data.note || "",
                station: "BM01",
                actorLabel: user?.email || "Operator",
                source: "BM01Hub",
      });
      await logActivity(
        user?.uid || "system",
        "QUALITY_TEMP_REJECT",
        `BM01 Tijdelijke afkeur: lot ${product.lotNumber || productId}`
      );
      if (selectedProductRef.current?.id === product.id) handleCloseModal();
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

    const handlePrintQrOverview = async () => {
            if (completedProducts.length === 0) return;

            try {
                    const itemsWithQr = await Promise.all(
                            completedProducts.map(async (item, index) => {
                                    const orderId = String(item.orderId || "").trim();
                                    const lotNumber = String(item.lotNumber || "").trim();
                                    const itemName = String(item.item || "").trim();
                                    const itemCode = String(item.itemCode || "").trim();

                                    const orderQr = orderId
                                            ? await QRCode.toDataURL(orderId, { errorCorrectionLevel: "H", margin: 1, width: 220 })
                                            : "";
                                    const lotQr = lotNumber
                                            ? await QRCode.toDataURL(lotNumber, { errorCorrectionLevel: "H", margin: 1, width: 220 })
                                            : "";

                                    const finishedAt = item.timestamps?.finished?.toDate
                                            ? item.timestamps.finished.toDate()
                                            : new Date(item.timestamps?.finished || item.updatedAt || Date.now());

                                    return {
                                            index: index + 1,
                                            orderId,
                                            lotNumber,
                                            itemName,
                                            itemCode,
                                            finishedAtText: isValid(finishedAt) ? format(finishedAt, "HH:mm") : "--:--",
                                            orderQr,
                                            lotQr,
                                    };
                            })
                    );

                    const reportDate =
                            viewMode === "day"
                                    ? format(selectedDate, "EEEE d MMMM yyyy", { locale: nl })
                                    : `Week ${format(selectedDate, "w")} (${format(startOfISOWeek(selectedDate), "d MMM", { locale: nl })} - ${format(endOfISOWeek(selectedDate), "d MMM", { locale: nl })})`;

                    const cardsHtml = itemsWithQr
                            .map(
                                    (row) => `
                                        <article class="card">
                                            <div class="cardHeader">
                                                <div>
                                                    <div class="index">#${row.index}</div>
                                                    <h2 class="title">${escapeHtml(row.itemName)}</h2>
                                                    <p class="code">${escapeHtml(row.itemCode)}</p>
                                                </div>
                                                <div class="time">${escapeHtml(row.finishedAtText)}</div>
                                            </div>
                                            <div class="qrGrid">
                                                <section class="qrBlock">
                                                    ${row.orderQr ? `<img src="${row.orderQr}" alt="QR Order ${escapeHtml(row.orderId)}" />` : ""}
                                                    <div>
                                                        <div class="label">Ordernummer</div>
                                                        <div class="value">${escapeHtml(row.orderId)}</div>
                                                    </div>
                                                </section>
                                                <section class="qrBlock">
                                                    ${row.lotQr ? `<img src="${row.lotQr}" alt="QR Lot ${escapeHtml(row.lotNumber)}" />` : ""}
                                                    <div>
                                                        <div class="label">Lotnummer</div>
                                                        <div class="value">${escapeHtml(row.lotNumber)}</div>
                                                    </div>
                                                </section>
                                            </div>
                                        </article>
                                    `
                            )
                            .join("");

                    const html = `<!doctype html>
<html lang="nl">
    <head>
        <meta charset="utf-8" />
        <title>BM01 QR Overzicht</title>
        <style>
            @page { size: A4 portrait; margin: 8mm; }
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #0f172a; }
            .sheet { width: 100%; }
            .header { border-bottom: 2px solid #0f172a; margin-bottom: 10px; padding-bottom: 6px; }
            .header h1 { margin: 0; font-size: 18px; text-transform: uppercase; }
            .header p { margin: 4px 0 0; font-size: 12px; color: #334155; }
            .list { display: flex; flex-direction: column; gap: 6px; }
            .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; break-inside: avoid; page-break-inside: avoid; }
            .cardHeader { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
            .index { font-size: 10px; font-weight: 700; color: #64748b; }
            .title { margin: 0; font-size: 11px; line-height: 1.25; font-weight: 800; }
            .code { margin: 2px 0 0; font-size: 9px; color: #64748b; }
            .time { font-size: 10px; font-weight: 700; white-space: nowrap; }
            .qrGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
            .qrBlock { display: flex; gap: 6px; align-items: center; }
            .qrBlock img { width: 56px; height: 56px; object-fit: contain; border: 1px solid #e2e8f0; }
            .label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; }
            .value { font-size: 11px; font-weight: 800; word-break: break-all; }
        </style>
    </head>
    <body>
        <main class="sheet">
            <header class="header">
                <h1>QR Overzicht Aangeboden</h1>
                <p>${escapeHtml(reportDate)}</p>
            </header>
            <section class="list">${cardsHtml}</section>
        </main>
    </body>
</html>`;

                    const frame = document.createElement("iframe");
                    frame.style.position = "fixed";
                    frame.style.right = "0";
                    frame.style.bottom = "0";
                    frame.style.width = "0";
                    frame.style.height = "0";
                    frame.style.border = "0";
                    frame.setAttribute("aria-hidden", "true");
                    document.body.appendChild(frame);

                    const cleanup = () => {
                            setTimeout(() => {
                                    if (frame.parentNode) frame.parentNode.removeChild(frame);
                            }, 150);
                    };

                    frame.onload = () => {
                            const win = frame.contentWindow;
                            if (!win) {
                                    cleanup();
                                    return;
                            }
                            win.onafterprint = cleanup;
                            win.focus();
                            win.print();
                            setTimeout(cleanup, 2000);
                    };

                    frame.srcdoc = html;
            } catch (err) {
                    console.error("Print fout:", err);
                    notify("Kon QR-overzicht niet printen. Probeer opnieuw.");
            }
    };

  const handleAddQcNote = async (noteText) => {
      if (!viewingDossier || !noteText.trim()) return;
      
      try {
          const product = viewingDossier;
          const isArchived = archivedProducts.some(p => p.id === product.id);
          const date = product.timestamps?.finished?.toDate
            ? product.timestamps.finished.toDate()
            : new Date(product.timestamps?.finished || product.updatedAt || Date.now());
          const archiveYear = isArchived && Number.isFinite(date.getFullYear()) ? date.getFullYear() : null;

          const noteObj = {
              text: noteText,
              timestamp: new Date().toISOString(),
              user: user?.email || "BM01 Operator"
          };

          await appendQcNote({
              productId: product.id,
              note: noteText,
              archivedYear: archiveYear,
              source: "bm01_hub",
              actorLabel: user?.email || "BM01 Operator",
          });
                    await logActivity(
                        user?.uid || "system",
                        "QC_NOTE_ADD",
                        `QC notitie toegevoegd: lot ${product?.lotNumber || product?.id || "onbekend"}`
                    );
          
          // Update lokale state voor directe feedback in de modal
          setViewingDossier(prev => ({
              ...prev,
              qcNotes: [...(prev.qcNotes || []), noteObj]
          }));
      } catch (err) {
          console.error("Fout bij opslaan notitie:", err);
          notify("Kon rapport niet opslaan: " + err.message);
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
            <div className="h-full flex gap-6 overflow-hidden">
                <div className={`shrink-0 flex flex-col min-h-0 transition-all duration-300 ${selectedDetailEntry ? 'hidden lg:flex w-[38rem]' : 'w-full lg:w-[38rem]'}`}>
                    <PlanningSidebar orders={planningOrders} selectedOrderId={selectedSidebarEntryId} onSelect={handleSidebarSelect} />
                </div>

                <div className={`flex-1 bg-white rounded-[40px] border border-slate-200 shadow-sm flex flex-col overflow-hidden ${selectedDetailEntry ? 'flex' : 'hidden lg:flex'}`}>
                    {selectedOrder ? (
                        <OrderDetail
                            order={selectedOrder}
                            products={products}
                            onClose={() => { setSelectedOrderId(null); setSelectedSidebarEntry(null); }}
                            showAllStations={true}
                            onMoveLot={onMoveLot}
                            isManager={true}
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
                            <Layers size={64} className="mb-4 text-slate-300" />
                            <p className="font-black uppercase tracking-widest text-xs text-slate-400">{t('bm01.select_order', 'Selecteer een order uit de lijst')}</p>
                        </div>
                    )}
                </div>
            </div>
        ) : activeTab === "inspectie" ? (
            <div className="h-full w-full">
                <div
                    className="h-full flex flex-col p-3 w-full overflow-y-auto custom-scrollbar pb-24"
                    style={{ paddingBottom: "max(6rem, env(safe-area-inset-bottom))" }}
                >
                    {/* Scan Indicator & Input */}
                    <div className="shrink-0 space-y-2 mb-3 sticky top-0 bg-white py-2 z-10">
                        <div className="flex justify-between items-end">
                            {/* Indicator Label */}
                            <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 rounded-lg border border-purple-100 w-fit">
                                <div className="w-2 h-2 bg-purple-500 rounded-full pulse-text-bm01"></div>
                                <span className="text-xs font-black text-purple-600 uppercase tracking-widest">
                                    🔍 {t('bm01.ready_for_inspection_scan', 'Klaar voor inspectie scan')}
                                </span>
                            </div>

                            {/* Scanner Mode Toggle */}
                            <button 
                                onClick={() => setScannerMode(!scannerMode)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-bold text-xs uppercase tracking-widest transition-all ${scannerMode ? 'bg-purple-100 border-purple-200 text-purple-700' : 'bg-white border-slate-200 text-slate-400'}`}
                                title={scannerMode ? "Toetsenbord verborgen (Scanner Modus)" : "Normale invoer"}
                            >
                                {scannerMode ? <ScanBarcode size={16} /> : <Keyboard size={16} />}
                                {scannerMode ? "Scanner Modus" : "Toetsenbord"}
                            </button>
                        </div>
                        {/* Scan Input */}
                        <div className="relative">
                            <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-500 transition-all scan-pulse-bm01" size={24} />
                            <input
                                ref={scanInputRef}
                                type="text"
                                autoFocus
                                value={scanInput}
                                onChange={(e) => setScanInput(e.target.value)}
                                inputMode={scannerMode ? "none" : "text"}
                                onKeyDown={handleScan}
                                placeholder="Scan lotnummer voor inspectie..."
                                className="w-full pl-14 pr-4 py-4 bg-white border-2 border-purple-100 focus:border-purple-500 focus:ring-2 focus:ring-purple-300 rounded-2xl font-bold text-lg shadow-sm outline-none transition-all placeholder:text-slate-300"
                            />
                        </div>
                    </div>

                    {bm01Products.length === 0 ? (
                        <div className="text-center py-20 opacity-40">
                            <Package size={64} className="mx-auto mb-4 text-slate-300" />
                            <p className="font-black uppercase tracking-widest text-slate-400">{t('bm01.no_items_inspect')}</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {bm01Products.map(item => (
                                <div 
                                    key={item.id}
                                    onClick={() => handleItemClick(item)}
                                    className={`bg-white border rounded-[14px] p-3 shadow-sm hover:shadow-md transition-all group cursor-pointer w-full
                                        ${selectedProduct?.id === item.id ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-200' : 'border-slate-100'}`}
                                >
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="min-w-0 flex-1">
                                            <h4 className="font-black text-2xl text-slate-800 tracking-tight">{item.lotNumber}</h4>
                                            <span className="text-[7px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-lg font-black uppercase tracking-wider border border-slate-200 inline-block mt-0.5">
                                                {item.orderId}
                                            </span>
                                            <p className="text-[9px] text-slate-500 font-bold uppercase truncate mt-0.5">{item.item}</p>
                                            <div className="flex items-center gap-1 mt-1">
                                                <History size={8} className="text-slate-400" />
                                                <span className="text-[7px] text-slate-400 font-bold uppercase">
                                                    {t('bm01.from')}: {item.lastStation || t('common.unknown')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleItemClick(item)}
                                        className="w-full mt-2 px-2 py-1.5 bg-purple-600 text-white rounded-lg font-black uppercase text-[8px] tracking-widest hover:bg-purple-700 transition-all shadow-md active:scale-95"
                                    >
                                        {t('bm01.report_ready')}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        ) : (
            /* AANGEBODEN / GEREED TAB */
            <div className="h-full flex flex-col p-3 w-full">
                {/* Datum Navigatie */}
                <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-4">
                    <div className="flex items-center bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                        <button onClick={() => setSelectedDate(d => viewMode === 'day' ? subDays(d, 1) : subDays(d, 7))} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500">
                            <ChevronLeft size={20} />
                        </button>
                        <div 
                            className="flex items-center gap-2 px-4 min-w-[200px] justify-center cursor-pointer hover:bg-slate-50 rounded-lg transition-colors select-none"
                            onDoubleClick={() => setSelectedDate(new Date())}
                            title={t('bm01.reset_date_tooltip', 'Dubbelklik om naar vandaag te gaan')}
                        >
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
        <div
            className="bm01-print-overlay fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center p-3 md:p-6 animate-in fade-in print:block print:static print:bg-white print:p-0 print:backdrop-blur-0"
            onClick={() => setShowPrintModal(false)}
        >
                        <style>{`
                            @media print {
                                @page {
                                    size: A4 portrait;
                                    margin: 8mm;
                                }

                                body * {
                                    visibility: hidden !important;
                                }

                                .bm01-print-overlay,
                                .bm01-print-overlay * {
                                    visibility: visible !important;
                                }

                                .bm01-qr-print-sheet {
                                    max-width: 190mm !important;
                                    margin: 0 auto !important;
                                }

                                .bm01-print-overlay,
                                .bm01-print-dialog {
                                    max-height: none !important;
                                    height: auto !important;
                                    overflow: visible !important;
                                }
                            }
                        `}</style>
            <div
                className="bm01-print-dialog w-full max-w-6xl max-h-[92vh] bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden print:max-h-none print:overflow-visible print:max-w-none print:rounded-none print:border-0 print:shadow-none"
                onClick={(e) => e.stopPropagation()}
            >
                                <div className="bm01-qr-print-sheet p-5 md:p-8 overflow-y-auto max-h-[92vh] print:max-h-none print:overflow-visible print:p-0 print:max-w-none">
                {/* Header - Hidden on Print */}
                <div className="flex justify-between items-center mb-8 print:hidden">
                    <div>
                        <h2 className="text-2xl font-black uppercase italic text-slate-900">{t('bm01.daily_overview')}</h2>
                        <p className="text-slate-500 font-bold">{format(selectedDate, "EEEE d MMMM yyyy", { locale: nl })}</p>
                    </div>
                    <div className="flex gap-4">
                        <button 
                            onClick={handlePrintQrOverview}
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
                                        <InternalQrImage value={item.orderId} size={240} alt={`QR Order ${item.orderId}`} className="w-24 h-24 mix-blend-multiply print:w-10 print:h-10" />
                                        <div className="min-w-0 overflow-hidden">
                                            <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest print:hidden">{t('bm01.order_number')}</span>
                                            <span className="block text-xl font-black font-mono text-slate-900 print:text-[10px] truncate">{item.orderId}</span>
                                        </div>
                                    </div>

                                    {/* Lot QR */}
                                    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 print:border-0 print:bg-transparent print:p-0 print:gap-2">
                                        <InternalQrImage value={item.lotNumber} size={240} alt={`QR Lot ${item.lotNumber}`} className="w-24 h-24 mix-blend-multiply print:w-10 print:h-10" />
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
        </div>
      )}
    </div>
  );
});

export default BM01Hub;
