import React, { useState } from "react";
import { BrainCircuit, FileText } from "lucide-react";
import AiTrainingView from "./AiTrainingView";
import AiDocumentUploadView from "./AiDocumentUploadView";

const AiCenterView = () => {
  const [activeTab, setActiveTab] = useState("training");

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
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "training" ? <AiTrainingView /> : <AiDocumentUploadView />}
      </div>
    </div>
  );
};

export default AiCenterView;
