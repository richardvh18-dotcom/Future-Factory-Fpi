import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { BrainCircuit, FileText, Sparkles, Settings, BookOpen } from "lucide-react";
import AiTrainingView from "./AiTrainingView";
import AiDocumentUploadView from "./AiDocumentUploadView";
import AiContextManager from "./AiContextManager";
import FlashcardManager from "./FlashcardManager";

const AiCenterView = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("training");

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in">
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <BrainCircuit className="text-purple-600" />
            {t('ai.center.title', 'AI Beheercentrum')}
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            {t('ai.center.subtitle', 'Beheer kennis, documenten en systeeminstellingen.')}
          </p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
          <button
            onClick={() => setActiveTab("training")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === "training"
                ? "bg-white text-purple-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Sparkles size={16} /> {t('ai.center.tabs.training', 'Training (QA)')}
          </button>
          <button
            onClick={() => setActiveTab("flashcards")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === "flashcards"
                ? "bg-white text-purple-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <BookOpen size={16} /> {t('ai.center.tabs.flashcards', 'Flashcards')}
          </button>
          <button
            onClick={() => setActiveTab("documents")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === "documents"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <FileText size={16} /> {t('ai.center.tabs.documents', 'Documenten')}
          </button>
          <button
            onClick={() => setActiveTab("context")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === "context"
                ? "bg-white text-emerald-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Settings size={16} /> {t('ai.center.tabs.context', 'Context')}
          </button>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-y-auto relative">
        {activeTab === "training" && <AiTrainingView />}
        {activeTab === "flashcards" && <FlashcardManager />}
        {activeTab === "documents" && <AiDocumentUploadView />}
        {activeTab === "context" && <AiContextManager />}
      </div>
    </div>
  );
};

export default AiCenterView;
