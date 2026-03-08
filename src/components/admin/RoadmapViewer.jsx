import React, { useState } from "react";
import { ChevronDown, ChevronRight, Send, FileText, ListChecks, CheckCircle2, Save } from "lucide-react";
import { useTranslation } from "react-i18next";

const RoadmapViewer = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("roadmap");
  const [expandedPhase, setExpandedPhase] = useState("8");
  const [newIdea, setNewIdea] = useState("");

  // State voor het optimalisatieplan
  const [planContent, setPlanContent] = useState(`# Optimalisatieplan: Fittings Pilot (BH18 & BM01)\n\nDit document bevat de technische en functionele optimalisaties om de 4-weekse pilot tot een succes te maken.\n\n## 1. Code & Infrastructuur "Merge"\nDe eerste stap is het samenvoegen van de kracht van beide versies (Set 1 en Set 2).\n\n- **Herstel de Backend:** Zorg dat de functions/ map uit Set 1 volledig geïntegreerd is in je werkomgeving.\n- **Fix Bestandsfouten:** Verwijder het foutieve bestand AiCenterView,jsx uit Set 2.\n- **Activeer de ERP-Sync:** Integreer infor_sync_service.js uit Set 1.\n\n## 2. Optimalisatie voor de Werkvloer (UX)\nOperators werken vaak met handschoenen of in een luidruchtige omgeving.\n\n- **Scanner Snelheid:** Optimaliseer MobileScanner.jsx (Auto-Focus).\n- **Grote Interactie-elementen:** Knoppen minimaal h-16 (64px).\n- **Offline-First Check:** Lokale cache check in workstationLogic.js.\n\n## 3. De "Hybride Brug" (Papier-Digitaal)\n- **QR-Code Generatie:** Sticker-lay-out op papieren bon.\n- **Sync-Dashboard:** Vergelijk "Papieren Status" met "App Status".\n- **BM01 Checklists:** Volgorde gelijk aan papieren formulier.\n\n## 4. AI Assistent Optimalisatie\n- **Context Injectie:** Specifieke context over BH18.\n- **Spraak-naar-Tekst:** Web Speech API in AiChatView.\n\n## 5. Performance & Data\n- **Firestore Indexen:** Controleer indexen voor usePlanningData.js.\n- **Cleanup Script:** Archiveer voltooide orders wekelijks.`);
  
  const [pilotTasks, setPilotTasks] = useState([
    { id: 1, text: "Voer een volledige build uit met de functions/ map actief", completed: false },
    { id: 2, text: "Test de infor_sync_service met ten minste 5 echte ordernummers", completed: false },
    { id: 3, text: "Loop met een tablet langs station BH18 om de Wi-Fi sterkte te testen", completed: false },
    { id: 4, text: "Herstel de Backend (functions/ map integratie)", completed: false },
    { id: 5, text: "Fix Bestandsfouten (AiCenterView.jsx)", completed: false },
    { id: 6, text: "Activeer ERP-Sync (infor_sync_service.js)", completed: false },
    { id: 7, text: "Optimaliseer MobileScanner.jsx (Auto-Focus)", completed: false },
    { id: 8, text: "Vergroot knoppen WorkstationHub (h-16)", completed: false },
    { id: 9, text: "Implementeer Offline-First Check", completed: false },
    { id: 10, text: "QR-Code Generatie in pdfGenerator.js", completed: false },
    { id: 11, text: "Sync-Dashboard TeamleaderFittingHub", completed: false },
    { id: 12, text: "BM01 Checklists volgorde aanpassen", completed: false },
    { id: 13, text: "AI Context Injectie (BH18 specifiek)", completed: false },
    { id: 14, text: "Firestore Indexen controleren", completed: false },
    { id: 15, text: "Cleanup Script inrichten", completed: false },
  ]);

  const toggleTask = (id) => {
    setPilotTasks(pilotTasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const phases = [
    {
      id: "1",
      title: t('roadmap.phase1_title', "Het Fundament"),
      status: t('roadmap.phase1_status', "✅ Voltooid"),
      items: ["Cloud Architectuur: Firestore inrichting", "Authenticatie: Rol-gebaseerde toegang", "Path Manager: Centrale configuratie"],
    },
    {
      id: "2",
      title: t('roadmap.phase2_title', "Digital Planning & MES"),
      status: t('roadmap.phase2_status', "✅ Voltooid"),
      items: ["Workstation Terminals: BM01, BH-machines", "Track & Trace: Lotnummer registratie", "Mobile Scanner: QR-scanning"],
    },
    {
      id: "3",
      title: t('roadmap.phase3_title', "Admin & Data Beheer"),
      status: t('roadmap.phase3_status', "✅ Voltooid"),
      items: ["Product Manager V6: Smart formulier", "Media Bibliotheek: PDF & foto's", "Communicatie Hub: Berichtensysteem"],
    },
    {
      id: "4",
      title: t('roadmap.phase4_title', "Performance & Schaalbaarheid"),
      status: t('roadmap.phase4_status', "🚀 Actief"),
      items: [
        {
          title: "Component Optimization: Split monolitische files",
          subtasks: [
            { label: "PersonnelManager opsplitsen", status: "completed" },
            { label: "Terminal opsplitsen", status: "completed" }
          ]
        },
        {
          title: "Virtualisatie: react-window integratie voor lijsten",
          subtasks: [
            { label: "PlanningListView virtualiseren", status: "completed" },
            { label: "AdminReferenceTable virtualiseren", status: "pending" }
          ]
        },
        {
          title: "Firestore Query Optimization: Indexen & caching",
          subtasks: [
            { label: "Composite indexes toevoegen", status: "completed" },
            { label: "Lokale query caching", status: "completed" },
            { label: "Batch onSnapshot listeners", status: "completed" }
          ]
        },
        {
          title: "React.memo & useCallback audit",
          subtasks: [
            { label: "StatusBadge optimaliseren", status: "completed" },
            { label: "ProductCard optimaliseren", status: "completed" },
            { label: "OrderDetailModal optimaliseren", status: "completed" },
            { label: "DrillDownModal optimaliseren", status: "completed" }
          ]
        },
        {
          title: "Bundle Size Reduction: Tree-shake constants",
          subtasks: [
            { label: "constants.js opschonen", status: "completed" }
          ]
        },
        // Bugfixes / Issues (2026)
        "Bugfixes: KPI Teamleader werkt niet",
        "Bugfixes: Datum import Excel wordt niet weergegeven",
        "Bugfixes: Product handmatig naar een ander station sturen, zelfs in de productie flow",
        "Bugfixes: Exportmogelijkheden voor Teamleader",
        "Bugfixes: Aangeboden BM01 uitbreiden met een week-knop en export"
      ],
    },
    {
      id: "5",
      title: t('roadmap.phase5_title', "Kwaliteitsborging & QC"),
      status: t('roadmap.phase5_status', "🚀 Actief"),
      items: [
        "✅ Meetwaarde Invoer: Basiscomponent `MeasurementInput` opgezet",
        "🚀 Integratie: Koppelen van `MeasurementInput` in de `WorkstationHub` flow",
        "🚀 Validatie: Koppelen van meetwaarden aan toleranties (Min/Max)",
        "🚀 Feedback: Visuele feedback voor operators (Groen=OK, Rood=Niet OK)",
        "🚀 Opslag: Opslaan van QC-data in de `tracked_products` historie",
        "📋 Firestore Rules: Update toepassen voor strikte scheiding productie/test omgeving",
        "Firestore Rules: QC-rol mag alleen keuringsvelden in tracked_products aanpassen (veld-specifieke write)",
        "Data-integriteit: Product kan alleen op 'Gereed' als positief inspectieresultaat is vastgelegd (validatieregel)",
        "Audit Trail: logActivity uitbreiden voor non-conformiteiten, reden van afkeur en verantwoordelijke QC-medewerker (ISO 9001)",
        "Immutable Inspecties: Inspectieresultaten na invoer alleen-lezen of versiegeschiedenis vastleggen",
        "📋 Rol-gebaseerde Prioritering: Alleen Teamleiders/Admins mogen prioriteit wijzigen.",
        "📋 Veilige Annulering: Orders nooit verwijderen, alleen annuleren met verplichte reden.",
        "📋 Audit Trail voor Annulering: Reden en gebruiker worden vastgelegd (ISO 9001).",
        "Keuringslijsten: QC-interface met parameters per producttype (maatvoering, visuele controle, druktest)",
        "Hold-status Management: Producten met afkeur direct in quarantaine, blokkade in planning",
        "Rapportage: First Pass Yield (FPY) en Pareto-analyse van afkeur (ISO 22400)",
        "Productpaspoort: PDF-keuringsrapport genereren en digitaal versturen (jspdf)",
        "ISO 9001/22400: Volledige traceerbaarheid, audit trail en rapportage",
        "Skill Matrix Dashboard: Visualiseer vaardigheden van personeel in PersonnelManager voor optimale machine-indeling.",
        "Shift Handover Tool: Gestructureerde overdrachtmodule in DigitalPlanningHub; ploeg draagt status/orders over via MESSAGES."
      ],
    },
    {
      id: "6",
      title: t('roadmap.phase6_title', "Future Factory Intelligence"),
      status: t('roadmap.phase6_status', "🔮 Toekomst (Q3-Q4 2026)"),
      items: [
        "✅ Direct ZPL Printing: Zebra integration",
        "AI Predictive Maintenance",
        "IoT Dashboards: Real-time monitoring",
        "AI-gestuurde Planning Optimization: AiAssistantView doet suggesties voor ordervolgorde op basis van actuele bezetting en historische data.",
        "Automatische NCR-herkenning: AI analyseert defectfoto's en stelt foutcode/ernst voor bij NCR.",
        "Voice-to-Log: Operators kunnen lognotities inspreken; AI zet deze om in tekst voor ACTIVITY_LOGS.",
        "Energy Tracking per Order: Koppel slimme meters en bereken energieverbruik per lotnummer voor CO2-rapportage.",
        "Afvalregistratie: Registreer restmateriaal/snĳafval in TRACKING om grondstof-yield te optimaliseren.",
        "Condition-Based Maintenance: Logboek voor machine-uren; bij overschrijding automatisch ticket in Communication Hub.",
        "Spare Parts Inventory: Koppel INVENTORY aan machines; onderdelen direct afboeken via MobileScanner."
      ],
    },
    {
      id: "7",
      title: t('roadmap.phase7_title', "QHSE (Quality, Health, Safety, Environment)"),
      status: t('roadmap.phase7_status', "🆕 In voorbereiding"),
      items: [
        "In-line Inspectie Formulieren: Digitale controlelijsten in Terminal.jsx voor lot-afmelding.",
        "Automatische Tolerantie-checks: Meetwaarden direct koppelen aan BORE_DIMENSIONS/CB_DIMENSIONS, blokkade/melding bij afwijking.",
        "Digitale Kalibratie-log: Registratie en waarschuwing bij verlopen meetmiddelen.",
        "Last Minute Risk Analysis (LMRA): Pop-up veiligheidscheck bij shift/taakwissel in MobileScanner/Terminal.",
        "Incident & Near-miss Rapportage: Foto's van onveilige situaties direct loggen via IMAGE_LIBRARY/ACTIVITY_LOGS.",
        "PBM Check: Visualisatie van verplichte PBM's per station in WorkstationHub.jsx.",
        "Afval- en Scrap Registratie: Scrap-veld per order in Tracking module.",
        "Gevaarlijke Stoffen Register: Koppeling naar MSDS in InventoryView.jsx.",
        "Energieverbruik Monitoring: Log energieverbruik per machine-uur in time_logs.",
        "Gecentraliseerd QHSE Dashboard: Overkoepelende view met audit trail, certificering en skill matrix.",
        "Skill Matrix & Certificering: Vervaldata en blokkade bij verlopen certificaten in PersonnelManager.",
        "--- MultiBel QHSE Integratie ---",
        "MultiBel Alarmering: App/SMS/spraak/e-mail oproep voor BHV/TD bij calamiteit via Cloud Function.",
        "Aanwezigheidsregistratie: Wie is in het pand, tbv ontruiming en BHV.",
        "Man-down/Alleenwerken: Ondersteuning voor operators in stille uren.",
        "QHSE Incident Knop: 'Noodgeval' knop in Sidebar.jsx triggert MultiBel API via Cloud Function.",
        "Machine-Kritieke Storingen: Automatische oproep TD via MultiBel bij kritieke storing.",
        "Evacuatie-Checklist: Lijst van ingelogde personen per Terminal naar MultiBel bij alarm.",
        "Audit Trail: MultiBel logs terugschrijven naar ACTIVITY_LOGS voor ISO-audit.",
        "Gecentraliseerd Beheer: MultiBel-status per plant monitoren in God Mode dashboard.",
        "Technische koppeling: Firestore event → Cloud Function → MultiBel API → status terug naar app."
      ],
    },
    {
      id: "8",
      title: t('roadmap.phase8_title', "Optimalisatie & Global Rollout Strategie"),
      status: t('roadmap.phase8_status', "🌍 Strategie"),
      items: [
        {
          title: "Deel 1: React & DOM Optimalisaties",
          subtasks: [
            { label: "Virtualisatie (react-window) techniek", status: "pending" },
            { label: "Component Memoization (React.memo)", status: "pending" },
            { label: "Stabiele Referenties (useCallback & useMemo)", status: "pending" }
          ]
        },
        {
          title: "Deel 2: JavaScript (Taal) Optimalisaties",
          subtasks: [
            { label: "Debouncing (Vertraagd uitvoeren)", status: "pending" },
            { label: "Datastructuren: Map vs Array (O(1))", status: "pending" },
            { label: "Vermijd Method Chaining bij grote loops", status: "pending" }
          ]
        },
        {
          title: "Deel 3: TypeScript Optimalisaties",
          subtasks: [
            { label: "Type-Only Imports (import type)", status: "pending" },
            { label: "Voorspelbare Datastructuren (V8 Engine)", status: "pending" },
            { label: "Voorkom dure Runtime Checks", status: "pending" }
          ]
        },
        {
          title: "Deel 4: Architectuur & Global Rollout (Multi-Site)",
          subtasks: [
            { label: "Database Architectuur (Multi-Tenancy)", status: "pending" },
            { label: "Authenticatie & Gebruikersrechten (Locatie)", status: "pending" },
            { label: "Lokalisatie: Talen, Tijdzones en RTL", status: "pending" },
            { label: "Dynamische Configuratie van de Fabriek", status: "pending" }
          ]
        },
        "Volgende Acties: Refactoring (Deel 1 & 2), Multi-Tenancy opzetten, i18n uitrollen"
      ],
    },
  ];

  const handleSubmitIdea = () => {
    if (!newIdea.trim()) return;
    alert(t('roadmap.idea_saved', "✅ Idee opgeslagen!"));
    setNewIdea("");
  };

  const roadmapExpansions = [
    {
      title: "Technische Gezondheidscheck & Optimalisatie (Code Audit)",
      items: [
        "Component Opsplitsing: PersonnelManager (1000+ regels) opsplitsen in beheersbare sub-componenten.",
        "Performance: Lazy loading implementeren voor zware admin-routes en Firebase hooks optimaliseren.",
        "Kwaliteit & Stabiliteit: Incrementele migratie naar TypeScript voor kritieke logica (src/utils).",
        "Testing: Unit tests toevoegen voor rekenmodules zoals efficiencyCalculator.js.",
        "Onderhoudbaarheid: Alle 'magic numbers' en configuratie centraliseren in constants.js."
      ]
    },
    {
      title: "Quality Control (QC) & ISO Roadmap Update",
      items: [
        "Firestore: veld-specifieke schrijfrechten voor QC in tracked_products (alleen keuringsvelden)",
        "Validatie: Productstatus 'Gereed' vereist positief inspectieresultaat",
        "Audit Trail: logActivity uitbreiden voor non-conformiteiten, reden van afkeur en verantwoordelijke QC-medewerker (ISO 9001)",
        "Immutable Inspecties: Inspectieresultaten na invoer alleen-lezen of versiegeschiedenis vastleggen",
        "UI: Keuringslijsten/checklists per producttype, hold-status/quarantaine direct in database",
        "Rapportage: FPY, Pareto-analyse, PDF-keuringsrapport (jspdf)",
        "ISO 9001/22400: Volledige traceerbaarheid, audit trail en rapportage, digitaal productpaspoort"
      ]
    },
    {
      title: "Onderhoud & Asset Management",
      items: [
        "Condition-Based Maintenance: Logboek voor machine-uren; bij overschrijding automatisch ticket in Communication Hub.",
        "Spare Parts Inventory: Koppel INVENTORY aan machines; onderdelen direct afboeken via MobileScanner."
      ]
    },
    {
      title: "Smart Factory & AI (Fase 6 verdieping)",
      items: [
        "AI-gestuurde Planning Optimization: AiAssistantView doet suggesties voor ordervolgorde op basis van actuele bezetting en historische data.",
        "Automatische NCR-herkenning: AI analyseert defectfoto's en stelt foutcode/ernst voor bij NCR.",
        "Voice-to-Log: Operators kunnen lognotities inspreken; AI zet deze om in tekst voor ACTIVITY_LOGS."
      ]
    },
    {
      title: "Energie & Duurzaamheid",
      items: [
        "Energy Tracking per Order: Koppel slimme meters en bereken energieverbruik per lotnummer voor CO2-rapportage.",
        "Afvalregistratie: Registreer restmateriaal/snĳafval in TRACKING om grondstof-yield te optimaliseren."
      ]
    },
    {
      title: "Operator Engagement",
      items: [
        "Skill Matrix Dashboard: Visualiseer vaardigheden van personeel in PersonnelManager voor optimale machine-indeling.",
        "Shift Handover Tool: Gestructureerde overdrachtmodule in DigitalPlanningHub; ploeg draagt status/orders over via MESSAGES."
      ]
    }
  ];

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Tab Navigation */}
      <div className="flex space-x-6 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveTab("roadmap")}
          className={`pb-3 px-2 font-bold text-sm uppercase tracking-widest transition-colors ${activeTab === "roadmap" ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-400 hover:text-slate-600"}`}
        >
          🚀 Master Roadmap
        </button>
        <button
          onClick={() => setActiveTab("pilot")}
          className={`pb-3 px-2 font-bold text-sm uppercase tracking-widest transition-colors ${activeTab === "pilot" ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-400 hover:text-slate-600"}`}
        >
          🛠️ Fittings Pilot (BH18 & BM01)
        </button>
      </div>

      {activeTab === "roadmap" && (
        <>
      <div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">🚀 {t('roadmap.title', "Master Roadmap")}</h2>
        <p className="text-slate-600">{t('roadmap.subtitle', "Volg de projectontwikkeling")}</p>
      </div>

      <div className="space-y-3">
        {phases.map((phase) => (
          <div key={phase.id} className="border-2 border-slate-200 rounded-lg p-4">
            <button
              onClick={() => setExpandedPhase(expandedPhase === phase.id ? null : phase.id)}
              className="w-full flex items-center justify-between"
            >
              <div>
                <h3 className="font-bold text-left">
                  {t('roadmap.phase', { id: phase.id, title: phase.title })}
                </h3>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm">{phase.status}</span>
                {expandedPhase === phase.id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </div>
            </button>
            {expandedPhase === phase.id && (
              <div className="mt-4 space-y-2 border-t pt-4">
                {phase.items.map((item, idx) => {
                  if (typeof item === "string") {
                    return (
                      <div key={idx} className="flex items-start gap-3 text-sm text-slate-700">
                        <span className="text-emerald-600 font-bold">→</span>
                        <span>{item}</span>
                      </div>
                    );
                  }
                  // Subtasks rendering
                  return (
                    <div key={idx} className="mb-2">
                      <div className="flex items-start gap-3 text-sm text-slate-700 font-semibold">
                        <span className="text-emerald-600 font-bold">→</span>
                        <span>{item.title}</span>
                      </div>
                      <ul className="ml-7 mt-1 space-y-1">
                        {item.subtasks.map((sub, subIdx) => (
                          <li key={subIdx} className="flex items-center gap-2 text-xs text-slate-600">
                            <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />
                            <span>{sub.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-4 pt-4">
        <h3 className="font-bold text-lg text-slate-800">{t('roadmap.thematic_deep_dive', "Thematische Verdieping")}</h3>
        {roadmapExpansions.map((expansion, index) => (
          <div key={index} className="bg-slate-50 border border-slate-200 rounded-lg p-5">
            <h4 className="font-bold text-slate-900 mb-3">{expansion.title}</h4>
            <ul className="space-y-2">
              {expansion.items.map((item, idx) => (
                <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                  <span className="text-blue-500 mt-1">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t pt-8">
        <h3 className="font-bold mb-4">{t('roadmap.submit_ideas', "💡 Ideeën indienen")}</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={t('roadmap.add_idea_placeholder', "Voeg idee in...")}
            value={newIdea}
            onChange={(e) => setNewIdea(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSubmitIdea()}
            className="flex-1 border border-slate-300 rounded px-4 py-2 text-sm"
          />
          <button
            onClick={handleSubmitIdea}
            className="bg-blue-600 text-white px-4 py-2 rounded font-bold flex items-center gap-2"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
      </>
      )}

      {activeTab === "pilot" && (
        <div className="space-y-6 animate-in fade-in">
            <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Optimalisatieplan: Fittings Pilot</h2>
                <p className="text-slate-600">Technische en functionele optimalisaties voor de 4-weekse pilot.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Editable Plan */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col h-[600px]">
                    <div className="flex items-center justify-between mb-4 shrink-0">
                        <h3 className="font-bold flex items-center gap-2 text-slate-800"><FileText size={20} className="text-blue-500"/> Plan Document</h3>
                        <button className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-100 flex items-center gap-1 transition-colors">
                          <Save size={14} /> Opslaan
                        </button>
                    </div>
                    <textarea
                        value={planContent}
                        onChange={(e) => setPlanContent(e.target.value)}
                        className="w-full flex-1 p-4 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono resize-none bg-slate-50"
                    />
                </div>

                {/* Task List */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col h-[600px]">
                    <h3 className="font-bold flex items-center gap-2 mb-4 shrink-0 text-slate-800"><ListChecks size={20} className="text-emerald-500"/> Actiepunten</h3>
                    <div className="space-y-2 overflow-y-auto custom-scrollbar pr-2 flex-1">
                        {pilotTasks.map(task => (
                            <div key={task.id} className="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-100" onClick={() => toggleTask(task.id)}>
                                <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-all ${task.completed ? "bg-emerald-500 border-emerald-500" : "border-slate-300 bg-white"}`}>
                                    {task.completed && <CheckCircle2 size={14} className="text-white" />}
                                </div>
                                <span className={`text-sm leading-relaxed ${task.completed ? "text-slate-400 line-through" : "text-slate-700 font-medium"}`}>
                                    {task.text}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400 text-center">
                      {pilotTasks.filter(t => t.completed).length} van {pilotTasks.length} taken voltooid
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default RoadmapViewer;
