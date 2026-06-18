// @ts-nocheck

const { db, admin } = require('../config/firebase');
const { DB_PATHS } = require('../config/dbPaths');

const MAX_BATCH_ITEMS = 5000;
const BATCH_SIZE = 400;

const conversionsCollection = () =>
  db.collection(DB_PATHS.CONVERSIONS_RECORDS);

const cleanText = (value) => String(value || '').trim();

const normalizeRecordId = (value) => cleanText(value).toUpperCase();

const sanitizeRecord = (record = {}) => {
  const data = { ...record };
  delete data.id;
  delete data.createdAt;
  delete data.lastUpdated;
  delete data.updatedBy;

  const manufacturedId = normalizeRecordId(data.manufacturedId || data['Old Item Code'] || data['Item Code']);
  if (!manufacturedId) {
    return null;
  }

  data.manufacturedId = manufacturedId;
  if (data.targetProductId !== undefined) {
    data.targetProductId = cleanText(data.targetProductId).toUpperCase();
  }

  Object.keys(data).forEach((key) => {
    if (data[key] === undefined) delete data[key];
  });

  return data;
};

async function upsertConversionRecordService({ recordId = '', recordData = {}, actorLabel = '' }) {
  const id = normalizeRecordId(recordId || recordData.manufacturedId);
  if (!id) {
    throw new Error('manufacturedId is verplicht.');
  }

  const sanitized = sanitizeRecord({ ...recordData, manufacturedId: id });
  if (!sanitized) {
    throw new Error('Ongeldige conversie data.');
  }

  await conversionsCollection().doc(id).set(
    {
      ...sanitized,
      manufacturedId: id,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: cleanText(actorLabel) || 'system',
    },
    { merge: true }
  );

  return { ok: true, recordId: id };
}

async function deleteConversionRecordService({ recordId = '' }) {
  const id = normalizeRecordId(recordId);
  if (!id) {
    throw new Error('recordId is verplicht.');
  }

  await conversionsCollection().doc(id).delete();
  return { ok: true, recordId: id };
}

async function deleteAllConversionRecordsService() {
  const snap = await conversionsCollection().get();
  if (snap.empty) {
    return { ok: true, deleted: 0 };
  }

  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = snap.docs.slice(i, i + BATCH_SIZE);
    chunk.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    deleted += chunk.length;
  }

  return { ok: true, deleted };
}

async function upsertConversionBatchService({ items = [], mode = 'merge', actorLabel = '' }) {
  const normalizedMode = cleanText(mode).toLowerCase() || 'merge';
  const safeItems = Array.isArray(items) ? items.slice(0, MAX_BATCH_ITEMS) : [];

  if (!safeItems.length) {
    throw new Error('items is verplicht en mag niet leeg zijn.');
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < safeItems.length; i += BATCH_SIZE) {
    const chunk = safeItems.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const rawItem of chunk) {
      const sanitized = sanitizeRecord(rawItem);
      if (!sanitized) {
        skipped += 1;
        continue;
      }

      const id = sanitized.manufacturedId;
      const docRef = conversionsCollection().doc(id);

      if (normalizedMode === 'new_only') {
        const existsSnap = await docRef.get();
        if (existsSnap.exists) {
          skipped += 1;
          continue;
        }
        added += 1;
      } else {
        const existsSnap = await docRef.get();
        if (existsSnap.exists) {
          updated += 1;
        } else {
          added += 1;
        }
      }

      batch.set(
        docRef,
        {
          ...sanitized,
          manufacturedId: id,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: cleanText(actorLabel) || 'import',
        },
        { merge: true }
      );
    }

    await batch.commit();
  }

  return {
    ok: true,
    total: safeItems.length,
    added,
    updated,
    skipped,
    mode: normalizedMode,
  };
}

module.exports = {
  upsertConversionRecordService,
  deleteConversionRecordService,
  deleteAllConversionRecordsService,
  upsertConversionBatchService,
};
