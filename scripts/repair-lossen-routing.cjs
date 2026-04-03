#!/usr/bin/env node

/**
 * Eenmalige repair script voor foutieve BH18 -> Lossen routering.
 *
 * Gebruik:
 * 1) Dry-run (standaard): node scripts/repair-lossen-routing.cjs
 * 2) Toepassen:            node scripts/repair-lossen-routing.cjs --apply
 *
 * Vereist:
 * - GOOGLE_APPLICATION_CREDENTIALS voor firebase-admin (applicationDefault)
 */

const admin = require("firebase-admin");

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  "future-factory-377ef";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
}

const db = admin.firestore();
const APPLY = process.argv.includes("--apply");

const TRACKING_COLLECTION = "future-factory/production/tracked_products";

const normalizeMachine = (value) => String(value || "").trim().replace(/\s+/g, "").toUpperCase();

const getLossenRoute = (itemText) => {
  const text = String(itemText || "").toUpperCase();
  const isTB = text.includes("TB");
  const isCB = text.includes("CB");
  const isELB = text.includes("ELB");
  const isAB = /\bAB\b/.test(text) || text.includes("ABAB");
  const isSB = /\bSB\b/.test(text);
  const isElbow = isELB || isCB;

  if (isElbow && (isAB || isSB)) return "STATION";

  const numberMatches = Array.from(text.matchAll(/\d{2,4}/g)).map((m) => Number(m[0]));
  const candidates = numberMatches.filter((n) => Number.isFinite(n) && n >= 25 && n <= 2000);
  const diameter = candidates.length > 0 ? candidates[0] : 0;

  if (isTB && diameter >= 300) return "STATION";
  if ((isCB || isELB) && diameter >= 350) return "STATION";

  return "TAB";
};

const isLossenLike = (value) => normalizeMachine(value).includes("LOSSEN");

(async () => {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`Collectie: ${TRACKING_COLLECTION}`);

  // Beperk scan tot BH18-origin records.
  const snap = await db
    .collection(TRACKING_COLLECTION)
    .where("machine", "in", ["BH18", "18"])
    .get();

  let scanned = 0;
  let candidates = 0;
  let fixed = 0;
  const batch = db.batch();

  for (const doc of snap.docs) {
    scanned += 1;
    const data = doc.data() || {};

    const machine = normalizeMachine(data.machine);
    const origin = normalizeMachine(data.originMachine || data.machine || "BH18");
    const currentStation = normalizeMachine(data.currentStation);
    const currentStep = normalizeMachine(data.currentStep);
    const status = normalizeMachine(data.status);

    if (!(machine === "BH18" || machine === "18" || origin === "BH18" || origin === "18")) continue;
    if (!isLossenLike(currentStation) && !isLossenLike(currentStep) && !isLossenLike(status)) continue;

    const route = getLossenRoute(`${data.item || ""} ${data.description || ""} ${data.itemCode || ""}`);

    // Alleen herstellen als item lokaal hoort (TAB), maar foutief als centrale Lossen staat.
    if (route !== "TAB") continue;
    if (currentStation !== "LOSSEN") continue;

    candidates += 1;

    const targetStation = origin === "18" ? "BH18" : (origin || "BH18");
    const updatePayload = {
      currentStation: targetStation,
      currentStep: "Wacht op Lossen",
      status: "Wacht op Lossen",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      history: admin.firestore.FieldValue.arrayUnion({
        action: "Repair Routering",
        details: "Auto-fix: BH18 lokaal Lossen hersteld (TAB-route)",
        station: targetStation,
        user: "system-repair-script",
        timestamp: new Date().toISOString(),
      }),
    };

    console.log(`- Candidate ${doc.id} | item=${data.item || "-"} | lot=${data.lotNumber || "-"} | station LOSSEN -> ${targetStation}`);

    if (APPLY) {
      batch.update(doc.ref, updatePayload);
      fixed += 1;
    }
  }

  if (APPLY && fixed > 0) {
    await batch.commit();
  }

  console.log("--- Samenvatting ---");
  console.log(`Gescannd: ${scanned}`);
  console.log(`Kandidaten: ${candidates}`);
  console.log(`Aangepast: ${fixed}`);
  console.log(APPLY ? "Klaar: wijzigingen doorgevoerd." : "Klaar: dry-run, geen writes gedaan.");
})().catch((err) => {
  if (String(err && err.message || "").includes("Cannot find module 'firebase-admin'")) {
    console.error("firebase-admin ontbreekt. Installeer met: npm install firebase-admin --save-dev");
    process.exit(1);
  }

  if (String(err && err.message || "").includes("Unable to detect a Project Id")) {
    console.error("Project/auth niet ingesteld voor firebase-admin.");
    console.error("Zet eerst Application Default Credentials en project:");
    console.error("1) gcloud auth application-default login");
    console.error("2) export GOOGLE_CLOUD_PROJECT=future-factory-377ef");
    console.error("Daarna opnieuw: node scripts/repair-lossen-routing.cjs --apply");
    process.exit(1);
  }

  console.error("Fout in repair script:", err);
  process.exit(1);
});
