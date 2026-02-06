import React, { useState, useEffect, useMemo } from "react";
import {
  Users,
  Search,
  Loader2,
  ShieldCheck,
  Trash2,
  Mail,
  Edit3,
  X,
  Save,
  UserCircle,
  ShieldAlert,
  ChevronRight,
  Database,
  Fingerprint,
  CheckCircle2,
  AlertCircle,
  Clock,
  UserPlus,
  Check,
  Globe,
  Key,
  RefreshCcw,
} from "lucide-react";
import { db, auth, firebaseConfig } from "../../config/firebase";
import { initializeApp, deleteApp } from "firebase/app";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  addDoc,
  setDoc,
} from "firebase/firestore";
import { PATHS, isValidPath } from "../../config/dbPaths";
import { createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";

/**
 * AdminUsersView V6.0 - Account Request Queue
 * Beheert alle toegangsrechten en profielen in de root-omgeving.
 * + Wachtrij voor account aanvragen
 * Pad: /future-factory/Users/Accounts/
 */
const AdminUsersView = () => {
  const [users, setUsers] = useState([]);
  const [accountRequests, setAccountRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [activeTab, setActiveTab] = useState("users"); // 'users' of 'requests'
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    country: "",
    department: "",
    role: "guest",
    tempPassword: "",
    requirePasswordChange: true
  });

  const USER_ROLES = [
    { id: "admin", label: "Master Admin", color: "bg-blue-600" },
    { id: "engineer", label: "Process Engineer", color: "bg-purple-600" },
    { id: "teamleader", label: "Teamleider", color: "bg-emerald-600" },
    { id: "operator", label: "Machine Operator", color: "bg-orange-600" },
    { id: "guest", label: "Geen Toegang (Guest)", color: "bg-slate-400" },
  ];

  const COUNTRIES = [
    "Nederland",
    "België", 
    "Duitsland",
    "Frankrijk",
    "Verenigd Koninkrijk",
    "Anders"
  ];

  const DEPARTMENTS = [
    "Productie - Fittings",
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

  // 1. Live Sync met de Root Accounts collectie
  useEffect(() => {
    if (!isValidPath("USERS")) return;

    setLoading(true);
    const usersRef = collection(db, ...PATHS.USERS);
    const q = query(usersRef, orderBy("name", "asc"));

    const unsubUsers = onSnapshot(
      q,
      (snapshot) => {
        setUsers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("Firestore Identity Error:", err);
        setLoading(false);
      }
    );

    return () => unsubUsers();
  }, []);

  // Filtering en Grouping
  const filteredUsers = useMemo(() => {
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.role?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, searchTerm]);

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
    if (!isValidPath("USERS")) return;

    const requestsRef = collection(db, "future-factory", "Users", "AccountRequests");
    const q = query(requestsRef, orderBy("createdAt", "desc"));

    const unsubRequests = onSnapshot(
      q,
      (snapshot) => {
        setAccountRequests(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
      (err) => {
        console.error("Account Requests Error:", err);
      }
    );

    return () => unsubRequests();
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
    let selectedUid = null;
    let isExistingUser = false;

    try {
      try {
        // Maak een SECONDARY app instance om de user aan te maken 
        // zonder de huidige admin uit te loggen.
        secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
        const secondaryAuth = getAuth(secondaryApp);

        const userCredential = await createUserWithEmailAndPassword(
          secondaryAuth,
          newUser.email,
          passwordToUse
        );
        
        selectedUid = userCredential.user.uid;
        
        // Log de nieuwe user direct weer uit op de secondary app
        await signOut(secondaryAuth);

      } catch (authError) {
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
          
          const uid = prompt(
            `Deze gebruiker bestaat al in Firebase Authentication.\n\n` +
            `Als je deze gebruiker wilt IMPORTEREN (migreren van oude database):\n` +
            `➜ Voer de UID in (zie console voor instructies)\n\n` +
            `Als je wilt ANNULEREN:\n` +
            `➜ Laat leeg of druk op Cancel\n\n` +
            `Als je de gebruiker wilt VERWIJDEREN:\n` +
            `➜ Ga naar Firebase Console > Authentication`
          );
          
          if (!uid || uid.trim() === "") {
            setStatus({
              type: "info",
              message: "Import geannuleerd.",
            });
            setSaving(false);
            if (secondaryApp) await deleteApp(secondaryApp);
            return;
          }
          
          // Valideer UID 
          selectedUid = uid.trim();
          if (selectedUid.length < 5) {
             throw new Error("Ongeldige UID opgegeven.");
          }
          
        } else {
          throw authError;
        }
      } finally {
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
        requirePasswordChange: newUser.requirePasswordChange, // Gebruik de checkbox waarde
        tempPassword: isExistingUser ? "(bestaand wachtwoord behouden)" : passwordToUse,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.email || "Admin",
        imported: isExistingUser,
        importedAt: isExistingUser ? serverTimestamp() : null,
      });

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

    } catch (err) {
      console.error("Fout bij toevoegen gebruiker:", err);
      let errorMessage = "Fout bij toevoegen gebruiker";
      
      if (err.code === "auth/invalid-email") {
        errorMessage = "Ongeldig email-adres";
      } else if (err.code === "auth/weak-password") {
        errorMessage = "Wachtwoord is te zwak (minimaal 6 karakters)";
      } else if (err.code === "auth/email-already-in-use"){
         errorMessage = "E-mailadres is al in gebruik (en import geannuleerd).";
      } else {
        errorMessage = err.message;
      }
      
      setStatus({
        type: "error",
        message: errorMessage,
      });
    } finally {
      setSaving(false);
    }
  };

  // 3. Handlers
  const handleEdit = (user) => {
    setSelectedUser({ ...user });
    setIsEditing(true);
  };

  // Reset wachtwoord voor gebruiker (via Firebase Auth Admin SDK zou beter zijn, maar we gebruiken email reset)
  const handleResetPassword = async (userEmail) => {
    if (!window.confirm(`Wachtwoord reset link sturen naar ${userEmail}?`)) {
      return;
    }

    try {
      const { sendPasswordResetEmail } = await import("firebase/auth");
      await sendPasswordResetEmail(auth, userEmail);
      setStatus({
        type: "success",
        message: `Reset link verzonden naar ${userEmail}. Gebruiker kan via email een nieuw wachtwoord instellen.`,
      });
    } catch (err) {
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
    if (saving) return;
    setSaving(true);
    setStatus(null);

    try {
      const tempPassword = generateTempPassword();
      
      // Maak gebruiker aan in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        request.email,
        tempPassword
      );

      // Voeg gebruiker toe aan Firestore
      await setDoc(doc(db, ...PATHS.USERS, userCredential.user.uid), {
        name: request.name,
        email: request.email,
        country: request.country,
        department: request.department,
        role: "guest", // Standaard rol
        requirePasswordChange: true, // Moet wachtwoord wijzigen bij eerste login
        tempPassword: tempPassword, // Voor admin referentie (wordt niet gebruikt voor auth)
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.email || "Admin",
        approved: true,
        approvedAt: serverTimestamp(),
      });

      // Update de request status
      await updateDoc(doc(db, "future-factory", "Users", "AccountRequests", request.id), {
        status: "approved",
        processedAt: serverTimestamp(),
        processedBy: auth.currentUser?.email || "Admin",
        tempPassword: tempPassword,
      });

      setStatus({
        type: "success",
        message: `Account aangemaakt! Tijdelijk wachtwoord: ${tempPassword} (deel dit met de gebruiker)`,
      });
    } catch (err) {
      console.error("Fout bij accepteren aanvraag:", err);
      setStatus({
        type: "error",
        message: `Fout: ${err.message}`,
      });
    } finally {
      setSaving(false);
    }
  };

  // Weiger account aanvraag
  const handleRejectRequest = async (requestId) => {
    if (saving) return;
    setSaving(true);

    try {
      await updateDoc(doc(db, "future-factory", "Users", "AccountRequests", requestId), {
        status: "rejected",
        processedAt: serverTimestamp(),
        processedBy: auth.currentUser?.email || "Admin",
      });

      setStatus({ type: "success", message: "Aanvraag geweigerd" });
    } catch (err) {
      console.error("Fout bij weigeren:", err);
      setStatus({ type: "error", message: "Fout bij weigeren aanvraag" });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser || saving) return;
    setSaving(true);
    try {
      const userRef = doc(db, ...PATHS.USERS, selectedUser.id);
      await updateDoc(userRef, {
        name: selectedUser.name,
        role: selectedUser.role,
        lastAdminUpdate: serverTimestamp(),
        updatedBy: auth.currentUser?.email || "Master Admin",
      });

      setStatus({ type: "success", msg: "Gebruikersprofiel bijgewerkt" });
      setTimeout(() => setStatus(null), 3000);
      setIsEditing(false);
    } catch (err) {
      alert("Update mislukt: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userId) => {
    if (
      !window.confirm(
        "Account permanent verwijderen uit de root? Dit blokkeert direct alle toegang."
      )
    )
      return;
    try {
      const userRef = doc(db, ...PATHS.USERS, userId);
      await deleteDoc(userRef);
      setStatus({ type: "success", msg: "Gebruiker verwijderd" });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading)
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          Identiteiten synchroniseren...
        </p>
      </div>
    );

  return (
    <div className="flex flex-col h-full bg-slate-50 text-left animate-in fade-in overflow-hidden">
      {/* HEADER UNIT */}
      <div className="p-8 bg-white border-b border-slate-200 shadow-sm shrink-0 z-10">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-6">
          <div className="flex items-center gap-6">
            <div className="p-4 bg-slate-900 text-white rounded-[20px] shadow-xl">
              <Users size={28} />
            </div>
            <div className="text-left">
              <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
                Access <span className="text-blue-600">Controller</span>
              </h2>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase italic">
                  <ShieldCheck size={10} /> Root Protected
                </span>
                {accountRequests.filter(r => r.status === "pending").length > 0 && (
                  <span className="flex items-center gap-1.5 text-[9px] font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 uppercase italic animate-pulse">
                    <Clock size={10} /> {accountRequests.filter(r => r.status === "pending").length} In Wachtrij
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Search + Add User Button */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Zoek gebruiker..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-sm focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-400"
              />
            </div>
            <button
              onClick={() => setShowAddUserModal(true)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 shadow-lg"
            >
              <UserPlus size={18} />
              Gebruiker Toevoegen
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("users")}
            className={`px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all ${
              activeTab === "users"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Users size={16} className="inline mr-2" />
            Gebruikers ({users.length})
          </button>
          <button
            onClick={() => setActiveTab("requests")}
            className={`px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all relative ${
              activeTab === "requests"
                ? "bg-orange-500 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <UserPlus size={16} className="inline mr-2" />
            Wachtrij ({accountRequests.filter(r => r.status === "pending").length})
            {accountRequests.filter(r => r.status === "pending").length > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* CONTENT GRID */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-50/50">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Status melding */}
          {status && (
            <div className={`p-5 rounded-2xl font-bold text-sm whitespace-pre-wrap ${
              status.type === "success" 
                ? "bg-green-50 text-green-700 border-2 border-green-200" 
                : status.type === "warning"
                ? "bg-amber-50 text-amber-800 border-2 border-amber-300"
                : status.type === "info"
                ? "bg-blue-50 text-blue-700 border-2 border-blue-200"
                : "bg-rose-50 text-rose-700 border-2 border-rose-200"
            }`}>
              <div className="flex items-start gap-3">
                {status.type === "success" && <CheckCircle2 size={20} className="flex-shrink-0 mt-0.5" />}
                {status.type === "warning" && <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />}
                {status.type === "info" && <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />}
                {status.type === "error" && <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />}
                <div className="flex-1">{status.message}</div>
              </div>
            </div>
          )}

          {activeTab === "users" ? (
            // Gebruikerslijst
            <>
              {filteredUsers.length === 0 ? (
                <div className="py-32 text-center bg-white rounded-[45px] border-2 border-dashed border-slate-200 opacity-50 flex flex-col items-center">
                  <Users size={64} className="text-slate-200 mb-4" />
                  <p className="text-sm font-black uppercase tracking-widest text-slate-400">
                    Geen geautoriseerde accounts gevonden
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {Object.entries(usersByCountry).map(([country, countryUsers]) => (
                    <div key={country}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-slate-800 rounded-xl">
                          <Globe size={20} className="text-white" />
                        </div>
                        <h3 className="text-xl font-black text-slate-800 uppercase italic tracking-tight">
                          {country}
                        </h3>
                        <span className="text-sm font-bold text-slate-400">
                          ({countryUsers.length})
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {countryUsers.map((u) => (
                          <div
                            key={u.id}
                            className="bg-white p-7 rounded-[40px] border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-400 transition-all group flex flex-col justify-between relative overflow-hidden"
                          >
                            <div className="absolute top-0 right-0 p-6 opacity-5 rotate-12 group-hover:opacity-10 transition-opacity">
                              <Database size={100} />
                            </div>

                            <div>
                              <div className="flex items-center gap-4 mb-8">
                                <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                  <Fingerprint size={28} />
                                </div>
                                <div className="text-left overflow-hidden">
                                  <h4 className="font-black text-slate-900 uppercase italic truncate text-lg leading-none mb-1.5">
                                    {u.name || "Identiteit Onbekend"}
                                  </h4>
                                  <span
                                    className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-white shadow-sm ${
                                      USER_ROLES.find((r) => r.id === u.role)?.color ||
                                      "bg-slate-400"
                                    }`}
                                  >
                                    {USER_ROLES.find((r) => r.id === u.role)?.label ||
                                      u.role}
                                  </span>
                                </div>
                              </div>

                              <div className="space-y-4 border-t border-slate-50 pt-6">
                                <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                                  <Mail size={14} className="text-blue-500" /> {u.email}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[8px] font-mono text-slate-300 uppercase bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                    UID: {u.id}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-slate-50 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                              <button
                                onClick={() => handleResetPassword(u.email)}
                                className="p-3 bg-slate-50 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-all"
                                title="Wachtwoord Resetten"
                              >
                                <Key size={18} />
                              </button>
                              <button
                                onClick={() => handleEdit(u)}
                                className="p-3 bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                title="Bewerken"
                              >
                                <Edit3 size={18} />
                              </button>
                              <button
                                onClick={() => handleDelete(u.id)}
                                className="p-3 bg-slate-50 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                title="Account Verwijderen"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            // Account Aanvragen Wachtrij
            <div className="space-y-4">
              {accountRequests.filter(r => r.status === "pending").length === 0 ? (
                <div className="py-32 text-center bg-white rounded-[45px] border-2 border-dashed border-slate-200 opacity-50 flex flex-col items-center">
                  <Clock size={64} className="text-slate-200 mb-4" />
                  <p className="text-sm font-black uppercase tracking-widest text-slate-400">
                    Geen openstaande aanvragen
                  </p>
                </div>
              ) : (
                accountRequests.filter(r => r.status === "pending").map((request) => (
                  <div
                    key={request.id}
                    className="bg-white p-8 rounded-[40px] border-2 border-orange-200 shadow-lg hover:shadow-2xl transition-all"
                  >
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-orange-500 text-white rounded-2xl flex items-center justify-center shadow-xl">
                          <UserPlus size={32} />
                        </div>
                        <div>
                          <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight">
                            {request.name}
                          </h3>
                          <p className="text-sm text-slate-600 font-bold mt-1">{request.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-orange-600 bg-orange-50 px-3 py-2 rounded-xl border border-orange-200">
                        <Clock size={16} />
                        <span className="text-xs font-black uppercase">In Wacht rij</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="p-4 bg-slate-50 rounded-2xl">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">
                          Land
                        </span>
                        <span className="text-sm font-bold text-slate-900">{request.country}</span>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">
                          Afdeling
                        </span>
                        <span className="text-sm font-bold text-slate-900">{request.department}</span>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => handleAcceptRequest(request)}
                        disabled={saving}
                        className="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                      >
                        {saving ? (
                          <Loader2 className="animate-spin" size={18} />
                        ) : (
                          <>
                            <Check size={18} />
                            Accepteren
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleRejectRequest(request.id)}
                        disabled={saving}
                        className="flex-1 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                      >
                        <X size={18} />
                        Weigeren
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* EDIT MODAL OVERLAY */}
      {isEditing && selectedUser && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-xl rounded-[50px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/10">
            <div className="p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-blue-600 text-white rounded-2xl shadow-xl">
                  <ShieldAlert size={28} />
                </div>
                <div className="text-left">
                  <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
                    Rechten <span className="text-blue-600">Beheren</span>
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 italic">
                    Identity Sync: {selectedUser.id.substring(0, 8)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditing(false)}
                className="p-3 hover:bg-slate-200 text-slate-300 rounded-2xl transition-all"
              >
                <X size={28} />
              </button>
            </div>

            <div className="p-10 space-y-8 text-left">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">
                  Volledige Naam
                </label>
                <div className="relative group">
                  <UserCircle
                    className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500"
                    size={20}
                  />
                  <input
                    className="w-full pl-14 pr-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-[25px] font-black text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                    value={selectedUser.name || ""}
                    onChange={(e) =>
                      setSelectedUser({ ...selectedUser, name: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">
                  Systeem Rol & Toegang
                </label>
                <div className="grid grid-cols-1 gap-3">
                  {USER_ROLES.map((role) => (
                    <button
                      key={role.id}
                      onClick={() =>
                        setSelectedUser({ ...selectedUser, role: role.id })
                      }
                      className={`p-5 rounded-[25px] border-2 transition-all flex items-center justify-between group ${
                        selectedUser.role === role.id
                          ? "bg-blue-50 border-blue-500 shadow-md ring-4 ring-blue-500/5"
                          : "bg-white border-slate-100 hover:border-blue-200"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-3 h-3 rounded-full ${role.color} ${
                            selectedUser.role === role.id
                              ? "animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                              : "opacity-40"
                          }`}
                        ></div>
                        <span
                          className={`font-black uppercase tracking-widest text-[11px] ${
                            selectedUser.role === role.id
                              ? "text-blue-700"
                              : "text-slate-400"
                          }`}
                        >
                          {role.label}
                        </span>
                      </div>
                      {selectedUser.role === role.id && (
                        <CheckCircle2 size={18} className="text-blue-500" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleUpdateUser}
                disabled={saving}
                className="w-full py-7 bg-slate-900 text-white rounded-[30px] font-black uppercase text-sm tracking-[0.3em] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50 mt-6"
              >
                {saving ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Save size={24} />
                )}
                Publiceren naar Root Node
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER INFO */}
      <div className="p-4 bg-slate-950 border-t border-white/5 flex justify-between items-center text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] px-10 shrink-0">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2 text-emerald-500/50">
            <ShieldCheck size={14} /> Forensic Audit Active
          </span>
          <span className="flex items-center gap-2">
            <Database size={14} /> Central Identity Vault
          </span>
        </div>
        <span className="opacity-30 italic">User Management v6.11</span>
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-white rounded-[40px] shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-300">
            {/* Header - Fixed */}
            <div className="p-8 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-[40px] shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 bg-white/20 rounded-2xl">
                      <UserPlus size={24} />
                    </div>
                    <h2 className="text-3xl font-black uppercase italic tracking-tighter">
                      Gebruiker Toevoegen
                    </h2>
                  </div>
                  <p className="text-blue-100 text-sm font-bold">
                    Nieuw account aanmaken met tijdelijk wachtwoord
                  </p>
                </div>
                <button
                  onClick={() => setShowAddUserModal(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Form - Scrollable */}
            <div className="flex-1 overflow-y-auto p-8 space-y-5 custom-scrollbar">
              {/* Helpende informatie */}
              <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="font-bold text-blue-900">
                      💡 Als het email-adres al bestaat in Firebase Authentication:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-700 ml-2">
                      <li>Je krijgt een melding met import-instructies</li>
                      <li>Volg de stappen om de UID te vinden in Firebase Console</li>
                      <li>OF verwijder de oude gebruiker eerst via Console</li>
                    </ol>
                    <a 
                      href="https://console.firebase.google.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-black underline mt-2"
                    >
                      <Globe size={12} />
                      Open Firebase Console
                    </a>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-600 uppercase tracking-widest">Naam</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-sm focus:outline-none focus:border-blue-500 transition-all"
                  placeholder="Volledige naam"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-600 uppercase tracking-widest">Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-sm focus:outline-none focus:border-blue-500 transition-all"
                  placeholder="naam@futurepipe.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-600 uppercase tracking-widest">Land</label>
                <select
                  value={newUser.country}
                  onChange={(e) => setNewUser({...newUser, country: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-sm focus:outline-none focus:border-blue-500 transition-all"
                >
                  <option value="">-- Selecteer land --</option>
                  {COUNTRIES.map(country => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-600 uppercase tracking-widest">Afdeling</label>
                <select
                  value={newUser.department}
                  onChange={(e) => setNewUser({...newUser, department: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-sm focus:outline-none focus:border-blue-500 transition-all"
                >
                  <option value="">-- Selecteer afdeling --</option>
                  {DEPARTMENTS.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-600 uppercase tracking-widest">Wachtwoord Instellingen</label>
                <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl space-y-4">
                   <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type="text"
                          value={newUser.tempPassword}
                          onChange={(e) => setNewUser({...newUser, tempPassword: e.target.value})}
                          placeholder="Automatisch gegenereerd (of typ zelf)"
                          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-mono text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <button
                        onClick={() => setNewUser({...newUser, tempPassword: generateTempPassword()})}
                        className="p-3 bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 rounded-xl transition-all"
                        title="Genereer nieuw wachtwoord"
                      >
                        <RefreshCcw size={18} />
                      </button>
                   </div>
                   
                   <label className="flex items-center gap-3 cursor-pointer group">
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${newUser.requirePasswordChange ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300 group-hover:border-blue-400'}`}>
                        {newUser.requirePasswordChange && <Check size={14} className="text-white" />}
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={newUser.requirePasswordChange}
                        onChange={(e) => setNewUser({...newUser, requirePasswordChange: e.target.checked})} 
                      />
                      <span className="text-sm font-bold text-slate-700 select-none">
                        Wachtwoord wijzigen bij volgende login verplichten
                      </span>
                   </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-600 uppercase tracking-widest">Rol</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-sm focus:outline-none focus:border-blue-500 transition-all"
                >
                  {USER_ROLES.map(role => (
                    <option key={role.id} value={role.id}>{role.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Footer - Fixed */}
            <div className="p-6 bg-slate-50 border-t border-slate-200 shrink-0 rounded-b-[40px]">
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAddUserModal(false)}
                  className="flex-1 px-6 py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-slate-200 transition-all"
                >
                  Annuleren
                </button>
                <button
                  onClick={handleAddUser}
                  disabled={saving}
                  className="flex-1 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                >
                  {saving ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <>
                      <UserPlus size={18} />
                      Toevoegen
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsersView;
