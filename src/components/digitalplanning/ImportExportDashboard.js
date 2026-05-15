import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet, Download, Upload, Database, FileText, ArrowRight, Plus, Calendar, Printer, X } from "lucide-react";
import { endOfISOWeek, format, getISOWeek, isSameDay, isWithinInterval, startOfISOWeek } from "date-fns";
import PlanningImportModal from "./modals/PlanningImportModal";
const toEntryDate = (entry) => {
    const candidates = [
        entry?.timestamps?.finished,
        entry?.archivedAt,
        entry?.updatedAt,
        entry?.createdAt,
    ];
    for (const value of candidates) {
        if (!value)
            continue;
        if (typeof value?.toDate === "function") {
            const converted = value.toDate();
            if (Number.isFinite(converted?.getTime?.()))
                return converted;
        }
        const parsed = new Date(value);
        if (Number.isFinite(parsed.getTime()))
            return parsed;
    }
    return null;
};
const toWikkelenStartDate = (entry) => {
    const candidates = [
        entry?.timestamps?.wikkelen_start,
        entry?.timestamps?.station_start,
        entry?.timestamps?.started,
        entry?.createdAt,
    ];
    for (const value of candidates) {
        if (!value)
            continue;
        if (typeof value?.toDate === "function") {
            const converted = value.toDate();
            if (Number.isFinite(converted?.getTime?.()))
                return converted;
        }
        const parsed = new Date(value);
        if (Number.isFinite(parsed.getTime()))
            return parsed;
    }
    return null;
};
const toWikkelenCompletionDate = (entry) => {
    const candidates = [
        entry?.timestamps?.wikkelen_end,
        entry?.timestamps?.lossen_start,
        entry?.timestamps?.finished,
        entry?.archivedAt,
        entry?.updatedAt,
        entry?.createdAt,
    ];
    for (const value of candidates) {
        if (!value)
            continue;
        if (typeof value?.toDate === "function") {
            const converted = value.toDate();
            if (Number.isFinite(converted?.getTime?.()))
                return converted;
        }
        const parsed = new Date(value);
        if (Number.isFinite(parsed.getTime()))
            return parsed;
    }
    return null;
};
const normalizeStation = (value = "") => String(value || "").trim().toUpperCase().replace(/\s+/g, "");
const toLnReferenceCode = (value) => {
    const raw = String(value || "").trim();
    if (!raw)
        return "";
    const digits = raw.replace(/\D/g, "");
    return digits || raw;
};
const selectPrimaryLnReferenceOperation = (order) => {
    if (!order || typeof order !== "object")
        return "";
    const referenceMap = order.referenceOperationTimes || {};
    const mapCandidates = Object.entries(referenceMap)
        .map(([refOp, meta]) => {
        const code = toLnReferenceCode(refOp);
        if (!code)
            return null;
        const bucket = String(meta?.bucket || "").toLowerCase();
        const plannedHours = Number(meta?.plannedHours || 0);
        const bucketPriority = bucket === "production" ? 0 : bucket === "post" ? 1 : bucket === "qc" ? 2 : 3;
        return {
            code,
            bucketPriority,
            plannedHours: Number.isFinite(plannedHours) ? plannedHours : 0,
        };
    })
        .filter(Boolean);
    if (mapCandidates.length > 0) {
        mapCandidates.sort((a, b) => {
            if (a.bucketPriority !== b.bucketPriority)
                return a.bucketPriority - b.bucketPriority;
            if (a.plannedHours !== b.plannedHours)
                return b.plannedHours - a.plannedHours;
            return a.code.localeCompare(b.code);
        });
        return mapCandidates[0].code;
    }
    const operationCodes = Object.keys(order.operations || {})
        .map((value) => toLnReferenceCode(value))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    return operationCodes[0] || "";
};
const formatDateInputValue = (date) => format(date, "yyyy-MM-dd");
const formatWeekInputValue = (date) => `${date.getFullYear()}-W${String(getISOWeek(date)).padStart(2, "0")}`;
const parseDateInputValue = (value) => {
    const parsed = new Date(`${String(value || "").trim()}T00:00:00`);
    return Number.isFinite(parsed.getTime()) ? parsed : new Date();
};
const parseWeekInputValue = (value) => {
    const match = String(value || "").trim().match(/^(\d{4})-W(\d{2})$/i);
    if (!match)
        return new Date();
    const year = Number(match[1]);
    const week = Number(match[2]);
    if (!Number.isFinite(year) || !Number.isFinite(week))
        return new Date();
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - jan4Day + 1 + (week - 1) * 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
};
const buildFullWidthColumnStyles = (doc, ratios = [], horizontalMargin = 10) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const availableWidth = pageWidth - horizontalMargin * 2;
    const totalRatio = ratios.reduce((sum, value) => sum + value, 0) || 1;
    return ratios.reduce((styles, ratio, index) => {
        styles[index] = {
            cellWidth: Number(((availableWidth * ratio) / totalRatio).toFixed(2)),
        };
        return styles;
    }, {});
};
const ImportExportDashboard = ({ currentDepartment, onCreateOrder, trackedProducts = [], archivedHistoryProducts = [], effectiveAllowedNorms = [], planningOrders = [], onOpenMachineExport, }) => {
    const { t } = useTranslation();
    const [activeSection, setActiveSection] = useState("import"); // 'import', 'export'
    const [showLegacyModal, setShowLegacyModal] = useState(false);
    const [showCompletedExportModal, setShowCompletedExportModal] = useState(false);
    const [showLnReadyExportModal, setShowLnReadyExportModal] = useState(false);
    const [completedRangeMode, setCompletedRangeMode] = useState("day");
    const [completedDateValue, setCompletedDateValue] = useState(formatDateInputValue(new Date()));
    const [completedWeekValue, setCompletedWeekValue] = useState(formatWeekInputValue(new Date()));
    const selectedCompletedDate = useMemo(() => {
        if (completedRangeMode === "week")
            return parseWeekInputValue(completedWeekValue);
        return parseDateInputValue(completedDateValue);
    }, [completedDateValue, completedWeekValue, completedRangeMode]);
    const completedInspectionRows = useMemo(() => {
        const combinedProducts = [...trackedProducts, ...archivedHistoryProducts];
        const uniqueEntries = new Map();
        combinedProducts.forEach((product) => {
            const completedAt = toEntryDate(product);
            if (!completedAt)
                return;
            const originStation = normalizeStation(product?.originMachine || product?.machine || "");
            const currentStation = normalizeStation(product?.currentStation || "");
            const lastStation = normalizeStation(product?.lastStation || "");
            const inAllowedScope = effectiveAllowedNorms.length === 0 ||
                [originStation, currentStation, lastStation].some((station) => station && effectiveAllowedNorms.includes(station));
            if (!inAllowedScope)
                return;
            const status = String(product?.status || "").trim().toLowerCase();
            const step = String(product?.currentStep || "").trim().toUpperCase();
            const isInspectionCompleted = lastStation === "BM01" &&
                (status === "completed" || step === "FINISHED" || currentStation === "GEREED");
            if (!isInspectionCompleted)
                return;
            const inRange = completedRangeMode === "day"
                ? isSameDay(completedAt, selectedCompletedDate)
                : isWithinInterval(completedAt, {
                    start: startOfISOWeek(selectedCompletedDate),
                    end: endOfISOWeek(selectedCompletedDate),
                });
            if (!inRange)
                return;
            const orderId = String(product?.orderId || "").trim();
            const lotNumber = String(product?.lotNumber || product?.activeLot || product?.id || "").trim();
            const dedupeKey = `${orderId}__${lotNumber}`;
            if (uniqueEntries.has(dedupeKey))
                return;
            uniqueEntries.set(dedupeKey, {
                id: dedupeKey,
                readyDate: format(completedAt, "yyyy-MM-dd"),
                readyTime: format(completedAt, "HH:mm"),
                orderId,
                lotNumber,
                item: product?.item || product?.itemDescription || "",
                itemCode: product?.itemCode || "",
                originStation: product?.originMachine || product?.machine || "",
                inspectionStation: product?.lastStation || "BM01",
                status: "Gereed gemeld",
            });
        });
        return Array.from(uniqueEntries.values()).sort((a, b) => {
            const aKey = `${a.readyDate} ${a.readyTime}`;
            const bKey = `${b.readyDate} ${b.readyTime}`;
            return aKey < bKey ? 1 : -1;
        });
    }, [trackedProducts, archivedHistoryProducts, effectiveAllowedNorms, completedRangeMode, selectedCompletedDate]);
    const completedPeriodLabel = useMemo(() => {
        if (completedRangeMode === "day")
            return format(selectedCompletedDate, "yyyy-MM-dd");
        return `week_${String(getISOWeek(selectedCompletedDate)).padStart(2, "0")}_${selectedCompletedDate.getFullYear()}`;
    }, [completedRangeMode, selectedCompletedDate]);
    const planningOrdersByOrderId = useMemo(() => {
        const map = new Map();
        planningOrders.forEach((order) => {
            const key = String(order?.orderId || order?.id || "").trim();
            if (!key || map.has(key))
                return;
            map.set(key, order);
        });
        return map;
    }, [planningOrders]);
    const lnReadyQrRows = useMemo(() => {
        const combinedProducts = [...trackedProducts, ...archivedHistoryProducts];
        const groupedRows = new Map();
        const cutoff = new Date(Date.now() - 5 * 60 * 1000); // 5 minuten pauze
        combinedProducts.forEach((product) => {
            const originStation = normalizeStation(product?.originMachine || product?.machine || "");
            if (!originStation.startsWith("BH") && !originStation.startsWith("BA") && !originStation.startsWith("BM"))
                return;
            const inAllowedScope = effectiveAllowedNorms.length === 0 ||
                effectiveAllowedNorms.includes(originStation);
            if (!inAllowedScope)
                return;
            const status = String(product?.status || "").trim().toLowerCase();
            const step = String(product?.currentStep || "").trim().toUpperCase();
            if (status === "rejected" || step === "REJECTED" || status === "deleted" || status === "cancelled" || status === "geannuleerd")
                return;
            const startDate = toWikkelenStartDate(product);
            if (!startDate)
                return;
            if (startDate > cutoff)
                return;
            const inRange = completedRangeMode === "day"
                ? isSameDay(startDate, selectedCompletedDate)
                : isWithinInterval(startDate, {
                    start: startOfISOWeek(selectedCompletedDate),
                    end: endOfISOWeek(selectedCompletedDate),
                });
            if (!inRange)
                return;
            const orderId = String(product?.orderId || "").trim();
            if (!orderId)
                return;
            const order = planningOrdersByOrderId.get(orderId);
            const refOpsText = "20"; // Vast ingesteld op referentiecode 20
            const rowKey = `${originStation}__${orderId}`;
            const current = groupedRows.get(rowKey) || {
                id: rowKey,
                station: originStation,
                orderId,
                item: product?.item || product?.itemDescription || order?.item || "",
                refOpsText,
                count: 0,
            };
            current.count += 1;
            groupedRows.set(rowKey, current);
        });
        const periodToken = completedRangeMode === "day"
            ? format(selectedCompletedDate, "yyyy-MM-dd")
            : completedPeriodLabel;
        return Array.from(groupedRows.values())
            .sort((a, b) => {
            if (a.station !== b.station)
                return a.station.localeCompare(b.station);
            return a.orderId.localeCompare(b.orderId);
        })
            .map((row) => ({
            ...row,
            orderQr: `ORDER:${row.orderId}`,
            refQr: `REFOPS:${row.refOpsText}`,
            countQr: `COUNT:${row.count}|PERIOD:${periodToken}|STATION:${row.station}`,
        }));
    }, [trackedProducts, archivedHistoryProducts, effectiveAllowedNorms, completedRangeMode, selectedCompletedDate, completedPeriodLabel, planningOrdersByOrderId]);
    const handleExportCompletedExcel = async () => {
        if (!completedInspectionRows.length)
            return;
        const XLSX = await import("xlsx");
        const headerRow = [
            "Gereed datum",
            "Tijd",
            "Order",
            "Lot",
            "Product",
            "Item code",
            "Bron station",
            "Eindinspectie",
            "Status",
        ];
        const aoa = [
            headerRow,
            ...completedInspectionRows.map((row) => [
                row.readyDate,
                row.readyTime,
                row.orderId,
                row.lotNumber,
                row.item,
                row.itemCode,
                row.originStation,
                row.inspectionStation,
                row.status,
            ]),
        ];
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(aoa);
        worksheet["!cols"] = [
            { wch: 14 },
            { wch: 10 },
            { wch: 16 },
            { wch: 16 },
            { wch: 32 },
            { wch: 16 },
            { wch: 18 },
            { wch: 16 },
            { wch: 16 },
        ];
        XLSX.utils.book_append_sheet(workbook, worksheet, "Gereedlijst");
        XLSX.writeFile(workbook, `teamleader_gereedlijst_${completedRangeMode}_${completedPeriodLabel}.xlsx`);
    };
    const handleExportCompletedPdf = async () => {
        if (!completedInspectionRows.length)
            return;
        const [{ jsPDF }, { default: autoTable }] = await Promise.all([
            import("jspdf"),
            import("jspdf-autotable"),
        ]);
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const horizontalMargin = 10;
        const completedColumnStyles = buildFullWidthColumnStyles(doc, [0.09, 0.06, 0.09, 0.1, 0.31, 0.1, 0.11, 0.08, 0.06], horizontalMargin);
        doc.setFontSize(14);
        doc.text("Eindinspectie Gereedlijst", 14, 14);
        doc.setFontSize(9);
        doc.text(`Periode: ${completedPeriodLabel}`, 14, 20);
        doc.text(`Afdeling: ${currentDepartment || "all"}`, 75, 20);
        doc.text(`Totaal: ${completedInspectionRows.length}`, 145, 20);
        autoTable(doc, {
            startY: 25,
            margin: { left: horizontalMargin, right: horizontalMargin },
            tableWidth: doc.internal.pageSize.getWidth() - horizontalMargin * 2,
            styles: { fontSize: 8, cellPadding: 1.5, overflow: "linebreak" },
            headStyles: { fillColor: [15, 23, 42], textColor: 255 },
            head: [["Gereed datum", "Tijd", "Order", "Lot", "Product", "Item code", "Bron station", "Eindinspectie", "Status"]],
            body: completedInspectionRows.map((row) => [
                row.readyDate,
                row.readyTime,
                row.orderId,
                row.lotNumber,
                row.item,
                row.itemCode,
                row.originStation,
                row.inspectionStation,
                row.status,
            ]),
            columnStyles: completedColumnStyles,
        });
        doc.save(`teamleader_gereedlijst_${completedRangeMode}_${completedPeriodLabel}.pdf`);
    };
    const handleExportLnReadyListPdf = async () => {
        if (!lnReadyQrRows.length)
            return;
        const [{ jsPDF }, { default: autoTable }] = await Promise.all([
            import("jspdf"),
            import("jspdf-autotable"),
        ]);
        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        doc.setFontSize(14);
        doc.text("Gereed voor LN (Lijst)", 14, 14);
        doc.setFontSize(9);
        doc.text(`Periode: ${completedPeriodLabel}`, 14, 20);
        doc.text(`Afdeling: ${currentDepartment || "all"}`, 75, 20);
        doc.text(`Totaal regels: ${lnReadyQrRows.length}`, 145, 20);
        autoTable(doc, {
            startY: 25,
            styles: { fontSize: 9, cellPadding: 2 },
            headStyles: { fillColor: [15, 23, 42], textColor: 255 },
            head: [["Station", "Order", "Product", "Ref Ops", "Aantal"]],
            body: lnReadyQrRows.map((row) => [
                row.station,
                row.orderId,
                row.item,
                row.refOpsText,
                row.count,
            ]),
        });
        doc.save(`teamleader_ln_gereed_lijst_${completedRangeMode}_${completedPeriodLabel}.pdf`);
    };
    const handleExportLnReadyPdf = async () => {
        if (!lnReadyQrRows.length)
            return;
        const [{ jsPDF }, qrModule] = await Promise.all([
            import("jspdf"),
            import("qrcode"),
        ]);
        const QRCode = qrModule?.default || qrModule;
        const doc = new jsPDF("p", "mm", "a4");
        doc.setFontSize(14);
        doc.text("Gereed voor LN", 14, 14);
        doc.setFontSize(9);
        doc.text(`Periode: ${completedPeriodLabel}`, 14, 20);
        doc.text(`Afdeling: ${currentDepartment || "all"}`, 75, 20);
        doc.text(`Totaal: ${lnReadyQrRows.length}`, 145, 20);
        let y = 28;
        let activeStation = "";
        const qrSize = 22;
        const blockHeight = 44;
        const qrOrderX = 68;
        const qrRefX = 110;
        const qrCountX = 152;
        for (const row of lnReadyQrRows) {
            if (activeStation !== row.station) {
                if (y + 10 > 285) {
                    doc.addPage();
                    y = 14;
                }
                activeStation = row.station;
                doc.setFontSize(11);
                doc.setFont(undefined, "bold");
                doc.text(`Station ${activeStation}`, 12, y);
                y += 6;
            }
            if (y + blockHeight > 285) {
                doc.addPage();
                y = 14;
                doc.setFontSize(11);
                doc.setFont(undefined, "bold");
                doc.text(`Station ${activeStation}`, 12, y);
                y += 6;
            }
            const [orderDataUrl, refDataUrl, countDataUrl] = await Promise.all([
                QRCode.toDataURL(row.orderQr, { width: 220, margin: 1 }),
                QRCode.toDataURL(row.refQr, { width: 220, margin: 1 }),
                QRCode.toDataURL(row.countQr, { width: 220, margin: 1 }),
            ]);
            doc.setDrawColor(225, 230, 238);
            doc.roundedRect(10, y - 2, 190, blockHeight - 2, 2, 2);
            doc.setFontSize(10);
            doc.setFont(undefined, "bold");
            doc.text(`Order ${row.orderId}`, 12, y + 3);
            doc.setFont(undefined, "normal");
            doc.text(`RefOps: ${row.refOpsText}`, 12, y + 8);
            doc.text(`Aantal: ${row.count}`, 12, y + 13);
            doc.addImage(orderDataUrl, "PNG", qrOrderX, y, qrSize, qrSize);
            doc.addImage(refDataUrl, "PNG", qrRefX, y, qrSize, qrSize);
            doc.addImage(countDataUrl, "PNG", qrCountX, y, qrSize, qrSize);
            doc.setFontSize(7);
            doc.text("ORDER", qrOrderX + qrSize / 2, y + qrSize + 3, { align: "center" });
            doc.text("REF OPS", qrRefX + qrSize / 2, y + qrSize + 3, { align: "center" });
            doc.text("AANTAL", qrCountX + qrSize / 2, y + qrSize + 3, { align: "center" });
            doc.setFontSize(8);
            doc.text(String(row.orderId || "-"), qrOrderX + qrSize / 2, y + qrSize + 7, { align: "center" });
            doc.text(String(row.refOpsText || "-"), qrRefX + qrSize / 2, y + qrSize + 7, { align: "center" });
            doc.text(String(row.count || 0), qrCountX + qrSize / 2, y + qrSize + 7, { align: "center" });
            y += blockHeight;
        }
        doc.save(`teamleader_ln_gereed_${completedRangeMode}_${completedPeriodLabel}.pdf`);
    };
    return (_jsxs("div", { className: "flex flex-col h-full bg-slate-50 animate-in fade-in", children: [_jsxs("div", { className: "p-8 border-b border-slate-200 bg-white flex items-center justify-between shrink-0", children: [_jsxs("div", { children: [_jsxs("h2", { className: "text-2xl font-black text-slate-800 uppercase italic tracking-tighter", children: ["Import ", _jsx("span", { className: "text-emerald-600", children: "& Export" })] }), _jsx("p", { className: "text-sm text-slate-500 font-bold mt-1", children: "Data-uitwisseling voor de werkvloer en systemen" })] }), _jsxs("div", { className: "flex bg-slate-100 p-1 rounded-2xl", children: [_jsxs("button", { onClick: () => setActiveSection("import"), className: `px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeSection === "import" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`, children: [_jsx(Upload, { size: 16 }), " Importeren"] }), _jsxs("button", { onClick: () => setActiveSection("export"), className: `px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeSection === "export" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`, children: [_jsx(Download, { size: 16 }), " Exporteren"] })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-8 custom-scrollbar", children: _jsx("div", { className: "max-w-5xl mx-auto", children: activeSection === "import" ? (_jsx("div", { className: "space-y-6", children: _jsxs("div", { className: "bg-white p-8 rounded-[30px] border border-slate-200 shadow-sm", children: [_jsxs("h3", { className: "text-lg font-black uppercase text-slate-800 flex items-center gap-3 mb-2", children: [_jsx(FileSpreadsheet, { className: "text-emerald-600" }), " Excel Import (Infor LN)"] }), _jsx("p", { className: "text-sm text-slate-500 mb-6", children: "Upload de actuele productieplanning vanuit Excel om de digitale werkvloer te voeden." }), _jsx("div", { className: "mb-6 flex justify-end", children: _jsxs("button", { onClick: () => onCreateOrder?.(), className: "px-4 py-2 bg-emerald-600 text-white rounded-xl shadow-lg font-black text-[10px] uppercase tracking-wider flex items-center gap-2 active:scale-95 transition-all whitespace-nowrap hover:bg-emerald-700", children: [_jsx(Plus, { size: 16 }), " ", t('teamleader.new_order', 'Nieuwe Order')] }) }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [_jsxs("div", { className: "bg-emerald-50 p-6 rounded-2xl border border-emerald-100", children: [_jsx("h4", { className: "font-bold text-emerald-900 text-sm mb-2", children: "Hybride Transitie" }), _jsx("p", { className: "text-xs text-emerald-700 mb-6", children: "We zitten momenteel in een hybride fase. Je kunt handmatig data inladen voor machines die al digitaal zijn." }), _jsxs("button", { onClick: () => setShowLegacyModal(true), className: "w-full py-4 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-200", children: [_jsx(Upload, { size: 18 }), " Start Import Flow"] })] }), _jsxs("div", { className: "bg-slate-50 p-6 rounded-2xl border border-slate-200 flex flex-col justify-center items-center text-center opacity-60", children: [_jsx(Database, { size: 32, className: "text-slate-400 mb-3" }), _jsx("h4", { className: "font-bold text-slate-700 text-sm mb-1", children: "Automatische Sync" }), _jsx("p", { className: "text-xs text-slate-500", children: "Binnenkort beschikbaar via directe API koppeling met LN." })] })] })] }) })) : (_jsx("div", { className: "space-y-6", children: _jsxs("div", { className: "bg-white p-8 rounded-[30px] border border-slate-200 shadow-sm", children: [_jsxs("h3", { className: "text-lg font-black uppercase text-slate-800 flex items-center gap-3 mb-2", children: [_jsx(Database, { className: "text-blue-600" }), " Werkvloer Exports"] }), _jsx("p", { className: "text-sm text-slate-500 mb-6", children: "Genereer overzichten voor controle, administratie of machines die nog op papier werken." }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4", children: [_jsxs("button", { className: "p-6 bg-slate-50 rounded-2xl border-2 border-slate-100 hover:border-blue-300 hover:bg-blue-50 transition-all text-left group", children: [_jsxs("div", { className: "flex justify-between items-start mb-4", children: [_jsx(FileText, { size: 24, className: "text-slate-400 group-hover:text-blue-500 transition-colors" }), _jsx(ArrowRight, { size: 20, className: "text-slate-300 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" })] }), _jsx("h4", { className: "font-black text-slate-700 uppercase tracking-widest text-xs mb-1", children: "Actuele To Do Lijst" }), _jsx("p", { className: "text-[10px] text-slate-500 font-medium", children: "Lijst van alle nog niet gestarte orders binnen jouw afdeling" })] }), _jsxs("button", { type: "button", onClick: () => setShowLnReadyExportModal(true), className: "p-6 bg-slate-50 rounded-2xl border-2 border-slate-100 hover:border-emerald-300 hover:bg-emerald-50 transition-all text-left group", children: [_jsxs("div", { className: "flex justify-between items-start mb-4", children: [_jsx(FileSpreadsheet, { size: 24, className: "text-slate-400 group-hover:text-emerald-500 transition-colors" }), _jsx(ArrowRight, { size: 20, className: "text-slate-300 group-hover:text-emerald-500 transform group-hover:translate-x-1 transition-all" })] }), _jsx("h4", { className: "font-black text-slate-700 uppercase tracking-widest text-xs mb-1", children: "Gereed voor LN" }), _jsx("p", { className: "text-[10px] text-slate-500 font-medium", children: "Export van gereedgemelde producten om terug te boeken in ERP" })] }), _jsxs("button", { type: "button", onClick: () => setShowCompletedExportModal(true), className: "p-6 bg-slate-50 rounded-2xl border-2 border-slate-100 hover:border-emerald-300 hover:bg-emerald-50 transition-all text-left group", children: [_jsxs("div", { className: "flex justify-between items-start mb-4", children: [_jsx(FileSpreadsheet, { size: 24, className: "text-slate-400 group-hover:text-emerald-500 transition-colors" }), _jsx(ArrowRight, { size: 20, className: "text-slate-300 group-hover:text-emerald-500 transform group-hover:translate-x-1 transition-all" })] }), _jsx("h4", { className: "font-black text-slate-700 uppercase tracking-widest text-xs mb-1", children: "Eindinspectie Gereedlijst" }), _jsx("p", { className: "text-[10px] text-slate-500 font-medium", children: "Open popup voor dag- of weekexport naar PDF of Excel met kolommen en headers" })] }), _jsxs("button", { type: "button", onClick: () => onOpenMachineExport?.("planning"), className: "p-6 bg-slate-50 rounded-2xl border-2 border-slate-100 hover:border-blue-300 hover:bg-blue-50 transition-all text-left group", children: [_jsxs("div", { className: "flex justify-between items-start mb-4", children: [_jsx(Download, { size: 24, className: "text-slate-400 group-hover:text-blue-500 transition-colors" }), _jsx(ArrowRight, { size: 20, className: "text-slate-300 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" })] }), _jsx("h4", { className: "font-black text-slate-700 uppercase tracking-widest text-xs mb-1", children: "Machine Export - Planning" }), _jsx("p", { className: "text-[10px] text-slate-500 font-medium", children: "Open planningexport direct met machinefilter en statusfilters" })] }), _jsxs("button", { type: "button", onClick: () => onOpenMachineExport?.("lotnummers"), className: "p-6 bg-slate-50 rounded-2xl border-2 border-slate-100 hover:border-blue-300 hover:bg-blue-50 transition-all text-left group", children: [_jsxs("div", { className: "flex justify-between items-start mb-4", children: [_jsx(Download, { size: 24, className: "text-slate-400 group-hover:text-blue-500 transition-colors" }), _jsx(ArrowRight, { size: 20, className: "text-slate-300 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" })] }), _jsx("h4", { className: "font-black text-slate-700 uppercase tracking-widest text-xs mb-1", children: "Machine Export - Lotnummers" }), _jsx("p", { className: "text-[10px] text-slate-500 font-medium", children: "Open werkvoorraadexport voor actieve lotnummers per machine" })] }), _jsxs("button", { type: "button", onClick: () => onOpenMachineExport?.("ln_compare"), className: "p-6 bg-slate-50 rounded-2xl border-2 border-slate-100 hover:border-blue-300 hover:bg-blue-50 transition-all text-left group", children: [_jsxs("div", { className: "flex justify-between items-start mb-4", children: [_jsx(Download, { size: 24, className: "text-slate-400 group-hover:text-blue-500 transition-colors" }), _jsx(ArrowRight, { size: 20, className: "text-slate-300 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" })] }), _jsx("h4", { className: "font-black text-slate-700 uppercase tracking-widest text-xs mb-1", children: "Machine Export - LN Vergelijking" }), _jsx("p", { className: "text-[10px] text-slate-500 font-medium", children: "Open vergelijkingsexport voor plan versus gemaakt aantallen" })] })] })] }) })) }) }), showLegacyModal && (_jsx(PlanningImportModal, { isOpen: true, onClose: () => setShowLegacyModal(false), currentDepartment: currentDepartment })), showCompletedExportModal && (_jsx("div", { className: "fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-6xl rounded-[24px] sm:rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]", children: [_jsxs("div", { className: "px-5 sm:px-8 py-5 sm:py-6 border-b border-slate-100 bg-emerald-50/70 flex items-start justify-between gap-4 shrink-0", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-2xl font-black text-slate-900 italic", children: "Eindinspectie Gereedlijst" }), _jsx("p", { className: "text-sm font-bold text-slate-500 mt-1", children: "Export van wat bij Eindinspectie gereed is gemeld, gefilterd op dag of week." })] }), _jsx("button", { onClick: () => setShowCompletedExportModal(false), className: "p-2 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50", children: _jsx(X, { size: 18 }) })] }), _jsxs("div", { className: "p-5 sm:p-8 space-y-5 sm:space-y-6 overflow-y-auto custom-scrollbar", children: [_jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-[1fr_1.5fr_1fr_1fr] gap-4", children: [_jsxs("div", { className: "relative", children: [_jsx(Calendar, { className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400", size: 14 }), _jsxs("select", { value: completedRangeMode, onChange: (e) => setCompletedRangeMode(e.target.value), className: "w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500", children: [_jsx("option", { value: "day", children: "Per dag" }), _jsx("option", { value: "week", children: "Per week" })] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx(Calendar, { className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400", size: 14 }), completedRangeMode === "day" ? (_jsx("input", { type: "date", value: completedDateValue, onChange: (e) => setCompletedDateValue(e.target.value), className: "w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500" })) : (_jsx("input", { type: "week", value: completedWeekValue, onChange: (e) => setCompletedWeekValue(e.target.value), className: "w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500" }))] }), _jsx("button", { type: "button", onClick: () => {
                                                        setCompletedDateValue(formatDateInputValue(new Date()));
                                                        setCompletedWeekValue(formatWeekInputValue(new Date()));
                                                    }, className: "px-4 py-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors shrink-0", title: "Terug naar vandaag", children: "Vandaag" })] }), _jsxs("button", { type: "button", onClick: handleExportCompletedPdf, disabled: completedInspectionRows.length === 0, className: "px-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2", children: [_jsx(Printer, { size: 14 }), " PDF"] }), _jsxs("button", { type: "button", onClick: handleExportCompletedExcel, disabled: completedInspectionRows.length === 0, className: "px-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2", children: [_jsx(Download, { size: 14 }), " Excel"] })] }), _jsxs("div", { className: "flex items-center justify-between gap-4 text-xs font-black uppercase tracking-widest text-slate-400", children: [_jsxs("span", { children: ["Periode: ", completedPeriodLabel] }), _jsxs("span", { children: [completedInspectionRows.length, " regels"] })] }), _jsxs("div", { className: "rounded-2xl border border-slate-200 overflow-hidden", children: [_jsxs("div", { className: "grid grid-cols-[9rem_6rem_8rem_8rem_minmax(0,1fr)_8rem] gap-3 bg-slate-100 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500", children: [_jsx("span", { children: "Datum" }), _jsx("span", { children: "Tijd" }), _jsx("span", { children: "Order" }), _jsx("span", { children: "Lot" }), _jsx("span", { children: "Product" }), _jsx("span", { children: "Code" })] }), _jsx("div", { className: "max-h-[22rem] overflow-y-auto custom-scrollbar divide-y divide-slate-100", children: completedInspectionRows.length === 0 ? (_jsx("div", { className: "px-4 py-10 text-center text-xs font-bold uppercase tracking-widest text-slate-400", children: "Geen gereedmeldingen gevonden voor deze selectie." })) : (completedInspectionRows.map((row) => (_jsxs("div", { className: "grid grid-cols-[9rem_6rem_8rem_8rem_minmax(0,1fr)_8rem] gap-3 px-4 py-3 text-xs text-slate-700 items-start", children: [_jsx("span", { className: "font-bold", children: row.readyDate || "-" }), _jsx("span", { children: row.readyTime || "-" }), _jsx("span", { className: "font-bold", children: row.orderId || "-" }), _jsx("span", { children: row.lotNumber || "-" }), _jsx("span", { className: "font-medium truncate", children: row.item || "-" }), _jsx("span", { children: row.itemCode || "-" })] }, row.id)))) })] })] })] }) })), showLnReadyExportModal && (_jsx("div", { className: "fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-6xl rounded-[24px] sm:rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]", children: [_jsxs("div", { className: "px-5 sm:px-8 py-5 sm:py-6 border-b border-slate-100 bg-emerald-50/70 flex items-start justify-between gap-4 shrink-0", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-2xl font-black text-slate-900 italic", children: "Gereed voor LN" }), _jsx("p", { className: "text-sm font-bold text-slate-500 mt-1", children: "Export van gereedgemelde producten om terug te boeken in ERP." })] }), _jsx("button", { onClick: () => setShowLnReadyExportModal(false), className: "p-2 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50", children: _jsx(X, { size: 18 }) })] }), _jsxs("div", { className: "p-5 sm:p-8 space-y-5 sm:space-y-6 overflow-y-auto custom-scrollbar", children: [_jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-[1fr_1.5fr_1fr_1fr] gap-4", children: [_jsxs("div", { className: "relative", children: [_jsx(Calendar, { className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400", size: 14 }), _jsxs("select", { value: completedRangeMode, onChange: (e) => setCompletedRangeMode(e.target.value), className: "w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500", children: [_jsx("option", { value: "day", children: "Per dag" }), _jsx("option", { value: "week", children: "Per week" })] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx(Calendar, { className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400", size: 14 }), completedRangeMode === "day" ? (_jsx("input", { type: "date", value: completedDateValue, onChange: (e) => setCompletedDateValue(e.target.value), className: "w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500" })) : (_jsx("input", { type: "week", value: completedWeekValue, onChange: (e) => setCompletedWeekValue(e.target.value), className: "w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500" }))] }), _jsx("button", { type: "button", onClick: () => {
                                                        setCompletedDateValue(formatDateInputValue(new Date()));
                                                        setCompletedWeekValue(formatWeekInputValue(new Date()));
                                                    }, className: "px-4 py-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors shrink-0", title: "Terug naar vandaag", children: "Vandaag" })] }), _jsxs("button", { type: "button", onClick: handleExportLnReadyListPdf, disabled: lnReadyQrRows.length === 0, className: "px-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2", children: [_jsx(FileText, { size: 14 }), " Lijst PDF"] }), _jsxs("button", { type: "button", onClick: handleExportLnReadyPdf, disabled: lnReadyQrRows.length === 0, className: "px-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2", children: [_jsx(Printer, { size: 14 }), " QR PDF"] })] }), _jsxs("div", { className: "flex items-center justify-between gap-4 text-xs font-black uppercase tracking-widest text-slate-400", children: [_jsxs("span", { children: ["Periode: ", completedPeriodLabel] }), _jsxs("span", { children: [lnReadyQrRows.length, " orderregels"] })] }), _jsxs("div", { className: "rounded-2xl border border-slate-200 overflow-hidden", children: [_jsxs("div", { className: "grid grid-cols-[6rem_8rem_6rem_5rem_minmax(0,1fr)] gap-3 bg-slate-100 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500", children: [_jsx("span", { children: "Station" }), _jsx("span", { children: "Order" }), _jsx("span", { children: "Ref ops" }), _jsx("span", { children: "Aantal" }), _jsx("span", { children: "Product" })] }), _jsx("div", { className: "max-h-[22rem] overflow-y-auto custom-scrollbar divide-y divide-slate-100", children: lnReadyQrRows.length === 0 ? (_jsx("div", { className: "px-4 py-10 text-center text-xs font-bold uppercase tracking-widest text-slate-400", children: "Geen LN QR-exportregels gevonden voor deze selectie." })) : (lnReadyQrRows.map((row) => (_jsxs("div", { className: "grid grid-cols-[6rem_8rem_6rem_5rem_minmax(0,1fr)] gap-3 px-4 py-3 text-xs text-slate-700 items-center", children: [_jsx("span", { className: "font-bold", children: row.station || "-" }), _jsx("span", { className: "font-bold", children: row.orderId || "-" }), _jsx("span", { children: row.refOpsText || "20" }), _jsx("span", { className: "font-bold text-blue-600", children: row.count || 0 }), _jsx("span", { className: "truncate", title: row.item, children: row.item || "-" })] }, row.id)))) })] })] })] }) }))] }));
};
export default ImportExportDashboard;
