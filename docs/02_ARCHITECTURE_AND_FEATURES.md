

# ==========================================
# 📄 Oorspronkelijk document: PRINTING_ARCHITECTURE.md
# ==========================================


# ☁️ Architectuur: Gecentraliseerd Printen via Cloud Queue

**Status:** Geïmplementeerd
**Doel:** Betrouwbaar printen van ZPL-labels naar een USB-printer vanaf elke tablet/werkstation in de fabriek.

---

## 🎯 Probleemstelling

Direct printen vanuit een web-app naar een USB-printer is complex en onbetrouwbaar. Netwerkprinters zijn een optie, maar vereisen een stabiel lokaal netwerk en correcte IP-configuraties. Voor een robuuste oplossing, met name voor USB-printers die aan een specifieke PC hangen (zoals bij BH18), is een andere aanpak nodig.

## ✅ Oplossing: Firestore als Print-Wachtrij

We implementeren een asynchroon "Store and Forward" mechanisme met Firestore als centrale wachtrij.

### De Workflow

```
                                  +-----------------------+
      (Print Job: ZPL, etc.)      |                       |
   +----------------------------> |  Firestore Database   |
   |                              |                       |
   |                              |  /print_queue/{jobId} |
   |                              |                       |
+---+---+                           +-----------+-----------+
|       |                                       | 1. Nieuwe taak (status: pending)
| Web   |                                       |
| App   |                                       | 2. Status update (printing -> completed/error)
|       |                                       |
+-------+                                       |
 (Tablet bijv. Lossen)                         |
                                               |
                                               |
                                               v
                                  +------------+------------+
                                  |                         |
                                  |  Node.js Listener       |
                                  |  (Draait op PC bij BH18) |
                                  |                         |
                                  +------------+------------+
                                               |
                                               | (ZPL data via USB)
                                               v
                                        +--------------+
                                        |              |
                                        |  USB Printer |
                                        |              |
                                        +--------------+

```

1.  **Print Opdracht (Web App):** Een operator op een willekeurige tablet (bijv. in de nieuwe "Printer Pagina") zoekt een product en klikt op "Print".
2.  **Verstuur naar Wachtrij:** De web-app genereert de ZPL-code en schrijft deze als een nieuw document met status `pending` naar de `print_queue` collectie in Firestore.
3.  **Lokale Listener (PC):** Op de PC die fysiek met de USB-printer is verbonden, draait een continu Node.js script. Dit script "luistert" naar nieuwe documenten in de `print_queue`.
4.  **Taak Oppakken:** Zodra het script een nieuwe taak ziet, update het de status naar `printing` om te voorkomen dat een andere listener (indien aanwezig) dezelfde taak oppakt.
5.  **Printen via USB:** Het script stuurt de ZPL-data direct naar de aangesloten USB-printer met behulp van `node-usb`. Dit gebeurt volledig buiten de Windows-printerinstellingen om, wat zorgt voor een directe en betrouwbare aansturing.
6.  **Status Afronden:** Na het succesvol versturen van de printopdracht, wordt de status van de taak in Firestore bijgewerkt naar `completed`. Bij een fout wordt de status `error` met een foutmelding.

### Voordelen
-   **Betrouwbaarheid:** Printopdrachten gaan nooit verloren, zelfs niet als de printer-pc tijdelijk offline is. Zodra de pc weer online komt, worden de openstaande taken alsnog geprint.
-   **Schaalbaarheid:** Meerdere stations kunnen printopdrachten naar dezelfde wachtrij sturen.
-   **Flexibiliteit:** Het systeem is niet afhankelijk van IP-adressen. De printer kan via USB aangesloten zijn.
-   **Inzicht:** De "Print Wachtrij" admin-pagina geeft real-time inzicht in de status van alle printopdrachten en de verbonden printer-pc's.

---

# ==========================================
# 📄 Oorspronkelijk document: AI_SETUP.md
# ==========================================


# 🤖 AI Assistent Handleiding

## Overzicht
De FPi Future Factory AI Assistent gebruikt **Google Gemini** en is volledig geïntegreerd in het systeem.

## ✅ Huidige Configuratie

### Google Gemini (ACTIEF)
```env
VITE_GOOGLE_AI_KEY=xxxxxx (zet deze key alleen in je lokale .env bestand)
```
De API key is al geconfigureerd en zou direct moeten werken!

### 🚀 Enhanced AI Capaciteit (Nieuw!)
- **Max Output Tokens**: 8000 (was 2000) - Veel uitgebreidere antwoorden mogelijk
- **Document Analyse Limiet**: 50.000 tekens (was 12.000) - Tot 4x grotere documenten
- **Context Opslag**: Volledige document tekst wordt nu opgeslagen voor betere referentie
- **Uitgebreide Analyse**: Documenten worden nu veel gedetailleerder geanalyseerd met:
  - Minimaal 500 karakters samenvatting
  - Volledig gestructureerde context (tot 10.000 karakters)
  - Alle belangrijke feiten, specificaties en details
  - Volledige document tekst beschikbaar voor queries

## 🎯 Functionaliteit

### 1. Chat Modus
De AI kan je helpen met:
- ✅ Vragen over producten (EST, CST, GRE specificaties)
- ✅ Uitleg over hoe het systeem werkt
- ✅ Hulp bij planning en productie
- ✅ Antwoorden op technische vragen
- ✅ Handleiding en gebruiksinstructies

**Voorbeeld vragen:**
- "Wat is het verschil tussen EST en CST?"
- "Hoe wijs ik personeel toe aan een machine?"
- "Waar vind ik product specificaties?"
- "Hoe gebruik ik de planning module?"
- "Wat betekenen de kleuren bij personeel?"

### 2. Training Modus
Genereer educatieve flashcards:
- Kies een onderwerp (bijv. "GRE specificaties")
- AI genereert vraag/antwoord paren
- Interactief leren
- Test je kennis

**Voorbeeld onderwerpen:**
- "GRE specificaties"
- "Veiligheid op de werkvloer"
- "Productcodes Wavistrong"
- "Ploegendiensten"

### 3. Header Zoekbalk Integratie 🆕
Je kunt de AI ook aanspreken via de zoekbalk:

**Methode 1: Bot Knop**
1. Klik op het 🤖 bot icoontje rechts in de zoekbalk
2. Zoekbalk wordt paars
3. Typ je vraag
4. Druk Enter

**Methode 2: ? Prefix**
1. Typ "?" in de zoekbalk
2. Gevolgd door je vraag
3. Druk Enter
4. Je wordt naar de AI assistent geleid met je vraag

**Voorbeelden:**
- "? Hoe werkt de planning module"
- "? Wat is een Wavistrong"
- "? Uitleg over shift kleuren"

## 📚 AI Kennis

De AI heeft uitgebreide kennis over:

### Productie
- GRE, EST, CST specificaties
- Product codes en categorieën
- Afdelingen: Spuitgieten, Verpakking, Lossen
- **Definitie Lossen:** Producten worden om een mal gewikkeld. Na een uur voorharden op 100°C wordt het product van de mal gehaald; dit heet "lossen".
- Shift tijden en kleuren

### Document Analyse
- **Upload Capacity**: Tot 50.000 tekens per document (PDF, TXT, MD, CSV, JSON)
- **PDF Processing**: Automatische tekst extractie uit PDF documenten
- **Intelligent Fallback**: Zelfs als JSON parsing mislukt, wordt document opgeslagen en doorzoekbaar
- **Structured Analysis**: 
  - Titel en uitgebreide samenvatting (min. 500 karakters)
  - Key facts en belangrijke details
  - Processen, partnummers, toleranties
  - Workstations en datums
  - Waarschuwingen en tags
  - Volledige context (tot 10.000 karakters)
- **Context Retention**: Volledige document tekst wordt opgeslagen voor betere AI queries

### Systeem Modules
- **Portaal:** Dashboard en overzicht
- **Planning:** WorkstationHub, Lossen, DigitalPlanning
- **Catalogus:** Product zoeken en filteren
- **Gereedschap:** Voorraad beheer
- **Calculator:** Berekeningstools
- **Berichten:** Notificaties en communicatie
- **Profiel:** Persoonlijke instellingen (AI heeft GEEN toegang tot persoonsgegevens)
- **Admin:** Beheer paneel (AI heeft GEEN toegang tot gebruikers/rollen)

### Features
- Personeel toewijzing
- Shift kleuren (Ochtend=amber, Avond=indigo, Nacht=paars, Dag=blauw)
- Real-time updates via Firebase
- Mobiele functionaliteit
- Notificatie systeem

## 🚀 Gebruik

### Via Sidebar
1. Klik op "AI Assistent" in de sidebar
2. Kies Chat of Training tab
3. Stel je vraag of voer onderwerp in

### Via Header Zoekbalk
1. Klik op 🤖 bot icon (of typ "?")
2. Typ je vraag
3. Druk Enter
4. AI opent met je vraag

## 🔒 Privacy & Beveiliging

### Uitgesloten Data
De AI heeft expliciet **GEEN** toegang tot:
- ❌ Gebruikerslijsten en contactgegevens (Users collectie)
- ❌ Wachtwoorden of inloggegevens
- ❌ Rol-definities en rechtenstructuur (AdminUsersView)
- ❌ Persoonlijke profielen

## ⚠️ Troubleshooting

### "Geen Google AI API key gevonden"
✅ Check `.env` file - de key zou er al moeten staan
❌ Herstart de dev server: Stop terminal en run `npm run dev`

### "AI geeft geen antwoord"
- Check console voor errors (F12)
- Controleer internet verbinding
- Verify API key is correct
- Test key in Google AI Studio: https://aistudio.google.com/

### "AI vindt mijn documenten niet"

**Debug in Browser Console (F12):**
```javascript
// Lijst alle documenten in de database
await window.aiDebug.listDocuments()

// Test zoekfunctie
await window.aiDebug.searchDocuments("a2e5")

// Test context generatie
await window.aiDebug.testContext("wat weet je over a2e5?")
```

**Checklist:**
- ✅ Is document succesvol geüpload? (Bekijk in AI Documenten sectie)
- ✅ Heeft document een `fullText` veld? (Check in debug output)
- ✅ Is `characterCount` > 0?
- ✅ Zie je "📚 Document search resultaten" in console bij AI vraag?
- ✅ Zie je "✅ Context toegevoegd aan prompt"?

**Als documenten niet worden gevonden:**
1. Open browser console (F12)
2. Upload document opnieuw
3. Check of je "✅ JSON parsing succesvol" ziet
4. Test: `await window.aiDebug.listDocuments()`
5. Test: `await window.aiDebug.searchDocuments("jouw zoekterm")`

### "Rate limit exceeded"
- Google Gemini free tier: 60 requests/minuut
- Wacht een minuut en probeer opnieuw
- Upgrade naar betaalde tier voor hogere limiet

### "Failed to parse flashcard JSON"
- AI probeert JSON te genereren maar format klopt niet
- Probeer opnieuw met een ander onderwerp
- Check console voor details

## 💰 Kosten

### Google Gemini
- ✅ Genereus free tier
- Pro model: gratis tot 60 req/min
- Betaald: ~$0.001 per 1000 tokens

**Schatting voor FPi:**
- Gemiddeld chat bericht: ~500 tokens
- 60 vragen/uur = gratis
- 1000 vragen/dag ≈ $5/maand

## 🏗️ Technische Details

### Architecture
```
src/
├── services/
│   └── aiService.js          # Google Gemini wrapper
├── components/
│   ├── AiAssistantView.jsx   # Main UI (chat + training)
│   ├── Header.jsx            # Zoekbalk met AI integratie
│   └── ai/
│       └── FlashcardViewer.jsx
└── data/
    └── aiPrompts.js          # System prompts & mock data
```

### Key Features
- **Google Gemini Only**: Geoptimaliseerd voor Firebase ecosystem
- **Handleiding Context**: Volledige systeem documentatie in AI
- **Header Integratie**: Direct toegang via zoekbalk
- **Error Handling**: Graceful degradation naar demo mode
- **Toast Notifications**: Gebruikersfeedback
- **Dutch Language**: Alle interacties in Nederlands

### API Calls
```javascript
// Chat
const response = await aiService.chat([
  { role: 'user', content: 'Vraag' }
], MES_CONTEXT);

// Flashcards
const flashcards = await aiService.generateFlashcards(
  'onderwerp',
  FLASHCARD_SYSTEM_PROMPT
);
```

## 🎓 AI Training Tips

De AI is getraind op:
- ✅ Alle systeem modules en hun gebruik
- ✅ Product specificaties (GRE, EST, CST)
- ✅ Ploegendienst informatie
- ✅ Navigatie en workflows
- ✅ Veelgestelde vragen

**Beste practices:**
- Stel specifieke vragen
- Vraag om voorbeelden
- Gebruik context ("In de planning module...")
- Vraag om stap-voor-stap instructies

## 📱 Mobiel Gebruik

De AI werkt volledig op mobiel:
- Responsive design
- Touch-friendly interface
- Header zoekbalk beschikbaar
- PWA ondersteuning

## 🔮 Toekomstige Features

Mogelijke uitbreidingen:
- Voice input (spraak naar tekst)
- Image analysis (foto's van producten)
- Automatische suggesties
- Persoonlijke AI assistent per gebruiker
- Multi-taal support uitbreiding

## 📞 Support

**Problemen of vragen?**
- Check console logs (F12)
- Bekijk deze handleiding
- Vraag het aan de AI zelf: "Hoe gebruik ik de AI assistent?"

**API Key issues?**
- Verifieer in `.env`: `VITE_GOOGLE_AI_KEY` (deze mag nooit in de repo staan)
- Test in Google AI Studio
- Regenereer key indien nodig

---

✅ **Klaar voor gebruik!** De AI is volledig operationeel met Google Gemini.


## Troubleshooting

### "No API key configured"
✅ Check `.env` file - de Google key zou er al moeten staan
❌ Als het nog steeds niet werkt, herstart de dev server: `npm run dev`

### "Invalid API key"
- Controleer of de key correct is gekopieerd (geen extra spaties)
- Voor Google: Zorg dat Gemini API enabled is in Google Cloud Console
- Test de key in de Google AI Studio: https://aistudio.google.com/

### "Rate limit exceeded"
- Google Gemini free tier: 60 requests/minuut
- Wacht een minuut of upgrade naar betaalde tier
- Overweeg een andere provider als backup

### "Failed to parse flashcard JSON"
- AI probeert JSON te genereren maar format is incorrect
- Meestal lost dit zichzelf op bij een nieuwe poging
- Check console voor details

## Kosten Indicatie

### Google Gemini
- ✅ Genereus free tier
- Pro model: gratis tot 60 req/min
- Betaald: ~$0.001 per 1000 tokens

### OpenAI GPT-4
- Geen free tier
- GPT-4: ~$0.03 per 1000 tokens (input)
- GPT-4: ~$0.06 per 1000 tokens (output)

### Anthropic Claude
- Zeer beperkte free tier
- Claude 3.5 Sonnet: ~$0.003 per 1000 tokens (input)
- Claude 3.5 Sonnet: ~$0.015 per 1000 tokens (output)

## Architecture

```
src/
├── services/
│   └── aiService.js          # Universal AI provider wrapper
├── components/
│   ├── AiAssistantView.jsx   # Main UI component
│   └── ai/
│       └── FlashcardViewer.jsx
└── data/
    └── aiPrompts.js          # System prompts & mock data
```

### Key Features
- **Provider Agnostic**: Easy to switch between AI providers
- **Error Handling**: Graceful degradation to demo mode
- **Toast Notifications**: User feedback for errors/success
- **Context Aware**: Includes MES domain knowledge in prompts
- **Dutch Language**: All interactions in Nederlands

## Development

### Test AI Connection
```javascript
// In browser console:
import { aiService } from './services/aiService';

// Test chat
const response = await aiService.chat([
  { role: 'user', content: 'Hallo, test bericht' }
]);
console.log(response);

// Check available providers
console.log(aiService.getAvailableProviders());
```

### Add Custom Context
Edit `MES_CONTEXT` in [AiAssistantView.jsx](src/components/AiAssistantView.jsx):
```javascript
const MES_CONTEXT = `
Je bent een AI assistent voor FPi Future Factory...
[Add your domain-specific information here]
`;
```

## Volgende Stappen

1. ✅ Test de AI assistant in de app (navigeer naar AI tab)
2. Probeer een vraag te stellen in chat mode
3. Probeer training mode met een onderwerp zoals "GRE"
4. Check console voor eventuele errors
5. Bij problemen: herstart dev server en check API key

**Need help?** Check de console logs of contacteer de developer.


# ==========================================
# 📄 Oorspronkelijk document: EFFICIENCY_TRACKING.md
# ==========================================


# 📊 Efficiency Tracking Systeem - Implementatie Gids

## Overzicht
Complete implementatie van een productie efficiency tracking systeem dat verwachte productietijden vergelijkt met werkelijke tijden voor real-time performance monitoring.

## 🎯 Functionaliteit

### 1. **Standaard Tijden Beheer**
- **Component**: `ProductionTimeStandardsManager.jsx`
- **Locatie**: Admin Dashboard → "Productie Tijden"
- **Functies**:
  - Handmatig invoeren van standaard tijden per product per machine
  - CSV import voor bulk upload
  - CSV export voor backup/sharing
  - Bewerken en verwijderen van bestaande standaarden

### 2. **Automatische Tijd Tracking**
- Start tijden worden automatisch gelogd bij productie start
- Eind tijden worden gelogd bij completion
- Timestamps worden opgeslagen in `tracked_products` collectie

### 3. **Efficiency Dashboard**
- **Component**: `EfficiencyDashboard.jsx`
- **Locatie**: WorkstationHub → "Efficiency" tab
- **Metrics**:
  - Overall gemiddelde efficiency percentage
  - On-time percentage (≥85% efficiency)
  - Totaal afgeronde units
  - Aantal achterlopende jobs

### 4. **Real-time Monitoring**
- Lopende productie met live tijd tracking
- Visuele indicatoren voor voor/achter schema
- Verwachte vs werkelijke tijd comparison

## 📂 Nieuwe Files

### Utils
```
/src/utils/efficiencyCalculator.js
```
Helper functies voor:
- `calculateEfficiency(actualMinutes, targetMinutes)` - Bereken efficiency %
- `calculateBatchEfficiency(products)` - Batch efficiency berekening
- `formatMinutes(minutes)` - Tijd formatting (2u 30m)
- `calculateDuration(startTime, endTime)` - Tijdsverschil berekening
- `getEfficiencyColor(efficiency)` - UI kleuren op basis van performance
- `isBehindSchedule(startTime, targetMinutes)` - Check of job achterloopt
- `calculateTimeDeviation(startTime, targetMinutes)` - Minuten voor/achter

### Components
```
/src/components/admin/ProductionTimeStandardsManager.jsx
/src/components/digitalplanning/EfficiencyDashboard.jsx
```

### Database Paths
```javascript
// In /src/config/dbPaths.js
PRODUCTION_STANDARDS: [BASE, "production", "time_standards"],
TIME_LOGS: [BASE, "production", "time_logs"],
```

## 🗄️ Database Structuur

### Collection: `time_standards`
```javascript
{
  itemCode: "A2E5",           // Product code
  machine: "BH11",            // Machine ID
  standardMinutes: 45,        // Verwachte tijd in minuten
  description: "Wavistrong 160mm DN125",  // Optionele beschrijving
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Enhanced: `tracked_products`
```javascript
{
  // Bestaande velden...
  timestamps: {
    station_start: Timestamp,    // Start op werkstation
    wikkelen_start: Timestamp,   // Start wikkelen
    lossen_start: Timestamp,     // Start lossen
    completed: Timestamp         // Voltooid
  },
  // Efficiency wordt berekend on-the-fly
}
```

## 📥 CSV Import Format

### Bestand: `production_standards.csv`
```csv
itemCode,machine,standardMinutes,description
A2E5,BH11,45,Wavistrong 160mm DN125
A2E5,BH12,42,Wavistrong 160mm DN125
B3F6,BH15,38,T-Stuk 90° DN100
C4G7,Mazak,120,CNC Bewerking Moffen
```

### Import Proces
1. Ga naar **Admin Dashboard** → **Productie Tijden**
2. Klik op **Import CSV**
3. Selecteer je CSV bestand
4. Systeem valideert en importeert automatisch

### Export Proces
1. Klik op **Export CSV**
2. Download bevat alle huidige standaarden
3. Gebruik voor backup of delen met andere systemen

## 🎨 UI Components

### Efficiency Metrics Cards
- **Overall Efficiency**: Gemiddelde percentage met kleur indicator
- **On Time**: Percentage producties op of voor schema
- **Total Produced**: Aantal afgeronde units (laatste 24u)
- **Behind Schedule**: Aantal lopende jobs die achter lopen

### Kleur Schema
- 🟢 **≥100%**: Uitstekend (groen) - Sneller dan verwacht
- 🟢 **≥85%**: Goed (lichtgroen)
- 🟡 **≥70%**: Voldoende (geel)
- 🟠 **≥50%**: Matig (oranje)
- 🔴 **<50%**: Onder Norm (rood)

## 🔧 Gebruik

### Voor Operators (WorkstationHub)
1. Selecteer je werkstation (bijv. BH11)
2. Klik op **Efficiency** tab
3. Zie real-time metrics:
   - Je huidige efficiency
   - Lopende jobs en hun status
   - Recent afgeronde jobs met performance

### Voor Planners (Admin)
1. **Instellen Standaarden**:
   - Admin Dashboard → Productie Tijden
   - Voeg standaard tijden toe per product/machine combinatie
   - Import bulk data via CSV

2. **Monitoren Performance**:
   - Check dashboard metrics
   - Identificeer machines/producten die consistent achter lopen
   - Pas standaard tijden aan op basis van historische data

3. **Analyseren Trends**:
   - Export data voor externe analyse
   - Vergelijk verschillende machines
   - Identificeer training opportunities

## 📊 Berekening Logica

### Efficiency Formula
```javascript
efficiency = (targetMinutes / actualMinutes) * 100

Voorbeeld:
- Target: 45 minuten
- Actual: 40 minuten
- Efficiency: (45 / 40) * 100 = 112.5% ✅ (Sneller dan verwacht!)

- Target: 45 minuten
- Actual: 60 minuten
- Efficiency: (45 / 60) * 100 = 75% ⚠️ (Langzamer dan verwacht)
```

### Batch Efficiency
```javascript
// Totale tijd van alle producties
totalActual = sum(product.actualTime)
totalTarget = sum(product.targetTime)

batchEfficiency = (totalTarget / totalActual) * 100
```

## 🚀 Toekomstige Uitbreidingen

### Fase 2 (Later te implementeren)
- [ ] Historische trend grafieken
- [ ] Per-operator efficiency tracking
- [ ] Shift-based efficiency vergelijking
- [ ] Automatische waarschuwingen bij consistente underperformance
- [ ] Machine learning voor dynamische tijd voorspellingen
- [ ] Export naar Excel met charts
- [ ] Email rapporten voor management

### Fase 3 (Advanced)
- [ ] Real-time alerts via notificatie systeem
- [ ] Integration met ERP systemen
- [ ] Predictive analytics
- [ ] Capacity planning tools
- [ ] What-if scenario's

## 🔐 Toegangsrechten

### ProductionTimeStandardsManager
- **Admin**: Volledige toegang
- **Engineer**: Volledige toegang
- **Teamleader**: Volledige toegang
- **Operator**: Geen toegang (alleen via EfficiencyDashboard)

### EfficiencyDashboard
- **Iedereen**: Read-only toegang via WorkstationHub

## 📝 Notities

### Belangrijke Punten
1. **Standaard tijden zijn essentieel**: Zonder standaard tijden kan efficiency niet berekend worden
2. **Timestamp tracking**: Zorg dat producties altijd een station_start timestamp hebben
3. **Machine matching**: Standaard moet exact matchen met machine ID (BH11 ≠ bh11)
4. **Realtime updates**: Dashboard refresht automatisch bij nieuwe data

### Troubleshooting
- **Geen efficiency data**: Controleer of standaard tijden zijn ingesteld
- **Verkeerde tijden**: Verifieer machine ID matching (hoofdlettergevoelig)
- **Ontbrekende timestamps**: Check of timestamps.station_start aanwezig is

## 🎓 Training Materiaal

### Voor Operators
1. Ga naar je werkstation
2. Klik "Efficiency" tab
3. Zie je eigen performance metrics
4. Probeer binnen de groene zone te blijven (≥85%)

### Voor Planners
1. Start met een pilot machine (bijv. BH11)
2. Voeg standaard tijden toe voor 5-10 veelvoorkomende producten
3. Monitor gedurende 1 week
4. Pas standaarden aan op basis van gemiddelde werkelijke tijden
5. Breid uit naar andere machines

## 📞 Support

Voor vragen of problemen:
- Check de console logs (F12) voor foutmeldingen
- Verifieer database paden in dbPaths.js
- Test met kleine dataset eerst voor bulk imports


# ==========================================
# 📄 Oorspronkelijk document: PERFORMANCE_OPTIMIZATIONS.md
# ==========================================


# Performance Optimizations - Fittingen/Workstation Loading

**Uitgevoerd:** 25 maart 2026 - Session 13

## 🚀 Implementatie Optimalisaties

### 1. **Parallel Data Listeners (GEDAAN)**
**Probleem:** WorkstationHub en TeamleaderHub laadden data sequentieel (Orders → Products → Occupancy → Personnel)
**Oplossing:** Alle listeners starten nu **tegelijk in parallel**
- Orders + Products bepalen samen wanneer `setLoading(false)` actief wordt
- Occupancy + Personnel laden op achtergrond (minder kritisch)
- **Verwacht effect:** 40-60% sneller laden van Fittingen tab

**Bestanden:**
- `src/components/digitalplanning/WorkstationHub.jsx` (UI wordt sneller responsive)
- `src/components/digitalplanning/TeamleaderHub.jsx` (Centrale planning sneller beschikbaar)

### 2. **Firestore Indexes (NOG NODIG)**
Voor optimale query performance, voeg deze indexes aan Firestore toe via Firebase Console:

#### Index 1: Planning orders per station
- **Collection:** `planning`
- **Fields:**
  - `status` (Ascending)
  - `machine` (Ascending)
  - UID (Descending) of __name__ (Descending)

#### Index 2: Active products
- **Collection:** `tracking`
- **Fields:**
  - `status` (Ascending)
  - `currentStep` (Ascending)
  - `currentStation` (Ascending)

#### Index 3: Occupancy by date
- **Collection:** `occupancy`
- **Fields:**
  - `date` (Ascending)
  - `machineId` (Ascending)
  - `isActive` (Descending)

#### Index 4: Personnel by department
- **Collection:** `personnel`
- **Fields:**
  - `departmentId` (Ascending)
  - `name` (Ascending)

> 💡 **Firestore zal je waarschuwen** als je een query doet die een index nodig heeft. Klik op de link in de Firestore console om automatisch indexes aan te maken.

### 3. **Query Limits (REEDS GESTANDAARDISEERD)**
- Planning: `limit(200)` ✅
- Tracking: `limit(200)` ✅
- Occupancy: `limit(100)` met `date` filter ✅
- Personnel: `limit(50)` ✅

## 📊 Verwachte Performance Verbetering

| Stap | Voor | Na | Winst |
|------|------|----|----|
| Tab klik → Loading spinnen zichtbaar | ~200ms | ~100ms | 50% |
| Orders binnenin | ~1500ms | ~800ms | 47% |
| Products binnenin | ~2200ms | ~1000ms | 55% |
| `setLoading(false)` fired | ~2200ms (na Orders) | ~1000ms (orders+products parallel) | 55% |
| UI Interactive | ~2500ms | ~1200ms | **52% sneller** 🎉 |

## 🔍 Hoe te valideren

1. **Open DevTools** → Network tab
2. **Klik op Fittingen tegel** in Productie Hub
3. **Kijk op Firestore tab:** zie je dat Orders + Products parallel laden?
4. **Timing:** Meet van "tab click" tot "stations zichtbaar"

Vorig: ~2.5s  
Nu verwacht: ~1.2s (met indexes)

## 🛠️ PNext Steps

### Urgent (Performance)
- [ ] Firestore indexes aanmaken (hierboven)
- [ ] Test load-time met DevTools
- [ ] Opnieuw meten na indexes

### Optioneel (Design)
- [ ] "Skeleton loaders" toevoegen terwijl data binnenkomt (orders → products → operators)
- [ ] Separate loading states per section
- [ ] Caching van factory config lokaal

## 📝 Notities

- **Browser caching:** Firestore cache helpt al bij herlaadingen
- **Realtime updates:** Listeners blijven actief, dus verdere updates zijn direct zichtbaar (geen new loads)
- **Memory:** Met `limit()` waarden per listener is geheugen redelijk

---

**Volgende review:** Na pilot validatie op hardware


# ==========================================
# 📄 Oorspronkelijk document: RESPONSIVE_DESIGN.md
# ==========================================


# Responsive Design Implementation

## Overzicht
De FPi Future Factory portal is volledig responsive gemaakt voor gebruik op desktop, tablet en mobiele apparaten.

## Belangrijkste Wijzigingen

### 1. Product Informatie Correctie
- **PVC → GRE**: Alle verwijzingen naar PVC-buizen zijn gecorrigeerd naar GRE (Glass Reinforced Epoxy)
- **EST**: Eastern Standard Time → Epoxy Standard Type
- **CST**: Canadian Standard Time → Conductive Standard Type
- **Productie proces**: Spuitgieten → Lamineren (correct proces voor GRE buizen)

Referentie: https://futurepipe.com/wp-content/uploads/2025/05/GRE-HighPressureProducts.pdf

### 2. Responsive Breakpoints (Tailwind Config)
```javascript
screens: {
  'xs': '475px',   // Extra small devices
  'sm': '640px',   // Mobile landscape
  'md': '768px',   // Tablets
  'lg': '1024px',  // Desktop
  'xl': '1280px',  // Large desktop
  '2xl': '1536px'  // Extra large
}
```

### 3. Mobile Navigation
- **Desktop**: Hover-expand sidebar (16px → 264px)
- **Tablet/Mobile**: Slide-out drawer menu met overlay
- **Hamburger menu**: Toegevoegd aan header voor mobiel
- **Touch-friendly**: Minimale klikgebieden van 44x44px

### 4. Header Aanpassingen
- Responsive zoekbalk met kleinere placeholder op mobiel
- Hamburger menu knop (alleen zichtbaar op mobiel/tablet)
- Systeem status verborgen op kleine schermen
- Logo en branding schalen mee met schermgrootte

### 5. Typography & Spacing
- Base font-size: 16px (desktop) → 14px (tablet) → 13px (mobiel)
- Touch-friendly padding op alle interactieve elementen
- Safe area insets voor moderne apparaten (notch support)

### 6. CSS Optimalisaties
- `-webkit-text-size-adjust: 100%` voorkomt iOS zoom bij input focus
- `-webkit-tap-highlight-color` voor betere touch feedback
- `touch-action: none` op buttons voor betere responsiviteit
- Responsive scrollbar styling (8px breed)

### 7. Viewport Configuration
```html
<meta 
  name="viewport" 
  content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0"
/>
```

## Geteste Schermformaten

### Mobiel (< 768px)
- iPhone SE: 375x667
- iPhone 12/13: 390x844
- Android (gemiddeld): 360x800

### Tablet (768px - 1023px)
- iPad: 768x1024
- iPad Pro: 834x1112
- Android tablets: 800x1280

### Desktop (≥ 1024px)
- Laptop: 1366x768
- Desktop: 1920x1080
- Ultrawide: 2560x1440

## Belangrijke CSS Classes

### Touch Targets
```css
.touch-target        /* Min 44x44px voor touch */
.mobile-padding      /* px-4 py-3 */
.tablet-padding      /* md:px-6 md:py-4 */
```

### Responsive Utilities
```css
.hidden md:flex      /* Verborgen op mobiel, zichtbaar op tablet+ */
.md:hidden           /* Zichtbaar op mobiel, verborgen op tablet+ */
.xs:text-sm md:text-base  /* Responsive tekst */
```

## Testing Checklist

- [x] Mobiele navigatie (hamburger menu)
- [x] Touch-friendly knoppen (min 44px)
- [x] Responsive typography
- [x] Sidebar drawer op mobiel
- [x] Header responsiveness
- [x] Safe area insets (notch)
- [x] Viewport meta tag
- [x] Touch feedback

## Bekende Beperkingen

1. **Landscape mobiel**: Sommige views kunnen beperkt zijn in landscape mode op zeer kleine apparaten
2. **Zeer oude browsers**: IE11 en ouder worden niet ondersteund
3. **Print styling**: Nog niet geoptimaliseerd voor print

## Toekomstige Verbeteringen

- [ ] PWA ondersteuning voor offline gebruik
- [ ] Swipe gestures voor navigatie
- [ ] Pull-to-refresh functionaliteit
- [ ] Haptic feedback op ondersteunde apparaten
- [ ] Landscape optimalisatie voor tablets
- [ ] Dark mode toggle

## Bronnen

- [Future Pipe GRE Products](https://futurepipe.com/wp-content/uploads/2025/05/GRE-HighPressureProducts.pdf)
- [Tailwind CSS Responsive Design](https://tailwindcss.com/docs/responsive-design)
- [MDN Touch Events](https://developer.mozilla.org/en-US/docs/Web/API/Touch_events)
