import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { LogOut, RefreshCw, ShieldCheck } from "lucide-react";
const LogoutOverlay = () => {
    const [showOverlay, setShowOverlay] = useState(false);
    const auth = getAuth();
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!user) {
                setShowOverlay(true);
            }
            else {
                setShowOverlay(false);
            }
        });
        return () => unsubscribe();
    }, [auth]);
    const handleRefresh = () => {
        window.location.href = "/login";
    };
    if (!showOverlay)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-[9999] bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-500", children: _jsxs("div", { className: "bg-white w-full max-w-md p-8 rounded-[40px] shadow-2xl text-center border border-slate-100", children: [_jsx("div", { className: "w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-900 shadow-inner", children: _jsx(LogOut, { size: 32 }) }), _jsx("h2", { className: "text-2xl font-black text-slate-900 uppercase italic tracking-tight mb-2", children: "U bent uitgelogd" }), _jsx("p", { className: "text-slate-500 font-medium mb-8 text-sm leading-relaxed", children: "Om verbindingsproblemen te voorkomen en uw sessie veilig af te sluiten, dient u de pagina te verversen." }), _jsxs("button", { onClick: handleRefresh, className: "w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl shadow-blue-200 active:scale-95 hover:scale-[1.02]", children: [_jsx(RefreshCw, { size: 18 }), "Pagina Verversen"] }), _jsxs("div", { className: "mt-6 flex items-center justify-center gap-2 text-slate-300 text-[10px] font-black uppercase tracking-widest", children: [_jsx(ShieldCheck, { size: 12 }), "Secure Session End"] })] }) }));
};
export default LogoutOverlay;
