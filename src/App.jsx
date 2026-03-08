import React, { useState, Suspense, lazy, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db, logActivity } from "./config/firebase";
import { doc, getDoc } from "firebase/firestore";
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
import ToastContainer from "./components/notifications/ToastContainer";

// Hooks
import { useAdminAuth } from "./hooks/useAdminAuth";
import { useProductsData } from "./hooks/useProductsData";
import { useSettingsData } from "./hooks/useSettingsData";
import { useMessages } from "./hooks/useMessages";
import { useAutoLogout } from "./hooks/useAutoLogout";

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

  // Check of gebruiker wachtwoord moet wijzigen
  useEffect(() => {
    console.log("🔐 App mounted, user:", user?.email || "No user");
    console.log("📊 Auth loading:", authLoading);
    console.log("👤 Role:", role);
    console.log("🔧 Is Admin:", isAdmin);
    
    if (user) {
      const checkPasswordChange = async () => {
        try {
          console.log("🔍 Checking password change requirement for:", user.uid);
          const userDoc = await getDoc(doc(db, "future-factory", "Users", "Accounts", user.uid));
          if (userDoc.exists() && userDoc.data().requirePasswordChange) {
            console.log("⚠️ Password change required");
            setRequiresPasswordChange(true);
          } else {
            console.log("✅ No password change required");
          }
        } catch (err) {
          console.error("❌ Error checking password change:", err);
        }
      };
      checkPasswordChange();
    }
  }, [user, authLoading, role, isAdmin]);

  const handleLogin = async (email, password) => {
    setLoginError(null);
    console.log("🔐 Login poging voor:", email);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("✅ Login succesvol! UID:", userCredential.user.uid);
      await logActivity(userCredential.user.uid, "LOGIN", `Succesvol ingelogd via email: ${email}`);
      navigate("/");
    } catch (err) {
      console.error("❌ Login fout:", err);
      console.error("Error code:", err.code);
      console.error("Error message:", err.message);
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
    console.log("⏳ Auth loading...");
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
  if (user?.uid === bootstrapAdminUid && role === "guest") {
    console.log("🔧 Bootstrap admin mode");
    return <GodModeBootstrap />;
  }


  // Fallback: Afmeldpagina tonen als user null is en niet loading, behalve op /login
  if (!user && !authLoading) {
    console.log("🚫 No user, showing logged out view");
    const path = window.location.pathname;
    if (path === "/login") {
      console.log("📝 Showing login view");
      return <LoginView onLogin={handleLogin} error={loginError} logoUrl={generalConfig?.logoUrl} appName={generalConfig?.appName} />;
    }
    return <LoggedOutView />;
  }

  if (role === "guest") {
    console.log("👤 Guest role, showing login");
    return <LoginView onLogin={handleLogin} error={loginError} logoUrl={generalConfig?.logoUrl} appName={generalConfig?.appName} />;
  }

  // Force password change voor nieuwe gebruikers
  if (requiresPasswordChange) {
    console.log("🔑 Password change required");
    return (
      <ForcePasswordChangeView 
        user={user} 
        onComplete={() => setRequiresPasswordChange(false)} 
      />
    );
  }

  console.log("✅ Rendering main app");
  return (
    <NotificationProvider>
      <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden text-left relative">
        <ToastContainer />
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
                <Route path="/admin/*" element={<AdminDashboard />} />
                <Route path="/logs" element={<AdminLogView />} />
                <Route path="/login" element={<LoginView onLogin={handleLogin} error={loginError} logoUrl={generalConfig?.logoUrl} appName={generalConfig?.appName} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>

        {/* Auto-logout waarschuwing */}
        {showWarning && (
          <AutoLogoutWarning 
            remainingTime={remainingTime} 
            onDismiss={dismissWarning} 
          />
        )}
      </div>
    </NotificationProvider>
  );
};

export default App;
