import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useMemo, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { Wrench, MapPin, Search, Plus, Edit2, Trash2, Save, X, PackageCheck, ShieldCheck, Database, Loader2, } from "lucide-react";
import { doc, setDoc, deleteDoc, onSnapshot, collection, collectionGroup, query, where, serverTimestamp, } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { STANDARD_DIAMETERS } from "../../data/constants";
import { useNotifications } from "../../contexts/NotificationContext";
import { buildScopedInventoryDocPath, isProductionInventoryScopedDoc, resolveInventoryScope, } from "../../utils/inventoryPaths";
/**
 * AdminLocationsView V4.0 - Root Sync Edition
 * Beheert gereedschappen en stelling-locaties in de root.
 * Locatie: /future-factory/production/inventory/records/
 */
const AdminLocationsView = ({ canEdit = false }) => {
    const { t } = useTranslation();
    const { showConfirm, notify } = useNotifications();
    const [moffen, setMoffen] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [formState, setFormState] = useState({
        type: "TB",
        diameter: "200",
        pressure: "16",
        location: "",
        stock: 0,
        minStock: 5,
        toolName: "",
    });
    // 1. Live Sync met de Root INVENTORY collectie
    useEffect(() => {
        const legacyRef = collection(db, ...PATHS.INVENTORY);
        const scopedRef = query(collectionGroup(db, "items"), where("_scopeType", "==", "inventory"));
        let legacyItems = [];
        let scopedItems = [];
        const syncMerged = () => {
            const byId = new Map();
            legacyItems.forEach((entry) => byId.set(entry.id, entry));
            scopedItems.forEach((entry) => byId.set(entry.id, entry));
            setMoffen(Array.from(byId.values()));
            setLoading(false);
        };
        const unsubscribeLegacy = onSnapshot(legacyRef, (snap) => {
            legacyItems = snap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
                _source: "legacy",
            }));
            syncMerged();
        }, (err) => {
            console.error("Fout bij laden legacy inventaris:", err);
            setLoading(false);
        });
        const unsubscribeScoped = onSnapshot(scopedRef, (snap) => {
            scopedItems = snap.docs
                .filter((d) => isProductionInventoryScopedDoc(d.ref.path))
                .map((d) => ({
                id: d.id,
                ...d.data(),
                _source: "scoped",
            }));
            syncMerged();
        }, (err) => {
            console.error("Fout bij laden scoped inventaris:", err);
            setLoading(false);
        });
        return () => {
            unsubscribeLegacy();
            unsubscribeScoped();
        };
    }, []);
    const filteredMoffen = useMemo(() => {
        return moffen
            .filter((m) => `${m.type} ${m.diameter} ${m.location} ${m.toolName || ""}`
            .toLowerCase()
            .includes(searchTerm.toLowerCase()))
            .sort((a, b) => Number(a.diameter) - Number(b.diameter));
    }, [moffen, searchTerm]);
    const handleSave = async (e) => {
        e.preventDefault();
        if (!canEdit)
            return;
        setSaving(true);
        try {
            const docId = editingId ||
                `${formState.type}_ID${formState.diameter}_PN${formState.pressure}`.toUpperCase();
            const docRef = doc(db, ...PATHS.INVENTORY, docId);
            const scope = resolveInventoryScope({
                ...formState,
                ...moffen.find((m) => m.id === docId),
                id: docId,
            });
            const scopedSegments = buildScopedInventoryDocPath({
                docId,
                departmentId: scope.departmentId,
                machineId: scope.machineId,
            });
            const scopedRef = scopedSegments ? doc(db, ...scopedSegments) : null;
            const data = {
                ...formState,
                id: docId,
                diameter: Number(formState.diameter),
                pressure: Number(formState.pressure),
                stock: Number(formState.stock),
                minStock: Number(formState.minStock),
                departmentId: scope.departmentId,
                machineId: scope.machineId,
                _scopeType: "inventory",
                lastUpdated: serverTimestamp(),
                updatedBy: auth.currentUser?.email || "Admin",
            };
            const writes = [setDoc(docRef, data, { merge: true })];
            if (scopedRef)
                writes.push(setDoc(scopedRef, data, { merge: true }));
            await Promise.all(writes);
            await logActivity(auth.currentUser?.uid, editingId ? "TOOL_UPDATE" : "TOOL_ADD", `Gereedschap ${data.id} bijgewerkt op locatie ${data.location}`);
            setIsEditing(false);
            setEditingId(null);
        }
        catch (err) {
            console.error("Opslagfout:", err);
            notify("Kon gegevens niet opslaan.");
        }
        finally {
            setSaving(false);
        }
    };
    const handleDelete = async (id) => {
        const confirmed = await showConfirm({
            title: t('adminLocations.deleteTitle', 'Locatie verwijderen'),
            message: t('adminLocations.confirmDelete'),
            confirmText: t('common.delete', 'Verwijderen'),
            cancelText: t('common.cancel', 'Annuleren'),
            tone: 'danger',
        });
        if (!confirmed)
            return;
        try {
            const current = moffen.find((m) => m.id === id) || {};
            const scope = resolveInventoryScope({ ...current, id });
            const scopedSegments = buildScopedInventoryDocPath({
                docId: id,
                departmentId: scope.departmentId,
                machineId: scope.machineId,
            });
            const deletes = [deleteDoc(doc(db, ...PATHS.INVENTORY, id))];
            if (scopedSegments) {
                deletes.push(deleteDoc(doc(db, ...scopedSegments)));
            }
            await Promise.all(deletes);
            await logActivity(auth.currentUser?.uid, "TOOL_DELETE", `Gereedschap ${id} verwijderd.`);
        }
        catch (err) {
            notify(err.message);
        }
    };
    if (loading)
        return (_jsxs("div", { className: "p-20 text-center flex flex-col items-center gap-4 h-full justify-center", children: [_jsx(Loader2, { className: "animate-spin text-blue-500", size: 40 }), _jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400 italic", children: t('adminLocations.syncingInventory') })] }));
    return (_jsxs("div", { className: "p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 h-full flex flex-col text-left", children: [_jsxs("div", { className: "bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 overflow-hidden relative", children: [_jsx("div", { className: "absolute top-0 right-0 p-8 opacity-5 rotate-12", children: _jsx(Wrench, { size: 120 }) }), _jsxs("div", { className: "flex items-center gap-6 relative z-10", children: [_jsx("div", { className: "p-4 bg-emerald-600 text-white rounded-3xl shadow-xl shadow-emerald-100", children: _jsx(Wrench, { size: 32 }) }), _jsxs("div", { className: "text-left", children: [_jsxs("h2", { className: "text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none", children: [t('common.tools'), " ", _jsx("span", { className: "text-emerald-600", children: "&" }), " ", t('common.stock')] }), _jsxs("div", { className: "mt-3 flex items-center gap-3", children: [_jsxs("span", { className: "flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-100 uppercase italic", children: [_jsx(ShieldCheck, { size: 10 }), " ", t('common.rootProtected')] }), _jsxs("p", { className: "text-[9px] font-mono text-slate-400 uppercase tracking-widest", children: [t('common.target'), ": /", PATHS.INVENTORY.join("/"), " + /", PATHS.INVENTORY.join("/"), "/Fittings/machines/BH18/items"] })] })] })] }), canEdit && (_jsxs("button", { onClick: () => {
                            setEditingId(null);
                            setFormState({
                                type: "TB",
                                diameter: "200",
                                pressure: "16",
                                location: "",
                                stock: 0,
                                minStock: 5,
                                toolName: "",
                            });
                            setIsEditing(true);
                        }, className: "bg-slate-900 text-white px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl flex items-center gap-3 hover:bg-blue-600 transition-all active:scale-95 relative z-10", children: [_jsx(Plus, { size: 18 }), " ", t('adminLocations.registerNew')] }))] }), _jsxs("div", { className: "relative group", children: [_jsx(Search, { className: "absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors", size: 22 }), _jsx("input", { className: "w-full pl-16 pr-8 py-5 bg-white border-2 border-slate-100 rounded-[30px] outline-none focus:border-blue-500 shadow-sm font-bold text-base transition-all placeholder:text-slate-300", placeholder: t('adminLocations.searchPlaceholder'), value: searchTerm, onChange: (e) => setSearchTerm(e.target.value) })] }), _jsx("div", { className: "bg-white rounded-[50px] border border-slate-200 shadow-sm overflow-hidden flex-1 mb-10", children: _jsxs("div", { className: "overflow-y-auto h-full custom-scrollbar", children: [_jsxs("table", { className: "w-full text-left border-collapse", children: [_jsx("thead", { className: "bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b sticky top-0 z-10 shadow-sm", children: _jsxs("tr", { children: [_jsx("th", { className: "px-10 py-6", children: t('specificationTypeIdPn') }), _jsx("th", { className: "px-10 py-6", children: t('storageLocation') }), _jsx("th", { className: "px-10 py-6 text-center", children: t('currentStock') }), canEdit && _jsx("th", { className: "px-10 py-6 text-right", children: t('management') })] }) }), _jsx("tbody", { className: "divide-y divide-slate-50", children: filteredMoffen.map((m) => (_jsxs("tr", { className: "hover:bg-blue-50/30 group transition-all", children: [_jsx("td", { className: "px-10 py-5", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "px-3 py-1.5 bg-slate-900 text-white text-[10px] font-black rounded-lg uppercase italic shadow-sm", children: m.type }), _jsxs("div", { className: "flex flex-col", children: [_jsxs("span", { className: "font-black text-slate-900 text-lg tracking-tighter italic", children: ["ID ", m.diameter] }), _jsx("span", { className: "text-[9px] font-black text-slate-400 uppercase tracking-widest", children: t('pnBar', { pressure: m.pressure }) })] })] }) }), _jsx("td", { className: "px-10 py-5", children: _jsxs("div", { className: "flex items-center gap-2.5 text-blue-600 font-black italic uppercase tracking-tighter", children: [_jsx(MapPin, { size: 16, className: "text-blue-400" }), m.location || t('adminLocations.noLocation')] }) }), _jsx("td", { className: "px-10 py-5 text-center", children: _jsxs("div", { className: "inline-flex flex-col items-center", children: [_jsx("span", { className: `text-2xl font-black italic tracking-tighter ${m.stock <= m.minStock
                                                                ? "text-rose-600 animate-pulse"
                                                                : "text-slate-900"}`, children: m.stock }), m.stock <= m.minStock && (_jsx("span", { className: "text-[8px] font-black text-rose-500 uppercase mt-1", children: t('lowStock') }))] }) }), canEdit && (_jsx("td", { className: "px-10 py-5 text-right opacity-0 group-hover:opacity-100 transition-all", children: _jsxs("div", { className: "flex justify-end gap-1", children: [_jsx("button", { onClick: () => {
                                                                setFormState(m);
                                                                setEditingId(m.id);
                                                                setIsEditing(true);
                                                            }, className: "p-3 bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all", children: _jsx(Edit2, { size: 18 }) }), _jsx("button", { onClick: () => handleDelete(m.id), className: "p-3 bg-slate-50 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all", children: _jsx(Trash2, { size: 18 }) })] }) }))] }, m.id))) })] }), filteredMoffen.length === 0 && (_jsxs("div", { className: "p-32 text-center opacity-30 italic flex flex-col items-center gap-4", children: [_jsx(Database, { size: 64, className: "text-slate-200" }), _jsx("p", { className: "text-sm font-black uppercase tracking-[0.3em] text-slate-400", children: t('noToolsFound') })] }))] }) }), isEditing && canEdit && (_jsx("div", { className: "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-in fade-in duration-300", children: _jsxs("div", { className: "bg-white rounded-[50px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/10", children: [_jsxs("div", { className: "p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50", children: [_jsxs("div", { className: "flex items-center gap-5", children: [_jsx("div", { className: "p-3.5 bg-emerald-600 text-white rounded-2xl shadow-xl shadow-emerald-200", children: _jsx(PackageCheck, { size: 28 }) }), _jsxs("div", { className: "text-left", children: [_jsxs("h3", { className: "text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none", children: [t('item'), " ", _jsx("span", { className: "text-emerald-600", children: t('register') })] }), _jsx("p", { className: "text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1.5 italic", children: t('racksInventory') })] })] }), _jsx("button", { onClick: () => setIsEditing(false), className: "p-3 hover:bg-slate-200 text-slate-300 rounded-2xl transition-all", children: _jsx(X, { size: 28 }) })] }), _jsxs("form", { onSubmit: handleSave, className: "p-12 space-y-10", children: [_jsxs("div", { className: "grid grid-cols-2 gap-8 text-left", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2", children: t('type') }), _jsxs("select", { className: "w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-800 outline-none focus:border-blue-500 appearance-none cursor-pointer", value: formState.type, onChange: (e) => setFormState({ ...formState, type: e.target.value }), children: [_jsx("option", { value: "TB", children: t('tbTaperBell') }), _jsx("option", { value: "CB", children: t('cbCylindricalBell') }), _jsx("option", { value: "ID", children: t('idInnerDie') })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2", children: t('diameter') }), _jsx("select", { className: "w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-800 outline-none focus:border-blue-500 appearance-none cursor-pointer", value: formState.diameter, onChange: (e) => setFormState({ ...formState, diameter: e.target.value }), children: STANDARD_DIAMETERS.map((d) => (_jsx("option", { value: d, children: t('idMm', { id: d }) }, d))) })] })] }), _jsxs("div", { className: "space-y-2 text-left", children: [_jsx("label", { className: "text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] ml-2 italic", children: t('rackLocationCode') }), _jsxs("div", { className: "relative group", children: [_jsx(MapPin, { className: "absolute left-5 top-1/2 -translate-y-1/2 text-emerald-500 transition-transform group-focus-within:scale-125", size: 24 }), _jsx("input", { className: "w-full pl-16 pr-6 py-5 bg-emerald-50/30 border-2 border-emerald-100 rounded-[25px] font-black text-xl text-slate-900 outline-none focus:border-emerald-500 shadow-inner tracking-widest", placeholder: "S-00-A", value: formState.location, onChange: (e) => setFormState({
                                                        ...formState,
                                                        location: e.target.value.toUpperCase(),
                                                    }), required: true })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-8 pt-6 border-t border-slate-50", children: [_jsxs("div", { className: "space-y-2 text-left", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2", children: t('currentStock') }), _jsx("input", { type: "number", className: "w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-2xl text-center outline-none focus:border-blue-500", value: formState.stock, onChange: (e) => setFormState({ ...formState, stock: e.target.value }) })] }), _jsxs("div", { className: "space-y-2 text-left", children: [_jsx("label", { className: "text-[10px] font-black text-rose-500 uppercase tracking-widest ml-2", children: t('minAlarmLimit') }), _jsx("input", { type: "number", className: "w-full p-5 bg-rose-50/30 border-2 border-rose-100 rounded-2xl font-black text-2xl text-center outline-none focus:border-rose-500", value: formState.minStock, onChange: (e) => setFormState({ ...formState, minStock: e.target.value }) })] })] }), _jsxs("button", { type: "submit", disabled: saving, className: "w-full py-7 bg-slate-900 text-white font-black uppercase text-sm tracking-[0.3em] rounded-[30px] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50", children: [saving ? (_jsx(Loader2, { className: "animate-spin" })) : (_jsx(Save, { size: 24 })), t('publishToRoot')] })] })] }) }))] }));
};
export default AdminLocationsView;
