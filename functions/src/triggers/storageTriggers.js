const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const db = admin.firestore();
const auditService = require('../services/auditService');
const { IMPORT_RUNS_COLLECTION, STORAGE_IMPORT_FOLDER } = require('../config/constants');
const { isSupportedImportFileName, toSafeDocId } = require('../utils/helpers');

/**
 * Firebase Storage trigger import (geen Power Automate nodig).
 * Upload een LN Excel bestand naar: imports/planning/
 */
exports.importPlanningFromStorage = functions.region('europe-west1').storage.object().onFinalize(async (object) => {
  const objectName = String(object?.name || '');
  const bucketName = String(object?.bucket || '');

  if (!objectName || !bucketName) return null;
  if (!objectName.toLowerCase().startsWith(STORAGE_IMPORT_FOLDER)) return null;
  if (!isSupportedImportFileName(objectName)) return null;

  const idempotencyKey = toSafeDocId(
    `storage-${bucketName}-${objectName}-${object.generation || object.updated || ''}`
  );
  const runRef = db.collection(IMPORT_RUNS_COLLECTION).doc(idempotencyKey);
  const existingRun = await runRef.get();
  if (existingRun.exists) {
    return null;
  }

  await runRef.set({
    status: 'started',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    provider: 'firebase_storage',
    trigger: 'storage_finalize',
    fileName: objectName,
    fileModifiedAt: object.updated || null,
    bucket: bucketName,
    generation: object.generation || null,
  });

  try {
    const allowedMachines = getConfiguredAllowedMachines();
    const fileRef = admin.storage().bucket(bucketName).file(objectName);
    const [fileBuffer] = await fileRef.download();
    const orders = parseOrdersFromBuffer(fileBuffer);

    const sourceMeta = {
      source: 'storage_trigger',
      provider: 'firebase_storage',
      fileName: objectName,
      fileModifiedAt: object.updated || '',
      idempotencyKey,
      bucket: bucketName,
      generation: object.generation || '',
      allowedMachines: Array.from(allowedMachines),
    };

    const result = await importOrdersToFirestore(orders, sourceMeta, {
      overwrite: false,
      updateExisting: true,
      allowedMachines,
    });

    await runRef.set(
      {
        status: 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        ordersFound: orders.length,
        imported: result.imported,
        skipped: result.skipped,
        skippedByMachine: result.skippedByMachine,
      },
      { merge: true }
    );

    auditService.logSystem('IMPORT_PLANNING_STORAGE', {
      fileName: objectName,
      bucket: bucketName,
      idempotencyKey,
      ordersFound: orders.length,
      imported: result.imported,
      skipped: result.skipped,
      skippedByMachine: result.skippedByMachine,
      allowedMachines: Array.from(allowedMachines),
    }, { category: 'PLANNING', severity: 'INFO' });

    return null;
  } catch (error) {
    console.error('importPlanningFromStorage error:', error);
    await runRef.set(
      {
        status: 'failed',
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: error?.message || 'Unknown error',
      },
      { merge: true }
    );
    return null;
  }
});

