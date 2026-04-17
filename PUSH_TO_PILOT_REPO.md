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
