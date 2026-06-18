// scripts/update-firestore-version.js
// Schrijft de build-versie naar Firestore zodat alle browsers automatisch herladen.
// Pad = future-factory/settings/general_configs/main (zelfde als PATHS.GENERAL_SETTINGS).
//
// Vereiste omgevingsvariabele in CI:
//   FIREBASE_SERVICE_ACCOUNT_JSON  →  inhoud van het Firebase service account JSON-bestand.
//
const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const version = process.env.VITE_APP_VERSION || new Date().toISOString();

// Gebruik service account JSON uit env (CI), of applicationDefault (lokaal / CI).
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (serviceAccountJson) {
  initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
} else {
  initializeApp({ credential: applicationDefault() });
}

const db = getFirestore();

// Zelfde pad als PATHS.GENERAL_SETTINGS in src/config/dbPaths.jsx:
// ["future-factory", "settings", "general_configs", "main"]
const VERSION_DOC = 'future-factory/settings/general_configs/main';

async function updateVersion() {
  await db.doc(VERSION_DOC).set({ version }, { merge: true });
  console.log(`✅ Firestore versie bijgewerkt: ${version}`);
}

updateVersion().catch((err) => {
  console.error('❌ Fout bij updaten Firestore versie:', err);
  process.exit(1);
});
