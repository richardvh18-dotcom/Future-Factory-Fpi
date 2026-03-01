import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  User,
  Mail,
  Save,
  CheckCircle2,
  Lock,
  Key,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  UserCircle,
  LayoutGrid,
  Languages,
  Moon,
  Sun,
  ShieldCheck,
  Monitor,
  Settings,
  BellRing,
  ClipboardCheck,
  Factory,
  Package,
  Database,
  Edit3,
} from "lucide-react";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { PATHS } from "../config/dbPaths";
import { db, auth } from "../config/firebase";
import { updatePassword, updateProfile } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

/**
 * ProfileView V2.1 - Robuuste Identiteit Guard
 * GEFIXST: Gebruikt nu setDoc (merge) in plaats van updateDoc om "document not found" errors te voorkomen.
 * UPDATE: Toegevoegd i18n ondersteuning en auth variabele conflict opgelost.
 */
const ProfileView = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAdminAuth();
  const navigate = useNavigate();

  // Lokale states voor formulier
  const [displayName, setDisplayName] = useState("");
  const [preferences, setPreferences] = useState({
    emailNotifications: false,
    systemAlerts: true,
    language: "nl",
    darkMode: false,
    phoneNumber: "",
    department: "",
    signature: "",
  });

  // Beveiliging State
  const [passwordData, setPasswordData] = useState({
    newPassword: "",
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState(null);
  const [showPw, setShowPw] = useState(false);

  // 1. Laad Profiel & Voorkeuren
  useEffect(() => {
    const loadPrefs = async () => {
      if (!user?.uid) return;
      try {
        // Gebruik de centrale PATHS configuratie (dezelfde als AdminMessagesView)
        const userRef = doc(db, ...PATHS.USERS, user.uid);
        let snap = await getDoc(userRef);

        if (snap.exists()) {
          const data = snap.data();
          setDisplayName(data.name || user.displayName || "");
          
          // Direct de taal toepassen als deze in het profiel staat
          if (data.language) i18n.changeLanguage(data.language);

          setPreferences({
            emailNotifications: data.receivesValidationAlerts || false,
            systemAlerts: data.systemAlerts ?? true,
            language: data.language || "nl",
            darkMode: data.darkMode || false,
            phoneNumber: data.phoneNumber || "",
            department: data.department || user.role || "",
            signature: data.signature || "",
          });
        }
      } catch (err) {
        console.error("Fout bij laden profiel:", err);
      } finally {
        setLoading(false);
      }
    };
    loadPrefs();
  }, [user]);

  // 2. Opslaan Algemene Instellingen & Naam (Robuuste versie)
  const handleSaveGeneral = async () => {
    if (!user?.uid) return;
    setSaving(true);
    setSuccess(false);
    try {
      // A. Update Firebase Auth Profile (lokale browser sessie)
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: displayName });
      }

      // B. Update Firestore Document (Database)
      // We gebruiken setDoc met merge: true zodat het document wordt aangemaakt als het nog niet bestond.
      const userRef = doc(db, ...PATHS.USERS, user.uid);
      await setDoc(
        userRef,
        {
          uid: user.uid,
          email: user.email,
          name: displayName,
          receivesValidationAlerts: preferences.emailNotifications,
          systemAlerts: preferences.systemAlerts,
          language: preferences.language,
          darkMode: preferences.darkMode,
          phoneNumber: preferences.phoneNumber,
          signature: preferences.signature,
          lastUpdated: new Date().toISOString(),
        },
        { merge: true }
      );

      // Update ook direct de actieve taal
      i18n.changeLanguage(preferences.language);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert("Kon wijzigingen niet opslaan: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // 3. Wachtwoord Wijzigen
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      return setPwError("Wachtwoorden komen niet overeen.");
    }
    if (passwordData.newPassword.length < 6) {
      return setPwError("Minimaal 6 tekens vereist.");
    }

    setPwLoading(true);
    try {
      await updatePassword(auth.currentUser, passwordData.newPassword);
      const userRef = doc(db, ...PATHS.USERS, user.uid);
      await setDoc(userRef, { mustChangePassword: false }, { merge: true });

      setPwSuccess(true);
      setPasswordData({ newPassword: "", confirmPassword: "" });
    } catch (err) {
      if (err.code === "auth/requires-recent-login") {
        setPwError("Veiligheid: Log opnieuw in om je wachtwoord te wijzigen.");
      } else {
        setPwError("Systeemfout bij wachtwoord wijziging.");
      }
    } finally {
      setPwLoading(false);
    }
  };

  const PermissionItem = ({ icon: Icon, label, active }) => (
    <div
      className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
        active
          ? "bg-emerald-50 border-emerald-100 text-emerald-700 shadow-sm"
          : "bg-slate-50 border-slate-100 text-slate-400 opacity-40"
      }`}
    >
      <Icon size={16} />
      <span className="text-[9px] font-black uppercase tracking-widest">
        {label}
      </span>
      {active && <CheckCircle2 size={12} className="ml-auto" />}
    </div>
  );

  if (loading)
    return (
      <div className="h-full flex flex-col items-center justify-center p-20 bg-slate-50">
        <Loader2 className="animate-spin text-blue-500 mb-4" size={48} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          {t('common.loading', 'Dossier ophalen...')}
        </p>
      </div>
    );

  return (
    <div
      className={`p-6 md:p-10 max-w-7xl mx-auto animate-in fade-in custom-scrollbar overflow-y-auto h-full text-left transition-colors duration-500 ${
        preferences.darkMode ? "bg-slate-950" : "bg-slate-50"
      }`}
    >
      {/* Header */}
      <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1
            className={`text-4xl font-black mb-2 uppercase italic tracking-tighter ${
              preferences.darkMode ? "text-white" : "text-slate-900"
            }`}
          >
            {t('profile.prefs.my_dossier').split(' ')[0]} <span className="text-blue-600">{t('profile.prefs.my_dossier').split(' ').slice(1).join(' ')}</span>
          </h1>
          <p className="text-slate-500 font-medium uppercase text-[10px] tracking-[0.3em]">
            {t('profile.prefs.subtitle')}
          </p>
        </div>
        <button
          onClick={() => navigate("/portal")}
          className={`flex items-center gap-3 px-8 py-3 rounded-2xl text-xs font-black uppercase transition-all shadow-sm active:scale-95 border-2 ${
            preferences.darkMode
              ? "bg-white/5 border-white/10 text-white hover:bg-white/10"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <LayoutGrid size={18} /> {t('planning.hub.back_to_portal')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pb-24">
        {/* LINKS: IDENTITEIT & RECHTEN */}
        <div className="lg:col-span-8 space-y-8">
          {/* Kaart: Account & Naam */}
          <div
            className={`p-8 rounded-[45px] shadow-sm border border-slate-200 space-y-10 relative overflow-hidden transition-colors ${
              preferences.darkMode ? "bg-slate-900" : "bg-white"
            }`}
          >
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <UserCircle
                size={180}
                className={
                  preferences.darkMode ? "text-white" : "text-slate-900"
                }
              />
            </div>
            <h3
              className={`font-black flex items-center gap-3 uppercase tracking-wider text-xs italic ${
                preferences.darkMode ? "text-white" : "text-slate-800"
              }`}
            >
              <User size={20} className="text-blue-500" /> {t('profile.prefs.identity_title')}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10 text-left">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1 ml-1 text-left">
                  {t('profile.labels.name')}
                </label>
                <div className="relative group">
                  <User
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors"
                  />
                  <input
                    type="text"
                    className={`w-full p-4 pl-12 rounded-2xl font-bold outline-none border-2 transition-all text-sm ${
                      preferences.darkMode
                        ? "bg-white/5 border-white/10 text-white focus:border-blue-500"
                        : "bg-slate-50 border-slate-100 text-slate-700 focus:border-blue-500"
                    }`}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Bijv. Richard van Heerde"
                  />
                </div>
                <p className="text-[9px] text-slate-500 italic ml-1">
                  {/* Zichtbaar op de Portal en in de Sidebar badge. */}
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1 ml-1 text-left">
                  {t('profile.labels.email')}
                </label>
                <div
                  className={`p-4 rounded-2xl border-2 flex items-center gap-3 ${
                    preferences.darkMode
                      ? "bg-white/5 border-white/10 text-slate-500"
                      : "bg-slate-50 border-slate-100 text-slate-400"
                  }`}
                >
                  <Mail size={18} />
                  <span className="text-sm font-bold">{user?.email}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-100/10">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">
                {t('profile.prefs.signature')}
              </label>
              <div className="relative group">
                <Edit3
                  className="absolute left-5 top-4 text-slate-300 group-focus-within:text-blue-500"
                  size={20}
                />
                <textarea
                  className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-[25px] font-medium text-slate-600 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner resize-none text-xs"
                  rows={3}
                  value={preferences.signature || ""}
                  onChange={(e) => setPreferences({ ...preferences, signature: e.target.value })}
                  placeholder="Met vriendelijke groet..."
                />
              </div>
            </div>

            {/* BEVOEGDHEDEN OVERZICHT */}
            <div className="pt-10 border-t border-slate-100/10">
              <h4
                className={`text-[10px] font-black uppercase tracking-[0.2em] mb-6 flex items-center gap-2 ${
                  preferences.darkMode ? "text-emerald-400" : "text-emerald-600"
                }`}
              >
                <ShieldCheck size={16} /> {t('profile.prefs.permissions_title')} ({t('profile.prefs.role', 'Rol')}: {user?.role || t('profile.prefs.guest', 'Guest')})
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <PermissionItem
                  icon={Factory}
                  label="Productie Hub"
                  active={true}
                />
                <PermissionItem
                  icon={Package}
                  label="Catalogus"
                  active={true}
                />
                <PermissionItem
                  icon={ClipboardCheck}
                  label="Validatie (4-ogen)"
                  active={user?.role === "admin" || user?.role === "engineer"}
                />
                <PermissionItem
                  icon={Database}
                  label="Voorraadbeheer"
                  active={user?.role === "admin" || user?.role === "teamleader"}
                />
                <PermissionItem
                  icon={Monitor}
                  label="Terminal Beheer"
                  active={user?.role === "admin" || user?.role === "teamleader"}
                />
                <PermissionItem
                  icon={Settings}
                  label="Admin Hub"
                  active={user?.role === "admin"}
                />
              </div>
            </div>

            <div className="pt-8 border-t border-slate-100/10 flex items-center justify-between">
              {success && (
                <span className="text-emerald-500 text-sm font-black flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 size={18} /> {t('profile.saved', 'Wijzigingen opgeslagen')}
                </span>
              )}
              <button
                onClick={handleSaveGeneral}
                disabled={saving}
                className="ml-auto bg-blue-600 text-white px-10 py-5 rounded-[22px] font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-xl active:scale-95 disabled:opacity-50 flex items-center gap-3"
              >
                {saving ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Save size={18} />
                )}
                {t('profile.save_btn')}
              </button>
            </div>
          </div>

          {/* Kaart: Personalisatie & Notificaties */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div
              className={`p-8 rounded-[45px] shadow-sm border border-slate-200 space-y-8 ${
                preferences.darkMode
                  ? "bg-slate-900 border-white/5"
                  : "bg-white"
              }`}
            >
              <h3
                className={`font-black flex items-center gap-3 uppercase tracking-wider text-xs italic ${
                  preferences.darkMode ? "text-white" : "text-slate-800"
                }`}
              >
                <Monitor size={18} className="text-purple-500" /> {t('profile.prefs.personalization_title')}
              </h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase block ml-1 text-left">
                    {t('profile.prefs.language')}
                  </label>
                  <div
                    className={`grid grid-cols-4 gap-2 p-1 rounded-2xl border ${
                      preferences.darkMode
                        ? "bg-white/5 border-white/10"
                        : "bg-slate-100/50 border-slate-100"
                    }`}
                  >
                    <button
                      onClick={() => {
                        setPreferences({ ...preferences, language: "nl" });
                        i18n.changeLanguage("nl");
                      }}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all ${
                        preferences.language === "nl"
                          ? "bg-white text-blue-600 shadow-sm"
                          : "text-slate-400"
                      }`}
                    >
                      <Languages size={14} /> NL
                    </button>
                    <button
                      onClick={() => {
                        setPreferences({ ...preferences, language: "en" });
                        i18n.changeLanguage("en");
                      }}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all ${
                        preferences.language === "en"
                          ? "bg-white text-blue-600 shadow-sm"
                          : "text-slate-400"
                      }`}
                    >
                      <Languages size={14} /> EN
                    </button>
                    <button
                      onClick={() => {
                        setPreferences({ ...preferences, language: "ar" });
                        i18n.changeLanguage("ar");
                      }}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all ${
                        preferences.language === "ar"
                          ? "bg-white text-blue-600 shadow-sm"
                          : "text-slate-400"
                      }`}
                    >
                      <Languages size={14} /> AR
                    </button>
                    <button
                      onClick={() => {
                        setPreferences({ ...preferences, language: "de" });
                        i18n.changeLanguage("de");
                      }}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all ${
                        preferences.language === "de"
                          ? "bg-white text-blue-600 shadow-sm"
                          : "text-slate-400"
                      }`}
                    >
                      <Languages size={14} /> DE
                    </button>
                  </div>
                </div>
                <div
                  className={`flex items-center justify-between p-4 rounded-2xl border ${
                    preferences.darkMode
                      ? "bg-white/5 border-white/10"
                      : "bg-slate-50 border-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        preferences.darkMode
                          ? "bg-amber-500/20 text-amber-500"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {preferences.darkMode ? (
                        <Moon size={16} />
                      ) : (
                        <Sun size={16} />
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-black uppercase tracking-widest ${
                        preferences.darkMode ? "text-white" : "text-slate-800"
                      }`}
                    >
                      {t('profile.prefs.darkmode')}
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      setPreferences({
                        ...preferences,
                        darkMode: !preferences.darkMode,
                      })
                    }
                    className={`w-12 h-6 rounded-full p-1 transition-all ${
                      preferences.darkMode ? "bg-blue-600" : "bg-slate-200"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 bg-white rounded-full transition-transform ${
                        preferences.darkMode ? "translate-x-6" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`p-8 rounded-[45px] shadow-sm border border-slate-200 space-y-8 ${
                preferences.darkMode
                  ? "bg-slate-900 border-white/5"
                  : "bg-white"
              }`}
            >
              <h3
                className={`font-black flex items-center gap-3 uppercase tracking-wider text-xs italic ${
                  preferences.darkMode ? "text-white" : "text-slate-800"
                }`}
              >
                <BellRing size={18} className="text-orange-500" /> {t('profile.prefs.notifications_title')}
              </h3>
              <div className="space-y-4">
                <div
                  className={`flex items-center justify-between p-4 rounded-2xl border ${
                    preferences.darkMode
                      ? "bg-white/5 border-white/10"
                      : "bg-slate-50 border-slate-100"
                  }`}
                >
                  <div className="text-left">
                    <p
                      className={`text-[10px] font-black uppercase ${
                        preferences.darkMode ? "text-white" : "text-slate-800"
                      }`}
                    >
                      {t('profile.prefs.alerts')}
                    </p>
                    <p className="text-[9px] text-slate-500">
                      {t('profile.prefs.alerts_desc', 'Planning & Productie')}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setPreferences({
                        ...preferences,
                        systemAlerts: !preferences.systemAlerts,
                      })
                    }
                    className={`w-10 h-5 rounded-full p-1 transition-all ${
                      preferences.systemAlerts
                        ? "bg-emerald-500"
                        : "bg-slate-200"
                    }`}
                  >
                    <div
                      className={`w-3 h-3 bg-white rounded-full transition-transform ${
                        preferences.systemAlerts
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
                <div
                  className={`flex items-center justify-between p-4 rounded-2xl border ${
                    preferences.darkMode
                      ? "bg-white/5 border-white/10"
                      : "bg-slate-50 border-slate-100"
                  }`}
                >
                  <div className="text-left">
                    <p
                      className={`text-[10px] font-black uppercase ${
                        preferences.darkMode ? "text-white" : "text-slate-800"
                      }`}
                    >
                      {t('profile.prefs.notifications')}
                    </p>
                    <p className="text-[9px] text-slate-500">
                      {t('profile.prefs.notifications_desc', 'Validatie verzoeken')}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setPreferences({
                        ...preferences,
                        emailNotifications: !preferences.emailNotifications,
                      })
                    }
                    className={`w-10 h-5 rounded-full p-1 transition-all ${
                      preferences.emailNotifications
                        ? "bg-emerald-500"
                        : "bg-slate-200"
                    }`}
                  >
                    <div
                      className={`w-3 h-3 bg-white rounded-full transition-transform ${
                        preferences.emailNotifications
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KOLOM RECHTS: BEVEILIGING */}
        <div className="lg:col-span-4 sticky top-10">
          <div className="bg-slate-900 rounded-[45px] p-8 text-white shadow-2xl space-y-8 relative overflow-hidden border border-white/10">
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <Lock size={100} />
            </div>
            <div>
              <h3 className="font-black text-blue-400 flex items-center gap-3 uppercase tracking-wider text-xs mb-2 italic">
                <Key size={18} /> {t('profile.security.title')}
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
                {t('profile.security.description')}
              </p>
            </div>

            <form
              onSubmit={handleUpdatePassword}
              className="space-y-5 text-left"
            >
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 text-left">
                  {t('profile.security.new_pass')}
                </label>
                <div className="relative group">
                  <Lock
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-blue-400"
                    size={16}
                  />
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-12 outline-none focus:border-blue-500 transition-all font-mono text-sm text-white"
                    placeholder="••••••••"
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        newPassword: e.target.value,
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 text-left">
                  {t('profile.security.confirm_pass')}
                </label>
                <div className="relative group">
                  <Lock
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-blue-400"
                    size={16}
                  />
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-blue-500 transition-all font-mono text-sm text-white"
                    placeholder="••••••••"
                    value={passwordData.confirmPassword}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        confirmPassword: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              {pwError && (
                <div className="bg-rose-500/20 text-rose-300 p-4 rounded-2xl text-[10px] font-bold flex items-center gap-3 border border-rose-500/30 animate-in shake duration-300">
                  <AlertCircle size={16} className="shrink-0" /> {pwError}
                </div>
              )}
              {pwSuccess && (
                    <div className="bg-emerald-500/20 text-emerald-300 p-4 rounded-2xl text-[10px] font-bold flex items-center gap-3 border border-emerald-500/30 animate-in zoom-in duration-300">
                  <CheckCircle2 size={16} className="shrink-0" /> {t('profile.prefs.password_updated', 'Wachtwoord bijgewerkt!')}
                </div>
              )}

              <button
                type="submit"
                disabled={pwLoading || !passwordData.newPassword}
                className="w-full py-5 bg-white text-slate-900 rounded-[25px] font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:bg-emerald-400 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-30 mt-4"
              >
                {pwLoading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Key size={18} />
                )}{" "}
                {t('profile.security.update_btn')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileView;