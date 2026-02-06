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

### 4. Energie & Duurzaamheid
- **Energy Tracking per Order:** Koppel slimme meters en bereken energieverbruik per lotnummer voor CO2-rapportage.
- **Afvalregistratie:** Registreer restmateriaal/snĳafval in TRACKING om grondstof-yield te optimaliseren.

### 5. Operator Engagement
- **Skill Matrix Dashboard:** Visualiseer vaardigheden van personeel in PersonnelManager voor optimale machine-indeling.
- **Shift Handover Tool:** Gestructureerde overdrachtmodule in DigitalPlanningHub; ploeg draagt status/orders over via MESSAGES.

> Deze uitbreidingen benutten de bestaande dbPaths.js structuur en versterken de app als centrale 'Single Source of Truth' voor de fabriek.
# 🚀 Master Roadmap: FPi Future Factory

**Status:** 1 februari 2026  
**Projectleider:** Richard van Heerde  
**Huidige Fase:** Fase 4 (Performance & Schaalbaarheid)  
**Last Updated:** 1 feb 2026

Dit document is de **'Single Source of Truth'** voor de technische ontwikkeling.

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
**Target:** Q1 2026

### 4.1 Component Optimization & Code Splitting
- [ ] **Monolitische Componenten Refactoren:**
  - [ ] PersonnelManager (1.053 lines) → Split in 4-5 subcomponenten
  - [ ] Terminal (912 lines) → Extract Station, Order & Timeline views
  - [ ] ConversionManager (825 lines) → Split data import & preview modes
  - [ ] AdminLabelDesigner (659 lines) → Separate label preview & settings
  - **Impact:** -40-50% render time, sneller hot-reloading

### 4.2 Virtualisatie & List Rendering
- [ ] **react-window integratie:**
  - [ ] PlanningListView (530 lines) - 100%+ sneller met 1000+ orders
  - [ ] AdminReferenceTable (421 lines) - Table header sticky + virtual rows
  - [ ] ProductDetailModal (526 lines) - Lazy-load product images & specs
  - **Impact:** Browser blijft responsief tot 10.000+ records

### 4.3 Firestore Query Optimization
- [ ] **Index & Query Caching:**
  - [ ] Voeg composite indexes toe voor (orderStatus, week, machine)
  - [ ] Implementeer lokale query caching in usePlanningData hook
  - [ ] Batch multiple `onSnapshot` listeners in Terminal.jsx
  - **Impact:** -70% Firestore read quota

### 4.4 React.memo & useCallback Audit
- [ ] Wrap high-frequency components met React.memo:
  - [ ] StatusBadge, ProductCard (rendered 100+ maal)
  - [ ] OrderDetailModal, DrillDownModal
  - [ ] Station telemetry componenten
- [ ] useCallback wrap event handlers in TeamleaderHub, Terminal
- **Impact:** -30% unnecessary re-renders

### 4.5 Bundle Size & Code Splitting
- [ ] Lazy load admin-modules (AdminMatrixManager, AdminDrillingView)
- [ ] Defer non-critical CSS (animations, themes)
- [ ] Tree-shake unused constants.js exports (376 lines)
- **Impact:** -25% initial bundle, +35% faster first paint

**Prioriteit:** 🔴 Hoog - Kritisch voor schaalbare groei.
**Blockering:** Fase 5 & 6 hangen hiervan af.

---

## 🛡️ Fase 5: Kwaliteitsborging & QC (In Ontwikkeling)

**Doel:** Digitale registratie van meetwaarden.  
**Target:** Q2 2026

### 5.1 Meetwaarde Invoer & Tolerantie Control
- [ ] Meetwaarde Invoer: Verplichte invoer van toleranties tijdens productie-intervallen.
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

**Prioriteit:** 🟠 Gemiddeld - Essentieel voor kwaliteitscontrole.

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

**Prioriteit:** 🟡 Laag - Innovatie & toekomst.
**Afhankelijk van:** Fase 4 Performance & Fase 5 QC data.

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

**Prioriteit:** 🟡 Laag - Wacht op stabiele basis (Fase 1-6).
**Afhankelijk van:** Fase 3 (Admin) & Fase 4 (Schaalbaarheid).

---

## 🛠️ Onderhoud & Asset Management

**Target:** Doorlopend, parallel aan andere fases

### Prioriteit 1: Technische Schuld (Q1 2026)
### Condition-Based Maintenance & Spare Parts
- [ ] Condition-Based Maintenance: Logboek voor machine-uren; bij overschrijding automatisch ticket in Communication Hub.
- [ ] Spare Parts Inventory: Koppel INVENTORY aan machines; onderdelen direct afboeken via MobileScanner.
- [ ] TypeScript Migratie: Start met `useAdminAuth`, `dbPaths`, firestore hooks
  - [ ] Phase 1: Core infrastructure hooks → .ts
  - [ ] Phase 2: Admin components → .tsx (PersonnelManager, Terminal)
  - [ ] Phase 3: Utils & helpers → .ts
  - **Batches:** 3 sprints, -20% type-errors
  
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

**Prioriteit:** 🟢 Laag-Gemiddeld - Ondersteunt langetermijnkwaliteit.
**Afhankelijk van:** Fase 4 stabilisatie

---

## 📋 Code Audit Findings (Basis voor Verbeteringen)

### Component Size & Complexity
| Component | Lines | Status | Actie |
|-----------|-------|--------|-------|
| PersonnelManager | 1.053 | 🔴 Kritiek | Split 4-5 subcomponenten (Fase 4.1) |
| Terminal | 912 | 🟠 Hoog | Extract Station/Order views (Fase 4.1) |
| ConversionManager | 825 | 🟠 Hoog | Separate data import & preview (Fase 4.1) |
| AdminLabelDesigner | 659 | 🟡 Medium | Lazy-load designer canvas (Fase 4.5) |
| BlueprintsView | 628 | 🟡 Medium | Extract blueprint preview (Fase 4.2) |

### Optimization Opportunities
- **React.memo Coverage:** Alleen 26 componenten hebben React.memo/useMemo (target: 50+)
- **Firestore Queries:** Multiple `onSnapshot` listeners in Terminal (batch samen)
- **constants.js:** 376 lines - veel ongebruikte exports
- **Bundle Size:** ~28.8KB JS code voor 50 componenten → potential -25%
- **List Rendering:** 0 use van virtualisatie → O(n) render performance

### Technical Debt Score: 6.5/10
- ✅ Architecture solid (PATHS, lazy loading)
- ✅ Error boundaries in place
- 🟡 Typing incomplete (JSX files, need TS migration)
- 🟡 Test coverage absent
- 🟡 No monitoring/analytics

---

## 📊 Voortgang Overzicht

| Fase | Status | Voortgang | Target |
|------|--------|-----------|--------|
| 1    | ✅ Voltooid | 100% | - |
| 2    | ✅ Voltooid | 100% | - |
| 3    | ✅ Voltooid | 100% | - |
| 4    | 🚀 Actief | 0% | Q1 2026 |
| 5    | 📋 Gepland | 0% | Q2 2026 |
| 6    | 🔮 Toekomst | 0% | Q3-Q4 2026 |
| 7    | 🔗 Concept | 0% | Q4 2026+ |

---

## 🔗 Dependencies & Kritieke Paden

- **Fase 4 → Fase 5:** Performance moet stabiel zijn voordat QC-workflow volledig wordt geïmplementeerd.
- **Fase 4 → Fase 6:** Schaalbare database-queries zijn essentieel voor predictive analytics.
- **Onderhoud:** TypeScript-migratie kan parallel lopen, maar prioriteit na Fase 4.

---

## 📝 Opmerkingen voor Volgende Sprint

### Fase 4 Sprint Planning

**Week 1-2: PersonnelManager Split**
- Zet sub-components op: PersonnelTeamView, PersonnelScheduleView, PersonnelImportView
- Target: Component size < 400 lines each
- Acceptance: Pass prop-drilling test, maintain feature parity

---

**Week 3: Terminal Refactor**
- Extract StationPanel, OrderTimeline, ReleaseHandler
- Batch 5x `onSnapshot` listeners → 1 batched listener
- Test on 1000+ order mock data

---

**Week 4: react-window Integration**
- Install & setup react-window
- Implement in PlanningListView + AdminReferenceTable
- Measure: FCP, LCP, CLS metrics

---

**Week 5: Bundle Analysis**
- Webpack/Vite bundle analysis
- Identify tree-shake candidates
- Defer CSS animations to critical path

---

### Success Metrics (Fase 4)
- ✅ TTI (Time to Interactive): < 3s (from 5.2s)
- ✅ Largest Contentful Paint: < 2.5s (from 4.1s)
- ✅ Component re-render overhead: -40%
- ✅ Bundle size: -20% (150KB → 120KB)
- ✅ 10.000 orders rendering: 60fps min

---

### Blockers & Risks
- 🚨 **Risk:** Terminal.jsx complexity → Schedule +3 days for spike
- 🚨 **Risk:** Firestore batch listener changes → QA required
- ℹ️ **Info:** React 18.3 upgrade before Code Splitting (in progress)

---

*Laatst bijgewerkt: 1 februari 2026 door Richard van Heerde*
