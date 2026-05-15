import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useMemo, useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { BoxSelect, PenTool, Settings, LayoutGrid, Edit2, Search, Trash2 } from "lucide-react";
import { collection, onSnapshot, deleteDoc, doc } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useNotifications } from "../../contexts/NotificationContext";
import AdminLabelDesigner from "./AdminLabelDesigner";
import AdminLabelLogic from "./AdminLabelLogic";
import AutoScaledLabelPreview from "../printer/AutoScaledLabelPreview.tsx";
import { processLabelData } from "../../utils/labelHelpers";
const LABEL_FOLDER_OPTIONS = [
    "Tijdelijk Wavistrong",
    "Tijdelijk Fibermar",
    "Tijdelijk Code",
    "Wavistrong",
    "Fibermar",
    "Code",
    "Flenzen",
];
const AdminLabelManager = ({ onNavigate }) => {
    const { t } = useTranslation();
    const { showConfirm, notify } = useNotifications();
    const genericFolderLabel = t('common.generic', 'Generiek');
    const [activeTab, setActiveTab] = useState("designer");
    const [savedLabels, setSavedLabels] = useState([]);
    const [templateSearch, setTemplateSearch] = useState("");
    const [designerOpenLabelId, setDesignerOpenLabelId] = useState(null);
    const [collapsedGroups, setCollapsedGroups] = useState({});
    const [deletingTemplateId, setDeletingTemplateId] = useState(null);
    useEffect(() => {
        const colRef = collection(db, ...PATHS.LABEL_TEMPLATES);
        const unsub = onSnapshot(colRef, (snap) => {
            setSavedLabels(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, []);
    const inferFolderFromTags = (tags = []) => {
        const upperTags = tags.map(t => String(t).toUpperCase());
        const isTemp = upperTags.includes("TIJDELIJK") || upperTags.includes("TEMP");
        const hasWavi = upperTags.includes("WAVISTRONG");
        const hasFiber = upperTags.includes("FIBERMAR");
        const hasCode = upperTags.includes("CODE");
        const hasFlenzen = upperTags.includes("FLENS") || upperTags.includes("FLENZEN");
        if (isTemp && hasWavi)
            return "Tijdelijk Wavistrong";
        if (isTemp && hasFiber)
            return "Tijdelijk Fibermar";
        if (isTemp && hasCode)
            return "Tijdelijk Code";
        if (hasWavi)
            return "Wavistrong";
        if (hasFiber)
            return "Fibermar";
        if (hasCode)
            return "Code";
        if (hasFlenzen)
            return "Flenzen";
        return genericFolderLabel;
    };
    const groupedTemplates = useMemo(() => {
        const groups = {};
        const filtered = savedLabels
            .filter(label => {
            const term = templateSearch.trim().toLowerCase();
            if (!term)
                return true;
            return (String(label.name || "").toLowerCase().includes(term) ||
                (label.tags || []).some(tag => String(tag).toLowerCase().includes(term)) ||
                String(label.folder || "").toLowerCase().includes(term));
        })
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        filtered.forEach(label => {
            const folder = label.folder || inferFolderFromTags(label.tags || []);
            if (!groups[folder])
                groups[folder] = [];
            groups[folder].push(label);
        });
        const keys = Object.keys(groups).sort((a, b) => {
            const pa = LABEL_FOLDER_OPTIONS.indexOf(a);
            const pb = LABEL_FOLDER_OPTIONS.indexOf(b);
            if (pa !== -1 && pb !== -1)
                return pa - pb;
            if (pa !== -1)
                return -1;
            if (pb !== -1)
                return 1;
            if (a === genericFolderLabel)
                return 1;
            if (b === genericFolderLabel)
                return -1;
            return a.localeCompare(b);
        });
        return { groups, keys };
    }, [savedLabels, templateSearch, genericFolderLabel]);
    useEffect(() => {
        setCollapsedGroups((prev) => {
            const next = { ...prev };
            groupedTemplates.keys.forEach((key) => {
                if (next[key] === undefined) {
                    next[key] = true;
                }
            });
            return next;
        });
    }, [groupedTemplates.keys]);
    const openInDesigner = (labelId) => {
        setDesignerOpenLabelId(labelId);
        setActiveTab("designer");
    };
    const toggleGroup = (groupKey) => {
        setCollapsedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
    };
    const deleteTemplate = async (label) => {
        if (!label?.id)
            return;
        const confirmMessage = label?.name
            ? `${t('adminLabelDesigner.confirmDelete')}\n\n${label.name}`
            : t('adminLabelDesigner.confirmDelete');
        const confirmed = await showConfirm({
            title: t('adminLabelDesigner.deleteTitle', 'Template verwijderen'),
            message: confirmMessage,
            confirmText: t('common.delete', 'Verwijderen'),
            cancelText: t('common.cancel', 'Annuleren'),
            tone: 'danger',
        });
        if (!confirmed)
            return;
        setDeletingTemplateId(label.id);
        try {
            await deleteDoc(doc(db, ...PATHS.LABEL_TEMPLATES, label.id));
            await logActivity(auth.currentUser?.uid, "LABEL_TEMPLATE_DELETE", `Label template verwijderd: ${label.name || label.id}`);
            if (designerOpenLabelId === label.id) {
                setDesignerOpenLabelId(null);
            }
        }
        catch (e) {
            console.error("Delete template error:", e);
            notify(t('adminLabelDesigner.deleteError'));
        }
        finally {
            setDeletingTemplateId(null);
        }
    };
    return (_jsxs("div", { className: "h-full flex flex-col bg-slate-50 min-w-0", children: [_jsxs("div", { className: "bg-white border-b border-slate-200 px-3 sm:px-4 lg:px-6 py-3 flex flex-wrap items-center gap-3 justify-between shrink-0 z-30 shadow-sm min-w-0", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "p-2 bg-orange-50 text-orange-600 rounded-xl border border-orange-100", children: _jsx(BoxSelect, { size: 20 }) }), _jsxs("h1", { className: "text-base lg:text-lg font-black text-slate-900 tracking-tight uppercase italic hidden md:block", children: [t('common.label'), " ", _jsx("span", { className: "text-orange-600", children: t('common.manager') })] })] }), _jsx("div", { className: "w-full lg:w-auto overflow-x-auto", children: _jsxs("div", { className: "flex w-max min-w-full lg:min-w-0 bg-slate-100 p-1 rounded-xl", children: [_jsxs("button", { onClick: () => setActiveTab("designer"), className: `flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === "designer"
                                        ? "bg-white text-orange-600 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"}`, children: [_jsx(PenTool, { size: 14 }), " ", _jsx("span", { className: "hidden sm:inline", children: t('common.designer') })] }), _jsxs("button", { onClick: () => setActiveTab("logic"), className: `flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === "logic"
                                        ? "bg-white text-blue-600 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"}`, children: [_jsx(Settings, { size: 14 }), " ", _jsx("span", { className: "hidden sm:inline", children: t('common.logic') })] }), _jsxs("button", { onClick: () => setActiveTab("templates"), className: `flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === "templates"
                                        ? "bg-white text-emerald-600 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"}`, children: [_jsx(LayoutGrid, { size: 14 }), " ", _jsx("span", { className: "hidden sm:inline", children: t('common.labelTemplates', 'Label Templates') })] })] }) })] }), _jsxs("div", { className: "flex-1 overflow-hidden relative", children: [activeTab === "designer" && (_jsx(AdminLabelDesigner, { onBack: () => onNavigate && onNavigate(null), openLabelId: designerOpenLabelId })), activeTab === "logic" && (_jsx("div", { className: "h-full overflow-hidden", children: _jsx(AdminLabelLogic, {}) })), activeTab === "templates" && (_jsx("div", { className: "h-full overflow-y-auto p-3 sm:p-4 md:p-6 bg-slate-100", children: _jsxs("div", { className: "max-w-7xl mx-auto", children: [_jsxs("div", { className: "mb-6 flex flex-col md:flex-row gap-4 md:items-center md:justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight", children: t('common.labelTemplates', 'Label Templates') }), _jsx("p", { className: "text-sm font-medium text-slate-500", children: t('common.templatesOverview', 'Groot overzicht per vaste map. Klik op het pennetje om direct in Designer te openen.') })] }), _jsxs("div", { className: "relative w-full md:w-80 lg:w-96", children: [_jsx(Search, { size: 16, className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" }), _jsx("input", { type: "text", value: templateSearch, onChange: (e) => setTemplateSearch(e.target.value), placeholder: t('common.searchTemplatePlaceholder', 'Zoek op naam, tag of map...'), className: "w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-emerald-500" })] })] }), _jsx("div", { className: "space-y-8", children: groupedTemplates.keys.map((group) => (_jsxs("section", { children: [_jsxs("button", { type: "button", onClick: () => toggleGroup(group), className: "w-full text-left text-xs font-black text-slate-600 uppercase tracking-widest mb-3 flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 hover:bg-slate-50", children: [_jsx("span", { children: group }), _jsx("span", { className: "text-[10px] text-slate-400", children: collapsedGroups[group] ? t('common.open', 'Openen') : t('common.close', 'Sluiten') })] }), !collapsedGroups[group] && (_jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5", children: groupedTemplates.groups[group].map((label) => (_jsxs("article", { className: "bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow", children: [_jsx("div", { className: "h-40 sm:h-48 xl:h-56 bg-slate-50 border border-slate-100 rounded-xl mb-3 flex items-center justify-center overflow-hidden", children: _jsx("div", { className: "w-full h-full p-2", children: _jsx(AdminLabelDesignerPreviewWrapper, { label: label }) }) }), _jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-sm font-black text-slate-800 truncate", children: label.name }), _jsxs("p", { className: "text-[11px] text-slate-500 font-semibold", children: [label.width, "x", label.height, "mm"] })] }), _jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [_jsx("button", { onClick: () => openInDesigner(label.id), className: "p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100", title: t('common.openInDesigner', 'Open in Designer'), children: _jsx(Edit2, { size: 14 }) }), _jsx("button", { onClick: () => deleteTemplate(label), disabled: deletingTemplateId === label.id, className: "p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100 disabled:opacity-50 disabled:cursor-not-allowed", title: t('adminLabelDesigner.deleteTitle'), children: _jsx(Trash2, { size: 14 }) })] })] }), label.tags && label.tags.length > 0 && (_jsxs("div", { className: "mt-3 flex flex-wrap gap-1", children: [label.tags.slice(0, 4).map((tag, idx) => (_jsx("span", { className: "text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase", children: tag }, `${label.id}-${idx}`))), label.tags.length > 4 && (_jsxs("span", { className: "text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500", children: ["+", label.tags.length - 4] }))] }))] }, label.id))) }))] }, group))) }), groupedTemplates.keys.length === 0 && (_jsx("div", { className: "text-center py-16 text-slate-500 font-semibold", children: t('common.noLabelTemplates', 'Geen label templates gevonden.') }))] }) }))] })] }));
};
const AdminLabelDesignerPreviewWrapper = ({ label }) => {
    const rawWidth = Number(label?.width) || 90;
    const rawHeight = Number(label?.height) || 55;
    const safeWidth = Math.max(1, rawWidth);
    const safeHeight = Math.max(1, rawHeight);
    const maxPreviewWidth = 320;
    const maxPreviewHeight = 180;
    const scale = Math.min(maxPreviewWidth / safeWidth, maxPreviewHeight / safeHeight);
    const previewWidth = Math.max(120, Math.round(safeWidth * scale));
    const previewHeight = Math.max(70, Math.round(safeHeight * scale));
    const previewData = processLabelData({
        lotNumber: "PREVIEW-001",
        orderId: "N200123",
        orderNumber: "N200123",
        itemCode: "REDCON-300X250",
        productId: "REDCON-300X250",
        item: "RedCon 300x250 EMT30/10 CBCB",
        description: "RedCon 300x250 EMT30/10 CBCB",
        machine: "BH18",
        station: "BH18",
    });
    return (_jsx("div", { className: "w-full h-full flex items-center justify-center", children: _jsx("div", { className: "bg-white border border-slate-100 rounded-lg flex items-center justify-center overflow-hidden p-1", style: { width: `${previewWidth}px`, height: `${previewHeight}px` }, children: _jsx(AutoScaledLabelPreview, { label: label, data: previewData, className: "pointer-events-none" }) }) }));
};
export default AdminLabelManager;
