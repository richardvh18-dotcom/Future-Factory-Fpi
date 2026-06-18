# 🎯 Handleiding: Firebase Hosting Preview Channels (Vercel-stijl)

**Datum:** 17 juni 2026

## Doel

In Firebase kun je een vergelijkbare opzet krijgen als in Vercel (met Productie- en Preview-URL's) voor je frontend. Hiervoor gebruik je **Firebase Hosting Preview Channels**. 
Net als in Vercel kan Firebase voor elke feature, branch of pull request een unieke, tijdelijke URL genereren. Dit heet een Preview Channel.

> ⚠️ **Let op de database:** Een Preview Channel maakt een aparte URL aan voor je *frontend*. Deze preview-versie kijkt standaard echter nog steeds naar je huidige (productie) database en Cloud Functions. Wil je de data ook 100% strikt gescheiden houden, dan vereist dit een apart Firebase staging-project.

---

## Optie A: Handmatig een preview deployen

Je kunt vanuit je terminal direct een preview aanmaken in plaats van meteen naar productie te pushen. Dit is handig voor een snelle test.

1.  Bouw eerst je applicatie:
    ```bash
    npm run build
    ```
2.  Deploy de map naar een tijdelijk Preview Channel (vervang `preview-v2` door een zelfgekozen naam):
    ```bash
    firebase hosting:channel:deploy preview-v2
    ```
3.  Firebase genereert een URL in deze stijl: `https://future-factory-377ef--preview-v2-12345.web.app`
    *(Deze verloopt standaard na 7 dagen).*

---

## Optie B: Automatisch via GitHub Actions (Aanbevolen)

In je project is dit al deels voorbereid via `.github/workflows/firebase-hosting-preview.yml`. De standaard en meest betrouwbare manier om een Vercel-achtige workflow op te zetten, is door Firebase dit automatisch te laten inrichten voor GitHub.

1.  Run het volgende commando in je terminal:
```bash
firebase init hosting:github
```

**Deployen naar Productie:**
```bash
# 1. Activeer de productie omgeving
firebase use default

# 2. Bouw de app voor productie
npm run build:prod

# 3. Deploy naar de actieve (productie) omgeving
firebase deploy --only hosting
```

---

## Stap 7: GitHub Actions (CI/CD)

Dezelfde logica moet worden doorgevoerd in je GitHub Actions. Je `firebase-hosting-preview.yml` workflow moet worden aangepast om naar het `staging` project te deployen.

Dit doe je door de `projectId` en de `firebaseServiceAccount` in dat workflow-bestand aan te passen naar de waarden van je staging-project. Je kunt hiervoor het beste aparte secrets aanmaken in GitHub (bijv. `FIREBASE_SERVICE_ACCOUNT_STAGING`).

```yaml
# .github/workflows/firebase-hosting-preview.yml

# ...
      - name: Build app
        run: npm run build:staging # Gebruik de staging build
        env:
          # Gebruik staging secrets
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID_STAGING }}
          # ...

      - name: Deploy to Firebase Hosting Preview
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          # Gebruik de service account en project ID van je staging project
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_STAGING }}
          projectId: future-factory-staging # Staging Project ID
          # ...
```