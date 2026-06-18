import React, { useState, useEffect, FC } from "react";
import { useTranslation } from "react-i18next";
import { Save, RotateCcw, Loader2, FileText, AlertCircle } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useNotifications } from "../../contexts/NotificationContext";
import { DEFAULT_CONTEXT } from "./AiChatView";
import { saveAiContextConfig } from "../../services/planningSecurityService";

const AiContextManager: FC = () => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const [context, setContext] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    const loadContext = async (): Promise<void> => {
      try {
        const aiConfigPath = PATHS?.AI_CONFIG || ['future-factory', 'settings', 'ai_config', 'main'];
        const docRef = doc(db, ...(aiConfigPath as [string, ...string[]]));
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setContext(data?.systemPrompt || DEFAULT_CONTEXT);
        } else {
          setContext(DEFAULT_CONTEXT);
        }
      } catch (err: unknown) {
        console.error(t('ai.context.load_error'), err);
        showError(t('ai.context.load_error'));
      } finally {
        setLoading(false);
      }
    };
    loadContext();
  }, [t, showError]);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await saveAiContextConfig(context);
      await logActivity(auth.currentUser?.uid || "system", "AI_CONTEXT_UPDATE", "AI System Prompt updated");
      showSuccess(t('ai.context.save_success'));
    } catch (err: unknown) {
      console.error(t('ai.context.save_error'), err);
      showError(t('ai.context.save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (window.confirm(t('ai.context.reset_confirm'))) {
      setContext(DEFAULT_CONTEXT);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <FileText className="text-blue-600" size={20} />
              Systeem Context Configuratie
            </h2>
            <p className="text-sm text-slate-500">
              Beheer hier de basisinstructies en kennis van de AI.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="Reset naar standaard"
            >
              <RotateCcw size={20} />
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Opslaan
            </button>
          </div>
        </div>

        <div className="relative">
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            className="w-full h-[600px] p-4 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none resize-none"
            placeholder={t("placeholders.aiSystemPrompt", "Voer hier de systeem prompt in...")}
          />
          <div className="absolute bottom-4 right-4 text-xs text-slate-400 font-mono">
            {context.length} karakters
          </div>
        </div>

        <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
          <AlertCircle className="text-blue-600 shrink-0 mt-0.5" size={18} />
          <div className="text-xs text-blue-800">
            <strong>{t('common.tip', 'Tip')}:</strong> Gebruik Markdown voor structuur. De AI reageert goed op secties zoals <code>## INSTRUCTIES</code> en <code>## KENNIS</code>.
            Wijzigingen zijn direct actief voor nieuwe chatsessies.
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiContextManager;
