/**
 * AI Service Test Utility
 * 
 * Gebruik dit in de browser console om de AI service te testen:
 * 
 * import { testAI } from './src/services/aiServiceTest.js';
 * await testAI();
 */

import { aiService } from './aiService';

export async function testAI(): Promise<void> {

  // Check available model
  const model = await aiService.getAvailableModel();

  // Test Chat
  try {
    const response = await aiService.chat([
      { role: 'user', content: 'Hallo! Wat is FPi Future Factory?' }
    ]);
    
  } catch (error: unknown) {
    console.error('❌ Chat Error:', error instanceof Error ? error.message : error);
  }

  // Test Flashcard Generation
  try {
    const flashcards = await aiService.generateFlashcards(
      'GRE specificaties',
      undefined
    );

  } catch (error: unknown) {
    console.error('❌ Flashcard Error:', error instanceof Error ? error.message : error);
  }

}

// Quick test function
export async function quickChat(message: string): Promise<unknown> {
  try {
    const response = await aiService.chat([
      { role: 'user', content: message }
    ]);
    return response;
  } catch (error: unknown) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    throw error;
  }
}

// Switch model helper
export function switchProvider(providerName: string): void {
  const nextModel = providerName.trim();
  if (!nextModel) {
    console.error('❌ Unknown provider: empty value');
    return;
  }

  (aiService as { availableModel?: string }).availableModel = nextModel;
}
