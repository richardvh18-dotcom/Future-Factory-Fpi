import React, { useState, useEffect } from "react";
import {
  X,
  Ruler,
  Package,
  Info,
  Loader2,
  Download,
  ExternalLink,
  Target,
  Settings,
  Zap,
  Hammer,
  FileText,
  ImageIcon,
  Layers,
  AlertCircle,
  CircleDot, // Icoon voor boringen
} from "lucide-react";

import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { db, storage } from "../../config/firebase";
import { generateProductPDF } from "../../utils/pdfGenerator";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { aiService } from "../../services/aiService";

const getAppId = () => {
  if (typeof window !== "undefined" && window.__app_id) return window.__app_id;
  return "fittings-app-v1";
};

const appId = getAppId();

/**
 * ProductDetailModal V6.0: Bore Dimensions
 * - Toevoeging: Aparte sectie voor Boring/Flens data in Maatvoering tab.
 */
const ProductDetailModal = ({ product, onClose, userRole }) => {
  const [activeTab, setActiveTab] = useState("basis");
  const [liveSpecs, setLiveSpecs] = useState(null);
  const [boreSpecs, setBoreSpecs] = useState(null); // NIEUW: State voor boringen
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const FITTING_ORDER = ["TW", "L", "Lo", "R", "Weight"];
  const MOF_ORDER = ["B1", "B2", "BA", "A", "TWcb", "BD", "W"];

  useEffect(() => {
    if (!product || !appId) return;

    const fetchLiveDimensions = async () => {
      setLoading(true);
      try {
        const connKey =
          product.connection?.split("/")[0]?.toUpperCase() || "CB";
        const pnStr = `PN${product.pressure}`;
        const idStr = `ID${product.diameter}`;

        const baseTypeRaw = product.type
          ?.replace("_Socket", "")
          .replace("_SOCKET", "")
          .toUpperCase();
        const isElbowType = baseTypeRaw.includes("ELBOW");
        const anglePart =
          isElbowType && product.angle && product.angle !== "-"
            ? `${product.angle}_`
            : "";

        const standardFitId = `${baseTypeRaw}_${anglePart}${connKey}_${pnStr}_${idStr}`;
        const socketFitId = `${baseTypeRaw}_SOCKET_${connKey}_${pnStr}_${idStr}`;
        const bellId = `${connKey}_${pnStr}_${idStr}`;
        const bellCol =
          connKey.toLowerCase() === "cb" ? "cb_dimensions" : "tb_dimensions";

        const [bellSnap, fitStandardSnap, fitSocketSnap] = await Promise.all([
          getDoc(
            doc(db, "artifacts", appId, "public", "data", bellCol, bellId)
          ),
          getDoc(
            doc(
              db,
              "artifacts",
              appId,
              "public",
              "data",
              "standard_fitting_specs",
              standardFitId
            )
          ),
          getDoc(
            doc(
              db,
              "artifacts",
              appId,
              "public",
              "data",
              "standard_socket_specs",
              socketFitId
            )
          ),
        ]);

        let merged = {};
        if (bellSnap.exists()) merged = { ...merged, ...bellSnap.data() };
        if (fitStandardSnap.exists())
          merged = { ...merged, ...fitStandardSnap.data() };
        if (fitSocketSnap.exists())
          merged = { ...merged, ...fitSocketSnap.data() };

        // NIEUW: Boringen apart ophalen en opslaan
        let boreData = null;
        if (product.drilling && product.drilling !== "-") {
          const boreId = `${product.drilling.replace(
            /\s+/g,
            "_"
          )}_${idStr}`.toUpperCase();
          const boreSnap = await getDoc(
            doc(
              db,
              "artifacts",
              appId,
              "public",
              "data",
              "bore_dimensions",
              boreId
            )
          );
          if (boreSnap.exists()) {
            boreData = boreSnap.data();
            Object.assign(merged, boreData); // Ook in merged voor PDF/Totaaloverzicht
          }
        }

        setBoreSpecs(boreData); // Zet de aparte bore state
        setLiveSpecs(merged);
      } catch (err) {
        console.error("Data-integratie mislukt:", err);
        setError("Fout bij ophalen technische data.");
      } finally {
        setLoading(false);
      }
    };
    fetchLiveDimensions();
  }, [product]);

  if (!product) return null;

  const getOrderedSpecs = (orderList) => {
    if (!liveSpecs) return [];
    const dbKeys = Object.keys(liveSpecs);
    return orderList
      .map((key) => {
        let value = liveSpecs[key];
        const lowerKey = key.toLowerCase();

        if (value === undefined || value === "") {
          if (lowerKey === "a") value = liveSpecs["A1"] || liveSpecs["a1"];
          if (value === undefined) {
            const fuzzyKey = dbKeys.find((dk) => dk.toLowerCase() === lowerKey);
            if (fuzzyKey) value = liveSpecs[fuzzyKey];
          }
        }
        if (value && typeof value === "object") return null;

        return value !== undefined && value !== null && value !== ""
          ? { label: key, value }
          : null;
      })
      .filter((item) => item !== null);
  };

  const fittingSpecs = getOrderedSpecs(FITTING_ORDER);
  const mofSpecs = getOrderedSpecs(MOF_ORDER);

  const excludedKeys = [
    "id",
    "type",
    "pressure",
    "diameter",
    "lastupdated",
    "timestamp",
    "updatedby",
    "status",
    "createdby",
    "articlecode",
  ];

  const extraSpecs = liveSpecs
    ? Object.entries(liveSpecs)
        .filter(([k]) => {
          const lk = k.toLowerCase();
          const isKnown =
            FITTING_ORDER.map((f) => f.toLowerCase()).includes(lk) ||
            MOF_ORDER.map((m) => m.toLowerCase()).includes(lk) ||
            lk === "a1";

          // NIEUW: Filter ook de bore keys eruit zodat ze niet dubbel staan
          const isBore = boreSpecs && Object.keys(boreSpecs).includes(k);

          return !isKnown && !isBore && !excludedKeys.includes(lk);
        })
        .map(([k, v]) => {
          let displayValue = v;
          if (v && typeof v === "object" && v.seconds !== undefined) {
            displayValue = new Date(v.seconds * 1000).toLocaleString("nl-NL");
          } else if (v && typeof v === "object") {
            displayValue = "[Data Object]";
          }
          return { label: k, value: String(displayValue) };
        })
    : [];

  const TabButton = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-6 py-4 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all ${
        activeTab === id
          ? "border-blue-600 text-slate-900 bg-blue-50/30"
          : "border-transparent text-slate-400 hover:text-slate-600"
      }`}
    >
      <Icon size={14} /> {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 lg:p-10 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-6xl rounded-[40px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[90vh] text-left">
        {/* MODAL HEADER */}
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
          <div className="text-left">
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter italic uppercase leading-none">
              {product.name || product.productCode}
            </h2>
            <div className="flex items-center gap-3 mt-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Engineering Master Data V5.8
              </p>
              {product.articleCode && (
                <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase">
                  ERP: {product.articleCode}
                </span>
              )}
              {/* PDF Upload knop alleen voor admin/qc/engineer */}
              {(userRole === 'admin' || userRole === 'qc' || userRole === 'engineer') && (
                <form style={{ display: 'inline' }}>
                  <label className="ml-4 bg-blue-100 text-blue-700 px-3 py-1 rounded-xl text-xs font-bold cursor-pointer hover:bg-blue-200 transition-all">
                    PDF uploaden
                    <input
                      type="file"
                      accept="application/pdf"
                      style={{ display: 'none' }}
                      disabled={uploading}
                      onChange={async (e) => {
                        setUploadError(null);
                        const file = e.target.files[0];
                        if (!file) return;
                        setUploading(true);
                        try {
                          // Upload naar Firebase Storage
                          const storageRef = ref(storage, `pdfs/${file.name}`);
                          await uploadBytes(storageRef, file);
                          const url = await getDownloadURL(storageRef);
                          // Voeg toe aan product.sourcePdfs
                          const productRef = doc(db, "future-factory/production/products", product.id);
                          await updateDoc(productRef, {
                            sourcePdfs: arrayUnion({ name: file.name, url })
                          });
                          // Trigger AI learning direct (optioneel: feedback)
                          try {
                            await aiService.learnFromPdfUrl(url, file.name);
                          } catch (aiErr) {
                            // AI mag falen zonder UI crash
                            console.warn("AI learning error:", aiErr);
                          }
                          window.location.reload(); // Simpel: herlaad om nieuwe PDF te tonen
                        } catch (err) {
                          setUploadError("Uploaden mislukt: " + err.message);
                        } finally {
                          setUploading(false);
                        }
                      }}
                    />
                  </label>
                  {uploading && <span className="ml-2 text-xs text-blue-500">Uploaden...</span>}
                  {uploadError && <span className="ml-2 text-xs text-red-500">{uploadError}</span>}
                </form>
              )}
            </div>
          </div>
          <button
            // AIService uitbreiden met learnFromPdfUrl
            // (Plaats deze functie in aiService.js indien nog niet aanwezig)
            // async learnFromPdfUrl(pdfUrl, fileName) {
            //   // Download PDF, parse tekst, sla op in ai_documents
            // }
            onClick={onClose}
            className="p-3 bg-slate-100 text-slate-400 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-all border-none"
          >
            <X size={24} />
          </button>
        </div>

        {/* TABS */}
        <div className="flex px-8 bg-slate-50/50 border-b border-slate-100 shrink-0 overflow-x-auto no-scrollbar">
          <TabButton id="basis" label="1. Basis Info" icon={Package} />
          <TabButton id="maatvoering" label="2. Maatvoering" icon={Ruler} />
          <TabButton id="gereedschap" label="3. Gereedschappen" icon={Hammer} />
        </div>

        {/* SCROLLABLE CONTENT */}
        <div className="flex-1 overflow-y-auto p-8 lg:p-12 custom-scrollbar bg-white text-left">
          {/* CONTENT: BASIS INFO */}
          {activeTab === "basis" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 animate-in slide-in-from-left duration-300 text-left">
              <div className="lg:col-span-7">
                <div className="relative aspect-video lg:aspect-square bg-slate-100 rounded-[48px] border-8 border-slate-50 flex items-center justify-center overflow-hidden shadow-inner">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-slate-300 text-center opacity-20">
                      <ImageIcon size={120} />
                      <p className="text-sm font-black uppercase mt-4">
                        Geen Beeld
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div className="lg:col-span-5 space-y-3">
                <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] italic mb-4 flex items-center gap-2">
                  <Info size={14} /> Kerngegevens
                </h4>
                {[
                  {
                    l: "Diameter",
                    v: `ID ${product.diameter} mm`,
                    i: <Target size={18} />,
                    c: "text-blue-600",
                  },
                  {
                    l: "Druk",
                    v: `PN ${product.pressure}`,
                    i: <Zap size={18} />,
                    c: "text-emerald-600",
                  },
                  {
                    l: "Verbinding",
                    v: product.connection,
                    i: <Settings size={18} />,
                    c: "text-slate-600",
                  },
                  {
                    l: "Boring",
                    v: product.drilling || "N.v.t.",
                    i: <Layers size={18} />,
                    c: "text-purple-600",
                  },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-50 p-4 rounded-[24px] border border-slate-100 shadow-sm flex items-center justify-between group hover:border-blue-200 transition-all"
                  >
                    <div className="flex flex-col text-left">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                        {item.l}
                      </span>
                      <span className="text-lg font-black text-slate-900 tracking-tight">
                        {item.v}
                      </span>
                    </div>
                    <div
                      className={`p-2 bg-white rounded-xl shadow-sm ${item.c}`}
                    >
                      {item.i}
                    </div>
                  </div>
                ))}

                {product.sourcePdfs?.length > 0 && (
                  <div className="pt-6">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">
                      Documentatie
                    </h4>
                    <div className="space-y-2">
                      {product.sourcePdfs.map((pdf, i) => (
                        <a
                          key={i}
                          href={pdf.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:bg-blue-50 transition-all group shadow-sm"
                        >
                          <div className="flex items-center gap-2">
                            <FileText size={14} className="text-blue-500" />
                            <span className="text-[10px] font-bold uppercase truncate max-w-[200px]">
                              {pdf.name}
                            </span>
                          </div>
                          <ExternalLink
                            size={12}
                            className="text-slate-300 group-hover:text-blue-500"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CONTENT: MAATVOERING */}
          {activeTab === "maatvoering" && (
            <div className="space-y-10 animate-in fade-in duration-300">
              {loading ? (
                <div className="py-20 text-center flex flex-col items-center gap-4 text-slate-400">
                  <Loader2 className="animate-spin text-blue-500" size={32} />
                  <p className="text-[10px] font-black uppercase tracking-[0.2em]">
                    Matrix Sync...
                  </p>
                </div>
              ) : (
                <div className="space-y-12">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 text-left">
                    <div className="space-y-6">
                      <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] italic flex items-center gap-2 border-l-4 border-blue-500 pl-4">
                        <Package size={16} className="text-blue-500" /> Fitting
                        Afmetingen
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        {fittingSpecs.length > 0 ? (
                          fittingSpecs.map((spec) => (
                            <div
                              key={spec.label}
                              className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm"
                            >
                              <span className="text-[10px] font-black text-slate-400 uppercase">
                                {spec.label}
                              </span>
                              <span className="text-sm font-black text-slate-800">
                                {spec.value}{" "}
                                <small className="text-[9px] text-slate-300 ml-1 font-bold">
                                  {spec.label.toLowerCase().includes("weight")
                                    ? "kg"
                                    : "mm"}
                                </small>
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="col-span-2 p-6 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3">
                            <AlertCircle className="text-red-500" size={18} />
                            <p className="text-[10px] font-bold text-red-600 uppercase">
                              Geen fitting data beschikbaar.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-6">
                      <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] italic flex items-center gap-2 border-l-4 border-emerald-500 pl-4">
                        <Layers size={16} className="text-emerald-500" /> Mof &
                        Verbinding
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        {mofSpecs.length > 0 ? (
                          mofSpecs.map((spec) => (
                            <div
                              key={spec.label}
                              className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm"
                            >
                              <span className="text-[10px] font-black text-slate-400 uppercase">
                                {spec.label}
                              </span>
                              <span className="text-sm font-black text-slate-800">
                                {spec.value}{" "}
                                <small className="text-[9px] text-slate-300 ml-1 font-bold">
                                  mm
                                </small>
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="col-span-2 text-center text-[10px] text-slate-300 italic py-4">
                            Geen mof data
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* NIEUW: BORING SECTIE */}
                  {boreSpecs && (
                    <div className="pt-8 border-t border-slate-100">
                      <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] italic flex items-center gap-2 border-l-4 border-purple-500 pl-4 mb-6">
                        <CircleDot size={16} className="text-purple-500" />{" "}
                        Boring & Flens Data
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {Object.entries(boreSpecs)
                          .filter(
                            ([key]) => !excludedKeys.includes(key.toLowerCase())
                          )
                          .map(([key, value]) => (
                            <div
                              key={key}
                              className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm"
                            >
                              <span className="text-[10px] font-black text-slate-400 uppercase">
                                {key}
                              </span>
                              <span className="text-sm font-black text-slate-800">
                                {value}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* OVERIGE VELDEN */}
                  {extraSpecs.length > 0 && (
                    <div className="pt-8 border-t border-slate-100">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic mb-4">
                        Extra Database Velden
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {extraSpecs.map((s) => (
                          <div
                            key={s.label}
                            className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 flex justify-between items-center italic"
                          >
                            <span className="text-[9px] font-bold text-slate-400">
                              {s.label}
                            </span>
                            <span className="text-[10px] font-black text-slate-600">
                              {s.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-4 shrink-0">
          <button
            onClick={() =>
              generateProductPDF({ ...product, ...liveSpecs }, userRole)
            }
            disabled={loading || !liveSpecs}
            className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-3 disabled:opacity-50 active:scale-95 transition-all"
          >
            <Download size={18} /> PDF Download
          </button>
          <button
            onClick={onClose}
            className="bg-slate-900 text-white px-12 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailModal;
