const { db } = require('../config/firebase');
const {
  BASE,
  TRACKING_COLLECTION,
  PLANNING_COLLECTION,
  PLANNING_COLLECTION_LEGACY,
} = require('../config/planningConstants');
const { clean } = require('../utils/text');

const resolveRuntimeDataPaths = (runtimeDataSource = null) => {
  const appId = clean(runtimeDataSource?.appId);
  const useArtifactsPaths = Boolean(runtimeDataSource?.useArtifactsPaths && appId);

  if (useArtifactsPaths) {
    return {
      trackingCollection: `artifacts/${appId}/public/data/tracked_products`,
      planningCollection: `artifacts/${appId}/public/data/digital_planning`,
      planningLegacyCollection: null,
    };
  }

  return {
    trackingCollection: TRACKING_COLLECTION,
    planningCollection: PLANNING_COLLECTION,
    planningLegacyCollection: PLANNING_COLLECTION_LEGACY,
  };
};

const getPlanningOrderDocByOrderId = async (orderId, runtimeDataSource = null) => {
  const normalizedOrderId = clean(orderId);
  if (!normalizedOrderId) return null;

  const { planningCollection, planningLegacyCollection } = resolveRuntimeDataPaths(runtimeDataSource);

  const primarySnap = await db
    .collection(planningCollection)
    .where('orderId', '==', normalizedOrderId)
    .limit(1)
    .get();

  if (!primarySnap.empty) return primarySnap.docs[0];

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
  if (!cleanId) return null;

  const { trackingCollection } = resolveRuntimeDataPaths(runtimeDataSource);

  const directRef = db.collection(trackingCollection).doc(cleanId);
  const directSnap = await directRef.get();
  if (directSnap.exists) return directSnap;

  const lotSnap = await db
    .collection(trackingCollection)
    .where('lotNumber', '==', cleanId)
    .limit(1)
    .get();

  if (!lotSnap.empty) return lotSnap.docs[0];
  return null;
};

const getPlanningOrderDocById = async (orderDocId, runtimeDataSource = null) => {
  const cleanId = clean(orderDocId);
  if (!cleanId) return null;

  const { planningCollection, planningLegacyCollection } = resolveRuntimeDataPaths(runtimeDataSource);

  const primaryRef = db.collection(planningCollection).doc(cleanId);
  const primarySnap = await primaryRef.get();
  if (primarySnap.exists) return primarySnap;

  if (!planningLegacyCollection) return null;

  const legacyRef = db.collection(planningLegacyCollection).doc(cleanId);
  const legacySnap = await legacyRef.get();
  if (legacySnap.exists) return legacySnap;

  return null;
};

/**
 * Resolves all environment-aware collection paths for a single request.
 * Returns path strings and a `_rds` back-reference for passing to repository functions.
 */
const resolveDbContext = (runtimeDataSource = null) => {
  const appId = clean(runtimeDataSource?.appId);
  const useArtifacts = Boolean(runtimeDataSource?.useArtifactsPaths && appId);
  const artifactsBase = `artifacts/${appId}/public/data`;
  const prodBase = `${BASE}/production`;
  const base = useArtifacts ? artifactsBase : prodBase;
  return {
    trackingPath: useArtifacts ? `${artifactsBase}/tracked_products` : TRACKING_COLLECTION,
    planningPath: useArtifacts ? `${artifactsBase}/digital_planning` : PLANNING_COLLECTION,
    planningLegacyPath: useArtifacts ? null : PLANNING_COLLECTION_LEGACY,
    efficiencyPath: `${base}/efficiency_hours`,
    archiveItemsPath: (year) => `${base}/archive/${year}/items`,
    archiveRejectedPath: (year) => `${base}/archive/${year}/rejected`,
    archivePlanningPath: (year) => `${base}/archive/${year}/planning`,
    occupancyPath: `${BASE}/production/machine_occupancy`,
    printQueuePath: `${BASE}/production/print_queue`,
    _rds: runtimeDataSource,
  };
};

module.exports = {
  resolveRuntimeDataPaths,
  resolveDbContext,
  getPlanningOrderDocByOrderId,
  getTrackedProductDocByIdOrLot,
  getPlanningOrderDocById,
};
