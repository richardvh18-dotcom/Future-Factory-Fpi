/**
 * Gemini API Helper
 * Bevat configuratie en functies voor de AI assistent.
 */

// Haal API key uit env of gebruik fallback (let op: env is veiliger)
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

export const callGemini = async (userQuery, systemPrompt) => {
  if (!apiKey) {
    console.error("Gemini API Key ontbreekt.");
    return "Configuratie fout: API sleutel ontbreekt.";
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);

    const result = await response.json();
    return (
      result.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Geen antwoord ontvangen."
    );
  } catch (error) {
    console.error("Gemini Fout:", error);
    return "Er ging iets mis bij het verbinden met de AI.";
  }
};
