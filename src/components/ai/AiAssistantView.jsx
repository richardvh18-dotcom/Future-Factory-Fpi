import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Bot,
  MessageSquare,
  BookOpen,
  Download,
  Loader2,
} from "lucide-react";
import * as XLSX from 'xlsx';
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../config/firebase";
import { useNotifications } from "../../contexts/NotificationContext";
import { getRawPlanningData } from "../../services/planningContext";
import AiChatView from "./AiChatView";
import FlashcardViewer from "./FlashcardViewer";
import { MOCK_FLASHCARDS } from "../../data/aiPrompts";

const AiAssistantView = () => {
  const { t } = useTranslation();
  const { showError, showSuccess, showInfo } = useNotifications();
  const [activeTab, setActiveTab] = useState("chat");
  const [flashcards, setFlashcards] = useState(MOCK_FLASHCARDS);
  const [loadingFlashcards, setLoadingFlashcards] = useState(true);

  // Load flashcards from Firestore and AI knowledge base
  useEffect(() => {
    const loadFlashcards = async () => {
      try {
        // 1. Load custom flashcards from admin
        const flashcardsRef = collection(db, "future-factory", "settings", "flashcards");
        const flashcardsSnap = await getDocs(query(flashcardsRef, where("active", "==", true)));
        const customCards = flashcardsSnap.docs.map(doc => ({
          front: doc.data().front || { text: doc.data().question, language: "nl-NL" },
          back: doc.data().back || { text: doc.data().answer, language: "nl-NL" },
          category: doc.data().category || "general",
        }));

        // 2. Load verified Q&A from AI knowledge base
        const knowledgeRef = collection(db, "future-factory", "settings", "ai_knowledge_base");
        const knowledgeSnap = await getDocs(query(knowledgeRef, where("verified", "==", true)));
        const knowledgeCards = knowledgeSnap.docs
          .filter(doc => doc.data().question && doc.data().answer)
          .map(doc => ({
            front: { text: doc.data().question || doc.data().userInput, language: "nl-NL" },
            back: { text: doc.data().correctedAnswer || doc.data().answer, language: "nl-NL" },
            category: "ai_verified",
          }));

        // 3. Combine with mock flashcards
        const allCards = [
          ...MOCK_FLASHCARDS.flashcards,
          ...customCards,
          ...knowledgeCards,
        ];

        setFlashcards({ flashcards: allCards });
      } catch (error) {
        console.error("Error loading flashcards:", error);
        // Fallback to mock cards only
        setFlashcards(MOCK_FLASHCARDS);
      } finally {
        setLoadingFlashcards(false);
      }
    };

    if (activeTab === "flashcards") {
      loadFlashcards();
    }
  }, [activeTab]);

  const handleExportExcel = async () => {
    try {
      if (showInfo) showInfo(t('ai.export.fetching', 'Planning data ophalen...'));
      const data = await getRawPlanningData(100);
      
      if (data.length === 0) {
        showError(t('ai.export.no_data', 'Geen data gevonden om te exporteren.'));
        return;
      }

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, t('ai.export.sheet_name', 'Planning Export'));
      
      XLSX.writeFile(wb, `${t('ai.export.file_prefix', 'FPi_Planning_Export')}_${new Date().toISOString().slice(0,10)}.xlsx`);
      showSuccess(t('ai.export.success', 'Excel bestand gedownload!'));
    } catch (error) {
      console.error("Export fout:", error);
      showError(t('ai.export.error', 'Kon niet exporteren naar Excel.'));
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in">
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Bot className="text-blue-600" />
            {t('ai.title', 'AI Assistent')}
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            {t('ai.subtitle', 'Stel vragen, vraag om uitleg, of start een trainingssessie.')}
          </p>
          <p className="text-xs text-orange-500 mt-1 font-medium">
            {t('ai.disclaimer', 'AI is aan het leren, fouten kunnen voorkomen.')}
          </p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === "chat"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <MessageSquare size={16} /> {t('ai.tabs.chat', 'Chat')}
          </button>
          <button
            onClick={() => setActiveTab("flashcards")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === "flashcards"
                ? "bg-white text-purple-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <BookOpen size={16} /> {t('ai.tabs.flashcards', 'Kaartjes')}
          </button>

          <button
            onClick={handleExportExcel}
            className="px-3 py-2 rounded-lg text-slate-500 hover:text-green-600 hover:bg-white transition-all border border-transparent hover:border-slate-200"
            title={t('ai.export.tooltip', 'Exporteer huidige planning naar Excel')}
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className={`flex-1 relative ${activeTab === 'chat' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {activeTab === "chat" && <AiChatView />}
        {activeTab === "flashcards" && (
          loadingFlashcards ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Loader2 className="animate-spin text-purple-500" size={40} />
              <p className="text-xs text-slate-500 font-medium">Flashcards laden...</p>
            </div>
          ) : (
            <FlashcardViewer 
              data={flashcards} 
              onClose={() => setActiveTab("chat")} 
            />
          )
        )}
      </div>
    </div>
  );
};

export default AiAssistantView;
