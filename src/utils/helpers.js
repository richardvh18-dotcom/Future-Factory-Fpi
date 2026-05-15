/**
 * AI Helper
 * Frontend gebruikt geen directe AI API keys meer; alle calls gaan via backend proxy.
 */
import i18n from "../i18n";
import { aiService } from "../services/aiService";
export const callGemini = async (userQuery, systemPrompt = null) => {
    try {
        if (!aiService?.isConfigured?.() || typeof aiService?.chat !== "function") {
            return i18n.t("gemini.api_disabled", "AI functionaliteit is uitgeschakeld.");
        }
        const normalizedSystemPrompt = typeof systemPrompt === "string" && systemPrompt.trim().length > 0
            ? systemPrompt
            : null;
        const chat = aiService.chat;
        const response = await chat([{ role: "user", content: String(userQuery || "") }], normalizedSystemPrompt);
        return String(response || i18n.t("gemini.no_response", "Geen antwoord ontvangen."));
    }
    catch (error) {
        console.error(i18n.t("gemini.error_log", "Gemini Fout:"), error);
        return i18n.t("gemini.connection_error", "Er ging iets mis bij het verbinden met de AI.");
    }
};
