/**
 * Quick test script to verify backend AI proxy is working
 * Run in browser console after importing
 */

import { aiService } from "./aiService";

export async function testGeminiAPI() {
  console.log('🧪 Testing AI proxy...');

  if (!aiService?.isConfigured?.()) {
    console.error('❌ AI is disabled or not configured.');
    return;
  }

  try {
    const text = await aiService.chat([
      { role: 'user', content: 'Zeg hallo in het Nederlands' }
    ]);

    console.log('✅ AI proxy response:', text);
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Auto-run test
if (typeof window !== 'undefined') {
  console.log('🤖 Gemini API Test Module Loaded');
  console.log('Run: testGeminiAPI()');
}
