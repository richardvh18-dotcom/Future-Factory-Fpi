# 🔧 AI Troubleshooting Guide

## Probleem: "Er is een probleem met de AI verbinding"

### Stap 1: Controleer API Key

1. Open `.env` bestand in de root van het project
2. Zoek naar: `VITE_GOOGLE_AI_KEY=`
3. Controleer of er een key staat (begint met `AIza...`)

**Huidige key:**
```
VITE_GOOGLE_AI_KEY=REDACTED
```

### Stap 2: Herstart Dev Server

Na wijzigingen in `.env` moet je de dev server herstarten:

```bash
# Stop huidige server (Ctrl+C in terminal)
# Start opnieuw
npm run dev

# Forceer poort 3000:
npm run dev -- --port 3000
```

### Stap 3: Test API Direct

Open browser console (F12) en run:

```javascript
// Test basic API call
fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=REDACTED', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{
      role: 'user',
      parts: [{ text: 'Hallo' }]
    }]
  })
})
.then(r => r.json())
.then(d => console.log('API Response:', d))
.catch(e => console.error('API Error:', e))
```

### Stap 4: Check Google Cloud Console

1. Ga naar: https://console.cloud.google.com/
2. Selecteer je project
3. Ga naar: APIs & Services → Library
4. Zoek: "Generative Language API" (Gemini)
5. Zorg dat deze ENABLED is

### Stap 5: Verify API Key

1. Ga naar: https://aistudio.google.com/app/apikey
2. Check of je API key actief is
3. Test key in Google AI Studio
4. Indien nodig: Genereer nieuwe key

### Stap 6: Check Quota

1. Google Cloud Console → APIs & Services → Quotas
2. Filter op "Generative Language API"
3. Check of je binnen quota limits zit
4. Free tier: 60 requests/min

## Veelvoorkomende Errors

### "403 Forbidden"
**Oorzaak:** API key is niet geautoriseerd of Gemini API niet enabled
**Oplossing:** Enable Gemini API in Google Cloud Console

### "429 Too Many Requests"
**Oorzaak:** Rate limit overschreden (>60 req/min)
**Oplossing:** Wacht 1 minuut en probeer opnieuw

### "400 Bad Request"
**Oorzaak:** Verkeerd API formaat
**Oplossing:** Check console logs voor details, code is al geüpdatet

### "API key niet gevonden"
**Oorzaak:** .env niet geladen of typo in variabele naam
**Oplossing:** Herstart dev server, check `VITE_GOOGLE_AI_KEY`

## Debug Mode

Voor gedetailleerde logging:

1. Open browser console (F12)
2. Je ziet nu logs:
   - 📤 "Sending to AI" - Wat wordt verstuurd
   - 📥 "Received from AI" - Wat terugkomt
   - ❌ Errors met details

## Test Commands

### Browser Console Tests

```javascript
// Test 1: Check if API key is loaded
console.log('API Key:', import.meta.env.VITE_GOOGLE_AI_KEY?.substring(0, 20));

// Test 2: Import en run test
import('./src/services/testGemini.js').then(m => m.testGeminiAPI());

// Test 3: Check service status
import('./src/services/aiService.js').then(m => {
  console.log('AI Configured:', m.aiService.isConfigured());
});
```

## Oplossingen per Scenario

### Scenario 1: API Key werkt niet meer
1. Ga naar Google AI Studio
2. Revoke oude key
3. Genereer nieuwe key
4. Update `.env`
5. Herstart server

### Scenario 2: Quota overschreden
1. Check Google Cloud Console quotas
2. Upgrade naar betaalde tier
3. Of wacht tot reset (meestal per dag)

### Scenario 3: Firewall/Network issues
1. Check of `generativelanguage.googleapis.com` bereikbaar is
2. Test met curl:
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=YOUR_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"contents":[{"parts":[{"text":"test"}]}]}'
```

### Scenario 4: API Disabled
1. Google Cloud Console
2. APIs & Services → Dashboard
3. Enable "Generative Language API"
4. Wacht 1-2 minuten voor activatie

## Hulp nodig?

1. **Check console logs** - Meeste info staat daar
2. **Test API direct** - Gebruik bovenstaande commands
3. **Verify credentials** - Check Google Cloud Console
4. **Restart everything** - Server + browser refresh

## Contact Info

API Key problemen? Check:
- https://aistudio.google.com/app/apikey
- https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com

Rate limits & pricing:
- https://ai.google.dev/pricing

---

**Status Check:**
- ✅ API Key in .env
- ✅ Gemini API code geüpdatet
- ✅ Error handling verbeterd
- ✅ Debug logging toegevoegd
- 🔄 Test de API nu in de app!
