const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const db = admin.firestore();
const {
  getPlanningContribution, getTrackedContribution, diffContribution, applyStatsDelta,
  handlePlanningOrderWrite
} = require('../utils/helpers');

exports.cleanupUserAuth = functions.region('europe-west1').firestore
  .document('future-factory/Users/Accounts/{userId}')
  .onDelete(async (snapshot, context) => {
    const { userId } = context.params;
    const userData = snapshot.data();
    const email = (userData && userData.email) || 'Onbekend';


    try {
      await admin.auth().deleteUser(userId);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
      } else {
        console.error(`❌ Fout bij verwijderen van ${email} uit Auth:`, error);
      }
    }
  });

/**
 * STEP 1: Realtime aggregaties voor dashboard KPI's.
 */
exports.aggregatePlanningStats = functions.region('europe-west1').firestore
  .document('future-factory/production/digital_planning/{orderId}')
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    const orderId = context.params?.orderId;
    return handlePlanningOrderWrite({ before, after, orderId });
  });

exports.aggregatePlanningStatsScoped = functions.region('europe-west1').firestore
  .document('future-factory/production/digital_planning/{department}/machines/{machine}/orders/{orderId}')
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    const orderId = context.params?.orderId;
    return handlePlanningOrderWrite({ before, after, orderId });
  });

const handleTrackedWrite = async ({ before, after, productId = '' }) => {
  const delta = diffContribution(getTrackedContribution(before), getTrackedContribution(after));

  if (Object.keys(delta).length > 0) {
    await applyStatsDelta(delta);
  }

  const orderId = clean(after?.orderId || before?.orderId);
  if (orderId) {
    try {
      await upsertOrderSafetyState({
        orderId,
        before,
        after,
        source: 'tracked_trigger',
        department: after?.departmentId || after?.department || before?.departmentId || before?.department,
        machine: after?.machine || after?.machineId || after?.currentStation || before?.machine || before?.machineId || before?.currentStation,
      });
    } catch (error) {
      console.warn('[safety_state] update na TRACKED_WRITE mislukt:', error?.message || String(error));
    }
  }

  if (orderId && after) {
    const status = clean(after.status);
    const step = clean(after.currentStep);
    const prevStatus = clean(before?.status);
    const prevStep = clean(before?.currentStep);

    if (status !== prevStatus || step !== prevStep) {
      await createOrderLifecycleEvent({
        orderId,
        department: after.departmentId || after.department || before?.departmentId || before?.department,
        machine:
          after.machine ||
          after.machineId ||
          after.station ||
          after.currentStation ||
          before?.machine ||
          before?.machineId ||
          before?.station ||
          before?.currentStation,
        eventType: 'TRACKED_PRODUCT_STEP_CHANGED',
        source: 'tracked_trigger',
        payload: {
          productId: clean(productId || after?.id || before?.id),
          statusBefore: prevStatus,
          statusAfter: status,
          stepBefore: prevStep,
          stepAfter: step,
          lotNumber: clean(after.lotNumber || before?.lotNumber),
        },
      });
    }
  }

  return null;
};

exports.aggregateTrackedStats = functions.region('europe-west1').firestore
  .document('future-factory/production/tracked_products/{productId}')
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    return handleTrackedWrite({ before, after, productId: context.params?.productId });
  });

exports.aggregateTrackedStatsScoped = functions.region('europe-west1').firestore
  .document('future-factory/production/tracked_products/{department}/machines/{machine}/items/{productId}')
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    return handleTrackedWrite({ before, after, productId: context.params?.productId });
  });

/**
 * STEP 2b: Efficiency herberekening server-side na elke tracking-wijziging.
 * Schrijft resultaat naar efficiency_hours/{orderId} zodat de tablet dit alleen
 * nog hoeft te lezen — geen berekeningen meer in de browser.
 */
const recalculateOrderEfficiency = async (orderId) => {
  if (!orderId) return;
  try {
    const stdRef = db.collection(EFFICIENCY_COLLECTION).doc(orderId);
    const stdSnap = await stdRef.get();

    // Haal planning order op
    let planningOrder = null;
    const planningRootSnap = await db.collection(PLANNING_COLLECTION).doc(orderId).get();
    if (planningRootSnap.exists) {
      planningOrder = planningRootSnap.data();
    } else {
      const scopedSnap = await db.collectionGroup('orders').where('orderId', '==', orderId).limit(1).get();
      const planningDoc = scopedSnap.docs.find(d => d.ref.path.includes(PLANNING_COLLECTION));
      if (planningDoc) planningOrder = planningDoc.data();
    }

    // Verzamel alle tracking docs voor deze order
    const [rootSnap, groupSnap] = await Promise.all([
      db.collection(TRACKING_COLLECTION).where('orderId', '==', orderId).get(),
      db.collectionGroup('items').where('orderId', '==', orderId).get(),
    ]);
    const all = [...rootSnap.docs, ...groupSnap.docs].filter(d => d.ref.path.includes(TRACKING_COLLECTION));
    const unique = new Map();
    all.forEach(d => unique.set(d.id, d.data()));
    const logs = Array.from(unique.values());

    if (logs.length === 0 && !stdSnap.exists && !planningOrder) return;

    const std = stdSnap.exists ? stdSnap.data() || {} : {};
    const parseNum = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

    // Bepaal werkelijk bestede minuten (werkdagen ma-vr 06:00-22:00)
    const WORK_START_H = 6, WORK_END_H = 22;
    const workMinutes = (start, end) => {
      if (!start || !end) return 0;
      let total = 0, cur = new Date(start);
      const endDate = new Date(end);
      while (cur < endDate) {
        const day = cur.getDay();
        if (day >= 1 && day <= 5) {
          const wStart = new Date(cur); wStart.setHours(WORK_START_H, 0, 0, 0);
          const wEnd = new Date(cur); wEnd.setHours(WORK_END_H, 0, 0, 0);
          const s = Math.max(cur.getTime(), wStart.getTime());
          const e = Math.min(endDate.getTime(), wEnd.getTime());
          if (e > s) total += (e - s) / 60000;
        }
        cur.setDate(cur.getDate() + 1); cur.setHours(WORK_START_H, 0, 0, 0);
      }
      return total;
    };

    const toDate = v => {
      if (!v) return null;
      if (v && typeof v.toDate === 'function') return v.toDate();
      const d = new Date(v);
      return isNaN(d) ? null : d;
    };

    let actualMinutes = 0, producedQty = 0;
    logs.forEach(log => {
      const ts = log.timestamps || {};
      const start = toDate(ts.station_start || ts.started || log.startTime || log.startedAt || log.createdAt);
      const end = toDate(ts.finished || ts.completed || log.endTime || log.completedAt || log.updatedAt) || new Date();
      if (start) actualMinutes += workMinutes(start, end);
      if (['completed', 'shipped', 'gereed'].includes(String(log.status || ''))) producedQty += 1;
    });

    // Fallback: gebruik opgeslagen waarde als geen tracking-duur beschikbaar
    if (actualMinutes <= 0) {
      const candidates = [std.actualTimeTotal, planningOrder?.totalActualHours, planningOrder?.actualHours];
      for (const c of candidates) {
        const v = parseNum(c);
        if (v > 0) { actualMinutes = v > 300 ? v : v * 60; break; }
      }
    }

    const stdQty = parseNum(std.plan || planningOrder?.plan || std.quantity || planningOrder?.quantity || 0);
    const targetTotal = parseNum(std.standardTimeTotal) ||
      parseNum(std.productionTimeTotal) + parseNum(std.postProcessingTimeTotal) ||
      (parseNum(planningOrder?.plannedMinutesBH) + parseNum(planningOrder?.plannedMinutesNabewerken));
    const normPerUnit = parseNum(std.minutesPerUnit) || (stdQty > 0 ? targetTotal / stdQty : 0);
    const earnedMinutes = producedQty * normPerUnit;

    let efficiency = 0;
    if (actualMinutes > 0) efficiency = (earnedMinutes / actualMinutes) * 100;
    else if (producedQty > 0) efficiency = 100;

    let status = 'Nog niet gestart';
    if (actualMinutes > 0 || producedQty > 0) {
      status = efficiency >= 100 ? 'VOOR op schema' : efficiency >= 85 ? 'OP schema' : 'ACHTER op schema';
    }

    const payload = {
      orderId,
      actualTimeTotal: actualMinutes,
      producedQty,
      efficiency,
      earnedMinutes,
      status,
      isOverrun: actualMinutes > targetTotal,
      standardTimeTotal: targetTotal,
      minutesPerUnit: normPerUnit,
      quantity: stdQty,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      _calculatedBy: 'cloud_trigger',
    };

    // Kopieer meta-velden uit bestaande record of planningorder
    for (const field of ['departmentId', 'machine', 'itemCode', 'itemDescription', 'item']) {
      const val = std[field] || planningOrder?.[field];
      if (val) payload[field] = val;
    }

    await stdRef.set(payload, { merge: true });
  } catch (err) {
    console.error(`[efficiency_trigger] Fout bij order ${orderId}:`, err?.message || String(err));
  }
};

exports.recalculateEfficiencyOnTrackedWrite = functions.region('europe-west1').firestore
  .document('future-factory/production/tracked_products/{productId}')
  .onWrite(async (change) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;
    const orderId = clean(after?.orderId || before?.orderId);
    return recalculateOrderEfficiency(orderId);
  });

exports.recalculateEfficiencyOnTrackedScopedWrite = functions.region('europe-west1').firestore
  .document('future-factory/production/tracked_products/{department}/machines/{machine}/items/{productId}')
  .onWrite(async (change) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;
    const orderId = clean(after?.orderId || before?.orderId);
    return recalculateOrderEfficiency(orderId);
  });

/**
 * STEP 3: TTL metadata op logs zetten.
 * Let op: TTL zelf activeer je in Firebase Console op veld `expireAt`.
 */
exports.applyActivityLogTtl = functions.region('europe-west1').firestore
  .document('future-factory/audit/logs/{logId}')
  .onCreate(async (snapshot) => {
    const data = snapshot.data() || {};
    const action = clean(data.action).toUpperCase();
    const severity = clean(data.severity).toUpperCase();
    const category = clean(data.category).toUpperCase();

    const longTerm =
      severity === 'CRITICAL' ||
      category === 'QUALITY' ||
      category === 'SECURITY' ||
      action.includes('REJECT') ||
      action.includes('ARCHIVE');

    const retentionDays = longTerm ? 3650 : 90;
    const expireAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);

    await snapshot.ref.set(
      {
        expireAt: admin.firestore.Timestamp.fromDate(expireAt),
        ttlPolicyDays: retentionDays,
      },
      { merge: true }
    );

    return null;
  });

exports.applyClientErrorTtl = functions.region('europe-west1').firestore
  .document('future-factory/logs/client_errors/{errorId}')
  .onCreate(async (snapshot) => {
    const retentionDays = 7;
    const expireAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);

    await snapshot.ref.set(
      {
        expireAt: admin.firestore.Timestamp.fromDate(expireAt),
        ttlPolicyDays: retentionDays,
      },
      { merge: true }
    );

    return null;
  });

