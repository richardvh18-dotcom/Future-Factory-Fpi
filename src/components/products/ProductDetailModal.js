import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect } from "react";
import { X, Ruler, Package, Info, Loader2, Download, ExternalLink, Target, Settings, Zap, Hammer, FileText, ImageIcon, Layers, AlertCircle, CircleDot, // Icoon voor boringen
Tag, } from "lucide-react";
import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { db, storage, auth, logActivity } from "../../config/firebase";
import { generateProductPDF } from "../../utils/pdfGenerator";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { PATHS } from "../../config/dbPaths";
import { aiService } from "../../services/aiService";
import VerificationBadge from "../admin/VerificationBadge.tsx";
const getAppId = () => {
    if (typeof window !== "undefined" && window.__app_id)
        return window.__app_id;
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
    const [, setError] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const FITTING_ORDER = ["TW", "L", "Lo", "R", "Weight"];
    const MOF_ORDER = ["B1", "B2", "BA", "A", "TWcb", "BD", "W"];
    useEffect(() => {
        if (!product || !appId)
            return;
        const fetchLiveDimensions = async () => {
            setLoading(true);
            try {
                const connKey = product.connection?.split("/")[0]?.toUpperCase() || "CB";
                const pnStr = `PN${product.pressure || product.pn}`;
                const idStr = `ID${product.diameter || product.dn}`;
                const extraCodeSuffix = product.extraCode && product.extraCode !== "-"
                    ? `_${product.extraCode.toUpperCase()}`
                    : "";
                // ID Constructie (Match met ProductForm.jsx logic)
                const bellId = `${connKey}_${pnStr}_${idStr}${extraCodeSuffix}`;
                // Generieke Fitting ID: TYPE_[ANGLE_]CONN_PN_ID
                let fittingId = `${product.type.toUpperCase()}`;
                if (product.angle && product.angle !== "-") {
                    fittingId += `_${product.angle}`;
                }
                fittingId += `_${connKey}_${pnStr}_${idStr}${extraCodeSuffix}`;
                // Socket ID
                const socketId = `${product.type.toUpperCase()}_SOCKET_${connKey}_${pnStr}_${idStr}${extraCodeSuffix}`;
                // Bepaal paden
                let bellPath = null;
                if (connKey === "TB")
                    bellPath = PATHS.TB_DIMENSIONS;
                else if (connKey === "CB")
                    bellPath = PATHS.CB_DIMENSIONS;
                const promises = [];
                // 1. Bell Dimensions
                if (bellPath) {
                    promises.push(getDoc(doc(db, ...bellPath, bellId)).then(snap => snap.exists() ? snap.data() : {}));
                }
                else {
                    promises.push(Promise.resolve({}));
                }
                // 2. Fitting Specs
                if (PATHS.FITTING_SPECS) {
                    promises.push(getDoc(doc(db, ...PATHS.FITTING_SPECS, fittingId)).then(snap => snap.exists() ? snap.data() : {}));
                }
                else {
                    promises.push(Promise.resolve({}));
                }
                // 3. Socket Specs
                if (PATHS.SOCKET_SPECS) {
                    promises.push(getDoc(doc(db, ...PATHS.SOCKET_SPECS, socketId)).then(snap => snap.exists() ? snap.data() : {}));
                }
                else {
                    promises.push(Promise.resolve({}));
                }
                const [bellData, fitStandardData, fitSocketData] = await Promise.all(promises);
                let merged = {};
                merged = { ...merged, ...bellData, ...fitStandardData, ...fitSocketData };
                // NIEUW: Boringen apart ophalen en opslaan
                let boreData = null;
                if (product.drilling && product.drilling !== "-") {
                    const boreId = `${product.drilling.replace(/\s+/g, "_")}_${idStr}`.toUpperCase();
                    const boreSnap = await getDoc(doc(db, "artifacts", appId, "public", "data", "bore_dimensions", boreId));
                    if (boreSnap.exists()) {
                        boreData = boreSnap.data();
                        Object.assign(merged, boreData); // Ook in merged voor PDF/Totaaloverzicht
                    }
                }
                setBoreSpecs(boreData); // Zet de aparte bore state
                setLiveSpecs(merged);
            }
            catch (err) {
                console.error("Data-integratie mislukt:", err);
                setError("Fout bij ophalen technische data.");
            }
            finally {
                setLoading(false);
            }
        };
        fetchLiveDimensions();
    }, [product]);
    if (!product)
        return null;
    const getOrderedSpecs = (orderList) => {
        if (!liveSpecs)
            return [];
        const dbKeys = Object.keys(liveSpecs);
        return orderList
            .map((key) => {
            let value = liveSpecs[key];
            const lowerKey = key.toLowerCase();
            if (value === undefined || value === "") {
                if (lowerKey === "a")
                    value = liveSpecs["A1"] || liveSpecs["a1"];
                if (value === undefined) {
                    const fuzzyKey = dbKeys.find((dk) => dk.toLowerCase() === lowerKey);
                    if (fuzzyKey)
                        value = liveSpecs[fuzzyKey];
                }
            }
            if (value && typeof value === "object")
                return null;
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
            const isKnown = FITTING_ORDER.map((f) => f.toLowerCase()).includes(lk) ||
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
            }
            else if (v && typeof v === "object") {
                displayValue = "[Data Object]";
            }
            return { label: k, value: String(displayValue) };
        })
        : [];
    const TabButton = ({ id, label, icon: Icon }) => (_jsxs("button", { onClick: () => setActiveTab(id), className: `flex items-center gap-2 px-6 py-4 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all ${activeTab === id
            ? "border-blue-600 text-slate-900 bg-blue-50/30"
            : "border-transparent text-slate-400 hover:text-slate-600"}`, children: [_jsx(Icon, { size: 14 }), " ", label] }));
    return (_jsx("div", { className: "fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-4 lg:p-10 animate-in fade-in duration-300", children: _jsxs("div", { className: "bg-white w-full max-w-[90vw] rounded-[40px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[90vh] text-left", children: [_jsxs("div", { className: "p-8 border-b border-slate-100 flex justify-between items-center bg-white shrink-0", children: [_jsxs("div", { className: "text-left", children: [_jsx("h2", { className: "text-3xl font-black text-slate-900 tracking-tighter italic uppercase leading-none", children: product.name || product.productCode }), _jsxs("div", { className: "flex items-center gap-3 mt-2", children: [_jsx("p", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest", children: "Engineering Master Data V5.8" }), product.articleCode && (_jsxs("span", { className: "text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase", children: ["ERP: ", product.articleCode] })), product.label && product.label !== '-' && (_jsx("span", { className: "text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 uppercase", children: product.label })), (userRole === 'admin' || userRole === 'qc' || userRole === 'engineer') && (_jsxs("form", { style: { display: 'inline' }, children: [_jsxs("label", { className: "ml-4 bg-blue-100 text-blue-700 px-3 py-1 rounded-xl text-xs font-bold cursor-pointer hover:bg-blue-200 transition-all", children: ["PDF uploaden", _jsx("input", { type: "file", accept: "application/pdf", style: { display: 'none' }, disabled: uploading, onChange: async (e) => {
                                                                setUploadError(null);
                                                                const file = e.target.files[0];
                                                                if (!file)
                                                                    return;
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
                                                                    await logActivity(auth.currentUser?.uid, "PRODUCT_PDF_UPLOAD", `PDF toegevoegd aan product ${product.id}: ${file.name}`);
                                                                    // Trigger AI learning direct (optioneel: feedback)
                                                                    try {
                                                                        await aiService.learnFromPdfUrl(url, file.name);
                                                                    }
                                                                    catch (aiErr) {
                                                                        // AI mag falen zonder UI crash
                                                                        console.warn("AI learning error:", aiErr);
                                                                    }
                                                                    window.location.reload(); // Simpel: herlaad om nieuwe PDF te tonen
                                                                }
                                                                catch (err) {
                                                                    setUploadError("Uploaden mislukt: " + err.message);
                                                                }
                                                                finally {
                                                                    setUploading(false);
                                                                }
                                                            } })] }), uploading && _jsx("span", { className: "ml-2 text-xs text-blue-500", children: "Uploaden..." }), uploadError && _jsx("span", { className: "ml-2 text-xs text-red-500", children: uploadError })] }))] })] }), _jsx("button", { 
                            // AIService uitbreiden met learnFromPdfUrl
                            // (Plaats deze functie in aiService.js indien nog niet aanwezig)
                            // async learnFromPdfUrl(pdfUrl, fileName) {
                            //   // Download PDF, parse tekst, sla op in ai_documents
                            // }
                            onClick: onClose, className: "p-3 bg-slate-100 text-slate-400 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-all border-none", children: _jsx(X, { size: 24 }) })] }), _jsxs("div", { className: "flex px-8 bg-slate-50/50 border-b border-slate-100 shrink-0 overflow-x-auto no-scrollbar", children: [_jsx(TabButton, { id: "basis", label: "1. Basis Info", icon: Package }), _jsx(TabButton, { id: "maatvoering", label: "2. Maatvoering", icon: Ruler }), _jsx(TabButton, { id: "gereedschap", label: "3. Gereedschappen", icon: Hammer })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-8 lg:p-12 custom-scrollbar bg-white text-left", children: [activeTab === "basis" && (_jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 animate-in slide-in-from-left duration-300 text-left", children: [_jsx("div", { className: "lg:col-span-7", children: _jsx("div", { className: "relative aspect-video lg:aspect-square bg-slate-100 rounded-[48px] border-8 border-slate-50 flex items-center justify-center overflow-hidden shadow-inner", children: product.imageUrl ? (_jsx("img", { src: product.imageUrl, alt: product.name, className: "w-full h-full object-contain p-4" })) : (_jsxs("div", { className: "text-slate-300 text-center opacity-20", children: [_jsx(ImageIcon, { size: 120 }), _jsx("p", { className: "text-sm font-black uppercase mt-4", children: "Geen Beeld" })] })) }) }), _jsxs("div", { className: "lg:col-span-5 space-y-3", children: [_jsx("div", { className: "mb-4", children: _jsx(VerificationBadge, { status: product.verificationStatus, verifiedBy: product.verifiedBy }) }), _jsxs("h4", { className: "text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] italic mb-4 flex items-center gap-2", children: [_jsx(Info, { size: 14 }), " Kerngegevens"] }), [
                                            {
                                                l: "Diameter",
                                                v: `ID ${product.diameter || product.dn} mm`,
                                                i: _jsx(Target, { size: 18 }),
                                                c: "text-blue-600",
                                            },
                                            {
                                                l: "Druk",
                                                v: `PN ${product.pressure || product.pn}`,
                                                i: _jsx(Zap, { size: 18 }),
                                                c: "text-emerald-600",
                                            },
                                            {
                                                l: "Verbinding",
                                                v: product.connection,
                                                i: _jsx(Settings, { size: 18 }),
                                                c: "text-slate-600",
                                            },
                                            {
                                                l: "Label",
                                                v: product.label || "-",
                                                i: _jsx(Tag, { size: 18 }),
                                                c: "text-orange-600",
                                            },
                                            ...((product.type?.toLowerCase().includes("flange") || product.type?.toUpperCase().startsWith("FL")) ? [{
                                                    l: "Boring",
                                                    v: product.drilling || "N.v.t.",
                                                    i: _jsx(Layers, { size: 18 }),
                                                    c: "text-purple-600",
                                                }] : []),
                                        ].map((item, idx) => (_jsxs("div", { className: "bg-slate-50 p-4 rounded-[24px] border border-slate-100 shadow-sm flex items-center justify-between group hover:border-blue-200 transition-all", children: [_jsxs("div", { className: "flex flex-col text-left", children: [_jsx("span", { className: "text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5", children: item.l }), _jsx("span", { className: "text-lg font-black text-slate-900 tracking-tight", children: item.v })] }), _jsx("div", { className: `p-2 bg-white rounded-xl shadow-sm ${item.c}`, children: item.i })] }, idx))), product.sourcePdfs?.length > 0 && (_jsxs("div", { className: "pt-6", children: [_jsx("h4", { className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3", children: "Documentatie" }), _jsx("div", { className: "space-y-2", children: product.sourcePdfs.map((pdf, i) => {
                                                        // Support voor zowel string URLs als objecten {name, url}
                                                        const url = typeof pdf === 'string' ? pdf : pdf.url;
                                                        let name = typeof pdf === 'string' ? `PDF Document ${i + 1}` : pdf.name;
                                                        // Probeer bestandsnaam uit URL te halen als het een string is
                                                        if (typeof pdf === 'string' && pdf.includes('/o/')) {
                                                            try {
                                                                const path = pdf.split('/o/')[1].split('?')[0];
                                                                const decodedPath = decodeURIComponent(path);
                                                                const fileName = decodedPath.split('/').pop();
                                                                name = fileName.replace(/^\d+_/, ''); // Verwijder timestamp prefix
                                                            }
                                                            catch { /* fallback */ }
                                                        }
                                                        return (_jsxs("a", { href: url, target: "_blank", rel: "noopener noreferrer", className: "flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:bg-blue-50 transition-all group shadow-sm", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(FileText, { size: 14, className: "text-blue-500" }), _jsx("span", { className: "text-[10px] font-bold uppercase truncate max-w-[200px]", children: name })] }), _jsx(ExternalLink, { size: 12, className: "text-slate-300 group-hover:text-blue-500" })] }, i));
                                                    }) })] }))] })] })), activeTab === "maatvoering" && (_jsx("div", { className: "space-y-10 animate-in fade-in duration-300", children: loading ? (_jsxs("div", { className: "py-20 text-center flex flex-col items-center gap-4 text-slate-400", children: [_jsx(Loader2, { className: "animate-spin text-blue-500", size: 32 }), _jsx("p", { className: "text-[10px] font-black uppercase tracking-[0.2em]", children: "Matrix Sync..." })] })) : (_jsxs("div", { className: "space-y-12", children: [_jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-12 text-left", children: [_jsxs("div", { className: "space-y-6", children: [_jsxs("h4", { className: "text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] italic flex items-center gap-2 border-l-4 border-blue-500 pl-4", children: [_jsx(Package, { size: 16, className: "text-blue-500" }), " Fitting Afmetingen"] }), _jsx("div", { className: "grid grid-cols-2 gap-4", children: fittingSpecs.length > 0 ? (fittingSpecs.map((spec) => (_jsxs("div", { className: "bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm", children: [_jsx("span", { className: "text-[10px] font-black text-slate-400 uppercase", children: spec.label }), _jsxs("span", { className: "text-sm font-black text-slate-800", children: [spec.value, " ", _jsx("small", { className: "text-[9px] text-slate-300 ml-1 font-bold", children: spec.label.toLowerCase().includes("weight")
                                                                                ? "kg"
                                                                                : "mm" })] })] }, spec.label)))) : (_jsxs("div", { className: "col-span-2 p-6 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3", children: [_jsx(AlertCircle, { className: "text-red-500", size: 18 }), _jsx("p", { className: "text-[10px] font-bold text-red-600 uppercase", children: "Geen fitting data beschikbaar." })] })) })] }), _jsxs("div", { className: "space-y-6", children: [_jsxs("h4", { className: "text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] italic flex items-center gap-2 border-l-4 border-emerald-500 pl-4", children: [_jsx(Layers, { size: 16, className: "text-emerald-500" }), " Mof & Verbinding"] }), _jsx("div", { className: "grid grid-cols-2 gap-4", children: mofSpecs.length > 0 ? (mofSpecs.map((spec) => (_jsxs("div", { className: "bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm", children: [_jsx("span", { className: "text-[10px] font-black text-slate-400 uppercase", children: spec.label }), _jsxs("span", { className: "text-sm font-black text-slate-800", children: [spec.value, " ", _jsx("small", { className: "text-[9px] text-slate-300 ml-1 font-bold", children: "mm" })] })] }, spec.label)))) : (_jsx("p", { className: "col-span-2 text-center text-[10px] text-slate-300 italic py-4", children: "Geen mof data" })) })] })] }), boreSpecs && (_jsxs("div", { className: "pt-8 border-t border-slate-100", children: [_jsxs("h4", { className: "text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] italic flex items-center gap-2 border-l-4 border-purple-500 pl-4 mb-6", children: [_jsx(CircleDot, { size: 16, className: "text-purple-500" }), " ", "Boring & Flens Data"] }), _jsx("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-4", children: Object.entries(boreSpecs)
                                                    .filter(([key]) => !excludedKeys.includes(key.toLowerCase()))
                                                    .map(([key, value]) => (_jsxs("div", { className: "bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm", children: [_jsx("span", { className: "text-[10px] font-black text-slate-400 uppercase", children: key }), _jsx("span", { className: "text-sm font-black text-slate-800", children: value })] }, key))) })] })), extraSpecs.length > 0 && (_jsxs("div", { className: "pt-8 border-t border-slate-100", children: [_jsx("h4", { className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic mb-4", children: "Extra Database Velden" }), _jsx("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3", children: extraSpecs.map((s) => (_jsxs("div", { className: "bg-slate-50/50 p-3 rounded-xl border border-slate-100 flex justify-between items-center italic", children: [_jsx("span", { className: "text-[9px] font-bold text-slate-400", children: s.label }), _jsx("span", { className: "text-[10px] font-black text-slate-600", children: s.value })] }, s.label))) })] }))] })) }))] }), _jsxs("div", { className: "p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-4 shrink-0", children: [_jsxs("button", { onClick: () => generateProductPDF({ ...product, ...liveSpecs }, userRole), disabled: loading || !liveSpecs, className: "bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-3 disabled:opacity-50 active:scale-95 transition-all", children: [_jsx(Download, { size: 18 }), " PDF Download"] }), _jsx("button", { onClick: onClose, className: "bg-slate-900 text-white px-12 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all", children: "Sluiten" })] })] }) }));
};
export default ProductDetailModal;
