import React, { useState, Suspense, lazy, useEffect } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "./config/firebase";
import { doc, getDoc } from "firebase/firestore";

// Basis Componenten
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import LoginView from "./components/LoginView";
import PortalView from "./components/PortalView";
import ProfileView from "./components/ProfileView";
import ProductSearchView from "./components/products/ProductSearchView";
import ForcePasswordChangeView from "./components/ForcePasswordChangeView";
import GodModeBootstrap from "./components/admin/GodModeBootstrap";

// Notification System
import { NotificationProvider } from "./contexts/NotificationContext";
import ToastContainer from "./components/notifications/ToastContainer";

// Hooks
import { useAdminAuth } from "./hooks/useAdminAuth";
import { useProductsData } from "./hooks/useProductsData";
import { useSettingsData } from "./hooks/useSettingsData";
import { useMessages } from "./hooks/useMessages";

// Lazy Loading Modules
const AdminDashboard = lazy(() => import("./components/admin/AdminDashboard"));
const AdminMessagesView = lazy(() =>
  import("./components/admin/AdminMessagesView")
); // NIEUW: Directe import voor route
const DigitalPlanningHub = lazy(() =>
  import("./components/digitalplanning/DigitalPlanningHub")
);
const MobileScanner = lazy(() =>
  import("./components/digitalplanning/MobileScanner")
);
const CalculatorView = lazy(() => import("./components/CalculatorView"));
const AiAssistantView = lazy(() => import("./components/AiAssistantView"));

/**
 * App.jsx V17.0 - Password Change Flow
 * + Force password change voor nieuwe accounts
 */
const App = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [loginError, setLoginError] = useState(null);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);

  // Data fetching via Hooks
  const { user, isAdmin, role, loading: authLoading } = useAdminAuth();
  const { products = [] } = useProductsData(user);
  const { generalConfig } = useSettingsData(user);
  const { messages = [] } = useMessages(user);

  const unreadCount = messages
    ? messages.filter((m) => !m.read && !m.archived).length
    : 0;

  // Check of gebruiker wachtwoord moet wijzigen
  useEffect(() => {
    if (user) {
      const checkPasswordChange = async () => {
        try {
          const userDoc = await getDoc(doc(db, "future-factory", "Users", "Accounts", user.uid));
          if (userDoc.exists() && userDoc.data().requirePasswordChange) {
            setRequiresPasswordChange(true);
          }
        } catch (err) {
          console.error("Error checking password change:", err);
        }
      };
      checkPasswordChange();
    }
  }, [user]);

  const handleLogin = async (email, password) => {
    setLoginError(null);
    console.log("🔐 Login poging voor:", email);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("✅ Login succesvol! UID:", userCredential.user.uid);
      navigate("/");
    } catch (err) {
      console.error("❌ Login fout:", err);
      console.error("Error code:", err.code);
      console.error("Error message:", err.message);
      
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
  if (user?.uid === "pzxPfiwQhnQdEQJcXU77ZgT2Jo32" && role === "guest") {
    return <GodModeBootstrap />;
  }

  if (!user || role === "guest") {
    return <LoginView onLogin={handleLogin} error={loginError} />;
  }

  // Force password change voor nieuwe gebruikers
  if (requiresPasswordChange) {
    return (
      <ForcePasswordChangeView 
        user={user} 
        onComplete={() => setRequiresPasswordChange(false)} 
      />
    );
  }

  return (
    <NotificationProvider>
      <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden text-left relative">
        <ToastContainer />
        <Header
          user={user}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          logoUrl={generalConfig?.logoUrl}
          appName={generalConfig?.appName}
          unreadCount={unreadCount}
        />

        <div className="flex-1 flex overflow-hidden relative">
          <Sidebar
            user={user}
            isAdmin={isAdmin}
            onLogout={async () => {
              await signOut(auth);
              navigate("/login");
            }}
          />

          <main className="flex-1 flex flex-col overflow-hidden relative md:pl-16">
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
                <Route
                  path="/products"
                  element={<ProductSearchView products={products} />}
                />
                <Route path="/planning/*" element={<DigitalPlanningHub />} />
                <Route path="/scanner" element={<MobileScanner />} />
                <Route path="/calculator" element={<CalculatorView />} />
                <Route path="/assistant" element={<AiAssistantView />} />

                {/* FIX: Route voor Berichten (Sidebar link) */}
                <Route
                  path="/messages"
                  element={<AdminMessagesView user={user} />}
                />

                <Route path="/admin/*" element={<AdminDashboard />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </NotificationProvider>
  );
};

export default App;
