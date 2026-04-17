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
