## Update sessie 97 (Lossen 12/18 fix + Vercel/Firebase production deployment)

**Datum:** 17 april 2026 | **Branch:** `pilot-dev`

**Probleem 1 (shopfloor):**
- In station Lossen 12/18 verschenen BH18-producten (die lokaal op 12/18 moesten blijven) niet in de lijst.

**Fix uitgevoerd:**
- Bestand aangepast: `src/components/digitalplanning/LossenView.jsx`
- In de centrale Lossen-filterlogica een extra pad toegevoegd voor BH18 op Lossen 12/18:
        - Als product uit BH18 komt en **niet** naar centraal Lossen moet (`shouldGoToCentralLossen(item) === false`), dan tonen op Lossen 12/18.
        - Producten die wel naar centraal Lossen moeten blijven correct op centraal Lossen.

**Resultaat:**
- Routing/filtering voor BH18 richting Lossen 12/18 werkt nu volgens businessregel.

**Probleem 2 (deploy):**
- Preview/production verwarring op Vercel; gewenste status was expliciet Production.

**Deploys uitgevoerd:**

### 1) Vercel Production deploy ✅
- CLI login vernieuwd (`vercel login`)
- Productie deploy uitgevoerd met:
    - `vercel --prod --yes`
- Deploy succesvol gepubliceerd en gealiased.
- Productie URL:
    - `https://future-factory.vercel.app`

### 2) Firebase deploy ✅
- Build succesvol (`npm run build`)
- Volledige deploy uitgevoerd (`firestore`, `functions`, `hosting`)
- Hosting release succesvol:
    - `https://future-factory-377ef.web.app`

### 3) Firestore index/TLL formaatfout opgelost ✅
- Bestand aangepast: `firestore.indexes.json`
- TTL overrides gecorrigeerd door `indexes: []` toe te voegen bij:
    - `activity_logs.expireAt`
    - `client_errors.expireAt`
- Daarna deploy opnieuw uitgevoerd en succesvol afgerond.

**Git status in deze sessie:**
- Commit 1: Lossen-fix + Vercel branch config
- Commit 2: Firestore TTL index-format fix
- Beide gepusht naar `pilot-dev`.

**Opmerking:**
- Merge-poging `pilot-dev` -> `FF-2-4-26` gaf "Already up to date"; geen extra delta nodig.
- Definitieve production-publicatie is handmatig geforceerd via `vercel --prod --yes` en staat live.

## Update sessie 96 (Preview data-source fix voor startflows)

**Datum:** 14 april 2026 | **Branch:** `pilot-dev`

**Probleem:**
- In preview (artifacts) werden start-acties nog via backend naar productiepad geschreven.
- Concreet: tracking write ging naar `/future-factory/production/tracked_products` i.p.v. `/artifacts/fittings-app-v1/public/data/tracked_products`.

**Gewenste regel:**
- In preview: writes naar artifacts paden.
- In productie: writes naar `/future-factory/...`.

**Wat is aangepast:**

### 1) Runtime padresolutie toegevoegd in backend repositories ✅
- `functions/src/repositories/planningRepository.js`
- Nieuwe resolver `resolveRuntimeDataPaths(runtimeDataSource)`:
    - `useArtifactsPaths + appId` -> artifacts planning/tracking
    - fallback -> bestaande production paden
- Repository methods accepteren nu optioneel `runtimeDataSource`:
    - `getPlanningOrderDocByOrderId`
    - `getTrackedProductDocByIdOrLot`
    - `getPlanningOrderDocById`

### 2) Start-services preview-aware gemaakt ✅
- `functions/src/services/planningTransitionService.js`
- `startWorkstationProductionRunService`:
    - planning order read via runtime data source
    - tracking writes nu via runtime tracking collection
- `startProductionLotsService`:
    - tracking writes + planning status update via runtime collections
- `reserveAutoLotNumberRangeService`:
    - collision check gebruikt runtime tracking collection

### 3) Callables geven runtime context door ✅
- `functions/src/callables/planningCallables.js`
- Uitgebreid voor:
    - `startWorkstationProductionRun`
    - `startProductionLots`
    - `reserveAutoLotNumberRange`
- Nieuwe payloadverwerking: `runtimeDataSource { useArtifactsPaths, appId }`

### 4) Frontend wrapper stuurt runtime context mee ✅
- `src/services/planningSecurityService.js`
- Nieuwe helper `getRuntimeDataSource()` op basis van `window.__app_id`
- Meegegeven in payloads van:
    - `startWorkstationProductionRun`
    - `startProductionLots`
    - `reserveAutoLotNumberRange`

**Resultaat:**
- Preview startflows schrijven nu naar artifacts data collecties.
- Productiegedrag blijft intact via fallback naar `/future-factory/...`.

**Validatie:**
- `node -c` checks op gewijzigde functions bestanden: OK
- `npm run build`: succesvol

**Nog nodig voor live-effect:**
1. `firebase deploy --only functions`
2. Daarna preview startflow opnieuw testen (lot reserve + start order + zichtbaar in tracking)

## Update sessie 95 (ISO 9001/27001 audit logging hardening)

**Datum:** 13 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Certificeerbare traceability + integriteit toevoegen bovenop de bestaande hybrid callable-architectuur
- Elke backend write-acties afdwingen met een centraal auditspoor
- Auditcollectie immutabel maken voor clients via Firestore rules

**Wat is afgerond in deze sessie:**

### 1) Centrale audit service toegevoegd ✅
- Nieuw bestand: `functions/src/services/auditService.js`
- Nieuwe API:
    - `logAction(userId, action, details, options)`
    - `logCallable(context, action, details, options)`
- Auditpad: `/future-factory/audit/logs/{autoId}`
- Vastgelegd per event:
    - `timestamp` (serverTimestamp)
    - `userId`, `userEmail`
    - `action`, `category`, `severity`
    - `details` (traceability metadata)
- Categorieen: `QUALITY`, `PRODUCTION`, `PLANNING`, `ADMIN`, `SECURITY`, `SYSTEM`
- Severity niveaus: `INFO`, `WARNING`, `CRITICAL`

### 2) Audit hooks in callables afgedwongen ✅
- `functions/src/callables/planningCallables.js` uitgebreid met audit-instrumentatie
- Aan het begin van alle callable flows is `auditService.logCallable(...)` toegevoegd (na auth/role checks, voor service-executie)
- Gedekte domeinen:
    - Productie/transities (start, pauze, route, complete, cancel)
    - Kwaliteit/QC (afkeur, reparatie, QC notes, lot-wijzigingen)
    - Planning (import, move, hold, priority, metadata)
    - Admin/masterdata (producten, conversies, AI config/docs/knowledge)
    - Security/admin events (account request, profiel/language/password-flag)

### 3) Firestore audit immutability rules toegevoegd ✅
- In `firestore.rules` en `firestore.rules.production` toegevoegd:
    - `match /future-factory/audit/{document=**}`
    - `allow read: if isAdmin();`
    - `allow write: if false;`
- Resultaat: client apps kunnen auditdata niet aanmaken, wijzigen of verwijderen; alleen backend Admin SDK kan schrijven

### 4) Git + deploy status ✅
- Commit: `bf14bed`
- Push: `pilot-dev` succesvol
- Deploy uitgevoerd: `firebase deploy --only functions,firestore:rules`
- Verificatie:
    - Firestore rules release succesvol
    - Grote set functies geupdate (meerdere callable updates bevestigd als “Successful update operation”)
    - `firebase functions:list --json` toont actieve Node 22 callable functies

**Opmerking op deploy-output:**
- Firestore rule warnings over `isClientProtectedPlanningMutation` bestonden al en blokkeren deploy niet

**Openstaand voor auditor-ready inrichting (niet-code):**
1. In GCP Audit Logs voor Firestore expliciet `Admin Write` en `Data Write` inschakelen en bewijs (screenshots/export) bewaren
2. Retentiebeleid formeel vastleggen (minimaal 1 jaar) + expliciet uitsluiten dat audittrail door clients verwijderd kan worden
3. Eventueel aparte auditor-readrol toevoegen i.p.v. alleen `isAdmin()` voor uitleesrechten

## Update sessie 94 (Prioriteit 2 + Utility/AI write-migraties naar backend-callables)

**Datum:** 13 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Openstaande writes uit hotspotscan C verder reduceren:
    1. Automation execution pad server-side afdwingen
    2. Utility writes (`productHelpers`, `conversionLogic`, `infor_sync_service`) naar backend verplaatsen
    3. AI admin/document/training writes via backend-callables laten lopen

**Wat is afgerond in deze sessie:**

### 1) Automation execution gemigreerd ✅
- Nieuwe backend service: `functions/src/services/automationService.js`
- Nieuwe callable: `executeAutomationRule`
- Frontend wrapper toegevoegd in `planningSecurityService.js`
- `executeRuleWithLogging` in `src/utils/automationEngine.jsx` gedelegeerd naar backend callable
- Resultaat: debounce, actie-uitvoering en execution logging lopen nu server-side

### 2) Utility blok gemigreerd ✅

**Product catalog utilities**
- Nieuwe backend service: `functions/src/services/productCatalogService.js`
- Nieuwe callables:
    - `saveProductRecord`
    - `deleteProductRecord`
    - `verifyProductRecord`
- `src/utils/productHelpers.jsx` gebruikt nu backend wrappers i.p.v. directe `addDoc/updateDoc/deleteDoc`

**Conversion utilities**
- Nieuwe backend service: `functions/src/services/conversionCatalogService.js`
- Nieuwe callables:
    - `upsertConversionRecord`
    - `deleteConversionRecord`
    - `deleteAllConversionRecords`
    - `upsertConversionBatch`
- Rewiring uitgevoerd in:
    - `src/utils/conversionLogic.jsx`
    - `src/components/admin/ConversionManager.jsx`

**Infor sync utility**
- Nieuwe backend service: `functions/src/services/inforSyncService.js`
- Nieuwe callable: `processInforUpdate`
- `src/utils/infor_sync_service.jsx` gedelegeerd naar callable (signatuur behouden voor bestaande callsites)

### 3) AI admin/document/training writes gemigreerd ✅
- Nieuwe backend service: `functions/src/services/aiAdminService.js`
- Nieuwe callables:
    - `saveAiContextConfig`
    - `createAiDocumentRecord`
    - `updateAiDocumentRecord`
    - `deleteAiDocumentRecord`
    - `verifyAiKnowledgeEntry`
    - `deleteAiKnowledgeEntry`
    - `migrateAiKnowledgeFields`
- Rewiring uitgevoerd in:
    - `src/components/ai/AiContextManager.jsx`
    - `src/components/ai/AiDocumentUploadView.jsx`
    - `src/components/ai/AiTrainingView.jsx`

**Validatie:**
- Backend syntax checks: geen fouten
- Frontend build: succesvol (`npm run build`)
- `get_errors`: geen fouten op gewijzigde bestanden

**Status einde sessie:**
- Wijzigingen staan lokaal klaar en zijn nog **niet** gepusht (op verzoek)
- Laatste set bevat brede migratie over automation + utility + AI beheerpaden

**Openstaand / Volgende stap:**
1. Functions deployen voor nieuw toegevoegde callables (automation/utility/AI)
2. Daarna git commit + push van de huidige lokale batch
3. Eventueel restscan op niet-kritieke AI-chat/flashcard writes

## Update sessie 93 (Migratie Admin/Account Paden naar Backend Callables)

**Datum:** 13 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Prioriteit 1 uit hotspotscan C afhandelen: Admin & Account paden centraliseren

**Wat is afgerond in deze batch:**

### Backend Services (`adminService.js`) ✅
- `updateUserProfileService`: setDoc user profile (name, email, preferences, language, etc.)
- `clearPasswordChangeFlagService`: setDoc requirePasswordChange: false
- `submitAccountRequestService`: addDoc new account request
- `updateUserLanguageService`: updateDoc language voorkeur + validation

### Backend Callables (in `planningCallables.js`) ✅
```
- updateUserProfile (requires auth)
- clearPasswordChangeFlag (requires auth)
- submitAccountRequest (public, no auth required)
- updateUserLanguage (requires auth)
```

### Frontend Wrappers in `planningSecurityService.js` ✅
```
export const updateUserProfile(profileData)
export const clearPasswordChangeFlag()
export const submitAccountRequest(requestData)
export const updateUserLanguage(language)
```

### Component Migration ✅
1. **ProfileView.jsx**:
   - Import: `{ updateUserProfile, clearPasswordChangeFlag }`
   - handleSaveGeneral: nu via `updateUserProfile()` callable
   - handleUpdatePassword: nu via `clearPasswordChangeFlag()` callable
   - Verwijderd: directe setDoc/updateDoc calls

2. **ForcePasswordChangeView.jsx**:
   - Import: `{ clearPasswordChangeFlag }`
   - handleUpdate: nu via `clearPasswordChangeFlag()` callable
   - Verwijderd: directe updateDoc call

3. **AccountRequestModal.jsx**:
   - Import: `{ submitAccountRequest }`
   - handleSubmit: nu via `submitAccountRequest()` callable
   - Verwijderd: directe addDoc call

4. **Sidebar.jsx**:
   - Import: `{ updateUserLanguage }`
   - handleLanguageSelect: nu via `updateUserLanguage()` callable
   - Verwijderd: directe updateDoc call

**Validatie:**
- `get_errors`: geen fouten op gewijzigde bestanden
- `npm run build`: succesvol (17.54s, main bundle 398KB)
- Backend syntax: geen fouten

**Resultaat:**
- 4 componenten: directe Firestore write → backend-callable migration
- Alle user profile/account/preferences writes nu server-side authorized
- Avatar user account self-service paden nu backend-controlled

**Openstaand / Eerstvolgende Prioriteiten:**
1. (Optioneel) Functions deployen + test admin flows in productie
2. Prioriteit 2: automationEngine.jsx (rule creation/logging)
3. Prioriteit 3: Utility flows (conversionLogic, infor_sync, productHelpers)

## Update sessie 92 (Finish Backend-Write Migratie Batch 3 + Hotspotscan C)

**Datum:** 13 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Taak A: Firebase functions deployment valideren
- Taak B: Print queue aanmaak (printService) via backend-callable centraliseren
- Taak C: Resterende directe client writes scannen en prioriteren

**Wat is afgerond in deze sessie:**

### Taak A: Functions Deploy ✅
- `firebase deploy --only functions` succesvol afgerond
- 50+ callables live in productie (inclusief BatchWriter en journaal-management)
- Specifieke nuevas functies nu actief:
  - `createProductionMessages` (overproduction/reminder alerts)
  - `transitionPrintQueueJobStatus`, `requeuePrintQueueJob`, `deletePrintQueueJob`
  - `saveOccupancyAssignments`, `deleteOccupancyAssignments`
  - `savePersonnelRecord`
  - Alle Sessie 88-91 callables

### Taak B: printService Queue-Aanmaak Migratie ✅
- Nieuwe backend service: `functions/src/services/printingService.js`
  - `queuePrintJobService`: server-side validatie + ZPL sanitation
  - MAX_ZPL_LENGTH, MAX_METADATA_LENGTH, PRINTER_ID_PATTERN checks
- Nieuwe backend callable: `queuePrintJob` in planningCallables.js
- Frontend wrapper: `queuePrintJob()` in planningSecurityService.js
- UI-rewiring afgerond in 5 componenten:
  - `ProductDossierModal.jsx` (herprint labels)
  - `MazakView.jsx` (labels printing)
  - `ProductionStartModal.jsx` (lot initial print)
  - `PrintQueueAdminView.jsx` (manual queue entry)
  - `AdminPrinterManager.jsx` (test/admin print)
- Validatie: geen lints/errors op gewijzigde bestanden

**Resultaat van Taak B:**
- Print queue aanmaak loopt nu volledig via backend-command
- Alle ZPL + metadata validatie server-side afgedwongen
- Directe printService.queuePrintJob calls in frontend verwijderd

### Taak C: Hotspot Scan Resultaten ✅
- **Gescand:** alle src/components + relevante src/utils
- **Gemigreerd (✅):** planning/tracking/occupancy/personnel paden (Sessies 88-91)
- **Nog Client-side (~50 matches):**
  
  **Prioriteit 1 (Admin/Account):**
  - ProfileView.jsx: setDoc userProfile + password change
  - ForcePasswordChangeView.jsx: requirePasswordChange flag
  - AccountRequestModal.jsx: new request creation
  - Sidebar.jsx: language preference update

  **Prioriteit 2 (Automation):**
  - automationEngine.jsx: rule creation/update + execution logging
  - ~8 async operations met addDoc/updateDoc

  **Prioriteit 3 (Utility/Data):**
  - conversionLogic.jsx: writeBatch + setDoc (data imports)
  - infor_sync_service.jsx: efficiency tracking
  - productHelpers.jsx: product CRUD
  - aiService.jsx: AI memory + learning

  **Prioriteit 4 (AI Features, non-critical):**
  - AiContextManager, AiChatView, AiDocumentUploadView
  - AiTrainingView, FlashcardManager
  - Kunnen client-side blijven als cache-safe

  **Acceptabel (✅):**
  - Logging (config/firebase, App, ErrorBoundary)
  - Activity audit trail

**Openstaand / Eerstvolgende Stap:**
1. (Optioneel) Volgende batch migrëren: Admin/Account paden (ProfileView, etc.)
2. (Optioneel) automationEngine autorisatie-checks sharpenen
3. Firestore rules validatie voor nieuwe openstaande schrijven


## Update sessie 91 (Pauzemoment na stap 2 backend-write migratie)

**Datum:** 13 april 2026 | **Branch:** `pilot-dev`

**Wat is afgerond vlak voor pauze:**
- Stap 1 is vastgelegd in deze samenvatting (sessie 90).
- Stap 2 is technisch doorgezet:
    - `WorkstationHub` message writes lopen nu via backend-command.
    - Print queue beheer-acties (statuswissel, requeue, delete) lopen nu via backend-callables.
    - Nieuwe backend/bridge wiring toegevoegd in:
        - `functions/src/services/planningTransitionService.js`
        - `functions/src/callables/planningCallables.js`
        - `functions/index.js`
        - `src/services/planningSecurityService.js`
        - `src/components/digitalplanning/WorkstationHub.jsx`
        - `src/components/printer/PrintQueueAdminView.jsx`
        - `src/components/admin/PrintQueueAdminView.jsx`

**Status bij afsluiten sessie:**
- Bestandsfoutcontrole op gewijzigde bestanden: geen errors.
- Nog niet gedaan in deze sessie: functions deploy / end-to-end runtime test in productie-omgeving.

**Startpunt voor volgende sessie:**
1. Functions deployen zodat nieuwe callables actief zijn.
2. End-to-end testen van WorkstationHub reminder/overproductie messaging en print queue flows.
3. Eventueel volgende migratiestap: queue-aanmaakpad (`printService`) ook via backend-command centraliseren.

## Update sessie 90 (Stap 1 shopfloor/personnel occupancy naar backend-commands)

**Datum:** 13 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Eerste batch van de resterende directe shopfloor/personnel writes verwijderen, met focus op occupancy- en personeelsmutaties in de operationele hubs.

**Wat is afgerond in deze batch:**
- Nieuwe backend callables toegevoegd:
    - `saveOccupancyAssignments`
    - `deleteOccupancyAssignments`
    - `savePersonnelRecord`
- Nieuwe service-logica toegevoegd in `planningTransitionService` voor:
    - server-side sanitizing en batch-save van occupancy records;
    - server-side batch-delete van occupancy assignments;
    - server-side create/update van personeelsrecords.
- Frontend wrappers toegevoegd in `planningSecurityService`:
    - `saveOccupancyAssignments(...)`
    - `saveOccupancyAssignment(...)`
    - `deleteOccupancyAssignments(...)`
    - `deleteOccupancyAssignment(...)`
    - `savePersonnelRecord(...)`
- UI rewiring afgerond in drie kernschermen:
    - `TeamleaderHub.jsx`:
        - kopieer gisterbezetting via backend-command;
        - wis dagbezetting via backend-command.
    - `WorkstationHub.jsx`:
        - auto-checkout en afsluiten vorige occupancy records;
        - nieuwe primary/secondary occupancy records;
        - personnel currentMachine/badge-scan updates.
    - `PersonnelOccupancyView.jsx`:
        - save/update personeelskaart;
        - add/update/delete occupancy regels;
        - handmatige uren- en closed-hours correcties.

**Validatie:**
- `get_errors` op gewijzigde backend- en frontendbestanden: geen fouten.
- Focused scan bevestigt dat in deze drie views de eerder geprioriteerde occupancy/personnel writes niet langer direct via `setDoc/updateDoc/deleteDoc/writeBatch` lopen.

**Resultaat:**
- Stap 1 van de shopfloor/personnel migratie is afgerond.
- Occupancy- en personeelsmutaties in de gekozen prioriteitsviews lopen nu via backend-commands in plaats van directe client writes.

**Openstaand / eerstvolgende stap:**
1. Stap 2 oppakken: resterende message writes in `WorkstationHub.jsx` naar backend-command migreren.
2. Print queue beheerflows (`PrintQueueAdminView.jsx` en admin-variant) omzetten naar backend-commands voor statuswissels, requeue en delete.

## Update sessie 89 (Firestore rules hardening na callable-migraties)

**Datum:** 12 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Security boundary aanscherpen nu extra planning/tracking flows via callables lopen.

**Wat is afgerond in deze batch:**
- `firestore.rules` verder aangescherpt:
    - Directe client updates van `qcNotes` geblokkeerd op:
        - `production/tracked_products/*`
        - `production/archive/{year}/{collection}/{doc}`
    - Directe client writes op `production/counters/*` volledig geblokkeerd (`allow write: if false`).
    - Generieke fallbackregel voor `production/{collectionId}` aangepast zodat `archive` en `counters` daar niet langer impliciet client-writable zijn.

**Validatie & deploy:**
- Rules compileren succesvol.
- Deploy uitgevoerd: `firebase deploy --only firestore:rules` succesvol.

**Resultaat:**
- Counter-reservatie/claim kan nu alleen via backend-callables.
- QC-note mutaties lopen nu rule-technisch ook via backend in plaats van directe client updates.

**Openstaand / eerstvolgende stap:**
1. Resterende niet-kritieke directe writes (o.a. occupancy/messages) classificeren: backend vereist of bewust client-side.
2. Daarna laatste frontend lint/runtime regressies in gemigreerde views opruimen en opnieuw commit/pushen.

## Update sessie 88 (BM01 QC-notes + ProductionStartModal lot-counter writes naar callables)

**Datum:** 12 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- De volgende resterende directe client writes uit planning/tracking flow verwijderen:
    - BM01 QC-note append.
    - ProductionStartModal lot counter reserve/claim pad.

**Wat is afgerond in deze batch:**
- Nieuwe backend callables toegevoegd:
    - `appendQcNote`
    - `reserveAutoLotNumberRange`
- Nieuwe service-logica toegevoegd in `planningTransitionService`:
    - `appendQcNoteService(...)`:
        - append van `qcNotes` in tracking of archive-items (met optionele `archivedYear` hint).
    - `reserveAutoLotNumberRangeService(...)`:
        - server-side bepaling + (optionele) reservatie van uniek auto-lot bereik in counters,
        - inclusief recycled-sequence handling en wekelijkse cleanup van oude counter docs.
- Frontend wrappers toegevoegd in `planningSecurityService`:
    - `appendQcNote(...)`
    - `reserveAutoLotNumberRange(...)`
- UI rewiring:
    - `BM01Hub.jsx`: QC note flow gebruikt nu `appendQcNote(...)` i.p.v. directe `updateDoc/arrayUnion`.
    - `ProductionStartModal.jsx`:
        - client-side counter transacties/writes verwijderd;
        - auto lot-preview gebruikt nu backend call met `reserve: false`;
        - daadwerkelijke start claimt lot-range via backend met `reserve: true`.

**Validatie:**
- `get_errors` op gewijzigde frontend/backendbestanden: geen fouten.
- Frontend productiebuild uitgevoerd: succesvol (`npm run build`, alleen bestaande chunk-size waarschuwingen).
- Backend syntaxcheck uitgevoerd op gewijzigde functions-bestanden (`node --check`): geen fouten.

**Resultaat:**
- BM01 QC-notes schrijven niet meer direct vanuit de client.
- ProductionStartModal schrijft geen counter-documenten meer rechtstreeks vanuit de client; claim/reservatie loopt via callable.

**Openstaand / eerstvolgende stap:**
1. Nieuwe callables deployen zodat frontend wrappers productiepad gebruiken.
2. Daarna Firestore rules verder aanscherpen rond `production/counters` en `qcNotes` writes.

## Update sessie 87 (Vier resterende planning/tracking hotspots naar callables)

**Datum:** 12 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- De eerstvolgende resterende directe client writes uit de hotspotscan migreren naar backend callables.

**Wat is afgerond in deze batch:**
- Nieuwe backend callables toegevoegd:
    - `editTrackedProductLotNumber`
    - `linkPlanningOrderProduct`
    - `createPlanningOrderManual`
    - `markMazakLabelsPrinted`
- Server-side service-logica toegevoegd in `planningTransitionService` voor:
    - lotnummerwijziging met reden + history-entry;
    - koppelen van product aan planningorder;
    - handmatig aanmaken van planningorder met duplicate-check op `orderId`;
    - Mazak label-status/history updates voor meerdere lots.
- Frontend wrappers toegevoegd in `planningSecurityService` en gekoppeld in UI:
    - `OrderDetail.jsx`: lotnummerwijziging via `editTrackedProductLotNumber(...)`;
    - `WorkstationHub.jsx`: order-product koppeling via `linkPlanningOrderProduct(...)`;
    - `TeamleaderHub.jsx`: handmatig order aanmaken via `createPlanningOrderManual(...)`;
    - `MazakView.jsx`: label metadata updates via `markMazakLabelsPrinted(...)`.
- Kleine stabiliteitsfix meegenomen in `OrderDetail.jsx`:
    - ontbrekende `copyToClipboard` helper en `parsedPlanDraft` variabele hersteld.

**Validatie:**
- `get_errors` op alle gewijzigde backend- en frontendbestanden: geen fouten.
- Frontend productiebuild uitgevoerd: succesvol (`npm run build`, alleen bestaande chunk-size waarschuwingen).

**Resultaat:**
- De vier geprioriteerde hotspots uit de scan zijn nu backend-afgedwongen.
- Directe writes voor deze flows lopen niet langer via `updateDoc/addDoc` in de genoemde componenten.

**Openstaand / eerstvolgende stap:**
1. Volgende batch hotspots oppakken: bijv. `BM01Hub` QC notes en lotcounter-updates in `ProductionStartModal`.
2. Daarna rules verder aanscherpen voor de nieuw gemigreerde mutatievelden.

## Update sessie 86 (WorkstationHub string-run start naar backend callable)

**Datum:** 12 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- De resterende directe tracking/planning writes in de WorkstationHub startproductie-flow server-side afdwingen.

**Wat is afgerond in deze batch:**
- Nieuwe backend callable toegevoegd: `startWorkstationProductionRun`.
- Server-side service-logica toegevoegd voor string-run start met:
    - lotgeneratie op basis van startlot + aantal;
    - overproduction-detectie (`NOG_TE_BEPALEN`) met `isOverproduction` metadata;
    - tracking-doc updates inclusief label-ZPL/template/audit, personnel tracking en series metadata;
    - planning order update van `started_*` teller en status (`in_progress`) in dezelfde backend flow.
- Frontend gekoppeld via `planningSecurityService`:
    - `WorkstationHub.jsx` gebruikt nu `startWorkstationProductionRun(...)` in plaats van directe `setDoc(...)` op tracking en directe planning `updateDoc(...)`.
- Bestaande overflow notificatie/melding in de UI blijft behouden, maar gebruikt nu backend-resultaat (`overflowLots`).

**Validatie:**
- `get_errors` op gewijzigde backend- en frontendbestanden: geen fouten.
- Frontend productiebuild uitgevoerd: succesvol (`npm run build`, alleen bestaande chunk-size waarschuwingen).

**Resultaat:**
- De grootste resterende directe writecluster in `handleStartProduction` is nu server-side gemigreerd.
- WorkstationHub productie-start volgt nu hetzelfde callable/service patroon als de eerdere transitie-, repair-, pause- en reminderflows.

**Openstaand / eerstvolgende stap:**
1. Firestore rules verder aanscherpen voor deze nu gemigreerde startflow (tracking/planning velden die hiervoor nog client-writable zijn).
2. Nog één keer repo-breed scannen op resterende directe kritieke tracking/planning writes en die laatste restpunten migreren.

## Update sessie 85 (WorkstationHub pause/resume + reminder metadata via backend)

**Datum:** 12 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- De volgende niet-routing WorkstationHub trackingupdates centraliseren: pauzeren/hervatten en reminder-flag updates.

**Wat is afgerond in deze batch:**
- Nieuwe backend callables toegevoegd:
    - `toggleTrackedProductPause`
    - `markTrackedProductReminder`
- Server-side service-logica toegevoegd voor:
    - pause/resume statuswissel (`PAUSED` <-> `In Production`) met history + activity logging;
    - reminder metadata (`reminderSent`, `reminderSentAt`) met centrale history-entry.
- Frontend gekoppeld via `planningSecurityService`:
    - `WorkstationHub.jsx` gebruikt nu `toggleTrackedProductPause(...)` i.p.v. directe status `updateDoc`;
    - `WorkstationHub.jsx` gebruikt nu `markTrackedProductReminder(...)` i.p.v. directe reminder metadata `updateDoc`.

**Validatie:**
- `get_errors` op gewijzigde backend- en frontendbestanden: geen fouten.
- Frontend productiebuild uitgevoerd: succesvol (`npm run build`, alleen bestaande chunk-size waarschuwingen).

**Resultaat:**
- Nog een deel van de losse WorkstationHub trackingmutaties is nu server-side afgedwongen.
- De combinatie van routing/transities/temp-reject/repair/pause/reminder draait nu grotendeels via callables.

**Openstaand / eerstvolgende stap:**
1. Overige directe tracking-mutaties in WorkstationHub inventariseren die nog niet in bovenstaande clusters vallen (bijv. specifieke flags/history updates buiten de kerntransities).
2. Daarna Firestore rules verder versmallen voor deze inmiddels gemigreerde velden.

## Update sessie 84 (WorkstationHub routing naar Lossen + manual resume via backend)

**Datum:** 12 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- De resterende directe WorkstationHub routingwrites verder reduceren, specifiek:
    - hervatten na handmatige verplaatsing;
    - bulk-routing van producten naar Lossen.

**Wat is afgerond in deze batch:**
- Nieuwe backend callable toegevoegd: `routeTrackedProductsToLossen`.
- Backend service toegevoegd voor bulk-routing naar Lossen met:
    - server-side routebepaling centraal/lokaal op basis van item/origin;
    - update van `currentStation`, `currentStep`, `status`, `timestamps.lossen_start`;
    - optionele `personnelTracking.LOSSEN` toewijzing.
- `WorkstationHub.jsx` aangepast:
    - bulk-routing naar Lossen loopt nu via `routeTrackedProductsToLossen(...)`;
    - hervatten van een item met `isManualMove` loopt nu via bestaande `advanceTrackedProduct(...)` in plaats van directe `updateDoc(...)`.
- Kleine backendfix meegenomen:
    - `planningTransitionService.js` importeert nu expliciet `clampText`, wat al in de service werd gebruikt.

**Validatie:**
- `get_errors` op gewijzigde backend- en frontendbestanden: geen fouten.
- Frontend productiebuild uitgevoerd: succesvol (`npm run build`, alleen bestaande chunk-size waarschuwingen).

**Resultaat:**
- De resterende WorkstationHub routingpaden voor Lossen en manual resume lopen nu server-side.
- In WorkstationHub blijven nog wel enkele directe trackingupdates over, maar dat zijn geen routingtransities uit deze cluster (bijv. pause/resume en bepaalde losse metadata-updates).

**Openstaand / eerstvolgende stap:**
1. De resterende directe trackingupdates in WorkstationHub groeperen per intentie, bijvoorbeeld pause/resume of losse metadata/history mutaties.
2. Daarna pas generieke tracking-rules verder versmallen, omdat routingtransities nu grotendeels server-side zitten maar niet alle niet-routing updates al zijn gemigreerd.

## Update sessie 83 (Approved forwarding + repair complete verder naar backend callables)

**Datum:** 12 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Verdergaan op de resterende directe trackingtransities door approved/forwarding paden en reparatie-afronding verder server-side te centraliseren.

**Wat is afgerond in deze batch:**
- Nieuwe backend callables toegevoegd:
    - `advanceTrackedProduct`
    - `completeTrackedProductRepair`
- Server-side service-logica toegevoegd voor:
    - generieke trackingtransitie met centrale update van `currentStation`, `currentStep`, `status`, history, timestamps, notities en optionele measurements;
    - reparatie-afronding terug naar BM01/Eindinspectie inclusief `repairActive`, repair timestamps en history.
- Frontend gekoppeld via `planningSecurityService` in deze paden:
    - `ProductReleaseModal.jsx` approved/forwarding route loopt nu via `advanceTrackedProduct(...)`;
    - `LossenView.jsx` basic completed route loopt nu via `advanceTrackedProduct(...)`;
    - `WorkstationHub.jsx` reparatie-afronding loopt nu via `completeTrackedProductRepair(...)`;
    - `Terminal.jsx` reparatie-afronding loopt nu via `completeTrackedProductRepair(...)`.
- Firestore rules gericht aangescherpt voor directe client-side repair-complete mutaties naar `BM01` / `Eindinspectie` / `Te Keuren`.

**Validatie:**
- `get_errors` op gewijzigde backend-, frontend- en rules-bestanden: geen fouten.
- Frontend productiebuild uitgevoerd: succesvol (`npm run build`, alleen bestaande chunk-size waarschuwingen).

**Resultaat:**
- Een extra deel van de trackingtransitie-logica loopt nu via backend callables in plaats van losse client `updateDoc(...)` paden.
- Reparatie-afronding is nu ook rule-technisch verder afgedekt.

**Openstaand / eerstvolgende stap:**
1. De resterende directe transitieroutes inventariseren die nog tracking `currentStation/currentStep/status` aanpassen, met name bulk/route-specifieke WorkstationHub-paden naar Lossen of volgende stations.
2. Daarna pas bredere rules voor generieke trackingtransities verder versmallen, zodra die laatste clientflows ook zijn gemigreerd.

## Update sessie 82 (Tijdelijke afkeur/HOLD_AREA naar backend callable getrokken)

**Datum:** 12 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Volgende kritieke tracking-statuscluster server-side afdwingen: tijdelijke afkeur (`HOLD_AREA` / `Tijdelijke afkeur`) die nog in meerdere schermen direct vanuit de client werd geschreven.

**Wat is afgerond in deze batch:**
- Nieuwe backend callable toegevoegd: `tempRejectTrackedProduct`.
- Server-side service toegevoegd voor tijdelijke afkeur op tracked products met:
    - centrale validatie van product + redenen;
    - consistente update van `inspection`, `status`, `currentStep`, `processedBy`, history en optioneel `previousStep/previousStatus`;
    - centrale activity-log registratie.
- Frontend gekoppeld via `planningSecurityService` in meerdere schermen:
    - `BM01Hub.jsx`
    - `LossenView.jsx`
    - `MazakView.jsx`
    - `WorkstationHub.jsx`
    - `ProductReleaseModal.jsx`
- In `ProductReleaseModal` loopt de `temp_reject` tak nu ook via callable in plaats van directe tracking-update per geselecteerd lot.
- Firestore rules aangescherpt:
    - directe client updates naar `HOLD_AREA` / `Tijdelijke afkeur` / `inspection.status == Tijdelijke afkeur` op tracked products worden nu geblokkeerd.

**Validatie:**
- `get_errors` op gewijzigde backend-, frontend- en rules-bestanden: geen fouten.
- Frontend productiebuild uitgevoerd: succesvol (`npm run build`, alleen bestaande chunk-size waarschuwingen).

**Resultaat:**
- Tijdelijke afkeur is nu een server-side afgedwongen vertical slice in plaats van losse client-mutaties verspreid over meerdere views.
- Rules sluiten het oude writepad nu ook echt af, in lijn met het Cloud Functions-by-default beleid.

**Openstaand / eerstvolgende stap:**
1. Resterende directe tracking status-overgangen inventariseren, vooral de approved/forwarding paden die nog `currentStation/currentStep/status` rechtstreeks aanpassen.
2. Daarna dezelfde aanpak toepassen op de volgende post-processing cluster, zodat trackingtransities stapsgewijs volledig server-side afdwingbaar worden.

## Update sessie 81 (Teamleader overproduction-linkflow naar backend callable)

**Datum:** 12 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Stap 1 vervolgen door een resterende Teamleader-planningflow met directe `machine`/`status` writes server-side te trekken.

**Wat is afgerond in deze batch:**
- Nieuwe backend callable toegevoegd: `assignOverproduction`.
- Server-side service toegevoegd voor overproduction-linking vanuit Teamleader:
    - tracked products opnieuw koppelen aan doelorder;
    - route/station server-side bepalen naar status/stap-mutatie;
    - doelorder updaten met `machine`, `status` en overproduction-metadata;
    - originele order `started_*` teller verlagen waar van toepassing;
    - systeemmelding en activity-log server-side registreren.
- Frontend gekoppeld via `planningSecurityService`:
    - `TeamleaderHub.jsx` gebruikt nu `assignOverproduction(...)` in plaats van een directe Firestore batch op tracking + planning.
- Kleine cleanup uitgevoerd:
    - ongebruikte `getStepForStation` import uit `TeamleaderHub.jsx` verwijderd.

**Validatie:**
- `get_errors` op gewijzigde backend- en frontendbestanden: geen fouten.
- Frontend productiebuild uitgevoerd: succesvol (`npm run build`, alleen bestaande chunk-size waarschuwingen).

**Resultaat:**
- Een extra Teamleader-flow met directe `machine`/`status` planningwrites is nu via backend-callable afgedwongen.
- De overproduction-koppeling volgt nu hetzelfde patroon als de eerdere planningmigraties: frontend service -> callable -> service/repositorylaag.

**Openstaand / eerstvolgende stap:**
1. Volgende resterende Teamleader/planning cluster kiezen waar nog directe status/machine-updates bestaan.
2. Daarna pas rules verder aanscherpen voor bredere planning/status-writes, zodat nog open clientflows niet per ongeluk breken.

## Update sessie 80 (Order-admin flows naar callables + priority-regressie hersteld)

**Datum:** 12 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Verdere backend/frontend migratie voor planningorders zelf, zodat order-admin acties niet meer primair via directe client-updates lopen.

**Wat is afgerond in deze batch:**
- Nieuwe backend callables toegevoegd voor planningorder-acties:
    - `movePlanningOrder`
    - `retrievePlanningOrder`
    - `togglePlanningOrderHold`
    - `updatePlanningOrderDetails`
- Bijbehorende service-logica toegevoegd in `functions/src/services/planningTransitionService.js`.
- `OrderDetail.jsx` gemigreerd van directe Firestore-updates naar `planningSecurityService` wrappers voor:
    - order verplaatsen / aanbieden;
    - order terughalen;
    - on-hold hervatten/toggelen;
    - ordernotitie en plan-aantal opslaan.
- Priority-regressie uit de vorige migratie opgelost:
    - backend/frontend accepteren nu weer `high`, `urgent`, `immediate` en `false`;
    - bestaande priority-knoppen in `OrderDetail`, `TeamleaderOrderDetailModal` en `ProductDossierModal` blijven daardoor functioneel.
- Firestore rules gericht aangescherpt voor planningvelden die nu via callables lopen:
    - prioriteit;
    - annuleringmetadata;
    - delegation/retrieve velden;
    - hold-gerelateerde `previousStatus` / `status == on_hold`;
    - ordernotitie (`notes`, `poText`) en `plan`.

**Validatie:**
- `get_errors` op gewijzigde backend-, frontend- en rules-bestanden: geen fouten.
- Frontend productiebuild uitgevoerd: succesvol (`npm run build`, alleen bestaande chunk-size waarschuwingen).

**Resultaat:**
- Een extra planningcluster is nu end-to-end via backend callables afgedwongen.
- De recente priority-API mismatch is opgelost, waardoor de UI niet meer stukloopt op `urgent` of `immediate`.
- Rules blokkeren nu een deel van de oude client-writepaden voor order-admin velden die naar de backend zijn verhuisd.

**Openstaand / eerstvolgende stap:**
1. Resterende brede order/status-mutaties inventariseren die nog direct vanuit client lopen, met name paden waar `machine` en `status` nog rechtstreeks worden aangepast.
2. Overproduction- en overige Teamleader-planningflows naar dezelfde callable-architectuur trekken voordat die rule-technisch verder worden dichtgezet.
3. Daarna de planning-rules verder versmallen voor machine/status-updates zonder de nog open clientflows te breken.

## Update sessie 79 (Nieuwe planning writeflows verder naar backend callables getrokken)

**Datum:** 12 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Verdergaan op het Cloud Functions-by-default beleid door extra planningmutaties uit de client te halen en server-side te centraliseren.

**Wat is afgerond in deze batch:**
- Backend callable-laag uitgebreid met nieuwe planningflows:
    - `cancelTrackedProduction`
    - `updatePlanningOrderPriority`
    - `cancelPlanningOrder`
    - `assignPersonnelToStation`
    - `removePersonnelAssignment`
    - `loanPersonnelToDepartment`
    - `startProductionLots`
- `functions/index.js` en `functions/src/callables/planningCallables.js` zijn omgezet naar `firebase-functions/v1` voor consistente callable-registratie in deze refactorlijn.
- Domeinlogica toegevoegd in `functions/src/services/planningTransitionService.js` voor:
    - productie-annulering inclusief teller-correctie, recycle pool update en pending print-queue cleanup;
    - order-prioriteit server-side inclusief history-update;
    - order-annulering met centrale status/cancellation metadata;
    - personeelsbezetting (toewijzen, verwijderen, uitlenen) inclusief activity logging;
    - productie-start van meerdere lots inclusief tracking-docs en planningstatus-update.
- Frontend gekoppeld aan centrale service `src/services/planningSecurityService.js` in plaats van directe kritieke writes vanuit UI-componenten.
- Directe Firestore-mutaties verwijderd of teruggebracht in o.a.:
    - `OrderDetail.jsx`
    - `TeamleaderOrderDetailModal.jsx`
    - `ProductDossierModal.jsx`
    - `Terminal.jsx`
    - `WorkstationHub.jsx`
    - `StationAssignmentModal.jsx`
    - `LoanPersonnelModal.jsx`

**Validatie:**
- `get_errors` op alle gewijzigde backend- en frontendbestanden: geen fouten.
- Frontend productiebuild uitgevoerd: succesvol (`npm run build`, alleen bestaande chunk-size waarschuwingen).

**Resultaat:**
- Extra kritieke planning-writeflows lopen nu via backend-validatie in plaats van losse client-side Firestore-writes.
- De refactor breidt de layered architecture concreet uit voorbij de eerste planning-slice uit sessie 76.
- Productiestart, annuleringen, prioriteitswissels en personeelsbezetting zijn nu consistenter te auditen en server-side af te dwingen.

**Openstaand / eerstvolgende stap:**
1. Firestore rules verder aanscherpen zodat de oude client-writepaden ook rule-technisch dichtgezet worden waar deze migraties nu server-side bestaan.
2. Overgebleven planning/statusflows inventariseren die nog directe writes gebruiken en deze in dezelfde callable/service/repository-structuur trekken.
3. Optioneel: aanvullende regressiechecks voor `functions/` toevoegen zodat deze nieuwe callables sneller te valideren zijn dan alleen via frontend build + diagnostics.

## Update sessie 78 (Opslaan voor morgen: uitvoerplan A/B/C bevestigd)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Bevestigde werkwijze (blijft leidend):**
- Nieuwe en bestaande kritieke mutaties/features worden standaard via Cloud Functions gebouwd.
- Frontend roept callables aan; backend valideert rollen/transities; repositorylaag blijft database-toegangspunt.

**Opgeslagen voor volgende sessie (morgen):**
1. **A - Wiring importflow:**
    - `PlanningImportModal.jsx` migreren van directe `writeBatch(db)` writes naar backend callable (`importPlanning` pad).
    - Frontend importstart wordt een callable-aanroep met duidelijke payload-validatie.
2. **B - UI error handling:**
    - Cloud Function fouten (bijv. rechten/validatie) zichtbaar maken in de import-logconsole/sidebar.
    - `importing` state uitbreiden met expliciete API-foutstatus en duidelijke melding voor operator/planner.
3. **C - Concurrency/transacties:**
    - Firestore transacties toepassen in repository-paden waar uren/counters tegelijk aangepast kunnen worden.
    - Doel: race conditions voorkomen bij gelijktijdige boekingen.

**Status bij afsluiten:**
- Functions runtime/deploy pad is werkend en geüpdatet (Node.js 22).
- Cloud Functions deploy is succesvol uitgevoerd.
- Runtime/deploy fix is apart gecommit en gepusht.
- Verdere migratieclusters staan lokaal als vervolgstap en worden in volgende sessie gefaseerd afgerond.

## Update sessie 77 (Cloud Functions-by-default beleid bevestigd)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Besluit (expliciet vastgelegd):**
- Vanaf nu wordt **alle nieuwe mutatielogica** in zowel frontend als backend via **Cloud Functions** opgezet.
- Dit geldt ook voor **nieuwe features/functies**: geen directe kritieke client writes meer als primaire implementatie.
- Patroon is voortaan standaard:
    1. Frontend wrapper/service (`httpsCallable`) in `src/services/...`.
    2. Backend callable entrypoint in `functions/src/callables/...`.
    3. Domeinlogica in `functions/src/services/...` (+ repository/auth/config waar nodig).
    4. Frontend UI gebruikt de service, niet direct destructieve writes voor kritieke flows.

**Wat in deze iteratie aanvullend is geborgd:**
- Firebase Functions deploymentpad opnieuw werkend gemaakt en uitgevoerd.
- Runtime/deploy fix separaat gecommit en gepusht (`fc85f17`).
- Functions draaien nu op Node.js 22 runtime.

**Actuele richting voor vervolg:**
1. Resterende write-clusters (o.a. Terminal, StationAssignment/LoanPersonnel, ProductionStart counters) gefaseerd migreren naar hetzelfde callable-patroon.
2. Bij elke nieuwe functie eerst backend callable/service definiëren, daarna frontend integreren.
3. Firestore rules blijven ondersteunend, maar kritieke business-transities worden server-side afgedwongen.

## Update sessie 76 (Start architectuurrefactor: backend lagen + planning vertical slice)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Start maken met echte layered architecture in Cloud Functions, zonder gedrag van bestaande planning-callables te breken.

**Wat is afgerond in deze batch:**
- Nieuwe modulaire backend-structuur opgezet onder `functions/src/`:
    - `config/` voor gedeelde Firebase/planning-constants;
    - `utils/` voor text helpers;
    - `auth/` voor rol-resolutie;
    - `repositories/` voor Firestore read lookups;
    - `services/` voor domeinlogica/transities;
    - `callables/` voor API-ingang + inputvalidatie + error-mapping.
- Eerste vertical slice gemigreerd naar lagen:
    - `rejectTrackedProductFinal`
    - `moveTrackedProductManual`
    - `archivePlanningOrder`
- `functions/index.js` opgeschoond:
    - bovenstaande 3 callables worden nu geëxporteerd vanuit `src/callables/planningCallables`;
    - duplicaat helper/role-code voor deze flows verwijderd uit monolithische index.

**Aangepaste bestanden (kern):**
- `functions/index.js`
- `functions/src/config/firebase.js`
- `functions/src/config/planningConstants.js`
- `functions/src/utils/text.js`
- `functions/src/auth/resolveUserRole.js`
- `functions/src/repositories/planningRepository.js`
- `functions/src/services/planningTransitionService.js`
- `functions/src/callables/planningCallables.js`

**Validatie:**
- `get_errors` op alle gewijzigde functions-bestanden: geen fouten.
- Frontend productiebuild uitgevoerd: succesvol (`npm run build`, alleen bestaande chunk-size waarschuwingen).
- Extra directe `node` load-check op `functions/index.js` faalde omdat `firebase-functions` lokaal niet geïnstalleerd is in deze container op dat moment.

**Resultaat:**
- Architectuurskelet staat en is in gebruik voor een eerste domein (planning mutaties).
- Gedrag blijft functioneel gelijk, maar verantwoordelijkheden zijn nu gescheiden (controller/callable -> service -> repository).

**Openstaand / eerstvolgende stap:**
1. Zelfde patroon uitrollen naar volgende kritieke writeflows (bijv. reject/finish paden in Lossen/Workstation/BM01/Mazak).
2. Monolithische `functions/index.js` verder afbouwen naar alleen triggerregistratie/exports.
3. Optioneel: lint/test scripts toevoegen in `functions/package.json` voor snellere backend-regressiechecks.

## Update sessie 75 (Flow 3 uitgevoerd: legacy planning-archivering server-side)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Derde kritieke writeflow uit sessie 72 server-side afdwingen: legacy/handmatige archivering van planningorders.

**Wat is afgerond in deze batch:**
- Nieuwe callable toegevoegd: `archivePlanningOrder` in `functions/index.js`.
- Server-side validatie toegevoegd op:
    - ingelogde gebruiker;
    - rol-allowlist voor planning-archivering;
    - verplichte payload (`orderDocId`) en reason-allowlist (`rejected/completed/manual`).
- Callable voert nu centraal uit:
    - order lookup op primair en legacy planningpad;
    - atomische move naar `production/archive/{year}/planning` met metadata;
    - delete van actieve planningorder.
- Frontend archiveringspad gemigreerd:
    - `src/utils/archiveService.jsx` gebruikt nu `archivePlanningOrder` callable i.p.v. client-side batch writes;
    - `TeamleaderHub` legacy afkeur-archivering blijft functioneel identiek maar loopt via serverflow.
- Overbodige `appId` afhankelijkheid verwijderd uit `archiveService` signatuur.

**Aangepaste bestanden (kern):**
- `functions/index.js`
- `src/utils/archiveService.jsx`
- `src/components/digitalplanning/TeamleaderHub.jsx`

**Validatie:**
- `get_errors` op alle gewijzigde bestanden: geen fouten.
- Productiebuild uitgevoerd: succesvol (`npm run build`, alleen chunk-size waarschuwingen).

**Resultaat t.o.v. sessie 72 scope:**
- Flow 1 afgerond: definitieve afkeur server-side.
- Flow 2 afgerond: handmatige lotverplaatsing server-side.
- Flow 3 afgerond: legacy planning-archivering server-side.

**Openstaand / eerstvolgende stap:**
1. Firestore rules verder versmallen met gerichte field-level allowlists op resterende high-risk writes.
2. Overige losse client mutatiepaden in digital planning stapsgewijs naar callables migreren.

## Update sessie 74 (Flow 2 uitgevoerd: handmatige lotverplaatsing server-side)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Tweede kritieke writeflow uit sessie 72 server-side afdwingen: handmatige lotverplaatsing vanuit Teamleader/Workstation.

**Wat is afgerond in deze batch:**
- Nieuwe callable toegevoegd: `moveTrackedProductManual` in `functions/index.js`.
- Server-side validatie toegevoegd op:
    - ingelogde gebruiker;
    - rol-allowlist voor handmatige verplaatsing;
    - verplichte payload (`productOrLotId`, `newStation`);
    - veilige limieten op invoer (`repairInstruction`, labels/source).
- Callable voert nu centraal uit:
    - resolve van tracking item op document-id of `lotNumber`;
    - server-side stap/status bepaling op basis van doelstation;
    - update van `currentStation/currentStep/status/isManualMove`;
    - reparatievelden (`repairActive`, `repairCategory`, `repairInstruction`, `timestamps.repair_start`) bij reparatieflow;
    - centrale history-entry op tracked product.
- Frontend gekoppeld aan centrale service:
    - `src/services/planningSecurityService.js` uitgebreid met `moveTrackedProductManual(...)`;
    - `TeamleaderHub` `handleMoveLot(...)` omgezet naar callable;
    - `WorkstationHub` `handleMoveLot(...)` omgezet naar callable.
- `ProductDossierModal` opgeschoond:
    - directe history-write op tracked product verwijderd (wordt nu server-side gedaan).
- Firestore rules aangescherpt:
    - directe client-side handmatige move-mutaties op tracked products geblokkeerd wanneer `isManualMove` + status/station/step/reparatievelden worden gewijzigd.

**Aangepaste bestanden (kern):**
- `functions/index.js`
- `src/services/planningSecurityService.js`
- `src/components/digitalplanning/TeamleaderHub.jsx`
- `src/components/digitalplanning/WorkstationHub.jsx`
- `src/components/digitalplanning/modals/ProductDossierModal.jsx`
- `firestore.rules`

**Validatie:**
- `get_errors` op alle gewijzigde bestanden: geen fouten.
- Productiebuild uitgevoerd: succesvol (`npm run build`, alleen chunk-size waarschuwingen).

**Openstaand / eerstvolgende stap:**
1. Flow 3 oppakken: legacy handmatige archiveringsacties naar backend-callables.
2. Daarna field-level allowlists verder versmallen voor resterende high-risk writepaden.

## Update sessie 73 (Flow 1 uitgevoerd: definitieve afkeur via backend callable)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Eerste kritieke writeflow uit sessie 72 server-side afdwingen: definitieve afkeur van tracked products.

**Wat is afgerond in deze batch:**
- Nieuwe callable toegevoegd: `rejectTrackedProductFinal` in `functions/index.js`.
- Server-side validatie toegevoegd op:
    - ingelogde gebruiker;
    - rol-allowlist voor afkeuracties;
    - verplichte payload (`productId`, minimaal 1 reden);
    - veilige limieten op tekstvelden.
- Callable voert nu centraal uit:
    - archive naar `production/archive/{year}/rejected`;
    - delete uit `production/tracked_products`;
    - update van gekoppelde order (`rejectedCount`, `started_*` rollback, status terug naar `planned` indien nodig).
- Frontend gekoppeld aan centrale service:
    - nieuwe service `src/services/planningSecurityService.js`;
    - `ProductReleaseModal` definitieve afkeur omgezet naar callable;
    - `ProductDossierModal` definitieve afkeur omgezet naar callable.
- Firestore rules aangescherpt:
    - directe client-update naar definitieve afkeurstatus op tracked products geblokkeerd (`REJECTED` / `AFKEUR` / `Rejected`).

**Aangepaste bestanden (kern):**
- `functions/index.js`
- `src/services/planningSecurityService.js`
- `src/components/digitalplanning/modals/ProductReleaseModal.jsx`
- `src/components/digitalplanning/modals/ProductDossierModal.jsx`
- `firestore.rules`

**Validatie:**
- `get_errors` op alle gewijzigde bestanden: geen fouten.
- Productiebuild uitgevoerd: succesvol (`npm run build`, alleen chunk-size waarschuwingen).

**Openstaand / eerstvolgende stap:**
1. Flow 2 oppakken: kritieke workstation/teamleader statusmutaties naar backend-callables.
2. Flow 3 oppakken: legacy handmatige archivering server-side trekken.
3. Daarna rules verder versmallen met field allowlists per kritieke collection.

## Update sessie 72 (Hervat: server-side write hardening op kritieke flows)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Verdergaan op de openstaande security-acties uit sessie 71: minder client-trust op kritieke mutaties en strengere server-side validatie.

**Startpunt uit vorige sessie:**
- AI en print hardening zijn afgerond.
- Volgende prioriteit is het migreren van hoog-risico writeflows naar backend-callables/functions met expliciete schema- en role-checks.

**Scope voor deze vervolgiteratie (top-3 writeflows):**
1. Definitieve afkeur en status-overgangen in planningflow.
2. Kritieke mutaties op order/product statusvelden vanuit workstation/teamleader acties.
3. Legacy/handmatige archiveringsacties met impact op actieve planning.

**Aanpak (uitvoering):**
1. Inventariseren waar write-acties nu nog direct vanaf client naar Firestore gaan.
2. Per flow beslissen: volledig naar callable of tijdelijk afschermen met extra rules + strict field allowlist.
3. Server-side validatie toevoegen:
    - verplichte velden en typechecks;
    - toegestane status-transities;
    - role-check op basis van custom claims/user role.
4. Firestore rules aanscherpen zodat client-only writes op deze paden niet meer mogelijk zijn zonder de juiste serverflow.

**Acceptatiecriteria:**
- Kritieke statusmutaties kunnen niet meer via losse client-write worden geforceerd.
- Elke top-3 flow heeft expliciete validatie op payload + transitie + rol.
- Build en diagnostics draaien zonder nieuwe fouten.

**Openstaand / eerstvolgende stap:**
1. Top-3 writeflows concreet mappen naar bestanden/collections.
2. Eerste flow volledig server-side trekken en end-to-end valideren.
3. Daarna flow 2 en 3 in dezelfde stijl uitrollen.

## Update sessie 71 (Security hardening: resterende kritieke punten afgerond)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Resterende kritieke securitypunten afronden uit de audit: AI key exposure, zwakke validatie, prompt-injection risico, print abuse, en foutafhandeling.

**Wat is afgerond in deze batch:**
- Frontend AI-calls opgeschoond zodat direct Gemini-gebruik en browser-side key usage zijn verwijderd op de bekende paden.
- AI-verkeer geconsolideerd via backend proxy (`aiService.chat(...)` pad), met strengere payloadvalidatie.
- Backend AI proxy gehard met:
    - berichtnormalisatie en limieten (aantal/omvang);
    - model-allowlist;
    - prompt-injection patroonchecks;
    - beschermde system prompt opbouw;
    - strengere safety thresholds.
- Printflow gehard met inputvalidatie op client + strengere Firestore-rules voor print queue create/update/status-overgangen.
- Globale runtime error logging toegevoegd met throttling en centrale activity-log route.

**Aangepaste bestanden (kern):**
- `src/utils/helpers.jsx`
- `src/services/testGemini.jsx`
- `src/components/admin/AdminDatabaseView.jsx`
- `src/components/admin/ProjectStructureExpertView.jsx`
- `src/services/printService.js`
- `src/main.jsx`
- `functions/index.js`
- `firestore.rules`
- `src/services/aiService.jsx`

**Validatie:**
- `get_errors` op gewijzigde bestanden: geen fouten.
- Pattern-check op frontend key/externe Gemini endpoint usage: opgeschoond in broncode.
- Productiebuild uitgevoerd: succesvol (`npm run build`, alleen chunk-size waarschuwingen).

**Resultaat:**
- Kritieke exposure-punten voor AI en print zijn aantoonbaar verkleind.
- Input- en statusvalidatie is strakker afgedwongen op zowel app- als rules/backend-niveau.
- Observability voor runtime fouten is verbeterd.

**Openstaand / eerstvolgende stap:**
1. Hoog-risico Firestore mutaties verder migreren naar backend callables/functions (minder client-trust op kritieke state transitions).
2. Verdere field-level aanscherping van message/update-semantiek waar nodig.
3. Top-3 kritieke writeflows kiezen en server-side valideren met schema + role checks.

# 📝 FPi Future Factory - Pilot Handover & Development Summary

### Update sessie 70 (Label preview parity: Admin ↔ ProductionStart ↔ Mazak gestabiliseerd)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Alle labelvoorbeelden visueel laten overeenkomen met elkaar en met Zebra-printgedrag (ZM400 / 300 DPI).

**Wat is afgerond in deze batch:**
- Vertaling voor Pipe tile aangepast naar `Buizen producties` in NL-teksten.
- Toast gedrag aangepast:
    - `success/info` rechtsonder en niet-blokkerend;
    - `warning/error` centraal met overlay.
- AI-context uitgebreid voor productievragen:
    - recent lotnummer / laatste activiteit;
    - productietijden;
    - capaciteitsvragen en achterstandsinzicht.
- Label preview rendering gelijkgetrokken:
    - gedeelde utility toegevoegd voor tekstmeting/fontmapping: `src/utils/labelPreviewMetrics.js`;
    - zowel `LabelVisualPreview` als `AdminLabelDesigner` gebruiken nu dezelfde metrics.
- Production Start previewpad gelijkgemaakt aan andere schermen:
    - eigen zoom/recalc verwijderd;
    - overgezet naar `AutoScaledLabelPreview` met printer-DPI.
- ZM400 default/fallback DPI op 300 gezet voor preview/print-flow waar nodig.
- Label Manager standaard zoom aangepast naar 100%.

**Aangepaste bestanden (kern):**
- `src/lang/nl.js`
- `src/components/notifications/ToastContainer.jsx`
- `src/services/aiService.jsx`
- `src/data/aiPrompts.jsx`
- `src/components/printer/LabelVisualPreview.jsx`
- `src/components/printer/AutoScaledLabelPreview.jsx`
- `src/components/admin/AdminLabelDesigner.jsx`
- `src/components/digitalplanning/modals/ProductionStartModal.jsx`
- `src/components/digitalplanning/MazakView.jsx`
- `src/components/printer/PrintQueueAdminView.jsx`
- `src/components/printer/PrintStationView.jsx`
- `src/utils/labelPreviewMetrics.js`

**Validatie:**
- `get_errors` uitgevoerd op gewijzigde preview/designer bestanden: geen fouten.

**Openstaand / eerstvolgende stap:**
1. Visuele eindcheck op 1 labeltemplate in drie schermen: Admin Label, ProductionStart (BH12), Mazak.
2. Indien nog pixelverschillen: alleen layout/padding finetunen (geen aparte renderlogica meer).

### Update sessie 67 (MES-positionering vastgelegd + eerste code-stap: offline-first fundament)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Strategische positionering van Future Factory tegenover klassieke MES-systemen vastleggen.
- Niet alleen documenteren, maar ook direct een eerste productfundament in code oppakken.

**Positionering die is vastgelegd:**
- Future Factory onderscheidt zich niet door meer monolithische modules, maar door:
    - native AI-potentie in plaats van alleen opslag/rapportage;
    - real-time werkvloersync zonder polling;
    - operator-gerichte UX;
    - snelle hardware- en cloudintegraties;
    - veel lagere frictie bij procesaanpassingen.
- Grootste directe winst nu: **live ervaring op de werkvloer**.
- Grootste structurele vervolgstap: **betrouwbare uren- en capaciteitsinzichten** voor planners.
- Belangrijkste gat t.o.v. zware MES-systemen: **traceability/compliance** en **offline-first robuustheid**.

**Wat is direct in code opgepakt:**
- Eerste concrete stap gekozen op het fundamentniveau: **offline-first Firestore persistence**.
- `src/config/firebase.jsx` aangepast zodat Firestore nu probeert te starten met lokale persistentie + multi-tab cache.
- Veilige fallback toegevoegd naar standaard `getFirestore(app)` als browser/device dit niet ondersteunt of Firestore al eerder is geïnitialiseerd.

**Aangepaste bestanden:**
- `src/config/firebase.jsx`
- `CONVERSATION_SUMMARY.md`

**Waarom deze stap als eerste:**
- Dit sluit direct aan op het benoemde zwakke punt van cloud-native MES op de werkvloer: wifi-uitval of instabiele hal-connectiviteit.
- Het versterkt de live shopfloor-ervaring zonder eerst grote functionele verbouwingen te vragen.

**Validatie:**
- Nog uit te voeren na deze batch: build/gedrag valideren op runtime met bestaande flows.

**Openstaand / eerstvolgende stap:**
1. Build controleren na activeren van Firestore persistence.
2. Functioneel testen of de app normaal opstart met bestaande auth/planning/tracking schermen.
3. Daarna eventueel uitbreiden met expliciete offline-statusmelding in UI voor operators/teamleaders.

### Update sessie 68 (Zichtbare online/offline status in header)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- De nieuwe offline-first Firestore persistence zichtbaar maken in de UI, zodat gebruikers direct zien of ze online of op lokale cache werken.

**Wat is afgerond in deze batch:**
- `Header` uitgebreid met een online/offline indicator op basis van browser `online` / `offline` events.
- Indicator toegevoegd op:
    - mobiel: direct naast de `TEST` badge in de branding;
    - desktop: in de rechter status-chip van de header.
- Desktopstatus toont nu bij offline expliciet `Offline cache actief`.

**Aangepaste bestanden:**
- `src/components/Header.jsx`
- `CONVERSATION_SUMMARY.md`

**Validatie:**
- Nog uit te voeren na deze batch: diagnostics + build.

### Update sessie 69 (Verbindingswissels naar ingebouwde meldingen i.p.v. toast)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Verbindingswissels niet als toast tonen, maar als interne systeemmeldingen in het bestaande meldingensysteem.

**Wat is afgerond in deze batch:**
- `App.jsx` uitgebreid met centrale `online` / `offline` listeners.
- Bij wissel van verbinding wordt nu een systeemmelding geschreven naar `PATHS.MESSAGES` voor de ingelogde gebruiker.
- Soorten meldingen:
    - `Offline modus actief`
    - `Verbinding hersteld`
- Geen melding op eerste app-load.
- Dedupe toegevoegd via `localStorage`, zodat meerdere tabs of snelle reconnects niet meteen dubbele berichten genereren.

**Aangepaste bestanden:**
- `src/App.jsx`
- `CONVERSATION_SUMMARY.md`

**Openstaand / eerstvolgende stap:**
1. Diagnostics + build valideren.
2. Runtime testen of een offline/online wissel exact één interne melding oplevert.

### Update sessie 63 (Time Tracking: Teamleader Fittings default afdeling)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Time Tracking automatisch op de juiste afdeling laten openen wanneer een Teamleader in afdelingsscope werkt, zodat Fittings niet meer op `ALLES` start.

**Wat is afgerond in deze batch:**
- `TimeTrackingView` uitgebreid met prop `initialDepartment`.
- `CapacityPlanningView` geeft nu de actuele afdelingsfilter door aan `TimeTrackingView`.
- Slimme matching toegevoegd zodat varianten zoals `Fittings` / `Fitting Productions` toch op dezelfde afdeling landen.

**Aangepaste bestanden:**
- `src/components/planning/CapacityPlanningView.jsx`
- `src/components/planning/TimeTrackingView.jsx`

**Validatie:**
- `get_errors`: geen fouten.

**Resultaat:**
- Teamleader Fittings opent Time Tracking nu standaard op de Fittings-afdeling in plaats van `ALLES`.

### Update sessie 64 (Werkuren-logica: nacht/weekend uitsluiten uit Time Tracking en Efficiency)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Voorkomen dat stilstand buiten ploeguren of in weekend onterecht als productietijd wordt meegeteld in Time Tracking en Efficiency.

**Wat is afgerond in deze batch:**
- Nieuwe helper toegevoegd: `src/utils/workingTimeUtils.js`
    - berekent alleen minuten binnen werkvensters;
    - fallback blijft bestaan voor contexten zonder bekend rooster.
- `TimeTrackingView` omgezet van ruwe `start -> eind` duur naar werkuren-geclipte duur.
- `EfficiencyDashboard` idem omgezet voor werkelijke minuten uit trackinglogs.
- Eerste implementatie voor Fittings toegevoegd; daarna uitgebreid naar Pipes en Spools.
- Definitieve afdelingsroosters ingesteld:
    - `Fittings`: ma-vr `06:00-22:00`
    - `Pipes`: ma-vr `05:30-22:30`
    - `Spools`: ma-vr `07:15-16:00`

**Aangepaste bestanden:**
- `src/utils/workingTimeUtils.js`
- `src/components/planning/TimeTrackingView.jsx`
- `src/components/digitalplanning/EfficiencyDashboard.jsx`

**Validatie:**
- `get_errors`: geen fouten.
- Volledige productiebuild uitgevoerd: succesvol.

**Resultaat:**
- Nachtgaten tussen stappen, en weekendtijd buiten rooster, tellen niet meer mee als actieve tijd in Time Tracking en Efficiency.

### Update sessie 65 (Handmatige Teamleader-knop voor oude definitieve afkeur-orders)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Een handmatige actie klaarzetten om oude definitieve afkeur-orders, die nog volgens de oude methode in actieve planning bleven staan, alsnog naar planning-archief te verplaatsen.

**Wat is afgerond in deze batch:**
- In `TeamleaderHub` een nieuwe actie toegevoegd: `Oude Afkeur Archiveren`.
- De actie gebruikt dezelfde bestaande archiefroutine als de nieuwe flow via `archiveOrder(..., "rejected")`.
- Logregistratie toegevoegd met actiecode `PLANNING_ARCHIVE_LEGACY_REJECTED`.
- Zowel desktop- als mobile-entry toegevoegd in de Teamleader acties.

**Aangepaste bestanden:**
- `src/components/digitalplanning/TeamleaderHub.jsx`

**Validatie:**
- `get_errors`: geen fouten.
- Volledige productiebuild uitgevoerd: succesvol.

### Update sessie 66 (Legacy afkeur-detectie verbreed + knop altijd zichtbaar)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Zorgen dat de handmatige archiveerknop ook beschikbaar is voor oude gevallen die niet expliciet meer de status `rejected` dragen, zoals vorige-week-orders met alleen `rejectedCount`.

**Wat is afgerond in deze batch:**
- Detectielogica voor `legacyRejectedOrders` verbreed:
    - expliciete `rejected/afkeur/definitieve afkeur` status;
    - `archiveReason/archivedReason = rejected`;
    - of orders met `rejectedCount > 0`, zonder actieve producten, en:
        - ouder dan huidige week, of
        - volledig afgewikkeld via `rejectedCount + finishedCount >= plan`.
- Knop `Oude Afkeur Archiveren (x)` nu altijd zichtbaar gemaakt in Teamleader Hub:
    - bij 0 kandidaten grijs zichtbaar;
    - bij >0 kandidaten rood actief met teller.

**Aangepaste bestanden:**
- `src/components/digitalplanning/TeamleaderHub.jsx`

**Validatie:**
- `get_errors`: geen fouten.
- Volledige productiebuild uitgevoerd: succesvol.

**Openstaand / eerstvolgende stap:**
1. In pilot controleren of de teller nu de twee oude afkeur-orders van vorige week oppakt.
2. De handmatige actie eenmalig uitvoeren zodra productie het toelaat.
3. Daarna visueel controleren dat deze orders niet meer in actieve planning staan en wél terug te vinden zijn in planning-archief.

### Update sessie 62 (Tijdelijke afkeur uniform + reparatieflow Teamleader + reparatie-uren zichtbaar)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Tijdelijke afkeurflow voor operators uniform maken op Lossen/Nabewerken/Mazak/Eindinspectie.
- Teamleader-dossier aanpassen van generiek verplaatsen naar gerichte reparatieflow bij tijdelijke afkeur.
- Reparatie-uren meetbaar en terugvindbaar maken als aparte categorie.

**Wat is afgerond in deze batch:**
- **Tijdelijke afkeur redenen gestandaardiseerd** via `REJECTION_REASONS`:
    - `Oppervlakteschade`
    - `Maatafwijking (TW/TF/W)`
    - `Kwaliteit onvoldoende`
    - `Onjuist label`
    - `Liner beschadigd`
    - `Overig`
    - meerdere redenen blijven selecteerbaar; minimaal 1 reden blijft verplicht.
- Dit werkt nu consistent in:
    - `src/components/digitalplanning/modals/ProductReleaseModal.jsx`
    - `src/components/digitalplanning/modals/PostProcessingFinishModal.jsx`
    - `src/components/digitalplanning/modals/ProductDossierModal.jsx`
    - bronlijst in `src/utils/workstationLogic.jsx`
- **Opmerkingveld blijft behouden** in alle relevante afkeurmodalen.

- **Teamleader reparatie-UX in dossier aangepast** (`ProductDossierModal`):
    - knoplabel verandert bij tijdelijke afkeur van `Verplaats` naar `Reparatie`;
    - stationskeuze wordt bij tijdelijke afkeur beperkt tot `BH31` en `Nabewerking`;
    - extra tekstveld toegevoegd voor reparatie-instructie aan operator;
    - confirm-flow en logteksten aangepast naar reparatie-context.

- **Reparatie metadata + flowtracking toegevoegd**:
    - `onMoveLot` uitgebreid met optionele reparatie-opties (`isRepairMove`, `repairInstruction`) in:
        - `src/components/digitalplanning/TeamleaderHub.jsx`
        - `src/components/digitalplanning/WorkstationHub.jsx`
    - bij reparatieverplaatsing worden nu gezet:
        - `repairActive`
        - `repairCategory: "reparatie"`
        - `repairInstruction`
        - `timestamps.repair_start`
    - bij doorstroom naar eindinspectie (BM01) wordt reparatie afgesloten met:
        - `timestamps.repair_end`
        - `repairActive: false`
    - toegepast in:
        - `src/components/digitalplanning/WorkstationHub.jsx`
        - `src/components/digitalplanning/MazakView.jsx`

- **BH31 flowcorrectie**:
    - `getStepForStation("BH31")` behandelt BH31 nu expliciet als reparatiestation (niet meer als standaard BH-wikkelstap).

- **Reparatie-uren zichtbaar gemaakt in Time Tracking** (`src/components/planning/TimeTrackingView.jsx`):
    - nieuwe berekening op basis van `timestamps.repair_start` -> `timestamps.repair_end`/`bm01_start`;
    - nieuwe total card `Totaal Reparatie`;
    - extra kolom `Reparatie` in orderanalyse;
    - extra detailkolommen `Reparatie` en `Reparatie Tijd` op lotniveau.

**Validatie:**
- `get_errors` op alle aangepaste bestanden: **geen fouten**.
- Volledige productiebuild uitgevoerd: **succesvol** (`vite build`, klaar in ~19s).

**Openstaand / eerstvolgende stap:**
1. Functionele pilotcheck op tijdelijke afkeur in 4 contexten: Lossen, Nabewerken, Mazak, BM01.
2. Teamleadercheck: dossierknop `Reparatie`, stationbeperking `BH31/Nabewerking`, instructietekst zichtbaar in history/note.
3. Time Tracking check: reparatie-uren lopen op tijdens reparatie en zijn terug te vinden in `Totaal Reparatie` + detailregels.
4. Daarna commit + push bij akkoord.

### Update sessie 61 (Afkeurflow: To Do direct corrigeren bij definitieve afkeur)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Pilot-bevinding oplossen waarbij `To Do` niet overal consistent omhoog ging na definitieve afkeur.
- Gewenste gedrag borgen:
    - **Tijdelijke afkeur**: `To Do` blijft gelijk.
    - **Definitieve afkeur** (direct of na tijdelijke afkeur): `To Do` direct +1 via rollback op order-startteller.

**Wat is afgerond in deze batch:**
- Definitieve-afkeur rollback gestandaardiseerd op meerdere paden:
    - `src/components/digitalplanning/MazakView.jsx`
    - `src/components/digitalplanning/LossenView.jsx`
    - `src/components/digitalplanning/BM01Hub.jsx`
    - `src/components/digitalplanning/WorkstationHub.jsx`
    - `src/components/digitalplanning/modals/ProductReleaseModal.jsx`
    - `src/components/digitalplanning/modals/ProductDossierModal.jsx`
- Belangrijkste aanpassing:
    - overal `started_*`-veld nu via `getStartedCounterField(...)` i.p.v. losse stringopbouw;
    - bij definitieve afkeur wordt de relevante `started_*` teller verlaagd (indien > 0), waardoor `To Do` direct met 1 stijgt;
    - bij orders die al op `completed/finished/gereed` stonden, status teruggezet naar `planned` zodat ze weer zichtbaar/plannbaar zijn;
    - `rejectedCount` en `lastUpdated` worden nu ook consequent bijgewerkt op orderniveau.
- Tijdelijke afkeurflow is bewust ongewijzigd gehouden: geen wijziging in `To Do` zolang herstel nog mogelijk is.

**Validatie:**
- `get_errors` op alle 6 aangepaste bestanden: **geen fouten**.
- Volledige productiebuild uitgevoerd: **succesvol** (`vite build`, klaar in ~21s).

**Openstaand / eerstvolgende stap:**
1. Pilotvloer scenario-test met 1 order op elk pad:
   - Lossen -> definitieve afkeur
   - Nabewerken/Mazak -> definitieve afkeur
   - BM01 -> definitieve afkeur
2. Per scenario controleren:
   - `To Do` stijgt direct met 1 op de moederorder/machine;
   - tijdelijke afkeur laat `To Do` onveranderd;
   - omzetting tijdelijk -> definitief verhoogt `To Do` exact één keer.
3. Daarna commit + push als akkoord.

**Opgeslagen op verzoek (hervatpunt):**
- Live-check bewust geparkeerd om later in één sessie uit te voeren.
- Volgende keer direct starten met deze 3 checks achter elkaar:
    1. Lossen definitieve afkeur
    2. Nabewerken/Mazak definitieve afkeur
    3. BM01 tijdelijke afkeur -> definitieve afkeur

### Update sessie 60 (Volledige Lijst stationsfilter: Nabewerken zichtbaar gemaakt)

**Datum:** 11 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Laatste openstaande punt oppakken uit sessie 59: analyseren waarom `Nabewerken` niet zichtbaar werd in `Alle Machines / Stations` in de Volledige Lijst en dit herstellen.

**Wat is afgerond in deze batch:**
- Oorzaak in `PlanningSidebar` aangepakt:
    - opbouw van de stationsdropdown was te afhankelijk van `sourceData`-orders;
    - downstream stations uit tracking (zoals `Nabewerken`) konden daardoor ontbreken als gekoppelde order niet meer in de actieve bronlijst zat.
- Fix doorgevoerd in `src/components/digitalplanning/PlanningSidebar.jsx`:
    - downstream set gecentraliseerd (`BM01`, `MAZAK`, `NABEWERKEN`, `LOSSEN`);
    - stations worden nu niet alleen per zichtbare order toegevoegd, maar ook expliciet uit `orderStationMap` (trackingbron) zelf opgebouwd.
- Resultaat:
    - `Nabewerken` blijft nu als filteroptie beschikbaar zodra trackingdata dit station bevat, ook in edge-cases waar orderbrondata dit niet direct meer toont.

**Validatie:**
- `get_errors` op aangepast bestand: **geen fouten**.
- Volledige productiebuild uitgevoerd: **succesvol** (`vite build`, klaar in ~33s).

**Openstaand / eerstvolgende stap:**
1. Functionele UI-test in Volledige Lijst uitvoeren op filters `Nabewerken`, `Mazak` en `BM01` met echte pilotdata.
2. Bevestigen dat de gefilterde product-/orderlijsten inhoudelijk correct zijn per station.
3. Indien akkoord: wijzigingen committen en pushen.

### Update sessie 59 (Slimme Sync verfijnd + compacte import modal + planner/sidebar uitbreidingen)

**Datum:** 10 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Slimme Sync bruikbaarder maken voor LN-herimport.
- Planning Import modal compacter maken.
- Meer operationele info zichtbaar maken in planningskaartjes.
- Volledige Lijst uitbreiden met stationfilters en PDF-export.

**Wat is afgerond in deze batch:**
- **Planning Import modal vereenvoudigd** in `src/components/digitalplanning/modals/PlanningImportModal.jsx`:
    - tabbladselectie verwijderd
    - `Week t/m` blok verwijderd
    - `Hybride Import` blok verwijderd
    - zwarte header compacter gemaakt
    - machinechips en snelle selectie-acties (`Alles selecteren`, `Leegmaken`, `BH12 + BH18`) verplaatst naar de zwarte header
    - `Machinegroep` hernoemd naar `Afdelingsgroep`
    - groepen: `Fittings`, `Pipes`, `Spools`
    - multi-select machine-import toegevoegd; niet-geselecteerde machines worden overgeslagen
- **Slimme Sync verfijnd** in `src/components/digitalplanning/modals/PlanningImportModal.jsx`:
    - focus op wijzigingen in `Quantity Ordered` (`quantity`) en `PO Text` (`notes`/`poText`)
    - bestaande orders zonder wijziging worden in Slimme Sync niet meer getoond
    - alleen `Nieuw` of echte wijzigingen worden automatisch geselecteerd en meegenomen
    - lijst sorteert nieuwe/gewijzigde regels bovenaan
    - `Aantal` toont oud + nieuw bij wijziging:
        - hoger nieuw aantal = groene badge
        - lager nieuw aantal = rode badge
    - `PO Text` krijgt groene highlight bij wijziging
    - kolom `In Planning` toont:
        - `Nieuw` voor nieuwe regels
        - `Sync` voor bestaande regels met wijziging
        - ongewijzigde bestaande regels worden niet getoond in Slimme Sync
- **Importtabel compacter gemaakt** in `src/components/digitalplanning/modals/PlanningImportModal.jsx`:
    - kleinere header paddings
    - kleinere rijhoogte
    - compactere badges/tags
    - meer regels en kolommen zichtbaar
- **PO Text zichtbaar op planningskaartjes**:
    - `src/components/digitalplanning/PlanningSidebar.jsx`
    - `src/components/digitalplanning/terminal/TerminalPlanningView.jsx`
    - operators zien PO Text nu al op de kaart voordat ze doorklikken naar dossier/start
- **Volledige Lijst / PlanningSidebar uitgebreid** in `src/components/digitalplanning/PlanningSidebar.jsx`:
    - filter `Alle Machines / Stations` uitgebreid richting stationlogica op basis van tracked products
    - extra stationfilters toegevoegd voor o.a. `Mazak`, `BM01`, `Lossen`
    - snelle PDF-export toegevoegd op de actuele gefilterde lijst
    - PDF-export aangepast naar **productniveau** in plaats van orderniveau
    - PDF-kolommen nu: `Lotnummer`, `Ordernummer`, `Product`, `Station`, `PO Text`, `Status`

**Openstaand / eerst controleren in volgende sessie:**
1. `Nabewerken` ontbreekt nog steeds zichtbaar in de dropdown `Alle Machines / Stations` van de Volledige Lijst, ondanks eerdere filterlogica-uitbreiding.
2. Controleren waarom `Nabewerken` niet als optie wordt opgebouwd in `src/components/digitalplanning/PlanningSidebar.jsx`.
3. Daarna functioneel testen of filteren op `Nabewerken`, `Mazak` en `BM01` daadwerkelijk de juiste product-/orderlijst oplevert.
4. Indien goed: wijzigingen committen en pushen.

**Belangrijke technische notities:**
- Voor Slimme Sync is `Quantity Ordered` leidend gemaakt als hoeveelheid (`quantity`).
- `To do qty` is bewust niet meer leidend voor de verschilvergelijking in de importmodal.
- PDF-export gebruikt eerst `trackedProducts`; als die ontbreken, valt export terug op minimale orderregels.

### Update sessie 58 (Planning Import Smart Sync + LN bestandsanalyse)

**Datum:** 9 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Import verbeteren zodat bestaande orders veilig geüpdatet worden bij wijzigingen in LN-data (bv. aantal/PO-opmerking), zonder app-status te overschrijven.

**Wat is afgerond in deze batch:**
- LN-bestand geanalyseerd voor importvalidatie:
    - bron: `Tijdelijke Bestanden/tisfc140101000_0000_20260409-135329_126536.xlsx`
    - sheet: `data`
    - ~16.5k rijen, relevante velden bevestigd (`Orderstatus`, `Orderhoeveelheid`, `Hoeveelheid gereed`, `Productieorder`, `r.ref.oper.desc`, `Afdeling`, `Bewerking`, `Referentiebewerking`, `Work Center Group`).
- Nieuwe importmodus toegevoegd in Planning Import modal: **Slimme Sync**.
    - bestand: `src/components/digitalplanning/modals/PlanningImportModal.jsx`
    - nieuwe modus naast `Alleen Nieuwe` en `Overschrijf Alles`.
    - gedrag:
        - **nieuwe orders**: volledige import.
        - **bestaande orders**: alleen LN-gestuurde velden updaten (zoals aantal, notes, leverdatum/week, orderstatus, uren, item/project/machine).
        - app-beheerde velden (zoals `status`, `planningHidden`) blijven ongemoeid in Smart Sync.
- Auto-import script uitgebreid met CLI-modus `--smart-update`.
    - bestand: `scripts/auto-planning-import.cjs`
    - gedrag:
        - zonder flags: alleen nieuwe orders.
        - `--smart-update`: nieuwe + partiële update bestaande orders.
        - `--overwrite`: volledige overschrijving.
- UI labels/vertalingen aangevuld voor nieuwe modus:
    - `src/lang/nl.js`
    - `src/lang/en.js`
    - `src/lang/de.js`
    - keys o.a.: `smart_update`, `sync_label`, `update_label`, `new_label`.

**Morgen als eerste oppakken (hervatpunt):**
1. Functionele test in UI van **Slimme Sync** met een order die al bestaat in Firestore.
2. Verifiëren dat alleen LN-velden wijzigen bij re-import (met focus op `quantity/toDoQty/plan`, `notes`, `deliveryDate/weekNumber`, `orderStatus`, urenvelden).
3. Verifiëren dat app-velden intact blijven (`status`, `planningHidden`, operationele voortgang).
4. Daarna commit + push van deze Smart Sync batch.

**Handige commando’s voor morgen:**
- UI route: Planning Import -> modus `Slimme Sync`.
- Script test: `node scripts/auto-planning-import.cjs --smart-update --dir ./imports/planning`

### Update sessie 57 (Preview-branch sync uitgevoerd en gevalideerd)

**Datum:** 9 april 2026 | **Bron:** `origin/FPiFF-may-build` | **Doelbranch:** `origin/preview-v2`

**Doel:**
- Handover-fixes voor Lossen/Nabewerking/Teamleader/BH18 één-op-één overzetten naar Preview.
- Buildbaar opleveren op Preview-context inclusief alle noodzakelijke afhankelijkheden.

**Uitvoering:**
- Geïsoleerde worktree aangemaakt op preview:
    - pad: `/workspaces/_sync/preview-sync`
    - branch: `preview-handover-lossen-kpi-fixes`
- Overgezet vanuit `origin/FPiFF-may-build`:
    - `src/utils/hubHelpers.jsx`
    - `src/components/digitalplanning/TeamleaderHub.jsx`
    - `src/components/digitalplanning/WorkstationHub.jsx`
    - `src/components/digitalplanning/Terminal.jsx`
    - `src/components/digitalplanning/OrderDetail.jsx`
    - `src/components/digitalplanning/LossenView.jsx`
    - `src/components/digitalplanning/terminal/TerminalProductionView.jsx`
    - `src/components/digitalplanning/modals/ProductReleaseModal.jsx`

**Extra noodzakelijk voor Preview-compatibiliteit (build blockers opgelost):**
- `src/utils/dateUtils.js` (ontbrak, maar wordt geïmporteerd door WorkstationHub)
- `src/components/digitalplanning/Nabewerken.jsx` (ontbrak, import in WorkstationHub)
- `src/components/digitalplanning/NabewerkenView.jsx` (ontbrak, import in WorkstationHub)
- `src/config/dbPaths.jsx` (export `getArchiveItemsPath` nodig voor OrderDetail)

**Validatie:**
- `npm install` uitgevoerd in de preview-worktree.
- `npm run build` uitgevoerd.
- Resultaat: **succesvol** (`✓ built in 13.11s`).

**Commit:**
- hash: `0bb655e`
- message: `Sync preview with may-build Lossen/BH18/Teamleader fixes`
- wijzigingsset: 12 files changed, inclusief 3 nieuw aangemaakte bestanden op preview-context.

**Status:**
- Preview-sync staat klaar op branch `preview-handover-lossen-kpi-fixes` voor push/PR naar `preview-v2`.

### Update sessie 56 (Preview handover sync: Lossen/Nabewerking/Teamleader + BH18 + scanner focus parity)

**Datum:** 9 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Preview-handover fixes uit de overdracht toepassen zodat BH18/Volledige Lijst/KPI-gedrag gelijkloopt.
- Start Aantal/To do corrigeren voor orders met al gestarte stuks.
- Scanner-focus parity op Lossen/Terminal views gelijk trekken.

**Wat is afgerond in deze batch:**
- Gedeelde helper toegevoegd voor consistente started-veldnaam:
    - `src/utils/hubHelpers.jsx`
    - nieuwe export: `getStartedCounterField(stationName)`
- Teamleader full-list en KPI-fallback uitgebreid:
    - `src/components/digitalplanning/TeamleaderHub.jsx`
    - fittings scope verruimd met downstream stations (`FITTING_MACHINES`)
    - `orderProgressMeta` op basis van tracking toegevoegd
    - orders blijven zichtbaar bij in-scope `started_*` voortgang of tracked activiteit
    - KPI `activeCount` en modal `in_proces` tonen items bij `linkedToVisibleOrder OR inAllowedScope`
- BH18 stationplanning filter verruimd:
    - `src/components/digitalplanning/WorkstationHub.jsx`
    - nieuwe `stationActivityByOrder` map op `originMachine/currentStation/lastStation/machine`
    - order blijft zichtbaar bij resterend stationplan of stationactiviteit
    - alle losse `started_${...}` opbouw vervangen door `getStartedCounterField(...)`
- Terminal parity voor BH18/downstream zichtbaarheidslogica:
    - `src/components/digitalplanning/Terminal.jsx`
    - `stationCounterField` nu via helper
    - `stationOrderMeta` toegevoegd op basis van `allTracked`
    - `myOrders` houdt orders zichtbaar bij resterend plan of stationactiviteit
- Orderdetail voortgangsweergave gecorrigeerd:
    - `src/components/digitalplanning/OrderDetail.jsx`
    - `Start Aantal` gebruikt nu maximum van:
        - station-specifieke teller,
        - som van alle `started_*` velden,
        - live actieve trackingitems voor de order.
- Temp-afkeur filterlogica voor Nabewerking hersteld:
    - `src/components/digitalplanning/LossenView.jsx`
    - definitieve afkeur blijft verborgen
    - tijdelijke afkeur blijft zichtbaar op Nabewerking, blijft verborgen op overige stations
- Scanner focus parity meegenomen:
    - `src/components/digitalplanning/LossenView.jsx`
    - `src/components/digitalplanning/Terminal.jsx`
    - `src/components/digitalplanning/terminal/TerminalProductionView.jsx`
    - klik op niet-interactieve pagina-elementen zet scanner-input focus terug.

**Reeds aanwezig bevestigd (geen extra patch nodig):**
- Lossen-context fix in releaseflow met `isLossenStep` stond al goed in:
    - `src/components/digitalplanning/modals/ProductReleaseModal.jsx`

**Validatie:**
- Build uitgevoerd: `npm run build`
- Resultaat: **succesvol** (`✓ built in 14.95s`)

**Runtime/dev status:**
- Vite devserver gestart op poort 3000 met host-binding (`0.0.0.0`).
- Bereikbaar via:
    - `http://localhost:3000/`
    - `http://10.0.1.107:3000/`

**Aanbevolen functionele check op Preview:**
1. Order `N20024772` zichtbaar in BH18 planning, ook wanneer actuele machine downstream is.
2. Teamleader `Volledige Lijst` zoekt/tonen op order en lot zonder verdwijnen van actieve gevallen.
3. `Start Aantal / To do` toont geen `0 / 10` wanneer al 5 gestart zijn.
4. Lossen Goed-flow blijft uit de oude loop `Wacht op Lossen -> Wacht op Lossen`.

### Update sessie 55 (i18n vervolg digitalplanning - FITTINGS + MAZAK restlekken)

**Datum:** 8 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Resterende zichtbare NL/EN strings in Duitse modus wegwerken in FITTINGS-station selector en MAZAK-view.
- Zorgdragen dat ontbrekende namespaces/sleutels in `de.js` beschikbaar zijn zodat fallback verdwijnt.

**Wat is afgerond in deze batch:**
- FITTINGS selector probleem opgelost:
    - ontbrekende `departmentSelector` sectie toegevoegd in `src/lang/de.js`.
    - `select_instruction` staat nu in het Duits: `Wählen Sie einen Arbeitsplatz oder eine Verwaltungsoption`.
- Badge/status lek opgelost voor Duitse modus:
    - top-level `status` namespace toegevoegd in `src/lang/nl.js`, `src/lang/en.js`, `src/lang/de.js`.
    - de labels uit `StatusBadge.jsx` (zoals `In Productie`, `Afkeur`, `Tijdelijke afkeur`, etc.) vertalen nu correct per taal.
- Dossier/rechterpaneelteksten opgelost:
    - `digitalplanning.order_detail` in `de.js` aangevuld (o.a. `view_dossier`, `view_drawing`, `delivery_date_aq`, `total_plan`, `start_production`, `project_details`, `administration`, `creation_date_ln`).
    - bijbehorende nieuwe order_detail keys ook toegevoegd aan `src/lang/nl.js` en `src/lang/en.js` voor structuurconsistentie.
- `MazakView.jsx` opgeschoond op zichtbare hardcoded strings:
    - tabs/badges/acties (`Inbox / Printen`, `Gereedmelden`, `Herprint Label`, `Verwerken`)
    - lijst/detail labels (`Van`, `Ordernummer`, `Wikkelmachine`, `Aantal`, `Onbekend`)
    - week-divider status (`In Productie`) via `status.in_production`
    - lege-staat teksten rechts (`Selecteer order ...`)
- Nieuwe `mazak` namespace toegevoegd in alle taalbestanden:
    - `src/lang/nl.js`
    - `src/lang/en.js`
    - `src/lang/de.js`
  met de gebruikte MAZAK UI-sleutels zodat Duitse modus niet meer op NL fallback draait.
- Validatie uitgevoerd op gewijzigde bestanden: **geen fouten**.

**Openstaand (logische volgende batch):**
1. Verdere sweep in `MazakView.jsx` op niet-zichtbare user-facing strings (toasts/logdetails/history-teksten) die nog NL kunnen bevatten in backend-notities.
2. Extra scan op overige digitalplanning views voor laatste hardcoded literals in minder vaak gebruikte panelen.
3. Snelle browsercheck in Duitse modus op BH18/MAZAK om visuele restlekken direct te vangen.

**Hervatpunt voor volgende sessie:**
- Start met een gerichte grep op `src/components/digitalplanning/MazakView.jsx` en `src/components/digitalplanning/TeamleaderHub.jsx` voor resterende hardcoded user-facing tekst (vooral notificaties en activity-details).

### Update sessie 54 (i18n vervolg digitalplanning - Duitse lekkage batch 3)

**Datum:** 8 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- De volgende zichtbare restteksten in Duitse modus wegwerken na batch 53.
- Focus verlegd naar modals/views en TeamleaderHub-hoofdflow waar nog Nederlandse labels of ontbrekende Duitse sleutels zaten.

**Wat is afgerond in deze batch:**
- `StationDetailModal.jsx` verder geïnternationaliseerd:
    - statuskop, planningbadges, historie- en planningsleegstaat
    - labels zoals `Uit vorige week`, `Prioriteit / Verplaatst`, `Herstel`, `{{count}} gereed`
- `TraceModal.jsx` gekoppeld aan `useTranslation()` voor zichtbare UI:
    - header totalen
    - weeknavigatieknoppen
    - zoekplaceholder
    - leegstaat
    - tabelheaders
    - order/no-description labels
    - sluitknop
- Nieuwe sleutelgroepen toegevoegd in taalbestanden:
    - `digitalplanning.station_detail`
    - `digitalplanning.trace_modal`
    - `digitalplanning.active_production`
- `ActiveProductionView.jsx` opgeschoond op zichtbare literals:
    - `Nu Actief`, `Order Rij`, `Serie gereed`, `Tijdelijke Afkeur`, `Reden`, `Reminder verstuurd`, `Geen activiteit`, `Slimme Suggesties`, `Combineer Orders?`
- `TeamleaderHub.jsx` verder opgeschoond op zichtbare rauwe tekst en Duitse fallback-problemen:
    - afdelingsfilter (`Alle Afdelingen`, `Fittings`, `Pipes`, `Spools`) via `t(...)`
    - overproductiekaart labels en vervolgroute-teksten via `t(...)`
    - nieuwe LN-ordernummerlabel en handmatige doelstationkeuze via `t(...)`
    - overproductie-toast-, success- en message-strings via `t(...)`
- `src/lang/de.js` uitgebreid met een gerichte top-level `teamleader`-subset voor de sleutels die TeamleaderHub zichtbaar gebruikt.
- `src/lang/nl.js` en `src/lang/en.js` aangevuld zodat dezelfde Teamleader-sleutelset in alle drie de talen beschikbaar is.
- Validatie uitgevoerd op alle aangepaste bestanden: **geen fouten**.

**Openstaand (nieuwe eerstvolgende batch):**
1. Resterende TeamleaderHub-meldingen buiten deze overproductieflow nalopen, zoals sync-notificaties en eventuele overige toasts/logregels.
2. Nieuwe sweep op overige digitalplanning-views voor resterende hardcoded tekst of `t(..., "fallback")` zonder Duitse sleutel.
3. Browsermatige controle in Duitse modus doen op TeamleaderHub, StationDetailModal, TraceModal en ActiveProductionView om laatste zichtbare reststrings gericht weg te werken.

**Hervatpunt voor volgende sessie:**
- Start met een gerichte scan op `TeamleaderHub.jsx` voor de laatste runtimemeldingen en niet-zichtbare maar user-facing toasts.
- Daarna vervolgbatch op overige views die nog fallback in Duits kunnen tonen.

### Update sessie 53 (i18n vervolg digitalplanning - Duitse lekkage batch 2)

**Datum:** 8 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Duitse modus verder opschonen waar nog Nederlandse/Engelse fallback zichtbaar bleef.
- Eerst de grootste oorzaak aanpakken: missende `de.js` sleuteldekking in hub/dashboard/terminal.
- Daarna de duidelijk zichtbare hardcoded AI-analyseweergave naar i18n omzetten.

**Wat is afgerond in deze batch:**
- `src/lang/de.js` uitgebreid met ontbrekende digitalplanning-dekking voor:
    - `digitalplanning.terminal`
    - `digitalplanning.hub`
    - `digitalplanning.dashboard`
    - top-level `planner`
    - aanvullende basislabels zoals `machine`, `status`, `products`, `na`
- Hardcoded titel in `DigitalPlanningHub.jsx` vervangen:
    - `"Pipe Producties"` -> `t("digitalplanning.hub.pipe_title")`
- `AiPredictionView.jsx` volledig gekoppeld aan `useTranslation()` voor zichtbare UI:
    - titel/subtitel
    - KPI-kaarten
    - ingestie-diagnose labels
    - zoekplaceholder
    - tabelheaders
    - confidence/trend/advies labels
    - detailmodal inclusief AI-adviesblok
- Nieuwe vertaalsleutels toegevoegd voor `digitalplanning.ai_prediction` in:
    - `src/lang/nl.js`
    - `src/lang/en.js`
    - `src/lang/de.js`
- `digitalplanning.terminal` structuur in `src/lang/nl.js` en `src/lang/en.js` gelijkgetrokken met de uitgebreide Duitse variant, zodat verdere i18n-sweeps minder fallback-lek geven.
- Validatie uitgevoerd op alle aangepaste bestanden: **geen fouten**.

**Openstaand (nieuwe eerstvolgende batch):**
1. Nieuwe sweep op resterende grotere views met zichtbare literals, met name `TeamleaderHub.jsx`, `ActiveProductionView.jsx` en overige terminal/modals waar nog fallback-strings in `t(...)` zitten.
2. Duitse dekking nalopen voor eventuele extra namespaces buiten `digitalplanning.*` die in planner/teamleader-flow gebruikt worden.
3. Eventueel browsermatige controle in Duitse modus doen op hub, dashboard, terminaltabs en AI-view om laatste zichtbare restteksten gericht op te ruimen.

**Hervatpunt voor volgende sessie:**
- Start met een scan op `src/components/digitalplanning` voor resterende zichtbare literals en `t(..., "fallback")` combinaties die nog niet door sleutelwaarden in `de.js` worden afgevangen.
- Beste vervolgbatch: `TeamleaderHub.jsx`, `ActiveProductionView.jsx`, `StationDetailModal.jsx`, `TraceModal.jsx`.

### Update sessie 52 (i18n vervolg digitalplanning - batch 1 resterende zichtbare literals)

**Datum:** 8 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Hervatpunt van sessie 51 oppakken met een gerichte sweep op resterende zichtbare hardcoded teksten in `src/components/digitalplanning`.
- Missende sleuteldekking aanvullen, met nadruk op `de.js`, zodat Duitse modus minder vaak terugvalt op NL/EN.

**Wat is afgerond in deze batch:**
- Nieuwe i18n-pass uitgevoerd op compacte, zichtbare digitalplanning-componenten:
    - `MalOptimizationPanel.jsx`
    - `RepairModal.jsx`
    - `NabewerkenView.jsx`
    - `Nabewerken.jsx`
    - `PlanningImportModal.jsx` (kern-UI + meldingen)
- Zichtbare headings, labels, knoppen, placeholders, badges en meerdere importmeldingen vervangen door `t(...)` calls met fallback.
- Nieuwe sleutelgroepen toegevoegd in taalbestanden:
    - `digitalplanning.optimization`
    - `digitalplanning.repair`
    - `digitalplanning.nabewerking`
    - `digitalplanning.planning_import`
- Dekking expliciet aangevuld in:
    - `src/lang/nl.js`
    - `src/lang/en.js`
    - `src/lang/de.js`
- Validatie uitgevoerd op alle aangepaste bestanden: **geen fouten**.

**Openstaand (nieuwe eerstvolgende batch):**
1. Resterende grotere digitalplanning-bestanden verder uitfaseren op zichtbare literals, met focus op modals/hubs waar nog veel UI-tekst zit.
2. `PlanningImportModal.jsx` desgewenst nog verder opschonen op niet-kritische logregels en secundaire helpteksten.
3. Na nog 1-2 batches een nieuwe volledige sweep + errorcheck uitvoeren en restlijst rapporteren.

**Hervatpunt voor volgende sessie:**
- Start met een nieuwe scan op `src/components/digitalplanning/modals` en de grotere hub/views voor resterende zichtbare literals.
- Waarschijnlijk beste vervolgbatch: `StationDetailModal`, `TraceModal`, aanvullende Terminal/Mazak reststrings en eventuele overgebleven importmeldingen.

### Update sessie 51 (i18n vervolg digitalplanning - hervatpunt opgeslagen)

**Datum:** 8 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Vertalingen opschonen in productieflow en daarna verbreden naar zoveel mogelijk onderdelen in `src/components/digitalplanning`.
- Mixed language in Duitse modus beperken (Nederlands/Engels door elkaar).

**Wat is afgerond in deze batch:**
- Grote i18n-pass uitgevoerd op o.a. Terminal-flow, Lossen, Mazak en meerdere hubs/modals.
- Veel hardcoded zichtbare UI-teksten vervangen door `t(...)` calls met fallback.
- Extra componenten meegenomen: o.a. `WorkstationHub`, `StationDetailModal`, `TeamleaderHub`.
- Meerdere tussentijdse validaties gedaan op aangepaste bestanden: geen fouten in gecontroleerde files.

**Openstaand (bewust geparkeerd als eerstvolgende stap):**
1. Resterende hardcoded tekst in overgebleven digitalplanning-files volledig uitfaseren.
2. Missende sleuteldekking in taalbestanden (met focus op `de.js`) aanvullen om fallback-lekkage te verminderen.
3. Na afronding een laatste volledige sweep + errorcheck uitvoeren en restlijst rapporteren.

**Hervatpunt voor volgende sessie:**
- Start met een nieuwe scan op `src/components/digitalplanning` voor resterende zichtbare literals en notification-strings.
- Werk daarna per bestand in batches: scan -> patch -> errorcheck.

### Update sessie 50 (Teamleader KPI-filters + planning UX + plak-import fallback)

**Datum:** 7 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Teamleader KPI's corrigeren zodat weekwaarden en prioriteit logisch kloppen.
- Volledige lijst (Teamleader/Planner) visueel gelijk trekken met workstation planning (CST/EMT + selectie-kleur).
- Tijdelijke plak-import in huidige `PlanningImportModal` activeren zolang LN-import nog finetuning nodig heeft.

**Wat is gedaan:**
- **Planningstatus Teamleader opgeschoond (Open/Lopend only)**
    - In Teamleader `gepland`-berekeningen en planninglijst wordt nu alleen nog gewerkt met open/lopende statussen.
    - `Gereed`/`Completed` orders worden niet meer meegenomen in planning KPI/lijst.

- **KPI modal weeknavigatie toegevoegd (Gereed + Afkeur)**
    - In drilldown (`TraceModal`) kun je nu per week terug/vooruit bladeren.
    - Knoppen: vorige week, volgende week (tot huidige week), en reset naar deze week.

- **KPI-tegels terug op actuele week gezet**
    - Na eerste wijziging telden tegels historie mee; dit is hersteld.
    - `Gereed`, `Afkeur` en `Tijdelijke afkeur` KPI's tonen nu alleen huidige ISO-week.

- **KPI Prio gefixt voor afgeronde orders**
    - Prioriteits-KPI sluit nu afgeronde/gereed/rejected trackingitems uit.
    - Orders met alleen historische tijdelijke afkeur maar inmiddels gereed komen niet meer in Prio.

- **CST/EMT badges + gekleurde orderkaartjes in Volledige Lijst**
    - Zelfde type-detectie als workstation planning toegepast in `PlanningSidebar`.
    - `EMT`: lichtblauwe tint + EMT badge.
    - `CST`: lichtgrijze tint + CST badge.

- **Selected tegelkleur van blauw naar groen**
    - Selectiestijl in planninglijsten is nu groen (rand/achtergrond/tekstaccent) i.p.v. blauw.

- **PlanningImportModal: plakmodus toegevoegd en als default gezet**
    - Nieuwe tijdelijke flow: Excel-data direct plakken in textarea.
    - `Plak Excel Data` staat standaard geselecteerd; bestand-upload blijft beschikbaar.

- **Plak-import robuuster gemaakt (fallbacks)**
    - Naast LN raw (`Production Order`) wordt nu ook tabulaire plakdata geaccepteerd.
    - Extra herstel voor platte Office-plakblokken:
        - header-herkenning op meerdere patronen,
        - machine-hint injectie als machinekolom ontbreekt,
        - forward-fill van lege datum/week velden,
        - fallback parser als hoofdparser niets vindt.

**Aangepaste bestanden:**
- `src/components/digitalplanning/TeamleaderHub.jsx`
- `src/components/digitalplanning/modals/TraceModal.jsx`
- `src/components/digitalplanning/PlanningSidebar.jsx`
- `src/components/digitalplanning/terminal/TerminalPlanningView.jsx`
- `src/components/digitalplanning/modals/PlanningImportModal.jsx`

**Validatie:**
- `get_errors` op alle aangepaste bestanden: **geen fouten**.

**Actueel hervatpunt:**
- Teamleader KPI's en planninglijst zijn functioneel gecorrigeerd (weekfilters + prio + statusfiltering).
- UI-verbeteringen voor Volledige Lijst staan live (CST/EMT badges + groene selectie).
- Tijdelijke plak-import staat aan als default; eerstvolgende stap is 1 echte LN-plaktest valideren met 2-3 voorbeeldorders en daarna pas de definitieve LN-only flow harden.

### Update sessie 49 (Gereed-tab UX + archief + code-opschoning)

**Datum:** 7 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Gereed-tab bruikbaarder maken op de vloer (leesbaarheid + zoeken + scrollgedrag).
- 5 dagen historie als **werkdagen** interpreteren (weekend niet meetellen).
- Archiefitems uit `future-factory/production/archive/{year}/items` ook tonen.
- Grote Terminal-code verder opschonen en duplicatie verminderen.

**Wat is gedaan:**
- **BH18 gereed-tab geactiveerd in Terminal**
    - `GEREED_TAB_SOURCE_STATIONS` uitgebreid met `BH18`, zodat BH18 nu `Planning / Wikkelen / Gereed` toont i.p.v. `Lossen`.

- **Gereed-tab UX verbeterd**
    - Zoekbalk toegevoegd met filter op **product + order + lotnummer**.
    - Zoekbalk vastgezet bovenaan (sticky gedrag): bij lange lijst blijft zoeken zichtbaar.
    - Orderkaartjes groter gemaakt met duidelijkere hiërarchie:
        - productnaam prominent,
        - itemcode op een eigen regel eronder,
        - badges voor order/lot,
        - tijdstempel van doorgang naar Lossen.

- **Historie op werkdagen gezet**
    - `subDays(5)` vervangen door werkdaglogica (ma-vr), weekend telt niet mee.

- **Archief daadwerkelijk meegenomen**
    - Gereed-overzicht combineert live tracking + archiefitems.
    - Deduplicatie op item/lot, sortering op meest recente timestamp.

- **Refactor / onderhoudbaarheid**
    - Nieuwe gedeelde component: `src/components/digitalplanning/terminal/TerminalGereedTab.jsx`.
    - `Terminal.jsx` opgeschoond en gereed-tab inline code verwijderd.
    - `GereedView.jsx` omgezet naar dunne wrapper rond dezelfde gedeelde component, zodat zowel Terminal-flow als WorkstationHub-flow exact dezelfde Gereed-logica/UI gebruiken.

**Aangepaste bestanden:**
- `src/components/digitalplanning/Terminal.jsx`
- `src/components/digitalplanning/GereedView.jsx`
- `src/components/digitalplanning/terminal/TerminalGereedTab.jsx` (nieuw)
- `src/components/digitalplanning/WorkstationHub.jsx` (eerder in deze keten, voor tab-routing)

**Validatie:**
- `get_errors` op alle betrokken bestanden: **geen fouten**.

**Actueel hervatpunt:**
- Gereed-tab is functioneel afgerond (BH18 + archief + werkdagen + sticky search + grotere kaarten + gedeelde component).
- Volgende logische stap is alleen nog optioneel: live vloer-validatie met 1-2 recente BH18 lots om te checken of alle verwachte archiefitems in dezelfde volgorde zichtbaar zijn.

### Hervatpunt (opgeslagen op verzoek)

**Datum:** 5 april 2026 | **Branch:** `pilot-dev`

**Eerstvolgende actie bij hervatten:**
- "Als je wilt, pak ik nu direct de resterende 16 confirm-locaties volledig af in één laatste migratiebatch. Daarna kan ik ook de top 5 alert-bestanden stiller maken zodat alleen fouten nog popup tonen."

**Status:** Geparkeerd als eerste vervolgactie voor de volgende sessie.

**Actueel hervatpunt (na sessie 40):**
- Time Tracking toont nu orderniveau met doorklik naar lotdetails; eerstvolgende stap is laatste validatie van stationvolgorde en tijdsgrenzen (Wikkelen -> Lossen -> Nabewerken -> Eindinspectie/BM01) op concrete archieforders.

**Actueel hervatpunt (na sessie 41):**
- AI Analyse toont nu ingestie-diagnose en Teamleader gebruikt dezelfde `dataSourceMode` als Efficiency; eerstvolgende stap is live de 8 diagnosewaarden noteren (bron, tracking, archief, standaarden, kandidaten, met productcode, afgerond/gereed, geldige duur) en daarna laatste AI-filtertuning doen.

**Actueel hervatpunt (na sessie 42):**
- AI Analyse gebruikt nu bredere afgerond-detectie, sterkere duurfallbacks en extra uitvalredenen in diagnose; eerstvolgende stap is live in de UI de nieuwe 12 diagnosewaarden noteren en bepalen of `Te Lang` nog te streng is voor pilotdata.

**Actueel hervatpunt (na sessie 43):**
- Planning-import slaat nu Reference Operation code-tijden ook op orderniveau op (Produceren/Nabewerken/Eindinspectie), en Efficiency leest die als fallback; eerstvolgende stap is 1 live LN-import draaien en per order valideren dat de drie tijdblokken zichtbaar en correct gescheiden zijn.

**Opgeslagen punt (op verzoek):**
- Bevestigd vastgelegd: bij import van Reference Operations worden code-tijden per order opgeslagen zodat Efficiency het verschil tussen Produceren, Nabewerken en Eindinspectie foutloos kan oppakken.

**Actueel hervatpunt (na sessie 44):**
- Time Tracking toont nu per station `daadwerkelijk / gepland`; kolom `Gepland` gebruikt nu primair het totaal van alle Reference Operations van de order.

**Actueel hervatpunt (na sessie 45):**
- Automatische planning-import is toegevoegd via map-watcher (`imports/planning`): nieuw/gewijzigd Excel-bestand start nu automatisch de import naar planning + efficiency.

**Actueel hervatpunt (na sessie 46):**
- Power Automate kan nu direct integreren via een beveiligde API endpoint (`importPlanningFromWebhook`) in Firebase Functions met idempotency en Excel URL import.

**Actueel hervatpunt (na sessie 47):**
- Firebase import is nu ook zonder Power Automate account operationeel via Storage-trigger (`importPlanningFromStorage`): upload naar `imports/planning/` start automatisch import naar planning + efficiency met idempotency en optionele machinefilter.

**Actueel hervatpunt (na sessie 48):**
- LOSSEN 12/18 heeft directe stationroutering en operator auto-loginflow (BH12/BH15/BH17/BH18) met anti-dubbeluren (`isSecondary`), terwijl de LOSSEN 12/18 planning-view actief staat als volledige planning met machinefilters (`Alle/BH12/BH15/BH17/BH18`).
- Laatste foutieve BH18-meeneemfilter in `LossenView` is weer teruggedraaid; volgende stap is live-validatie op de vloer met concrete lots (BH18-tab vs LOSSEN 12/18 view).

### Update sessie 48 (LOSSEN 12/18 routing, tabs, auto-login en gerichte rollback)

**Datum:** 7 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- LOSSEN 12/18 functioneel gelijkzetten aan de gewenste werkvloerflow:
    - directe routering vanaf BH12/BH15/BH17
    - BH18 behoudt diameter-routing
    - operator-overzicht en planningondersteuning voor lossers
    - geen dubbele urentelling bij auto-koppeling

**Wat is gedaan:**
- `WorkstationHub.jsx`
    - `LOSSEN_1218_SOURCE_STATIONS = {BH12, BH15, BH17}` en stationnaam `LOSSEN 12/18` doorgevoerd in routering.
    - `getLossenRoute()` gebruikt objectvorm (`{ mode, station }`) en schrijft doelstation expliciet weg.
    - Operator check-in uitgebreid met auto-koppeling naar LOSSEN 12/18 voor BH12/BH15/BH17/BH18 via secondary occupancy-record.
    - Uren-dubbeling geblokkeerd door secondary-records met `isSecondary` op 0 uur af te sluiten (zowel handmatig switchen als auto-checkout).

- `ProductReleaseModal.jsx`
    - Lossen-routering gelijkgetrokken met `WorkstationHub`: BH12/BH15/BH17 direct naar `LOSSEN 12/18`, BH18 via bestaande diameterregels.

- `Terminal.jsx`
    - LOSSEN 12/18 uit simple view gehaald zodat tabs mogelijk zijn.
    - Standaardtab voor LOSSEN 12/18 op `Lossen` gezet.
    - Planning-view voor LOSSEN 12/18 opgeleverd als volledige planningweergave met machinefilters (`Alle/BH12/BH15/BH17/BH18`).
    - Tijdens rollback-correctie is alleen de foutieve tussenvariant verwijderd; gewenste planningvariant staat nu actief.

- `LossenView.jsx`
    - Centrale filtering aangepast op LOSSEN vs LOSSEN 12/18 origins.
    - Laatste extra BH18-forceblok (die ook Wikkelen-items in LOSSEN 12/18 trok) is uiteindelijk teruggedraaid op verzoek.

**Belangrijke correcties tijdens sessie:**
- Runtime crash in `Terminal.jsx` opgelost (referentievolgorde `filteredOrders`/`lossenFilteredOrders`).
- Daarna rollback verfijnd: niet alles terug, alleen de foutieve laatste filtering; gewenste planning-view hersteld.

**Aangepaste bestanden:**
- `src/components/digitalplanning/WorkstationHub.jsx`
- `src/components/digitalplanning/Terminal.jsx`
- `src/components/digitalplanning/LossenView.jsx`
- `src/components/digitalplanning/modals/ProductReleaseModal.jsx`

**Validatie:**
- `get_errors` op aangepaste bestanden: geen fouten.
- ESLint op aangepaste bestanden: clean (laatste run zonder output).

**Openstaand / eerstvolgende stap:**
1. Live op pilotvloer valideren met 1 BH12, 1 BH17 en 1 BH18 lot.
2. Controlepunt per lot: doelstation na release, zichtbaarheid in LOSSEN-tab, zichtbaarheid in LOSSEN 12/18 planning, en occupancy-uren (geen dubbeltelling).
3. Indien BH18-weergave in LOSSEN 12/18 toch nog afwijkend is: alleen filterregels in `LossenView.jsx` finetunen, zonder Terminal-planning opnieuw te wijzigen.

### Update sessie 47 (Firebase Storage trigger + server-side machinefilter)

**Datum:** 7 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Firebase-kant volledig kant-en-klaar maken zonder afhankelijkheid van Power Automate account.

**Wat is gedaan:**
- Nieuwe Firebase Storage trigger toegevoegd: `importPlanningFromStorage`.
- Trigger start automatisch bij upload van `.xlsx/.xlsm/.xls` in `imports/planning/`.
- Idempotency op opslagbestanden toegevoegd via import-run document in `future-factory/integrations/import_runs`.
- Webhook endpoint uitgebreid met `allowedMachines` ondersteuning (bijv. `BH12,BH18` of array).
- Server-side importlogica filtert nu optioneel op geselecteerde machines vóór Firestore write.

**Aangepaste bestanden:**
- `functions/index.js`

**Validatie:**
- `node --check functions/index.js` succesvol.

**Openstaand / eerstvolgende stap:**
1. Deploy Firebase Functions.
2. (Optioneel) Standaard hybride filter zetten via `integration.allowed_machines`.
3. Testen door 1 LN Excel-bestand te uploaden naar Storage pad `imports/planning/`.

### Update sessie 46 (Power Automate API endpoint voor directe import)

**Datum:** 7 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Directe Power Automate-integratie mogelijk maken via API, zonder lokale watcher afhankelijkheid.

**Wat is gedaan:**
- Nieuwe Firebase HTTPS functie toegevoegd: `importPlanningFromWebhook`.
- Endpoint ondersteunt:
    - token-validatie via `X-Import-Token`
    - `fileUrl` download van Excel
    - parsing en import naar planning + efficiency
    - idempotency via `idempotencyKey`
    - duplicate bescherming (`409 duplicate`)
- Import-run logging toegevoegd in `future-factory/integrations/import_runs`.

**Benodigde request body (kern):**
- `fileUrl` (verplicht)
- `fileName`
- `provider`
- `fileModifiedAt`
- `idempotencyKey`
- `overwrite` (optioneel)

**Aangepaste bestanden:**
- `functions/index.js`
- `functions/package.json`

**Validatie:**
- `node --check functions/index.js` succesvol.
- File-errors: geen fouten.

**Openstaand / eerstvolgende stap:**
1. In Firebase Functions config token zetten (`power_automate.import_token` of `integration.import_token`).
2. Functions deployen.
3. Power Automate HTTP-stap koppelen aan de nieuwe endpoint URL.

### Update sessie 45 (Auto-import watcher voor planning)

**Datum:** 7 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Handmatige importstap verminderen door import automatisch te starten zodra een Excel-bestand in een vaste directory wordt geplaatst of geupdate.

**Wat is gedaan:**
- Nieuw script `scripts/auto-planning-import.cjs` toegevoegd.
- Script scant of monitort map `imports/planning` op `.xlsx/.xlsm/.xls`.
- Bij nieuwe of gewijzigde bestanden wordt automatisch dezelfde LN-consolidatielogica uitgevoerd:
    - planning update (`future-factory/production/digital_planning`)
    - efficiency update (`future-factory/production/efficiency_hours`)
    - Reference Operation splits + orderniveau stationvelden blijven behouden.
- Statebestand `.auto-planning-import-state.json` voorkomt dubbele imports van ongewijzigde bestanden.

**Nieuwe npm scripts:**
- `import:planning:auto` (watch mode)
- `import:planning:once` (eenmalige scan)

**Aangepaste bestanden:**
- `scripts/auto-planning-import.cjs`
- `package.json`

**Validatie:**
- Syntaxcheck script: OK (`node --check`).
- File-errors: geen fouten.

**Openstaand / eerstvolgende stap:**
1. Lokale credentials valideren (`gcloud auth application-default login`).
2. Watcher starten en testbestand in `imports/planning` plaatsen.
3. In Firestore controleren of import bij bestandswijziging opnieuw triggert.

### Update sessie 44 (Time Tracking: stationtijden als daadwerkelijk/gepland)

**Datum:** 7 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- In Time Tracking per station direct zichtbaar maken: werkelijke uren versus ingeplande uren.
- Voor kolom `Gepland` de totale geplande orderuren nemen uit alle Reference Operations samen.

**Wat is gedaan:**
- In `TimeTrackingView` is operation-classificatie toegevoegd (`production` / `post` / `qc`) op basis van work center + reference op code.
- Geplande stationuren worden nu per order afgeleid uit `order.operations` (som van alle Reference Operations).
- Tabelweergave aangepast naar `daadwerkelijk / gepland` voor:
    - Wikkelen
    - Lossen
    - Nabewerken
    - Eindinspectie
- Kolom `Gepland` gebruikt nu eerst het ordertotaal uit Reference Operations; daarna pas fallback op bestaande totalen/efficiency-data.

**Aangepast bestand:**
- `src/components/planning/TimeTrackingView.jsx`

**Validatie:**
- File-errors: geen fouten.
- Productiebuild succesvol: `npm run build` (exit code 0).

**Openstaand / eerstvolgende stap:**
1. Live controleren op 2-3 orders met meerdere Reference Operations of `Gepland` exact overeenkomt met LN totaalsom.
2. Bevestigen dat `Lossen` gepland momenteel bewust `0.0h` kan zijn (geen aparte reference op bucket), tenzij gewenst om anders te modelleren.

### Update sessie 43 (Reference Operation code-tijden op order + efficiency fallback)

**Datum:** 7 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Bij import van Reference Operations de code-uren niet alleen in efficiency-docs bewaren, maar ook direct op het order opslaan zodat downstream schermen (o.a. Efficiency/Capacity/Terminal) foutloos Produceren vs Nabewerken vs Eindinspectie kunnen onderscheiden.

**Wat is gedaan:**
- **PlanningImportModal uitgebreid:**
    - Per order worden nu expliciet opgeslagen:
        - `plannedHoursBH` / `plannedMinutesBH` (Produceren)
        - `plannedHoursNabewerken` / `plannedMinutesNabewerken` (Nabewerken)
        - `plannedHoursBM01` / `plannedMinutesBM01` (Eindinspectie)
    - Nieuwe `referenceOperationTimes` map toegevoegd met per Reference Operation:
        - geplande uren
        - werkelijke uren
        - work center
        - bucket (`production` / `post` / `qc`)

- **EfficiencyDashboard fallback verbeterd:**
    - Als `productionTimeTotal` / `postProcessingTimeTotal` / `qcTimeTotal` in efficiency-data ontbreken of 0 zijn, worden nu automatisch de orderniveau splitvelden gebruikt.
    - `standardTimeTotal` en `minutesPerUnit` krijgen dezelfde fallback zodat efficiencyberekening en stageweergave consistent blijven.

**Aangepaste bestanden:**
- `src/components/digitalplanning/modals/PlanningImportModal.jsx`
- `src/components/digitalplanning/EfficiencyDashboard.jsx`

**Validatie:**
- File-errors gecontroleerd op beide bestanden: geen fouten.
- Productiebuild succesvol: `npm run build` (exit code 0).

**Openstaand / eerstvolgende stap:**
1. Een echte LN-import draaien en een order met meerdere Reference Operations controleren.
2. Valideren dat `plannedHoursBH`, `plannedHoursNabewerken` en `plannedHoursBM01` op de order gevuld zijn.
3. In Efficiency controleren dat dezelfde order drie gescheiden tijdblokken toont (Prod/Post/QC), ook wanneer efficiency-doc deels onvolledig is.

### Update sessie 42 (AI ingestiefilter tuning + fijnere diagnose)

**Datum:** 7 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- De lage AI-analysecijfers verder terugbrengen naar echte data-uitvalredenen in plaats van te strikte filterlogica.

**Wat is gedaan:**
- **AI afgerond-detectie verbreed:** `AiPredictionView` accepteert nu naast `completed/shipped` ook archiefrecords, gereed/afgerond-statussen en completion-signalen uit history-events.
- **Duurfallbacks versterkt:** naast directe `station_start -> finished/completed` duur wordt nu ook de gecombineerde stationrange en een history-start/eind fallback gebruikt wanneer tussenstappen incompleet zijn.
- **Diagnose verfijnd:** het diagnoseblok toont nu extra uitvalredenen:
    - zonder productcode
    - niet afgerond
    - te kort
    - te lang
- **Analysepijplijn geharmoniseerd:** kandidaatselectie en diagnose gebruiken nu dezelfde helperlogica, zodat de UI-cijfers en de echte AI-analyse niet uit elkaar lopen.

**Aangepast bestand:**
- `src/components/digitalplanning/AiPredictionView.jsx`

**Validatie:**
- File-errors gecontroleerd op het gewijzigde bestand: geen fouten.
- Productiebuild succesvol: `npm run build` (exit code 0).
- Vite devserver actief op poort `3000` voor livecontrole.

**Openstaand / eerstvolgende stap:**
1. In de UI de 12 diagnosewaarden noteren voor zowel Efficiency als Teamleader flow.
2. Specifiek controleren of `Te Lang` records echte outliers zijn of dat de bovengrens van `10080` minuten voor pilotdata moet worden verruimd.
3. Alleen als de aantallen daarna nog te laag blijven: completion-detectie uitbreiden met extra stationspecifieke eindsignalen uit ruwe history-data.

### Update sessie 41 (AI smoketest + bronmodusfix Teamleader)

**Datum:** 6 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Verifiëren waarom AI Voorspellingen weinig data toont.
- Zekerstellen dat Teamleader-AI dezelfde databronmodus gebruikt als de rest van Digital Planning.

**Wat is gedaan:**
- **Runtime smoketest uitgevoerd op Firestore paden** (tracking, efficiency_hours en archive/items voor huidige + 2 vorige jaren).
- **Belangrijke bevinding:** alle directe terminal-reads gaven `PERMISSION_DENIED` (insufficient permissions). Daardoor kon geen harde server-side count vanuit CLI worden opgehaald.
- **Functionele fix in TeamleaderHub:** `AiPredictionView` krijgt nu expliciet `dataSourceMode` door in de efficiency-tab, zodat de AI-view niet stilzwijgend op default `current` blijft staan.
- **Diagnoselaag in AI-view toegevoegd:** blok `AI Ingestie Diagnose` toont live in de UI:
    - bronmodus (`pilot-read` of `current`)
    - aantallen tracking/archief/standaarden
    - kandidaten in pipeline
    - records met productcode
    - afgerond/gereed
    - records met geldige duur
    - geanalyseerde producten

**Aangepaste bestanden:**
- `src/components/digitalplanning/TeamleaderHub.jsx`
- `src/components/digitalplanning/AiPredictionView.jsx`

**Validatie:**
- File-errors gecontroleerd op beide gewijzigde bestanden: geen fouten.
- Productiebuild succesvol: `npm run build` (exit code 0).

**Openstaand / eerstvolgende stap:**
1. In UI de diagnosewaarden van AI-view uitlezen voor zowel Efficiency als Teamleader flow.
2. Op basis van die waarden gericht bijsturen (completion-detectie, duurgrenzen of productkey-fallbacks).
3. Na stabilisatie diagnoseblok eventueel achter featureflag zetten of weer verwijderen.

### Update sessie 40 (Order popup + lotdetail in Time Tracking)

**Datum:** 5 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Inzichtelijk maken wat er onder 1 orderregel valt in Order Time Analysis.
- Per lot tonen hoe stationtijden zijn opgebouwd.

**Wat is gedaan:**
- **Orderniveau bevestigd:** Order Time Analysis groepeert op `orderId`.
- **Nieuwe order popup toegevoegd:**
    - In de orderkolom staat nu `Bekijk lots (N)`.
    - Popup toont alle lots binnen de gekozen order.
    - Per lot zichtbaar:
        - lotnummer
        - machine
        - status
        - Wikkelen
        - Lossen
        - Wacht L->N
        - Nabewerking
        - totaaluren
        - start/eindtijden per stap

- **Technische opbouw verbeterd:**
    - Lotmetrics gecentraliseerd via helperfuncties zodat zowel ordertotaal als popup dezelfde bronberekening gebruiken.
    - History en timestamp parsing gedeeld toegepast om inconsistenties tussen formaten beter op te vangen.

**Belangrijke observatie:**
- Buildvalidatie op deze wijziging liet geen bestandsfouten zien.
- In deze omgeving werd de volledige productiebuild soms laat afgebroken met exitcode 143, terwijl de compilefase zelf succesvol doorloopt.

**Openstaand / eerstvolgende stap:**
1. Kolomvolgorde en stapdefinitie volledig afronden op procesvolgorde: Wikkelen, Lossen, Nabewerken, Eindinspectie (BM01).
2. Eventueel `Wacht L->N` verplaatsen naar detailniveau als afgeleide KPI i.p.v. hoofdkolom.
3. Productie Output vraag nog expliciet afronden: bevestigen en eventueel bijstellen of huidige orders in die KPI volledig worden meegeteld.

**Validatie:**
- Relevante code gecompileerd zonder file errors.
- Devserver beschikbaar op poort 3000 voor livecontrole.

### Update sessie 39 (Pilot bronkoppeling + Efficiency/Time Tracking analyse hersteld)

**Datum:** 5 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Pilot read-only databron consistent doortrekken in rapportage- en analyseviews.
- Efficiency en Time Tracking laten rekenen op echte productiedata, inclusief archiefrecords en history-events.

**Wat is gedaan:**
- **Pilot/current bronkoppeling voltooid:**
    - `EfficiencyDashboard`, `TimeTrackingView` en `GanttChartView` gebruiken nu dezelfde `dataSourceMode` als `CapacityPlanningView`.
    - Gantt is in `pilot-read` modus read-only gemaakt; drag/write naar planning is dan geblokkeerd.

- **EfficiencyDashboard hersteld:**
    - Leest nu bronafhankelijk uit pilot/current paden.
    - Default filter staat op `all` zodat afgeronde productie niet direct wegvalt.
    - Fallback toegevoegd voor orders met tracking maar zonder efficiency-import.
    - Departmentfilter robuuster gemaakt via `department`, `departmentId`, factory config en machine-afleiding (`BH` → Fittings, `BA` → Pipes, `BM` → Spools).
    - Bestede tijd leest nu niet alleen tracking start/stop, maar ook order/productvelden zoals `actualHours`, `totalActualHours`, `productionMinutes`.
    - Bij archiefmodus wordt nu ook planning-archief gekoppeld voor betere ordercontext.

- **Time Tracking fors uitgebreid:**
    - `Dag`, `Week` en `Maand` mode toegevoegd, inclusief `Vorige`, `Volgende`, `Vandaag` navigatie.
    - Onnodige statusfilters verwijderd (`Verzendklaar`, `Verzonden`).
    - Orders worden nu meegenomen op basis van **echte productie-activiteit** in `tracked_products`, niet alleen op `plannedDate`.
    - Archiefitems uit `production/archive/{year}/items` worden meegelezen zodat gereedgemelde producten ook in analyse verschijnen.
    - Stationanalyse toegevoegd per order:
        - `Wikkelen`
        - `Lossen`
        - `Wacht L→N`
        - `Nabewerking`
    - Compacte totalenbalk boven de tabel toegevoegd voor dezelfde stations.

- **History-gebaseerde stapgrenzen toegevoegd:**
    - Voor records waar timestamps incompleet of inconsistent zijn, worden stationovergangen nu afgeleid uit history-events zoals:
        - `Start Wikkelen`
        - `Doorgestuurd van Wikkelen naar Lossen`
        - `Doorgestuurd van Lossen naar Nabewerking`
        - `Verwerking afgerond`
    - Dit was nodig voor archiefproducten waar bijvoorbeeld `wikkelen_start` of `nabewerking_end` niet expliciet aanwezig is.

**Belangrijke bevinding:**
- Sommige records tonen verschillende timestamp-formaten:
    - ISO-string in UTC, bv. `2026-03-31T09:44:30.861Z`
    - Firestore timestamp in lokale tijd, bv. `31 March 2026 at 13:47:45 UTC+2`
- Deze lijken anders, maar zijn na conversie vergelijkbaar. Toch blijven er edge cases waarbij history leidend moet zijn in plaats van losse timestampvelden.

**Openstaand / eerstvolgende stap:**
1. Eén of twee concrete archieforders live nalopen in de UI en vergelijken met ruwe history-data.
2. Indien nodig een uitklapregel of debugdetail per order toevoegen met exacte start/eindtijden per station.
3. Daarna pas finetunen van UX/presentatie; eerst de stationberekening 100% betrouwbaar maken.

**Validatie:**
- Herhaaldelijk `npm run build` uitgevoerd na elke grote wijziging: succesvol.
- Vite devserver gestart op poort `3000` voor live verificatie.

### Update sessie 37 (Hervatting confirm-flow + stille alerts)

**Datum:** 5 april 2026 | **Branch:** `pilot-dev`

**Doel bij hervatten:**
- De resterende `confirm`-locaties volledig migreren in 1 laatste batch.
- Daarna de top 5 alert-zware bestanden stiller maken, zodat popups alleen nog voor echte fouten worden gebruikt.

**Concreet uitvoerplan (volgende sessie):**
1. Openstaande `confirm`-aanroepen inventariseren (globale zoekactie).
2. Migrate in 1 batch naar centrale, consistente confirm-helper.
3. Per aangepast scherm een korte smoke-test uitvoeren op operatorflow (OK/Cancel paden).
4. Top 5 bestanden met meeste `alert()` calls refactoren naar stille UX (toast/statusmelding) met fout-only popup fallback.
5. Eindcontrole: build + snelle regressie op kritieke stations (Lossen, Mazak, BM01).

**Acceptatiecriteria:**
- Geen losse, inconsistente confirm-patronen meer op bekende openstaande locaties.
- Geen overmatige blokkerende alerts bij normale operator-acties.
- Foutmeldingen blijven zichtbaar en ondubbelzinnig.
- Build blijft groen.

**Notitie:**
- Dit is bewust opgesplitst in twee batches (confirm eerst, alerts daarna) om regressierisico laag te houden tijdens pilotwerk.

### Update sessie 38 (Volledige notificatie-opschoning afgerond)

**Datum:** 5 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Alle blokkerende browser-popups (`alert()`) en tijdelijke globale alert-varianten uit de appcode verwijderen.
- Notificaties uniform laten lopen via het bestaande NotificationContext-systeem.

**Wat is gedaan:**
- Alle directe `alert()` calls in `src` gemigreerd.
- Tijdelijke globale varianten (`window.__APP_ALERT__`, daarna `window.appAlert`, daarna `window.notify`) stapsgewijs uitgefaseerd.
- In componenten met notificatiecontext zijn meldingen lokaal gestandaardiseerd naar `notify(...)` via `useNotifications()`.
- Confirm-flow bleef intact via `showConfirm(...)` op plaatsen waar gebruikersbevestiging nodig is.

**Eindstatus (gemeten):**
- `alert(` in `src`: **0**
- `window.__APP_ALERT__(` in `src`: **0**
- `window.appAlert(` in `src`: **0**
- `window.notify(` in `src`: **0**

**Validatie:**
- Type/compile checks op gewijzigde kernbestanden zonder fouten.
- Volledige productiebuild (`npm run build`) succesvol afgerond na de laatste migratie.

**Resultaat:**
- Notificaties zijn nu consistent, niet-blokkerend en centraal beheerd.
- Codebase is leesbaarder en schoner voor vervolgwerk (verdere semantische tuning per scherm kan later zonder technische debt op alert-niveau).

### Update sessie 36 (Mazak Print Preview Fix)

**Datum:** 5 april 2026 | **Branch:** `pilot-dev`

**Doel:** Print preview in Mazak labels matcht niet met daadwerkelijke print. Preview toonde correct formaat, maar echte print had vervorming (QR codes, verticale tekst, layout).

**Root Cause:** MazakView stuurde alleen product `data` naar print queue ZONDER gegenereerde ZPL code. Dit resulteerde in fallback-rendering die niet overeenkwam met de HTML/canvas preview.

**Wat is er gedaan:**
- **MazakView.jsx -> Print Job Generatie:**
  - Importeer `generatePrintData` (zplHelper) en `queuePrintJob` (printService)
  - In `handlePrintLabels`: Roep `generatePrintData()` aan met dezelfde parameters als preview → genereert echte ZPL
  - Stuur gegenereerde ZPL via `queuePrintJob()` naar print queue (consistente API)
  - ZPL wordt nu correct gerenderd door Zebra printer

- **Verificatie:** `npm run build` geslaagd, alle 2788 modules getransformeerd.

**Resultaat:** Preview en daadwerkelijke print gebruiken nu dezelfde rendering engine (ZPL generation) met identieke settings (DPI, template elements, data processing).

**Volgende stap:** Live uittesten op werkvloer om verschil te controleren.

---

### Update sessie 35 (Archivering Afgekeurde Producten)

**Datum:** 5 april 2026 | **Branch:** `pilot-dev`

**Doel:** Afgekeurde producten (Definitieve Afkeur) netjes uit de actieve productielijst (`tracking`) halen en archiveren in een specifieke map per jaar, net als bij gereedgemelde producten.

**Wat is er gedaan:**
- **Nieuw Archiefpad (`dbPaths.jsx`):** Helper `getArchiveRejectedPath(year)` toegevoegd voor veilige archivering onder `future-factory/production/archived_rejected/{year}`.
- **Opschonen Actieve Tracking:** In `BM01Hub.jsx`, `LossenView.jsx`, `WorkstationHub.jsx`, `MazakView.jsx` en `ProductReleaseModal.jsx` wordt bij een statuswijziging naar 'Definitieve Afkeur' het product nu rechtstreeks weggeschreven naar het nieuwe archief en fysiek verwijderd uit de actieve `tracking` database. Dit houdt de actieve query's snel.
- **Validatie:** Zowel de linter als de Vite productie-build (`npm run build`) slagen foutloos na deze wijzigingen.

---

### Update sessie 34 (Mazak Printflow, Flens Labels & Lotnummer Fixes)

**Datum:** 3 april 2026 | **Branch:** `pilot-dev`

**Doel:** MazakView afronden met printfunctionaliteit, flens-labeling verbeteren en BH12 lotnummers corrigeren.

**Wat is er gedaan:**

- **MazakView.jsx (Compleet vernieuwd):**
    - UI opgesplitst in 3 duidelijke tabs: **Planning**, **Inbox / Printen** en **Gereedmelden**.
    - **Inbox / Printen:** Producten (voornamelijk flenzen) komen hier als bulk/serie binnen. Voorzien van een grote "Print Labels" knop. 
    - **Print Modal:** Pop-up toont nu een dynamisch vergrote (tot 250%) preview van het label. Templates met tags `FLENZEN` of `CODE` worden automatisch voorgeselecteerd. Bij printen gaan de opdrachten naar de Firestore `print_queue`.
    - **Gereedmelden:** Items schuiven hierheen ná het printen. Inclusief optie om individuele labels te **Herprinten**.
    - **Planning:** Overzicht van inkomende orders. Inclusief "Deze Week" vs "Alle Weken" filter en robuuste zoekbalk.

- **Slimme Flens Labels (`labelHelpers.jsx`):**
    - Flens herkenning veel robuuster gemaakt (triggert nu op `FL` en pakt ook itemCode mee).
    - Nieuwe dynamische variabelen toegevoegd voor de Label Designer: `{flangeIdLine}`, `{flangePressureLine}`, `{flangeConnectionLine}`, `{flangeDrillingLine}` en `{extraCode}`.
    - Systeem vertaalt ruwe beschrijvingen nu automatisch naar volzinnen (bijv. `DRILLING ASA150 LIMITED TORQUE`, ondersteunt ook JIS, DIN, ANSI en PN).
    - "Flenzen" als vaste categorie/folder toegevoegd in `AdminLabelDesigner` en `AdminLabelManager`.

- **BH12 / Machine Code Fixes:**
    - De methode `getMachineCode` vertaalde stations zoals `BH12` of `40BH12` foutief naar `012`.
    - Gecorrigeerd in de gehele app (`ProductionStartModal`, `AdminPrinterManager`, `AdminLotCounters`) zodat dubbelcijferige BH stations nu altijd netjes de '4' prefix krijgen (BH12 ➔ 412).

- **Testomgeving Archivering:**
    - 4 componenten (`LossenView`, `BM01Hub`, `PlanningSidebar`, `AiPredictionView`) bevatten nog hardcoded verwijzingen naar het `future-factory` productiearchief.
    - Dit is vervangen door de dynamische `getArchiveItemsPath(year)` helper, zodat testomgevingen (zoals artifacts) netjes hun eigen archief behouden en niet naar live productie wegschrijven.

**Volgende stap:** 
Deployen via Vercel naar de pilotomgeving en live uittesten op de werkvloer.

---

### Update sessie 32 (Serie-groepering Wikkelen/Lossen + MazakView)

**Datum:** 3 april 2026 | **Branch:** `pilot-dev`

**Wat is gedaan:**

- **Serie-groepering in Terminal Wikkelen tab (TerminalProductionView.jsx):**
    - Producten met hetzelfde `seriesGroupId` worden nu als inklapbare groep getoond in de linkerlijst.
    - Groepen starten ingeklapt. Klikken op een groepsheader klapt open/dicht én selecteert het eerste item.
    - Hint tekst in header: "Selecteer voor gereedmelden in rechterpaneel".
    - `Serie gereedmelden (Nx)` knop is uitsluitend in het rechter detailpaneel zichtbaar (niet links).
    - `bulkProductsToRelease` state toegevoegd in `Terminal.jsx`; `handleOpenReleaseModal(product, bulkProducts)` wired naar `ProductReleaseModal`.

- **LossenView twee-paneel layout:**
    - Herschreven van single-pane (direct modal op tap) naar left-list + right-detail layout.
    - Klikken op item of serie-header stelt alleen selectie in — actie pas via knoppen in rechterpaneel.
    - Serie-groepen inklapbaar (zelfde patroon als Wikkelen).
    - `supportsSeriesGrouping = !isBM01 && !isMazak && !isNabewerking` guard: BM01, Mazak én Nabewerking tonen nooit groepen.

- **MazakView.jsx — nieuw standalone component:**
    - Bestand: `src/components/digitalplanning/MazakView.jsx`
    - Eigen Firebase data-filtering op `currentStation === "MAZAK"`.
    - Twee-paneels layout (identiek aan LossenView), geen serie-groepering.
    - `handlePostProcessingFinish` met flow: `FINISH_PROCESSING` → BM01/Eindinspectie.
    - Scan-input met `QR_CODE_OK_CONFIRMATION` ondersteuning.
    - Placeholder in rechterpaneel: "Printstap kan hier stationspecifiek aan Mazak worden toegevoegd".
    - Gebruik van `PostProcessingFinishModal` voor approve/reject flow.

- **Routing MazakView:**
    - `Terminal.jsx`: `if (isMazak)` branch in `isSimpleViewStation` block → rendert `<MazakView>`. Lossen tab: `{isMazak ? <MazakView> : <LossenView>}`.
    - `WorkstationHub.jsx`: lossen tab rendert `<MazakView>` wanneer `selectedStation === "MAZAK"`.
    - `DepartmentStationSelector.jsx`: **geen wijziging nodig** — station-tegel stuurt door naar WorkstationHub, Mazak-routing zit in WorkstationHub/Terminal.

- **ActiveProductionView.jsx:**
    - `groupedSeries` retourneert lege Map wanneer `isMazakStation` → geen groepen in Wikkelen-tab van de Hub bij Mazak.

**Build status:** ✓ `npm run build` geslaagd — 2788 modules getransformeerd.

**Openstaand:**
- Mazak printstap: placeholder aanwezig in MazakView rechterpaneel, logica nog niet geïmplementeerd. Gebruiker heeft aangegeven dat er een print stap bij Mazak moet. Afstemmen wat precies geprint moet worden en of het verplicht is vóór doorsturen naar BM01.

---

### Update sessie 31 (Import + Capaciteitsplanning + BH12 flowrouting)

- Doel van deze sessie: import- en capaciteitslogica laten aansluiten op echte LN data en routing voor BH12 aanscherpen.

- Import en efficiency-splitsing verbeterd:
    - Kolommapping uitgebreid zodat zowel oude als nieuwe PO-tekst kolomnamen worden herkend.
    - item en itemDescription worden beide consequent gevuld bij import, zodat omschrijvingen overal zichtbaar blijven.
    - Efficiency-uren worden gesplitst opgeslagen in productie, nabewerking en QC.

- Capaciteitsplanning verbeterd:
    - Benodigde order-uren tellen nu ook QC uren mee in de totaalsom.
    - QC vraag wordt per afdeling naar het juiste station gestuurd:
        - BH machines naar BM01
        - BA machines naar BA01
    - Departmentfilter in Benodigde order-uren werkt nu ook met LN machinecodes met 40-prefix (bijv. 40BH18).

- Root-cause bevinding op basis van echte LN dump:
    - Eindinspectie zat in de praktijk op reference operation 1740 met work center 40BM01.
    - Daardoor werkte classificatie puur op eindcode niet betrouwbaar.
    - Opgelost door work center mee te nemen per operatie en daarop te classificeren (BM01/BA01 als QC).

- Central Planner Hub filtergedrag gefixt:
    - In planner-context mag afdeling gekozen worden.
    - In teamleader-context blijft afdeling vergrendeld op toegewezen afdeling.

- BH12 routing aangepast na gebruikersinput:
    - Nieuwe regel: na Lossen moeten producten die met FL beginnen naar Mazak.
    - Alle overige producten gaan naar Nabewerking.
    - In ProductReleaseModal is dit nu functioneel doorgezet in de echte targetStation update (niet alleen weergavetekst).

- Belangrijke operationele noot:
    - Bestaande al-geimporteerde records behouden oude classificatie.
    - Voor zichtbaar effect in Capaciteitsplanning en station-routing is opnieuw importeren van de relevante orders nodig.

- Eerstvolgende validatie op de vloer:
    - Test BH12 met FL voorbeeld (bijv. FL 50 EDF11 FLTB PN16) en controleer route naar Mazak na Lossen.
    - Test niet-FL voorbeeld op BH12 en controleer route naar Nabewerking.
    - Controleer in Capaciteitsplanning dat Benodigde order-uren in Fittings overeenkomen met filter Alles voor dezelfde order-set.
    - Controleer dat BM01/BA01 alleen verschijnen bij afdelingen met daadwerkelijke QC vraag.

### Update sessie 30 (Implementatie "Gereed" Tab)

- **Doel:** Een extra "Gereed" tab toevoegen in de `Terminal` om operators inzicht te geven in recent voltooide producten, met name producten die naar "Nabewerken" zijn gegaan. Dit is belangrijk voor de overdracht tussen ploegen.

- **Iteratie 1 & 2:**
    - Eerste pogingen om de "Gereed" tab te implementeren door de bestaande `LossenView` component te hergebruiken met een nieuwe `viewMode="completed"`.
    - Dit leidde tot een reeks problemen:
        1.  **Build Fout:** Een dubbele `import` van `LossenView` in `Terminal.jsx` veroorzaakte een "Identifier has already been declared" fout. Dit is opgelost.
        2.  **Runtime Fout:** Een `ReferenceError: Cannot access 'isBM01' before initialization` in `LossenView.jsx` door een verkeerde variabele-volgorde. Dit is opgelost.
        3.  **Logica Fout:** De filterlogica voor de "Gereed" tab was incorrect. De poging om een 5-dagen filter toe te passen voldeed niet aan de wens van de gebruiker.

- **Conclusie & Herstel:**
    - Na meerdere pogingen werd duidelijk dat het hergebruiken van `LossenView` de verkeerde aanpak was. De gebruiker bevestigde: "gereed heeft niets met lossenvieuw te maken".
    - Alle wijzigingen aan `LossenView.jsx` en `Terminal.jsx` met betrekking tot de "Gereed" tab zijn volledig teruggedraaid.

- **Volgende Stap:** De `Terminal` en `LossenView` componenten zijn hersteld naar een stabiele basis. De volgende stap is om de "Gereed" tab opnieuw en op de juiste manier te implementeren, waarschijnlijk met een nieuwe, aparte component die specifiek voor deze functionaliteit wordt gebouwd.

---

### Pauzestand Voor Hervatten (31 maart 2026)

- **Opslagpunt bevestigd op verzoek gebruiker:** "dat kan morgen pas".
- **Context:** Meerdere fixes zijn doorgevoerd in `LossenView.jsx` om de productlijst correct te filteren.
    - **Afkeur-filter:** Producten met status "Tijdelijke Afkeur" of "Definitieve Afkeur" worden nu correct verborgen.
    - **Diameter-detectie:** De logica is aangepast om het eerste getal in de omschrijving te pakken (bv. `350` in `Elb 350R1.5/90`), wat routingproblemen voor complexe fittingen oplost.
    - **OK-QR Alert:** Een `alert()` is toegevoegd om operators in Lossen te informeren dat metingen verplicht zijn en de OK-QR daar niet werkt.
- **Eerstvolgende stap bij hervatten:** Gebruiker zal de volledige flow in de `Lossen`-view testen, inclusief het verwerken van een product door de meetwaarden in te vullen.

---

### Nieuwe Pilot Doelen & Wensen (April 2026)

- **BM01 scanner input werkt niet:** Scanner input functioneert niet in BM01. Oplossen zodat producten gescand kunnen worden.
- **Aangeboden lijst resetten:** Controleren of de aangeboden lijst in BM01 elke dag automatisch op 0 wordt gezet.
- **Mobile inspector pakt geen lotnummers van gereedgemelde producten:** In de mobiele inspector worden lotnummers niet opgehaald voor producten die al gereedgemeld zijn. Oplossen zodat deze producten correct verschijnen.
- **Nieuw Excel format planning:** De planning import gaat via een ander Excel format lopen, inclusief efficiëntie-uren en gerelateerde data.
- **Voorbereiding uitbreiding BH12 & Mazak:** Onderzoeken en voorbereiden of BH12 en de Mazak na de eerste pilotmaand aan het systeem toegevoegd kunnen worden.
- **Extra tab 'Gereed' in werkstations:** Voeg in de werkstations een extra tab toe met producten die gereed zijn, zodat een operator (bijv. bij ploegoverdracht) direct kan zien of een product door de andere ploeg al gemaakt is.
- **Gecombineerd Lossen-station (BH12 & BH18):** Maak een nieuw, overkoepelend "Lossen" station specifiek voor BH12 en BH18.
- **Lossen tab verwijderen uit individuele stations:** Zorg dat de tab "Lossen" verdwijnt uit de individuele interfaces van werkstations BH12 en BH18, aangezien dit naar het gecombineerde station verplaatst wordt.

**Laatst bijgewerkt:** 30 maart 2026 (sessie 28)
**Branch:** `FPiFF-may-build`  
**Doel:** compacte overdracht voor hervatten van pilotwerk richting 30 maart

---

### Update sessie 29 (Filter-regressie in Lossen)
- **Gesprek opgeslagen met de notitie:** de "Lossen" view toont momenteel ook producten die al gereed zijn.
- **Analyse:** Dit is waarschijnlijk een neveneffect van de vereenvoudigde filterlogica in `LossenView.jsx` die recent is doorgevoerd om de BH18/Centraal Lossen-scheiding te testen. De huidige filter (`return origin === "BH18" && ...`) is te breed en houdt geen rekening met de eindstatus van een product.
- **Vervolgactie (geparkeerd):** De filterlogica in `processData` van `LossenView.jsx` moet worden uitgebreid om voltooide of gearchiveerde producten uit te sluiten, zodat alleen relevante, actieve items worden getoond. Dit wordt later opgepakt.

---

De pilotbranch bevat meerdere afgeronde verbeteringen voor planning, printing, permissies en AI. De belangrijkste open risico's zitten nog in:

1. LN planning import moet nog met een echt userbestand definitief gevalideerd worden.
2. Terminal/Workstation zichtbaarheid van geimporteerde orders moet end-to-end getest blijven.
3. ZM400 kalibratie werkend — lotnummer-batch en queue-label snijgedrag live bevestigd; orderlabel-flow vanuit Print Station nog live te valideren.
4. Algemene pilot validatie op de vloer moet nog gebeuren met operators.
5. Verticale tekst op orderlabels (onder QR-codes) is nog niet definitief goed: overlap is opgelost, maar exacte positionering/schaal in preview vs fysieke print is nog in finetune.

### Update sessie 28 (Lossen meetvelden + productie deploy)

- **Lossen Vrijgeven-popup aangepast voor interactieve meetwaarden in de Lossen-tab.**
- **Uitgevoerd in `ProductReleaseModal.jsx`:**
    - modal ondersteunt nu expliciete Lossen-context via `forceLossenMode`, zodat meetvelden ook zichtbaar zijn bij huidige producten die intern op `Wacht op Lossen` of station `LOSSEN` staan.
    - meetveldlogica is product- en mof-afhankelijk gemaakt.
    - CB/TB-herkenning is robuuster gemaakt voor codes zoals `CBCB` en `TBTB`.
- **Definitieve meetveldregels die nu zijn ingebouwd:**
    - standaard fittings zoals **Elbow**, **Redcon**, **Tee** en vergelijkbare types:
        - altijd `TW`
        - plus `TWcb` bij CB-mof
        - plus `TWtb` bij TB-mof
    - **Flens**:
        - alleen `TF`
    - **Coupler**:
        - `TWco` bij CB-mof
        - `TWto` bij TB-mof
- **Compatibiliteit:**
    - bij opslag wordt `TWco` ook als `TWc` weggeschreven wanneer `TWc` nog leeg is, zodat oudere rapportages blijven werken.
- **Uitgevoerd in `LossenView.jsx`:**
    - `ProductReleaseModal` krijgt nu `forceLossenMode={true}` mee vanuit de Lossen-tab.
- **Gebruiker-gevalideerde concrete case:**
    - producttekst `ELB 150R1.5/30 EST20 CBCB` moet nu `TW` en `TWcb` tonen in de popup.
- **Validatie:**
    - editor/probleemcontrole zonder fouten op gewijzigde Lossen-bestanden.

### Productie deploy uitgevoerd (30 maart 2026)

- **Vercel productie-deploy direct vanaf lokale workspace uitgevoerd** met `npx vercel --prod --yes`.
- **Build vooraf succesvol afgerond** met `npm run build`.
- **Live productie-URLs:**
    - `https://future-factory.vercel.app`
    - `https://futurefactoryapp-11tqlwbx6-richard-van-heerdes-projects.vercel.app`
- **Belangrijk:**
    - deployment is gedaan vanaf de huidige lokale werkboom,
    - dus wijzigingen staan live op Vercel maar zijn op dit moment niet automatisch gecommit of gepusht naar Git.

### Update sessie 26 (planning import + selectie lopende planning)

- **Direct probleem opgelost:** importfout bij `.xlsm` en geplakte Excel-data (`Fout bij het verwerken van het bestand` / `Geen geldige data gevonden`).
- **Uitgevoerd in `PlanningImportModal.jsx`:**
    - worker-afhandeling robuuster gemaakt met timeout en chunk-support.
    - paste-flow toegevoegd en daarna verbeterd voor echte Excel-kopieen:
        - CRLF/LF parsing,
        - trim van trailing lege tab-kolommen,
        - automatische detectie van de echte headerrij (`Machine` + `order`),
        - verwerking via toegestane sheetnaam (`40BM01`) zodat workerfilter matcht.
- **Nieuwe gewenste workflow gebouwd (lopende planning selecteren op 2 manieren):**
    - manier 1: **weekselectie** (`Week t/m ...`) met knop: selecteert vroege weken.
    - manier 2: **handmatige orderselectie** per rij met checkbox (`In Planning`).
    - bulk-acties toegevoegd: `Alles zichtbaar` en `Alles verborgen`.
- **Belangrijk gedrag voor vervolgimports (gevraagde pilotlogica):**
    - niet-geselecteerde orders worden nu **wel geimporteerd/opgeslagen**, maar met `planningHidden: true`.
    - daardoor blijven ze beschikbaar in data voor volgende imports, zonder dat ze telkens opnieuw handmatig uitgesloten hoeven worden.
    - lopende orders met actieve status blijven zichtbaar (failsafe), ook als ze eerder verborgen stonden.
- **Uitgevoerd in `usePlanningData.jsx`:**
    - planninglijst filtert `planningHidden` standaard weg,
    - behalve voor actieve/lopende statussen (zodat afmaken altijd mogelijk blijft).
- **Validatie:** builds uitgevoerd; 1 run werd extern afgekapt (`Terminated`), herhaalbuild succesvol afgerond.

### Update sessie 27 (import `Gewikkeld` + WIP wijzigingen importmodal)

- **Nieuwe importmapping toegevoegd voor productieaantallen (`Gewikkeld`):**
    - in zowel `PlanningImportModal.jsx` als `planningImportWorker.js` wordt nu extra kolomdetectie gedaan op `gewikkeld | geproduceerd | gemaakt | produced`.
    - geimporteerde waarde wordt opgeslagen als:
        - `produced`
        - dynamisch stationveld `started_<machine>` (bijv. `started_40BH18`).
- **Schaallogica voor buismachines uitgebreid:**
    - bestaande `/10` conversie voor `BA05/BA07/BA08/BA09` bleef gelden voor `plan`.
    - dezelfde `/10` conversie wordt nu ook toegepast op `gewikkeldCount` zodat `plan` en `produced` consistent blijven.
- **Paste/import flow in modal aangepast (WIP):**
    - geplakte data-workbook gebruikt nu sheetnaam `PastedData` i.p.v. `40BM01`.
    - diverse foutmeldingen en UI-teksten zijn versimpeld.
    - meerdere UI-blokken zijn sterk vereenvoudigd/verwijderd in de huidige werkversie van de modal.
- **Belangrijke status voor hervatten:**
    - dit lijkt een **lopende tussenstand** met grote front-end wijzigingen in de importmodal.
    - aanbevolen eerstvolgende stap: regressiecheck op import UX (weekselectie, sheetfilter, importstrategie, previewkolommen) en daarna pas committen.

#### Te testen na hervatten (sessie 27)

- [ ] Import met echt LN-bestand met kolom `Gewikkeld`: controleer of `produced` gevuld wordt in Firestore.
- [ ] Controleer of dynamisch veld `started_<machine>` correct wordt opgeslagen (bijv. `started_40BH18`).
- [ ] Pipe-machine scenario (`BA05/07/08/09`): verifieer dat zowel `plan` als `produced` met `/10` worden geschaald.
- [ ] Paste-flow valideren met echte Excel-kopie: headerrij detectie + orderpreview zonder dataverlies.
- [ ] Regressiecheck modal-UX: weekselectie, sheetfilter, importstrategie en previewkolommen nog volledig beschikbaar.
- [ ] Controleer dat niet-geselecteerde orders nog steeds als `planningHidden: true` worden opgeslagen.
- [ ] End-to-end zichtbaarheidstest: import -> Terminal -> Workstation (actieve/lopende orders blijven zichtbaar).

## Pilot Branching & Deploy Flow (4 weken vanaf 30 maart)

### Doel

- Houd 1 stabiele pilotlijn die exclusief naar Vercel Production publiceert.
- Houd 1 aparte ontwikkellijn voor nieuwe features die alleen naar Vercel Preview publiceert.

### Branchstrategie

- `FPiFF-may-build` = **Pilot Stable** (enige branch voor productie).
- `pilot-dev` = **Development** (nieuwe ontwikkelingen, refactors, experimenten).
- `hotfix/*` = tijdelijke branch voor urgente pilotreparaties.

### Codespaces

- **Codespace A: Pilot Ops** (start vanaf `FPiFF-may-build`)
    - alleen gebruiken voor pilot-fixes, kleine reparaties en productie releases.
- **Codespace B: Feature Dev** (start vanaf `pilot-dev`)
    - gebruiken voor nieuwe features en veranderingen die eerst naar preview moeten.

### Vercel instellingen

- Zet in Vercel de **Production Branch** op `FPiFF-may-build`.
- Laat preview deploys actief voor alle andere branches.
- Gebruik waar mogelijk gescheiden environment variabelen voor Production vs Preview.

### Dagelijkse werkwijze

1. Nieuwe ontwikkeling:
    - werk in Codespace B op `pilot-dev` (of `feature/*` vanaf `pilot-dev`).
    - push naar remote -> automatische Vercel Preview deploy.
2. Pilot bugfix:
    - werk in Codespace A op `hotfix/*` vanaf `FPiFF-may-build`.
    - test minimaal lokaal + smoke op preview.
    - merge naar `FPiFF-may-build` voor productie deploy.
3. Geplande release van development naar pilot:
    - open PR van `pilot-dev` naar `FPiFF-may-build`.
    - alleen mergen na akkoord en korte regressietest.

### Hotfix flow (6 stappen)

1. Checkout `FPiFF-may-build` en pull laatste wijzigingen.
2. Maak `hotfix/<korte-naam>`.
3. Voer minimale fix uit met gerichte validatie.
4. Open PR naar `FPiFF-may-build`.
5. Merge PR.
6. Controleer Vercel Production deploy + korte smoke test.

### Git commando's (referentie)

```bash
git checkout FPiFF-may-build
git pull
git checkout -b hotfix/voorbeeld-fix
git add .
git commit -m "Hotfix: voorbeeld"
git push -u origin hotfix/voorbeeld-fix
```

### Aanbevolen beveiliging

- Branch protection op `FPiFF-may-build`:
    - PR verplicht voor merge.
    - minimaal 1 review of expliciete eigenaar-goedkeuring.
    - optioneel: status checks verplicht voor merge.
- Geen directe pushes naar `FPiFF-may-build`.

### Confirmatie werkflow lopende planning (sessie 26b)

**Gebruiker-bevestigd:** selectie- en verborgen-logica werkt zoals gewenst voor papieren pilot-planning.

**Scenario:** Papieren planning loopt, orders bijna/geheel klaar. Excel-uitdraai bevat dezelfde + nieuwe orders.

**Gewenst** (nu ingebouwd):
- Orders die al lopen/klaar zijn → uitsluiten uit zichtbare planning maar WEL importeren
- Zo hoeven ze volgende import niet telkens opnieuw uit te sluiten
- Nieuwe orders automatisch zichtbaar
- Lopende orders altijd zichtbaar (failsafe om af te maken)

**Werkflow in import-modal:**
1. Upload Excel → preview met checkboxes (`In Planning` kolom)
2. Optie A: `Week t/m [week]` + `Selecteer t/m week + lopende orders` knop
3. Optie B: Handmatig per order checkbox aan/uit
4. `Importeer X Regels` → opslaan met `planningHidden: true` voor niet-aangevinkte orders
5. Volgende import: verborgen orders blijven verborgen, nieuwe automatisch zichtbaar

**Gebruiker-bevestiging:** Workflow past perfect bij papieren pilot-planning met lopende orders.

---

### Open vraag opgeslagen (sessie 24)

- **Letterlijke vraag van gebruiker opgeslagen:**
    - "kun je een laaste site check doon voordat ik deze als Productie op Vercel wil zetten en naar Git wil pushen en dan over ga op de preview in Vercel en een andere branch tijdens de pilot van 4 weken die vanaf 30 maart start"
- **Betekenis voor vervolg:**
    - volledige pre-release check uitvoeren vóór productie op Vercel + vóór Git push
    - daarna pas overzetten naar Vercel preview-flow en aparte pilot-branch (4 weken vanaf 30 maart).

### Update sessie 25 (pre-release sitecheck uitgevoerd)

- **Uitgevoerd:** pre-release validatie en Vercel preview-deploy vóór productie.
- **Validatie resultaten:**
    - `prevalidate` hersteld met nieuw script `scripts/cleanup-duplicates.js` (blokkerende missing module opgelost)
    - lint van **17 errors** naar **0 errors** gebracht (warnings blijven bestaan)
    - `type-check` geslaagd
    - lokale build in devcontainer werd tijdens bundling meerdere keren extern afgekapt (`exit 143`), zonder nieuwe codefouten in gewijzigde bestanden
- **Vercel preview:** succesvolle cloud deploy op
    - `https://futurefactoryapp-g9n1msybm-richard-van-heerdes-projects.vercel.app`
    - `curl -I` geeft `401` door Vercel protection/SSO (verwacht gedrag voor afgeschermde preview)
- **Conclusie voor release-gate:** codefouten die release blokkeerden zijn opgelost; finale productie-deploy kan door zodra gewenste review van preview in browser is afgerond en Git-commit/push is gedaan.

### Update sessie 25b (branch + productie deploy afgerond)

- **Nieuwe branch aangemaakt:** `FPiFF-may-build`
- **Vercel productie-deploy uitgevoerd en geslaagd:**
    - productie URL: `https://futurefactoryapp-c02qf10sc-richard-van-heerdes-projects.vercel.app`
    - alias actief: `https://future-factory.vercel.app`
    - inspectie: `https://vercel.com/richard-van-heerdes-projects/futurefactoryapp/BHKKCJacifaVUgpaULsp2Z8pDm7Y`
- **Status:** laatste production build staat live op Vercel.

- **Nieuwe vraag verwerkt:** teamleader moet in Personeel tijdelijk/per periode van dienst kunnen wisselen en dit moet direct meegenomen worden bij automatische uitlogtijden.
- **Uitgevoerd in Personeel-tab (`PersonnelOccupancyView.jsx`):**
    - nieuw blok in medewerker-modal: `Tijdelijke Dienst Override` met:
        - aan/uit
        - `van` datum
        - `tot` datum
        - tijdelijke `shift`
        - optionele notitie
    - opslag genormaliseerd in personeelsdocument als `temporaryShiftOverride`
    - dienst-resolutie (`getPersonShiftForDate`) gebruikt nu eerst tijdelijke override als datum binnen de ingestelde periode valt.
- **Uitgevoerd in Workstation check-in (`WorkstationHub.jsx`):**
    - check-in leest nu tijdelijke override uit personeel (als actief en binnen datumrange) en valt alleen terug op vaste `shiftId`/kloktijd als fallback
    - hiermee krijgen nieuwe check-ins automatisch de correcte (tijdelijke) dienst mee voor auto-checkout.
- **Achteraf uren corrigeren toegevoegd:**
    - nieuwe modal `Achteraf Uren Corrigeren` in Personeel-overzicht
    - teamleader kan uitgecheckte registraties van gekozen datum alsnog aanpassen
    - opslaan zet o.a. `manualHoursOverride: true` + timestamp in occupancy.
- **Validatie:** compile/editor checks zonder fouten op:
    - `src/components/personnel/PersonnelOccupancyView.jsx`
    - `src/components/digitalplanning/WorkstationHub.jsx`

### Update sessie 23b (navigatie + datumsturing)

- **Teamleader Personeel-tab uitgebreid:**
    - knop toegevoegd om direct naar uitgebreide Personeel-module in Admin Hub te gaan
    - route-state geeft direct `openScreen: personnel` mee.
- **Admin Hub gedrag uitgebreid:**
    - `AdminDashboard` opent nu direct de juiste module als `location.state.openScreen` aanwezig is
    - voor Personeel worden init-parameters doorgegeven (`initialViewDate`, `initialTab`).
- **Personeel Manager verbeterd:**
    - ondersteunt initialisatie met datum/tab vanuit route-state
    - extra kalenderinput (`type=date`) toegevoegd naast bladerknoppen
    - `Vandaag` knop toegevoegd om snel terug te springen.
- **Resultaat:** teamleader kan vanuit Teamleader Personeel direct naar uitgebreide Admin Personeel en daar op gekozen datum uren/shiftplanning beheren (ook toekomstige data).

### Pauzestand Voor Hervatten (sessie 22)

- **Opslagpunt hersteld na verbroken chatverbinding:** gebruiker meldde fout bij weekfilter in auditlog: `Scan Onderbroken: Database fout: undefined`.
- **Opslagpunt expliciet bevestigd voor volgende sessie:** gesprek en fixstatus zijn bewaard in deze samenvatting zodat direct hervat kan worden.
- **Root cause bevestigd:** `AdminLogView.jsx` gebruikte een ongeldige `date-fns` parse/format combinatie voor ISO-weken (`yyyy` samen met `II`). Dit veroorzaakt een `RangeError` nog voor de Firestore-query draait.
- **Uitgevoerd:**
    - week-input in auditlog omgezet naar correcte ISO week-year formattering met `RRRR-'W'II`
    - week parsing defensief gemaakt met fallback naar huidige datum bij ongeldige invoer
    - generieke databasefoutmelding aangepast zodat niet langer `undefined` getoond wordt, maar `err.code` of `err.message`
- **Validatie afgerond:** editorcontrole zonder fouten en parse-test in terminal succesvol voor meerdere ISO-weken.
- **Verwachte uitkomst:** filter `Per week` in Audit Log opent weer zonder crashmelding en toont bij echte queryfouten een bruikbare melding.
- **Eerstvolgende check bij hervatten:** Audit Log openen, `Per week` selecteren en controleren op correcte resultaten plus pagination (`Meer laden`) binnen dezelfde filter.

### Pauzestand Voor Hervatten (sessie 21)

- **Opslagpunt bevestigd op verzoek gebruiker:** "ik ga later verder, sla op in conversatie".
- **Afgerond in deze sessie:** tweede i18n-sweep voor admin modules met resterende hardcoded UI-teksten.

### Concreet afgerond
- `src/components/admin/AdminMessagesView.jsx`
    - resterende hardcoded labels/placeholders/tooltips vervangen door `t(...)`
    - compose modal verder gelokaliseerd (ontvanger/prioriteit/onderwerp/inhoud/bijlage)
    - onderwerp-fallback en quote-opmaak gestandaardiseerd
- `src/components/admin/AdminLogView.jsx`
    - resterende vaste labels gelokaliseerd (`Root: /`, `SRC:`, `IP:`, `CSV`, `PDF`, `null`)
    - `"Systeem"` fallbacks vervangen door `common.system`
- `src/components/admin/AdminLabelDesigner.jsx`
    - hardcoded `Custom Size` en melding over verplaatst template-overzicht gelokaliseerd
- `src/lang/nl.js` en `src/lang/en.js`
    - nieuwe keys toegevoegd voor bovenstaande componenten

### Validatie
- Editor/probleemcontrole uitgevoerd op alle gewijzigde bestanden.
- Resultaat: **geen fouten gevonden** op de aangepaste files.

### Eerstvolgende stap bij hervatten
1. Vervolg i18n-sweep op resterende admin-hardcoded strings (met name extra prompts/alerts/fallbacks in `AdminLabelDesigner.jsx`).
2. Daarna opnieuw gerichte file-checks en eventueel kleine key-normalisatie in `nl/en` dictionaries.

### Nieuwe Notitie Voor Vervolg (sessie 20)

- **Gefixt (code):** valse overproductie na definitieve afkeur is opgelost in `WorkstationHub.jsx`.
    - Start/overflow controle gebruikt nu de station teller (`started_<station>`) als primaire bron.
    - Fallback gebruikt alleen actieve, niet-afgekeurde tracking records.
    - Resultaat: bij scenario "10 gestart, 1 definitief afgekeurd" wordt een vervangend stuk niet meer onterecht als `NOG_TE_BEPALEN` overproductie aangemaakt.

- **Open wens (bewust uitgesteld):** op orderniveau zichtbaar maken als:
    - `Gemaakt: 10`
    - `Afkeur: 1`
    - zodat productie-aantallen en afkeur apart traceerbaar zijn in de orderweergave.

- **Update (sessie 20, uitgevoerd):** Workstation Terminal planning toont nu expliciet `Gemaakt` en `Afkeur` per orderregel en in het order-detailpaneel.

- **Update (sessie 20, uitgevoerd):** Teamleader Hub `Volledige Lijst` filter uitgebreid:
    - nieuwe scopes: `Tijdelijke Afkeur` en `Definitieve Afkeur`
    - bij `Definitieve Afkeur` wordt de tweede filter automatisch periode-gebaseerd (`Deze week`, `Vorige week`, `Dit jaar`, `Alles`) i.p.v. `Week + Backlog`
    - export van de huidige gefilterde lijst toegevoegd (CSV)

- **Aanpak voor volgende sessie:**
    - Definieer bron voor `Afkeur` teller (tracking status `rejected` per `orderId`, eventueel per station).
    - Voeg de teller toe in orderdetail en/of Workstation planningkaart.
    - Valideer op scenario: 10 gestart -> 1 definitief afkeur bij Nabewerking -> 1 vervangend gestart.

---

## 🚨 Kritieke Open Punten

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

### 3d. Verticale Tekst Tuning (lopende issue, sessie 14)
- **Status:** Code gereed (preview en ZPL gesynchroniseerd), wacht op live hardware validatie
- **Wat bevestigd is:**
    - overlap van verticale tekst was aanwezig en is grotendeels weg na verwijderen van onstabiele combinaties
    - `^FB` bij geroteerde tekst (`^A0R`/`^A0B`) geeft op ZM400 onvoorspelbare output en blijft daarom uit voor verticale tekst
- **Wat geprobeerd is in code:**
    - meerdere auto-offset en centreringvarianten in `zplHelper.js` getest
    - Verticale tuning blok toegevoegd in `zplHelper.js` en `LabelVisualPreview.jsx` (`VERTICAL_X_OFFSET_MM = 2.0`, `VERTICAL_Y_OFFSET_MM = 1.0`, `VERTICAL_SCALE = 0.85`)
    - Preview schaling (`DESIGNER_MATCH_SCALE = 0.76`) toegepast zodat `LabelVisualPreview` exact overeenkomt met de 1:1 weergave in `AdminLabelDesigner`.
- **Huidige situatie:**
    - Preview op het scherm is nu perfect in verhouding en de verticale tekst is visueel geresized.
    - ZPL-output neemt dezelfde 15% krimp en pixel-offsets mee.
    - Moet nu fysiek geprint worden op de ZM400 om te bevestigen of deze standaardcorrectie 100% klopt.
- **Bestanden met recente wijzigingen:**
    - `src/utils/zplHelper.js`
    - `src/components/printer/LabelVisualPreview.jsx`
    - `src/components/admin/AdminLabelDesigner.jsx`

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

---

## ✅ Afgerond in Recente Sessies

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

### Matrix Hub & Efficiency (26 maart 2026)
- Volledige refactor van de `AdminMatrixManager` naar een robuuste modulaire opzet (10+ subcomponenten).
- Boorpatronen en tolerantiebeheer direct gekoppeld aan de root databasepaden.
- Ontwerp en documentatie toegevoegd voor een nieuw Efficiency Tracking systeem (`EFFICIENCY_TRACKING.md`).

### ProductionStartModal & ZPL Fixes (26 maart 2026 — sessie 19)
- **Audit label/printingsysteem** uitgevoerd; vier kritieke problemen gevonden en opgelost:

#### ProductionStartModal.jsx
- **Manual mode (barcode scan) nu volledig werkend:**
  - Label preview (rechter paneel) is nu altijd zichtbaar in beide modes (was verborgen in manual mode)
  - Label template selectie beschikbaar in beide modes (was alleen in auto mode)
  - `labelsToPrint` niet meer hardcoded op `0` in manual mode — labels worden nu ook geprint bij manueel starten
  - ZPL wordt gegenereerd en naar de wachtrij gestuurd in manual mode (als er een label geselecteerd is)
- **Dead code verwijderd:**
  - `setShowLighthousePreview(true)` — aanroep op niet-bestaande state setter → crash risico weg
  - `"Verstuur naar Wachtrij"` knop die nooit renderde (stond in `mode === "auto"` container met `mode !== "auto"` guard) → verwijderd
  - Help tekst bijgewerkt: `"Label wordt automatisch geprint bij starten"`

#### zplHelper.js — Cut logica gerepareerd
- **`^MMC` (Cut Mode) staat nu in de header** van het ZPL format (direct na `^XA^CI28`), niet meer aan het einde
- **`^GS`** (ongeldig ZPL commando) verwijderd
- **Mid-batch labels** krijgen nu `^MMT` (geen cut) i.p.v. `^MMC` — consistent met hoe `generateLotBatchZPL` het al correct deed
- **Laatste label van batch:** `^MMC + ^PQ1,0,1,Y` = print en knip correct

### Tekeningen Sync & Koppeling (26 maart 2026 — sessie 18)
- Drawing sync engine volledig herschreven met correcte DB-paden en materiaalvariant matching (CST↔EST)
- Tekeningen nu opvraagbaar vanuit alle views: Terminal orderlijst, Terminal detail, Product Dossier, TeamleaderHub per-product, TeamleaderHub order-overzicht
- Tekeningen Sync tab in ConversionManager: batch sync, cross-collection search, keten analyse met broken chain detectie
- Definitieve Afkeur formulier met reden-checklist in ProductDossierModal
- On Hold/Resume toggle voor orders met visuele feedback in alle relevante views

---

## 📂 Belangrijkste Relevante Bestanden

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
- `src/components/digitalplanning/Terminal.jsx`
- `src/components/digitalplanning/WorkstationHub.jsx`
- `src/components/digitalplanning/OrderDetail.jsx`
- `src/components/digitalplanning/modals/ProductDossierModal.jsx`

### Tekeningen & Sync
- `src/utils/drawingLinker.jsx`
- `src/utils/manualSyncDrawings.jsx`
- `src/utils/findDrawingForProduct.jsx`
- `src/components/admin/ConversionManager.jsx`

### Printing
- `src/components/printer/PrintQueueAdminView.jsx`
- `src/components/printer/PrintStationView.jsx`
- `src/components/admin/AdminPrinterManager.jsx`
- `src/utils/InternalQrImage.jsx`
- `src/utils/printerDrivers.js`
- `src/utils/zplHelper.js`
- `src/utils/labelHelpers.jsx`
- `src/services/printService.js`

### Matrix Beheer & Kwaliteit
- `src/components/admin/matrixmanager/AdminMatrixManager.jsx` (en subviews)
- `src/components/admin/ProductionTimeStandardsManager.jsx` (gepland)
- `src/components/digitalplanning/EfficiencyDashboard.jsx` (gepland)
- `EFFICIENCY_TRACKING.md`

---

## 🧪 Open Pilot Validatie

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

---

## 🔄 Praktische Hervatstappen

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

---

## 📜 Korte Historie

### 26 maart 2026 — sessie 18 (Tekeningen Sync & Toegang Vanuit Alle Views)

#### Tekeningen Koppeling — Volledige App-brede Integratie
- **Drawing Sync Engine (`drawingLinker.jsx`)**: Volledig herschreven. Gebruikt nu correcte `PATHS.PRODUCTS` en `PATHS.CONVERSION_MATRIX` i.p.v. oude `artifacts/{appId}/...` paden. Bevat `materialVariants()` functie die CST↔EST swapped op positie 6. `findDrawingForOrder()` doet 3-stap: product match → conversie matrix → beide met materiaalvariant fallback.
- **Batch Sync (`manualSyncDrawings.jsx`)**: Materiaalvarianten toegevoegd in `buildLookupKeys`. Ongematchte resultaten bevatten nu `conversionTarget` voor debugging.
- **ConversionManager.jsx**: Derde tab "Tekeningen Sync" toegevoegd met:
  - Start Sync knop + progress bar + samenvatting (Gekoppeld/Geen match/Totaal)
  - Cross-collection zoekfunctie over Conversie Matrix, Planning Orders en Product Catalogus
  - "Keten Analyse" (chain trace) die automatisch conversion targets volgt naar producten
  - Broken chain detectie (oranje "Target ≠ Product" status)
  - Materiaalvariant auto-follow met "+ materiaalvariant" badge
- **Definitieve Afkeur**: Rejection knop + formulier met reden-checklist en opmerkingen in ProductDossierModal (z-index z-[300])

#### Tekening Zichtbaar Vanuit Alle Views
Alle views hebben nu een werkende tekening-knop met 3-stap lookup:
1. `order.drawing` als product-ID → `getDoc` by ID
2. Fallback: `articleCode` query
3. Fallback: materiaalvariant (CST↔EST positie 6)
4. Legacy fallback: `findDrawingForProduct()`

| View | Component | Details |
|---|---|---|
| Workstation Terminal — orderlijst | `TerminalPlanningView.jsx` | Drawing icon blauw als gekoppeld, clickable → `onViewDrawing` |
| Workstation Terminal — detail panel | `TerminalPlanningView.jsx` | "Technische Tekening" knop gekoppeld aan `onViewDrawing`, blauw + bolletje als gekoppeld |
| Workstation Terminal — handler | `Terminal.jsx` | `handleViewDrawing` met 3-stap + materiaalvariant fallback → ProductDetailModal |
| Product Dossier Modal | `ProductDossierModal.jsx` | "Tekening" veld + `handleOpenDetail` met 3-stap fallback |
| TeamleaderHub — Volledige Lijst per product | `OrderDetail.jsx` | FileImage knop per product met 3-stap lookup, blauw als gekoppeld |
| TeamleaderHub — Volledige Lijst order overzicht | `OrderDetail.jsx` | 5e tile "Tekening" in details grid, toont "Gekoppeld"/"Zoeken" status |

#### Overige Wijzigingen
- **On Hold/Resume**: Toggle in OrderDetail, StatusBadge (`on_hold` oranje/PauseCircle), PlanningSidebar (oranje achtergrond), TerminalPlanningView (oranje dimmed, disabled start)
- **TeamleaderHub Sync**: Paarse sync-knop in header + mobile menu met toast notificaties
- **Nabewerken**: Station naam gecorrigeerd van "Nabewerking" naar "Nabewerken" in workstationLogic.jsx

#### Materiaalvariant Logica (CST↔EST)
- Positie 6 (index 6) in FPi GRE productcodes: `C` = CST (Conductive Standard Type), `E` = EST (Epoxy Standard Type)
- Tekeningen zijn materiaalonafhankelijk → beide varianten delen dezelfde tekening
- `materialVariants()` functie in `drawingLinker.jsx` en `manualSyncDrawings.jsx`
- Wordt toegepast in alle lookup-stappen (sync, handmatige sync, chain trace, terminal, dossier, orderdetail)

#### Gewijzigde Bestanden
- `src/utils/drawingLinker.jsx` — herschreven + materialVariants
- `src/utils/manualSyncDrawings.jsx` — materialVariants + conversionTarget
- `src/components/admin/ConversionManager.jsx` — Sync tab + search + chain trace
- `src/components/digitalplanning/modals/ProductDossierModal.jsx` — rejection form + handleOpenDetail
- `src/components/digitalplanning/terminal/TerminalPlanningView.jsx` — clickable icon + Technische Tekening knop
- `src/components/digitalplanning/Terminal.jsx` — handleViewDrawing + variant fallback
- `src/components/digitalplanning/OrderDetail.jsx` — tekening tile + per-product drawing knop + on hold
- `src/components/digitalplanning/TeamleaderHub.jsx` — sync button
- `src/components/digitalplanning/common/StatusBadge.jsx` — on_hold status
- `src/components/digitalplanning/PlanningSidebar.jsx` — on_hold styling
- `src/utils/workstationLogic.jsx` — Nabewerken naamfix

### 26 maart 2026 — sessie 17 (Matrix Manager & Efficiency Tracking)
- **Matrix Hub Refactor**: De `AdminMatrixManager` en alle subcomponenten (`MatrixRangesView`, `AdminDrillingView`, `MatrixView`, `BlueprintsView`, `LibraryView`, etc.) zijn volledig herzien en gestyled volgens de nieuwe MES richtlijnen.
- **Root Path Syncing**: Data opslag voor boorpatronen en dimensies is gestandaardiseerd naar de centrale root configuraties.
- **Efficiency Tracking**: Nieuwe architectuur (`EFFICIENCY_TRACKING.md`) opgesteld voor real-time prestatiemeting op de werkvloer.
- **Volgende stap**: Componenten implementeren voor het Efficiency systeem.

### 25 maart 2026 — sessie 16 (ZPL uitlijning & preview sync)
- Verticale tekst (`^A0R`/`^A0B`) tuning blokken toegevoegd aan `zplHelper.js` en `LabelVisualPreview.jsx` om exact met elkaar in de pas te lopen.
- Standaardcorrectie voor verticale tekst ingesteld:
  - 15% kleiner lettertype (`VERTICAL_SCALE = 0.85`)
  - Offset: 2mm naar rechts, 1mm naar onder.
- Fix toegevoegd in `LabelVisualPreview.jsx` (`DESIGNER_MATCH_SCALE = 0.76`) waardoor de dot-to-pixel conversie visueel exact overeenkomt met de 1:1 weergave in de Label Architect. De tekst is nu niet meer 35% te groot op het scherm.
- Volgende stap: live hardware test op ZM400.

### 25 maart 2026 — sessie 15 (planning import fix)
- Foutmelding `Fout bij het verwerken van het bestand.` opgelost bij importeren van `fittingen 25-03-2026 MET 40BM01 2.0AAA.xlsx`
- **Oorzaak:** het bestand bevat twee enorme helper-sheets (`data PPOP` 13.501 rijen, `hulp input` 13.506 rijen) die de browser-worker lieten crashen door geheugenoverbelasting bij één globale `XLSX.read` call
- **Fix in `src/workers/planningImportWorker.js`:**
    - Stap 1: alleen sheetnamen ophalen (`bookSheets: true` — geen data in geheugen)
    - Stap 2: per sheet alleen de eerste 15 rijen scannen om headerrij te detecteren
    - Stap 3: sheets zonder `Machine` + `order` header worden volledig overgeslagen
    - Stap 4: whitelist toegevoegd — alleen `Fabrieksplanning`, `Mazakplanning` en `40BM01` worden verwerkt; alle andere sheets worden genegeerd
    - Resultaat: 476 orders geladen uit 3 planning-sheets, grote helper-sheets nooit ingelezen
- **`.xlsm` ondersteuning toegevoegd:**
    - `accept=` attribuut in `PlanningImportModal.jsx` uitgebreid met `.xlsm`
    - XLSX-library leest `.xlsm` intern identiek aan `.xlsx` (VBA-pakket wordt genegeerd)
- Vite devserver gestart op poort 3000 (`http://localhost:3000/`, `http://10.0.10.16:3000/`)

### 25 maart 2026 — sessie 13 (vervolg)
- Sync issue was op dat moment nog open: handmatige tekeningsync meldde 0 matches in praktijktest.
- Reeds aangebrachte fixes in `manualSyncDrawings.jsx`:
    - robuustere normalisatie (`normalized`, `compact`, tokenized keys)
    - filtering van niet-code waardes (zoals productomschrijvingen met spaties)
    - conversie-fallback uitgebreid naar meerdere targetcodes per broncode
- Specifieke case bevestigd door gebruiker:
    - broncode `EL9AESS08R03E0BCCBB0`
    - conversiematrix bevat o.a. `ELMO90ES00WMST080000320CB0` en `ELMO90CS00WMST080000320CB0`
    - catalogus bevat `articleCode = ELMO90CS00WMST080000320CB0` met gekoppelde tekening
- Debugging is later vervolgd op materiaalvariant matching, multi-target conversiefallback en sync-ketencontrole.
- Status per 27 maart 2026: gebruiker bevestigt dat de tekeningen-sync nu in orde is.

### 25 maart 2026 — sessie 14 (printing vervolg)
- Focus verlegd naar verticale tekst op orderlabels (fysieke print + preview vergelijking met foto's)
- Reeks patches uitgevoerd op ZPL/preview:
    - overlapreductie en rotatiecompatibiliteit
    - uitschakelen `^FB` voor geroteerde tekst in ZPL
    - meerdere rotatie-offset/centreringsvarianten getest en deels teruggedraaid
    - Label Manager preview rendering voor verticale tekst aangepast (wrap/fit)
- Tussenresultaat:
    - overlapprobleem duidelijk verbeterd t.o.v. begin
    - maar exacte uitlijning/schaal van verticale tekst nog niet volledig goed
- Sessie op verzoek gepauzeerd met expliciete tussenstand in dit document

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


---

Ik ga afgekeurde producten ook naar archief verplaatsen (aparte map per jaar), net als completed. Dit vereist:
1. Nieuwe archief-pad voor rejected items
2. Update van alle station-reject-handlers om archief+delete toe te passen 

Read [](file:///workspaces/FPIFF-30-1/src/config/dbPaths.jsx#109-109), lines 109 to 150

Replacing 15 lines with 26 lines in [](file:///workspaces/FPIFF-30-1/src/config/dbPaths.jsx)


```

```
Nu update ik alle station-handlers om rejected producten naar archief te verplaatsen (met delete uit tracking): 

Read [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/BM01Hub.jsx#1-1), lines 1 to 550

Replacing 43 lines with 69 lines in [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/BM01Hub.jsx)


```

```


Read [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/LossenView.jsx#1-1), lines 1 to 30

Read [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/LossenView.jsx#300-300), lines 300 to 550

Read [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/LossenView.jsx#550-550), lines 550 to 650

Replacing 1 lines with 1 lines in [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/LossenView.jsx)


```

```


Replacing 1 lines with 64 lines in [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/LossenView.jsx)

Read [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/LossenView.jsx#560-560), lines 560 to 615

Replacing 45 lines with 73 lines in [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/LossenView.jsx)


```

```


Replacing 1 lines with 1 lines in [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/WorkstationHub.jsx)

Searched for text `import.*PATHS` (`**/src/components/digitalplanning/WorkstationHub.jsx`), 1 result

Replacing 1 lines with 1 lines in [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/WorkstationHub.jsx)


```

```


Read [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/WorkstationHub.jsx#1530-1530), lines 1530 to 1600

Replacing 50 lines with 76 lines in [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/WorkstationHub.jsx)


```

```


Searched for text `import.*PATHS` (`**/src/components/digitalplanning/modals/ProductReleaseModal.jsx`), 1 result

Replacing 1 lines with 1 lines in [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/modals/ProductReleaseModal.jsx)


```

```


Read [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/modals/ProductReleaseModal.jsx#280-280), lines 280 to 320

Replacing 41 lines with 62 lines in [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/modals/ProductReleaseModal.jsx)


```

```


Searched for text `import.*PATHS` (`**/src/components/digitalplanning/MazakView.jsx`), 1 result

Replacing 1 lines with 1 lines in [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/MazakView.jsx)


```

```


Read [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/MazakView.jsx#230-230), lines 230 to 290

Replacing 19 lines with 53 lines in [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/MazakView.jsx)


```

```
Nu test ik lint en build: 

Ran terminal command:  cd /workspaces/FPIFF-30-1 && npm run lint 2>&1 | tail -100

Read [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/LossenView.jsx#1-1), lines 1 to 10

Read [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/MazakView.jsx#1-1), lines 1 to 5

Read [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/modals/ProductReleaseModal.jsx#1-1), lines 1 to 10

Replacing 1 lines with 1 lines in [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/LossenView.jsx)


```

```


Read [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/MazakView.jsx#1-1), lines 1 to 15

Replacing 12 lines with 14 lines in [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/MazakView.jsx)


```

```


Replacing 1 lines with 1 lines in [](file:///workspaces/FPIFF-30-1/src/components/digitalplanning/modals/ProductReleaseModal.jsx)


```

```


Ran terminal command:  cd /workspaces/FPIFF-30-1 && npm run lint 2>&1 | tail -50

Ran terminal command:  cd /workspaces/FPIFF-30-1 && npm run build 2>&1 | tail -50

Made changes.

---

### Update sessie 33 (BH12 ProductionStartModal verfijning)

**Datum:** 3 april 2026 | **Branch:** `pilot-dev`

**Doel:** Startflow voor BH12/flens-orders verfijnen in de `ProductionStartModal`.

**Uitgevoerd in `src/components/digitalplanning/modals/ProductionStartModal.jsx`:**

- FL-orders gebruiken standaard een **klein label** als voorbeeld/templatekeuze.
- Previewpaneel blijft zichtbaar in **auto mode** (ook voor FL), zodat het voorbeeld altijd zichtbaar is.
- In **manual mode** is `Aantal in String` toegevoegd zodat meerdere lotnummers in serie gestart kunnen worden.
- Manual string-run gebruikt nu het **eerste ingevoerde lotnummer** als startpunt en telt door.
- Extra validatie toegevoegd: bij manual string-run worden alle volgende lotnummers gecontroleerd op duplicaten (actief + archief).
- Voor flens met mal-match wordt het gevonden cavity-aantal als **advies/startwaarde** ingevuld.
- Daarna verfijnd op verzoek: ook in **auto mode** is het aantal handmatig aanpasbaar (geen lock meer op het aantalveld).

**Resultaat voor BH12:**

- FL-flow is consistenter: klein labelvoorbeeld, zichtbare preview, aantallen nog overschrijfbaar.
- String-start werkt nu zowel praktisch als veilig (doorlopende lotreeks + uniciteitscontrole).

**Validatie:**

- `npx eslint src/components/digitalplanning/modals/ProductionStartModal.jsx` succesvol (geen output / geen fouten).

---

### Update sessie 48 (Opslagpunt: Gantt planning verbeteringen + Firebase importpad)

**Datum:** 7 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Conversatie opslaan zodat later direct kan worden hervat op de nieuwste Gantt- en importverbeteringen.

**Wat is afgerond in deze sessie:**

1. **Importintegratie richting Power Automate/Firebase afgerond voorbereid**
- Webhook blijft beschikbaar via `importPlanningFromWebhook` (Power Automate-first, backward compatible met oude tokenkeys).
- Nieuwe Firebase Storage trigger toegevoegd: `importPlanningFromStorage`.
- Upload van Excel naar `imports/planning/` start nu automatisch import.
- Import ondersteunt server-side machinefilter (`allowedMachines`, incl. config `integration.allowed_machines`).

2. **Planning-import UI hybride sturing toegevoegd**
- In `PlanningImportModal` is hybride importselectie toegevoegd (bijv. BH12/BH18).
- Selectie wordt opgeslagen in localStorage.
- Selectie bepaalt ook echt welke orders worden geïmporteerd.

3. **Gantt planning sterk uitgebreid (klassieke Gantt-ervaring)**
- Orders tonen nu van **startdatum t/m leverdatum**.
- Orders die deels in beeld vallen blijven zichtbaar.
- Machinekolom blijft vast; balken lopen niet meer onder de machinekolom.
- Muis "vastpakken" voor horizontaal pannen toegevoegd (ook op dag/datum-balk).
- `Shift + muiswiel` en trackpad horizontaal scrollen toegevoegd.
- Afdelingfilter verbeterd (normalisatie `40BHxx` vs `BHxx`).
- Machines zijn inklapbaar per regel + knoppen "Alles inklappen/uitklappen".
- Nieuwe **All View** toegevoegd:
    - volledige planningrange over alle orders
    - dynamische dagbreedte
    - maximaal 35 dagen tegelijk zichtbaar op het scherm
    - horizontaal door de rest scrollen.
- Statuslegend opgeschoond: `Verzendklaar` en `Verzonden` verwijderd.

**Belangrijk hervatpunt (eerstvolgende stap):**
1. Live UI-check op echte planningdata (specifiek All View + leverdatumtrajecten).
2. Indien gewenst: auto-scroll naar "vandaag" bij openen van All View toevoegen.
3. Firebase deploy + storage upload-test draaien voor end-to-end import zonder Power Automate account.

**Aangepaste kernbestanden in deze sessie:**
- `functions/index.js`
- `src/components/digitalplanning/modals/PlanningImportModal.jsx`
- `src/components/planning/GanttChartView.jsx`

**Validatie:**
- `node --check functions/index.js` succesvol.
- Meerdere keren `npm run build` succesvol na wijzigingen.

---

### Update sessie 90-92 (Medium writes naar callables + deploy)

**Datum:** 12 april 2026 | **Branch:** `pilot-dev`

**Doel:**
- Alle **medium-priority** frontend writes migreren van directe Firestore-mutaties naar backend-callables.

**Uitgevoerd:**

1. **Nieuwe backend service-functies toegevoegd** in `functions/src/services/planningTransitionService.js`
- `addOrderDependencyService`
- `removeOrderDependencyService`
- `updateOrderPlannedDateService`
- `updateOrderKanbanStatusService`
- `markReadyForNextStepService`
- `startTrackedProductRepairService`
- `reportShopFloorIssueService`
- `resolveShopFloorIssueService`

2. **Nieuwe callables toegevoegd en geëxporteerd**
- `functions/src/callables/planningCallables.js`
- `functions/index.js`

3. **Frontend callable wrappers toegevoegd** in `src/services/planningSecurityService.js`
- `addOrderDependency`
- `removeOrderDependency`
- `updateOrderPlannedDate`
- `updateOrderKanbanStatus`
- `markReadyForNextStep`
- `startTrackedProductRepair`
- `reportShopFloorIssue`
- `resolveShopFloorIssue`

4. **Medium views gemigreerd naar wrappers/callables**
- `src/components/planning/OrderDependenciesView.jsx`
- `src/components/planning/GanttChartView.jsx`
- `src/components/planning/KanbanBoardView.jsx`
- `src/components/planning/ShopFloorMobileApp.jsx`

5. **Firebase deploy uitgevoerd (geslaagd)**
- `addOrderDependency`
- `removeOrderDependency`
- `updateOrderPlannedDate`
- `updateOrderKanbanStatus`
- `markReadyForNextStep`
- `startTrackedProductRepair`
- `reportShopFloorIssue`
- `resolveShopFloorIssue`

6. **Git status**
- Commit: `7c61629`
- Message: `Migrate medium planning writes to secure callables`
- Push: `pilot-dev` succesvol geüpdatet (`03fdeb3 -> 7c61629`)

7. **Nacontrole**
- Lint-error in `ShopFloorMobileApp.jsx` (`commonData is not defined`) direct opgelost.
- `firebase-debug.log` verwijdering teruggedraaid; worktree weer schoon.

**Resultaat:**
- Medium-priority planning/shopfloor writes lopen nu via backend + callable boundary.
- Branch staat gesynchroniseerd op GitHub en deploy is live.

---

### Update sessie 93 (Architectuur review vertaald naar uitvoerbaar vervolg)

**Datum:** 12 april 2026 | **Branch:** `pilot-dev`

**Context:**
- Externe architectuurreview aangeleverd met focus op write-boundary, import-bypass, rules-hardening en type-safety.

**Feitelijke status (gevalideerd op code):**

1. **Kritische bypass nog aanwezig in importflow**
- `src/components/digitalplanning/modals/PlanningImportModal.jsx` schrijft nog direct client-side met `writeBatch` en `batch.set`.
- Dit omzeilt de command-laag in Cloud Functions.

2. **Medium-priority planning writes zijn inmiddels wel via callables**
- Reeds gemigreerd en live (sessie 90-92).

3. **Firestore rules laten nog meerdere client writes toe**
- Bewust pilot-vriendelijk gehouden.
- Hierdoor is “writes alleen via backend” nog niet hard technisch afgedwongen.

4. **Overige directe writes buiten medium-scope bestaan nog**
- O.a. in admin/AI/notification/printer/util-onderdelen.

**Besloten strategie (CQRS-light, gefaseerd):**

1. **Query (read):** frontend blijft direct luisteren met `onSnapshot`.
2. **Command (write):** productie/planning writes gefaseerd naar callables.
3. **Rules-hardening:** pas na functionele migratie per domein, om pilot niet te blokkeren.

**Eerstvolgende implementatiestap (hoogste prioriteit):**

1. `PlanningImportModal` migreren naar backend command-callable (bijv. `importPlanningOrders`).
2. Frontend importmodal alleen payload laten bouwen/valideren en callable aanroepen.
3. Daarna rules voor import-gerelateerde writes aanscherpen zodat client-write pad dicht kan.

**Concrete checklist voor volgende sessie:**

1. Nieuwe callable + servicefunctie toevoegen voor planning import.
2. `PlanningImportModal.jsx` refactoren: `writeBatch` verwijderen, vervangen door callable call.
3. End-to-end test: import met machinefilter (BH12/BH18) blijft correct werken.
4. Pas daarna Firestore rules voor betreffende collecties strakker zetten.
5. Deploy functions + rules + commit/push.

**Doel van deze fase:**
- Grootste architectuurgat (import-bypass) sluiten zonder pilot-flow te breken.
