import React, { useState, useMemo, useEffect } from "react";
import { X, FileSpreadsheet, FileText, Download, Info, CheckCircle2, Factory, CalendarRange, ListTodo } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { format, formatDistanceStrict } from "date-fns";
import { nl } from "date-fns/locale";

export default function TeamleaderExportModal({ isOpen, onClose, rawOrders = [], rawProducts = [], archivedProducts = [] }) {
  const [exportType, setExportType] = useState("planning"); // 'planning' of 'lotnummers'
  const [selectedMachine, setSelectedMachine] = useState("Alle machines");

  // Planning Filters (Origineel)
  const [orderStatusFilter, setOrderStatusFilter] = useState("lopend");
  const [dateFilterType, setDateFilterType] = useState("all");
  const [singleDate, setSingleDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // 1. Ontdubbelen en meest definitieve staat bepalen voor lotnummers
  const allProducts = useMemo(() => {
    const unique = new Map();

    [...rawProducts, ...archivedProducts].forEach(p => {
      const lot = String(p.lotNumber || p.id || "").trim().toUpperCase();
      if (!lot) return;

      const getScore = (item) => {
        const isArchived = !!(item.archived || item._archived || item.archivedAt);
        const statusUpper = String(item.status || "").toUpperCase();
        const stepUpper = String(item.currentStep || "").toUpperCase();

        if (statusUpper.includes("REJECT") || statusUpper.includes("AFKEUR") || stepUpper.includes("REJECT")) return 4;
        if (isArchived || statusUpper === "COMPLETED" || statusUpper === "GEREED" || stepUpper === "FINISHED") return 3;
        if (statusUpper === "IN_PROGRESS" || statusUpper === "IN PRODUCTIE") return 2;
        return 1;
      };

      const existing = unique.get(lot);
      if (!existing) {
        unique.set(lot, p);
      } else {
        const scoreNew = getScore(p);
        const scoreOld = getScore(existing);
        if (scoreNew > scoreOld) {
          unique.set(lot, p);
        } else if (scoreNew === scoreOld) {
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
      if (o.orderId) map.set(String(o.orderId).trim().toUpperCase(), o);
    });

    allProducts.forEach(p => {
      const orderId = String(p.orderId || "").trim().toUpperCase();
      if (!orderId) return;

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

      if (isArchived) return false;
      if (statusUpper === "COMPLETED" || statusUpper === "GEREED" || stepUpper === "FINISHED") return false;
      
      // Filter Definitieve Afkeur eruit, maar behoud Tijdelijke Afkeur in de actuele werkvoorraad
      const isDefinitiefAfkeur = 
        (statusUpper.includes("REJECT") && !statusUpper.includes("TEMP")) || 
        (statusUpper.includes("AFKEUR") && !statusUpper.includes("TIJDELIJKE")) ||
        (stepUpper.includes("REJECT") && !stepUpper.includes("TEMP"));
      if (isDefinitiefAfkeur) return false;

      return true;
    });
  }, [allProducts]);

  // 4. Beschikbare machines uit orders én lotnummers
  const availableMachines = useMemo(() => {
    const machines = new Set();
    allOrders.forEach(o => {
      if (o.machine) {
        let m = String(o.machine).toUpperCase().replace(/\s/g, "");
        if (m.startsWith("40")) m = m.slice(2);
        if (m) machines.add(m);
      }
    });
    activeProducts.forEach(p => {
      const m = p.currentStation || p.machine || p.originMachine || "";
      if (m) {
        let cleanM = String(m).toUpperCase().replace(/\s/g, "");
        if (cleanM.startsWith("40")) cleanM = cleanM.slice(2);
        if (cleanM) machines.add(cleanM);
      }
    });
    return Array.from(machines).sort();
  }, [allOrders, activeProducts]);

  // Filter voor dropdown: toon in Lotnummer export alleen BH machines
  const displayedMachines = useMemo(() => {
    if (exportType === "lotnummers") {
      return availableMachines.filter(m => m.startsWith("BH"));
    }
    return availableMachines;
  }, [availableMachines, exportType]);

  useEffect(() => {
    if (exportType === "lotnummers" && selectedMachine !== "Alle machines" && !selectedMachine.startsWith("BH")) {
      setSelectedMachine("Alle machines");
    }
  }, [exportType, selectedMachine]);

  // 5. Data Planning Export (Originele logica)
  const planningExportData = useMemo(() => {
    const getDeliveryDate = (order) => {
      const d = order.deliveryDate || order.plannedDeliveryDate || order.dueDate || order.dateObj;
      if (!d) return null;
      if (typeof d.toDate === 'function') return d.toDate();
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    const machineOrders = allOrders.filter(o => {
      if (selectedMachine === "Alle machines") return true;
      let orderMachine = String(o.machine || "").toUpperCase().replace(/\s/g, "");
      if (orderMachine.startsWith("40")) orderMachine = orderMachine.slice(2);
      
      let filterMachine = String(selectedMachine).toUpperCase().replace(/\s/g, "");
      if (filterMachine.startsWith("40")) filterMachine = filterMachine.slice(2);
      
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
        } else if (!isRejected && !isCompleted) {
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
      const datumLabel = deliveryDateObj ? format(deliveryDateObj, 'dd-MM-yyyy') : (order.date || '');
      const teDoenCount = Math.max(0, planQty - gereedCount);

      let huidigeStap = "";
      if (isGeheelGereed) {
          huidigeStap = "Gereed";
      } else if (actieveStappen.size > 0) {
          huidigeStap = Array.from(actieveStappen).join(", ");
      } else if (inBehandelingCount === 0 && gereedCount === 0) {
          huidigeStap = order.status || "Gepland";
      } else {
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
      if (orderStatusFilter === "gereed" && !order.isGeheelGereed) return false;
      if (orderStatusFilter === "lopend" && order.isGeheelGereed) return false;

      if (dateFilterType === "single" && singleDate) {
        if (!order.deliveryDateObj) return false;
        const d = format(order.deliveryDateObj, 'yyyy-MM-dd');
        if (d !== singleDate) return false;
      } else if (dateFilterType === "range" && startDate && endDate) {
        if (!order.deliveryDateObj) return false;
        const d = format(order.deliveryDateObj, 'yyyy-MM-dd');
        if (d < startDate || d > endDate) return false;
      }
      return true;
    }).sort((a, b) => {
        const weekA = Number(a.weekNumber || a.week || 0);
        const weekB = Number(b.weekNumber || b.week || 0);
        if (weekA !== weekB) return weekA - weekB;

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
      } else if (product.createdAt) {
        startTime = typeof product.createdAt.toDate === 'function' ? product.createdAt.toDate() : new Date(product.createdAt);
      }
      
      if (isNaN(startTime.getTime())) return "Onbekend";
      return formatDistanceStrict(startTime, new Date(), { locale: nl });
    };

    return activeProducts.filter(p => {
      let pOrigin = String(p.originMachine || p.machine || p.currentStation || "").toUpperCase().replace(/\s/g, "");
      if (pOrigin.startsWith("40")) pOrigin = pOrigin.slice(2);

      if (selectedMachine === "Alle machines") {
        return pOrigin.startsWith("BH"); // We willen in de lotnummer lijst alleen de output van de BH machines
      }
      
      
      let filterMachine = String(selectedMachine).toUpperCase().replace(/\s/g, "");
      if (filterMachine.startsWith("40")) filterMachine = filterMachine.slice(2);
      
      return pOrigin === filterMachine;
    }).map(product => {
      return {
        "Lotnummer": product.lotNumber || "Onbekend",
        "Ordernummer": product.orderId || product.orderNumber || "Onbekend",
        "Product Omschrijving": product.item || product.itemDescription || "Onbekend",
        "Oorsprong": product.originMachine || product.machine || "Onbekend",
        "Huidig Station": product.currentStation || product.machine || product.originMachine || "Onbekend",
        "Status": product.status || product.currentStep || "Onbekend",
        "Verblijftijd": getDwellTime(product)
      };
    }).sort((a, b) => a.Lotnummer.localeCompare(b.Lotnummer));
  }, [activeProducts, selectedMachine]);

  // 7. Active Data Array
  const currentData = exportType === "planning" ? planningExportData : lotnummerExportData;

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
    } else {
      const ws = XLSX.utils.json_to_sheet(lotnummerExportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Lotnummers");
      XLSX.writeFile(wb, `Lotnummer_Export_${selectedMachine === 'Alle machines' ? 'Alle_Machines' : selectedMachine}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
    }
    onClose();
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    
    if (exportType === "planning") {
      let dateFilterText = "Alle datums";
      if (dateFilterType === "single" && singleDate) {
        dateFilterText = `Datum: ${singleDate.split('-').reverse().join('-')}`;
      } else if (dateFilterType === "range" && startDate && endDate) {
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
    } else {
      doc.setFontSize(16);
      doc.text(`Actuele Lotnummer Lijst - Machine: ${selectedMachine}`, 14, 15);
      doc.setFontSize(10);
      doc.text(`Datum gegenereerd: ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, 14, 22);

      const tableData = lotnummerExportData.map(row => [
        row["Lotnummer"],
        row["Ordernummer"],
        row["Product Omschrijving"],
        row["Oorsprong"],
        row["Huidig Station"],
        row["Status"],
        row["Verblijftijd"]
      ]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 scale-100 animate-in zoom-in-95">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-lg sm:text-xl font-black text-slate-800 flex items-center gap-3 uppercase italic tracking-tight">
            <Download size={20} className="text-blue-600" /> Export Module
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-white p-2 rounded-full shadow-sm border border-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Export Type Toggle */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-2">
            <button onClick={() => setExportType("planning")} className={`flex-1 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-xl transition-all flex justify-center items-center gap-2 ${exportType === 'planning' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>
              <CalendarRange size={16} /> Planning
            </button>
            <button onClick={() => setExportType("lotnummers")} className={`flex-1 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-xl transition-all flex justify-center items-center gap-2 ${exportType === 'lotnummers' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>
              <ListTodo size={16} /> Lotnummers
            </button>
          </div>

          {/* Filter Dropdown */}
          <div>
            <label className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
              <Factory size={14} /> Selecteer Machine
            </label>
            <div className="relative">
              <select value={selectedMachine} onChange={(e) => setSelectedMachine(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 transition-colors cursor-pointer appearance-none shadow-sm">
                <option value="Alle machines">Alle machines</option>
                {displayedMachines.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                ▼
              </div>
            </div>
          </div>

          {/* Dynamic Content based on Type */}
          {exportType === "planning" ? (
            <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Order Status</label>
                <div className="flex gap-2">
                  <button onClick={() => setOrderStatusFilter("lopend")} className={`flex-1 py-3 text-xs font-bold rounded-xl border-2 transition-colors ${orderStatusFilter === "lopend" ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50"}`}>Lopende Orders</button>
                  <button onClick={() => setOrderStatusFilter("gereed")} className={`flex-1 py-3 text-xs font-bold rounded-xl border-2 transition-colors ${orderStatusFilter === "gereed" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50"}`}>Geheel Gereed</button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Leverdatum Filter</label>
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setDateFilterType("all")} className={`flex-1 py-3 text-[10px] font-black tracking-widest uppercase rounded-xl border-2 transition-colors ${dateFilterType === "all" ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50"}`}>Alles</button>
                  <button onClick={() => setDateFilterType("single")} className={`flex-1 py-3 text-[10px] font-black tracking-widest uppercase rounded-xl border-2 transition-colors ${dateFilterType === "single" ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50"}`}>1 Datum</button>
                  <button onClick={() => setDateFilterType("range")} className={`flex-1 py-3 text-[10px] font-black tracking-widest uppercase rounded-xl border-2 transition-colors ${dateFilterType === "range" ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50"}`}>Periode</button>
                </div>
                
                {dateFilterType === "single" && (
                  <input type="date" value={singleDate} onChange={e => setSingleDate(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 transition-colors" />
                )}
                
                {dateFilterType === "range" && (
                  <div className="flex gap-2 items-center">
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 transition-colors" />
                    <span className="text-sm font-black text-slate-300">-</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex-1 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 transition-colors" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 flex gap-3 items-start animate-in slide-in-from-right-2 duration-300">
              <Info className="text-blue-500 shrink-0 mt-0.5" size={20} />
              <p className="text-xs text-blue-800 leading-relaxed font-medium">
                Deze export toont de <strong>fysieke werkvoorraad</strong> op de vloer. Je ziet direct waar actieve lotnummers liggen en hoelang ze daar al verblijven. Vervangt de oude To Do lijst.
              </p>
            </div>
          )}

          {/* Actieknoppen & Teller */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-4 mt-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Resultaat</span>
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${currentData.length > 0 ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-slate-100 text-slate-400"}`}>
                <CheckCircle2 size={12} />
                {currentData.length} item(s)
              </span>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <button disabled={currentData.length === 0} onClick={handleExportExcel} className="flex-1 flex items-center justify-center gap-2 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:bg-slate-300 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl transition-all shadow-md active:scale-95"><FileSpreadsheet size={16} /> Excel</button>
              <button disabled={currentData.length === 0} onClick={handleExportPDF} className="flex-1 flex items-center justify-center gap-2 py-4 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:bg-slate-300 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl transition-all shadow-md active:scale-95"><FileText size={16} /> PDF</button>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
