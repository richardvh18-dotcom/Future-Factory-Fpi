# Pilot Handover Summary

**Laatst bijgewerkt:** 25 maart 2026 (sessie 13)
**Branch:** `FpiFF-Pilot-Ready`  
**Doel:** compacte overdracht voor hervatten van pilotwerk richting 30 maart

## Huidige Status

De pilotbranch bevat meerdere afgeronde verbeteringen voor planning, printing, permissies en AI. De belangrijkste open risico's zitten nog in:

1. LN planning import moet nog met een echt userbestand definitief gevalideerd worden.
2. Terminal/Workstation zichtbaarheid van geimporteerde orders moet end-to-end getest blijven.
3. ZM400 kalibratie werkend — lotnummer-batch en queue-label snijgedrag live bevestigd; orderlabel-flow vanuit Print Station nog live te valideren.
4. Algemene pilot validatie op de vloer moet nog gebeuren met operators.

## Kritieke Open Punten

### 1. Planning Import Workflow
- **Status:** gedeeltelijk gerepareerd, nog niet definitief gevalideerd
- **Probleem:** sommige LN-bestanden geven nog steeds `geen bruikbare orders gevonden`
- **Wat al gedaan is:**
    - parser robuuster gemaakt voor variërende headers
    - sheet-detectie verbreed
    - meldingen verbeterd met kopieerbare foutdetails
    - importmodus voor overschrijven teruggebracht
    - AH/FH mapping voor omschrijving/klant verduidelijkt
- **Nog nodig:** exact userbestand opnieuw testen en ontbrekende kolommen 1-op-1 mappen

### 2. Planning Status Visibility
- **Status:** code aangepast, praktijkvalidatie nog nodig
- **Wat al gedaan is:**
    - Terminal en Workstation filterlogica aangepast zodat actieve statussen zoals `waiting` zichtbaar blijven
- **Nog nodig:** importeren en controleren op BH18, Lossen, Nabewerking/BM01

### 3. Label Printing op Echte Hardware
- **Status:** kalibratie werkend en gesneden; lot-batch en queue-label snijfix live bevestigd
- **Pilotaanname:** Zebra ZM400 via WebUSB als primaire printroute (bevestigd in praktijktest 23 maart)
- **Wat al gedaan is:**
    - ZPL generatie verbeterd
    - rotatie-offsets en tekstmetrieken verfijnd
    - lotnummers direct printbaar gemaakt
    - queue/USB/preview flows verder geharmoniseerd
    - Print Station/Print Queue lotnummer-flow gefixt voor stationselectie via `factory_configs/main`
    - Fittings lotstationfilter aangepast naar BH-stations
    - `Print 'OK' QR (A4)` hersteld met lokale QR-generatie
    - QR-rendering app-breed geïnternaliseerd (geen externe `api.qrserver.com`)
    - `LabelVisualPreview.jsx` verder getuned voor verticale tekst/objecten:
        - verticale X-compensatie bijgesteld voor betere links/rechts-uitlijning in preview
        - minimale verticale objecthoogte per labelformaat toegevoegd (`55mm` groot, `30mm` klein), begrensd door objectmaat
        - barcode preview `objectFit` aangepast naar `contain`
        - wrap/clipping-logica voor verticale tekst aangescherpt, maar live hardware-validatie van lange verticale tekstregelafbreking is nog nodig
    - ZPL cut-logica fundamenteel hersteld (23 maart sessie 6, zie 3a)
- **Nog nodig:** live validatie orderlabel print vanuit Print Station

### 3a. Zebra ZM400 WebUSB Vervolgpunten
- [x] WebUSB printflow in `PrintStationView.jsx` robuuster gemaakt met dynamische OUT endpoint-detectie
- [x] WebUSB secure-context check toegevoegd
- [x] Device-selectie verbeterd met `vendorId`/`productId` filters
- [x] Matching verbeterd voor mixed ID-formaten
- [x] `PrintQueueAdminView.jsx` geharmoniseerd met dezelfde WebUSB-printerprofiel-logica
- [x] In Queue UI zichtbaar gemaakt welk actief printerprofiel gebruikt wordt
- [x] Gedeelde WebUSB utility (`src/utils/usbPrintService.js`) uitgebreid
- [x] Zowel `PrintStationView.jsx` als `PrintQueueAdminView.jsx` aan gedeelde WebUSB utility gekoppeld
- [x] ZPL cut-logica fundamenteel hersteld (23 maart sessie 6):
    - Oorzaak: `^XB` (suppress backfeed) stond in ZPL waardoor printer niet naar snijpositie voerde
    - `^MMC` staat nu vroeg in de header van elk label (direct na `^XA^CI28`), niet meer aan het einde
    - `^XB`, `^CN1` en `~JK` volledig verwijderd uit `generatePrintData`, `generateLotBatchZPL` en `ensureCutCommandForQueueJob`
    - Kalibratie ZPL in `buildCalibrationCrossZpl` krijgt nu ook `^MMC` in header + `^PQ1,0,1,Y` → print en snijdt correct
    - Lot-batch: alleen het **laatste** lot krijgt `^PQ1,0,1,Y` (knip); tussenliggende labels krijgen `^PQ1,0,1,N`
    - Queue-labels: `ensureCutCommandForQueueJob` vereenvoudigd naar alleen `^MMC + ^PQ1,0,1,Y`; detecteert of knip al aanwezig is
- [x] Hardware SmartCal uitgevoerd op ZM400 (FEED+CANCEL bij opstarten): top-of-form correct ingesteld
- [x] Kalibratie print bevestigd werkend en wordt gesneden
- [x] Offset X bijgesteld naar **-4mm** na hardware SmartCal (eerdere -8.9mm verouderd)
- [x] Live validatie: queue-label wordt na fix gesneden (sessie 11, 24 maart)
- [x] Live validatie: lotnummer-batch van 5 of 10 stuks knipt alleen na het laatste label (`^MMT` op tussenliggende labels fix — sessie 7, 23 maart)
- [x] Lotnummer invoerveld "Aantal Labels" verbeterd in Print Station + Print Queue: direct typen werkt nu (leeg veld tijdelijk toegestaan, validatie op blur/submit)
- [x] Lotbatch QR-layout ingesteld op 9x9mm (`qrSizeMm: 9`) en tekstbreedte/centrering in `generateLotBatchZPL` opnieuw getuned voor ZM400
- [x] Fysieke lay-out validatie afgerond: lotnummers (~65mm) en QR zijn nu correct uitgelijnd en akkoord op hardware
- [x] Sessie 9 (24 maart): regressie na Zadig/Windows-route hersteld
    - Batch-cut opnieuw bevestigd: knip pas na laatste label (test met 10 lotnummers geslaagd)
    - QR-grootte opnieuw bevestigd als correct (9x9)
    - Lotnummers opnieuw getuned en bevestigd: goede breedte en correcte top-uitlijning t.o.v. QR
    - Lotbatch DPI-resolutie geharmoniseerd met driverprofiel (geen ongewenste 203-fallback)
- [x] Printspeed instelbaar gemaakt in Printer Beheer en doorgezet naar output (`^PR` voor ZPL, `SPEED` voor TSPL)
- [x] WebUSB foutmeldingen in Printer Beheer aangepast naar platform-neutraal (niet langer Windows-specifiek)
- [x] Printer Beheer testprint aangepast naar gedeelde WebUSB utility met hergebruik van geautoriseerde devices (eerste keer permissie, daarna geen picker per print)
- [ ] Orderlabel printen vanuit Print Station
  - **Gecalibreerde offsetwaarden na hardware SmartCal (23 maart):**
    - `calibrationOffsetXMm = -4` (na hardware SmartCal — eerdere -8.9 vervalt)
    - `calibrationOffsetYMm = 0` (na hardware SmartCal — eerdere +4.5 vervalt; pas bijstellen na live test)

### 3b. Praktijktest Logtemplate Zebra ZM400 (invullen tijdens test)
- **Testdatum/tijd:** 
- **Tester:** 
- **Werkplek/station:** 
- **Browser + versie:** 
- **USB-weergave:** toont alleen juiste printer `ja/nee`
- **Orderlabel test:** `geslaagd/mislukt`
- **Lotbatch test:** `geslaagd/mislukt`
- **Printkwaliteit:** tekst `ok/niet ok`, QR `ok/niet ok`
- **Snij/backfeed gedrag:** `ok/niet ok/n.v.t.`
- **Geobserveerde afwijking:** 
- **Directe vervolgactie:** 

### 3c. Snelle Checklist: Preview vs Print (Orderlabel)
- [ ] Controleer in Printer Beheer dat actieve driver/DPI klopt met fysieke printer (`zebra-zm400-300` of `zebra-zm400-203`)
- [ ] Open hetzelfde orderlabel in Print Station en noteer lot/order/template
- [ ] Print exact 1 label en leg preview + fysiek label naast elkaar
- [ ] Vergelijk alleen deze 3 punten: tekstpositie, regelafbreking/wrap, rotatie-uitlijning
- [ ] Noteer afwijking in mm als `X: ...mm`, `Y: ...mm` (geen nieuwe template-wijziging doen tijdens test)
- [ ] Herhaal dezelfde check in Print Queue met hetzelfde template/data
- [ ] Als afwijking <= 1mm: markeer als geslaagd; anders offset-finetune plannen

## Afgerond in Recente Sessies

### Rechtenstructuur en Toegang
- Granulaire permissiestructuur toegevoegd via `user.permissions`
- Kernmodules standaard beschikbaar gemaakt:
    - `planning`
    - `catalog`
    - `inbox`
- Optionele modules instelbaar gemaakt per feature
- Oude admin-tool permissies uitgefaseerd met migratiepad
- `useHasFeature` hook toegevoegd voor consistente feature checks

### Admin en Navigatie
- Module master toggle bug opgelost in gebruikersbeheer
- Admin Hub filtering aangepast naar nieuw permissiemodel
- `digital_planning` als expliciete module toegevoegd in rechtenbeheer

### AI Assistent
- Firestore paden toegevoegd:
    - `AI_MEMORY`
    - `AI_CONVERSATIONS`
- AI kan nu:
    - goedgekeurde antwoorden onthouden
    - relevante herinneringen in context meenemen
    - recente gesprekken per gebruiker opslaan en herstellen
- In chat toegevoegd:
    - like-knop voor positief leergeheugen
    - herstel van recent gesprek
    - knop voor nieuw gesprek

### Planning en Productieflow
- Lotnummer-zoekveld toegevoegd in detailrapportage
- Fallback voor productomschrijving verbeterd zodat minder snel `ONBEKEND PRODUCT` verschijnt
- PO text/opmerking bewerkbaar gemaakt in orderdetail-flow
- Opmerkingen zichtbaar gemaakt in operator/teamleader weergave
- Cross-station N2100 routing voorbereid: hybride orders (Spoolbouw + Fittingen met zelfde ordernummer) blijven in Fittingen verborgen tot voldoende Spoolbouw-output beschikbaar is (`x van y` vrijgave op basis van aantallen); Lossen-grenzen afgestemd op TB 25-300 lokaal / >300 station en CB 25-350 lokaal / >350 station

### Printing en Labels
- Print flows verder gecentraliseerd rond gedeelde preview/generatie helpers
- Lotnummer-generatie en printerstation-flow verbeterd
- Tijdelijke/order labels beter geïntegreerd in printerviews
- Extra previewcomponenten toegevoegd voor consistente labelweergave
- QR-preview en QR-PDF generatie volledig intern gemaakt via lokale QR utility/component
- `InternalQrImage` verplaatst naar `src/utils/InternalQrImage.jsx` en alle imports bijgewerkt

### Scroll fixes (20 maart 2026 — sessie 2)
- `LossenView.jsx` — root scroll container `pb-32` + `max(8rem, env(safe-area-inset-bottom))` safe-area padding
- `WorkstationHub.jsx` — content area div safe-area bottom padding toegevoegd
- `TerminalProductionView.jsx` — twee scroll containers (wikkelen list + detail panel) `pb-24` + safe-area padding
- `BM01Hub.jsx` — inspection tab scroll container `pb-24` + safe-area padding
- `PrintQueueAdminView.jsx` — root div gewijzigd van `p-4 md:p-8` naar `h-full overflow-y-auto p-4 md:p-8` + safe-area padding (App.jsx `<main>` heeft `overflow-hidden` waardoor kinderen expliciet `h-full overflow-y-auto` nodig hebben)

### Station Lossen opschonen (20 maart 2026 — sessie 2)
- Tab "Printers en Labels" volledig verwijderd uit Station Lossen UI
- Alle dode printer/labels/planning code verwijderd uit `LossenView.jsx`:
  - States: `activeView`, `planningOrders`, `planningSearch`, `planningStationFilter`, `showReservations`, `reserveConfig`, `availableLabels`, `selectedLabelId`, `labelRules`, `nextStartLot`, `containerRef`, `previewZoom`, `simplePrintConfig`, `generating`, `savedPrinters`
  - useEffects: planningOrders fetch, reservedItems cleanup, labels/rules fetch, nextStartLot, containerRef zoom
  - Handlers: `handleSimpleRelease`, `handleSimplePrint`, `handleReserveConfirm`, `handleDeleteReservation`
  - Memos: `filteredOrders`, `uniqueStations`, `selectedLabel`, `previewData`, `reservedItems`
  - JSX: volledige "planning" view branch inclusief tabs
  - Imports: `X`, `Search`, `Clock`, `Trash2` icons; `StatusBadge`; `getISOWeek`, `processLabelData`, `applyLabelLogic`, `getQRCodeUrl`; `PIXELS_PER_MM`, `getMachineCode`, `getLotPrefix`, `printViaWebUSB`; Firestore `orderBy`, `limit`, `writeBatch`
- 35+ dode `lossen.*` vertalingssleutels verwijderd uit `nl.js` en `en.js`
- Resterende actieve sleutels behouden: `no_incoming_items`, `wait_for_unload`, `waiting_receipt`, `lot_number`, `received`, `manufactured_item`, `origin`, `from`, `process_release`, `ready_to_scan`, `item_not_found`

## Belangrijkste Relevante Bestanden

### AI
- `src/services/aiService.jsx`
- `src/components/ai/AiChatView.jsx`
- `src/components/ai/AiMessage.jsx`
- `src/config/dbPaths.jsx`

### Rechten en Modules
- `src/components/admin/AdminUsersView.jsx`
- `src/components/admin/AdminDashboard.jsx`
- `src/components/Sidebar.jsx`
- `src/hooks/useHasFeature.js`

### Planning Import / Terminal
- `src/components/digitalplanning/modals/PlanningImportModal.jsx`
- `src/components/digitalplanning/terminal/TerminalPlanningView.jsx`
- `src/components/digitalplanning/WorkstationHub.jsx`

### Printing
- `src/components/printer/PrintQueueAdminView.jsx`
- `src/components/printer/PrintStationView.jsx`
- `src/components/admin/AdminPrinterManager.jsx`
- `src/utils/InternalQrImage.jsx`
- `src/utils/printerDrivers.js`
- `src/utils/zplHelper.js`
- `src/utils/labelHelpers.jsx`
- `src/services/printService.js`

## Open Pilot Validatie

### End-to-End Werkvloerflow
- [ ] BH18 order starten
- [ ] uniek lotnummer genereren
- [ ] doorzetten naar Lossen
- [ ] verplichte metingen invoeren
- [ ] doorzetten naar Nabewerking / BM01
- [ ] goedkeuren of afkeuren
- [ ] dossier / archivering controleren
- [ ] hybride N2100 scenario valideren: start in Spoolbouw, pas zichtbaar in Fittingen zodra vereist aantal gereed buisstukken (`x van y`) bereikt is

### Multi-operator Test
- [ ] 2 of meer operators tegelijk laten werken
- [ ] occupancy sync controleren
- [ ] race conditions uitsluiten

### Mobile / Scanner
- [ ] QR scanflow testen op alle stations
- [ ] manual fallback testen
- [ ] iOS/Android/device mix controleren

### Security / Compliance
- [ ] Firestore rules praktijkvalideren
- [ ] operator mag geen vreemd station zien
- [ ] admin mag alles beheren
- [ ] AI context controleren op onnodige PII

### Performance / Stabiliteit
- [ ] 100+ orders in terminal testen
- [ ] filter/sort performance testen
- [ ] netwerkuitval scenario testen

## Praktische Hervatstappen

### Als je verder wilt met LN import
1. Open de importmodal in LN-modus.
2. Upload exact hetzelfde userbestand.
3. Kopieer de foutmelding met kolomnamen.
4. Vul aliasmapping verder aan in `PlanningImportModal.jsx`.
5. Test tot orders zichtbaar zijn in de preview.

### Als je verder wilt met AI
1. Stel een vraag in de AI chat.
2. Like een goed antwoord.
3. Stel een vergelijkbare vraag opnieuw.
4. Controleer of geheugencontext effect heeft.
5. Controleer Firestore in:
     - `future-factory/settings/ai_memory`
     - `future-factory/settings/ai_conversations`

### Als je verder wilt met printing
1. Verbind Zebra ZM400 via WebUSB en bevestig dat de printer door de browser wordt gezien.
2. Print een echt orderlabel.
3. Print een batch lotnummers.
4. Controleer tekstuitlijning, QR positie en snijgedrag.
5. Fine-tune indien nodig in `zplHelper.js`.

### Printer Driver Mapping (pilot)

| Scenario | Driver kiezen in Admin | Start DPI | Start Darkness | Start Speed | Taal/Pad |
|---|---|---:|---:|---:|---|
| Zebra ZM400 via WebUSB (hoofdroute) | `zebra-zm400-300` (of `zebra-zm400-203` als printer fysiek 203 DPI is) | 300 (of 203) | 20 | 3 | ZPL/WebUSB |
| Zebra EPL2 Label Printer (CUPS/legacy) | `zebra-epl2-203` | 203 | 20 | 3 | EPL |
| Lighthouse CJ-PRO II (Windows host) | `lighthouse-cjpro2` | 300 | 15 | 4 | TSPL/Windows |

Praktische keuzehulp:
- Gebruik `zebra-zm400-300` als standaard voor de huidige pilotroute met ZM400 via WebUSB.
- Schakel alleen naar `zebra-zm400-203` als de printer daadwerkelijk op 203 DPI draait (anders schaal/positie-afwijking).
- Gebruik `zebra-epl2-203` alleen voor EPL2-printers of legacy CUPS/EPL-paden, niet als vervanging van de ZM400 WebUSB ZPL-route.
- Als snijgedrag op ZM400 niet klopt: eerst driver en DPI bevestigen, daarna pas offsets/darkness tunen.

## Actieplan Vandaag (20 maart 2026)

1. Valideer LN-import met exact userbestand en noteer ontbrekende kolomaliases.
2. Controleer direct daarna orderzichtbaarheid in Terminal en Workstation voor BH18, Lossen en Nabewerking/BM01.
3. Voer een live Zebra ZM400 WebUSB printtest uit: 1 orderlabel en 1 lotnummerbatch.
4. Draai een korte multi-operator check (minimaal 2 gebruikers) om occupancy sync te bevestigen.
5. Rond af met een compacte bevindingenlog: wat werkt, wat blokkeert, en welke fix als eerstvolgende nodig is.

## Korte Historie

### 25 maart 2026 — sessie 13 (vervolg)
- Sync issue nog open: handmatige tekeningsync meldt nog steeds 0 matches in praktijktest.
- Reeds aangebrachte fixes in `manualSyncDrawings.jsx`:
    - robuustere normalisatie (`normalized`, `compact`, tokenized keys)
    - filtering van niet-code waardes (zoals productomschrijvingen met spaties)
    - conversie-fallback uitgebreid naar meerdere targetcodes per broncode
- Specifieke case bevestigd door gebruiker:
    - broncode `EL9AESS08R03E0BCCBB0`
    - conversiematrix bevat o.a. `ELMO90ES00WMST080000320CB0` en `ELMO90CS00WMST080000320CB0`
    - catalogus bevat `articleCode = ELMO90CS00WMST080000320CB0` met gekoppelde tekening
- Ondanks bovenstaande fixset wordt in UI nog geen match getoond; debugging wordt in volgende sessie hervat.
- Gebruiker stopt hier tijdelijk en pakt sync-analyse later weer op.

### 25 maart 2026 — sessie 12
- Vite devserver gestart op poort 3000 voor vervolgvalidatie
- Bereikbaarheid bevestigd via:
    - `http://localhost:3000/`
    - `http://10.0.11.112:3000/`

### 24 maart 2026 — sessie 11
- Queue-label print live gevalideerd: na elk label wordt correct geknipt
- Quantity-verwerking live gevalideerd: bij `Aantal Labels = 2` worden ook effectief 2 labels geprint
- Open printing-punt versmald naar alleen orderlabel-flow vanuit Print Station

### 24 maart 2026 — sessie 10
- Vite devserver gestart op poort 3000 voor directe vervolgvalidatie
- Bereikbaarheid bevestigd op `http://localhost:3000/`
- Applicatie geopend in browser via host-`$BROWSER`

### 23 maart 2026 — sessie 8
- Printspeed toegevoegd aan Printer Beheer (opslaan/laden in printerprofiel) en gekoppeld aan printoutput in admin/station/queue
- ZPL output uitgebreid met `^PR` en TSPL fallback met `SPEED` zodat warmte/snelheid beter af te stemmen is op media/ribbon
- WebUSB foutafhandeling in Printer Beheer aangepast naar platform-neutrale melding voor Chromebook/Chrome context
- Extra actie toegevoegd voor USB reset/reconnect in Printer Beheer
- Admin testprintflow aangepast om geautoriseerde WebUSB devices te hergebruiken via gedeelde utility; device-picker wordt niet meer onnodig per testprint getoond

### 23 maart 2026 — sessie 7
- Lotbatch snijgedrag bevestigd op hardware: tussenliggende labels `^MMT`, alleen laatste label knip (`^MMC` + `^PQ1,0,1,Y`)
- Lotnummer-aantalinput in `PrintStationView.jsx` en `PrintQueueAdminView.jsx` hersteld voor direct typen
- Submit-logica gehard met `resolvedCount` zodat batchopbouw/feedback altijd een geldige waarde gebruikt
- Lotbatch tekstrendering in `generateLotBatchZPL` bijgesteld (breedte + centrering) op basis van fysieke ZM400 afwijking
- QR-layout voor lotbatch expliciet op 9x9mm gezet
- Laatste finetune bevestigd op fysieke print: lotnummerbreedte ~65mm en verticale uitlijning met QR akkoord

### 23 maart 2026 — sessie 6
- Vite devserver gestart op poort 3000
- ZM400 voor het eerst fysiek aangesloten voor live printtest
- Diagnose: printer wist labelgrens niet → hardware SmartCal uitgevoerd (FEED+CANCEL bij opstarten)
- Kalibratie label bleef wit → oorzaak: top-of-form niet ingesteld (hardware probleem, niet software)
- Na SmartCal: kalibratie print correct afgedrukt én gesneden
- Offset X ingesteld op -4mm (4mm te rechts na SmartCal); eerdere waarden (-8.9 / +4.5) vervallen
- ZPL cut-logica fundamenteel gerepareerd in `zplHelper.js` en `PrintQueueAdminView.jsx`:
    - `^MMC` naar header verplaatst (was achteraan → activeerde cut pas bij volgend label)
    - `^XB` (suppress backfeed) volledig verwijderd → blokkeerde doorvoer naar snijpositie
    - `^CN1` en `~JK` verwijderd → redundant/interfererend met `^MMC + ^PQ,,,Y`
    - Kalibratie ZPL (`buildCalibrationCrossZpl`) krijgt nu ook `^MMC` + `^PQ1,0,1,Y`
    - Lot-batch: knip alleen op laatste label (`^PQ1,0,1,Y`), tussenliggende `^PQ1,0,1,N`
    - Queue `ensureCutCommandForQueueJob` vereenvoudigd: alleen `^MMC + ^PQ1,0,1,Y` injecteren
- Nul compile-errors na alle wijzigingen
- Open: live validatie queue-label snijden + lot-batch snijgedrag

### 22 maart 2026 — sessie 5
- Vite devserver gestart op poort 3000 voor directe pilotvalidatie
- Bereikbaarheid bevestigd via:
    - `http://localhost:3000/`
    - netwerk-URL op LAN voor test op andere devices

### 22 maart 2026 — sessie 4
- Lotnummer stationselectie opgelost in Print Station en Print Queue:
    - Stations komen uit `future-factory/settings/factory_configs/main`
    - Afdeling-mapping robuust gemaakt op `name/slug/id/key` (niet alleen slug)
    - Fittings-filter gewijzigd naar BH-stations op verzoek
- `Print 'OK' QR (A4)` in Printer Beheer gefixt:
    - lokale QR generatie (`qrcode`) in plaats van externe image URL
    - robuuste popup/open flow met download fallback
- Alle QR-previews/app-paden naar intern omgezet:
    - geen externe `api.qrserver.com` calls meer in `src` en na build ook niet in `dist`
- `InternalQrImage` verplaatst van `src/components/InternalQrImage.jsx` naar `src/utils/InternalQrImage.jsx` en alle referenties aangepast
- Build en foutcontrole uitgevoerd: geen compile-errors op aangepaste printer/QR-bestanden

### 20 maart 2026 — sessie 2
- Scroll fix toegepast op LossenView, WorkstationHub, TerminalProductionView, BM01Hub
- PrintQueueAdminView (`/printer-queue`) scrollprobleem opgelost: root div nu `h-full overflow-y-auto`
- Tab "Printers en Labels" volledig verwijderd uit Station Lossen
- Alle dode printer/labels/planning code verwijderd uit LossenView
- 35+ dode `lossen.*` vertalingssleutels verwijderd uit nl.js en en.js
- Nul compile-errors na alle wijzigingen

### 20 maart 2026
- Vite devserver opnieuw gestart op poort 3000 voor doorlopend pilottesten
- Overdrachtsdocument opnieuw geverifieerd als actuele werkbasis
- Pilotrichting voor printing aangescherpt: waarschijnlijk Zebra ZM400 via WebUSB
- Routing uitgebreid voor toekomstige hybride N2100 orders: vrijgave naar Fittingen op aantallenbasis (`x van y`) na Spoolbouw-voortgang

### 19 maart 2026
- Rechtenstructuur afgerond
- AI geheugen en gesprekshistorie toegevoegd
- Samenvatting opgeslagen en opgeschoond

### 18 maart 2026
- LN import debugging verder verbeterd
- Kopieerbare foutmelding toegevoegd
- Omschrijving/PO text flow verbeterd
- Vite server op poort 3000 gestart voor testen

### 17 maart 2026
- Terminal/workstation zichtbaarheid geimporteerde planning verbeterd
- Personeel & bezetting UX verbeterd
- Productie deploy uitgevoerd

### 16 maart 2026
- Lighthouse print calibratie doorgezet
- Operatorhandleiding voor pilotflow uitgewerkt

## Opmerking

Dit document is bewust opgeschoond naar één actuele overdracht. Oudere dubbele sessieblokken en losse server-notities zijn samengevat in plaats van volledig behouden.
