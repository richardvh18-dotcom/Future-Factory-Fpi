import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Layers, Calendar, History, Package, ChevronLeft, ChevronRight, CheckCircle2, Printer, X, Download, ScanBarcode, Keyboard, AlertTriangle } from "lucide-react";
import { format, isValid, isSameDay, subDays, addDays, startOfISOWeek, endOfISOWeek, isWithinInterval } from "date-fns";
import { nl } from "date-fns/locale";
import QRCode from "qrcode";
import OrderDetail from "./OrderDetail";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";
import ProductDossierModal from "./modals/ProductDossierModal";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { collection, query, where, getDocs, onSnapshot, limit } from "firebase/firestore";
import { db, logActivity } from "../../config/firebase";
import { getArchiveItemsPath } from "../../config/dbPaths";
import { rejectTrackedProductFinal, completeTrackedProduct, tempRejectTrackedProduct, appendQcNote } from "../../services/planningSecurityService";
import InternalQrImage from "../../utils/InternalQrImage.tsx";
import PlanningSidebar from "./PlanningSidebar";
import { useNotifications } from '../../contexts/NotificationContext';
const QR_CODE_OK_CONFIRMATION = 'FPI-ACTION-APPROVE-OK';
const escapeHtml = (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
const resolveProductIdentifier = (product) => String(product?.sourcePath || product?.__docPath || product?.id || product?.lotNumber || "").trim();
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
    const [deliveryMismatchFilter, setDeliveryMismatchFilter] = useState("all"); // all | over | under
    const [showDeliveryMismatch, setShowDeliveryMismatch] = useState(false);
    const [scanInput, setScanInput] = useState("");
    const [scannerMode, setScannerMode] = useState(true);
    const [isNahardingBatchProcessing, setIsNahardingBatchProcessing] = useState(false);
    const scanInputRef = useRef(null);
    const selectedProductRef = useRef(null); // Ref voor race-condition preventie
    const focusScanInput = useCallback(() => {
        const input = scanInputRef.current;
        if (!input)
            return;
        input.focus({ preventScroll: true });
    }, []);
    const scheduleScanFocus = useCallback(() => {
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(() => {
                focusScanInput();
                setTimeout(focusScanInput, 0);
            });
            return;
        }
        setTimeout(focusScanInput, 0);
    }, [focusScanInput]);
    // Sync ref met state
    useEffect(() => {
        selectedProductRef.current = selectedProduct;
    }, [selectedProduct]);
    // Auto-focus logic voor scanner
    useEffect(() => {
        if (!scannerMode)
            return;
        // Focus direct bij laden of als scannerMode aan gaat
        scheduleScanFocus();
        // Ook bij click buiten input, behalve op interactieve elementen
        const handleClick = (e) => {
            const target = e?.target;
            if (!target)
                return;
            if (target.closest?.('input, textarea, select, button, a, [role="button"], [contenteditable="true"], [data-scan-ignore]'))
                return;
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
    }, [activeTab, showFinishModal, viewingDossier, selectedOrderId, scannerMode, scheduleScanFocus]);
    // Focus scanveld bij eerste render (ook als scannerMode uit staat)
    useEffect(() => {
        scheduleScanFocus();
    }, [scheduleScanFocus]);
    const handleScan = async (e) => {
        if (e.key === 'Enter') {
            const code = scanInput.trim().toUpperCase();
            if (!code)
                return;
            const selectedForAction = selectedProductRef.current || selectedProduct;
            // Debug: log scan
            console.debug('[BM01] Scan ontvangen:', code, 'selectedProduct:', selectedForAction);
            // Goedkeuren met QR-code (OK QR)
            if (code === QR_CODE_OK_CONFIRMATION && selectedForAction) {
                setScanInput("");
                await handlePostProcessingFinish('completed', { note: 'Goedgekeurd via QR Scan' }, selectedForAction);
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
            }
            else {
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
    const deliveryInspectionMismatches = useMemo(() => {
        const toFinite = (value) => {
            const num = Number(value);
            return Number.isFinite(num) ? num : null;
        };
        return planningOrders
            .map((order) => {
            const deliveredQty = toFinite(order?.lnDeliveredQty) ??
                toFinite(order?.deliveredQty) ??
                toFinite(order?.quantityDelivered) ??
                null;
            if (!Number.isFinite(deliveredQty))
                return null;
            const inspectionApprovedQty = toFinite(order?.inspectionApprovedQty) ?? toFinite(order?.produced) ?? 0;
            const delta = deliveredQty - inspectionApprovedQty;
            if (delta === 0)
                return null;
            return {
                orderId: order?.orderId || order?.id || "-",
                item: order?.item || order?.itemDescription || "-",
                deliveredQty,
                inspectionApprovedQty,
                delta,
            };
        })
            .filter(Boolean)
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    }, [planningOrders]);
    const deliveryInspectionOverMismatches = useMemo(() => {
        return deliveryInspectionMismatches
            .filter((entry) => Number(entry?.delta) > 0)
            .sort((a, b) => b.delta - a.delta);
    }, [deliveryInspectionMismatches]);
    const deliveryInspectionUnderMismatches = useMemo(() => {
        return deliveryInspectionMismatches
            .filter((entry) => Number(entry?.delta) < 0)
            .sort((a, b) => a.delta - b.delta);
    }, [deliveryInspectionMismatches]);
    const visibleDeliveryInspectionMismatches = useMemo(() => {
        if (deliveryMismatchFilter === "over")
            return deliveryInspectionOverMismatches;
        if (deliveryMismatchFilter === "under")
            return deliveryInspectionUnderMismatches;
        return deliveryInspectionMismatches;
    }, [deliveryMismatchFilter, deliveryInspectionMismatches, deliveryInspectionOverMismatches, deliveryInspectionUnderMismatches]);
    const selectedOrder = useMemo(() => {
        if (!selectedOrderId)
            return null;
        return planningOrders.find((o) => o.id === selectedOrderId || o.orderId === selectedOrderId);
    }, [planningOrders, selectedOrderId]);
    const selectedDetailEntry = useMemo(() => {
        if (selectedOrder)
            return selectedOrder;
        if (selectedSidebarEntry?.isArchivedOrder)
            return selectedSidebarEntry;
        return null;
    }, [selectedOrder, selectedSidebarEntry]);
    const selectedSidebarEntryId = useMemo(() => {
        if (selectedSidebarEntry?.orderId)
            return selectedSidebarEntry.orderId;
        if (selectedSidebarEntry?.id)
            return selectedSidebarEntry.id;
        return selectedOrderId;
    }, [selectedSidebarEntry, selectedOrderId]);
    const handleSidebarSelect = async (entry) => {
        if (!entry) {
            setSelectedOrderId(null);
            setSelectedSidebarEntry(null);
            return;
        }
        const entryOrderId = String(entry.orderId || entry.id || "").trim();
        if (!entryOrderId)
            return;
        setSelectedSidebarEntry(entry);
        if (entry.isArchivedOrder) {
            setSelectedOrderId(null);
            try {
                const baseYear = new Date().getFullYear();
                const years = [baseYear, baseYear - 1, baseYear - 2, baseYear - 3];
                const snapshots = await Promise.all(years.map((year) => getDocs(query(collection(db, ...getArchiveItemsPath(year)), where("orderId", "==", entryOrderId), limit(100)))));
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
                    const lotNumbers = Array.from(new Set(candidates
                        .map((c) => String(c.lotNumber || c.activeLot || "").trim())
                        .filter(Boolean)));
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
            }
            catch (err) {
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
        if (!selectedSidebarEntry?.isArchivedOrder)
            return;
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
                const snaps = await Promise.all(years.map((year) => getDocs(query(collection(db, ...getArchiveItemsPath(year)), where("orderId", "==", orderId), limit(150)))));
                const candidates = snaps
                    .flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))
                    .filter((c) => {
                    if (!lot)
                        return true;
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
            }
            catch (err) {
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
            const status = (p.status || "").toUpperCase();
            // Ruimere matching voor BM01/Inspectie
            const isMatch = station.includes("BM01") || step.includes("INSPECTIE") || step === "EINDINSPECTIE" || step === "BM01";
            const isRejected = status === "REJECTED" || step === "REJECTED" || status === "AFKEUR";
            const isFinished = step === "FINISHED" || station === "GEREED";
            return isMatch && !isFinished && !isRejected;
        });
    }, [products]);
    const toMillisSafe = (value) => {
        if (!value)
            return 0;
        if (typeof value?.toMillis === "function")
            return value.toMillis();
        if (typeof value?.seconds === "number")
            return value.seconds * 1000;
        const parsed = new Date(value).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const getNahardingOfferedMillis = (item) => {
        const ts = item?.timestamps || {};
        const directTs = toMillisSafe(ts.oven_naharding_start)
            || toMillisSafe(ts.naharding_start)
            || 0;
        if (directTs > 0)
            return directTs;
        const historyList = Array.isArray(item?.history) ? item.history : [];
        // Zoek het EERSTE event (oudste) dat verwijst naar Naharding.
        // Hiermee vangen we het moment van *aanbieden* aan de oven, i.p.v. het moment van *afronden*.
        const nahardingEvent = historyList.find((entry) => {
            const details = String(entry?.details || "").toUpperCase();
            const station = String(entry?.station || "").toUpperCase();
            const action = String(entry?.action || "").toUpperCase();
            // Negeer expliciete afrond-events zodat we niet de datum van uithalen pakken
            if (details.includes("GEREEDGEMELD") || action === "ARCHIVE" || action === "COMPLETED")
                return false;
            return details.includes("NAHARD") || details.includes("OVEN") ||
                station.includes("NAHARD") || station.includes("OVEN") ||
                action.includes("NAHARD");
        });
        const historyTs = toMillisSafe(nahardingEvent?.timestamp || nahardingEvent?.time);
        if (historyTs > 0)
            return historyTs;
        // Laatste fallback: alleen toepassen als het product daadwerkelijk een naharding relatie heeft
        const station = String(item?.currentStation || "").toUpperCase().replace(/\s/g, "");
        const step = String(item?.currentStep || "").toUpperCase().replace(/\s/g, "");
        const status = String(item?.status || "").toUpperCase().trim();
        const lastStation = String(item?.lastStation || "").toUpperCase().replace(/\s/g, "");
        const isNahardingRelated = station.includes("NAHARD") || station.includes("OVEN") ||
            step.includes("NAHARD") || step.includes("OVEN") ||
            status === "TE NAHARDEN" ||
            lastStation.includes("NAHARD") || lastStation.includes("OVEN");
        if (isNahardingRelated) {
            const isFinished = status === "COMPLETED" || station === "GEREED";
            if (isFinished) {
                // Als het al afgerond is, is updatedAt van vandaag (de afronding). We zoeken de starttijd.
                return toMillisSafe(item?.createdAt);
            }
            return toMillisSafe(item?.updatedAt) || toMillisSafe(item?.createdAt);
        }
        return 0;
    };
    const nahardingProducts = useMemo(() => {
        const items = products.filter((p) => {
            const station = String(p.currentStation || "").toUpperCase().replace(/\s/g, "");
            const step = String(p.currentStep || "").toUpperCase().replace(/\s/g, "");
            const status = String(p.status || "").toUpperCase().trim();
            const isNaharding = station.includes("NAHARD") ||
                station.includes("OVEN") ||
                step.includes("NAHARD") ||
                step.includes("OVEN") ||
                status === "TE NAHARDEN";
            const isClosed = status === "COMPLETED" ||
                status === "REJECTED" ||
                status === "AFKEUR" ||
                step === "FINISHED" ||
                station === "GEREED";
            return isNaharding && !isClosed;
        });
        console.debug('[BM01] Naharding filter:', items.length, 'items gevonden');
        return items.sort((a, b) => getNahardingOfferedMillis(b) - getNahardingOfferedMillis(a));
    }, [products]);
    const latestNahardingBatchDateKey = useMemo(() => {
        if (nahardingProducts.length === 0)
            return "";
        const latest = getNahardingOfferedMillis(nahardingProducts[0]);
        if (!latest)
            return "";
        return format(new Date(latest), "yyyy-MM-dd");
    }, [nahardingProducts]);
    const nahardingBatchProducts = useMemo(() => {
        return [...nahardingProducts].sort((a, b) => {
            const orderA = String(a.orderId || "").trim();
            const orderB = String(b.orderId || "").trim();
            return orderA.localeCompare(orderB);
        });
    }, [nahardingProducts]);
    const latestNahardingBatchLabel = useMemo(() => {
        if (!latestNahardingBatchDateKey)
            return "";
        const parsed = new Date(`${latestNahardingBatchDateKey}T00:00:00`);
        if (!isValid(parsed))
            return latestNahardingBatchDateKey;
        return format(parsed, "EEEE d MMMM yyyy", { locale: nl });
    }, [latestNahardingBatchDateKey]);
    const handleNahardingBatchComplete = async () => {
        if (isNahardingBatchProcessing)
            return;
        const batchItems = nahardingBatchProducts.filter((item) => Boolean(resolveProductIdentifier(item)));
        if (batchItems.length === 0) {
            notify(t("bm01.naharding_batch_empty", "Geen Naharding lots gevonden om te gereedmelden."));
            return;
        }
        const confirmed = window.confirm(t("bm01.naharding_batch_confirm", "Weet je zeker dat je de laatst aangeboden batch ({{count}} Naharding lots) in 1x gereed wilt melden en archiveren?", { count: batchItems.length }));
        if (!confirmed)
            return;
        setIsNahardingBatchProcessing(true);
        let successCount = 0;
        let failCount = 0;
        for (const item of batchItems) {
            const productId = resolveProductIdentifier(item);
            try {
                await completeTrackedProduct({
                    productId,
                    finishType: "archive",
                    fromStation: "Naharding",
                    note: "Batch Naharding gereedgemeld vanuit BM01",
                    actorLabel: user?.email || "Operator",
                    source: "BM01Hub:naharding-batch",
                });
                successCount += 1;
            }
            catch (error) {
                failCount += 1;
                console.error("Naharding batch gereedmelden mislukt:", productId, error);
            }
        }
        try {
            await logActivity(user?.uid || "system", "POST_PROCESS_COMPLETE_BATCH", `BM01 Naharding batch gereedgemeld: success=${successCount}, failed=${failCount}`);
        }
        catch (error) {
            console.error("Kon BM01 batch log niet opslaan:", error);
        }
        if (failCount === 0) {
            notify(t("bm01.naharding_batch_success", "Naharding batch gereedgemeld: {{count}} lots gearchiveerd.", { count: successCount }));
        }
        else {
            notify(t("bm01.naharding_batch_partial", "Naharding batch deels gereedgemeld: {{success}} gelukt, {{failed}} mislukt.", { success: successCount, failed: failCount }));
        }
        setIsNahardingBatchProcessing(false);
    };
    // Fetch archived products for selected date
    useEffect(() => {
        if (activeTab !== "completed" && activeTab !== "naharding_batch")
            return;
        const year = selectedDate.getFullYear();
        let start, end;
        if (viewMode === "day") {
            start = new Date(selectedDate);
            start.setHours(0, 0, 0, 0);
            end = new Date(selectedDate);
            end.setHours(23, 59, 59, 999);
        }
        else {
            start = startOfISOWeek(selectedDate);
            start.setHours(0, 0, 0, 0);
            end = endOfISOWeek(selectedDate);
            end.setHours(23, 59, 59, 999);
        }
        let queryEnd = new Date(end);
        if (activeTab === "naharding_batch") {
            // Voor naharding: items die op de geselecteerde datum de oven in zijn gegaan,
            // kunnen pas dagen later zijn afgerond (gearchiveerd).
            // Verruim de einddatum van de query met max 14 dagen (of tot vandaag) om ze te vangen.
            const maxEnd = new Date(end);
            maxEnd.setDate(maxEnd.getDate() + 14);
            const now = new Date();
            now.setHours(23, 59, 59, 999);
            queryEnd = maxEnd < now ? maxEnd : now;
            if (queryEnd < end)
                queryEnd = new Date(end);
        }
        // Luister naar de archief collectie voor de geselecteerde periode
        const archiveRef = collection(db, ...getArchiveItemsPath(year));
        const q = query(archiveRef, where("timestamps.finished", ">=", start), where("timestamps.finished", "<=", queryEnd));
        const unsub = onSnapshot(q, (snap) => {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setArchivedProducts(items);
        }, (err) => {
            console.error("Fout bij ophalen archief:", err);
        });
        return () => unsub();
    }, [selectedDate, activeTab, viewMode]);
    // Specifieke lijst voor de Naharding Print-tegel, inclusief historie/archief van de geselecteerde dag
    const nahardingPrintList = useMemo(() => {
        const isTargetPeriod = (p) => {
            const ts = getNahardingOfferedMillis(p);
            if (!ts)
                return false;
            const date = new Date(ts);
            if (viewMode === "day") {
                return isSameDay(date, selectedDate);
            }
            else {
                const start = startOfISOWeek(selectedDate);
                const end = endOfISOWeek(selectedDate);
                return isWithinInterval(date, { start, end });
            }
        };
        const activeMatches = products.filter(p => isTargetPeriod(p));
        const archivedMatches = archivedProducts.filter(p => isTargetPeriod(p));
        const combined = [...activeMatches];
        archivedMatches.forEach(archived => {
            if (!combined.some(p => p.id === archived.id))
                combined.push(archived);
        });
        return combined.sort((a, b) => {
            const orderA = String(a.orderId || "").trim();
            const orderB = String(b.orderId || "").trim();
            if (orderA !== orderB) {
                return orderA.localeCompare(orderB);
            }
            return getNahardingOfferedMillis(a) - getNahardingOfferedMillis(b);
        });
    }, [products, archivedProducts, selectedDate, viewMode]);
    // Filter producten die gereed zijn (Aangeboden tab) op basis van geselecteerde datum
    // Combineert actieve producten (die nog niet gearchiveerd zijn) en gearchiveerde producten
    const completedProducts = useMemo(() => {
        // Voor de 'Gereed' tab (Completed)
        const activeFinished = products.filter(p => {
            const station = (p.currentStation || "").toUpperCase().replace(/\s/g, "");
            const status = (p.status || "").toUpperCase();
            const isFinished = status === 'COMPLETED' || p.currentStep === 'Finished' || station === 'GEREED';
            if (!isFinished)
                return false;
            // Bepaal datum van afronding
            let finishDate = null;
            if (p.timestamps?.finished) {
                finishDate = p.timestamps.finished.toDate ? p.timestamps.finished.toDate() : new Date(p.timestamps.finished);
            }
            else if (p.updatedAt) {
                finishDate = p.updatedAt.toDate ? p.updatedAt.toDate() : new Date(p.updatedAt);
            }
            if (!finishDate)
                return false;
            if (viewMode === "day") {
                return isSameDay(finishDate, selectedDate);
            }
            else {
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
            const orderA = String(a.orderId || "").trim();
            const orderB = String(b.orderId || "").trim();
            if (orderA !== orderB) {
                return orderA.localeCompare(orderB);
            }
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
        if (!product)
            return;
        const productId = resolveProductIdentifier(product);
        if (!productId) {
            notify("Kon dit product niet afronden: ontbrekende product-id.");
            return;
        }
        try {
            if (status === "completed") {
                await completeTrackedProduct({
                    productId,
                    finishType: "post_inspection",
                    fromStation: "BM01",
                    note: data.note || "",
                    actorLabel: user?.email || "Operator",
                    source: "BM01Hub",
                });
                await logActivity(user?.uid || "system", "POST_PROCESS_COMPLETE", `BM01 afgerond en doorgestuurd naar Naharding: lot ${product.lotNumber || productId}`);
                notify(`Lot ${product.lotNumber || productId} is doorgestuurd naar Naharding.`);
                if (resolveProductIdentifier(selectedProductRef.current) === productId)
                    handleCloseModal();
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
                await logActivity(user?.uid || "system", "QUALITY_REJECT_FINAL", `BM01 Definitieve afkeur en gearchiveerd: lot ${product.lotNumber || productId}`);
                notify(`Lot ${product.lotNumber || productId} is definitief afgekeurd.`);
                if (resolveProductIdentifier(selectedProductRef.current) === productId)
                    handleCloseModal();
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
            await logActivity(user?.uid || "system", "QUALITY_TEMP_REJECT", `BM01 Tijdelijke afkeur: lot ${product.lotNumber || productId}`);
            notify(`Lot ${product.lotNumber || productId} is tijdelijk afgekeurd.`);
            if (resolveProductIdentifier(selectedProductRef.current) === productId)
                handleCloseModal();
        }
        catch (error) {
            console.error("Fout bij afronden:", error);
            notify(`Afronden mislukt: ${error?.message || "onbekende fout"}`);
        }
    };
    const handleExport = () => {
        if (completedProducts.length === 0)
            return;
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
        // BEPALING LIJST: Als we in NH tab zitten, gebruik de specifieke print lijst voor die dag
        let listToPrint = activeTab === "naharding_batch" ? nahardingPrintList : completedProducts;
        if (activeTab === "naharding_batch") {
            listToPrint = [...listToPrint].sort((a, b) => {
                const orderA = String(a.orderId || "").trim();
                const orderB = String(b.orderId || "").trim();
                return orderA.localeCompare(orderB);
            });
        }
        if (listToPrint.length === 0)
            return;
        try {
            const itemsWithQr = await Promise.all(listToPrint.map(async (item, index) => {
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
                    : (activeTab === "naharding_batch"
                        ? new Date(getNahardingOfferedMillis(item))
                        : new Date(item.timestamps?.finished || item.updatedAt || Date.now()));
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
            }));
            const reportDate = viewMode === "day"
                ? format(selectedDate, "EEEE d MMMM yyyy", { locale: nl })
                : `Week ${format(selectedDate, "w")} (${format(startOfISOWeek(selectedDate), "d MMM", { locale: nl })} - ${format(endOfISOWeek(selectedDate), "d MMM", { locale: nl })})`;
            let cardsHtml = "";
            let customStyle = "";
            if (activeTab === "naharding_batch") {
                cardsHtml = itemsWithQr.map((row, idx) => {
                    const isFirstOfOrder = idx === 0 || itemsWithQr[idx - 1].orderId !== row.orderId;
                    return `
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
                                                ${isFirstOfOrder ? `
                                                <section class="qrBlock">
                                                    ${row.orderQr ? `<img src="${row.orderQr}" alt="QR Order ${escapeHtml(row.orderId)}" />` : ""}
                                                    <div>
                                                        <div class="label">Ordernummer</div>
                                                        <div class="value">${escapeHtml(row.orderId)}</div>
                                                    </div>
                                                </section>
                                                ` : `<div></div>`}
                                                <section class="qrBlock">
                                                    ${row.lotQr ? `<img src="${row.lotQr}" alt="QR Lot ${escapeHtml(row.lotNumber)}" />` : ""}
                                                    <div>
                                                        <div class="label">Lotnummer</div>
                                                        <div class="value">${escapeHtml(row.lotNumber)}</div>
                                                    </div>
                                                </section>
                                            </div>
                                        </article>
                                    `;
                }).join("");
            }
            else {
                cardsHtml = `
                            <table class="simple-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Lotnummer</th>
                                        <th>Ordernummer</th>
                                        <th>Product</th>
                                        <th>Tijd</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsWithQr.map(row => `
                                        <tr>
                                            <td>${row.index}</td>
                                            <td><strong>${escapeHtml(row.lotNumber)}</strong></td>
                                            <td>${escapeHtml(row.orderId)}</td>
                                            <td>${escapeHtml(row.itemName)}</td>
                                            <td>${escapeHtml(row.finishedAtText)}</td>
                                        </tr>
                                    `).join("")}
                                </tbody>
                            </table>
                        `;
                customStyle = `
                            .simple-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
                            .simple-table th, .simple-table td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; }
                            .simple-table th { background-color: #f8fafc; font-weight: bold; text-transform: uppercase; font-size: 10px; color: #64748b; }
                            .simple-table tr:nth-child(even) { background-color: #f1f5f9; }
                        `;
            }
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
            ${customStyle}
        </style>
    </head>
    <body>
        <main class="sheet">
            <header class="header" style="display: flex; justify-content: space-between; align-items: flex-end;">
                <div>
                    <h1>${activeTab === "naharding_batch" ? "QR Overzicht Naharding" : "Gereedlijst Overzicht"}</h1>
                    <p>${escapeHtml(reportDate)}</p>
                </div>
                <div style="text-align: right;">
                    <span style="font-size: 12px; color: #64748b; font-weight: bold; text-transform: uppercase;">Aantal lots:</span>
                    <span style="font-size: 24px; font-weight: 900; margin-left: 6px; color: #0f172a;">${itemsWithQr.length}</span>
                </div>
            </header>
            <section class="${activeTab === "naharding_batch" ? "list" : ""}">${cardsHtml}</section>
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
                    if (frame.parentNode)
                        frame.parentNode.removeChild(frame);
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
        }
        catch (err) {
            console.error("Print fout:", err);
            notify("Kon QR-overzicht niet printen. Probeer opnieuw.");
        }
    };
    const handleAddQcNote = async (noteText) => {
        if (!viewingDossier || !noteText.trim())
            return;
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
            await logActivity(user?.uid || "system", "QC_NOTE_ADD", `QC notitie toegevoegd: lot ${product?.lotNumber || product?.id || "onbekend"}`);
            // Update lokale state voor directe feedback in de modal
            setViewingDossier(prev => ({
                ...prev,
                qcNotes: [...(prev.qcNotes || []), noteObj]
            }));
        }
        catch (err) {
            console.error("Fout bij opslaan notitie:", err);
            notify("Kon rapport niet opslaan: " + err.message);
        }
    };
    return (_jsxs("div", { className: "flex flex-col h-full bg-slate-50 animate-in fade-in", children: [_jsx("div", { className: "p-0.5 bg-white border-b border-slate-200 shrink-0 shadow-sm sm:p-2", children: _jsx("div", { className: "flex justify-center overflow-x-auto no-scrollbar", children: _jsxs("div", { className: "flex bg-slate-100 p-0.5 rounded-lg w-full max-w-2xl min-w-[280px]", children: [_jsx("button", { onClick: () => setActiveTab("planning"), className: `flex-1 px-1 py-1.5 rounded-md text-[9px] sm:text-[11px] font-black uppercase tracking-tighter sm:tracking-widest transition-all ${activeTab === "planning" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`, children: t('bm01.planning_total') }), _jsx("button", { onClick: () => setActiveTab("inspectie"), className: `flex-1 px-1 py-1.5 rounded-md text-[9px] sm:text-[11px] font-black uppercase tracking-tighter sm:tracking-widest transition-all ${activeTab === "inspectie" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`, children: t('bm01.to_offer') }), _jsx("button", { onClick: () => setActiveTab("naharding_batch"), className: `flex-1 px-1 py-1.5 rounded-md text-[9px] sm:text-[11px] font-black uppercase tracking-tighter sm:tracking-widest transition-all ${activeTab === "naharding_batch" ? "bg-white text-amber-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`, children: "NH" }), _jsx("button", { onClick: () => setActiveTab("completed"), className: `flex-1 px-1 py-1.5 rounded-md text-[9px] sm:text-[11px] font-black uppercase tracking-tighter sm:tracking-widest transition-all ${activeTab === "completed" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`, children: t('bm01.offered') }), _jsx("button", { onClick: () => setActiveTab("mismatch"), className: `flex-1 px-1 py-1.5 rounded-md text-[9px] sm:text-[11px] font-black uppercase tracking-tighter sm:tracking-widest transition-all ${activeTab === "mismatch" ? "bg-white text-rose-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`, children: "LN" })] }) }) }), _jsx("style", { children: `
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
      ` }), _jsx("div", { className: "flex-1 overflow-hidden relative", children: activeTab === "planning" ? (_jsxs("div", { className: "h-full flex gap-6 overflow-hidden", children: [_jsx("div", { className: `shrink-0 flex flex-col min-h-0 transition-all duration-300 ${selectedDetailEntry ? 'hidden lg:flex w-[38rem]' : 'w-full lg:w-[38rem]'}`, children: _jsx(PlanningSidebar, { orders: planningOrders, selectedOrderId: selectedSidebarEntryId, onSelect: handleSidebarSelect }) }), _jsx("div", { className: `flex-1 bg-white rounded-[40px] border border-slate-200 shadow-sm flex flex-col overflow-hidden ${selectedDetailEntry ? 'flex' : 'hidden lg:flex'}`, children: selectedOrder ? (_jsx(OrderDetail, { order: selectedOrder, products: products, onClose: () => { setSelectedOrderId(null); setSelectedSidebarEntry(null); }, showAllStations: true, onMoveLot: onMoveLot, isManager: true })) : selectedSidebarEntry?.isArchivedOrder ? (_jsxs("div", { className: "h-full flex flex-col p-8 lg:p-10 text-left overflow-y-auto", children: [_jsxs("div", { className: "flex items-start justify-between gap-4 border-b border-slate-200 pb-6", children: [_jsxs("div", { children: [_jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-amber-600", children: "History / Archief" }), _jsx("h3", { className: "text-2xl font-black text-slate-900 italic tracking-tight mt-1", children: selectedSidebarEntry.orderId || selectedSidebarEntry.id || '-' }), _jsx("p", { className: "text-sm font-bold text-slate-500 mt-1", children: selectedSidebarEntry.item || selectedSidebarEntry.itemDescription || '-' })] }), _jsx("button", { onClick: () => { setSelectedOrderId(null); setSelectedSidebarEntry(null); }, className: "px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-200", children: "Sluiten" })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 mt-6", children: [_jsxs("div", { className: "rounded-2xl bg-slate-50 border border-slate-200 p-4", children: [_jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400", children: "Status" }), _jsx("p", { className: "text-sm font-bold text-slate-800 mt-1", children: "Voltooid (Archief)" })] }), _jsxs("div", { className: "rounded-2xl bg-slate-50 border border-slate-200 p-4", children: [_jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400", children: "Machine" }), _jsx("p", { className: "text-sm font-bold text-slate-800 mt-1", children: selectedSidebarEntry.machine || selectedSidebarEntry.originMachine || '-' })] }), _jsxs("div", { className: "rounded-2xl bg-slate-50 border border-slate-200 p-4 md:col-span-2", children: [_jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400", children: "Lotnummers" }), Array.isArray(selectedSidebarEntry.lotNumbers) && selectedSidebarEntry.lotNumbers.length > 0 ? (_jsx("div", { className: "mt-2 space-y-2", children: selectedSidebarEntry.lotNumbers.map((lot) => (_jsxs("div", { className: "flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 px-3 py-2", children: [_jsx("span", { className: "text-sm font-bold text-slate-800 break-all", children: lot }), _jsx("button", { onClick: () => handleOpenArchivedLotDossier(lot), className: "px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700", children: "Open dossier" })] }, lot))) })) : (_jsxs("div", { className: "mt-2 flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 px-3 py-2", children: [_jsx("span", { className: "text-sm font-bold text-slate-800 break-all", children: selectedSidebarEntry.lotNumber || selectedSidebarEntry.lotNumbersText || '-' }), _jsx("button", { onClick: () => handleOpenArchivedLotDossier(selectedSidebarEntry.lotNumber), className: "px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700", children: "Open dossier" })] }))] })] })] })) : (_jsxs("div", { className: "flex-1 flex flex-col justify-center items-center opacity-40 italic text-center", children: [_jsx(Layers, { size: 64, className: "mb-4 text-slate-300" }), _jsx("p", { className: "font-black uppercase tracking-widest text-xs text-slate-400", children: t('bm01.select_order', 'Selecteer een order uit de lijst') })] })) })] })) : activeTab === "inspectie" ? (_jsx("div", { className: "h-full w-full", children: _jsxs("div", { className: "h-full flex flex-col p-3 w-full overflow-y-auto custom-scrollbar", children: [_jsxs("div", { className: "shrink-0 space-y-2 mb-3 sticky top-0 bg-white py-2 z-10", children: [_jsxs("div", { className: "flex justify-between items-end", children: [_jsxs("div", { className: "flex items-center gap-2 px-4 py-2 bg-purple-50 rounded-lg border border-purple-100 w-fit", children: [_jsx("div", { className: "w-2 h-2 bg-purple-500 rounded-full pulse-text-bm01" }), _jsxs("span", { className: "text-xs font-black text-purple-600 uppercase tracking-widest", children: ["\uD83D\uDD0D ", t('bm01.ready_for_inspection_scan', 'Klaar voor inspectie scan')] })] }), _jsxs("button", { onClick: () => setScannerMode(!scannerMode), className: `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border-2 font-black text-[9px] uppercase tracking-tighter transition-all ${scannerMode ? 'bg-purple-100 border-purple-200 text-purple-700' : 'bg-white border-slate-200 text-slate-400'}`, title: scannerMode ? "Toetsenbord verborgen (Scanner Modus)" : "Normale invoer", children: [scannerMode ? _jsx(ScanBarcode, { size: 14 }) : _jsx(Keyboard, { size: 14 }), scannerMode ? "Scanner" : "Keyboard"] })] }), _jsxs("div", { className: "relative", children: [_jsx(ScanBarcode, { className: "absolute left-4 top-1/2 -translate-y-1/2 text-purple-500 transition-all scan-pulse-bm01", size: 24 }), _jsx("input", { ref: scanInputRef, type: "text", autoFocus: true, value: scanInput, onChange: (e) => setScanInput(e.target.value), inputMode: scannerMode ? "none" : "text", onKeyDown: handleScan, placeholder: "Scan lotnummer voor inspectie...", className: "w-full pl-14 pr-4 py-4 bg-white border-2 border-purple-100 focus:border-purple-500 focus:ring-2 focus:ring-purple-300 rounded-2xl font-bold text-lg shadow-sm outline-none transition-all placeholder:text-slate-300" })] })] }), bm01Products.length === 0 ? (_jsxs("div", { className: "text-center py-20 opacity-40", children: [_jsx(Package, { size: 64, className: "mx-auto mb-4 text-slate-300" }), _jsx("p", { className: "font-black uppercase tracking-widest text-slate-400", children: t('bm01.no_items_inspect') })] })) : (_jsx("div", { className: "flex flex-col gap-2", children: bm01Products.map(item => (_jsxs("div", { onClick: () => handleItemClick(item), className: `bg-white border rounded-[14px] p-3 shadow-sm hover:shadow-md transition-all group cursor-pointer w-full
                                        ${selectedProduct?.id === item.id ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-200' : 'border-slate-100'}`, children: [_jsx("div", { className: "flex justify-between items-start gap-3", children: _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("h4", { className: "font-black text-2xl text-slate-800 tracking-tight", children: item.lotNumber }), _jsx("span", { className: "text-[7px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-lg font-black uppercase tracking-wider border border-slate-200 inline-block mt-0.5", children: item.orderId }), _jsx("p", { className: "text-[9px] text-slate-500 font-bold uppercase truncate mt-0.5", children: item.item }), _jsxs("div", { className: "flex items-center gap-1 mt-1", children: [_jsx(History, { size: 8, className: "text-slate-400" }), _jsxs("span", { className: "text-[7px] text-slate-400 font-bold uppercase", children: [t('bm01.from'), ": ", item.lastStation || t('common.unknown')] })] })] }) }), _jsx("button", { onClick: () => handleItemClick(item), className: "w-full mt-2 px-2 py-1.5 bg-purple-600 text-white rounded-lg font-black uppercase text-[8px] tracking-widest hover:bg-purple-700 transition-all shadow-md active:scale-95", children: t('bm01.report_ready') })] }, item.id))) }))] }) })) : activeTab === "completed" ? (
                /* AANGEBODEN / GEREED TAB */
                _jsxs("div", { className: "h-full flex flex-col p-3 w-full", children: [_jsxs("div", { className: "flex flex-col md:flex-row items-center justify-center gap-2 mb-3", children: [_jsxs("div", { className: "flex items-center bg-white p-1.5 rounded-xl shadow-md border-2 border-slate-200 scale-95 sm:scale-100", children: [_jsx("button", { onClick: () => setSelectedDate(d => viewMode === 'day' ? subDays(d, 1) : subDays(d, 7)), className: "p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-800", children: _jsx(ChevronLeft, { size: 20 }) }), _jsxs("div", { className: "flex items-center gap-2 px-4 min-w-[200px] justify-center cursor-pointer hover:bg-slate-50 rounded-lg transition-colors select-none", onDoubleClick: () => setSelectedDate(new Date()), title: t('bm01.reset_date_tooltip', 'Dubbelklik om naar vandaag te gaan'), children: [_jsx(Calendar, { size: 18, className: "text-emerald-500" }), _jsx("span", { className: "font-black text-slate-800 uppercase tracking-wider text-xs", children: viewMode === 'day'
                                                        ? format(selectedDate, "EEEE d MMMM", { locale: nl })
                                                        : `Week ${format(selectedDate, "w")} (${format(startOfISOWeek(selectedDate), "d MMM")} - ${format(endOfISOWeek(selectedDate), "d MMM")})` })] }), _jsx("button", { onClick: () => setSelectedDate(d => viewMode === 'day' ? addDays(d, 1) : addDays(d, 7)), className: "p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-800", children: _jsx(ChevronRight, { size: 20 }) })] }), _jsxs("div", { className: "flex gap-1.5 scale-95 sm:scale-100", children: [_jsxs("div", { className: "flex bg-white p-0.5 rounded-lg border border-slate-100 shadow-sm", children: [_jsx("button", { onClick: () => setViewMode("day"), className: `px-3 py-1.5 rounded-md text-[9px] font-black uppercase transition-all ${viewMode === "day" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`, children: t('bm01.day') }), _jsx("button", { onClick: () => setViewMode("week"), className: `px-3 py-1.5 rounded-md text-[9px] font-black uppercase transition-all ${viewMode === "week" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`, children: t('bm01.week') })] }), _jsx("button", { onClick: handleExport, className: "p-2 bg-white hover:bg-emerald-50 text-emerald-600 border border-slate-100 rounded-lg transition-colors shadow-sm", title: "Export CSV", children: _jsx(Download, { size: 18 }) }), _jsx("button", { onClick: () => setShowPrintModal(true), className: "p-2 bg-white hover:bg-blue-50 text-blue-600 border border-slate-100 rounded-lg transition-colors shadow-sm", title: t('bm01.print_list', 'Print Lijst'), children: _jsx(Printer, { size: 18 }) })] })] }), _jsx("div", { className: "text-center mb-3", children: _jsx("div", { className: "inline-block bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 shadow-sm", children: _jsxs("p", { className: "text-xs font-bold text-slate-600 uppercase tracking-widest", children: ["Gevonden lots in deze periode: ", _jsx("span", { className: "text-emerald-600 font-black text-xl ml-2", children: completedProducts.length })] }) }) }), _jsx("div", { className: "flex-1 overflow-y-auto custom-scrollbar space-y-3", children: activeTab === "completed" && completedProducts.length === 0 ? (_jsxs("div", { className: "text-center py-20 opacity-40", children: [_jsx(CheckCircle2, { size: 64, className: "mx-auto mb-4 text-slate-300" }), _jsx("p", { className: "font-black uppercase tracking-widest text-slate-400", children: t('bm01.no_offered_items') })] })) : (completedProducts.map(item => (_jsx("div", { className: "bg-white p-5 rounded-[25px] border border-slate-100 shadow-sm flex justify-between items-center opacity-75 hover:opacity-100 transition-opacity", children: _jsxs("div", { className: "flex items-center gap-5", children: [_jsx("div", { className: "p-4 rounded-2xl shrink-0 bg-emerald-50 text-emerald-600", children: _jsx(CheckCircle2, { size: 24 }) }), _jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx("h4", { className: "font-black text-lg text-slate-800 tracking-tight", children: item.lotNumber }), _jsx("span", { className: "text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg font-black uppercase tracking-wider border border-slate-200", children: item.orderId })] }), _jsx("p", { className: "text-xs text-slate-500 font-bold uppercase truncate", children: item.item }), _jsxs("div", { className: "flex items-center gap-2 mt-1", children: [_jsxs("span", { className: "text-[10px] text-emerald-600 font-bold uppercase", children: ["Gereedgemeld om ", item.timestamps?.finished ? format(item.timestamps.finished.toDate ? item.timestamps.finished.toDate() : new Date(item.timestamps.finished), "HH:mm") : "--:--"] }), _jsxs("button", { onClick: (e) => {
                                                                e.stopPropagation();
                                                                setViewingDossier(item);
                                                            }, className: "ml-4 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors", children: [_jsx(FileText, { size: 12 }), " ", t('bm01.dossier')] })] })] })] }) }, item.id)))) })] })) : activeTab === "naharding_batch" ? (_jsxs("div", { className: "h-full flex flex-col p-4 gap-4", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [_jsxs("div", { className: "rounded-2xl border border-amber-200 bg-amber-50 p-5 flex flex-col justify-between shadow-sm", children: [_jsxs("div", { children: [_jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-amber-700", children: "Naharding Batch" }), _jsx("p", { className: "text-sm font-bold text-slate-700 mt-1", children: t("bm01.naharding_batch_desc", "Meld in 1x alle Naharding lots gereed zodra de oven is geleegd.") }), latestNahardingBatchLabel && (_jsx("p", { className: "mt-3 text-[11px] font-bold text-amber-800", children: t("bm01.naharding_batch_date", "Laatst aangeboden batch: {{date}}", { date: latestNahardingBatchLabel }) }))] }), _jsx("button", { type: "button", onClick: handleNahardingBatchComplete, disabled: isNahardingBatchProcessing || nahardingBatchProducts.length === 0, className: `mt-4 w-full px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${isNahardingBatchProcessing || nahardingBatchProducts.length === 0
                                                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                                : "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200 shadow-sm"}`, children: isNahardingBatchProcessing
                                                ? t("bm01.naharding_batch_processing", "Batch wordt verwerkt...")
                                                : t("bm01.naharding_batch_button", "Batch Naharding gereedmelden ({{count}})", { count: nahardingBatchProducts.length }) })] }), _jsxs("div", { className: "rounded-2xl border border-blue-200 bg-blue-50 p-5 flex flex-col justify-between shadow-sm", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex justify-between items-start gap-2", children: [_jsxs("div", { children: [_jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-blue-700", children: "Print Labels" }), _jsx("p", { className: "text-sm font-bold text-slate-700 mt-1", children: "Print het QR-overzicht voor de Naharding batch van een specifieke dag of week." })] }), _jsxs("div", { className: "flex bg-white p-0.5 rounded-lg border border-blue-100 shadow-sm shrink-0", children: [_jsx("button", { onClick: () => setViewMode("day"), className: `px-3 py-1.5 rounded-md text-[9px] font-black uppercase transition-all ${viewMode === "day" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`, children: t('bm01.day', 'Dag') }), _jsx("button", { onClick: () => setViewMode("week"), className: `px-3 py-1.5 rounded-md text-[9px] font-black uppercase transition-all ${viewMode === "week" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`, children: t('bm01.week', 'Week') })] })] }), _jsxs("div", { className: "flex justify-between items-end mt-4", children: [_jsxs("p", { className: "text-xs font-bold text-blue-800 bg-blue-100/50 px-3 py-1.5 rounded-lg border border-blue-200 shadow-sm", children: ["Aantal lots: ", _jsx("span", { className: "font-black text-lg ml-1", children: nahardingPrintList.length })] }), _jsxs("div", { className: "flex items-center bg-white p-1.5 rounded-xl shadow-md border-2 border-blue-200 shrink-0", children: [_jsx("button", { onClick: () => setSelectedDate(d => viewMode === 'day' ? subDays(d, 1) : subDays(d, 7)), className: "p-2 hover:bg-blue-50 rounded-lg text-slate-500 hover:text-blue-700 transition-colors", children: _jsx(ChevronLeft, { size: 18 }) }), _jsxs("div", { className: "flex items-center px-4 cursor-pointer select-none min-w-[120px] justify-center", onDoubleClick: () => setSelectedDate(new Date()), title: "Dubbelklik voor vandaag", children: [_jsx(Calendar, { size: 14, className: "text-blue-500 mr-2 inline-block" }), _jsx("span", { className: "font-black text-slate-800 text-xs uppercase tracking-wider", children: viewMode === 'day'
                                                                                ? format(selectedDate, "d MMM", { locale: nl })
                                                                                : `Week ${format(selectedDate, "w")}` })] }), _jsx("button", { onClick: () => setSelectedDate(d => viewMode === 'day' ? addDays(d, 1) : addDays(d, 7)), className: "p-2 hover:bg-blue-50 rounded-lg text-slate-500 hover:text-blue-700 transition-colors", children: _jsx(ChevronRight, { size: 18 }) })] })] })] }), _jsxs("button", { onClick: () => setShowPrintModal(true), disabled: nahardingPrintList.length === 0, className: `mt-4 w-full px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all shadow-sm flex items-center justify-center gap-2 ${nahardingPrintList.length === 0
                                                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                                : "bg-white hover:bg-blue-100 text-blue-700 border-blue-300"}`, children: [_jsx(Printer, { size: 16, className: "inline-block mr-2 -mt-0.5" }), _jsx("span", { children: "QR Print Overzicht" })] })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3", children: nahardingBatchProducts.length === 0 ? (_jsx("div", { className: "h-full flex items-center justify-center text-center opacity-60", children: _jsx("p", { className: "text-xs font-black uppercase tracking-widest text-slate-500", children: nahardingProducts.length === 0
                                        ? t("bm01.naharding_batch_none_total", "Geen lots op Naharding station gevonden.")
                                        : t("bm01.naharding_batch_none", "{{total}} lots op Naharding, maar geen batch-datum bepaald.", { total: nahardingProducts.length }) }) })) : (_jsx("div", { className: "space-y-2", children: nahardingBatchProducts.map((item) => (_jsxs("div", { className: "rounded-xl border border-slate-200 p-3", children: [_jsx("p", { className: "text-sm font-black text-slate-800", children: item.lotNumber || item.id }), _jsxs("p", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1", children: [item.orderId || "-", " | ", item.item || item.itemCode || "-"] })] }, item.id || item.lotNumber))) })) })] })) : (_jsxs("div", { className: "h-full flex flex-col p-4 overflow-y-auto", children: [_jsxs("div", { className: "mb-4 rounded-3xl border-2 border-rose-200 bg-rose-50 px-5 py-4 shadow-sm", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { className: "flex items-center gap-3 text-rose-700", children: [_jsx(AlertTriangle, { size: 20, className: "shrink-0" }), _jsxs("div", { className: "text-left", children: [_jsx("p", { className: "text-xs font-black uppercase tracking-widest leading-none", children: "LN Mismatch" }), _jsx("p", { className: "text-[10px] font-bold opacity-60 mt-1 uppercase", children: "Geleverd vs Goedgekeurd" })] })] }), _jsx("span", { className: "px-2.5 py-1 rounded-xl bg-white border border-rose-200 text-rose-700 text-[11px] font-black italic", children: deliveryInspectionMismatches.length })] }), _jsxs("div", { className: "mt-5 flex flex-wrap gap-2", children: [_jsxs("button", { type: "button", onClick: () => setDeliveryMismatchFilter("all"), className: `px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${deliveryMismatchFilter === "all" ? "bg-white border-rose-300 text-rose-700 shadow-sm" : "bg-rose-100/60 border-rose-200 text-rose-600 hover:bg-white"}`, children: ["Alles (", deliveryInspectionMismatches.length, ")"] }), _jsxs("button", { type: "button", onClick: () => setDeliveryMismatchFilter("over"), className: `px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${deliveryMismatchFilter === "over" ? "bg-white border-orange-300 text-orange-700 shadow-sm" : "bg-rose-100/60 border-rose-200 text-rose-600 hover:bg-white"}`, children: ["LN ", '>', " FF (", deliveryInspectionOverMismatches.length, ")"] }), _jsxs("button", { type: "button", onClick: () => setDeliveryMismatchFilter("under"), className: `px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${deliveryMismatchFilter === "under" ? "bg-white border-amber-300 text-amber-700 shadow-sm" : "bg-rose-100/60 border-rose-200 text-rose-600 hover:bg-white"}`, children: ["LN ", '<', " FF (", deliveryInspectionUnderMismatches.length, ")"] })] })] }), _jsx("div", { className: "space-y-3", children: visibleDeliveryInspectionMismatches.length === 0 ? (_jsxs("div", { className: "rounded-2xl bg-slate-50 border border-dashed border-slate-200 px-6 py-12 text-center", children: [_jsx(CheckCircle2, { size: 40, className: "mx-auto mb-3 text-slate-300" }), _jsx("p", { className: "text-xs font-black uppercase tracking-widest text-slate-400 italic", children: "Geen mismatch-orders gevonden." })] })) : (visibleDeliveryInspectionMismatches.map((entry) => (_jsxs("div", { className: "flex items-center justify-between gap-4 rounded-3xl bg-white border border-slate-100 p-5 shadow-sm hover:border-blue-200 transition-all group", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-base font-black text-slate-800 tracking-tight group-hover:text-blue-600 transition-colors", children: entry.orderId }), _jsx("p", { className: "text-xs font-bold text-slate-500 truncate mt-0.5", children: entry.item })] }), _jsxs("div", { className: "text-right shrink-0", children: [_jsxs("div", { className: "text-xs font-black text-rose-600 uppercase tracking-wider", children: ["LN ", entry.deliveredQty] }), _jsxs("div", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5", children: ["FF ", entry.inspectionApprovedQty] })] })] }, `${entry.orderId}_${entry.item}`)))) })] })) }), showFinishModal && selectedProduct && (_jsx("div", { className: "fixed z-[9999]", children: _jsx(PostProcessingFinishModal, { product: selectedProduct, onClose: handleCloseModal, onConfirm: handlePostProcessingFinish, currentStation: "BM01" }) })), viewingDossier && (_jsx("div", { className: "fixed z-[9999]", children: _jsx(ProductDossierModal, { isOpen: true, product: viewingDossier, onClose: () => setViewingDossier(null), onAddNote: handleAddQcNote, orders: orders, onMoveLot: onMoveLot }) })), showPrintModal && (_jsxs("div", { className: "bm01-print-overlay fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center p-3 md:p-6 animate-in fade-in print:block print:static print:bg-white print:p-0 print:backdrop-blur-0", onClick: () => setShowPrintModal(false), children: [_jsx("style", { children: `
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
                        ` }), _jsx("div", { className: "bm01-print-dialog w-full max-w-6xl max-h-[92vh] bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden print:max-h-none print:overflow-visible print:max-w-none print:rounded-none print:border-0 print:shadow-none", onClick: (e) => e.stopPropagation(), children: _jsxs("div", { className: "bm01-qr-print-sheet p-5 md:p-8 overflow-y-auto max-h-[92vh] print:max-h-none print:overflow-visible print:p-0 print:max-w-none", children: [_jsxs("div", { className: "flex justify-between items-center mb-8 print:hidden", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-black uppercase italic text-slate-900", children: t('bm01.daily_overview') }), _jsx("p", { className: "text-slate-500 font-bold", children: format(selectedDate, "EEEE d MMMM yyyy", { locale: nl }) })] }), _jsxs("div", { className: "flex items-center gap-6", children: [_jsxs("div", { className: "bg-slate-100 px-4 py-2 rounded-xl border border-slate-200 text-right", children: [_jsx("span", { className: "text-[10px] font-black uppercase tracking-widest text-slate-500 block", children: "Aantal lots" }), _jsx("span", { className: "text-2xl font-black text-slate-800 leading-none", children: (activeTab === "naharding_batch" ? nahardingPrintList : completedProducts).length })] }), _jsxs("div", { className: "flex gap-4", children: [_jsxs("button", { onClick: handlePrintQrOverview, className: "flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 shadow-lg", children: [_jsx(Printer, { size: 16 }), " ", t('bm01.print_pdf')] }), _jsx("button", { onClick: () => setShowPrintModal(false), className: "p-3 hover:bg-slate-100 rounded-xl text-slate-500", children: _jsx(X, { size: 24 }) })] })] })] }), _jsxs("div", { className: "hidden print:flex mb-8 border-b-2 border-slate-900 pb-4 justify-between items-end", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-black uppercase", children: activeTab === "naharding_batch" ? t('bm01.naharding_overview', 'QR Overzicht Naharding') : t('bm01.daily_overview_offered') }), _jsx("p", { className: "text-lg", children: format(selectedDate, "EEEE d MMMM yyyy", { locale: nl }) })] }), _jsxs("div", { className: "text-right", children: [_jsx("span", { className: "text-slate-500 text-sm font-bold uppercase tracking-widest", children: "Aantal lots:" }), _jsx("span", { className: "ml-2 text-3xl font-black text-slate-900", children: (activeTab === "naharding_batch" ? nahardingPrintList : completedProducts).length })] })] }), _jsx("div", { className: `space-y-6 ${activeTab === "naharding_batch" ? "print:space-y-0 print:grid print:grid-cols-2 print:gap-y-4 print:gap-x-4 print:content-start" : "print:space-y-0"}`, children: (activeTab === "naharding_batch" ? nahardingPrintList : completedProducts).length === 0 ? (_jsx("p", { className: "text-center text-slate-400 italic py-10", children: t('bm01.no_products_date') })) : (activeTab === "naharding_batch" ? (nahardingPrintList.map((item, index) => {
                                        const isFirstOfOrder = index === 0 || nahardingPrintList[index - 1].orderId !== item.orderId;
                                        return (_jsxs("div", { className: "border-b border-slate-200 pb-6 mb-6 break-inside-avoid print:border print:border-slate-300 print:p-2 print:mb-0 print:rounded-lg print:pb-1 print:break-inside-avoid", children: [_jsxs("div", { className: "flex justify-between items-start mb-4 print:mb-1", children: [_jsxs("div", { className: "min-w-0 overflow-hidden", children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsxs("span", { className: "text-xs font-black text-slate-400 uppercase print:text-[8px]", children: ["#", index + 1] }), _jsx("span", { className: "hidden print:inline text-[8px] font-bold text-slate-500 truncate", children: item.itemCode })] }), _jsx("h3", { className: "text-xl font-black text-slate-900 print:text-xs print:leading-tight truncate", children: item.item }), _jsx("p", { className: "text-sm text-slate-500 font-bold print:hidden", children: item.itemCode })] }), _jsx("div", { className: "text-right shrink-0 ml-1", children: _jsx("span", { className: "block text-sm font-bold text-slate-900 print:text-[8px]", children: item.timestamps?.finished ? format(item.timestamps.finished.toDate ? item.timestamps.finished.toDate() : new Date(item.timestamps.finished), "HH:mm") : "--:--" }) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-8 print:gap-2", children: [isFirstOfOrder ? (_jsxs("div", { className: "flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 print:border-0 print:bg-transparent print:p-0 print:gap-2", children: [_jsx(InternalQrImage, { value: item.orderId, size: 240, alt: `QR Order ${item.orderId}`, className: "w-24 h-24 mix-blend-multiply print:w-10 print:h-10" }), _jsxs("div", { className: "min-w-0 overflow-hidden", children: [_jsx("span", { className: "block text-[10px] font-black text-slate-400 uppercase tracking-widest print:hidden", children: t('bm01.order_number') }), _jsx("span", { className: "block text-xl font-black font-mono text-slate-900 print:text-[10px] truncate", children: item.orderId })] })] })) : (_jsx("div", {})), _jsxs("div", { className: "flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 print:border-0 print:bg-transparent print:p-0 print:gap-2", children: [_jsx(InternalQrImage, { value: item.lotNumber, size: 240, alt: `QR Lot ${item.lotNumber}`, className: "w-24 h-24 mix-blend-multiply print:w-10 print:h-10" }), _jsxs("div", { className: "min-w-0 overflow-hidden", children: [_jsx("span", { className: "block text-[10px] font-black text-slate-400 uppercase tracking-widest print:hidden", children: t('bm01.lot_number') }), _jsx("span", { className: "block text-xl font-black font-mono text-slate-900 break-all print:text-[10px] truncate", children: item.lotNumber })] })] })] })] }, item.id));
                                    })) : (_jsxs("table", { className: "w-full border-collapse text-left text-sm print:text-[10px]", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b-2 border-slate-200", children: [_jsx("th", { className: "py-2 px-2 text-slate-500 uppercase", children: "#" }), _jsx("th", { className: "py-2 px-2 text-slate-500 uppercase", children: "Lotnummer" }), _jsx("th", { className: "py-2 px-2 text-slate-500 uppercase", children: "Ordernummer" }), _jsx("th", { className: "py-2 px-2 text-slate-500 uppercase", children: "Product" }), _jsx("th", { className: "py-2 px-2 text-slate-500 uppercase", children: "Tijd" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100", children: completedProducts.map((item, index) => {
                                                    const date = item.timestamps?.finished?.toDate ? item.timestamps.finished.toDate() : new Date(item.timestamps?.finished || item.updatedAt);
                                                    return (_jsxs("tr", { className: "hover:bg-slate-50", children: [_jsx("td", { className: "py-3 px-2 font-bold text-slate-400", children: index + 1 }), _jsx("td", { className: "py-3 px-2 font-black text-slate-800", children: item.lotNumber }), _jsx("td", { className: "py-3 px-2 font-mono text-slate-600", children: item.orderId }), _jsx("td", { className: "py-3 px-2 text-slate-700 truncate max-w-[200px]", title: item.item, children: item.item }), _jsx("td", { className: "py-3 px-2 font-bold text-slate-500", children: isValid(date) ? format(date, "HH:mm") : "--:--" })] }, item.id));
                                                }) })] }))) })] }) })] }))] }));
});
export default BM01Hub;
