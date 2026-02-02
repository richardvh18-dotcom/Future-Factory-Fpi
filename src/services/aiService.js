/**
 * AI Service - Google Gemini Integration
 * Exclusief voor Firebase/Google ecosystem
 * 
 * Setup:
 * API key is al geconfigureerd in .env:
 * VITE_GOOGLE_AI_KEY=AIza...
 */

class AIService {
  constructor() {
    this.apiKey = import.meta.env.VITE_GOOGLE_AI_KEY;
    this.availableModel = null; // Cache voor het gevonden model
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async getAvailableModel() {
    // Als we al een werkend model hebben, gebruik dat
    if (this.availableModel) {
      return this.availableModel;
    }

    try {
      // Haal lijst met beschikbare modellen op
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
      );
      
      if (!response.ok) {
        console.error('Failed to fetch models');
        return 'gemini-pro'; // Fallback
      }

      const data = await response.json();
      console.log('Available models:', data.models?.map(m => m.name));
      
      // Zoek een geschikt model voor generateContent
      const suitableModel = data.models?.find(model => 
        model.supportedGenerationMethods?.includes('generateContent') &&
        (model.name.includes('gemini') || model.name.includes('chat'))
      );

      if (suitableModel) {
        // Haal alleen de model naam (laatste deel na /)
        this.availableModel = suitableModel.name.split('/').pop();
        console.log('✅ Using model:', this.availableModel);
        return this.availableModel;
      }

      // Fallback naar gemini-pro
      this.availableModel = 'gemini-pro';
      return this.availableModel;
    } catch (error) {
      console.error('Error fetching models:', error);
      return 'gemini-pro'; // Fallback
    }
  }

  async chat(messages, systemPrompt = null) {
    if (!this.apiKey) {
      throw new Error('Geen Google AI API key gevonden in .env');
    }

    // Haal beschikbare model op
    const modelName = await this.getAvailableModel();

    try {
      return await this.chatGoogle(messages, systemPrompt, this.apiKey, modelName);
    } catch (error) {
      console.error('AI Chat Error:', error);
      throw error;
    }
  }

  async chatGoogle(messages, systemPrompt, apiKey, modelName) {
    // Gemini API format: converteer chat history naar Gemini format
    const contents = [];
    
    // Voeg system prompt toe als eerste user message
    if (systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: systemPrompt }]
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'Begrepen. Ik zal je helpen met je vragen over FPi Future Factory.' }]
      });
    }

    // Converteer messages naar Gemini format
    messages.forEach(msg => {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    });

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2000,
              topP: 0.95,
              topK: 40,
            },
            safetySettings: [
              {
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_NONE"
              },
              {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_NONE"
              },
              {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_NONE"
              },
              {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_NONE"
              }
            ]
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Gemini API Error Response:', errorData);
        throw new Error(errorData.error?.message || `API fout: ${response.status}`);
      }

      const data = await response.json();
      
      // Check of er een response is
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('Geen antwoord ontvangen van AI');
      }

      const candidate = data.candidates[0];
      
      // Check blocking
      if (candidate.finishReason === 'SAFETY') {
        throw new Error('Antwoord geblokkeerd door veiligheidsfilters');
      }

      return candidate.content.parts[0].text;
    } catch (error) {
      console.error('Gemini Chat Error:', error);
      throw error;
    }
  }

  async generateFlashcards(topic, systemPrompt) {
    const messages = [
      {
        role: 'user',
        content: `Generate educational flashcards about: ${topic}. Return ONLY valid JSON in the format specified in the system prompt.`,
      },
    ];

    const response = await this.chat(messages, systemPrompt);
    
    // Try to parse JSON from response
    try {
      // Remove markdown code blocks if present
      const cleanedResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      return JSON.parse(cleanedResponse);
    } catch (error) {
      console.error('Failed to parse flashcard JSON:', error);
      throw new Error('AI returned invalid flashcard format');
    }
  }
}

export const aiService = new AIService();
