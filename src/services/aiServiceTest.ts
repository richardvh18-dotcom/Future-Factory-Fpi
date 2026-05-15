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
  console.log('🤖 AI Service Test Started');
  console.log('==========================\n');

  // Check available model
  const model = await aiService.getAvailableModel();
  console.log('✅ Available Model:', model);
  console.log('');

  // Test Chat
  console.log('📝 Testing Chat...');
  try {
    const response = await aiService.chat([
      { role: 'user', content: 'Hallo! Wat is FPi Future Factory?' }
    ]);
    
    console.log('✅ Chat Response:', response);
    console.log('');
  } catch (error: unknown) {
    console.error('❌ Chat Error:', error instanceof Error ? error.message : error);
    console.log('');
  }

  // Test Flashcard Generation
  console.log('🎴 Testing Flashcard Generation...');
  try {
    const flashcards = await aiService.generateFlashcards(
      'GRE specificaties',
      undefined
    );

    console.log('✅ Flashcards Generated:', flashcards);
    console.log('Number of cards:', flashcards.flashcards?.length || 0);
  } catch (error: unknown) {
    console.error('❌ Flashcard Error:', error instanceof Error ? error.message : error);
  }

  console.log('\n==========================');
  console.log('🤖 AI Service Test Complete');
}

// Quick test function
export async function quickChat(message: string): Promise<unknown> {
  try {
    const response = await aiService.chat([
      { role: 'user', content: message }
    ]);
    console.log('💬 Response:', response);
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
  console.log(`✅ Switched to model: ${providerName}`);
}
