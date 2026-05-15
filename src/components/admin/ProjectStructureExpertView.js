import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect } from "react";
import { BookOpen, ChevronRight, ChevronDown, Zap, FileCode, Info, Shield, Database, Printer, Cpu, Layers, Settings, Box, Bot, Loader2, AlertTriangle } from "lucide-react";
import { aiService } from "../../services/aiService";
/**
 * UITGEBREIDE TECHNISCHE DOCUMENTATIE
 * Deze database bevat de uitleg voor elk bestand in het systeem.
 */
const fileDetails = {
    // CONFIGURATIE
    "src/config/dbPaths.js": {
        title: "Database Path Manager",
        desc: "De centrale verkeerstoren voor data-routing. Switcht de root tussen /future-factory/ (productie) en /artifacts/ (test) op basis van de omgeving. Dit voorkomt dat testdata in de echte fabriek terechtkomt.",
        tags: ["Architectuur", "Veiligheid", "Firestore"]
    },
    "src/config/firebase.js": {
        title: "Firebase Initialisatie",
        desc: "Stelt de verbinding in met de Google Firebase services (Firestore, Auth, Functions). Bevat de SDK configuratie.",
        tags: ["Infrastructuur", "Firebase"]
    },
    // MODALS (DE DIALOGEN)
    "src/components/digitalplanning/modals/ProductionStartModal.jsx": {
        title: "Productie Start Dialog",
        desc: "Het startpunt voor een operator op BH18. Handelt het scannen van orders en het koppelen van lotnummers af.",
        tags: ["Modal", "BH18", "Workflow"]
    },
    "src/components/digitalplanning/modals/InspectionModal.jsx": {
        title: "Keuringsvenster",
        desc: "Interface voor het invoeren van meetgegevens (diameter, wanddikte). Vervangt de papieren meetlijsten.",
        tags: ["Kwaliteit", "Data-Entry"]
    },
    "src/components/digitalplanning/modals/TraceModal.jsx": {
        title: "Traceability Viewer",
        desc: "Biedt inzicht in de volledige geschiedenis van een product: wie heeft het gewikkeld, wanneer is het gelost en door wie is het goedgekeurd.",
        tags: ["Traceability", "ISO-Audit"]
    },
    "src/components/digitalplanning/modals/PlanningImportModal.jsx": {
        title: "Planning Importeur",
        desc: "Gids voor planners (Edwin/Frank) om Excel of CSV bestanden uit LN te importeren naar de digitale planning.",
        tags: ["ERP", "Import", "Admin"]
    },
    "src/components/digitalplanning/modals/TerminalSelectionModal.jsx": {
        title: "Terminal Kiezer",
        desc: "Eerste scherm op een nieuwe tablet. Hiermee bepaalt de gebruiker of de tablet fungeert als BH18 terminal, Nabewerking of BM01 Hub.",
        tags: ["Setup", "UX"]
    },
    // UTILS & LOGICA
    "src/utils/infor_sync_service.js": {
        title: "Infor LN Sync Engine",
        desc: "Bevat de logica om orderdata uit het ERP systeem te trekken. Dit is het hart van de hybride pilot.",
        tags: ["ERP", "Integratie"]
    },
    "src/utils/zplHelper.js": {
        title: "Zebra ZPL Driver",
        desc: "Vertaalt labels naar Zebra code. Geoptimaliseerd voor papierbesparing (geen witruimte) en batch-snijden voor 90mm rollen.",
        tags: ["Printing", "ZPL", "Optimalisatie"]
    },
    "src/utils/workstationLogic.js": {
        title: "Routering Logica",
        desc: "Bepaalt de workflow van een product. Bijv: Diameter > 300mm sturen naar Trekbank-terminal i.p.v. standaard losplek.",
        tags: ["Business Logic", "Routing"]
    },
    // HUBS & VIEWS
    "src/components/digitalplanning/BM01Hub.jsx": {
        title: "BM01 Eindcontrole Hub",
        desc: "Het zenuwcentrum voor de keurmeester. Genereert de dubbele QR-codes voor Factory Track overdracht.",
        tags: ["Kwaliteit", "BM01", "QR"]
    },
    "src/components/digitalplanning/terminal/TerminalProductionView.jsx": {
        title: "BH18 Live Scherm",
        desc: "Toont de actuele status van de wikkelbank. In de toekomst gekoppeld aan de Beckhoff PLC via de Edge Gateway.",
        tags: ["Real-time", "Operator", "UI"]
    },
    "src/components/admin/AdminUsersView.jsx": {
        title: "Gebruikers & Wachtwoord Beheer",
        desc: "Beheermodule voor accounts. Inclusief de 'Admin Override' om wachtwoorden van @fpi.nl accounts te resetten zonder e-mail.",
        tags: ["Admin", "Security", "Auth"]
    },
    // INFRASTRUCTUUR
    "firestore.rules": {
        title: "Database Beveiliging",
        desc: "De 'uitsmijter' van de database. Zorgt dat alleen geautoriseerd personeel bij de /future-factory/ data kan.",
        tags: ["Security", "Database"]
    },
    "ROADMAP.md": {
        title: "Project Strategie",
        desc: "Beschrijft de 4 fasen van de pilot en de technische stappen voor de Beckhoff integratie.",
        tags: ["Documentatie", "Planning"]
    },
    // --- GEMIGREERD VAN OUDE VERSIE ---
    "src/components/admin/AdminDashboard.jsx": { title: "Admin Dashboard", desc: "Hoofdscherm voor alle admin-functies, bevat tabbladen voor alle beheermodules.", tags: ["Admin", "UI"] },
    "src/components/admin/AdminProductManager.jsx": { title: "Product Manager", desc: "Beheer van producten, toevoegen/bewerken/verwijderen van productdata.", tags: ["Admin", "Producten"] },
    "src/components/admin/AdminLogView.jsx": { title: "Audit Log", desc: "Logboek van alle belangrijke systeemacties en wijzigingen.", tags: ["Admin", "Logs"] },
    "src/components/admin/AdminLabelDesigner.jsx": { title: "Label Designer", desc: "Visuele editor voor het ontwerpen van labels en etiketten.", tags: ["Admin", "Labels"] },
    "src/components/admin/AdminReferenceTable.jsx": { title: "Reference Table", desc: "Technische encyclopedie en referentietabellen.", tags: ["Admin", "Data"] },
    "src/components/admin/ProductionTimeStandardsManager.jsx": { title: "Time Standards", desc: "Beheer van standaard productietijden per product/machine.", tags: ["Admin", "Efficiency"] },
    "src/components/digitalplanning/EfficiencyDashboard.jsx": { title: "Efficiency Dashboard", desc: "Dashboard met efficiency metrics en real-time performance.", tags: ["Planning", "KPI"] },
    "src/components/digitalplanning/DigitalPlanningHub.jsx": { title: "Planning Hub", desc: "Hoofdhub voor digitale productieplanning.", tags: ["Planning", "Core"] },
    "src/components/digitalplanning/MobileScanner.jsx": { title: "Mobile Scanner", desc: "Mobiele scanner voor werkvloer en voorraadbeheer.", tags: ["Mobile", "Scanner"] },
    "src/components/notifications/ToastContainer.jsx": { title: "Toast Container", desc: "UI-container voor alle toastmeldingen.", tags: ["UI", "Notificaties"] },
    "src/components/products/ProductSearchView.jsx": { title: "Product Search", desc: "Zoek- en filtercomponent voor producten.", tags: ["Producten", "Search"] },
    "src/components/products/ProductCard.jsx": { title: "Product Card", desc: "Visuele kaartweergave van een product.", tags: ["UI", "Producten"] },
    "src/components/personnel/PersonnelListView.jsx": { title: "Personnel List", desc: "Overzicht en beheer van personeel.", tags: ["Personeel", "Admin"] },
    "src/components/planning/KanbanBoardView.jsx": { title: "Kanban Board", desc: "Kanban-bord voor orderplanning.", tags: ["Planning", "UI"] },
    "src/components/planning/GanttChartView.jsx": { title: "Gantt Chart", desc: "Gantt-diagram voor tijdlijnplanning.", tags: ["Planning", "UI"] },
    "src/components/ai/AiCenterView.jsx": { title: "AI Center", desc: "AI-hub: training, documenten, flashcards.", tags: ["AI", "Core"] },
    "src/components/ai/AiTrainingView.jsx": { title: "AI Training", desc: "Trainingsmodule voor AI-kennis.", tags: ["AI", "Training"] },
    "src/components/teamleader/TeamleaderDashboard.jsx": { title: "Teamleader Dashboard", desc: "Dashboard voor teamleiders.", tags: ["Teamleader", "KPI"] },
    "src/components/debug/FirestoreDebugger.jsx": { title: "Firestore Debugger", desc: "Debugtool voor Firestore-database.", tags: ["Debug", "Database"] },
    "src/contexts/NotificationContext.jsx": { title: "Notification Context", desc: "Context provider voor notificatiesysteem.", tags: ["Context", "Core"] },
    "src/hooks/useAdminAuth.js": { title: "Auth Hook", desc: "Custom React hook voor admin authenticatie.", tags: ["Hooks", "Auth"] },
    "src/hooks/useProductsData.js": { title: "Products Hook", desc: "Custom React hook voor productdata.", tags: ["Hooks", "Data"] },
    "src/utils/efficiencyCalculator.js": { title: "Efficiency Calc", desc: "Helperfuncties voor efficiencyberekeningen.", tags: ["Utils", "Math"] },
    "src/utils/autoLearningService.js": { title: "Auto Learning", desc: "Automatisch AI-leren van gebruikersacties.", tags: ["AI", "Service"] },
    "src/utils/automationEngine.js": { title: "Automation Engine", desc: "Automatiseringsengine voor workflows.", tags: ["Automation", "Core"] },
    "src/utils/conversionLogic.js": { title: "Conversion Logic", desc: "Logica voor eenheden- en data-conversies.", tags: ["Utils", "Data"] },
    "src/utils/helpers.js": { title: "Helpers", desc: "Algemene helperfuncties.", tags: ["Utils"] },
    "src/services/aiService.js": { title: "AI Service", desc: "Service voor AI API-calls en integratie.", tags: ["Service", "AI"] },
    "src/services/planningContext.js": { title: "Planning Context", desc: "Context voor planningsdata en -logica.", tags: ["Context", "Planning"] },
    "src/data/aiContext.js": { title: "AI Context Data", desc: "AI contextdata voor kennisbank.", tags: ["Data", "AI"] },
    "src/data/aiPrompts.js": { title: "AI Prompts", desc: "AI prompts en instructies voor de assistent.", tags: ["Data", "AI"] },
    "src/data/constants.js": { title: "Constants", desc: "Algemene constanten voor de app.", tags: ["Data", "Config"] }
};
/**
 * DE VOLLEDIGE PROJECTBOOM
 * Gebaseerd op de 5e405e21 snapshot.
 */
const projectStructure = [
    {
        label: "Config & Core",
        icon: _jsx(Shield, { className: "w-4 h-4 text-red-500" }),
        children: [
            "src/config/dbPaths.js",
            "src/config/firebase.js",
            "src/contexts/NotificationContext.jsx",
            "src/main.jsx",
            "src/App.jsx"
        ]
    },
    {
        label: "Digital Planning (Fittings Flow)",
        icon: _jsx(Zap, { className: "w-4 h-4 text-amber-500" }),
        children: [
            "src/components/digitalplanning/BM01Hub.jsx",
            "src/components/digitalplanning/WorkstationHub.jsx",
            "src/components/digitalplanning/Terminal.jsx",
            "src/components/digitalplanning/EfficiencyDashboard.jsx",
            {
                label: "Modals (Interactiiv)",
                children: [
                    "src/components/digitalplanning/modals/ProductionStartModal.jsx",
                    "src/components/digitalplanning/modals/InspectionModal.jsx",
                    "src/components/digitalplanning/modals/TraceModal.jsx",
                    "src/components/digitalplanning/modals/PlanningImportModal.jsx",
                    "src/components/digitalplanning/modals/TerminalSelectionModal.jsx",
                    "src/components/digitalplanning/modals/ProductDossierModal.jsx",
                    "src/components/digitalplanning/modals/OrderEditModal.jsx",
                    "src/components/digitalplanning/modals/LotOverrideModal.jsx"
                ]
            },
            {
                label: "Terminal Views",
                children: [
                    "src/components/digitalplanning/terminal/TerminalProductionView.jsx",
                    "src/components/digitalplanning/terminal/TerminalPlanningView.jsx",
                    "src/components/digitalplanning/terminal/TerminalManualInput.jsx"
                ]
            }
        ]
    },
    {
        label: "Admin & Matrix Management",
        icon: _jsx(Settings, { className: "w-4 h-4 text-blue-500" }),
        children: [
            "src/components/admin/AdminDashboard.jsx",
            "src/components/admin/AdminUsersView.jsx",
            "src/components/admin/AdminLabelDesigner.jsx",
            "src/components/admin/AdminDatabaseView.jsx",
            "src/components/admin/FactoryStructureManager.jsx",
            {
                label: "Matrix Manager",
                children: [
                    "src/components/admin/matrixmanager/AdminMatrixManager.jsx",
                    "src/components/admin/matrixmanager/DimensionsView.jsx",
                    "src/components/admin/matrixmanager/MatrixGrid.jsx"
                ]
            }
        ]
    },
    {
        label: "Utility Services (De Motor)",
        icon: _jsx(Cpu, { className: "w-4 h-4 text-green-500" }),
        children: [
            "src/utils/infor_sync_service.js",
            "src/utils/zplHelper.js",
            "src/utils/workstationLogic.js",
            "src/utils/efficiencyCalculator.js",
            "src/utils/pdfGenerator.js",
            "src/services/aiService.js",
            "src/services/planningContext.js"
        ]
    },
    {
        label: "Infrastructuur (Root Files)",
        icon: _jsx(Layers, { className: "w-4 h-4 text-gray-500" }),
        children: [
            "firestore.rules",
            "vercel.json",
            "package.json",
            "vite.config.ts",
            "ROADMAP.md"
        ]
    }
];
const TreeNode = ({ node, path = "", level = 0, onSelect, selectedPath }) => {
    const [open, setOpen] = useState(level === 0 || level === 1);
    const isDir = typeof node === "object" && node.children;
    const label = node.label || node;
    const fullPath = path ? (node.label ? `${path}/${label}` : label) : label;
    const isSelected = selectedPath === fullPath;
    return (_jsxs("div", { className: "ml-4", children: [_jsxs("div", { onClick: () => isDir ? setOpen(!open) : onSelect(fullPath), className: `flex items-center py-1.5 px-2 rounded-lg cursor-pointer transition-all duration-200 ${isSelected ? "bg-blue-100 text-blue-700 shadow-sm" : "hover:bg-gray-100"}`, children: [isDir ? (_jsx("div", { className: "mr-2", children: open ? _jsx(ChevronDown, { className: "w-4 h-4 text-gray-400" }) : _jsx(ChevronRight, { className: "w-4 h-4 text-gray-400" }) })) : (_jsx("div", { className: "mr-2", children: _jsx(FileCode, { className: `w-4 h-4 ${isSelected ? "text-blue-600" : "text-blue-300"}` }) })), isDir && node.icon && _jsx("span", { className: "mr-2", children: node.icon }), _jsx("span", { className: `text-sm ${isDir ? "font-bold text-gray-700" : "text-gray-600"}`, children: label.split('/').pop() })] }), isDir && open && (_jsx("div", { className: "border-l border-gray-200 ml-3 mt-1 mb-2", children: node.children.map((child, i) => (_jsx(TreeNode, { node: child, path: fullPath, level: level + 1, onSelect: onSelect, selectedPath: selectedPath }, i))) }))] }));
};
const ProjectStructureExpertView = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [aiExplanation, setAiExplanation] = useState("");
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isAiConfigured, setIsAiConfigured] = useState(false);
    const detail = fileDetails[selectedFile] || null;
    useEffect(() => {
        setAiExplanation("");
        setIsAiLoading(false);
        if (aiService && aiService.isConfigured && aiService.isConfigured()) {
            setIsAiConfigured(true);
        }
        else {
            setIsAiConfigured(false);
        }
    }, [selectedFile]);
    const handleAskAi = async () => {
        if (!selectedFile)
            return;
        setIsAiLoading(true);
        try {
            const prompt = `Je bent een senior software architect. Leg uit wat het bestand of de map '${selectedFile}' doet in deze React/Firebase applicatie. Geef een beknopte, technische maar begrijpelijke uitleg.`;
            const response = await aiService.chat([{ role: "user", content: prompt }]);
            setAiExplanation(response);
        }
        catch (error) {
            console.error("AI Error:", error);
            if (String(error?.message || "").toLowerCase().includes('key')) {
                setAiExplanation("Configuratie fout: backend AI sleutel ontbreekt of is ongeldig. Controleer Firebase Functions config of environment variables op de server.");
            }
            else {
                setAiExplanation("Kon geen uitleg genereren. Controleer de console voor foutmeldingen.");
            }
        }
        finally {
            setIsAiLoading(false);
        }
    };
    return (_jsxs("div", { className: "flex flex-col h-full bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden", children: [_jsxs("div", { className: "p-6 border-b border-gray-100 bg-slate-900 text-white flex items-center justify-between", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-2xl font-black flex items-center tracking-tight", children: [_jsx(BookOpen, { className: "w-8 h-8 mr-3 text-blue-400" }), "ENGINEERING PORTAL"] }), _jsx("p", { className: "text-slate-400 text-xs uppercase font-bold tracking-widest mt-1", children: "FPi Future Factory \u2022 Systeem Architectuur & Onboarding" })] }), _jsxs("div", { className: "flex items-center space-x-3", children: [_jsxs("div", { className: "text-right mr-4 hidden md:block", children: [_jsx("p", { className: "text-[10px] text-slate-500 font-mono", children: "GIT_HASH: 5e405e21" }), _jsx("p", { className: "text-[10px] text-green-400 font-mono italic", children: "BUILD_STATUS: STABLE" })] }), _jsx("div", { className: "bg-blue-500/20 text-blue-400 px-4 py-2 rounded-xl border border-blue-500/30 text-xs font-black", children: "PILOT v3.0" })] })] }), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsxs("div", { className: "w-1/2 overflow-y-auto p-6 border-r border-gray-100 bg-gray-50/30 scrollbar-thin scrollbar-thumb-gray-200", children: [_jsx("h3", { className: "text-[10px] uppercase font-black text-gray-400 mb-4 tracking-[0.2em]", children: "Project Verkenner" }), projectStructure.map((node, i) => (_jsx(TreeNode, { node: node, onSelect: setSelectedFile, selectedPath: selectedFile }, i)))] }), _jsx("div", { className: "w-1/2 p-8 bg-white overflow-y-auto", children: selectedFile ? (_jsxs("div", { className: "animate-in fade-in slide-in-from-bottom-4 duration-500", children: [_jsxs("div", { className: "flex items-center space-x-3 mb-6", children: [_jsx("div", { className: "p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-200", children: _jsx(Cpu, { className: "w-6 h-6 text-white" }) }), _jsxs("div", { children: [_jsx("h3", { className: "text-xl font-black text-gray-900", children: detail?.title || selectedFile.split('/').pop() }), _jsx("p", { className: "text-xs font-mono text-blue-600 break-all", children: selectedFile })] })] }), _jsxs("div", { className: "space-y-6", children: [detail && (_jsxs(_Fragment, { children: [_jsxs("section", { children: [_jsxs("h4", { className: "text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest flex items-center", children: [_jsx(Info, { className: "w-3 h-3 mr-1" }), " Functionele Beschrijving"] }), _jsxs("div", { className: "bg-slate-50 p-5 rounded-2xl border border-slate-100 leading-relaxed text-gray-700 text-sm italic shadow-inner", children: ["\"", detail.desc, "\""] })] }), _jsxs("section", { children: [_jsxs("h4", { className: "text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest flex items-center", children: [_jsx(Layers, { className: "w-3 h-3 mr-1" }), " Systeem Tags"] }), _jsx("div", { className: "flex flex-wrap gap-2", children: detail.tags.map(tag => (_jsxs("span", { className: "px-3 py-1 bg-white text-blue-600 text-[10px] font-black rounded-full border-2 border-blue-50 shadow-sm uppercase tracking-tighter", children: ["#", tag] }, tag))) })] }), _jsxs("div", { className: "p-5 bg-amber-50 rounded-2xl border border-amber-100 flex items-start space-x-3 shadow-sm", children: [_jsx(Zap, { className: "w-5 h-5 text-amber-500 shrink-0 mt-0.5" }), _jsxs("div", { children: [_jsx("h4", { className: "text-xs font-black text-amber-900 uppercase tracking-tight", children: "Lead-raad voor Ontwikkelaars" }), _jsxs("p", { className: "text-xs text-amber-700 mt-1 leading-normal", children: ["Dit bestand is een kernonderdeel van de ", _jsx("b", { children: detail.tags[0] }), " logica. Wijzigingen hier hebben direct impact op de gebruikerservaring van de operators. Test altijd in ", _jsx("b", { children: "Preview Mode" }), "."] })] })] })] })), !isAiConfigured ? (_jsxs("div", { className: "p-4 bg-amber-50 rounded-2xl border-2 border-amber-200 flex items-start gap-3 shadow-sm", children: [_jsx(AlertTriangle, { className: "w-8 h-8 text-amber-500 shrink-0 mt-1" }), _jsxs("div", { children: [_jsx("h4", { className: "text-xs font-black text-amber-900 uppercase tracking-tight", children: "AI Assistent niet geconfigureerd" }), _jsx("p", { className: "text-xs text-amber-800 mt-1 leading-normal font-medium", children: "De backend AI-configuratie ontbreekt. Configureer de AI sleutel in Firebase Functions configuratie of server environment variables." })] })] })) : (_jsxs("div", { className: "p-5 bg-purple-50 rounded-2xl border border-purple-100 shadow-sm", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsxs("h4", { className: "text-xs font-black text-purple-900 uppercase tracking-tight flex items-center gap-2", children: [_jsx(Bot, { size: 16 }), " AI Architect"] }), !aiExplanation && !isAiLoading && (_jsx("button", { onClick: handleAskAi, className: "text-[10px] font-bold bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 transition-colors shadow-sm", children: "Genereer Uitleg" }))] }), isAiLoading && (_jsxs("div", { className: "flex items-center gap-2 text-purple-600 text-xs font-bold py-2", children: [_jsx(Loader2, { size: 14, className: "animate-spin" }), " Analyseren..."] })), aiExplanation && (_jsx("div", { className: "text-xs text-purple-800 leading-relaxed whitespace-pre-wrap bg-white/50 p-3 rounded-xl border border-purple-100", children: aiExplanation })), !aiExplanation && !isAiLoading && !detail && (_jsx("p", { className: "text-xs text-purple-700/60 italic", children: "Geen documentatie beschikbaar. Vraag de AI om dit bestand te analyseren." }))] }))] })] })) : (_jsxs("div", { className: "h-full flex flex-col items-center justify-center text-center p-8 space-y-6", children: [_jsx("div", { className: "w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center animate-pulse", children: _jsx(Box, { className: "w-12 h-12 text-gray-200" }) }), _jsxs("div", { children: [_jsx("h4", { className: "text-lg font-black text-gray-300 uppercase tracking-widest", children: "Selecteer Component" }), _jsx("p", { className: "text-gray-400 text-sm mt-2 max-w-[250px] mx-auto italic", children: "Klik op een bestand in de boomstructuur om de technische fiches en logica te ontsluiten." })] })] })) })] }), _jsxs("div", { className: "p-3 bg-slate-100 border-t border-gray-200 flex items-center justify-between text-[10px] font-bold text-gray-500 uppercase tracking-widest", children: [_jsxs("div", { className: "flex items-center space-x-6 px-4", children: [_jsxs("span", { className: "flex items-center text-blue-600", children: [_jsx(Database, { className: "w-3 h-3 mr-1" }), " Firestore: Live"] }), _jsxs("span", { className: "flex items-center text-green-600", children: [_jsx(Printer, { className: "w-3 h-3 mr-1" }), " Zebra Driver: v2.1"] }), _jsxs("span", { className: "flex items-center text-amber-600", children: [_jsx(Cpu, { className: "w-3 h-3 mr-1" }), " Edge-Bridge: Syncing"] })] }), _jsx("div", { className: "px-4 opacity-50", children: "Authorized Engineering Only \u2022 FPi Fittings 2026" })] })] }));
};
export default ProjectStructureExpertView;
