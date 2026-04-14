const { db } = require('../config/firebase');
const {
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

module.exports = {
  resolveRuntimeDataPaths,
  getPlanningOrderDocByOrderId,
  getTrackedProductDocByIdOrLot,
  getPlanningOrderDocById,
};
