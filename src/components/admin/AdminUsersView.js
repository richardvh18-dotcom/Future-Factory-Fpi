import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Users, Search, Loader2, ShieldCheck, Trash2, Mail, Edit3, X, Save, UserCircle, ShieldAlert, ChevronDown, Database, Fingerprint, CheckCircle2, AlertCircle, Clock, UserPlus, Check, Globe, Key, RefreshCcw, Layers, Briefcase, MapPin, Tag, } from "lucide-react";
import { db, auth, firebaseConfig, logActivity } from "../../config/firebase";
import { initializeApp, deleteApp, getApps } from "firebase/app";
import { collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, serverTimestamp, setDoc, writeBatch, } from "firebase/firestore";
import { PATHS, isValidPath } from "../../config/dbPaths";
import { createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import { useNotifications } from "../../contexts/NotificationContext";
/**
 * AdminUsersView V7.0 - Dynamic Role & Access Controller
 * - Volledig dynamisch rollenbeheer via DB
 * - Global Text Selection Fix (Force Enable)
 * - Geavanceerd gebruikersbeheer
 */
const AdminUsersView = () => {
    const { t } = useTranslation();
    const { showConfirm, notify } = useNotifications();
    const [users, setUsers] = useState([]);
    const [accountRequests, setAccountRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedDepartment, setSelectedDepartment] = useState("");
    const [selectedRole, setSelectedRole] = useState("");
    const [selectedUser, setSelectedUser] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null);
    const [editModalTab, setEditModalTab] = useState("profile");
    const [activeTab, setActiveTab] = useState("users"); // 'users' of 'requests'
    const [showAddUserModal, setShowAddUserModal] = useState(false);
    const [expandedCountries, setExpandedCountries] = useState({}); // State voor inklapbare groepen
    const [expandedModules, setExpandedModules] = useState({}); // State voor uitgevouwen modules in permissions
    const [allStations, setAllStations] = useState([]);
    const [stationFilterCountry, setStationFilterCountry] = useState("All");
    const [stationFilterDept, setStationFilterDept] = useState("All");
    // Roles State
    const [roles, setRoles] = useState([]);
    const [, setLoadingRoles] = useState(true);
    const [isUsingDefaults, setIsUsingDefaults] = useState(false);
    const [newRole, setNewRole] = useState({ id: "", label: "", color: "bg-slate-400" });
    const [newUser, setNewUser] = useState({
        name: "",
        email: "",
        country: "",
        department: "",
        role: "guest",
        tempPassword: "",
        requirePasswordChange: true
    });
    const ROLE_COLORS = [
        { bg: "bg-blue-600", label: "Blauw" },
        { bg: "bg-purple-600", label: "Paars" },
        { bg: "bg-emerald-600", label: "Groen" },
        { bg: "bg-orange-600", label: "Oranje" },
        { bg: "bg-red-600", label: "Rood" },
        { bg: "bg-pink-600", label: "Roze" },
        { bg: "bg-cyan-600", label: "Cyaan" },
        { bg: "bg-slate-400", label: "Grijs" },
        { bg: "bg-yellow-500", label: "Geel" },
        { bg: "bg-indigo-600", label: "Indigo" },
        { bg: "bg-rose-600", label: "Donkerrood" },
        { bg: "bg-teal-600", label: "Teal" },
        { bg: "bg-fuchsia-600", label: "Fuchsia" },
        { bg: "bg-lime-600", label: "Lime" },
    ];
    const COUNTRIES = [
        "Nederland", // Values kept as-is for DB consistency
        "België",
        "Duitsland",
        "Frankrijk",
        "Verenigd Koninkrijk",
        "Anders"
    ];
    const DEPARTMENTS = [
        "Productie - Fittings", // Values kept as-is for DB consistency
        "Productie - Pipes",
        "Productie - Spools",
        "Kwaliteitscontrole",
        "Planning",
        "Logistiek",
        "Magazijn",
        "Onderhoud",
        "Management",
        "Administratie",
        "Anders"
    ];
    // ─── KERN MODULES ─────────────────────────────────────────────────────────
    // Planning, Catalogus en Inbox zijn altijd beschikbaar voor iedere gebruiker.
    // Sub-features kun je wél per gebruiker aan/uitzetten.
    const CORE_MODULE_FEATURES = {
        planning: {
            label: "Planning",
            description: "Afdelingen, werkstations en productie starten",
            alwaysEnabled: true,
            features: [
                { id: "terminal_view", label: "Terminal / Werkstation", description: "Productie starten en lotnummers verwerken" },
                { id: "capacity_planning", label: "Capaciteits Planning", description: "Capaciteit en werkstations inplannen" },
                { id: "production_times", label: "Productie Tijden", description: "Productie schema's en doorlooptijden" },
                { id: "demand_planning", label: "Vraag Planning", description: "Vraagplanning en vooruitzichten" },
            ]
        },
        catalog: {
            label: "Catalogus",
            description: "Alle tekeningen, producten en specificaties",
            alwaysEnabled: true,
            features: [
                { id: "product_search", label: "Product Zoeken", description: "Producten en materialen zoeken" },
                { id: "drawing_viewer", label: "Tekeningen Bekijken", description: "Technische tekeningen inzien" },
                { id: "ai_chat", label: "AI Chat (in Catalogus)", description: "AI-assistent binnen de catalogus" },
            ]
        },
        inbox: {
            label: "Inbox / Berichten",
            description: "Notificaties, mededelingen en directe berichten",
            alwaysEnabled: true,
            features: [
                { id: "notifications", label: "Notificaties", description: "Systeemmeldingen en alerts" },
                { id: "announcements", label: "Mededelingen", description: "Bedrijfsmededelingen" },
                { id: "direct_messages", label: "Directe Berichten", description: "Persoonlijke berichten sturen en ontvangen" },
            ]
        },
    };
    // ─── OPTIONELE MODULES ────────────────────────────────────────────────────
    // Deze modules moeten expliciet worden ingeschakeld per gebruiker.
    const MODULE_FEATURES = {
        digital_planning: {
            label: "Planning Tools (Admin Hub)",
            description: "Geavanceerde planningsmodules: Capaciteit, Kanban, Tijden, Scenario's",
            features: [
                { id: "capacity_planning", label: "Capaciteits Planning", description: "Vergelijk beschikbare uren met geplande vraag" },
                { id: "production_times", label: "Productie Tijden", description: "Standaard tijden en normen beheren" },
                { id: "kanban", label: "Kanban Board", description: "Visuele orderworkflow met drag-and-drop" },
                { id: "order_dependencies", label: "Order Dependencies", description: "Critical path analyse tussen orders" },
                { id: "scenarios", label: "Scenario Planning", description: "What-if analyse simulator" },
            ]
        },
        ai_assistant: {
            label: t('modules.ai', "AI Assistent (Volledig)"),
            description: t('modules.aiDesc', "Volledige AI helper buiten de catalogus"),
            features: [
                { id: "chat_enabled", label: "Chat Functie", description: "AI chat interface" },
                { id: "document_analysis", label: "Document Analyse", description: "Documenten en teksten analyseren" },
                { id: "recommendations", label: "Aanbevelingen", description: "AI-gestuurd advies" },
                { id: "ai_training", label: "AI Training & QA", description: "AI antwoorden en kennisbank beheren" },
            ]
        },
        quality_control: {
            label: t('modules.qc', "Kwaliteitscontrole (QC)"),
            description: t('modules.qcDesc', "Toegang tot meetwaarden en NCR"),
            features: [
                { id: "measurements", label: "Meetwaarden", description: "TG, Brix en andere metingen" },
                { id: "ncr_management", label: "NCR Beheer", description: "Non-conformity reports" },
                { id: "inspection", label: "Inspectie", description: "Eindcontrole en inspecties" },
                { id: "shopfloor_mobile", label: "Mobile Inspector", description: "Tablet app voor teamleiders en QC op de werkvloer" },
            ]
        },
        inventory_management: {
            label: t('modules.inventory', "Voorraadbeheer"),
            description: t('modules.inventoryDesc', "Beheer van gereedschap en materialen"),
            features: [
                { id: "stock_tracking", label: "Voorraadbijhouding", description: "Materiaal tracking en niveaus" },
                { id: "tools_management", label: "Gereedschapbeheer", description: "Gereedschap en uitrusting" },
            ]
        },
        maintenance: {
            label: t('modules.maintenance', "Onderhoud"),
            description: t('modules.maintenanceDesc', "Meldingen en onderhoudsbeheer"),
            features: [
                { id: "maintenance_requests", label: "Onderhoudsmeldingen", description: "Equipment onderhoud melden" },
                { id: "downtime_tracking", label: "Downtime Tracking", description: "Machine downtime registratie" },
            ]
        },
    };
    // Admin tool IDs die gemigreerd worden uit het oude modules-systeem
    const LEGACY_ADMIN_TOOL_IDS = ["admin_products", "admin_factory", "admin_settings", "admin_logs"];
    // 1. Live Sync met de Root Accounts collectie
    useEffect(() => {
        if (!isValidPath("USERS"))
            return;
        setLoading(true);
        const usersRef = collection(db, ...PATHS.USERS);
        const q = query(usersRef, orderBy("name", "asc"));
        const unsubUsers = onSnapshot(q, (snapshot) => {
            setUsers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }, (err) => {
            console.error("Firestore Identity Error:", err);
            setLoading(false);
        });
        return () => unsubUsers();
    }, []);
    // 1b. Live Sync met Roles
    useEffect(() => {
        const rolesRef = collection(db, "future-factory", "settings", "roles");
        const q = query(rolesRef, orderBy("label", "asc"));
        const unsub = onSnapshot(q, (snap) => {
            if (!snap.empty) {
                setRoles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                setIsUsingDefaults(false);
            }
            else {
                // Fallback defaults als DB leeg is
                setRoles([
                    { id: "admin", label: "Master Admin", color: "bg-blue-600" },
                    { id: "engineer", label: "Process Engineer", color: "bg-purple-600" },
                    { id: "teamleader", label: "Teamleider", color: "bg-emerald-600" },
                    { id: "operator", label: "Machine Operator", color: "bg-orange-600" },
                    { id: "guest", label: "Geen Toegang (Guest)", color: "bg-slate-400" },
                ]);
                setIsUsingDefaults(true);
            }
            setLoadingRoles(false);
        });
        return () => unsub();
    }, []);
    // Filtering en Grouping
    const filteredUsers = useMemo(() => {
        return users.filter((u) => {
            const matchesSearch = u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                u.role?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                u.id?.toLowerCase().includes(searchTerm.toLowerCase()); // Zoek ook op UID
            const matchesDept = selectedDepartment ? u.department === selectedDepartment : true;
            const matchesRole = selectedRole ? u.role === selectedRole : true;
            return matchesSearch && matchesDept && matchesRole;
        });
    }, [users, searchTerm, selectedDepartment, selectedRole]);
    // Groepeer gebruikers per land
    const usersByCountry = useMemo(() => {
        const grouped = {};
        filteredUsers.forEach(user => {
            const country = user.country || "Onbekend";
            if (!grouped[country]) {
                grouped[country] = [];
            }
            grouped[country].push(user);
        });
        return grouped;
    }, [filteredUsers]);
    // 2. Live Sync met Account Requests
    useEffect(() => {
        if (!isValidPath("USERS"))
            return;
        const requestsRef = collection(db, ...PATHS.ACCOUNT_REQUESTS);
        const q = query(requestsRef, orderBy("createdAt", "desc"));
        const unsubRequests = onSnapshot(q, (snapshot) => {
            setAccountRequests(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        }, (err) => {
            console.error("Account Requests Error:", err);
        });
        return () => unsubRequests();
    }, []);
    // 3. Stations ophalen uit Factory Config voor selectie
    useEffect(() => {
        const unsubConfig = onSnapshot(doc(db, ...PATHS.FACTORY_CONFIG), (snap) => {
            if (snap.exists()) {
                const config = snap.data();
                const stations = [];
                if (config.departments) {
                    config.departments.forEach(dept => {
                        if (dept.stations) {
                            dept.stations.forEach(st => {
                                stations.push({
                                    id: st.name,
                                    name: st.name,
                                    department: dept.title || dept.name || "Overig",
                                    country: dept.country || "Overig"
                                });
                            });
                        }
                    });
                }
                // Voeg speciale rollen toe
                stations.push({ id: 'TEAMLEADER', name: 'Teamleader Hub', department: 'Management', country: 'Global' });
                setAllStations(stations);
            }
        });
        return () => unsubConfig();
    }, []);
    // Voeg nieuwe gebruiker toe
    const handleAddUser = async () => {
        if (!newUser.name || !newUser.email) {
            setStatus({ type: "error", message: "Naam en email zijn verplicht" });
            return;
        }
        setSaving(true);
        setStatus(null);
        // Gebruik opgegeven wachtwoord of genereer een nieuwe
        const passwordToUse = newUser.tempPassword || generateTempPassword();
        let secondaryApp = null;
        let selectedUid;
        let isExistingUser = false;
        try {
            try {
                // Controleer of configuratie beschikbaar is
                if (!firebaseConfig) {
                    throw new Error("Firebase configuratie niet gevonden. Zorg dat 'firebaseConfig' geëxporteerd wordt in src/config/firebase.js");
                }
                // Voorkom 'App already exists' errors door te checken of hij al bestaat
                const existingApp = getApps().find(app => app.name === "SecondaryApp");
                if (existingApp) {
                    await deleteApp(existingApp);
                }
                // Maak een SECONDARY app instance om de user aan te maken 
                // zonder de huidige admin uit te loggen.
                secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
                const secondaryAuth = getAuth(secondaryApp);
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUser.email, passwordToUse);
                selectedUid = userCredential.user.uid;
                // Log de nieuwe user direct weer uit op de secondary app
                await signOut(secondaryAuth);
            }
            catch (authError) {
                if (authError.code === "auth/email-already-in-use") {
                    // Gebruiker bestaat al in Auth
                    isExistingUser = true;
                    setStatus({
                        type: "warning",
                        message: `⚠️ Deze gebruiker bestaat al in Firebase Authentication!\n\n` +
                            `OPLOSSING 1: Ga naar Firebase Console > Authentication en verwijder de gebruiker eerst.\n` +
                            `OPLOSSING 2: Als dit een migratie is, voer de UID in van de bestaande gebruiker (zie console log).`,
                    });
                    console.warn("🔍 IMPORT INSTRUCTIES:", {
                        email: newUser.email,
                        message: "Deze gebruiker bestaat al in Firebase Auth",
                        stappen: [
                            "1. Open Firebase Console (https://console.firebase.google.com)",
                            "2. Ga naar Authentication > Users",
                            "3. Zoek naar: " + newUser.email,
                            "4. Kopieer de User UID",
                            "5. Voer de UID hieronder in:"
                        ]
                    });
                    const uid = prompt(`Deze gebruiker bestaat al in Firebase Authentication.\n\n` +
                        `Als je deze gebruiker wilt IMPORTEREN (migreren van oude database):\n` +
                        `➜ Voer de UID in (zie console voor instructies)\n\n` +
                        `Als je wilt ANNULEREN:\n` +
                        `➜ Laat leeg of druk op Cancel\n\n` +
                        `Als je de gebruiker wilt VERWIJDEREN:\n` +
                        `➜ Ga naar Firebase Console > Authentication`);
                    if (!uid || uid.trim() === "") {
                        setStatus({
                            type: "info",
                            message: "Import geannuleerd.",
                        });
                        setSaving(false);
                        if (secondaryApp)
                            await deleteApp(secondaryApp);
                        return;
                    }
                    // Valideer UID 
                    selectedUid = uid.trim();
                    if (selectedUid.length < 5) {
                        throw new Error("Ongeldige UID opgegeven.", { cause: authError });
                    }
                }
                else {
                    throw authError;
                }
            }
            finally {
                // Ruim de secondary app op
                if (secondaryApp) {
                    await deleteApp(secondaryApp);
                }
            }
            // Voeg gebruiker toe aan Firestore (gebruikmakend van de MAIN app db)
            await setDoc(doc(db, ...PATHS.USERS, selectedUid), {
                name: newUser.name,
                email: newUser.email,
                country: newUser.country || "Nederland",
                department: newUser.department || "Anders",
                role: newUser.role,
                modules: [], // Standaard geen modules toegang
                requirePasswordChange: newUser.requirePasswordChange, // Gebruik de checkbox waarde
                createdAt: serverTimestamp(),
                createdBy: auth.currentUser?.email || "Admin",
                imported: isExistingUser,
                importedAt: isExistingUser ? serverTimestamp() : null,
            });
            await logActivity(auth.currentUser?.uid, "USER_CREATE", `User created: ${newUser.email} (${newUser.role})`);
            setStatus({
                type: "success",
                message: isExistingUser
                    ? `✅ Gebruiker succesvol geïmporteerd!`
                    : `✅ Gebruiker aangemaakt! Tijdelijk wachtwoord: ${passwordToUse}`,
            });
            setShowAddUserModal(false);
            setNewUser({
                name: "",
                email: "",
                country: "",
                department: "",
                role: "guest",
                tempPassword: "",
                requirePasswordChange: true
            });
        }
        catch (err) {
            console.error("Fout bij toevoegen gebruiker:", err);
            const errorMessage = err.code === "auth/invalid-email"
                ? "Ongeldig email-adres"
                : err.code === "auth/weak-password"
                    ? "Wachtwoord is te zwak (minimaal 6 karakters)"
                    : err.code === "auth/email-already-in-use"
                        ? "E-mailadres is al in gebruik (en import geannuleerd)."
                        : err.message;
            setStatus({
                type: "error",
                message: errorMessage,
            });
        }
        finally {
            setSaving(false);
        }
    };
    // Role Management Handlers
    const handleAddRole = async () => {
        if (!newRole.id || !newRole.label)
            return notify("ID en Label zijn verplicht");
        const roleId = newRole.id.toLowerCase().replace(/\s+/g, "_");
        try {
            await setDoc(doc(db, "future-factory", "settings", "roles", roleId), {
                id: roleId,
                label: newRole.label,
                color: newRole.color
            });
            setNewRole({ id: "", label: "", color: "bg-slate-400" });
            setStatus({ type: "success", message: "Rol toegevoegd" });
        }
        catch (e) {
            console.error(e);
            setStatus({ type: "error", message: "Fout bij toevoegen rol" });
        }
    };
    const handleDeleteRole = async (roleId) => {
        const confirmed = await showConfirm({
            title: "Rol verwijderen",
            message: "Rol verwijderen?",
            confirmText: "Verwijderen",
            cancelText: "Annuleren",
            tone: "danger",
        });
        if (!confirmed)
            return;
        try {
            await deleteDoc(doc(db, "future-factory", "settings", "roles", roleId));
        }
        catch (e) {
            console.error(e);
        }
    };
    const handleInitRoles = async () => {
        const batch = writeBatch(db);
        roles.forEach(role => {
            const ref = doc(db, "future-factory", "settings", "roles", role.id);
            batch.set(ref, role);
        });
        await batch.commit();
    };
    // 3. Handlers
    const handleEdit = (user) => {
        setSelectedUser({
            ...user,
            modules: user.modules || [],
            permissions: user.permissions || {},
            allowedStations: user.allowedStations || []
        });
        setEditModalTab("profile");
        setStationFilterCountry("All");
        setStationFilterDept("All");
        setExpandedModules({}); // Reset expanded modules
        setIsEditing(true);
    };
    // Reset wachtwoord voor gebruiker (via Firebase Auth Admin SDK zou beter zijn, maar we gebruiken email reset)
    const handleResetPassword = async (userEmail) => {
        const confirmed = await showConfirm({
            title: "Wachtwoord reset",
            message: `Wachtwoord reset link sturen naar ${userEmail}?`,
            confirmText: "Versturen",
            cancelText: "Annuleren",
            tone: "warning",
        });
        if (!confirmed) {
            return;
        }
        try {
            const { sendPasswordResetEmail } = await import("firebase/auth");
            await sendPasswordResetEmail(auth, userEmail);
            setStatus({
                type: "success",
                message: `Reset link verzonden naar ${userEmail}. Gebruiker kan via email een nieuw wachtwoord instellen.`,
            });
        }
        catch (err) {
            console.error("Reset fout:", err);
            setStatus({
                type: "error",
                message: `Fout bij versturen reset link: ${err.message}`,
            });
        }
    };
    // Genereer tijdelijk wachtwoord
    const generateTempPassword = () => {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        let password = "";
        for (let i = 0; i < 12; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    };
    // Accepteer account aanvraag
    const handleAcceptRequest = async (request) => {
        if (saving)
            return;
        setSaving(true);
        setStatus(null);
        try {
            const tempPassword = generateTempPassword();
            // Maak gebruiker aan in Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, request.email, tempPassword);
            // Voeg gebruiker toe aan Firestore
            await setDoc(doc(db, ...PATHS.USERS, userCredential.user.uid), {
                name: request.name,
                email: request.email,
                country: request.country,
                department: request.department,
                role: "guest", // Standaard rol
                modules: [], // Standaard geen modules toegang
                requirePasswordChange: true, // Moet wachtwoord wijzigen bij eerste login
                createdAt: serverTimestamp(),
                createdBy: auth.currentUser?.email || "Admin",
                approved: true,
                approvedAt: serverTimestamp(),
            });
            await logActivity(auth.currentUser?.uid, "USER_CREATE", `User request approved: ${request.email}`);
            // Update de request status
            await updateDoc(doc(db, ...PATHS.ACCOUNT_REQUESTS, request.id), {
                status: "approved",
                processedAt: serverTimestamp(),
                processedBy: auth.currentUser?.email || "Admin",
            });
            setStatus({
                type: "success",
                message: `Account aangemaakt! Tijdelijk wachtwoord: ${tempPassword} (deel dit met de gebruiker)`,
            });
        }
        catch (err) {
            console.error("Fout bij accepteren aanvraag:", err);
            setStatus({
                type: "error",
                message: `Fout: ${err.message}`,
            });
        }
        finally {
            setSaving(false);
        }
    };
    // Weiger account aanvraag
    const handleRejectRequest = async (requestId) => {
        if (saving)
            return;
        setSaving(true);
        try {
            await updateDoc(doc(db, ...PATHS.ACCOUNT_REQUESTS, requestId), {
                status: "rejected",
                processedAt: serverTimestamp(),
                processedBy: auth.currentUser?.email || "Admin",
            });
            await logActivity(auth.currentUser?.uid, "USER_REJECT", `Account request rejected: ${requestId}`);
            setStatus({ type: "success", message: "Aanvraag geweigerd" });
        }
        catch (err) {
            console.error("Fout bij weigeren:", err);
            setStatus({ type: "error", message: "Fout bij weigeren aanvraag" });
        }
        finally {
            setSaving(false);
        }
    };
    const handleUpdateUser = async () => {
        if (!selectedUser || saving)
            return;
        setSaving(true);
        try {
            const userRef = doc(db, ...PATHS.USERS, selectedUser.id);
            await updateDoc(userRef, {
                name: selectedUser.name,
                role: selectedUser.role,
                country: selectedUser.country,
                department: selectedUser.department,
                // Migreer: verwijder legacy admin tool IDs uit modules-array (vervangen door rolsysteem)
                modules: (selectedUser.modules || []).filter(m => !LEGACY_ADMIN_TOOL_IDS.includes(m)),
                permissions: selectedUser.permissions || {}, // Granulaire module/feature permissions
                allowedStations: selectedUser.allowedStations || [],
                defaultRoute: selectedUser.defaultRoute || "",
                defaultStation: selectedUser.defaultStation || "",
                canVerify: selectedUser.canVerify || false,
                receivesCrashReports: selectedUser.receivesCrashReports || false,
                signature: selectedUser.signature || "",
                lastAdminUpdate: serverTimestamp(),
                updatedBy: auth.currentUser?.email || "Master Admin",
            });
            await logActivity(auth.currentUser?.uid, "USER_ROLE_CHANGE", `User updated: ${selectedUser.email}. Role: ${selectedUser.role}`);
            setStatus({ type: "success", msg: "Gebruikersprofiel bijgewerkt" });
            setTimeout(() => setStatus(null), 3000);
            setIsEditing(false);
        }
        catch (err) {
            notify("Update mislukt: " + err.message);
        }
        finally {
            setSaving(false);
        }
    };
    const handleDelete = async (userId) => {
        const confirmed = await showConfirm({
            title: "Gebruiker verwijderen",
            message: "Account permanent verwijderen uit de root? Dit blokkeert direct alle toegang.",
            confirmText: "Verwijderen",
            cancelText: "Annuleren",
            tone: "danger",
        });
        if (!confirmed)
            return;
        try {
            const userRef = doc(db, ...PATHS.USERS, userId);
            await deleteDoc(userRef);
            await logActivity(auth.currentUser?.uid, "USER_DELETE", `User deleted: ${userId}`);
            setStatus({ type: "success", msg: "Gebruiker verwijderd" });
            setTimeout(() => setStatus(null), 3000);
        }
        catch (err) {
            notify(err.message);
        }
    };
    // Helper functies voor granulaire module permissions
    const toggleFeature = (moduleId, featureId) => {
        if (!selectedUser)
            return;
        const currentPermissions = selectedUser.permissions || {};
        const modulePerms = currentPermissions[moduleId] || [];
        const newModulePerms = modulePerms.includes(featureId)
            ? modulePerms.filter(f => f !== featureId)
            : [...modulePerms, featureId];
        setSelectedUser({
            ...selectedUser,
            permissions: {
                ...currentPermissions,
                [moduleId]: newModulePerms
            }
        });
    };
    const toggleModuleAll = (moduleId, enable) => {
        if (!selectedUser)
            return;
        const module = MODULE_FEATURES[moduleId];
        if (!module)
            return;
        const currentPermissions = selectedUser.permissions || {};
        const featureIds = module.features.map(f => f.id);
        setSelectedUser({
            ...selectedUser,
            permissions: {
                ...currentPermissions,
                [moduleId]: enable ? featureIds : []
            }
        });
    };
    const hasModule = (moduleId) => {
        const perms = selectedUser?.permissions || {};
        const modulePerms = perms[moduleId] || [];
        return modulePerms.length > 0;
    };
    const getModuleFeatureCount = (moduleId) => {
        const perms = selectedUser?.permissions || {};
        const modulePerms = perms[moduleId] || [];
        return modulePerms.length;
    };
    // Filter logica voor stations
    const filteredStations = useMemo(() => {
        return allStations.filter(s => {
            if (stationFilterCountry !== "All" && s.country !== stationFilterCountry)
                return false;
            if (stationFilterDept !== "All" && s.department !== stationFilterDept)
                return false;
            return true;
        });
    }, [allStations, stationFilterCountry, stationFilterDept]);
    const uniqueCountries = useMemo(() => ["All", ...new Set(allStations.map(s => s.country))].sort(), [allStations]);
    const uniqueDepts = useMemo(() => ["All", ...new Set(allStations.filter(s => stationFilterCountry === "All" || s.country === stationFilterCountry).map(s => s.department))].sort(), [allStations, stationFilterCountry]);
    if (loading)
        return (_jsxs("div", { className: "h-full flex flex-col items-center justify-center bg-slate-50 gap-4", children: [_jsx(Loader2, { className: "animate-spin text-blue-600", size: 48 }), _jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400 italic", children: "Identiteiten synchroniseren..." })] }));
    return (_jsxs("div", { className: "flex flex-col h-full bg-slate-50 text-left animate-in fade-in overflow-hidden", children: [_jsxs("div", { className: "p-8 bg-white border-b border-slate-200 shadow-sm shrink-0 z-10", children: [_jsxs("div", { className: "flex flex-col md:flex-row justify-between items-center gap-6 mb-6", children: [_jsxs("div", { className: "flex items-center gap-6", children: [_jsx("div", { className: "p-4 bg-slate-900 text-white rounded-[20px] shadow-xl", children: _jsx(Users, { size: 28 }) }), _jsxs("div", { className: "text-left", children: [_jsxs("h2", { className: "text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none", children: [t('access'), " ", _jsx("span", { className: "text-blue-600", children: t('controller') })] }), _jsxs("div", { className: "mt-3 flex items-center gap-3", children: [_jsxs("span", { className: "flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase italic", children: [_jsx(ShieldCheck, { size: 10 }), " ", t('rootProtected')] }), accountRequests.filter(r => r.status === "pending").length > 0 && (_jsxs("span", { className: "flex items-center gap-1.5 text-[9px] font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 uppercase italic animate-pulse", children: [_jsx(Clock, { size: 10 }), " ", accountRequests.filter(r => r.status === "pending").length, " ", t('inQueue')] }))] })] })] }), _jsxs("div", { className: "flex gap-3 w-full md:w-auto", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx(Search, { size: 18, className: "absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" }), _jsx("input", { type: "text", placeholder: "Zoek gebruiker...", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), className: "w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-sm focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-400" })] }), _jsxs("div", { className: "relative hidden xl:block min-w-[200px]", children: [_jsx(Briefcase, { size: 18, className: "absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" }), _jsxs("select", { value: selectedDepartment, onChange: (e) => setSelectedDepartment(e.target.value), className: "w-full pl-12 pr-10 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-sm focus:outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer text-slate-600", children: [_jsx("option", { value: "", children: t('adminUsers.allDepartments', "Alle Afdelingen") }), DEPARTMENTS.map((dept) => (_jsx("option", { value: dept, children: dept }, dept)))] }), _jsx(ChevronDown, { size: 16, className: "absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" })] }), _jsxs("div", { className: "relative hidden xl:block min-w-[200px]", children: [_jsx(ShieldCheck, { size: 18, className: "absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" }), _jsxs("select", { value: selectedRole, onChange: (e) => setSelectedRole(e.target.value), className: "w-full pl-12 pr-10 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-sm focus:outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer text-slate-600", children: [_jsx("option", { value: "", children: t('adminUsers.allRoles', "Alle Rollen") }), roles.map((role) => (_jsx("option", { value: role.id, children: role.label }, role.id)))] }), _jsx(ChevronDown, { size: 16, className: "absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" })] }), _jsxs("button", { onClick: () => setShowAddUserModal(true), className: "px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 shadow-lg whitespace-nowrap", children: [_jsx(UserPlus, { size: 18 }), _jsx("span", { className: "hidden md:inline", children: t('adminUsers.addUser', "Gebruiker Toevoegen") })] })] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { onClick: () => setActiveTab("users"), className: `px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all ${activeTab === "users"
                                    ? "bg-slate-900 text-white"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`, children: [_jsx(Users, { size: 16, className: "inline mr-2" }), t('adminUsers.users', "Gebruikers"), " (", users.length, ")"] }), _jsxs("button", { onClick: () => setActiveTab("requests"), className: `px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all relative ${activeTab === "requests"
                                    ? "bg-orange-500 text-white"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`, children: [_jsx(UserPlus, { size: 16, className: "inline mr-2" }), t('adminUsers.queue', "Wachtrij"), " (", accountRequests.filter(r => r.status === "pending").length, ")", accountRequests.filter(r => r.status === "pending").length > 0 && (_jsx("span", { className: "absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" }))] }), _jsxs("button", { onClick: () => setActiveTab("roles"), className: `px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all ${activeTab === "roles"
                                    ? "bg-purple-600 text-white"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`, children: [_jsx(Tag, { size: 16, className: "inline mr-2" }), t('adminUsers.roles', "Rollen")] })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-50/50", children: _jsxs("div", { className: "max-w-7xl mx-auto space-y-6", children: [status && (_jsx("div", { className: `p-5 rounded-2xl font-bold text-sm whitespace-pre-wrap ${status.type === "success"
                                ? "bg-green-50 text-green-700 border-2 border-green-200"
                                : status.type === "warning"
                                    ? "bg-amber-50 text-amber-800 border-2 border-amber-300"
                                    : status.type === "info"
                                        ? "bg-blue-50 text-blue-700 border-2 border-blue-200"
                                        : "bg-rose-50 text-rose-700 border-2 border-rose-200"}`, children: _jsxs("div", { className: "flex items-start gap-3", children: [status.type === "success" && _jsx(CheckCircle2, { size: 20, className: "flex-shrink-0 mt-0.5" }), status.type === "warning" && _jsx(AlertCircle, { size: 20, className: "flex-shrink-0 mt-0.5" }), status.type === "info" && _jsx(AlertCircle, { size: 20, className: "flex-shrink-0 mt-0.5" }), status.type === "error" && _jsx(AlertCircle, { size: 20, className: "flex-shrink-0 mt-0.5" }), _jsx("div", { className: "flex-1", children: status.message })] }) })), activeTab === "users" ? (
                        // Gebruikerslijst
                        _jsx(_Fragment, { children: filteredUsers.length === 0 ? (_jsxs("div", { className: "py-32 text-center bg-white rounded-[45px] border-2 border-dashed border-slate-200 opacity-50 flex flex-col items-center", children: [_jsx(Users, { size: 64, className: "text-slate-200 mb-4" }), _jsx("p", { className: "text-sm font-black uppercase tracking-widest text-slate-400", children: t('adminUsers.noAccountsFound', "Geen geautoriseerde accounts gevonden") })] })) : (_jsx("div", { className: "space-y-8", children: Object.entries(usersByCountry).map(([country, countryUsers]) => (_jsxs("div", { className: "bg-white rounded-[30px] border border-slate-200 overflow-hidden shadow-sm transition-all", children: [_jsxs("div", { onClick: () => setExpandedCountries(prev => ({ ...prev, [country]: !prev[country] })), className: "flex items-center justify-between p-6 cursor-pointer hover:bg-slate-50 transition-colors", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "p-2 bg-slate-800 rounded-xl", children: _jsx(Globe, { size: 20, className: "text-white" }) }), _jsx("h3", { className: "text-xl font-black text-slate-800 uppercase italic tracking-tight", children: country }), _jsxs("span", { className: "text-sm font-bold text-slate-400", children: ["(", countryUsers.length, ")"] })] }), _jsx("div", { className: `p-2 rounded-full bg-slate-100 text-slate-400 transition-transform duration-300 ${expandedCountries[country] ? 'rotate-180' : ''}`, children: _jsx(ChevronDown, { size: 20 }) })] }), expandedCountries[country] && (_jsx("div", { className: "p-6 border-t border-slate-100 bg-slate-50/30 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in slide-in-from-top-2", children: countryUsers.map((u) => (_jsxs("div", { className: "bg-white p-7 rounded-[30px] border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-400 transition-all group flex flex-col justify-between relative overflow-hidden", children: [_jsx("div", { className: "absolute top-0 right-0 p-6 opacity-5 rotate-12 group-hover:opacity-10 transition-opacity", children: _jsx(Database, { size: 100 }) }), _jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-4 mb-8", children: [_jsx("div", { className: "w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform", children: _jsx(Fingerprint, { size: 28 }) }), _jsxs("div", { className: "text-left overflow-hidden", children: [_jsx("h4", { className: "font-black text-slate-900 uppercase italic truncate text-lg leading-none mb-1.5", children: u.name || "Identiteit Onbekend" }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("span", { className: `px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-white shadow-sm ${roles.find((r) => r.id === u.role)?.color ||
                                                                                            "bg-slate-400"}`, children: roles.find((r) => r.id === u.role)?.label ||
                                                                                            u.role }), u.modules && u.modules.length > 0 && (_jsxs("span", { className: "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-purple-50 text-purple-600 border border-purple-100 flex items-center gap-1", children: [_jsx(Layers, { size: 10 }), " ", u.modules.length] }))] })] })] }), _jsxs("div", { className: "space-y-4 border-t border-slate-50 pt-6", children: [_jsxs("div", { className: "flex items-center gap-3 text-xs font-bold text-slate-500", children: [_jsx(Mail, { size: 14, className: "text-blue-500" }), " ", u.email] }), _jsxs("div", { className: "flex items-center gap-3 text-xs font-bold text-slate-500", children: [_jsx(Briefcase, { size: 14, className: "text-blue-500" }), " ", u.department || "Geen afdeling"] }), _jsx("div", { className: "flex items-center gap-3", children: _jsxs("span", { className: "text-[8px] font-mono text-slate-300 uppercase bg-slate-50 px-2 py-1 rounded-md border border-slate-100", children: ["UID: ", u.id] }) })] })] }), _jsxs("div", { className: "mt-8 pt-6 border-t border-slate-50 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all", children: [_jsx("button", { onClick: () => handleResetPassword(u.email), className: "p-3 bg-slate-50 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-all", title: t('adminUsers.resetPassword', "Wachtwoord Resetten"), children: _jsx(Key, { size: 18 }) }), _jsx("button", { onClick: () => handleEdit(u), className: "p-3 bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all", title: t('common.edit', "Bewerken"), children: _jsx(Edit3, { size: 18 }) }), _jsx("button", { onClick: () => handleDelete(u.id), className: "p-3 bg-slate-50 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all", title: t('adminUsers.deleteAccount', "Account Verwijderen"), children: _jsx(Trash2, { size: 18 }) })] })] }, u.id))) }))] }, country))) })) })) : activeTab === "requests" ? (
                        // Account Aanvragen Wachtrij
                        _jsx("div", { className: "space-y-4", children: accountRequests.filter(r => r.status === "pending").length === 0 ? (_jsxs("div", { className: "py-32 text-center bg-white rounded-[45px] border-2 border-dashed border-slate-200 opacity-50 flex flex-col items-center", children: [_jsx(Clock, { size: 64, className: "text-slate-200 mb-4" }), _jsx("p", { className: "text-sm font-black uppercase tracking-widest text-slate-400", children: t('adminUsers.noPendingRequests', "Geen openstaande aanvragen") })] })) : (accountRequests.filter(r => r.status === "pending").map((request) => (_jsxs("div", { className: "bg-white p-8 rounded-[40px] border-2 border-orange-200 shadow-lg hover:shadow-2xl transition-all", children: [_jsxs("div", { className: "flex items-start justify-between mb-6", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-16 h-16 bg-orange-500 text-white rounded-2xl flex items-center justify-center shadow-xl", children: _jsx(UserPlus, { size: 32 }) }), _jsxs("div", { children: [_jsx("h3", { className: "text-2xl font-black text-slate-900 uppercase italic tracking-tight", children: request.name }), _jsx("p", { className: "text-sm text-slate-600 font-bold mt-1", children: request.email })] })] }), _jsxs("div", { className: "flex items-center gap-2 text-orange-600 bg-orange-50 px-3 py-2 rounded-xl border border-orange-200", children: [_jsx(Clock, { size: 16 }), _jsx("span", { className: "text-xs font-black uppercase", children: t('adminUsers.inQueue', "In Wachtrij") })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4 mb-6", children: [_jsxs("div", { className: "p-4 bg-slate-50 rounded-2xl", children: [_jsx("span", { className: "text-xs font-black text-slate-400 uppercase tracking-widest block mb-1", children: t('common.country', "Land") }), _jsx("span", { className: "text-sm font-bold text-slate-900", children: request.country })] }), _jsxs("div", { className: "p-4 bg-slate-50 rounded-2xl", children: [_jsx("span", { className: "text-xs font-black text-slate-400 uppercase tracking-widest block mb-1", children: t('common.department', "Afdeling") }), _jsx("span", { className: "text-sm font-bold text-slate-900", children: request.department })] })] }), _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { onClick: () => handleAcceptRequest(request), disabled: saving, className: "flex-1 py-4 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg", children: saving ? (_jsx(Loader2, { className: "animate-spin", size: 18 })) : (_jsxs(_Fragment, { children: [_jsx(Check, { size: 18 }), t('common.accept', "Accepteren")] })) }), _jsxs("button", { onClick: () => handleRejectRequest(request.id), disabled: saving, className: "flex-1 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg", children: [_jsx(X, { size: 18 }), t('common.reject', "Weigeren")] })] })] }, request.id)))) })) : (
                        // Rollen Beheer
                        _jsxs("div", { className: "space-y-6", children: [isUsingDefaults && (_jsxs("div", { className: "bg-blue-50 p-4 rounded-2xl border border-blue-100 flex flex-col md:flex-row justify-between items-center gap-4 animate-in fade-in", children: [_jsxs("div", { className: "text-sm text-blue-800", children: [_jsx("p", { className: "font-bold", children: "\u26A0\uFE0F Je gebruikt momenteel tijdelijke standaardrollen." }), _jsx("p", { className: "text-xs mt-1", children: "Zodra je een eigen rol toevoegt, verdwijnen deze standaarden tenzij je ze eerst opslaat in de database." })] }), _jsxs("button", { onClick: handleInitRoles, className: "px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 whitespace-nowrap flex items-center gap-2 shadow-sm", children: [_jsx(Database, { size: 14 }), "Standaarden Opslaan in DB"] })] })), _jsxs("div", { className: "bg-white p-6 rounded-[30px] border border-slate-200 shadow-sm", children: [_jsx("h3", { className: "text-lg font-black text-slate-800 uppercase italic mb-4", children: "Nieuwe Rol Toevoegen" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4 items-end", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs font-bold text-slate-500 uppercase", children: "ID (Slug)" }), _jsx("input", { className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-purple-500", placeholder: "bijv. qshc_manager", value: newRole.id, onChange: e => setNewRole({ ...newRole, id: e.target.value }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs font-bold text-slate-500 uppercase", children: "Label (Weergave)" }), _jsx("input", { className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-purple-500", placeholder: "bijv. QSHC Manager", value: newRole.label, onChange: e => setNewRole({ ...newRole, label: e.target.value }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs font-bold text-slate-500 uppercase", children: "Kleur Label" }), _jsx("div", { className: "flex gap-2 flex-wrap p-2 bg-slate-50 rounded-xl border border-slate-200", children: ROLE_COLORS.map(c => (_jsx("button", { onClick: () => setNewRole({ ...newRole, color: c.bg }), className: `w-6 h-6 rounded-full ${c.bg} ${newRole.color === c.bg ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`, title: c.label }, c.bg))) })] })] }), _jsx("div", { className: "mt-4 flex justify-end", children: _jsxs("button", { onClick: handleAddRole, className: "px-6 py-3 bg-purple-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-purple-700 flex items-center gap-2", children: [_jsx(Tag, { size: 16 }), " Rol Toevoegen"] }) })] }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", children: roles.map(role => (_jsxs("div", { className: "bg-white p-5 rounded-[25px] border border-slate-200 shadow-sm flex items-center justify-between group", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: `w-4 h-4 rounded-full ${role.color}` }), _jsxs("div", { children: [_jsx("div", { className: "font-black text-slate-800", children: role.label }), _jsx("div", { className: "text-xs text-slate-400 font-mono", children: role.id })] })] }), _jsx("button", { onClick: () => handleDeleteRole(role.id), className: "p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100", children: _jsx(Trash2, { size: 16 }) })] }, role.id))) })] }))] }) }), isEditing && selectedUser && (_jsx("div", { className: "fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300", children: _jsxs("div", { className: "bg-white w-full max-w-xl rounded-[50px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/10 flex flex-col max-h-[90vh]", children: [_jsxs("div", { className: "p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/50 shrink-0", children: [_jsxs("div", { className: "flex items-center gap-5 overflow-hidden", children: [_jsx("div", { className: "p-4 bg-blue-600 text-white rounded-2xl shadow-xl", children: _jsx(ShieldAlert, { size: 28 }) }), _jsxs("div", { className: "text-left", children: [_jsxs("h3", { className: "text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none", children: [t('adminUsers.permissions', "Rechten"), " ", _jsx("span", { className: "text-blue-600", children: t('adminUsers.manage', "Beheren") })] }), _jsxs("p", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 italic", children: [t('adminUsers.identitySync', "Identity Sync"), ": ", selectedUser.id.substring(0, 8)] })] })] }), _jsx("button", { onClick: () => setIsEditing(false), className: "p-3 hover:bg-slate-200 text-slate-300 rounded-2xl transition-all", children: _jsx(X, { size: 28 }) })] }), _jsxs("div", { className: "flex border-b border-slate-100 px-10 shrink-0", children: [_jsx("button", { onClick: () => setEditModalTab("profile"), className: `py-4 px-6 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${editModalTab === "profile" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`, children: t('adminUsers.profileAndRole', "Profiel & Rol") }), _jsx("button", { onClick: () => setEditModalTab("modules"), className: `py-4 px-6 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${editModalTab === "modules" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`, children: t('adminUsers.extraModules', "Extra Modules") }), _jsx("button", { onClick: () => setEditModalTab("stations"), className: `py-4 px-6 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${editModalTab === "stations" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`, children: t('adminUsers.stationAccess', "Station Toegang") })] }), _jsxs("div", { className: "p-10 space-y-8 text-left overflow-y-auto custom-scrollbar", children: [editModalTab === "profile" && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2", children: t('common.fullName', "Volledige Naam") }), _jsxs("div", { className: "relative group", children: [_jsx(UserCircle, { className: "absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500", size: 20 }), _jsx("input", { className: "w-full pl-14 pr-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-[25px] font-black text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner", value: selectedUser.name || "", onChange: (e) => setSelectedUser({ ...selectedUser, name: e.target.value }) })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2", children: t('common.country', "Land") }), _jsxs("div", { className: "relative group", children: [_jsx(MapPin, { className: "absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500", size: 18 }), _jsxs("select", { className: "w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-[20px] font-bold text-xs outline-none focus:border-blue-500 appearance-none cursor-pointer", value: selectedUser.country || "", onChange: (e) => setSelectedUser({ ...selectedUser, country: e.target.value }), children: [_jsx("option", { value: "", children: t('common.selectCountry', "Selecteer land...") }), COUNTRIES.map(c => _jsx("option", { value: c, children: c }, c))] })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2", children: t('common.department', "Afdeling") }), _jsxs("div", { className: "relative group", children: [_jsx(Briefcase, { className: "absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500", size: 18 }), _jsxs("select", { className: "w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-[20px] font-bold text-xs outline-none focus:border-blue-500 appearance-none cursor-pointer", value: selectedUser.department || "", onChange: (e) => setSelectedUser({ ...selectedUser, department: e.target.value }), children: [_jsx("option", { value: "", children: t('common.selectDepartment', "Selecteer afdeling...") }), DEPARTMENTS.map(d => _jsx("option", { value: d, children: d }, d))] })] })] })] }), _jsxs("div", { className: "space-y-4", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2", children: t('adminUsers.systemRoleAndAccess', "Systeem Rol & Toegang") }), _jsx("div", { className: "grid grid-cols-1 gap-3", children: roles.map((role) => (_jsxs("button", { onClick: () => setSelectedUser({ ...selectedUser, role: role.id }), className: `p-5 rounded-[25px] border-2 transition-all flex items-center justify-between group ${selectedUser.role === role.id
                                                            ? "bg-blue-50 border-blue-500 shadow-md ring-4 ring-blue-500/5"
                                                            : "bg-white border-slate-100 hover:border-blue-200"}`, children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: `w-3 h-3 rounded-full ${role.color} ${selectedUser.role === role.id
                                                                            ? "animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                                                                            : "opacity-40"}` }), _jsx("span", { className: `font-black uppercase tracking-widest text-[11px] ${selectedUser.role === role.id
                                                                            ? "text-blue-700"
                                                                            : "text-slate-400"}`, children: role.label })] }), selectedUser.role === role.id && (_jsx(CheckCircle2, { size: 18, className: "text-blue-500" }))] }, role.id))) }), _jsx("div", { className: "pt-4 border-t border-slate-50", children: _jsxs("label", { className: "flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer hover:border-blue-200 transition-all", children: [_jsxs("div", { children: [_jsx("div", { className: "font-bold text-sm text-slate-700", children: t('adminUsers.authorizedToVerify', "Bevoegd om te verifiëren") }), _jsx("div", { className: "text-[10px] text-slate-400 font-medium", children: t('adminUsers.canVerifyDesc', "Kan producten goedkeuren (4-ogen principe)") })] }), _jsxs("div", { className: "relative inline-flex items-center cursor-pointer", children: [_jsx("input", { type: "checkbox", className: "sr-only peer", checked: selectedUser.canVerify || false, onChange: (e) => setSelectedUser({ ...selectedUser, canVerify: e.target.checked }) }), _jsx("div", { className: "w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" })] })] }) }), _jsxs("div", { className: "space-y-2 pt-4 border-t border-slate-50", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2", children: "Startpagina (Na inloggen)" }), _jsxs("div", { className: "relative group", children: [_jsx(Globe, { className: "absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500", size: 18 }), _jsx("input", { className: "w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-[20px] font-bold text-xs outline-none focus:border-blue-500 transition-all shadow-inner", value: selectedUser.defaultRoute || "", onChange: (e) => setSelectedUser({ ...selectedUser, defaultRoute: e.target.value }), placeholder: "Bijv. /planning of /" })] }), _jsx("p", { className: "text-[9px] text-slate-400 italic ml-2 mt-1", children: "Systeem stuurt de gebruiker hier direct naartoe (bijv. na QR scan)." })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2", children: t('adminUsers.emailSignature', "E-mail Handtekening") }), _jsxs("div", { className: "relative group", children: [_jsx(Edit3, { className: "absolute left-5 top-4 text-slate-300 group-focus-within:text-blue-500", size: 20 }), _jsx("textarea", { className: "w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-[25px] font-medium text-slate-600 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner resize-none text-xs", rows: 3, value: selectedUser.signature || "", onChange: (e) => setSelectedUser({ ...selectedUser, signature: e.target.value }), placeholder: t('adminUsers.signaturePlaceholder', "Met vriendelijke groet...") })] })] })] })] })), editModalTab === "modules" && (_jsxs("div", { className: "space-y-8", children: [_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "flex items-center gap-2", children: _jsxs("label", { className: "text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] ml-2 flex items-center gap-2", children: [_jsx(CheckCircle2, { size: 14 }), " Kern Modules \u2014 Altijd Beschikbaar"] }) }), _jsx("p", { className: "text-[9px] text-slate-500 italic ml-2", children: "Planning, Catalogus en Inbox zijn standaard aan voor iedereen. Je kunt sub-onderdelen per gebruiker beperken." }), _jsx("div", { className: "space-y-3", children: Object.entries(CORE_MODULE_FEATURES).map(([moduleId, module]) => {
                                                        const isExpanded = expandedModules[moduleId];
                                                        const perms = selectedUser?.permissions || {};
                                                        const modulePerms = perms[moduleId] || [];
                                                        // Als geen permissions gezet → alle features aan (standaard)
                                                        const allOn = modulePerms.length === 0;
                                                        const featureCount = allOn ? module.features.length : modulePerms.length;
                                                        return (_jsxs("div", { className: "border border-emerald-200 rounded-2xl overflow-hidden", children: [_jsxs("button", { type: "button", onClick: () => setExpandedModules({ ...expandedModules, [moduleId]: !isExpanded }), className: "w-full flex items-center justify-between p-4 bg-emerald-50 hover:bg-emerald-100 transition-all", children: [_jsxs("div", { className: "flex items-center gap-4 flex-1", children: [_jsxs("span", { className: "flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase shrink-0", children: [_jsx(CheckCircle2, { size: 10 }), " Altijd aan"] }), _jsxs("div", { className: "text-left", children: [_jsx("div", { className: "font-bold text-sm text-emerald-900", children: module.label }), _jsx("div", { className: "text-[10px] text-slate-500 font-medium", children: module.description })] })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("span", { className: `px-2 py-1 rounded-lg text-[9px] font-bold ${allOn ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`, children: [featureCount, "/", module.features.length, " actief"] }), _jsx(ChevronDown, { size: 16, className: `text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}` })] })] }), isExpanded && (_jsxs("div", { className: "bg-white border-t border-emerald-100 p-4 space-y-3", children: [_jsx("p", { className: "text-[9px] text-slate-400 italic ml-2 mb-2", children: "Schakel uit om deze gebruiker toegang te ontzeggen tot dit sub-onderdeel." }), module.features.map(feature => {
                                                                            const isChecked = allOn || (perms[moduleId] || []).includes(feature.id);
                                                                            const handleToggle = () => {
                                                                                const current = allOn ? module.features.map(f => f.id) : (perms[moduleId] || []);
                                                                                const next = isChecked
                                                                                    ? current.filter(f => f !== feature.id)
                                                                                    : [...current, feature.id];
                                                                                setSelectedUser({
                                                                                    ...selectedUser,
                                                                                    permissions: { ...perms, [moduleId]: next }
                                                                                });
                                                                            };
                                                                            return (_jsxs("label", { className: `flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all group ml-2 ${isChecked ? "bg-emerald-50 border-emerald-200 hover:border-emerald-400" : "bg-slate-50 border-slate-200 hover:border-red-300 hover:bg-red-50"}`, children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: `font-semibold text-xs ${isChecked ? "text-emerald-800" : "text-slate-400 line-through"}`, children: feature.label }), _jsx("div", { className: "text-[9px] text-slate-400", children: feature.description })] }), _jsxs("div", { className: "relative inline-flex items-center cursor-pointer ml-4", children: [_jsx("input", { type: "checkbox", className: "sr-only peer", checked: isChecked, onChange: handleToggle }), _jsx("div", { className: `w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${isChecked ? "bg-emerald-500" : "bg-slate-300"}` })] })] }, feature.id));
                                                                        })] }))] }, moduleId));
                                                    }) })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 flex items-center gap-2", children: [_jsx(Layers, { size: 14 }), " Optionele Modules"] }), _jsx("p", { className: "text-[9px] text-slate-500 italic ml-2", children: "Schakel in per gebruiker. Per module kun je per sub-onderdeel verdere toegang bepalen." }), _jsx("div", { className: "space-y-3", children: Object.entries(MODULE_FEATURES).map(([moduleId, module]) => {
                                                        const isExpanded = expandedModules[moduleId];
                                                        const featureCount = getModuleFeatureCount(moduleId);
                                                        const hasAccess = hasModule(moduleId);
                                                        return (_jsxs("div", { className: "border border-slate-200 rounded-2xl overflow-hidden", children: [_jsxs("button", { type: "button", onClick: () => setExpandedModules({ ...expandedModules, [moduleId]: !isExpanded }), className: `w-full flex items-center justify-between p-4 transition-all ${hasAccess ? "bg-blue-50 hover:bg-blue-100" : "bg-slate-50 hover:bg-slate-100"}`, children: [_jsxs("div", { className: "flex items-center gap-4 flex-1", children: [_jsxs("label", { htmlFor: `module-toggle-${moduleId}`, className: "relative inline-flex items-center cursor-pointer shrink-0", onClick: (e) => e.stopPropagation(), children: [_jsx("input", { id: `module-toggle-${moduleId}`, type: "checkbox", className: "sr-only peer", checked: hasAccess, onChange: () => toggleModuleAll(moduleId, !hasAccess) }), _jsx("div", { className: `w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${hasAccess ? "bg-blue-600" : "bg-slate-200"}` })] }), _jsxs("div", { className: "text-left", children: [_jsx("div", { className: `font-bold text-sm ${hasAccess ? "text-blue-900" : "text-slate-700"}`, children: module.label }), _jsx("div", { className: "text-[10px] text-slate-500 font-medium", children: module.description })] })] }), _jsxs("div", { className: "flex items-center gap-3", children: [featureCount > 0 && (_jsxs("span", { className: "px-2 py-1 rounded-lg text-[9px] font-bold bg-blue-100 text-blue-700", children: [featureCount, "/", module.features.length] })), _jsx(ChevronDown, { size: 16, className: `text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}` })] })] }), isExpanded && (_jsx("div", { className: "bg-white border-t border-slate-100 p-4 space-y-3", children: module.features.map(feature => {
                                                                        const perms = selectedUser?.permissions || {};
                                                                        const isChecked = (perms[moduleId] || []).includes(feature.id);
                                                                        return (_jsxs("label", { className: "flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-all group ml-2", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "font-semibold text-xs text-slate-700 group-hover:text-blue-700", children: feature.label }), _jsx("div", { className: "text-[9px] text-slate-400 group-hover:text-slate-500", children: feature.description })] }), _jsxs("div", { className: "relative inline-flex items-center cursor-pointer ml-4", children: [_jsx("input", { type: "checkbox", className: "sr-only peer", checked: isChecked, onChange: () => toggleFeature(moduleId, feature.id) }), _jsx("div", { className: `w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${isChecked ? "bg-blue-600" : "bg-slate-300"}` })] })] }, feature.id));
                                                                    }) }))] }, moduleId));
                                                    }) })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 flex items-center gap-2", children: [_jsx(ShieldAlert, { size: 14 }), " Notificaties"] }), _jsxs("label", { className: "flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100 cursor-pointer hover:border-red-200 transition-all group", children: [_jsxs("div", { children: [_jsx("div", { className: "font-bold text-sm text-red-900 group-hover:text-red-700 transition-colors", children: "Ontvang Crash Rapporten" }), _jsx("div", { className: "text-[10px] text-red-700/60 font-medium", children: "Notificaties bij systeemfouten" })] }), _jsxs("div", { className: "relative inline-flex items-center cursor-pointer", children: [_jsx("input", { type: "checkbox", className: "sr-only peer", checked: selectedUser.receivesCrashReports || false, onChange: (e) => setSelectedUser({ ...selectedUser, receivesCrashReports: e.target.checked }) }), _jsx("div", { className: "w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600" })] })] })] })] })), editModalTab === "stations" && (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 flex items-center gap-2", children: [_jsx(MapPin, { size: 14 }), " ", t('adminUsers.stationAccess', "Station Toegang")] }), _jsx("button", { onClick: () => setSelectedUser({ ...selectedUser, allowedStations: [] }), className: "text-[10px] text-rose-500 hover:underline font-bold", children: t('adminUsers.clearAllAccess', "Alles wissen (Toegang tot alles)") })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-1", children: t('common.location', "Locatie") }), _jsxs("div", { className: "relative", children: [_jsx(MapPin, { size: 14, className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" }), _jsx("select", { value: stationFilterCountry, onChange: (e) => { setStationFilterCountry(e.target.value); setStationFilterDept("All"); }, className: "w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500 cursor-pointer", children: uniqueCountries.map(c => _jsx("option", { value: c, children: c }, c)) })] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-1", children: t('common.department', "Afdeling") }), _jsxs("div", { className: "relative", children: [_jsx(Briefcase, { size: 14, className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" }), _jsx("select", { value: stationFilterDept, onChange: (e) => setStationFilterDept(e.target.value), className: "w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500 cursor-pointer", children: uniqueDepts.map(d => _jsx("option", { value: d, children: d }, d)) })] })] })] }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2", children: [filteredStations.map(station => (_jsxs("label", { className: `flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedUser.allowedStations?.includes(station.id) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`, children: [_jsx("div", { className: `w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${selectedUser.allowedStations?.includes(station.id) ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-300'}`, children: selectedUser.allowedStations?.includes(station.id) && _jsx(Check, { size: 14 }) }), _jsxs("div", { className: "overflow-hidden", children: [_jsx("div", { className: "font-bold text-sm text-slate-700 truncate", children: station.name }), _jsx("div", { className: "text-[10px] text-slate-400 truncate", children: station.department })] }), _jsx("input", { type: "checkbox", className: "hidden", checked: selectedUser.allowedStations?.includes(station.id) || false, onChange: (e) => {
                                                                const current = selectedUser.allowedStations || [];
                                                                let updated;
                                                                if (e.target.checked) {
                                                                    updated = [...current, station.id];
                                                                }
                                                                else {
                                                                    updated = current.filter(id => id !== station.id);
                                                                }
                                                                setSelectedUser({ ...selectedUser, allowedStations: updated });
                                                            } })] }, station.id))), filteredStations.length === 0 && (_jsx("div", { className: "col-span-full text-center py-8 text-slate-400 text-xs italic", children: t('adminUsers.noStationsFound', "Geen stations gevonden voor deze selectie.") }))] }), _jsxs("p", { className: "text-[10px] text-slate-400 italic ml-2 bg-slate-50 p-3 rounded-xl border border-slate-100", children: [_jsx("span", { className: "font-bold", children: t('common.attention', "Let op:") }), " ", t('adminUsers.stationAccessWarning1', "Als er geen stations zijn geselecteerd (lijst is leeg), heeft de gebruiker standaard toegang tot"), " ", _jsx("u", { children: t('common.all', "alle") }), " ", t('adminUsers.stationAccessWarning2', "stations. Selecteer één of meer stations om de toegang te beperken.")] }), _jsxs("div", { className: "mt-6 pt-6 border-t border-slate-100 space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2", children: "Voorkeursstation (Direct Openen)" }), _jsxs("div", { className: "relative", children: [_jsx(MapPin, { size: 18, className: "absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" }), _jsxs("select", { value: selectedUser.defaultStation || "", onChange: (e) => setSelectedUser({ ...selectedUser, defaultStation: e.target.value }), className: "w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-[20px] font-bold text-xs outline-none focus:border-blue-500 appearance-none cursor-pointer", children: [_jsx("option", { value: "", children: "Geen voorkeur (Zelf kiezen)" }), allStations.map(s => _jsxs("option", { value: s.id, children: [s.name, " (", s.department, ")"] }, s.id))] }), _jsx(ChevronDown, { size: 16, className: "absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" })] }), _jsx("p", { className: "text-[9px] text-slate-400 italic ml-2 mt-1", children: "Indien ingesteld, opent dit station automatisch in de Planning module." })] })] })), _jsxs("button", { onClick: handleUpdateUser, disabled: saving, className: "w-full py-7 bg-slate-900 text-white rounded-[30px] font-black uppercase text-sm tracking-[0.3em] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50 mt-6", children: [saving ? (_jsx(Loader2, { className: "animate-spin" })) : (_jsx(Save, { size: 24 })), t('adminUsers.publishToRoot', "Publiceren naar Root Node")] })] })] }) })), _jsxs("div", { className: "p-4 bg-slate-950 border-t border-white/5 flex justify-between items-center text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] px-10 shrink-0", children: [_jsxs("div", { className: "flex items-center gap-6", children: [_jsxs("span", { className: "flex items-center gap-2 text-emerald-500/50", children: [_jsx(ShieldCheck, { size: 14 }), " ", t('adminUsers.forensicAuditActive', "Forensic Audit Active")] }), _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(Database, { size: 14 }), " ", t('adminUsers.centralIdentityVault', "Central Identity Vault")] })] }), _jsx("span", { className: "opacity-30 italic", children: "User Management v6.11" })] }), showAddUserModal && (_jsx("div", { className: "fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4", children: _jsxs("div", { className: "bg-white rounded-[40px] shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-300", children: [_jsx("div", { className: "p-8 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-[40px] shrink-0", children: _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-3 mb-2", children: [_jsx("div", { className: "p-3 bg-white/20 rounded-2xl", children: _jsx(UserPlus, { size: 24 }) }), _jsx("h2", { className: "text-3xl font-black uppercase italic tracking-tighter", children: t('adminUsers.addUser', "Gebruiker Toevoegen") })] }), _jsx("p", { className: "text-blue-100 text-sm font-bold", children: t('adminUsers.createAccountDesc', "Nieuw account aanmaken met tijdelijk wachtwoord") })] }), _jsx("button", { onClick: () => setShowAddUserModal(false), className: "p-2 hover:bg-white/20 rounded-xl transition-colors", children: _jsx(X, { size: 24 }) })] }) }), _jsxs("div", { className: "flex-1 overflow-y-auto p-8 space-y-5 custom-scrollbar", children: [_jsx("div", { className: "bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 text-xs space-y-2", children: _jsxs("div", { className: "flex items-start gap-2", children: [_jsx(AlertCircle, { size: 16, className: "text-blue-600 flex-shrink-0 mt-0.5" }), _jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "font-bold text-blue-900", children: t('adminUsers.emailExistsHint', "💡 Als het email-adres al bestaat in Firebase Authentication:") }), _jsxs("ol", { className: "list-decimal list-inside space-y-1 text-blue-700 ml-2", children: [_jsx("li", { children: t('adminUsers.importInstruction1', "Je krijgt een melding met import-instructies") }), _jsx("li", { children: t('adminUsers.importInstruction2', "Volg de stappen om de UID te vinden in Firebase Console") }), _jsx("li", { children: t('adminUsers.importInstruction3', "OF verwijder de oude gebruiker eerst via Console") })] }), _jsxs("a", { href: "https://console.firebase.google.com", target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-black underline mt-2", children: [_jsx(Globe, { size: 12 }), t('adminUsers.openFirebaseConsole', "Open Firebase Console")] })] })] }) }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs font-black text-slate-600 uppercase tracking-widest", children: t('common.name', "Naam") }), _jsx("input", { type: "text", value: newUser.name, onChange: (e) => setNewUser({ ...newUser, name: e.target.value }), className: "w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-sm focus:outline-none focus:border-blue-500 transition-all", placeholder: t('common.fullNamePlaceholder', "Volledige naam") })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs font-black text-slate-600 uppercase tracking-widest", children: t('common.email', "Email") }), _jsx("input", { type: "email", value: newUser.email, onChange: (e) => setNewUser({ ...newUser, email: e.target.value }), className: "w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-sm focus:outline-none focus:border-blue-500 transition-all", placeholder: "naam@futurepipe.com" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs font-black text-slate-600 uppercase tracking-widest", children: t('common.country', "Land") }), _jsxs("select", { value: newUser.country, onChange: (e) => setNewUser({ ...newUser, country: e.target.value }), className: "w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-sm focus:outline-none focus:border-blue-500 transition-all", children: [_jsx("option", { value: "", children: t('common.selectCountryDefault', "-- Selecteer land --") }), COUNTRIES.map(country => (_jsx("option", { value: country, children: country }, country)))] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs font-black text-slate-600 uppercase tracking-widest", children: t('common.department', "Afdeling") }), _jsxs("select", { value: newUser.department, onChange: (e) => setNewUser({ ...newUser, department: e.target.value }), className: "w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-sm focus:outline-none focus:border-blue-500 transition-all", children: [_jsx("option", { value: "", children: t('common.selectDepartmentDefault', "-- Selecteer afdeling --") }), DEPARTMENTS.map(dept => (_jsx("option", { value: dept, children: dept }, dept)))] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs font-black text-slate-600 uppercase tracking-widest", children: t('adminUsers.passwordSettings', "Wachtwoord Instellingen") }), _jsxs("div", { className: "p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl space-y-4", children: [_jsxs("div", { className: "flex gap-2", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx(Key, { className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400", size: 16 }), _jsx("input", { type: "text", value: newUser.tempPassword, onChange: (e) => setNewUser({ ...newUser, tempPassword: e.target.value }), placeholder: t('adminUsers.autoGeneratedPassword', "Automatisch gegenereerd (of typ zelf)"), className: "w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-mono text-sm focus:outline-none focus:border-blue-500" })] }), _jsx("button", { onClick: () => setNewUser({ ...newUser, tempPassword: generateTempPassword() }), className: "p-3 bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 rounded-xl transition-all", title: t('adminUsers.generateNewPassword', "Genereer nieuw wachtwoord"), children: _jsx(RefreshCcw, { size: 18 }) })] }), _jsxs("label", { className: "flex items-center gap-3 cursor-pointer group", children: [_jsx("div", { className: `w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${newUser.requirePasswordChange ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300 group-hover:border-blue-400'}`, children: newUser.requirePasswordChange && _jsx(Check, { size: 14, className: "text-white" }) }), _jsx("input", { type: "checkbox", className: "hidden", checked: newUser.requirePasswordChange, onChange: (e) => setNewUser({ ...newUser, requirePasswordChange: e.target.checked }) }), _jsx("span", { className: "text-sm font-bold text-slate-700 select-none", children: t('adminUsers.requirePasswordChange', "Wachtwoord wijzigen bij volgende login verplichten") })] })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs font-black text-slate-600 uppercase tracking-widest", children: t('common.role', "Rol") }), _jsx("select", { value: newUser.role, onChange: (e) => setNewUser({ ...newUser, role: e.target.value }), className: "w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-sm focus:outline-none focus:border-blue-500 transition-all", children: roles.map(role => (_jsx("option", { value: role.id, children: role.label }, role.id))) })] })] }), _jsx("div", { className: "p-6 bg-slate-50 border-t border-slate-200 shrink-0 rounded-b-[40px]", children: _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { onClick: () => setShowAddUserModal(false), className: "flex-1 px-6 py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-slate-200 transition-all", children: t('common.cancel', "Annuleren") }), _jsx("button", { onClick: handleAddUser, disabled: saving, className: "flex-1 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg", children: saving ? (_jsx(Loader2, { className: "animate-spin", size: 18 })) : (_jsxs(_Fragment, { children: [_jsx(UserPlus, { size: 18 }), t('common.add', "Toevoegen")] })) })] }) })] }) }))] }));
};
export default AdminUsersView;
