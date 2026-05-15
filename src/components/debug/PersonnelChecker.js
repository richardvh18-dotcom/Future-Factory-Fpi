import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { PATHS } from '../../config/dbPaths';
import { Database, CheckCircle, XCircle, Loader2 } from 'lucide-react';
/**
 * PersonnelChecker - Debug component om te controleren of personeel correct wordt opgeslagen
 */
const PersonnelChecker = () => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const checkData = async () => {
        setLoading(true);
        setError(null);
        try {
            const path = PATHS.PERSONNEL.join('/');
            console.log('🔍 Checking path:', path);
            const snap = await getDocs(collection(db, ...PATHS.PERSONNEL));
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            console.log('✅ Found personnel:', items.length);
            console.log('📋 Items:', items);
            setData({
                path,
                count: items.length,
                items,
                exists: snap.size > 0
            });
        }
        catch (err) {
            console.error('❌ Error:', err);
            setError(err.message);
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        checkData();
    }, []);
    return (_jsxs("div", { className: "fixed bottom-4 right-4 w-96 bg-white rounded-2xl shadow-2xl border-2 border-slate-200 p-6 z-50", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Database, { size: 20, className: "text-blue-600" }), _jsx("h3", { className: "font-black text-sm uppercase", children: "Personnel Check" })] }), _jsx("button", { onClick: checkData, disabled: loading, children: _jsx(Loader2, { size: 16, className: loading ? 'animate-spin text-blue-600' : 'text-slate-400' }) })] }), loading && (_jsx("div", { className: "py-8 text-center", children: _jsx(Loader2, { className: "animate-spin mx-auto text-blue-600", size: 32 }) })), error && (_jsxs("div", { className: "p-4 bg-rose-50 border border-rose-200 rounded-xl", children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx(XCircle, { size: 16, className: "text-rose-600" }), _jsx("span", { className: "font-bold text-xs text-rose-900", children: "ERROR" })] }), _jsx("p", { className: "text-xs text-rose-700 font-mono", children: error })] })), data && !loading && (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "p-3 bg-slate-50 rounded-xl", children: [_jsx("div", { className: "text-[9px] font-bold text-slate-400 uppercase mb-1", children: "Firestore Path" }), _jsx("div", { className: "text-xs font-mono text-slate-900", children: data.path })] }), _jsxs("div", { className: "flex items-center gap-2", children: [data.exists ? (_jsx(CheckCircle, { size: 16, className: "text-green-600" })) : (_jsx(XCircle, { size: 16, className: "text-rose-600" })), _jsxs("span", { className: "font-bold text-sm", children: [data.count, " ", data.count === 1 ? 'persoon' : 'personen', " gevonden"] })] }), data.items.length > 0 && (_jsx("div", { className: "max-h-64 overflow-y-auto space-y-2", children: data.items.map((item) => (_jsxs("div", { className: "p-3 bg-blue-50 rounded-lg border border-blue-200", children: [_jsx("div", { className: "text-xs font-black text-slate-900", children: item.name || 'Unnamed' }), _jsxs("div", { className: "text-[10px] text-slate-500 font-mono", children: ["#", item.employeeNumber] }), item.rotationSchedule?.enabled && (_jsxs("div", { className: "mt-1 text-[9px] text-blue-700 font-bold", children: ["ROTATIE: ", item.rotationSchedule.shifts?.join(' → ')] })), item.shiftId && (_jsxs("div", { className: "mt-1 text-[9px] text-slate-600", children: ["Shift: ", item.shiftId] }))] }, item.id))) })), data.items.length === 0 && (_jsx("div", { className: "p-4 bg-amber-50 border border-amber-200 rounded-xl text-center", children: _jsx("p", { className: "text-xs text-amber-800 font-bold", children: "Geen personeelsleden gevonden in deze collectie" }) }))] }))] }));
};
export default PersonnelChecker;
