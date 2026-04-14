const { admin, db } = require('../config/firebase');
const { BASE, TRACKING_COLLECTION, PLANNING_COLLECTION, USER_ACCOUNTS_COLLECTION } = require('../config/planningConstants');
const {
  resolveRuntimeDataPaths,
  resolveDbContext,
  getPlanningOrderDocByOrderId,
  getTrackedProductDocByIdOrLot,
  getPlanningOrderDocById,
} = require('../repositories/planningRepository');
const { clean, clampText } = require('../utils/text');

const EFFICIENCY_COLLECTION = `${BASE}/production/efficiency_hours`;
const OCCUPANCY_COLLECTION = `${BASE}/production/machine_occupancy`;
const PERSONNEL_COLLECTION = `${BASE}/Users/Personnel`;
const PRINT_QUEUE_COLLECTION = `${BASE}/production/print_queue`;
const SERVER_TIMESTAMP_TOKEN = '__SERVER_TIMESTAMP__';
const LN_UPDATABLE_FIELDS_SERVER = [
  'quantity', 'toDoQty', 'plan', 'notes', 'deliveryDate', 'plannedDeliveryDate',
  'weekNumber', 'orderStatus', 'totalPlannedHours', 'totalActualHours',
  'itemDescription', 'item', 'itemCode', 'extraCode', 'drawing',
  'project', 'projectDesc', 'orderCreationDate', 'machine', 'sourceType',
  'operations',
];

const normalizeMachineForCounter = (stationName = '') => {
  const normalized = String(stationName || '').trim().replace(/\s+/g, '').toUpperCase();
  if (/^40(BH|BM|BA)\d+/.test(normalized)) {
    return normalized.slice(2);
  }
  return normalized;
};

const getStartedCounterFieldServer = (stationName = '') => {
  const normalized = normalizeMachineForCounter(stationName);
  if (!normalized) return '';
  const safeKey = normalized.replace(/[^a-zA-Z0-9]/g, '_');
  return `started_${safeKey}`;
};

const normalizeMachineForPlanningServer = (val = '') => {
  let str = clean(val).toUpperCase();
  if (str === 'BM18') str = 'BH18';
  if (str === '40BM18') str = '40BH18';
  return str || '-';
};

const getISOWeekInfoServer = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { week, year: d.getUTCFullYear() };
};

const getStepForStationServer = (stationName = '') => {
  const name = String(stationName || '').toUpperCase();

  if (name === 'BH31' || name.includes('REPARATIE') || name.includes('REPAIR')) {
    return { status: 'Tijdelijke afkeur', currentStep: 'Reparatie' };
  }
  if (name.includes('BM01')) return { status: 'Te Keuren', currentStep: 'Eindinspectie' };
  if (name.includes('NABEWERK') || name.includes('MAZAK')) {
    return { status: 'Te Nabewerken', currentStep: 'Nabewerking' };
  }
  if (name === 'LOSSEN') return { status: 'In Productie', currentStep: 'Lossen' };
  if (name.startsWith('BH')) return { status: 'In Productie', currentStep: 'Wikkelen' };

  return { status: 'In Productie', currentStep: 'Onbekend' };
};

const normalizeStationKey = (stationName = '') => {
  return String(stationName || '').trim().replace(/\s+/g, '').toUpperCase();
};

const shouldClearTemporaryInspection = ({ trackedData, nextStation }) => {
  const inspectionStatus = clean(trackedData?.inspection?.status).toLowerCase();
  if (inspectionStatus !== 'tijdelijke afkeur') return false;

  const currentStation = normalizeStationKey(trackedData?.currentStation || trackedData?.machine || '');
  const targetStation = normalizeStationKey(nextStation);

  if (!targetStation || targetStation === 'BH31') return false;
  return currentStation === 'BH31';
};

const getActorLabel = (auth, actorLabel) => {
  return actorLabel || clean(auth?.token?.name) || clean(auth?.token?.email) || auth?.uid;
};

const getPriorityLabel = (priorityValue) => {
  if (priorityValue === 'immediate') return '1E PRIO';
  if (priorityValue === 'urgent') return 'SPOED';
  if (priorityValue === 'high') return 'HIGH';
  return 'NORMAAL';
};

const getSafeStartedField = (stationName = '') => {
  const safeKey = String(stationName || '').replace(/[^a-zA-Z0-9]/g, '_');
  return safeKey ? `started_${safeKey}` : '';
};

const getMachineCodeForLotServer = (stationName = '') => {
  if (!stationName) return '999';
  const normalized = String(stationName || '').toUpperCase().trim();
  const baseStation = normalized.startsWith('40') ? normalized.substring(2) : normalized;
  const map = {
    BH11: '411',
    BH12: '412',
    BH15: '415',
    BH16: '416',
    BH17: '417',
    BH18: '418',
    BH31: '431',
    BH05: '405',
    BH07: '407',
    BH08: '408',
    BH09: '409',
    BA05: '405',
    BA07: '417',
  };

  if (map[baseStation]) return map[baseStation];

  const digits = baseStation.replace(/\D/g, '');
  if (!digits) return '999';
  if (digits.length === 3) return digits;
  if (digits.length === 1) return `40${digits}`;
  return `4${digits.slice(-2).padStart(2, '0')}`;
};

const sanitizeMeasurements = (rawMeasurements) => {
  if (!rawMeasurements || typeof rawMeasurements !== 'object' || Array.isArray(rawMeasurements)) {
    return null;
  }

  const entries = Object.entries(rawMeasurements)
    .filter(([key]) => clean(key).length > 0)
    .slice(0, 24)
    .map(([key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) return [String(key), value];
      if (typeof value === 'boolean') return [String(key), value];
      if (value === null) return [String(key), null];
      return [String(key), clampText(String(value || ''), 120)];
    });

  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

const toServerTimestampIfRequested = (value) => {
  if (value === SERVER_TIMESTAMP_TOKEN) {
    return admin.firestore.FieldValue.serverTimestamp();
  }
  return value;
};

const assignIfDefined = (target, key, value) => {
  if (value !== undefined) {
    target[key] = value;
  }
};

const sanitizeOccupancyData = (rawData = {}) => {
  const data = rawData && typeof rawData === 'object' && !Array.isArray(rawData) ? rawData : {};
  const updates = {};

  assignIfDefined(updates, 'departmentId', data.departmentId === null ? null : clampText(data.departmentId, 80));
  assignIfDefined(updates, 'machineId', data.machineId === null ? null : clampText(data.machineId, 120));
  assignIfDefined(updates, 'operatorNumber', data.operatorNumber === null ? null : clampText(data.operatorNumber, 80));
  assignIfDefined(updates, 'operatorName', data.operatorName === null ? null : clampText(data.operatorName, 140));
  assignIfDefined(updates, 'date', data.date === null ? null : clampText(data.date, 20));
  assignIfDefined(updates, 'shift', data.shift === null ? null : clampText(data.shift, 80));
  assignIfDefined(updates, 'shiftKey', data.shiftKey === null ? null : clampText(data.shiftKey, 40));
  assignIfDefined(updates, 'shiftType', data.shiftType === null ? null : clampText(data.shiftType, 40));
  assignIfDefined(updates, 'primaryStation', data.primaryStation === null ? null : clampText(data.primaryStation, 120));
  assignIfDefined(updates, 'source', data.source === null ? null : clampText(data.source, 80));
  assignIfDefined(updates, 'movedToMachineId', data.movedToMachineId === null ? null : clampText(data.movedToMachineId, 120));
  assignIfDefined(updates, 'loanFromDepartment', data.loanFromDepartment === null ? null : clampText(data.loanFromDepartment, 80));
  assignIfDefined(updates, 'loanFromStation', data.loanFromStation === null ? null : clampText(data.loanFromStation, 120));
  assignIfDefined(updates, 'originalShift', data.originalShift === null ? null : clampText(data.originalShift, 120));
  assignIfDefined(updates, 'shiftStart', data.shiftStart === null ? null : clampText(data.shiftStart, 12));
  assignIfDefined(updates, 'shiftEnd', data.shiftEnd === null ? null : clampText(data.shiftEnd, 12));
  assignIfDefined(updates, 'autoCheckoutShift', data.autoCheckoutShift === null ? null : clampText(data.autoCheckoutShift, 40));
  assignIfDefined(updates, 'timestamp', data.timestamp === null ? null : clampText(data.timestamp, 80));

  ['week', 'weekYear', 'hoursWorked', 'hoursWorkedGross', 'breakDeductedHours'].forEach((key) => {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      const parsed = Number(data[key]);
      if (Number.isFinite(parsed)) updates[key] = parsed;
    } else if (data[key] === null) {
      updates[key] = null;
    }
  });

  ['isPloeg', 'isLoan', 'isSecondary', 'isActive', 'autoCheckout', 'manualHoursOverride'].forEach((key) => {
    if (data[key] !== undefined) updates[key] = Boolean(data[key]);
  });

  ['checkedInAt', 'checkedOutAt', 'updatedAt', 'createdAt', 'startTime', 'manualHoursOverrideAt'].forEach((key) => {
    if (data[key] !== undefined) {
      const mapped = toServerTimestampIfRequested(data[key]);
      updates[key] = mapped;
    }
  });

  if (updates.date && (updates.week === undefined || updates.weekYear === undefined)) {
    const parsedDate = new Date(`${updates.date}T00:00:00.000Z`);
    if (!Number.isNaN(parsedDate.getTime())) {
      const { week, year } = getISOWeekInfoServer(parsedDate);
      if (updates.week === undefined) updates.week = week;
      if (updates.weekYear === undefined) updates.weekYear = year;
    }
  }

  return updates;
};

const sanitizePersonnelData = (rawData = {}) => {
  const data = rawData && typeof rawData === 'object' && !Array.isArray(rawData) ? rawData : {};
  const updates = {};

  assignIfDefined(updates, 'name', data.name === null ? null : clampText(data.name, 140));
  assignIfDefined(updates, 'employeeNumber', data.employeeNumber === null ? null : clampText(data.employeeNumber, 80));
  assignIfDefined(updates, 'departmentId', data.departmentId === null ? null : clampText(data.departmentId, 80));
  assignIfDefined(updates, 'linkedUserId', data.linkedUserId === null ? null : clampText(data.linkedUserId, 120));
  assignIfDefined(updates, 'shiftId', data.shiftId === null ? null : clampText(data.shiftId, 80));
  assignIfDefined(updates, 'role', data.role === null ? null : clampText(data.role, 80));
  assignIfDefined(updates, 'currentMachineId', data.currentMachineId === null ? null : clampText(data.currentMachineId, 120));
  assignIfDefined(updates, 'lastBadgeScanBy', data.lastBadgeScanBy === null ? null : clampText(data.lastBadgeScanBy, 120));
  assignIfDefined(updates, 'signature', data.signature === null ? null : clampText(data.signature, 600));

  if (data.isActive !== undefined) updates.isActive = Boolean(data.isActive);
  if (data.temporaryShiftOverride !== undefined && data.temporaryShiftOverride && typeof data.temporaryShiftOverride === 'object' && !Array.isArray(data.temporaryShiftOverride)) {
    updates.temporaryShiftOverride = data.temporaryShiftOverride;
  }
  if (data.loan !== undefined && data.loan && typeof data.loan === 'object' && !Array.isArray(data.loan)) {
    updates.loan = data.loan;
  }

  ['updatedAt', 'createdAt', 'lastBadgeScanAt'].forEach((key) => {
    if (data[key] !== undefined) {
      updates[key] = toServerTimestampIfRequested(data[key]);
    }
  });

  return updates;
};

const sanitizeNestedValue = (value, depth = 0) => {
  if (depth > 4 || value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return clampText(value, 2000);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeNestedValue(entry, depth + 1))
      .filter((entry) => entry !== undefined)
      .slice(0, 100);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([key]) => clean(key).length > 0)
      .slice(0, 50)
      .map(([key, nestedValue]) => [String(key), sanitizeNestedValue(nestedValue, depth + 1)])
      .filter(([, nestedValue]) => nestedValue !== undefined);
    return entries.length ? Object.fromEntries(entries) : {};
  }
  return undefined;
};

const uniqueLowercaseEmails = (values = []) => Array.from(new Set(
  values
    .map((value) => clean(value).toLowerCase())
    .filter((value) => value.includes('@'))
));

const resolveTargetRoleEmails = async (targetRoles = []) => {
  const roles = Array.from(new Set(
    (Array.isArray(targetRoles) ? targetRoles : [])
      .map((role) => clean(role).toLowerCase())
      .filter(Boolean)
  )).slice(0, 10);

  if (!roles.length) return [];

  const snapshot = await db
    .collection(USER_ACCOUNTS_COLLECTION)
    .where('role', 'in', roles)
    .get();

  return uniqueLowercaseEmails(
    snapshot.docs.map((userDoc) => userDoc.data()?.email)
  );
};

const writeActivityLog = async ({ auth, action, details, extra = {} }) => {
  await db.collection(`${BASE}/logs/activity_logs`).add({
    userId: auth?.uid || 'system',
    action,
    details: clampText(details, 1000),
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    ...extra,
  });
};

const classifyByWcServer = (wc = '') => {
  const upper = String(wc || '').toUpperCase();
  if (upper.includes('BM01') || upper.includes('BA01')) return 'qc';
  if (upper.includes('NABEWERK') || upper.includes('NABEW')) return 'post';
  return null;
};

const classifyReferenceOperationServer = (refOp, wc) => {
  const wcBucket = classifyByWcServer(wc);
  if (wcBucket) return wcBucket;
  const digits = Number.parseInt(String(refOp || '').replace(/\D/g, ''), 10);
  if (Number.isNaN(digits)) return 'production';
  const opCode = digits % 100;
  if (opCode === 60) return 'qc';
  if (opCode === 30) return 'post';
  return 'production';
};

const getSplitPlannedHoursServer = (operations, fallbackTotalHours) => {
  const split = { productionHours: 0, postHours: 0, qcHours: 0 };
  const entries = Object.entries(operations || {});

  if (entries.length === 0) {
    split.productionHours = Number(fallbackTotalHours) || 0;
    return split;
  }

  entries.forEach(([refOp, values]) => {
    const planned = Number(values?.planned || 0);
    const bucket = classifyReferenceOperationServer(refOp, values?.wc);
    if (bucket === 'qc') split.qcHours += planned;
    else if (bucket === 'post') split.postHours += planned;
    else split.productionHours += planned;
  });

  if (split.productionHours === 0 && split.postHours === 0 && split.qcHours === 0) {
    split.productionHours = Number(fallbackTotalHours) || 0;
  }

  return split;
};

const buildReferenceOperationSummaryServer = (operations = {}) => {
  const byCode = {};

  Object.entries(operations || {}).forEach(([refOp, values]) => {
    const planned = Number(values?.planned || 0);
    const actual = Number(values?.actual || 0);
    const wc = normalizeMachineForPlanningServer(values?.wc || '');
    const bucket = classifyReferenceOperationServer(refOp, wc);

    byCode[refOp] = {
      plannedHours: planned,
      actualHours: actual,
      workCenter: wc,
      bucket,
    };
  });

  return byCode;
};

const bulkImportPlanningOrdersService = async ({
  orders,
  importMode,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeImportMode = String(importMode || 'new_only').trim().toLowerCase();

  let createdCount = 0;
  let updatedCount = 0;
  let processedCount = 0;

  const CHUNK = 350;
  for (let i = 0; i < safeOrders.length; i += CHUNK) {
    const chunk = safeOrders.slice(i, i + CHUNK);
    const batch = db.batch();

    chunk.forEach((rawItem) => {
      const item = rawItem && typeof rawItem === 'object' ? rawItem : null;
      const docId = clean(item?.id);
      if (!item || !docId) return;

      const dbData = { ...item };
      delete dbData.isValidForImport;
      delete dbData.isExistingOrder;
      delete dbData.planningVisible;

      const normalizedItem = clean(dbData.item || dbData.itemDescription || '');
      const normalizedItemDescription = clean(dbData.itemDescription || dbData.item || '');
      const { productionHours, postHours, qcHours } = getSplitPlannedHoursServer(item.operations, item.totalPlannedHours || 0);
      const operationByCode = buildReferenceOperationSummaryServer(item.operations);

      const isExistingOrder = Boolean(item.isExistingOrder);
      const isSmartUpdate = safeImportMode === 'smart_update' && isExistingOrder;
      const planningDocRef = db.collection(ctx.planningPath).doc(docId);

      if (isSmartUpdate) {
        const lnPayload = {};
        LN_UPDATABLE_FIELDS_SERVER.forEach((field) => {
          if (dbData[field] !== undefined) lnPayload[field] = dbData[field];
        });

        batch.set(
          planningDocRef,
          {
            ...lnPayload,
            item: normalizedItem,
            itemDescription: normalizedItemDescription,
            plannedHoursBH: productionHours,
            plannedHoursNabewerken: postHours,
            plannedHoursBM01: qcHours,
            plannedMinutesBH: productionHours * 60,
            plannedMinutesNabewerken: postHours * 60,
            plannedMinutesBM01: qcHours * 60,
            referenceOperationTimes: operationByCode,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        batch.set(
          planningDocRef,
          {
            ...dbData,
            item: normalizedItem,
            itemDescription: normalizedItemDescription,
            plannedHoursBH: productionHours,
            plannedHoursNabewerken: postHours,
            plannedHoursBM01: qcHours,
            plannedMinutesBH: productionHours * 60,
            plannedMinutesNabewerken: postHours * 60,
            plannedMinutesBM01: qcHours * 60,
            referenceOperationTimes: operationByCode,
            planningHidden: item.planningVisible === false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      const productionMinutes = productionHours * 60;
      const postProcessingMinutes = postHours * 60;
      const qcMinutes = qcHours * 60;
      const standardMinutes = productionMinutes + postProcessingMinutes;
      const actualMinutes = (Number(item.totalActualHours) || 0) * 60;
      const qty = Number(item.quantity) || Number(item.toDoQty) || 1;

      batch.set(
        db.collection(ctx.efficiencyPath).doc(docId),
        {
          orderId: docId,
          itemCode: clean(item.itemCode),
          itemDescription: normalizedItemDescription,
          machine: clean(item.machine),
          standardTimeTotal: standardMinutes,
          productionTimeTotal: productionMinutes,
          actualTimeTotal: actualMinutes,
          qcTimeTotal: qcMinutes,
          postProcessingTimeTotal: postProcessingMinutes,
          quantity: qty,
          minutesPerUnit: qty > 0 ? standardMinutes / qty : 0,
          status: 'active',
          source: isSmartUpdate ? 'ln_smart_sync' : 'ln_import',
          lastSync: new Date().toISOString(),
        },
        { merge: true }
      );

      processedCount += 1;
      if (isExistingOrder) updatedCount += 1;
      else createdCount += 1;
    });

    await batch.commit();
  }

  return {
    ok: true,
    importMode: safeImportMode,
    processedCount,
    createdCount,
    updatedCount,
  };
};

const rejectTrackedProductFinalService = async ({
  productId,
  reasons,
  note,
  source,
  actorLabel,
  auth,
  userRole,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const productRef = db.collection(ctx.trackingPath).doc(productId);
  const productSnap = await productRef.get();

  if (!productSnap.exists) {
    throw new Error('NOT_FOUND_PRODUCT');
  }

  const productData = productSnap.data() || {};
  const now = new Date();
  const year = now.getFullYear();

  const currentStepNormalized = clean(productData.currentStep).toUpperCase();
  if (currentStepNormalized === 'REJECTED') {
    throw new Error('ALREADY_REJECTED');
  }

  const userLabel = actorLabel || clean(auth?.token?.name) || clean(auth?.token?.email) || auth?.uid;
  const stationLabel = clean(productData.currentStation) || clean(productData.machine) || 'Onbekend';
  const reasonText = reasons.join(', ');
  const noteSuffix = note ? ` - ${note}` : '';

  const historyEntry = {
    action: 'Definitieve Afkeur',
    timestamp: now.toISOString(),
    user: userLabel,
    details: `Reden: ${reasonText}${noteSuffix}`,
    station: stationLabel,
  };

  const archiveRef = db
    .collection(ctx.archiveRejectedPath(year))
    .doc(productId);

  const rejectionData = {
    ...productData,
    status: 'Rejected',
    currentStep: 'REJECTED',
    currentStation: 'AFKEUR',
    inspection: {
      status: 'Afkeur',
      reasons,
      note,
      timestamp: now.toISOString(),
    },
    history: [...(Array.isArray(productData.history) ? productData.history : []), historyEntry],
    updatedAt: now,
    archivedAt: now,
    archivedReason: 'rejected',
    rejectedBy: auth.uid,
    rejectedByRole: userRole,
    rejectionSource: source || null,
  };

  const batch = db.batch();
  batch.set(archiveRef, rejectionData);
  batch.delete(productRef);

  let orderUpdated = false;
  const orderId = clean(productData.orderId);
  if (orderId && orderId !== 'NOG_TE_BEPALEN') {
    const orderDoc = await getPlanningOrderDocByOrderId(orderId, ctx._rds);
    if (orderDoc) {
      const orderData = orderDoc.data() || {};
      const originStation =
        clean(productData.originMachine) ||
        clean(productData.currentStation) ||
        clean(productData.machine);

      const stationField = getStartedCounterFieldServer(originStation);
      const currentStarted = Number(orderData?.[stationField] || 0);
      const normalizedStatus = clean(orderData?.status).toLowerCase();

      const orderUpdates = {
        rejectedCount: admin.firestore.FieldValue.increment(1),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (stationField && currentStarted > 0) {
        orderUpdates[stationField] = currentStarted - 1;
      }

      if (['completed', 'finished', 'gereed'].includes(normalizedStatus)) {
        orderUpdates.status = 'planned';
      }

      batch.set(orderDoc.ref, orderUpdates, { merge: true });
      orderUpdated = true;
    }
  }

  await batch.commit();

  return {
    ok: true,
    productId,
    archivedYear: year,
    orderUpdated,
  };
};

const moveTrackedProductManualService = async ({
  productOrLotId,
  newStation,
  source,
  actorLabel,
  isRepairMove,
  repairInstruction,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const trackedDoc = await getTrackedProductDocByIdOrLot(productOrLotId, ctx._rds);
  if (!trackedDoc) {
    throw new Error('NOT_FOUND_TRACKED');
  }

  const trackedData = trackedDoc.data() || {};
  const nextState = getStepForStationServer(newStation);
  const userLabel = actorLabel || clean(auth?.token?.name) || clean(auth?.token?.email) || auth?.uid;
  const note = isRepairMove
    ? `Reparatie verplaatst naar ${newStation} door ${userLabel}${repairInstruction ? ` | Instructie: ${repairInstruction}` : ''}`
    : `Handmatig verplaatst naar ${newStation} door ${userLabel}`;

  const updatePayload = {
    currentStation: newStation,
    currentStep: nextState.currentStep,
    status: nextState.status || 'In Productie',
    isManualMove: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    note,
    history: admin.firestore.FieldValue.arrayUnion({
      action: isRepairMove ? 'Reparatie Verplaatst' : 'Handmatige Verplaatsing',
      timestamp: new Date().toISOString(),
      user: userLabel,
      station: clean(trackedData.currentStation) || clean(trackedData.machine) || 'Onbekend',
      details: isRepairMove
        ? `Reparatie naar station: ${newStation}${repairInstruction ? ` | Instructie: ${repairInstruction}` : ''}`
        : `Verplaatst naar station: ${newStation}`,
      source: source || null,
    }),
  };

  if (shouldClearTemporaryInspection({ trackedData, nextStation: newStation })) {
    updatePayload.inspection = admin.firestore.FieldValue.delete();
  }

  if (isRepairMove) {
    updatePayload.repairActive = true;
    updatePayload.repairCategory = 'reparatie';
    updatePayload.repairInstruction = repairInstruction || '';
    updatePayload['timestamps.repair_start'] = admin.firestore.FieldValue.serverTimestamp();
    updatePayload['timestamps.repair_end'] = null;
  }

  await trackedDoc.ref.set(updatePayload, { merge: true });

  const orderId = clean(trackedData.orderId);
  if (orderId && orderId !== 'NOG_TE_BEPALEN') {
    const planningOrderDoc = await getPlanningOrderDocByOrderId(orderId, ctx._rds);
    if (planningOrderDoc) {
      const now = new Date();
      const { week, year } = getISOWeekInfoServer(now);
      await planningOrderDoc.ref.set({
        machine: newStation,
        normMachine: normalizeMachineForPlanningServer(newStation),
        isMoved: true,
        weekNumber: week,
        weekYear: year,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  return {
    ok: true,
    productId: trackedDoc.id,
    lotNumber: clean(trackedData.lotNumber) || trackedDoc.id,
    newStation,
    nextStep: nextState.currentStep,
    nextStatus: nextState.status,
    isRepairMove,
  };
};

const archivePlanningOrderService = async ({ orderDocId, requestedReason, source, auth, userRole, dbCtx = null }) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderDoc = await getPlanningOrderDocById(orderDocId, ctx._rds);
  if (!orderDoc) {
    throw new Error('NOT_FOUND_ORDER');
  }

  const orderData = orderDoc.data() || {};
  const year = new Date().getFullYear();
  const targetArchiveRef = db.collection(ctx.archivePlanningPath(year)).doc(orderDoc.id);

  const archiveData = {
    ...orderData,
    archivedAt: admin.firestore.FieldValue.serverTimestamp(),
    archiveReason: requestedReason,
    archiveYear: year,
    originalStatus: orderData?.status || null,
    archivedFrom: 'digital_planning',
    archivedBy: auth.uid,
    archivedByRole: userRole,
    archiveSource: source || null,
  };

  const batch = db.batch();
  batch.set(targetArchiveRef, archiveData, { merge: true });
  batch.delete(orderDoc.ref);
  await batch.commit();

  return {
    ok: true,
    orderDocId: orderDoc.id,
    archiveYear: year,
    archiveReason: requestedReason,
  };
};

const completeTrackedProductService = async ({
  productId,
  finishType,
  fromStation,
  note,
  actorLabel,
  auth,
  userRole,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const trackedDoc = await getTrackedProductDocByIdOrLot(productId, ctx._rds);
  if (!trackedDoc) {
    throw new Error('NOT_FOUND_PRODUCT');
  }

  const productData = trackedDoc.data() || {};
  const now = new Date();
  const year = now.getFullYear();
  const userLabel = actorLabel || clean(auth?.token?.name) || clean(auth?.token?.email) || auth?.uid;
  const station = clean(fromStation) || clean(productData.currentStation) || 'Onbekend';

  const historyEntry = {
    action: 'Stap Voltooid',
    timestamp: now.toISOString(),
    user: userLabel,
    station,
    details: finishType === 'archive'
      ? 'Voltooid en gearchiveerd'
      : `Doorgestuurd naar BM01 Eindinspectie`,
  };

  const orderId = clean(productData.orderId);

  const incrementProducedOnOrder = async (batch) => {
    if (!orderId || orderId === 'NOG_TE_BEPALEN') return false;
    const orderDoc = await getPlanningOrderDocByOrderId(orderId, ctx._rds);
    if (!orderDoc) return false;
    const orderData = orderDoc.data() || {};
    const newProduced = (Number(orderData.produced) || 0) + 1;
    const plan = Number(orderData.plan || orderData.quantity || 0);
    const orderUpdates = {
      produced: admin.firestore.FieldValue.increment(1),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (plan > 0 && newProduced >= plan) {
      orderUpdates.status = 'completed';
    }
    batch.set(orderDoc.ref, orderUpdates, { merge: true });
    return true;
  };

  if (finishType === 'archive') {
    const archiveRef = admin
      .firestore()
      .collection(ctx.archiveItemsPath(year))
      .doc(trackedDoc.id);

    const archiveData = {
      ...productData,
      currentStation: 'GEREED',
      currentStep: 'Finished',
      status: 'completed',
      lastStation: station,
      updatedAt: now,
      archivedAt: now,
      timestamps: { ...(productData.timestamps || {}), finished: now },
      history: [...(Array.isArray(productData.history) ? productData.history : []), historyEntry],
      note: clean(note) || productData.note || '',
      completedBy: auth.uid,
      completedByRole: userRole,
    };

    const batch = db.batch();
    batch.set(archiveRef, archiveData);
    batch.delete(trackedDoc.ref);
    const producedIncremented = await incrementProducedOnOrder(batch);
    await batch.commit();

    return { ok: true, productId: trackedDoc.id, finishType: 'archive', producedIncremented };
  }

  if (finishType === 'forward') {
    const updatePayload = {
      currentStation: 'BM01',
      currentStep: 'Eindinspectie',
      status: 'Te Keuren',
      lastStation: station,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      'timestamps.bm01_start': admin.firestore.FieldValue.serverTimestamp(),
      note: clean(note) || '',
      history: admin.firestore.FieldValue.arrayUnion(historyEntry),
    };

    const hasActiveRepair = Boolean(productData?.repairActive || productData?.timestamps?.repair_start);
    if (hasActiveRepair) {
      updatePayload.repairActive = false;
      updatePayload['timestamps.repair_end'] = admin.firestore.FieldValue.serverTimestamp();
    }

    const batch = db.batch();
    batch.set(trackedDoc.ref, updatePayload, { merge: true });
    const producedIncremented = await incrementProducedOnOrder(batch);
    await batch.commit();

    return { ok: true, productId: trackedDoc.id, finishType: 'forward', producedIncremented };
  }

  throw new Error('INVALID_FINISH_TYPE');
};

const cancelTrackedProductionService = async ({
  productId,
  selectedStation,
  source,
  actorLabel,
  auth,
  userRole,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const trackedDoc = await getTrackedProductDocByIdOrLot(productId, ctx._rds);
  if (!trackedDoc) {
    throw new Error('NOT_FOUND_PRODUCT');
  }

  const productData = trackedDoc.data() || {};
  const now = new Date();
  const userLabel = actorLabel || clean(auth?.token?.name) || clean(auth?.token?.email) || auth?.uid;
  const cancelledLot = clean(productData.lotNumber) || trackedDoc.id;
  const orderId = clean(productData.orderId);
  const stationForCounter = clean(selectedStation) || clean(productData.originMachine) || clean(productData.currentStation);

  const lotSeq = Number.parseInt(String(cancelledLot).slice(-4), 10);
  const lotWeekSuffix = String(cancelledLot).length >= 6 ? String(cancelledLot).slice(2, 6) : '';
  const lotStation = String(
    clean(productData.originMachine) || clean(selectedStation) || 'UNKNOWN'
  )
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  let orderUpdated = false;
  let stationCounterDecremented = false;
  let recycledSequenceAdded = false;
  let removedQueueJobs = 0;

  const batch = db.batch();
  batch.delete(trackedDoc.ref);

  if (orderId && orderId !== 'NOG_TE_BEPALEN') {
    const orderDoc = await getPlanningOrderDocByOrderId(orderId, ctx._rds);
    if (orderDoc) {
      const stationField = getStartedCounterFieldServer(stationForCounter);
      const orderUpdates = {
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (stationField) {
        orderUpdates[stationField] = admin.firestore.FieldValue.increment(-1);
        stationCounterDecremented = true;
      }

      batch.set(orderDoc.ref, orderUpdates, { merge: true });
      orderUpdated = true;
    }
  }

  if (lotWeekSuffix && Number.isFinite(lotSeq) && lotSeq > 0) {
    const counterDocId = `${lotStation}_${lotWeekSuffix}`;
    const counterRef = db.doc(`${BASE}/production/counters/${counterDocId}`);
    const counterSnap = await counterRef.get();
    const existing = counterSnap.exists && Array.isArray(counterSnap.data()?.recycledSequences)
      ? counterSnap
        .data()
        .recycledSequences.map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const nextRecycled = Array.from(new Set([...existing, lotSeq])).sort((a, b) => a - b);

    batch.set(counterRef, {
      recycledSequences: nextRecycled,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    recycledSequenceAdded = true;
  }

  const queueSnap = await admin
    .firestore()
    .collection(`${BASE}/production/print_queue`)
    .where('status', '==', 'pending')
    .limit(200)
    .get();

  const lotUpper = String(cancelledLot).toUpperCase();
  const orderUpper = String(orderId || '').toUpperCase();

  queueSnap.docs.forEach((d) => {
    const data = d.data() || {};
    const md = data.metadata || {};
    const mdLot = String(md.lotNumber || md.variables?.lotNumber || '').toUpperCase();
    const mdOrder = String(md.orderId || md.variables?.orderNumber || '').toUpperCase();
    const desc = String(md.description || data.description || '').toUpperCase();

    const lotMatch = lotUpper && (mdLot === lotUpper || desc.includes(lotUpper));
    const orderMatch = orderUpper && (mdOrder === orderUpper || desc.includes(orderUpper));

    if (lotMatch || orderMatch) {
      batch.delete(d.ref);
      removedQueueJobs += 1;
    }
  });

  await batch.commit();

  await admin
    .firestore()
    .collection(`${BASE}/logs/activity_logs`)
    .add({
      userId: auth?.uid || 'system',
      action: 'PRODUCTION_CANCEL',
      details: `Production cancelled for lot ${cancelledLot}; station=${clean(selectedStation) || 'unknown'}; queue jobs removed=${removedQueueJobs}`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      source: source || null,
      actorLabel: userLabel,
      actorRole: userRole,
      orderId: orderId || null,
      productId: trackedDoc.id,
    });

  return {
    ok: true,
    productId: trackedDoc.id,
    lotNumber: cancelledLot,
    orderUpdated,
    stationCounterDecremented,
    recycledSequenceAdded,
    removedQueueJobs,
    cancelledAt: now.toISOString(),
  };
};

const updatePlanningOrderPriorityService = async ({
  orderDocId,
  priority,
  productDocId,
  actorLabel,
  source,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderDoc = await getPlanningOrderDocById(orderDocId, ctx._rds);
  if (!orderDoc) {
    throw new Error('NOT_FOUND_ORDER');
  }

  const userLabel = getActorLabel(auth, actorLabel);
  const orderData = orderDoc.data() || {};
  const normalizedPriority = priority === false ? false : clean(priority).toLowerCase();
  const priorityValue = ['high', 'urgent', 'immediate'].includes(normalizedPriority)
    ? normalizedPriority
    : false;
  const nowIso = new Date().toISOString();

  const batch = db.batch();
  batch.set(orderDoc.ref, {
    priority: priorityValue,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  let productHistoryUpdated = false;
  const cleanProductDocId = clean(productDocId);
  if (cleanProductDocId) {
    const planningLikeDoc = await getPlanningOrderDocById(cleanProductDocId, ctx._rds);
    if (planningLikeDoc) {
      batch.set(planningLikeDoc.ref, {
        history: admin.firestore.FieldValue.arrayUnion({
          station: 'PLANNING',
          user: userLabel,
          action: 'Prioriteit Wijziging',
          details: `Prioriteit gewijzigd naar: ${getPriorityLabel(priorityValue)}`,
          time: nowIso,
          source: source || null,
        }),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      productHistoryUpdated = true;
    } else {
      const trackedDoc = await getTrackedProductDocByIdOrLot(cleanProductDocId, ctx._rds);
      if (trackedDoc) {
        batch.set(trackedDoc.ref, {
          history: admin.firestore.FieldValue.arrayUnion({
            station: 'PLANNING',
            user: userLabel,
            action: 'Prioriteit Wijziging',
            details: `Prioriteit gewijzigd naar: ${getPriorityLabel(priorityValue)}`,
            time: nowIso,
            source: source || null,
          }),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        productHistoryUpdated = true;
      }
    }
  }

  await batch.commit();

  return {
    ok: true,
    orderDocId: orderDoc.id,
    orderId: clean(orderData.orderId) || orderDoc.id,
    priority: priorityValue,
    productHistoryUpdated,
  };
};

const movePlanningOrderService = async ({
  orderDocId,
  targetType,
  targetId,
  currentDepartment,
  actorLabel,
  source,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderDoc = await getPlanningOrderDocById(orderDocId, ctx._rds);
  if (!orderDoc) {
    throw new Error('NOT_FOUND_ORDER');
  }

  const orderData = orderDoc.data() || {};
  const safeTargetType = clean(targetType).toLowerCase();
  const safeTargetId = clean(targetId);
  const safeCurrentDepartment = clean(currentDepartment).toLowerCase();

  if (!['department', 'station'].includes(safeTargetType) || !safeTargetId) {
    throw new Error('INVALID_MOVE_TARGET');
  }

  const updates = {
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  };

  let messagePayload = null;

  if (safeTargetType === 'department') {
    const targetUpper = safeTargetId.toUpperCase();
    const targetDepartment = safeTargetId.toLowerCase();
    updates.machine = `${targetUpper}_INBOX`;
    updates.originalMachine = clean(orderData.machine) || null;
    updates.originalDepartment = clean(orderData.department) || safeCurrentDepartment || 'fittings';
    updates.returnStation = clean(orderData.machine) || 'BH11';
    updates.delegatedTo = targetUpper;
    updates.department = targetDepartment;
    updates.delegationDate = admin.firestore.FieldValue.serverTimestamp();
    updates.status = 'delegated';

    messagePayload = {
      to: `${targetUpper}_TEAM`,
      from: 'SYSTEM',
      senderId: 'system-auto',
      subject: `Nieuwe Order: ${clean(orderData.orderId) || orderDoc.id}`,
      content: `Order ${clean(orderData.orderId) || orderDoc.id} is vanuit ${clean(orderData.department) || safeCurrentDepartment || 'fittings'} aangeboden voor ${safeTargetId}.`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      archived: false,
      priority: 'normal',
      type: 'system',
      targetGroup: `${targetUpper}_TEAM`,
    };
  } else {
    updates.machine = safeTargetId;
    updates.status = 'planned';
    updates.delegatedTo = null;
    updates.department = safeCurrentDepartment || clean(orderData.department) || 'fittings';
  }

  const batch = db.batch();
  batch.set(orderDoc.ref, updates, { merge: true });
  if (messagePayload) {
    const messageRef = db.collection(`${BASE}/messages`).doc();
    batch.set(messageRef, messagePayload);
  }
  await batch.commit();

  return {
    ok: true,
    orderDocId: orderDoc.id,
    orderId: clean(orderData.orderId) || orderDoc.id,
    targetType: safeTargetType,
    targetId: safeTargetId,
    machine: updates.machine,
    status: updates.status || clean(orderData.status),
    actorLabel: getActorLabel(auth, actorLabel),
    source: source || null,
  };
};

const retrievePlanningOrderService = async ({ orderDocId, auth, actorLabel, source, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderDoc = await getPlanningOrderDocById(orderDocId, ctx._rds);
  if (!orderDoc) {
    throw new Error('NOT_FOUND_ORDER');
  }

  const orderData = orderDoc.data() || {};
  const nextMachine = clean(orderData.returnStation) || clean(orderData.originalMachine) || 'BH11';
  const nextDepartment = clean(orderData.originalDepartment).toLowerCase() || 'fittings';

  await orderDoc.ref.set({
    machine: nextMachine,
    department: nextDepartment,
    delegatedTo: null,
    status: 'planned',
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    ok: true,
    orderDocId: orderDoc.id,
    orderId: clean(orderData.orderId) || orderDoc.id,
    machine: nextMachine,
    department: nextDepartment,
    actorLabel: getActorLabel(auth, actorLabel),
    source: source || null,
  };
};

const togglePlanningOrderHoldService = async ({ orderDocId, auth, actorLabel, source, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderDoc = await getPlanningOrderDocById(orderDocId, ctx._rds);
  if (!orderDoc) {
    throw new Error('NOT_FOUND_ORDER');
  }

  const orderData = orderDoc.data() || {};
  const currentStatus = clean(orderData.status).toLowerCase();
  const isOnHold = currentStatus === 'on_hold';
  const nextStatus = isOnHold
    ? clean(orderData.previousStatus).toLowerCase() || 'waiting'
    : 'on_hold';

  const updates = {
    status: nextStatus,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (!isOnHold) {
    updates.previousStatus = currentStatus || 'waiting';
  }

  await orderDoc.ref.set(updates, { merge: true });

  return {
    ok: true,
    orderDocId: orderDoc.id,
    orderId: clean(orderData.orderId) || orderDoc.id,
    status: nextStatus,
    wasOnHold: isOnHold,
    actorLabel: getActorLabel(auth, actorLabel),
    source: source || null,
  };
};

const updatePlanningOrderDetailsService = async ({
  orderDocId,
  notes,
  plan,
  actorLabel,
  source,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderDoc = await getPlanningOrderDocById(orderDocId, ctx._rds);
  if (!orderDoc) {
    throw new Error('NOT_FOUND_ORDER');
  }

  const updates = {
    notes: clean(notes),
    poText: clean(notes),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (Number.isFinite(plan)) {
    updates.plan = plan;
  }

  await orderDoc.ref.set(updates, { merge: true });

  const orderData = orderDoc.data() || {};
  return {
    ok: true,
    orderDocId: orderDoc.id,
    orderId: clean(orderData.orderId) || orderDoc.id,
    notes: updates.notes,
    plan: Number.isFinite(plan) ? plan : Number(orderData.plan || 0),
    actorLabel: getActorLabel(auth, actorLabel),
    source: source || null,
  };
};

const patchPlanningOrderMetadataService = async ({
  orderDocId,
  patch,
  actorLabel,
  source,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderDoc = await getPlanningOrderDocById(orderDocId, ctx._rds);
  if (!orderDoc) {
    throw new Error('NOT_FOUND_ORDER');
  }

  const safePatch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const updates = {};

  if ('articleCode' in safePatch) updates.articleCode = clampText(safePatch.articleCode, 120);
  if ('isConverted' in safePatch) updates.isConverted = Boolean(safePatch.isConverted);
  if ('drawingUrl' in safePatch) updates.drawingUrl = clampText(safePatch.drawingUrl, 1500);
  if ('hasDrawing' in safePatch) updates.hasDrawing = Boolean(safePatch.hasDrawing);
  if ('description' in safePatch) updates.description = clampText(safePatch.description, 600);
  if ('drawing' in safePatch) updates.drawing = clampText(safePatch.drawing, 600);
  if ('lastSync' in safePatch) updates.lastSync = clampText(safePatch.lastSync, 80);
  if ('quantity' in safePatch) {
    const q = Number(safePatch.quantity);
    if (!Number.isFinite(q) || q < 0 || q > 1000000) {
      throw new Error('INVALID_PATCH_QUANTITY');
    }
    updates.quantity = q;
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('INVALID_PATCH_PAYLOAD');
  }

  updates.lastUpdated = admin.firestore.FieldValue.serverTimestamp();
  await orderDoc.ref.set(updates, { merge: true });

  const orderData = orderDoc.data() || {};
  return {
    ok: true,
    orderDocId: orderDoc.id,
    orderId: clean(orderData.orderId) || orderDoc.id,
    patchedFields: Object.keys(updates).filter((key) => key !== 'lastUpdated'),
    actorLabel: getActorLabel(auth, actorLabel),
    source: source || null,
  };
};

const saveOccupancyAssignmentsService = async ({
  records,
  source,
  actorLabel,
  auth,
  userRole,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeRecords = Array.isArray(records) ? records : [];
  if (safeRecords.length === 0) {
    throw new Error('INVALID_OCCUPANCY_RECORDS');
  }

  const batch = db.batch();
  let processedCount = 0;

  safeRecords.slice(0, 500).forEach((entry) => {
    const assignmentId = clean(entry?.assignmentId);
    if (!assignmentId) return;

    const updates = sanitizeOccupancyData(entry?.data || {});
    if (Object.keys(updates).length === 0) return;

    const ref = db.doc(`${OCCUPANCY_COLLECTION}/${assignmentId}`);
    if (updates.updatedAt === undefined) {
      updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    batch.set(ref, updates, { merge: true });
    processedCount += 1;
  });

  if (processedCount === 0) {
    throw new Error('INVALID_OCCUPANCY_RECORDS');
  }

  await batch.commit();
  await db.collection(`${BASE}/logs/activity_logs`).add({
    userId: auth?.uid || 'system',
    action: 'OCCUPANCY_SAVE_BATCH',
    details: `Occupancy records opgeslagen: ${processedCount}`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    source: source || null,
    actorLabel: actorLabel || null,
    actorRole: userRole,
  });

  return { ok: true, processedCount };
};

const deleteOccupancyAssignmentsService = async ({
  assignmentIds,
  source,
  actorLabel,
  auth,
  userRole,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeIds = Array.isArray(assignmentIds)
    ? Array.from(new Set(assignmentIds.map((entry) => clean(entry)).filter(Boolean))).slice(0, 500)
    : [];
  if (safeIds.length === 0) {
    throw new Error('INVALID_OCCUPANCY_ASSIGNMENT_IDS');
  }

  const batch = db.batch();
  safeIds.forEach((assignmentId) => {
    batch.delete(db.doc(`${OCCUPANCY_COLLECTION}/${assignmentId}`));
  });
  await batch.commit();

  await db.collection(`${BASE}/logs/activity_logs`).add({
    userId: auth?.uid || 'system',
    action: 'OCCUPANCY_DELETE_BATCH',
    details: `Occupancy records verwijderd: ${safeIds.length}`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    source: source || null,
    actorLabel: actorLabel || null,
    actorRole: userRole,
  });

  return { ok: true, deletedCount: safeIds.length };
};

const savePersonnelRecordService = async ({
  personId,
  data,
  source,
  actorLabel,
  auth,
  userRole,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const updates = sanitizePersonnelData(data || {});
  if (Object.keys(updates).length === 0) {
    throw new Error('INVALID_PERSONNEL_PAYLOAD');
  }

  const ref = personId
    ? db.doc(`${PERSONNEL_COLLECTION}/${clean(personId)}`)
    : db.collection(PERSONNEL_COLLECTION).doc();

  if (updates.updatedAt === undefined) {
    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  }

  await ref.set(updates, { merge: true });
  await db.collection(`${BASE}/logs/activity_logs`).add({
    userId: auth?.uid || 'system',
    action: personId ? 'PERSONNEL_SAVE' : 'PERSONNEL_CREATE',
    details: `Personeelsrecord opgeslagen: ${clean(updates.name) || ref.id}`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    source: source || null,
    actorLabel: actorLabel || null,
    actorRole: userRole,
    personId: ref.id,
  });

  return { ok: true, personId: ref.id };
};

const assignOverproductionService = async ({
  targetOrderDocId,
  targetOrderId,
  productIds,
  routeStation,
  sourceOrderId,
  originMachine,
  actorLabel,
  source,
  auth,
  userRole,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const targetOrderDoc = await getPlanningOrderDocById(targetOrderDocId, ctx._rds);
  if (!targetOrderDoc) {
    throw new Error('NOT_FOUND_TARGET_ORDER');
  }

  const safeTargetOrderId = clean(targetOrderId);
  const safeRouteStation = clean(routeStation);
  const safeSourceOrderId = clean(sourceOrderId);
  const safeOriginMachine = clean(originMachine);
  const userLabel = getActorLabel(auth, actorLabel);
  const routeState = getStepForStationServer(safeRouteStation);
  const productIdList = Array.from(new Set((Array.isArray(productIds) ? productIds : []).map((id) => clean(id)).filter(Boolean)));

  if (!safeTargetOrderId || !safeRouteStation || productIdList.length === 0) {
    throw new Error('INVALID_OVERPRODUCTION_PAYLOAD');
  }

  const targetOrderData = targetOrderDoc.data() || {};
  const productSnapshots = await Promise.all(
    productIdList.map(async (productId) => {
      const snap = await db.collection(ctx.trackingPath).doc(productId).get();
      return snap.exists ? snap : null;
    })
  );
  const existingProducts = productSnapshots.filter(Boolean);

  if (existingProducts.length === 0) {
    throw new Error('NOT_FOUND_OVERPRODUCTION_PRODUCTS');
  }

  const nowIso = new Date().toISOString();
  const batch = db.batch();

  existingProducts.forEach((productSnap) => {
    batch.set(productSnap.ref, {
      orderId: safeTargetOrderId,
      currentStation: safeRouteStation,
      currentStep: routeState.currentStep || 'Nabewerking',
      status: routeState.status || 'Te Nabewerken',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      overproductionResolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      overproductionResolvedBy: userLabel,
      overproductionAssignedOrderId: safeTargetOrderId,
      overproductionRoutingStation: safeRouteStation,
      note: `Overproduction linked to order ${safeTargetOrderId} and forwarded to ${safeRouteStation}`,
      'timestamps.overproduction_assigned': admin.firestore.FieldValue.serverTimestamp(),
      'timestamps.routing_override': nowIso,
      history: admin.firestore.FieldValue.arrayUnion({
        action: 'Overproduction Linked',
        timestamp: nowIso,
        user: userLabel,
        station: safeRouteStation,
        details: `Linked to order ${safeTargetOrderId} via ${safeRouteStation}`,
        source: source || null,
      }),
    }, { merge: true });
  });

  batch.set(targetOrderDoc.ref, {
    machine: safeRouteStation,
    status: routeState.status || 'Te Nabewerken',
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    overproductionLinkedCount: admin.firestore.FieldValue.increment(existingProducts.length),
    overproductionLastLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
    overproductionSourceOrderId: safeSourceOrderId || null,
  }, { merge: true });

  if (safeSourceOrderId) {
    const originalOrderDoc = await getPlanningOrderDocByOrderId(safeSourceOrderId, ctx._rds);
    if (originalOrderDoc) {
      const startedField = getSafeStartedField(safeOriginMachine);
      const currentStarted = Number((originalOrderDoc.data() || {})[startedField] || 0);
      if (startedField) {
        batch.set(originalOrderDoc.ref, {
          [startedField]: Math.max(0, currentStarted - existingProducts.length),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
  }

  const messageRef = db.collection(`${BASE}/messages`).doc();
  batch.set(messageRef, {
    to: clean(auth?.token?.email).toLowerCase() || 'admin',
    from: 'SYSTEM',
    senderId: 'system-auto',
    subject: `Overproduction linked: ${safeTargetOrderId}`,
    content: `${existingProducts.length} extra products from ${safeSourceOrderId || 'unknown'} have been linked to ${safeTargetOrderId} and forwarded to ${safeRouteStation}.`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    archived: false,
    priority: 'normal',
    type: 'system',
  });

  await batch.commit();

  await db.collection(`${BASE}/logs/activity_logs`).add({
    userId: auth?.uid || 'system',
    action: 'OVERPRODUCTION_ASSIGN',
    details: `Overproduction linked: ${existingProducts.length} pieces from ${safeSourceOrderId || 'unknown'} -> ${safeTargetOrderId}, station ${safeRouteStation}`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    source: source || null,
    actorLabel: userLabel,
    actorRole: userRole,
    targetOrderId: safeTargetOrderId,
    sourceOrderId: safeSourceOrderId || null,
    routeStation: safeRouteStation,
    linkedCount: existingProducts.length,
  });

  return {
    ok: true,
    targetOrderDocId: targetOrderDoc.id,
    targetOrderId: clean(targetOrderData.orderId) || safeTargetOrderId,
    routeStation: safeRouteStation,
    linkedCount: existingProducts.length,
  };
};

const tempRejectTrackedProductService = async ({
  productId,
  reasons,
  note,
  station,
  actorLabel,
  previousStep,
  previousStatus,
  source,
  auth,
  userRole,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const trackedDoc = await getTrackedProductDocByIdOrLot(productId, ctx._rds);
  if (!trackedDoc) {
    throw new Error('NOT_FOUND_PRODUCT');
  }

  const trackedData = trackedDoc.data() || {};
  const userLabel = getActorLabel(auth, actorLabel);
  const timestampIso = new Date().toISOString();
  const stationLabel = clean(station) || clean(trackedData.currentStation) || clean(trackedData.machine) || 'Onbekend';

  const updatePayload = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    note: clean(note) || '',
    processedBy: userLabel,
    status: 'Tijdelijke afkeur',
    currentStep: 'HOLD_AREA',
    inspection: {
      status: 'Tijdelijke afkeur',
      reasons,
      timestamp: timestampIso,
    },
    history: admin.firestore.FieldValue.arrayUnion({
      action: 'Tijdelijke Afkeur',
      timestamp: timestampIso,
      user: userLabel,
      station: stationLabel,
      details: `Reden: ${reasons.join(', ')}${note ? ` - ${note}` : ''}`,
      source: source || null,
    }),
  };

  const safePreviousStep = clean(previousStep);
  const safePreviousStatus = clean(previousStatus);
  if (safePreviousStep) updatePayload.previousStep = safePreviousStep;
  if (safePreviousStatus) updatePayload.previousStatus = safePreviousStatus;

  await trackedDoc.ref.set(updatePayload, { merge: true });

  await db.collection(`${BASE}/logs/activity_logs`).add({
    userId: auth?.uid || 'system',
    action: 'QUALITY_TEMP_REJECT',
    details: `Temporary reject for lot ${clean(trackedData.lotNumber) || trackedDoc.id} at ${stationLabel}`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    source: source || null,
    actorLabel: userLabel,
    actorRole: userRole,
    productId: trackedDoc.id,
    orderId: clean(trackedData.orderId) || null,
  });

  return {
    ok: true,
    productId: trackedDoc.id,
    lotNumber: clean(trackedData.lotNumber) || trackedDoc.id,
    currentStep: 'HOLD_AREA',
    status: 'Tijdelijke afkeur',
  };
};

const advanceTrackedProductService = async ({
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
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const trackedDoc = await getTrackedProductDocByIdOrLot(productId, ctx._rds);
  if (!trackedDoc) {
    throw new Error('NOT_FOUND_PRODUCT');
  }

  const trackedData = trackedDoc.data() || {};
  const userLabel = getActorLabel(auth, actorLabel);
  const safeNextStep = clean(nextStep);
  const safeNextStatus = clean(nextStatus);
  const safeNextStation = clean(nextStation);
  const safeLastStation = clean(lastStation) || clean(trackedData.currentStation) || clean(trackedData.machine) || 'Onbekend';
  const safePreviousStep = clean(previousStep);
  const safeNote = clean(note);
  const safeHistoryAction = clean(historyAction) || 'Stap Voltooid';
  const safeHistoryDetails = clampText(historyDetails, 600) || `Doorgestuurd naar ${safeNextStep}`;

  if (!safeNextStep || !safeNextStatus) {
    throw new Error('INVALID_ADVANCE_TARGET');
  }

  const updatePayload = {
    currentStep: safeNextStep,
    status: safeNextStatus,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    note: safeNote,
    history: admin.firestore.FieldValue.arrayUnion({
      action: safeHistoryAction,
      timestamp: new Date().toISOString(),
      user: userLabel,
      details: safeHistoryDetails,
      station: safeLastStation,
      source: source || null,
    }),
  };

  if (safeNextStation) {
    updatePayload.currentStation = safeNextStation;
  }

  if (shouldClearTemporaryInspection({ trackedData, nextStation: safeNextStation })) {
    updatePayload.inspection = admin.firestore.FieldValue.delete();
  }

  if (safeLastStation) {
    updatePayload.lastStation = safeLastStation;
  }

  if (safePreviousStep) {
    updatePayload[`timestamps.${safePreviousStep.toLowerCase()}_end`] = admin.firestore.FieldValue.serverTimestamp();
  }

  if (safeNextStep) {
    updatePayload[`timestamps.${safeNextStep.toLowerCase()}_start`] = admin.firestore.FieldValue.serverTimestamp();
  }

  if (clearManualMove) {
    updatePayload.isManualMove = false;
  }

  const safeMeasurements = sanitizeMeasurements(measurements);
  if (safeMeasurements) {
    updatePayload.measurements = safeMeasurements;
  }

  await trackedDoc.ref.set(updatePayload, { merge: true });

  return {
    ok: true,
    productId: trackedDoc.id,
    lotNumber: clean(trackedData.lotNumber) || trackedDoc.id,
    currentStep: safeNextStep,
    status: safeNextStatus,
    currentStation: safeNextStation || clean(trackedData.currentStation) || null,
  };
};

const completeTrackedProductRepairService = async ({
  productId,
  station,
  actions,
  note,
  actorLabel,
  source,
  auth,
  userRole,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const trackedDoc = await getTrackedProductDocByIdOrLot(productId, ctx._rds);
  if (!trackedDoc) {
    throw new Error('NOT_FOUND_PRODUCT');
  }

  const trackedData = trackedDoc.data() || {};
  const userLabel = getActorLabel(auth, actorLabel);
  const safeStation = clean(station) || 'BH31';
  const safeActions = Array.isArray(actions)
    ? actions.map((entry) => clampText(entry, 120)).filter(Boolean).slice(0, 20)
    : [];
  const safeNote = clampText(note, 600);
  const existingNote = clampText(trackedData.note, 1200);
  const mergedNote = [existingNote, safeNote ? `Reparatie: ${safeNote}` : 'Reparatie voltooid']
    .filter(Boolean)
    .join('\n');

  await trackedDoc.ref.set({
    currentStation: 'BM01',
    currentStep: 'Eindinspectie',
    status: 'Te Keuren',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    repairActive: false,
    inspection: admin.firestore.FieldValue.delete(),
    note: mergedNote,
    'timestamps.bm01_start': admin.firestore.FieldValue.serverTimestamp(),
    'timestamps.repair_end': admin.firestore.FieldValue.serverTimestamp(),
    history: admin.firestore.FieldValue.arrayUnion({
      action: 'Reparatie Voltooid',
      timestamp: new Date().toISOString(),
      user: userLabel,
      station: safeStation,
      details: `Acties: ${safeActions.join(', ')}${safeNote ? `. ${safeNote}` : ''}`,
      source: source || null,
    }),
  }, { merge: true });

  await db.collection(`${BASE}/logs/activity_logs`).add({
    userId: auth?.uid || 'system',
    action: 'QUALITY_REPAIR_COMPLETE',
    details: `Repair complete for lot ${clean(trackedData.lotNumber) || trackedDoc.id}: ${safeStation} -> BM01`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    source: source || null,
    actorLabel: userLabel,
    actorRole: userRole,
    productId: trackedDoc.id,
    orderId: clean(trackedData.orderId) || null,
  });

  return {
    ok: true,
    productId: trackedDoc.id,
    lotNumber: clean(trackedData.lotNumber) || trackedDoc.id,
    currentStation: 'BM01',
    currentStep: 'Eindinspectie',
    status: 'Te Keuren',
  };
};

const archiveRejectedTrackedProductService = async ({
  productId,
  actorLabel,
  source,
  auth,
  userRole,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const trackedDoc = await getTrackedProductDocByIdOrLot(productId, ctx._rds);
  if (!trackedDoc) {
    throw new Error('NOT_FOUND_PRODUCT');
  }

  const trackedData = trackedDoc.data() || {};
  const userLabel = getActorLabel(auth, actorLabel);
  const safeProductId = clean(trackedData.lotNumber) || trackedDoc.id;

  await trackedDoc.ref.set({
    status: 'archived_rejected',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    history: admin.firestore.FieldValue.arrayUnion({
      action: 'Afkeur Afgesloten',
      timestamp: new Date().toISOString(),
      user: userLabel,
      station: clean(trackedData.currentStation) || clean(trackedData.machine) || 'Onbekend',
      details: 'Definitieve afkeur administratief afgesloten',
      source: source || null,
    }),
  }, { merge: true });

  await db.collection(`${BASE}/logs/activity_logs`).add({
    userId: auth?.uid || 'system',
    action: 'QUALITY_REJECT_ARCHIVE',
    details: `Rejected lot archived: ${safeProductId}`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    source: source || null,
    actorLabel: userLabel,
    actorRole: userRole,
    productId: trackedDoc.id,
    orderId: clean(trackedData.orderId) || null,
  });

  return {
    ok: true,
    productId: trackedDoc.id,
    lotNumber: safeProductId,
    status: 'archived_rejected',
  };
};

const routeTrackedProductsToLossenService = async ({
  productIds,
  originStation,
  centralStation,
  centralOperators,
  actorLabel,
  source,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeOriginStation = clean(originStation) || 'LOSSEN';
  const safeCentralStation = clean(centralStation) || 'LOSSEN';
  const safeOperators = Array.isArray(centralOperators)
    ? Array.from(new Set(centralOperators.map((entry) => clean(entry)).filter(Boolean))).slice(0, 50)
    : [];
  const uniqueProductIds = Array.from(new Set((Array.isArray(productIds) ? productIds : []).map((entry) => clean(entry)).filter(Boolean)));

  if (uniqueProductIds.length === 0) {
    throw new Error('NO_PRODUCTS_TO_ROUTE');
  }

  const userLabel = getActorLabel(auth, actorLabel);
  const batch = db.batch();
  let routedCount = 0;
  let localRouteCount = 0;

  for (const productId of uniqueProductIds) {
    const trackedDoc = await getTrackedProductDocByIdOrLot(productId, ctx._rds);
    if (!trackedDoc) continue;

    const trackedData = trackedDoc.data() || {};
    const itemText = `${trackedData.item || ''} ${trackedData.description || ''} ${trackedData.itemCode || ''}`;
    const lossenRoute = getLossenRouteServer(itemText, safeOriginStation);
    const nextStation = lossenRoute.mode === 'STATION'
      ? clean(lossenRoute.station) || safeCentralStation
      : safeOriginStation;

    if (lossenRoute.mode !== 'STATION') {
      localRouteCount += 1;
    }

    batch.set(trackedDoc.ref, {
      currentStation: nextStation,
      currentStep: 'Wacht op Lossen',
      status: 'Te Lossen',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      'timestamps.lossen_start': admin.firestore.FieldValue.serverTimestamp(),
      ...(safeOperators.length > 0 ? { 'personnelTracking.LOSSEN': safeOperators } : {}),
      history: admin.firestore.FieldValue.arrayUnion({
        action: 'Stap Voltooid',
        timestamp: new Date().toISOString(),
        user: userLabel,
        details: `Doorgestuurd naar lossen via ${nextStation}`,
        station: safeOriginStation,
        source: source || null,
      }),
    }, { merge: true });

    routedCount += 1;
  }

  if (routedCount === 0) {
    throw new Error('NO_PRODUCTS_FOUND');
  }

  await batch.commit();

  return {
    ok: true,
    routedCount,
    localRouteCount,
    switchedToLossenTab: localRouteCount > 0,
  };
};

const startWorkstationProductionRunService = async ({
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
  auth,
  runtimeDataSource,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderDoc = await getPlanningOrderDocById(orderDocId, ctx._rds);
  if (!orderDoc) {
    throw new Error('NOT_FOUND_ORDER');
  }

  // path resolved via ctx
  const orderData = orderDoc.data() || {};
  const safeLotStart = clean(lotStart).toUpperCase();
  const safeStationId = clean(stationId);
  const qty = Math.max(1, parseInt(String(stringCount || 1), 10) || 1);
  const safeLabelTemplateId = clean(labelTemplateId);
  const safeSeriesGroupId = clean(seriesGroupId);
  const safeOperators = Array.isArray(stationOperators)
    ? Array.from(new Set(stationOperators.map((entry) => clean(entry)).filter(Boolean))).slice(0, 50)
    : [];

  if (!safeLotStart || !safeStationId) {
    throw new Error('INVALID_WORKSTATION_START_PAYLOAD');
  }

  const lotMatch = safeLotStart.match(/^(.*?)(\d+)$/);
  if (!lotMatch) {
    throw new Error('INVALID_LOT_FORMAT');
  }

  const prefix = lotMatch[1] || '';
  const startSeq = Number(lotMatch[2]);
  if (!Number.isFinite(startSeq)) {
    throw new Error('INVALID_LOT_SEQUENCE');
  }

  const orderId = clean(orderData.orderId);
  const item = clean(orderData.item);
  const drawing = clean(orderData.drawing);
  const userLabel = getActorLabel(auth, actorLabel);
  const nowIso = new Date().toISOString();
  const stationField = getStartedCounterFieldServer(safeStationId);
  const persistedStartedCount = Number(orderData[stationField] || 0);

  const activeStartedSnap = await db
    .collection(ctx.trackingPath)
    .where('orderId', '==', orderId)
    .where('originMachine', '==', safeStationId)
    .limit(600)
    .get();

  const activeStartedCount = activeStartedSnap.docs.filter((snap) => {
    const data = snap.data() || {};
    const statusUpper = clean(data.status).toUpperCase();
    const stepUpper = clean(data.currentStep).toUpperCase();
    return statusUpper !== 'REJECTED' && stepUpper !== 'REJECTED';
  }).length;

  const currentStartedCount = Math.max(persistedStartedCount, activeStartedCount);
  const plannedAmount = Number(orderData.plan || 0);

  const buildLotSpecificLabelZpl = (targetLotNumber) => {
    const baseZpl = typeof labelZplData === 'string' ? labelZplData : '';
    if (!baseZpl.trim()) return null;
    if (!safeLotStart || targetLotNumber === safeLotStart) return baseZpl;
    return baseZpl.split(safeLotStart).join(targetLotNumber);
  };

  const createdLots = [];
  const overflowLots = [];
  const batch = db.batch();
  const flowState = getNextFlowStateServer('START_WINDING');

  for (let i = 0; i < qty; i += 1) {
    const currentSeq = startSeq + i;
    const currentLotNumber = `${prefix}${String(currentSeq).padStart(4, '0')}`;
    const isOverflow = currentStartedCount + i + 1 > plannedAmount;
    const lotSpecificLabelZpl = buildLotSpecificLabelZpl(currentLotNumber);
    const labelAudit = lotSpecificLabelZpl
      ? {
        timestamp: nowIso,
        user: userLabel,
        station: safeStationId,
        source: 'production_start',
        templateId: safeLabelTemplateId || null,
      }
      : null;

    const unitData = {
      lotNumber: currentLotNumber,
      orderId: isOverflow ? 'NOG_TE_BEPALEN' : orderId,
      item,
      drawing,
      originMachine: safeStationId,
      currentStation: safeStationId,
      currentStep: flowState.currentStep || 'Wikkelen',
      status: flowState.status || 'In Productie',
      startTime: nowIso,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      operator: userLabel,
      timestamps: {
        wikkelen_start: admin.firestore.FieldValue.serverTimestamp(),
        station_start: admin.firestore.FieldValue.serverTimestamp(),
      },
      personnelTracking: {
        [safeStationId]: safeOperators,
      },
      labelZPL: lotSpecificLabelZpl,
      labelTemplateId: safeLabelTemplateId || null,
      labelLastPrint: labelAudit,
    };

    if (safeSeriesGroupId) {
      unitData.seriesGroupId = safeSeriesGroupId;
      unitData.seriesIndex = i + 1;
      unitData.seriesSize = qty;
      unitData.seriesOrderNumber = orderId;
      unitData.isFlangeSeries = Boolean(isFlangeSeries);
    }

    if (isOverflow) {
      unitData.isOverproduction = true;
      unitData.originalOrderId = orderId;
      unitData.note = 'Overproductie uit string-run';
      overflowLots.push(currentLotNumber);
    }

    batch.set(db.collection(ctx.trackingPath).doc(currentLotNumber), unitData, { merge: true });
    createdLots.push(currentLotNumber);
  }

  if (clean(orderData.status).toLowerCase() !== 'completed') {
    batch.set(orderDoc.ref, {
      status: 'in_progress',
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      ...(stationField ? { [stationField]: currentStartedCount + qty } : {}),
    }, { merge: true });
  }

  await batch.commit();

  return {
    ok: true,
    orderDocId: orderDoc.id,
    orderId,
    createdLots,
    overflowLots,
    plannedAmount,
    currentStartedCount,
    stationField,
    source: source || null,
  };
};

const getNextFlowStateServer = (eventType = '') => {
  const type = String(eventType || '').toUpperCase();
  if (type === 'START_WINDING') {
    return { currentStep: 'Wikkelen', status: 'In Productie' };
  }
  if (type === 'FINISH_WINDING') {
    return { currentStep: 'Wacht op Lossen', status: 'Te Lossen' };
  }
  return { currentStep: 'Wikkelen', status: 'In Productie' };
};

const toggleTrackedProductPauseService = async ({
  productId,
  note,
  actorLabel,
  source,
  auth,
  userRole,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const trackedDoc = await getTrackedProductDocByIdOrLot(productId, ctx._rds);
  if (!trackedDoc) {
    throw new Error('NOT_FOUND_PRODUCT');
  }

  const trackedData = trackedDoc.data() || {};
  const currentStatus = clean(trackedData.status);
  const isPaused = currentStatus === 'PAUSED';
  const nextStatus = isPaused ? 'In Production' : 'PAUSED';
  const userLabel = getActorLabel(auth, actorLabel);
  const safeNote = clean(note);

  await trackedDoc.ref.set({
    status: nextStatus,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(safeNote ? { note: safeNote } : {}),
    history: admin.firestore.FieldValue.arrayUnion({
      action: isPaused ? 'Productie Hervat' : 'Productie Gepauzeerd',
      timestamp: new Date().toISOString(),
      user: userLabel,
      station: clean(trackedData.currentStation) || clean(trackedData.machine) || 'Onbekend',
      details: safeNote || null,
      source: source || null,
    }),
  }, { merge: true });

  await db.collection(`${BASE}/logs/activity_logs`).add({
    userId: auth?.uid || 'system',
    action: isPaused ? 'PRODUCTION_RESUME' : 'PRODUCTION_PAUSE',
    details: `Tracked product ${clean(trackedData.lotNumber) || trackedDoc.id} status: ${currentStatus || 'unknown'} -> ${nextStatus}`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    source: source || null,
    actorLabel: userLabel,
    actorRole: userRole,
    productId: trackedDoc.id,
    orderId: clean(trackedData.orderId) || null,
  });

  return {
    ok: true,
    productId: trackedDoc.id,
    status: nextStatus,
    wasPaused: isPaused,
  };
};

const markTrackedProductReminderService = async ({
  productId,
  reminderSent,
  source,
  actorLabel,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const trackedDoc = await getTrackedProductDocByIdOrLot(productId, ctx._rds);
  if (!trackedDoc) {
    throw new Error('NOT_FOUND_PRODUCT');
  }

  const safeReminderSent = reminderSent !== false;
  const userLabel = getActorLabel(auth, actorLabel);

  await trackedDoc.ref.set({
    reminderSent: safeReminderSent,
    reminderSentAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    history: admin.firestore.FieldValue.arrayUnion({
      action: 'Reminder Status Bijgewerkt',
      timestamp: new Date().toISOString(),
      user: userLabel,
      station: clean(trackedDoc.data()?.currentStation) || clean(trackedDoc.data()?.machine) || 'Onbekend',
      details: `reminderSent=${safeReminderSent}`,
      source: source || null,
    }),
  }, { merge: true });

  return {
    ok: true,
    productId: trackedDoc.id,
    reminderSent: safeReminderSent,
  };
};

const getLossenRouteServer = (itemText, originStation = '') => {
  const originNorm = String(originStation || '').toUpperCase().replace(/\s/g, '');
  if (['BH12', 'BH15', 'BH17'].includes(originNorm)) {
    return { mode: 'STATION', station: 'LOSSEN 12/18' };
  }

  const text = String(itemText || '').toUpperCase();
  const isTB = text.includes('TB');
  const isCB = text.includes('CB');
  const isELB = text.includes('ELB');
  const isAB = /\bAB\b/.test(text) || text.includes('ABAB');
  const isSB = /\bSB\b/.test(text);
  const isElbow = isELB || isCB;
  if (isElbow && (isAB || isSB)) return { mode: 'STATION', station: 'LOSSEN' };

  const numberMatches = Array.from(text.matchAll(/\d{2,4}/g)).map((match) => Number(match[0]));
  const candidates = numberMatches.filter((value) => Number.isFinite(value) && value >= 25 && value <= 2000);
  const diameter = candidates.length > 0 ? candidates[0] : 0;

  if (isTB && diameter >= 300) return { mode: 'STATION', station: 'LOSSEN' };
  if ((isCB || isELB) && diameter >= 350) return { mode: 'STATION', station: 'LOSSEN' };

  return { mode: 'TAB', station: originNorm || '' };
};

const cancelPlanningOrderService = async ({
  orderDocId,
  reason,
  actorLabel,
  source,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderDoc = await getPlanningOrderDocById(orderDocId, ctx._rds);
  if (!orderDoc) {
    throw new Error('NOT_FOUND_ORDER');
  }

  const userLabel = actorLabel || clean(auth?.token?.name) || clean(auth?.token?.email) || auth?.uid;
  const cleanReason = clean(reason);

  await orderDoc.ref.set({
    status: 'cancelled',
    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    cancelledBy: auth.uid,
    cancelledByLabel: userLabel,
    cancellationReason: cleanReason || null,
    cancellationSource: source || null,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const orderData = orderDoc.data() || {};
  return {
    ok: true,
    orderDocId: orderDoc.id,
    orderId: clean(orderData.orderId) || orderDoc.id,
    status: 'cancelled',
  };
};

const assignPersonnelToStationService = async ({
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
  auth,
  userRole,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeDate = clean(date);
  const machineId = clean(stationId);
  const opId = clean(operatorId);
  const assignmentId = `${machineId}-${opId}-${safeDate}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const occupancyRef = db.doc(`${BASE}/production/machine_occupancy/${assignmentId}`);

  const parsedDate = new Date(`${safeDate}T00:00:00.000Z`);
  const { week, year } = Number.isNaN(parsedDate.getTime())
    ? getISOWeekInfoServer(new Date())
    : getISOWeekInfoServer(parsedDate);

  await occupancyRef.set({
    machineId,
    operatorNumber: clean(operatorNumber) || opId,
    operatorName: clean(operatorName) || opId,
    date: safeDate,
    week,
    weekYear: year,
    departmentId: clean(departmentId) || null,
    hoursWorked: Number.isFinite(Number(hoursWorked)) ? Number(hoursWorked) : 8,
    shiftType: clean(shiftType) || 'DAG',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection(`${BASE}/logs/activity_logs`).add({
    userId: auth?.uid || 'system',
    action: 'PERSONNEL_ASSIGN',
    details: `Operator toegewezen: ${clean(operatorName) || opId} -> station ${machineId} (${safeDate})`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    source: source || null,
    actorLabel: actorLabel || null,
    actorRole: userRole,
    assignmentId,
  });

  return {
    ok: true,
    assignmentId,
    stationId: machineId,
    operatorId: opId,
  };
};

const removePersonnelAssignmentService = async ({
  assignmentId,
  stationId,
  source,
  actorLabel,
  auth,
  userRole,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeAssignmentId = clean(assignmentId);
  const occupancyRef = db.doc(`${BASE}/production/machine_occupancy/${safeAssignmentId}`);
  const snap = await occupancyRef.get();
  if (!snap.exists) {
    throw new Error('NOT_FOUND_ASSIGNMENT');
  }

  await occupancyRef.delete();

  await db.collection(`${BASE}/logs/activity_logs`).add({
    userId: auth?.uid || 'system',
    action: 'PERSONNEL_UNASSIGN',
    details: `Operator toewijzing verwijderd: ${safeAssignmentId} op station ${clean(stationId) || 'onbekend'}`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    source: source || null,
    actorLabel: actorLabel || null,
    actorRole: userRole,
    assignmentId: safeAssignmentId,
  });

  return {
    ok: true,
    assignmentId: safeAssignmentId,
    removed: true,
  };
};

const loanPersonnelService = async ({
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
  auth,
  userRole,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeDate = clean(date);
  const loanRef = db.collection(`${BASE}/production/machine_occupancy`).doc();

  await loanRef.set({
    operatorNumber: clean(operatorNumber),
    operatorName: clean(operatorName),
    machineId: clean(targetStation),
    departmentId: clean(targetDepartment),
    date: safeDate,
    shift: clean(shiftLabel),
    shiftStart: clean(shiftStart),
    shiftEnd: clean(shiftEnd),
    hoursWorked: Number.isFinite(Number(hoursWorked)) ? Number(hoursWorked) : 8,
    isPloeg: Boolean(isPloeg),
    isLoan: true,
    loanFromDepartment: clean(loanFromDepartment),
    loanFromStation: clean(loanFromStation),
    originalShift: clean(originalShift),
    timestamp: new Date().toISOString(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection(`${BASE}/logs/activity_logs`).add({
    userId: auth?.uid || 'system',
    action: 'PERSONNEL_LOAN',
    details: `Personeel uitgeleend: ${clean(operatorName) || clean(operatorNumber)} van ${clean(loanFromDepartment)} naar ${clean(targetDepartment)} (${clean(targetStation)}, ${clean(shiftLabel)})`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    source: source || null,
    actorLabel: actorLabel || null,
    actorRole: userRole,
    assignmentId: loanRef.id,
  });

  return {
    ok: true,
    assignmentId: loanRef.id,
    stationId: clean(targetStation),
    departmentId: clean(targetDepartment),
  };
};

const startProductionLotsService = async ({
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
  runtimeDataSource,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeOrderDocId = clean(orderDocId);
  const safeOrderId = clean(orderId);
  const safeItemCode = clean(itemCode);
  const safeLotStart = clean(lotStart).toUpperCase();
  const safeStationId = clean(stationId);
  const safeStationLabel = clean(stationLabel);
  const qty = Math.max(1, parseInt(String(totalToProduce || 1), 10) || 1);

  const lotMatch = safeLotStart.match(/^(.*?)(\d+)$/);
  const buildLotNumber = (offset) => {
    if (!lotMatch) {
      return offset === 0 ? safeLotStart : `${safeLotStart}_${offset + 1}`;
    }
    const prefix = lotMatch[1] || '';
    const numericPart = lotMatch[2] || '';
    const width = numericPart.length;
    const startSequence = Number(numericPart);
    if (!Number.isFinite(startSequence)) {
      return offset === 0 ? safeLotStart : `${safeLotStart}_${offset + 1}`;
    }
    return `${prefix}${String(startSequence + offset).padStart(width, '0')}`;
  };

  const buildLotSpecificLabelZpl = (targetLot) => {
    const cleanZpl = typeof labelZplData === 'string' ? labelZplData : '';
    if (!cleanZpl) return null;
    if (!safeLotStart || targetLot === safeLotStart) return cleanZpl;
    return cleanZpl.split(safeLotStart).join(targetLot);
  };

  
  const createdLots = [];
  const nowIso = new Date().toISOString();
  const batch = db.batch();

  for (let i = 0; i < qty; i += 1) {
    const currentLot = buildLotNumber(i);
    const docId = `${safeOrderId}_${safeItemCode}_${currentLot}`.replace(/[^a-zA-Z0-9]/g, '_');
    const lotSpecificLabelZpl = buildLotSpecificLabelZpl(currentLot);

    batch.set(db.doc(`${ctx.trackingPath}/${docId}`), {
      id: docId,
      orderId: safeOrderId,
      lotNumber: currentLot,
      itemCode: safeItemCode,
      machine: safeStationId,
      stationLabel: safeStationLabel,
      status: 'In Production',
      currentStation: safeStationId,
      currentStep: 'Wikkelen',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      history: [{
        action: 'Start Wikkelen',
        station: safeStationLabel,
        timestamp: nowIso,
        user: actorLabel || 'Operator',
      }],
      item: clean(item),
      labelZPL: lotSpecificLabelZpl,
      labelTemplateId: labelTemplateId || null,
      labelLastPrint: lotSpecificLabelZpl
        ? {
          timestamp: nowIso,
          user: actorLabel || 'Operator',
          station: safeStationId,
          source: 'production_start',
          templateId: labelTemplateId || null,
        }
        : null,
      ...(seriesGroupId
        ? {
          seriesGroupId,
          seriesIndex: i + 1,
          seriesSize: qty,
          seriesOrderNumber: safeOrderId,
          isFlangeSeries: Boolean(isFlangeSeries),
        }
        : {}),
    });

    createdLots.push(currentLot);
  }

  const startedCounterField = getStartedCounterFieldServer(safeStationId);
  const planningRef = safeOrderDocId
    ? db.doc(`${ctx.planningPath}/${safeOrderDocId}`)
    : null;
  if (planningRef) {
    const planningUpdates = {
      status: 'in_progress',
      activeLot: createdLots[0] || safeLotStart,
      actualStart: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (startedCounterField) {
      planningUpdates[startedCounterField] = admin.firestore.FieldValue.increment(qty);
    }
    batch.set(planningRef, planningUpdates, { merge: true });
  }

  await batch.commit();

  return {
    ok: true,
    createdLots,
    totalCreated: createdLots.length,
    firstLot: createdLots[0] || safeLotStart,
    startedCounterField,
  };
};

const editTrackedProductLotNumberService = async ({
  productId,
  newLotNumber,
  reason,
  actorLabel,
  source,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const trackedDoc = await getTrackedProductDocByIdOrLot(productId, ctx._rds);
  if (!trackedDoc) {
    throw new Error('NOT_FOUND_PRODUCT');
  }

  const trackedData = trackedDoc.data() || {};
  const oldLotNumber = clean(trackedData.lotNumber) || trackedDoc.id;
  const safeNewLotNumber = clean(newLotNumber).toUpperCase();
  const safeReason = clampText(reason, 300);

  if (!safeNewLotNumber || !safeReason) {
    throw new Error('INVALID_LOT_EDIT_PAYLOAD');
  }
  if (safeNewLotNumber === oldLotNumber) {
    throw new Error('LOT_NUMBER_UNCHANGED');
  }

  const duplicateSnap = await db
    .collection(TRACKING_COLLECTION)
    .where('lotNumber', '==', safeNewLotNumber)
    .limit(5)
    .get();
  const duplicateExists = duplicateSnap.docs.some((docSnap) => docSnap.id !== trackedDoc.id);
  if (duplicateExists) {
    throw new Error('LOT_NUMBER_EXISTS');
  }

  const userLabel = getActorLabel(auth, actorLabel);
  const historyEntry = {
    action: 'Lotnummer gewijzigd',
    timestamp: new Date().toISOString(),
    station: clean(trackedData.currentStation) || 'Teamleader',
    user: userLabel,
    details: `${oldLotNumber} -> ${safeNewLotNumber} | Reden: ${safeReason}`,
    source: source || null,
  };

  await trackedDoc.ref.set({
    lotNumber: safeNewLotNumber,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    history: admin.firestore.FieldValue.arrayUnion(historyEntry),
  }, { merge: true });

  return {
    ok: true,
    productId: trackedDoc.id,
    oldLotNumber,
    lotNumber: safeNewLotNumber,
  };
};

const linkPlanningOrderProductService = async ({
  orderDocId,
  productId,
  productImage,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderDoc = await getPlanningOrderDocById(orderDocId, ctx._rds);
  if (!orderDoc) {
    throw new Error('NOT_FOUND_ORDER');
  }

  await orderDoc.ref.set({
    linkedProductId: clean(productId),
    linkedProductImage: clampText(productImage, 600),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    ok: true,
    orderDocId: orderDoc.id,
    linkedProductId: clean(productId),
  };
};

const createPlanningOrderManualService = async ({
  orderId,
  item,
  machine,
  plan,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeOrderId = clean(orderId);
  const safeItem = clampText(item, 220);
  const safeMachine = clean(machine);
  const safePlan = Number(plan);

  if (!safeOrderId || !safeItem || !safeMachine || !Number.isFinite(safePlan) || safePlan <= 0) {
    throw new Error('INVALID_MANUAL_ORDER_PAYLOAD');
  }

  const existingSnap = await db
    .collection(PLANNING_COLLECTION)
    .where('orderId', '==', safeOrderId)
    .limit(1)
    .get();
  if (!existingSnap.empty) {
    throw new Error('ORDER_ALREADY_EXISTS');
  }

  const now = new Date();
  const { week, year } = getISOWeekInfoServer(now);
  const newDocRef = db.collection(ctx.planningPath).doc();

  await newDocRef.set({
    orderId: safeOrderId,
    item: safeItem,
    machine: safeMachine,
    plan: safePlan,
    status: 'planned',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    week,
    year,
  }, { merge: true });

  return {
    ok: true,
    orderDocId: newDocRef.id,
    orderId: safeOrderId,
  };
};

const markMazakLabelsPrintedService = async ({
  productIds,
  stationId,
  isReprint,
  actorLabel,
  source,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const ids = Array.from(new Set((Array.isArray(productIds) ? productIds : []).map((entry) => clean(entry)).filter(Boolean))).slice(0, 200);
  if (ids.length === 0) {
    throw new Error('NO_PRODUCTS_TO_UPDATE');
  }

  const userLabel = getActorLabel(auth, actorLabel);
  const safeStation = clean(stationId) || 'Mazak';
  const batch = db.batch();
  let updatedCount = 0;

  for (const id of ids) {
    const trackedDoc = await getTrackedProductDocByIdOrLot(id, ctx._rds);
    if (!trackedDoc) continue;
    updatedCount += 1;

    batch.set(trackedDoc.ref, {
      mazakLabelPrinted: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      history: admin.firestore.FieldValue.arrayUnion({
        action: isReprint ? 'Label Herprint' : 'Labels Geprint',
        timestamp: new Date().toISOString(),
        user: userLabel,
        station: safeStation,
        details: isReprint ? 'Label opnieuw naar print queue verstuurd' : 'Label(s) verstuurd naar print queue',
        source: source || null,
      }),
    }, { merge: true });
  }

  if (updatedCount === 0) {
    throw new Error('NO_PRODUCTS_FOUND');
  }

  await batch.commit();

  return {
    ok: true,
    updatedCount,
  };
};

const appendQcNoteService = async ({
  productId,
  note,
  archivedYear,
  actorLabel,
  source,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeProductId = clean(productId);
  const safeNote = clampText(note, 800);
  const safeYear = Number(archivedYear);

  if (!safeProductId || !safeNote) {
    throw new Error('INVALID_QC_NOTE_PAYLOAD');
  }

  const noteObj = {
    text: safeNote,
    timestamp: new Date().toISOString(),
    user: getActorLabel(auth, actorLabel),
    source: source || null,
  };

  const trackingRef = db.collection(ctx.trackingPath).doc(safeProductId);
  const trackingSnap = await trackingRef.get();
  if (trackingSnap.exists) {
    await trackingRef.set({
      qcNotes: admin.firestore.FieldValue.arrayUnion(noteObj),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      ok: true,
      productId: safeProductId,
      target: 'tracking',
      note: noteObj,
    };
  }

  let archiveRef = null;
  const currentYear = new Date().getFullYear();
  const yearsToCheck = Number.isFinite(safeYear)
    ? [safeYear]
    : Array.from({ length: 7 }, (_, idx) => currentYear - idx);

  for (const year of yearsToCheck) {
    const candidateRef = db.collection(ctx.archiveItemsPath(year)).doc(safeProductId);
    const candidateSnap = await candidateRef.get();
    if (candidateSnap.exists) {
      archiveRef = candidateRef;
      break;
    }
  }

  if (!archiveRef) {
    throw new Error('NOT_FOUND_PRODUCT');
  }

  await archiveRef.set({
    qcNotes: admin.firestore.FieldValue.arrayUnion(noteObj),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    ok: true,
    productId: safeProductId,
    target: 'archive',
    note: noteObj,
  };
};

const reserveAutoLotNumberRangeService = async ({
  stationId,
  count,
  reserve,
  runtimeDataSource,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const qty = Math.max(1, parseInt(String(count || 1), 10) || 1);
  if (qty > 200) {
    throw new Error('INVALID_LOT_RANGE_SIZE');
  }

  // path resolved via ctx
  const now = new Date();
  const iso = getISOWeekInfoServer(now);
  const yearShort = String(iso.year).slice(-2);
  const week = String(iso.week).padStart(2, '0');
  const machine = getMachineCodeForLotServer(stationId);
  const baseLot = `40${yearShort}${week}${machine}40`;

  const safeStationId = String(stationId || 'UNKNOWN').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const counterDocId = `${safeStationId}_${yearShort}${week}`;
  const counterRef = db.collection(`${BASE}/production/counters`).doc(counterDocId);

  const result = await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const counterData = counterSnap.exists ? (counterSnap.data() || {}) : {};

    const lastSequence = Number.isFinite(Number(counterData.lastSequence))
      ? Number(counterData.lastSequence)
      : 0;
    const recycled = Array.isArray(counterData.recycledSequences)
      ? Array.from(new Set(counterData.recycledSequences
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)))
        .sort((a, b) => a - b)
      : [];

    const existsInTracking = async (seqStart) => {
      for (let i = 0; i < qty; i += 1) {
        const seq = seqStart + i;
        const candidateLot = `${baseLot}${String(seq).padStart(4, '0')}`;
        const dupSnap = await tx.get(
          db.collection(ctx.trackingPath)
            .where('lotNumber', '==', candidateLot)
            .limit(1)
        );
        if (!dupSnap.empty) return true;
      }
      return false;
    };

    const maxAttempts = 300;
    let attempts = 0;
    let recycledIndex = 0;
    let sequenceToTry = recycled.length > 0 && qty === 1 ? recycled[0] : (lastSequence + 1);

    while (attempts < maxAttempts) {
      attempts += 1;
      const usingRecycled = qty === 1
        && recycledIndex < recycled.length
        && sequenceToTry === recycled[recycledIndex];

      if (sequenceToTry <= 0 || sequenceToTry + qty - 1 > 9999) {
        if (usingRecycled) {
          recycledIndex += 1;
          sequenceToTry = recycledIndex < recycled.length
            ? recycled[recycledIndex]
            : Math.max(lastSequence + 1, sequenceToTry + 1);
        } else {
          sequenceToTry += 1;
        }
        continue;
      }

      const collision = await existsInTracking(sequenceToTry);
      if (!collision) {
        const lotStart = `${baseLot}${String(sequenceToTry).padStart(4, '0')}`;

        if (reserve !== false) {
          const nextRecycled = usingRecycled
            ? recycled.filter((n) => n !== sequenceToTry)
            : recycled;
          const newLast = Math.max(lastSequence, sequenceToTry + qty - 1);

          tx.set(counterRef, {
            lastSequence: newLast,
            recycledSequences: nextRecycled,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        return {
          lotStart,
          baseLot,
          sequence: sequenceToTry,
          week,
          yearShort,
          counterDocId,
          reserved: reserve !== false,
        };
      }

      if (usingRecycled) {
        recycledIndex += 1;
        sequenceToTry = recycledIndex < recycled.length
          ? recycled[recycledIndex]
          : Math.max(lastSequence + 1, sequenceToTry + 1);
      } else {
        sequenceToTry += 1;
      }
    }

    throw new Error('NO_UNIQUE_LOT_AVAILABLE');
  });

  if (reserve !== false) {
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const oldIso = getISOWeekInfoServer(twoWeeksAgo);
    const oldDocId = `${safeStationId}_${String(oldIso.year).slice(-2)}${String(oldIso.week).padStart(2, '0')}`;
    if (oldDocId !== result.counterDocId) {
      await db.collection(`${BASE}/production/counters`).doc(oldDocId).delete().catch(() => {});
    }
  }

  return {
    ok: true,
    ...result,
  };
};

const DOWNTIME_COLLECTION = `${BASE}/production/downtime_reports`;
const DEFECTS_COLLECTION = `${BASE}/production/defect_reports`;
const MESSAGES_COLLECTION = `${BASE}/production/messages`;

const addOrderDependencyService = async ({ orderId, dependencyId, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderRef = db.collection(ctx.planningPath).doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new Error('NOT_FOUND_ORDER');
  }

  await orderRef.set({
    dependencies: admin.firestore.FieldValue.arrayUnion(dependencyId),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true };
};

const removeOrderDependencyService = async ({ orderId, dependencyId, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderRef = db.collection(ctx.planningPath).doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new Error('NOT_FOUND_ORDER');
  }

  await orderRef.set({
    dependencies: admin.firestore.FieldValue.arrayRemove(dependencyId),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true };
};

const updateOrderPlannedDateService = async ({ orderId, plannedDate, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderRef = db.collection(ctx.planningPath).doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new Error('NOT_FOUND_ORDER');
  }

  await orderRef.set({
    plannedDate,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true };
};

const updateOrderKanbanStatusService = async ({ orderId, status, auth, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const orderRef = db.collection(ctx.planningPath).doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new Error('NOT_FOUND_ORDER');
  }

  await orderRef.set({
    status,
    statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    statusUpdatedBy: getActorLabel(auth, null),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true };
};

const createProductionMessagesService = async ({ messages, auth, source, actorLabel, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeMessages = Array.isArray(messages) ? messages.slice(0, 50) : [];
  if (!safeMessages.length) {
    throw new Error('INVALID_MESSAGES_PAYLOAD');
  }

  const actor = getActorLabel(auth, actorLabel);
  let createdCount = 0;

  for (const entry of safeMessages) {
    const rawEntry = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
    const title = clampText(rawEntry.title, 180);
    const message = clampText(rawEntry.message, 1500);
    const subject = clampText(rawEntry.subject, 180) || title;
    const content = clampText(rawEntry.content, 2000) || message;

    if (!subject && !content && !title && !message) {
      continue;
    }

    const explicitRecipients = uniqueLowercaseEmails([
      ...(Array.isArray(rawEntry.recipients) ? rawEntry.recipients : []),
      rawEntry.to,
    ]);
    const roleRecipients = await resolveTargetRoleEmails(rawEntry.targetRoles);
    const recipients = uniqueLowercaseEmails([...explicitRecipients, ...roleRecipients]);
    const finalRecipients = recipients.length > 0 ? recipients : (rawEntry.broadcastToAll === true ? ['all'] : []);

    if (!finalRecipients.length) {
      continue;
    }

    const payloadBase = {
      senderId: clean(rawEntry.senderId) || auth?.uid || 'system',
      from: clampText(rawEntry.from, 120) || 'SYSTEM',
      subject,
      content,
      title,
      message,
      type: clampText(rawEntry.type, 80) || 'system',
      priority: clampText(rawEntry.priority, 40) || 'normal',
      status: clampText(rawEntry.status, 40) || 'unread',
      read: rawEntry.read === true,
      archived: rawEntry.archived === true,
      source: clampText(rawEntry.source, 80) || clampText(source, 80) || 'BackendCommand',
      relatedLot: rawEntry.relatedLot ? clampText(rawEntry.relatedLot, 120) : null,
      targetGroup: rawEntry.targetGroup ? clampText(rawEntry.targetGroup, 120) : null,
      metadata: sanitizeNestedValue(rawEntry.metadata) || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: auth?.uid || null,
      actorLabel: actor,
    };

    await Promise.all(finalRecipients.map((recipient) => db.collection(MESSAGES_COLLECTION).add({
      ...payloadBase,
      to: recipient,
    })));

    createdCount += finalRecipients.length;
  }

  await writeActivityLog({
    auth,
    action: 'PRODUCTION_MESSAGE_CREATE',
    details: `${createdCount} productieberichten aangemaakt via ${clampText(source, 80) || 'backend-command'}`,
    extra: { source: clampText(source, 80) || null, actorLabel: actor },
  });

  return { ok: true, createdCount };
};

const transitionPrintQueueJobStatusService = async ({ jobId, status, error, auth, source, actorLabel, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeJobId = clean(jobId);
  const nextStatus = clean(status).toLowerCase();
  const jobRef = db.collection(PRINT_QUEUE_COLLECTION).doc(safeJobId);
  const jobSnap = await jobRef.get();

  if (!jobSnap.exists) {
    throw new Error('NOT_FOUND_PRINT_JOB');
  }

  const currentStatus = clean(jobSnap.data()?.status).toLowerCase();
  const validTransition = (
    (currentStatus === 'pending' && ['printing', 'cancelled', 'error'].includes(nextStatus))
    || (currentStatus === 'printing' && ['completed', 'error'].includes(nextStatus))
    || (currentStatus === 'error' && ['pending', 'cancelled'].includes(nextStatus))
  );

  if (!validTransition) {
    throw new Error('INVALID_PRINT_QUEUE_TRANSITION');
  }

  const updates = {
    status: nextStatus,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (nextStatus === 'printing') {
    updates.processedAt = admin.firestore.FieldValue.serverTimestamp();
    updates.error = admin.firestore.FieldValue.delete();
  }
  if (nextStatus === 'completed') {
    updates.printedAt = admin.firestore.FieldValue.serverTimestamp();
    updates.error = admin.firestore.FieldValue.delete();
  }
  if (nextStatus === 'error') {
    updates.error = clampText(error, 1000) || 'Onbekende printfout';
  }
  if (nextStatus === 'pending') {
    updates.error = admin.firestore.FieldValue.delete();
  }

  await jobRef.set(updates, { merge: true });

  await writeActivityLog({
    auth,
    action: `PRINT_QUEUE_${nextStatus.toUpperCase()}`,
    details: `Printjob ${safeJobId} status gewijzigd van ${currentStatus || 'unknown'} naar ${nextStatus}`,
    extra: {
      source: clampText(source, 80) || null,
      actorLabel: getActorLabel(auth, actorLabel),
      jobId: safeJobId,
    },
  });

  return { ok: true, jobId: safeJobId, status: nextStatus };
};

const requeuePrintQueueJobService = async ({ jobId, auth, source, actorLabel, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeJobId = clean(jobId);
  const jobRef = db.collection(PRINT_QUEUE_COLLECTION).doc(safeJobId);
  const jobSnap = await jobRef.get();

  if (!jobSnap.exists) {
    throw new Error('NOT_FOUND_PRINT_JOB');
  }

  const current = jobSnap.data() || {};
  const nextRetryCount = Math.max(
    Number(current.retryCount || 0),
    Number(current.retries || 0),
  ) + 1;

  await jobRef.set({
    status: 'pending',
    retryCount: nextRetryCount,
    retries: nextRetryCount,
    reprintedAt: admin.firestore.FieldValue.serverTimestamp(),
    reprintedBy: {
      uid: auth?.uid || null,
      email: clean(auth?.token?.email) || null,
    },
    error: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await writeActivityLog({
    auth,
    action: 'PRINT_QUEUE_REQUEUE',
    details: `Printjob ${safeJobId} opnieuw in wachtrij gezet`,
    extra: {
      source: clampText(source, 80) || null,
      actorLabel: getActorLabel(auth, actorLabel),
      jobId: safeJobId,
      retryCount: nextRetryCount,
    },
  });

  return { ok: true, jobId: safeJobId, retryCount: nextRetryCount };
};

const deletePrintQueueJobService = async ({ jobId, auth, source, actorLabel, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const safeJobId = clean(jobId);
  const jobRef = db.collection(PRINT_QUEUE_COLLECTION).doc(safeJobId);
  const jobSnap = await jobRef.get();

  if (!jobSnap.exists) {
    throw new Error('NOT_FOUND_PRINT_JOB');
  }

  await jobRef.delete();

  await writeActivityLog({
    auth,
    action: 'PRINT_QUEUE_DELETE',
    details: `Printjob ${safeJobId} verwijderd`,
    extra: {
      source: clampText(source, 80) || null,
      actorLabel: getActorLabel(auth, actorLabel),
      jobId: safeJobId,
    },
  });

  return { ok: true, jobId: safeJobId };
};

const markReadyForNextStepService = async ({ productId, auth, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const trackedDoc = await getTrackedProductDocByIdOrLot(productId, ctx._rds);
  if (!trackedDoc) {
    throw new Error('NOT_FOUND_PRODUCT');
  }

  const trackedData = trackedDoc.data() || {};
  const nextState = getStepForStationServer(trackedData.currentStation || trackedData.machine || '');
  await trackedDoc.ref.set({
    currentStep: nextState.currentStep || trackedData.currentStep,
    status: 'ready_for_next_step',
    readyForNextStepAt: admin.firestore.FieldValue.serverTimestamp(),
    markedReadyBy: auth?.uid || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true };
};

const startTrackedProductRepairService = async ({ productId, repairReason, auth, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  const trackedDoc = await getTrackedProductDocByIdOrLot(productId, ctx._rds);
  if (!trackedDoc) {
    throw new Error('NOT_FOUND_PRODUCT');
  }

  await trackedDoc.ref.set({
    status: 'in_repair',
    repairReason: clampText(repairReason, 500),
    repairStartedAt: admin.firestore.FieldValue.serverTimestamp(),
    repairStartedBy: auth?.uid || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true };
};

const reportShopFloorIssueService = async ({
  type,
  machine,
  orderId,
  lotNumber,
  description,
  operatorName,
  auth,
  dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  if (!['downtime', 'defect'].includes(type)) {
    throw new Error('INVALID_ISSUE_TYPE');
  }

  const safeMachine = clampText(machine, 120) || 'Onbekend';
  const safeOperatorName = clampText(operatorName, 120) || 'Operator';
  const safeDescription = clampText(description, 1000);
  const commonData = {
    machine: safeMachine,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: auth?.uid || null,
    operatorName: safeOperatorName,
    orderId: clean(orderId) || null,
  };

  if (type === 'downtime') {
    await db.collection(DOWNTIME_COLLECTION).add({
      ...commonData,
      reason: safeDescription || 'Gemeld door operator',
      status: 'active',
      type: 'unplanned',
    });
  } else {
    await db.collection(DEFECTS_COLLECTION).add({
      ...commonData,
      defectType: 'Operator Melding',
      description: safeDescription || 'Defect gemeld via scanner',
      severity: 'medium',
      status: 'open',
      lotNumber: clean(lotNumber) || null,
    });
  }

  await db.collection(MESSAGES_COLLECTION).add({
    title: type === 'downtime' ? 'Stilstand Gemeld' : 'Defect Gemeld',
    message: `${safeOperatorName} meldt ${type === 'downtime' ? 'stilstand' : 'defect'} op ${safeMachine}: ${safeDescription || 'Geen toelichting'}`,
    type: 'alert',
    priority: 'high',
    status: 'unread',
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    source: 'ShopFloorMobile',
    targetGroup: 'TEAMLEADERS',
  });

  return { ok: true };
};

const resolveShopFloorIssueService = async ({ type, issueId, auth, dbCtx = null,
}) => {
  const ctx = dbCtx || resolveDbContext(null);
  if (!['downtime', 'defect'].includes(type)) {
    throw new Error('INVALID_ISSUE_TYPE');
  }

  const collectionName = type === 'downtime' ? DOWNTIME_COLLECTION : DEFECTS_COLLECTION;
  const issueRef = db.collection(collectionName).doc(issueId);
  const issueSnap = await issueRef.get();
  if (!issueSnap.exists) {
    throw new Error('NOT_FOUND_ISSUE');
  }

  await issueRef.set({
    status: 'resolved',
    resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
    resolvedBy: auth?.uid || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true };
};

module.exports = {
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
};
