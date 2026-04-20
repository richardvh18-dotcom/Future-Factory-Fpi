// scripts/update-firestore-version.js
// Script om Firestore versie-document bij te werken na build/deploy
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const version = process.env.VITE_APP_VERSION || new Date().toISOString();

// Firebase Admin initialisatie (service account vereist)
initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function updateVersion() {
  await db.doc('app/version').set({ version }, { merge: true });
  console.log('Firestore versie geüpdatet naar:', version);
}

updateVersion().catch((err) => {
  console.error('Fout bij updaten Firestore versie:', err);
  process.exit(1);
});
