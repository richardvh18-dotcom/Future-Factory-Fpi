# Optimalisatieplan: Fittings Pilot (BH18 & BM01)

Dit document bevat de technische en functionele optimalisaties om de 4-weekse pilot tot een succes te maken.

## 1. Code & Infrastructuur "Merge"
De eerste stap is het samenvoegen van de kracht van beide versies (Set 1 en Set 2).

- **Herstel de Backend:** Zorg dat de `functions/` map uit Set 1 volledig geïntegreerd is in je werkomgeving. Zonder deze functies werken automatische status-notificaties (bijv. van BH18 naar BM01) niet.
- **Fix Bestandsfouten:** Verwijder het foutieve bestand `AiCenterView,jsx` (met de komma) uit Set 2 om build-fouten te voorkomen.
- **Activeer de ERP-Sync:** Integreer `infor_sync_service.js` uit Set 1 in de hoofdstructuur. Pas de endpoints aan zodat orders die op papier binnenkomen, ook direct digitaal zichtbaar zijn in de `PlanningListView`.

## 2. Optimalisatie voor de Werkvloer (UX)
Operators werken vaak met handschoenen of in een luidruchtige omgeving. De app moet hierop aangepast zijn.

- **Scanner Snelheid:** Optimaliseer `MobileScanner.jsx`. Voeg een 'Auto-Focus' vertraging toe en zorg dat de camera direct sluit na een succesvolle scan om batterij te besparen op tablets.
- **Grote Interactie-elementen:** Gebruik Tailwind klassen om alle knoppen in de `WorkstationHub` minimaal `h-16` (64px) te maken voor makkelijke bediening.
- **Offline-First Check:** Hoewel Firebase veel regelt, is het raadzaam om in `workstationLogic.js` een lokale cache check toe te voegen. Als de Wi-Fi bij de BH18 wegvalt, moet de operator de start/stop tijden nog steeds kunnen invoeren.

## 3. De "Hybride Brug" (Papier-Digitaal)
Om dubbele invoer te minimaliseren en fouten te voorkomen:

- **QR-Code Generatie:** Voeg een functie toe aan `pdfGenerator.js` die een kleine sticker-lay-out genereert met een QR-code voor het ordernummer. Plak deze op de papieren bon. Dit maakt de overstap naar de `Terminal.jsx` sneller.
- **Sync-Dashboard voor Teamleaders:** Maak in de `TeamleaderFittingHub` een overzicht dat de "Papieren Status" (handmatige invoer) vergelijkt met de "App Status". Markeer afwijkingen in het rood.
- **BM01 Checklists:** Zorg dat de velden in `BM01Hub.jsx` precies dezelfde volgorde hebben als het huidige papieren keuringsformulier. Dit verhoogt de snelheid van invoer aanzienlijk.

## 4. AI Assistent Optimalisatie (Fittings Specifiek)
De AI in `aiService.js` kan fungeren als een "Digitale Buddy" voor de operators.

- **Context Injectie:** Voeg in `aiPrompts.js` specifieke context toe over de BH18 machine (foutcodes, onderhoudspunten).
- **Spraak-naar-Tekst:** Overweeg om de Web Speech API te activeren in de `AiChatView`. Een operator bij de BH18 kan dan met zijn stem een probleem melden in plaats van te typen.

## 5. Performance & Data
- **Firestore Indexen:** Controleer of er indexen zijn aangemaakt voor de queries in `usePlanningData.js`. Zonder indexen vertraagt de app naarmate er meer pilot-data (na week 2) in het systeem komt.
- **Cleanup Script:** Gebruik `archiveService.js` om aan het einde van elke week de voltooide orders naar een 'archief' collectie te verplaatsen, zodat de actieve lijst bij BM01 overzichtelijk blijft.

## Actiepunten voor de Start
- [ ] Voer een volledige build uit met de `functions/` map actief.
- [ ] Test de `infor_sync_service` met ten minste 5 echte ordernummers van de Fittings afdeling.
- [ ] Loop met een tablet langs station BH18 om de Wi-Fi sterkte te testen.