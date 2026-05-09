'use strict';

/**
 * migrationCallables.js
 *
 * Cloud-callable functions for the Admin Migration Tool.
 * Restricted to role=admin only.
 *
 * Callable: runMigrationTool
 *   data.mode  — 'scan'  → dry-run: returns list of mismatches, no writes
 *              — 'apply' → fix mismatches: move docs + write audit logs
 *   data.orderId (optional) — scope to a single order; omit for full sweep
 *
 * Scans the following collections for doc-id / orderId prefix mismatches:
 *   - future-factory/production/tracked_products/** (items)
 *   - future-factory/production/archive/{year}/items
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const auditService = require('../services/auditService');
const { resolveUserRoleForContext } = require('../auth/resolveUserRole');
const { clean } = require('../utils/text');
const { withAudit } = require('../utils/withAudit');

const db = admin.firestore();

const BASE = 'future-factory';
const ADMIN_MIGRATION_ALLOWED_ROLES = new Set(['admin']);

const isTrackedOrArchiveItemsPath = (refPath) => {
  const p = String(refPath || '');
  return (
    p.includes(`${BASE}/production/tracked_products`) ||
    /\/production\/archive\/\d{4}\/items\//.test(p)
  );
};

/**
 * Given a current doc ID and the correct target orderId,
 * derive what the new doc ID should be.
 */
const buildCorrectDocId = ({ currentDocId, targetOrderId }) => {
  const safeDocId = clean(currentDocId);
  const safeOrder = clean(targetOrderId).toUpperCase();
  if (!safeDocId || !safeOrder) return safeDocId;

  const segments = safeDocId.split('_').filter(Boolean);
  if (segments.length <= 1) {
    return `${safeOrder}_${safeDocId}`;
  }
  return `${safeOrder}_${segments.slice(1).join('_')}`;
};

/**
 * Extract the order prefix from a doc ID.
 * E.g. "N20024781_EL4_xxx" → "N20024781"
 */
const extractDocIdPrefix = (docId) => {
  const segments = String(docId || '').split('_').filter(Boolean);
  return segments[0] || '';
};

/**
 * Page through all items docs in tracked_products and archive collections
 * that match the optional orderId filter.
 */
const scanForMismatches = async ({ orderId }) => {
  const mismatches = [];

  let query = db.collectionGroup('items');
  if (orderId) {
    query = query.where('orderId', '==', orderId.toUpperCase());
  }

  let lastDoc = null;
  const PAGE_SIZE = 500;

  while (true) {
    let page = query.orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDoc) page = page.startAfter(lastDoc);

    const snap = await page.get();
    if (snap.empty) break;

    snap.forEach((docSnap) => {
      const path = docSnap.ref.path;
      if (!isTrackedOrArchiveItemsPath(path)) return;

      const data = docSnap.data() || {};
      const docId = docSnap.id;
      const orderIdField = clean(data.orderId);

      if (!orderIdField) return;

      const docPrefix = extractDocIdPrefix(docId).toUpperCase();
      const expectedPrefix = orderIdField.toUpperCase();

      if (docPrefix !== expectedPrefix) {
        const newDocId = buildCorrectDocId({ currentDocId: docId, targetOrderId: orderIdField });
        mismatches.push({
          collection: path.replace(`/${docId}`, ''),
          oldDocId: docId,
          newDocId,
          orderId: orderIdField,
          machine: clean(data.machine || data.originMachine || ''),
          lotNumber: clean(data.lotNumber || ''),
          staleFieldsId: clean(data.id) !== newDocId ? clean(data.id) : null,
        });
      }
    });

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  return mismatches;
};

/**
 * Apply fixes: for each mismatch, move the doc to the correct ID.
 * Returns audit entries for each operation.
 */
const applyFixes = async ({ mismatches, actorUid, actorEmail, actorRole }) => {
  const results = [];

  for (const mismatch of mismatches) {
    const { collection, oldDocId, newDocId, orderId, lotNumber } = mismatch;

    try {
      const oldRef = db.doc(`${collection}/${oldDocId}`);
      const newRef = db.doc(`${collection}/${newDocId}`);

      const [oldSnap, newSnap] = await Promise.all([oldRef.get(), newRef.get()]);

      if (!oldSnap.exists) {
        results.push({ ...mismatch, status: 'SKIPPED', reason: 'source_not_found' });
        continue;
      }
      if (newSnap.exists) {
        results.push({ ...mismatch, status: 'SKIPPED', reason: 'target_already_exists' });
        continue;
      }

      const data = oldSnap.data();
      const batch = db.batch();
      batch.set(newRef, { ...data, id: newDocId, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      batch.delete(oldRef);
      await batch.commit();

      // Write audit log
      await auditService.logAction(
        actorUid,
        'MIGRATION_DOC_ID_REPAIR',
        {
          details: `Doc-id hersteld: ${oldDocId} → ${newDocId} (orderId: ${orderId}, lot: ${lotNumber || 'n/a'})`,
          orderId,
          productId: lotNumber || oldDocId,
          oldDocId,
          newDocId,
          collection,
          actorRole,
        },
        { severity: 'CRITICAL', category: 'ADMIN', userEmail: actorEmail || null },
      );

      results.push({ ...mismatch, status: 'FIXED' });
    } catch (err) {
      results.push({ ...mismatch, status: 'ERROR', reason: err.message });
    }
  }

  return results;
};

// ---------------------------------------------------------------------------
// Exported callable
// ---------------------------------------------------------------------------

/**
 * runMigrationTool
 *
 * Scans for and fixes mismatches between document IDs and their internal `orderId` fields.
 * Restricted to users with the 'admin' role.
 *
 * @param {Object} data - The payload from the client.
 * @param {'scan'|'apply'} data.mode - The mode to run in.
 *   - 'scan': Read-only. Returns a list of mismatches found.
 *   - 'apply': Modifies the database. Moves documents to correct IDs and writes audit logs.
 * @param {string} [data.orderId] - Optional. If provided, limits the scan to this specific orderId.
 * @param {Array} [data.mismatches] - Optional. For 'apply' mode, provide the exact mismatches to fix.
 * @param {functions.https.CallableContext} context - The Cloud Functions context (auth, etc.).
 *
 * @returns {Promise<Object>} The result of the operation.
 * @returns {string} return.mode - The mode that was executed ('scan' or 'apply').
 * @returns {Array} [return.mismatches] - Only in 'scan' mode. List of mismatches found.
 * @returns {number} [return.totalFound] - Only in 'scan' mode. Count of mismatches.
 * @returns {Array} [return.results] - Only in 'apply' mode. Result of each fix attempt.
 * @returns {number} [return.totalFixed] - Only in 'apply' mode. Count of successfully fixed docs.
 *
 * @throws {functions.https.HttpsError} If the user is unauthenticated or not an admin.
 */
const runMigrationTool = withAudit('RUN_MIGRATION_TOOL', async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  }

  // EXPLICITE ADMIN CHECK: Controleert of de gebruiker echt een Admin is (Senior Review eis)
  const userRole = await resolveUserRoleForContext(context);
  if (!ADMIN_MIGRATION_ALLOWED_ROLES.has(userRole) || userRole !== 'admin') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Alleen admins kunnen de migratie tool gebruiken.',
    );
  }

  const mode = clean(data?.mode);
  if (mode !== 'scan' && mode !== 'apply') {
    throw new functions.https.HttpsError('invalid-argument', 'mode moet "scan" of "apply" zijn.');
  }

  const orderId = clean(data?.orderId).toUpperCase() || null;

  if (mode === 'scan') {
    const mismatches = await scanForMismatches({ orderId });
    return { mode: 'scan', mismatches, totalFound: mismatches.length };
  }

  // Apply mode — must receive the mismatches from a prior scan so the UI
  // always shows the user what will be changed before committing.
  const mismatches = Array.isArray(data?.mismatches) ? data.mismatches : await scanForMismatches({ orderId });
  if (mismatches.length === 0) {
    return { mode: 'apply', results: [], totalFixed: 0 };
  }

  const results = await applyFixes({
    mismatches,
    actorUid: context.auth.uid,
    actorEmail: context.auth.token?.email || null,
    actorRole: userRole,
  });

  const totalFixed = results.filter((r) => r.status === 'FIXED').length;

  return { mode: 'apply', results, totalFixed };
});

module.exports = { runMigrationTool };
