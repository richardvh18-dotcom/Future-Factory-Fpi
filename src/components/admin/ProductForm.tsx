/* eslint-disable */
import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
import { db, storage, logActivity } from "../../config/firebase";
import { doc, serverTimestamp, getDoc, collection, query, where, getDocs, limit, addDoc } from "firebase/firestore";
import { saveProductRecord } from "../../services/planningSecurityService";
import { ref, uploadBytes, getDownloadURL, listAll } from "firebase/storage";
import { PATHS, getPathString } from "../../config/dbPaths";
import { useSettingsData } from "../../hooks/useSettingsData";
import {
  ALL_PRODUCT_TYPES,
  CONNECTION_TYPES,
  VERIFICATION_STATUS,
} from "../../data/constants";
import { useNotifications } from '../../contexts/NotificationContext';
import { useFormPersistence } from "../../hooks/useFormPersistence";

type ProductSpecMap = Record<string, unknown>;

type ProductFormState = {
  name: string;
  displayId: string;
  type: string;
  label: string;
  connection: string;
  dn: string;
  dn2: string;
  pn: string;
  angle: string;
  radius: string;
  articleCode: string;
  extraCode: string;
  specs: ProductSpecMap;
  bellSpecs: ProductSpecMap;
  fittingSpecs: ProductSpecMap;
  socketSpecs: ProductSpecMap;
  imageUrl: string;
  sourcePdfs: string[];
  imageFile: File | null;
  pdfFiles: File[];
  verificationStatus: string;
  assignedVerifier: string;
};

type ProductCandidate = {
  id?: string;
  targetProductId?: string;
  manufacturedId?: string;
  description?: string;
  type?: string;
  ends?: string;
  serie?: string;
  [key: string]: unknown;
};

type Verifier = {
  id: string;
  email?: string;
  name?: string;
  displayName?: string;
  [key: string]: unknown;
};

type ProductFormProps = {
  initialData?: any;
  onSubmit?: () => void;
  onCancel?: () => void;
  user?: any;
};

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message?: unknown }).message || "onbekende fout");
  }
  return String(err || "onbekende fout");
};

const getErrorCode = (err: unknown): string => {
  if (typeof err === "object" && err !== null && "code" in err) {
    return String((err as { code?: unknown }).code || "");
  }
  return "";
};

// Helper functies voor naamgeving en paden (buiten component om re-renders te voorkomen)
const getTypeAbbr = (t: string): string => {
  const map: Record<string, string> = {
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

const normalizeProductType = (value: unknown): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const normalized = raw.toLowerCase();
  const aliasMap: Record<string, string> = {
    elbow: "Elbow",
    elb: "Elbow",
    tee: "Tee",
    "t-equal": "T-Equal",
    "tequal": "T-Equal",
    "t-unequal": "T-Unequal",
    "tunequal": "T-Unequal",
    "y-piece": "Y-Piece",
    ypiece: "Y-Piece",
    coupler: "Coupler",
    cpl: "Coupler",
    reducer: "Reducer",
    flange: "Flange",
    endcap: "EndCap",
    "end cap": "EndCap",
    socket: "Socket",
    nipple: "Nipple",
    adaptor: "Adaptor",
    adapter: "Adaptor",
  };

  return aliasMap[normalized] || raw;
};

const buildGeneratedProductName = (productData: Partial<ProductFormState>): string => {
  const normalizedType = normalizeProductType(productData?.type);
  const typeStr = getTypeAbbr(normalizedType);
  const dnStr = productData?.dn
    ? (productData?.dn2 ? `${productData.dn}x${productData.dn2}` : productData.dn)
    : "";
  const radiusStr = productData?.radius ? `R${String(productData.radius).replace("D", "")}` : "";
  const angleVal = productData?.angle || productData?.specs?.alpha || productData?.specs?.angle || "";
  const angleStr = angleVal ? `/${angleVal}` : "";
  const pnStr = productData?.pn ? `PN${productData.pn}` : "";
  const connStr = formatConnection(productData?.connection);

  let generatedName = `${typeStr} ${dnStr}${radiusStr}${angleStr}`;
  if (pnStr) generatedName += ` ${pnStr}`;
  if (connStr) generatedName += ` ${connStr}`;

  return generatedName.replace(/\s+/g, " ").trim();
};

const formatConnection = (c?: string): string => {
  if (!c) return "";
  const clean = c.replace(/[^a-zA-Z0-9]/g, "");
  // Als het 2 karakters zijn (bijv CB), verdubbelen naar CBCB
  if (clean.length === 2) return clean + clean;
  return clean;
};

const sanitizeFileName = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9.-]/g, "_");
};

/**
 * ProductForm V8.1 - Master Configurator
 * Bevat de volledige technische logica voor FPi GRE producten.
 * Slaat op in: /future-factory/production/products/
 */
const ProductForm = ({ initialData, onSubmit, onCancel, user }: ProductFormProps) => {
  const { t } = useTranslation();
  const {
    loading: settingsLoading,
    productRange,
    generalConfig,
  } = useSettingsData(user as any);
  const { notify } = useNotifications();
  const [saving, setSaving] = useState(false);
  const isAdminUser = String(user?.role || "").toLowerCase() === "admin";

  const productTypes: string[] = Array.isArray(generalConfig?.product_names) ? (generalConfig.product_names as string[]) : ALL_PRODUCT_TYPES;
  const connectionTypes: string[] = Array.isArray(generalConfig?.connections) ? (generalConfig.connections as string[]) : CONNECTION_TYPES;
  const productLabels: string[] = Array.isArray(generalConfig?.productLabels) ? (generalConfig.productLabels as string[]) : [];
  const configCodes: string[] = Array.isArray(generalConfig?.codes) ? (generalConfig.codes as string[]) : [];
  const configAngles: string[] = Array.isArray(generalConfig?.angles) ? (generalConfig.angles as string[]) : ["11.25", "22.5", "30", "45", "60", "90"];
  const configPns: number[] = Array.isArray(generalConfig?.pns) ? (generalConfig.pns as number[]) : [];
  const configDiameters: number[] = Array.isArray(generalConfig?.diameters) ? (generalConfig.diameters as number[]) : [];

  // State voor het formulier
  const [formData, setFormData, clearPersistedProductForm] = useFormPersistence<ProductFormState>("admin_product_form", {
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
    assignedVerifier: "",
  });
  const [adminOverride4Eyes, setAdminOverride4Eyes] = useState(false);
  const normalizedFormType = normalizeProductType(formData.type);
  const generatedProductName = buildGeneratedProductName({ ...formData, type: normalizedFormType });

  // LN Search State
  const [lnSearchResults, setLnSearchResults] = useState<ProductCandidate[]>([]);
  const [isSearchingLn, setIsSearchingLn] = useState(false);
  const [showLnResults, setShowLnResults] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [isAutoLinked, setIsAutoLinked] = useState(false);
  const [showStoragePicker, setShowStoragePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<"image" | "pdf" | null>(null); // 'image' or 'pdf'
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [verifiers, setVerifiers] = useState<Verifier[]>([]);

  // Bestandsobjecten zijn niet betrouwbaar serializeerbaar; herstel altijd naar lege file-state na laden uit storage.
  useEffect(() => {
    setFormData((prev) => {
      let changed = false;
      const next: ProductFormState = { ...prev };
      if (prev.imageFile && !(prev.imageFile instanceof File)) {
        next.imageFile = null;
        changed = true;
      }
      if (!Array.isArray(prev.pdfFiles) || prev.pdfFiles.some((f) => !(f instanceof File))) {
        next.pdfFiles = [];
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [setFormData]);

  // Fetch verifiers
  useEffect(() => {
    const fetchVerifiers = async () => {
      try {
        const q = query(collection(db, getPathString(PATHS.USERS)), where("canVerify", "==", true));
        const snapshot = await getDocs(q);
        setVerifiers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Verifier)));
      } catch (err) { console.error(err); }
    };
    fetchVerifiers();
  }, []);

  // Cleanup preview URL om memory leaks te voorkomen
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  // Handle file input changes
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFormData((prev) => ({ ...prev, imageFile: file }));
      setImagePreview(URL.createObjectURL(file));
    }
  };
  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files: File[] = [];
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files.item(i);
        if (file) files.push(file);
      }
      setFormData((prev) => ({ ...prev, pdfFiles: files }));
    }
  };

  const handleStorageSelect = (url: string) => {
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
      const data = initialData as Partial<ProductFormState> & { articleCode?: string };
      setFormData((prev) => ({
        ...prev,
        name: typeof data.name === "string" ? data.name : prev.name,
        displayId: typeof data.displayId === "string" ? data.displayId : prev.displayId,
        type: typeof data.type === "string" ? data.type : prev.type,
        label: typeof data.label === "string" ? data.label : prev.label,
        connection: typeof data.connection === "string" ? data.connection : prev.connection,
        dn: typeof data.dn === "string" ? data.dn : prev.dn,
        dn2: typeof data.dn2 === "string" ? data.dn2 : prev.dn2,
        pn: typeof data.pn === "string" ? data.pn : prev.pn,
        angle: typeof data.angle === "string" ? data.angle : "",
        radius: typeof data.radius === "string" ? data.radius : "",
        articleCode: typeof data.articleCode === "string" ? data.articleCode : prev.articleCode,
        extraCode: typeof data.extraCode === "string" ? data.extraCode : prev.extraCode,
        specs: (data.specs as ProductSpecMap) || {},
        bellSpecs: (data.bellSpecs as ProductSpecMap) || {},
        fittingSpecs: (data.fittingSpecs as ProductSpecMap) || {},
        socketSpecs: (data.socketSpecs as ProductSpecMap) || {},
        imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : prev.imageUrl,
        sourcePdfs: Array.isArray(data.sourcePdfs) ? (data.sourcePdfs as string[]) : [],
        verificationStatus: typeof data.verificationStatus === "string" ? data.verificationStatus : prev.verificationStatus,
        assignedVerifier: typeof data.assignedVerifier === "string" ? data.assignedVerifier : "",
      }));
      if (typeof data.articleCode === "string" && data.articleCode) {
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
        assignedVerifier: "",
      });
      setIsAutoLinked(false);
    }
  }, [initialData]);

  // 2. Automatische Naamgeneratie (Technische Logica)
  useEffect(() => {
    if (!formData.type) {
      if (!initialData) {
        setFormData((prev) => {
          if (prev.name === "" && prev.displayId === "") return prev;
          return { ...prev, name: "", displayId: "" };
        });
      }
      return;
    }

    setFormData((prev) => {
      const nextDisplayId = prev.displayId && prev.displayId !== "" ? prev.displayId : generatedProductName;
      if (prev.type === normalizedFormType && prev.name === generatedProductName && prev.displayId === nextDisplayId) {
        return prev; // Geen wijzigingen, voorkom extra re-render
      }
      return {
        ...prev,
        type: normalizedFormType,
        name: generatedProductName,
        displayId: nextDisplayId,
      };
    });
  }, [normalizedFormType, generatedProductName, initialData]);

  // 3. Matrix Validatie: Beschikbare PN's ophalen o.b.v. Verbinding
  const availablePNs = useMemo(() => {
    if (!formData.connection || !productRange) {
      return [...configPns].sort((a, b) => a - b);
    }

    const connKey = formData.connection;
    const matrixData = (productRange as Record<string, Record<string, number[]>>)[connKey];

    if (matrixData) {
      const configuredPNs = Object.keys(matrixData)
        .filter((pn) => matrixData[pn] && matrixData[pn].length > 0)
        .map(Number);

      if (configuredPNs.length > 0) {
        return configuredPNs.sort((a, b) => a - b);
      }
    }

    return [...configPns].sort((a, b) => a - b);
  }, [productRange, formData.connection, configPns]);

  // 4. Matrix Validatie: Beschikbare DN's ophalen o.b.v. Gekozen PN
  const availableDNs = useMemo(() => {
    if (!formData.connection || !productRange) {
      return [...configDiameters].sort((a, b) => a - b);
    }

    const connKey = formData.connection;
    const matrixData = (productRange as Record<string, Record<string, number[]>>)[connKey];

    if (!matrixData) {
      return [...configDiameters].sort((a, b) => a - b);
    }

    if (!formData.pn) {
      const allIds = new Set<number>();
      Object.values(matrixData).forEach((ids: number[]) => {
        if (Array.isArray(ids)) ids.forEach((id: number) => allIds.add(id));
      });
      return Array.from(allIds).sort((a, b) => a - b);
    }

    const pnKey = String(formData.pn);
    const validIds = matrixData[pnKey];

    if (Array.isArray(validIds)) {
      return validIds.sort((a, b) => a - b);
    }

    return [];
  }, [productRange, formData.connection, formData.pn, configDiameters]);

  // 5. Auto-fetch Specs uit Matrix/Database
  useEffect(() => {
    const fetchSpecs = async () => {
      if (!normalizedFormType || !formData.dn || !formData.pn || !formData.connection) return;

      const connKey = formData.connection.split("/")[0].toUpperCase();
      const pnStr = `PN${formData.pn}`;
      const idStr = `ID${formData.dn}`;
      const extraCodeSuffix = formData.extraCode && formData.extraCode !== "-" 
        ? `_${formData.extraCode.toUpperCase()}` 
        : "";

      // ID Constructie
      const bellId = `${connKey}_${pnStr}_${idStr}${extraCodeSuffix}`;
      
      // Generieke Fitting ID: TYPE_[ANGLE_]CONN_PN_ID
      let fittingId = `${normalizedFormType.toUpperCase()}`;
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
          const bellDocRef = doc(db, `${getPathString(bellPath)}/${bellId}`);
          const bellSnap = await getDoc(bellDocRef);
          if (bellSnap.exists()) {
            newBellSpecs = bellSnap.data();
            newSpecs = { ...newSpecs, ...newBellSpecs };
          }
        }

        // 2. Haal Fitting maten op (Stream 2)
        if (PATHS.FITTING_SPECS) {
          const fittingDocRef = doc(db, `${getPathString(PATHS.FITTING_SPECS)}/${fittingId}`);
          const fittingSnap = await getDoc(fittingDocRef);
          if (fittingSnap.exists()) {
            newFittingSpecs = fittingSnap.data();
            newSpecs = { ...newSpecs, ...newFittingSpecs };
          }
        }

        // 3. Haal Socket maten op (Stream 3)
        // Generiek patroon voor alle fittings: TYPE_SOCKET_CONN_PN_ID
        if (PATHS.SOCKET_SPECS) {
          const socketId = `${normalizedFormType.toUpperCase()}_SOCKET_${connKey}_${pnStr}_${idStr}${extraCodeSuffix}`;
          const socketDocRef = doc(db, `${getPathString(PATHS.SOCKET_SPECS)}/${socketId}`);
          const socketSnap = await getDoc(socketDocRef);
          if (socketSnap.exists()) {
            newSocketSpecs = socketSnap.data();
            newSpecs = { ...newSpecs, ...newSocketSpecs };
          }
        }

        // 4. Haal Flens maten op (Stream 4 - Flens)
        const isFlange = normalizedFormType.toLowerCase().includes("flange") || formData.connection.toLowerCase().includes("flange");
        if (isFlange && PATHS.BORE_DIMENSIONS) {
          const q = query(
            collection(db, getPathString(PATHS.BORE_DIMENSIONS)), 
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
  }, [normalizedFormType, formData.dn, formData.pn, formData.connection, formData.angle, formData.extraCode]);

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
          collection(db, getPathString(PATHS.CONVERSION_MATRIX)),
          where("manufacturedId", ">=", upperTerm),
          where("manufacturedId", "<=", upperTerm + "\uf8ff"),
          limit(20)
        );
        
        const q2 = query(
          collection(db, getPathString(PATHS.CONVERSION_MATRIX)),
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
      if (!normalizedFormType || !formData.dn || !formData.pn) return;

      try {
        // Query Conversion Matrix by DN and PN
        // 1. Probeer als String (standaard)
        let q = query(
          collection(db, getPathString(PATHS.CONVERSION_MATRIX)),
          where("dn", "==", String(formData.dn)),
          where("pn", "==", String(formData.pn))
        );
        
        let snapshot = await getDocs(q);

        // 2. Fallback: Probeer als Number (als import numeriek was)
        if (snapshot.empty && !isNaN(Number(formData.dn)) && !isNaN(Number(formData.pn))) {
           q = query(
            collection(db, getPathString(PATHS.CONVERSION_MATRIX)),
            where("dn", "==", Number(formData.dn)),
            where("pn", "==", Number(formData.pn))
          );
          snapshot = await getDocs(q);
        }

        if (snapshot.empty) return;

        const candidates = snapshot.docs.map(d => d.data() as ProductCandidate);
        
        // Client-side filtering
        const formType = normalizedFormType.toLowerCase();
        const formEnds = (formData.connection || "").toLowerCase();
        const formSerie = (formData.extraCode || "").toLowerCase();
        const formAngle = formData.angle;
        const formRadius = formData.radius;

        const match = candidates.find((c) => {
            // Type Match
            const cType = (c.type || "").toLowerCase();
            const cDesc = (c.description || "").toLowerCase();
            const cTarget = (c.targetProductId || "").toLowerCase();
            
            let typeMatch;
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
                const codeToUse = match.targetProductId || match.manufacturedId || "";
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
  }, [normalizedFormType, formData.dn, formData.pn, formData.connection, formData.angle, formData.extraCode, formData.radius]);

  // 6. Opslaan naar Root
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizedFormType || !generatedProductName || !formData.dn || !formData.pn) {
      notify(t('productForm.fill_required'));
      return;
    }

    setSaving(true);
    try {
      const useAdminOverride = isAdminUser && adminOverride4Eyes;
      const resolvedProductType = normalizedFormType;
      const resolvedProductName = buildGeneratedProductName({ ...formData, type: resolvedProductType });
      const resolvedDisplayId = formData.displayId && formData.displayId !== "" ? formData.displayId : resolvedProductName;

      const productId =
        initialData?.id ||
        `${resolvedProductType}_ID${formData.dn}_${Date.now()}`.replace(
          /[^a-zA-Z0-9]/g,
          "_"
        );
      // productRef niet meer nodig — save loopt via callable

      // Bepaal opslagpad en metadata voor bibliotheek structuur
      const getStorageInfo = () => {
        const typeFolder = (resolvedProductType || "Other").replace(/\s+/g, "_");
        const angleSuffix = formData.angle ? `_${formData.angle}` : "";
        const connFolder = (formData.connection || "None").replace(/\//g, "-");
        
        // Label voor hergebruik (metadata)
        const label = `${getTypeAbbr(resolvedProductType)} ${formData.angle || ""} ${formatConnection(formData.connection)}`.trim();

        return {
            basePath: `product_library/${typeFolder}${angleSuffix}/${connFolder}`,
            metadata: {
                customMetadata: {
                    productType: resolvedProductType,
                    connection: formData.connection,
                    angle: formData.angle || "",
                    label: label,
                    uploadedBy: user?.email || "system"
                }
            }
        };
      };

      const storageInfo = getStorageInfo();
      
      // Upload image if present
      let imageUrl = formData.imageUrl;
      if (formData.imageFile) {
        const fileName = `${Date.now()}_${sanitizeFileName(formData.imageFile.name)}`;
        const imgRef = ref(storage, `${storageInfo.basePath}/images/${fileName}`);
        await uploadBytes(imgRef, formData.imageFile);
        imageUrl = await getDownloadURL(imgRef);
      }

      // Upload PDFs if present
      let pdfUrls: string[] = formData.sourcePdfs || [];
      if (formData.pdfFiles && formData.pdfFiles.length > 0) {
        pdfUrls = [];
        for (let i = 0; i < formData.pdfFiles.length; i++) {
          const pdfFile = formData.pdfFiles[i];
          const fileName = `${Date.now()}_${sanitizeFileName(pdfFile.name)}`;
          const pdfRef = ref(storage, `${storageInfo.basePath}/pdfs/${fileName}`);
          await uploadBytes(pdfRef, pdfFile);
          const url = await getDownloadURL(pdfRef);
          pdfUrls.push(url);
        }
      }

      // Bepaal verificatie status (Altijd PENDING voor 4-ogen principe)
      // Tijdelijke admin override kan status direct op VERIFIED zetten.
      const finalStatus = useAdminOverride
        ? VERIFICATION_STATUS.VERIFIED
        : VERIFICATION_STATUS.PENDING;

      // Filter out spec fields and temporary file objects before saving
      // We want to store ONLY identification and system links, specs should be live fetched.
      const {
        specs: _specs,
        bellSpecs: _bellSpecs,
        fittingSpecs: _fittingSpecs,
        socketSpecs: _socketSpecs,
        imageFile: _imageFile,
        pdfFiles: _pdfFiles,
        ...cleanFormData
      } = {
        ...formData,
        type: resolvedProductType,
        name: resolvedProductName,
        displayId: resolvedDisplayId,
      };

      const productData: Record<string, unknown> = {
        ...cleanFormData,
        // Backward compatibility: Save diameter/pressure aliases for Catalog views
        diameter: cleanFormData.dn,
        pressure: cleanFormData.pn,
        imageUrl,
        sourcePdfs: pdfUrls,
        id: productId,
        verificationStatus: finalStatus,
        fourEyesOverride: useAdminOverride,
        active: true,
      };

      if (useAdminOverride) {
        productData.verifiedBy = {
          uid: user?.uid || "system",
          name: user?.displayName || user?.name || user?.email || "Admin",
        };
        productData.fourEyesOverrideBy = {
          uid: user?.uid || "system",
          name: user?.displayName || user?.name || user?.email || "Admin",
          reason: "Tijdelijke admin override voor catalogusvalidatie",
        };
      }

      await saveProductRecord({
        productId,
        productData,
        clearVerification: !useAdminOverride,
      });

      await logActivity(
        user?.uid || "system",
        initialData ? "PRODUCT_UPDATE" : "PRODUCT_CREATE",
        `${initialData ? "Product bijgewerkt" : "Product aangemaakt"}: ${resolvedProductName} (${productId})`
      );

      // Send notification to verifier if assigned
       if (formData.assignedVerifier) {
        const verifier = verifiers.find(v => v.id === formData.assignedVerifier);
        if (verifier && verifier.email) {
         await addDoc(collection(db, getPathString(PATHS.MESSAGES)), {
            to: verifier.email,
            subject: t('productForm.verification_request') + resolvedProductName,
            content: t('productForm.new_product_verification', { name: resolvedProductName }),
            type: "validation_alert",
            priority: "urgent",
            read: false,
            archived: false,
            timestamp: serverTimestamp(),
            senderId: user?.uid || "system",
            senderName: user?.displayName || "System",
            relatedProductId: productId
          });
          await logActivity(
            user?.uid || "system",
            "MESSAGE_SEND",
            `Verificatieverzoek verstuurd voor product ${productId} naar ${verifier.email}`
          );
        }
      }

      clearPersistedProductForm();
      if (onSubmit) onSubmit();
    } catch (err) {
      console.error("Save failed:", err);
      if (getErrorCode(err) === 'storage/unauthorized') {
        notify(t('productForm.storage_unauthorized'));
      } else {
        notify(t('productForm.save_error') + getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  };

  // Helper voor het sorteren van specificaties
  const sortSpecs = (specs: ProductSpecMap, order: string[]): Array<[string, unknown]> => {
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
          {t('productForm.initializing')}
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
              {t('productForm.product_architect').split(' ')[0]} <span className="text-blue-600">{t('productForm.product_architect').split(' ')[1]}</span>
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
              <Database size={12} className="text-emerald-500" /> {t('productForm.root_sync')}: /
              {PATHS.PRODUCTS.join("/")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={onCancel}
            className="px-6 py-3 text-slate-400 hover:text-slate-600 font-black uppercase text-[10px] tracking-widest transition-all"
          >
            {t('productForm.cancel')}
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
            {t('productForm.publish_to_hub')}
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
                <BookOpen size={16} className="text-blue-500" /> {t('productForm.basic_identification')}
              </h3>

              <div className="space-y-6">

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                    {t('productForm.production_extra_code')}
                  </label>
                  <select
                    className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer"
                    value={formData.extraCode}
                    onChange={(e) =>
                      setFormData({ ...formData, extraCode: e.target.value })
                    }
                  >
                    <option value="">{t('productForm.select_code')}</option>
                    <option value="-">{t('productForm.no_code')}</option>
                    {configCodes.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                      {t('productForm.product_type')}
                    </label>
                    <select
                      className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer"
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({ ...formData, type: e.target.value })
                      }
                    >
                      <option value="">{t('productForm.select_type')}</option>
                      {productTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                      {t('productForm.connection')}
                    </label>
                    <select
                      className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer"
                      value={formData.connection}
                      onChange={(e) =>
                        setFormData({ ...formData, connection: e.target.value })
                      }
                    >
                      <option value="">{t('productForm.select')}</option>
                      {connectionTypes.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Conditional Fields for Elbow */}
                {normalizedFormType.toLowerCase().includes("elbow") && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-2">{t('productForm.degrees_angle')}</label>
                      <select 
                        className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500" 
                        value={formData.angle} 
                        onChange={e => {
                          const newAngle = e.target.value;
                          const newRadius = newAngle !== "90" ? "1.5D" : formData.radius;
                          setFormData({...formData, angle: newAngle, radius: newRadius});
                        }}
                      >
                        <option value="">{t('productForm.choose_angle')}</option>
                        {configAngles.map((a) => <option key={a} value={a}>{a}°</option>)}
                      </select>
                    </div>
                    {formData.angle === "90" && (
                      <div className="space-y-2 animate-in slide-in-from-left-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">{t('productForm.radius')}</label>
                        <select className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500" value={formData.radius} onChange={e => setFormData({...formData, radius: e.target.value})}>
                          <option value="">{t('productForm.choose_radius')}</option>
                          <option value="1.0D">1.0D</option>
                          <option value="1.5D">1.5D</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                      {t('productForm.article_group_label')}
                    </label>
                    <select
                      className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer"
                      value={formData.label}
                      onChange={(e) =>
                        setFormData({ ...formData, label: e.target.value })
                      }
                    >
                      <option value="">{t('productForm.select')}</option>
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
                <Ruler size={16} className="text-blue-500" /> {t('productForm.technical_matrix')}
              </h3>

              <div className="relative z-10">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                      {t('productForm.pressure_class_pn')}
                    </label>
                    <select
                      className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer"
                      value={formData.pn}
                      onChange={(e) =>
                        setFormData({ ...formData, pn: e.target.value, dn: "" })
                      }
                    >
                      <option value="">{t('productForm.choose_pn')}</option>
                      {availablePNs.map((pn) => (
                        <option key={pn} value={pn}>
                          PN {pn}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                      {t('productForm.inner_diameter_id')}
                    </label>
                    <select
                      className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-black italic outline-none focus:border-blue-500 transition-all text-blue-600"
                      value={formData.dn}
                      onChange={(e) =>
                        setFormData({ ...formData, dn: e.target.value })
                      }
                    >
                      <option value="">{t('productForm.choose_id')}</option>
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
                      <Info size={12} /> {t('productForm.found_specs')}
                    </h4>
                    
                    <div className="space-y-4">
                      {/* Socket Maten Group */}
                      {(Object.keys(formData.bellSpecs || {}).length > 0 || Object.keys(formData.socketSpecs || {}).length > 0) && (
                        <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                           <h5 className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-2 ml-1">{t('productForm.socket_dimensions')}</h5>
                           <div className="grid grid-cols-3 gap-3">
                             {sortSpecs({...formData.bellSpecs, ...formData.socketSpecs}, SOCKET_ORDER)
                               .map(([key, value]) => (
                                 <div key={key} className="bg-white p-2 rounded-xl border border-slate-100 flex flex-col shadow-sm">
                                   <span className="text-[7px] font-black text-slate-400 uppercase mb-0.5">{key}</span>
                                   <span className="text-xs font-bold text-slate-700 truncate" title={String(value)}>{String(value)}</span>
                                 </div>
                               ))}
                           </div>
                        </div>
                      )}

                      {/* Fitting Maten Group */}
                      {Object.keys(formData.fittingSpecs || {}).length > 0 && (
                        <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                           <h5 className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-2 ml-1">{t('productForm.fitting_dimensions')}</h5>
                           <div className="grid grid-cols-3 gap-3">
                             {sortSpecs(formData.fittingSpecs, FITTING_ORDER)
                               .map(([key, value]) => (
                                 <div key={key} className="bg-white p-2 rounded-xl border border-slate-100 flex flex-col shadow-sm">
                                   <span className="text-[7px] font-black text-slate-400 uppercase mb-0.5">{key}</span>
                                   <span className="text-xs font-bold text-slate-700 truncate" title={String(value)}>{String(value)}</span>
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
                <Hash size={16} /> {t('productForm.system_link')}
              </h3>
              <div className="space-y-4">
                <div className="space-y-1.5 text-left">
                  <label className="text-[8px] font-black text-slate-500 uppercase ml-2">
                    {t('productForm.generated_system_name')}
                  </label>
                  <input
                    readOnly
                    className="w-full p-4 bg-white/5 border border-white/10 rounded-xl font-black text-lg text-white italic tracking-tighter outline-none"
                    value={generatedProductName}
                  />
                </div>
                <div className="space-y-1.5 text-left relative">
                  <label className="text-[8px] font-black text-slate-500 uppercase ml-2">
                    {t('productForm.infor_ln_code')}
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
                      placeholder={t('productForm.search_placeholder')}
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
                              setFormData(prev => ({ ...prev, articleCode: res.targetProductId || res.manufacturedId || "" }));
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
                           <span className="text-xs text-slate-400">{t('productForm.no_results')}</span>
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
                <ImageIcon size={16} className="text-blue-500" /> {t('productForm.image_pdf_upload')}
              </h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">{t('productForm.product_image')}</label>
                  <div className="flex gap-3">
                    <label className="flex-1 flex flex-col items-center justify-center h-32 border-2 border-slate-100 border-dashed rounded-2xl cursor-pointer bg-slate-50/50 hover:bg-blue-50 hover:border-blue-200 transition-all group">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <ImageIcon className="w-8 h-8 text-slate-300 group-hover:text-blue-500 mb-2 transition-colors" />
                          <p className="text-[10px] font-bold text-slate-400 group-hover:text-blue-600 uppercase tracking-widest">
                              {formData.imageFile ? formData.imageFile.name : t('productForm.click_to_upload')}
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
                      <span className="text-[10px] font-black uppercase tracking-widest">{t('productForm.library')}</span>
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
                              {t('productForm.new')}
                           </div>
                        )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">{t('productForm.technical_pdfs')}</label>
                  <div className="flex gap-3">
                    <label className="flex-1 flex flex-col items-center justify-center h-32 border-2 border-slate-100 border-dashed rounded-2xl cursor-pointer bg-slate-50/50 hover:bg-blue-50 hover:border-blue-200 transition-all group">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <FileText className="w-8 h-8 text-slate-300 group-hover:text-blue-500 mb-2 transition-colors" />
                          <p className="text-[10px] font-bold text-slate-400 group-hover:text-blue-600 uppercase tracking-widest">
                              {formData.pdfFiles && formData.pdfFiles.length > 0 
                                  ? `${formData.pdfFiles.length} ${t('productForm.files_selected')}` 
                                  : t('productForm.click_to_upload_pdfs')}
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
                      <span className="text-[10px] font-black uppercase tracking-widest">{t('productForm.library')}</span>
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
                  {t('productForm.master_data_selection')}
                </span>
              </div>
              <p className="text-[10px] font-medium text-slate-400 leading-relaxed italic">
                {t('productForm.master_data_desc')}
              </p>
            </div>

            <div className="bg-white p-6 rounded-[35px] border border-slate-200 shadow-sm flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <ShieldCheck size={18} className="text-emerald-500" />
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">
                  {t('productForm.verification_control')}
                </span>
              </div>
              <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                    {t('productForm.assign_verifier')}
                  </label>
                  <select
                    className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer"
                    value={formData.assignedVerifier || ""}
                    onChange={(e) => setFormData({ ...formData, assignedVerifier: e.target.value })}
                  >
                    <option value="">{t('productForm.choose_verifier')}</option>
                    {verifiers.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  <p className="text-[9px] text-slate-400 italic ml-2">
                    {t('productForm.verifier_note')}
                  </p>
              </div>

              {isAdminUser && (
                <label className="flex items-start gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adminOverride4Eyes}
                    onChange={(e) => setAdminOverride4Eyes(e.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-[11px] font-bold text-amber-800 leading-relaxed">
                    Tijdelijke Admin Override (4-ogen): direct als geverifieerd opslaan voor test van catalogus/tekeningen.
                  </span>
                </label>
              )}
            </div>

            {/* Informatieve Voetnoot */}
            <div className="p-8 bg-blue-50 rounded-[35px] border border-blue-100 flex items-start gap-4">
              <Info size={20} className="text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[10px] font-bold text-blue-700/70 leading-relaxed uppercase tracking-wider italic">
                {t('productForm.pending_status_info')}
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

type StorageItem = {
  name: string;
  fullPath: string;
  isFolder: boolean;
  url?: string;
};

type StoragePickerProps = {
  onClose: () => void;
  onSelect: (url: string, name?: string) => void;
  initialPath?: string;
};

const StoragePicker = ({ onClose, onSelect, initialPath = "product_library" }: StoragePickerProps) => {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchItems = async () => {
      setLoading(true);
      try {
        // Fallback naar root als path leeg is of error geeft
        const path = currentPath || "product_library";
        const storageRef = ref(storage, path);
        const res = await listAll(storageRef);
        
        const folders: StorageItem[] = res.prefixes.map(p => ({
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

  const handleNavigate = (folderPath: string) => {
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
                        <h3 className="font-black text-slate-800 uppercase text-sm tracking-wide">{t('productForm.library')}</h3>
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
                    title={t('productForm.up')}
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
                            onClick={() => item.isFolder ? handleNavigate(item.fullPath) : onSelect(item.url || "", item.name)}
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
                                {t('productForm.no_files_found')}
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
