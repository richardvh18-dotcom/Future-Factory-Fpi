import { getFunctions, httpsCallable } from "firebase/functions";
import app from "../config/firebase";

const functions = getFunctions(app);
const rejectTrackedProductFinalCallable = httpsCallable(functions, "rejectTrackedProductFinal");
const tempRejectTrackedProductCallable = httpsCallable(functions, "tempRejectTrackedProduct");
const advanceTrackedProductCallable = httpsCallable(functions, "advanceTrackedProduct");
const completeTrackedProductRepairCallable = httpsCallable(functions, "completeTrackedProductRepair");
const routeTrackedProductsToLossenCallable = httpsCallable(functions, "routeTrackedProductsToLossen");
const startWorkstationProductionRunCallable = httpsCallable(functions, "startWorkstationProductionRun");
const toggleTrackedProductPauseCallable = httpsCallable(functions, "toggleTrackedProductPause");
const markTrackedProductReminderCallable = httpsCallable(functions, "markTrackedProductReminder");
const moveTrackedProductManualCallable = httpsCallable(functions, "moveTrackedProductManual");
const cancelTrackedProductionCallable = httpsCallable(functions, "cancelTrackedProduction");
const updatePlanningOrderPriorityCallable = httpsCallable(functions, "updatePlanningOrderPriority");
const movePlanningOrderCallable = httpsCallable(functions, "movePlanningOrder");
const retrievePlanningOrderCallable = httpsCallable(functions, "retrievePlanningOrder");
const togglePlanningOrderHoldCallable = httpsCallable(functions, "togglePlanningOrderHold");
const updatePlanningOrderDetailsCallable = httpsCallable(functions, "updatePlanningOrderDetails");
const patchPlanningOrderMetadataCallable = httpsCallable(functions, "patchPlanningOrderMetadata");
const assignOverproductionCallable = httpsCallable(functions, "assignOverproduction");
const cancelPlanningOrderCallable = httpsCallable(functions, "cancelPlanningOrder");
const assignPersonnelToStationCallable = httpsCallable(functions, "assignPersonnelToStation");
const removePersonnelAssignmentCallable = httpsCallable(functions, "removePersonnelAssignment");
const loanPersonnelToDepartmentCallable = httpsCallable(functions, "loanPersonnelToDepartment");
const saveOccupancyAssignmentsCallable = httpsCallable(functions, "saveOccupancyAssignments");
const deleteOccupancyAssignmentsCallable = httpsCallable(functions, "deleteOccupancyAssignments");
const savePersonnelRecordCallable = httpsCallable(functions, "savePersonnelRecord");
const createProductionMessagesCallable = httpsCallable(functions, "createProductionMessages");
const transitionPrintQueueJobStatusCallable = httpsCallable(functions, "transitionPrintQueueJobStatus");
const requeuePrintQueueJobCallable = httpsCallable(functions, "requeuePrintQueueJob");
const deletePrintQueueJobCallable = httpsCallable(functions, "deletePrintQueueJob");
const startProductionLotsCallable = httpsCallable(functions, "startProductionLots");
const editTrackedProductLotNumberCallable = httpsCallable(functions, "editTrackedProductLotNumber");
const linkPlanningOrderProductCallable = httpsCallable(functions, "linkPlanningOrderProduct");
const createPlanningOrderManualCallable = httpsCallable(functions, "createPlanningOrderManual");
const markMazakLabelsPrintedCallable = httpsCallable(functions, "markMazakLabelsPrinted");
const appendQcNoteCallable = httpsCallable(functions, "appendQcNote");
const reserveAutoLotNumberRangeCallable = httpsCallable(functions, "reserveAutoLotNumberRange");
const addOrderDependencyCallable = httpsCallable(functions, "addOrderDependency");
const removeOrderDependencyCallable = httpsCallable(functions, "removeOrderDependency");
const updateOrderPlannedDateCallable = httpsCallable(functions, "updateOrderPlannedDate");
const updateOrderKanbanStatusCallable = httpsCallable(functions, "updateOrderKanbanStatus");
const markReadyForNextStepCallable = httpsCallable(functions, "markReadyForNextStep");
const startTrackedProductRepairCallable = httpsCallable(functions, "startTrackedProductRepair");
const reportShopFloorIssueCallable = httpsCallable(functions, "reportShopFloorIssue");
const resolveShopFloorIssueCallable = httpsCallable(functions, "resolveShopFloorIssue");
const importPlanningOrdersCallable = httpsCallable(functions, "importPlanningOrders");
const queuePrintJobCallable = httpsCallable(functions, "queuePrintJob");
const updateUserProfileCallable = httpsCallable(functions, "updateUserProfile");
const clearPasswordChangeFlagCallable = httpsCallable(functions, "clearPasswordChangeFlag");
const submitAccountRequestCallable = httpsCallable(functions, "submitAccountRequest");
const updateUserLanguageCallable = httpsCallable(functions, "updateUserLanguage");
const executeAutomationRuleCallable = httpsCallable(functions, "executeAutomationRule");

export const rejectTrackedProductFinal = async ({
  productId,
  reasons = [],
  note = "",
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    productId: String(productId || "").trim(),
    reasons: Array.isArray(reasons) ? reasons : [],
    note: String(note || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.productId) {
    throw new Error("productId is verplicht.");
  }

  if (!payload.reasons.length) {
    throw new Error("Minimaal 1 afkeurreden is verplicht.");
  }

  const result = await rejectTrackedProductFinalCallable(payload);
  return result?.data || { ok: false };
};

export const tempRejectTrackedProduct = async ({
  productId,
  reasons = [],
  note = "",
  station = "",
  actorLabel = "",
  previousStep = "",
  previousStatus = "",
  source = "",
}) => {
  const payload = {
    productId: String(productId || "").trim(),
    reasons: Array.isArray(reasons) ? reasons : [],
    note: String(note || "").trim(),
    station: String(station || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
    previousStep: String(previousStep || "").trim(),
    previousStatus: String(previousStatus || "").trim(),
    source: String(source || "").trim(),
  };

  if (!payload.productId) {
    throw new Error("productId is verplicht.");
  }

  if (!payload.reasons.length) {
    throw new Error("Minimaal 1 afkeurreden is verplicht.");
  }

  const result = await tempRejectTrackedProductCallable(payload);
  return result?.data || { ok: false };
};

export const advanceTrackedProduct = async ({
  productId,
  nextStation = "",
  nextStep,
  nextStatus,
  lastStation = "",
  note = "",
  actorLabel = "",
  previousStep = "",
  historyAction = "",
  historyDetails = "",
  clearManualMove = false,
  measurements = null,
  source = "",
}) => {
  const payload = {
    productId: String(productId || "").trim(),
    nextStation: String(nextStation || "").trim(),
    nextStep: String(nextStep || "").trim(),
    nextStatus: String(nextStatus || "").trim(),
    lastStation: String(lastStation || "").trim(),
    note: String(note || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
    previousStep: String(previousStep || "").trim(),
    historyAction: String(historyAction || "").trim(),
    historyDetails: String(historyDetails || "").trim(),
    clearManualMove: Boolean(clearManualMove),
    measurements: measurements && typeof measurements === "object" ? measurements : null,
    source: String(source || "").trim(),
  };

  if (!payload.productId || !payload.nextStep || !payload.nextStatus) {
    throw new Error("productId, nextStep en nextStatus zijn verplicht.");
  }

  const result = await advanceTrackedProductCallable(payload);
  return result?.data || { ok: false };
};

export const completeTrackedProductRepair = async ({
  productId,
  station = "",
  actions = [],
  note = "",
  actorLabel = "",
  source = "",
}) => {
  const payload = {
    productId: String(productId || "").trim(),
    station: String(station || "").trim(),
    actions: Array.isArray(actions) ? actions.map((entry) => String(entry || "").trim()).filter(Boolean) : [],
    note: String(note || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
    source: String(source || "").trim(),
  };

  if (!payload.productId) {
    throw new Error("productId is verplicht.");
  }

  const result = await completeTrackedProductRepairCallable(payload);
  return result?.data || { ok: false };
};

export const routeTrackedProductsToLossen = async ({
  productIds,
  originStation = "",
  centralStation = "LOSSEN",
  centralOperators = [],
  actorLabel = "",
  source = "",
}) => {
  const payload = {
    productIds: Array.isArray(productIds) ? productIds.map((entry) => String(entry || "").trim()).filter(Boolean) : [],
    originStation: String(originStation || "").trim(),
    centralStation: String(centralStation || "").trim(),
    centralOperators: Array.isArray(centralOperators) ? centralOperators.map((entry) => String(entry || "").trim()).filter(Boolean) : [],
    actorLabel: String(actorLabel || "").trim(),
    source: String(source || "").trim(),
  };

  if (payload.productIds.length === 0) {
    throw new Error("productIds is verplicht.");
  }

  const result = await routeTrackedProductsToLossenCallable(payload);
  return result?.data || { ok: false };
};

export const startWorkstationProductionRun = async ({
  orderDocId,
  lotStart,
  stringCount,
  stationId,
  actorLabel = "",
  labelZplData = "",
  labelTemplateId = "",
  seriesGroupId = "",
  isFlangeSeries = false,
  stationOperators = [],
  source = "",
}) => {
  const payload = {
    orderDocId: String(orderDocId || "").trim(),
    lotStart: String(lotStart || "").trim(),
    stringCount: Number(stringCount),
    stationId: String(stationId || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
    labelZplData: typeof labelZplData === "string" ? labelZplData : "",
    labelTemplateId: String(labelTemplateId || "").trim(),
    seriesGroupId: String(seriesGroupId || "").trim(),
    isFlangeSeries: Boolean(isFlangeSeries),
    stationOperators: Array.isArray(stationOperators)
      ? stationOperators.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [],
    source: String(source || "").trim(),
  };

  if (!payload.orderDocId || !payload.lotStart || !payload.stationId || !Number.isFinite(payload.stringCount) || payload.stringCount < 1) {
    throw new Error("orderDocId, lotStart, stationId en geldige stringCount zijn verplicht.");
  }

  const result = await startWorkstationProductionRunCallable(payload);
  return result?.data || { ok: false };
};

export const toggleTrackedProductPause = async ({
  productId,
  note = "",
  actorLabel = "",
  source = "",
}) => {
  const payload = {
    productId: String(productId || "").trim(),
    note: String(note || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
    source: String(source || "").trim(),
  };

  if (!payload.productId) {
    throw new Error("productId is verplicht.");
  }

  const result = await toggleTrackedProductPauseCallable(payload);
  return result?.data || { ok: false };
};

export const markTrackedProductReminder = async ({
  productId,
  reminderSent = true,
  actorLabel = "",
  source = "",
}) => {
  const payload = {
    productId: String(productId || "").trim(),
    reminderSent: reminderSent !== false,
    actorLabel: String(actorLabel || "").trim(),
    source: String(source || "").trim(),
  };

  if (!payload.productId) {
    throw new Error("productId is verplicht.");
  }

  const result = await markTrackedProductReminderCallable(payload);
  return result?.data || { ok: false };
};

export const moveTrackedProductManual = async ({
  productOrLotId,
  newStation,
  isRepairMove = false,
  repairInstruction = "",
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    productOrLotId: String(productOrLotId || "").trim(),
    newStation: String(newStation || "").trim(),
    isRepairMove: Boolean(isRepairMove),
    repairInstruction: String(repairInstruction || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.productOrLotId) {
    throw new Error("productOrLotId is verplicht.");
  }

  if (!payload.newStation) {
    throw new Error("newStation is verplicht.");
  }

  const result = await moveTrackedProductManualCallable(payload);
  return result?.data || { ok: false };
};

const completeTrackedProductCallable = httpsCallable(functions, "completeTrackedProduct");

export const completeTrackedProduct = async ({
  productId,
  finishType,
  fromStation = "",
  note = "",
  actorLabel = "",
  source = "",
}) => {
  const payload = {
    productId: String(productId || "").trim(),
    finishType: String(finishType || "").trim(),
    fromStation: String(fromStation || "").trim(),
    note: String(note || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
    source: String(source || "").trim(),
  };

  if (!payload.productId) {
    throw new Error("productId is verplicht.");
  }

  if (!["archive", "forward"].includes(payload.finishType)) {
    throw new Error('finishType moet "archive" of "forward" zijn.');
  }

  const result = await completeTrackedProductCallable(payload);
  return result?.data || { ok: false };
};

export const cancelTrackedProduction = async ({
  productId,
  selectedStation = "",
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    productId: String(productId || "").trim(),
    selectedStation: String(selectedStation || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.productId) {
    throw new Error("productId is verplicht.");
  }

  const result = await cancelTrackedProductionCallable(payload);
  return result?.data || { ok: false };
};

export const updatePlanningOrderPriority = async ({
  orderDocId,
  priority,
  productDocId = "",
  source = "",
  actorLabel = "",
}) => {
  const normalizedPriority = priority === false ? false : String(priority || "").trim().toLowerCase();
  const payload = {
    orderDocId: String(orderDocId || "").trim(),
    priority: normalizedPriority,
    productDocId: String(productDocId || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.orderDocId) {
    throw new Error("orderDocId is verplicht.");
  }

  if (!(payload.priority === false || ["high", "urgent", "immediate"].includes(payload.priority))) {
    throw new Error('priority moet "high", "urgent", "immediate" of false zijn.');
  }

  const result = await updatePlanningOrderPriorityCallable(payload);
  return result?.data || { ok: false };
};

export const movePlanningOrder = async ({
  orderDocId,
  targetType,
  targetId,
  currentDepartment = "",
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    orderDocId: String(orderDocId || "").trim(),
    targetType: String(targetType || "").trim().toLowerCase(),
    targetId: String(targetId || "").trim(),
    currentDepartment: String(currentDepartment || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.orderDocId || !payload.targetId || !["department", "station"].includes(payload.targetType)) {
    throw new Error("orderDocId, targetType en targetId zijn verplicht.");
  }

  const result = await movePlanningOrderCallable(payload);
  return result?.data || { ok: false };
};

export const retrievePlanningOrder = async ({
  orderDocId,
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    orderDocId: String(orderDocId || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.orderDocId) {
    throw new Error("orderDocId is verplicht.");
  }

  const result = await retrievePlanningOrderCallable(payload);
  return result?.data || { ok: false };
};

export const togglePlanningOrderHold = async ({
  orderDocId,
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    orderDocId: String(orderDocId || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.orderDocId) {
    throw new Error("orderDocId is verplicht.");
  }

  const result = await togglePlanningOrderHoldCallable(payload);
  return result?.data || { ok: false };
};

export const updatePlanningOrderDetails = async ({
  orderDocId,
  notes = "",
  plan = null,
  source = "",
  actorLabel = "",
}) => {
  const normalizedPlan = plan === null || plan === undefined || plan === "" ? null : Number(plan);
  const payload = {
    orderDocId: String(orderDocId || "").trim(),
    notes: String(notes || "").trim(),
    plan: normalizedPlan,
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.orderDocId) {
    throw new Error("orderDocId is verplicht.");
  }

  if (payload.plan !== null && (!Number.isFinite(payload.plan) || payload.plan < 0)) {
    throw new Error("plan moet een geldig getal van 0 of hoger zijn.");
  }

  const result = await updatePlanningOrderDetailsCallable(payload);
  return result?.data || { ok: false };
};

export const patchPlanningOrderMetadata = async ({
  orderDocId,
  patch,
  source = "",
  actorLabel = "",
}) => {
  const safeOrderDocId = String(orderDocId || "").trim();
  if (!safeOrderDocId) {
    throw new Error("orderDocId is verplicht.");
  }

  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("patch is verplicht.");
  }

  const result = await patchPlanningOrderMetadataCallable({
    orderDocId: safeOrderDocId,
    patch,
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  });

  return result?.data || { ok: false };
};

export const assignOverproduction = async ({
  targetOrderDocId,
  targetOrderId,
  productIds,
  routeStation,
  sourceOrderId = "",
  originMachine = "",
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    targetOrderDocId: String(targetOrderDocId || "").trim(),
    targetOrderId: String(targetOrderId || "").trim(),
    productIds: Array.isArray(productIds) ? productIds.map((id) => String(id || "").trim()).filter(Boolean) : [],
    routeStation: String(routeStation || "").trim(),
    sourceOrderId: String(sourceOrderId || "").trim(),
    originMachine: String(originMachine || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.targetOrderDocId || !payload.targetOrderId || !payload.routeStation || payload.productIds.length === 0) {
    throw new Error("targetOrderDocId, targetOrderId, routeStation en productIds zijn verplicht.");
  }

  const result = await assignOverproductionCallable(payload);
  return result?.data || { ok: false };
};

export const cancelPlanningOrder = async ({
  orderDocId,
  reason = "",
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    orderDocId: String(orderDocId || "").trim(),
    reason: String(reason || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.orderDocId) {
    throw new Error("orderDocId is verplicht.");
  }

  const result = await cancelPlanningOrderCallable(payload);
  return result?.data || { ok: false };
};

export const assignPersonnelToStation = async ({
  stationId,
  operatorId,
  operatorNumber = "",
  operatorName = "",
  date,
  departmentId = "",
  hoursWorked = 8,
  shiftType = "DAG",
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    stationId: String(stationId || "").trim(),
    operatorId: String(operatorId || "").trim(),
    operatorNumber: String(operatorNumber || "").trim(),
    operatorName: String(operatorName || "").trim(),
    date: String(date || "").trim(),
    departmentId: String(departmentId || "").trim(),
    hoursWorked: Number(hoursWorked),
    shiftType: String(shiftType || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.stationId || !payload.operatorId || !payload.date) {
    throw new Error("stationId, operatorId en date zijn verplicht.");
  }

  const result = await assignPersonnelToStationCallable(payload);
  return result?.data || { ok: false };
};

export const removePersonnelAssignment = async ({
  assignmentId,
  stationId = "",
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    assignmentId: String(assignmentId || "").trim(),
    stationId: String(stationId || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.assignmentId) {
    throw new Error("assignmentId is verplicht.");
  }

  const result = await removePersonnelAssignmentCallable(payload);
  return result?.data || { ok: false };
};

export const loanPersonnelToDepartment = async ({
  operatorNumber,
  operatorName = "",
  targetDepartment,
  targetStation,
  date,
  shiftLabel = "",
  shiftStart = "",
  shiftEnd = "",
  hoursWorked = 8,
  isPloeg = false,
  loanFromDepartment = "",
  loanFromStation = "",
  originalShift = "",
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    operatorNumber: String(operatorNumber || "").trim(),
    operatorName: String(operatorName || "").trim(),
    targetDepartment: String(targetDepartment || "").trim(),
    targetStation: String(targetStation || "").trim(),
    date: String(date || "").trim(),
    shiftLabel: String(shiftLabel || "").trim(),
    shiftStart: String(shiftStart || "").trim(),
    shiftEnd: String(shiftEnd || "").trim(),
    hoursWorked: Number(hoursWorked),
    isPloeg: Boolean(isPloeg),
    loanFromDepartment: String(loanFromDepartment || "").trim(),
    loanFromStation: String(loanFromStation || "").trim(),
    originalShift: String(originalShift || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.operatorNumber || !payload.targetDepartment || !payload.targetStation || !payload.date) {
    throw new Error("operatorNumber, targetDepartment, targetStation en date zijn verplicht.");
  }

  const result = await loanPersonnelToDepartmentCallable(payload);
  return result?.data || { ok: false };
};

export const saveOccupancyAssignments = async ({
  records,
  source = "",
  actorLabel = "",
}) => {
  const safeRecords = Array.isArray(records)
    ? records.filter((entry) => entry && typeof entry === "object")
    : [];

  if (safeRecords.length === 0) {
    throw new Error("records is verplicht.");
  }

  const result = await saveOccupancyAssignmentsCallable({
    records: safeRecords,
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  });

  return result?.data || { ok: false };
};

export const saveOccupancyAssignment = async ({
  assignmentId,
  data,
  source = "",
  actorLabel = "",
}) => {
  const safeAssignmentId = String(assignmentId || "").trim();
  if (!safeAssignmentId || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("assignmentId en data zijn verplicht.");
  }

  return saveOccupancyAssignments({
    records: [{ assignmentId: safeAssignmentId, data }],
    source,
    actorLabel,
  });
};

export const deleteOccupancyAssignments = async ({
  assignmentIds,
  source = "",
  actorLabel = "",
}) => {
  const safeIds = Array.isArray(assignmentIds)
    ? assignmentIds.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

  if (safeIds.length === 0) {
    throw new Error("assignmentIds is verplicht.");
  }

  const result = await deleteOccupancyAssignmentsCallable({
    assignmentIds: safeIds,
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  });

  return result?.data || { ok: false };
};

export const deleteOccupancyAssignment = async ({
  assignmentId,
  source = "",
  actorLabel = "",
}) => {
  const safeAssignmentId = String(assignmentId || "").trim();
  if (!safeAssignmentId) {
    throw new Error("assignmentId is verplicht.");
  }

  return deleteOccupancyAssignments({
    assignmentIds: [safeAssignmentId],
    source,
    actorLabel,
  });
};

export const savePersonnelRecord = async ({
  personId = "",
  data,
  source = "",
  actorLabel = "",
}) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("data is verplicht.");
  }

  const result = await savePersonnelRecordCallable({
    personId: String(personId || "").trim(),
    data,
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  });

  return result?.data || { ok: false };
};

export const createProductionMessages = async ({
  messages,
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    messages: Array.isArray(messages) ? messages : [],
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.messages.length) {
    throw new Error("Minimaal 1 bericht is verplicht.");
  }

  const result = await createProductionMessagesCallable(payload);
  return result?.data || { ok: false };
};

export const transitionPrintQueueJobStatus = async ({
  jobId,
  status,
  error = "",
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    jobId: String(jobId || "").trim(),
    status: String(status || "").trim(),
    error: String(error || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.jobId || !payload.status) {
    throw new Error("jobId en status zijn verplicht.");
  }

  const result = await transitionPrintQueueJobStatusCallable(payload);
  return result?.data || { ok: false };
};

export const requeuePrintQueueJob = async ({
  jobId,
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    jobId: String(jobId || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.jobId) {
    throw new Error("jobId is verplicht.");
  }

  const result = await requeuePrintQueueJobCallable(payload);
  return result?.data || { ok: false };
};

export const deletePrintQueueJob = async ({
  jobId,
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    jobId: String(jobId || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.jobId) {
    throw new Error("jobId is verplicht.");
  }

  const result = await deletePrintQueueJobCallable(payload);
  return result?.data || { ok: false };
};

export const startProductionLots = async ({
  orderDocId,
  orderId,
  itemCode,
  item = "",
  lotStart,
  totalToProduce,
  stationId,
  stationLabel = "",
  actorLabel = "",
  labelZplData = "",
  labelTemplateId = "",
  seriesGroupId = "",
  isFlangeSeries = false,
}) => {
  const payload = {
    orderDocId: String(orderDocId || "").trim(),
    orderId: String(orderId || "").trim(),
    itemCode: String(itemCode || "").trim(),
    item: String(item || "").trim(),
    lotStart: String(lotStart || "").trim(),
    totalToProduce: Number(totalToProduce),
    stationId: String(stationId || "").trim(),
    stationLabel: String(stationLabel || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
    labelZplData: typeof labelZplData === "string" ? labelZplData : "",
    labelTemplateId: String(labelTemplateId || "").trim(),
    seriesGroupId: String(seriesGroupId || "").trim(),
    isFlangeSeries: Boolean(isFlangeSeries),
  };

  if (!payload.orderDocId || !payload.orderId || !payload.itemCode || !payload.lotStart || !payload.stationId) {
    throw new Error("orderDocId, orderId, itemCode, lotStart en stationId zijn verplicht.");
  }

  const result = await startProductionLotsCallable(payload);
  return result?.data || { ok: false };
};

export const editTrackedProductLotNumber = async ({
  productId,
  newLotNumber,
  reason,
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    productId: String(productId || "").trim(),
    newLotNumber: String(newLotNumber || "").trim(),
    reason: String(reason || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.productId || !payload.newLotNumber || !payload.reason) {
    throw new Error("productId, newLotNumber en reason zijn verplicht.");
  }

  const result = await editTrackedProductLotNumberCallable(payload);
  return result?.data || { ok: false };
};

export const linkPlanningOrderProduct = async ({
  orderDocId,
  productId,
  productImage = "",
}) => {
  const payload = {
    orderDocId: String(orderDocId || "").trim(),
    productId: String(productId || "").trim(),
    productImage: String(productImage || "").trim(),
  };

  if (!payload.orderDocId || !payload.productId) {
    throw new Error("orderDocId en productId zijn verplicht.");
  }

  const result = await linkPlanningOrderProductCallable(payload);
  return result?.data || { ok: false };
};

export const createPlanningOrderManual = async ({
  orderId,
  item,
  machine,
  plan,
}) => {
  const payload = {
    orderId: String(orderId || "").trim(),
    item: String(item || "").trim(),
    machine: String(machine || "").trim(),
    plan: Number(plan),
  };

  if (!payload.orderId || !payload.item || !payload.machine || !Number.isFinite(payload.plan) || payload.plan <= 0) {
    throw new Error("orderId, item, machine en geldige plan zijn verplicht.");
  }

  const result = await createPlanningOrderManualCallable(payload);
  return result?.data || { ok: false };
};

export const markMazakLabelsPrinted = async ({
  productIds,
  stationId = "",
  isReprint = false,
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    productIds: Array.isArray(productIds) ? productIds.map((id) => String(id || "").trim()).filter(Boolean) : [],
    stationId: String(stationId || "").trim(),
    isReprint: Boolean(isReprint),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (payload.productIds.length === 0) {
    throw new Error("productIds is verplicht.");
  }

  const result = await markMazakLabelsPrintedCallable(payload);
  return result?.data || { ok: false };
};

export const appendQcNote = async ({
  productId,
  note,
  archivedYear = null,
  source = "",
  actorLabel = "",
}) => {
  const parsedYear = archivedYear === null || archivedYear === undefined || archivedYear === ""
    ? null
    : Number(archivedYear);
  const payload = {
    productId: String(productId || "").trim(),
    note: String(note || "").trim(),
    archivedYear: Number.isFinite(parsedYear) ? parsedYear : null,
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.productId || !payload.note) {
    throw new Error("productId en note zijn verplicht.");
  }

  const result = await appendQcNoteCallable(payload);
  return result?.data || { ok: false };
};

export const reserveAutoLotNumberRange = async ({
  stationId,
  count = 1,
  reserve = true,
}) => {
  const parsedCount = Number(count);
  const payload = {
    stationId: String(stationId || "").trim(),
    count: parsedCount,
    reserve: reserve !== false,
  };

  if (!payload.stationId || !Number.isFinite(payload.count) || payload.count < 1 || payload.count > 200) {
    throw new Error("stationId en geldige count (1-200) zijn verplicht.");
  }

  const result = await reserveAutoLotNumberRangeCallable(payload);
  return result?.data || { ok: false };
};

export const addOrderDependency = async ({ orderId, dependencyId }) => {
  const payload = {
    orderId: String(orderId || "").trim(),
    dependencyId: String(dependencyId || "").trim(),
  };
  if (!payload.orderId || !payload.dependencyId) {
    throw new Error("orderId en dependencyId zijn verplicht.");
  }
  const result = await addOrderDependencyCallable(payload);
  return result?.data || { ok: false };
};

export const removeOrderDependency = async ({ orderId, dependencyId }) => {
  const payload = {
    orderId: String(orderId || "").trim(),
    dependencyId: String(dependencyId || "").trim(),
  };
  if (!payload.orderId || !payload.dependencyId) {
    throw new Error("orderId en dependencyId zijn verplicht.");
  }
  const result = await removeOrderDependencyCallable(payload);
  return result?.data || { ok: false };
};

export const updateOrderPlannedDate = async ({ orderId, plannedDate }) => {
  const safeOrderId = String(orderId || "").trim();
  if (!safeOrderId || !plannedDate) {
    throw new Error("orderId en plannedDate zijn verplicht.");
  }
  const safeDate = plannedDate instanceof Date ? plannedDate.toISOString() : String(plannedDate);
  const result = await updateOrderPlannedDateCallable({ orderId: safeOrderId, plannedDate: safeDate });
  return result?.data || { ok: false };
};

export const updateOrderKanbanStatus = async ({ orderId, status }) => {
  const payload = {
    orderId: String(orderId || "").trim(),
    status: String(status || "").trim(),
  };
  if (!payload.orderId || !payload.status) {
    throw new Error("orderId en status zijn verplicht.");
  }
  const result = await updateOrderKanbanStatusCallable(payload);
  return result?.data || { ok: false };
};

export const markReadyForNextStep = async ({ productId }) => {
  const safeProductId = String(productId || "").trim();
  if (!safeProductId) {
    throw new Error("productId is verplicht.");
  }
  const result = await markReadyForNextStepCallable({ productId: safeProductId });
  return result?.data || { ok: false };
};

export const startTrackedProductRepair = async ({ productId, repairReason = "" }) => {
  const safeProductId = String(productId || "").trim();
  if (!safeProductId) {
    throw new Error("productId is verplicht.");
  }
  const result = await startTrackedProductRepairCallable({
    productId: safeProductId,
    repairReason: String(repairReason || "").trim(),
  });
  return result?.data || { ok: false };
};

export const reportShopFloorIssue = async ({
  type,
  machine = "",
  orderId = null,
  lotNumber = null,
  description = "",
  operatorName = "",
}) => {
  const safeType = String(type || "").trim();
  if (!["downtime", "defect"].includes(safeType)) {
    throw new Error('type moet "downtime" of "defect" zijn.');
  }
  const result = await reportShopFloorIssueCallable({
    type: safeType,
    machine: String(machine || "").trim(),
    orderId: orderId ? String(orderId).trim() : "",
    lotNumber: lotNumber ? String(lotNumber).trim() : "",
    description: String(description || "").trim(),
    operatorName: String(operatorName || "").trim(),
  });
  return result?.data || { ok: false };
};

export const resolveShopFloorIssue = async ({ type, issueId }) => {
  const safeType = String(type || "").trim();
  const safeIssueId = String(issueId || "").trim();
  if (!["downtime", "defect"].includes(safeType) || !safeIssueId) {
    throw new Error("type en issueId zijn verplicht.");
  }
  const result = await resolveShopFloorIssueCallable({ type: safeType, issueId: safeIssueId });
  return result?.data || { ok: false };
};

export const importPlanningOrders = async ({ orders, importMode = "new_only" }) => {
  const safeMode = String(importMode || "new_only").trim().toLowerCase();
  if (!["new_only", "overwrite", "smart_update"].includes(safeMode)) {
    throw new Error("Ongeldige importMode.");
  }

  const safeOrders = Array.isArray(orders) ? orders.filter((entry) => entry && typeof entry === "object") : [];
  if (safeOrders.length === 0) {
    throw new Error("Minimaal 1 order is verplicht.");
  }

  const result = await importPlanningOrdersCallable({
    orders: safeOrders,
    importMode: safeMode,
  });

  return result?.data || { ok: false };
};

export const queuePrintJob = async (printerId, zplData, metadata = {}) => {
  const payload = {
    printerId: String(printerId || "").trim(),
    zplData: String(zplData || "").trim(),
    metadata: (typeof metadata === "object" && metadata) || {},
  };

  if (!payload.printerId) {
    throw new Error("printerId is verplicht.");
  }

  if (!payload.zplData) {
    throw new Error("zplData is verplicht.");
  }

  const result = await queuePrintJobCallable(payload);
  return result?.data || null; // Returns document ID
};

export const updateUserProfile = async (profileData) => {
  if (!profileData?.name || !profileData?.language) {
    throw new Error("Naam en taal zijn verplicht.");
  }

  const payload = {
    profileData: {
      name: String(profileData.name || "").trim(),
      email: String(profileData.email || "").trim(),
      emailNotifications: Boolean(profileData.emailNotifications),
      systemAlerts: Boolean(profileData.systemAlerts ?? true),
      language: String(profileData.language || "nl").trim(),
      darkMode: Boolean(profileData.darkMode),
      phoneNumber: String(profileData.phoneNumber || "").trim(),
      department: String(profileData.department || "").trim(),
      signature: String(profileData.signature || "").trim(),
    }
  };

  const result = await updateUserProfileCallable(payload);
  return result?.data || { ok: false };
};

export const clearPasswordChangeFlag = async () => {
  const result = await clearPasswordChangeFlagCallable({});
  return result?.data || { ok: false };
};

export const submitAccountRequest = async (requestData) => {
  if (!requestData?.name || !requestData?.email) {
    throw new Error("Naam en e-mailadres zijn verplicht.");
  }

  const payload = {
    requestData: {
      name: String(requestData.name || "").trim(),
      email: String(requestData.email || "").trim(),
      country: String(requestData.country || "").trim(),
      department: String(requestData.department || "").trim(),
    }
  };

  const result = await submitAccountRequestCallable(payload);
  return result?.data || { ok: false };
};

export const updateUserLanguage = async (language) => {
  if (!language) {
    throw new Error("Taalcode is verplicht.");
  }

  const payload = {
    language: String(language || "nl").trim().toLowerCase(),
  };

  const result = await updateUserLanguageCallable(payload);
  return result?.data || { ok: false };
};

export const executeAutomationRule = async (rule) => {
  if (!rule || typeof rule !== "object") {
    throw new Error("rule is verplicht.");
  }

  const result = await executeAutomationRuleCallable({ rule });
  return result?.data || { triggered: false, error: "Lege automation response" };
};
