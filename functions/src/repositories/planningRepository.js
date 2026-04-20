const { db } = require('../config/firebase');
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
  };
};

const getPlanningOrderDocByOrderId = async (orderId) => {
  const normalizedOrderId = clean(orderId);
  if (!normalizedOrderId) return null;

  const { planningCollection, planningLegacyCollection } = resolveRuntimeDataPaths();

  const primarySnap = await db
    .collection(planningCollection)
    .where('orderId', '==', normalizedOrderId)
    .limit(1)
    .get();

  if (!primarySnap.empty) return primarySnap.docs[0];

  const scopedSnap = await db
    .collectionGroup('orders')
    .where('orderId', '==', normalizedOrderId)
    .limit(1)
    .get();

  const scopedDoc = scopedSnap.docs.find((doc) => isUnderPath(doc.ref, planningCollection));
  if (scopedDoc) return scopedDoc;

  if (!planningLegacyCollection) return null;

  const legacySnap = await db
    .collection(planningLegacyCollection)
    .where('orderId', '==', normalizedOrderId)
    .limit(1)
    .get();

  if (!legacySnap.empty) return legacySnap.docs[0];
  return null;
};

const getTrackedProductDocByIdOrLot = async (productOrLotId, runtimeDataSource = null) => {
  const cleanId = clean(productOrLotId);
  const safePathInput = normalizeDocPathInput(cleanId);
  const lookupId = extractDocId(cleanId);
  if (!cleanId) return null;

  const { trackingCollection } = resolveRuntimeDataPaths();

  // Ondersteun volledige documentpaden als input (bijv. future-factory/.../items/<id>).
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
  const scopedByIdFieldSnap = await db
    .collectionGroup('items')
    .where('id', '==', lookupId)
    .limit(5)
    .get();
  const scopedByIdFieldDoc = scopedByIdFieldSnap.docs.find((doc) => isUnderPath(doc.ref, trackingCollection));
  if (scopedByIdFieldDoc) return scopedByIdFieldDoc;

  // Zoek op lotNumber (aanwezig bij alle items; docId === lotNumber bij startWorkstationProductionRun).
  const lotSnap = await db
    .collection(trackingCollection)
    .where('lotNumber', '==', lookupId)
    .limit(1)
    .get();

  if (!lotSnap.empty) return lotSnap.docs[0];

  const scopedLotSnap = await db
    .collectionGroup('items')
    .where('lotNumber', '==', lookupId)
    .limit(5)
    .get();

  const scopedLotDoc = scopedLotSnap.docs.find((doc) => isUnderPath(doc.ref, trackingCollection));
  if (scopedLotDoc) return scopedLotDoc;

  return null;
};

const getPlanningOrderDocById = async (orderDocId) => {
  const cleanId = clean(orderDocId);
  const safePathInput = normalizeDocPathInput(cleanId);
  const lookupId = extractDocId(cleanId);
  if (!cleanId) return null;

  const { planningCollection, planningLegacyCollection } = resolveRuntimeDataPaths();

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

  // collectionGroup documentId() vereist volledig pad bij collection group queries;
  // gebruik orderId-veld lookup als fallback voor scoped planning-orders.
  const scopedByOrderIdSnap = await db
    .collectionGroup('orders')
    .where('orderId', '==', lookupId)
    .limit(5)
    .get();
  const scopedByOrderIdDoc = scopedByOrderIdSnap.docs.find((doc) => isUnderPath(doc.ref, planningCollection));
  if (scopedByOrderIdDoc) return scopedByOrderIdDoc;

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
const resolveDbContext = () => {
  const prodBase = `${BASE}/production`;
  return {
    trackingPath: TRACKING_COLLECTION,
    planningPath: PLANNING_COLLECTION,
    planningLegacyPath: PLANNING_COLLECTION_LEGACY,
    efficiencyPath: `${prodBase}/efficiency_hours`,
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
