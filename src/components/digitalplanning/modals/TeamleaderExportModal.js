import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useMemo, useEffect } from "react";
import { X, FileSpreadsheet, FileText, Download, Info, CheckCircle2, Factory, CalendarRange, ListTodo, Search, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { format, formatDistanceStrict } from "date-fns";
import { nl } from "date-fns/locale";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../config/firebase";
import { useBackgroundTasks } from "../../../contexts/BackgroundTaskContext";
const safeToDate = (value) => {
    if (!value)
        return null;
    if (typeof value?.toDate === "function") {
        const converted = value.toDate();
        return Number.isFinite(converted?.getTime?.()) ? converted : null;
    }
    if (typeof value === "object" && Number.isFinite(value.seconds)) {
        const converted = new Date(value.seconds * 1000);
        return Number.isFinite(converted.getTime()) ? converted : null;
    }
    const converted = new Date(value);
    return Number.isFinite(converted.getTime()) ? converted : null;
};
const safeFormatDate = (value, pattern, fallback = "") => {
    const dateObj = safeToDate(value);
    if (!dateObj)
        return fallback;
    return format(dateObj, pattern);
};
export default function TeamleaderExportModal({ isOpen, onClose, rawOrders = [], rawProducts = [], archivedProducts = [], initialExportType = "planning", lockExportType = false, onTaskCreated = null, preloadedTask = null, }) {
    const [exportType, setExportType] = useState("planning"); // 'planning', 'lotnummers' of 'ln_compare'
    const [selectedMachine, setSelectedMachine] = useState("Alle machines");
    const [isRequestingExport, setIsRequestingExport] = useState(false);
    const [activeTaskId, setActiveTaskId] = useState(null);
    const { tasks, downloadTaskResult } = useBackgroundTasks();
    // Planning Filters (Origineel)
    const [orderStatusFilter, setOrderStatusFilter] = useState("lopend");
    const [dateFilterType, setDateFilterType] = useState("all");
    const [singleDate, setSingleDate] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    useEffect(() => {
        if (!isOpen)
            return;
        if (["planning", "lotnummers", "ln_compare"].includes(initialExportType)) {
            setExportType(initialExportType);
        }
        else {
            setExportType("planning");
        }
        // Reset task state when modal (re)opens, unless we have a preloadedTask
        if (!preloadedTask)
            setActiveTaskId(null);
    }, [initialExportType, isOpen, preloadedTask]);
    // Haal actieve taak op uit de task lijst
    const activeTask = preloadedTask ||
        (activeTaskId ? tasks.find(t => t.id === activeTaskId) : null);
    // 1. Ontdubbelen en meest definitieve staat bepalen voor lotnummers
    const allProducts = useMemo(() => {
        const unique = new Map();
        [...rawProducts, ...archivedProducts].forEach(p => {
            const lot = String(p.lotNumber || p.id || "").trim().toUpperCase();
            if (!lot)
                return;
            const getScore = (item) => {
                const isArchived = !!(item.archived || item._archived || item.archivedAt);
                const statusUpper = String(item.status || "").toUpperCase();
                const stepUpper = String(item.currentStep || "").toUpperCase();
                if (statusUpper.includes("REJECT") || statusUpper.includes("AFKEUR") || stepUpper.includes("REJECT"))
                    return 4;
                if (isArchived || statusUpper === "COMPLETED" || statusUpper === "GEREED" || stepUpper === "FINISHED")
                    return 3;
                if (statusUpper === "IN_PROGRESS" || statusUpper === "IN PRODUCTIE")
                    return 2;
                return 1;
            };
            const existing = unique.get(lot);
            if (!existing) {
                unique.set(lot, p);
            }
            else {
                const scoreNew = getScore(p);
                const scoreOld = getScore(existing);
                if (scoreNew > scoreOld) {
                    unique.set(lot, p);
                }
                else if (scoreNew === scoreOld) {
                    const timeNew = new Date(p.updatedAt || p.createdAt || p.timestamps?.finished || 0).getTime();
                    const timeOld = new Date(existing.updatedAt || existing.createdAt || existing.timestamps?.finished || 0).getTime();
                    if (timeNew > timeOld) {
                        unique.set(lot, p);
                    }
                }
            }
        });
        return Array.from(unique.values());
    }, [rawProducts, archivedProducts]);
    // 2. Orders prepareren (Voor Planning Export)
    const allOrders = useMemo(() => {
        const map = new Map();
        rawOrders.forEach(o => {
            if (o.orderId)
                map.set(String(o.orderId).trim().toUpperCase(), o);
        });
        allProducts.forEach(p => {
            const orderId = String(p.orderId || "").trim().toUpperCase();
            if (!orderId)
                return;
            if (!map.has(orderId)) {
                map.set(orderId, {
                    orderId: p.orderId,
                    machine: p.originMachine || p.machine || p.currentStation || p.lastStation || "",
                    item: p.item || p.itemDescription || p.itemCode || "",
                    plan: p.quantity || 0,
                    dateObj: p.createdAt || p.updatedAt || p.timestamps?.finished,
                    weekNumber: p.weekNumber || p.week,
                });
            }
        });
        return Array.from(map.values());
    }, [rawOrders, allProducts]);
    // 3. Alleen actieve lotnummers (Voor Lotnummer Export)
    const activeProducts = useMemo(() => {
        return allProducts.filter(p => {
            const isArchived = !!(p.archived || p._archived || p.archivedAt);
            const statusUpper = String(p.status || "").toUpperCase();
            const stepUpper = String(p.currentStep || "").toUpperCase();
            if (isArchived)
                return false;
            if (statusUpper === "COMPLETED" || statusUpper === "GEREED" || stepUpper === "FINISHED")
                return false;
            // Filter Definitieve Afkeur eruit, maar behoud Tijdelijke Afkeur in de actuele werkvoorraad
            const isDefinitiefAfkeur = (statusUpper.includes("REJECT") && !statusUpper.includes("TEMP")) ||
                (statusUpper.includes("AFKEUR") && !statusUpper.includes("TIJDELIJKE")) ||
                (stepUpper.includes("REJECT") && !stepUpper.includes("TEMP"));
            if (isDefinitiefAfkeur)
                return false;
            return true;
        });
    }, [allProducts]);
    // 4. Beschikbare machines uit orders én lotnummers
    const availableMachines = useMemo(() => {
        const machines = new Set();
        allOrders.forEach(o => {
            if (o.machine) {
                let m = String(o.machine).toUpperCase().replace(/\s/g, "");
                if (m.startsWith("40"))
                    m = m.slice(2);
                if (m)
                    machines.add(m);
            }
        });
        activeProducts.forEach(p => {
            const m = p.currentStation || p.machine || p.originMachine || "";
            if (m) {
                let cleanM = String(m).toUpperCase().replace(/\s/g, "");
                if (cleanM.startsWith("40"))
                    cleanM = cleanM.slice(2);
                if (cleanM)
                    machines.add(cleanM);
            }
        });
        return Array.from(machines).sort();
    }, [allOrders, activeProducts]);
    // Filter voor dropdown: toon in Lotnummer export alleen BH machines
    const displayedMachines = useMemo(() => {
        if (exportType === "lotnummers") {
            const locs = new Set();
            activeProducts.forEach(p => {
                const loc = p.currentStation || p.currentStep || "Onbekend";
                if (loc)
                    locs.add(String(loc).trim());
            });
            return Array.from(locs).sort();
        }
        return availableMachines;
    }, [availableMachines, activeProducts, exportType]);
    useEffect(() => {
        setSelectedMachine("Alle machines");
    }, [exportType, selectedMachine]);
    // 5. Data Planning Export (Originele logica)
    const planningExportData = useMemo(() => {
        const getDeliveryDate = (order) => {
            const d = order.deliveryDate || order.plannedDeliveryDate || order.dueDate || order.dateObj;
            return safeToDate(d);
        };
        const machineOrders = allOrders.filter(o => {
            if (selectedMachine === "Alle machines")
                return true;
            let orderMachine = String(o.machine || "").toUpperCase().replace(/\s/g, "");
            if (orderMachine.startsWith("40"))
                orderMachine = orderMachine.slice(2);
            let filterMachine = String(selectedMachine).toUpperCase().replace(/\s/g, "");
            if (filterMachine.startsWith("40"))
                filterMachine = filterMachine.slice(2);
            return orderMachine === filterMachine;
        });
        return machineOrders.map(order => {
            const orderId = String(order.orderId || "").trim().toUpperCase();
            const orderProducts = allProducts.filter(p => String(p.orderId || "").trim().toUpperCase() === orderId);
            let inBehandelingCount = 0;
            let gereedCount = 0;
            const actieveStappen = new Set();
            orderProducts.forEach(p => {
                const stepUpper = String(p.currentStep || "").toUpperCase();
                const statusUpper = String(p.status || "").toUpperCase();
                const isArchived = !!(p.archived || p._archived || p.archivedAt);
                const isCompleted = isArchived || statusUpper === "COMPLETED" || statusUpper === "GEREED" || stepUpper === "FINISHED";
                const isRejected = statusUpper === "REJECTED" || statusUpper === "AFKEUR" || stepUpper === "REJECTED" || statusUpper === "ARCHIVED_REJECTED";
                if (isCompleted && !isRejected) {
                    gereedCount++;
                }
                else if (!isRejected && !isCompleted) {
                    inBehandelingCount++;
                    if (p.currentStep) {
                        actieveStappen.add(p.currentStep);
                    }
                }
            });
            let planQty = Number(order.plan || order.quantity || 0);
            if (planQty === 0 && (gereedCount > 0 || inBehandelingCount > 0)) {
                planQty = gereedCount + inBehandelingCount;
            }
            const isGeheelGereed = gereedCount >= planQty && inBehandelingCount === 0 && planQty > 0;
            const deliveryDateObj = getDeliveryDate(order);
            const datumLabel = safeFormatDate(deliveryDateObj, 'dd-MM-yyyy', order.date || '');
            const teDoenCount = Math.max(0, planQty - gereedCount);
            let huidigeStap = "";
            if (isGeheelGereed) {
                huidigeStap = "Gereed";
            }
            else if (actieveStappen.size > 0) {
                huidigeStap = Array.from(actieveStappen).join(", ");
            }
            else if (inBehandelingCount === 0 && gereedCount === 0) {
                huidigeStap = order.status || "Gepland";
            }
            else {
                huidigeStap = "In Behandeling";
            }
            return {
                ...order,
                planQty,
                gewikkeldCount: inBehandelingCount,
                inBehandelingCount,
                teDoenCount,
                gereedCount,
                isGeheelGereed,
                deliveryDateObj,
                datumLabel,
                huidigeStap
            };
        }).filter(order => {
            if (orderStatusFilter === "gereed" && !order.isGeheelGereed)
                return false;
            if (orderStatusFilter === "lopend" && order.isGeheelGereed)
                return false;
            if (dateFilterType === "single" && singleDate) {
                if (!order.deliveryDateObj)
                    return false;
                const d = safeFormatDate(order.deliveryDateObj, 'yyyy-MM-dd');
                if (!d)
                    return false;
                if (d !== singleDate)
                    return false;
            }
            else if (dateFilterType === "range" && startDate && endDate) {
                if (!order.deliveryDateObj)
                    return false;
                const d = safeFormatDate(order.deliveryDateObj, 'yyyy-MM-dd');
                if (!d)
                    return false;
                if (d < startDate || d > endDate)
                    return false;
            }
            return true;
        }).sort((a, b) => {
            const weekA = Number(a.weekNumber || a.week || 0);
            const weekB = Number(b.weekNumber || b.week || 0);
            if (weekA !== weekB)
                return weekA - weekB;
            const dateA = a.deliveryDateObj ? a.deliveryDateObj.getTime() : 0;
            const dateB = b.deliveryDateObj ? b.deliveryDateObj.getTime() : 0;
            return dateA - dateB;
        });
    }, [allOrders, allProducts, selectedMachine, orderStatusFilter, dateFilterType, singleDate, startDate, endDate]);
    // 6. Data Lotnummer Export
    const lotnummerExportData = useMemo(() => {
        const getDwellTime = (product) => {
            let startTime = new Date();
            if (product.updatedAt) {
                startTime = typeof product.updatedAt.toDate === 'function' ? product.updatedAt.toDate() : new Date(product.updatedAt);
            }
            else if (product.createdAt) {
                startTime = typeof product.createdAt.toDate === 'function' ? product.createdAt.toDate() : new Date(product.createdAt);
            }
            if (isNaN(startTime.getTime()))
                return "Onbekend";
            return formatDistanceStrict(startTime, new Date(), { locale: nl });
        };
        return activeProducts.filter(p => {
            if (selectedMachine === "Alle machines") {
                return true;
            }
            const pLoc = String(p.currentStation || p.currentStep || "Onbekend").trim();
            return pLoc.toLowerCase() === selectedMachine.toLowerCase();
        }).map(product => {
            return {
                "Lotnummer": product.lotNumber || "Onbekend",
                "Ordernummer": product.orderId || product.orderNumber || "Onbekend",
                "Product Omschrijving": product.item || product.itemDescription || "Onbekend",
                "Oorsprong": product.originMachine || product.machine || "Onbekend",
                "Huidig Station": product.currentStation || product.currentStep || "Onbekend",
                "Status": product.status || product.currentStep || "Onbekend",
                "Verblijftijd": getDwellTime(product)
            };
        }).sort((a, b) => {
            const locCompare = a["Huidig Station"].localeCompare(b["Huidig Station"]);
            if (locCompare !== 0)
                return locCompare;
            return a.Lotnummer.localeCompare(b.Lotnummer);
        });
    }, [activeProducts, selectedMachine]);
    // 7. Active Data Array
    const currentData = useMemo(() => {
        if (exportType === "planning")
            return planningExportData;
        if (exportType === "lotnummers")
            return lotnummerExportData;
        // LN Vergelijking Export (Nieuw)
        // We maken een platte lijst die lijkt op de LN export tisfc140101200
        const filteredOrders = allOrders.filter(o => {
            if (selectedMachine === "Alle machines")
                return true;
            let m = String(o.machine || "").toUpperCase().replace(/\s/g, "");
            if (m.startsWith("40"))
                m = m.slice(2);
            return m === selectedMachine;
        });
        return filteredOrders.map(order => {
            const orderId = String(order.orderId || "").trim().toUpperCase();
            const orderProducts = allProducts.filter(p => String(p.orderId || "").trim().toUpperCase() === orderId);
            const rawDate = order.deliveryDate ?? order.dateObj;
            const gereedCount = orderProducts.filter(p => {
                const stepUpper = String(p.currentStep || "").toUpperCase();
                const statusUpper = String(p.status || "").toUpperCase();
                const isArchived = !!(p.archived || p._archived || p.archivedAt);
                return isArchived || statusUpper === "COMPLETED" || statusUpper === "GEREED" || stepUpper === "FINISHED";
            }).length;
            // Formaat matcht tisfc140... kolom posities (ongeveer)
            return {
                "Ordernummer": orderId,
                "Datum": safeFormatDate(rawDate, 'yyyy-MM-dd HH:mm:ss', ''),
                "Afdeling": order.machine || "",
                "Status": order.isGeheelGereed ? "Gereed" : "Actief",
                "Artikel": order.itemCode || order.articleId || "",
                "Omschrijving": order.item || order.description || "",
                "Plan Aantal": Number(order.plan || order.quantity || 0),
                "Gemaakt Aantal": gereedCount,
                "Totaal Gemaakt": gereedCount,
                "Laatste Sync": order.lastSync || ""
            };
        });
    }, [exportType, planningExportData, lotnummerExportData, allOrders, allProducts, selectedMachine]);
    const handleExportCloud = async () => {
        setIsRequestingExport(true);
        try {
            const requestExportTask = httpsCallable(functions, 'requestExportTask');
            const result = await requestExportTask({
                exportType,
                taskName: `Export ${exportType} voor ${selectedMachine}`,
                filter: {
                    selectedMachine,
                    orderStatusFilter,
                    dateFilterType,
                    singleDate,
                    startDate,
                    endDate
                }
            });
            const taskId = result?.data?.taskId;
            if (taskId) {
                setActiveTaskId(taskId);
                if (onTaskCreated)
                    onTaskCreated(taskId);
            }
            else {
                // Geen taskId → fallback
                handleExportExcel();
            }
        }
        catch (err) {
            console.error("Cloud export error:", err);
            alert("Cloud export niet beschikbaar. We starten direct lokale export.");
            handleExportExcel();
        }
        finally {
            setIsRequestingExport(false);
        }
    };
    const handleExportExcel = () => {
        if (exportType === "planning") {
            const excelData = [];
            let currentWeek = null;
            planningExportData.forEach(order => {
                const orderWeek = order.weekNumber || order.week || '?';
                if (currentWeek !== orderWeek) {
                    excelData.push({
                        'Leverdatum': `=== Week ${orderWeek} ===`,
                        'Week': '', 'Manufactured Item': '', 'Item Desc': '', 'Huidige Stap': '', 'Plan': '', 'Gewikkeld': '', 'Te doen': '', 'Gereed': ''
                    });
                    currentWeek = orderWeek;
                }
                excelData.push({
                    'Leverdatum': order.datumLabel,
                    'Week': orderWeek,
                    'Manufactured Item': order.orderId || '',
                    'Item Desc': order.item || order.description || '',
                    'Huidige Stap': order.huidigeStap,
                    'Plan': order.planQty,
                    'Gewikkeld': order.gewikkeldCount,
                    'Te doen': order.teDoenCount,
                    'Gereed': order.gereedCount
                });
            });
            const ws = XLSX.utils.json_to_sheet(excelData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Planning");
            XLSX.writeFile(wb, `Planning_Export_${selectedMachine === 'Alle machines' ? 'Alle_Machines' : selectedMachine}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
        }
        else if (exportType === "lotnummers") {
            const excelData = [];
            let currentLoc = null;
            lotnummerExportData.forEach(row => {
                const rowLoc = row["Huidig Station"];
                if (currentLoc !== rowLoc) {
                    excelData.push({
                        'Lotnummer': `=== Locatie: ${rowLoc} ===`,
                        'Ordernummer': '', 'Product Omschrijving': '', 'Oorsprong': '', 'Huidig Station': '', 'Status': '', 'Verblijftijd': ''
                    });
                    currentLoc = rowLoc;
                }
                excelData.push(row);
            });
            const ws = XLSX.utils.json_to_sheet(excelData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Lotnummers");
            XLSX.writeFile(wb, `Lotnummer_Export_${selectedMachine === 'Alle machines' ? 'Alle_Machines' : selectedMachine}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
        }
        else {
            // LN Compare Export
            const ws = XLSX.utils.json_to_sheet(currentData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "LN_Comparison");
            XLSX.writeFile(wb, `LN_Vergelijking_${selectedMachine === 'Alle machines' ? 'Alle_Machines' : selectedMachine}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
        }
        onClose();
    };
    const handleExportPDF = () => {
        const doc = new jsPDF('landscape');
        if (exportType === "planning") {
            let dateFilterText = "Alle datums";
            if (dateFilterType === "single" && singleDate) {
                dateFilterText = `Datum: ${singleDate.split('-').reverse().join('-')}`;
            }
            else if (dateFilterType === "range" && startDate && endDate) {
                dateFilterText = `Periode: ${startDate.split('-').reverse().join('-')} t/m ${endDate.split('-').reverse().join('-')}`;
            }
            doc.setFontSize(16);
            doc.text(`Planning Export - Machine: ${selectedMachine} (${orderStatusFilter === 'lopend' ? 'Lopende Orders' : 'Geheel Gereed'})`, 14, 15);
            doc.setFontSize(10);
            doc.text(`Datum gegenereerd: ${format(new Date(), 'dd-MM-yyyy HH:mm')} | ${dateFilterText}`, 14, 22);
            const tableData = [];
            let currentWeek = null;
            planningExportData.forEach(order => {
                const orderWeek = order.weekNumber || order.week || '?';
                if (currentWeek !== orderWeek) {
                    tableData.push([
                        { content: `=== Week ${orderWeek} ===`, colSpan: 9, styles: { halign: 'center', fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' } }
                    ]);
                    currentWeek = orderWeek;
                }
                tableData.push([
                    order.datumLabel, orderWeek, order.orderId || '', order.item || order.description || '',
                    order.huidigeStap, order.planQty, order.gewikkeldCount, order.teDoenCount, order.gereedCount
                ]);
            });
            doc.autoTable({
                startY: 28,
                head: [['Leverdatum', 'Week', 'Manufactured Item', 'Item Desc', 'Huidige Stap', 'Plan', 'Gewikkeld', 'Te doen', 'Gereed']],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: [37, 99, 235], textColor: 255 },
                styles: { fontSize: 9 }
            });
            doc.save(`Planning_Export_${selectedMachine === 'Alle machines' ? 'Alle_Machines' : selectedMachine}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
        }
        else {
            doc.setFontSize(16);
            doc.text(`Actuele Lotnummer Lijst - Machine: ${selectedMachine}`, 14, 15);
            doc.setFontSize(10);
            doc.text(`Datum gegenereerd: ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, 14, 22);
            const tableData = [];
            let currentLoc = null;
            lotnummerExportData.forEach(row => {
                const rowLoc = row["Huidig Station"];
                if (currentLoc !== rowLoc) {
                    tableData.push([
                        { content: `=== Locatie: ${rowLoc} ===`, colSpan: 7, styles: { halign: 'center', fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' } }
                    ]);
                    currentLoc = rowLoc;
                }
                tableData.push([
                    row["Lotnummer"],
                    row["Ordernummer"],
                    row["Product Omschrijving"],
                    row["Oorsprong"],
                    row["Huidig Station"],
                    row["Status"],
                    row["Verblijftijd"]
                ]);
            });
            doc.autoTable({
                startY: 28,
                head: [['Lotnummer', 'Ordernummer', 'Product', 'Oorsprong', 'Huidig Station', 'Status', 'Verblijftijd']],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: [37, 99, 235], textColor: 255 },
                styles: { fontSize: 9 }
            });
            doc.save(`Lotnummer_Export_${selectedMachine === 'Alle machines' ? 'Alle_Machines' : selectedMachine}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
        }
        onClose();
    };
    if (!isOpen)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200", children: _jsxs("div", { className: "bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 scale-100 animate-in zoom-in-95", children: [_jsxs("div", { className: "flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50", children: [_jsxs("h3", { className: "text-lg sm:text-xl font-black text-slate-800 flex items-center gap-3 uppercase italic tracking-tight", children: [_jsx(Download, { size: 20, className: "text-blue-600" }), " Export Module"] }), _jsx("button", { onClick: onClose, className: "text-slate-400 hover:text-slate-600 bg-white p-2 rounded-full shadow-sm border border-slate-200 transition-colors", children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "p-6 space-y-6", children: [!lockExportType && (_jsxs("div", { className: "flex bg-slate-100 p-1.5 rounded-2xl mb-2", children: [_jsxs("button", { onClick: () => setExportType("planning"), className: `flex-1 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-xl transition-all flex justify-center items-center gap-2 ${exportType === 'planning' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`, children: [_jsx(CalendarRange, { size: 16 }), " Planning"] }), _jsxs("button", { onClick: () => setExportType("lotnummers"), className: `flex-1 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-xl transition-all flex justify-center items-center gap-2 ${exportType === 'lotnummers' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`, children: [_jsx(ListTodo, { size: 16 }), " Lotnummers"] }), _jsxs("button", { onClick: () => setExportType("ln_compare"), className: `flex-1 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-xl transition-all flex justify-center items-center gap-2 ${exportType === 'ln_compare' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`, children: [_jsx(Search, { size: 16 }), " Vergelijking"] })] })), _jsxs("div", { children: [_jsxs("label", { className: "flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3", children: [_jsx(Factory, { size: 14 }), " ", exportType === "lotnummers" ? "Selecteer Locatie" : "Selecteer Machine"] }), _jsxs("div", { className: "relative", children: [_jsxs("select", { value: selectedMachine, onChange: (e) => setSelectedMachine(e.target.value), className: "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 transition-colors cursor-pointer appearance-none shadow-sm", children: [_jsx("option", { value: "Alle machines", children: exportType === "lotnummers" ? "Alle locaties" : "Alle machines" }), displayedMachines.map(m => _jsx("option", { value: m, children: m }, m))] }), _jsx("div", { className: "absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs", children: "\u25BC" })] })] }), exportType === "planning" ? (_jsxs("div", { className: "space-y-6 animate-in slide-in-from-left-2 duration-300", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3", children: "Order Status" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => setOrderStatusFilter("lopend"), className: `flex-1 py-3 text-xs font-bold rounded-xl border-2 transition-colors ${orderStatusFilter === "lopend" ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50"}`, children: "Lopende Orders" }), _jsx("button", { onClick: () => setOrderStatusFilter("gereed"), className: `flex-1 py-3 text-xs font-bold rounded-xl border-2 transition-colors ${orderStatusFilter === "gereed" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50"}`, children: "Geheel Gereed" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3", children: "Leverdatum Filter" }), _jsxs("div", { className: "flex gap-2 mb-3", children: [_jsx("button", { onClick: () => setDateFilterType("all"), className: `flex-1 py-3 text-[10px] font-black tracking-widest uppercase rounded-xl border-2 transition-colors ${dateFilterType === "all" ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50"}`, children: "Alles" }), _jsx("button", { onClick: () => setDateFilterType("single"), className: `flex-1 py-3 text-[10px] font-black tracking-widest uppercase rounded-xl border-2 transition-colors ${dateFilterType === "single" ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50"}`, children: "1 Datum" }), _jsx("button", { onClick: () => setDateFilterType("range"), className: `flex-1 py-3 text-[10px] font-black tracking-widest uppercase rounded-xl border-2 transition-colors ${dateFilterType === "range" ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50"}`, children: "Periode" })] }), dateFilterType === "single" && (_jsx("input", { type: "date", value: singleDate, onChange: e => setSingleDate(e.target.value), className: "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 transition-colors" })), dateFilterType === "range" && (_jsxs("div", { className: "flex gap-2 items-center", children: [_jsx("input", { type: "date", value: startDate, onChange: e => setStartDate(e.target.value), className: "flex-1 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 transition-colors" }), _jsx("span", { className: "text-sm font-black text-slate-300", children: "-" }), _jsx("input", { type: "date", value: endDate, onChange: e => setEndDate(e.target.value), className: "flex-1 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 transition-colors" })] }))] })] })) : exportType === "lotnummers" ? (_jsxs("div", { className: "bg-blue-50 p-5 rounded-2xl border border-blue-100 flex gap-3 items-start animate-in slide-in-from-right-2 duration-300", children: [_jsx(Info, { className: "text-blue-500 shrink-0 mt-0.5", size: 20 }), _jsxs("p", { className: "text-xs text-blue-800 leading-relaxed font-medium", children: ["Deze export toont de ", _jsx("strong", { children: "fysieke werkvoorraad" }), " op de vloer. Je ziet direct waar actieve lotnummers liggen en hoelang ze daar al verblijven. Vervangt de oude To Do lijst."] })] })) : (_jsxs("div", { className: "bg-emerald-50 p-5 rounded-2xl border border-emerald-100 flex gap-3 items-start animate-in slide-in-from-right-2 duration-300", children: [_jsx(Search, { className: "text-emerald-500 shrink-0 mt-0.5", size: 20 }), _jsxs("p", { className: "text-xs text-emerald-800 leading-relaxed font-medium", children: ["Deze export genereert een lijst met alle orders, hun status en het ", _jsx("strong", { children: "werkelijk aantal gereedgemelde producten" }), ". Ideaal om naast een LN dump te leggen om verschillen op te sporen."] })] })), _jsx("div", { className: "pt-2 border-t border-slate-100", children: activeTask ? (_jsx("div", { className: "flex flex-col gap-4", children: activeTask.status === 'processing' || activeTask.status === 'pending' ? (_jsxs("div", { className: "flex flex-col items-center gap-4 py-6 px-4 bg-blue-50 rounded-2xl border border-blue-200", children: [_jsx(Loader2, { className: "animate-spin text-blue-500", size: 40 }), _jsxs("div", { className: "text-center", children: [_jsx("p", { className: "font-black text-blue-800 text-sm uppercase tracking-widest", children: "Export wordt aangemaakt" }), _jsx("p", { className: "text-xs text-blue-500 mt-1", children: "Dit kan even duren. Je kunt dit venster sluiten \u2014 we melden het als het klaar is." })] }), _jsx("button", { onClick: onClose, className: "text-xs text-blue-400 hover:text-blue-600 underline", children: "Naar achtergrond sturen" })] })) : activeTask.status === 'completed' ? (_jsxs("div", { className: "flex flex-col items-center gap-4 py-6 px-4 bg-emerald-50 rounded-2xl border border-emerald-200", children: [_jsx(CheckCircle2, { className: "text-emerald-500", size: 40 }), _jsxs("div", { className: "text-center", children: [_jsx("p", { className: "font-black text-emerald-800 text-sm uppercase tracking-widest", children: "Export klaar!" }), _jsx("p", { className: "text-xs text-emerald-600 mt-1", children: activeTask.fileName || 'export.xlsx' })] }), _jsxs("button", { onClick: () => { downloadTaskResult(activeTask); onClose(); }, className: "w-full flex items-center justify-center gap-2 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-xs rounded-2xl transition-all shadow-lg shadow-emerald-200 active:scale-95", children: [_jsx(Download, { size: 18 }), " Bestand downloaden"] })] })) : (_jsxs("div", { className: "flex flex-col items-center gap-4 py-6 px-4 bg-red-50 rounded-2xl border border-red-200", children: [_jsx("p", { className: "font-black text-red-700 text-sm uppercase tracking-widest", children: "Export mislukt" }), _jsx("p", { className: "text-xs text-red-500", children: activeTask.error || 'Onbekende fout' }), _jsx("button", { onClick: () => setActiveTaskId(null), className: "text-xs text-red-400 hover:text-red-600 underline", children: "Opnieuw proberen" })] })) })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center justify-between mb-4 mt-2", children: [_jsx("span", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400", children: "Resultaat" }), _jsxs("span", { className: `px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${currentData.length > 0 ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-slate-100 text-slate-400"}`, children: [_jsx(CheckCircle2, { size: 12 }), currentData.length, " item(s)"] })] }), _jsxs("div", { className: "flex flex-col gap-3", children: [_jsxs("button", { disabled: currentData.length === 0 || isRequestingExport, onClick: handleExportCloud, className: "w-full flex items-center justify-center gap-2 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:bg-slate-300 text-white font-black uppercase tracking-widest text-xs rounded-2xl transition-all shadow-lg shadow-blue-200 active:scale-95", children: [isRequestingExport ? _jsx(Loader2, { className: "animate-spin", size: 18 }) : _jsx(Download, { size: 18 }), "Achtergrond Export (Cloud)"] }), _jsxs("div", { className: "flex flex-col sm:flex-row gap-3", children: [_jsxs("button", { disabled: currentData.length === 0, onClick: handleExportExcel, className: "flex-1 flex items-center justify-center gap-2 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:bg-slate-300 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl transition-all shadow-md active:scale-95", children: [_jsx(FileSpreadsheet, { size: 16 }), " Direct Excel"] }), _jsxs("button", { disabled: currentData.length === 0, onClick: handleExportPDF, className: "flex-1 flex items-center justify-center gap-2 py-4 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:bg-slate-300 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl transition-all shadow-md active:scale-95", children: [_jsx(FileText, { size: 16 }), " PDF"] })] })] })] })) })] })] }) }));
}
