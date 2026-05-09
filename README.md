# FPI Future Factory

## Deployment (actuele situatie)

Deze repository gebruikt op dit moment een pilot-gerichte Vercel setup.

### Productiebranch

- Productiebranch in Vercel: pilot-dev
- Deploy from Git staat aan voor pilot-dev
- main staat momenteel niet als productiebranch ingesteld

### Huidige werkwijze

1. Werk op een feature branch.
2. Merge of push naar pilot-dev wanneer de wijziging productie-klaar is.
3. Vercel publiceert productie vanaf pilot-dev.

### Handmatige productie deploy (optioneel)

Gebruik dit wanneer je direct een productie-release wilt doen via CLI:

```bash
npm run build
npx vercel --prod --yes
```

### Belangrijk

- Het script scripts/deploy.sh is gebaseerd op de oudere main/preview flow.
- Gebruik voor de actuele setup vooral pilot-dev + Vercel CLI waar nodig.

## Projectstructuur (opgeschoond)

- Documentatie: `docs/`
	- `docs/01_DEVELOPMENT_AND_OPERATIONS.md`
	- `docs/02_ARCHITECTURE_AND_FEATURES.md`
	- `docs/03_PROJECT_PLANNING.md`
	- `docs/04_OPERATIONS_NOTES_AND_TASKS.md`
	- `docs/CONVERSATION_SUMMARY.md`
- Hulpscripts en operationele scripts: `scripts/`
- Analyse notebooks: `notebooks/`
