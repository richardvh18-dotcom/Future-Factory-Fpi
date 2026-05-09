

# ==========================================
# 📄 Oorspronkelijk document: README-PILOT.md
# ==========================================


# 🏭 Future Factory - Pilot Ready

**Versie:** 1.0.0-pilot  
**Status:** ✅ Ready for Production Pilot  
**Datum:** Maart 2026

---

## 📖 Overzicht

Dit is de **pilot-ready** versie van het Future Factory Manufacturing Execution System (MES). Deze versie bevat een volledig werkende digitale productieflow van BH18 (Wikkelen) tot BM01 (Eindcontrole), zonder papieren bonnen.

### ✨ Belangrijkste Features in deze Pilot

- 🔄 **Full Digital Flow**: Paperless productie van start tot finish
- 📊 **Real-time Tracking**: Volledige traceerbaarheid per lotnummer
- 🏷️ **Smart Label Printing**: Automatische generatie van productielabels
- 👥 **Multi-operator Support**: Meerdere operators kunnen parallel werken
- 📱 **Mobile Scanner**: QR-code scanning voor snelle identificatie
- 📈 **Live Dashboards**: Real-time productie overzichten voor teamleiders
- 🔐 **Rol-gebaseerde Toegang**: Veilige scheiding tussen operators, teamleiders en admins
- 🌐 **Multi-taal**: Nederlands, Engels, Duits, Arabisch

---

## 🎯 Pilot Scope

### In Scope (✅ Geïmplementeerd)
- **Stations**: BH18, Lossen, Nabewerking, BM01
- **Productie Flow**: Start → Wikkelen → Lossen → Nabewerking → Eindcontrole → Archief
- **Lotnummer Generatie**: FPI-standaard lotnummers met uniekheidscontrole
- **PDF Export**: Productiedossiers met complete historie
- **Notificaties**: Real-time updates via toast notifications
- **Audit Logging**: Complete activity logs voor compliance

### Out of Scope voor Pilot
- ERP integratie (Infor LN sync)
- Advanced AI features
- Capacity planning optimalisatie
- NCR workflow
- SPC (Statistical Process Control)

---

## 🚀 Quick Start

### Vereisten
- Node.js 18+
- Firebase project (production)
- Moderne browser (Chrome/Edge/Firefox)

### Installatie

```bash
# Clone de repository
git clone https://github.com/richardvh18-dotcom/Future-Factory-Pilot-Ready.git
cd Future-Factory-Pilot-Ready

# Installeer dependencies
npm install

# Configureer environment variabelen
cp .env.example .env
# Vul Firebase credentials in .env

# Start development server
npm run dev
```

### Deployment

```bash
# Build voor productie
npm run build

# Deploy naar Firebase Hosting
npm run deploy
```

---

## 📋 Pilot Test Scenario

Een compleet test scenario is beschikbaar in [`PILOT_TEST_SCENARIO.md`](./PILOT_TEST_SCENARIO.md).

Belangrijkste test fases:
1. Order starten op BH18 met unieke lotnummers
2. Afronden wikkelen en doorsturen naar Lossen
3. Lossen met optionele gewicht/maten registratie
4. Nabewerking (indien van toepassing)
5. Eindcontrole op BM01 met goedkeuren/afkeuren
6. PDF dossier export en validatie
7. Multi-item order test (meerdere items per order)

---

## 🏗️ Architectuur

### Tech Stack
- **Frontend**: React 18 + Vite
- **Styling**: TailwindCSS
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Hosting**: Firebase Hosting / Vercel
- **i18n**: Custom multi-taal implementatie

### Database Structuur
```
/future-factory/
  ├── production/
  │   ├── active/           # Actieve productie items
  │   ├── archived/         # Afgeronde items
  │   ├── planning/         # Orders en planning
  │   └── messages/         # Notificaties
  ├── settings/
  │   ├── label_templates/  # Printlabel templates
  │   ├── label_logic/      # Label business rules
  │   └── printers/         # Printer configuratie
  ├── personnel/
  │   ├── occupancy/        # Operator toewijzingen
  │   └── time_standards/   # Standaard productietijden
  └── logs/
      └── activity_logs/    # Audit trail
```

### Belangrijke Componenten
- `WorkstationHub.jsx` - Centrale productie interface voor operators
- `TeamleaderHub.jsx` - Overzichts dashboard voor teamleiders
- `Terminal.jsx` - Order lijst en status overview
- `LossenView.jsx` - Lossen proces interface
- `BM01Hub.jsx` - Eindcontrole en archivering

---

## 🔒 Beveiliging

### Firestore Security Rules
Strikte regels zijn geïmplementeerd:
- Operators kunnen alleen hun toegewezen station data lezen/schrijven
- Teamleiders hebben read-only toegang tot alle productie data
- Admins hebben volledige toegang
- Alle mutations worden gelogd met user ID en timestamp

### Environment Variabelen
Gevoelige credentials worden **NOOIT** in de repository opgeslagen. Gebruik altijd `.env` lokaal en environment secrets in deployment platforms.

---

## 📊 Monitoring & Logging

### Activity Logs
Alle kritieke acties worden gelogd in `/future-factory/logs/activity_logs`:
- User login/logout
- Order start/stop
- Status wijzigingen
- Admin configuratie changes

### Firebase Analytics
Basis tracking is geconfigureerd voor:
- Page views
- User engagement
- Error rates

---

## 🐛 Known Issues

| Issue | Severity | Workaround | ETA Fix |
|-------|----------|------------|---------|
| - | - | - | - |

*Alle kritieke bugs zijn opgelost voor de pilot.*

---

## 📱 Browser Ondersteuning

| Browser | Desktop | Mobile | Tablet |
|---------|---------|--------|--------|
| Chrome | ✅ | ✅ | ✅ |
| Edge | ✅ | ✅ | ✅ |
| Firefox | ✅ | ✅ | ✅ |
| Safari | ✅ | ✅ | ✅ |

**Minimale vereisten**: ES2020 support, WebSocket, LocalStorage

---

## 🤝 Pilot Team

### Rollen
- **Product Owner**: [Naam]
- **Technical Lead**: Richard van Heerde
- **Test Coordinator**: [Naam]
- **Operators**: Team BH18 + BM01

### Feedback & Bug Reports
Tijdens de pilot:
1. Noteer alle issues in een logboek
2. Maak screenshots indien mogelijk
3. Rapporteer via het Message Center (High Priority)
4. Of: GitHub Issues met label `pilot-feedback`

---

## 📈 Success Metrics

De pilot wordt beoordeeld op:
- ✅ **100% Traceerbaarheid**: Alle items volledig getraceerd
- ✅ **0% Data Loss**: Geen enkele item raakt data kwijt
- ✅ **< 2s Laadtijden**: Performance binnen norm
- ✅ **95%+ Operator Tevredenheid**: Gebruiksvriendelijkheid score
- ✅ **0 Kritieke Bugs**: Geen blocking issues

---

## 🗺️ Roadmap na Pilot

Bij succesvolle pilot:

### Fase 2 (Q2 2026)
- 🔗 **ERP Integratie**: Sync met Infor LN
- 📊 **Advanced Reporting**: Custom KPI dashboards
- 🤖 **AI Assistent**: Context-aware productie assistent

### Fase 3 (Q3 2026)
- 🏗️ **Uitbreiding Afdelingen**: Pipes, Spools
- 📱 **Native Mobile App**: Dedicated mobile experience
- 🔍 **NCR Workflow**: Digitale afwijking registratie

### Fase 4 (Q4 2026)
- 📈 **Capacity Planning**: Geavanceerde planning tools
- 🎓 **Training Module**: E-learning voor operators
- 🌍 **Multi-Site Support**: Meerdere fabrieken

---

## 📄 Documentatie

- [PILOT_TEST_SCENARIO.md](./PILOT_TEST_SCENARIO.md) - Compleet test scenario
- [ROADMAP.md](./ROADMAP.md) - Ontwikkel roadmap
- [SECURITY.md](./SECURITY.md) - Security best practices
- [STANDARDS.md](./STANDARDS.md) - Code en compliance standards
- [AI_SETUP.md](./AI_SETUP.md) - AI features configuratie

---

## 📞 Contact

**Technical Support**: [email]  
**Product Owner**: [email]  
**Emergency Hotline**: [phone]

---

## 📜 License

Proprietary - All rights reserved  
© 2026 Future Factory

---

**Version**: 1.0.0-pilot  
**Build Date**: Maart 8, 2026  
**Git Branch**: FpiFF-Pilot-Ready  
**Git Commit**: 9588e5f


# ==========================================
# 📄 Oorspronkelijk document: ROADMAP.md
# ==========================================


# 🚀 Master Roadmap: FPi Future Factory

## 🌐 Internationale Normen & Compliance (MES)

Omdat dit project functioneert als een Manufacturing Execution System (MES) voor een fabriek ("Future Factory"), zijn er verschillende internationale normen relevant om de kwaliteit, veiligheid en uitwisselbaarheid van data te waarborgen.

### 1. ISA-95 (De "MES-norm")
**Relevantie:** Belangrijkste internationale standaard voor de integratie van kantoor- en productieautomatisering.
**Toepassing:** Zorg dat de datastructuur in Firestore (zoals gedefinieerd in dbPaths.js) overeenkomt met de hiërarchie van ISA-95 (Enterprise > Site > Area > Cell).

### 2. ISO/IEC 27001 (Informatiebeveiliging)
**Relevantie:** Beveiliging is cruciaal bij gebruik van Firebase voor authenticatie en opslag van gevoelige bedrijfsdata.
**Toepassing:** Implementeer strikte Firestore Security Rules (zie storage.rules) om te voorkomen dat ongeautoriseerde gebruikers data kunnen inzien of wijzigen.
**AI Privacy:** Zorg dat de AI-context vrij blijft van PII (Users/Roles) conform AVG.

### 3. ISO 9001 (Kwaliteitsmanagement)
**Relevantie:** MES wordt gebruikt om aan te tonen dat een productieproces beheerst verloopt.
**Toepassing:** Elke wijziging in een productieorder of instelling moet traceerbaar zijn naar een gebruiker en een tijdstip (serverTimestamp) via het logging-systeem (logActivity in firebase.js).

### 4. ISO 22400 (Key Performance Indicators)
**Relevantie:** Definieert hoe KPI's voor productiebeheer (zoals OEE) berekend moeten worden.
**Toepassing:** Zorg dat de berekeningen in efficiencyCalculator.js exact de formules volgen die in ISO 22400 zijn vastgelegd.

### 5. IEC 62443 (Cybersecurity voor industriële automatisering)
**Relevantie:** Systeem maakt verbinding met de werkvloer (scanners, terminals) en moet beveiligd zijn tegen netwerkaanvallen.
**Toepassing:** Gebruik HTTPS (Vercel deployment) en veilige API-sleutels (.env) als basis, en breid uit met netwerkbeveiliging waar nodig.

> **Samenvattend advies:** Focus voor je huiswerk vooral op de traceerbaarheid (ISO 9001) via je logging-systeem en de beveiliging (ISO 27001) door je Firebase-regels waterdicht te maken.

**Status:** Actief  
**Projectleider:** Richard van Heerde  
**Huidige Fase:** Fase 4 & 5  
**Last Updated:** 6 mei 2026

Dit document is de **'Single Source of Truth'** voor de technische ontwikkeling.

---

## 🌟 Roadmap Uitbreidingen (Voorstel)

### 1. Kwaliteit & Compliance (Fase 5 uitbreiding)
- **Digitale Werkinstructies met Video:** Toon korte instructievideo's of 3D-modellen uit de DRAWING_LIBRARY direct bij workstations.
- **Realtime SPC (Statistical Process Control):** Waarschuw automatisch als meetwaarden uit BORE_DIMENSIONS of CB_DIMENSIONS richting de tolerantiegrens gaan.
- **Self-Service Operator Training:** Gebruik FlashcardViewer.jsx om operators te toetsen op veiligheidsvoorschriften of nieuwe procedures voordat ze mogen inloggen.

### 2. Onderhoud & Asset Management
- **Condition-Based Maintenance:** Logboek voor machine-uren; bij overschrijding automatisch ticket in Communication Hub.
- **Spare Parts Inventory:** Koppel INVENTORY aan machines; onderdelen direct afboeken via MobileScanner.

### 3. Smart Factory & AI (Fase 6 verdieping)
- **AI-gestuurde Planning Optimization:** AiAssistantView doet suggesties voor ordervolgorde op basis van actuele bezetting en historische data.
- **Automatische NCR-herkenning:** AI analyseert defectfoto's en stelt foutcode/ernst voor bij NCR.
- **Voice-to-Log:** Operators kunnen lognotities inspreken; AI zet deze om in tekst voor ACTIVITY_LOGS.
- **Machine & Sensor Integratie:** Automatische webhook-koppeling met ovens (BM01) voor handsfree gereedmelden.

### 4. Energie & Duurzaamheid
- **Energy Tracking per Order:** Koppel slimme meters en bereken energieverbruik per lotnummer voor CO2-rapportage.
- **Afvalregistratie:** Registreer restmateriaal/snĳafval in TRACKING om grondstof-yield te optimaliseren.

### 5. Operator Engagement
- **Skill Matrix Dashboard:** Visualiseer vaardigheden van personeel in PersonnelManager voor optimale machine-indeling.
- **Shift Handover Tool:** Gestructureerde overdrachtmodule in DigitalPlanningHub; ploeg draagt status/orders over via MESSAGES.

> Deze uitbreidingen benutten de bestaande dbPaths.js structuur en versterken de app als centrale 'Single Source of Truth' voor de fabriek.

---

## ✅ Fase 1: Het Fundament (Voltooid)
**Doel:** Basisstructuur en beveiliging.
- [x] Cloud Architectuur: Firestore inrichting met /future-factory/ root-structuur.
- [x] Authenticatie: Rol-gebaseerde toegang (Admin, Engineer, Teamleider, Operator).
- [x] Path Manager: Centrale configuratie via dbPaths.js voor alle modules.

---

## ✅ Fase 2: Digital Planning & MES (Voltooid)
**Doel:** Productie aansturing.
- [x] Workstation Terminals: Interfaces voor BM01, BH-machines en Nabewerking.
- [x] Track & Trace: Volledige traceerbaarheid via Lotnummer registratie.
- [x] Mobile Scanner: QR-scanning voor snelle orderidentificatie op de vloer.

---

## ✅ Fase 3: Admin & Data Beheer (Gerealiseerd)
**Doel:** Geavanceerd beheer voor Engineers en Admins.
### 3.1 Product Manager V6
- [x] Smart Formulier: Automatische naamgeneratie en matrix-validatie.
- [x] Media Bibliotheek: Beheer van productfoto's en technische PDF-tekeningen.
- [x] Mof Maten: Integratie van Bell Dimensions (B1, B2, etc.).
### 3.2 Data Integriteit & "Vier-ogen"
- [x] Verificatie: Nieuwe producten vereisen goedkeuring van een 2e engineer (PENDING status).
- [x] Forensische Tools: Universal Rescue Tool voor database-integriteit en path discovery.
### 3.3 Communicatie Hub
- [x] Berichtensysteem: Interne inbox voor directe communicatie tussen kantoor en fabriek.
- [x] Validatie Alerts: Automatische meldingen bij nieuwe verificatieverzoeken.

---

## 🚀 Fase 4: Performance & Schaalbaarheid (Huidige Focus)
**Doel:** Optimalisatie voor 10.000+ records en snelle laadtijden.  
**Target:** Q1/Q2 2026

### 4.1 Component Optimization & Code Splitting
- [x] **Monolitische Componenten Refactoren:**
  - [x] PersonnelManager (1.053 lines) → Split in 4-5 subcomponenten
  - [x] Terminal (912 lines) → Extract Station, Order & Timeline views
  - [x] ConversionManager (825 lines) → Split data import & preview modes
  - [x] AdminLabelDesigner (659 lines) → Separate label preview & settings
  - **Impact:** -40-50% render time, sneller hot-reloading

- [ ] **React & DOM Optimalisaties (Nieuw):**
  - [ ] **Virtualisatie:** Implementeer `react-window` voor lijsten >100 items (ProductSearchView).
  - [ ] **Memoization:** Pas `React.memo` toe op zware componenten (ProductCard) om onnodige re-renders te voorkomen.
  - [ ] **Stabiele Referenties:** Gebruik `useCallback` en `useMemo` voor event handlers en filters.
  - [ ] **JavaScript Optimalisatie:** Implementeer Debouncing op zoekbalken en vervang Array.find() door Map-lookups (O(1)).
  - [ ] **Datastructuren:** Vermijd method chaining (.filter.map.sort) in grote loops.

- [x] **react-window integratie:**
  - [x] PlanningListView (530 lines) - 100%+ sneller met 1000+ orders (PlanningSidebar)
  - [ ] AdminReferenceTable (421 lines) - Table header sticky + virtual rows
  - [x] ProductDetailModal (526 lines) - Lazy-load product images & specs
  - **Impact:** Browser blijft responsief tot 10.000+ records

- [x] **Index & Query Caching:**
  - [x] Voeg composite indexes toe voor (orderStatus, week, machine)
  - [x] Implementeer lokale query caching in usePlanningData hook
  - [ ] Batch multiple `onSnapshot` listeners in Terminal.jsx
  - **Impact:** -70% Firestore read quota

- [x] Wrap high-frequency components met React.memo:
  - [x] StatusBadge, ProductCard (rendered 100+ maal)
  - [x] OrderDetailModal, DrillDownModal
  - [ ] Station telemetry componenten
  - [x] useCallback wrap event handlers in TeamleaderHub, Terminal
  - **Impact:** -30% unnecessary re-renders

- [ ] Lazy load admin-modules (AdminMatrixManager, AdminDrillingView)
- [ ] Defer non-critical CSS (animations, themes)
- [ ] Tree-shake unused constants.js exports (376 lines)
- **Impact:** -25% initial bundle, +35% faster first paint

---

## 🛡️ Fase 5: Kwaliteitsborging & QC (Actief)
**Doel:** Digitale registratie van meetwaarden en borging van data-integriteit.  
**Target:** Q2 2026

### 5.1 Meetwaarde Invoer & Tolerantie Control
- [x] Meetwaarde Invoer: Basiscomponent `MeasurementInput` opgezet.
- [ ] **Integratie:** Koppelen van `MeasurementInput` in de `WorkstationHub` flow (bij afronden).
- [ ] **Validatie:** Koppelen van meetwaarden aan toleranties (Min/Max) uit productdatabase.
- [ ] **Feedback:** Visuele feedback voor operators (Groen=OK, Rood=Niet OK) direct na invoer.
- [ ] **Opslag:** Opslaan van QC-data in de `tracked_products` historie.
- [ ] **Security:** Firestore Rules update toepassen voor strikte scheiding productie/test omgeving.
- [ ] Real-time validatie tegen BORE_DIMENSIONS, CB/TB_DIMENSIONS specs
- [ ] SPC (Statistical Process Control) dashboard met trend-visualisatie
- [ ] Digitale Werkinstructies met Video: Toon korte instructievideo's of 3D-modellen uit de DRAWING_LIBRARY direct bij workstations.
- [ ] Realtime SPC: Automatische waarschuwing bij trends richting tolerantielimiet.
- [ ] Self-Service Operator Training: Operators toetsen via FlashcardViewer.jsx op veiligheidsvoorschriften/procedures.
- **Afhankelijk van:** Fase 4 (query optimization voor grote datasets)

### 5.2 NCR Workflow
- [ ] NCR Workflow: Automatische aanmaak van Non-Conformance Reports bij afkeur op de stations.
- [ ] Escalation logic: Auto-assign aan quality team
- [ ] Root cause analysis template & audit trail
- **Dependencies:** AdminLogView uitbreiden met NCR-specifieke filters

### 5.3 Audit & Compliance
- [ ] Audit Logs: Uitbreiden van het activiteitenlogboek voor ISO-compliance.
- [ ] Digitale handtekeningen (PDF-sign integration)
- [ ] Data retention policy (auto-archive na 2 jaar)
- [ ] Skill Matrix Dashboard: Visualiseer vaardigheden van personeel in PersonnelManager voor optimale machine-indeling.
- [ ] Shift Handover Tool: Gestructureerde overdrachtmodule in DigitalPlanningHub; ploeg draagt status/orders over via MESSAGES.
- **Impact:** ISO 9001 compliance klaar

### 5.4 Order Management & Integriteit (NIEUW)
- [ ] **Rol-gebaseerde Prioritering:** Alleen Teamleiders/Admins mogen order prioriteit wijzigen. Central Planners niet.
- [ ] **Veilige Annulering:** Orders kunnen niet verwijderd worden, alleen geannuleerd met verplichte reden.
- [ ] **Audit Trail:** Annuleringen worden gelogd in `activity_logs` met reden en gebruiker.
- [ ] **Permissies:** Annuleren is voorbehouden aan Planners, Teamleiders en Admins.
- **Impact:** Voorkomt dataverlies en borgt traceerbaarheid van niet-geproduceerde orders.

---

## 🔭 Fase 6: Future Factory Intelligence (Toekomst)
**Doel:** Van volgend naar voorspellend.  
**Target:** Q3-Q4 2026

### 6.1 Label & Output Integration
- [ ] Direct ZPL Printing: Integratie met Zebra Browser Print voor label-output zonder PDF-stap.
- [ ] Eliminate pdfGenerator.js bottleneck (gebruik direct binary output)
- [ ] Barcode format auto-detection (QR, Code128, Datamatrix)

### 6.2 Predictive Analytics
- [ ] AI Predictive Maintenance: Analyse van afkeur-trends om machine-onderhoud te voorspellen.
- [ ] Machine learning model train op 6+ maanden historische NCR-data
- [ ] Alert generation voor preventief onderhoud
- [ ] Downtime voorspelling → 30% minder breakdowns
- [ ] AI-gestuurde Planning Optimization: AiAssistantView doet suggesties voor ordervolgorde op basis van actuele bezetting en historische data.
- [ ] Automatische NCR-herkenning: AI analyseert defectfoto's en stelt foutcode/ernst voor bij NCR.
- [ ] Voice-to-Log: Operators kunnen lognotities inspreken; AI zet deze om in tekst voor ACTIVITY_LOGS.

### 6.3 Real-time Factory Visibility
- [ ] IoT Dashboards: Live weergave van machine-status op grote schermen in de fabriek.
- [ ] WebSocket live metrics (vs polling) → -80% server load
- [ ] Grafana integration voor monitoring
- [ ] KPI dashboard: OEE, throughput, defect rates
- [ ] Energy Tracking per Order: Koppel slimme meters en bereken energieverbruik per lotnummer voor CO2-rapportage.
- [ ] Afvalregistratie: Registreer restmateriaal/snĳafval in TRACKING om grondstof-yield te optimaliseren.

### 6.4 Machine & Sensor Integratie (IoT / Webhooks)
- [ ] **Automatische Naharding (BM01):** Koppeling maken met de temperatuur/sensor-software van de ovens. Zodra een droog/nahardingsprogramma is voltooid, stuurt de oven-software een webhook of API-signaal naar de Firebase backend, waarna de actieve Naharding batch volautomatisch in het systeem wordt gereedgemeld en gearchiveerd.

---

## 🔗 Fase 7: Externe Integraties (NIEUW)
**Doel:** Naadloze data-uitwisseling met externe systemen (o.a. ATPS).
**Target:** Q4 2026 / 2027

### 7.1 HR & Planning Connectie (ATPS)
- [ ] **ATPS Koppeling (Optie A - API):**
  - [ ] Cloud Functions voor veilige communicatie met ATPS server.
  - [ ] Real-time sync van in/uitklok tijden en beschikbaarheid.
- [ ] **Data Import Module (Optie B - CSV/Excel):**
  - [ ] Bulk import van roosters en personeelslijsten.

### 7.2 ERP/Boekhouding (Infor LN)
- [ ] Export orders/voorraad mutaties naar ERP (Infor LN).
- [ ] Import verkooporders vanuit extern verkoop portaal.
- [ ] Artikelstam data synchronisatie (Item Master).

---

## 🌍 Fase 8: Global Rollout & Multi-Site (Strategie)
**Doel:** Architectuur gereedmaken voor internationale uitrol (Dubai, Egypte, Houston, etc.).
**Target:** 2027+

### 8.1 Multi-Tenancy Architectuur
- [ ] **Database Partitioning:** Splits data per locatie (`/locations/{siteId}/...`) in plaats van één root.
- [ ] **Global Admin:** Rol die kan wisselen tussen fabrieken (Site Switcher).
- [ ] **Location-Based Auth:** Gebruikersrechten beperken tot hun specifieke `siteId`.

### 8.2 Lokalisatie & Configuratie
- [ ] **i18n Implementatie:** Volledige vertaling (NL/EN/AR) via `react-i18next`.
- [ ] **Tijdzones:** Server-side UTC opslag, client-side lokale tijd conversie voor ploegendiensten.
- [ ] **Dynamische Factory Config:** 'Settings' collectie per fabriek voor afwijkende machine-opstellingen.
- [ ] **RTL Support:** CSS aanpassingen voor Arabische weergave (indien nodig).

---

## 🛠️ Onderhoud & Asset Management
**Target:** Doorlopend, parallel aan andere fases

### Prioriteit 1: Technische Schuld (Q1 2026)
- [ ] Condition-Based Maintenance: Logboek voor machine-uren; bij overschrijding automatisch ticket in Communication Hub.
- [ ] Spare Parts Inventory: Koppel INVENTORY aan machines; onderdelen direct afboeken via MobileScanner.
- [ ] TypeScript Migratie: Start met `useAdminAuth`, `dbPaths`, firestore hooks
  - [ ] Phase 1: Core infrastructure hooks → .ts
  - [ ] Phase 2: Admin components → .tsx (PersonnelManager, Terminal)
  - [ ] Phase 3: Utils & helpers → .ts
  - **Batches:** 3 sprints, -20% type-errors
- [ ] **TypeScript Optimalisaties:**
  - [ ] Gebruik `import type` voor kleinere bundles.
  - [ ] Strikte interfaces voor V8 engine optimalisatie.
- [ ] Firebase SDK Upgrade: v9+ met tree-shaking optimized imports
- [ ] Remove duplicate logic in label/lot utilities

### Prioriteit 2: Quality Assurance (Q2 2026)
- [ ] GitHub Ops: Synchronisatie van de broncode met een externe repository voor versiebeheer.
  - [ ] Setup branch protection rules
  - [ ] PR review workflow
  - [ ] Automated testing (E2E Cypress, unit Jest)
- [ ] ESLint/Prettier config voor consistency
- [ ] Storybook setup voor component dokumentatie
- [ ] Test coverage target: >60%

### Prioriteit 3: DevOps & Infra (Q3 2026)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Staging environment + production parity
- [ ] Sentry/LogRocket error tracking
- [ ] Automated performance benchmarks