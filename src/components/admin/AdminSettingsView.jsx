import React, { useState, useEffect, useRef } from "react";
import {
  Save,
  Loader2,
  Image as ImageIcon,
  Type,
  Trash2,
  Upload,
  ShieldCheck,
  Database,
  Layout,
  Palette,
  CheckCircle2,
  AlertCircle,
  Settings,
  BrainCircuit,
} from "lucide-react";
import { doc, onSnapshot, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";

// Handige presets voor snelle branding
const PRESET_LOGOS = [
  {
    id: "simple_ff",
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%233b82f6' width='100' height='100' rx='20'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='0.35em' font-family='Arial Black' font-size='40' fill='white' font-weight='900'%3EFF%3C/text%3E%3C/svg%3E",
    label: "FF Blauw",
  },
  {
    id: "simple_mes",
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%2310b981' width='100' height='100' rx='20'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='0.35em' font-family='Arial Black' font-size='28' fill='white' font-weight='900'%3EMES%3C/text%3E%3C/svg%3E",
    label: "MES Groen",
  },
  {
    id: "simple_factory",
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%230f172a' width='100' height='100' rx='20'/%3E%3Cpath d='M30 70h40v5H30z' fill='%23fbbf24'/%3E%3Cpath d='M35 45h8v25h-8z' fill='%2394a3b8'/%3E%3Cpath d='M50 35h8v35h-8z' fill='%2394a3b8'/%3E%3Cpath d='M32 48l8-8v5h5l8-8v5h5l8-8v8H32z' fill='%23fbbf24'/%3E%3C/svg%3E",
    label: "Factory",
  },
];

/**
 * AdminSettingsView V6.0 - Root Integrated
 * Beheert globale applicatie-instellingen, branding en thema.
 * Pad: /future-factory/settings/general_configs/main
 */
const AdminSettingsView = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [uploadedLogos, setUploadedLogos] = useState([]);
  const fileInputRef = useRef(null);

  const [settings, setSettings] = useState({
    appName: "FPI Future Factory",
    logoUrl: "",
    themeColor: "blue",
    maintenanceMode: false,
    uploadedLogos: [], // Array om alle geüploade logo's bij te houden
  });
  const [aiPrompt, setAiPrompt] = useState("");

  // 1. Live Sync met de Root
  useEffect(() => {
    const docRef = doc(db, ...PATHS.GENERAL_SETTINGS);

    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setSettings((prev) => ({ ...prev, ...data }));
          setUploadedLogos(data.uploadedLogos || []);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Fout bij laden root settings:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // 1b. Laad AI Context (losse fetch om traffic te sparen)
  useEffect(() => {
    const fetchAiConfig = async () => {
      try {
        const docRef = doc(db, "future-factory", "settings", "ai_config", "main");
        const snap = await getDoc(docRef);
        if (snap.exists()) setAiPrompt(snap.data().systemPrompt || "");
      } catch (e) { console.error(e); }
    };
    fetchAiConfig();
  }, []);

  // 2. Opslaan naar de Root
  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const docRef = doc(db, ...PATHS.GENERAL_SETTINGS);
      await setDoc(
        docRef,
        {
          ...settings,
          lastUpdated: serverTimestamp(),
          updatedBy: "Admin Hub",
        },
        { merge: true }
      );

      // Sla AI prompt apart op
      if (aiPrompt) {
        await setDoc(doc(db, "future-factory", "settings", "ai_config", "main"), {
          systemPrompt: aiPrompt,
          lastUpdated: serverTimestamp()
        }, { merge: true });
      }

      setStatus({ type: "success", msg: "Systeeminstellingen gepubliceerd!" });
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      console.error("Save Error:", error);
      setStatus({ type: "error", msg: "Opslaan mislukt." });
    } finally {
      setSaving(false);
    }
  };

  // --- LOGO HANDLERS ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 500 * 1024) {
      alert("Bestand te groot (max 500KB).");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const newLogoUrl = reader.result;
      const newUploadedLogos = [
        ...settings.uploadedLogos,
        {
          id: Date.now().toString(),
          url: newLogoUrl,
          uploadedAt: new Date().toISOString(),
          fileName: file.name,
        },
      ];
      setSettings({ 
        ...settings, 
        logoUrl: newLogoUrl,
        uploadedLogos: newUploadedLogos,
      });
      setUploadedLogos(newUploadedLogos);
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setSettings({ ...settings, logoUrl: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const deleteUploadedLogo = (logoId) => {
    const updatedLogos = settings.uploadedLogos.filter(logo => logo.id !== logoId);
    const wasCurrentLogo = uploadedLogos.find(logo => logo.id === logoId)?.url === settings.logoUrl;
    
    setSettings({ 
      ...settings, 
      uploadedLogos: updatedLogos,
      logoUrl: wasCurrentLogo ? "" : settings.logoUrl,
    });
    setUploadedLogos(updatedLogos);
  };

  if (loading)
    return (
      <div className="h-full flex flex-col items-center justify-center p-20 gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          Master Config laden...
        </p>
      </div>
    );

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500 h-full overflow-y-auto custom-scrollbar text-left pb-40">
      {/* HEADER UNIT */}
      <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
          <Settings size={150} />
        </div>
        <div className="flex items-center gap-6 relative z-10">
          <div className="p-4 bg-slate-900 text-white rounded-[22px] shadow-xl">
            <Layout size={32} />
          </div>
          <div className="text-left">
            <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
              Systeem <span className="text-blue-600">Configuratie</span>
            </h2>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-100 uppercase italic">
                <ShieldCheck size={10} /> Root Encrypted
              </span>
              <p className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">
                Target: /{PATHS.GENERAL_SETTINGS.join("/")}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-slate-900 text-white px-10 py-5 rounded-[22px] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-3 relative z-10"
        >
          {saving ? <Loader2 className="animate-spin" /> : <Save size={18} />}{" "}
          Publiceren naar Root
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* LINKS: ALGEMENE INFO */}
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-8 text-left">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3 italic">
              <Type size={16} className="text-blue-500" /> Basis Informatie
            </h3>
            <div className="space-y-2 text-left">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">
                Applicatie Naam
              </label>
              <input
                className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all text-lg shadow-inner"
                value={settings.appName}
                onChange={(e) =>
                  setSettings({ ...settings, appName: e.target.value })
                }
              />
              <p className="text-[9px] text-slate-400 italic ml-2 mt-2">
                Dit is de naam die wordt getoond in de browser-tab en de header.
              </p>
            </div>
          </div>

          {/* LIVE PREVIEW BANNER */}
          <div className="bg-slate-900 p-8 rounded-[40px] shadow-2xl flex items-center gap-6 relative overflow-hidden text-left border border-white/5">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Palette size={100} />
            </div>
            <div className="flex items-center gap-4 relative z-10 overflow-hidden">
              <div className="shrink-0">
                {settings.logoUrl ? (
                  <img
                    src={settings.logoUrl}
                    className="h-12 w-12 object-contain bg-white/10 rounded-xl p-1.5 border border-white/10"
                    alt="Logo"
                  />
                ) : (
                  <div className="h-12 w-12 bg-blue-600 rounded-xl flex items-center justify-center font-black text-white italic">
                    FF
                  </div>
                )}
              </div>
              <div className="text-left overflow-hidden">
                <h4 className="text-xl font-black text-white uppercase italic tracking-tighter truncate leading-none">
                  {settings.appName}
                </h4>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] mt-1.5">
                  Live Header Preview
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* RECHTS: BRANDING & LOGO */}
        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-8 text-left">
          <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3 italic text-left">
            <ImageIcon size={16} className="text-blue-500" /> Branding & Media
          </h3>

          {/* Custom Input & Upload */}
          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">
              Logo Bron (URL of Bestand)
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1 group">
                <ImageIcon
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors"
                />
                <input
                  className="w-full pl-12 pr-12 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-bold text-slate-600 outline-none focus:border-blue-500 transition-all shadow-inner truncate"
                  value={settings.logoUrl}
                  onChange={(e) =>
                    !e.target.value.startsWith("data:") &&
                    setSettings({ ...settings, logoUrl: e.target.value })
                  }
                  placeholder="https://..."
                />
                {settings.logoUrl && (
                  <button
                    onClick={removeLogo}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-500 transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current.click()}
                className="bg-slate-100 text-slate-600 px-6 rounded-2xl font-black text-[10px] uppercase hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-95 border-2 border-transparent hover:border-blue-300"
              >
                <Upload size={18} />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />
            </div>
          </div>

          {/* Presets Grid */}
          <div className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase ml-2 block italic">
              Systeem Presets
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PRESET_LOGOS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() =>
                    setSettings({ ...settings, logoUrl: preset.url })
                  }
                  className={`p-3 rounded-[25px] border-2 transition-all flex flex-col items-center gap-3 group ${
                    settings.logoUrl === preset.url
                      ? "border-blue-500 bg-blue-50 shadow-md ring-4 ring-blue-500/5"
                      : "border-slate-50 hover:border-slate-200 bg-slate-50/50"
                  }`}
                >
                  <img
                    src={preset.url}
                    className="h-8 w-8 object-contain transition-transform group-hover:scale-110"
                    alt={preset.label}
                  />
                  <span
                    className={`text-[8px] font-black uppercase tracking-tighter ${
                      settings.logoUrl === preset.url
                        ? "text-blue-700"
                        : "text-slate-400"
                    }`}
                  >
                    {preset.label}
                  </span>
                </button>
              ))}
              <button
                onClick={removeLogo}
                className={`p-3 rounded-[25px] border-2 transition-all flex flex-col items-center justify-center gap-2 ${
                  !settings.logoUrl
                    ? "border-rose-200 bg-rose-50"
                    : "border-slate-50 hover:border-rose-100 bg-slate-50/50"
                }`}
              >
                <Trash2 size={14} className="text-rose-500" />
                <span className="text-[7px] font-black text-rose-600 uppercase">
                  Verwijder
                </span>
              </button>
            </div>
          </div>

          {/* Geüploade Logo's Sectie */}
          {uploadedLogos.length > 0 && (
            <div className="space-y-4 pt-6 border-t border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase ml-2 block italic">
                Mijn Geüploade Logo's ({uploadedLogos.length})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {uploadedLogos.map((logo) => (
                  <div
                    key={logo.id}
                    className={`relative p-3 rounded-[25px] border-2 transition-all flex flex-col items-center gap-3 group ${
                      settings.logoUrl === logo.url
                        ? "border-emerald-500 bg-emerald-50 shadow-md ring-4 ring-emerald-500/5"
                        : "border-slate-50 hover:border-slate-200 bg-slate-50/50"
                    }`}
                  >
                    <button
                      onClick={() => deleteUploadedLogo(logo.id)}
                      className="absolute -top-2 -right-2 p-1.5 bg-rose-500 text-white rounded-full shadow-lg hover:bg-rose-600 transition-all z-10 opacity-0 group-hover:opacity-100"
                      title="Verwijderen"
                    >
                      <Trash2 size={12} />
                    </button>
                    <button
                      onClick={() => setSettings({ ...settings, logoUrl: logo.url })}
                      className="w-full flex flex-col items-center gap-2"
                    >
                      <img
                        src={logo.url}
                        className="h-10 w-10 object-contain transition-transform group-hover:scale-110"
                        alt={logo.fileName}
                      />
                      <span className="text-[7px] font-black text-slate-400 uppercase mt-1 block truncate w-full text-center">
                        {logo.fileName || 'Logo'}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* AI CONFIGURATIE */}
        <div className="space-y-4 pt-6 border-t border-slate-100">
          <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3 italic">
            <BrainCircuit size={16} className="text-purple-500" /> AI Kennisbank (System Prompt)
          </h3>
          <div className="relative">
            <textarea 
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              className="w-full h-64 p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-xs text-slate-600 outline-none focus:border-purple-500 transition-all resize-y"
              placeholder="Plak hier de volledige context en instructies voor de AI..."
            />
            <div className="absolute bottom-4 right-4 text-[9px] font-bold text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">
              {aiPrompt.length} karakters
            </div>
          </div>
        </div>

        {/* RECHTS: SAVE BUTTON */}
        <div className="space-y-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-600 text-white p-5 rounded-2xl font-black uppercase text-sm hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {saving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Opslaan...
              </>
            ) : (
              <>
                <Save size={18} />
                Wijzigingen Opslaan
              </>
            )}
          </button>
        </div>
      </div>

      {/* STATUS MELDINGEN */}
      {status && (
        <div
          className={`p-6 rounded-[30px] border-2 flex items-center gap-4 animate-in slide-in-from-bottom-4 shadow-xl ${
            status.type === "success"
              ? "bg-emerald-50 border-emerald-100 text-emerald-700"
              : "bg-rose-50 border-rose-100 text-rose-700"
          }`}
        >
          {status.type === "success" ? (
            <CheckCircle2 size={24} />
          ) : (
            <AlertCircle size={24} />
          )}
          <p className="font-black uppercase text-xs tracking-widest">
            {status.msg}
          </p>
        </div>
      )}

      {/* INFORMATIEVE FOOTER */}
      <div className="bg-slate-900 p-10 rounded-[50px] text-white/50 text-[10px] font-black uppercase tracking-[0.2em] flex flex-col md:flex-row items-center gap-8 relative overflow-hidden border border-white/5">
        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
          <Database size={150} />
        </div>
        <div className="p-4 bg-blue-600 rounded-3xl shadow-lg text-white shrink-0">
          <ShieldCheck size={32} />
        </div>
        <div className="text-left flex-1 relative z-10 leading-relaxed">
          <h4 className="text-white text-sm mb-2 italic tracking-tight uppercase leading-none">
            Global Systeem Protocol
          </h4>
          Deze instellingen worden direct gesynchroniseerd met alle actieve
          terminals en werkstations. Wijzigingen in branding zijn binnen 1
          seconde zichtbaar voor alle ingelogde gebruikers via de
          <span className="text-blue-400 italic"> Secure Root Node</span>.
        </div>
      </div>
    </div>
  );
};

export default AdminSettingsView;
