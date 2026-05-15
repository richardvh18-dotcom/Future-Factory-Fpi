import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BrainCircuit, FileText, Sparkles, Settings, BookOpen } from "lucide-react";
import AiTrainingView from "./AiTrainingView";
import AiDocumentUploadView from "./AiDocumentUploadView";
import AiContextManager from "./AiContextManager";
import FlashcardManager from "./FlashcardManager";
const AiCenterView = () => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState("training");
    return (_jsxs("div", { className: "flex flex-col h-full bg-slate-50 animate-in fade-in", children: [_jsxs("div", { className: "px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3", children: [_jsx(BrainCircuit, { className: "text-purple-600" }), t('ai.center.title', 'AI Beheercentrum')] }), _jsx("p", { className: "text-slate-500 font-medium text-sm mt-1", children: t('ai.center.subtitle', 'Beheer kennis, documenten en systeeminstellingen.') })] }), _jsxs("div", { className: "flex bg-slate-100 p-1 rounded-xl gap-1", children: [_jsxs("button", { onClick: () => setActiveTab("training"), className: `px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === "training"
                                    ? "bg-white text-purple-600 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"}`, children: [_jsx(Sparkles, { size: 16 }), " ", t('ai.center.tabs.training', 'Training (QA)')] }), _jsxs("button", { onClick: () => setActiveTab("flashcards"), className: `px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === "flashcards"
                                    ? "bg-white text-purple-600 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"}`, children: [_jsx(BookOpen, { size: 16 }), " ", t('ai.center.tabs.flashcards', 'Flashcards')] }), _jsxs("button", { onClick: () => setActiveTab("documents"), className: `px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === "documents"
                                    ? "bg-white text-blue-600 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"}`, children: [_jsx(FileText, { size: 16 }), " ", t('ai.center.tabs.documents', 'Documenten')] }), _jsxs("button", { onClick: () => setActiveTab("context"), className: `px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === "context"
                                    ? "bg-white text-emerald-600 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"}`, children: [_jsx(Settings, { size: 16 }), " ", t('ai.center.tabs.context', 'Context')] })] })] }), _jsxs("div", { className: "flex-1 overflow-y-auto relative", children: [activeTab === "training" && _jsx(AiTrainingView, {}), activeTab === "flashcards" && _jsx(FlashcardManager, {}), activeTab === "documents" && _jsx(AiDocumentUploadView, {}), activeTab === "context" && _jsx(AiContextManager, {})] })] }));
};
export default AiCenterView;
