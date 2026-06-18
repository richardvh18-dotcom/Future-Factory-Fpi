

# ==========================================
# 📄 Oorspronkelijk document: WORKFLOW_GUIDE.md
# ==========================================


# 🎯 Workflow: Parallel Werken Pilot & Preview

**Datum:** Maart 8, 2026  
**Setup:** Twee actieve branches in FPIFF-30-1

---

## 📊 Branch Strategie

```
FPIFF-30-1 Repository
│
├── FpiFF-Pilot-Ready (STABLE)
│   ├── Status: In productie tijdens pilot
│   ├── Wijzigingen: Alleen hotfixes en kritieke bugs
│   └── Deploy: Direct naar productie
│
└── preview-v2 (EXPERIMENTAL)
    ├── Status: Actieve ontwikkeling
    ├── Wijzigingen: Nieuwe features, experimenten
    └── Deploy: Test/staging omgeving
```

---

## 🔄 Daily Workflow

### Werken aan Pilot Bugfixes

```bash
# Schakel naar pilot branch
git checkout FpiFF-Pilot-Ready

# Zorg dat je up-to-date bent
git pull origin FpiFF-Pilot-Ready

# Maak fix
# ... bewerk bestanden ...

# Commit en push
git add .
git commit -m "fix: beschrijving van de fix"
git push origin FpiFF-Pilot-Ready

# Deploy naar productie (indien Firebase)
npm run deploy
```

### Werken aan Nieuwe Features (Preview v2)

```bash
# Schakel naar preview branch
git checkout preview-v2

# Zorg dat je up-to-date bent
git pull origin preview-v2

# Optioneel: Merge laatste pilot fixes naar preview
git merge FpiFF-Pilot-Ready

# Werk aan nieuwe feature
# ... bewerk bestanden ...

# Commit en push
git add .
git commit -m "feat: beschrijving van nieuwe feature"
git push origin preview-v2
```

---

## ⚡ Quick Commands

### Branch Wisselen
```bash
# Naar pilot (stable)
git checkout FpiFF-Pilot-Ready

# Naar preview (development)
git checkout preview-v2

# Check huidige branch
git branch --show-current
```

### Status Checken
```bash
# Wat is er veranderd?
git status

# Verschil tussen branches zien
git diff FpiFF-Pilot-Ready preview-v2

# Commits die nog niet gemerged zijn
git log FpiFF-Pilot-Ready..preview-v2 --oneline
```

### Sync Tussen Branches
```bash
# Pilot fixes naar preview overnemen (wekelijks)
git checkout preview-v2
git merge FpiFF-Pilot-Ready
git push origin preview-v2
```

---

## 🚨 Emergency Hotfix Tijdens Pilot

Als er een kritieke bug is tijdens de pilot test:

```bash
# 1. Schakel direct naar pilot branch
git checkout FpiFF-Pilot-Ready

# 2. Maak de fix
# ... edit files ...

# 3. Test lokaal
npm run dev

# 4. Commit en push DIRECT
git add .
git commit -m "hotfix: [URGENT] beschrijving"
git push origin FpiFF-Pilot-Ready

# 5. Deploy direct naar productie
npm run deploy

# 6. Merge fix naar preview (belangrijk!)
git checkout preview-v2
git merge FpiFF-Pilot-Ready
git push origin preview-v2
```

---

## 📋 Weekly Maintenance

### Elke Vrijdag (Einde Week)

```bash
# 1. Sync alle pilot fixes naar preview
git checkout preview-v2
git merge FpiFF-Pilot-Ready
git push origin preview-v2

# 2. Tag pilot versie (optioneel)
git checkout FpiFF-Pilot-Ready
git tag -a v1.0-pilot-week$(date +%U) -m "Pilot week $(date +%U)"
git push origin --tags

# 3. Backup check
git log --oneline --graph --all -10
```

---

## 🎨 Feature Development Workflow (Preview v2)

### Grote Feature Toevoegen

```bash
# 1. Feature branch maken vanaf preview-v2
git checkout preview-v2
git checkout -b feature/naam-van-feature

# 2. Ontwikkel feature
# ... code changes ...

# 3. Regelmatig committen
git add .
git commit -m "feat(module): beschrijving"

# 4. Preview v2 up-to-date houden
git checkout preview-v2
git pull origin preview-v2
git checkout feature/naam-van-feature
git merge preview-v2

# 5. Als feature klaar is
git checkout preview-v2
git merge feature/naam-van-feature
git push origin preview-v2

# 6. Verwijder feature branch
git branch -d feature/naam-van-feature
```

---

## 🧪 Testing Strategy

### Test op Pilot Branch
```bash
git checkout FpiFF-Pilot-Ready
npm run dev
# Test in browser op http://localhost:5173
```

### Test op Preview Branch
```bash
git checkout preview-v2
npm run dev
# Test nieuwe features
```

### Side-by-side Testing
```bash
# Terminal 1 - Pilot
git checkout FpiFF-Pilot-Ready
npm run dev -- --port 3000

# Terminal 2 - Preview  
git checkout preview-v2
npm run dev -- --port 3001

# Open beide: http://localhost:3000 en http://localhost:3001
```

---

## 📝 Commit Message Conventie

### Voor Pilot Branch (FpiFF-Pilot-Ready)
- `fix:` - Bug fixes
- `hotfix:` - Urgente fixes
- `docs:` - Documentatie updates
- `chore:` - Kleine maintenance

### Voor Preview Branch (preview-v2)
- `feat:` - Nieuwe features
- `refactor:` - Code restructuring
- `perf:` - Performance verbeteringen
- `test:` - Tests toevoegen
- `style:` - UI/UX aanpassingen

**Voorbeelden:**
```bash
# Pilot
git commit -m "fix: lotnummer duplicate check in WorkstationHub"
git commit -m "hotfix: terminal teller crash bij null values"

# Preview
git commit -m "feat: ERP sync module met Infor LN"
git commit -m "feat(ncr): digitale NCR workflow toegevoegd"
```

---

## 🔍 Code Review Checklist

### Voor Pilot Commits
- [ ] Bug is gereproduceerd en getest
- [ ] Fix werkt zonder side effects
- [ ] Geen breaking changes
- [ ] Performance impact minimaal
- [ ] Getest door minimaal 1 operator

### Voor Preview Commits
- [ ] Feature volledig geïmplementeerd
- [ ] Code is gedocumenteerd
- [ ] Geen gehardcoded values
- [ ] Error handling toegevoegd
- [ ] Responsive op mobile/tablet
- [ ] i18n vertalingen toegevoegd

---

## 📦 Deployment

### Pilot Branch → Productie
```bash
git checkout FpiFF-Pilot-Ready
git pull origin FpiFF-Pilot-Ready

# Build
npm run build

# Deploy naar Firebase
firebase deploy --only hosting

# Of naar Vercel
vercel --prod
```

### Preview Branch → Staging
```bash
git checkout preview-v2
git pull origin preview-v2

# Build
npm run build

# Deploy naar staging
firebase deploy --only hosting:staging

# Of naar Vercel preview
vercel
```

---

## 🐛 Troubleshooting

### "Diverged branches" Error
```bash
# Conflict tussen local en remote
git fetch origin
git rebase origin/FpiFF-Pilot-Ready
# Los conflicts op
git rebase --continue
git push origin FpiFF-Pilot-Ready
```

### Verkeerde Branch Gecommit
```bash
# Laatste commit verplaatsen naar andere branch
git reset HEAD~1 --soft
git stash
git checkout correcte-branch
git stash pop
git add .
git commit -m "juiste message"
```

### Merge Conflict
```bash
git checkout preview-v2
git merge FpiFF-Pilot-Ready
# CONFLICT in bestand.jsx
# Bewerk bestand.jsx handmatig
git add bestand.jsx
git commit -m "merge: resolve conflicts from pilot branch"
git push origin preview-v2
```

---

## 📊 Handy Aliases (Optioneel)

Voeg toe aan `.gitconfig`:

```bash
[alias]
    pilot = checkout FpiFF-Pilot-Ready
    preview = checkout preview-v2
    sync = !git checkout preview-v2 && git merge FpiFF-Pilot-Ready
    st = status -sb
    lg = log --oneline --graph --decorate -10
```

Gebruik:
```bash
git pilot    # Switch naar pilot
git preview  # Switch naar preview
git sync     # Merge pilot → preview
```

---

## 🎯 Prioriteiten Tijdens Pilot

### Week 1-2 (Maart 8-22)
**Focus:** Stabiliteit pilot
- Monitor pilot branch voor bugs
- Kleine fixes direct in pilot
- Preview v2: planning en setup

### Week 3-4 (Maart 22 - April 5)
**Focus:** Pilot optimalisatie + preview basis
- Pilot: UX verbeteringen
- Preview: ERP integratie fundament

### Week 5+ (April 5+)
**Focus:** Preview features
- Pilot: maintenance only
- Preview: volledige feature development

---

## 🔔 Notificaties & Monitoring

### Pilot Issues Tracken
- Gebruik GitHub Issues met label `pilot-bug`
- Priority: P0 (critical), P1 (high), P2 (normal)
- Wekelijkse review meeting

### Preview Progress
- Feature requests met label `preview-v2`
- Sprint planning iedere 2 weken
- Demo's voor stakeholders

---

**Last Updated:** Maart 8, 2026  
**Status:** ✅ Actief - Beide branches ready  
**Current Branch:** FpiFF-Pilot-Ready


# ==========================================
# 📄 Oorspronkelijk document: VERCEL_DEPLOYMENT_GUIDE.md
# ==========================================


# 🚀 Vercel Deployment Setup - Pilot & Preview

**Datum:** Maart 8, 2026  
**Doel:** Twee gescheiden Vercel deployments voor parallel werken

---

## 🎯 Deployment Strategie

```
┌─────────────────────────────────────────────┐
│  Production Deployment                      │
│  ├── Branch: FpiFF-Pilot-Ready             │
│  ├── URL: fpiff-pilot.vercel.app           │
│  └── Auto-deploy: Bij push naar branch     │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Preview Deployment                         │
│  ├── Branch: preview-v2                     │
│  ├── URL: fpiff-preview-v2.vercel.app       │
│  └── Auto-deploy: Bij push naar branch     │
└─────────────────────────────────────────────┘
```

---

## 📋 Setup Stappen

### Stap 1: Vercel CLI Installeren (Als nog niet gedaan)

```bash
npm install -g vercel
vercel login
```

### Stap 2: Link Project (Eenmalig)

```bash
cd /workspaces/FPIFF-30-1
vercel link
```

Volg prompts:
- Set up and deploy? **Y**
- Which scope? **richardvh18-dotcom**
- Link to existing project? **N**
- Project name: **fpiff-pilot-ready**

### Stap 3: Configureer Production Branch

In Vercel Dashboard:
1. Ga naar: https://vercel.com/richardvh18-dotcom/fpiff-pilot-ready
2. **Settings** → **Git**
3. **Production Branch**: `FpiFF-Pilot-Ready`
4. ✅ Save

### Stap 4: Deploy Pilot (Production)

```bash
# Zorg dat je op pilot branch zit
git checkout FpiFF-Pilot-Ready

# Deploy naar production
vercel --prod

# Of via Git push (auto-deploy)
git push origin FpiFF-Pilot-Ready
```

### Stap 5: Deploy Preview (Development)

```bash
# Schakel naar preview branch
git checkout preview-v2

# Deploy als preview
vercel

# Of via Git push (auto-deploy preview)
git push origin preview-v2
```

---

## 🔧 Vercel Configuration

### Environment Variables Instellen

In Vercel Dashboard → Settings → Environment Variables:

#### Beide Deployments (Production & Preview):
```
VITE_FIREBASE_API_KEY=<your-key>
VITE_FIREBASE_AUTH_DOMAIN=<your-domain>
VITE_FIREBASE_PROJECT_ID=fpiff-pilot
VITE_FIREBASE_STORAGE_BUCKET=<your-bucket>
VITE_FIREBASE_MESSAGING_SENDER_ID=<your-id>
VITE_FIREBASE_APP_ID=<your-app-id>
VITE_FIREBASE_MEASUREMENT_ID=<your-measurement-id>
```

**Belangrijk:** 
- Vercel gebruikt automatisch `VITE_` prefixed variabelen
- Voeg NOOIT echte credentials toe aan Git
- Gebruik Vercel UI voor environment variables

---

## 🌐 Domain Setup (Optioneel)

### Production Domain
```
pilot.futurefactory.nl → FpiFF-Pilot-Ready (Production)
```

In Vercel:
1. **Settings** → **Domains**
2. Add domain: `pilot.futurefactory.nl`
3. Configure DNS bij je provider

### Preview Domain
```
preview.futurefactory.nl → preview-v2 (Preview)
```

Of gebruik Vercel's standaard URLs:
- Production: `fpiff-pilot-ready.vercel.app`
- Preview: `fpiff-pilot-ready-git-preview-v2.vercel.app`

---

## 🔄 Auto-Deploy Workflow

### Pilot Branch (Production)
```bash
# Maak een fix
git checkout FpiFF-Pilot-Ready
# ... edit files ...
git add .
git commit -m "fix: beschrijving"
git push origin FpiFF-Pilot-Ready

# ⚡ Vercel deployt AUTOMATISCH naar production
```

### Preview Branch
```bash
# Nieuwe feature
git checkout preview-v2
# ... build feature ...
git add .
git commit -m "feat: nieuwe feature"
git push origin preview-v2

# ⚡ Vercel deployt AUTOMATISCH als preview
```

---

## 📊 Deployment Status Checken

### Via CLI
```bash
# Lijst alle deployments
vercel ls

# Status van laatste deployment
vercel inspect

# Logs bekijken
vercel logs
```

### Via Dashboard
1. Ga naar: https://vercel.com/richardvh18-dotcom
2. Klik op project: **fpiff-pilot-ready**
3. Zie alle deployments onder **Deployments** tab

---

## 🚨 Troubleshooting

### Build Fails

**Check build logs:**
```bash
vercel logs <deployment-url>
```

**Veelvoorkomende Issues:**
- Missing env variables → Voeg toe in Vercel dashboard
- Build command niet correct → Check `package.json`
- Node version → Vercel gebruikt Node 18 default

### Environment Variables Niet Beschikbaar

Vercel injecteert env vars tijdens build. Test lokaal:
```bash
# Maak .env.local
cp .env.example .env.local
# Vul in met echte waarden

# Test build
npm run build
npm run preview
```

### Domain Niet Werkend

Check DNS settings:
- A Record: `76.76.21.21` (Vercel)
- CNAME: `cname.vercel-dns.com`
- Wait 24h voor DNS propagatie

---

## 🎯 Build Commands

### Lokaal Testing (Voordat je deploy)

```bash
# Test production build
npm run build
npm run preview

# Open http://localhost:4173
```

### Vercel Build Command (Auto-configured)

In `package.json` staat al:
```json
{
  "scripts": {
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

Vercel gebruikt automatisch:
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

---

## 🔐 Security Headers (Already Configured)

`vercel.json` bevat al:
- Cache headers voor assets
- SPA routing rewrites

Voor extra security (optioneel toevoegen):
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ]
}
```

---

## 📱 Testing Checklist

### Na Deployment

Voor **Production** (Pilot):
- [ ] Login werkt met Firebase auth
- [ ] Firestore data laadt correct
- [ ] Labels kunnen geprint worden
- [ ] Alle routes werken (geen 404)
- [ ] Performance OK (Lighthouse > 80)
- [ ] Mobiel responsive
- [ ] Alle talen laden (nl/en/de/ar)

Voor **Preview**:
- [ ] Nieuwe features functioneel
- [ ] Geen breaking changes
- [ ] Console errors check
- [ ] Firebase connectie OK

---

## 🔄 Rollback Strategy

### Bij Problemen in Production

**Optie 1: Via Vercel Dashboard**
1. Ga naar **Deployments**
2. Vind vorige werkende deployment
3. Klik **•••** → **Promote to Production**

**Optie 2: Via Git**
```bash
git checkout FpiFF-Pilot-Ready
git revert HEAD  # Laatste commit terugdraaien
git push origin FpiFF-Pilot-Ready
```

**Optie 3: Via CLI**
```bash
vercel rollback
```

---

## 📊 Monitoring & Analytics

### Vercel Analytics (Inbegrepen)

In Dashboard:
- **Analytics** → See page views, performance
- **Speed Insights** → Core Web Vitals
- **Logs** → Runtime errors

### Firebase Analytics (Al geconfigureerd)

Via Firebase Console:
- Gebruikers tracking
- Error reporting
- Custom events

---

## 💰 Vercel Limits (Free Tier)

- ✅ Bandwidth: 100 GB/maand
- ✅ Deployments: Unlimited
- ✅ Build time: 6000 minuten/maand
- ⚠️ Serverless invocations: 100k/maand (niet relevant voor static)

Voor grotere volumes: Upgrade naar **Pro** ($20/maand)

---

## 🎯 Quick Reference

```bash
# Deploy production (pilot)
git checkout FpiFF-Pilot-Ready
git push origin FpiFF-Pilot-Ready

# Deploy preview
git checkout preview-v2  
git push origin preview-v2

# Manual deploy (als auto-deploy niet werkt)
vercel --prod  # Production
vercel         # Preview

# Deployment status
vercel ls

# Logs bekijken
vercel logs <url>

# Project info
vercel inspect
```

---

## 🔗 Useful Links

- **Vercel Dashboard**: https://vercel.com/richardvh18-dotcom
- **Docs**: https://vercel.com/docs
- **CLI Reference**: https://vercel.com/docs/cli
- **Build Config**: https://vercel.com/docs/build-step

---

## ✅ Success Checklist

Setup is compleet als:

- [ ] Vercel project linked
- [ ] Production branch = FpiFF-Pilot-Ready
- [ ] Auto-deploy werkt bij push
- [ ] Environment variables ingesteld
- [ ] Both URLs accessible:
  - Production: `fpiff-pilot-ready.vercel.app`
  - Preview: `...-git-preview-v2-....vercel.app`
- [ ] Firebase auth werkt op beide
- [ ] Build succesvol (no errors)

---

**Last Updated:** Maart 8, 2026  
**Status:** 📋 Setup Guide Ready  
**Next:** Run setup commands


# ==========================================
# 📄 Oorspronkelijk document: SECURITY.md
# ==========================================


# 🔐 Security Best Practices - API Keys & Secrets

## ✅ Git Geschiedenis Schoongemaakt
De oude gelekte Google AI API key is **volledig verwijderd** uit de git geschiedenis op **03-02-2026**.

---

## 📋 Hoe API Keys Veilig Houden

### 1. **Gebruik .env Bestanden (NOOIT committen)**

```bash
# ✅ Goed: .env lokaal op je machine
VITE_GOOGLE_AI_KEY=AIzaSy...
VITE_FIREBASE_API_KEY=AIza...
```

**Altijd controleren dat .env in .gitignore staat:**
```gitignore
# .gitignore
.env
.env.*
!.env.example
```

### 2. **Gebruik .env.example voor Templates**

Maak een `.env.example` bestand zonder echte secrets:
```bash
# .env.example (mag wel gecommit worden)
VITE_GOOGLE_AI_KEY=your_api_key_here
VITE_FIREBASE_API_KEY=your_firebase_key_here
VITE_FIREBASE_PROJECT_ID=your_project_id
```

### 3. **Voor Vercel/Deployment: Environment Variables**

API keys worden **niet** in de code opgenomen, maar via Vercel UI of CLI:

```bash
# Voeg secrets toe aan Vercel
vercel env add VITE_GOOGLE_AI_KEY production
vercel env add VITE_GOOGLE_AI_KEY preview
```

Of via [Vercel Dashboard](https://vercel.com/dashboard) → Settings → Environment Variables

---

## 🚨 Als API Key Gelekt Is

### Stap 1: Nieuwe Key Aanmaken
1. Ga naar [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Maak een nieuwe API key
3. Verwijder/revoke de oude key

### Stap 2: Vervang Lokaal
```bash
# Update .env met nieuwe key
nano .env
```

### Stap 3: Update Vercel
```bash
# Verwijder oude key
vercel env rm VITE_GOOGLE_AI_KEY production

# Voeg nieuwe toe
echo "NIEUWE_KEY" | vercel env add VITE_GOOGLE_AI_KEY production
```

### Stap 4: Clean Git Geschiedenis (indien gecommit)

```bash
# Installeer git-filter-repo
pip3 install git-filter-repo

# Verwijder .env uit volledige geschiedenis
git filter-repo --invert-paths --path .env --force

# Force push naar GitHub
git remote add origin https://github.com/USERNAME/REPO.git
git push --force --all origin
```

---

## 🛡️ Extra Beveiliging

### API Key Restrictions (Google Cloud Console)

1. Ga naar [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Selecteer je API key
3. Stel restrictie in:
   - **Application restrictions**: HTTP referrers
   - **Toegestane websites**: 
     - `https://your-domain.vercel.app/*`
     - `http://localhost:3000/*` (voor development)
   - **API restrictions**: Alleen Google AI API

### Firebase Security Rules

Zorg dat je Firestore rules strikt zijn:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Alleen geauthenticeerde gebruikers
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## ✅ Checklist Voordat je Commit

- [ ] .env staat in .gitignore
- [ ] Geen API keys in source code
- [ ] .env.example is up-to-date (zonder echte keys)
- [ ] Vercel environment variables zijn ingesteld
- [ ] API restrictions zijn actief in Google Cloud Console

---

## 📚 Referenties

- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables)
- [Google Cloud API Key Best Practices](https://cloud.google.com/docs/authentication/api-keys)


# ==========================================
# 📄 Oorspronkelijk document: TYPESCRIPT_MIGRATIE_PLAN.md
# ==========================================


# TypeScript Migratieplan

## Doel
De codebase gefaseerd migreren naar TypeScript zonder productie-regressies, met de regel:
- Nieuwe code in `src/` is alleen `.ts` / `.tsx`.
- Legacy `.js` / `.jsx` mag tijdelijk blijven tot migratie afgerond is.

## Huidige status (8 mei 2026)
- Guardrail actief:
  - `npm run enforce:new-ts`
  - blokkeert nieuwe `.js`/`.jsx` in `src/` (baseline-gestuurd).
- Baselinebestand:
  - `scripts/ts-js-baseline.json` (200 bestanden)
- Migratie Fase 1 afgerond (utilities/services)
- Migratie Fase 2 afgerond (repositories + hooks)
- Migratie Fase 3 afgerond (config, data, pure utils/services)

## Reeds gemigreerde bestanden (Fase 3)
11. `src/config/dbPaths.ts`
12. `src/data/constants.ts`
13. `src/services/logService.ts`
14. `src/services/versionService.ts`
15. `src/utils/calculations.ts`
16. `src/utils/lendingHelpers.ts`
17. `src/utils/lotLogic.ts`

## Volgende fase (Fase 4)
Migrateer complexere utility-modules zonder JSX:
1. `src/utils/helpers.js` (aiService afhankelijkheid, let op)
2. `src/utils/labelPreviewMetrics.js`
3. `src/utils/labelHelpers.jsx` → `.tsx`
4. `src/utils/productHelpers.js`
5. `src/utils/conversionLogic.js`
6. `src/utils/archiveService.js`
7. `src/utils/pdfUtils.js`
8. `src/config/firebase.js` → `.ts` (complex, als laatste)

## Werkwijze per bestand
1. Hernoem `.js` -> `.ts` (of `.jsx` -> `.tsx` bij JSX)
2. Fix imports met expliciete extensie
3. Voeg minimale type-annotaties toe op publieke functies
4. Run:
   - `npm run type-check`
   - `npm run build`
5. Na batch:
   - `npm run ts:refresh-baseline`
   - `npm run enforce:new-ts`

## Strikter maken (pas na stabiele Fase 2)
1. Zet `noImplicitAny` aan
2. Daarna `strictNullChecks` aan
3. Daarna volledige `strict: true`

## Hervat-commando’s
Gebruik dit bij volgende sessie om direct door te pakken:

```bash
npm run enforce:new-ts
npm run type-check
npm run build
```

En start daarna met Fase 2 uit dit document.


# ==========================================
# 📄 Oorspronkelijk document: STANDARDS.md
# ==========================================


# 🛡️ Industriële Standaarden & Compliance (MES)

Dit project is ontwikkeld als Manufacturing Execution System (MES) voor de "Future Factory", met strikte inachtneming van internationale normen om kwaliteit, veiligheid en data-integriteit te waarborgen.

## 1. ISA-95 (Enterprise-Control System Integration)
**De "MES-norm" voor integratie van kantoor- en productieautomatisering.**
*   **Relevantie:** Scheidt business logica (orders, planning) van fysieke uitvoering (vloer).
*   **Implementatie:** De Firestore datastructuur (`dbPaths.js`) volgt de ISA-95 hiërarchie (Enterprise > Site > Area > Cell).

## 2. ISO/IEC 27001 (Informatiebeveiliging)
**Standaard voor het beveiligen van gevoelige bedrijfsdata.**
*   **Relevantie:** Beveiliging van cloud-data en gebruikersbeheer.
*   **Implementatie:**
    *   Authenticatie via Firebase Auth.
    *   Rol-gebaseerde toegang (RBAC) via `useAdminAuth.js`.
    *   Strikte Security Rules (`firestore.rules`, `storage.rules`) voor database en opslag (Least Privilege).

## 3. ISO 9001 (Kwaliteitsmanagement)
**Aantonen dat het productieproces beheerst verloopt.**
*   **Relevantie:** Traceerbaarheid van elke processtap en wijziging.
*   **Implementatie:**
    *   **Audit Trail:** Elke actie wordt gelogd met tijdstip en gebruiker (`logActivity`).
    *   **Productdossier:** Digitaal dossier per lotnummer met volledige historie.
    *   **Versiebeheer:** Wijzigingen in orders zijn traceerbaar.
    *   **Order Integriteit:** Orders worden nooit fysiek verwijderd. Een 'geannuleerde' status met een verplichte reden en timestamp wordt gebruikt om de volledige levenscyclus van een order traceerbaar te houden, zelfs als deze niet wordt geproduceerd.

## 4. ISO 22400 (Key Performance Indicators)
**Standaard voor productie KPI's (zoals OEE).**
*   **Relevantie:** Betrouwbare en internationaal vergelijkbare cijfers.
*   **Implementatie:**
    *   `EfficiencyDashboard.jsx` berekent metrics volgens ISO-formules.
    *   Uniforme definities voor beschikbaarheid, prestatie en kwaliteit.

## 5. IEC 62443 (Cybersecurity voor IACS)
**Beveiliging van industriële automatiserings- en controlesystemen.**
*   **Relevantie:** Bescherming van terminals en scanners op de werkvloer.
*   **Implementatie:**
    *   HTTPS encryptie.
    *   Veilige API-sleutels (`.env`).

## 6. Audit Logging & Traceability (ISO 9001/27001)
**Vereiste:** Een onveranderlijk logboek van kritieke acties voor reconstructie en bewijsvoering.

### ISO 9001 (Kwaliteit)
*   **Productie Wijzigingen:** Aanpassingen aan recepturen, toleranties of productspecificaties (`PRODUCT_UPDATE`, `MATRIX_UPDATE`).
*   **Kwaliteitscontrole:** Inspectieresultaten en vrijgifte (`INSPECTION_COMPLETE`, `ORDER_RELEASE`).
*   **Afwijkingen:** Registratie van non-conformities.

### ISO 27001 (Beveiliging)
*   **Toegangsbeheer:** Succesvolle en mislukte inlogpogingen (`LOGIN`, `LOGIN_FAILED`).
*   **Rechtenbeheer:** Wijzigingen in gebruikersrollen of permissies (`USER_ROLE_CHANGE`).
*   **Configuratie:** Aanpassingen aan systeeminstellingen (`SETTINGS_UPDATE`).

# ==========================================
# 📄 Oorspronkelijk document: PUSH_TO_PILOT_REPO.md
# ==========================================


# 🚀 Push Code naar Future-Factory-Pilot-Ready

## ⚠️ Permission Issue in Codespace

De GitHub token in deze codespace heeft geen write permissions voor de nieuwe repository.

## ✅ Oplossing: Lokaal Pushen

### Optie 1: Op je Lokale Machine

```bash
# Clone de huidige repository (als je die nog niet hebt)
git clone https://github.com/richardvh18-dotcom/FPIFF-30-1.git
cd FPIFF-30-1

# Schakel naar de pilot branch
git checkout FpiFF-Pilot-Ready

# Voeg de nieuwe remote toe
git remote add pilot-ready https://github.com/richardvh18-dotcom/Future-Factory-Pilot-Ready.git

# Push naar de nieuwe repository
git push pilot-ready FpiFF-Pilot-Ready:main

# Verifieer
git remote -v
```

### Optie 2: Via GitHub Web UI

1. Ga naar: https://github.com/richardvh18-dotcom/FPIFF-30-1
2. Klik op de **"Code"** tab
3. Wissel naar branch **"FpiFF-Pilot-Ready"** (dropdown linksboven)
4. Klik op **"•••"** (3 dots) → **"Download ZIP"**
5. Pak de ZIP uit
6. In de Future-Factory-Pilot-Ready repository:
   - Klik **"uploading an existing file"** link
   - Sleep alle bestanden erin
   - Commit message: `Initial pilot-ready code`
   - Commit

### Optie 3: GitHub Import

1. Ga naar je nieuwe repository: https://github.com/richardvh18-dotcom/Future-Factory-Pilot-Ready
2. Klik op **"Import code"** (als de repo leeg is)
3. Old repository URL: `https://github.com/richardvh18-dotcom/FPIFF-30-1`
4. Selecteer branch: `FpiFF-Pilot-Ready`
5. Klik **"Begin import"**

### Optie 4: Personal Access Token

Als je op een andere machine met Git werkt:

1. Ga naar: https://github.com/settings/tokens
2. Klik **"Generate new token (classic)"**
3. Geef permissions: `repo` (alle repo permissions)
4. Genereer en kopieer de token
5. Gebruik in plaats van password bij git push

```bash
Username: richardvh18-dotcom
Password: <plak-je-token-hier>
```

---

## 📦 Wat Moet er in de Nieuwe Repository

De volgende bestanden/code uit de **FpiFF-Pilot-Ready** branch:

✅ Alle source code in `/src`
✅ `package.json` en `package-lock.json`
✅ `vite.config.ts` en andere config files
✅ `firebase.json`, `firestore.rules`, `storage.rules`
✅ `README-PILOT.md` (kan hernoemd worden naar `README.md`)
✅ `PILOT_TEST_SCENARIO.md`
✅ `.env.example`
✅ `public/` folder

❌ **NIET** meenemen:
- `node_modules/`
- `.env` (gevoelige credentials)
- `dist/` (build output)
- `.git/` folder (bij ZIP method)

---

## 🔄 Na Succesvolle Push

Verifieer dat de repository werkt:

```bash
# Clone de nieuwe repo (test)
git clone https://github.com/richardvh18-dotcom/Future-Factory-Pilot-Ready.git test-clone
cd test-clone

# Check files
ls -la

# Test dependencies install
npm install

# Should work!
```

---

## 🆘 Hulp Nodig?

Als je vastloopt, laat het me weten welke optie je probeert en welke fout je krijgt.

**Aanbevolen:** Optie 1 (lokaal pushen) is het snelst en meest betrouwbaar.
