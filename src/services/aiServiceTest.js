/**
 * AI Service Test Utility
 *
 * Gebruik dit in de browser console om de AI service te testen:
 *
 * import { testAI } from './src/services/aiServiceTest.js';
 * await testAI();
 */
import { aiService, AI_PROVIDERS } from './aiService';
export async function testAI() {
    console.log('🤖 AI Service Test Started');
    console.log('==========================\n');
    // Check available providers
    const providers = aiService.getAvailableProviders();
    console.log('✅ Available Providers:', providers);
    console.log('Current Provider:', aiService.provider);
    console.log('');
    // Test Chat
    console.log('📝 Testing Chat...');
    try {
        const response = await aiService.chat([
            { role: 'user', content: 'Hallo! Wat is FPi Future Factory?' }
        ], 'Je bent een hulpzame assistent voor FPi Future Factory.');
        console.log('✅ Chat Response:', response);
        console.log('');
    }
    catch (error) {
        console.error('❌ Chat Error:', error.message);
        console.log('');
    }
    // Test Flashcard Generation
    console.log('🎴 Testing Flashcard Generation...');
    try {
        const flashcards = await aiService.generateFlashcards('GRE specificaties', `Return ONLY valid JSON with this structure:
      {
        "flashcards": [
          {
            "front": {"text": "Vraag", "language": "nl-NL"},
            "back": {"text": "Antwoord", "language": "nl-NL"}
          }
        ]
      }`);
        console.log('✅ Flashcards Generated:', flashcards);
        console.log('Number of cards:', flashcards.flashcards?.length || 0);
    }
    catch (error) {
        console.error('❌ Flashcard Error:', error.message);
    }
    console.log('\n==========================');
    console.log('🤖 AI Service Test Complete');
}
// Quick test function
export async function quickChat(message) {
    try {
        const response = await aiService.chat([
            { role: 'user', content: message }
        ]);
        console.log('💬 Response:', response);
        return response;
    }
    catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
}
// Switch provider helper
export function switchProvider(providerName) {
    const upperName = providerName.toUpperCase();
    if (AI_PROVIDERS[upperName]) {
        aiService.setProvider(upperName);
        console.log(`✅ Switched to: ${providerName}`);
    }
    else {
        console.error(`❌ Unknown provider: ${providerName}`);
        console.log('Available:', Object.keys(AI_PROVIDERS));
    }
}
