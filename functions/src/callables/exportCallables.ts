// @ts-nocheck

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const XLSX = require('xlsx');
const { withAudit } = require('../utils/withAudit');
const { DB_PATHS } = require('../config/dbPaths');

const db = admin.firestore();

const OCCUPANCY_COLLECTION = DB_PATHS.MACHINE_OCCUPANCY;
const ATPS_EXPORT_RUNS_COLLECTION = DB_PATHS.ATPS_EXPORT_RUNS;
const ATPS_PREVIEW_RUNS_COLLECTION = DB_PATHS.ATPS_PREVIEW_RUNS;
const ATPS_RETRY_QUEUE_COLLECTION = DB_PATHS.ATPS_RETRY_QUEUE;
const ATPS_RETRY_MAX_ATTEMPTS = 8;
const ATPS_RETRY_BASE_MINUTES = 5;

const DEFAULT_ATPS_PREVIEW_LIMIT = 200;

const clean = (value) => String(value || '').trim();

const parseBoolean = (value, fallback = false) => {
    if (value === undefined || value === null || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
};

const parsePositiveInt = (value, fallback = 200, min = 1, max = 1000) => {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
};

const toDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value?.toDate === 'function') {
        const d = value.toDate();
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

const toISO = (value) => {
    const d = toDate(value);
    return d ? d.toISOString() : null;
};

const getLegacyRuntimeConfig = () => {
    try {
        const raw = clean(process.env.CLOUD_RUNTIME_CONFIG);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch (_error) {
        return {};
    }
};

const resolveAtpsConfig = () => {
    const runtimeConfig = getLegacyRuntimeConfig();
    const atpsConfig = runtimeConfig?.atps || runtimeConfig?.integration?.atps || {};

    const enabled = parseBoolean(process.env.ATPS_EXPORT_ENABLED, parseBoolean(atpsConfig.enabled, false));
    const dryRunDefault = parseBoolean(process.env.ATPS_EXPORT_DRY_RUN, parseBoolean(atpsConfig.dry_run, true));
    const url = clean(process.env.ATPS_EXPORT_URL || atpsConfig.url || '');
    const token = clean(process.env.ATPS_EXPORT_TOKEN || atpsConfig.token || '');
    const defaultLimit = parsePositiveInt(process.env.ATPS_EXPORT_BATCH_LIMIT || atpsConfig.batch_limit, 200, 1, 1000);

    return {
        enabled,
        dryRunDefault,
        url,
        token,
        defaultLimit,
        hasUrl: Boolean(url),
        hasToken: Boolean(token),
    };
};

const toAtpsPreviewRow = (docId, raw = {}) => {
    const hoursWorked = Number(raw.hoursWorked || 0);
    const hoursWorkedGross = Number(raw.hoursWorkedGross || hoursWorked || 0);
    const checkedInAt = toDate(raw.shiftEffectiveStart || raw.checkedInAt);
    const checkedOutAt = toDate(raw.checkedOutAt);

    return {
        id: docId,
        employeeNumber: clean(raw.operatorNumber),
        employeeName: clean(raw.operatorName),
        machineId: clean(raw.machineId),
        departmentId: clean(raw.departmentId),
        shift: clean(raw.shift),
        shiftKey: clean(raw.shiftKey),
        date: clean(raw.date),
        checkedInAt: checkedInAt ? checkedInAt.toISOString() : null,
        checkedOutAt: checkedOutAt ? checkedOutAt.toISOString() : null,
        hoursWorked: Number.isFinite(hoursWorked) ? Number(hoursWorked.toFixed(2)) : 0,
        hoursWorkedGross: Number.isFinite(hoursWorkedGross) ? Number(hoursWorkedGross.toFixed(2)) : 0,
        breakDeductedHours: Number(raw.breakDeductedHours || 0),
        hoursAdjusted: Boolean(raw.hoursAdjusted),
        hoursAdjustedAt: toISO(raw.hoursAdjustedAt),
        hoursAdjustedBy: clean(raw.hoursAdjustedBy),
        hoursCorrectionReason: clean(raw.hoursCorrectionReason),
        source: clean(raw.source),
        atpsExported: Boolean(raw.atpsExported),
    };
};

const chunkArray = (items = [], size = 450) => {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
};

const computeRetryDelayMinutes = (retryCount) => {
    const c = Math.max(1, Number(retryCount || 1));
    return Math.min(12 * 60, ATPS_RETRY_BASE_MINUTES * Math.pow(2, c - 1));
};

const markRecordsAsExported = async (records = [], exportRunId = '') => {
    if (!Array.isArray(records) || records.length === 0) return 0;
    const nowIso = new Date().toISOString();
    let updated = 0;

    const chunks = chunkArray(records, 450);
    for (const chunk of chunks) {
        const batch = db.batch();
        chunk.forEach((record) => {
            const docRef = db.collection(OCCUPANCY_COLLECTION).doc(String(record.id));
            batch.set(docRef, {
                atpsExported: true,
                atpsExportedAt: admin.firestore.FieldValue.serverTimestamp(),
                atpsExportedAtIso: nowIso,
                atpsExportRunId: clean(exportRunId),
                atpsRetryStatus: 'none',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            updated += 1;
        });
        await batch.commit();
    }

    return updated;
};

const sendAtpsPayload = async (cfg, records = [], meta = {}) => {
    if (!Array.isArray(records) || records.length === 0) {
        return { ok: true, status: 204, bodySnippet: '', skipped: true };
    }

    const response = await fetch(cfg.url, {
        method: 'POST',
        headers: {
            Authorization: `AtpsToken ${cfg.token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            generatedAt: new Date().toISOString(),
            source: `${DB_PATHS.MACHINE_OCCUPANCY.replace(/\//g, '.')}`,
            count: records.length,
            records,
            meta,
        }),
    });

    const bodyText = await response.text();
    return {
        ok: response.ok,
        status: response.status,
        bodySnippet: String(bodyText || '').slice(0, 800),
        skipped: false,
    };
};

const enqueueRetryItems = async (records = [], options = {}) => {
    if (!Array.isArray(records) || records.length === 0) return 0;
    const runId = clean(options.exportRunId);
    let queued = 0;

    for (const record of records) {
        const recordId = clean(record?.id);
        if (!recordId) continue;

        const existingSnap = await db.collection(ATPS_RETRY_QUEUE_COLLECTION)
            .where('recordId', '==', recordId)
            .where('status', 'in', ['pending', 'processing'])
            .limit(1)
            .get();

        if (!existingSnap.empty) continue;

        const queueRef = db.collection(ATPS_RETRY_QUEUE_COLLECTION).doc();
        const nextRetryAt = new Date(Date.now() + computeRetryDelayMinutes(1) * 60 * 1000);
        await queueRef.set({
            recordId,
            status: 'pending',
            retryCount: 0,
            maxAttempts: ATPS_RETRY_MAX_ATTEMPTS,
            nextRetryAt: admin.firestore.Timestamp.fromDate(nextRetryAt),
            nextRetryAtIso: nextRetryAt.toISOString(),
            lastError: clean(options.errorMessage),
            payload: record,
            exportRunId: runId || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await db.collection(OCCUPANCY_COLLECTION).doc(recordId).set({
            atpsRetryStatus: 'queued',
            atpsRetryQueueId: queueRef.id,
            atpsLastRetryError: clean(options.errorMessage),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        queued += 1;
    }

    return queued;
};

const runAtpsOccupancyPreview = async (input = {}) => {
    const cfg = resolveAtpsConfig();
    const requestedLimit = parsePositiveInt(input?.limit, cfg.defaultLimit || DEFAULT_ATPS_PREVIEW_LIMIT, 1, 1000);
    const dateFrom = toDate(input?.dateFrom);
    const dateTo = toDate(input?.dateTo);
    const executeLive = parseBoolean(input?.executeLive, false);
    const forceDryRun = parseBoolean(input?.dryRun, cfg.dryRunDefault);
    const includeRecords = parseBoolean(input?.includeRecords, true);
    const allowLive = parseBoolean(input?.allowLive, true);
    const markExportedOnSuccess = parseBoolean(input?.markExportedOnSuccess, false);
    const enqueueOnFailure = parseBoolean(input?.enqueueOnFailure, false);
    const throwOnDeliveryError = parseBoolean(input?.throwOnDeliveryError, false);
    const exportRunId = clean(input?.exportRunId);
    const effectiveDryRun = forceDryRun || !executeLive;

    const occSnap = await db.collection(OCCUPANCY_COLLECTION).limit(5000).get();

    const candidates = occSnap.docs
        .map((doc) => ({ id: doc.id, raw: doc.data() || {} }))
        .filter(({ raw }) => {
            if (raw?.atpsExported === true) return false;
            if (!raw?.checkedOutAt) return false;

            const checkedOutAt = toDate(raw.checkedOutAt);
            if (!checkedOutAt) return false;
            if (dateFrom && checkedOutAt < dateFrom) return false;
            if (dateTo && checkedOutAt > dateTo) return false;
            return true;
        })
        .sort((a, b) => {
            const aTime = toDate(a.raw.checkedOutAt)?.getTime() || 0;
            const bTime = toDate(b.raw.checkedOutAt)?.getTime() || 0;
            return aTime - bTime;
        })
        .slice(0, requestedLimit)
        .map(({ id, raw }) => toAtpsPreviewRow(id, raw));

    const totals = candidates.reduce((acc, row) => {
        acc.count += 1;
        acc.hoursWorked += Number(row.hoursWorked || 0);
        acc.hoursWorkedGross += Number(row.hoursWorkedGross || 0);
        if (row.hoursAdjusted) acc.adjustedCount += 1;
        return acc;
    }, { count: 0, hoursWorked: 0, hoursWorkedGross: 0, adjustedCount: 0 });

    const liveEligible = allowLive && cfg.enabled && cfg.hasUrl && cfg.hasToken && !effectiveDryRun;
    const noopReason = !liveEligible
        ? (!cfg.enabled
            ? 'ATPS export staat uit (ATPS_EXPORT_ENABLED=false).'
            : (!cfg.hasUrl || !cfg.hasToken)
                ? 'ATPS URL/token ontbreekt in configuratie.'
                : !allowLive
                    ? 'Live modus uitgeschakeld voor deze runner.'
                    : 'Dry-run/no-op modus actief.')
        : null;

    const delivery = {
        attempted: false,
        success: false,
        status: null,
        responseSnippet: '',
        markedExported: 0,
        queuedForRetry: 0,
        error: '',
    };

    if (liveEligible && candidates.length > 0) {
        delivery.attempted = true;
        const sendResult = await sendAtpsPayload(cfg, candidates, {
            exportRunId,
            mode: 'occupancy_live_export',
        });

        delivery.status = sendResult.status;
        delivery.responseSnippet = sendResult.bodySnippet;

        if (sendResult.ok) {
            delivery.success = true;
            if (markExportedOnSuccess) {
                delivery.markedExported = await markRecordsAsExported(candidates, exportRunId);
            }
        } else {
            delivery.error = `ATPS call mislukt (${sendResult.status}): ${sendResult.bodySnippet}`;
            if (enqueueOnFailure) {
                delivery.queuedForRetry = await enqueueRetryItems(candidates, {
                    exportRunId,
                    errorMessage: delivery.error,
                });
            }
            if (throwOnDeliveryError) {
                throw new functions.https.HttpsError('internal', delivery.error);
            }
        }
    }

    return {
        mode: liveEligible ? 'live' : 'passive',
        dryRun: effectiveDryRun,
        executeLive,
        liveEligible,
        noopReason,
        config: {
            enabled: cfg.enabled,
            dryRunDefault: cfg.dryRunDefault,
            hasUrl: cfg.hasUrl,
            hasToken: cfg.hasToken,
            defaultLimit: cfg.defaultLimit,
        },
        filter: {
            dateFrom: dateFrom ? dateFrom.toISOString() : null,
            dateTo: dateTo ? dateTo.toISOString() : null,
            limit: requestedLimit,
        },
        totals: {
            count: totals.count,
            adjustedCount: totals.adjustedCount,
            hoursWorked: Number(totals.hoursWorked.toFixed(2)),
            hoursWorkedGross: Number(totals.hoursWorkedGross.toFixed(2)),
        },
        delivery,
        records: includeRecords ? candidates : [],
    };
};

exports.runAtpsOccupancyPreview = runAtpsOccupancyPreview;

/**
 * Genereert een Excel export op de achtergrond en slaat deze op in Firestore
 * zodat het systeem niet wordt belast.
 */
exports.requestExportTask = withAudit(
    'REQUEST_EXPORT_TASK',
    async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'De gebruiker moet ingelogd zijn.');
    }

    const { exportType, filter = {}, taskName } = data;
    const userId = context.auth.uid;

    // 1. Maak een Task document aan om de voortgang bij te houden
    const taskRef = await db.collection(DB_PATHS.EXPORT_TASKS).add({
        userId,
        exportType,
        status: 'processing',
        progress: 0,
        taskName: taskName || `Export ${exportType}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Start de verwerking (we wachten niet op het resultaat via await in deze return)
    // Maar we gebruiken een aparte async flow of we doen het direct hier als we v1 gebruiken (snelle timeout)
    // Voor grotere datasets is een PubSub of Queue beter, maar voor nu doen we de verwerking direct.
    
    try {
        let exportData = [];
        
        if (exportType === 'ln_compare') {
            exportData = await generateLNCompareData(filter);
        } else if (exportType === 'planning') {
            exportData = await generatePlanningExportData(filter);
        }

        // 2. Genereer Excel buffer
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Export");
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // 3. Sla het resultaat op (Base64 voor demo, of Firebase Storage voor productie)
        // Omdat we in deze omgeving v1 gebruiken en de limiet voor Firestore docs 1MB is,
        // is Storage beter. Maar voor nu slaan we een "downloadUrl" referentie op.
        // Simulatie: we slaan het op in een subcollectie of Storage.
        
        // Voor nu: we simuleren de download.
        await taskRef.update({
            status: 'completed',
            progress: 100,
            result: buffer.toString('base64'),
            fileName: `Export_${exportType}_${new Date().getTime()}.xlsx`,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

    } catch (error) {
        console.error('Export Task Error:', error);
        await taskRef.update({
            status: 'failed',
            error: error.message,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    return { taskId: taskRef.id };
    },
    (handler) => functions.region('europe-west1').https.onCall(handler),
);

/**
 * Preview (passieve modus) van machine_occupancy records die klaarstaan voor ATPS-export.
 *
 * Gedrag:
 * - Standaard dry-run/no-op (geen externe calls, geen mutaties).
 * - Live call naar ATPS kan pas als expliciet enabled + executeLive + URL + token.
 */
exports.previewAtpsOccupancyExport = withAudit(
        'ATPS_EXPORT_PREVIEW',
        async (data, context) => {
            if (!context.auth) {
                throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
            }

            return runAtpsOccupancyPreview({
                ...data,
                allowLive: true,
                includeRecords: true,
            });
        },
        (handler) => functions.region('europe-west1').https.onCall(handler),
);

exports.executeAtpsOccupancyExport = withAudit(
    'ATPS_EXPORT_EXECUTE',
    async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
        }

        const runRef = await db.collection(ATPS_EXPORT_RUNS_COLLECTION).add({
            status: 'running',
            type: 'manual_live_export',
            actorUid: context.auth.uid,
            actorEmail: clean(context.auth.token?.email),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAtIso: new Date().toISOString(),
            source: 'executeAtpsOccupancyExport',
        });

        try {
            const result = await runAtpsOccupancyPreview({
                ...data,
                dryRun: false,
                executeLive: true,
                allowLive: true,
                includeRecords: true,
                markExportedOnSuccess: true,
                enqueueOnFailure: true,
                throwOnDeliveryError: false,
                exportRunId: runRef.id,
            });

            const status = result?.delivery?.success ? 'success' : 'partial';
            await runRef.set({
                status,
                finishedAt: admin.firestore.FieldValue.serverTimestamp(),
                finishedAtIso: new Date().toISOString(),
                mode: result.mode,
                totals: result.totals,
                filter: result.filter,
                config: result.config,
                delivery: result.delivery,
                noopReason: result.noopReason || null,
            }, { merge: true });

            return {
                ok: true,
                runId: runRef.id,
                ...result,
            };
        } catch (error) {
            await runRef.set({
                status: 'failed',
                finishedAt: admin.firestore.FieldValue.serverTimestamp(),
                finishedAtIso: new Date().toISOString(),
                error: String(error?.message || error || 'Onbekende fout').slice(0, 1200),
            }, { merge: true });
            throw error;
        }
    },
    (handler) => functions.region('europe-west1').https.onCall(handler),
);

const processAtpsRetryQueueInternal = async (input = {}) => {
    const cfg = resolveAtpsConfig();
    const limit = parsePositiveInt(input?.limit, 100, 1, 200);

    if (!cfg.enabled || !cfg.hasUrl || !cfg.hasToken) {
        return {
            ok: true,
            skipped: true,
            reason: 'ATPS configuratie niet compleet of export disabled.',
            processed: 0,
            success: 0,
            failed: 0,
            rescheduled: 0,
        };
    }

    const now = new Date();
    const dueSnap = await db.collection(ATPS_RETRY_QUEUE_COLLECTION)
        .where('status', '==', 'pending')
        .where('nextRetryAt', '<=', admin.firestore.Timestamp.fromDate(now))
        .limit(limit)
        .get();

    const summary = {
        ok: true,
        skipped: false,
        processed: 0,
        success: 0,
        failed: 0,
        rescheduled: 0,
    };

    for (const docSnap of dueSnap.docs) {
        const item = docSnap.data() || {};
        const record = item.payload || null;
        const recordId = clean(item.recordId || record?.id);
        if (!record || !recordId) {
            await docSnap.ref.set({
                status: 'failed',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastError: 'Queue item mist payload/recordId',
            }, { merge: true });
            summary.processed += 1;
            summary.failed += 1;
            continue;
        }

        await docSnap.ref.set({
            status: 'processing',
            processingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        try {
            const sendResult = await sendAtpsPayload(cfg, [record], {
                queueId: docSnap.id,
                mode: 'retry_queue',
            });

            if (sendResult.ok) {
                await markRecordsAsExported([record], clean(item.exportRunId || 'retry_queue'));
                await docSnap.ref.set({
                    status: 'done',
                    responseStatus: sendResult.status,
                    responseSnippet: sendResult.bodySnippet,
                    finishedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                summary.success += 1;
            } else {
                const retryCount = Number(item.retryCount || 0) + 1;
                const maxAttempts = Number(item.maxAttempts || ATPS_RETRY_MAX_ATTEMPTS);
                const isFinal = retryCount >= maxAttempts;
                const delayMinutes = computeRetryDelayMinutes(retryCount);
                const nextRetryDate = new Date(Date.now() + delayMinutes * 60 * 1000);
                await docSnap.ref.set({
                    status: isFinal ? 'failed' : 'pending',
                    retryCount,
                    responseStatus: sendResult.status,
                    responseSnippet: sendResult.bodySnippet,
                    lastError: `ATPS ${sendResult.status}: ${sendResult.bodySnippet}`,
                    nextRetryAt: admin.firestore.Timestamp.fromDate(nextRetryDate),
                    nextRetryAtIso: nextRetryDate.toISOString(),
                    finishedAt: isFinal ? admin.firestore.FieldValue.serverTimestamp() : null,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });

                await db.collection(OCCUPANCY_COLLECTION).doc(recordId).set({
                    atpsRetryStatus: isFinal ? 'failed' : 'queued',
                    atpsLastRetryError: `ATPS ${sendResult.status}: ${sendResult.bodySnippet}`,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });

                if (isFinal) summary.failed += 1;
                else summary.rescheduled += 1;
            }
        } catch (error) {
            const retryCount = Number(item.retryCount || 0) + 1;
            const maxAttempts = Number(item.maxAttempts || ATPS_RETRY_MAX_ATTEMPTS);
            const isFinal = retryCount >= maxAttempts;
            const delayMinutes = computeRetryDelayMinutes(retryCount);
            const nextRetryDate = new Date(Date.now() + delayMinutes * 60 * 1000);
            const errText = String(error?.message || error || 'Onbekende retry fout').slice(0, 1200);

            await docSnap.ref.set({
                status: isFinal ? 'failed' : 'pending',
                retryCount,
                lastError: errText,
                nextRetryAt: admin.firestore.Timestamp.fromDate(nextRetryDate),
                nextRetryAtIso: nextRetryDate.toISOString(),
                finishedAt: isFinal ? admin.firestore.FieldValue.serverTimestamp() : null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            await db.collection(OCCUPANCY_COLLECTION).doc(recordId).set({
                atpsRetryStatus: isFinal ? 'failed' : 'queued',
                atpsLastRetryError: errText,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            if (isFinal) summary.failed += 1;
            else summary.rescheduled += 1;
        }

        summary.processed += 1;
    }

    return summary;
};

exports.processAtpsRetryQueueInternal = processAtpsRetryQueueInternal;

exports.processAtpsRetryQueue = withAudit(
    'ATPS_RETRY_QUEUE_PROCESS',
    async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
        }
        return processAtpsRetryQueueInternal(data || {});
    },
    (handler) => functions.region('europe-west1').https.onCall(handler),
);

exports.getAtpsExportMonitor = withAudit(
    'ATPS_EXPORT_MONITOR',
    async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
        }

        const runsLimit = parsePositiveInt(data?.runsLimit, 20, 1, 100);
        const previewLimit = parsePositiveInt(data?.previewLimit, 20, 1, 100);

        const [runsSnap, previewSnap, pendingSnap, failedSnap] = await Promise.all([
            db.collection(ATPS_EXPORT_RUNS_COLLECTION).orderBy('createdAt', 'desc').limit(runsLimit).get(),
            db.collection(ATPS_PREVIEW_RUNS_COLLECTION).orderBy('startedAt', 'desc').limit(previewLimit).get(),
            db.collection(ATPS_RETRY_QUEUE_COLLECTION).where('status', '==', 'pending').limit(300).get(),
            db.collection(ATPS_RETRY_QUEUE_COLLECTION).where('status', '==', 'failed').limit(300).get(),
        ]);

        const mapDoc = (docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) });

        return {
            runs: runsSnap.docs.map(mapDoc),
            previewRuns: previewSnap.docs.map(mapDoc),
            retryQueue: {
                pendingCount: pendingSnap.size,
                failedCount: failedSnap.size,
                pendingItems: pendingSnap.docs.slice(0, 20).map(mapDoc),
                failedItems: failedSnap.docs.slice(0, 20).map(mapDoc),
            },
        };
    },
    (handler) => functions.region('europe-west1').https.onCall(handler),
);

async function generateLNCompareData(filter) {
    const { selectedMachine } = filter;
    
    const ordersSnapshot = await db.collection(DB_PATHS.PRODUCTION_PLANNING).get();
    const productsSnapshot = await db.collection(DB_PATHS.TRACKED_PRODUCTS).get();

    const allOrders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const allProducts = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const filteredOrders = allOrders.filter(o => {
        if (!selectedMachine || selectedMachine === "Alle machines") return true;
        let m = String(o.machine || "").toUpperCase().replace(/\s/g, "");
        if (m.startsWith("40")) m = m.slice(2);
        let filterM = selectedMachine.toUpperCase().replace(/\s/g, "");
        if (filterM.startsWith("40")) filterM = filterM.slice(2);
        return m === filterM;
    });

    return filteredOrders.map(order => {
        const orderId = String(order.orderId || "").trim().toUpperCase();
        const orderProducts = allProducts.filter(p => String(p.orderId || "").trim().toUpperCase() === orderId);
        
        const gereedCount = orderProducts.filter(p => {
            const stepUpper = String(p.currentStep || "").toUpperCase();
            const statusUpper = String(p.status || "").toUpperCase();
            const isArchived = !!(p.archived || p._archived || p.archivedAt);
            return isArchived || statusUpper === "COMPLETED" || statusUpper === "GEREED" || stepUpper === "FINISHED";
        }).length;

        return {
            "Ordernummer": orderId,
            "Datum": order.deliveryDate || "",
            "Afdeling": order.machine || "",
            "Status": order.isGeheelGereed ? "Gereed" : "Actief",
            "Artikel": order.itemCode || order.articleId || "",
            "Omschrijving": order.item || order.description || "",
            "Plan Aantal": Number(order.plan || order.quantity || 0),
            "Gemaakt Aantal": gereedCount,
            "Totaal Gemaakt": gereedCount,
            "Laatste Sync": order.lastSync || ""
        };
    });
}

async function generatePlanningExportData(filter) {
    const { selectedMachine } = filter;
    
    const ordersSnapshot = await db.collection(DB_PATHS.PRODUCTION_PLANNING).get();
    const allOrders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const filteredOrders = allOrders.filter(o => {
        if (!selectedMachine || selectedMachine === "Alle machines") return true;
        let m = String(o.machine || "").toUpperCase().replace(/\s/g, "");
        if (m.startsWith("40")) m = m.slice(2);
        let filterM = selectedMachine.toUpperCase().replace(/\s/g, "");
        if (filterM.startsWith("40")) filterM = filterM.slice(2);
        return m === filterM;
    });

    return filteredOrders.map(order => ({
        "Ordernummer": String(order.orderId || "").toUpperCase(),
        "Artikel": order.itemCode || order.articleId || "",
        "Omschrijving": order.item || order.description || "",
        "Machine": order.machine || "",
        "Leverdatum": order.deliveryDate || order.plannedDate || "",
        "Status": order.status || "",
        "Plan Aantal": Number(order.plan || order.quantity || 0),
        "Te doen": Number(order.toDoQty || 0)
    }));
}
