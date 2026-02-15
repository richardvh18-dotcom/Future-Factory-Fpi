import React, { useState } from "react";
import { BrainCircuit, FileText, Sparkles } from "lucide-react";
import AiTrainingView from "./AiTrainingView";
import AiDocumentUploadView from "./AiDocumentUploadView";
import FlashcardViewer from "./FlashcardViewer";

const AiCenterView = () => {
  const [activeTab, setActiveTab] = useState("training");

  // Mock data voor preview in admin panel
  const previewData = {
    flashcards: [
      {
        front: { text: "Wat is het doel van deze module?" },
        back: { text: "Het beheren en trainen van de AI assistent." }
      },
      {
        front: { text: "Welke documenten worden ondersteund?" },
        back: { text: "PDF, CSV, JSON, TXT en MD bestanden." }
      }
    ]
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center gap-3">
        <button
          onClick={() => setActiveTab("training")}
          className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest transition flex items-center gap-2 ${
            activeTab === "training"
              ? "bg-fuchsia-600 text-white shadow"
              : "bg-white text-slate-600 border border-slate-200"
          }`}
        >
          <BrainCircuit size={14} /> AI Training
        </button>
        <button
          onClick={() => setActiveTab("documents")}
          className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest transition flex items-center gap-2 ${
            activeTab === "documents"
              ? "bg-blue-600 text-white shadow"
              : "bg-white text-slate-600 border border-slate-200"
          }`}
        >
          <FileText size={14} /> AI Documenten
        </button>
        <button
          onClick={() => setActiveTab("flashcards")}
          className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest transition flex items-center gap-2 ${
            activeTab === "flashcards"
              ? "bg-purple-600 text-white shadow"
              : "bg-white text-slate-600 border border-slate-200"
          }`}
        >
          <Sparkles size={14} /> Flashcards
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50">
        {activeTab === "training" && <AiTrainingView />}
        {activeTab === "documents" && <AiDocumentUploadView />}
        {activeTab === "flashcards" && (
          <div className="h-full p-6">
            <FlashcardViewer 
              data={previewData} 
              onClose={() => setActiveTab("training")} 
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AiCenterView;