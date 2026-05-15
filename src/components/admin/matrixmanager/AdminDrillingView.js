import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect } from "react";
import { useTranslation, Trans } from "react-i18next";
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, serverTimestamp, query, orderBy, } from "firebase/firestore";
import { db, auth, logActivity } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";
import { useNotifications } from "../../../contexts/NotificationContext";
import { Ruler, Plus, Trash2, Edit2, Check, X, Info, Search, Database, ShieldCheck, Loader2, Target, } from "lucide-react";
import { STANDARD_DIAMETERS, STANDARD_PRESSURES, } from "../../../data/constants";
/**
 * AdminDrillingView V4.0 - Root Path Sync
 * Beheert boorpatronen en steekcirkels (PCD) in de nieuwe root.
 * Pad: /future-factory/production/dimensions/bore/records/
 */
const AdminDrillingView = () => {
    const { t } = useTranslation();
    const { showConfirm, notify } = useNotifications();
    const [drillData, setDrillData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editData, setEditData] = useState({});
    const [searchTerm, setSearchTerm] = useState("");
    // Form voor nieuwe dimensie
    const [formData, setFormData] = useState({
        dn: "100",
        pn: "10",
        pcd: "",
        holes: "8",
        holeSize: "18",
        thread: "M16",
    });
    // 1. Live Sync met de Root BORE_DIMENSIONS collectie
    useEffect(() => {
        const colRef = collection(db, ...PATHS.BORE_DIMENSIONS);
        const q = query(colRef, orderBy("dn", "asc"));
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            // Handmatige sortering op DN (numeriek)
            setDrillData(data.sort((a, b) => parseInt(a.dn) - parseInt(b.dn)));
            setLoading(false);
        }, (err) => {
            console.error("Fout bij laden boorpatronen:", err);
            setLoading(false);
        });
        return () => unsub();
    }, []);
    const handleAdd = async (e) => {
        e.preventDefault();
        setSaving(true);
        // Maak een uniek ID op basis van DN en PN (bijv: ID100_PN10)
        const docId = `ID${formData.dn}_PN${formData.pn}`;
        try {
            const docRef = doc(db, ...PATHS.BORE_DIMENSIONS, docId);
            await setDoc(docRef, {
                ...formData,
                id: docId,
                lastUpdated: serverTimestamp(),
                updatedBy: auth.currentUser?.email || "Admin",
            }, { merge: true });
            await logActivity(auth.currentUser?.uid, "DRILLING_PATTERN_CREATE", `Boorpatroon aangemaakt: ${docId}`);
            setFormData({
                ...formData,
                pcd: "",
                holes: "8",
                holeSize: "18",
                thread: "M16",
            });
        }
        catch (err) {
            notify("Opslaan mislukt: " + err.message);
        }
        finally {
            setSaving(false);
        }
    };
    const saveEdit = async (id) => {
        try {
            const docRef = doc(db, ...PATHS.BORE_DIMENSIONS, id);
            await updateDoc(docRef, {
                ...editData,
                lastUpdated: serverTimestamp(),
            });
            await logActivity(auth.currentUser?.uid, "DRILLING_PATTERN_UPDATE", `Boorpatroon bijgewerkt: ${id}`);
            setEditingId(null);
        }
        catch (err) {
            notify(err.message);
        }
    };
    const handleDelete = async (id) => {
        const confirmed = await showConfirm({
            title: t('adminDrilling.deleteTitle', 'Boorpatroon verwijderen'),
            message: `Boorpatroon ${id} definitief verwijderen uit de root?`,
            confirmText: t('common.delete', 'Verwijderen'),
            cancelText: t('common.cancel', 'Annuleren'),
            tone: 'danger',
        });
        if (!confirmed)
            return;
        try {
            await deleteDoc(doc(db, ...PATHS.BORE_DIMENSIONS, id));
            await logActivity(auth.currentUser?.uid, "DRILLING_PATTERN_DELETE", `Boorpatroon verwijderd: ${id}`);
        }
        catch (err) {
            notify(err.message);
        }
    };
    const filteredData = drillData.filter((d) => String(d.dn).includes(searchTerm) || String(d.pn).includes(searchTerm));
    if (loading)
        return (_jsxs("div", { className: "p-20 text-center flex flex-col items-center gap-4", children: [_jsx(Loader2, { className: "animate-spin text-blue-500", size: 40 }), _jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400 italic", children: t('adminDrilling.loadingDimensions', 'Boorpatronen synchroniseren...') })] }));
    return (_jsxs("div", { className: "max-w-6xl mx-auto p-6 animate-in fade-in duration-500 text-left pb-32", children: [_jsxs("header", { className: "mb-10 flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm overflow-hidden relative", children: [_jsx("div", { className: "absolute top-0 right-0 p-8 opacity-5 rotate-12", children: _jsx(Target, { size: 120 }) }), _jsxs("div", { className: "text-left relative z-10", children: [_jsxs("h2", { className: "text-3xl font-black text-slate-900 flex items-center gap-4 tracking-tighter uppercase italic leading-none", children: [_jsx(Ruler, { className: "text-blue-600", size: 32 }), " ", t('adminDrilling.title', 'Boor Dimensies').split(' ')[0], " ", _jsx("span", { className: "text-blue-600", children: t('adminDrilling.title', 'Boor Dimensies').split(' ').slice(1).join(' ') })] }), _jsxs("div", { className: "mt-3 flex items-center gap-3", children: [_jsxs("span", { className: "flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase italic", children: [_jsx(ShieldCheck, { size: 10 }), " ", t('adminDrilling.rootProtected', 'Root Beveiligd')] }), _jsxs("p", { className: "text-[9px] font-mono text-slate-400 uppercase tracking-widest", children: ["Target: /", PATHS.BORE_DIMENSIONS.join("/")] })] })] }), _jsxs("div", { className: "relative w-full md:w-72 relative z-10", children: [_jsx(Search, { className: "absolute left-4 top-1/2 -translate-y-1/2 text-slate-300", size: 18 }), _jsx("input", { className: "w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-blue-500 transition-all shadow-inner", placeholder: t('adminDrilling.filterDn', 'Filter op DN of PN...'), value: searchTerm, onChange: (e) => setSearchTerm(e.target.value) })] })] }), _jsxs("section", { className: "bg-white p-10 rounded-[45px] border border-slate-200 shadow-sm mb-10 relative overflow-hidden", children: [_jsxs("div", { className: "flex items-center gap-2 mb-8", children: [_jsx(Plus, { size: 16, className: "text-blue-500" }), _jsx("h3", { className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic", children: t('adminDrilling.newPattern', 'Nieuw Patroon Vastleggen') })] }), _jsxs("form", { onSubmit: handleAdd, className: "grid grid-cols-2 md:grid-cols-6 gap-6 items-end", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2", children: t('common.dnMm', 'DN (mm)') }), _jsx("select", { className: "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-black text-slate-700 outline-none focus:border-blue-500 appearance-none cursor-pointer", value: formData.dn, onChange: (e) => setFormData({ ...formData, dn: e.target.value }), children: STANDARD_DIAMETERS.map((d) => (_jsxs("option", { value: d, children: ["ID ", d] }, d))) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2", children: t('adminDrilling.pressureClass', 'Drukklasse') }), _jsx("select", { className: "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-black text-slate-700 outline-none focus:border-blue-500 appearance-none cursor-pointer", value: formData.pn, onChange: (e) => setFormData({ ...formData, pn: e.target.value }), children: STANDARD_PRESSURES.map((p) => (_jsxs("option", { value: p, children: ["PN ", p] }, p))) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-blue-600 uppercase ml-2 italic", children: t('common.pcdMm', 'PCD (mm)') }), _jsx("input", { required: true, className: "w-full p-4 bg-blue-50/50 border-2 border-blue-100 rounded-2xl text-sm font-black text-blue-700 outline-none focus:border-blue-500 text-center placeholder:text-blue-200 shadow-inner", placeholder: "000.0", value: formData.pcd, onChange: (e) => setFormData({ ...formData, pcd: e.target.value }) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2", children: t('adminDrilling.count', 'Aantal (n)') }), _jsx("input", { required: true, className: "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 text-center", placeholder: "Bijv. 8", value: formData.holes, onChange: (e) => setFormData({ ...formData, holes: e.target.value }) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2", children: t('adminDrilling.boltSize', 'Boutmaat') }), _jsx("input", { required: true, className: "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 text-center", placeholder: "M..", value: formData.thread, onChange: (e) => setFormData({ ...formData, thread: e.target.value }) })] }), _jsx("button", { type: "submit", disabled: saving, className: "h-[54px] bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-blue-600 transition-all shadow-xl active:scale-95 disabled:opacity-50", children: saving ? (_jsx(Loader2, { className: "animate-spin mx-auto", size: 18 })) : (t('common.save', 'Vastleggen')) })] })] }), _jsxs("div", { className: "bg-white rounded-[50px] border border-slate-200 shadow-sm overflow-hidden", children: [_jsxs("table", { className: "w-full text-left text-sm border-collapse", children: [_jsx("thead", { className: "bg-slate-50 border-b text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]", children: _jsxs("tr", { children: [_jsx("th", { className: "px-8 py-6", children: t('adminDrilling.config', 'Configuratie (DN/PN)') }), _jsx("th", { className: "px-8 py-6 text-blue-600", children: t('adminDrilling.pcdCircle', 'PCD Steekcirkel') }), _jsx("th", { className: "px-8 py-6", children: t('adminDrilling.holes', 'Gaten (n)') }), _jsx("th", { className: "px-8 py-6", children: t('adminDrilling.boltSpec', 'Bout Specificatie') }), _jsx("th", { className: "px-8 py-6 text-right", children: t('adminDrilling.management', 'Beheer') })] }) }), _jsx("tbody", { className: "divide-y divide-slate-50", children: filteredData.map((d) => (_jsx("tr", { className: "hover:bg-slate-50/50 transition-colors group", children: editingId === d.id ? (_jsxs(_Fragment, { children: [_jsxs("td", { className: "px-8 py-4 font-black text-blue-600 italic", children: ["DN", d.dn, " PN", d.pn] }), _jsx("td", { className: "px-8 py-4", children: _jsx("input", { className: "w-24 p-2 bg-blue-50 border-2 border-blue-200 rounded-xl font-black text-blue-700 text-center outline-none", value: editData.pcd, onChange: (e) => setEditData({ ...editData, pcd: e.target.value }) }) }), _jsx("td", { className: "px-8 py-4", children: _jsx("input", { className: "w-20 p-2 bg-slate-100 border-2 border-slate-200 rounded-xl font-bold text-center outline-none", value: editData.holes, onChange: (e) => setEditData({ ...editData, holes: e.target.value }) }) }), _jsx("td", { className: "px-8 py-4", children: _jsx("input", { className: "w-24 p-2 bg-slate-100 border-2 border-slate-200 rounded-xl font-bold text-center outline-none", value: editData.thread, onChange: (e) => setEditData({ ...editData, thread: e.target.value }) }) }), _jsx("td", { className: "px-8 py-4 text-right", children: _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { onClick: () => saveEdit(d.id), className: "p-2.5 bg-emerald-500 text-white rounded-xl shadow-lg hover:bg-emerald-600 transition-all", children: _jsx(Check, { size: 16 }) }), _jsx("button", { onClick: () => setEditingId(null), className: "p-2.5 bg-slate-200 text-slate-500 rounded-xl hover:bg-slate-300 transition-all", children: _jsx(X, { size: 16 }) })] }) })] })) : (_jsxs(_Fragment, { children: [_jsx("td", { className: "px-8 py-5", children: _jsxs("div", { className: "flex flex-col text-left", children: [_jsxs("span", { className: "font-black text-slate-900 text-lg tracking-tighter italic leading-none", children: ["ID ", d.dn] }), _jsx("span", { className: "text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1", children: t('adminDrilling.pressureClassPn', { pn: d.pn }) })] }) }), _jsx("td", { className: "px-8 py-5", children: _jsxs("span", { className: "bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-mono font-black text-sm border border-blue-100 shadow-inner", children: [d.pcd, " mm"] }) }), _jsx("td", { className: "px-8 py-5", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-sm font-black text-slate-700 italic", children: d.holes }), _jsx("span", { className: "text-[9px] font-bold text-slate-400 uppercase tracking-tighter", children: t('adminDrilling.holesLabel', 'Gaten') })] }) }), _jsx("td", { className: "px-8 py-5", children: _jsx("span", { className: "text-sm font-black text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 uppercase", children: d.thread }) }), _jsx("td", { className: "px-8 py-5 text-right opacity-0 group-hover:opacity-100 transition-all", children: _jsxs("div", { className: "flex justify-end gap-1", children: [_jsx("button", { onClick: () => {
                                                                setEditingId(d.id);
                                                                setEditData(d);
                                                            }, className: "p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all", children: _jsx(Edit2, { size: 18 }) }), _jsx("button", { onClick: () => handleDelete(d.id), className: "p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all", children: _jsx(Trash2, { size: 18 }) })] }) })] })) }, d.id))) })] }), filteredData.length === 0 && (_jsxs("div", { className: "p-20 text-center opacity-30 italic", children: [_jsx(Database, { size: 48, className: "mx-auto mb-4 text-slate-300" }), _jsx("p", { className: "text-sm font-black uppercase tracking-widest text-slate-400", children: t('adminDrilling.noPatterns', 'Geen patronen gevonden voor deze filters') })] }))] }), _jsxs("div", { className: "mt-12 bg-slate-900 p-8 rounded-[45px] text-white/50 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-6 relative overflow-hidden", children: [_jsx("div", { className: "absolute top-0 right-0 p-8 opacity-5 rotate-12", children: _jsx(Database, { size: 100 }) }), _jsx("div", { className: "p-3 bg-blue-600 rounded-xl text-white shadow-lg", children: _jsx(Info, { size: 20 }) }), _jsxs("div", { className: "text-left flex-1 relative z-10 leading-relaxed max-w-3xl", children: [_jsx("h4", { className: "text-white text-sm mb-2 italic tracking-tight uppercase leading-none", children: t('adminDrilling.footerTitle', 'Engineering Control Protocol') }), _jsxs(Trans, { i18nKey: "adminDrilling.footerText", children: ["De boorpatronen in deze lijst worden gebruikt door de ", _jsx("strong", { children: "Product Configurator" }), " en ", _jsx("strong", { children: "Eindinspectie" }), " om te controleren of flenzen voldoen aan de technische eisen. Wijzigingen zijn direct live voor alle terminals."] })] })] })] }));
};
export default AdminDrillingView;
