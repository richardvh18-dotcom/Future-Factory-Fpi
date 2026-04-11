const { admin, db } = require('../config/firebase');
const { BASE, TRACKING_COLLECTION } = require('../config/planningConstants');
const {
  getPlanningOrderDocByOrderId,
  getTrackedProductDocByIdOrLot,
  getPlanningOrderDocById,
} = require('../repositories/planningRepository');
const { clean } = require('../utils/text');

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

const rejectTrackedProductFinalService = async ({
  productId,
  reasons,
  note,
  source,
  actorLabel,
  auth,
  userRole,
}) => {
  const productRef = db.collection(TRACKING_COLLECTION).doc(productId);
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
    .collection(`${BASE}/production/archive/${year}/rejected`)
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
    const orderDoc = await getPlanningOrderDocByOrderId(orderId);
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
}) => {
  const trackedDoc = await getTrackedProductDocByIdOrLot(productOrLotId);
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

  if (isRepairMove) {
    updatePayload.repairActive = true;
    updatePayload.repairCategory = 'reparatie';
    updatePayload.repairInstruction = repairInstruction || '';
    updatePayload['timestamps.repair_start'] = admin.firestore.FieldValue.serverTimestamp();
    updatePayload['timestamps.repair_end'] = null;
  }

  await trackedDoc.ref.set(updatePayload, { merge: true });

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

const archivePlanningOrderService = async ({ orderDocId, requestedReason, source, auth, userRole }) => {  const orderDoc = await getPlanningOrderDocById(orderDocId);
  if (!orderDoc) {
    throw new Error('NOT_FOUND_ORDER');
  }

  const orderData = orderDoc.data() || {};
  const year = new Date().getFullYear();
  const targetArchiveRef = db.collection(`${BASE}/production/archive/${year}/planning`).doc(orderDoc.id);

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
}) => {
  const trackedDoc = await getTrackedProductDocByIdOrLot(productId);
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
    const orderDoc = await getPlanningOrderDocByOrderId(orderId);
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
      .collection(`${BASE}/production/archive/${year}/items`)
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

    const batch = admin.firestore().batch();
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

    const batch = admin.firestore().batch();
    batch.set(trackedDoc.ref, updatePayload, { merge: true });
    const producedIncremented = await incrementProducedOnOrder(batch);
    await batch.commit();

    return { ok: true, productId: trackedDoc.id, finishType: 'forward', producedIncremented };
  }

  throw new Error('INVALID_FINISH_TYPE');
};

module.exports = {
  rejectTrackedProductFinalService,
  moveTrackedProductManualService,
  archivePlanningOrderService,
  completeTrackedProductService,
};
