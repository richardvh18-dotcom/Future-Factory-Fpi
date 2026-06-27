const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const db = admin.firestore();
const auditService = require('../services/auditService');
const {
  IMPORT_RUNS_COLLECTION, ATPS_PRESENCE_STATE_COLLECTION, ATPS_PRESENCE_SESSION_COLLECTION,
  ATPS_PRESENCE_MACHINE_ID
} = require('../config/constants');
const {
  clean, getLegacyRuntimeConfig, parseMachineSelectionInput, parseOrdersFromBuffer,
  importOrdersToFirestore, normalizeEmployeeNumber, parseTimestampInput,
  getDateKeyFromDate, closeActiveOccupancyForEmployee, resolveAtpsWebhookToken
} = require('../utils/helpers');

// Sample HTTP function
exports.helloWorld = functions.region('europe-west1').https.onRequest((request, response) => {
  response.send('Hello from Firebase!');
});

/**
 * Power Automate Import API
 * POST /importPlanningFromWebhook
 *
 * Body:
 * {
 *   fileUrl: string,
 *   fileName?: string,
 *   provider?: string,
 *   fileModifiedAt?: string,
 *   idempotencyKey?: string,
 *   overwrite?: boolean,
 *   allowedMachines?: string[] | string // bijv ["BH12", "BH18"]
 * }
 */
exports.importPlanningFromWebhook = functions.region('europe-west1').https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const runtimeConfig = getLegacyRuntimeConfig();
    const configToken =
      runtimeConfig?.power_automate?.import_token ||
      runtimeConfig?.integration?.import_token ||
      runtimeConfig?.zapier?.import_token;
    const envToken =
      process.env.POWER_AUTOMATE_IMPORT_TOKEN ||
      process.env.INTEGRATION_IMPORT_TOKEN ||
      process.env.ZAPIER_IMPORT_TOKEN;
    const expectedToken = configToken || envToken;
    const providedToken = req.get('x-import-token') || req.body?.token;

    if (!expectedToken || providedToken !== expectedToken) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const fileUrl = clean(req.body?.fileUrl);
    const fileName = clean(req.body?.fileName);
    const provider = clean(req.body?.provider) || 'power_automate';
    const fileModifiedAt = clean(req.body?.fileModifiedAt);
    const overwrite = Boolean(req.body?.overwrite);
    const allowedMachines = parseMachineSelectionInput(req.body?.allowedMachines);
    const idempotencyKey = clean(req.body?.idempotencyKey || `${fileName}-${fileModifiedAt}`);

    if (!fileUrl) {
      return res.status(422).json({ ok: false, error: 'fileUrl is required' });
    }

    if (!idempotencyKey) {
      return res.status(422).json({ ok: false, error: 'idempotencyKey is required' });
    }

    const runRef = db.collection(IMPORT_RUNS_COLLECTION).doc(idempotencyKey);
    const existingRun = await runRef.get();
    if (existingRun.exists) {
      return res.status(409).json({
        ok: true,
        duplicate: true,
        message: 'Import already processed for this idempotencyKey',
      });
    }

    await runRef.set({
      status: 'started',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      fileName,
      provider,
      fileModifiedAt,
      fileUrl,
      overwrite,
      allowedMachines: Array.from(allowedMachines),
    });

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Kon bestand niet downloaden (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const orders = parseOrdersFromBuffer(fileBuffer);

    const sourceMeta = {
      source: provider || 'power_automate',
      provider,
      fileName,
      fileModifiedAt,
      idempotencyKey,
      allowedMachines: Array.from(allowedMachines),
    };

    const result = await importOrdersToFirestore(orders, sourceMeta, {
      overwrite,
      updateExisting: true,
      allowedMachines,
    });

    await runRef.set(
      {
        status: 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        ordersFound: orders.length,
        imported: result.imported,
        skipped: result.skipped,
        skippedByMachine: result.skippedByMachine,
      },
      { merge: true }
    );

    auditService.logSystem('IMPORT_PLANNING_WEBHOOK', {
      provider,
      fileName,
      idempotencyKey,
      ordersFound: orders.length,
      imported: result.imported,
      skipped: result.skipped,
      skippedByMachine: result.skippedByMachine,
      allowedMachines: Array.from(allowedMachines),
    }, { category: 'PLANNING', severity: 'INFO' });

    return res.status(200).json({
      ok: true,
      imported: result.imported,
      skipped: result.skipped,
      skippedByMachine: result.skippedByMachine,
      ordersFound: orders.length,
      idempotencyKey,
      allowedMachines: Array.from(allowedMachines),
    });
  } catch (error) {
    console.error('importPlanningFromWebhook error:', error);
    return res.status(500).json({
      ok: false,
      error: 'Import failed',
      details: error?.message || 'Unknown error',
    });
  }
});

/**
 * ATPS Presence Webhook (ATPS -> App)
 *
 * Doel:
 * - CHECK_IN in ATPS = medewerker aanwezig op afdeling (presence state/session in app)
 * - CHECK_OUT in ATPS = medewerker direct uitgelogd van alle actieve machines in app
 *
 * Verwachte body:
 * {
 *   employeeNumber: string,
 *   eventType: 'CHECK_IN' | 'CHECK_OUT' | 'IN' | 'OUT',
 *   timestamp?: string (ISO),
 *   departmentId?: string,
 *   token?: string
 * }
 */
exports.atpsPresenceWebhook = functions.region('europe-west1').https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const expectedToken = resolveAtpsWebhookToken();
    const providedToken = req.get('x-atps-token') || req.body?.token;
    if (!expectedToken || providedToken !== expectedToken) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const employeeNumber = normalizeEmployeeNumber(req.body?.employeeNumber || req.body?.employeeNo || req.body?.badge || '');
    const eventType = String(req.body?.eventType || req.body?.event || req.body?.action || '').trim().toUpperCase();
    const departmentId = clean(req.body?.departmentId || req.body?.department || '');
    const eventAt = parseTimestampInput(req.body?.timestamp || req.body?.eventAt || req.body?.time);

    if (!employeeNumber) {
      return res.status(422).json({ ok: false, error: 'employeeNumber is required' });
    }

    const isCheckIn = ['CHECK_IN', 'IN', 'LOGIN', 'CLOCK_IN'].includes(eventType);
    const isCheckOut = ['CHECK_OUT', 'OUT', 'LOGOUT', 'CLOCK_OUT'].includes(eventType);
    if (!isCheckIn && !isCheckOut) {
      return res.status(422).json({ ok: false, error: 'Unsupported eventType' });
    }

    const presenceRef = db.collection(ATPS_PRESENCE_STATE_COLLECTION).doc(employeeNumber);
    const nowIso = new Date().toISOString();

    if (isCheckIn) {
      const sessionRef = db.collection(ATPS_PRESENCE_SESSION_COLLECTION).doc();
      await sessionRef.set({
        employeeNumber,
        departmentId: departmentId || null,
        source: 'atps_presence',
        status: 'active',
        checkInAt: admin.firestore.Timestamp.fromDate(eventAt),
        checkInAtIso: eventAt.toISOString(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const dateKey = getDateKeyFromDate(eventAt);
      const occDocId = `${dateKey}_ATPS_${employeeNumber}_${Date.now()}`;
      await db.collection('future-factory/production/machine_occupancy').doc(occDocId).set({
        date: dateKey,
        machineId: ATPS_PRESENCE_MACHINE_ID,
        departmentId: departmentId || 'ATPS',
        operatorNumber: employeeNumber,
        operatorName: `ATPS ${employeeNumber}`,
        shift: 'ATPS',
        shiftKey: 'ATPS',
        source: 'atps_presence_checkin',
        isActive: true,
        isPresenceOnly: true,
        checkedInAt: admin.firestore.Timestamp.fromDate(eventAt),
        shiftEffectiveStart: eventAt.toISOString(),
        checkedOutAt: null,
        hoursWorked: 0,
        atpsExported: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      await presenceRef.set({
        employeeNumber,
        isPresent: true,
        departmentId: departmentId || null,
        lastCheckInAt: admin.firestore.Timestamp.fromDate(eventAt),
        lastCheckInAtIso: eventAt.toISOString(),
        lastEventType: 'CHECK_IN',
        lastEventAt: admin.firestore.Timestamp.fromDate(eventAt),
        lastEventAtIso: eventAt.toISOString(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      auditService.logSystem('ATPS_PRESENCE_CHECKIN', {
        employeeNumber,
        departmentId: departmentId || null,
        eventAt: eventAt.toISOString(),
      }, { category: 'SYSTEM', severity: 'INFO' });

      return res.status(200).json({
        ok: true,
        direction: 'ATPS_TO_APP',
        eventType: 'CHECK_IN',
        employeeNumber,
        updatedAt: nowIso,
      });
    }

    const closeResult = await closeActiveOccupancyForEmployee({
      employeeNumber,
      checkoutAt: eventAt,
      reason: 'atps_logout',
    });

    const activeSessionsSnap = await db.collection(ATPS_PRESENCE_SESSION_COLLECTION)
      .where('employeeNumber', '==', employeeNumber)
      .where('status', '==', 'active')
      .limit(20)
      .get();

    for (const sessionDoc of activeSessionsSnap.docs) {
      const session = sessionDoc.data() || {};
      const checkInDate = session?.checkInAt?.toDate ? session.checkInAt.toDate() : parseTimestampInput(session?.checkInAtIso);
      const durationHours = Math.max(0, (eventAt.getTime() - checkInDate.getTime()) / 3600000);
      await sessionDoc.ref.set({
        status: 'closed',
        checkOutAt: admin.firestore.Timestamp.fromDate(eventAt),
        checkOutAtIso: eventAt.toISOString(),
        durationHours: Number(durationHours.toFixed(2)),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await presenceRef.set({
      employeeNumber,
      isPresent: false,
      lastCheckOutAt: admin.firestore.Timestamp.fromDate(eventAt),
      lastCheckOutAtIso: eventAt.toISOString(),
      lastEventType: 'CHECK_OUT',
      lastEventAt: admin.firestore.Timestamp.fromDate(eventAt),
      lastEventAtIso: eventAt.toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    auditService.logSystem('ATPS_PRESENCE_CHECKOUT', {
      employeeNumber,
      closedMachineAssignments: closeResult.closedCount,
      machineIds: closeResult.machineIds,
      eventAt: eventAt.toISOString(),
    }, { category: 'SYSTEM', severity: 'INFO' });

    return res.status(200).json({
      ok: true,
      direction: 'ATPS_TO_APP',
      eventType: 'CHECK_OUT',
      employeeNumber,
      closedMachineAssignments: closeResult.closedCount,
      machineIds: closeResult.machineIds,
      updatedAt: nowIso,
    });
  } catch (error) {
    console.error('atpsPresenceWebhook error:', error);
    return res.status(500).json({
      ok: false,
      error: 'ATPS presence webhook failed',
      details: error?.message || 'Unknown error',
    });
  }
});

