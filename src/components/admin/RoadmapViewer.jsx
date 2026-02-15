import React, { useState } from "react";
import { ChevronDown, ChevronRight, Send } from "lucide-react";

const RoadmapViewer = ({ user }) => {
  const [expandedPhase, setExpandedPhase] = useState("4");
  const [newIdea, setNewIdea] = useState("");

  const phases = [
    {
      id: "1",
      title: "Het Fundament",
      status: "✅ Voltooid",
      items: ["Cloud Architectuur: Firestore inrichting", "Authenticatie: Rol-gebaseerde toegang", "Path Manager: Centrale configuratie"],
    },
    {
      id: "2",
      title: "Digital Planning & MES",
      status: "✅ Voltooid",
      items: ["Workstation Terminals: BM01, BH-machines", "Track & Trace: Lotnummer registratie", "Mobile Scanner: QR-scanning"],
    },
    {
      id: "3",
      title: "Admin & Data Beheer",
      status: "✅ Voltooid",
      items: ["Product Manager V6: Smart formulier", "Media Bibliotheek: PDF & foto's", "Communicatie Hub: Berichtensysteem"],
    },
    {
      id: "4",
      title: "Performance & Schaalbaarheid",
      status: "🚀 Actief",
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
            { label: "AdminReferenceTable virtualiseren", status: "completed" }
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
      title: "Kwaliteitsborging & QC",
      status: "📋 Gepland (Q2 2026)",
      items: [
        "Firestore Rules: QC-rol mag alleen keuringsvelden in tracked_products aanpassen (veld-specifieke write)",
        "Data-integriteit: Product kan alleen op 'Gereed' als positief inspectieresultaat is vastgelegd (validatieregel)",
        "Audit Trail: logActivity uitbreiden voor non-conformiteiten, reden van afkeur en verantwoordelijke QC-medewerker (ISO 9001)",
        "Immutable Inspecties: Inspectieresultaten na invoer alleen-lezen of versiegeschiedenis vastleggen",
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
      title: "Future Factory Intelligence",
      status: "🔮 Toekomst (Q3-Q4 2026)",
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
      title: "QHSE (Quality, Health, Safety, Environment)",
      status: "🆕 In voorbereiding",
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
  ];

  const handleSubmitIdea = () => {
    if (!newIdea.trim()) return;
    alert("✅ Idee opgeslagen!");
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
      <div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">🚀 Master Roadmap</h2>
        <p className="text-slate-600">Volg de projectontwikkeling</p>
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
                  Fase {phase.id}: {phase.title}
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
        <h3 className="font-bold text-lg text-slate-800">Thematische Verdieping</h3>
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
        <h3 className="font-bold mb-4">💡 Ideeën indienen</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Voeg idee in..."
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
    </div>
  );
};

export default RoadmapViewer;
