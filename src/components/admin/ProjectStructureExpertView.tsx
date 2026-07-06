/* eslint-disable */
import React, { useState, useEffect } from "react";
import RoadmapViewer from "./RoadmapViewer";

import projPlanningMd from '../../../docs/03_PROJECT_PLANNING.md?raw';
import opsNotesMd from '../../../docs/04_OPERATIONS_NOTES_AND_TASKS.md?raw';
import envDeployMd from '../../../docs/05_ENVIRONMENTS_AND_DEPLOYMENT.md?raw';
import convSummaryMd from '../../../docs/CONVERSATION_SUMMARY.md?raw';
import printerRoutingMd from '../../../docs/PRINTER_ROUTING_SETUP.md?raw';
import restoreSopMd from '../../../docs/RESTORE_SOP.md?raw';

import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { 
  BookOpen,
  Map,
  ChevronRight, 
  ChevronDown, 
  Zap, 
  FileCode, 
  Info, 
  Shield,
  Database,
  Printer,
  Cpu,
  Layers,
  Settings,
  Box,
  Bot,
  Loader2,
  AlertTriangle,
  FolderTree,
  FileText
} from "lucide-react";
import { aiService } from "../../services/aiService";
import { SystemDocumentationView } from "./SystemDocumentationView";

type FileDetail = {
  title: string;
  desc: string;
  tags: string[];
};

type TreeNodeData = {
  label: string;
  icon?: React.ReactNode;
  children: Array<TreeNodeData | string>;
};

type TreeNodeProps = {
  node: TreeNodeData | string;
  path?: string;
  level?: number;
  onSelect: (path: string) => void;
  selectedPath: string;
};

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message?: unknown }).message || "onbekende fout");
  }
  return String(err || "onbekende fout");
};

/**
 * UITGEBREIDE TECHNISCHE DOCUMENTATIE
 * Deze database bevat de uitleg voor elk bestand in het systeem.
 */
const fileDetails: Record<string, FileDetail> = {
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
  "src/components/digitalplanning/modals/ProductionStartModal.tsx": {
    title: "Productie Start Dialog",
    desc: "Het startpunt voor een operator op BH18. Handelt het scannen van orders en het koppelen van lotnummers af.",
    tags: ["Modal", "BH18", "Workflow"]
  },
  "src/components/digitalplanning/modals/InspectionModal.tsx": {
    title: "Keuringsvenster",
    desc: "Interface voor het invoeren van meetgegevens (diameter, wanddikte). Vervangt de papieren meetlijsten.",
    tags: ["Kwaliteit", "Data-Entry"]
  },
  "src/components/digitalplanning/modals/TraceModal.tsx": {
    title: "Traceability Viewer",
    desc: "Biedt inzicht in de volledige geschiedenis van een product: wie heeft het gewikkeld, wanneer is het gelost en door wie is het goedgekeurd.",
    tags: ["Traceability", "ISO-Audit"]
  },
  "src/components/digitalplanning/modals/PlanningImportModal.tsx": {
    title: "Planning Importeur",
    desc: "Gids voor planners (Edwin/Frank) om Excel of CSV bestanden uit LN te importeren naar de digitale planning.",
    tags: ["ERP", "Import", "Admin"]
  },
  "src/components/digitalplanning/modals/TerminalSelectionModal.tsx": {
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
  "src/components/digitalplanning/BM01Hub.tsx": {
    title: "BM01 Eindcontrole Hub",
    desc: "Het zenuwcentrum voor de keurmeester. Genereert de dubbele QR-codes voor Factory Track overdracht.",
    tags: ["Kwaliteit", "BM01", "QR"]
  },
  "src/components/digitalplanning/terminal/TerminalProductionView.tsx": {
    title: "BH18 Live Scherm",
    desc: "Toont de actuele status van de wikkelbank. In de toekomst gekoppeld aan de Beckhoff PLC via de Edge Gateway.",
    tags: ["Real-time", "Operator", "UI"]
  },
  "src/components/admin/AdminUsersView.tsx": {
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

    // --- GEMIGREERD VAN OUDE VERSIE (UITGEBREID) ---
  "src/components/admin/AdminDashboard.tsx": {
    title: "Admin Dashboard",
    desc: "Het centrale hoofdscherm voor systeembeheerders. Deze module fungeert als de toegangspoort tot alle kritieke beheermodules zoals gebruikersbeheer, database monitoring, en applicatie-instellingen. Het biedt een high-level overzicht van de systeemgezondheid en actieve processen binnen de Future Factory infrastructuur.",
    tags: ["Admin", "UI", "Control Center"]
  },
  "src/components/admin/AdminProductManager.tsx": {
    title: "Product Manager (PIM)",
    desc: "Uitgebreide beheermodule voor de productcatalogus. Hier kunnen proces engineers productdimensies, materialen, en specificaties (zoals wanddiktes en diameters) toevoegen of aanpassen. Wijzigingen hier werken direct door naar de productievloer en de meet-modals.",
    tags: ["Admin", "Producten", "Masterdata"]
  },
  "src/components/admin/AdminLogView.tsx": {
    title: "Systeem Audit Log",
    desc: "Een cruciaal beveiligings- en compliance-component dat alle belangrijke acties in het systeem logt. Dit omvat aanmeldingen, data-wijzigingen en kritieke foutmeldingen. Onmisbaar voor ISO-audits en het traceren van systeemfouten of ongeautoriseerde toegangspogingen.",
    tags: ["Admin", "Logs", "Security", "Audit"]
  },
  "src/components/admin/AdminLabelDesigner.tsx": {
    title: "ZPL Label Designer",
    desc: "Een visuele tool voor beheerders om productielabels te ontwerpen en aan te passen. Het vertaalt grafische elementen naar Zebra Programming Language (ZPL) code, essentieel voor de Zebra labelprinters op de werkvloer. Ondersteunt dynamische velden zoals lotnummers en diameters.",
    tags: ["Admin", "Labels", "Printing", "ZPL"]
  },
  "src/components/admin/AdminReferenceTable.tsx": {
    title: "Technische Referentietabel",
    desc: "Een digitale encyclopedie voor de fabriek. Bevat complexe referentiedata zoals krimpfactoren, hars/glas-verhoudingen en temperatuurcurves. Deze data wordt door de rekenmodules gebruikt om de optimale machine-instellingen te bepalen voor specifieke product-combinaties.",
    tags: ["Admin", "Data", "Engineering"]
  },
  "src/components/admin/ProductionTimeStandardsManager.tsx": {
    title: "Time Standards Manager",
    desc: "Module voor het beheren van de standaard productietijden (normtijden) per product of machine-handeling. Deze normen zijn de basis voor de efficiencyberekeningen en planningsalgoritmes op het Kanban-bord en de terminal.",
    tags: ["Admin", "Efficiency", "OEE", "Normen"]
  },
  "src/components/digitalplanning/EfficiencyDashboard.tsx": {
    title: "OEE & Efficiency Dashboard",
    desc: "Real-time dashboard dat de Overall Equipment Effectiveness (OEE) en algemene productie-efficiency visualiseert. Het vergelijkt de gerealiseerde productietijden met de gestelde normen en toont bottlenecks, stilstand en performance trends in overzichtelijke grafieken.",
    tags: ["Planning", "KPI", "OEE", "Dashboard"]
  },
  "src/components/digitalplanning/DigitalPlanningHub.tsx": {
    title: "Digitale Planning Hub",
    desc: "De overkoepelende commandocentrum-view voor de productieplanning. Het combineert de order-intake uit Infor LN, capaciteitsplanning en de toewijzing van orders aan specifieke werkstations of machines in de fabriek.",
    tags: ["Planning", "Core", "Hub"]
  },
  "src/components/digitalplanning/MobileScanner.tsx": {
    title: "Mobiele Scanner (PWA)",
    desc: "Geoptimaliseerde mobiele interface voor barcode- en QR-scanners. Wordt gebruikt door magazijniers en operators om materiaalstromen te boeken, inventarisaties uit te voeren en orders snel aan werkstations te koppelen zonder een toetsenbord te gebruiken.",
    tags: ["Mobile", "Scanner", "Logistiek"]
  },
  "src/components/notifications/ToastContainer.tsx": {
    title: "Toast Notification Container",
    desc: "De visuele schil voor het systeem-brede notificatiesysteem. Deze container beheert de weergave, stapeling en timing van pop-up meldingen (toasts) zoals succesvolle saves, waarschuwingen of error-boodschappen op een niet-intrusieve manier.",
    tags: ["UI", "Notificaties", "UX"]
  },
  "src/components/products/ProductSearchView.tsx": {
    title: "Product Zoekmachine",
    desc: "Een krachtige, gefilterde zoekweergave om snel door de complete catalogus van fittingen en buizen te navigeren. Ondersteunt fuzzy-search op artikelcodes, dimensies en omschrijvingen, geoptimaliseerd voor snelle toegang op de terminal.",
    tags: ["Producten", "Search", "Filter"]
  },
  "src/components/products/ProductCard.tsx": {
    title: "Product Informatiekaart",
    desc: "Een herbruikbaar UI-component dat alle essentiële productinformatie (afbeelding, afmetingen, normtijden, status) compact weergeeft. Ontworpen voor maximale leesbaarheid op zowel desktops als tablets op de werkvloer.",
    tags: ["UI", "Producten", "Component"]
  },
  "src/components/personnel/PersonnelListView.tsx": {
    title: "Personeelsrooster & Beheer",
    desc: "Beheermodule voor het fabrieks- en kantoorpersoneel. Beheert rollen, afdelingen en certificeringen (bijv. wie is gecertificeerd voor de BM01). Deze data wordt gebruikt voor toegangscontrole en taaktoewijzing.",
    tags: ["Personeel", "Admin", "HR"]
  },
  "src/components/planning/KanbanBoardView.tsx": {
    title: "Interactief Kanban Bord",
    desc: "Een drag-and-drop Kanban interface voor de dagelijkse werkvoorbereiding. Visualiseert de flow van orders door verschillende statussen (To Do, In Progress, QA, Done). Helpt planners om de werklast visueel te balanceren over de werkstations.",
    tags: ["Planning", "UI", "Kanban", "Workflow"]
  },
  "src/components/planning/GanttChartView.tsx": {
    title: "Gantt Tijdlijn Planning",
    desc: "Een geavanceerde visuele tijdlijn-weergave van de productieplanning. Essentieel voor het voorspellen van levertijden, het detecteren van planningsconflicten en het optimaliseren van de volgorde van orders op specifieke machines op basis van normtijden.",
    tags: ["Planning", "UI", "Gantt", "Forecasting"]
  },
  "src/components/ai/AiCenterView.tsx": {
    title: "AI Knowledge Center",
    desc: "De centrale hub voor de Antigravity AI-integratie. Hier worden AI-modellen getraind met bedrijfsspecifieke documentatie, ISO-handleidingen en historische data om het AI-systeem contextueel bewust te maken van de FPi-processen.",
    tags: ["AI", "Core", "Knowledge", "LLM"]
  },
  "src/components/ai/AiTrainingView.tsx": {
    title: "AI Feedback & Training",
    desc: "Een interface waar operators en engineers feedback kunnen geven op de suggesties van de AI. Deze module voedt een continuous-learning loop (RLHF) waardoor de AI-assistent na verloop van tijd accurater wordt in het voorspellen van machine-instellingen.",
    tags: ["AI", "Training", "Machine Learning"]
  },
  "src/components/teamleader/TeamleaderDashboard.tsx": {
    title: "Teamleader Overview",
    desc: "Een speciaal toegespitst dashboard voor ploegbazen en teamleiders. Toont geaggregeerde informatie over ziekmeldingen, urgente orders, actuele storingen en real-time ploeg-performance (OEE) om directe bijsturing mogelijk te maken.",
    tags: ["Teamleader", "KPI", "Management"]
  },
  "src/components/debug/FirestoreDebugger.tsx": {
    title: "Firestore Schema Debugger",
    desc: "Een geavanceerde, on-device developer tool voor het inspecteren van de ruwe NoSQL data in Firebase. Hiermee kunnen engineers datacorruptie opsporen, indexen verifiëren en live data-mutaties testen zonder de Firebase Console te hoeven openen.",
    tags: ["Debug", "Database", "DevOps"]
  },
  "src/contexts/NotificationContext.tsx": {
    title: "Global Notification Provider",
    desc: "De React Context Provider die de state van alle meldingen (toasts, alerts, push-notificaties) in de applicatie beheert. Het zorgt ervoor dat notificaties overal in de app consistent en centraal getriggerd kunnen worden via een eenvoudige hook.",
    tags: ["Context", "Core", "State"]
  },
  "src/hooks/useAdminAuth.js": {
    title: "Admin Auth Hook",
    desc: "Een custom React hook die complexe authenticatie-logica abstraheert. Deze hook verifieert niet alleen of een gebruiker is ingelogd, maar controleert via Firebase Custom Claims ook of de gebruiker beschikt over de specifieke 'admin' rechten om de route te mogen bekijken.",
    tags: ["Hooks", "Auth", "Security"]
  },
  "src/hooks/useProductsData.js": {
    title: "Products Data Hook",
    desc: "Een datalaag-hook die de real-time synchronisatie van de productencatalogus met Firestore verzorgt. Inclusief caching, offline-beschikbaarheid (via PWA-mechanismen) en geoptimaliseerde query-logica om de app razendsnel te houden.",
    tags: ["Hooks", "Data", "State"]
  },
  "src/utils/efficiencyCalculator.js": {
    title: "Efficiency Calculus Engine",
    desc: "Een wiskundige bibliotheek met functies voor het berekenen van OEE-metrics (Availability, Performance, Quality). Het converteert ruwe timestamps en stuktijden naar actiegerichte efficiency-percentages voor de dashboards.",
    tags: ["Utils", "Math", "OEE", "Algoritme"]
  },
  "src/utils/autoLearningService.js": {
    title: "Auto-Learning Background Service",
    desc: "Een achtergronddienst die passief de acties van gebruikers observeert (zoals veelvoorkomende afwijkingen in meetwaarden). De service bouwt hiermee een model op dat toekomstige afwijkingen kan voorspellen of preventieve waarschuwingen genereert.",
    tags: ["AI", "Service", "Background"]
  },
  "src/utils/automationEngine.js": {
    title: "Workflow Automation Engine",
    desc: "Het kloppend hart van de taakautomatisering. Deze engine verwerkt 'If-This-Then-That' (IFTTT) regels, zoals het automatisch verzenden van een order naar de kwaliteitscontrole wanneer een specifieke tolerantie in de Inspectie-modal wordt overschreden.",
    tags: ["Automation", "Core", "Workflow"]
  },
  "src/utils/conversionLogic.js": {
    title: "Eenheden Conversie Logica",
    desc: "Een strikte set van transformatiefuncties die garanderen dat alle data-eenheden (mm naar inch, Celcius naar Fahrenheit, of imperiale Infor LN waarden naar metrisch) consistent en foutloos worden vertaald voordat ze in de database landen.",
    tags: ["Utils", "Data", "Transformatie"]
  },
  "src/utils/helpers.js": {
    title: "Global Helper Functions",
    desc: "Een verzameling van veelgebruikte, kleine utility-functies zoals datum-formattering, string-manipulaties (camelCase naar Title Case), unieke ID-generatoren en diepe-kopie functies voor objecten.",
    tags: ["Utils", "Shared"]
  },
  "src/services/aiService.js": {
    title: "Antigravity AI Gateway",
    desc: "De brug tussen de frontend en de Google Vertex/Gemini AI API's. Het formatteert de prompts, beheert de API-keys via secure cloud functions, verwerkt de streaming responses en integreert de AI-antwoorden veilig in de UI.",
    tags: ["Service", "AI", "API"]
  },
  "src/services/planningContext.js": {
    title: "Planning State Service",
    desc: "Een service-laag die de brug slaat tussen de database en de Kanban/Gantt views. Het normaliseert complexe tijdslijnen, beheert de in-memory state van drag-and-drop acties en zorgt voor conflictresolutie bij gelijktijdige wijzigingen door meerdere planners.",
    tags: ["Context", "Planning", "State"]
  },
  "src/data/aiContext.js": {
    title: "AI Contextual Grounding Data",
    desc: "Bevat de bedrijfsspecifieke basiskennis (grounding) voor het AI-model. Dit zijn statische referentiekaders en bedrijfspolicies die bij elke AI-query als 'systeem-prompt' worden meegestuurd om te voorkomen dat de AI gaat hallucineren over procedures.",
    tags: ["Data", "AI", "Prompting"]
  },
  "src/data/aiPrompts.js": {
    title: "AI Prompt Templates",
    desc: "Een bibliotheek met gestandaardiseerde, geoptimaliseerde prompt-templates voor specifieke AI-taken, zoals 'Analyseer deze meet-trend' of 'Leg deze foutmelding uit aan een operator'. Dit zorgt voor consistente en hoogwaardige AI-output.",
    tags: ["Data", "AI", "Templates"]
  },
  "src/data/constants.js": {
    title: "Applicatie Constanten",
    desc: "Het centrale bestand voor alle hardcoded configuratiewaarden: API-endpoints, UI-kleurcodes, status-enums (PENDING, ACTIVE, COMPLETED), en limieten zoals 'MAX_FILE_SIZE'. Dit voorkomt 'magic numbers' in de codebase.",
    tags: ["Data", "Config", "Enums"]
  }
};

/**
 * DE VOLLEDIGE PROJECTBOOM
 * Gebaseerd op de 5e405e21 snapshot.
 */
const getProjectStructure = (t: any): TreeNodeData[] => [
  {
    label: t('projectStructureExpert.nodes.configAndCore', "Config & Core"),
    icon: <Shield className="w-4 h-4 text-red-500" />,
    children: [
      "src/config/dbPaths.js",
      "src/config/firebase.js",
      "src/contexts/NotificationContext.tsx",
      "src/main.tsx",
      "src/App.tsx"
    ]
  },
  {
    label: t('projectStructureExpert.nodes.digitalPlanning', "Digital Planning (Fittings Flow)"),
    icon: <Zap className="w-4 h-4 text-amber-500" />,
    children: [
      "src/components/digitalplanning/BM01Hub.tsx",
      "src/components/digitalplanning/WorkstationHub.tsx",
      "src/components/digitalplanning/Terminal.tsx",
      "src/components/digitalplanning/EfficiencyDashboard.tsx",
      {
        label: t('projectStructureExpert.nodes.modalsInteractive', "Modals (Interactief)"),
        children: [
          "src/components/digitalplanning/modals/ProductionStartModal.tsx",
          "src/components/digitalplanning/modals/InspectionModal.tsx",
          "src/components/digitalplanning/modals/TraceModal.tsx",
          "src/components/digitalplanning/modals/PlanningImportModal.tsx",
          "src/components/digitalplanning/modals/TerminalSelectionModal.tsx",
          "src/components/digitalplanning/modals/ProductDossierModal.tsx",
          "src/components/digitalplanning/modals/OrderEditModal.tsx",
          "src/components/digitalplanning/modals/LotOverrideModal.tsx"
        ]
      },
      {
        label: t('projectStructureExpert.nodes.terminalViews', "Terminal Views"),
        children: [
          "src/components/digitalplanning/terminal/TerminalProductionView.tsx",
          "src/components/digitalplanning/terminal/TerminalPlanningView.tsx",
          "src/components/digitalplanning/terminal/TerminalManualInput.tsx"
        ]
      }
    ]
  },
  {
    label: t('projectStructureExpert.nodes.adminMatrix', "Admin & Matrix Management"),
    icon: <Settings className="w-4 h-4 text-blue-500" />,
    children: [
      "src/components/admin/AdminDashboard.tsx",
      "src/components/admin/AdminUsersView.tsx",
      "src/components/admin/AdminLabelDesigner.tsx",
      "src/components/admin/AdminDatabaseView.tsx",
      "src/components/admin/FactoryStructureManager.tsx",
      {
        label: t('projectStructureExpert.nodes.matrixManager', "Matrix Manager"),
        children: [
          "src/components/admin/matrixmanager/AdminMatrixManager.tsx",
          "src/components/admin/matrixmanager/DimensionsView.tsx",
          "src/components/admin/matrixmanager/MatrixGrid.tsx"
        ]
      }
    ]
  },
  {
    label: t('projectStructureExpert.nodes.utilityServices', "Utility Services (De Motor)"),
    icon: <Cpu className="w-4 h-4 text-green-500" />,
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
    label: t('projectStructureExpert.nodes.infraRoot', "Infrastructuur (Root Files)"),
    icon: <Layers className="w-4 h-4 text-gray-500" />,
    children: [
      "firestore.rules",
      "firebase.json",
      "package.json",
      "vite.config.ts",
      "ROADMAP.md"
    ]
  }
];

const TreeNode = ({ node, path = "", level = 0, onSelect, selectedPath }: TreeNodeProps) => {
  const [open, setOpen] = useState(level === 0 || level === 1);
  const isDir = typeof node === "object" && "children" in node;
  const label = typeof node === "string" ? node : node.label;
  const fullPath = path ? (typeof node === "string" ? label : `${path}/${label}`) : label;
  const isSelected = selectedPath === fullPath;

  return (
    <div className="ml-4">
      <div 
        onClick={() => isDir ? setOpen(!open) : onSelect(fullPath)}
        className={`flex items-center py-1.5 px-2 rounded-lg cursor-pointer transition-all duration-200 ${
          isSelected ? "bg-blue-100 text-blue-700 shadow-sm" : "hover:bg-gray-100"
        }`}
      >
        {isDir ? (
          <div className="mr-2">
            {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </div>
        ) : (
          <div className="mr-2">
            <FileCode className={`w-4 h-4 ${isSelected ? "text-blue-600" : "text-blue-300"}`} />
          </div>
        )}
        
        {isDir && typeof node !== "string" && node.icon && <span className="mr-2">{node.icon}</span>}
        
        <span className={`text-sm ${isDir ? "font-bold text-gray-700" : "text-gray-600"}`}>
          {label.split('/').pop()}
        </span>
      </div>
      
      {isDir && open && (
        <div className="border-l border-gray-200 ml-3 mt-1 mb-2">
          {typeof node !== "string" && node.children.map((child: TreeNodeData | string, i: number) => (
            <TreeNode 
              key={i} 
              node={child} 
              path={fullPath} 
              level={level + 1} 
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ProjectStructureExpertView = () => {
  const { t } = useTranslation();
  const projectStructure = getProjectStructure(t);
  const [selectedFile, setSelectedFile] = useState("");
  const [activeMainTab, setActiveMainTab] = useState<"explorer" | "docs" | "markdown" | "roadmap">("explorer");
  const [activeMdFile, setActiveMdFile] = useState("CONVERSATION_SUMMARY.md");
  const [mdSearchQuery, setMdSearchQuery] = useState("");

  const renderHighlightedText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    // Escape regex characters from user input to prevent regex injection
    const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedHighlight})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? <mark key={i} className="bg-yellow-300 text-black px-1 rounded">{part}</mark> : part
    );
  };

  const markdownFiles: Record<string, { title: string, content: string }> = {
    "03_PROJECT_PLANNING.md": { title: "Project Planning", content: projPlanningMd },
    "04_OPERATIONS_NOTES_AND_TASKS.md": { title: "Operations & Tasks", content: opsNotesMd },
    "05_ENVIRONMENTS_AND_DEPLOYMENT.md": { title: "Deployments", content: envDeployMd },
    "CONVERSATION_SUMMARY.md": { title: "Conversation Summary", content: convSummaryMd },
    "PRINTER_ROUTING_SETUP.md": { title: "Printer Setup", content: printerRoutingMd },
    "RESTORE_SOP.md": { title: "Restore SOP", content: restoreSopMd }
  };
  const [aiExplanation, setAiExplanation] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAiConfigured, setIsAiConfigured] = useState(false);
  const detail = selectedFile ? (fileDetails[selectedFile] || null) : null;

  useEffect(() => {
    setAiExplanation("");
    setIsAiLoading(false);

    if (aiService && aiService.isConfigured && aiService.isConfigured()) {
      setIsAiConfigured(true);
    } else {
      setIsAiConfigured(false);
    }
  }, [selectedFile]);

  const handleAskAi = async () => {
    if (!selectedFile) return;
    setIsAiLoading(true);
    try {
      const prompt = t('projectStructureExpert.aiPrompt', "Je bent een senior software architect. Leg uit wat het bestand of de map '{{file}}' doet in deze React/Firebase applicatie. Geef een beknopte, technische maar begrijpelijke uitleg.", { file: selectedFile });
      const response = await aiService.chat([{ role: "user", content: prompt }]);
      setAiExplanation(response);
    } catch (error) {
      console.error("AI Error:", error);
      if (getErrorMessage(error).toLowerCase().includes('key')) {
        setAiExplanation(t('projectStructureExpert.aiConfigError', "Configuratie fout: backend AI sleutel ontbreekt of is ongeldig. Controleer Firebase Functions config of environment variables op de server."));
      } else {
          setAiExplanation(t('projectStructureExpert.aiGenError', "Kon geen uitleg genereren. Controleer de console voor foutmeldingen."));
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header met Statussen en Tabs */}
      <div className="pt-6 px-6 border-b border-gray-200 bg-white text-slate-900 flex flex-col shrink-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black flex items-center tracking-tight">
              <BookOpen className="w-8 h-8 mr-3 text-blue-500" />
              {t('projectStructureExpert.portalTitle', 'ENGINEERING PORTAL')}
            </h1>
            <p className="text-slate-500 text-xs uppercase font-bold tracking-widest mt-1">
              {t('projectStructureExpert.portalSubtitle', 'FPi Future Factory • Systeem Architectuur & Onboarding')}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="text-right mr-4 hidden md:block">
              <p className="text-[10px] text-slate-400 font-mono">{t('projectStructureExpert.gitHash', 'GIT_HASH: {{hash}}', { hash: import.meta.env.VITE_GIT_HASH || 'unknown' })}</p>
              <p className={`text-[10px] font-mono italic ${import.meta.env.VITE_BUILD_STATUS === 'DIRTY' ? 'text-amber-500' : 'text-emerald-600'}`}>{t('projectStructureExpert.buildStatus', 'BUILD_STATUS: {{status}}', { status: import.meta.env.VITE_BUILD_STATUS || 'STABLE' })}</p>
            </div>
            <div className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl border border-blue-200 text-xs font-black">
              {t('projectStructureExpert.pilotVersion', 'v{{version}}', { version: import.meta.env.VITE_APP_VERSION || 'dev' })}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveMainTab("explorer")}
            className={`px-5 py-3 font-bold text-xs uppercase tracking-widest rounded-t-xl transition-all flex items-center gap-2 border-t border-x ${
              activeMainTab === "explorer" 
                ? "bg-white text-blue-600 border-gray-200 border-b-transparent translate-y-[1px]" 
                : "bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            <FolderTree size={16} />
            {t('projectStructureExpert.projectExplorer', 'Project Verkenner')}
          </button>
          <button 
            onClick={() => setActiveMainTab("docs")}
            className={`px-5 py-3 font-bold text-xs uppercase tracking-widest rounded-t-xl transition-all flex items-center gap-2 border-t border-x ${
              activeMainTab === "docs" 
                ? "bg-white text-blue-600 border-gray-200 border-b-transparent translate-y-[1px]" 
                : "bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            <FileText size={16} />
            {t('projectStructureExpert.docsTab', 'Systeem Documentatie')}
          </button>
          <button 
            onClick={() => setActiveMainTab("markdown")}
            className={`px-5 py-3 font-bold text-xs uppercase tracking-widest rounded-t-xl transition-all flex items-center gap-2 border-t border-x ${
              activeMainTab === "markdown" 
                ? "bg-white text-blue-600 border-gray-200 border-b-transparent translate-y-[1px]" 
                : "bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            <BookOpen size={16} />
            {"Live Docs"}
          </button>
          <button 
            onClick={() => setActiveMainTab("roadmap")}
            className={`px-5 py-3 font-bold text-xs uppercase tracking-widest rounded-t-xl transition-all flex items-center gap-2 border-t border-x ${
              activeMainTab === "roadmap" 
                ? "bg-white text-emerald-600 border-gray-200 border-b-transparent translate-y-[1px]" 
                : "bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            <Map size={16} />
            {"Master Roadmap"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative bg-white">
        {activeMainTab === "docs" && (
          <div className="absolute inset-0 w-full h-full z-10 bg-white">
            <SystemDocumentationView t={t} />
          </div>
        )}
        {activeMainTab === "explorer" && (
          <>
            {/* Navigatie (Linkerzijde) */}
            <div className="w-1/2 overflow-y-auto p-6 border-r border-gray-100 bg-gray-50/30 scrollbar-thin scrollbar-thumb-gray-200">
              <h3 className="text-[10px] uppercase font-black text-gray-400 mb-4 tracking-[0.2em]">{t('projectStructureExpert.projectExplorer', 'Project Verkenner')}</h3>
          {projectStructure.map((node, i) => (
            <TreeNode 
              key={i} 
              node={node} 
              onSelect={setSelectedFile} 
              selectedPath={selectedFile}
            />
          ))}
        </div>

        {/* Detail Venster (Rechterzijde) */}
        <div className="w-1/2 p-8 bg-white overflow-y-auto">
          {selectedFile ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-200">
                  <Cpu className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900">{t(`projectStructureExpert.files.${selectedFile}.title`, detail?.title || selectedFile.split('/').pop() || '')}</h3>
                  <p className="text-xs font-mono text-blue-600 break-all">{selectedFile}</p>
                </div>
              </div>
              
              <div className="space-y-6">
                {detail && (
                  <>
                    <section>
                      <h4 className="text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest flex items-center">
                        <Info className="w-3 h-3 mr-1" /> {t('projectStructureExpert.functionalDescription', 'Functionele Beschrijving')}
                      </h4>
                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 leading-relaxed text-gray-700 text-sm italic shadow-inner">
                        "{t(`projectStructureExpert.files.${selectedFile}.desc`, detail.desc)}"
                      </div>
                    </section>

                    <section>
                      <h4 className="text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest flex items-center">
                        <Layers className="w-3 h-3 mr-1" /> {t('projectStructureExpert.systemTags', 'Systeem Tags')}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {detail.tags.map((tag: string) => (
                          <span key={tag} className="px-3 py-1 bg-white text-blue-600 text-[10px] font-black rounded-full border-2 border-blue-50 shadow-sm uppercase tracking-tighter">
                            #{t(`projectStructureExpert.tags.${tag}`, tag)}
                          </span>
                        ))}
                      </div>
                    </section>

                    <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100 flex items-start space-x-3 shadow-sm">
                      <Zap className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-black text-amber-900 uppercase tracking-tight">{t('projectStructureExpert.developerGuidance', 'Lead-raad voor Ontwikkelaars')}</h4>
                        <p className="text-xs text-amber-700 mt-1 leading-normal">
                          {t('projectStructureExpert.corePartPrefix', 'Dit bestand is een kernonderdeel van de ')}<b>{t(`projectStructureExpert.tags.${detail.tags[0]}`, detail.tags[0])}</b>{t('projectStructureExpert.corePartSuffix', ' logica. Wijzigingen hier hebben direct impact op de gebruikerservaring van de operators. Test altijd in ')}<b>{t('projectStructureExpert.previewMode', 'Preview Mode')}</b>.
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* AI Section */}
                {!isAiConfigured ? (
                  <div className="p-4 bg-amber-50 rounded-2xl border-2 border-amber-200 flex items-start gap-3 shadow-sm">
                    <AlertTriangle className="w-8 h-8 text-amber-500 shrink-0 mt-1" />
                    <div>
                      <h4 className="text-xs font-black text-amber-900 uppercase tracking-tight">{t('projectStructureExpert.aiNotConfigured', 'AI Assistent niet geconfigureerd')}</h4>
                      <p className="text-xs text-amber-800 mt-1 leading-normal font-medium">
                        {t('projectStructureExpert.aiNotConfiguredDesc', 'De backend AI-configuratie ontbreekt. Configureer de AI sleutel in Firebase Functions configuratie of server environment variables.')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 bg-purple-50 rounded-2xl border border-purple-100 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-black text-purple-900 uppercase tracking-tight flex items-center gap-2">
                        <Bot size={16} /> {t('projectStructureExpert.aiArchitect', 'AI Architect')}
                      </h4>
                      {!aiExplanation && !isAiLoading && (
                        <button onClick={handleAskAi} className="text-[10px] font-bold bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 transition-colors shadow-sm">
                          {t('projectStructureExpert.generateExplanation', 'Genereer Uitleg')}
                        </button>
                      )}
                    </div>
                    
                    {isAiLoading && (
                      <div className="flex items-center gap-2 text-purple-600 text-xs font-bold py-2">
                        <Loader2 size={14} className="animate-spin" /> {t('projectStructureExpert.analyzing', 'Analyseren...')}
                      </div>
                    )}

                    {aiExplanation && (
                      <div className="text-xs text-purple-800 leading-relaxed whitespace-pre-wrap bg-white/50 p-3 rounded-xl border border-purple-100">
                        {aiExplanation}
                      </div>
                    )}
                    
                    {!aiExplanation && !isAiLoading && !detail && (
                      <p className="text-xs text-purple-700/60 italic">
                        {t('projectStructureExpert.noDocumentation', 'Geen documentatie beschikbaar. Vraag de AI om dit bestand te analyseren.')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-6">
              <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center animate-pulse">
                <Box className="w-12 h-12 text-gray-200" />
              </div>
              <div>
                <h4 className="text-lg font-black text-gray-300 uppercase tracking-widest">{t('projectStructureExpert.selectComponent', 'Selecteer Component')}</h4>
                <p className="text-gray-400 text-sm mt-2 max-w-[250px] mx-auto italic">
                  {t('projectStructureExpert.selectComponentDesc', 'Klik op een bestand in de boomstructuur om de technische fiches en logica te ontsluiten.')}
                </p>
              </div>
            </div>
          )}
        </div>
        </>
      )}

      {activeMainTab === "markdown" && (
        <div className="flex w-full h-full">
          {/* Sidebar for markdown files */}
          <div className="w-64 border-r border-gray-200 bg-slate-50 overflow-y-auto flex flex-col">
            <div className="p-4 border-b border-gray-200 bg-slate-100/50">
              <h3 className="font-bold text-slate-700 text-sm tracking-wide">Live Documentatie</h3>
              <p className="text-[10px] text-slate-500 mt-1">Automatisch gesynchroniseerd met docs/ directory via Vite HMR.</p>
            </div>
            <div className="flex-1 p-2 space-y-1">
              {Object.keys(markdownFiles).map(filename => (
                <button
                  key={filename}
                  onClick={() => setActiveMdFile(filename)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                    activeMdFile === filename 
                      ? "bg-blue-100 text-blue-700 font-bold" 
                      : "text-slate-600 hover:bg-slate-200/50"
                  }`}
                >
                  <div className="flex items-center">
                    <FileText size={14} className="mr-2 opacity-70" />
                    <span className="truncate">{markdownFiles[filename].title}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          {/* Content area */}
          <div className="flex-1 bg-white overflow-y-auto p-8">
            <div className="max-w-4xl mx-auto">
              <div className="mb-6 pb-4 border-b border-slate-200 flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-black text-slate-800">{markdownFiles[activeMdFile].title}</h2>
                  <p className="text-xs text-slate-500 mt-1 font-mono">{activeMdFile}</p>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Zoek in document..."
                    value={mdSearchQuery}
                    onChange={(e) => setMdSearchQuery(e.target.value)}
                    className="pl-3 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                  />
                </div>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-sm bg-slate-50 p-6 rounded-xl border border-slate-200 overflow-x-auto text-slate-800 leading-relaxed">
                {renderHighlightedText(markdownFiles[activeMdFile].content, mdSearchQuery)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {activeMainTab === "roadmap" && (
        <div className="flex-1 bg-white overflow-y-auto">
          <RoadmapViewer />
        </div>
      )}

      </div>
      {/* Industriële Footer */}
      <div className="p-3 bg-slate-100 border-t border-gray-200 flex items-center justify-between text-[10px] font-bold text-gray-500 uppercase tracking-widest">
        <div className="flex items-center space-x-6 px-4">
          <span className="flex items-center text-blue-600"><Database className="w-3 h-3 mr-1" /> {t('projectStructureExpert.firestoreLive', 'Firestore: Live')}</span>
          <span className="flex items-center text-green-600"><Printer className="w-3 h-3 mr-1" /> {t('projectStructureExpert.zebraDriverVersion', 'Zebra Driver: v2.1')}</span>
          <span className="flex items-center text-amber-600"><Cpu className="w-3 h-3 mr-1" /> {t('projectStructureExpert.edgeBridgeSyncing', 'Edge-Bridge: Syncing')}</span>
        </div>
        <div className="px-4 opacity-50 flex items-center gap-4">
          <span>{t('projectStructureExpert.authorizedEngineeringOnly', 'Authorized Engineering Only • FPI BV 2026')}</span>
          <span className="opacity-60 text-[10px] italic pointer-events-none select-none" title="Author Verification">
            {/* System integrity token */}
            {String.fromCharCode(...[68,101,118,101,108,111,112,101,100,32,98,121,32,82,105,99,104,97,114,100,32,118,97,110,32,72,101,101,114,100,101])}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ProjectStructureExpertView;
