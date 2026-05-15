import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Send, Loader2, Camera, Keyboard } from "lucide-react";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNotifications } from "../../contexts/NotificationContext";
import { startProductionLots } from "../../services/planningSecurityService";
import { useTeamleaderFirestore } from "../digitalplanning/useTeamleaderFirestore";
import { isOpenOrRunningOrder } from "../../utils/teamleaderDerived";
const QsheVirtualLotsView = () => {
    const { t } = useTranslation();
    const { user } = useAdminAuth();
    const { showSuccess, showWarning } = useNotifications();
    const [machine, setMachine] = useState("");
    const [orderId, setOrderId] = useState("");
    const [lotNumber, setLotNumber] = useState("");
    const [reason, setReason] = useState("");
    const [scanMode, setScanMode] = useState("manual");
    const [isDecodingImage, setIsDecodingImage] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const cameraInputRef = useRef(null);
    const { rawOrders } = useTeamleaderFirestore({ user });
    const machineOptions = useMemo(() => {
        const set = new Set();
        (Array.isArray(rawOrders) ? rawOrders : []).forEach((order) => {
            const value = String(order?.machine || "").trim();
            if (value)
                set.add(value);
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [rawOrders]);
    useEffect(() => {
        if (!machine && machineOptions.length > 0) {
            setMachine(machineOptions[0]);
        }
    }, [machine, machineOptions]);
    const orderOptions = useMemo(() => {
        const machineKey = String(machine || "").trim().toUpperCase();
        return (Array.isArray(rawOrders) ? rawOrders : [])
            .filter((order) => isOpenOrRunningOrder(order))
            .filter((order) => {
            if (!machineKey)
                return true;
            return String(order?.machine || "").trim().toUpperCase() === machineKey;
        })
            .sort((a, b) => String(a?.orderId || "").localeCompare(String(b?.orderId || "")));
    }, [rawOrders, machine]);
    const selectedOrder = useMemo(() => {
        return orderOptions.find((order) => String(order?.orderId || "") === String(orderId || "")) || null;
    }, [orderOptions, orderId]);
    const selectedOrderItemCode = useMemo(() => {
        if (!selectedOrder)
            return "";
        const directCode = String(selectedOrder?.itemCode || selectedOrder?.productId || "").trim();
        if (directCode)
            return directCode;
        const parsedFromItem = String(selectedOrder?.item || "")
            .trim()
            .match(/[A-Z0-9]{6,}/i);
        return parsedFromItem ? String(parsedFromItem[0] || "").trim().toUpperCase() : "";
    }, [selectedOrder]);
    const selectedOrderLabel = useMemo(() => {
        if (!selectedOrder)
            return "";
        return String(selectedOrder?.itemDescription || selectedOrder?.item || "Onbekend").trim();
    }, [selectedOrder]);
    const handleOpenCamera = () => {
        cameraInputRef.current?.click();
    };
    const handleCameraFileChange = async (event) => {
        const file = event?.target?.files?.[0];
        if (!file)
            return;
        if (typeof window === "undefined" || typeof window.BarcodeDetector !== "function") {
            showWarning("Barcode scan niet ondersteund op dit toestel/browser. Gebruik handmatige invoer.");
            event.target.value = "";
            return;
        }
        setIsDecodingImage(true);
        try {
            const detector = new window.BarcodeDetector({
                formats: ["code_128", "code_39", "codabar", "ean_13", "ean_8", "qr_code"],
            });
            const imageBitmap = await createImageBitmap(file); // eslint-disable-line no-undef
            const codes = await detector.detect(imageBitmap);
            const detected = String(codes?.[0]?.rawValue || "").trim().toUpperCase();
            if (!detected) {
                showWarning("Geen barcode/lotnummer gedetecteerd. Probeer opnieuw of typ handmatig.");
                return;
            }
            setLotNumber(detected);
            showSuccess(`Lotnummer gescand: ${detected}`);
        }
        catch (error) {
            console.error("Fout bij camera scan:", error);
            showWarning("Scannen met camera is mislukt. Typ het lotnummer handmatig.");
        }
        finally {
            event.target.value = "";
            setIsDecodingImage(false);
        }
    };
    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!selectedOrder) {
            showWarning(t("qshe.virtualLots.selectOrder", "Selecteer eerst een order."));
            return;
        }
        const cleanLot = String(lotNumber || "").trim().toUpperCase();
        const cleanItemCode = String(selectedOrderItemCode || "").trim();
        if (!cleanLot) {
            showWarning(t("qshe.virtualLots.lotRequired", "Lotnummer is verplicht."));
            return;
        }
        if (!cleanItemCode) {
            showWarning(t("qshe.virtualLots.itemRequired", "Geen itemcode gevonden op deze order. Vul itemcode eerst aan in planning."));
            return;
        }
        setSubmitting(true);
        try {
            await startProductionLots({
                orderDocId: selectedOrder.id,
                orderDocPath: selectedOrder?.__docPath || "",
                orderSourcePath: selectedOrder?.sourcePath || "",
                orderId: selectedOrder?.orderId,
                itemCode: cleanItemCode,
                item: selectedOrder?.item || selectedOrder?.itemDescription || "",
                lotStart: cleanLot,
                totalToProduce: 1,
                stationId: String(machine || selectedOrder?.machine || "").trim(),
                stationLabel: String(machine || selectedOrder?.machine || "").trim(),
                actorLabel: user?.email || "QSHE",
                isVirtualLot: true,
                virtualReason: String(reason || "").trim(),
            });
            setLotNumber("");
            showSuccess(t("qshe.virtualLots.success", "Virtueel lot {{lot}} uitgegeven voor order {{order}}.", {
                lot: cleanLot,
                order: selectedOrder?.orderId,
            }));
        }
        catch (error) {
            console.error("Fout bij uitgeven virtueel lot:", error);
            showWarning(error?.message || t("qshe.virtualLots.error", "Kon virtueel lot niet uitgeven."));
        }
        finally {
            setSubmitting(false);
        }
    };
    return (_jsx("div", { className: "p-6 md:p-8 max-w-4xl mx-auto text-left", children: _jsxs("div", { className: "rounded-[28px] border border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-white p-6 shadow-sm", children: [_jsxs("div", { className: "flex items-start gap-4", children: [_jsx("div", { className: "p-3 rounded-2xl bg-white border border-orange-200 text-orange-700", children: _jsx(ShieldCheck, { size: 22 }) }), _jsxs("div", { children: [_jsx("p", { className: "text-[10px] font-black uppercase tracking-[0.22em] text-orange-700", children: "QSHE" }), _jsx("h2", { className: "text-2xl font-black italic text-slate-900 mt-1", children: "Virtuele Lotuitgifte" }), _jsx("p", { className: "text-sm font-bold text-slate-600 mt-2", children: "Geef lotnummers uit zonder fysiek product. Deze lots blijven volledig traceerbaar en worden zichtbaar op de order." })] })] }), _jsxs("form", { onSubmit: handleSubmit, className: "mt-6 space-y-3", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [_jsxs("select", { value: machine, onChange: (e) => {
                                        setMachine(e.target.value);
                                        setOrderId("");
                                    }, className: "px-3 py-2 rounded-xl border border-orange-200 bg-white text-xs font-bold text-slate-700 outline-none focus:border-orange-400", children: [_jsx("option", { value: "", children: "Kies machine" }), machineOptions.map((entry) => (_jsx("option", { value: entry, children: entry }, entry)))] }), _jsxs("div", { className: "rounded-xl border border-orange-200 bg-white p-2", children: [_jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-orange-700 px-1 pb-2", children: "Kies order" }), _jsxs("div", { className: "max-h-48 overflow-y-auto custom-scrollbar space-y-1", children: [orderOptions.map((entry) => {
                                                    const entryOrderId = String(entry?.orderId || "").trim();
                                                    const entryLabel = String(entry?.itemDescription || entry?.item || "Onbekend").trim();
                                                    const isSelected = String(orderId || "") === entryOrderId;
                                                    return (_jsxs("button", { type: "button", onClick: () => setOrderId(entryOrderId), className: `w-full px-3 py-2 rounded-lg border text-left transition-colors ${isSelected
                                                            ? "bg-orange-100 border-orange-300"
                                                            : "bg-white border-slate-200 hover:bg-orange-50"}`, children: [_jsx("p", { className: "text-xs font-black text-slate-900 leading-tight", children: entryOrderId || "-" }), _jsx("p", { className: "text-[11px] font-bold text-slate-600 mt-0.5 leading-tight break-words", children: entryLabel })] }, entry.id || entryOrderId));
                                                }), orderOptions.length === 0 && (_jsx("p", { className: "px-2 py-3 text-[11px] font-bold text-slate-500", children: "Geen orders gevonden voor deze machine." }))] })] })] }), selectedOrder && (_jsxs("div", { className: "px-3 py-2 rounded-xl border border-orange-100 bg-white/70 text-xs font-bold text-slate-700", children: ["Artikelomschrijving: ", _jsx("span", { className: "text-slate-900", children: selectedOrderLabel || "-" })] })), selectedOrder && (_jsxs("div", { className: "px-3 py-2 rounded-xl border border-orange-100 bg-white/70 text-xs font-bold text-slate-700", children: ["Itemcode (automatisch): ", _jsx("span", { className: "text-slate-900", children: selectedOrderItemCode || "Niet gevonden" })] })), _jsxs("div", { className: "rounded-xl border border-orange-200 bg-white p-3 space-y-3", children: [_jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { type: "button", onClick: () => setScanMode("manual"), className: `px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${scanMode === "manual"
                                                ? "bg-orange-100 text-orange-700 border-orange-300"
                                                : "bg-white text-slate-500 border-slate-200"}`, children: [_jsx(Keyboard, { size: 12, className: "inline mr-1" }), " Handmatig"] }), _jsxs("button", { type: "button", onClick: () => setScanMode("camera"), className: `px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${scanMode === "camera"
                                                ? "bg-orange-100 text-orange-700 border-orange-300"
                                                : "bg-white text-slate-500 border-slate-200"}`, children: [_jsx(Camera, { size: 12, className: "inline mr-1" }), " Camera"] })] }), _jsx("input", { type: "text", value: lotNumber, onChange: (e) => setLotNumber(e.target.value.toUpperCase()), placeholder: scanMode === "camera" ? "Scan via camera of typ handmatig" : "Typ of scan lotnummer", className: "w-full px-3 py-2 rounded-xl border border-orange-300 bg-white text-xs font-black text-slate-800 outline-none focus:border-orange-500" }), scanMode === "camera" && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { ref: cameraInputRef, type: "file", accept: "image/*", capture: "environment", onChange: handleCameraFileChange, className: "hidden" }), _jsxs("button", { type: "button", onClick: handleOpenCamera, disabled: isDecodingImage, className: "px-3 py-2 rounded-xl bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 disabled:opacity-60 flex items-center gap-2", children: [isDecodingImage ? _jsx(Loader2, { size: 13, className: "animate-spin" }) : _jsx(Camera, { size: 13 }), isDecodingImage ? "Scannen..." : "Open mobiele camera"] }), _jsx("span", { className: "text-[10px] font-bold text-slate-500", children: "Na scannen wordt lotnummer automatisch ingevuld." })] }))] }), _jsx("input", { type: "text", value: reason, onChange: (e) => setReason(e.target.value), placeholder: "Optionele reden (QSHE aanvraag)", className: "w-full px-3 py-2 rounded-xl border border-orange-200 bg-white text-xs font-bold text-slate-700 outline-none focus:border-orange-400" }), _jsx("div", { className: "flex justify-end pt-1", children: _jsxs("button", { type: "submit", disabled: submitting, className: "px-4 py-2 rounded-xl bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 disabled:opacity-60 flex items-center gap-2", children: [submitting ? _jsx(Loader2, { size: 14, className: "animate-spin" }) : _jsx(Send, { size: 14 }), submitting ? "Bezig..." : "Geef Virtueel Lot Uit"] }) })] })] }) }));
};
export default QsheVirtualLotsView;
