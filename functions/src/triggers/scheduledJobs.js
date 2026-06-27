const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { executeDrawingSync } = require('../services/drawingSyncService');
const db = admin.firestore();

exports.scheduledDrawingSync = functions.region('europe-west1').pubsub
  .schedule('0 2 * * *')
  .timeZone('Europe/Amsterdam')
  .onRun(async (context) => {
    // 1. Check if sync is enabled and if custom schedule is needed
    const settingsDoc = await db.doc('future-factory/settings/general_configs/main').get();
    const settings = settingsDoc.data() || {};
    
    if (settings.drawingSyncEnabled === false) {
      return null;
    }

    try {
      await executeDrawingSync();
      
      // Update last successful run in settings
      await settingsDoc.ref.set({
        lastDrawingSync: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
    } catch (error) {
      console.error('Scheduled Drawing Sync Error:', error);
    }
    return null;
  });
