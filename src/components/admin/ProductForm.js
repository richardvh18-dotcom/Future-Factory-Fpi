import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Save, Loader2, Settings, Database, Zap, Ruler, Image as ImageIcon, BookOpen, FileText, CheckCircle2, ShieldCheck, Hash, Info, Search, Link, Folder, CornerUpLeft, X as XIcon, } from "lucide-react";
import { db, storage, logActivity } from "../../config/firebase";
import { doc, serverTimestamp, getDoc, collection, query, where, getDocs, limit, addDoc } from "firebase/firestore";
import { saveProductRecord } from "../../services/planningSecurityService";
import { ref, uploadBytes, getDownloadURL, listAll } from "firebase/storage";
import { PATHS } from "../../config/dbPaths";
import { useSettingsData } from "../../hooks/useSettingsData";
import { ALL_PRODUCT_TYPES, CONNECTION_TYPES, VERIFICATION_STATUS, } from "../../data/constants";
import { useNotifications } from '../../contexts/NotificationContext';
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
const normalizeProductType = (value) => {
    const raw = String(value || "").trim();
    if (!raw)
        return "";
    const normalized = raw.toLowerCase();
    const aliasMap = {
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
const buildGeneratedProductName = (productData) => {
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
    if (pnStr)
        generatedName += ` ${pnStr}`;
    if (connStr)
        generatedName += ` ${connStr}`;
    return generatedName.replace(/\s+/g, " ").trim();
};
const formatConnection = (c) => {
    if (!c)
        return "";
    const clean = c.replace(/[^a-zA-Z0-9]/g, "");
    // Als het 2 karakters zijn (bijv CB), verdubbelen naar CBCB
    if (clean.length === 2)
        return clean + clean;
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
    const { t } = useTranslation();
    const { loading: settingsLoading, productRange, generalConfig, } = useSettingsData(user);
    const { notify } = useNotifications();
    const [saving, setSaving] = useState(false);
    const isAdminUser = String(user?.role || "").toLowerCase() === "admin";
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
        assignedVerifier: "",
    });
    const [adminOverride4Eyes, setAdminOverride4Eyes] = useState(false);
    const normalizedFormType = normalizeProductType(formData.type);
    const generatedProductName = buildGeneratedProductName({ ...formData, type: normalizedFormType });
    // LN Search State
    const [lnSearchResults, setLnSearchResults] = useState([]);
    const [isSearchingLn, setIsSearchingLn] = useState(false);
    const [showLnResults, setShowLnResults] = useState(false);
    const [searchEnabled, setSearchEnabled] = useState(false);
    const [isAutoLinked, setIsAutoLinked] = useState(false);
    const [showStoragePicker, setShowStoragePicker] = useState(false);
    const [pickerMode, setPickerMode] = useState(null); // 'image' or 'pdf'
    const [imagePreview, setImagePreview] = useState(null);
    const [verifiers, setVerifiers] = useState([]);
    // Fetch verifiers
    useEffect(() => {
        const fetchVerifiers = async () => {
            try {
                const q = query(collection(db, ...PATHS.USERS), where("canVerify", "==", true));
                const snapshot = await getDocs(q);
                setVerifiers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            }
            catch (err) {
                console.error(err);
            }
        };
        fetchVerifiers();
    }, []);
    // Cleanup preview URL om memory leaks te voorkomen
    useEffect(() => {
        return () => {
            if (imagePreview)
                URL.revokeObjectURL(imagePreview);
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
    const handleStorageSelect = (url) => {
        if (pickerMode === 'image') {
            setFormData(prev => ({ ...prev, imageUrl: url, imageFile: null }));
            setImagePreview(null);
        }
        else if (pickerMode === 'pdf') {
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
                assignedVerifier: initialData.assignedVerifier || "",
            }));
            if (initialData.articleCode) {
                setIsAutoLinked(true);
            }
        }
        else {
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
                setFormData((prev) => ({ ...prev, name: "", displayId: "" }));
            }
            return;
        }
        setFormData((prev) => ({
            ...prev,
            type: normalizedFormType,
            name: generatedProductName,
            displayId: prev.displayId && prev.displayId !== "" ? prev.displayId : generatedProductName,
        }));
    }, [normalizedFormType, generatedProductName, initialData]);
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
                if (Array.isArray(ids))
                    ids.forEach((id) => allIds.add(id));
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
            if (!normalizedFormType || !formData.dn || !formData.pn || !formData.connection)
                return;
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
                if (connKey === "TB")
                    bellPath = PATHS.TB_DIMENSIONS;
                else if (connKey === "CB")
                    bellPath = PATHS.CB_DIMENSIONS;
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
                    const socketId = `${normalizedFormType.toUpperCase()}_SOCKET_${connKey}_${pnStr}_${idStr}${extraCodeSuffix}`;
                    const socketDocRef = doc(db, ...PATHS.SOCKET_SPECS, socketId);
                    const socketSnap = await getDoc(socketDocRef);
                    if (socketSnap.exists()) {
                        newSocketSpecs = socketSnap.data();
                        newSpecs = { ...newSpecs, ...newSocketSpecs };
                    }
                }
                // 4. Haal Flens maten op (Stream 4 - Flens)
                const isFlange = normalizedFormType.toLowerCase().includes("flange") || formData.connection.toLowerCase().includes("flange");
                if (isFlange && PATHS.BORE_DIMENSIONS) {
                    const q = query(collection(db, ...PATHS.BORE_DIMENSIONS), where("diameter", "==", Number(formData.dn)));
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
            }
            catch (err) {
                console.error("Error fetching specs:", err);
            }
        };
        fetchSpecs();
    }, [normalizedFormType, formData.dn, formData.pn, formData.connection, formData.angle, formData.extraCode]);
    // 5b. LN Code Search Effect (Live)
    useEffect(() => {
        const term = formData.articleCode;
        if (!term || term.length < 3 || !searchEnabled) {
            if (!term)
                setLnSearchResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setIsSearchingLn(true);
            try {
                const upperTerm = term.trim().toUpperCase();
                const q1 = query(collection(db, ...PATHS.CONVERSION_MATRIX), where("manufacturedId", ">=", upperTerm), where("manufacturedId", "<=", upperTerm + "\uf8ff"), limit(20));
                const q2 = query(collection(db, ...PATHS.CONVERSION_MATRIX), where("targetProductId", ">=", upperTerm), where("targetProductId", "<=", upperTerm + "\uf8ff"), limit(20));
                const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
                const resultsMap = new Map();
                snap1.docs.forEach(doc => resultsMap.set(doc.id, doc.data()));
                snap2.docs.forEach(doc => resultsMap.set(doc.id, doc.data()));
                const results = Array.from(resultsMap.values());
                setLnSearchResults(results);
                setShowLnResults(results.length > 0);
            }
            catch (error) {
                console.error("LN Search Error:", error);
            }
            finally {
                setIsSearchingLn(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [formData.articleCode, searchEnabled]);
    // 5c. Auto-link Infor-LN Code based on configuration
    useEffect(() => {
        const autoLink = async () => {
            if (!normalizedFormType || !formData.dn || !formData.pn)
                return;
            try {
                // Query Conversion Matrix by DN and PN
                // 1. Probeer als String (standaard)
                let q = query(collection(db, ...PATHS.CONVERSION_MATRIX), where("dn", "==", String(formData.dn)), where("pn", "==", String(formData.pn)));
                let snapshot = await getDocs(q);
                // 2. Fallback: Probeer als Number (als import numeriek was)
                if (snapshot.empty && !isNaN(formData.dn) && !isNaN(formData.pn)) {
                    q = query(collection(db, ...PATHS.CONVERSION_MATRIX), where("dn", "==", Number(formData.dn)), where("pn", "==", Number(formData.pn)));
                    snapshot = await getDocs(q);
                }
                if (snapshot.empty)
                    return;
                const candidates = snapshot.docs.map(d => d.data());
                // Client-side filtering
                const formType = normalizedFormType.toLowerCase();
                const formEnds = (formData.connection || "").toLowerCase();
                const formSerie = (formData.extraCode || "").toLowerCase();
                const formAngle = formData.angle;
                const formRadius = formData.radius;
                const match = candidates.find(c => {
                    // Type Match
                    const cType = (c.type || "").toLowerCase();
                    const cDesc = (c.description || "").toLowerCase();
                    const cTarget = (c.targetProductId || "").toLowerCase();
                    let typeMatch;
                    if (formType.includes("elbow") || formType === "elb") {
                        typeMatch = cType.includes("el") || cType.includes("elmo") || cDesc.includes("elbow");
                    }
                    else if (formType.includes("tee")) {
                        typeMatch = cType.includes("te") || cDesc.includes("tee");
                    }
                    else {
                        typeMatch = cType.includes(formType.substring(0, 3));
                    }
                    if (!typeMatch)
                        return false;
                    // Ends Match (if specified in form)
                    if (formEnds && c.ends) {
                        const cEnds = c.ends.toLowerCase();
                        if (!cEnds.includes(formEnds.split('/')[0]))
                            return false;
                    }
                    // Serie Match (Extra Code)
                    if (formSerie && formSerie !== "-" && c.serie) {
                        const cSerie = c.serie.toLowerCase();
                        if (!cSerie.includes(formSerie))
                            return false;
                    }
                    // Angle Match (New)
                    if (formAngle && (formType.includes("elbow") || formType === "elb")) {
                        const angleStr = String(formAngle);
                        if (["90", "60", "45", "30", "15"].includes(angleStr)) {
                            const targetHasAngle = cTarget.includes(angleStr);
                            // Fallback: Check Old Code (Manufactured ID) for known patterns
                            let oldCodeHasAngle = false;
                            const mId = (c.manufacturedId || "").toUpperCase();
                            if (angleStr === "90" && mId.startsWith("EL9"))
                                oldCodeHasAngle = true;
                            if (angleStr === "45" && mId.startsWith("EL4"))
                                oldCodeHasAngle = true;
                            if (angleStr === "30" && mId.startsWith("EL3"))
                                oldCodeHasAngle = true;
                            if (!targetHasAngle && !oldCodeHasAngle)
                                return false;
                        }
                    }
                    // Radius Match
                    if (formRadius && (formType.includes("elbow") || formType === "elb")) {
                        if (formRadius === "1.5D") {
                            if (cDesc.includes("1.0d") || cDesc.includes("short") || cDesc.includes("sr"))
                                return false;
                        }
                        else if (formRadius === "1.0D") {
                            if (!cDesc.includes("1.0d") && !cDesc.includes("short") && !cDesc.includes("sr"))
                                return false;
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
            }
            catch (err) {
                console.error("Auto-link error:", err);
            }
        };
        const timer = setTimeout(autoLink, 800);
        return () => clearTimeout(timer);
    }, [normalizedFormType, formData.dn, formData.pn, formData.connection, formData.angle, formData.extraCode, formData.radius]);
    // 6. Opslaan naar Root
    const handleSave = async (e) => {
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
            const productId = initialData?.id ||
                `${resolvedProductType}_ID${formData.dn}_${Date.now()}`.replace(/[^a-zA-Z0-9]/g, "_");
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
            let pdfUrls = formData.sourcePdfs || [];
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
            const cleanFormData = {
                ...formData,
                type: resolvedProductType,
                name: resolvedProductName,
                displayId: resolvedDisplayId,
            };
            delete cleanFormData.specs;
            delete cleanFormData.bellSpecs;
            delete cleanFormData.fittingSpecs;
            delete cleanFormData.socketSpecs;
            delete cleanFormData.imageFile;
            delete cleanFormData.pdfFiles;
            const productData = {
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
            await logActivity(user?.uid || "system", initialData ? "PRODUCT_UPDATE" : "PRODUCT_CREATE", `${initialData ? "Product bijgewerkt" : "Product aangemaakt"}: ${resolvedProductName} (${productId})`);
            // Send notification to verifier if assigned
            if (formData.assignedVerifier) {
                const verifier = verifiers.find(v => v.id === formData.assignedVerifier);
                if (verifier && verifier.email) {
                    await addDoc(collection(db, ...PATHS.MESSAGES), {
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
                    await logActivity(user?.uid || "system", "MESSAGE_SEND", `Verificatieverzoek verstuurd voor product ${productId} naar ${verifier.email}`);
                }
            }
            if (onSubmit)
                onSubmit();
        }
        catch (err) {
            console.error("Save failed:", err);
            if (err.code === 'storage/unauthorized') {
                notify(t('productForm.storage_unauthorized'));
            }
            else {
                notify(t('productForm.save_error') + err.message);
            }
        }
        finally {
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
            if (idxA !== -1 && idxB !== -1)
                return idxA - idxB;
            if (idxA !== -1)
                return -1;
            if (idxB !== -1)
                return 1;
            return keyA.localeCompare(keyB);
        });
    };
    const SOCKET_ORDER = ['B1', 'B2', 'BA', 'A1', 'Twcb', 'BD', 'W'];
    const FITTING_ORDER = ['TW', 'L', 'Lo', 'R', 'Weight'];
    if (settingsLoading)
        return (_jsxs("div", { className: "flex flex-col items-center justify-center p-20 gap-4", children: [_jsx(Loader2, { className: "animate-spin text-blue-600", size: 48 }), _jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400 italic", children: t('productForm.initializing') })] }));
    return (_jsxs("div", { className: "flex flex-col h-full bg-slate-50 text-left overflow-hidden", children: [_jsxs("div", { className: "bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shrink-0 shadow-sm z-10", children: [_jsxs("div", { className: "flex items-center gap-6", children: [_jsx("div", { className: "p-4 bg-blue-600 text-white rounded-3xl shadow-xl shadow-blue-100", children: _jsx(Settings, { size: 28 }) }), _jsxs("div", { className: "text-left", children: [_jsxs("h2", { className: "text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none", children: [t('productForm.product_architect').split(' ')[0], " ", _jsx("span", { className: "text-blue-600", children: t('productForm.product_architect').split(' ')[1] })] }), _jsxs("p", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2", children: [_jsx(Database, { size: 12, className: "text-emerald-500" }), " ", t('productForm.root_sync'), ": /", PATHS.PRODUCTS.join("/")] })] })] }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("button", { onClick: onCancel, className: "px-6 py-3 text-slate-400 hover:text-slate-600 font-black uppercase text-[10px] tracking-widest transition-all", children: t('productForm.cancel') }), _jsxs("button", { onClick: handleSave, disabled: saving, className: "bg-slate-900 text-white px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all flex items-center gap-3 disabled:opacity-50 active:scale-95", children: [saving ? (_jsx(Loader2, { className: "animate-spin", size: 18 })) : (_jsx(Save, { size: 18 })), t('productForm.publish_to_hub')] })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-4 custom-scrollbar", children: _jsxs("div", { className: "w-full grid grid-cols-1 lg:grid-cols-12 gap-4 pb-32", children: [_jsxs("div", { className: "lg:col-span-7 space-y-4", children: [_jsxs("div", { className: "bg-white p-6 rounded-[45px] border border-slate-200 shadow-sm space-y-6", children: [_jsxs("h3", { className: "text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3 italic", children: [_jsx(BookOpen, { size: 16, className: "text-blue-500" }), " ", t('productForm.basic_identification')] }), _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2", children: t('productForm.production_extra_code') }), _jsxs("select", { className: "w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer", value: formData.extraCode, onChange: (e) => setFormData({ ...formData, extraCode: e.target.value }), children: [_jsx("option", { value: "", children: t('productForm.select_code') }), _jsx("option", { value: "-", children: t('productForm.no_code') }), (generalConfig?.codes || []).map((code) => (_jsx("option", { value: code, children: code }, code)))] })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2", children: t('productForm.product_type') }), _jsxs("select", { className: "w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer", value: formData.type, onChange: (e) => setFormData({ ...formData, type: e.target.value }), children: [_jsx("option", { value: "", children: t('productForm.select_type') }), productTypes.map((t) => (_jsx("option", { value: t, children: t }, t)))] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2", children: t('productForm.connection') }), _jsxs("select", { className: "w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer", value: formData.connection, onChange: (e) => setFormData({ ...formData, connection: e.target.value }), children: [_jsx("option", { value: "", children: t('productForm.select') }), connectionTypes.map((c) => (_jsx("option", { value: c, children: c }, c)))] })] })] }), normalizedFormType.toLowerCase().includes("elbow") && (_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2", children: t('productForm.degrees_angle') }), _jsxs("select", { className: "w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500", value: formData.angle, onChange: e => {
                                                                        const newAngle = e.target.value;
                                                                        const newRadius = newAngle !== "90" ? "1.5D" : formData.radius;
                                                                        setFormData({ ...formData, angle: newAngle, radius: newRadius });
                                                                    }, children: [_jsx("option", { value: "", children: t('productForm.choose_angle') }), (generalConfig?.angles || ["11.25", "22.5", "30", "45", "60", "90"]).map(a => _jsxs("option", { value: a, children: [a, "\u00B0"] }, a))] })] }), formData.angle === "90" && (_jsxs("div", { className: "space-y-2 animate-in slide-in-from-left-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2", children: t('productForm.radius') }), _jsxs("select", { className: "w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500", value: formData.radius, onChange: e => setFormData({ ...formData, radius: e.target.value }), children: [_jsx("option", { value: "", children: t('productForm.choose_radius') }), _jsx("option", { value: "1.0D", children: "1.0D" }), _jsx("option", { value: "1.5D", children: "1.5D" })] })] }))] })), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2", children: t('productForm.article_group_label') }), _jsxs("select", { className: "w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer", value: formData.label, onChange: (e) => setFormData({ ...formData, label: e.target.value }), children: [_jsx("option", { value: "", children: t('productForm.select') }), productLabels.map((l) => (_jsx("option", { value: l, children: l }, l)))] })] })] })] }), _jsxs("div", { className: "bg-white p-6 rounded-[45px] border border-slate-200 shadow-sm space-y-6 relative overflow-hidden", children: [_jsx("div", { className: "absolute top-0 right-0 p-8 opacity-5 rotate-12", children: _jsx(Zap, { size: 120 }) }), _jsxs("h3", { className: "text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3 italic relative z-10", children: [_jsx(Ruler, { size: 16, className: "text-blue-500" }), " ", t('productForm.technical_matrix')] }), _jsxs("div", { className: "relative z-10", children: [_jsxs("div", { className: "grid grid-cols-2 gap-6", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2", children: t('productForm.pressure_class_pn') }), _jsxs("select", { className: "w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer", value: formData.pn, onChange: (e) => setFormData({ ...formData, pn: e.target.value, dn: "" }), children: [_jsx("option", { value: "", children: t('productForm.choose_pn') }), availablePNs.map((pn) => (_jsxs("option", { value: pn, children: ["PN ", pn] }, pn)))] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2", children: t('productForm.inner_diameter_id') }), _jsxs("select", { className: "w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-black italic outline-none focus:border-blue-500 transition-all text-blue-600", value: formData.dn, onChange: (e) => setFormData({ ...formData, dn: e.target.value }), children: [_jsx("option", { value: "", children: t('productForm.choose_id') }), availableDNs.map((dn) => (_jsxs("option", { value: dn, children: ["ID ", dn, " mm"] }, dn)))] })] })] }), (Object.keys(formData.fittingSpecs || {}).length > 0 || Object.keys(formData.bellSpecs || {}).length > 0 || Object.keys(formData.socketSpecs || {}).length > 0) && (_jsxs("div", { className: "mt-6 pt-6 border-t border-slate-100 animate-in slide-in-from-top-2", children: [_jsxs("h4", { className: "text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2", children: [_jsx(Info, { size: 12 }), " ", t('productForm.found_specs')] }), _jsxs("div", { className: "space-y-4", children: [(Object.keys(formData.bellSpecs || {}).length > 0 || Object.keys(formData.socketSpecs || {}).length > 0) && (_jsxs("div", { className: "bg-slate-50/50 p-3 rounded-2xl border border-slate-100", children: [_jsx("h5", { className: "text-[8px] font-black text-slate-400 uppercase tracking-wider mb-2 ml-1", children: t('productForm.socket_dimensions') }), _jsx("div", { className: "grid grid-cols-3 gap-3", children: sortSpecs({ ...formData.bellSpecs, ...formData.socketSpecs }, SOCKET_ORDER)
                                                                                .map(([key, value]) => (_jsxs("div", { className: "bg-white p-2 rounded-xl border border-slate-100 flex flex-col shadow-sm", children: [_jsx("span", { className: "text-[7px] font-black text-slate-400 uppercase mb-0.5", children: key }), _jsx("span", { className: "text-xs font-bold text-slate-700 truncate", title: value, children: value })] }, key))) })] })), Object.keys(formData.fittingSpecs || {}).length > 0 && (_jsxs("div", { className: "bg-slate-50/50 p-3 rounded-2xl border border-slate-100", children: [_jsx("h5", { className: "text-[8px] font-black text-slate-400 uppercase tracking-wider mb-2 ml-1", children: t('productForm.fitting_dimensions') }), _jsx("div", { className: "grid grid-cols-3 gap-3", children: sortSpecs(formData.fittingSpecs, FITTING_ORDER)
                                                                                .map(([key, value]) => (_jsxs("div", { className: "bg-white p-2 rounded-xl border border-slate-100 flex flex-col shadow-sm", children: [_jsx("span", { className: "text-[7px] font-black text-slate-400 uppercase mb-0.5", children: key }), _jsx("span", { className: "text-xs font-bold text-slate-700 truncate", title: value, children: value })] }, key))) })] }))] })] }))] })] })] }), _jsxs("div", { className: "lg:col-span-5 space-y-4", children: [_jsxs("div", { className: "bg-slate-900 p-6 rounded-[40px] shadow-2xl text-white space-y-4", children: [_jsxs("h3", { className: "text-[10px] font-black uppercase text-blue-400 tracking-[0.2em] flex items-center gap-3 italic", children: [_jsx(Hash, { size: 16 }), " ", t('productForm.system_link')] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "space-y-1.5 text-left", children: [_jsx("label", { className: "text-[8px] font-black text-slate-500 uppercase ml-2", children: t('productForm.generated_system_name') }), _jsx("input", { readOnly: true, className: "w-full p-4 bg-white/5 border border-white/10 rounded-xl font-black text-lg text-white italic tracking-tighter outline-none", value: generatedProductName })] }), _jsxs("div", { className: "space-y-1.5 text-left relative", children: [_jsx("label", { className: "text-[8px] font-black text-slate-500 uppercase ml-2", children: t('productForm.infor_ln_code') }), _jsxs("div", { className: "relative", children: [_jsx("input", { className: `w-full p-4 pr-20 bg-white/5 border rounded-xl font-mono text-xs font-bold text-white focus:border-blue-500 outline-none transition-all ${isAutoLinked ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'border-white/10'}`, value: formData.articleCode, onChange: (e) => {
                                                                        setFormData({ ...formData, articleCode: e.target.value });
                                                                        setIsAutoLinked(false);
                                                                        setSearchEnabled(true);
                                                                        setShowLnResults(false);
                                                                    }, onKeyDown: (e) => e.key === 'Enter' && setSearchEnabled(true), placeholder: t('productForm.search_placeholder') }), _jsxs("div", { className: "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1", children: [isAutoLinked && (_jsx("div", { className: "text-emerald-400 bg-emerald-400/10 p-1.5 rounded-lg animate-in zoom-in", title: "Automatisch gekoppeld aan configuratie", children: _jsx(Link, { size: 14 }) })), _jsx("button", { onClick: () => setSearchEnabled(true), className: "p-2 text-slate-400 hover:text-white transition-colors", type: "button", children: isSearchingLn ? _jsx(Loader2, { size: 16, className: "animate-spin" }) : _jsx(Search, { size: 16 }) })] })] }), showLnResults && (_jsx("div", { className: "absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto", children: lnSearchResults.length > 0 ? (lnSearchResults.map((res, idx) => (_jsxs("button", { type: "button", onClick: () => {
                                                                    setFormData(prev => ({ ...prev, articleCode: res.targetProductId || res.manufacturedId }));
                                                                    setIsAutoLinked(true);
                                                                    setSearchEnabled(false);
                                                                    setShowLnResults(false);
                                                                }, className: "w-full p-3 text-left hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-0 flex flex-col", children: [_jsx("span", { className: "text-xs font-bold text-white font-mono", children: res.manufacturedId }), _jsx("span", { className: "text-[10px] text-slate-400 truncate", children: res.description || "Geen beschrijving" })] }, idx)))) : (_jsx("div", { className: "p-3 text-center", children: _jsx("span", { className: "text-xs text-slate-400", children: t('productForm.no_results') }) })) }))] })] })] }), _jsxs("div", { className: "bg-white p-6 rounded-[40px] border border-slate-200 shadow-sm space-y-4", children: [_jsxs("h3", { className: "text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3 italic", children: [_jsx(ImageIcon, { size: 16, className: "text-blue-500" }), " ", t('productForm.image_pdf_upload')] }), _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2 block", children: t('productForm.product_image') }), _jsxs("div", { className: "flex gap-3", children: [_jsxs("label", { className: "flex-1 flex flex-col items-center justify-center h-32 border-2 border-slate-100 border-dashed rounded-2xl cursor-pointer bg-slate-50/50 hover:bg-blue-50 hover:border-blue-200 transition-all group", children: [_jsxs("div", { className: "flex flex-col items-center justify-center pt-5 pb-6", children: [_jsx(ImageIcon, { className: "w-8 h-8 text-slate-300 group-hover:text-blue-500 mb-2 transition-colors" }), _jsx("p", { className: "text-[10px] font-bold text-slate-400 group-hover:text-blue-600 uppercase tracking-widest", children: formData.imageFile ? formData.imageFile.name : t('productForm.click_to_upload') })] }), _jsx("input", { type: "file", accept: "image/*", onChange: handleImageChange, className: "hidden" })] }), _jsxs("button", { type: "button", onClick: () => { setPickerMode('image'); setShowStoragePicker(true); }, className: "w-32 h-32 flex flex-col items-center justify-center bg-white border-2 border-slate-100 rounded-2xl hover:border-blue-500 hover:text-blue-600 text-slate-400 transition-all shadow-sm active:scale-95", children: [_jsx(Folder, { size: 24, className: "mb-2" }), _jsx("span", { className: "text-[10px] font-black uppercase tracking-widest", children: t('productForm.library') })] })] }), (imagePreview || (formData.imageUrl && !formData.imageFile)) && (_jsxs("div", { className: "mt-4 p-2 bg-slate-50 rounded-2xl border border-slate-100 w-fit relative", children: [_jsx("img", { src: imagePreview || formData.imageUrl, alt: "Product Preview", className: "h-32 rounded-xl object-contain bg-white shadow-sm border border-slate-100" }), imagePreview && (_jsx("div", { className: "absolute bottom-2 right-2 bg-blue-600/80 text-white text-[9px] font-bold px-2 py-1 rounded-lg backdrop-blur-sm", children: t('productForm.new') }))] }))] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2 block", children: t('productForm.technical_pdfs') }), _jsxs("div", { className: "flex gap-3", children: [_jsxs("label", { className: "flex-1 flex flex-col items-center justify-center h-32 border-2 border-slate-100 border-dashed rounded-2xl cursor-pointer bg-slate-50/50 hover:bg-blue-50 hover:border-blue-200 transition-all group", children: [_jsxs("div", { className: "flex flex-col items-center justify-center pt-5 pb-6", children: [_jsx(FileText, { className: "w-8 h-8 text-slate-300 group-hover:text-blue-500 mb-2 transition-colors" }), _jsx("p", { className: "text-[10px] font-bold text-slate-400 group-hover:text-blue-600 uppercase tracking-widest", children: formData.pdfFiles && formData.pdfFiles.length > 0
                                                                                        ? `${formData.pdfFiles.length} ${t('productForm.files_selected')}`
                                                                                        : t('productForm.click_to_upload_pdfs') })] }), _jsx("input", { type: "file", accept: "application/pdf", multiple: true, onChange: handlePdfChange, className: "hidden" })] }), _jsxs("button", { type: "button", onClick: () => { setPickerMode('pdf'); setShowStoragePicker(true); }, className: "w-32 h-32 flex flex-col items-center justify-center bg-white border-2 border-slate-100 rounded-2xl hover:border-blue-500 hover:text-blue-600 text-slate-400 transition-all shadow-sm active:scale-95", children: [_jsx(Folder, { size: 24, className: "mb-2" }), _jsx("span", { className: "text-[10px] font-black uppercase tracking-widest", children: t('productForm.library') })] })] }), formData.pdfFiles && formData.pdfFiles.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-2 mt-2", children: formData.pdfFiles.map((f, i) => (_jsxs("span", { className: "px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold border border-blue-100 flex items-center gap-2", children: [_jsx(CheckCircle2, { size: 10 }), " ", f.name] }, i))) })), formData.sourcePdfs && formData.sourcePdfs.length > 0 && !formData.pdfFiles.length && (_jsx("div", { className: "flex flex-wrap gap-2 mt-2", children: formData.sourcePdfs.map((url, i) => (_jsxs("a", { href: url, target: "_blank", rel: "noopener noreferrer", className: "px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center gap-2", children: [_jsx(FileText, { size: 12 }), " PDF ", i + 1] }, i))) }))] })] })] }), _jsxs("div", { className: "bg-white p-6 rounded-[35px] border border-slate-200 shadow-sm flex flex-col justify-center gap-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(ShieldCheck, { size: 18, className: "text-emerald-500" }), _jsx("span", { className: "text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none", children: t('productForm.master_data_selection') })] }), _jsx("p", { className: "text-[10px] font-medium text-slate-400 leading-relaxed italic", children: t('productForm.master_data_desc') })] }), _jsxs("div", { className: "bg-white p-6 rounded-[35px] border border-slate-200 shadow-sm flex flex-col gap-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(ShieldCheck, { size: 18, className: "text-emerald-500" }), _jsx("span", { className: "text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none", children: t('productForm.verification_control') })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2", children: t('productForm.assign_verifier') }), _jsxs("select", { className: "w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all cursor-pointer", value: formData.assignedVerifier || "", onChange: (e) => setFormData({ ...formData, assignedVerifier: e.target.value }), children: [_jsx("option", { value: "", children: t('productForm.choose_verifier') }), verifiers.map(v => (_jsx("option", { value: v.id, children: v.name }, v.id)))] }), _jsx("p", { className: "text-[9px] text-slate-400 italic ml-2", children: t('productForm.verifier_note') })] }), isAdminUser && (_jsxs("label", { className: "flex items-start gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50/70 cursor-pointer", children: [_jsx("input", { type: "checkbox", checked: adminOverride4Eyes, onChange: (e) => setAdminOverride4Eyes(e.target.checked), className: "mt-1" }), _jsx("span", { className: "text-[11px] font-bold text-amber-800 leading-relaxed", children: "Tijdelijke Admin Override (4-ogen): direct als geverifieerd opslaan voor test van catalogus/tekeningen." })] }))] }), _jsxs("div", { className: "p-8 bg-blue-50 rounded-[35px] border border-blue-100 flex items-start gap-4", children: [_jsx(Info, { size: 20, className: "text-blue-500 shrink-0 mt-0.5" }), _jsx("p", { className: "text-[10px] font-bold text-blue-700/70 leading-relaxed uppercase tracking-wider italic", children: t('productForm.pending_status_info') })] })] })] }) }), showStoragePicker && (_jsx(StoragePicker, { onClose: () => setShowStoragePicker(false), onSelect: handleStorageSelect, initialPath: `product_library/${(formData.type || "Other").replace(/\s+/g, "_")}${formData.angle ? `_${formData.angle}` : ""}/${(formData.connection || "None").replace(/\//g, "-")}` }))] }));
};
const StoragePicker = ({ onClose, onSelect, initialPath = "product_library" }) => {
    const { t } = useTranslation();
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
                const files = await Promise.all(res.items.map(async (i) => {
                    const url = await getDownloadURL(i);
                    return {
                        name: i.name,
                        fullPath: i.fullPath,
                        url,
                        isFolder: false
                    };
                }));
                setItems([...folders, ...files]);
            }
            catch (error) {
                console.error("Error listing files", error);
                // Als pad niet bestaat, probeer root
                if (currentPath !== "product_library") {
                    setCurrentPath("product_library");
                }
            }
            finally {
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
    return (_jsx("div", { className: "fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white w-full max-w-3xl rounded-[30px] shadow-2xl flex flex-col max-h-[80vh] overflow-hidden", children: [_jsxs("div", { className: "p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "p-2 bg-blue-100 text-blue-600 rounded-lg", children: _jsx(Folder, { size: 20 }) }), _jsxs("div", { children: [_jsx("h3", { className: "font-black text-slate-800 uppercase text-sm tracking-wide", children: t('productForm.library') }), _jsxs("p", { className: "text-[10px] text-slate-400 font-mono", children: ["/", currentPath] })] })] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-slate-200 rounded-full transition-colors", children: _jsx(XIcon, { size: 20 }) })] }), _jsx("div", { className: "p-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2", children: _jsx("button", { onClick: handleUp, disabled: !currentPath || currentPath === "product_library", className: "p-2 hover:bg-white rounded-lg disabled:opacity-30 transition-all text-slate-600", title: t('productForm.up'), children: _jsx(CornerUpLeft, { size: 18 }) }) }), _jsx("div", { className: "flex-1 overflow-y-auto p-6 bg-slate-50/30", children: loading ? (_jsx("div", { className: "flex justify-center py-10", children: _jsx(Loader2, { className: "animate-spin text-blue-500" }) })) : (_jsxs("div", { className: "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4", children: [items.map((item) => (_jsxs("button", { onClick: () => item.isFolder ? handleNavigate(item.fullPath) : onSelect(item.url, item.name), className: "flex flex-col items-center p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-400 hover:shadow-md transition-all group text-center h-32 justify-center", children: [item.isFolder ? (_jsx(Folder, { size: 32, className: "text-blue-300 group-hover:text-blue-500 mb-2 transition-colors" })) : (_jsx(FileText, { size: 32, className: "text-slate-300 group-hover:text-slate-500 mb-2 transition-colors" })), _jsx("span", { className: "text-[10px] font-bold text-slate-600 group-hover:text-slate-900 line-clamp-2 leading-tight break-all", children: item.name })] }, item.fullPath))), items.length === 0 && (_jsx("div", { className: "col-span-full text-center py-10 text-slate-400 italic text-xs", children: t('productForm.no_files_found') }))] })) })] }) }));
};
export default ProductForm;
