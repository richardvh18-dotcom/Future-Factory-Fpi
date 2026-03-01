import React, { useState, useEffect, useMemo } from 'react';
import { 
  BrainCircuit, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  ArrowRight, 
  Clock, 
  BarChart3,
  Loader2,
  X
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { PATHS } from '../../config/dbPaths';
import { calculateDuration, formatMinutes } from '../../utils/efficiencyCalculator';

/**
 * AiPredictionView
 * Analyseert historische productiedata om trends, afwijkingen en nieuwe standaardtijden te voorspellen.
 */
const AiPredictionView = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  const [trackingData, setTrackingData] = useState([]);
  const [archivedData, setArchivedData] = useState([]);
  const [standards, setStandards] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    const unsubTracking = onSnapshot(collection(db, ...PATHS.TRACKING), (snap) => {
      setTrackingData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Haal ook het archief van het huidige jaar op voor een complete analyse
    const currentYear = new Date().getFullYear();
    const archiveRef = collection(db, "future-factory", "production", "archive", String(currentYear), "items");
    const unsubArchive = onSnapshot(archiveRef, (snap) => {
      setArchivedData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubStandards = onSnapshot(collection(db, ...PATHS.EFFICIENCY_HOURS), (snap) => {
      setStandards(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    setLoading(false);
    return () => {
      unsubTracking();
      unsubArchive();
      unsubStandards();
    };
  }, []);

  const analysis = useMemo(() => {
    const allData = [...trackingData, ...archivedData];
    if (!allData.length) return [];

    const productGroups = {};

    allData.forEach(log => {
      if (!log.itemCode || !log.timestamps?.station_start) return;
      
      const isCompleted = log.status === 'completed' || log.status === 'shipped' || log.currentStep === 'Finished';
      if (!isCompleted) return;

      const start = log.timestamps.station_start.toDate ? log.timestamps.station_start.toDate() : new Date(log.timestamps.station_start);
      const end = log.timestamps.finished?.toDate ? log.timestamps.finished.toDate() : 
                  (log.updatedAt?.toDate ? log.updatedAt.toDate() : new Date());
      
      const duration = calculateDuration(start, end);
      
      if (duration < 1 || duration > 600) return;

      if (!productGroups[log.itemCode]) {
        productGroups[log.itemCode] = {
          logs: [],
          item: log.item || "Onbekend"
        };
      }
      
      productGroups[log.itemCode].logs.push({
        date: start,
        duration: duration,
        operator: log.operator || "Onbekend"
      });
    });

    return Object.entries(productGroups).map(([code, data]) => {
      const logs = data.logs.sort((a, b) => a.date - b.date);
      const count = logs.length;
      
      if (count === 0) return null;

      const totalDuration = logs.reduce((sum, l) => sum + l.duration, 0);
      const avgDuration = totalDuration / count;

      const std = standards.find(s => s.itemCode === code || s.productId === code);
      const targetTime = std ? (std.standardTimeTotal || std.standardMinutes || 0) : avgDuration;

      const recentLogs = logs.slice(-5);
      const recentAvg = recentLogs.reduce((sum, l) => sum + l.duration, 0) / recentLogs.length;
      const trendDiff = recentAvg - avgDuration;

      const variance = logs.reduce((sum, l) => sum + Math.pow(l.duration - avgDuration, 2), 0) / count;
      const stdDev = Math.sqrt(variance);
      const stabilityScore = 100 - Math.min(100, (stdDev / avgDuration) * 100);

      let recommendation = "maintain";
      let confidence = "low";

      if (count > 10) confidence = "medium";
      if (count > 30) confidence = "high";

      const deviation = targetTime > 0 ? ((avgDuration - targetTime) / targetTime) * 100 : 0;
      
      if (deviation > 10 && confidence !== 'low') recommendation = "increase_target";
      if (deviation < -10 && confidence !== 'low') recommendation = "decrease_target";

      return {
        itemCode: code,
        itemName: data.item,
        count,
        avgDuration,
        recentAvg,
        targetTime,
        deviation,
        trendDiff,
        stabilityScore,
        recommendation,
        confidence,
        logs: logs
      };
    }).filter(Boolean).sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));

  }, [trackingData, archivedData, standards]);

  const filteredAnalysis = useMemo(() => {
    if (!searchTerm) return analysis;
    const lower = searchTerm.toLowerCase();
    return analysis.filter(a => 
      a.itemCode.toLowerCase().includes(lower) || 
      a.itemName.toLowerCase().includes(lower)
    );
  }, [analysis, searchTerm]);

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="animate-spin text-blue-600" size={48} />
    </div>
  );

  return (
    <div className="bg-slate-50 min-h-full p-6 animate-in fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter flex items-center gap-3">
            <BrainCircuit className="text-purple-600" size={32} />
            AI Voorspellingen & Analyse
          </h1>
          <p className="text-slate-500 font-bold mt-1">
            Analyse op basis van {trackingData.length + archivedData.length} productielogs
          </p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
          <X size={24} className="text-slate-400" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
              <BrainCircuit size={24} />
            </div>
            <div>
              <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Geanalyseerde Producten</div>
              <div className="text-2xl font-black text-slate-800">{analysis.length}</div>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <AlertTriangle size={24} />
            </div>
            <div>
              <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Afwijkingen &gt; 10%</div>
              <div className="text-2xl font-black text-slate-800">
                {analysis.filter(a => Math.abs(a.deviation) > 10).length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <TrendingUp size={24} />
            </div>
            <div>
              <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Optimalisatie Kansen</div>
              <div className="text-2xl font-black text-slate-800">
                {analysis.filter(a => a.recommendation !== 'maintain').length}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input 
          type="text" 
          placeholder="Zoek op productcode of omschrijving..." 
          className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-purple-500 transition-all shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-[30px] border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Product</th>
              <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Target</th>
              <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">AI Gemiddelde</th>
              <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Afwijking</th>
              <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Trend</th>
              <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Advies</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredAnalysis.map((item) => (
              <tr key={item.itemCode} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="font-black text-slate-800">{item.itemCode}</div>
                  <div className="text-xs text-slate-500 truncate max-w-[200px]">{item.itemName}</div>
                  <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-500 uppercase">
                    {item.count} logs
                  </div>
                </td>
                <td className="px-6 py-4 font-mono font-bold text-slate-600">
                  {formatMinutes(item.targetTime)}
                </td>
                <td className="px-6 py-4">
                  <div className="font-mono font-bold text-slate-800">{formatMinutes(item.avgDuration)}</div>
                  <div className={`text-[10px] font-bold ${item.confidence === 'high' ? 'text-emerald-500' : item.confidence === 'medium' ? 'text-amber-500' : 'text-slate-400'}`}>
                    {item.confidence === 'high' ? 'Hoge zekerheid' : item.confidence === 'medium' ? 'Medium zekerheid' : 'Weinig data'}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-lg text-xs font-black ${
                    item.deviation > 10 ? 'bg-rose-100 text-rose-700' :
                    item.deviation < -10 ? 'bg-emerald-100 text-emerald-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {item.deviation > 0 ? '+' : ''}{Math.round(item.deviation)}%
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {item.trendDiff > 1 ? (
                      <TrendingUp size={16} className="text-rose-500" />
                    ) : item.trendDiff < -1 ? (
                      <TrendingDown size={16} className="text-emerald-500" />
                    ) : (
                      <ArrowRight size={16} className="text-slate-300" />
                    )}
                    <span className="text-xs font-bold text-slate-600">
                      {Math.abs(item.trendDiff) < 1 ? 'Stabiel' : item.trendDiff > 0 ? 'Vertragend' : 'Versnellend'}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {item.recommendation === 'increase_target' && (
                    <span className="flex items-center gap-1 text-xs font-bold text-amber-600">
                      <Clock size={14} /> Verhoog Norm
                    </span>
                  )}
                  {item.recommendation === 'decrease_target' && (
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                      <Clock size={14} /> Verlaag Norm
                    </span>
                  )}
                  {item.recommendation === 'maintain' && (
                    <span className="flex items-center gap-1 text-xs font-bold text-slate-400">
                      <CheckCircle2 size={14} /> Correct
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={() => setSelectedProduct(item)}
                    className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-purple-600 hover:border-purple-200 transition-all shadow-sm"
                  >
                    <BarChart3 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-3xl rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase italic">{selectedProduct.itemCode}</h3>
                <p className="text-sm font-bold text-slate-500">{selectedProduct.itemName}</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X size={24} className="text-slate-400" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto">
              <div className="grid grid-cols-2 gap-6 mb-8">
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                  <div className="text-xs font-black text-blue-400 uppercase tracking-widest mb-1">Huidige Target</div>
                  <div className="text-3xl font-black text-blue-700">{formatMinutes(selectedProduct.targetTime)}</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100">
                  <div className="text-xs font-black text-purple-400 uppercase tracking-widest mb-1">AI Voorspelling</div>
                  <div className="text-3xl font-black text-purple-700">{formatMinutes(selectedProduct.avgDuration)}</div>
                  <div className="text-xs font-bold text-purple-500 mt-1">
                    Gebaseerd op {selectedProduct.count} producties
                  </div>
                </div>
              </div>

              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Laatste 10 Producties</h4>
              <div className="space-y-2">
                {selectedProduct.logs.slice(-10).reverse().map((log, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-xs font-black text-slate-400 shadow-sm">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-700">
                          {log.date.toLocaleDateString()} {log.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">{log.operator}</div>
                      </div>
                    </div>
                    <div className={`font-mono font-bold ${
                      log.duration > selectedProduct.targetTime * 1.1 ? 'text-rose-600' : 
                      log.duration < selectedProduct.targetTime * 0.9 ? 'text-emerald-600' : 'text-slate-600'
                    }`}>
                      {formatMinutes(log.duration)}
                    </div>
                  </div>
                ))}
              </div>

              {selectedProduct.recommendation !== 'maintain' && (
                <div className="mt-8 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex gap-4 items-start">
                  <div className="p-2 bg-amber-100 text-amber-600 rounded-lg shrink-0">
                    <BrainCircuit size={20} />
                  </div>
                  <div>
                    <h4 className="font-black text-amber-800 text-sm uppercase mb-1">AI Advies</h4>
                    <p className="text-xs font-medium text-amber-700 leading-relaxed">
                      Op basis van {selectedProduct.count} metingen lijkt de huidige normtijd van <strong>{formatMinutes(selectedProduct.targetTime)}</strong> niet accuraat. 
                      Het werkelijke gemiddelde ligt op <strong>{formatMinutes(selectedProduct.avgDuration)}</strong>. 
                      Overweeg de norm aan te passen om de planning realistischer te maken.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiPredictionView;