const { db } = require('../config/firebase');
const {
  TRACKING_COLLECTION,
  PLANNING_COLLECTION,
  PLANNING_COLLECTION_LEGACY,
} = require('../config/planningConstants');
const { clean } = require('../utils/text');

const getPlanningOrderDocByOrderId = async (orderId) => {
  const normalizedOrderId = clean(orderId);
  if (!normalizedOrderId) return null;

  const primarySnap = await db
    .collection(PLANNING_COLLECTION)
    .where('orderId', '==', normalizedOrderId)
    .limit(1)
    .get();

  if (!primarySnap.empty) return primarySnap.docs[0];

  const legacySnap = await db
    .collection(PLANNING_COLLECTION_LEGACY)
    .where('orderId', '==', normalizedOrderId)
    .limit(1)
    .get();

  if (!legacySnap.empty) return legacySnap.docs[0];
  return null;
};

const getTrackedProductDocByIdOrLot = async (productOrLotId) => {
  const cleanId = clean(productOrLotId);
  if (!cleanId) return null;

  const directRef = db.collection(TRACKING_COLLECTION).doc(cleanId);
  const directSnap = await directRef.get();
  if (directSnap.exists) return directSnap;

  const lotSnap = await db
    .collection(TRACKING_COLLECTION)
    .where('lotNumber', '==', cleanId)
    .limit(1)
    .get();

  if (!lotSnap.empty) return lotSnap.docs[0];
  return null;
};

const getPlanningOrderDocById = async (orderDocId) => {
  const cleanId = clean(orderDocId);
  if (!cleanId) return null;

  const primaryRef = db.collection(PLANNING_COLLECTION).doc(cleanId);
  const primarySnap = await primaryRef.get();
  if (primarySnap.exists) return primarySnap;

  const legacyRef = db.collection(PLANNING_COLLECTION_LEGACY).doc(cleanId);
  const legacySnap = await legacyRef.get();
  if (legacySnap.exists) return legacySnap;

  return null;
};

module.exports = {
  getPlanningOrderDocByOrderId,
  getTrackedProductDocByIdOrLot,
  getPlanningOrderDocById,
};
