import React, { useState, useEffect, useMemo } from "react";
import i18n from "i18next";
import {
  ClipboardCheck,
  Loader2,
  Calendar,
  Search,
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  User,
  Database
} from "lucide-react";
import { collection, query, where, orderBy, getDocs, limit, type DocumentData } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS, getPathString } from "../../config/dbPaths";
import { format, startOfWeek } from "date-fns";
import { nl } from "date-fns/locale";

// 👇 PAS DEZE WAARDE AAN NAAR DE EXACTE ACTIE-NAAM UIT JOUW AUDIT LOG 👇
const ACTION_NAME = "FLOOR_CONTROL"; 
// (Bijvoorbeeld: "FLOOR_CONTROL_COMPLETED" of "VLOERCONTROLE_AFGERONDT")

type FloorControlLog = {
  id: string;
  timestamp: Date;
  userEmail: string;
  operatorInfo: string;
  station: string;
  foundCount: number;
  missingCount: number;
  unexpectedCount: number;
  details: Record<string, any>;
};

export default function FloorControlReportsView() {
  const [logs, setLogs] = useState<FloorControlLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<"day" | "week">("day");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      try {
        // Haal de logs op uit future-factory/audit/logs
        const logsRef = collection(db, getPathString(PATHS.AUDIT_LOGS));
        const q = query(
          logsRef,
          where("action", "==", ACTION_NAME),
          orderBy("timestamp", "desc"),
          limit(200)
        );

        const snapshot = await getDocs(q);
        
        const fetchedLogs: FloorControlLog[] = snapshot.docs.map(docSnap => {
          const data = docSnap.data();
          
          // Bepaal de datum
          let timestamp = new Date();
          if (data.timestamp?.toDate) {
            timestamp = data.timestamp.toDate();
          } else if (data.timestamp) {
            timestamp = new Date(data.timestamp);
          }

          // Probeer de details te parsen (als het een string is)
          let detailsObj: any = {};
          if (typeof data.details === "string") {
            try {
              detailsObj = JSON.parse(data.details);
            } catch (e) {
              detailsObj = { message: data.details };
            }
          } else if (typeof data.details === "object" && data.details !== null) {
            detailsObj = data.details;
          }

          // Bepaal de echte operator op basis van de details (naam, nummer), fallback naar terminal account
          const operatorInfo = detailsObj.operatorName || detailsObj.operator || detailsObj.operatorNumber || (data.userEmail ? data.userEmail.split('@')[0] : "Onbekend");

          return {
            id: docSnap.id,
            timestamp,
            userEmail: data.userEmail || "Onbekend",
            operatorInfo: String(operatorInfo),
            station: detailsObj.station || detailsObj.machine || "Alle",
            foundCount: Number(detailsObj.foundCount || detailsObj.found || 0),
            missingCount: Number(detailsObj.missingCount || detailsObj.missing || 0),
            unexpectedCount: Number(detailsObj.unexpectedCount || detailsObj.unexpected || 0),
            details: detailsObj
          };
        });

        setLogs(fetchedLogs);
      } catch (error) {
        console.error("Fout bij ophalen vloercontrole rapporten:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, []);

  // Filter en Groepeer data
  const groupedReports = useMemo(() => {
    const filtered = logs.filter(log => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        log.operatorInfo.toLowerCase().includes(term) ||
        log.station.toLowerCase().includes(term)
      );
    });

    const groups: Record<string, FloorControlLog[]> = {};

    filtered.forEach(log => {
      let groupKey = "";
      if (groupBy === "day") {
        groupKey = format(log.timestamp, "EEEE dd MMMM yyyy", { locale: nl });
      } else {
        const weekStart = startOfWeek(log.timestamp, { weekStartsOn: 1 });
        groupKey = `Week ${format(log.timestamp, "I")} (${format(weekStart, "dd MMM")})`;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(log);
    });

    return groups;
  }, [logs, groupBy, searchTerm]);

  const handleExportCSV = () => {
    if (logs.length === 0) return;
    const headers = ["Datum", "Tijdstip", "Station", "Gebruiker", "Gevonden", "Missend", "Onverwacht"];
    const rows = logs.map(log => [
      format(log.timestamp, "dd-MM-yyyy"),
      format(log.timestamp, "HH:mm"),
      `"${log.station}"`,
      `"${log.operatorInfo}"`,
      log.foundCount,
      log.missingCount,
      log.unexpectedCount
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `vloercontrole_rapporten_${format(new Date(), "yyyyMMdd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = async () => {
    if (logs.length === 0) return;
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      doc.setFontSize(18);
      doc.text("Vloercontrole Rapporten", 14, 22);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Gegenereerd op: ${format(new Date(), "dd-MM-yyyy HH:mm")}`, 14, 30);

      const tableColumn = ["Datum", "Tijd", "Station", "Gebruiker", "Gevonden", "Missend", "Onverwacht"];
      const tableRows = logs.map(log => [
        format(log.timestamp, "dd-MM-yyyy"),
        format(log.timestamp, "HH:mm"),
        log.station,
        log.operatorInfo,
        log.foundCount.toString(),
        log.missingCount.toString(),
        log.unexpectedCount.toString()
      ]);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 35,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 23, 42] }
      });

      doc.save(`vloercontrole_rapporten_${format(new Date(), "yyyyMMdd")}.pdf`);
    } catch (err) {
      console.error("PDF export mislukt:", err);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-50 gap-4 p-8">
        <Loader2 className="animate-spin text-cyan-600" size={48} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          Rapporten ophalen...
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 text-left overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-8 flex flex-col md:flex-row justify-between items-center shrink-0 shadow-sm gap-6">
        <div className="flex items-center gap-6">
          <div className="p-4 bg-slate-900 text-white rounded-[20px] shadow-lg">
            <ClipboardCheck size={28} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
              {i18n.t("floorControlReports.floorCheck", "Vloercontrole")} <span className="text-cyan-600">{i18n.t("floorControlReports.reports", "Rapporten")}</span>
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
              Overzicht van uitgevoerde rondes op de fabrieksvloer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={i18n.t("placeholders.adminFloorControlSearch", "Zoek op station of gebruiker...")}
              className="pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-cyan-500 transition-all"
            />
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-2xl">
            <button
              onClick={() => setGroupBy("day")}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${groupBy === "day" ? "bg-white text-cyan-600 shadow-sm" : "text-slate-500"}`}
            >
              Per Dag
            </button>
            <button
              onClick={() => setGroupBy("week")}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${groupBy === "week" ? "bg-white text-cyan-600 shadow-sm" : "text-slate-500"}`}
            >
              Per Week
            </button>
          </div>

          <div className="flex gap-2 border-l border-slate-200 pl-4">
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-white border-2 border-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2"
            >
              <Download size={14} /> CSV
            </button>
            <button
              onClick={handleExportPDF}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm flex items-center gap-2"
            >
              <FileText size={14} /> PDF
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-10">
          {Object.keys(groupedReports).length === 0 ? (
             <div className="py-20 text-center bg-white rounded-[40px] border-2 border-dashed border-slate-200">
               <Database size={64} className="mx-auto mb-4 text-slate-200" />
               <p className="text-sm font-black uppercase tracking-widest text-slate-400">
                 Geen vloercontrole rapporten gevonden.
               </p>
             </div>
          ) : (
            Object.entries(groupedReports).map(([groupTitle, groupLogs]) => (
              <div key={groupTitle} className="space-y-4">
                <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Calendar size={16} /> {groupTitle}
                  <span className="ml-auto bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-[10px]">
                    {groupLogs.length} rondes
                  </span>
                </h3>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {groupLogs.map(log => (
                    <div key={log.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <span className="bg-slate-900 text-white px-2.5 py-1 rounded-lg text-[9px] font-black uppercase italic tracking-widest">
                            {log.station}
                          </span>
                          <p className="text-xs text-slate-400 font-bold mt-2 flex items-center gap-1.5">
                            <User size={12} /> {log.operatorInfo}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                          {format(log.timestamp, "HH:mm")}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-6">
                        <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-2xl text-center">
                          <p className="text-xl font-black text-emerald-600">{log.foundCount}</p>
                          <p className="text-[8px] font-black text-emerald-700 uppercase tracking-widest mt-1">{i18n.t("inventoryCheck.found", "Gevonden")}</p>
                        </div>
                        <div className="bg-rose-50 border border-rose-100 p-3 rounded-2xl text-center">
                          <p className="text-xl font-black text-rose-600">{log.missingCount}</p>
                          <p className="text-[8px] font-black text-rose-700 uppercase tracking-widest mt-1">{i18n.t("inventoryCheck.missing", "Missend")}</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl text-center">
                          <p className="text-xl font-black text-amber-600">{log.unexpectedCount}</p>
                          <p className="text-[8px] font-black text-amber-700 uppercase tracking-widest mt-1">{i18n.t("inventoryCheck.unexpected", "Onverwacht")}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}