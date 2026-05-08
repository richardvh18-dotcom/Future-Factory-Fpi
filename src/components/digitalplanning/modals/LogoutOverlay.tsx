import React, { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { LogOut, RefreshCw, ShieldCheck } from "lucide-react";

const LogoutOverlay = () => {
  const [showOverlay, setShowOverlay] = useState(false);
  const auth = getAuth();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setShowOverlay(true);
      } else {
        setShowOverlay(false);
      }
    });

    return () => unsubscribe();
  }, [auth]);

  const handleRefresh = () => {
    window.location.href = "/login";
  };

  if (!showOverlay) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-500">
      <div className="bg-white w-full max-w-md p-8 rounded-[40px] shadow-2xl text-center border border-slate-100">
        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-900 shadow-inner">
          <LogOut size={32} />
        </div>

        <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight mb-2">
          U bent uitgelogd
        </h2>

        <p className="text-slate-500 font-medium mb-8 text-sm leading-relaxed">
          Om verbindingsproblemen te voorkomen en uw sessie veilig af te sluiten, dient u de pagina te verversen.
        </p>

        <button
          onClick={handleRefresh}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl shadow-blue-200 active:scale-95 hover:scale-[1.02]"
        >
          <RefreshCw size={18} />
          Pagina Verversen
        </button>

        <div className="mt-6 flex items-center justify-center gap-2 text-slate-300 text-[10px] font-black uppercase tracking-widest">
          <ShieldCheck size={12} />
          Secure Session End
        </div>
      </div>
    </div>
  );
};

export default LogoutOverlay;
