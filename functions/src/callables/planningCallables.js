const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
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
  ARCHIVE_RESTORE_ALLOWED_ROLES,
} = require('../config/planningConstants');
const { clean, clampText } = require('../utils/text');
const { resolveUserRoleForContext } = require('../auth/resolveUserRole');
const { resolveDbContext } = require('../repositories/planningRepository');
const {
  rejectTrackedProductFinalService,
  archiveRejectedTrackedProductService,
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
  reassignTrackedProductOrderService,
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
  restoreArchivedTrackedProductService,
  reportShopFloorIssueService,
  resolveShopFloorIssueService,
  bulkImportPlanningOrdersService,
  reconcileOrderControlState,
} = require('../services/planningTransitionService');

const { queuePrintJobService } = require('../services/printingService');
const {
  updateUserProfileService,
  clearPasswordChangeFlagService,
  submitAccountRequestService,
  updateUserLanguageService,
} = require('../services/adminService');
const { executeAutomationRuleService } = require('../services/automationService');
const {
  saveProductRecordService,
  deleteProductRecordService,
  verifyProductRecordService,
} = require('../services/productCatalogService');
const {
  upsertConversionRecordService,
  deleteConversionRecordService,
  deleteAllConversionRecordsService,
  upsertConversionBatchService,
} = require('../services/conversionCatalogService');
const { processInforUpdateService } = require('../services/inforSyncService');
const { handleCallableError } = require('../utils/errorHandler');
const { withAudit } = require('../utils/withAudit');
const auditService = require('../services/auditService');
const {
  saveAiContextConfigService,
  createAiDocumentRecordService,
  updateAiDocumentRecordService,
  deleteAiDocumentRecordService,
  verifyAiKnowledgeEntryService,
  deleteAiKnowledgeEntryService,
  migrateAiKnowledgeFieldsService,
} = require('../services/aiAdminService');

const IMPORT_ALLOWED_MODES = new Set(['new_only', 'overwrite', 'smart_update']);
const REFERENCE_OPS_ALLOWED_ROLES = new Set(['admin']);
const REFERENCE_OPS_ALLOWED_TYPES = new Set(['production', 'post', 'qc']);

const extractRds = () => null;

const extractRdsFromSourcePath = () => null;

const resolveRdsForRequest = () => null;

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

const throwUnauthenticated = (context, action) => {
  auditService.logCallableSecurityDenied(context, action, 'UNAUTHENTICATED');
  throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
};

const throwPermissionDenied = (context, action, userRole, message) => {
  auditService.logCallableSecurityDenied(context, action, 'PERMISSION_DENIED', {
    role: userRole || 'unknown',
  });
  throw new functions.https.HttpsError('permission-denied', message);
};

const rejectTrackedProductFinal = withAudit('REJECT_PRODUCT_FINAL', async (data, context) => {
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
    const result = await rejectTrackedProductFinalService({
      productId,
      reasons,
      note,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'REJECT_PRODUCT_FINAL', 
      { productId, before: result.before || null, after: result.after || null }, 
      { category: 'QUALITY', severity: 'CRITICAL' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const tempRejectTrackedProduct = withAudit('TEMP_REJECT_PRODUCT', async (data, context) => {
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
    const result = await tempRejectTrackedProductService({
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
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'TEMP_REJECT_PRODUCT', 
      { productId, before: result?.before || null, after: result?.after || null }, 
      { category: 'QUALITY', severity: 'WARNING' }
    );
    return result;
  } catch (error) {
    const rawMessage = String(error?.message || '').toLowerCase();
    if (rawMessage.includes('document path') || rawMessage.includes('document id') || rawMessage.includes('invalid query')) {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldig productId of documentpad voor annuleren.');
    }

    console.error('cancelTrackedProduction onverwachte fout:', {
      message: error?.message || String(error),
      stack: error?.stack || null,
      productId,
      selectedStation,
      source,
      actorLabel,
    });
    throw error;
  }
});

const advanceTrackedProduct = withAudit('ADVANCE_PRODUCT', async (data, context) => {
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
    const result = await advanceTrackedProductService({
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
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'ADVANCE_PRODUCT', 
      { productId, nextStep, nextStatus, before: result.before || null, after: result.after || null }, 
      { category: 'PRODUCTION', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const completeTrackedProductRepair = withAudit('COMPLETE_REPAIR', async (data, context) => {
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
    const result = await completeTrackedProductRepairService({
      productId,
      station,
      actions,
      note,
      actorLabel,
      source,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'COMPLETE_REPAIR', 
      { productId, before: result?.before || null, after: result?.after || null }, 
      { category: 'QUALITY', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const routeTrackedProductsToLossen = withAudit('ROUTE_TO_LOSSEN', async (data, context) => {
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
    const result = await routeTrackedProductsToLossenService({
      productIds,
      originStation,
      centralStation,
      centralOperators,
      actorLabel,
      source,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'ROUTE_TO_LOSSEN', 
      { productCount: productIds.length, originStation, before: result?.before || null, after: result?.after || null }, 
      { category: 'PRODUCTION', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const startWorkstationProductionRun = withAudit('START_WORKSTATION_PRODUCTION_RUN', async (data, context) => {
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
    const result = await startWorkstationProductionRunService({
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
      userRole,
      dbCtx: resolveDbContext(),
    });
    
    auditService.logCallable(
      context, 
      'START_PRODUCTION_RUN', 
      { orderDocId, stationId, lotStart, stringCount, before: result?.before || null, after: result?.after || null }, 
      { category: 'PRODUCTION', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const toggleTrackedProductPause = withAudit('TOGGLE_TRACKED_PRODUCT_PAUSE', async (data, context) => {
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
    const result = await toggleTrackedProductPauseService({
      productId,
      note,
      actorLabel,
      source,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'TOGGLE_PRODUCT_PAUSE', 
      { productId, before: result?.before || null, after: result?.after || null }, 
      { category: 'PRODUCTION', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const markTrackedProductReminder = withAudit('MARK_TRACKED_PRODUCT_REMINDER', async (data, context) => {
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
    const result = await markTrackedProductReminderService({
      productId,
      reminderSent,
      actorLabel,
      source,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'MARK_PRODUCT_REMINDER', 
      { productId, reminderSent, before: result?.before || null, after: result?.after || null }, 
      { category: 'PRODUCTION', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const moveTrackedProductManual = withAudit('MOVE_TRACKED_PRODUCT_MANUAL', async (data, context) => {
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
    const result = await moveTrackedProductManualService({
      productOrLotId,
      newStation,
      source,
      actorLabel,
      isRepairMove,
      repairInstruction,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'MOVE_PRODUCT_MANUAL', 
      { productOrLotId, newStation, before: result?.before || null, after: result?.after || null }, 
      { category: 'PRODUCTION', severity: 'WARNING' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const archiveRejectedTrackedProduct = withAudit('ARCHIVE_REJECTED_PRODUCT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!MANUAL_MOVE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om afkeur af te sluiten.');
  }

  const productId = clean(data?.productId);
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);

  if (!productId || productId.length > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'Ongeldig productId.');
  }

  try {
    const result = await archiveRejectedTrackedProductService({
      productId,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'ARCHIVE_REJECTED_PRODUCT', 
      { productId, before: result?.before || null, after: result?.after || null }, 
      { category: 'QUALITY', severity: 'WARNING' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const archivePlanningOrder = withAudit('ARCHIVE_ORDER', async (data, context) => {
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
    const result = await archivePlanningOrderService({
      orderDocId,
      requestedReason,
      source,
      auth: context.auth,
      userRole,
      // 'manual' en 'rejected' mogen altijd archiveren, ook als er nog actieve producten zijn.
      allowWithActiveProducts: requestedReason === 'manual' || requestedReason === 'rejected',
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'ARCHIVE_ORDER', 
      { orderDocId, reason: requestedReason, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const completeTrackedProduct = withAudit('COMPLETE_PRODUCT', async (data, context) => {
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
    throw new functions.https.HttpsError('invalid-argument', 'Niet-toegestaan finishType. Gebruik "archive", "forward" of "post_inspection".');
  }

  try {
    const result = await completeTrackedProductService({
      productId,
      finishType,
      fromStation,
      note,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'COMPLETE_PRODUCT', 
      { productId, finishType, before: result?.before || null, after: result?.after || null }, 
      { category: 'QUALITY', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const cancelTrackedProduction = withAudit('CANCEL_TRACKED_PRODUCTION', async (data, context) => {
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
    const result = await cancelTrackedProductionService({
      productId,
      selectedStation,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'CANCEL_PRODUCTION', 
      { productId, selectedStation, before: result?.before || null, after: result?.after || null }, 
      { category: 'PRODUCTION', severity: 'WARNING' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const updatePlanningOrderPriority = withAudit('UPDATE_ORDER_PRIORITY', async (data, context) => {
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
    const result = await updatePlanningOrderPriorityService({
      orderDocId,
      priority: normalizedPriority,
      productDocId,
      actorLabel,
      source,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'UPDATE_ORDER_PRIORITY', 
      { orderDocId, priority: normalizedPriority, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const movePlanningOrder = withAudit('MOVE_PLANNING_ORDER', async (data, context) => {
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
    const result = await movePlanningOrderService({
      orderDocId,
      targetType,
      targetId,
      currentDepartment,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'MOVE_ORDER', 
      { orderDocId, targetType, targetId, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
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
    const result = await retrievePlanningOrderService({
      orderDocId,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'RETRIEVE_ORDER', 
      { orderDocId, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const togglePlanningOrderHold = withAudit('TOGGLE_ORDER_HOLD', async (data, context) => {
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
    const result = await togglePlanningOrderHoldService({
      orderDocId,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'TOGGLE_ORDER_HOLD', 
      { orderDocId, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const updatePlanningOrderDetails = withAudit('UPDATE_ORDER_DETAILS', async (data, context) => {
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
  const rawStarted = data?.started;
  const rawManualTodo = data?.manualTodo;
  const source = clampText(data?.source, 80);
  const actorLabel = clampText(data?.actorLabel, 120);
  const plan = rawPlan === null || rawPlan === undefined || rawPlan === '' ? null : Number(rawPlan);
  const started = rawStarted === null || rawStarted === undefined || rawStarted === '' ? null : Number(rawStarted);
  const manualTodo = rawManualTodo === null || rawManualTodo === undefined || rawManualTodo === '' ? null : Number(rawManualTodo);

  if (!orderDocId) {
    throw new functions.https.HttpsError('invalid-argument', 'orderDocId is verplicht.');
  }

  if (plan !== null && (!Number.isFinite(plan) || plan < 0 || plan > 1000000)) {
    throw new functions.https.HttpsError('invalid-argument', 'plan moet een geldig getal van 0 of hoger zijn.');
  }

  if (started !== null && (!Number.isFinite(started) || started < 0 || started > 1000000)) {
    throw new functions.https.HttpsError('invalid-argument', 'started moet een geldig getal van 0 of hoger zijn.');
  }

  if (manualTodo !== null && (!Number.isFinite(manualTodo) || manualTodo < 0 || manualTodo > 1000000)) {
    throw new functions.https.HttpsError('invalid-argument', 'To do moet een geldig getal van 0 of hoger zijn.');
  }

  try {
    const result = await updatePlanningOrderDetailsService({
      orderDocId,
      notes,
      plan,
      started,
      manualTodo,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'UPDATE_ORDER_DETAILS', 
      { orderDocId, before: result.before || null, after: result.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const patchPlanningOrderMetadata = withAudit('PATCH_ORDER_METADATA', async (data, context) => {
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
    const result = await patchPlanningOrderMetadataService({
      orderDocId,
      patch,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'PATCH_ORDER_METADATA', 
      { orderDocId, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const assignOverproduction = withAudit('ASSIGN_OVERPRODUCTION', async (data, context) => {
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
    const result = await assignOverproductionService({
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
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'ASSIGN_OVERPRODUCTION', 
      { targetOrderDocId, productCount: productIds.length, before: result?.before || null, after: result?.after || null }, 
      { category: 'PRODUCTION', severity: 'WARNING' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const cancelPlanningOrder = withAudit('CANCEL_ORDER', async (data, context) => {
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
    const result = await cancelPlanningOrderService({
      orderDocId,
      reason,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'CANCEL_ORDER', 
      { orderDocId, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'WARNING' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const assignPersonnelToStation = withAudit('ASSIGN_PERSONNEL_TO_STATION', async (data, context) => {
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

  auditService.logCallable(context, 'ASSIGN_PERSONNEL', { stationId, operatorId, date }, { category: 'PRODUCTION', severity: 'INFO' });

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
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    throw error;
  }
});

const removePersonnelAssignment = withAudit('REMOVE_PERSONNEL_ASSIGNMENT', async (data, context) => {
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

  auditService.logCallable(context, 'REMOVE_PERSONNEL', { assignmentId, stationId }, { category: 'PRODUCTION', severity: 'INFO' });

  try {
    return await removePersonnelAssignmentService({
      assignmentId,
      stationId,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const loanPersonnelToDepartment = withAudit('LOAN_PERSONNEL_TO_DEPARTMENT', async (data, context) => {
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

  auditService.logCallable(context, 'LOAN_PERSONNEL', { operatorNumber, targetDepartment, targetStation, date }, { category: 'PRODUCTION', severity: 'INFO' });

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

const saveOccupancyAssignments = withAudit('SAVE_OCCUPANCY_ASSIGNMENTS', async (data, context) => {
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

  auditService.logCallable(context, 'SAVE_OCCUPANCY', { recordCount: records.length }, { category: 'PRODUCTION', severity: 'INFO' });

  try {
    return await saveOccupancyAssignmentsService({
      records,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const deleteOccupancyAssignments = withAudit('DELETE_OCCUPANCY_ASSIGNMENTS', async (data, context) => {
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

  auditService.logCallable(context, 'DELETE_OCCUPANCY', { assignmentCount: assignmentIds.length }, { category: 'PRODUCTION', severity: 'WARNING' });

  try {
    return await deleteOccupancyAssignmentsService({
      assignmentIds,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const savePersonnelRecord = withAudit('SAVE_PERSONNEL_RECORD', async (data, context) => {
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

  auditService.logCallable(context, 'SAVE_PERSONNEL_RECORD', { personId }, { category: 'ADMIN', severity: 'INFO' });

  try {
    return await savePersonnelRecordService({
      personId,
      data: payload,
      source,
      actorLabel,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const createProductionMessages = withAudit('CREATE_PRODUCTION_MESSAGES', async (data, context) => {
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

  auditService.logCallable(context, 'CREATE_PRODUCTION_MESSAGES', { messageCount: messages.length }, { category: 'PRODUCTION', severity: 'INFO' });

  try {
    return await createProductionMessagesService({
      messages,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const transitionPrintQueueJobStatus = withAudit('TRANSITION_PRINT_QUEUE_JOB_STATUS', async (data, context) => {
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

  auditService.logCallable(context, 'TRANSITION_PRINT_JOB', { jobId, status }, { category: 'SYSTEM', severity: 'INFO' });

  try {
    return await transitionPrintQueueJobStatusService({
      jobId,
      status,
      error: errorMessage,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const requeuePrintQueueJob = withAudit('REQUEUE_PRINT_QUEUE_JOB', async (data, context) => {
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

  auditService.logCallable(context, 'REQUEUE_PRINT_JOB', { jobId }, { category: 'SYSTEM', severity: 'INFO' });

  try {
    return await requeuePrintQueueJobService({
      jobId,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const deletePrintQueueJob = withAudit('DELETE_PRINT_JOB', async (data, context) => {
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

  auditService.logCallable(context, 'DELETE_PRINT_JOB', { jobId }, { category: 'ADMIN', severity: 'WARNING' });

  try {
    return await deletePrintQueueJobService({
      jobId,
      source,
      actorLabel,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const startProductionLots = withAudit('START_PRODUCTION_LOTS', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  const isVirtualLot = Boolean(data?.isVirtualLot);
  const virtualReason = clampText(data?.virtualReason, 300);
  const canStartLots = START_PRODUCTION_ALLOWED_ROLES.has(userRole) || (userRole === 'qc' && isVirtualLot);
  if (!canStartLots) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om productie te starten.');
  }
  if (userRole === 'qc' && !isVirtualLot) {
    throw new functions.https.HttpsError('permission-denied', 'QC mag alleen virtuele lots uitgeven.');
  }

  const orderDocId = clean(data?.orderDocId);
  const orderDocPath = clean(data?.orderDocPath);
  const orderSourcePath = clean(data?.orderSourcePath);
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
  const hasOrderLocator = Boolean(orderDocId || orderDocPath || orderSourcePath || orderId);
  if (!hasOrderLocator || !itemCode || !lotStart || !stationId) {
    throw new functions.https.HttpsError('invalid-argument', 'order locator (orderDocId/orderDocPath/orderSourcePath/orderId), itemCode, lotStart en stationId zijn verplicht.');
  }

  if (!Number.isFinite(totalToProduce) || totalToProduce < 1 || totalToProduce > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'totalToProduce moet tussen 1 en 200 liggen.');
  }

  try {
    const result = await startProductionLotsService({
      orderDocId,
      orderDocPath,
      orderSourcePath,
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
      isVirtualLot,
      virtualReason,
      dbCtx: resolveDbContext(),
    });
    
    auditService.logCallable(
      context, 
      'START_PRODUCTION_LOTS', 
      { orderDocId, orderDocPath, orderSourcePath, orderId, stationId, lotStart, totalToProduce, isVirtualLot, before: result?.before || null, after: result?.after || null }, 
      { category: 'PRODUCTION', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    const rawMessage = String(error?.message || '').toLowerCase();
    if (
      rawMessage.includes('document path') ||
      rawMessage.includes('document id') ||
      rawMessage.includes('resource path') ||
      rawMessage.includes('even number of segments')
    ) {
      throw new functions.https.HttpsError('invalid-argument', 'Ongeldig order documentpad of order-id bij productie-start.');
    }

    handleCallableError(error);

    console.error('startProductionLots onverwachte fout:', {
      message: error?.message || String(error),
      stack: error?.stack || null,
      orderDocId,
      orderId,
      stationId,
      totalToProduce,
    });
    throw new functions.https.HttpsError('internal', 'Starten van productie is mislukt.');
  }
});

const editTrackedProductLotNumber = withAudit('EDIT_LOT_NUMBER', async (data, context) => {
  if (!context.auth?.uid) {
    throwUnauthenticated(context, 'EDIT_LOT_NUMBER');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throwPermissionDenied(context, 'EDIT_LOT_NUMBER', userRole, 'Geen rechten om lotnummer te wijzigen.');
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
    const result = await editTrackedProductLotNumberService({
      productId,
      newLotNumber,
      reason,
      actorLabel,
      source,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });

    auditService.logCallable(
      context,
      'EDIT_LOT_NUMBER',
      {
        productId,
        before: result.before || null,
        after: result.after || null,
        reason,
      },
      { category: 'QUALITY', severity: 'WARNING' },
    );

    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const reassignTrackedProductOrder = withAudit('REASSIGN_TRACKED_PRODUCT_ORDER', async (data, context) => {
  if (!context.auth?.uid) {
    throwUnauthenticated(context, 'REASSIGN_TRACKED_PRODUCT_ORDER');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throwPermissionDenied(context, 'REASSIGN_TRACKED_PRODUCT_ORDER', userRole, 'Geen rechten om product-ordernummer te wijzigen.');
  }

  const productId = clean(data?.productId);
  const newOrderId = clean(data?.newOrderId);
  const reason = clampText(data?.reason, 300);
  const actorLabel = clampText(data?.actorLabel, 120);
  const source = clampText(data?.source, 80);

  if (!productId || !newOrderId || !reason) {
    throw new functions.https.HttpsError('invalid-argument', 'productId, newOrderId en reason zijn verplicht.');
  }

  try {
    const result = await reassignTrackedProductOrderService({
      productId,
      newOrderId,
      reason,
      actorLabel,
      source,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });

    auditService.logCallable(
      context,
      'REASSIGN_TRACKED_PRODUCT_ORDER',
      {
        productId,
        before: result.before || null,
        after: result.after || null,
        reason,
      },
      { category: 'PLANNING', severity: 'WARNING' },
    );

    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const linkPlanningOrderProduct = withAudit('LINK_ORDER_PRODUCT', async (data, context) => {
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
    const result = await linkPlanningOrderProductService({
      orderDocId,
      productId,
      productImage,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'LINK_ORDER_PRODUCT', 
      { orderDocId, productId, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const createPlanningOrderManual = withAudit('CREATE_ORDER_MANUAL', async (data, context) => {
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
    const result = await createPlanningOrderManualService({
      orderId,
      item,
      machine,
      plan,
      dbCtx: resolveDbContext(extractRds(data)),
    });
    
    auditService.logCallable(
      context, 
      'CREATE_ORDER_MANUAL', 
      { orderId, machine, before: result?.before || null, after: result?.after || null }, 
      { category: 'PLANNING', severity: 'INFO' }
    );
    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const markMazakLabelsPrinted = withAudit('MARK_LABELS_PRINTED', async (data, context) => {
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

  auditService.logCallable(context, 'MARK_LABELS_PRINTED', { productCount: productIds.length, stationId, isReprint }, { category: 'PRODUCTION', severity: 'INFO' });

  try {
    return await markMazakLabelsPrintedService({
      productIds,
      stationId,
      isReprint,
      actorLabel,
      source,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const appendQcNote = withAudit('APPEND_QC_NOTE', async (data, context) => {
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

  auditService.logCallable(context, 'APPEND_QC_NOTE', { productId }, { category: 'QUALITY', severity: 'INFO' });

  try {
    return await appendQcNoteService({
      productId,
      note,
      archivedYear: Number.isFinite(archivedYear) ? archivedYear : null,
      actorLabel,
      source,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const reserveAutoLotNumberRange = withAudit('RESERVE_AUTO_LOT_NUMBER_RANGE', async (data, context) => {
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

  auditService.logCallable(context, 'RESERVE_LOT_RANGE', { stationId, count }, { category: 'PRODUCTION', severity: 'INFO' });

  try {
    return await reserveAutoLotNumberRangeService({
      stationId,
      count,
      reserve,
      dbCtx: resolveDbContext(),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const addOrderDependency = withAudit('ADD_ORDER_DEPENDENCY', async (data, context) => {
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

  auditService.logCallable(context, 'ADD_ORDER_DEPENDENCY', { orderId, dependencyId }, { category: 'PLANNING', severity: 'INFO' });

  try {
    return await addOrderDependencyService({
        orderId,
        dependencyId,
        dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const removeOrderDependency = withAudit('REMOVE_ORDER_DEPENDENCY', async (data, context) => {
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

  auditService.logCallable(context, 'REMOVE_ORDER_DEPENDENCY', { orderId, dependencyId }, { category: 'PLANNING', severity: 'INFO' });

  try {
    return await removeOrderDependencyService({
        orderId,
        dependencyId,
        dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const updateOrderPlannedDate = withAudit('UPDATE_ORDER_PLANNED_DATE', async (data, context) => {
  if (!context.auth?.uid) {
    throwUnauthenticated(context, 'UPDATE_PLANNED_DATE');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throwPermissionDenied(context, 'UPDATE_PLANNED_DATE', userRole, 'Geen rechten om geplande datum te wijzigen.');
  }

  const orderId = clean(data?.orderId);
  const plannedDateRaw = data?.plannedDate;
  const plannedDate = new Date(plannedDateRaw);

  if (!orderId || !plannedDateRaw || Number.isNaN(plannedDate.getTime())) {
    throw new functions.https.HttpsError('invalid-argument', 'orderId en geldige plannedDate zijn verplicht.');
  }

  try {
    const result = await updateOrderPlannedDateService({
        orderId,
        plannedDate,
        dbCtx: resolveDbContext(extractRds(data)),
    });

    auditService.logCallable(
      context,
      'UPDATE_PLANNED_DATE',
      {
        orderId,
        before: result.before || null,
        after: result.after || null,
      },
      { category: 'PLANNING', severity: 'INFO' },
    );

    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const updateOrderKanbanStatus = withAudit('UPDATE_ORDER_KANBAN_STATUS', async (data, context) => {
  if (!context.auth?.uid) {
    throwUnauthenticated(context, 'UPDATE_KANBAN_STATUS');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throwPermissionDenied(context, 'UPDATE_KANBAN_STATUS', userRole, 'Geen rechten om orderstatus te wijzigen.');
  }

  const orderId = clean(data?.orderId);
  const status = clean(data?.status);

  if (!orderId || !status || status.length > 80) {
    throw new functions.https.HttpsError('invalid-argument', 'orderId en geldige status zijn verplicht.');
  }

  try {
    const result = await updateOrderKanbanStatusService({
        orderId,
        status,
        auth: context.auth,
        dbCtx: resolveDbContext(extractRds(data)),
    });

    auditService.logCallable(
      context,
      'UPDATE_KANBAN_STATUS',
      {
        orderId,
        before: result.before || null,
        after: result.after || null,
      },
      { category: 'PLANNING', severity: 'INFO' },
    );

    return result;
  } catch (error) {
    handleCallableError(error);
  }
});

const markReadyForNextStep = withAudit('MARK_READY_FOR_NEXT_STEP', async (data, context) => {
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

  auditService.logCallable(context, 'MARK_READY_FOR_NEXT_STEP', { productId }, { category: 'PRODUCTION', severity: 'INFO' });

  try {
    return await markReadyForNextStepService({
        productId,
        auth: context.auth,
        dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const startTrackedProductRepair = withAudit('START_TRACKED_PRODUCT_REPAIR', async (data, context) => {
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

  auditService.logCallable(context, 'START_REPAIR', { productId }, { category: 'QUALITY', severity: 'INFO' });

  try {
    return await startTrackedProductRepairService({
      productId,
      repairReason,
      auth: context.auth,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const restoreArchivedTrackedProduct = withAudit('RESTORE_ARCHIVED_TRACKED_PRODUCT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ARCHIVE_RESTORE_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Alleen teamleader/admin mag gearchiveerde producten herstellen.');
  }

  const productId = clean(data?.productId);
  const targetRoute = clean(data?.targetRoute).toUpperCase();
  const note = clampText(data?.note, 600);
  const sourceContext = clean(data?.sourceContext).toUpperCase();

  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'productId is verplicht.');
  }
  if (!['BH31', 'NABEWERKING', 'BM01'].includes(targetRoute)) {
    throw new functions.https.HttpsError('invalid-argument', 'targetRoute moet BH31, NABEWERKING of BM01 zijn.');
  }
  if (sourceContext !== 'TEAMLEADER_FULL_LIST') {
    throw new functions.https.HttpsError('permission-denied', 'Deze actie kan alleen vanuit Teamleader Volledige Lijst.');
  }

  auditService.logCallable(
    context,
    'RESTORE_ARCHIVED_TRACKED_PRODUCT',
    { productId, targetRoute, sourceContext },
    { category: 'QUALITY', severity: 'WARNING' },
  );

  try {
    return await restoreArchivedTrackedProductService({
      productId,
      targetRoute,
      note,
      auth: context.auth,
      userRole,
      dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const reportShopFloorIssue = withAudit('REPORT_SHOP_FLOOR_ISSUE', async (data, context) => {
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

  auditService.logCallable(context, 'REPORT_SHOP_FLOOR_ISSUE', { type, machine: clampText(data?.machine, 120), orderId: clean(data?.orderId) }, { category: 'QUALITY', severity: 'WARNING' });

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

const resolveShopFloorIssue = withAudit('RESOLVE_SHOP_FLOOR_ISSUE', async (data, context) => {
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

  auditService.logCallable(context, 'RESOLVE_SHOP_FLOOR_ISSUE', { type, issueId }, { category: 'QUALITY', severity: 'INFO' });

  try {
    return await resolveShopFloorIssueService({
        type,
        issueId,
        auth: context.auth,
        dbCtx: resolveDbContext(extractRds(data)),
    });
  } catch (error) {
    handleCallableError(error);
  }
});

const importPlanningOrders = withAudit('IMPORT_PLANNING_ORDERS', async (data, context) => {
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

  const hoursOnlyMode = Boolean(data?.hoursOnlyMode);

  const orders = Array.isArray(data?.orders) ? data.orders.slice(0, 1500) : [];
  if (orders.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Minimaal 1 order is verplicht.');
  }

  auditService.logCallable(context, 'IMPORT_PLANNING_ORDERS', { orderCount: orders.length, importMode, hoursOnlyMode }, { category: 'PLANNING', severity: 'INFO' });

  return bulkImportPlanningOrdersService({
    orders,
    importMode,
    hoursOnlyMode,
    dbCtx: resolveDbContext(),
  });
});

const importReferenceOperations = withAudit('IMPORT_REFERENCE_OPERATIONS', async (data, context) => {
  if (!context.auth?.uid) {
    throwUnauthenticated(context, 'IMPORT_REFERENCE_OPERATIONS');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!REFERENCE_OPS_ALLOWED_ROLES.has(userRole)) {
    throwPermissionDenied(context, 'IMPORT_REFERENCE_OPERATIONS', userRole, 'Alleen admins mogen LN stamdata importeren.');
  }

  const rawRecords = Array.isArray(data?.records) ? data.records : [];
  if (!rawRecords.length) {
    throw new functions.https.HttpsError('invalid-argument', 'records is verplicht en mag niet leeg zijn.');
  }
  if (rawRecords.length > 5000) {
    throw new functions.https.HttpsError('invalid-argument', 'Maximaal 5000 records per import.');
  }

  const sanitizedRecords = [];
  const seenCodes = new Set();
  for (const entry of rawRecords) {
    const code = clean(entry?.code);
    if (!code || !/^\d{3,10}$/.test(code)) {
      throw new functions.https.HttpsError('invalid-argument', `Ongeldige refOp code: ${String(entry?.code || '')}`);
    }

    if (seenCodes.has(code)) continue;
    seenCodes.add(code);

    const description = clampText(clean(entry?.description), 200) || code;
    const type = clean(entry?.type).toLowerCase();
    if (!REFERENCE_OPS_ALLOWED_TYPES.has(type)) {
      throw new functions.https.HttpsError('invalid-argument', `Ongeldig type voor ${code}. Verwacht production, post of qc.`);
    }

    const site = clean(entry?.site) || '101';
    if (!(site === '101' || site === '101.0')) {
      throw new functions.https.HttpsError('invalid-argument', `Alleen site 101 is toegestaan. Fout bij ${code}.`);
    }

    const descriptions = Array.isArray(entry?.descriptions)
      ? Array.from(new Set(entry.descriptions.map((value) => clampText(clean(value), 200)).filter(Boolean))).slice(0, 100)
      : [];
    const workCenters = Array.isArray(entry?.workCenters)
      ? Array.from(new Set(entry.workCenters.map((value) => clampText(clean(value), 80)).filter(Boolean))).slice(0, 100)
      : [];

    sanitizedRecords.push({
      code,
      description,
      descriptions,
      type,
      site: '101',
      workCenters,
      updatedAt: new Date().toISOString(),
      updatedBy: context.auth.uid,
    });
  }

  const refOpsCol = admin.firestore().collection('future-factory/settings/reference_operations');
  const existingSnap = await refOpsCol.get();
  const existingCodes = new Set(existingSnap.docs.map((doc) => doc.id));

  const BATCH_SIZE = 450;
  let written = 0;
  let skipped = 0;

  for (let i = 0; i < sanitizedRecords.length; i += BATCH_SIZE) {
    const batch = admin.firestore().batch();
    const chunk = sanitizedRecords.slice(i, i + BATCH_SIZE);
    chunk.forEach((record) => {
      const docRef = refOpsCol.doc(record.code);
      batch.set(docRef, record, { merge: false });
      if (existingCodes.has(record.code)) skipped += 1;
      else written += 1;
    });
    await batch.commit();
  }

  auditService.logCallable(
    context,
    'IMPORT_REFERENCE_OPERATIONS',
    {
      total: sanitizedRecords.length,
      written,
      overwritten: skipped,
      site: '101',
    },
    { category: 'ADMIN', severity: 'WARNING' },
  );

  return {
    ok: true,
    written: sanitizedRecords.length,
    inserted: written,
    overwritten: skipped,
  };
});

const queuePrintJob = withAudit('PRINT_JOB', async (data, context) => {
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

  const orderId = clean(metadata?.orderId || metadata?.productionOrder || metadata?.jobId || '');
  const quantity = Number(metadata?.quantity ?? metadata?.copies ?? 1);

  try {
    const jobId = await queuePrintJobService(printerId, zplData, metadata, context);

    auditService.logCallable(
      context,
      'PRINT_JOB',
      {
        jobId,
        printerId,
        orderId: orderId || null,
        quantity: Number.isFinite(quantity) ? quantity : null,
      },
      { category: 'SYSTEM', severity: 'INFO' }
    );

    return jobId;
  } catch (error) {
    auditService.logCallable(
      context,
      'PRINT_JOB_FAILED',
      {
        printerId,
        orderId: orderId || null,
        quantity: Number.isFinite(quantity) ? quantity : null,
        errorCode: clean(error?.code) || 'unknown',
        errorMessage: clean(error?.message) || 'PRINT_JOB_FAILED',
      },
      { category: 'SYSTEM', severity: 'WARNING' }
    );
    throw error;
  }
});

const updateUserProfile = withAudit('UPDATE_USER_PROFILE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const profileData = (typeof data?.profileData === 'object' && data.profileData) || {};
  
  if (!profileData.name || !profileData.language) {
    throw new functions.https.HttpsError('invalid-argument', 'name en language zijn verplicht.');
  }

  auditService.logCallable(context, 'UPDATE_USER_PROFILE', { targetUid: context.auth.uid }, { category: 'ADMIN', severity: 'INFO' });

  return updateUserProfileService(context.auth.uid, profileData);
});

const clearPasswordChangeFlag = withAudit('CLEAR_PASSWORD_FLAG', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  auditService.logCallable(context, 'CLEAR_PASSWORD_FLAG', { targetUid: context.auth.uid }, { category: 'ADMIN', severity: 'INFO' });

  return clearPasswordChangeFlagService(context.auth.uid);
});

const submitAccountRequest = withAudit('SUBMIT_ACCOUNT_REQUEST', async (data, context) => {
  const requestData = (typeof data?.requestData === 'object' && data.requestData) || {};

  if (!requestData.name || !requestData.email) {
    throw new functions.https.HttpsError('invalid-argument', 'Naam en e-mailadres zijn verplicht.');
  }

  auditService.logCallable(context, 'SUBMIT_ACCOUNT_REQUEST', { email: requestData.email }, { category: 'SECURITY', severity: 'INFO' });

  return submitAccountRequestService(requestData);
});

const updateUserLanguage = withAudit('UPDATE_USER_LANGUAGE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const language = clean(data?.language);

  if (!language) {
    throw new functions.https.HttpsError('invalid-argument', 'language is verplicht.');
  }

  auditService.logCallable(context, 'UPDATE_USER_LANGUAGE', { language }, { category: 'ADMIN', severity: 'INFO' });

  return updateUserLanguageService(context.auth.uid, language);
});

const executeAutomationRule = withAudit('EXECUTE_AUTOMATION_RULE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const rule = (typeof data?.rule === 'object' && data.rule) || null;
  if (!rule) {
    throw new functions.https.HttpsError('invalid-argument', 'rule is verplicht.');
  }

  auditService.logCallable(context, 'EXECUTE_AUTOMATION_RULE', { ruleId: rule?.id || 'unknown' }, { category: 'SYSTEM', severity: 'WARNING' });

  return executeAutomationRuleService(rule);
});

const updateProductionStandard = withAudit('UPDATE_PRODUCTION_STANDARD', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om productietijdstandaarden bij te werken.');
  }

  const standardId = clean(data?.standardId);
  const standardMinutes = Number(data?.standardMinutes);
  const autoLearning = (typeof data?.autoLearning === 'object' && data.autoLearning) || null;

  if (!standardId) {
    throw new functions.https.HttpsError('invalid-argument', 'standardId is verplicht.');
  }
  if (!Number.isFinite(standardMinutes) || standardMinutes <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'standardMinutes moet een positief getal zijn.');
  }

  const { db } = require('../config/firebase');
  const dbCtx = resolveDbContext();
  const docRef = db.doc(`${dbCtx.standardsPath}/${standardId}`);

  const before = await docRef.get().then((snap) => snap.exists ? snap.data() : null);

  const patch = {
    standardMinutes,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(autoLearning ? { autoLearning } : {}),
  };

  await docRef.set(patch, { merge: true });

  auditService.logCallable(
    context,
    'UPDATE_PRODUCTION_STANDARD',
    { standardId, standardMinutes, before, after: patch },
    { category: 'PRODUCTION', severity: 'INFO' }
  );

  return { ok: true, standardId, standardMinutes };
});

const saveProductRecord = withAudit('SAVE_PRODUCT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om producten te bewerken.');
  }

  const productId = clean(data?.productId);
  const productData = (typeof data?.productData === 'object' && data.productData) || {};
  const clearVerification = data?.clearVerification === true;

  auditService.logCallable(context, 'SAVE_PRODUCT', { productId }, { category: 'ADMIN', severity: 'INFO' });

  return saveProductRecordService({
    productId,
    productData,
    actorUid: context.auth.uid,
    clearVerification,
  });
});

const deleteProductRecord = withAudit('DELETE_PRODUCT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om producten te verwijderen.');
  }

  const productId = clean(data?.productId);

  auditService.logCallable(context, 'DELETE_PRODUCT', { productId }, { category: 'ADMIN', severity: 'WARNING' });

  return deleteProductRecordService({ productId });
});

const verifyProductRecord = withAudit('VERIFY_PRODUCT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om producten te verifiëren.');
  }

  const productId = clean(data?.productId);
  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'productId is verplicht.');
  }

  const actorName = clean(data?.actorName) || clean(context.auth?.token?.name) || clean(context.auth?.token?.email);

  auditService.logCallable(context, 'VERIFY_PRODUCT', { productId }, { category: 'QUALITY', severity: 'INFO' });

  return verifyProductRecordService({
    productId,
    actor: {
      uid: context.auth.uid,
      name: actorName,
      email: clean(context.auth?.token?.email),
    },
    isAdmin: userRole === 'admin',
  });
});

const upsertConversionRecord = withAudit('UPSERT_CONVERSION', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om conversies te bewerken.');
  }

  const recordId = clean(data?.recordId);
  const recordData = (typeof data?.recordData === 'object' && data.recordData) || {};

  auditService.logCallable(context, 'UPSERT_CONVERSION', { recordId }, { category: 'ADMIN', severity: 'INFO' });

  return upsertConversionRecordService({
    recordId,
    recordData,
    actorLabel: clean(context.auth?.token?.email) || context.auth.uid,
  });
});

const deleteConversionRecord = withAudit('DELETE_CONVERSION', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om conversies te verwijderen.');
  }

  const recordId = clean(data?.recordId);

  auditService.logCallable(context, 'DELETE_CONVERSION', { recordId }, { category: 'ADMIN', severity: 'WARNING' });

  return deleteConversionRecordService({ recordId });
});

const deleteAllConversionRecords = withAudit('DELETE_ALL_CONVERSIONS', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (userRole !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Alleen admins kunnen alle conversies verwijderen.');
  }

  auditService.logCallable(context, 'DELETE_ALL_CONVERSIONS', {}, { category: 'ADMIN', severity: 'CRITICAL' });

  return deleteAllConversionRecordsService();
});

const upsertConversionBatch = withAudit('UPSERT_CONVERSION_BATCH', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om conversies te importeren.');
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  const mode = clean(data?.mode || 'merge');

  auditService.logCallable(context, 'UPSERT_CONVERSION_BATCH', { itemCount: items.length, mode }, { category: 'ADMIN', severity: 'INFO' });

  return upsertConversionBatchService({
    items,
    mode,
    actorLabel: clean(context.auth?.token?.email) || context.auth.uid,
  });
});

const processInforUpdate = withAudit('PROCESS_INFOR_UPDATE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om Infor sync uit te voeren.');
  }

  const csvData = Array.isArray(data?.csvData) ? data.csvData : [];
  if (!csvData.length) {
    throw new functions.https.HttpsError('invalid-argument', 'csvData is verplicht.');
  }

  auditService.logCallable(context, 'PROCESS_INFOR_UPDATE', { rowCount: csvData.length }, { category: 'PLANNING', severity: 'INFO' });

  return processInforUpdateService(csvData);
});

const saveAiContextConfig = withAudit('SAVE_AI_CONFIG', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om AI configuratie te wijzigen.');
  }

  const systemPrompt = String(data?.systemPrompt || '');

  auditService.logCallable(context, 'SAVE_AI_CONFIG', {}, { category: 'ADMIN', severity: 'WARNING' });

  return saveAiContextConfigService({
    systemPrompt,
    actorEmail: clean(context.auth?.token?.email),
  });
});

const createAiDocumentRecord = withAudit('CREATE_AI_DOCUMENT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om AI documenten te uploaden.');
  }

  const payload = (typeof data?.payload === 'object' && data.payload) || {};

  auditService.logCallable(context, 'CREATE_AI_DOCUMENT', {}, { category: 'ADMIN', severity: 'INFO' });

  return createAiDocumentRecordService({
    payload,
    actorEmail: clean(context.auth?.token?.email),
  });
});

const updateAiDocumentRecord = withAudit('UPDATE_AI_DOCUMENT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om AI documenten te wijzigen.');
  }

  const docId = clean(data?.docId);
  const patch = (typeof data?.patch === 'object' && data.patch) || {};

  auditService.logCallable(context, 'UPDATE_AI_DOCUMENT', { docId }, { category: 'ADMIN', severity: 'INFO' });

  return updateAiDocumentRecordService({ docId, patch });
});

const deleteAiDocumentRecord = withAudit('DELETE_AI_DOCUMENT', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om AI documenten te verwijderen.');
  }

  const docId = clean(data?.docId);

  auditService.logCallable(context, 'DELETE_AI_DOCUMENT', { docId }, { category: 'ADMIN', severity: 'WARNING' });

  return deleteAiDocumentRecordService({ docId });
});

const verifyAiKnowledgeEntry = withAudit('VERIFY_AI_KNOWLEDGE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om AI training te valideren.');
  }

  const entryId = clean(data?.entryId);
  const correctedAnswer = data?.correctedAnswer || null;

  auditService.logCallable(context, 'VERIFY_AI_KNOWLEDGE', { entryId }, { category: 'ADMIN', severity: 'INFO' });

  return verifyAiKnowledgeEntryService({
    entryId,
    correctedAnswer,
    actorEmail: clean(context.auth?.token?.email),
  });
});

const deleteAiKnowledgeEntry = withAudit('DELETE_AI_KNOWLEDGE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (!ORDER_EDIT_ALLOWED_ROLES.has(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Geen rechten om AI training entries te verwijderen.');
  }

  const entryId = clean(data?.entryId);

  auditService.logCallable(context, 'DELETE_AI_KNOWLEDGE', { entryId }, { category: 'ADMIN', severity: 'WARNING' });

  return deleteAiKnowledgeEntryService({ entryId });
});

const migrateAiKnowledgeFields = withAudit('MIGRATE_AI_KNOWLEDGE', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (userRole !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Alleen admins mogen AI kennis migratie uitvoeren.');
  }

  auditService.logCallable(context, 'MIGRATE_AI_KNOWLEDGE', {}, { category: 'ADMIN', severity: 'CRITICAL' });

  return migrateAiKnowledgeFieldsService();
});

const migrateLegacyActivityLogs = withAudit('MIGRATE_LEGACY_ACTIVITY_LOGS', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  const userRole = await resolveUserRoleForContext(context);
  if (userRole !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Alleen admins mogen legacy logs migreren.');
  }

  const dryRun = Boolean(data?.dryRun);
  const deleteSource = Boolean(data?.deleteSource);
  const markSourceMigrated = data?.markSourceMigrated !== false;
  const limit = Math.min(Math.max(Number(data?.limit) || 500, 1), 2000);
  const maxScan = Math.min(Math.max(Number(data?.maxScan) || 5000, 100), 20000);
  const pageSize = Math.min(Math.max(Number(data?.pageSize) || 250, 50), 500);

  const sourceRef = admin.firestore()
    .collection('future-factory')
    .doc('logs')
    .collection('activity_logs');
  const targetRef = admin.firestore()
    .collection('future-factory')
    .doc('audit')
    .collection('logs');

  let scanned = 0;
  let migrated = 0;
  let skipped = 0;
  let deleted = 0;
  let cursor = null;
  let reachedEnd = false;

  while (scanned < maxScan && migrated < limit) {
    let q = sourceRef
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize);

    if (cursor) {
      q = q.startAfter(cursor);
    }

    const snapshot = await q.get();
    if (snapshot.empty) {
      reachedEnd = true;
      break;
    }

    for (const docSnap of snapshot.docs) {
      scanned += 1;

      const oldData = docSnap.data() || {};
      const targetId = `legacy_${docSnap.id}`;
      const existingTarget = await targetRef.doc(targetId).get();

      const now = new Date();
      const legacyDate = (() => {
        const value = oldData.timestamp;
        if (!value) return now;
        if (typeof value.toDate === 'function') {
          const parsed = value.toDate();
          return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : now;
        }
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? now : parsed;
      })();
      const year = legacyDate.getUTCFullYear();
      const month = legacyDate.getUTCMonth() + 1;
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

      const detailsMessage = typeof oldData.details === 'string'
        ? oldData.details
        : clampText(JSON.stringify(oldData.details || {}), 4000);

      const mappedEntry = {
        timestamp: oldData.timestamp || admin.firestore.FieldValue.serverTimestamp(),
        userId: clean(oldData.userId) || 'legacy',
        userEmail: clean(oldData.userEmail) || null,
        action: clean(oldData.action) || 'LEGACY_ACTIVITY_LOG',
        category: 'SYSTEM',
        severity: String(oldData.status || '').toUpperCase() === 'FAILED' ? 'WARNING' : 'INFO',
        year,
        month,
        yearMonth,
        details: {
          legacy: true,
          legacyPath: 'future-factory/logs/activity_logs',
          legacyLogId: docSnap.id,
          message: detailsMessage || null,
          source: clean(oldData.source) || null,
          ipAddress: clean(oldData.ipAddress) || null,
          status: clean(oldData.status) || null,
          changes: oldData.changes || null,
        },
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        migratedBy: context.auth.uid,
      };

      if (!existingTarget.exists) {
        migrated += 1;
        if (!dryRun) {
          await targetRef.doc(targetId).set(mappedEntry, { merge: true });
        }
      } else {
        skipped += 1;
      }

      if (!dryRun && deleteSource) {
        await docSnap.ref.delete();
        deleted += 1;
      }

      if (!dryRun && !deleteSource && markSourceMigrated) {
        await docSnap.ref.set(
          {
            migratedToAudit: true,
            migratedToAuditAt: admin.firestore.FieldValue.serverTimestamp(),
            migratedAuditId: targetId,
          },
          { merge: true },
        );
      }

      if (scanned >= maxScan || migrated >= limit) {
        break;
      }
    }

    cursor = snapshot.docs[snapshot.docs.length - 1];
  }

  auditService.logCallable(
    context,
    'MIGRATE_LEGACY_ACTIVITY_LOGS',
    {
      dryRun,
      deleteSource,
      markSourceMigrated,
      limit,
      maxScan,
      scanned,
      migrated,
      skipped,
      deleted,
      reachedEnd,
    },
    { category: 'ADMIN', severity: dryRun ? 'INFO' : 'WARNING' },
  );

  return {
    ok: true,
    dryRun,
    scanned,
    migrated,
    skipped,
    deleted,
    reachedEnd,
    hasMore: !reachedEnd,
  };
});

/**
 * Reconcileert de control events in production/events met tracked_products
 * en de planning-teller voor een order+machine combinatie.
 *
 * Input: { orderId: string, machine: string }
 * Output: { ok, orderId, machine, eventLots, trackedLots, planningCounter, discrepancies }
 */
const reconcileOrderControl = functions.https.onCall(async (data, context) => {
  const auth = context?.auth;
  if (!auth?.uid) throw new Error('UNAUTHENTICATED');

  const { resolveDbContext } = require('../repositories/planningRepository');
  const ctx = resolveDbContext();

  const orderId = String(data?.orderId || '').trim();
  const machine = String(data?.machine || '').trim();

  if (!orderId || !machine) {
    throw new Error('INVALID_PARAMS');
  }

  return reconcileOrderControlState({ ctx, orderId, machine });
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
  archiveRejectedTrackedProduct,
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
  reassignTrackedProductOrder,
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
  restoreArchivedTrackedProduct,
  reportShopFloorIssue,
  resolveShopFloorIssue,
  importPlanningOrders,
  importReferenceOperations,
  queuePrintJob,
  updateUserProfile,
  clearPasswordChangeFlag,
  submitAccountRequest,
  updateUserLanguage,
  executeAutomationRule,
  updateProductionStandard,
  saveProductRecord,
  deleteProductRecord,
  verifyProductRecord,
  upsertConversionRecord,
  deleteConversionRecord,
  deleteAllConversionRecords,
  upsertConversionBatch,
  processInforUpdate,
  saveAiContextConfig,
  createAiDocumentRecord,
  updateAiDocumentRecord,
  deleteAiDocumentRecord,
  verifyAiKnowledgeEntry,
  deleteAiKnowledgeEntry,
  migrateAiKnowledgeFields,
  migrateLegacyActivityLogs,
  reconcileOrderControl,
};
