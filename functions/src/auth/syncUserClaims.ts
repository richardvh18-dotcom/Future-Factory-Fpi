// @ts-nocheck

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { DB_PATHS } = require('../config/dbPaths');

exports.syncUserClaimsOnWrite = functions.region('europe-west1').firestore
  .document(`${DB_PATHS.USER_ACCOUNTS}/{userId}`)
  .onWrite(async (change, context) => {
    const userId = context.params.userId;
    const afterData = change.after.exists ? change.after.data() : null;
    const beforeData = change.before.exists ? change.before.data() : null;

    if (!afterData) {
      return null;
    }

    const role = String(afterData.role || '').toLowerCase().trim();
    const beforeRole = beforeData ? String(beforeData.role || '').toLowerCase().trim() : '';

    if (role === beforeRole) {
      return null;
    }

    try {
      const userRecord = await admin.auth().getUser(userId);
      const currentClaims = userRecord.customClaims || {};
      
      await admin.auth().setCustomUserClaims(userId, {
        ...currentClaims,
        role: role || null,
      });
      
      
      const { logSystem } = require('../services/auditService');
      logSystem('USER_ROLE_CHANGED', { userId, oldRole: beforeRole, newRole: role }, { category: 'SECURITY', severity: 'WARNING' });
      
    } catch (error) {
      console.error(`Error syncing custom claims for user ${userId}:`, error);
    }
    
    return null;
  });
