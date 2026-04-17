#!/usr/bin/env node

/**
 * Migratie: legacy inventory -> scoped inventory map
 *
 * Van:
 *   /future-factory/production/inventory/{docId}
 * Naar:
 *   /future-factory/production/inventory/{departmentId}/machines/{machineId}/items/{docId}
 *
 * Gebruik:
 *   node scripts/migrate-inventory-to-scoped.cjs --dry-run
 *   node scripts/migrate-inventory-to-scoped.cjs
 *   node scripts/migrate-inventory-to-scoped.cjs --delete-legacy
 */

const admin = require("firebase-admin");

const BASE = "future-factory";
const LEGACY_PATH = `${BASE}/production/inventory`;
const DEFAULT_DEPARTMENT = "Fittings";
const DEFAULT_MACHINE = "UNASSIGNED";

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const dryRun = hasFlag("--dry-run") || !hasFlag("--apply");
const deleteLegacy = hasFlag("--delete-legacy");

const toSegment = (value, fallback) => {
  const normalized = String(value || "")
    .trim()
    .replace(/[/.#?$\[\]]/g, "_")
    .replace(/\s+/g, "_");
  return normalized || fallback;
};

const detectMachineFromText = (value = "") => {
  const upper = String(value || "").toUpperCase();
  const machineMatch = upper.match(/(?:40)?(?:BH|BM|BA)\d{2}/);
  if (machineMatch) return machineMatch[0].replace(/^40/, "");
  if (upper.includes("LOSSEN")) return "LOSSEN";
  if (upper.includes("NABEWERK")) return "NABEWERKING";
  if (upper.includes("BM01")) return "BM01";
  return "";
};

const resolveScope = (id, data = {}) => {
  const departmentId = toSegment(
    data.departmentId || data.department || data.afdeling,
    DEFAULT_DEPARTMENT
  );

  const machineId = toSegment(
    data.machineId ||
      data.machine ||
      data.stationId ||
      detectMachineFromText(data.location) ||
      detectMachineFromText(id),
    DEFAULT_MACHINE
  );

  return { departmentId, machineId };
};

const getScopedPath = (departmentId, machineId, docId) =>
  `${LEGACY_PATH}/${departmentId}/machines/${machineId}/items/${docId}`;

const run = async () => {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId:
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCLOUD_PROJECT ||
        "future-factory-377ef",
    });
  }

  const db = admin.firestore();
  const snap = await db.collection(LEGACY_PATH).get();

  if (snap.empty) {
    console.log("Geen inventory documenten gevonden in legacy pad.");
    return;
  }

  console.log(`Gevonden legacy documenten: ${snap.size}`);
  console.log(`Mode: ${dryRun ? "DRY-RUN" : "APPLY"}`);
  console.log(`Delete legacy: ${deleteLegacy ? "JA" : "NEE"}`);

  let migrated = 0;
  let skipped = 0;
  let batch = db.batch();
  let ops = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};

    // Skip nested scope containers if die ooit als docs zijn aangemaakt.
    if (String(data._scopeType || "") === "inventory_scope_container") {
      skipped += 1;
      continue;
    }

    const { departmentId, machineId } = resolveScope(docSnap.id, data);
    const targetPath = getScopedPath(departmentId, machineId, docSnap.id);

    if (dryRun) {
      console.log(`[DRY] ${docSnap.ref.path} -> ${targetPath}`);
      migrated += 1;
      continue;
    }

    const targetRef = db.doc(targetPath);
    batch.set(
      targetRef,
      {
        ...data,
        id: docSnap.id,
        departmentId,
        machineId,
        _scopeType: "inventory",
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    ops += 1;

    if (deleteLegacy) {
      batch.delete(docSnap.ref);
      ops += 1;
    }

    if (ops >= 380) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }

    migrated += 1;
  }

  if (!dryRun && ops > 0) {
    await batch.commit();
  }

  console.log(`Klaar. Gemigreerd: ${migrated}, overgeslagen: ${skipped}`);
};

run().catch((err) => {
  console.error("Migratie mislukt:", err?.message || err);
  process.exit(1);
});
