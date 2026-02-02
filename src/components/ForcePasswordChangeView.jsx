import React, { useState } from "react";
import { Lock, ShieldCheck, Loader2, Save, AlertCircle } from "lucide-react";
import { getAuth, updatePassword } from "firebase/auth";
import { db } from "../config/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { PATHS } from "../config/dbPaths";

const ForcePasswordChangeView = ({ user, onComplete }) => {
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (newPass.length < 6)
      return setError("Wachtwoord moet minimaal 6 tekens bevatten.");
    if (newPass !== confirmPass)
      return setError("Wachtwoorden komen niet overeen.");

    setLoading(true);
    setError(null);

    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;

      // 1. Update in Firebase Authentication
      await updatePassword(currentUser, newPass);

      // 2. Update in Firestore - verwijder requirePasswordChange flag
      const userRef = doc(db, ...PATHS.USERS, user.uid);
      await updateDoc(userRef, {
        requirePasswordChange: false,
        tempPassword: null,
      });

      onComplete();
    } catch (err) {
      console.error(err);
      setError(
        "Fout bij updaten wachtwoord. Mogelijk moet u opnieuw inloggen."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-[50px] p-10 shadow-2xl animate-in zoom-in-95 text-center">
        <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
          <ShieldCheck size={40} />
        </div>

        <h1 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter mb-2">
          Nieuw Wachtwoord
        </h1>
        <p className="text-slate-400 text-sm font-medium mb-8">
          U gebruikt momenteel een tijdelijk wachtwoord. Voor de veiligheid moet
          u dit nu wijzigen.
        </p>

        <form onSubmit={handleUpdate} className="space-y-4 text-left">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">
              Nieuw Wachtwoord
            </label>
            <div className="relative">
              <Lock
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
                size={18}
              />
              <input
                type="password"
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-blue-500 transition-all font-bold"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">
              Bevestig Wachtwoord
            </label>
            <div className="relative">
              <Lock
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
                size={18}
              />
              <input
                type="password"
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-blue-500 transition-all font-bold"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-bold flex items-center gap-3 border border-red-100">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-slate-900 text-white rounded-[25px] font-black uppercase text-sm tracking-[0.2em] shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 mt-6"
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Save size={20} />
            )}
            Wachtwoord Bijwerken
          </button>
        </form>
      </div>
    </div>
  );
};

export default ForcePasswordChangeView;
