// Script: setUserRole.js
// Gebruik: node setUserRole.js <uid> <role>

const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const [,, uid, role] = process.argv;

if (!uid || !role) {
  console.error("Gebruik: node setUserRole.js <uid> <role>");
  process.exit(1);
}

admin.auth().setCustomUserClaims(uid, { role })
  .then(() => {
    console.log(`Rol '${role}' toegekend aan gebruiker ${uid}`);
    process.exit(0);
  })
  .catch(error => {
    console.error("Fout bij instellen rol:", error);
    process.exit(1);
  });
