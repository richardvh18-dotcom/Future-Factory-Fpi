import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { updatePlanningOrderPriority } from "../../../services/planningSecurityService";
import React, { useState, useMemo, useRef, useEffect as useResizeEffect } from "react";
import { X, Info, Ruler, ShieldCheck, Box, History, Activity, FileText, AlertTriangle, Plus, ArrowRightLeft, RefreshCw, Loader2, Star, Zap, Eye, EyeOff, Printer, } from "lucide-react";
import StatusBadge from "../common/StatusBadge";
import { WORKSTATIONS, REJECTION_REASONS } from "../../../utils/workstationLogic";
import { format } from "date-fns";
import { findDrawingForOrder, syncOrderDrawing } from "../../../utils/drawingLinker";
import { collection, query, where, getDocs, getDoc, doc, limit } from "firebase/firestore";
import { db, logActivity } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";
import { useAdminAuth } from "../../../hooks/useAdminAuth";
import ProductDetailModal from "../../products/ProductDetailModal";
import LabelVisualPreview from "../../printer/LabelVisualPreview";
import { useLabelPreview } from "../../../hooks/useLabelPreview";
import ConfirmationModal from "./ConfirmationModal.tsx";
import { formatDateTimeSafe, toDateSafe } from "../../../utils/dateUtils";
import { useNotifications } from '../../../contexts/NotificationContext';
import { rejectTrackedProductFinal, queuePrintJob, restoreArchivedTrackedProduct, } from "../../../services/planningSecurityService";
/**
 * ProductDossierModal: Toont proces-stappen, kwaliteitsmetingen en order-info.
 * Ondersteunt nu ook het toevoegen van QC rapporten/klachten en het verplaatsen van producten.
 */
const ProductDossierModal = ({ isOpen, product, onClose, orders = [], onAddNote, onMoveLot, }) => {
    const { notify } = useNotifications();
    const [newNote, setNewNote] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [isMoving, setIsMoving] = useState(false);
    const [targetStation, setTargetStation] = useState("");
    const [repairInstruction, setRepairInstruction] = useState("");
    const [overrideLoading, setOverrideLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [catalogProduct, setCatalogProduct] = useState(null);
    const [loadingCatalog, setLoadingCatalog] = useState(false);
    const [historyWithOperators, setHistoryWithOperators] = useState([]);
    const [isReprinting, setIsReprinting] = useState(false);
    const [reprintQuantity, setReprintQuantity] = useState("1");
    const [showLabelPreview, setShowLabelPreview] = useState(false);
    const [resolvedLabelZPL, setResolvedLabelZPL] = useState("");
    const [resolvedLabelTemplateId, setResolvedLabelTemplateId] = useState(null);
    const [isResolvingLabel, setIsResolvingLabel] = useState(false);
    const { role, user } = useAdminAuth();
    const canEditPriority = ["admin", "teamleader"].includes(role);
    const [showConfirmMove, setShowConfirmMove] = useState(false);
    const [showConfirmReject, setShowConfirmReject] = useState(false);
    const [rejectLoading, setRejectLoading] = useState(false);
    const [rejectReasons, setRejectReasons] = useState([]);
    const [rejectNote, setRejectNote] = useState("");
    const [previewZoom, setPreviewZoom] = useState(1);
    const previewContainerRef = useRef(null);
    const _DOSSIER_PPM = 3.78;
    const labelProductData = useMemo(() => product ? {
        ...product,
        orderNumber: product.orderId || product.orderNumber,
        lotNumber: product.lotNumber,
        item: product.item,
    } : {}, [product]);
    const { selectedLabel: dossierLabel, previewData: dossierPreviewData } = useLabelPreview(labelProductData, resolvedLabelTemplateId);
    useResizeEffect(() => {
        const el = previewContainerRef.current;
        if (!el || !dossierLabel)
            return;
        const recalc = () => {
            const W = el.clientWidth - 24;
            const H = Math.max(el.clientHeight - 24, 120);
            const lW = dossierLabel.width * _DOSSIER_PPM;
            const lH = dossierLabel.height * _DOSSIER_PPM;
            if (lW > 0 && lH > 0)
                setPreviewZoom(Math.min(2, W / lW, H / lH));
        };
        recalc();
        const ro = new ResizeObserver(recalc);
        ro.observe(el);
        return () => ro.disconnect();
    }, [dossierLabel, showLabelPreview]);
    const isTijdelijkeAfkeur = product?.inspection?.status === "Tijdelijke afkeur";
    const isArchivedProduct = Boolean(product?.archived || product?.isArchivedOrder || product?.archivedAt);
    const REJECTION_REASON_LABELS = {
        "rejection.surfaceDamage": "Oppervlakteschade",
        "rejection.dimensionDeviation": "Maatafwijking (TW/TF/W)",
        "rejection.qualityInsufficient": "Kwaliteit onvoldoende",
        "rejection.incorrectLabel": "Onjuist label",
        "rejection.linerDamaged": "Liner beschadigd",
        "rejection.other": "Overig",
    };
    const toggleRejectReason = (reason) => {
        setRejectReasons((prev) => prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]);
    };
    const handleDrawingSync = async () => {
        const hasCode = parentOrder.itemCode || parentOrder.item || parentOrder.productId || parentOrder.manufacturedId || parentOrder.articleCode;
        if (!hasCode)
            return;
        setIsSyncing(true);
        const drawing = await findDrawingForOrder(parentOrder);
        if (drawing) {
            await syncOrderDrawing(parentOrder.id, drawing);
        }
        else {
            console.warn("[Dossier Sync] Geen tekening gevonden voor order:", parentOrder.id, { itemCode: parentOrder.itemCode, item: parentOrder.item, productId: parentOrder.productId });
        }
        setIsSyncing(false);
    };
    const handleSetPriority = async (level) => {
        const parentOrderDocId = parentOrder.__docPath || parentOrder.id;
        if (!parentOrderDocId)
            return;
        // Toggle logic: als huidge priority gelijk is aan gekozen level, zet uit (false)
        const currentPrio = parentOrder.priority === true
            ? "high"
            : String(parentOrder.priority || "").toLowerCase().trim();
        const newPriority = currentPrio === level ? false : level;
        try {
            await updatePlanningOrderPriority({
                orderDocId: parentOrderDocId,
                priority: newPriority,
                productDocId: product.id || "",
                source: "ProductDossierModal",
                actorLabel: user?.email || role || "Admin",
            });
            await logActivity(user?.uid || "system", "ORDER_PRIORITY_UPDATE", `Dossier prioriteit gewijzigd: order ${parentOrder.id || displayOrderId}, naar ${newPriority || "normaal"}`);
        }
        catch (e) {
            console.error("Fout bij wijzigen prioriteit:", e);
        }
    };
    if (!isOpen || !product)
        return null;
    const productOrderId = product.orderId ||
        product.order ||
        product.orderNumber ||
        product.orderNr ||
        product.parentOrderId ||
        "";
    const parentOrder = orders.find((o) => {
        const orderKeys = [o.orderId, o.order, o.orderNumber, o.orderNr, o.id]
            .filter(Boolean)
            .map((v) => String(v));
        return orderKeys.includes(String(productOrderId));
    }) ||
        {};
    const displayOrderId = productOrderId ||
        parentOrder.orderId ||
        parentOrder.orderNumber ||
        parentOrder.order ||
        parentOrder.orderNr ||
        parentOrder.id ||
        "-";
    const hasDrawing = parentOrder.drawing && parentOrder.drawing !== "-" && parentOrder.drawing !== "";
    const effectiveLabelZPL = String(resolvedLabelZPL || product?.labelZPL || "").trim();
    const normalizedParentPriority = parentOrder.priority === true
        ? "high"
        : String(parentOrder.priority || "").toLowerCase().trim();
    React.useEffect(() => {
        const resolveLabelFromQueue = async () => {
            if (!isOpen || !product)
                return;
            const directZpl = String(product?.labelZPL || "").trim();
            if (directZpl) {
                setResolvedLabelZPL(directZpl);
                setResolvedLabelTemplateId(product?.labelTemplateId || null);
                return;
            }
            const lot = String(product?.lotNumber || product?.id || "").trim();
            const order = String(product?.orderId || productOrderId || "").trim();
            if (!lot && !order) {
                setResolvedLabelZPL("");
                setResolvedLabelTemplateId(null);
                return;
            }
            setIsResolvingLabel(true);
            try {
                const queuePath = PATHS?.PRINT_QUEUE || ["future-factory", "production", "print_queue"];
                const queueRef = collection(db, ...queuePath);
                const calls = [];
                if (lot)
                    calls.push(getDocs(query(queueRef, where("metadata.lotNumber", "==", lot), limit(20))));
                if (order)
                    calls.push(getDocs(query(queueRef, where("metadata.orderId", "==", order), limit(20))));
                const snaps = await Promise.all(calls);
                const candidates = snaps.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
                const uniqueById = new Map(candidates.map((c) => [c.id, c]));
                const best = Array.from(uniqueById.values())
                    .filter((j) => String(j?.zpl || j?.printData || "").trim())
                    .sort((a, b) => {
                    const ta = a?.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                    const tb = b?.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                    return tb - ta;
                })[0];
                setResolvedLabelZPL(String(best?.zpl || best?.printData || "").trim());
                setResolvedLabelTemplateId(best?.metadata?.templateId || null);
            }
            catch (e) {
                console.warn("Kon labeldata niet uit print queue ophalen:", e);
                setResolvedLabelZPL("");
                setResolvedLabelTemplateId(null);
            }
            finally {
                setIsResolvingLabel(false);
            }
        };
        resolveLabelFromQueue();
    }, [isOpen, product, productOrderId]);
    React.useEffect(() => {
        if (!isOpen)
            return;
        setShowLabelPreview(false);
    }, [isOpen, product?.id, product?.lotNumber]);
    const handleOpenDetail = async () => {
        if (!hasDrawing)
            return;
        setLoadingCatalog(true);
        try {
            const productsRef = collection(db, ...PATHS.PRODUCTS);
            const drawingId = parentOrder.drawing;
            // Eerst probeer direct op document ID (manualSyncDrawings slaat product ID op)
            const directRef = doc(db, ...PATHS.PRODUCTS, drawingId);
            const directSnap = await getDoc(directRef);
            if (directSnap.exists()) {
                setCatalogProduct({ id: directSnap.id, ...directSnap.data() });
                setShowDetailModal(true);
            }
            else {
                // Fallback: zoek op articleCode
                const q = query(productsRef, where("articleCode", "==", drawingId));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    setCatalogProduct({ id: snap.docs[0].id, ...snap.docs[0].data() });
                    setShowDetailModal(true);
                }
                else {
                    // Materiaalvariant fallback: CST(C) ↔ EST(E) op positie 6
                    const upper = drawingId.toUpperCase();
                    let variantCode = null;
                    if (upper.length >= 8) {
                        if (upper[6] === "C")
                            variantCode = upper.slice(0, 6) + "E" + upper.slice(7);
                        else if (upper[6] === "E")
                            variantCode = upper.slice(0, 6) + "C" + upper.slice(7);
                    }
                    if (variantCode) {
                        const vq = query(productsRef, where("articleCode", "==", variantCode));
                        const vSnap = await getDocs(vq);
                        if (!vSnap.empty) {
                            setCatalogProduct({ id: vSnap.docs[0].id, ...vSnap.docs[0].data() });
                            setShowDetailModal(true);
                        }
                        else {
                            notify("Geen product gevonden in catalogus met deze tekening.");
                        }
                    }
                    else {
                        notify("Geen product gevonden in catalogus met deze tekening.");
                    }
                }
            }
        }
        catch (e) {
            console.error("Fout bij openen product detail:", e);
        }
        finally {
            setLoadingCatalog(false);
        }
    };
    // FIX: Stations lijst opschonen (BH31 toevoegen, dubbele BM01 verwijderen)
    const sortedStations = useMemo(() => {
        const stations = [...WORKSTATIONS];
        // Check of BH31 ontbreekt en voeg toe
        if (!stations.find(s => s.id === "BH31")) {
            stations.push({ id: "BH31", name: "BH31" });
        }
        // Filter "Station BM01" en duplicaten
        const uniqueStations = stations.filter((s, index, self) => index === self.findIndex((t) => t.id === s.id) &&
            s.id !== "Station BM01" && s.name !== "Station BM01");
        return uniqueStations.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    }, []);
    const moveStations = useMemo(() => {
        if (isArchivedProduct) {
            const allowed = new Set(["BH31", "Nabewerking", "BM01"]);
            return sortedStations.filter((s) => allowed.has(s.id));
        }
        if (!isTijdelijkeAfkeur)
            return sortedStations;
        const allowed = new Set(["BH31", "Nabewerking", "LOSSEN"]);
        return sortedStations.filter((s) => allowed.has(s.id));
    }, [isArchivedProduct, isTijdelijkeAfkeur, sortedStations]);
    // Effect: Verrijk historie met operator data uit occupancy als deze ontbreekt
    React.useEffect(() => {
        const enrichHistory = async () => {
            if (!product?.history) {
                setHistoryWithOperators([]);
                return;
            }
            const enriched = await Promise.all(product.history.map(async (entry) => {
                // Als operator al bekend is in de entry, gebruik die
                if (entry.operator || entry.operatorNumber || entry.operatorName)
                    return entry;
                // Als we geen station of tijd hebben, kunnen we niet zoeken
                if (!entry.station || (!entry.timestamp && !entry.time))
                    return entry;
                try {
                    const ts = toDateSafe(entry.timestamp || entry.time);
                    if (!ts || isNaN(ts.getTime()))
                        return entry;
                    const dateStr = ts.toISOString().split('T')[0];
                    const station = entry.station;
                    // Zoek in occupancy (eerst exact, dan uppercase)
                    let q = query(collection(db, ...PATHS.OCCUPANCY), where("date", "==", dateStr), where("machineId", "==", station));
                    let snap = await getDocs(q);
                    if (snap.empty) {
                        q = query(collection(db, ...PATHS.OCCUPANCY), where("date", "==", dateStr), where("machineId", "==", station.toUpperCase()));
                        snap = await getDocs(q);
                    }
                    if (!snap.empty) {
                        const opData = snap.docs[0].data();
                        return { ...entry, operatorName: opData.operatorName, operatorNumber: opData.operatorNumber };
                    }
                }
                catch (e) {
                    console.warn("Kon historie niet verrijken:", e);
                }
                return entry;
            }));
            setHistoryWithOperators(enriched);
        };
        enrichHistory();
    }, [product, isOpen]);
    const formatDeadline = (val) => {
        const date = toDateSafe(val);
        if (date)
            return format(date, "dd-MM-yyyy");
        return String(val);
    };
    const handleDefinitiveRejection = async () => {
        if (!product?.id || rejectReasons.length === 0)
            return;
        setRejectLoading(true);
        const reasonLabels = rejectReasons.map(r => REJECTION_REASON_LABELS[r] || r).join(", ");
        try {
            await rejectTrackedProductFinal({
                productId: product.id,
                reasons: rejectReasons,
                note: rejectNote || "",
                source: "ProductDossierModal",
                actorLabel: role || "Systeem",
            });
            await logActivity(user?.uid || "system", "QUALITY_REJECT_FINAL", `Definitieve afkeur: lot ${product.lotNumber || product.id}, order ${displayOrderId}, redenen: ${reasonLabels}${rejectNote ? `; opmerking: ${rejectNote}` : ""}`);
        }
        catch (err) {
            console.error("Fout bij definitieve afkeur:", err);
        }
        finally {
            setRejectLoading(false);
            setShowConfirmReject(false);
            setRejectReasons([]);
            setRejectNote("");
            onClose();
        }
    };
    const handleExecuteMove = async () => {
        if (!targetStation)
            return;
        const productMoveIdentifier = String(isArchivedProduct
            ? product?.archiveDocId || product?.lotNumber || product?.sourceDataId || product?.id || ""
            : product?.sourcePath || product?.__docPath || product?.id || product?.lotNumber || "").trim();
        if (!productMoveIdentifier)
            return;
        const restoreRouteMap = {
            BH31: "BH31",
            NABEWERKING: "NABEWERKING",
            BM01: "BM01",
        };
        const restoreTargetRoute = restoreRouteMap[String(targetStation || "").trim().toUpperCase()] || null;
        setOverrideLoading(true);
        try {
            if (isArchivedProduct) {
                if (!restoreTargetRoute) {
                    throw new Error("Gearchiveerde producten kunnen alleen worden heropend naar BH31, Nabewerking of BM01.");
                }
                await restoreArchivedTrackedProduct({
                    productId: productMoveIdentifier,
                    targetRoute: restoreTargetRoute,
                    note: repairInstruction.trim(),
                    sourceContext: "TEAMLEADER_FULL_LIST",
                });
            }
            else {
                await onMoveLot(productMoveIdentifier, targetStation, {
                    isRepairMove: isTijdelijkeAfkeur,
                    repairInstruction: repairInstruction.trim(),
                });
            }
            // Planning order machine/week updates lopen nu server-side via moveTrackedProductManual callable.
            await logActivity(user?.uid || "system", isArchivedProduct ? "ARCHIVED_LOT_RESTORE" : "LOT_MANUAL_MOVE", `${isArchivedProduct ? "Heropend uit archief" : isTijdelijkeAfkeur ? "Reparatie verplaatsing" : "Handmatige verplaatsing"}: lot ${product.lotNumber || product.id} -> ${targetStation} (order ${displayOrderId})${repairInstruction.trim() ? ` | instructie: ${repairInstruction.trim()}` : ""}`);
            setIsMoving(false);
            setRepairInstruction("");
            onClose();
        }
        finally {
            setOverrideLoading(false);
        }
    };
    const printerHasStation = (printer, station) => {
        if (!printer || !station)
            return false;
        const linked = Array.isArray(printer.linkedStations) ? printer.linkedStations : [];
        const queue = Array.isArray(printer.queueStations) ? printer.queueStations : [];
        return [...linked, ...queue].includes(station);
    };
    const handleReprintLabel = async () => {
        const zplToReprint = String(effectiveLabelZPL || "").trim();
        if (!zplToReprint) {
            notify("Geen labeldata gevonden om te herprinten.");
            return;
        }
        setIsReprinting(true);
        try {
            const BM01_STATION = "BM01";
            const quantity = Math.max(1, parseInt(reprintQuantity, 10) || 1);
            const prnPaths = PATHS?.PRINTERS || ["future-factory", "settings", "printers"];
            const snap = await getDocs(collection(db, ...prnPaths));
            const printers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const stationPrinter = printers.find((p) => printerHasStation(p, BM01_STATION));
            const fallbackDefault = printers.find((p) => p.isDefault);
            const targetPrinter = stationPrinter || fallbackDefault || null;
            if (!targetPrinter) {
                throw new Error("Geen BM01/default printer gevonden in Printer Beheer.");
            }
            await queuePrintJob(targetPrinter.id, zplToReprint, {
                description: `Herprint label voor ${displayOrderId} (Lot: ${product.lotNumber || product.id || "-"}) (x${quantity})`,
                quantity,
                orderId: displayOrderId,
                lotNumber: product.lotNumber || product.id || null,
                stationId: BM01_STATION,
                templateId: product.labelTemplateId || resolvedLabelTemplateId || null,
                targetPrinterName: targetPrinter.name || targetPrinter.id,
                source: "product_dossier_reprint",
            });
            await logActivity(user?.uid || "system", "LABEL_REPRINT", `Herprint aangevraagd: order ${displayOrderId}, lot ${product.lotNumber || product.id || "-"}, printer ${targetPrinter.id}, aantal ${quantity}`);
            notify(`${quantity} herprint(s) naar wachtrij gestuurd (${targetPrinter.name || targetPrinter.id}) via station BM01.`);
        }
        catch (e) {
            console.error("Herprint mislukt:", e);
            notify(`Herprint mislukt: ${e.message}`);
        }
        finally {
            setIsReprinting(false);
        }
    };
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[250] flex items-center justify-center p-4 lg:p-10 animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-5xl rounded-[50px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh] text-left", children: [_jsxs("div", { className: "p-10 bg-slate-900 text-white flex justify-between items-center shrink-0", children: [_jsxs("div", { className: "flex items-center gap-6", children: [_jsx("div", { className: "p-4 bg-blue-500 rounded-3xl shadow-lg", children: _jsx(Box, { size: 32 }) }), _jsxs("div", { children: [_jsxs("h3", { className: "text-3xl font-black italic uppercase tracking-tight text-left", children: ["Product ", _jsx("span", { className: "text-blue-400", children: "Dossier" })] }), _jsxs("div", { className: "text-left mt-1", children: [_jsxs("p", { className: "text-xs font-bold text-slate-400 uppercase tracking-widest", children: ["Lotnummer: ", product.lotNumber] }), _jsx("p", { className: "text-lg font-black text-white uppercase italic leading-none mt-1", children: product.item || parentOrder.item || "Onbekend Item" }), (product.extraCode || parentOrder.extraCode) && (_jsxs("p", { className: "text-xs font-bold text-blue-600 uppercase tracking-wider mt-1", children: ["Code: ", product.extraCode || parentOrder.extraCode] })), (parentOrder.priority || parentOrder.isMoved) && (_jsxs("p", { className: `text-xs font-bold uppercase tracking-wider mt-1 flex items-center gap-1 ${normalizedParentPriority === "immediate" ? "text-rose-500" :
                                                                normalizedParentPriority === "urgent" ? "text-orange-500" :
                                                                    "text-amber-400"}`, children: [_jsx(ArrowRightLeft, { size: 12 }), parentOrder.isMoved ? "Verplaatst" : "", parentOrder.isMoved && parentOrder.priority ? " & " : "", normalizedParentPriority === "immediate" ? "1e Prio" :
                                                                    normalizedParentPriority === "urgent" ? "Spoed" :
                                                                        (normalizedParentPriority === "high" || parentOrder.priority === true) ? "Prio" : ""] })), canEditPriority && parentOrder.id && (_jsxs("div", { className: "flex flex-wrap gap-2 mt-2", children: [_jsxs("button", { onClick: () => handleSetPriority("high"), className: `px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${normalizedParentPriority === "high" || parentOrder.priority === true
                                                                        ? "bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20"
                                                                        : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10"}`, children: [_jsx(Star, { size: 12, fill: normalizedParentPriority === "high" || parentOrder.priority === true ? "currentColor" : "none" }), "Prio"] }), _jsxs("button", { onClick: () => handleSetPriority("urgent"), className: `px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${normalizedParentPriority === "urgent"
                                                                        ? "bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20"
                                                                        : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10"}`, children: [_jsx(AlertTriangle, { size: 12, fill: normalizedParentPriority === "urgent" ? "currentColor" : "none" }), "Spoed"] }), _jsxs("button", { onClick: () => handleSetPriority("immediate"), className: `px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${normalizedParentPriority === "immediate"
                                                                        ? "bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/20"
                                                                        : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10"}`, children: [_jsx(Zap, { size: 12, fill: normalizedParentPriority === "immediate" ? "currentColor" : "none" }), "1e Prio"] })] }))] })] })] }), _jsx("button", { onClick: onClose, className: "p-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl transition-all", children: _jsx(X, { size: 28 }) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-10 custom-scrollbar space-y-10", children: [_jsxs("section", { className: "grid grid-cols-1 lg:grid-cols-4 gap-6 bg-blue-50/50 p-8 rounded-[40px] border border-blue-100", children: [_jsxs("div", { className: "lg:col-span-4 flex items-center gap-2 mb-2", children: [_jsx("button", { onClick: handleOpenDetail, disabled: !hasDrawing || loadingCatalog, className: `p-1 -ml-1 rounded-lg transition-all ${hasDrawing
                                                        ? "hover:bg-blue-100 cursor-pointer text-blue-600"
                                                        : "cursor-default text-blue-600"}`, title: hasDrawing ? "Open Product Detail" : "", children: loadingCatalog ? _jsx(Loader2, { size: 18, className: "animate-spin" }) : _jsx(FileText, { size: 18 }) }), _jsx("h4", { className: "font-black text-xs uppercase text-blue-900 tracking-widest", children: "Order Informatie" })] }), _jsxs("div", { children: [_jsx("span", { className: "text-[9px] font-black text-blue-400 uppercase", children: "Order" }), _jsx("p", { className: "text-sm font-bold text-slate-800", children: displayOrderId })] }), _jsxs("div", { children: [_jsx("span", { className: "text-[9px] font-black text-blue-400 uppercase", children: "Klant" }), _jsx("p", { className: "text-sm font-bold text-slate-800", children: parentOrder.customer || "-" })] }), _jsxs("div", { children: [_jsx("span", { className: "text-[9px] font-black text-blue-400 uppercase", children: "Project" }), _jsx("p", { className: "text-sm font-bold text-slate-800", children: parentOrder.project || "-" })] }), _jsxs("div", { children: [_jsxs("span", { className: "text-[9px] font-black text-blue-400 uppercase flex items-center gap-2", children: ["Tekening", (!parentOrder.drawing || parentOrder.drawing === "-" || parentOrder.drawing === "") && (_jsx("button", { onClick: handleDrawingSync, disabled: isSyncing, className: "p-1 hover:bg-blue-100 rounded-full transition-colors", title: "Zoek tekening in catalogus", children: _jsx(RefreshCw, { size: 10, className: isSyncing ? "animate-spin text-blue-600" : "text-slate-400" }) }))] }), _jsx("p", { className: "text-sm font-bold text-slate-800", children: parentOrder.drawing || "-" })] }), _jsxs("div", { children: [_jsx("span", { className: "text-[9px] font-black text-blue-400 uppercase", children: "Deadline" }), _jsx("p", { className: "text-sm font-bold text-slate-800", children: formatDeadline(parentOrder.deliveryDate) })] }), _jsxs("div", { children: [_jsx("span", { className: "text-[9px] font-black text-blue-400 uppercase", children: "Start Productie" }), _jsx("p", { className: "text-sm font-bold text-slate-800", children: formatDeadline(product.startTime || product.createdAt) })] }), parentOrder.notes && (_jsxs("div", { className: "lg:col-span-4 mt-2 pt-4 border-t border-blue-200/50", children: [_jsx("span", { className: "text-[9px] font-black text-blue-400 uppercase", children: "PO Text / Opmerkingen" }), _jsx("p", { className: "text-sm font-medium text-slate-700 italic", children: parentOrder.notes })] })), _jsxs("div", { className: "lg:col-span-4 mt-4 pt-4 border-t border-blue-200/50", children: [_jsx("h4", { className: "text-[9px] font-black text-blue-400 uppercase mb-2", children: "Label (Her)print" }), isResolvingLabel ? (_jsxs("div", { className: "bg-white/60 p-4 rounded-lg border border-blue-100/50 text-xs font-bold text-slate-500 flex items-center gap-2", children: [_jsx(Loader2, { size: 14, className: "animate-spin" }), " Labelgegevens laden..."] })) : effectiveLabelZPL ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "bg-white/60 rounded-lg p-3 border border-blue-100/50 flex flex-wrap items-center gap-2", children: [_jsxs("select", { value: reprintQuantity, onChange: (e) => setReprintQuantity(e.target.value), disabled: isReprinting, className: "text-[10px] font-bold text-slate-700 bg-white/90 border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50", title: "Aantal herprints", children: [_jsx("option", { value: "1", children: "1x" }), _jsx("option", { value: "2", children: "2x" }), _jsx("option", { value: "5", children: "5x" }), _jsx("option", { value: "10", children: "10x" })] }), _jsxs("button", { onClick: handleReprintLabel, disabled: isReprinting, className: "text-[10px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 transition-colors bg-emerald-100/80 hover:bg-emerald-200/80 px-2 py-1 rounded-md disabled:opacity-50", title: "Herprint label via BM01 (Print Queue)", children: [isReprinting ? _jsx(Loader2, { size: 12, className: "animate-spin" }) : _jsx(Printer, { size: 12 }), isReprinting ? "Verzenden..." : "Herprint BM01"] }), _jsxs("button", { onClick: () => setShowLabelPreview((prev) => !prev), className: "text-[10px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 transition-colors bg-blue-100/80 hover:bg-blue-200/80 px-2 py-1 rounded-md", title: showLabelPreview ? "Verberg label voorbeeld" : "Toon label voorbeeld", children: [showLabelPreview ? _jsx(EyeOff, { size: 12 }) : _jsx(Eye, { size: 12 }), showLabelPreview ? "Verberg voorbeeld" : "Toon voorbeeld"] })] }), showLabelPreview && (_jsx("div", { ref: previewContainerRef, className: "mt-3 bg-white/60 p-3 rounded-lg border border-blue-100/50 flex items-center justify-center overflow-hidden min-h-[140px]", children: dossierLabel ? (_jsx(LabelVisualPreview, { label: dossierLabel, data: dossierPreviewData, zoom: previewZoom, className: "shadow-md" })) : isResolvingLabel ? (_jsx("span", { className: "text-xs text-slate-400 font-bold uppercase tracking-widest", children: "Laden..." })) : (_jsx("span", { className: "text-xs text-slate-400 font-bold uppercase tracking-widest", children: "Geen labeltemplate beschikbaar" })) }))] })) : (_jsxs("div", { className: "bg-white/60 p-4 rounded-lg border border-blue-100/50 flex items-center justify-between gap-3", children: [_jsx("span", { className: "text-xs font-bold text-slate-500", children: "Geen opgeslagen label gevonden voor dit product." }), _jsx("button", { onClick: handleReprintLabel, disabled: true, className: "text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md cursor-not-allowed", title: "Geen labeldata beschikbaar", children: "Herprint BM01" })] }))] })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [_jsxs("div", { className: "p-6 bg-slate-50 rounded-[32px] border border-slate-100", children: [_jsx("span", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4", children: "Huidige Fase" }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "p-2 bg-blue-100 text-blue-600 rounded-xl", children: _jsx(Activity, { size: 20 }) }), _jsx("span", { className: "text-lg font-black text-slate-800 uppercase italic", children: product.currentStep })] })] }), _jsxs("div", { className: "p-6 bg-slate-50 rounded-[32px] border border-slate-100", children: [_jsx("span", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4", children: "Kwaliteit Status" }), _jsx(StatusBadge, { status: product.inspection?.status || "Niet gecontroleerd" })] })] }), (product.note ||
                                    product.measurements ||
                                    (product.inspection && product.inspection.reasons)) && (_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [product.note && (_jsxs("div", { className: "p-6 bg-amber-50 rounded-[32px] border border-amber-100", children: [_jsxs("span", { className: "text-[10px] font-black text-amber-400 uppercase tracking-widest block mb-2 flex items-center gap-2", children: [_jsx(Info, { size: 14 }), " Opmerking"] }), _jsxs("p", { className: "text-sm font-medium text-slate-700 italic", children: ["\"", product.note, "\""] })] })), product.inspection?.reasons &&
                                            product.inspection.reasons.length > 0 && (_jsxs("div", { className: "p-6 bg-rose-50 rounded-[32px] border border-rose-100", children: [_jsxs("span", { className: "text-[10px] font-black text-rose-400 uppercase tracking-widest block mb-2 flex items-center gap-2", children: [_jsx(AlertTriangle, { size: 14 }), " Inspectie Bevindingen"] }), _jsx("ul", { className: "list-disc list-inside text-sm font-bold text-rose-700", children: product.inspection.reasons.map((r, i) => (_jsx("li", { children: r }, i))) })] })), product.measurements && (_jsxs("div", { className: "p-6 bg-indigo-50 rounded-[32px] border border-indigo-100", children: [_jsxs("span", { className: "text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-2 flex items-center gap-2", children: [_jsx(Ruler, { size: 14 }), " Metingen"] }), _jsx("div", { className: "space-y-1", children: Object.entries(product.measurements).map(([key, val]) => (_jsxs("div", { className: "flex justify-between text-xs border-b border-indigo-100/50 pb-1 last:border-0", children: [_jsxs("span", { className: "font-bold text-slate-600 uppercase", children: [key, ":"] }), _jsx("span", { className: "font-mono font-black text-slate-800", children: val })] }, key))) })] }))] })), (onAddNote ||
                                    (product.qcNotes && product.qcNotes.length > 0)) && (_jsxs("div", { className: "p-8 bg-rose-50 rounded-[40px] border border-rose-100", children: [_jsxs("h4", { className: "flex items-center gap-3 font-black text-sm uppercase text-rose-800 mb-6 pb-4 border-b border-rose-200", children: [_jsx(AlertTriangle, { className: "text-rose-500", size: 20 }), " ", "Kwaliteitsrapporten & Klachten"] }), product.qcNotes && product.qcNotes.length > 0 ? (_jsx("div", { className: "space-y-4 mb-6", children: product.qcNotes.map((note, idx) => (_jsxs("div", { className: "bg-white p-4 rounded-2xl border border-rose-100 shadow-sm", children: [_jsxs("div", { className: "flex justify-between items-center mb-2", children: [_jsx("span", { className: "text-[10px] font-black text-rose-400 uppercase tracking-widest", children: note.user || "Systeem" }), _jsx("span", { className: "text-[10px] font-mono text-slate-400", children: formatDateTimeSafe(note.timestamp) })] }), _jsx("p", { className: "text-sm text-slate-700 font-medium whitespace-pre-wrap", children: note.text })] }, idx))) })) : (_jsx("p", { className: "text-sm text-rose-400 italic mb-6", children: "Nog geen meldingen geregistreerd in dit dossier." })), onAddNote &&
                                            (isAdding ? (_jsxs("div", { className: "bg-white p-4 rounded-2xl border border-rose-200 animate-in fade-in slide-in-from-bottom-2", children: [_jsx("textarea", { className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-rose-500 min-h-[100px] mb-3", placeholder: "Beschrijf de klacht, oorzaak en actie...", value: newNote, onChange: (e) => setNewNote(e.target.value), autoFocus: true }), _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { onClick: () => {
                                                                    if (newNote.trim()) {
                                                                        onAddNote(newNote);
                                                                        setNewNote("");
                                                                        setIsAdding(false);
                                                                    }
                                                                }, className: "px-6 py-2 bg-rose-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-rose-700 transition-all", children: "Rapport Opslaan" }), _jsx("button", { onClick: () => setIsAdding(false), className: "px-6 py-2 bg-white text-slate-500 border border-slate-200 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all", children: "Annuleren" })] })] })) : (_jsxs("button", { onClick: () => setIsAdding(true), className: "px-6 py-3 bg-white text-rose-600 border-2 border-rose-100 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-rose-50 hover:border-rose-200 transition-all flex items-center gap-2", children: [_jsx(Plus, { size: 16 }), " Nieuwe Melding Toevoegen"] })))] })), _jsxs("div", { children: [_jsxs("h4", { className: "flex items-center gap-3 font-black text-sm uppercase text-slate-800 mb-6 pb-4 border-b", children: [_jsx(History, { className: "text-blue-500" }), " Volledige Proces Historie"] }), _jsx("div", { className: "space-y-3", children: (historyWithOperators.length > 0 ? historyWithOperators : product.history)?.map((entry, idx) => (_jsxs("div", { className: "flex gap-4 items-start", children: [_jsx("div", { className: "w-10 h-10 rounded-full bg-slate-100 border-2 border-white shadow-sm flex items-center justify-center shrink-0", children: _jsx("div", { className: "w-2 h-2 rounded-full bg-blue-500" }) }), _jsxs("div", { className: "bg-slate-50 flex-1 p-5 rounded-2xl border border-slate-100 flex justify-between items-center hover:bg-blue-50/50 transition-colors cursor-help", title: `Operator: ${entry.operatorName || entry.operator || (entry.user && entry.user.includes('@') ? entry.user.split('@')[0] : entry.user) || "Onbekend"}`, children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-black text-slate-700 uppercase", children: entry.station }), _jsx("p", { className: "text-[10px] font-bold text-slate-400", children: entry.operatorNumber || entry.operatorName || entry.operator || (entry.user && entry.user.includes('@') ? entry.user.split('@')[0] : entry.user) || "Systeem" }), (entry.action || entry.details) && (_jsxs("p", { className: "text-[10px] font-medium text-slate-600 mt-1 italic", children: [entry.action, " ", entry.details ? `- ${entry.details}` : ""] }))] }), _jsx("span", { className: "text-[10px] font-mono font-bold text-slate-400", children: formatDateTimeSafe(entry.time || entry.timestamp) })] })] }, idx))) })] })] }), _jsxs("div", { className: "p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0", children: [_jsxs("div", { className: "flex items-center gap-4 text-left", children: [_jsx(ShieldCheck, { size: 24, className: "text-blue-500" }), _jsx("p", { className: "text-[10px] font-bold text-slate-500 uppercase leading-tight", children: "Digitaal dossier conform ISO 9001 Traceability" })] }), _jsx("div", { className: "flex gap-3", children: isMoving ? (_jsxs("div", { className: "flex items-center gap-2 animate-in slide-in-from-right-2", children: [_jsxs("select", { value: targetStation, onChange: (e) => setTargetStation(e.target.value), className: "px-4 py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-xs text-slate-700 outline-none focus:border-blue-500", children: [_jsx("option", { value: "", children: "Kies station..." }), moveStations.map((s) => (_jsx("option", { value: s.id, children: s.name }, s.id)))] }), isTijdelijkeAfkeur && (_jsx("textarea", { value: repairInstruction, onChange: (e) => setRepairInstruction(e.target.value), className: "px-4 py-3 bg-white border-2 border-slate-200 rounded-2xl font-medium text-xs text-slate-700 outline-none focus:border-blue-500 min-w-[260px] min-h-[92px]", placeholder: "Wat moet de operator repareren?" })), _jsx("button", { onClick: async () => {
                                                    if (!targetStation)
                                                        return;
                                                    setShowConfirmMove(true);
                                                }, disabled: overrideLoading || !targetStation, className: "px-6 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all", children: overrideLoading ? "..." : "Bevestig" }), _jsx("button", { onClick: () => {
                                                    setIsMoving(false);
                                                    setRepairInstruction("");
                                                }, className: "px-6 py-4 bg-white border-2 border-slate-200 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all", children: "Annuleer" })] })) : (_jsxs(_Fragment, { children: [isTijdelijkeAfkeur && (_jsxs("button", { onClick: () => setShowConfirmReject(true), disabled: rejectLoading, className: "px-6 py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all flex items-center gap-2 shadow-lg", children: [_jsx(X, { size: 16 }), " ", rejectLoading ? "..." : "Definitieve Afkeur"] })), onMoveLot && (_jsxs("button", { onClick: () => setIsMoving(true), className: "px-6 py-4 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all flex items-center gap-2", children: [_jsx(ArrowRightLeft, { size: 16 }), " ", isTijdelijkeAfkeur ? "Reparatie" : "Verplaats"] })), _jsx("button", { onClick: onClose, className: "px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl", children: "Sluiten" })] })) })] })] }) }), showDetailModal && catalogProduct && (_jsx(ProductDetailModal, { product: catalogProduct, onClose: () => setShowDetailModal(false) })), _jsx(ConfirmationModal, { isOpen: showConfirmMove, onClose: () => setShowConfirmMove(false), onConfirm: handleExecuteMove, title: isArchivedProduct ? "Product Heropenen" : isTijdelijkeAfkeur ? "Reparatie Inplannen" : "Product Verplaatsen", message: isArchivedProduct
                    ? `Weet je zeker dat je dit gearchiveerde product wilt heropenen naar ${moveStations.find(s => s.id === targetStation)?.name || targetStation}?`
                    : isTijdelijkeAfkeur
                        ? `Weet je zeker dat je deze tijdelijke afkeur wilt doorzetten naar ${moveStations.find(s => s.id === targetStation)?.name || targetStation}?`
                        : `Weet je zeker dat je dit product wilt verplaatsen naar ${moveStations.find(s => s.id === targetStation)?.name || targetStation}?`, confirmText: isArchivedProduct ? "Ja, Heropenen" : isTijdelijkeAfkeur ? "Ja, Reparatie" : "Ja, Verplaatsen" }), showConfirmReject && (_jsx("div", { className: "fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-200 max-h-[90vh]", children: [_jsxs("div", { className: "bg-red-50 px-6 py-4 border-b border-red-100 flex justify-between items-center shrink-0", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-lg font-black text-red-800 uppercase tracking-tight", children: "Definitieve Afkeur" }), _jsx("p", { className: "text-xs text-red-500 font-mono font-bold", children: product?.lotNumber })] }), _jsx("button", { onClick: () => { setShowConfirmReject(false); setRejectReasons([]); setRejectNote(""); }, className: "p-2 hover:bg-red-100 rounded-full", children: _jsx(X, { size: 20, className: "text-red-400" }) })] }), _jsxs("div", { className: "p-6 space-y-4 overflow-y-auto custom-scrollbar", children: [_jsxs("div", { className: "bg-red-50 p-4 rounded-xl border border-red-100", children: [_jsxs("h4", { className: "font-bold text-red-900 text-xs uppercase mb-3 flex items-center gap-2", children: [_jsx(AlertTriangle, { size: 14 }), " Reden van afkeur"] }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-2", children: REJECTION_REASONS.map((reason) => (_jsxs("div", { onClick: () => toggleRejectReason(reason), className: `p-2 rounded-lg border cursor-pointer text-xs font-medium transition-all flex items-center gap-2 ${rejectReasons.includes(reason)
                                                    ? "bg-white border-red-500 text-red-700 shadow-sm"
                                                    : "bg-white/50 border-transparent text-slate-500 hover:bg-white"}`, children: [_jsx("div", { className: `w-3 h-3 rounded-full border flex items-center justify-center shrink-0 ${rejectReasons.includes(reason)
                                                            ? "bg-red-500 border-red-500"
                                                            : "border-slate-300"}`, children: rejectReasons.includes(reason) && (_jsx("span", { className: "text-white text-[8px] font-bold", children: "\u2713" })) }), REJECTION_REASON_LABELS[reason] || reason] }, reason))) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold uppercase text-slate-400 mb-2", children: "Opmerking (optioneel)" }), _jsx("textarea", { value: rejectNote, onChange: (e) => setRejectNote(e.target.value), className: "w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 outline-none", placeholder: "Bijv. kras op flensvlak, niet herstelbaar...", rows: 3 })] }), _jsx("div", { className: "bg-amber-50 border border-amber-200 rounded-xl p-3", children: _jsx("p", { className: "text-xs font-bold text-amber-800", children: "\u26A0 Let op: Dit kan niet ongedaan worden gemaakt. Het product wordt definitief afgekeurd." }) })] }), _jsxs("div", { className: "bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-3 shrink-0", children: [_jsx("button", { onClick: () => { setShowConfirmReject(false); setRejectReasons([]); setRejectNote(""); }, className: "px-4 py-2 rounded-lg text-slate-500 font-bold hover:bg-slate-200 text-sm", children: "Annuleren" }), _jsxs("button", { onClick: handleDefinitiveRejection, disabled: rejectLoading || rejectReasons.length === 0, className: "px-6 py-2 rounded-lg font-bold text-white text-sm shadow-md flex items-center gap-2 transition-all bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed", children: [rejectLoading ? (_jsx(Loader2, { size: 14, className: "animate-spin" })) : (_jsx(X, { size: 16 })), "Definitief Afkeuren"] })] })] }) }))] }));
};
export default ProductDossierModal;
