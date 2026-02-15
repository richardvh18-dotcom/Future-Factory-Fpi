import React, { useState, useEffect, useMemo } from "react";
import {
  Save,
  Loader2,
  Settings,
  Database,
  Zap,
  Ruler,
  Image as ImageIcon,
  BookOpen,
  FileText,
  CheckCircle2,
  ShieldCheck,
  Hash,
  Info,
  Search,
  Link,
  Folder,
  CornerUpLeft,
  X as XIcon,
} from "lucide-react";
import { db, storage } from "../../config/firebase";
import { doc, setDoc, serverTimestamp, getDoc, collection, query, where, getDocs, limit, deleteField } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, listAll } from "firebase/storage";
import { PATHS } from "../../config/dbPaths";
import { useSettingsData } from "../../hooks/useSettingsData";
import {
  ALL_PRODUCT_TYPES,
  CONNECTION_TYPES,
  TYPES_WITH_SECOND_DIAMETER,
  BELL_KEYS,
  VERIFICATION_STATUS,
} from "../../data/constants";

// Helper functies voor naamgeving en paden (buiten component om re-renders te voorkomen)
const getTypeAbbr = (t) => {
  const map = {
    "Elbow": "Elb",
    "Tee": "Tee",
    "Coupler": "Cpl",
    "Reducer": "Red",
    "Flange": "Flg",
    "EndCap": "Cap",
    "Socket": "Soc",
    "Nipple": "Nip"
  };
  return map[t] || (t ? t.substring(0, 3) : "");
};

const formatConnection = (c) => {
  if (!c) return "";
  const clean = c.replace(/[^a-zA-Z0-9]/g, "");
  // Als het 2 karakters zijn (bijv CB), verdubbelen naar CBCB
  if (clean.length === 2) return clean + clean;
  return clean;
};

const sanitizeFileName = (name) => {
  return name.replace(/[^a-zA-Z0-9.-]/g, "_");
};

/**
 * ProductForm V8.1 - Master Configurator
 * Bevat de volledige technische logica voor FPi GRE producten.
 * Slaat op in: /future-factory/production/products/
 */
const ProductForm = ({ initialData, onSubmit, onCancel, user }) => {
  const {
    loading: settingsLoading,
    productRange,
    generalConfig,
  } = useSettingsData(user);
  const [saving, setSaving] = useState(false);

  const productTypes = generalConfig?.product_names || ALL_PRODUCT_TYPES;
  const connectionTypes = generalConfig?.connections || CONNECTION_TYPES;
  const productLabels = generalConfig?.productLabels || [];

  // State voor het formulier
  const [formData, setFormData] = useState({
    name: "",
    displayId: "",
    type: "",
    label: "",
    connection: "",
    dn: "",
    dn2: "",
    pn: "",
    angle: "",
    radius: "",
    articleCode: "",
    extraCode: "",
    specs: {},
    bellSpecs: {},
    fittingSpecs: {},
    socketSpecs: {},
    imageUrl: "",
    sourcePdfs: [],
    imageFile: null, // for upload
    pdfFiles: [], // for upload
    verificationStatus: VERIFICATION_STATUS.PENDING,
  });

  // LN Search State
  const [lnSearchResults, setLnSearchResults] = useState([]);
  const [isSearchingLn, setIsSearchingLn] = useState(false);
  const [showLnResults, setShowLnResults] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [isAutoLinked, setIsAutoLinked] = useState(false);
  const [showStoragePicker, setShowStoragePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState(null); // 'image' or 'pdf'
  const [imagePreview, setImagePreview] = useState(null);

  // Cleanup preview URL om memory leaks te voorkomen
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  // Handle file input changes
  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFormData((prev) => ({ ...prev, imageFile: file }));
      setImagePreview(URL.createObjectURL(file));
    }
  };
  const handlePdfChange = (e) => {
    if (e.target.files) {
      setFormData((prev) => ({ ...prev, pdfFiles: Array.from(e.target.files) }));
    }
  };

  const handleStorageSelect = (url, name) => {
    if (pickerMode === 'image') {
        setFormData(prev => ({ ...prev, imageUrl: url, imageFile: null }));
        setImagePreview(null);
    } else if (pickerMode === 'pdf') {
        setFormData(prev => ({ ...prev, sourcePdfs: [...(prev.sourcePdfs || []), url] }));
    }
    setShowStoragePicker(false);
  };

  // 1. Initialisatie bij bewerken
  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({
        ...prev,
        ...initialData,
        angle: initialData.angle || "",
        radius: initialData.radius || "",
        specs: initialData.specs || {},
        bellSpecs: initialData.bellSpecs || {},
        fittingSpecs: initialData.fittingSpecs || {},
        socketSpecs: initialData.socketSpecs || {},
        sourcePdfs: initialData.sourcePdfs || [],
      }));
      if (initialData.articleCode) {
        setIsAutoLinked(true);
      }
    } else {
      setFormData({
        name: "",
        displayId: "",
        type: "",
        label: "",
        connection: "",
        dn: "",
        dn2: "",
        pn: "",
        angle: "",
        radius: "",
        articleCode: "",
        extraCode: "",
        specs: {},
        bellSpecs: {},
        fittingSpecs: {},
        socketSpecs: {},
        imageUrl: "",
        sourcePdfs: [],
        imageFile: null,
        pdfFiles: [],
        verificationStatus: VERIFICATION_STATUS.PENDING,
      });
      setIsAutoLinked(false);
    }
  }, [initialData]);

  // 2. Automatische Naamgeneratie (Technische Logica)
  useEffect(() => {
    if (!formData.type) {
      if (!initialData) {
        setFormData((prev) => ({ ...prev, name: "", displayId: "" }));
      }
      return;
    }

    const typeStr = getTypeAbbr(formData.type);
    const dnStr = formData.dn ? (formData.dn2 ? `${formData.dn}x${formData.dn2}` : formData.dn) : "";
    const radiusStr = formData.radius ? "R" + formData.radius.replace("D", "") : "";
    const angleVal = formData.angle || formData.specs?.alpha || formData.specs?.angle || "";
    const angleStr = angleVal ? `/${angleVal}` : "";
    const pnStr = formData.pn ? `PN${formData.pn}` : "";
    const connStr = formatConnection(formData.connection);

    // Constructie: Elb 400R1.5/45 PN20 CBCB
    let generatedName = `${typeStr} ${dnStr}${radiusStr}${angleStr}`;
    if (pnStr) generatedName += ` ${pnStr}`;
    if (connStr) generatedName += ` ${connStr}`;

    generatedName = generatedName.replace(/\s+/g, " ").trim();

    setFormData((prev) => ({
      ...prev,
      name: generatedName,
      displayId: prev.displayId && prev.displayId !== "" ? prev.displayId : generatedName,
    }));
  }, [formData.type, formData.dn, formData.dn2, formData.pn, formData.angle, formData.radius, formData.specs, formData.connection]);

  // 3. Matrix Validatie: Beschikbare PN's ophalen o.b.v. Verbinding
  const availablePNs = useMemo(() => {
    if (!formData.connection || !productRange) {
      return (generalConfig?.pns || []).sort((a, b) => a - b);
    }

    const connKey = formData.connection;
    const matrixData = productRange[connKey];

    if (matrixData) {
      const configuredPNs = Object.keys(matrixData)
        .filter((pn) => matrixData[pn] && matrixData[pn].length > 0)
        .map(Number);

      if (configuredPNs.length > 0) {
        return configuredPNs.sort((a, b) => a - b);
      }
    }

    return (generalConfig?.pns || []).sort((a, b) => a - b);
  }, [productRange, formData.connection, generalConfig]);

  // 4. Matrix Validatie: Beschikbare DN's ophalen o.b.v. Gekozen PN
  const availableDNs = useMemo(() => {
    if (!formData.connection || !productRange) {
      return (generalConfig?.diameters || []).sort((a, b) => a - b);
    }

    const connKey = formData.connection;
    const matrixData = productRange[connKey];

    if (!matrixData) {
      return (generalConfig?.diameters || []).sort((a, b) => a - b);
    }

    if (!formData.pn) {
      const allIds = new Set();
      Object.values(matrixData).forEach((ids) => {
        if (Array.isArray(ids)) ids.forEach((id) => allIds.add(id));
      });
      return Array.from(allIds).sort((a, b) => a - b);
    }

    const pnKey = String(formData.pn);
    const validIds = matrixData[pnKey];

    if (Array.isArray(validIds)) {
      return validIds.sort((a, b) => a - b);
    }

    return [];
  }, [productRange, formData.connection, formData.pn, generalConfig]);

  // 5. Auto-fetch Specs uit Matrix/Database
  useEffect(() => {
    const fetchSpecs = async () => {
      if (!formData.type || !formData.dn || !formData.pn || !formData.connection) return;

      const connKey = formData.connection.split("/")[0].toUpperCase();
      const pnStr = `PN${formData.pn}`;
      const idStr = `ID${formData.dn}`;
      const extraCodeSuffix = formData.extraCode && formData.extraCode !== "-" 
        ? `_${formData.extraCode.toUpperCase()}` 
        : "";

      // ID Constructie
      const bellId = `${connKey}_${pnStr}_${idStr}${extraCodeSuffix}`;
      
      // Generieke Fitting ID: TYPE_[ANGLE_]CONN_PN_ID
      let fittingId = `${formData.type.toUpperCase()}`;
      if (formData.angle) {
        fittingId += `_${formData.angle}`;
      }
      fittingId += `_${connKey}_${pnStr}_${idStr}${extraCodeSuffix}`;

      try {
        let newSpecs = {};
        let newBellSpecs = {};
        let newFittingSpecs = {};
        let newSocketSpecs = {};

        // 1. Haal Bell (Mof) maten op (Stream 1)
        let bellPath = null;
        if (connKey === "TB") bellPath = PATHS.TB_DIMENSIONS;
        else if (connKey === "CB") bellPath = PATHS.CB_DIMENSIONS;

        if (bellPath) {
          const bellDocRef = doc(db, ...bellPath, bellId);
          const bellSnap = await getDoc(bellDocRef);
          if (bellSnap.exists()) {
            newBellSpecs = bellSnap.data();
            newSpecs = { ...newSpecs, ...newBellSpecs };
          }
        }

        // 2. Haal Fitting maten op (Stream 2)
        if (PATHS.FITTING_SPECS) {
          const fittingDocRef = doc(db, ...PATHS.FITTING_SPECS, fittingId);
          const fittingSnap = await getDoc(fittingDocRef);
          if (fittingSnap.exists()) {
            newFittingSpecs = fittingSnap.data();
            newSpecs = { ...newSpecs, ...newFittingSpecs };
          }
        }

        // 3. Haal Socket maten op (Stream 3)
        // Generiek patroon voor alle fittings: TYPE_SOCKET_CONN_PN_ID
        if (PATHS.SOCKET_SPECS) {
          const socketId = `${formData.type.toUpperCase()}_SOCKET_${connKey}_${pnStr}_${idStr}${extraCodeSuffix}`;
          const socketDocRef = doc(db, ...PATHS.SOCKET_SPECS, socketId);
          const socketSnap = await getDoc(socketDocRef);
          if (socketSnap.exists()) {
            newSocketSpecs = socketSnap.data();
            newSpecs = { ...newSpecs, ...newSocketSpecs };
          }
        }

        // 4. Haal Flens maten op (Stream 4 - Flens)
        const isFlange = formData.type.toLowerCase().includes("flange") || formData.connection.toLowerCase().includes("flange");
        if (isFlange && PATHS.BORE_DIMENSIONS) {
          const q = query(
            collection(db, ...PATHS.BORE_DIMENSIONS), 
            where("diameter", "==", Number(formData.dn))
          );
          const boreSnaps = await getDocs(q);
          if (!boreSnaps.empty) {
            const boreData = boreSnaps.docs[0].data();
            newFittingSpecs = { ...newFittingSpecs, ...boreData };
            newSpecs = { ...newSpecs, ...newFittingSpecs };
          }
        }

        setFormData((prev) => ({
          ...prev,
          specs: newSpecs,
          bellSpecs: newBellSpecs,
          fittingSpecs: newFittingSpecs,
          socketSpecs: newSocketSpecs
        }));
      } catch (err) {
        console.error("Error fetching specs:", err);
      }
    };
    fetchSpecs();
  }, [formData.type, formData.dn, formData.pn, formData.connection, formData.angle, formData.extraCode]);

  // 5b. LN Code Search Effect (Live)
  useEffect(() => {
    const term = formData.articleCode;
    if (!term || term.length < 3 || !searchEnabled) {
      if (!term) setLnSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingLn(true);
      try {
        const upperTerm = term.trim().toUpperCase();
        
        const q1 = query(
          collection(db, ...PATHS.CONVERSION_MATRIX),
          where("manufacturedId", ">=", upperTerm),
          where("manufacturedId", "<=", upperTerm + "\uf8ff"),
          limit(20)
        );
        
        const q2 = query(
          collection(db, ...PATHS.CONVERSION_MATRIX),
          where("targetProductId", ">=", upperTerm),
          where("targetProductId", "<=", upperTerm + "\uf8ff"),
          limit(20)
        );
        
        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const resultsMap = new Map();
        snap1.docs.forEach(doc => resultsMap.set(doc.id, doc.data()));
        snap2.docs.forEach(doc => resultsMap.set(doc.id, doc.data()));
        
        const results = Array.from(resultsMap.values());
        setLnSearchResults(results);
        setShowLnResults(results.length > 0);
      } catch (error) {
        console.error("LN Search Error:", error);
      } finally {
        setIsSearchingLn(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.articleCode, searchEnabled]);

  // 5c. Auto-link Infor-LN Code based on configuration
  useEffect(() => {
    const autoLink = async () => {
      if (!formData.type || !formData.dn || !formData.pn) return;

      try {
        // Query Conversion Matrix by DN and PN
        // 1. Probeer als String (standaard)
        let q = query(
          collection(db, ...PATHS.CONVERSION_MATRIX),
          where("dn", "==", String(formData.dn)),
          where("pn", "==", String(formData.pn))
        );
        
        let snapshot = await getDocs(q);

        // 2. Fallback: Probeer als Number (als import numeriek was)
        if (snapshot.empty && !isNaN(formData.dn) && !isNaN(formData.pn)) {
           q = query(
            collection(db, ...PATHS.CONVERSION_MATRIX),
            where("dn", "==", Number(formData.dn)),
            where("pn", "==", Number(formData.pn))
          );
          snapshot = await getDocs(q);
        }

        if (snapshot.empty) return;

        const candidates = snapshot.docs.map(d => d.data());
        
        // Client-side filtering
        const formType = (formData.type || "").toLowerCase();
        const formEnds = (formData.connection || "").toLowerCase();
        const formSerie = (formData.extraCode || "").toLowerCase();
        const formAngle = formData.angle;
        const formRadius = formData.radius;

        const match = candidates.find(c => {
            // Type Match
            const cType = (c.type || "").toLowerCase();
            const cDesc = (c.description || "").toLowerCase();
            const cTarget = (c.targetProductId || "").toLowerCase();
            
            let typeMatch = false;
            if (formType.includes("elbow") || formType === "elb") {
                typeMatch = cType.includes("el") || cType.includes("elmo") || cDesc.includes("elbow");
            } else if (formType.includes("tee")) {
                typeMatch = cType.includes("te") || cDesc.includes("tee");
            } else {
                typeMatch = cType.includes(formType.substring(0, 3));
            }
            if (!typeMatch) return false;

            // Ends Match (if specified in form)
            if (formEnds && c.ends) {
                const cEnds = c.ends.toLowerCase();
                if (!cEnds.includes(formEnds.split('/')[0])) return false; 
            }

            // Serie Match (Extra Code)
            if (formSerie && formSerie !== "-" && c.serie) {
                const cSerie = c.serie.toLowerCase();
                if (!cSerie.includes(formSerie)) return false;
            }

            // Angle Match (New)
            if (formAngle && (formType.includes("elbow") || formType === "elb")) {
                const angleStr = String(formAngle);
                if (["90", "60", "45", "30", "15"].includes(angleStr)) {
                    const targetHasAngle = cTarget.includes(angleStr);
                    
                    // Fallback: Check Old Code (Manufactured ID) for known patterns
                    let oldCodeHasAngle = false;
                    const mId = (c.manufacturedId || "").toUpperCase();
                    if (angleStr === "90" && mId.startsWith("EL9")) oldCodeHasAngle = true;
                    if (angleStr === "45" && mId.startsWith("EL4")) oldCodeHasAngle = true;
                    if (angleStr === "30" && mId.startsWith("EL3")) oldCodeHasAngle = true;

                    if (!targetHasAngle && !oldCodeHasAngle) return false;
                }
            }

            // Radius Match
            if (formRadius && (formType.includes("elbow") || formType === "elb")) {
                 if (formRadius === "1.5D") {
                     if (cDesc.includes("1.0d") || cDesc.includes("short") || cDesc.includes("sr")) return false;
                 } else if (formRadius === "1.0D") {
                     if (!cDesc.includes("1.0d") && !cDesc.includes("short") && !cDesc.includes("sr")) return false;
                 }
            }

            return true;
        });

        if (match && (match.targetProductId || match.manufacturedId)) {
            setIsAutoLinked(true);
            setFormData(prev => {
                const codeToUse = match.targetProductId || match.manufacturedId;
                if (prev.articleCode !== codeToUse) {
                    return { ...prev, articleCode: codeToUse };
                }
                return prev;
            });
        }
      } catch (err) {
        console.error("Auto-link error:", err);
      }
    };

    const timer = setTimeout(autoLink, 800);
    return () => clearTimeout(timer);
  }, [formData.type, formData.dn, formData.pn, formData.connection, formData.angle, formData.extraCode, formData.radius]);

  // 6. Opslaan naar Root
  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.dn || !formData.pn) {
      alert("Vul tenminste Naam, DN en PN in.");
      return;
    }

    setSaving(true);
    try {
      const productId =
        initialData?.id ||
        `${formData.type}_ID${formData.dn}_${Date.now()}`.replace(
          /[^a-zA-Z0-9]/g,
          "_"
        );
      const productRef = doc(db, ...PATHS.PRODUCTS, productId);

      // Bepaal opslagpad en metadata voor bibliotheek structuur
      const getStorageInfo = () => {
        const typeFolder = (formData.type || "Other").replace(/\s+/g, "_");
        const angleSuffix = formData.angle ? `_${formData.angle}` : "";
        const connFolder = (formData.connection || "None").replace(/\//g, "-");
        
        // Label voor hergebruik (metadata)
        const label = `${getTypeAbbr(formData.type)} ${formData.angle || ""} ${formatConnection(formData.connection)}`.trim();

        return {
            basePath: `product_library/${typeFolder}${angleSuffix}/${connFolder}`,
            metadata: {
                customMetadata: {
                    productType: formData.type,
                    connection: formData.connection,
                    angle: formData.angle || "",
                    label: label,
                    uploadedBy: user?.email || "system"
                }
            }
        };
      };

      const storageInfo = getStorageInfo();
      
      // Helper voor storage path voor picker
      const getStoragePath = () => {
        // Gebruik dezelfde logica als bij uploaden om de juiste map te openen
        return storageInfo.basePath;
      };


      // Upload image if present
      let imageUrl = formData.imageUrl;
      if (formData.imageFile) {
        const fileName = `${Date.now()}_${sanitizeFileName(formData.imageFile.name)}`;
        const imgRef = ref(storage, `${storageInfo.basePath}/images/${fileName}`);
        await uploadBytes(imgRef, formData.imageFile, storageInfo.metadata);
        imageUrl = await getDownloadURL(imgRef);
      }

      // Upload PDFs if present
      let pdfUrls = formData.sourcePdfs || [];
      if (formData.pdfFiles && formData.pdfFiles.length > 0) {
        pdfUrls = [];
        for (let i = 0; i < formData.pdfFiles.length; i++) {
          const pdfFile = formData.pdfFiles[i];
          const fileName = `${Date.now()}_${sanitizeFileName(pdfFile.name)}`;
          const pdfRef = ref(storage, `${storageInfo.basePath}/pdfs/${fileName}`);
          await uploadBytes(pdfRef, pdfFile, storageInfo.metadata);
          const url = await getDownloadURL(pdfRef);
          pdfUrls.push(url);
        }
      }

      // Bepaal verificatie status (Admins kunnen direct valideren)
      const isSystemAdmin = user?.role === "admin";
      const finalStatus = isSystemAdmin
        ? VERIFICATION_STATUS.VERIFIED
        : VERIFICATION_STATUS.PENDING;

      // Filter out spec fields and temporary file objects before saving
      // We want to store ONLY identification and system links, specs should be live fetched.
      // eslint-disable-next-line no-unused-vars
      const { 
        specs, 
        bellSpecs, 
        fittingSpecs, 
        socketSpecs, 
        imageFile, 
        pdfFiles, 
        ...cleanFormData 
      } = formData;

      await setDoc(
        productRef,
        {
          ...cleanFormData,
          // Backward compatibility: Save diameter/pressure aliases for Catalog views
          diameter: cleanFormData.dn,
          pressure: cleanFormData.pn,

          // Explicitly remove spec fields from DB to ensure live fetching
          specs: deleteField(),
          bellSpecs: deleteField(),
          fittingSpecs: deleteField(),
          socketSpecs: deleteField(),
          imageUrl,
          sourcePdfs: pdfUrls,
          id: productId,
          lastUpdated: serverTimestamp(),
          lastModifiedBy: user?.uid || "system",
          verificationStatus: initialData
            ? VERIFICATION_STATUS.PENDING
            : finalStatus,
          active: true,
        },
        { merge: true }
      );

      if (onSubmit) onSubmit();
    } catch (err) {
      console.error("Save failed:", err);
      alert("Fout bij opslaan: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Helper voor het sorteren van specificaties
  const sortSpecs = (specs, order) => {
    return Object.entries(specs)
      .filter(([key, value]) => !['id', 'lastUpdated', 'updatedBy', 'type', 'diameter', 'pressure', 'dn', 'pn', 'sourceNode', 'articleCode'].includes(key) && typeof value !== 'object')
      .sort(([keyA], [keyB]) => {
        const idxA = order.indexOf(keyA);
        const idxB = order.indexOf(keyB);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return keyA.localeCompare(keyB);
      });
  };

  const SOCKET_ORDER = ['B1', 'B2', 'BA', 'A1', 'Twcb', 'BD', 'W'];
  const FITTING_ORDER = ['TW', 'L', 'Lo', 'R', 'Weight'];

  if (settingsLoading)
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          Configurator initialiseren...
        </p>
      </div>
    );

  return (
    <div className="flex flex-col h-full bg-slate-50 text-left overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-6">
          <div className="p-4 bg-blue-600 text-white rounded-3xl shadow-xl shadow-blue-100">
            <Settings size={28} />
          </div>
          <div className="text-left">
            <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
              Product <span className="text-blue-600">Architect</span>
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
              <Database size={12} className="text-emerald-500" /> Root Sync: /
              {PATHS.PRODUCTS.join("/")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={onCancel}
            className="px-6 py-3 text-slate-400 hover:text-slate-600 font-black uppercase text-[10px] tracking-widest transition-all"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all flex items-center gap-3 disabled:opacity-50 active:scale-95"
          >
            {saving ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Save size={18} />
            )}
            Publiceren naar Hub
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-4 pb-32">
          {/* LINKER KOLOM: BASIS CONFIGURATIE */}
          <div className="lg:col-span-7 space-y-4">
            {/* Sectie: Identiteit */}
            <div className="bg-white p-6 rounded-[45px] border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3 italic">
                <BookOpen size={16} className="text-blue-500" /> Basis
                Identificatie
              </h3>

              <div className="space-y-6">

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                    Productie Extra Code
                  </label>
                  <select
                    className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer"
                    value={formData.extraCode}
                    onChange={(e) =>
                      setFormData({ ...formData, extraCode: e.target.value })
                    }
                  >
                    <option value="">- Selecteer Code -</option>
                    <option value="-">Geen Code</option>
                    {(generalConfig?.codes || []).map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                      Product Type
                    </label>
                    <select
                      className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer"
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({ ...formData, type: e.target.value })
                      }
                    >
                      <option value="">- Selecteer Type -</option>
                      {productTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                      Verbinding
                    </label>
                    <select
                      className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer"
                      value={formData.connection}
                      onChange={(e) =>
                        setFormData({ ...formData, connection: e.target.value })
                      }
                    >
                      <option value="">- Selecteer -</option>
                      {connectionTypes.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Conditional Fields for Elbow */}
                {formData.type?.toLowerCase().includes("elbow") && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Graden (Hoek)</label>
                      <select 
                        className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500" 
                        value={formData.angle} 
                        onChange={e => {
                          const newAngle = e.target.value;
                          const newRadius = newAngle !== "90" ? "1.5D" : formData.radius;
                          setFormData({...formData, angle: newAngle, radius: newRadius});
                        }}
                      >
                        <option value="">- Kies Hoek -</option>
                        {(generalConfig?.angles || ["11.25", "22.5", "30", "45", "60", "90"]).map(a => <option key={a} value={a}>{a}°</option>)}
                      </select>
                    </div>
                    {formData.angle === "90" && (
                      <div className="space-y-2 animate-in slide-in-from-left-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Radius</label>
                        <select className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500" value={formData.radius} onChange={e => setFormData({...formData, radius: e.target.value})}>
                          <option value="">- Kies Radius -</option>
                          <option value="1.0D">1.0D</option>
                          <option value="1.5D">1.5D</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                      Artikelgroep / Label
                    </label>
                    <select
                      className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer"
                      value={formData.label}
                      onChange={(e) =>
                        setFormData({ ...formData, label: e.target.value })
                      }
                    >
                      <option value="">- Selecteer -</option>
                      {productLabels.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
            </div>

            {/* Sectie: Matrix Validatie (DN/PN) */}
            <div className="bg-white p-6 rounded-[45px] border border-slate-200 shadow-sm space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
                <Zap size={120} />
              </div>
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3 italic relative z-10">
                <Ruler size={16} className="text-blue-500" /> Technische Matrix
              </h3>

              <div className="relative z-10">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                      Drukklasse (PN)
                    </label>
                    <select
                      className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer"
                      value={formData.pn}
                      onChange={(e) =>
                        setFormData({ ...formData, pn: e.target.value, dn: "" })
                      }
                    >
                      <option value="">- Kies PN -</option>
                      {availablePNs.map((pn) => (
                        <option key={pn} value={pn}>
                          PN {pn}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                      Binnendiameter (ID)
                    </label>
                    <select
                      className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-black italic outline-none focus:border-blue-500 transition-all text-blue-600"
                      value={formData.dn}
                      onChange={(e) =>
                        setFormData({ ...formData, dn: e.target.value })
                      }
                    >
                      <option value="">- Kies ID -</option>
                      {availableDNs.map((dn) => (
                        <option key={dn} value={dn}>
                          ID {dn} mm
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Live Specs Preview */}
                {(Object.keys(formData.fittingSpecs || {}).length > 0 || Object.keys(formData.bellSpecs || {}).length > 0 || Object.keys(formData.socketSpecs || {}).length > 0) && (
                  <div className="mt-6 pt-6 border-t border-slate-100 animate-in slide-in-from-top-2">
                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Info size={12} /> Gevonden Specificaties
                    </h4>
                    
                    <div className="space-y-4">
                      {/* Socket Maten Group */}
                      {(Object.keys(formData.bellSpecs || {}).length > 0 || Object.keys(formData.socketSpecs || {}).length > 0) && (
                        <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                           <h5 className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-2 ml-1">Socket Maten</h5>
                           <div className="grid grid-cols-3 gap-3">
                             {sortSpecs({...formData.bellSpecs, ...formData.socketSpecs}, SOCKET_ORDER)
                               .map(([key, value]) => (
                                 <div key={key} className="bg-white p-2 rounded-xl border border-slate-100 flex flex-col shadow-sm">
                                   <span className="text-[7px] font-black text-slate-400 uppercase mb-0.5">{key}</span>
                                   <span className="text-xs font-bold text-slate-700 truncate" title={value}>{value}</span>
                                 </div>
                               ))}
                           </div>
                        </div>
                      )}

                      {/* Fitting Maten Group */}
                      {Object.keys(formData.fittingSpecs || {}).length > 0 && (
                        <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                           <h5 className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-2 ml-1">Fitting Maten</h5>
                           <div className="grid grid-cols-3 gap-3">
                             {sortSpecs(formData.fittingSpecs, FITTING_ORDER)
                               .map(([key, value]) => (
                                 <div key={key} className="bg-white p-2 rounded-xl border border-slate-100 flex flex-col shadow-sm">
                                   <span className="text-[7px] font-black text-slate-400 uppercase mb-0.5">{key}</span>
                                   <span className="text-xs font-bold text-slate-700 truncate" title={value}>{value}</span>
                                 </div>
                               ))}
                           </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RECHTER KOLOM: SPECIFICATIES & MEDIA */}
          <div className="lg:col-span-5 space-y-4">
            {/* Sectie: Artikelcodes */}
            <div className="bg-slate-900 p-6 rounded-[40px] shadow-2xl text-white space-y-4">
              <h3 className="text-[10px] font-black uppercase text-blue-400 tracking-[0.2em] flex items-center gap-3 italic">
                <Hash size={16} /> Systeem Koppeling
              </h3>
              <div className="space-y-4">
                <div className="space-y-1.5 text-left">
                  <label className="text-[8px] font-black text-slate-500 uppercase ml-2">
                    Gegenereerde Systeemnaam
                  </label>
                  <input
                    readOnly
                    className="w-full p-4 bg-white/5 border border-white/10 rounded-xl font-black text-lg text-white italic tracking-tighter outline-none"
                    value={formData.name}
                  />
                </div>
                <div className="space-y-1.5 text-left relative">
                  <label className="text-[8px] font-black text-slate-500 uppercase ml-2">
                    Infor-LN Artikelcode (Manufactured Item)
                  </label>
                  <div className="relative">
                    <input
                      className={`w-full p-4 pr-20 bg-white/5 border rounded-xl font-mono text-xs font-bold text-white focus:border-blue-500 outline-none transition-all ${isAutoLinked ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'border-white/10'}`}
                      value={formData.articleCode}
                      onChange={(e) => {
                        setFormData({ ...formData, articleCode: e.target.value });
                        setIsAutoLinked(false);
                        setSearchEnabled(true);
                        setShowLnResults(false);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && setSearchEnabled(true)}
                      placeholder="Zoek op LN Code of Tekening..."
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {isAutoLinked && (
                        <div className="text-emerald-400 bg-emerald-400/10 p-1.5 rounded-lg animate-in zoom-in" title="Automatisch gekoppeld aan configuratie">
                          <Link size={14} />
                        </div>
                      )}
                      <button 
                        onClick={() => setSearchEnabled(true)}
                        className="p-2 text-slate-400 hover:text-white transition-colors"
                        type="button"
                      >
                        {isSearchingLn ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Search Results Dropdown */}
                  {showLnResults && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                      {lnSearchResults.length > 0 ? (
                        lnSearchResults.map((res, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, articleCode: res.targetProductId || res.manufacturedId }));
                              setIsAutoLinked(true);
                              setSearchEnabled(false);
                              setShowLnResults(false);
                            }}
                            className="w-full p-3 text-left hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-0 flex flex-col"
                          >
                            <span className="text-xs font-bold text-white font-mono">{res.manufacturedId}</span>
                            <span className="text-[10px] text-slate-400 truncate">{res.description || "Geen beschrijving"}</span>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-center">
                           <span className="text-xs text-slate-400">Geen resultaten gevonden</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sectie: Media Upload */}
            <div className="bg-white p-6 rounded-[40px] border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3 italic">
                <ImageIcon size={16} className="text-blue-500" /> Afbeelding & PDF Upload
              </h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">Productafbeelding (JPG/PNG)</label>
                  <div className="flex gap-3">
                    <label className="flex-1 flex flex-col items-center justify-center h-32 border-2 border-slate-100 border-dashed rounded-2xl cursor-pointer bg-slate-50/50 hover:bg-blue-50 hover:border-blue-200 transition-all group">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <ImageIcon className="w-8 h-8 text-slate-300 group-hover:text-blue-500 mb-2 transition-colors" />
                          <p className="text-[10px] font-bold text-slate-400 group-hover:text-blue-600 uppercase tracking-widest">
                              {formData.imageFile ? formData.imageFile.name : "Klik om te uploaden"}
                          </p>
                      </div>
                      <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                    </label>
                    <button
                      type="button"
                      onClick={() => { setPickerMode('image'); setShowStoragePicker(true); }}
                      className="w-32 h-32 flex flex-col items-center justify-center bg-white border-2 border-slate-100 rounded-2xl hover:border-blue-500 hover:text-blue-600 text-slate-400 transition-all shadow-sm active:scale-95"
                    >
                      <Folder size={24} className="mb-2" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Bibliotheek</span>
                    </button>
                  </div>
                  
                  {(imagePreview || (formData.imageUrl && !formData.imageFile)) && (
                    <div className="mt-4 p-2 bg-slate-50 rounded-2xl border border-slate-100 w-fit relative">
                        <img 
                          src={imagePreview || formData.imageUrl} 
                          alt="Product Preview" 
                          className="h-32 rounded-xl object-contain bg-white shadow-sm border border-slate-100" 
                        />
                        {imagePreview && (
                           <div className="absolute bottom-2 right-2 bg-blue-600/80 text-white text-[9px] font-bold px-2 py-1 rounded-lg backdrop-blur-sm">
                              Nieuw
                           </div>
                        )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">Technische PDF(s)</label>
                  <div className="flex gap-3">
                    <label className="flex-1 flex flex-col items-center justify-center h-32 border-2 border-slate-100 border-dashed rounded-2xl cursor-pointer bg-slate-50/50 hover:bg-blue-50 hover:border-blue-200 transition-all group">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <FileText className="w-8 h-8 text-slate-300 group-hover:text-blue-500 mb-2 transition-colors" />
                          <p className="text-[10px] font-bold text-slate-400 group-hover:text-blue-600 uppercase tracking-widest">
                              {formData.pdfFiles && formData.pdfFiles.length > 0 
                                  ? `${formData.pdfFiles.length} bestand(en) geselecteerd` 
                                  : "Klik om PDF's te uploaden"}
                          </p>
                      </div>
                      <input type="file" accept="application/pdf" multiple onChange={handlePdfChange} className="hidden" />
                    </label>
                    <button
                      type="button"
                      onClick={() => { setPickerMode('pdf'); setShowStoragePicker(true); }}
                      className="w-32 h-32 flex flex-col items-center justify-center bg-white border-2 border-slate-100 rounded-2xl hover:border-blue-500 hover:text-blue-600 text-slate-400 transition-all shadow-sm active:scale-95"
                    >
                      <Folder size={24} className="mb-2" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Bibliotheek</span>
                    </button>
                  </div>

                  {formData.pdfFiles && formData.pdfFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {formData.pdfFiles.map((f, i) => (
                        <span key={i} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold border border-blue-100 flex items-center gap-2">
                            <CheckCircle2 size={10} /> {f.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {formData.sourcePdfs && formData.sourcePdfs.length > 0 && !formData.pdfFiles.length && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {formData.sourcePdfs.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center gap-2">
                            <FileText size={12} /> PDF {i+1}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[35px] border border-slate-200 shadow-sm flex flex-col justify-center gap-4">
              <div className="flex items-center gap-3">
                <ShieldCheck size={18} className="text-emerald-500" />
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">
                  Master Data Selection
                </span>
              </div>
              <p className="text-[10px] font-medium text-slate-400 leading-relaxed italic">
                Selecteer de gewenste drukklasse en diameter uit de globale bibliotheek.
                Deze waarden worden gebruikt voor de technische specificaties.
              </p>
            </div>

            {/* Informatieve Voetnoot */}
            <div className="p-8 bg-blue-50 rounded-[35px] border border-blue-100 flex items-start gap-4">
              <Info size={20} className="text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[10px] font-bold text-blue-700/70 leading-relaxed uppercase tracking-wider italic">
                Nieuwe of gewijzigde producten krijgen automatisch de status{" "}
                <span className="text-orange-600 font-black">'PENDING'</span>.
                Ze moeten door een tweede geautoriseerde gebruiker worden
                geverifieerd voordat ze definitief worden vrijgegeven voor
                productie.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Storage Picker Modal */}
      {showStoragePicker && (
        <StoragePicker 
            onClose={() => setShowStoragePicker(false)} 
            onSelect={handleStorageSelect}
            initialPath={`product_library/${(formData.type || "Other").replace(/\s+/g, "_")}${formData.angle ? `_${formData.angle}` : ""}/${(formData.connection || "None").replace(/\//g, "-")}`}
        />
      )}
    </div>
  );
};

/**
 * Interne X icon component voor de modal
 */
const X = ({ size, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const StoragePicker = ({ onClose, onSelect, initialPath = "product_library" }) => {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchItems = async () => {
      setLoading(true);
      try {
        // Fallback naar root als path leeg is of error geeft
        const path = currentPath || "product_library";
        const storageRef = ref(storage, path);
        const res = await listAll(storageRef);
        
        const folders = res.prefixes.map(p => ({
          name: p.name,
          fullPath: p.fullPath,
          isFolder: true
        }));
        
        const files = await Promise.all(res.items.map(async i => {
          const url = await getDownloadURL(i);
          return {
            name: i.name,
            fullPath: i.fullPath,
            url,
            isFolder: false
          };
        }));
        
        setItems([...folders, ...files]);
      } catch (error) {
        console.error("Error listing files", error);
        // Als pad niet bestaat, probeer root
        if (currentPath !== "product_library") {
            setCurrentPath("product_library");
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchItems();
  }, [currentPath]);

  const handleNavigate = (folderPath) => {
    setCurrentPath(folderPath);
  };

  const handleUp = () => {
    const parts = currentPath.split('/');
    if (parts.length > 0) {
      parts.pop();
      setCurrentPath(parts.join('/') || "product_library");
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
        <div className="bg-white w-full max-w-3xl rounded-[30px] shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                        <Folder size={20} />
                    </div>
                    <div>
                        <h3 className="font-black text-slate-800 uppercase text-sm tracking-wide">Bibliotheek</h3>
                        <p className="text-[10px] text-slate-400 font-mono">/{currentPath}</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><XIcon size={20} /></button>
            </div>
            
            <div className="p-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <button 
                    onClick={handleUp} 
                    disabled={!currentPath || currentPath === "product_library"} 
                    className="p-2 hover:bg-white rounded-lg disabled:opacity-30 transition-all text-slate-600"
                    title="Omhoog"
                >
                    <CornerUpLeft size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
                {loading ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div>
                ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                        {items.map((item) => (
                            <button 
                                key={item.fullPath}
                                onClick={() => item.isFolder ? handleNavigate(item.fullPath) : onSelect(item.url, item.name)}
                                className="flex flex-col items-center p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-400 hover:shadow-md transition-all group text-center h-32 justify-center"
                            >
                                {item.isFolder ? (
                                    <Folder size={32} className="text-blue-300 group-hover:text-blue-500 mb-2 transition-colors" />
                                ) : (
                                    <FileText size={32} className="text-slate-300 group-hover:text-slate-500 mb-2 transition-colors" />
                                )}
                                <span className="text-[10px] font-bold text-slate-600 group-hover:text-slate-900 line-clamp-2 leading-tight break-all">
                                    {item.name}
                                </span>
                            </button>
                        ))}
                        {items.length === 0 && (
                            <div className="col-span-full text-center py-10 text-slate-400 italic text-xs">
                                Geen bestanden gevonden in deze map.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default ProductForm;
