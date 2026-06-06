// @ts-nocheck

const { db, admin } = require('../config/firebase');
const auditService = require('./auditService');
const { DB_PATHS } = require('../config/dbPaths');

const PRODUCTS_COLLECTION = db.collection(DB_PATHS.PRODUCTION_PRODUCTS);

const cleanText = (value) => String(value || '').trim();

function sanitizeProductData(input = {}) {
  const data = { ...input };
  delete data.id;
  delete data.createdAt;
  delete data.lastUpdated;
  return data;
}

async function saveProductRecordService({ productId = '', productData = {}, actorUid = '', clearVerification = false }) {
  const normalizedId = cleanText(productId);
  const cleanData = sanitizeProductData(productData);
  const FieldValue = admin.firestore.FieldValue;

  if (!cleanData.name && !normalizedId) {
    throw new Error('Productnaam is verplicht voor nieuwe records.');
  }

  const now = FieldValue.serverTimestamp();

  if (!normalizedId) {
    // Nieuw product: spec-velden worden nooit opgeslagen
    const payload = {
      ...cleanData,
      createdAt: now,
      lastUpdated: now,
      lastModifiedBy: actorUid || 'system',
    };
    delete payload.specs;
    delete payload.bellSpecs;
    delete payload.fittingSpecs;
    delete payload.socketSpecs;
    const docRef = await PRODUCTS_COLLECTION.add(payload);

    auditService.logSystem('PRODUCT_CREATED', {
      productId: docRef.id,
      actorUid: actorUid || 'system',
      after: { ...payload },
    }, { category: 'ADMIN', severity: 'INFO', userId: actorUid || 'system' });

    return { ok: true, productId: docRef.id, operation: 'create' };
  }

  // Bestaand product: leg before-snapshot vast voor audit trail
  const before = await auditService.captureSnapshot(PRODUCTS_COLLECTION.doc(normalizedId));

  // Expliciete verwijdering van spec-velden
  const updatePayload = {
    ...cleanData,
    specs: FieldValue.delete(),
    bellSpecs: FieldValue.delete(),
    fittingSpecs: FieldValue.delete(),
    socketSpecs: FieldValue.delete(),
    lastUpdated: now,
    lastModifiedBy: actorUid || 'system',
  };

  if (clearVerification) {
    updatePayload.verifiedBy = FieldValue.delete();
    updatePayload.fourEyesOverrideBy = FieldValue.delete();
  }

  await PRODUCTS_COLLECTION.doc(normalizedId).set(updatePayload, { merge: true });

  auditService.logSystem('PRODUCT_UPDATED', {
    productId: normalizedId,
    actorUid: actorUid || 'system',
    clearVerification,
    before,
    after: cleanData,
  }, { category: 'ADMIN', severity: 'INFO', userId: actorUid || 'system' });

  return { ok: true, productId: normalizedId, operation: 'update' };
}

async function deleteProductRecordService({ productId = '' }) {
  const normalizedId = cleanText(productId);
  if (!normalizedId) {
    throw new Error('productId is verplicht.');
  }

  const before = await auditService.captureSnapshot(PRODUCTS_COLLECTION.doc(normalizedId));
  await PRODUCTS_COLLECTION.doc(normalizedId).delete();

  auditService.logSystem('PRODUCT_DELETED', {
    productId: normalizedId,
    before,
  }, { category: 'ADMIN', severity: 'WARNING' });

  return { ok: true, productId: normalizedId };
}

async function verifyProductRecordService({ productId = '', actor = {}, isAdmin = false }) {
  const normalizedId = cleanText(productId);
  if (!normalizedId) {
    throw new Error('productId is verplicht.');
  }

  const productRef = PRODUCTS_COLLECTION.doc(normalizedId);
  const snap = await productRef.get();
  if (!snap.exists) {
    throw new Error('Product niet gevonden.');
  }

  const current = snap.data() || {};
  if (current.lastModifiedBy && current.lastModifiedBy === actor.uid && !isAdmin) {
    return {
      ok: false,
      code: 'self-verify-blocked',
      message: 'Vier-ogen principe: Je mag je eigen wijzigingen niet verifiëren.',
    };
  }

  await productRef.set(
    {
      verificationStatus: 'verified',
      verifiedBy: {
        uid: actor.uid || 'system',
        name: actor.name || actor.email || 'Unknown',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      },
      selfVerifiedByAdmin: current.lastModifiedBy === actor.uid && Boolean(isAdmin),
      active: true,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  auditService.logSystem('PRODUCT_VERIFIED', {
    productId: normalizedId,
    actorUid: actor.uid || 'system',
    isAdmin,
    selfVerifiedByAdmin: current.lastModifiedBy === actor.uid && Boolean(isAdmin),
    before: { verificationStatus: current.verificationStatus, lastModifiedBy: current.lastModifiedBy },
  }, { category: 'QUALITY', severity: 'INFO', userId: actor.uid || 'system' });

  return { ok: true, productId: normalizedId };
}

module.exports = {
  saveProductRecordService,
  deleteProductRecordService,
  verifyProductRecordService,
};
