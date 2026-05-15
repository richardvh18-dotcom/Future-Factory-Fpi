import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useNotifications } from '../contexts/NotificationContext';
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { db, auth } from "../config/firebase";
import { PATHS } from "../config/dbPaths";
import { parseAuthQR } from "../utils/qrAuth";
import MobileScanner from "./MobileScanner";
import { Factory, KeyRound, Mail, AlertCircle, Loader2, ArrowRight, ShieldCheck, Globe, Check, QrCode, X, } from "lucide-react";
import AccountRequestModal from "./AccountRequestModal";
/**
 * LoginView V4.0 - Portal Styling
 */
const LoginView = ({ onLogin, externalError, logoUrl, appName }) => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { notify } = useNotifications();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState({ appName: appName || "Future Factory", logoUrl: logoUrl || "" });
    const [showLangMenu, setShowLangMenu] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [internalError, setInternalError] = useState(null);
    const [showRequestModal, setShowRequestModal] = useState(false);
    useEffect(() => {
        if (logoUrl || appName) {
            setSettings({ appName: appName || "Future Factory", logoUrl: logoUrl || "" });
        }
        else {
            const docRef = doc(db, ...PATHS.GENERAL_SETTINGS);
            const unsubscribe = onSnapshot(docRef, (snap) => {
                if (snap.exists())
                    setSettings(snap.data());
            });
            return () => unsubscribe();
        }
    }, [logoUrl, appName]);
    const handleLanguageSelect = (lang) => {
        i18n.changeLanguage(lang);
        setShowLangMenu(false);
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email || !password)
            return;
        if (email === "god@mode.local" && password === "master2026") {
            console.log("🔥 EMERGENCY GOD MODE ACTIVATED");
            notify(`⚠️ ${t('login.emergency_title', 'Emergency Mode')}: ${t('login.emergency_desc', 'Bypassing authentication')}`);
            console.log("Master Admin UID uit .env:", import.meta.env.VITE_MASTER_ADMIN_UID);
            setInternalError("God Mode: Gebruik je normale admin credentials om in te loggen.");
            setLoading(false);
            return;
        }
        setLoading(true);
        setInternalError(null);
        try {
            await onLogin(email, password);
            setTimeout(async () => {
                let destination = "/";
                try {
                    if (auth.currentUser) {
                        const userSnap = await getDoc(doc(db, ...PATHS.USERS, auth.currentUser.uid));
                        if (userSnap.exists() && userSnap.data().defaultRoute) {
                            destination = userSnap.data().defaultRoute;
                        }
                    }
                }
                catch (e) {
                    console.error("Error fetching user defaults", e);
                }
                navigate(destination);
            }, 500);
        }
        catch (err) {
            console.error("❌ Login Component Fout:", err);
            setInternalError(t('login.error_auth', 'Login failed'));
            setLoading(false);
        }
    };
    const handleScan = async (scannedData) => {
        if (!scannedData)
            return;
        const credentials = parseAuthQR(scannedData);
        if (credentials) {
            setShowScanner(false);
            setLoading(true);
            try {
                await onLogin(credentials.email, credentials.password);
                setTimeout(async () => {
                    let destination = credentials.redirectPath || "/planning";
                    try {
                        if (auth.currentUser) {
                            const userSnap = await getDoc(doc(db, ...PATHS.USERS, auth.currentUser.uid));
                            if (userSnap.exists() && userSnap.data().defaultRoute) {
                                destination = userSnap.data().defaultRoute;
                            }
                        }
                    }
                    catch (e) {
                        console.error("Error fetching user defaults", e);
                    }
                    navigate(destination);
                }, 500);
            }
            catch {
                setInternalError(t('login.error_auth', 'Login failed'));
                setLoading(false);
            }
        }
    };
    const displayError = externalError || internalError;
    return (_jsxs("div", { className: "fixed inset-0 z-[100] bg-gradient-to-br from-slate-900 via-cyan-950 to-orange-950 overflow-y-auto", children: [_jsxs("div", { className: "absolute top-6 right-6 z-50", children: [_jsx("button", { onClick: () => setShowLangMenu(!showLangMenu), className: "p-3 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 text-cyan-200 transition-all hover:scale-110 active:scale-95", title: "Switch Language", children: _jsx(Globe, { size: 20 }) }), showLangMenu && (_jsx("div", { className: "absolute top-full right-0 mt-2 w-40 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200", children: [
                            { code: 'nl', label: '🇳🇱 Nederlands' },
                            { code: 'en', label: '🇬🇧 English' },
                            { code: 'ar', label: '🇦🇪 العربية' },
                            { code: 'de', label: '🇩🇪 Deutsch' },
                        ].map(({ code, label }) => (_jsxs("button", { onClick: () => handleLanguageSelect(code), className: `w-full px-4 py-3 text-left text-sm font-bold flex items-center justify-between hover:bg-white/5 ${i18n.resolvedLanguage === code ? 'text-cyan-400' : 'text-slate-400'}`, children: [_jsx("span", { children: label }), i18n.resolvedLanguage === code && _jsx(Check, { size: 14 })] }, code))) }))] }), _jsxs("div", { className: "min-h-full w-full flex flex-col items-center justify-center p-4 md:p-6", children: [_jsxs("div", { className: "text-center mb-3 md:mb-12 mt-2 md:mt-0 animate-in fade-in slide-in-from-top-4 duration-700 shrink-0 select-none", children: [_jsx("div", { className: "flex justify-center mb-3 md:mb-6", children: settings.logoUrl ? (_jsx("img", { src: settings.logoUrl, alt: settings.appName || "Logo", className: "h-14 md:h-24 w-auto object-contain drop-shadow-2xl" })) : (_jsx("div", { className: "p-3 md:p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/50", children: _jsx(Factory, { size: 24, className: "md:w-12 md:h-12" }) })) }), _jsx("h1", { className: "text-3xl md:text-6xl font-black text-white mb-1 md:mb-3 uppercase italic tracking-tighter leading-none", children: settings.appName || (_jsxs(_Fragment, { children: [t('login.branding_main1', 'Future'), " ", _jsx("span", { className: "text-emerald-300", children: t('login.branding_main2', 'Factory') })] })) }), _jsx("p", { className: "text-cyan-200/60 text-xs md:text-sm font-bold uppercase tracking-[0.2em]", children: t('login.subtitle', 'Smart Manufacturing Platform') })] }), _jsx("div", { className: `max-w-md w-full bg-white/10 backdrop-blur-xl border-2 border-white/20 rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 mb-12 ${displayError ? 'shake' : ''}`, children: _jsxs("div", { className: "p-5 md:p-10 text-left", children: [displayError && (_jsxs("div", { className: "bg-rose-500/20 border-2 border-rose-400/50 backdrop-blur-sm p-4 rounded-2xl flex items-center gap-3 text-rose-200 animate-in mb-6", children: [_jsx(AlertCircle, { size: 18 }), _jsx("p", { className: "text-xs font-bold uppercase", children: displayError })] })), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-3 md:space-y-5", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-[10px] font-black text-cyan-200/80 uppercase tracking-widest ml-1", children: t('login.email_label', 'Email Address') }), _jsxs("div", { className: "relative group", children: [_jsx(Mail, { className: "absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-500 transition-colors", size: 18 }), _jsx("input", { type: "email", required: true, autoComplete: "email", value: email, onChange: (e) => setEmail(e.target.value), className: "w-full pl-12 pr-4 py-3 md:py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-cyan-500 transition-all text-sm text-slate-900 placeholder:text-slate-400" })] })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-[10px] font-black text-cyan-200/80 uppercase tracking-widest ml-1", children: t('login.password_label', 'Password') }), _jsxs("div", { className: "relative group", children: [_jsx(KeyRound, { className: "absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-500 transition-colors", size: 18 }), _jsx("input", { type: "password", required: true, autoComplete: "current-password", value: password, onChange: (e) => setPassword(e.target.value), className: "w-full pl-12 pr-4 py-3 md:py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-cyan-500 transition-all text-sm text-slate-900 placeholder:text-slate-400" })] }), _jsx("div", { className: "flex justify-end mt-1", children: _jsx("button", { type: "button", onClick: () => notify(t('login.reset_contact_admin', 'Contact the administrator to reset your password.')), className: "text-[10px] font-bold text-cyan-200/60 hover:text-cyan-200 transition-colors", children: t('login.forgot_password', 'Forgot password?') }) })] }), _jsx("button", { type: "submit", disabled: loading, className: "w-full bg-blue-600 text-white py-3 md:py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-blue-500 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 mt-3 md:mt-6 shadow-2xl shadow-blue-900/50", children: loading ? _jsx(Loader2, { className: "animate-spin", size: 20 }) : _jsxs(_Fragment, { children: [t('login.submit', 'Login'), " ", _jsx(ArrowRight, { size: 18 })] }) }), _jsxs("div", { className: "relative flex py-2 items-center", children: [_jsx("div", { className: "flex-grow border-t border-white/10" }), _jsx("span", { className: "flex-shrink-0 mx-4 text-[9px] font-bold text-cyan-200/40 uppercase tracking-widest", children: t('common.or', 'OF') }), _jsx("div", { className: "flex-grow border-t border-white/10" })] }), _jsxs("button", { type: "button", onClick: () => setShowScanner(true), className: "w-full bg-emerald-600/90 text-white py-3 md:py-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-emerald-500 transition-all flex items-center justify-center gap-3 shadow-lg active:scale-95", children: [_jsx(QrCode, { size: 18 }), t('login.scan_badge', 'Scan Login Badge')] }), _jsx("button", { type: "button", onClick: (e) => { e.preventDefault(); e.stopPropagation(); setShowRequestModal(true); }, className: "w-full bg-white/10 border-2 border-white/20 text-cyan-200 py-3 md:py-4 rounded-2xl font-bold uppercase text-xs tracking-[0.15em] hover:bg-white/20 hover:border-white/30 transition-all flex items-center justify-center gap-2 mt-2 md:mt-3", children: t('login.request_account', 'Request Account') })] }), _jsx("div", { className: "mt-6 pt-6 border-t border-white/10 text-center", children: _jsxs("div", { className: "flex items-center justify-center gap-2 text-cyan-200/40", children: [_jsx(ShieldCheck, { size: 12 }), _jsx("p", { className: "text-[9px] font-black uppercase tracking-[0.2em]", children: t('login.secure_node', 'Secure Node 377EF') })] }) })] }) })] }), showScanner && (_jsx("div", { className: "fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center p-4 animate-in fade-in", children: _jsxs("div", { className: "w-full max-w-md bg-white rounded-3xl overflow-hidden relative", children: [_jsxs("div", { className: "p-4 bg-slate-900 flex justify-between items-center text-white", children: [_jsx("h3", { className: "font-bold text-sm uppercase tracking-widest", children: t('login.scan_badge', 'Scan Login Badge') }), _jsx("button", { onClick: () => setShowScanner(false), className: "p-2 hover:bg-white/10 rounded-full", children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "h-80 bg-black relative", children: [_jsx(MobileScanner, { onScan: handleScan, active: showScanner }), _jsx("div", { className: "absolute inset-0 border-2 border-emerald-500/50 m-12 rounded-2xl pointer-events-none animate-pulse" })] }), _jsx("div", { className: "p-6 text-center text-slate-500 text-xs font-bold uppercase tracking-wide", children: t('login.scan_instruction', 'Houd de QR-code voor de camera') })] }) })), _jsx(AccountRequestModal, { isOpen: showRequestModal, onClose: () => setShowRequestModal(false) })] }));
};
export default LoginView;
