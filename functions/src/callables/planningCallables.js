const functions = require('firebase-functions');
const {
  REJECT_ALLOWED_ROLES,
  MANUAL_MOVE_ALLOWED_ROLES,
  PLANNING_ARCHIVE_ALLOWED_ROLES,
  ALLOWED_ARCHIVE_REASONS,
  COMPLETE_ALLOWED_ROLES,
  ALLOWED_FINISH_TYPES,
} = require('../config/planningConstants');
const { clean, clampText } = require('../utils/text');
const { resolveUserRoleForContext } = require('../auth/resolveUserRole');
const {
  rejectTrackedProductFinalService,
  moveTrackedProductManualService,
  archivePlanningOrderService,
  completeTrackedProductService,
} = require('../services/planningTransitionService');

const sanitizeRejectReasons = (rawReasons) => {
  if (!Array.isArray(rawReasons) || rawReasons.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Minimaal 1 afkeurreden is verplicht.');
  }

  const reasons = rawReasons
    .map((r) => clampText(clean(r), 100))
    .filter(Boolean)
    .slice(0, 8);

  if (!reasons.length) {
    throw new functions.https.HttpsError('invalid-argument', 'Minimaal 1 geldige afkeurreden is verplicht.');
  }

  return Array.from(new Set(reasons));
};

const rejectTrackedProductFinal = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!REJECT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor definitieve afkeur.');
  }

  const productId = clean(data?.productId);
  if (!productId || productId.length > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig productId.');
  }

  const reasons = sanitizeRejectReasons(data?.reasons);
  const note = clampText(data?.note, 600);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  try {
    return await rejectTrackedProductFinalService({
      productId,
      reasons,
      note,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_PRODUCT') {
      throw new functions.https.HttpsError('not-found', 'Product niet gevonden in tracking.');
    }
    if (error?.message === 'ALREADY_REJECTED') {
      throw new functions.https.HttpsError('failed-precondition', 'Product is al definitief afgekeurd.');
    }
    throw error;
  }
});

const moveTrackedProductManual = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!MANUAL_MOVE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor handmatige verplaatsing.');
  }

  const productOrLotId = clean(data?.productOrLotId);
  const newStation = clean(data?.newStation);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);
  const isRepairMove = Boolean(data?.isRepairMove);
  const repairInstruction = clampText(data?.repairInstruction, 600);

  if (!productOrLotId || productOrLotId.length > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig productOfLotId.');
  }

  if (!newStation || newStation.length > 80) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig doelstation.');
  }

  try {
    return await moveTrackedProductManualService({
      productOrLotId,
      newStation,
      source,
      actorLabel,
      isRepairMove,
      repairInstruction,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_TRACKED') {
      throw new functions.https.HttpsError('not-found', `Geen tracking item gevonden voor ${productOrLotId}.`);
    }
    throw error;
  }
});

const archivePlanningOrder = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!PLANNING_ARCHIVE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om orders te archiveren.');
  }

  const orderDocId = clean(data?.orderDocId);
  const requestedReason = clean(data?.reason).toLowerCase();
  const source = clampText(data?.source, 80);

  if (!orderDocId || orderDocId.length > 220) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig orderDocId.');
  }

  if (!ALLOWED_ARCHIVE_REASONS.has(requestedReason)) {
    throw new functions.https.HttpsError('invalid-argument', 'Niet-toegestane archive reason.');
  }

  try {
    return await archivePlanningOrderService({
      orderDocId,
      requestedReason,
      source,
      auth: context.auth,
      userRole,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_ORDER') {
      throw new functions.https.HttpsError('not-found', 'Planning-order niet gevonden.');
    }
    throw error;
  }
});

const completeTrackedProduct = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!COMPLETE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor productafronding.');
  }

  const productId = clean(data?.productId);
  const finishType = clean(data?.finishType).toLowerCase();
  const fromStation = clampText(data?.fromStation, 80);
  const note = clampText(data?.note, 600);
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);

  if (!productId || productId.length > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig productId.');
  }

  if (!ALLOWED_FINISH_TYPES.has(finishType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Niet-toegestaan finishType. Gebruik "archive" of "forward".');
  }

  try {
    return await completeTrackedProductService({
      productId,
      finishType,
      fromStation,
      note,
      actorLabel,
      auth: context.auth,
      userRole,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_PRODUCT') {
      throw new functions.https.HttpsError('not-found', 'Product niet gevonden in tracking.');
    }
    if (error?.message === 'INVALID_FINISH_TYPE') {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldig finishType.');
    }
    throw error;
  }
});

module.exports = {
  rejectTrackedProductFinal,
  moveTrackedProductManual,
  archivePlanningOrder,
  completeTrackedProduct,
};
