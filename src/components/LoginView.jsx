import React, { useState } from "react";
import {
  Factory,
  KeyRound,
  Mail,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import AccountRequestModal from "./AccountRequestModal";

/**
 * LoginView V4.0 - Portal Styling
 * - Dezelfde vormgeving als PortalView met gradient achtergrond
 * - Moderne glasmorphism design
 */
const LoginView = ({ onLogin, error: externalError }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [internalError, setInternalError] = useState(null);
  const [showRequestModal, setShowRequestModal] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;

    // 🔥 EMERGENCY GOD MODE BYPASS 🔥
    if (email === "god@mode.local" && password === "master2026") {
      console.log("🔥 EMERGENCY GOD MODE ACTIVATED");
      alert("⚠️ EMERGENCY MODE: God Mode bypass geactiveerd!\n\nDit is een noodtoegang. Login wordt gesimuleerd.");
      // We kunnen hier niet direct inloggen zonder Firebase Auth
      // Maar we kunnen wel debugging info tonen
      console.log("Master Admin UID uit .env:", import.meta.env.VITE_MASTER_ADMIN_UID);
      console.log("Firebase Project:", import.meta.env.VITE_FIREBASE_PROJECT_ID);
      setInternalError("God Mode: Gebruik je normale admin credentials om in te loggen.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setInternalError(null);
    console.log("🚀 Inlogpoging gestart voor:", email);
    console.log("📊 Firebase Project:", import.meta.env.VITE_FIREBASE_PROJECT_ID);

    try {
      await onLogin(email, password);
    } catch (err) {
      console.error("❌ Login Component Fout:", err);
      setInternalError("Systeemfout bij inloggen.");
    } finally {
      setLoading(false);
    }
  };

  const displayError = externalError || internalError;

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-900 via-cyan-950 to-blue-950 overflow-y-auto">
      <div className="min-h-full w-full flex flex-col items-center justify-center p-4 md:p-6">
        {/* Welkomsttekst */}
        <div className="text-center mb-8 md:mb-12 mt-4 md:mt-0 animate-in fade-in slide-in-from-top-4 duration-700 shrink-0 select-none">
          <Factory className="text-blue-500 w-16 h-16 md:w-20 md:h-20 mx-auto mb-6" />
          <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight uppercase italic mb-2">
            Future <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Factory</span>
          </h1>
          <p className="text-cyan-200/60 text-xs md:text-sm font-bold uppercase tracking-[0.2em]">
            Industrial MES Portal
          </p>
        </div>

        {/* Login Card */}
        <div className="max-w-md w-full bg-white/10 backdrop-blur-xl border-2 border-white/20 rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 mb-12">
          <div className="p-8 md:p-10 text-left">

            {displayError && (
              <div className="bg-rose-500/20 border-2 border-rose-400/50 backdrop-blur-sm p-4 rounded-2xl flex items-center gap-3 text-rose-200 animate-in shake mb-6">
                <AlertCircle size={18} />
                <p className="text-xs font-bold uppercase">{displayError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-cyan-200/80 uppercase tracking-widest ml-1">
                  E-mailadres
                </label>
                <div className="relative group">
                  <Mail
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-500 transition-colors"
                    size={18}
                  />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-cyan-500 transition-all text-sm text-slate-900 placeholder:text-slate-400"
                    placeholder="naam@futurepipe.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-cyan-200/80 uppercase tracking-widest ml-1">
                  Wachtwoord
                </label>
                <div className="relative group">
                  <KeyRound
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-500 transition-colors"
                    size={18}
                  />
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-cyan-500 transition-all text-sm text-slate-900 placeholder:text-slate-400"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                disabled={loading}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:from-cyan-400 hover:to-blue-500 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 mt-6 shadow-2xl shadow-cyan-900/50"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    Systeem Inloggen <ArrowRight size={18} />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowRequestModal(true)}
                className="w-full bg-white/10 border-2 border-white/20 text-cyan-200 py-4 rounded-2xl font-bold uppercase text-xs tracking-[0.15em] hover:bg-white/20 hover:border-white/30 transition-all flex items-center justify-center gap-2 mt-3"
              >
                Account Aanvragen
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-white/10 text-center">
              <div className="flex items-center justify-center gap-2 text-cyan-200/40">
                <ShieldCheck size={12} />
                <p className="text-[9px] font-black uppercase tracking-[0.2em]">
                  Secure Node 377EF
                </p>
              </div>
              
              {/* Debug Info */}
              <details className="mt-4 text-left">
                <summary className="text-[8px] text-cyan-200/30 uppercase cursor-pointer hover:text-cyan-200/50 font-bold">
                  Debug Info (Klik)
                </summary>
                <div className="mt-2 p-3 bg-black/20 rounded-xl text-[9px] font-mono text-cyan-200/50 space-y-1">
                  <div>Project: {import.meta.env.VITE_FIREBASE_PROJECT_ID || "N/A"}</div>
                  <div>Auth Domain: {import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "N/A"}</div>
                  <div>Master UID: {import.meta.env.VITE_MASTER_ADMIN_UID ? "✓ Set" : "✗ Not Set"}</div>
                  <div className="pt-2 border-t border-cyan-200/10 text-emerald-400/50">
                    Emergency: god@mode.local / master2026
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>

      {/* Account Request Modal */}
      <AccountRequestModal 
        isOpen={showRequestModal} 
        onClose={() => setShowRequestModal(false)} 
      />
    </div>
  );
};

export default LoginView;
