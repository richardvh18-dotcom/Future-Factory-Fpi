# Optimalisatieplan: Full Digital Pilot (BH18 & BM01)

Dit document bevat de technische en functionele optimalisaties voor de volledig digitale pilot (Paperless).

## 1. Code & Infrastructuur "Merge"
De eerste stap is het samenvoegen van de kracht van beide versies (Set 1 en Set 2).

- **Herstel de Backend:** Zorg dat de `functions/` map uit Set 1 volledig geïntegreerd is in je werkomgeving. Zonder deze functies werken automatische status-notificaties (bijv. van BH18 naar BM01) niet.
- **Fix Bestandsfouten:** Verwijder het foutieve bestand `AiCenterView,jsx` (met de komma) uit Set 2 om build-fouten te voorkomen.
- **Activeer de ERP-Sync:** Integreer `infor_sync_service.js` uit Set 1 in de hoofdstructuur. Zorg dat digitale orders direct in de `PlanningListView` verschijnen.

## 2. Optimalisatie voor de Werkvloer (UX)
Operators werken vaak met handschoenen of in een luidruchtige omgeving. De app moet hierop aangepast zijn.

- **Scanner Snelheid:** Optimaliseer `MobileScanner.jsx`. Voeg een 'Auto-Focus' vertraging toe en zorg dat de camera direct sluit na een succesvolle scan om batterij te besparen op tablets.
- **Grote Interactie-elementen:** Gebruik Tailwind klassen om alle knoppen in de `WorkstationHub` minimaal `h-16` (64px) te maken voor makkelijke bediening.
- **Offline-First Check:** Hoewel Firebase veel regelt, is het raadzaam om in `workstationLogic.js` een lokale cache check toe te voegen. Als de Wi-Fi bij de BH18 wegvalt, moet de operator de start/stop tijden nog steeds kunnen invoeren.

## 3. Volledig Digitale Flow (Paperless)
De keten is: **Productie (BH18) -> Lossen -> Nabewerken -> Eindinspectie (BM01)**.

- **Status Flow:** Zorg dat de statusovergangen naadloos zijn. Zodra BH18 "Gereed" meldt, moet de order direct zichtbaar zijn in de "Te Lossen" lijst.
- **Nabewerking:** Voeg indien nodig een expliciete stap/status "Nabewerken" toe in de `WorkstationHub` als tussenstap voor de eindinspectie.
- **Eindinspectie (BM01):** De digitale checklist in `BM01Hub.jsx` is leidend. Geen papieren backup meer.
- **Unieke Lotnummer Validatie:** CRUCIAAL. Voeg een `getDoc` check toe vóór het starten van een order. Als het lotnummer (handmatig of auto) al bestaat in `tracked_products`, blokkeer de actie en toon een alert. Dit voorkomt dat product 2 de data van product 1 overschrijft.
- **Fail-safe:** Zorg dat operators een order handmatig kunnen opzoeken (via zoekbalk) als deze niet automatisch in hun lijst verschijnt.

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