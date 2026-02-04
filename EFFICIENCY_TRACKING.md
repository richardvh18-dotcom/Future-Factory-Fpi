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
