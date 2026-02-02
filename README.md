# FPI-GRE-Database
Created with CodeSandbox

## 🚀 Deployment Strategy

Dit project gebruikt een twee-branch deployment strategie met Vercel:

### Branches

- **`main`** - Production deployment (stabiele productie omgeving)
- **`preview`** - Review deployment (test/preview omgeving)

### Automatische Workflow

Alle commits naar `main` worden **automatisch** ook naar `preview` gepusht:

#### Optie 1: Quick Deploy Script
```bash
./deploy.sh
```
Dit script:
- Commit je wijzigingen (als er uncommitted changes zijn)
- Pusht naar `main` (production)
- Synct automatisch naar `preview`

#### Optie 2: GitHub Actions (Automatisch)
Bij elke push naar `main` triggert een GitHub Action die automatisch `preview` update.
Geen handmatige actie nodig! 🎉

#### Optie 3: Handmatig
```bash
# Commit je wijzigingen
git add -A
git commit -m "Jouw wijzigingen"

# Push naar main
git push origin main

# Preview wordt automatisch gesynchroniseerd via GitHub Actions
```

### Vercel Configuratie

De `vercel.json` is geconfigureerd om alleen `main` en `preview` branches te deployen. Alle andere branches worden genegeerd om onnodige deployments te voorkomen.
