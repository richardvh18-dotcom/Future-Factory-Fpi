/**
 * Quick test script to verify Gemini API is working
 * Run in browser console after importing
 */

export async function testGeminiAPI() {
  const apiKey = import.meta.env.VITE_GOOGLE_AI_KEY;
  
  console.log('🧪 Testing Gemini API...');
  console.log('API Key present:', !!apiKey);
  console.log('API Key (first 10 chars):', apiKey?.substring(0, 10));
  
  if (!apiKey) {
    console.error('❌ No API key found!');
    return;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: 'Zeg hallo in het Nederlands' }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 100,
          },
        }),
      }
    );

    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ API Error:', errorData);
      return;
    }

    const data = await response.json();
    console.log('✅ Full Response:', data);
    
    if (data.candidates && data.candidates[0]) {
      const text = data.candidates[0].content.parts[0].text;
      console.log('✅ AI Response:', text);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Auto-run test
if (typeof window !== 'undefined') {
  console.log('🤖 Gemini API Test Module Loaded');
  console.log('Run: testGeminiAPI()');
}
