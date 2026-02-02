# FPI-GRE-Database
Created with CodeSandbox

## 🚀 Deployment Strategy

Dit project gebruikt een twee-branch deployment strategie met Vercel:

### Branches

- **`main`** - Production deployment (stabiele productie omgeving)
- **`preview`** - Review deployment (test/preview omgeving)

### Workflow

1. **Feature development**
   ```bash
   git checkout -b feature/mijn-feature
   # Maak je wijzigingen
   git commit -m "Voeg nieuwe feature toe"
   ```

2. **Deploy naar Review voor testen**
   ```bash
   git checkout preview
   git merge feature/mijn-feature  # of: git merge main
   git push
   ```
   ✅ Vercel deployt automatisch naar de preview omgeving

3. **Deploy naar Production na goedkeuring**
   ```bash
   git checkout main
   git merge preview
   git push
   ```
   ✅ Vercel deployt automatisch naar productie

### Vercel Configuratie

De `vercel.json` is geconfigureerd om alleen `main` en `preview` branches te deployen. Alle andere branches worden genegeerd om onnodige deployments te voorkomen.
