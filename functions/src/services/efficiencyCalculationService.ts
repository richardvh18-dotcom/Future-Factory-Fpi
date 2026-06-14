import * as admin from 'firebase-admin';
import { calculateWorkingMinutes } from '../utils/workingTimeUtils';

const BASE = 'future-factory';
const TRACKING_COLLECTION = `${BASE}/production/tracked_products`;
const PLANNING_COLLECTION = `${BASE}/production/digital_planning`;
const EFFICIENCY_COLLECTION = `${BASE}/production/efficiency_hours`;

const toDateValue = (value: any): Date | null => {
  if (!value) return null;
  if (typeof value === 'object' && typeof value.toDate === 'function') return value.toDate();
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const normalizeMachine = (val: unknown) => {
  let str = String(val || '').trim().toUpperCase();
  if (str === 'BM18') str = 'BH18';
  if (str === '40BM18') str = '40BH18';
  return str || '-';
};

const inferDepartmentFromMachine = (machine: unknown) => {
  const m = normalizeMachine(machine);
  if (m.startsWith('BH')) return 'Fittings';
  if (m.startsWith('BA')) return 'Pipes';
  if (m.startsWith('BM')) return 'Spools';
  return '';
};

const getTrackingDurationMinutes = (log: any) => {
  const contextMachine = log?.originMachine || log?.machine || log?.currentStation || log?.lastStation;
  const contextDepartment = log?.department || inferDepartmentFromMachine(contextMachine);
  const durationContext = {
    department: contextDepartment,
    machine: contextMachine,
    station: log?.currentStation || log?.lastStation,
    originMachine: log?.originMachine,
  };

  const start = toDateValue(
    log?.timestamps?.station_start || log?.timestamps?.started || log?.startTime || log?.startedAt
  );
  if (start) {
    const end = toDateValue(
      log?.timestamps?.finished || log?.timestamps?.completed || log?.endTime || log?.completedAt || log?.updatedAt
    ) || new Date();

    const minutes = calculateWorkingMinutes(start, end, durationContext);
    if (Number.isFinite(minutes) && minutes > 0) return minutes;
  }

  const ts = log?.timestamps || {};
  let total = 0;

  const addRange = (startValue: unknown, endValue: unknown) => {
    const s = toDateValue(startValue);
    const e = toDateValue(endValue);
    if (!s || !e) return;
    const diff = calculateWorkingMinutes(s, e, durationContext);
    if (Number.isFinite(diff) && diff > 0) total += diff;
  };

  addRange(ts.wikkelen_start || log?.createdAt, ts.wikkelen_end);
  addRange(ts.lossen_start, ts.lossen_end);
  addRange(ts.nabewerking_start, ts.nabewerking_end || new Date());
  addRange(ts.station_start, ts.finished || ts.completed || new Date());

  if (total <= 0 && Array.isArray(log?.history)) {
    const startHistory = log.history.find((h: any) => String(h?.action || '').toLowerCase().includes('start'));
    const startFromHistory = toDateValue(startHistory?.timestamp);
    const bestEnd = toDateValue(ts.wikkelen_end || ts.lossen_end || ts.nabewerking_end || log?.updatedAt);
    if (startFromHistory && bestEnd) {
      const diff = calculateWorkingMinutes(startFromHistory, bestEnd, durationContext);
      if (Number.isFinite(diff) && diff > 0) total += diff;
    }
  }

  return total > 0 ? total : 0;
};

const parseNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const getOrderActualMinutes = (orderLike: any) => {
  if (!orderLike) return 0;
  const hoursCandidates = [
    orderLike.totalActualHours, orderLike.actualHours, orderLike.spentProductionTime, orderLike.hoursWorked, orderLike.productionHours,
  ];
  for (const candidate of hoursCandidates) {
    const hours = parseNumber(candidate);
    if (hours > 0) return hours * 60;
  }
  const minuteCandidates = [
    orderLike.actualMinutes, orderLike.totalActualMinutes, orderLike.spentMinutes, orderLike.productionMinutes,
  ];
  for (const candidate of minuteCandidates) {
    const minutes = parseNumber(candidate);
    if (minutes > 0) return minutes;
  }
  return 0;
};

const getOrderSplitMinutes = (orderLike: any) => {
  if (!orderLike) return { productionMinutes: 0, postMinutes: 0, qcMinutes: 0 };
  const productionMinutes = parseNumber(orderLike.plannedMinutesBH) || (parseNumber(orderLike.plannedHoursBH) * 60);
  const postMinutes = parseNumber(orderLike.plannedMinutesNabewerken) || (parseNumber(orderLike.plannedHoursNabewerken) * 60);
  const qcMinutes = parseNumber(orderLike.plannedMinutesBM01) || (parseNumber(orderLike.plannedHoursBM01) * 60);
  return { productionMinutes, postMinutes, qcMinutes };
};

export const recalculateOrderEfficiency = async (db: admin.firestore.Firestore, orderId: string) => {
  if (!orderId) return;

  try {
    const stdRef = db.collection(EFFICIENCY_COLLECTION).doc(orderId);
    const stdSnap = await stdRef.get();
    
    let planningOrder: any = null;
    const planningRootRef = db.collection(PLANNING_COLLECTION).doc(orderId);
    const planningRootSnap = await planningRootRef.get();
    if (planningRootSnap.exists) {
      planningOrder = planningRootSnap.data();
    } else {
      const planningGroupSnap = await db.collectionGroup('orders').where('orderId', '==', orderId).limit(1).get();
      const planningDoc = planningGroupSnap.docs.find(d => d.ref.path.includes(PLANNING_COLLECTION));
      if (planningDoc) {
        planningOrder = planningDoc.data();
      }
    }
    
    const trackingRootSnap = await db.collection(TRACKING_COLLECTION).where('orderId', '==', orderId).get();
    const trackingGroupSnap = await db.collectionGroup('items').where('orderId', '==', orderId).get();
    
    const allTrackingDocs = [...trackingRootSnap.docs, ...trackingGroupSnap.docs]
        .filter(d => d.ref.path.includes(TRACKING_COLLECTION));
        
    const uniqueTracking = new Map();
    allTrackingDocs.forEach(d => uniqueTracking.set(d.id, d.data()));
    const relatedLogs = Array.from(uniqueTracking.values());
    
    if (relatedLogs.length === 0 && !stdSnap.exists && !planningOrder) return;
    
    const std = stdSnap.exists ? stdSnap.data() || {} : {};
    
    let actualMinutes = 0;
    let producedQty = 0;
    
    relatedLogs.forEach((log: any) => {
      actualMinutes += getTrackingDurationMinutes(log);
      if (log.status === 'completed' || log.status === 'shipped' || log.status === 'gereed') {
        producedQty += 1;
      }
    });
    
    if (actualMinutes <= 0) {
      actualMinutes = Math.max(getOrderActualMinutes(std), getOrderActualMinutes(planningOrder));
    }
    
    const splitFromOrder = getOrderSplitMinutes(planningOrder);
    const prodTotal = parseNumber(std.productionTimeTotal) > 0 ? parseNumber(std.productionTimeTotal) : splitFromOrder.productionMinutes;
    const postTotal = parseNumber(std.postProcessingTimeTotal) > 0 ? parseNumber(std.postProcessingTimeTotal) : splitFromOrder.postMinutes;
    const qcTotal = parseNumber(std.qcTimeTotal) > 0 ? parseNumber(std.qcTimeTotal) : splitFromOrder.qcMinutes;
    const targetTotal = parseNumber(std.standardTimeTotal) > 0 ? parseNumber(std.standardTimeTotal) : (prodTotal + postTotal);
    
    const stdQty = parseNumber(std.plan || planningOrder?.plan || std.quantity || planningOrder?.quantity || 0);
    const normPerUnit = parseNumber(std.minutesPerUnit) > 0 ? parseNumber(std.minutesPerUnit) : (stdQty > 0 ? targetTotal / stdQty : 0);
    const earnedMinutes = producedQty * normPerUnit;
    
    let efficiency = 0;
    if (actualMinutes > 0) {
      efficiency = (earnedMinutes / actualMinutes) * 100;
    } else if (producedQty > 0) {
      efficiency = 100;
    }
    
    let status = efficiency >= 100 ? 'VOOR op schema' : efficiency >= 85 ? 'OP schema' : 'ACHTER op schema';
    if (actualMinutes === 0 && producedQty === 0) {
        status = 'Nog niet gestart';
    }
    
    const isOverrun = actualMinutes > targetTotal;
    
    const payload: any = {
      orderId,
      actualTimeTotal: actualMinutes,
      producedQty,
      efficiency,
      earnedMinutes,
      status,
      isOverrun,
      standardTimeTotal: targetTotal,
      minutesPerUnit: normPerUnit,
      quantity: stdQty,
      productionTimeTotal: prodTotal,
      postProcessingTimeTotal: postTotal,
      qcTimeTotal: qcTotal,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    if (std.departmentId || planningOrder?.departmentId) payload.departmentId = std.departmentId || planningOrder?.departmentId;
    if (std.machine || planningOrder?.machine) payload.machine = std.machine || planningOrder?.machine;
    if (std.itemCode || planningOrder?.itemCode) payload.itemCode = std.itemCode || planningOrder?.itemCode;
    if (std.itemDescription || planningOrder?.itemDescription) payload.itemDescription = std.itemDescription || planningOrder?.itemDescription;
    if (std.item || planningOrder?.item) payload.item = std.item || planningOrder?.item;
    
    await stdRef.set(payload, { merge: true });
    
  } catch (err) {
    console.error(`Error recalculating efficiency for order ${orderId}:`, err);
  }
};