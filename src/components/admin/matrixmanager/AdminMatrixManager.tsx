/* eslint-disable */
import React, { useState, useEffect } from "react";
import {
  Grid,
  Save,
  RefreshCw,
  Layers,
  Ruler,
  LayoutDashboard,
  FileText,
  Settings,
  FileUp,
  Loader2,
  TableProperties,
  Target,
  ArrowLeft,
} from "lucide-react";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db, auth, logActivity } from "../../../config/firebase";
import { PATHS, getPathString } from "../../../config/dbPaths";

// Sub-componenten
import AvailabilityView from "./AvailabilityView";
import LibraryView from "./LibraryView";
import BlueprintsView from "./BlueprintsView";
import DimensionsView from "./DimensionsView";
import SpecsView from "./SpecsView";
import BulkUploadView from "./BulkUploadView";
import MatrixRangesView from "./MatrixRangesView";
import AdminDrillingView from "./AdminDrillingView"; // NIEUW: Boorpatronen beheer

type StatusState = {
  type: string;
  msg: string;
};

type MatrixData = Record<string, Record<string, number[]>>;

type LibraryData = Record<string, string[]>;

type Blueprint = {
  fields: string[];
  [key: string]: unknown;
};

type SiteConfig = {
  logo?: string;
  siteName?: string;
  color?: string;
  logoUrl?: string;
  themeColor?: string;
  uploadedLogos?: string[];
  appName?: string;
};

type ActiveTab =
  | "matrix"
  | "drilling"
  | "ranges"
  | "library"
  | "blueprints"
  | "dimensions"
  | "admin_upload"
  | "specs";

type TabConfig = {
  id: ActiveTab;
  label: string;
  icon: React.ReactNode;
};

const docPath = (path: string[]) => doc(db, getPathString(path));
const docPathWithId = (path: string[], id: string) => doc(db, `${getPathString(path)}/${id}`);

// Nieuw pad voor site config
const SITE_CONFIG_PATH = PATHS.SITE_CONFIG_APP;

/**
 * AdminMatrixManager V7.5 - Full Access Edition
 * Beheert de volledige technische intelligentie inclusief boorpatronen (Drilling).
 */

const AdminMatrixManager = ({ onNavigate }: { onNavigate?: (screen: string | null) => void }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>("matrix");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusState>({ type: "", msg: "" });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Data States
  const [matrixData, setMatrixData] = useState<MatrixData>({});
  const [libraryData, setLibraryData] = useState<LibraryData>({});
  const [, setSiteConfig] = useState<SiteConfig>({});
  const [blueprints, setBlueprints] = useState<Record<string, Blueprint>>({});

  // Helper function for logging
  const addLog = (type: string, msg: string) => setStatus({ type, msg });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [rangeSnap, configSnap, templatesSnap, siteSnap, oldSiteSnap] = await Promise.all([
          getDoc(docPath(PATHS.MATRIX_CONFIG)),
          getDoc(docPath(PATHS.GENERAL_SETTINGS)),
          getDoc(docPath(PATHS.BLUEPRINTS)),
          getDoc(docPath(SITE_CONFIG_PATH)),
          getDoc(docPath(PATHS.SITE_CONFIG_MAIN)),
        ]);

        if (rangeSnap.exists()) setMatrixData(rangeSnap.data() as MatrixData);
        if (configSnap.exists()) setLibraryData(rangeSnap.exists() ? (configSnap.data() as LibraryData) : {});
        if (templatesSnap.exists()) setBlueprints(templatesSnap.data() as Record<string, Blueprint>);
        if (siteSnap.exists()) {
          setSiteConfig(siteSnap.data() as SiteConfig);
        } else if (oldSiteSnap.exists()) {
          // Migreer oude data naar nieuwe locatie, neem alle relevante velden mee
          const oldData = oldSiteSnap.data() as SiteConfig;
          const migrated: SiteConfig = {
            logo: oldData.logo || "",
            siteName: oldData.siteName || oldData.appName || "",
            color: oldData.color || oldData.themeColor || "",
            logoUrl: oldData.logoUrl || "",
            themeColor: oldData.themeColor || "",
            uploadedLogos: oldData.uploadedLogos || [],
            appName: oldData.appName || oldData.siteName || ""
          };
          await setDoc(docPath(SITE_CONFIG_PATH), migrated, { merge: true });
          await logActivity(
            auth.currentUser?.uid || "system",
            "SITE_CONFIG_MIGRATE",
            "Site config gemigreerd van main naar app"
          );
          setSiteConfig(migrated);
        }

        console.log("✅ Matrix Hub: Alle data gesynchroniseerd.");
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          addLog("error", `Sync fout: ${message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 2. CENTRAAL OPSLAAN (Voor tabs die state in de parent beheren)
  const handleSave = async () => {
    setLoading(true);
    let pathArray: string[] | null = null;
    let data: MatrixData | LibraryData | Record<string, Blueprint> | null = null;

    if (activeTab === "matrix") {
      pathArray = PATHS.MATRIX_CONFIG;
      data = matrixData;
    } else if (activeTab === "library") {
      pathArray = PATHS.GENERAL_SETTINGS;
      // Alleen relevante bibliotheekvelden opslaan
      const allowedKeys = [
        "connections",
        "product_names",
        "pns",
        "diameters",
        "borings",
        "codes",
        "angles",
        "productLabels"
      ]; // Voeg hier extra keys toe als je meer bibliotheekvelden wilt ondersteunen
      // Haal site config velden uit libraryData (en bewaar ze apart)
      const {
        logo,
        siteName,
        color,
        logoUrl,
        themeColor,
        uploadedLogos,
        appName,
        ...filtered
      } = libraryData as LibraryData & SiteConfig;
      data = Object.fromEntries(
        Object.entries(filtered).filter(([key]) => allowedKeys.includes(key))
      ) as LibraryData;
      // Sla site config apart op als er iets is ingevuld
      const safeSiteConfig: SiteConfig = {
        logo: logo ?? "",
        siteName: siteName ?? "",
        color: color ?? "",
        logoUrl: logoUrl ?? "",
        themeColor: themeColor ?? "",
        uploadedLogos: uploadedLogos ?? [],
        appName: appName ?? ""
      };
      if (
        safeSiteConfig.logo ||
        safeSiteConfig.siteName ||
        safeSiteConfig.color ||
        safeSiteConfig.logoUrl ||
        safeSiteConfig.themeColor ||
        (safeSiteConfig.uploadedLogos && safeSiteConfig.uploadedLogos.length) ||
        safeSiteConfig.appName
      ) {
        await setDoc(docPath(SITE_CONFIG_PATH), safeSiteConfig, { merge: true });
        await logActivity(
          auth.currentUser?.uid || "system",
          "SITE_CONFIG_UPDATE",
          "Site config bijgewerkt vanuit Matrix Hub"
        );
      }
    } else if (activeTab === "blueprints") {
      pathArray = PATHS.BLUEPRINTS;
      data = blueprints;
    } else {
      setLoading(false);
      return;
    }

    try {
      await setDoc(
        docPath(pathArray),
        {
          ...data,
          lastUpdated: serverTimestamp(),
          updatedBy: "Admin Hub Core",
        },
        { merge: true }
      );

      await logActivity(
        auth.currentUser?.uid || "system",
        "MATRIX_MANAGER_SAVE",
        `Matrix Hub opgeslagen voor tab: ${activeTab}`
      );

      addLog("success", "Wijzigingen live gepubliceerd!");
      setHasUnsavedChanges(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      addLog("error", `Opslaan mislukt: ${message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setStatus({ type: "", msg: "" }), 4000);
    }
  };

  const TABS: TabConfig[] = [
    { id: "matrix", label: "Beschikbaarheid", icon: <Grid size={14} /> },
    { id: "drilling", label: "Boringen", icon: <Target size={14} /> }, // NIEUW: Tab voor boorpatronen
    { id: "ranges", label: "Tolerantie Manager", icon: <TableProperties size={14} /> },
    { id: "library", label: "Bibliotheek", icon: <Settings size={14} /> },
    { id: "blueprints", label: "Blauwdrukken", icon: <Layers size={14} /> },
    { id: "dimensions", label: "Maatvoering", icon: <Ruler size={14} /> },
    { id: "admin_upload", label: "Bulk Upload", icon: <FileUp size={14} /> },
    { id: "specs", label: "Overzicht", icon: <FileText size={14} /> },
  ];


  if (loading && Object.keys(matrixData).length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          Matrix Hub Laden...
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Gecombineerde Header + Tabs */}
      <div className="bg-white/90 backdrop-blur-md border-b border-slate-200 flex justify-between items-end shrink-0 shadow-sm sticky top-0 z-20 w-full px-4 lg:px-8">
        <div className="flex items-center overflow-x-auto no-scrollbar flex-1">
          <div className="flex items-center gap-4 text-left mr-4 lg:mr-8 py-3 shrink-0">
            <button 
              onClick={() => onNavigate && onNavigate(null)} 
              className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-all active:scale-90"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 className="hidden xl:flex text-xl font-black text-slate-800 items-center gap-2 italic uppercase leading-none">
              <Grid size={20} className="text-purple-600" /> Matrix Manager
            </h2>
          </div>
          <div className="flex gap-1 lg:gap-4">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-2 lg:px-3 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all whitespace-nowrap flex items-center ${
                  activeTab === tab.id
                    ? "border-blue-600 text-slate-900 bg-slate-50/50"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                <span className="mr-1.5 opacity-50">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="py-2 xl:py-3 shrink-0 ml-4 hidden sm:flex">
          {["matrix", "library", "blueprints"].includes(activeTab) && (
            <button
              onClick={handleSave}
              disabled={loading || (!hasUnsavedChanges && status.type !== "error")}
              className={`px-5 py-2.5 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-sm ${
                hasUnsavedChanges || status.type === "error"
                  ? "bg-slate-900 text-white hover:bg-blue-600"
                  : "bg-slate-100 text-slate-300"
              }`}
            >
              {loading ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />} Opslaan
            </button>
          )}
        </div>
      </div>

      {/* View Switcher */}
      <div className="flex-1 overflow-y-auto bg-slate-50 custom-scrollbar w-full flex justify-center pb-20 text-left">
        <div className="w-full max-w-7xl p-8 animate-in fade-in duration-300">
          {activeTab === "matrix" && (
            <AvailabilityView
              libraryData={libraryData}
              matrixData={matrixData}
              setMatrixData={setMatrixData}
              setHasUnsavedChanges={setHasUnsavedChanges}
            />
          )}
          {activeTab === "drilling" && <AdminDrillingView />}
          {activeTab === "ranges" && <MatrixRangesView />}
          {activeTab === "library" && (
            <LibraryView
              libraryData={libraryData}
              setLibraryData={setLibraryData}
              setHasUnsavedChanges={setHasUnsavedChanges}
              blueprints={blueprints}
            />
          )}
          {activeTab === "blueprints" && (
            <BlueprintsView
              blueprints={blueprints}
              setBlueprints={setBlueprints}
              libraryData={libraryData}
              setHasUnsavedChanges={setHasUnsavedChanges}
            />
          )}
          {activeTab === "dimensions" && (
            <DimensionsView
              libraryData={libraryData}
              blueprints={blueprints}
              productRange={matrixData}
            />
          )}
          {activeTab === "admin_upload" && <BulkUploadView />}
          {activeTab === "specs" && <SpecsView blueprints={blueprints} />}
        </div>
      </div>
    </div>
  );
};

export default AdminMatrixManager;
