// @ts-nocheck

'use strict';

/**
 * auditService.js — ISO 9001 / ISO 27001 compliant audit logging.
 *
 * All entries are written via the Firebase Admin SDK to:
 *   DB_PATHS.AUDIT_LOGS/{autoId}
 *
 * Firestore rules block ALL client writes to this path — entries are
 * append-only from the backend, which provides the tamper-evidence
 * required by ISO 27001 A.12.4 (Logging and monitoring).
 *
 * Log categories:
 *   QUALITY    — ISO 9001: reject, repair, QC notes, lot traceability
 *   PRODUCTION — ISO 9001: start, advance, complete, pause, route
 *   PLANNING   — ISO 9001: import, archive, cancel, move, priority
 *   ADMIN      — ISO 27001: product/conversion/AI master data mutations
 *   SECURITY   — ISO 27001: auth events, role changes (future extension)
 *   SYSTEM     — Internal: print queue, automation rules, language settings
 *
 * Severity levels:
 *   INFO     — Normal operational event
 *   WARNING  — Potentially significant change (deletions, cancellations)
 *   CRITICAL — High-impact irreversible action (bulk delete, migration, final reject)
 */

const admin = require('firebase-admin');
const { DB_PATHS } = require('../config/dbPaths');

/**
 * Writes an audit log entry to DB_PATHS.AUDIT_LOGS.
 * Called server-side only; the Firestore rules block any client writes.
 *
 * @param {string}        userId          Firebase Auth UID of the actor.
 * @param {string}        action          Action constant, e.g. 'REJECT_PRODUCT_FINAL'.
 * @param {object}        [details={}]    Primary entity IDs and context (orderId, productId…).
 * @param {object}        [options={}]
 * @param {'INFO'|'WARNING'|'CRITICAL'}  [options.severity='INFO']
 * @param {'QUALITY'|'PRODUCTION'|'PLANNING'|'ADMIN'|'SECURITY'|'SYSTEM'} [options.category='PRODUCTION']
 * @param {string|null}   [options.userEmail=null]  Email address of the actor.
 * @returns {Promise<void>}
 */
async function logAction(userId, action, details = {}, options = {}) {
  const {
    severity = 'INFO',
    category = 'PRODUCTION',
    userEmail = null,
  } = options;

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

  await admin.firestore()
    .collection(DB_PATHS.AUDIT_LOGS)
    .add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      userId: userId || 'system',
      userEmail: userEmail || null,
      action,
      category,
      severity,
      details,
      year,
      month,
      yearMonth,
    });
}

/**
 * Fire-and-forget audit helper designed for use inside onCall handlers.
 * Extracts uid and email from the Firebase Functions call context automatically.
 * Does NOT throw on failure — logs the error to Cloud Logging (stdout) instead,
 * so a transient Firestore write error never blocks a production operation.
 *
 * Usage (add once at the start of each callable, after auth/role validation):
 *   auditService.logCallable(context, 'ACTION_NAME', { orderId }, { category: 'PLANNING', severity: 'INFO' });
 *
 * @param {object}  context           Firebase Functions call context.
 * @param {string}  action            Action constant (UPPER_SNAKE_CASE).
 * @param {object}  [details={}]      Key entity identifiers for traceability.
 * @param {object}  [options={}]      Optional severity / category overrides.
 */
function logCallable(context, action, details = {}, options = {}) {
  const uid = context.auth?.uid || 'anonymous';
  const email = context.auth?.token?.email || null;

  logAction(uid, action, details, { ...options, userEmail: email })
    .catch((err) => {
      // Log to Cloud Logging — never let audit failures surface to the caller
      console.error(`[auditService] Failed to write audit log for action "${action}":`, err?.message || err);
    });
}

/**
 * Logs a failed authentication or authorization attempt for callable handlers.
 * This produces explicit SECURITY trail entries without breaking request flow.
 *
 * @param {object} context
 * @param {string} action
 * @param {'UNAUTHENTICATED'|'PERMISSION_DENIED'} reason
 * @param {object} [details={}]
 */
function logCallableSecurityDenied(context, action, reason, details = {}) {
  logCallable(
    context,
    `SECURITY_${reason}`,
    {
      action,
      ...details,
    },
    {
      category: 'SECURITY',
      severity: reason === 'PERMISSION_DENIED' ? 'WARNING' : 'INFO',
    },
  );
}

/**
 * Captures a lightweight snapshot of a Firestore DocumentReference for
 * use as a before/after value in audit log details.
 *
 * Returns the plain `data()` object if the document exists, or null.
 * Never throws — a snapshot failure must not block a production operation.
 *
 * @param {FirebaseFirestore.DocumentReference} docRef
 * @returns {Promise<object|null>}
 */
async function captureSnapshot(docRef) {
  try {
    const snap = await docRef.get();
    return snap.exists ? snap.data() : null;
  } catch (err) {
    console.error('[auditService] captureSnapshot failed:', err?.message || err);
    return null;
  }
}

/**
 * Fire-and-forget system-level audit helper for use outside onCall handlers
 * (e.g. Firestore triggers, Storage triggers, scheduled functions, webhooks).
 * Uses 'system' as the actor unless an explicit userId is supplied.
 *
 * @param {string}  action
 * @param {object}  [details={}]
 * @param {object}  [options={}]
 * @param {string}  [options.userId='system']
 * @param {string}  [options.category='SYSTEM']
 * @param {'INFO'|'WARNING'|'CRITICAL'} [options.severity='INFO']
 */
function logSystem(action, details = {}, options = {}) {
  const {
    userId = 'system',
    category = 'SYSTEM',
    severity = 'INFO',
  } = options;

  logAction(userId, action, details, { category, severity })
    .catch((err) => {
      console.error(`[auditService] Failed to write system audit log for action "${action}":`, err?.message || err);
    });
}

module.exports = {
  logAction,
  logCallable,
  logCallableSecurityDenied,
  logSystem,
  captureSnapshot,
};
