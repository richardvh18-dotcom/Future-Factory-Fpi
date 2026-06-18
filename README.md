# FPI Future Factory

## Deployment (actuele situatie)

Deze repository deployt via Firebase voor zowel frontend als backend.

### Frontend (Firebase Hosting)

- Live deploy via GitHub Actions op pushes naar `main`.
- Preview deploy via GitHub Actions op pull requests.

### Backend (Firebase Functions)

- Live deploy van Cloud Functions via dezelfde Firebase live workflow op `main`.
- Functions build draait automatisch via `functions` predeploy in `firebase.json`.

### Handmatige productie deploy (optioneel)

Gebruik dit wanneer je direct een productie-release wilt doen via CLI:

```bash
npm run build
firebase deploy --only hosting,functions --project future-factory-377ef
```

### Belangrijk

- Gebruik Firebase secrets en projectconfiguratie in GitHub Actions.
- Er is geen alternatief deploypad meer in deze branch buiten Firebase.

## Projectstructuur (opgeschoond)

- Documentatie: `docs/`
	- `docs/01_DEVELOPMENT_AND_OPERATIONS.md`
	- `docs/02_ARCHITECTURE_AND_FEATURES.md`
	- `docs/03_PROJECT_PLANNING.md`
	- `docs/04_OPERATIONS_NOTES_AND_TASKS.md`
	- `docs/05_ENVIRONMENTS_AND_DEPLOYMENT.md`
	- `docs/CONVERSATION_SUMMARY.md`
- Hulpscripts en operationele scripts: `scripts/`
- Analyse notebooks: `notebooks/`
