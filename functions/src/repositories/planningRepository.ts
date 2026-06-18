// @ts-nocheck

const { db } = require('../config/firebase');
const admin = require('firebase-admin');
const {
  BASE,
  TRACKING_COLLECTION,
  PLANNING_COLLECTION,
  PLANNING_COLLECTION_LEGACY,
} = require('../config/planningConstants');
const { clean } = require('../utils/text');

const isUnderPath = (docRef, prefix) => {
  const docPath = String(docRef?.path || '');
  const safePrefix = String(prefix || '').replace(/\/+$/, '');
  return Boolean(docPath && safePrefix && docPath.startsWith(`${safePrefix}/`));
};

const parseOverridePath = (rawValue) => {
  const value = String(rawValue || '').trim();
  if (!value) return null;
  const segments = value.split('/').map((segment) => segment.trim()).filter(Boolean);
  if (!segments.length) return null;
  const root = segments[0];
  if (root !== BASE && root !== 'artifacts') return null;
  return segments.join('/');
};

const normalizeDocPathInput = (value) => String(value || '').trim().replace(/^\/+/, '');

const extractDocId = (value) => {
  const safe = normalizeDocPathInput(value);
  if (!safe) return '';
  const segments = safe.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : safe;
};

const resolveRuntimeDataPaths = () => {
  return {
    trackingCollection: TRACKING_COLLECTION,
    planningCollection: PLANNING_COLLECTION,
    planningLegacyCollection: PLANNING_COLLECTION_LEGACY,
    planningScopedRoot: `${BASE}/production/data/digital_planning/scoped`,
    planningLegacyRoot: `${BASE}/production/data/digital_planning`,
  };
};

const isPlanningOrderPath = (docRef, paths = {}) => {
  return isUnderPath(docRef, paths.planningCollection)
    || isUnderPath(docRef, paths.planningLegacyCollection)
    || isUnderPath(docRef, paths.planningScopedRoot)
    || isUnderPath(docRef, paths.planningLegacyRoot);
};

const getPlanningOrderDocByOrderId = async (orderId) => {
  const normalizedOrderId = clean(orderId);
  if (!normalizedOrderId) return null;

  const paths = resolveRuntimeDataPaths();
  const { planningCollection, planningLegacyCollection } = paths;

  const candidateOrderIds = Array.from(new Set([
    normalizedOrderId,
    normalizedOrderId.toUpperCase(),
    normalizedOrderId.toLowerCase(),
  ].filter(Boolean)));

  const candidateFields = ['orderId', 'orderNumber', 'Ordernummer'];

  for (const field of candidateFields) {
    for (const candidate of candidateOrderIds) {
      const primarySnap = await db
        .collection(planningCollection)
        .where(field, '==', candidate)
        .limit(1)
        .get();

      if (!primarySnap.empty) return primarySnap.docs[0];
    }
  }

  // Fallback: sommige datasets gebruiken ordernummer als document-id.
  const primaryDocRef = db.collection(planningCollection).doc(normalizedOrderId);
  const primaryDocSnap = await primaryDocRef.get();
  if (primaryDocSnap.exists) return primaryDocSnap;

  try {
    for (const field of candidateFields) {
      for (const candidate of candidateOrderIds) {
        const scopedSnap = await db
          .collectionGroup('orders')
          .where(field, '==', candidate)
          .limit(5)
          .get();

        const scopedDoc = scopedSnap.docs.find((doc) => isPlanningOrderPath(doc.ref, paths));
        if (scopedDoc) return scopedDoc;
      }
    }

    const scopedByDocIdSnap = await db
      .collectionGroup('orders')
      .where(admin.firestore.FieldPath.documentId(), '==', normalizedOrderId)
      .limit(5)
      .get();

    const scopedByDocId = scopedByDocIdSnap.docs.find((doc) => isPlanningOrderPath(doc.ref, paths));
    if (scopedByDocId) return scopedByDocId;
  } catch (error) {
    // Niet-fataal: root/legacy paden kunnen nog steeds een geldig document opleveren.
    console.warn('[planningRepository] scoped order lookup overgeslagen:', error?.message || String(error));
  }

  if (!planningLegacyCollection) return null;

  for (const field of candidateFields) {
    for (const candidate of candidateOrderIds) {
      const legacySnap = await db
        .collection(planningLegacyCollection)
        .where(field, '==', candidate)
        .limit(1)
        .get();

      if (!legacySnap.empty) return legacySnap.docs[0];
    }
  }

  const legacyDocRef = db.collection(planningLegacyCollection).doc(normalizedOrderId);
  const legacyDocSnap = await legacyDocRef.get();
  if (legacyDocSnap.exists) return legacyDocSnap;

  return null;
};

const getTrackedProductDocByIdOrLot = async (productOrLotId, runtimeDataSource = null) => {
  const cleanId = clean(productOrLotId);
  const safePathInput = normalizeDocPathInput(cleanId);
  const lookupId = extractDocId(cleanId);
  if (!cleanId) return null;

  const { trackingCollection } = resolveRuntimeDataPaths();

  // Ondersteun volledige documentpaden als input (bijv. DB_PATHS.TRACKED_PRODUCTS/.../items/<id>).
  if (safePathInput.includes('/')) {
    const pathRef = db.doc(safePathInput);
    const pathSnap = await pathRef.get();
    if (pathSnap.exists && isUnderPath(pathSnap.ref, trackingCollection)) {
      return pathSnap;
    }
  }

  const directRef = db.collection(trackingCollection).doc(lookupId);
  const directSnap = await directRef.get();
  if (directSnap.exists) return directSnap;

  // Zoek op 'id'-veld (aanwezig bij items aangemaakt via startProductionLots).
  try {
    const scopedByIdFieldSnap = await db
      .collectionGroup('items')
      .where('id', '==', lookupId)
      .limit(5)
      .get();
    const scopedByIdFieldDoc = scopedByIdFieldSnap.docs.find((doc) => isUnderPath(doc.ref, trackingCollection));
    if (scopedByIdFieldDoc) return scopedByIdFieldDoc;
  } catch (error) {
    console.warn('[planningRepository] scoped tracking id-lookup overgeslagen:', error?.message || String(error));
  }

  // Zoek op lotNumber (aanwezig bij alle items; docId === lotNumber bij startWorkstationProductionRun).
  const lotSnap = await db
    .collection(trackingCollection)
    .where('lotNumber', '==', lookupId)
    .limit(1)
    .get();

  if (!lotSnap.empty) return lotSnap.docs[0];

  try {
    const scopedLotSnap = await db
      .collectionGroup('items')
      .where('lotNumber', '==', lookupId)
      .limit(5)
      .get();

    const scopedLotDoc = scopedLotSnap.docs.find((doc) => isUnderPath(doc.ref, trackingCollection));
    if (scopedLotDoc) return scopedLotDoc;
  } catch (error) {
    console.warn('[planningRepository] scoped tracking lot-lookup overgeslagen:', error?.message || String(error));
  }

  return null;
};

const getPlanningOrderDocById = async (orderDocId) => {
  const cleanId = clean(orderDocId);
  const safePathInput = normalizeDocPathInput(cleanId);
  const lookupId = extractDocId(cleanId);
  if (!cleanId) return null;

  const paths = resolveRuntimeDataPaths();
  const { planningCollection, planningLegacyCollection } = paths;

  if (safePathInput.includes('/')) {
    const pathRef = db.doc(safePathInput);
    const pathSnap = await pathRef.get();
    if (pathSnap.exists && (isUnderPath(pathSnap.ref, planningCollection) || (planningLegacyCollection && isUnderPath(pathSnap.ref, planningLegacyCollection)))) {
      return pathSnap;
    }
  }

  const primaryRef = db.collection(planningCollection).doc(lookupId);
  const primarySnap = await primaryRef.get();
  if (primarySnap.exists) return primarySnap;

  // Zoek scoped planning-orders direct op document-id (laatste segment),
  // zodat orderDocId waarden zoals N200..._ITEMCODE ook resolven.
  try {
    const scopedByDocIdSnap = await db
      .collectionGroup('orders')
      .where(admin.firestore.FieldPath.documentId(), '==', lookupId)
      .limit(5)
      .get();

    const scopedByDocIdDoc = scopedByDocIdSnap.docs.find((doc) => isPlanningOrderPath(doc.ref, paths));
    if (scopedByDocIdDoc) return scopedByDocIdDoc;
  } catch (error) {
    console.warn('[planningRepository] scoped planning docId-lookup overgeslagen:', error?.message || String(error));
  }

  // collectionGroup documentId() vereist volledig pad bij collection group queries;
  // gebruik orderId-veld lookup als fallback voor scoped planning-orders.
  try {
    const scopedByOrderIdSnap = await db
      .collectionGroup('orders')
      .where('orderId', '==', lookupId)
      .limit(5)
      .get();
    const scopedByOrderIdDoc = scopedByOrderIdSnap.docs.find((doc) => isPlanningOrderPath(doc.ref, paths));
    if (scopedByOrderIdDoc) return scopedByOrderIdDoc;
  } catch (error) {
    console.warn('[planningRepository] scoped planning id-lookup overgeslagen:', error?.message || String(error));
  }

  if (!planningLegacyCollection) return null;

  const legacyRef = db.collection(planningLegacyCollection).doc(lookupId);
  const legacySnap = await legacyRef.get();
  if (legacySnap.exists) return legacySnap;

  return null;
};

/**
 * Resolves database collection paths.
 * Runtime switching is verwijderd; alle paden wijzen nu naar productie.
 */
const resolveDbContext = (runtimeDataSource = null) => {
  const prodBase = `${BASE}/production`;
  const planningPathOverride = parseOverridePath(runtimeDataSource?.planningPath);
  const planningLegacyOverride = parseOverridePath(runtimeDataSource?.planningLegacyPath);
  return {
    trackingPath: TRACKING_COLLECTION,
    planningPath: planningPathOverride || PLANNING_COLLECTION,
    eventsPath: `${prodBase}/events`,
    planningLegacyPath: planningLegacyOverride || PLANNING_COLLECTION_LEGACY,
    efficiencyPath: `${prodBase}/efficiency_hours`,
    standardsPath: `${prodBase}/time_standards`,
    archiveItemsPath: (year) => `${prodBase}/archive/${year}/items`,
    archiveRejectedPath: (year) => `${prodBase}/archive/${year}/rejected`,
    archivePlanningPath: (year) => `${prodBase}/archive/${year}/planning`,
    occupancyPath: `${BASE}/production/machine_occupancy`,
    printQueuePath: `${BASE}/production/print_queue`,
  };
};

module.exports = {
  resolveRuntimeDataPaths,
  resolveDbContext,
  getPlanningOrderDocByOrderId,
  getTrackedProductDocByIdOrLot,
  getPlanningOrderDocById,
};
