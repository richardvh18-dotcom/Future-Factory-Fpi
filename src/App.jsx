import React, { useState, Suspense, lazy, useEffect, useRef } from "react";
import { listenToAppVersion } from "./services/versionService";
import { Loader2 } from "lucide-react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db, logActivity } from "./config/firebase";
import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import LoggedOutView from "./components/LoggedOutView";

// Basis Componenten
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import LoginView from "./components/LoginView";
import PortalView from "./components/PortalView";
import ProfileView from "./components/ProfileView";
import ProductSearchView from "./components/products/ProductSearchView";
import ForcePasswordChangeView from "./components/ForcePasswordChangeView";
import GodModeBootstrap from "./components/admin/GodModeBootstrap";
import AutoLogoutWarning from "./components/AutoLogoutWarning";

// Notification System
import { NotificationProvider } from "./contexts/NotificationContext";
import { ProgressOperationProvider } from "./contexts/ProgressOperationContext";
import ToastContainer from "./components/notifications/ToastContainer";
import ConfirmDialog from "./components/notifications/ConfirmDialog";
import { ProgressToast } from "./components/digitalplanning/ProgressToast";

// Hooks
import { useAdminAuth } from "./hooks/useAdminAuth";
import { useProductsData } from "./hooks/useProductsData";
import { useSettingsData } from "./hooks/useSettingsData";
import { useMessages } from "./hooks/useMessages";
import { useAutoLogout } from "./hooks/useAutoLogout";
import { PATHS } from "./config/dbPaths";

// Lazy Loading Modules
const AdminDashboard = lazy(() => import("./components/admin/AdminDashboard"));
const AdminMessagesView = lazy(() =>
  import("./components/admin/AdminMessagesView")
); // NIEUW: Directe import voor route
const DigitalPlanningHub = lazy(() =>
  import("./components/digitalplanning/DigitalPlanningHub.jsx")
);
const MobileScanner = lazy(() =>
  import("./components/digitalplanning/MobileScanner")
);
const ShopFloorMobileApp = lazy(() =>
  import("./components/planning/ShopFloorMobileApp")
);
const CalculatorView = lazy(() => import("./components/CalculatorView"));
const AiAssistantView = lazy(() => import("./components/ai/AiAssistantView.jsx"));
const AdminLogView = lazy(() => import("./components/admin/AdminLogView"));

const PrintQueueAdminView = lazy(() =>
  import("./components/printer/PrintQueueAdminView")
);
/**
 * App.jsx V18.0 - Responsive Design
 * + Mobile menu state management
 * + Password change flow
 */
const App = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [loginError, setLoginError] = useState(null);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Data fetching via Hooks
  const { user, isAdmin, role, loading: authLoading } = useAdminAuth();
  const { products = [] } = useProductsData(user);
  const { generalConfig } = useSettingsData(user);
  useMessages(user);

  // Auto-logout na inactiviteit (60 minuten inactiviteit, 5 minuten waarschuwing)
  const { showWarning, remainingTime, dismissWarning } = useAutoLogout(
    60, // Timeout in minuten
    5,  // Waarschuwing in minuten voor timeout
    !!user // Alleen actief als gebruiker ingelogd is
  );

  // Versie-check: forceer refresh bij nieuwe versie
  const currentVersion = import.meta.env.VITE_APP_VERSION || "dev";
  const versionRef = useRef(currentVersion);
  useEffect(() => {
    const unsubscribe = listenToAppVersion((remoteVersion) => {
      if (remoteVersion && remoteVersion !== versionRef.current) {
        window.location.reload();
      }
    });
    return unsubscribe;
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
      } catch (err) {
        console.error("Error checking password change:", err);
      }
    };

    checkPasswordChange();
  }, [user?.uid]);

  useEffect(() => {
    if (typeof window === "undefined" || !user?.email) return undefined;

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
        } catch {
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

      window.localStorage.setItem(
        "ff_last_connectivity_message",
        JSON.stringify({ key: eventKey, timestamp: now })
      );
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
    } catch (err) {
      console.error("Login fout:", err);
      await logActivity("system", "LOGIN_FAILED", `Mislukte inlogpoging voor: ${email}. Reden: ${err.code}`, "warning");
      
      let errorMessage = "E-mail of wachtwoord onjuist.";
      
      if (err.code === "auth/user-not-found") {
        errorMessage = "Geen account gevonden met dit e-mailadres.";
      } else if (err.code === "auth/wrong-password") {
        errorMessage = "Onjuist wachtwoord.";
      } else if (err.code === "auth/invalid-email") {
        errorMessage = "Ongeldig e-mailadres.";
      } else if (err.code === "auth/user-disabled") {
        errorMessage = "Dit account is uitgeschakeld.";
      } else if (err.code === "auth/too-many-requests") {
        errorMessage = "Te veel pogingen. Probeer later opnieuw.";
      } else if (err.code === "auth/network-request-failed") {
        errorMessage = "Netwerkfout. Controleer je internetverbinding.";
      }
      
      setLoginError(errorMessage);
    }
  };


  if (authLoading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-950">
        <Loader2 className="animate-spin text-blue-400" size={48} />
        <p className="text-white font-black uppercase tracking-[0.3em] text-[10px] mt-4 italic">
          Identiteit controleren...
        </p>
      </div>
    );
  }

  // Check for specialized bootstrapping view (Orphaned Admin)
  const bootstrapAdminUid = import.meta.env.VITE_BOOTSTRAP_ADMIN_UID;
  let content;

  if (user?.uid === bootstrapAdminUid && role === "guest") {
    content = <GodModeBootstrap />;
  } else if (!user && !authLoading) {
    const path = window.location.pathname;
    if (path === "/login") {
      content = <LoginView onLogin={handleLogin} error={loginError} logoUrl={generalConfig?.logoUrl} appName={generalConfig?.appName} />;
    } else {
      content = <LoggedOutView />;
    }
  } else if (role === "guest") {
    content = <LoginView onLogin={handleLogin} error={loginError} logoUrl={generalConfig?.logoUrl} appName={generalConfig?.appName} />;
  } else if (requiresPasswordChange) {
    content = (
      <ForcePasswordChangeView 
        user={user} 
        onComplete={() => setRequiresPasswordChange(false)} 
      />
    );
  } else {
    content = (
      <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden text-left relative">
        <Header
          user={user}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          logoUrl={generalConfig?.logoUrl}
          onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        />

        <div className="flex-1 flex overflow-hidden relative md:mt-0 pt-16 md:pt-0">
          <Sidebar
            user={user}
            isAdmin={isAdmin}
            role={role}
            onLogout={async () => {
              if (user) {
                await logActivity(user.uid, "LOGOUT", `Gebruiker uitgelogd: ${user.email}`);
              }
              await signOut(auth);
              navigate("/login");
            }}
            isMobileMenuOpen={isMobileMenuOpen}
            onMobileMenuClose={() => setIsMobileMenuOpen(false)}
          />

          <main className="flex-1 flex flex-col overflow-hidden relative md:pl-16" style={{ WebkitOverflowScrolling: 'touch' }}>
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center bg-white">
                  <Loader2 className="animate-spin text-blue-500" />
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<PortalView />} />
                <Route path="/portal" element={<PortalView />} />
                <Route path="/profile" element={<ProfileView />} />
                <Route path="/products" element={<ProductSearchView products={products} />} />
                <Route path="/planning/*" element={<DigitalPlanningHub />} />
                <Route path="/scanner" element={<MobileScanner />} />
                <Route path="/inspector" element={<ShopFloorMobileApp />} />
                <Route path="/calculator" element={<CalculatorView />} />
                <Route path="/assistant" element={<AiAssistantView />} />
                <Route path="/messages" element={<AdminMessagesView user={user} />} />
                <Route path="/printer-queue" element={<PrintQueueAdminView />} />
                <Route path="/admin/*" element={<AdminDashboard />} />
                <Route path="/logs" element={<AdminLogView />} />
                <Route path="/login" element={<LoginView onLogin={handleLogin} error={loginError} logoUrl={generalConfig?.logoUrl} appName={generalConfig?.appName} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>

        {showWarning && (
          <AutoLogoutWarning 
            remainingTime={remainingTime} 
            onDismiss={dismissWarning} 
          />
        )}
      </div>
    );
  }

  return (
    <NotificationProvider>
      <ProgressOperationProvider>
        <ToastContainer />
        <ConfirmDialog />
        <ProgressToast />
        {content}
      </ProgressOperationProvider>
    </NotificationProvider>
  );
};

export default App;
