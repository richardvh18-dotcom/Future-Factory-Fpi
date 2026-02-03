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
