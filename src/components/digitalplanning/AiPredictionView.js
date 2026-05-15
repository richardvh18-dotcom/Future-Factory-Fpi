import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { BrainCircuit, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Search, ArrowRight, Clock, BarChart3, Loader2, X } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../../config/firebase';
import { getArchiveItemsPath, PATHS } from '../../config/dbPaths';
import { calculateDuration, formatMinutes } from '../../utils/efficiencyCalculator';
import { subscribeScopedEfficiencyHours } from '../../utils/efficiencyScopedReader';
/**
 * AiPredictionView
 * Analyseert historische productiedata om trends, afwijkingen en nieuwe standaardtijden te voorspellen.
 */
const AiPredictionView = ({ onClose }) => {
    const usePilotReadData = false;
    const { t } = useTranslation();
    const readPaths = PATHS;
    const MIN_VALID_DURATION = 1;
    const MAX_VALID_DURATION = 10080;
    const [loading, setLoading] = useState(true);
    const [trackingData, setTrackingData] = useState([]);
    const [archivedData, setArchivedData] = useState([]);
    const [standards, setStandards] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedProduct, setSelectedProduct] = useState(null);
    const toDateValue = (value) => {
        if (!value)
            return null;
        if (value?.toDate)
            return value.toDate();
        if (value?.seconds)
            return new Date(value.seconds * 1000);
        const d = value instanceof Date ? value : new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    };
    const getHistoryTimestampBy = (log, matcher) => {
        if (!Array.isArray(log?.history))
            return null;
        const row = log.history.find((h) => matcher(h || {}));
        return toDateValue(row?.timestamp);
    };
    const hasHistoryMatch = (log, matcher) => {
        if (!Array.isArray(log?.history))
            return false;
        return log.history.some((h) => matcher(h || {}));
    };
    const getProductKey = (log) => {
        return log.itemCode || log.productId || log.item || log.productCode || log.partNumber || '';
    };
    const isCompletedLike = (log) => {
        const statusText = String(log?.status || '').toLowerCase();
        const stepText = String(log?.currentStep || log?.currentStation || '').toLowerCase();
        const hasFinishTimestamp = Boolean(log?.timestamps?.finished || log?.timestamps?.completed);
        const hasCompletionHistory = hasHistoryMatch(log, (h) => {
            const action = String(h?.action || '').toLowerCase();
            const details = String(h?.details || '').toLowerCase();
            const station = String(h?.station || '').toLowerCase();
            return (action.includes('completed') ||
                action.includes('gereed') ||
                action.includes('afgerond') ||
                details.includes('verwerking afgerond') ||
                details.includes('gereed') ||
                station === 'bm01');
        });
        return (Boolean(log?._archived) ||
            statusText === 'completed' ||
            statusText === 'shipped' ||
            statusText.includes('gereed') ||
            statusText.includes('afgerond') ||
            statusText.includes('verzonden') ||
            stepText === 'finished' ||
            stepText.includes('gereed') ||
            hasFinishTimestamp ||
            hasCompletionHistory);
    };
    const getLogStartDate = (log) => {
        return (toDateValue(log?.timestamps?.wikkelen_start) ||
            toDateValue(log?.timestamps?.station_start) ||
            toDateValue(log?.timestamps?.started) ||
            getHistoryTimestampBy(log, (h) => String(h?.action || '').toLowerCase().includes('start')) ||
            toDateValue(log?.createdAt) ||
            toDateValue(log?.startTime) ||
            toDateValue(log?.startedAt) ||
            new Date());
    };
    const getLogDuration = (log) => {
        const ts = log?.timestamps || {};
        const stationStart = toDateValue(ts.station_start || ts.started || log?.startTime || log?.startedAt);
        const stationEnd = toDateValue(ts.finished || ts.completed || log?.endTime || log?.completedAt || log?.updatedAt);
        if (stationStart && stationEnd) {
            const duration = calculateDuration(stationStart, stationEnd);
            if (Number.isFinite(duration) && duration > 0)
                return duration;
        }
        const wikkelenStart = toDateValue(ts.wikkelen_start) ||
            getHistoryTimestampBy(log, (h) => String(h?.action || '').toLowerCase().includes('start wikkelen')) ||
            getHistoryTimestampBy(log, (h) => String(h?.action || '').toLowerCase().includes('start')) ||
            toDateValue(log?.createdAt);
        const wikkelenEnd = toDateValue(ts.wikkelen_end) ||
            getHistoryTimestampBy(log, (h) => String(h?.details || '').toLowerCase().includes('wikkelen naar lossen'));
        const lossenStart = toDateValue(ts.lossen_start) ||
            getHistoryTimestampBy(log, (h) => String(h?.details || '').toLowerCase().includes('wikkelen naar lossen'));
        const lossenEnd = toDateValue(ts.lossen_end) ||
            getHistoryTimestampBy(log, (h) => String(h?.details || '').toLowerCase().includes('lossen naar nabewerking'));
        const nabewerkingStart = toDateValue(ts.nabewerking_start) ||
            getHistoryTimestampBy(log, (h) => String(h?.details || '').toLowerCase().includes('lossen naar nabewerking'));
        const nabewerkingEnd = toDateValue(ts.nabewerking_end) ||
            toDateValue(ts.bm01_start) ||
            getHistoryTimestampBy(log, (h) => String(h?.details || '').toLowerCase().includes('verwerking afgerond')) ||
            getHistoryTimestampBy(log, (h) => String(h?.station || '').toUpperCase() === 'BM01') ||
            toDateValue(ts.finished) ||
            toDateValue(ts.completed) ||
            toDateValue(log?.updatedAt);
        const addDuration = (startValue, endValue) => {
            const start = toDateValue(startValue);
            const end = toDateValue(endValue);
            if (!start || !end)
                return 0;
            const duration = calculateDuration(start, end);
            return Number.isFinite(duration) && duration > 0 ? duration : 0;
        };
        const total = addDuration(wikkelenStart, wikkelenEnd) +
            addDuration(lossenStart, lossenEnd) +
            addDuration(nabewerkingStart, nabewerkingEnd) +
            addDuration(ts.station_start, ts.finished || ts.completed || log?.endTime || log?.completedAt || log?.updatedAt);
        if (total > 0)
            return total;
        const historyStart = getHistoryTimestampBy(log, (h) => String(h?.action || '').toLowerCase().includes('start'));
        const historyEnd = getHistoryTimestampBy(log, (h) => {
            const action = String(h?.action || '').toLowerCase();
            const details = String(h?.details || '').toLowerCase();
            return (action.includes('completed') ||
                action.includes('gereed') ||
                action.includes('afgerond') ||
                details.includes('verwerking afgerond'));
        }) ||
            toDateValue(ts.finished) ||
            toDateValue(ts.completed) ||
            toDateValue(log?.updatedAt);
        if (historyStart && historyEnd) {
            const historyDuration = calculateDuration(historyStart, historyEnd);
            if (Number.isFinite(historyDuration) && historyDuration > 0)
                return historyDuration;
        }
        return 0;
    };
    const getAnalysisCandidate = (log) => {
        const productKey = getProductKey(log);
        if (!productKey) {
            return { included: false, reason: 'missingProductKey' };
        }
        if (!isCompletedLike(log)) {
            return { included: false, reason: 'notCompleted', productKey };
        }
        const duration = getLogDuration(log);
        if (duration < MIN_VALID_DURATION) {
            return { included: false, reason: 'tooShort', productKey, duration };
        }
        if (duration > MAX_VALID_DURATION) {
            return { included: false, reason: 'tooLong', productKey, duration };
        }
        return {
            included: true,
            productKey,
            duration,
            start: getLogStartDate(log),
            itemName: log.item || log.description || t('digitalplanning.ai_prediction.unknown', 'Unknown'),
            operator: log.operator || log.processedBy || log.user || t('digitalplanning.ai_prediction.unknown', 'Unknown'),
        };
    };
    useEffect(() => {
        if (!readPaths || !readPaths.TRACKING || !readPaths.EFFICIENCY_HOURS)
            return;
        setLoading(true);
        const unsubTracking = onSnapshot(collection(db, ...readPaths.TRACKING), (snap) => {
            setTrackingData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        // Neem meerdere archiefjaren mee voor bruikbare AI trenddata.
        const currentYear = new Date().getFullYear();
        const archiveYears = [currentYear, currentYear - 1, currentYear - 2];
        const archiveBuckets = {};
        const archiveUnsubs = archiveYears.map((year) => onSnapshot(collection(db, ...getArchiveItemsPath(year)), (snap) => {
            archiveBuckets[year] = snap.docs.map(d => ({ id: d.id, ...d.data(), _archived: true, _archiveYear: year }));
            const merged = Object.values(archiveBuckets).flat();
            setArchivedData(merged);
        }));
        const unsubStandards = subscribeScopedEfficiencyHours({
            db,
            mode: 'active',
            onData: (rows) => setStandards(rows),
            onError: (error) => {
                console.warn('Scoped efficiency listener failed:', error);
                setStandards([]);
            },
        });
        setLoading(false);
        return () => {
            unsubTracking();
            archiveUnsubs.forEach((fn) => fn && fn());
            unsubStandards();
        };
    }, [readPaths]);
    const analysis = useMemo(() => {
        const allData = [...trackingData, ...archivedData];
        if (!allData.length)
            return [];
        const productGroups = {};
        allData.forEach(log => {
            const candidate = getAnalysisCandidate(log);
            if (!candidate.included)
                return;
            if (!productGroups[candidate.productKey]) {
                productGroups[candidate.productKey] = {
                    logs: [],
                    item: candidate.itemName
                };
            }
            productGroups[candidate.productKey].logs.push({
                date: candidate.start,
                duration: candidate.duration,
                operator: candidate.operator
            });
        });
        return Object.entries(productGroups).map(([code, data]) => {
            const logs = data.logs.sort((a, b) => a.date - b.date);
            const count = logs.length;
            if (count === 0)
                return null;
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
            if (count > 10)
                confidence = "medium";
            if (count > 30)
                confidence = "high";
            const deviation = targetTime > 0 ? ((avgDuration - targetTime) / targetTime) * 100 : 0;
            if (deviation > 10 && confidence !== 'low')
                recommendation = "increase_target";
            if (deviation < -10 && confidence !== 'low')
                recommendation = "decrease_target";
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
    const ingestionStats = useMemo(() => {
        const allData = [...trackingData, ...archivedData];
        let withProductKey = 0;
        let completedLike = 0;
        let validDuration = 0;
        let missingProductKey = 0;
        let missingCompletion = 0;
        let tooShortDuration = 0;
        let tooLongDuration = 0;
        allData.forEach((log) => {
            const productKey = getProductKey(log);
            if (!productKey) {
                missingProductKey += 1;
                return;
            }
            withProductKey += 1;
            if (!isCompletedLike(log)) {
                missingCompletion += 1;
                return;
            }
            completedLike += 1;
            const duration = getLogDuration(log);
            if (duration < MIN_VALID_DURATION) {
                tooShortDuration += 1;
                return;
            }
            if (duration > MAX_VALID_DURATION) {
                tooLongDuration += 1;
                return;
            }
            validDuration += 1;
        });
        return {
            mode: usePilotReadData ? 'pilot-read' : 'current',
            tracking: trackingData.length,
            archived: archivedData.length,
            standards: standards.length,
            totalCandidates: allData.length,
            withProductKey,
            completedLike,
            validDuration,
            missingProductKey,
            missingCompletion,
            tooShortDuration,
            tooLongDuration,
            analyzedProducts: analysis.length,
        };
    }, [trackingData, archivedData, standards, analysis, usePilotReadData, MIN_VALID_DURATION, MAX_VALID_DURATION]);
    const filteredAnalysis = useMemo(() => {
        if (!searchTerm)
            return analysis;
        const lower = searchTerm.toLowerCase();
        return analysis.filter(a => a.itemCode.toLowerCase().includes(lower) ||
            a.itemName.toLowerCase().includes(lower));
    }, [analysis, searchTerm]);
    if (loading)
        return (_jsx("div", { className: "flex items-center justify-center h-96", children: _jsx(Loader2, { className: "animate-spin text-blue-600", size: 48 }) }));
    return (_jsxs("div", { className: "bg-slate-50 min-h-full p-6 animate-in fade-in", children: [_jsxs("div", { className: "flex justify-between items-center mb-8", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-3xl font-black text-slate-900 uppercase italic tracking-tighter flex items-center gap-3", children: [_jsx(BrainCircuit, { className: "text-purple-600", size: 32 }), t('digitalplanning.ai_prediction.title', 'AI Predictions & Analysis')] }), _jsx("p", { className: "text-slate-500 font-bold mt-1", children: t('digitalplanning.ai_prediction.logs_based_on', 'Analysis based on {{count}} production logs', {
                                    count: trackingData.length + archivedData.length,
                                }) })] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-slate-200 rounded-full transition-colors", children: _jsx(X, { size: 24, className: "text-slate-400" }) })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-6 mb-8", children: [_jsx("div", { className: "bg-white p-6 rounded-2xl border border-slate-100 shadow-sm", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "p-3 bg-purple-50 text-purple-600 rounded-xl", children: _jsx(BrainCircuit, { size: 24 }) }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-black text-slate-400 uppercase tracking-widest", children: t('digitalplanning.ai_prediction.analyzed_products', 'Analyzed Products') }), _jsx("div", { className: "text-2xl font-black text-slate-800", children: analysis.length })] })] }) }), _jsx("div", { className: "bg-white p-6 rounded-2xl border border-slate-100 shadow-sm", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "p-3 bg-amber-50 text-amber-600 rounded-xl", children: _jsx(AlertTriangle, { size: 24 }) }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-black text-slate-400 uppercase tracking-widest", children: t('digitalplanning.ai_prediction.deviations_over_10', 'Deviations > 10%') }), _jsx("div", { className: "text-2xl font-black text-slate-800", children: analysis.filter(a => Math.abs(a.deviation) > 10).length })] })] }) }), _jsx("div", { className: "bg-white p-6 rounded-2xl border border-slate-100 shadow-sm", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "p-3 bg-emerald-50 text-emerald-600 rounded-xl", children: _jsx(TrendingUp, { size: 24 }) }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-black text-slate-400 uppercase tracking-widest", children: t('digitalplanning.ai_prediction.optimization_opportunities', 'Optimization Opportunities') }), _jsx("div", { className: "text-2xl font-black text-slate-800", children: analysis.filter(a => a.recommendation !== 'maintain').length })] })] }) })] }), _jsxs("div", { className: "mb-6 rounded-2xl border border-blue-100 bg-blue-50/70 p-4", children: [_jsx("div", { className: "text-[10px] font-black uppercase tracking-widest text-blue-700", children: t('digitalplanning.ai_prediction.ingestion_diagnosis', 'AI Ingestion Diagnostics') }), _jsxs("div", { className: "mt-2 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs font-bold text-slate-700", children: [_jsxs("div", { children: [t('digitalplanning.ai_prediction.source', 'Source'), ": ", _jsx("span", { className: "text-blue-700", children: ingestionStats.mode })] }), _jsxs("div", { children: [t('digitalplanning.ai_prediction.tracking', 'Tracking'), ": ", ingestionStats.tracking] }), _jsxs("div", { children: [t('digitalplanning.ai_prediction.archive', 'Archive'), ": ", ingestionStats.archived] }), _jsxs("div", { children: [t('digitalplanning.ai_prediction.standards', 'Standards'), ": ", ingestionStats.standards] }), _jsxs("div", { children: [t('digitalplanning.ai_prediction.candidates', 'Candidates'), ": ", ingestionStats.totalCandidates] })] }), _jsxs("div", { className: "mt-1 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-bold text-slate-600", children: [_jsxs("div", { children: [t('digitalplanning.ai_prediction.with_product_code', 'With Product Code'), ": ", ingestionStats.withProductKey] }), _jsxs("div", { children: [t('digitalplanning.ai_prediction.completed_ready', 'Completed/Ready'), ": ", ingestionStats.completedLike] }), _jsxs("div", { children: [t('digitalplanning.ai_prediction.valid_duration', 'Valid Duration'), ": ", ingestionStats.validDuration] }), _jsxs("div", { children: [t('digitalplanning.ai_prediction.analyzed_products', 'Analyzed Products'), ": ", ingestionStats.analyzedProducts] })] }), _jsxs("div", { className: "mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] font-semibold text-slate-500", children: [_jsxs("div", { children: [t('digitalplanning.ai_prediction.without_product_code', 'Without Product Code'), ": ", ingestionStats.missingProductKey] }), _jsxs("div", { children: [t('digitalplanning.ai_prediction.not_completed', 'Not Completed'), ": ", ingestionStats.missingCompletion] }), _jsxs("div", { children: [t('digitalplanning.ai_prediction.too_short', 'Too Short'), ": ", ingestionStats.tooShortDuration] }), _jsxs("div", { children: [t('digitalplanning.ai_prediction.too_long', 'Too Long'), ": ", ingestionStats.tooLongDuration] })] })] }), _jsxs("div", { className: "relative mb-6", children: [_jsx(Search, { className: "absolute left-4 top-1/2 -translate-y-1/2 text-slate-400", size: 20 }), _jsx("input", { type: "text", placeholder: t('digitalplanning.ai_prediction.search_placeholder', 'Search by product code or description...'), className: "w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-purple-500 transition-all shadow-sm", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value) })] }), _jsx("div", { className: "bg-white rounded-[30px] border border-slate-200 shadow-sm overflow-hidden overflow-x-auto", children: _jsxs("table", { className: "w-full text-left", children: [_jsx("thead", { className: "bg-slate-50 border-b border-slate-100", children: _jsxs("tr", { children: [_jsx("th", { className: "px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest", children: t('digitalplanning.ai_prediction.product', 'Product') }), _jsx("th", { className: "px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest", children: t('digitalplanning.ai_prediction.target', 'Target') }), _jsx("th", { className: "px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest", children: t('digitalplanning.ai_prediction.ai_average', 'AI Average') }), _jsx("th", { className: "px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest", children: t('digitalplanning.ai_prediction.deviation', 'Deviation') }), _jsx("th", { className: "px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest", children: t('digitalplanning.ai_prediction.trend', 'Trend') }), _jsx("th", { className: "px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest", children: t('digitalplanning.ai_prediction.advice', 'Advice') }), _jsx("th", { className: "px-6 py-4" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100", children: filteredAnalysis.map((item) => (_jsxs("tr", { className: "hover:bg-slate-50/50 transition-colors group", children: [_jsxs("td", { className: "px-6 py-4", children: [_jsx("div", { className: "font-black text-slate-800", children: item.itemCode }), _jsx("div", { className: "text-xs text-slate-500 truncate max-w-[200px]", children: item.itemName }), _jsx("div", { className: "mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-500 uppercase", children: t('digitalplanning.ai_prediction.logs', '{{count}} logs', { count: item.count }) })] }), _jsx("td", { className: "px-6 py-4 font-mono font-bold text-slate-600", children: formatMinutes(item.targetTime) }), _jsxs("td", { className: "px-6 py-4", children: [_jsx("div", { className: "font-mono font-bold text-slate-800", children: formatMinutes(item.avgDuration) }), _jsx("div", { className: `text-[10px] font-bold ${item.confidence === 'high' ? 'text-emerald-500' : item.confidence === 'medium' ? 'text-amber-500' : 'text-slate-400'}`, children: item.confidence === 'high'
                                                    ? t('digitalplanning.ai_prediction.high_confidence', 'High confidence')
                                                    : item.confidence === 'medium'
                                                        ? t('digitalplanning.ai_prediction.medium_confidence', 'Medium confidence')
                                                        : t('digitalplanning.ai_prediction.low_data', 'Limited data') })] }), _jsx("td", { className: "px-6 py-4", children: _jsxs("span", { className: `px-2 py-1 rounded-lg text-xs font-black ${item.deviation > 10 ? 'bg-rose-100 text-rose-700' :
                                                item.deviation < -10 ? 'bg-emerald-100 text-emerald-700' :
                                                    'bg-slate-100 text-slate-600'}`, children: [item.deviation > 0 ? '+' : '', Math.round(item.deviation), "%"] }) }), _jsx("td", { className: "px-6 py-4", children: _jsxs("div", { className: "flex items-center gap-2", children: [item.trendDiff > 1 ? (_jsx(TrendingUp, { size: 16, className: "text-rose-500" })) : item.trendDiff < -1 ? (_jsx(TrendingDown, { size: 16, className: "text-emerald-500" })) : (_jsx(ArrowRight, { size: 16, className: "text-slate-300" })), _jsx("span", { className: "text-xs font-bold text-slate-600", children: Math.abs(item.trendDiff) < 1
                                                        ? t('digitalplanning.ai_prediction.stable', 'Stable')
                                                        : item.trendDiff > 0
                                                            ? t('digitalplanning.ai_prediction.slowing_down', 'Slowing down')
                                                            : t('digitalplanning.ai_prediction.speeding_up', 'Speeding up') })] }) }), _jsxs("td", { className: "px-6 py-4", children: [item.recommendation === 'increase_target' && (_jsxs("span", { className: "flex items-center gap-1 text-xs font-bold text-amber-600", children: [_jsx(Clock, { size: 14 }), " ", t('digitalplanning.ai_prediction.increase_norm', 'Increase Standard')] })), item.recommendation === 'decrease_target' && (_jsxs("span", { className: "flex items-center gap-1 text-xs font-bold text-emerald-600", children: [_jsx(Clock, { size: 14 }), " ", t('digitalplanning.ai_prediction.decrease_norm', 'Lower Standard')] })), item.recommendation === 'maintain' && (_jsxs("span", { className: "flex items-center gap-1 text-xs font-bold text-slate-400", children: [_jsx(CheckCircle2, { size: 14 }), " ", t('digitalplanning.ai_prediction.correct', 'Correct')] }))] }), _jsx("td", { className: "px-6 py-4 text-right", children: _jsx("button", { onClick: () => setSelectedProduct(item), className: "p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-purple-600 hover:border-purple-200 transition-all shadow-sm", children: _jsx(BarChart3, { size: 18 }) }) })] }, item.itemCode))) })] }) }), selectedProduct && (_jsx("div", { className: "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-3xl rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]", children: [_jsxs("div", { className: "p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-xl font-black text-slate-800 uppercase italic", children: selectedProduct.itemCode }), _jsx("p", { className: "text-sm font-bold text-slate-500", children: selectedProduct.itemName })] }), _jsx("button", { onClick: () => setSelectedProduct(null), className: "p-2 hover:bg-slate-200 rounded-full transition-colors", children: _jsx(X, { size: 24, className: "text-slate-400" }) })] }), _jsxs("div", { className: "p-8 overflow-y-auto", children: [_jsxs("div", { className: "grid grid-cols-2 gap-6 mb-8", children: [_jsxs("div", { className: "bg-blue-50 p-4 rounded-2xl border border-blue-100", children: [_jsx("div", { className: "text-xs font-black text-blue-400 uppercase tracking-widest mb-1", children: t('digitalplanning.ai_prediction.current_target', 'Current Target') }), _jsx("div", { className: "text-3xl font-black text-blue-700", children: formatMinutes(selectedProduct.targetTime) })] }), _jsxs("div", { className: "bg-purple-50 p-4 rounded-2xl border border-purple-100", children: [_jsx("div", { className: "text-xs font-black text-purple-400 uppercase tracking-widest mb-1", children: t('digitalplanning.ai_prediction.prediction', 'AI Prediction') }), _jsx("div", { className: "text-3xl font-black text-purple-700", children: formatMinutes(selectedProduct.avgDuration) }), _jsx("div", { className: "text-xs font-bold text-purple-500 mt-1", children: t('digitalplanning.ai_prediction.based_on_productions', 'Based on {{count}} productions', {
                                                        count: selectedProduct.count,
                                                    }) })] })] }), _jsx("h4", { className: "text-xs font-black text-slate-400 uppercase tracking-widest mb-4", children: t('digitalplanning.ai_prediction.last_10_productions', 'Last 10 Productions') }), _jsx("div", { className: "space-y-2", children: selectedProduct.logs.slice(-10).reverse().map((log, idx) => (_jsxs("div", { className: "flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-8 h-8 bg-white rounded-full flex items-center justify-center text-xs font-black text-slate-400 shadow-sm", children: idx + 1 }), _jsxs("div", { children: [_jsxs("div", { className: "text-xs font-bold text-slate-700", children: [log.date.toLocaleDateString(), " ", log.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })] }), _jsx("div", { className: "text-[10px] font-bold text-slate-400 uppercase", children: log.operator })] })] }), _jsx("div", { className: `font-mono font-bold ${log.duration > selectedProduct.targetTime * 1.1 ? 'text-rose-600' :
                                                    log.duration < selectedProduct.targetTime * 0.9 ? 'text-emerald-600' : 'text-slate-600'}`, children: formatMinutes(log.duration) })] }, idx))) }), selectedProduct.recommendation !== 'maintain' && (_jsxs("div", { className: "mt-8 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex gap-4 items-start", children: [_jsx("div", { className: "p-2 bg-amber-100 text-amber-600 rounded-lg shrink-0", children: _jsx(BrainCircuit, { size: 20 }) }), _jsxs("div", { children: [_jsx("h4", { className: "font-black text-amber-800 text-sm uppercase mb-1", children: t('digitalplanning.ai_prediction.ai_advice', 'AI Advice') }), _jsx("p", { className: "text-xs font-medium text-amber-700 leading-relaxed", children: t('digitalplanning.ai_prediction.advice_text', 'Based on {{count}} measurements, the current standard time of {{target}} does not appear accurate. The actual average is {{average}}. Consider adjusting the standard to make planning more realistic.', {
                                                        count: selectedProduct.count,
                                                        target: formatMinutes(selectedProduct.targetTime),
                                                        average: formatMinutes(selectedProduct.avgDuration),
                                                    }) })] })] }))] })] }) }))] }));
};
export default AiPredictionView;
