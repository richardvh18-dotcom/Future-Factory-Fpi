import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, Suspense, lazy, useEffect, useRef } from "react";
import { listenToAppVersion } from "./services/versionService";
import { Loader2 } from "lucide-react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db, logActivity } from "./config/firebase";
import { addDoc, collection, doc, getDoc, serverTimestamp, query, collectionGroup, where, limit, getDocs } from "firebase/firestore";
import LoggedOutView from "./components/LoggedOutView";
// Basis Componenten
import Header from "./components/Header";
import Sidebar from "./components/Sidebar.tsx";
import LoginView from "./components/LoginView.tsx";
import PortalView from "./components/PortalView.tsx";
import ProfileView from "./components/ProfileView.tsx";
import ProductSearchView from "./components/products/ProductSearchView";
import ForcePasswordChangeView from "./components/ForcePasswordChangeView";
import GodModeBootstrap from "./components/admin/GodModeBootstrap";
import AutoLogoutWarning from "./components/AutoLogoutWarning";
import { MTPresentation } from "./components/MTPresentation";
// Notification System
import { NotificationProvider } from "./contexts/NotificationContext";
import { ProgressOperationProvider } from "./contexts/ProgressOperationContext.tsx";
import { BackgroundTaskProvider } from "./contexts/BackgroundTaskContext";
import ToastContainer from "./components/notifications/ToastContainer";
import ConfirmDialog from "./components/notifications/ConfirmDialog.tsx";
import BackgroundTaskOverlay from "./components/notifications/BackgroundTaskOverlay.tsx";
import { ProgressToast } from "./components/digitalplanning/ProgressToast.tsx";
// Hooks
import { useAdminAuth } from "./hooks/useAdminAuth";
import { useProductsData } from "./hooks/useProductsData";
import { useSettingsData } from "./hooks/useSettingsData";
import { useMessages } from "./hooks/useMessages";
import { useAutoLogout } from "./hooks/useAutoLogout";
import { PATHS } from "./config/dbPaths";
// Lazy Loading Modules
const AdminDashboard = lazy(() => import("./components/admin/AdminDashboard"));
const AdminMessagesView = lazy(() => import("./components/admin/AdminMessagesView")); // NIEUW: Directe import voor route
const DigitalPlanningHub = lazy(() => import('./components/digitalplanning/DigitalPlanningHub'));
const MobileScanner = lazy(() => import("./components/digitalplanning/MobileScanner"));
const ShopFloorMobileApp = lazy(() => import("./components/planning/ShopFloorMobileApp"));
const CalculatorView = lazy(() => import("./components/CalculatorView"));
const AiAssistantView = lazy(() => import('./components/ai/AiAssistantView'));
const AdminLogView = lazy(() => import("./components/admin/AdminLogView"));
const PrintQueueAdminView = lazy(() => import("./components/printer/PrintQueueAdminView"));
const ProductDossierModal = lazy(() => import("./components/digitalplanning/modals/ProductDossierModal"));
const TeamleaderOrderDetailModal = lazy(() => import("./components/digitalplanning/modals/TeamleaderOrderDetailModal"));
/**
 * App.jsx V18.0 - Responsive Design
 * + Mobile menu state management
 * + Password change flow
 */
const App = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchQuery, setSearchQuery] = useState("");
    const [loginError, setLoginError] = useState(null);
    const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
    const [globalDossierProduct, setGlobalDossierProduct] = useState(null);
    const [globalOrderDetail, setGlobalOrderDetail] = useState(null);
    const [globalOrders, setGlobalOrders] = useState([]);
    // Data fetching via Hooks
    const { user, isAdmin, role, loading: authLoading } = useAdminAuth();
    const { products = [] } = useProductsData(user);
    const { generalConfig } = useSettingsData(user);
    useMessages(user);
    // Auto-logout na inactiviteit (60 minuten inactiviteit, 5 minuten waarschuwing)
    const { showWarning, remainingTime, dismissWarning } = useAutoLogout(60, // Timeout in minuten
    5, // Waarschuwing in minuten voor timeout
    !!user // Alleen actief als gebruiker ingelogd is
    );
    // Versie-check: forceer refresh bij nieuwe versie
    const currentVersion = import.meta.env.VITE_APP_VERSION || "dev";
    const versionRef = useRef(currentVersion);
    useEffect(() => {
        const host = typeof window !== "undefined" ? window.location.hostname : "";
        const isLocalDevHost = import.meta.env.DEV ||
            host === "localhost" ||
            host === "127.0.0.1" ||
            host.endsWith(".github.dev");
        // In lokale/dev omgevingen geen auto-reload op remote version checks.
        // Dit voorkomt reload-loops bij verschil tussen lokale buildversie en remote config.
        if (isLocalDevHost)
            return () => { };
        const requestVersionReload = (remoteVersionRaw) => {
            const remoteVersion = String(remoteVersionRaw || "").trim();
            if (!remoteVersion || remoteVersion === versionRef.current)
                return;
            // Guard tegen reload-loops: per tab maximaal 1 reload per remote versie.
            const reloadKey = "ff_last_version_reload";
            const alreadyReloadedFor = window.sessionStorage.getItem(reloadKey);
            if (alreadyReloadedFor === remoteVersion)
                return;
            window.sessionStorage.setItem(reloadKey, remoteVersion);
            window.location.reload();
        };
        const unsubscribe = listenToAppVersion((remoteVersion) => {
            requestVersionReload(remoteVersion);
        });
        // Fallback voor omgevingen waar de Firestore versie-write niet draait.
        // Leest een no-cache version.json van de host en forceert reload bij verschil.
        let cancelled = false;
        const checkHostedVersion = async () => {
            try {
                const response = await fetch(`/version.json?t=${Date.now()}`, {
                    cache: "no-store",
                });
                if (!response.ok)
                    return;
                const payload = await response.json();
                const hostedVersion = String(payload?.version || "").trim();
                if (!cancelled)
                    requestVersionReload(hostedVersion);
            }
            catch {
                // Niet kritisch: app blijft werken zonder endpoint.
            }
        };
        checkHostedVersion();
        const timer = window.setInterval(checkHostedVersion, 60 * 1000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            unsubscribe();
        };
    }, []);
    // Check of gebruiker wachtwoord moet wijzigen
    useEffect(() => {
        if (!user?.uid) {
            setRequiresPasswordChange(false);
            return;
        }
        const checkPasswordChange = async () => {
            try {
                const userDoc = await getDoc(doc(db, "future-factory", "Users", "Accounts", user.uid));
                setRequiresPasswordChange(Boolean(userDoc.exists() && userDoc.data().requirePasswordChange));
            }
            catch (err) {
                console.error("Error checking password change:", err);
            }
        };
        checkPasswordChange();
    }, [user?.uid]);
    useEffect(() => {
        if (typeof window === "undefined" || !user?.email)
            return undefined;
        let initialized = false;
        const createConnectivityMessage = async (online) => {
            const eventKey = `connectivity:${online ? "online" : "offline"}`;
            const lastRaw = window.localStorage.getItem("ff_last_connectivity_message");
            const now = Date.now();
            if (lastRaw) {
                try {
                    const last = JSON.parse(lastRaw);
                    if (last?.key === eventKey && now - Number(last?.timestamp || 0) < 30000) {
                        return;
                    }
                }
                catch {
                    // Ignore malformed localStorage values.
                }
            }
            await addDoc(collection(db, ...PATHS.MESSAGES), {
                to: user.email.toLowerCase(),
                from: "SYSTEM",
                senderId: "system-connectivity",
                subject: online ? "Verbinding hersteld" : "Offline modus actief",
                content: online
                    ? "De verbinding met het netwerk is hersteld. Live synchronisatie is weer actief."
                    : "De netwerkverbinding is weggevallen. De app draait verder op lokale cache totdat de verbinding terug is.",
                timestamp: serverTimestamp(),
                read: false,
                archived: false,
                priority: "normal",
                type: "system",
                targetGroup: user.email.toLowerCase(),
            });
            window.localStorage.setItem("ff_last_connectivity_message", JSON.stringify({ key: eventKey, timestamp: now }));
        };
        const handleConnectivityChange = (online) => {
            if (!initialized) {
                initialized = true;
                return;
            }
            createConnectivityMessage(online).catch((error) => {
                console.error("Kon verbindingsmelding niet opslaan:", error);
            });
        };
        const handleOnline = () => handleConnectivityChange(true);
        const handleOffline = () => handleConnectivityChange(false);
        initialized = true;
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, [user?.email]);
    const handleLogin = async (email, password) => {
        setLoginError(null);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            await logActivity(userCredential.user.uid, "LOGIN", `Succesvol ingelogd via email: ${email}`);
            navigate("/");
        }
        catch (err) {
            console.error("Login fout:", err);
            await logActivity("system", "LOGIN_FAILED", `Mislukte inlogpoging voor: ${email}. Reden: ${err.code}`, "warning");
            let errorMessage = "E-mail of wachtwoord onjuist.";
            if (err.code === "auth/user-not-found") {
                errorMessage = "Geen account gevonden met dit e-mailadres.";
            }
            else if (err.code === "auth/wrong-password") {
                errorMessage = "Onjuist wachtwoord.";
            }
            else if (err.code === "auth/invalid-email") {
                errorMessage = "Ongeldig e-mailadres.";
            }
            else if (err.code === "auth/user-disabled") {
                errorMessage = "Dit account is uitgeschakeld.";
            }
            else if (err.code === "auth/too-many-requests") {
                errorMessage = "Te veel pogingen. Probeer later opnieuw.";
            }
            else if (err.code === "auth/network-request-failed") {
                errorMessage = "Netwerkfout. Controleer je internetverbinding.";
            }
            setLoginError(errorMessage);
        }
    };
    const handleGlobalSearch = async (queryStr) => {
        const qStr = queryStr.trim().toUpperCase();
        if (!qStr)
            return;
        setGlobalSearchLoading(true);
        try {
            let foundProduct = null;
            let foundOrder = null;
            let parentOrders = [];
            const itemsQuery = query(collectionGroup(db, "items"), where("lotNumber", "==", qStr), limit(1));
            const itemsSnap = await getDocs(itemsQuery);
            if (!itemsSnap.empty) {
                foundProduct = { id: itemsSnap.docs[0].id, ...itemsSnap.docs[0].data() };
            }
            if (!foundProduct) {
                const rootTracked = await getDocs(query(collection(db, ...PATHS.TRACKING), where("lotNumber", "==", qStr), limit(1)));
                if (!rootTracked.empty)
                    foundProduct = { id: rootTracked.docs[0].id, ...rootTracked.docs[0].data() };
            }
            if (!foundProduct) {
                const currentYear = new Date().getFullYear();
                for (const year of [currentYear, currentYear - 1]) {
                    const archiveRef = collection(db, "future-factory", "production", "archive", String(year), "items");
                    const archSnap = await getDocs(query(archiveRef, where("lotNumber", "==", qStr), limit(1)));
                    if (!archSnap.empty) {
                        foundProduct = { id: archSnap.docs[0].id, ...archSnap.docs[0].data(), archived: true };
                        break;
                    }
                }
            }
            if (foundProduct) {
                const orderId = foundProduct.orderId || foundProduct.orderNumber;
                if (orderId) {
                    const orderSnap = await getDocs(query(collectionGroup(db, "orders"), where("orderId", "==", orderId), limit(1)));
                    if (!orderSnap.empty)
                        parentOrders = [{ id: orderSnap.docs[0].id, ...orderSnap.docs[0].data() }];
                    else {
                        const rootOrderSnap = await getDocs(query(collection(db, ...PATHS.PLANNING), where("orderId", "==", orderId), limit(1)));
                        if (!rootOrderSnap.empty)
                            parentOrders = [{ id: rootOrderSnap.docs[0].id, ...rootOrderSnap.docs[0].data() }];
                    }
                }
                setGlobalOrders(parentOrders);
                setGlobalDossierProduct(foundProduct);
                setSearchQuery("");
                return;
            }
            const orderSnap = await getDocs(query(collectionGroup(db, "orders"), where("orderId", "==", qStr), limit(1)));
            if (!orderSnap.empty)
                foundOrder = { id: orderSnap.docs[0].id, ...orderSnap.docs[0].data() };
            else {
                const rootOrderSnap = await getDocs(query(collection(db, ...PATHS.PLANNING), where("orderId", "==", qStr), limit(1)));
                if (!rootOrderSnap.empty)
                    foundOrder = { id: rootOrderSnap.docs[0].id, ...rootOrderSnap.docs[0].data() };
            }
            if (foundOrder) {
                setGlobalOrderDetail(foundOrder);
                setSearchQuery("");
                return;
            }
            alert(`Geen product of order gevonden voor: ${qStr}`);
        }
        catch (err) {
            console.error("Fout bij globaal zoeken:", err);
            alert("Er is een fout opgetreden bij het zoeken.");
        }
        finally {
            setGlobalSearchLoading(false);
        }
    };
    if (authLoading) {
        return (_jsxs("div", { className: "flex h-screen w-full flex-col items-center justify-center bg-slate-950", children: [_jsx(Loader2, { className: "animate-spin text-blue-400", size: 48 }), _jsx("p", { className: "text-white font-black uppercase tracking-[0.3em] text-[10px] mt-4 italic", children: "Identiteit controleren..." })] }));
    }
    // Check for specialized bootstrapping view (Orphaned Admin)
    const bootstrapAdminUid = import.meta.env.VITE_BOOTSTRAP_ADMIN_UID;
    let content;
    if (user?.uid === bootstrapAdminUid && role === "guest") {
        content = _jsx(GodModeBootstrap, {});
    }
    else if (!user && !authLoading) {
        const path = window.location.pathname;
        if (path === "/login") {
            content = _jsx(LoginView, { onLogin: handleLogin, error: loginError, logoUrl: generalConfig?.logoUrl, appName: generalConfig?.appName });
        }
        else {
            content = _jsx(LoggedOutView, {});
        }
    }
    else if (role === "guest") {
        content = _jsx(LoginView, { onLogin: handleLogin, error: loginError, logoUrl: generalConfig?.logoUrl, appName: generalConfig?.appName });
    }
    else if (requiresPasswordChange) {
        content = (_jsx(ForcePasswordChangeView, { user: user, onComplete: () => setRequiresPasswordChange(false) }));
    }
    else if (location.pathname === "/presentation") {
        // Presentatie zonder Header/Sidebar
        content = (_jsxs(Routes, { children: [_jsx(Route, { path: "/presentation", element: _jsx(MTPresentation, {}) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/presentation", replace: true }) })] }));
    }
    else {
        content = (_jsxs("div", { className: "flex flex-col h-screen bg-slate-50 font-sans overflow-hidden text-left relative", children: [_jsx(Header, { user: user, searchQuery: searchQuery, setSearchQuery: setSearchQuery, onSearchSubmit: handleGlobalSearch, isSearching: globalSearchLoading, logoUrl: generalConfig?.logoUrl, onMenuToggle: () => setIsMobileMenuOpen(!isMobileMenuOpen) }), _jsxs("div", { className: "flex-1 flex overflow-hidden relative md:mt-0 pt-16 md:pt-0", children: [_jsx(Sidebar, { user: user, isAdmin: isAdmin, role: role, onLogout: async () => {
                                if (user) {
                                    await logActivity(user.uid, "LOGOUT", `Gebruiker uitgelogd: ${user.email}`);
                                }
                                await signOut(auth);
                                navigate("/login");
                            }, isMobileMenuOpen: isMobileMenuOpen, onMobileMenuClose: () => setIsMobileMenuOpen(false) }), _jsx("main", { className: "flex-1 flex flex-col overflow-hidden relative md:pl-16", children: _jsx(Suspense, { fallback: _jsx("div", { className: "flex-1 flex items-center justify-center bg-white", children: _jsx(Loader2, { className: "animate-spin text-blue-500" }) }), children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(PortalView, {}) }), _jsx(Route, { path: "/portal", element: _jsx(PortalView, {}) }), _jsx(Route, { path: "/presentation", element: _jsx(MTPresentation, {}) }), _jsx(Route, { path: "/profile", element: _jsx(ProfileView, {}) }), _jsx(Route, { path: "/products", element: _jsx(ProductSearchView, { products: products }) }), _jsx(Route, { path: "/planning/*", element: _jsx(DigitalPlanningHub, {}) }), _jsx(Route, { path: "/scanner", element: _jsx(MobileScanner, {}) }), _jsx(Route, { path: "/inspector", element: _jsx(ShopFloorMobileApp, {}) }), _jsx(Route, { path: "/calculator", element: _jsx(CalculatorView, {}) }), _jsx(Route, { path: "/assistant", element: _jsx(AiAssistantView, {}) }), _jsx(Route, { path: "/messages", element: _jsx(AdminMessagesView, { user: user }) }), _jsx(Route, { path: "/printer-queue", element: _jsx(PrintQueueAdminView, {}) }), _jsx(Route, { path: "/admin/*", element: _jsx(AdminDashboard, {}) }), _jsx(Route, { path: "/logs", element: _jsx(AdminLogView, {}) }), _jsx(Route, { path: "/login", element: _jsx(LoginView, { onLogin: handleLogin, error: loginError, logoUrl: generalConfig?.logoUrl, appName: generalConfig?.appName }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }) })] }), showWarning && (_jsx(AutoLogoutWarning, { remainingTime: remainingTime, onDismiss: dismissWarning })), _jsxs(Suspense, { fallback: null, children: [globalDossierProduct && (_jsx(ProductDossierModal, { isOpen: !!globalDossierProduct, product: globalDossierProduct, orders: globalOrders, onClose: () => {
                                setGlobalDossierProduct(null);
                                setGlobalOrders([]);
                            } })), globalOrderDetail && (_jsx(TeamleaderOrderDetailModal, { order: globalOrderDetail, onClose: () => setGlobalOrderDetail(null) }))] })] }));
    }
    return (_jsx(NotificationProvider, { children: _jsx(ProgressOperationProvider, { children: _jsxs(BackgroundTaskProvider, { children: [_jsx(ToastContainer, {}), _jsx(ConfirmDialog, {}), _jsx(BackgroundTaskOverlay, {}), _jsx(ProgressToast, {}), content] }) }) }));
};
export default App;
