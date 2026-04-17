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
