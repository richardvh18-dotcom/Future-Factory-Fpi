import React, { useState, useMemo } from "react";
import {
  X,
  FileText,
  Zap,
  CheckCircle2,
  AlertOctagon,
  Box,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Search,
  User,
} from "lucide-react";
import { format } from "date-fns";

/**
 * TraceModal - Toont de gedetailleerde lijst die hoort bij een KPI tegel.
 */

const TraceModal = ({ isOpen, onClose, title, data = [], onRowClick }) => {
  const [sortConfig, setSortConfig] = useState({ key: 'updatedAt', direction: 'desc' });
  const [searchTerm, setSearchTerm] = useState("");

  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    const lowerTerm = searchTerm.toLowerCase();
    return data.filter((item) => {
      return (
        (item.lotNumber || "").toLowerCase().includes(lowerTerm) ||
        (item.orderId || "").toLowerCase().includes(lowerTerm) ||
        (item.item || "").toLowerCase().includes(lowerTerm) ||
        (item.itemCode || "").toLowerCase().includes(lowerTerm) ||
        (item.operatorName || "").toLowerCase().includes(lowerTerm) ||
        (item.machine || item.stationLabel || "").toLowerCase().includes(lowerTerm) ||
        (item.status || "").toLowerCase().includes(lowerTerm)
      );
    });
  }, [data, searchTerm]);

  const sortedData = useMemo(() => {
    if (!filteredData) return [];
    let sortableItems = [...filteredData];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Speciale handling voor datums en fallbacks
        if (sortConfig.key === 'updatedAt') {
             const getDate = (obj) => obj.updatedAt || obj.lastUpdated || obj.createdAt;
             const getMillis = (d) => d?.toDate ? d.toDate().getTime() : (new Date(d).getTime() || 0);
             
             aValue = getMillis(getDate(a));
             bValue = getMillis(getDate(b));
        } else {
             // String handling
             aValue = aValue ? String(aValue).toLowerCase() : "";
             bValue = bValue ? String(bValue).toLowerCase() : "";
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredData, sortConfig]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getStatusColor = (status) => {
    const s = (status || "").toLowerCase();
    if (['completed', 'gereed', 'finished', 'shipped', 'verzonden'].some(k => s.includes(k))) return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
    if (['in_progress', 'actief', 'running', 'productie', 'production'].some(k => s.includes(k))) return 'bg-blue-100 text-blue-700 border border-blue-200';
    if (['rejected', 'afkeur', 'fout'].some(k => s.includes(k)) && !s.includes('tijdelijk')) return 'bg-rose-100 text-rose-700 border border-rose-200';
    if (['tijdelijk', 'temp', 'hold', 'wacht', 'te lossen', 'inspectie'].some(k => s.includes(k))) return 'bg-orange-100 text-orange-700 border border-orange-200';
    if (['delegated', 'uitbesteed', 'spools'].some(k => s.includes(k))) return 'bg-purple-100 text-purple-700 border border-purple-200';
    return 'bg-slate-100 text-slate-500 border border-slate-200';
  };

  const formatStatus = (status) => {
    if (!status) return "-";
    const s = String(status).toLowerCase();
    
    if (s === 'in_progress' || s === 'in production') return 'In Productie';
    if (s === 'pending') return 'Wachtend';
    if (s === 'planned') return 'Gepland';
    if (s === 'completed' || s === 'finished') return 'Gereed';
    if (s === 'rejected') return 'Afkeur';
    if (s === 'delegated') return 'Uitbesteed';
    if (s === 'hold_area') return 'Wacht op...';
    if (s === 'temp_reject' || s === 'tijdelijke afkeur') return 'Tijdelijke Afkeur';
    
    return status;
  };

  const formatDisplayDate = (dateInput) => {
    if (!dateInput) return "-";
    try {
      const date = dateInput.toDate ? dateInput.toDate() : new Date(dateInput);
      if (isNaN(date.getTime())) return "-";
      return format(date, "dd-MM-yyyy HH:mm");
    } catch (error) {
      return "-";
    }
  };

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return <div className="w-3 h-3" />; // Placeholder
    return sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-5xl h-[95vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-lg">
              <FileText size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">
                {title}
              </h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Totaal: {filteredData.length} items gevonden {searchTerm && `(van ${data.length})`}
              </p>
            </div>
          </div>

          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Zoeken..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-all shadow-sm"
              autoFocus
            />
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
          >
            <X size={28} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0 p-6 bg-white">
          {filteredData.length === 0 ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar py-20 text-center opacity-30">
              <Box size={64} className="mx-auto mb-4" />
              <p className="font-black uppercase tracking-widest text-xs">
                Geen data beschikbaar voor deze selectie
              </p>
            </div>
          ) : (
            <div className="flex-1 border border-slate-100 rounded-2xl overflow-hidden flex flex-col shadow-sm">
              <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-20 shadow-sm">
                    <tr>
                      <th className="px-6 py-3 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none" onClick={() => requestSort('lotNumber')}>
                        <div className="flex items-center gap-1">
                          Identificatie <SortIcon columnKey="lotNumber" />
                        </div>
                      </th>
                      <th className="px-6 py-3 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none" onClick={() => requestSort('item')}>
                        <div className="flex items-center gap-1">
                          Product Info <SortIcon columnKey="item" />
                        </div>
                      </th>
                      <th className="px-6 py-3 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none" onClick={() => requestSort('machine')}>
                        <div className="flex items-center gap-1">
                          Station <SortIcon columnKey="machine" />
                        </div>
                      </th>
                      <th className="px-6 py-3 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none" onClick={() => requestSort('status')}>
                        <div className="flex items-center gap-1">
                          Status <SortIcon columnKey="status" />
                        </div>
                      </th>
                      <th className="px-6 py-3 text-right bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none" onClick={() => requestSort('updatedAt')}>
                        <div className="flex items-center justify-end gap-1">
                          Laatste Update <SortIcon columnKey="updatedAt" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {sortedData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-blue-50/30 transition-colors group cursor-pointer"
                        onClick={() => onRowClick && onRowClick(item)}
                      >
                        <td className="px-6 py-4">
                          <div className="font-black text-slate-900 text-sm">
                            {item.lotNumber || item.orderId}
                          </div>
                          {item.lotNumber && (
                            <div className="text-[9px] font-bold text-slate-400 uppercase">
                              Order: {item.orderId}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-700 truncate max-w-[200px]">
                            {item.item || "Geen omschrijving"}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {item.itemCode || item.productId}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg font-black text-blue-600 uppercase italic">
                            {item.machine || item.stationLabel || "-"}
                          </span>
                          {(item.operatorName || item.operator) && (
                            <div className="text-[9px] font-bold text-slate-400 mt-1.5 flex items-center gap-1">
                               <User size={10} />
                               {item.operatorName || (item.operator && item.operator.split('@')[0])}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${getStatusColor(item.status)}`}>
                            {formatStatus(item.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="text-slate-900 font-bold">
                            {formatDisplayDate(item.updatedAt || item.lastUpdated || item.createdAt)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};

export default TraceModal;
