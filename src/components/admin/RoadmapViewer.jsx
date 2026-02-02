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
        "Component Optimization: Split monolitische files (PersonnelManager, Terminal)",
        "Virtualisatie: react-window integratie voor lijsten",
        "Firestore Query Optimization: Indexen & caching",
        "React.memo & useCallback audit",
        "Bundle Size Reduction: Tree-shake constants",
      ],
    },
    {
      id: "5",
      title: "Kwaliteitsborging & QC",
      status: "📋 Gepland (Q2 2026)",
      items: ["Meetwaarde Invoer: Tolerantie control", "NCR Workflow: Non-Conformance Reports", "Audit Logs: ISO-compliance"],
    },
    {
      id: "6",
      title: "Future Factory Intelligence",
      status: "🔮 Toekomst (Q3-Q4 2026)",
      items: ["Direct ZPL Printing: Zebra integration", "AI Predictive Maintenance", "IoT Dashboards: Real-time monitoring"],
    },
    {
      id: "7",
      title: "Externe Integraties",
      status: "🔗 Concept (Q4 2026+)",
      items: ["ATPS Koppeling: HR & Planning (API/Interfaces)", "ERP/Boekhouding: Infor LN & Artikelstam Sync"],
    },
  ];

  const handleSubmitIdea = () => {
    if (!newIdea.trim()) return;
    alert("✅ Idee opgeslagen!");
    setNewIdea("");
  };

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
                {phase.items.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-sm text-slate-700">
                    <span className="text-emerald-600 font-bold">→</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}
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
