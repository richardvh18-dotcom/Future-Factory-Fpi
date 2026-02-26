import React, { useState } from "react";
import { BookOpen, ChevronRight, ChevronDown, Zap } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";

// Gedetailleerde uitleg per onderdeel
const details = {
  "src/components/admin/AdminDashboard.jsx": "Hoofdscherm voor alle admin-functies, bevat tabbladen voor alle beheermodules.",
  "src/components/admin/AdminProductManager.jsx": "Beheer van producten, toevoegen/bewerken/verwijderen van productdata.",
  "src/components/admin/AdminUsersView.jsx": "Gebruikersbeheer: rollen, rechten, gebruikers aanmaken en beheren.",
  "src/components/admin/AdminLogView.jsx": "Logboek van alle belangrijke systeemacties en wijzigingen.",
  "src/components/admin/AdminLabelDesigner.jsx": "Visuele editor voor het ontwerpen van labels en etiketten.",
  "src/components/admin/AdminReferenceTable.jsx": "Technische encyclopedie en referentietabellen.",
  "src/components/admin/ProductionTimeStandardsManager.jsx": "Beheer van standaard productietijden per product/machine.",
  "src/components/digitalplanning/EfficiencyDashboard.jsx": "Dashboard met efficiency metrics en real-time performance.",
  "src/components/digitalplanning/DigitalPlanningHub.jsx": "Hoofdhub voor digitale productieplanning.",
  "src/components/digitalplanning/MobileScanner.jsx": "Mobiele scanner voor werkvloer en voorraadbeheer.",
  "src/components/notifications/ToastContainer.jsx": "UI-container voor alle toastmeldingen.",
  "src/components/products/ProductSearchView.jsx": "Zoek- en filtercomponent voor producten.",
  "src/components/products/ProductCard.jsx": "Visuele kaartweergave van een product.",
  "src/components/personnel/PersonnelListView.jsx": "Overzicht en beheer van personeel.",
  "src/components/planning/KanbanBoardView.jsx": "Kanban-bord voor orderplanning.",
  "src/components/planning/GanttChartView.jsx": "Gantt-diagram voor tijdlijnplanning.",
  "src/components/ai/AiCenterView.jsx": "AI-hub: training, documenten, flashcards.",
  "src/components/ai/AiTrainingView.jsx": "Trainingsmodule voor AI-kennis.",
  "src/components/teamleader/TeamleaderDashboard.jsx": "Dashboard voor teamleiders.",
  "src/components/debug/FirestoreDebugger.jsx": "Debugtool voor Firestore-database.",
  "src/contexts/NotificationContext.jsx": "Context provider voor notificatiesysteem.",
  "src/hooks/useAdminAuth.js": "Custom React hook voor admin authenticatie.",
  "src/hooks/useProductsData.js": "Custom React hook voor productdata.",
  "src/config/firebase.js": "Firebase setup en initialisatie.",
  "src/config/dbPaths.js": "Centrale definitie van alle Firestore database paths.",
  "src/utils/efficiencyCalculator.js": "Helperfuncties voor efficiencyberekeningen.",
  "src/utils/autoLearningService.js": "Automatisch AI-leren van gebruikersacties.",
  "src/utils/automationEngine.js": "Automatiseringsengine voor workflows.",
  "src/utils/conversionLogic.js": "Logica voor eenheden- en data-conversies.",
  "src/utils/helpers.js": "Algemene helperfuncties.",
  "src/services/aiService.js": "Service voor AI API-calls en integratie.",
  "src/services/planningContext.js": "Context voor planningsdata en -logica.",
  "src/data/aiContext.js": "AI contextdata voor kennisbank.",
  "src/data/aiPrompts.js": "AI prompts en instructies voor de assistent.",
  "src/data/constants.js": "Algemene constanten voor de app."
};

function TreeNode({ node, path = "", level = 0 }) {
  const [open, setOpen] = useState(false);
  const fullPath = path ? `${path}/${node.label || node}`.replace(/\\/g, "/") : node.label || node;
  const isDir = typeof node === "object" && node.children;
  const label = node.label || node;
  const detail = details[fullPath.replace(/\\/g, "/")];

  return (
    <li style={{ margin: "2px 0", marginLeft: level * 16 }}>
      {isDir ? (
        <span style={{ cursor: "pointer", fontWeight: 600, color: '#334155' }} onClick={() => setOpen(v => !v)}>
          {open ? <ChevronDown size={14} style={{ verticalAlign: 'middle' }} /> : <ChevronRight size={14} style={{ verticalAlign: 'middle' }} />}
          {label}
        </span>
      ) : (
        <span style={{ color: '#0ea5e9' }}>{label}</span>
      )}
      {!isDir && detail && (
        <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, padding: 8, margin: '4px 0 4px 0', fontSize: 14, color: '#334155', maxWidth: 480 }}>
          {detail}
        </div>
      )}
      {isDir && open && (
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {node.children.map((child, i) => (
            <TreeNode key={i} node={child} path={fullPath} level={level + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

const structure = [
  {
    label: "src",
    children: [
      {
        label: "components",
        children: [
          {
            label: "admin",
            children: [
              "AdminDashboard.jsx",
              "AdminDatabaseView.jsx",
              "AdminDrillingView.jsx",
              "AdminLabelDesigner.jsx",
              "AdminLocationsView.jsx",
              "AdminLogView.jsx",
              "AdminMessagesManagement.jsx",
              "AdminMessagesView.jsx",
              "AdminProductListView.jsx",
              "AdminProductManager.jsx",
              "AdminReferenceTable.jsx",
              "AdminSettingsView.jsx",
              "AdminUsersView.jsx",
              "BoreDimensionsManager.jsx",
              "ConversionManager.jsx",
              "DatabaseSetup.jsx",
              "FactoryStructureManager.jsx",
              "GodModeBootstrap.jsx",
              "ManualSyncDrawings.jsx",
              "PersonnelManager.jsx",
              "ProductForm.jsx",
              "ProductionTimeStandardsManager.jsx",
              "ProjectStructureExpertView.jsx",
              "ProjectStructureViewer.jsx",
              "RoadmapViewer.jsx",
              "UniversalRescueTool.jsx",
              "VerificationBadge.jsx",
              {
                label: "matrixmanager",
                children: [
                  "AdminDrillingView.jsx",
                  "AdminMatrixManager.jsx",
                  "AiTrainingView.jsx",
                  "AvailabilityView.jsx",
                  "BlueprintsView.jsx",
                  "BulkUploadView.jsx",
                  "DimensionsView.jsx",
                  "LibrarySection.jsx",
                  "LibraryView.jsx",
                  "MatrixGrid.jsx",
                  "MatrixRangesView.jsx",
                  "MatrixView.jsx",
                  "SpecsView.jsx"
                ]
              },
              {
                label: "modals",
                children: ["AdvancedOperatorAssignModal.jsx"]
              }
            ]
          },
          {
            label: "digitalplanning",
            children: [
              "BM01Hub.jsx",
              "DashboardView.jsx",
              "DepartmentStationSelector.jsx",
              "DigitalPlanningHub.jsx",
              "EfficiencyDashboard.jsx",
              "LossenView.jsx",
              "MobileScanner.jsx",
              "OrderDetail.jsx",
              "PlannerHub.jsx",
              "PlanningSidebar.jsx",
              "ProductMoveModal.jsx",
              "RejectionAnalysisTile.jsx",
              "TeamleaderFittingHub.jsx",
              "TeamleaderHub.jsx",
              "TeamleaderPipesHub.jsx",
              "TeamleaderSpoolsHub.jsx",
              "Terminal.jsx",
              "WorkstationHub.jsx",
              { label: "common", children: ["StatusBadge.jsx"] },
              { label: "modals", children: [
                "CapacityImportModal.jsx",
                "DrillDownModal.jsx",
                "InspectionModal.jsx",
                "LoanPersonnelModal.jsx",
                "LogoutOverlay.jsx",
                "LotOverrideModal.jsx",
                "OperatorLinkModal.jsx",
                "OrderEditModal.jsx",
                "PlanningImportModal.jsx",
                "PostProcessingFinishModal.jsx",
                "ProductDossierModal.jsx",
                "ProductJourneyModal.jsx",
                "ProductPassportModal.jsx",
                "ProductReleaseModal.jsx",
                "ProductionStartModal.jsx",
                "StationAssignmentModal.jsx",
                "StationDetailModal.jsx",
                "TeamleaderOrderDetailModal.jsx",
                "TerminalSelectionModal.jsx",
                "TraceModal.jsx"
              ] },
              { label: "terminal", children: [
                "TerminalManualInput.jsx",
                "TerminalPlanningView.jsx",
                "TerminalProductionView.jsx"
              ] },
              { label: "views", children: [
                "ActiveProductionView.jsx",
                "PlanningListView.jsx"
              ] }
            ]
          },
          { label: "notifications", children: ["ToastContainer.jsx"] },
          { label: "products", children: ["ProductCard.jsx", "ProductDetailModal.jsx", "ProductFilterSidebar.jsx", "ProductSearchView.jsx"] },
          { label: "personnel", children: [
            { label: "Modal", children: [] },
            "PersonnelListView.jsx",
            "PersonnelOccupancyView.jsx",
            { label: "subviews", children: [
              "PersonnelImportView.jsx",
              "PersonnelScheduleView.jsx",
              "PersonnelTeamView.jsx"
            ] }
          ] },
          { label: "planning", children: [
            "AutomationRulesView.jsx",
            "CapacityPlanningView.jsx",
            "GanttChartView.jsx",
            "KanbanBoardView.jsx",
            "NotificationRulesView.jsx",
            "OrderDependenciesView.jsx",
            "ScenarioPlanningView.jsx",
            "ShopFloorMobileApp.jsx",
            "TimeTrackingView.jsx",
            "WorkloadHeatmapView.jsx"
          ] },
          { label: "ai", children: [
            "AiCenterView.jsx",
            "AiDocumentUploadView.jsx",
            "AiTrainingView.jsx",
            "FlashcardViewer.jsx"
          ] },
          { label: "teamleader", children: [
            "TeamleaderDashboard.jsx",
            "TeamleaderEfficiencyView.jsx",
            "TeamleaderGanttView.jsx",
            "TeamleaderPersonnelView.jsx",
            "TeamleaderPlanningView.jsx"
          ] },
          { label: "debug", children: ["FirestoreDebugger.jsx", "PersonnelChecker.jsx"] },
          "AccountRequestModal.jsx",
          "AiAssistantView.jsx",
          "CalculatorView.jsx",
          "ErrorBoundary.jsx",
          "ForcePasswordChangeView.jsx",
          "Header.jsx",
          "InventoryView.jsx",
          "LoggedOutView.jsx",
          "LoginView.jsx",
          "PortalView.jsx",
          "ProfileView.jsx",
          "ProtectedRoute.jsx",
          "Sidebar.jsx"
        ]
      },
      { label: "contexts", children: ["NotificationContext.jsx"] },
      { label: "hooks", children: ["useAdminAuth.js", "useInventory.js", "useMessages.js", "usePlanningData.js", "useProductsData.js", "useSettingsData.js", "useUsers.js"] },
      { label: "config", children: ["dbPaths.js", "firebase.js"] },
      { label: "utils", children: [
        "archiveService.js",
        "autoLearningService.js",
        "automationEngine.js",
        "calculations.js",
        "conversionLogic.js",
        "drawingLinker.js",
        "efficiencyCalculator.js",
        "findDrawingForProduct.js",
        "helpers.js",
        "hubHelpers.jsx",
        "infor_sync_service.js",
        "labelHelpers.js",
        "lendingHelpers.js",
        "lotLogic.js",
        "lotPlaceholder.js",
        "manualSyncDrawings.js",
        "pdfGenerator.js",
        "planningSyncLogic.js",
        "productHelpers.js",
        "specLogic.js",
        "workstationLogic.js",
        "zplHelper.js"
      ] },
      { label: "services", children: ["aiService.js", "aiServiceTest.js", "planningContext.js", "testGemini.js"] },
      { label: "data", children: ["aiContext.js", "aiPrompts.js", "constants.js"] }
    ]
  },
  { label: "public", children: ["firebase-messaging-sw.js", "manifest.json"] },
  { label: "root", children: [
    "AI_SETUP.md",
    "AI_TROUBLESHOOTING.md",
    "AUTOMATION_MIGRATION.md",
    "EFFICIENCY_TRACKING.md",
    "NOTIFICATION_SYSTEM.md",
    "OPTIMIZATION_GUIDE.md",
    "README.md",
    "RESPONSIVE_DESIGN.md",
    "ROADMAP.md",
    "SECURITY.md",
    "STANDARDS.md",
    "deploy.sh",
    "firebase.json",
    "firestore.rules",
    "index.html",
    "package.json",
    "postcss.config.js",
    "setUserRole.js",
    "setup-firebase.sh",
    "storage.rules",
    "tailwind.config.js",
    "vercel.json",
    "vite.config.js",
    "vite.config.ts"
  ] }
];


const ProjectStructureExpertView = () => {
  const { t } = useTranslation();
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
        <BookOpen size={28} style={{ display: "inline", marginRight: 8 }} />
        {t('projectStructure.title', 'Projectstructuur & Uitleg (Expert)')}
      </h1>
      <p style={{ maxWidth: 800, marginBottom: 18 }}>
        {t('projectStructure.subtitle', 'Klik op een map om te openen. Klik op een bestand voor uitleg.')}
      </p>
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, margin: '16px 0', overflowX: 'auto' }}>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {structure.map((node, i) => <TreeNode key={i} node={node} />)}
        </ul>
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 32 }}>{t('projectStructure.ai_coupling', 'AI Koppeling')}</h2>
      <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: 16, margin: '16px 0', fontSize: 15 }}>
        <Zap size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
        <Trans i18nKey="projectStructure.ai_context_desc">
          <b>AI Context:</b> De AI-module gebruikt <b>src/data/aiContext.js</b> en <b>src/data/aiPrompts.js</b> voor kennis, en <b>src/services/aiService.js</b> voor API-calls. Alle documentatie en structuur op deze pagina wordt automatisch meegenomen in de context voor AI-assistentie en onboarding.
        </Trans>
      </div>
    </div>
  );
};

export default ProjectStructureExpertView;
