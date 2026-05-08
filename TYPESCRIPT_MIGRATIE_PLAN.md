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
