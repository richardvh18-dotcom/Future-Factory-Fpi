const functions = require('firebase-functions/v1');
const {
  REJECT_ALLOWED_ROLES,
  TEMP_REJECT_ALLOWED_ROLES,
  MANUAL_MOVE_ALLOWED_ROLES,
  PLANNING_ARCHIVE_ALLOWED_ROLES,
  ALLOWED_ARCHIVE_REASONS,
  COMPLETE_ALLOWED_ROLES,
  ALLOWED_FINISH_TYPES,
  CANCEL_ALLOWED_ROLES,
  ORDER_PRIORITY_ALLOWED_ROLES,
  ORDER_CANCEL_ALLOWED_ROLES,
  ORDER_EDIT_ALLOWED_ROLES,
  ALLOWED_ORDER_PRIORITIES,
  OCCUPANCY_ALLOWED_ROLES,
  START_PRODUCTION_ALLOWED_ROLES,
  TRANSITION_ALLOWED_ROLES,
  OVERPRODUCTION_ALLOWED_ROLES,
} = require('../config/planningConstants');
const { clean, clampText } = require('../utils/text');
const { resolveUserRoleForContext } = require('../auth/resolveUserRole');
const {
  rejectTrackedProductFinalService,
  moveTrackedProductManualService,
  archivePlanningOrderService,
  completeTrackedProductService,
  cancelTrackedProductionService,
  updatePlanningOrderPriorityService,
  movePlanningOrderService,
  retrievePlanningOrderService,
  togglePlanningOrderHoldService,
  updatePlanningOrderDetailsService,
  patchPlanningOrderMetadataService,
  assignOverproductionService,
  tempRejectTrackedProductService,
  advanceTrackedProductService,
  completeTrackedProductRepairService,
  routeTrackedProductsToLossenService,
  toggleTrackedProductPauseService,
  markTrackedProductReminderService,
  startWorkstationProductionRunService,
  cancelPlanningOrderService,
  assignPersonnelToStationService,
  removePersonnelAssignmentService,
  loanPersonnelService,
  startProductionLotsService,
  editTrackedProductLotNumberService,
  linkPlanningOrderProductService,
  createPlanningOrderManualService,
  markMazakLabelsPrintedService,
  appendQcNoteService,
  reserveAutoLotNumberRangeService,
  saveOccupancyAssignmentsService,
  deleteOccupancyAssignmentsService,
  savePersonnelRecordService,
  addOrderDependencyService,
  removeOrderDependencyService,
  updateOrderPlannedDateService,
  updateOrderKanbanStatusService,
  createProductionMessagesService,
  transitionPrintQueueJobStatusService,
  requeuePrintQueueJobService,
  deletePrintQueueJobService,
  markReadyForNextStepService,
  startTrackedProductRepairService,
  reportShopFloorIssueService,
  resolveShopFloorIssueService,
  bulkImportPlanningOrdersService,
} = require('../services/planningTransitionService');

const { queuePrintJobService } = require('../services/printingService');
const {
  updateUserProfileService,
  clearPasswordChangeFlagService,
  submitAccountRequestService,
  updateUserLanguageService,
} = require('../services/adminService');
const { executeAutomationRuleService } = require('../services/automationService');

const IMPORT_ALLOWED_MODES = new Set(['new_only', 'overwrite', 'smart_update']);

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

const tempRejectTrackedProduct = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!TEMP_REJECT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor tijdelijke afkeur.');
  }

  const productId = clean(data?.productId);
  if (!productId || productId.length > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig productId.');
  }

  const reasons = sanitizeRejectReasons(data?.reasons);
  const note = clampText(data?.note, 600);
  const station = clampText(data?.station, 80);
  const actorLabel = clampText(data?.actorLabel, 120);
  const previousStep = clampText(data?.previousStep, 120);
  const previousStatus = clampText(data?.previousStatus, 120);
  const source = clampText(data?.source, 80);

  try {
    return await tempRejectTrackedProductService({
      productId,
      reasons,
      note,
      station,
      actorLabel,
      previousStep,
      previousStatus,
      source,
      auth: context.auth,
      userRole,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_PRODUCT') {
      throw new functions.https.HttpsError('not-found', 'Product niet gevonden in tracking.');
    }
    throw error;
  }
});

const advanceTrackedProduct = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!TRANSITION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor producttransitie.');
  }

  const productId = clean(data?.productId);
  const nextStation = clampText(data?.nextStation, 80);
  const nextStep = clampText(data?.nextStep, 120);
  const nextStatus = clampText(data?.nextStatus, 120);
  const lastStation = clampText(data?.lastStation, 80);
  const note = clampText(data?.note, 600);
  const actorLabel = clampText(data?.actorLabel, 120);
  const previousStep = clampText(data?.previousStep, 120);
  const historyAction = clampText(data?.historyAction, 120);
  const historyDetails = clampText(data?.historyDetails, 600);
  const clearManualMove = Boolean(data?.clearManualMove);
  const source = clampText(data?.source, 80);
  const measurements = data?.measurements && typeof data.measurements === 'object' ? data.measurements : null;

  if (!productId || !nextStep || !nextStatus) {
    throw new functions.https.HttpsError('invalid-argument', 'productId, nextStep en nextStatus zijn verplicht.');
  }

  try {
    return await advanceTrackedProductService({
      productId,
      nextStation,
      nextStep,
      nextStatus,
      lastStation,
      note,
      actorLabel,
      previousStep,
      historyAction,
      historyDetails,
      clearManualMove,
      measurements,
      source,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_PRODUCT') {
      throw new functions.https.HttpsError('not-found', 'Product niet gevonden in tracking.');
    }
    if (error?.message === 'INVALID_ADVANCE_TARGET') {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldige doeltransitie.');
    }
    throw error;
  }
});

const completeTrackedProductRepair = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!TRANSITION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om reparatie af te ronden.');
  }

  const productId = clean(data?.productId);
  const station = clampText(data?.station, 80);
  const note = clampText(data?.note, 600);
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);
  const actions = Array.isArray(data?.actions) ? data.actions.map((entry) => clampText(entry, 120)).filter(Boolean) : [];

  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'productId is verplicht.');
  }

  try {
    return await completeTrackedProductRepairService({
      productId,
      station,
      actions,
      note,
      actorLabel,
      source,
      auth: context.auth,
      userRole,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_PRODUCT') {
      throw new functions.https.HttpsError('not-found', 'Product niet gevonden in tracking.');
    }
    throw error;
  }
});

const routeTrackedProductsToLossen = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!TRANSITION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om naar Lossen te routeren.');
  }

  const productIds = Array.isArray(data?.productIds)
    ? data.productIds.map((entry) => clean(entry)).filter(Boolean).slice(0, 200)
    : [];
  const originStation = clampText(data?.originStation, 80);
  const centralStation = clampText(data?.centralStation, 80);
  const centralOperators = Array.isArray(data?.centralOperators)
    ? data.centralOperators.map((entry) => clampText(entry, 80)).filter(Boolean).slice(0, 50)
    : [];
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);

  if (productIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'productIds is verplicht.');
  }

  try {
    return await routeTrackedProductsToLossenService({
      productIds,
      originStation,
      centralStation,
      centralOperators,
      actorLabel,
      source,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NO_PRODUCTS_TO_ROUTE') {
      throw new functions.https.HttpsError('invalid-argument', 'Geen producten om te routeren.');
    }
    if (error?.message === 'NO_PRODUCTS_FOUND') {
      throw new functions.https.HttpsError('not-found', 'Geen actieve trackingproducten gevonden om te routeren.');
    }
    throw error;
  }
});

const startWorkstationProductionRun = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!START_PRODUCTION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om productie te starten.');
  }

  const orderDocId = clean(data?.orderDocId);
  const lotStart = clean(data?.lotStart);
  const stringCount = Number(data?.stringCount);
  const stationId = clean(data?.stationId);
  const actorLabel = clampText(data?.actorLabel, 120);
  const labelZplData = typeof data?.labelZplData === 'string' ? data.labelZplData : '';
  const labelTemplateId = clean(data?.labelTemplateId);
  const seriesGroupId = clean(data?.seriesGroupId);
  const isFlangeSeries = Boolean(data?.isFlangeSeries);
  const source = clampText(data?.source, 80);
  const stationOperators = Array.isArray(data?.stationOperators)
    ? data.stationOperators.map((entry) => clampText(entry, 80)).filter(Boolean).slice(0, 50)
    : [];

  if (!orderDocId || !lotStart || !stationId || !Number.isFinite(stringCount) || stringCount < 1 || stringCount > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'orderDocId, lotStart, stationId en geldige stringCount zijn verplicht.');
  }

  try {
    return await startWorkstationProductionRunService({
      orderDocId,
      lotStart,
      stringCount,
      stationId,
      actorLabel,
      labelZplData,
      labelTemplateId,
      seriesGroupId,
      isFlangeSeries,
      stationOperators,
      source,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_ORDER') {
      throw new functions.https.HttpsError('not-found', 'Planning-order niet gevonden.');
    }
    if (
      error?.message === 'INVALID_WORKSTATION_START_PAYLOAD'
      || error?.message === 'INVALID_LOT_FORMAT'
      || error?.message === 'INVALID_LOT_SEQUENCE'
    ) {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldige startpayload voor productie-run.');
    }
    throw error;
  }
});

const toggleTrackedProductPause = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!TRANSITION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om pauzestatus te wijzigen.');
  }

  const productId = clean(data?.productId);
  const note = clampText(data?.note, 600);
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);

  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'productId is verplicht.');
  }

  try {
    return await toggleTrackedProductPauseService({
      productId,
      note,
      actorLabel,
      source,
      auth: context.auth,
      userRole,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_PRODUCT') {
      throw new functions.https.HttpsError('not-found', 'Product niet gevonden in tracking.');
    }
    throw error;
  }
});

const markTrackedProductReminder = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!TRANSITION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om reminderstatus te wijzigen.');
  }

  const productId = clean(data?.productId);
  const reminderSent = data?.reminderSent !== false;
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);

  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'productId is verplicht.');
  }

  try {
    return await markTrackedProductReminderService({
      productId,
      reminderSent,
      actorLabel,
      source,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_PRODUCT') {
      throw new functions.https.HttpsError('not-found', 'Product niet gevonden in tracking.');
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

const cancelTrackedProduction = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!CANCEL_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om productie te annuleren.');
  }

  const productId = clean(data?.productId);
  const selectedStation = clampText(data?.selectedStation, 80);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!productId || productId.length > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig productId.');
  }

  try {
    return await cancelTrackedProductionService({
      productId,
      selectedStation,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_PRODUCT') {
      throw new functions.https.HttpsError('not-found', 'Product niet gevonden in tracking.');
    }
    throw error;
  }
});

const updatePlanningOrderPriority = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_PRIORITY_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om order-prioriteit te wijzigen.');
  }

  const orderDocId = clean(data?.orderDocId);
  const productDocId = clean(data?.productDocId);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);
  const rawPriority = data?.priority;

  if (!orderDocId || orderDocId.length > 220) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig orderDocId.');
  }

  const normalizedPriority = rawPriority === false
    ? false
    : clean(rawPriority).toLowerCase();

  if (!(normalizedPriority === false || ALLOWED_ORDER_PRIORITIES.has(normalizedPriority))) {
    throw new functions.https.HttpsError('invalid-argument', 'Priority moet "high", "urgent", "immediate" of false zijn.');
  }

  try {
    return await updatePlanningOrderPriorityService({
      orderDocId,
      priority: normalizedPriority,
      productDocId,
      actorLabel,
      source,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_ORDER') {
      throw new functions.https.HttpsError('not-found', 'Planning-order niet gevonden.');
    }
    throw error;
  }
});

const movePlanningOrder = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om order te verplaatsen.');
  }

  const orderDocId = clean(data?.orderDocId);
  const targetType = clean(data?.targetType).toLowerCase();
  const targetId = clampText(data?.targetId, 120);
  const currentDepartment = clampText(data?.currentDepartment, 80);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!orderDocId || !targetId || !['department', 'station'].includes(targetType)) {
    throw new functions.https.HttpsError('invalid-argument', 'orderDocId, targetType en targetId zijn verplicht.');
  }

  try {
    return await movePlanningOrderService({
      orderDocId,
      targetType,
      targetId,
      currentDepartment,
      source,
      actorLabel,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_ORDER') {
      throw new functions.https.HttpsError('not-found', 'Planning-order niet gevonden.');
    }
    if (error?.message === 'INVALID_MOVE_TARGET') {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldig verplaatsingsdoel.');
    }
    throw error;
  }
});

const retrievePlanningOrder = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om order terug te halen.');
  }

  const orderDocId = clean(data?.orderDocId);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!orderDocId) {
    throw new functions.https.HttpsError('invalid-argument', 'orderDocId is verplicht.');
  }

  try {
    return await retrievePlanningOrderService({
      orderDocId,
      source,
      actorLabel,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_ORDER') {
      throw new functions.https.HttpsError('not-found', 'Planning-order niet gevonden.');
    }
    throw error;
  }
});

const togglePlanningOrderHold = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om hold-status te wijzigen.');
  }

  const orderDocId = clean(data?.orderDocId);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!orderDocId) {
    throw new functions.https.HttpsError('invalid-argument', 'orderDocId is verplicht.');
  }

  try {
    return await togglePlanningOrderHoldService({
      orderDocId,
      source,
      actorLabel,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_ORDER') {
      throw new functions.https.HttpsError('not-found', 'Planning-order niet gevonden.');
    }
    throw error;
  }
});

const updatePlanningOrderDetails = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om orderdetails te wijzigen.');
  }

  const orderDocId = clean(data?.orderDocId);
  const notes = clampText(data?.notes, 2000);
  const rawPlan = data?.plan;
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);
  const plan = rawPlan === null || rawPlan === undefined || rawPlan === '' ? null : Number(rawPlan);

  if (!orderDocId) {
    throw new functions.https.HttpsError('invalid-argument', 'orderDocId is verplicht.');
  }

  if (plan !== null && (!Number.isFinite(plan) || plan < 0 || plan > 1000000)) {
    throw new functions.https.HttpsError('invalid-argument', 'plan moet een geldig getal van 0 of hoger zijn.');
  }

  try {
    return await updatePlanningOrderDetailsService({
      orderDocId,
      notes,
      plan,
      source,
      actorLabel,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_ORDER') {
      throw new functions.https.HttpsError('not-found', 'Planning-order niet gevonden.');
    }
    throw error;
  }
});

const patchPlanningOrderMetadata = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om planningmetadata te wijzigen.');
  }

  const orderDocId = clean(data?.orderDocId);
  const patch = data?.patch && typeof data.patch === 'object' ? data.patch : null;
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!orderDocId || !patch) {
    throw new functions.https.HttpsError('invalid-argument', 'orderDocId en patch zijn verplicht.');
  }

  try {
    return await patchPlanningOrderMetadataService({
      orderDocId,
      patch,
      source,
      actorLabel,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_ORDER') {
      throw new functions.https.HttpsError('not-found', 'Planning-order niet gevonden.');
    }
    if (error?.message === 'INVALID_PATCH_PAYLOAD' || error?.message === 'INVALID_PATCH_QUANTITY') {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldige planning patch payload.');
    }
    throw error;
  }
});

const assignOverproduction = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!OVERPRODUCTION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om overproduction te koppelen.');
  }

  const targetOrderDocId = clean(data?.targetOrderDocId);
  const targetOrderId = clean(data?.targetOrderId);
  const routeStation = clean(data?.routeStation);
  const sourceOrderId = clean(data?.sourceOrderId);
  const originMachine = clean(data?.originMachine);
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);
  const productIds = Array.isArray(data?.productIds)
    ? data.productIds.map((id) => clean(id)).filter(Boolean).slice(0, 200)
    : [];

  if (!targetOrderDocId || !targetOrderId || !routeStation || productIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'targetOrderDocId, targetOrderId, routeStation en productIds zijn verplicht.');
  }

  try {
    return await assignOverproductionService({
      targetOrderDocId,
      targetOrderId,
      productIds,
      routeStation,
      sourceOrderId,
      originMachine,
      actorLabel,
      source,
      auth: context.auth,
      userRole,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_TARGET_ORDER') {
      throw new functions.https.HttpsError('not-found', 'Doelorder niet gevonden.');
    }
    if (error?.message === 'NOT_FOUND_OVERPRODUCTION_PRODUCTS') {
      throw new functions.https.HttpsError('not-found', 'Geen actieve overproduction-producten gevonden.');
    }
    if (error?.message === 'INVALID_OVERPRODUCTION_PAYLOAD') {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldige overproduction payload.');
    }
    throw error;
  }
});

const cancelPlanningOrder = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_CANCEL_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om order te annuleren.');
  }

  const orderDocId = clean(data?.orderDocId);
  const reason = clampText(data?.reason, 600);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!orderDocId || orderDocId.length > 220) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig orderDocId.');
  }

  try {
    return await cancelPlanningOrderService({
      orderDocId,
      reason,
      source,
      actorLabel,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_ORDER') {
      throw new functions.https.HttpsError('not-found', 'Planning-order niet gevonden.');
    }
    throw error;
  }
});

const assignPersonnelToStation = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!OCCUPANCY_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor personeels-toewijzing.');
  }

  const stationId = clean(data?.stationId);
  const operatorId = clean(data?.operatorId);
  const operatorNumber = clean(data?.operatorNumber);
  const operatorName = clampText(data?.operatorName, 140);
  const date = clean(data?.date);
  const departmentId = clean(data?.departmentId);
  const hoursWorked = Number(data?.hoursWorked);
  const shiftType = clampText(data?.shiftType, 40);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!stationId || !operatorId || !date) {
    throw new functions.https.HttpsError('invalid-argument', 'stationId, operatorId en date zijn verplicht.');
  }

  try {
    return await assignPersonnelToStationService({
      stationId,
      operatorId,
      operatorNumber,
      operatorName,
      date,
      departmentId,
      hoursWorked,
      shiftType,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
    });
  } catch (error) {
    throw error;
  }
});

const removePersonnelAssignment = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!OCCUPANCY_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor personeels-toewijzing.');
  }

  const assignmentId = clean(data?.assignmentId);
  const stationId = clean(data?.stationId);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!assignmentId) {
    throw new functions.https.HttpsError('invalid-argument', 'assignmentId is verplicht.');
  }

  try {
    return await removePersonnelAssignmentService({
      assignmentId,
      stationId,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_ASSIGNMENT') {
      throw new functions.https.HttpsError('not-found', 'Toewijzing niet gevonden.');
    }
    throw error;
  }
});

const loanPersonnelToDepartment = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!OCCUPANCY_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor personeels-uitlening.');
  }

  const operatorNumber = clean(data?.operatorNumber);
  const operatorName = clampText(data?.operatorName, 140);
  const targetDepartment = clean(data?.targetDepartment);
  const targetStation = clean(data?.targetStation);
  const date = clean(data?.date);
  const shiftLabel = clampText(data?.shiftLabel, 80);
  const shiftStart = clampText(data?.shiftStart, 12);
  const shiftEnd = clampText(data?.shiftEnd, 12);
  const hoursWorked = Number(data?.hoursWorked);
  const isPloeg = Boolean(data?.isPloeg);
  const loanFromDepartment = clean(data?.loanFromDepartment);
  const loanFromStation = clean(data?.loanFromStation);
  const originalShift = clampText(data?.originalShift, 120);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!operatorNumber || !targetDepartment || !targetStation || !date) {
    throw new functions.https.HttpsError('invalid-argument', 'operatorNumber, targetDepartment, targetStation en date zijn verplicht.');
  }

  return loanPersonnelService({
    operatorNumber,
    operatorName,
    targetDepartment,
    targetStation,
    date,
    shiftLabel,
    shiftStart,
    shiftEnd,
    hoursWorked,
    isPloeg,
    loanFromDepartment,
    loanFromStation,
    originalShift,
    source,
    actorLabel,
    auth: context.auth,
    userRole,
  });
});

const saveOccupancyAssignments = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!OCCUPANCY_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor occupancy-mutaties.');
  }

  const records = Array.isArray(data?.records) ? data.records : [];
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  try {
    return await saveOccupancyAssignmentsService({
      records,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
    });
  } catch (error) {
    if (error?.message === 'INVALID_OCCUPANCY_RECORDS') {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldige occupancy records.');
    }
    throw error;
  }
});

const deleteOccupancyAssignments = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!OCCUPANCY_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor occupancy-mutaties.');
  }

  const assignmentIds = Array.isArray(data?.assignmentIds) ? data.assignmentIds : [];
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  try {
    return await deleteOccupancyAssignmentsService({
      assignmentIds,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
    });
  } catch (error) {
    if (error?.message === 'INVALID_OCCUPANCY_ASSIGNMENT_IDS') {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldige occupancy assignment ids.');
    }
    throw error;
  }
});

const savePersonnelRecord = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!OCCUPANCY_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor personeelsmutaties.');
  }

  const personId = clean(data?.personId);
  const payload = data?.data && typeof data.data === 'object' ? data.data : null;
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!payload) {
    throw new functions.https.HttpsError('invalid-argument', 'data is verplicht.');
  }

  try {
    return await savePersonnelRecordService({
      personId,
      data: payload,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
    });
  } catch (error) {
    if (error?.message === 'INVALID_PERSONNEL_PAYLOAD') {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldige personnel payload.');
    }
    throw error;
  }
});

const createProductionMessages = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!START_PRODUCTION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om productieberichten aan te maken.');
  }

  const messages = Array.isArray(data?.messages) ? data.messages.slice(0, 50) : [];
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!messages.length) {
    throw new functions.https.HttpsError('invalid-argument', 'Minimaal 1 bericht is verplicht.');
  }

  try {
    return await createProductionMessagesService({
      messages,
      source,
      actorLabel,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'INVALID_MESSAGES_PAYLOAD') {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldige messages payload.');
    }
    throw error;
  }
});

const transitionPrintQueueJobStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!START_PRODUCTION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor print queue mutaties.');
  }

  const jobId = clean(data?.jobId);
  const status = clean(data?.status);
  const errorMessage = clampText(data?.error, 1000);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!jobId || !status) {
    throw new functions.https.HttpsError('invalid-argument', 'jobId en status zijn verplicht.');
  }

  try {
    return await transitionPrintQueueJobStatusService({
      jobId,
      status,
      error: errorMessage,
      source,
      actorLabel,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_PRINT_JOB') {
      throw new functions.https.HttpsError('not-found', 'Printjob niet gevonden.');
    }
    if (error?.message === 'INVALID_PRINT_QUEUE_TRANSITION') {
      throw new functions.https.HttpsError('failed-precondition', 'Ongeldige print queue statusovergang.');
    }
    throw error;
  }
});

const requeuePrintQueueJob = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!START_PRODUCTION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten voor print queue mutaties.');
  }

  const jobId = clean(data?.jobId);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!jobId) {
    throw new functions.https.HttpsError('invalid-argument', 'jobId is verplicht.');
  }

  try {
    return await requeuePrintQueueJobService({
      jobId,
      source,
      actorLabel,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_PRINT_JOB') {
      throw new functions.https.HttpsError('not-found', 'Printjob niet gevonden.');
    }
    throw error;
  }
});

const deletePrintQueueJob = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (userRole !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Alleen admins mogen printjobs verwijderen.');
  }

  const jobId = clean(data?.jobId);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!jobId) {
    throw new functions.https.HttpsError('invalid-argument', 'jobId is verplicht.');
  }

  try {
    return await deletePrintQueueJobService({
      jobId,
      source,
      actorLabel,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_PRINT_JOB') {
      throw new functions.https.HttpsError('not-found', 'Printjob niet gevonden.');
    }
    throw error;
  }
});

const startProductionLots = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!START_PRODUCTION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om productie te starten.');
  }

  const orderDocId = clean(data?.orderDocId);
  const orderId = clean(data?.orderId);
  const itemCode = clean(data?.itemCode);
  const item = clampText(data?.item, 180);
  const lotStart = clean(data?.lotStart);
  const totalToProduce = Number(data?.totalToProduce);
  const stationId = clean(data?.stationId);
  const stationLabel = clampText(data?.stationLabel, 120);
  const actorLabel = clampText(data?.actorLabel, 120);
  const labelZplData = typeof data?.labelZplData === 'string' ? data.labelZplData : '';
  const labelTemplateId = clean(data?.labelTemplateId);
  const seriesGroupId = clean(data?.seriesGroupId);
  const isFlangeSeries = Boolean(data?.isFlangeSeries);

  if (!orderDocId || !orderId || !itemCode || !lotStart || !stationId) {
    throw new functions.https.HttpsError('invalid-argument', 'orderDocId, orderId, itemCode, lotStart en stationId zijn verplicht.');
  }

  if (!Number.isFinite(totalToProduce) || totalToProduce < 1 || totalToProduce > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'totalToProduce moet tussen 1 en 200 liggen.');
  }

  return startProductionLotsService({
    orderDocId,
    orderId,
    itemCode,
    item,
    lotStart,
    totalToProduce,
    stationId,
    stationLabel,
    actorLabel,
    labelZplData,
    labelTemplateId,
    seriesGroupId,
    isFlangeSeries,
  });
});

const editTrackedProductLotNumber = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om lotnummer te wijzigen.');
  }

  const productId = clean(data?.productId);
  const newLotNumber = clean(data?.newLotNumber);
  const reason = clampText(data?.reason, 300);
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);

  if (!productId || !newLotNumber || !reason) {
    throw new functions.https.HttpsError('invalid-argument', 'productId, newLotNumber en reason zijn verplicht.');
  }

  try {
    return await editTrackedProductLotNumberService({
      productId,
      newLotNumber,
      reason,
      actorLabel,
      source,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_PRODUCT') {
      throw new functions.https.HttpsError('not-found', 'Product niet gevonden in tracking.');
    }
    if (error?.message === 'LOT_NUMBER_EXISTS') {
      throw new functions.https.HttpsError('already-exists', 'Lotnummer bestaat al in actieve tracking.');
    }
    if (error?.message === 'LOT_NUMBER_UNCHANGED' || error?.message === 'INVALID_LOT_EDIT_PAYLOAD') {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldige lotnummerwijziging payload.');
    }
    throw error;
  }
});

const linkPlanningOrderProduct = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om order te koppelen.');
  }

  const orderDocId = clean(data?.orderDocId);
  const productId = clean(data?.productId);
  const productImage = typeof data?.productImage === 'string' ? data.productImage : '';

  if (!orderDocId || !productId) {
    throw new functions.https.HttpsError('invalid-argument', 'orderDocId en productId zijn verplicht.');
  }

  try {
    return await linkPlanningOrderProductService({
      orderDocId,
      productId,
      productImage,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_ORDER') {
      throw new functions.https.HttpsError('not-found', 'Planning-order niet gevonden.');
    }
    throw error;
  }
});

const createPlanningOrderManual = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om handmatig order aan te maken.');
  }

  const orderId = clean(data?.orderId);
  const item = clampText(data?.item, 220);
  const machine = clean(data?.machine);
  const plan = Number(data?.plan);

  if (!orderId || !item || !machine || !Number.isFinite(plan) || plan <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'orderId, item, machine en geldige plan zijn verplicht.');
  }

  try {
    return await createPlanningOrderManualService({
      orderId,
      item,
      machine,
      plan,
    });
  } catch (error) {
    if (error?.message === 'ORDER_ALREADY_EXISTS') {
      throw new functions.https.HttpsError('already-exists', 'Order bestaat al in planning.');
    }
    if (error?.message === 'INVALID_MANUAL_ORDER_PAYLOAD') {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldige payload voor handmatige order.');
    }
    throw error;
  }
});

const markMazakLabelsPrinted = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!TRANSITION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om labelstatus te wijzigen.');
  }

  const productIds = Array.isArray(data?.productIds)
    ? data.productIds.map((entry) => clean(entry)).filter(Boolean).slice(0, 200)
    : [];
  const stationId = clean(data?.stationId);
  const isReprint = Boolean(data?.isReprint);
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);

  if (productIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'productIds is verplicht.');
  }

  try {
    return await markMazakLabelsPrintedService({
      productIds,
      stationId,
      isReprint,
      actorLabel,
      source,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NO_PRODUCTS_TO_UPDATE') {
      throw new functions.https.HttpsError('invalid-argument', 'Geen producten opgegeven voor label update.');
    }
    if (error?.message === 'NO_PRODUCTS_FOUND') {
      throw new functions.https.HttpsError('not-found', 'Geen actieve trackingproducten gevonden voor label update.');
    }
    throw error;
  }
});

const appendQcNote = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!TRANSITION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om QC-notities toe te voegen.');
  }

  const productId = clean(data?.productId);
  const note = clampText(data?.note, 800);
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);
  const archivedYear = Number(data?.archivedYear);

  if (!productId || !note) {
    throw new functions.https.HttpsError('invalid-argument', 'productId en note zijn verplicht.');
  }

  try {
    return await appendQcNoteService({
      productId,
      note,
      archivedYear: Number.isFinite(archivedYear) ? archivedYear : null,
      actorLabel,
      source,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'INVALID_QC_NOTE_PAYLOAD') {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldige payload voor QC-notitie.');
    }
    if (error?.message === 'NOT_FOUND_PRODUCT') {
      throw new functions.https.HttpsError('not-found', 'Product niet gevonden in tracking of archief.');
    }
    throw error;
  }
});

const reserveAutoLotNumberRange = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!START_PRODUCTION_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om lotnummers te reserveren.');
  }

  const stationId = clean(data?.stationId);
  const count = Number(data?.count);
  const reserve = data?.reserve !== false;

  if (!stationId || !Number.isFinite(count) || count < 1 || count > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'stationId en geldige count (1-200) zijn verplicht.');
  }

  try {
    return await reserveAutoLotNumberRangeService({
      stationId,
      count,
      reserve,
    });
  } catch (error) {
    if (error?.message === 'INVALID_LOT_RANGE_SIZE') {
      throw new functions.https.HttpsError('invalid-argument', 'count moet tussen 1 en 200 liggen.');
    }
    if (error?.message === 'NO_UNIQUE_LOT_AVAILABLE') {
      throw new functions.https.HttpsError('resource-exhausted', 'Geen uniek lotnummer beschikbaar voor deze machine/week.');
    }
    throw error;
  }
});

const addOrderDependency = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om dependencies te beheren.');
  }

  const orderId = clean(data?.orderId);
  const dependencyId = clean(data?.dependencyId);

  if (!orderId || !dependencyId) {
    throw new functions.https.HttpsError('invalid-argument', 'orderId en dependencyId zijn verplicht.');
  }

  try {
    return await addOrderDependencyService({ orderId, dependencyId });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_ORDER') {
      throw new functions.https.HttpsError('not-found', 'Order niet gevonden.');
    }
    throw error;
  }
});

const removeOrderDependency = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om dependencies te beheren.');
  }

  const orderId = clean(data?.orderId);
  const dependencyId = clean(data?.dependencyId);

  if (!orderId || !dependencyId) {
    throw new functions.https.HttpsError('invalid-argument', 'orderId en dependencyId zijn verplicht.');
  }

  try {
    return await removeOrderDependencyService({ orderId, dependencyId });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_ORDER') {
      throw new functions.https.HttpsError('not-found', 'Order niet gevonden.');
    }
    throw error;
  }
});

const updateOrderPlannedDate = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om geplande datum te wijzigen.');
  }

  const orderId = clean(data?.orderId);
  const plannedDateRaw = data?.plannedDate;
  const plannedDate = new Date(plannedDateRaw);

  if (!orderId || !plannedDateRaw || Number.isNaN(plannedDate.getTime())) {
    throw new functions.https.HttpsError('invalid-argument', 'orderId en geldige plannedDate zijn verplicht.');
  }

  try {
    return await updateOrderPlannedDateService({ orderId, plannedDate });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_ORDER') {
      throw new functions.https.HttpsError('not-found', 'Order niet gevonden.');
    }
    throw error;
  }
});

const updateOrderKanbanStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om orderstatus te wijzigen.');
  }

  const orderId = clean(data?.orderId);
  const status = clean(data?.status);

  if (!orderId || !status || status.length > 80) {
    throw new functions.https.HttpsError('invalid-argument', 'orderId en geldige status zijn verplicht.');
  }

  try {
    return await updateOrderKanbanStatusService({ orderId, status, auth: context.auth });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_ORDER') {
      throw new functions.https.HttpsError('not-found', 'Order niet gevonden.');
    }
    throw error;
  }
});

const markReadyForNextStep = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!MANUAL_MOVE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om product gereed te markeren.');
  }

  const productId = clean(data?.productId);
  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'productId is verplicht.');
  }

  try {
    return await markReadyForNextStepService({ productId, auth: context.auth });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_PRODUCT') {
      throw new functions.https.HttpsError('not-found', 'Product niet gevonden.');
    }
    throw error;
  }
});

const startTrackedProductRepair = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!MANUAL_MOVE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om reparatie te starten.');
  }

  const productId = clean(data?.productId);
  const repairReason = clampText(data?.repairReason, 500);
  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'productId is verplicht.');
  }

  try {
    return await startTrackedProductRepairService({
      productId,
      repairReason,
      auth: context.auth,
    });
  } catch (error) {
    if (error?.message === 'NOT_FOUND_PRODUCT') {
      throw new functions.https.HttpsError('not-found', 'Product niet gevonden.');
    }
    throw error;
  }
});

const reportShopFloorIssue = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!MANUAL_MOVE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om meldingen te registreren.');
  }

  const type = clean(data?.type);
  const machine = clampText(data?.machine, 120);
  const orderId = clean(data?.orderId);
  const lotNumber = clean(data?.lotNumber);
  const description = clampText(data?.description, 1000);
  const operatorName = clampText(data?.operatorName, 120);

  if (!['downtime', 'defect'].includes(type)) {
    throw new functions.https.HttpsError('invalid-argument', 'type moet downtime of defect zijn.');
  }

  return reportShopFloorIssueService({
    type,
    machine,
    orderId,
    lotNumber,
    description,
    operatorName,
    auth: context.auth,
  });
});

const resolveShopFloorIssue = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!MANUAL_MOVE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om meldingen op te lossen.');
  }

  const type = clean(data?.type);
  const issueId = clean(data?.issueId);
  if (!type || !issueId) {
    throw new functions.https.HttpsError('invalid-argument', 'type en issueId zijn verplicht.');
  }

  try {
    return await resolveShopFloorIssueService({ type, issueId, auth: context.auth });
  } catch (error) {
    if (error?.message === 'INVALID_ISSUE_TYPE') {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldig issue type.');
    }
    if (error?.message === 'NOT_FOUND_ISSUE') {
      throw new functions.https.HttpsError('not-found', 'Melding niet gevonden.');
    }
    throw error;
  }
});

const importPlanningOrders = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om planning te importeren.');
  }

  const importMode = clean(data?.importMode).toLowerCase() || 'new_only';
  if (!IMPORT_ALLOWED_MODES.has(importMode)) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldige importMode.');
  }

  const orders = Array.isArray(data?.orders) ? data.orders.slice(0, 1500) : [];
  if (orders.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Minimaal 1 order is verplicht.');
  }

  return bulkImportPlanningOrdersService({
    orders,
    importMode,
  });
});

const queuePrintJob = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const printerId = clean(data?.printerId);
  const zplData = clean(data?.zplData);
  const metadata = (typeof data?.metadata === 'object' && data.metadata) || {};

  if (!printerId) {
    throw new functions.https.HttpsError('invalid-argument', 'printerId is verplicht.');
  }

  if (!zplData) {
    throw new functions.https.HttpsError('invalid-argument', 'zplData is verplicht.');
  }

  return queuePrintJobService(printerId, zplData, metadata, context);
});

const updateUserProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const profileData = (typeof data?.profileData === 'object' && data.profileData) || {};
  
  if (!profileData.name || !profileData.language) {
    throw new functions.https.HttpsError('invalid-argument', 'name en language zijn verplicht.');
  }

  return updateUserProfileService(context.auth.uid, profileData);
});

const clearPasswordChangeFlag = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  return clearPasswordChangeFlagService(context.auth.uid);
});

const submitAccountRequest = functions.https.onCall(async (data, context) => {
  const requestData = (typeof data?.requestData === 'object' && data.requestData) || {};

  if (!requestData.name || !requestData.email) {
    throw new functions.https.HttpsError('invalid-argument', 'Naam en e-mailadres zijn verplicht.');
  }

  return submitAccountRequestService(requestData);
});

const updateUserLanguage = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const language = clean(data?.language);

  if (!language) {
    throw new functions.https.HttpsError('invalid-argument', 'language is verplicht.');
  }

  return updateUserLanguageService(context.auth.uid, language);
});

const executeAutomationRule = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const rule = (typeof data?.rule === 'object' && data.rule) || null;
  if (!rule) {
    throw new functions.https.HttpsError('invalid-argument', 'rule is verplicht.');
  }

  return executeAutomationRuleService(rule);
});

module.exports = {
  rejectTrackedProductFinal,
  tempRejectTrackedProduct,
  advanceTrackedProduct,
  completeTrackedProductRepair,
  routeTrackedProductsToLossen,
  startWorkstationProductionRun,
  toggleTrackedProductPause,
  markTrackedProductReminder,
  moveTrackedProductManual,
  archivePlanningOrder,
  completeTrackedProduct,
  cancelTrackedProduction,
  updatePlanningOrderPriority,
  movePlanningOrder,
  retrievePlanningOrder,
  togglePlanningOrderHold,
  updatePlanningOrderDetails,
  patchPlanningOrderMetadata,
  assignOverproduction,
  cancelPlanningOrder,
  assignPersonnelToStation,
  removePersonnelAssignment,
  loanPersonnelToDepartment,
  saveOccupancyAssignments,
  deleteOccupancyAssignments,
  savePersonnelRecord,
  createProductionMessages,
  transitionPrintQueueJobStatus,
  requeuePrintQueueJob,
  deletePrintQueueJob,
  startProductionLots,
  editTrackedProductLotNumber,
  linkPlanningOrderProduct,
  createPlanningOrderManual,
  markMazakLabelsPrinted,
  appendQcNote,
  reserveAutoLotNumberRange,
  addOrderDependency,
  removeOrderDependency,
  updateOrderPlannedDate,
  updateOrderKanbanStatus,
  markReadyForNextStep,
  startTrackedProductRepair,
  reportShopFloorIssue,
  resolveShopFloorIssue,
  importPlanningOrders,
  queuePrintJob,
  updateUserProfile,
  clearPasswordChangeFlag,
  submitAccountRequest,
  updateUserLanguage,
  executeAutomationRule,
};
