// @ts-nocheck
const functions = require('firebase-functions/v1');
const firestore = require('@google-cloud/firestore');
const client = new firestore.v1.FirestoreAdminClient();

// Verander dit naar de naam van de storage bucket voor backups.
// Standaard is het aanbevolen om een specifieke bucket te maken (bijv. project_id-backups).
const BUCKET = `gs://${process.env.GCLOUD_PROJECT}-firestore-backups`;

exports.scheduledFirestoreExport = functions.region('europe-west1')
  .pubsub.schedule('every 24 hours')
  .timeZone('Europe/Amsterdam')
  .onRun(async () => {
    const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
    const databaseName = client.databasePath(projectId, '(default)');

    try {
      const responses = await client.exportDocuments({
        name: databaseName,
        outputUriPrefix: BUCKET,
        // Laat leeg om alle collecties te backuppen:
        collectionIds: [],
      });

      const response = responses[0];
      
      const { logSystem } = require('../services/auditService');
      logSystem('FIRESTORE_BACKUP_STARTED', { operation: response.name, bucket: BUCKET }, { category: 'SYSTEM', severity: 'INFO' });
      
      return null;
    } catch (err) {
      console.error('Failed to trigger Firestore export:', err);
      const { logSystem } = require('../services/auditService');
      logSystem('FIRESTORE_BACKUP_FAILED', { error: err.message }, { category: 'SYSTEM', severity: 'CRITICAL' });
      throw new Error('Export operation failed');
    }
  });
