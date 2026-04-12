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
const assignOverproductionCallable = httpsCallable(functions, "assignOverproduction");
const cancelPlanningOrderCallable = httpsCallable(functions, "cancelPlanningOrder");
const assignPersonnelToStationCallable = httpsCallable(functions, "assignPersonnelToStation");
const removePersonnelAssignmentCallable = httpsCallable(functions, "removePersonnelAssignment");
const loanPersonnelToDepartmentCallable = httpsCallable(functions, "loanPersonnelToDepartment");
const startProductionLotsCallable = httpsCallable(functions, "startProductionLots");
const editTrackedProductLotNumberCallable = httpsCallable(functions, "editTrackedProductLotNumber");
const linkPlanningOrderProductCallable = httpsCallable(functions, "linkPlanningOrderProduct");
const createPlanningOrderManualCallable = httpsCallable(functions, "createPlanningOrderManual");
const markMazakLabelsPrintedCallable = httpsCallable(functions, "markMazakLabelsPrinted");
const appendQcNoteCallable = httpsCallable(functions, "appendQcNote");
const reserveAutoLotNumberRangeCallable = httpsCallable(functions, "reserveAutoLotNumberRange");

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
