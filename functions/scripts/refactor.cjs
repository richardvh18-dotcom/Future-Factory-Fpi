const fs = require('fs');
const path = require('path');

const indexJsPath = path.join(__dirname, '../index_legacy.js');
const sourceLines = fs.readFileSync(indexJsPath, 'utf8').split('\n');

const extractLines = (start, end) => sourceLines.slice(start - 1, end).join('\n');

// 1. Helpers
const helpersContent = `const admin = require('firebase-admin');
const functions = require('firebase-functions/v1');
const XLSX = require('xlsx');
const auditService = require('../services/auditService');
const {
  BASE, PLANNING_COLLECTION, TRACKING_COLLECTION, PLANNING_EVENTS_COLLECTION,
  PLANNING_EVENTS_ARCHIVE_COLLECTION, EFFICIENCY_COLLECTION, IMPORT_RUNS_COLLECTION,
  AI_RATE_LIMIT_COLLECTION, CLIENT_ERROR_LOG_COLLECTION, ATPS_PRESENCE_STATE_COLLECTION,
  ATPS_PRESENCE_SESSION_COLLECTION, ATPS_PRESENCE_MACHINE_ID, STATS_TODAY_DOC,
  STATS_DAILY_COLLECTION, STORAGE_IMPORT_FOLDER, ALLOWED_IMPORT_EXTENSIONS,
  AI_RATE_LIMIT_WINDOW_MS, AI_RATE_LIMIT_MAX_REQUESTS, AI_ALLOWED_MODELS,
  AI_MAX_MESSAGES, AI_MAX_MESSAGE_CHARS, AI_MAX_SYSTEM_PROMPT_CHARS,
  AI_MAX_TOTAL_CHARS, AI_MAX_CLIENT_ERROR_MSG, AI_MAX_CLIENT_ERROR_STACK,
  DEFAULT_SCOPED_DEPARTMENT, DEFAULT_SCOPED_MACHINE
} = require('../config/constants');

const db = admin.firestore();

${extractLines(160, 1253)}

module.exports = {
  clean, getLegacyRuntimeConfig, parseNum, normalizeMachine, normalizeMachineForFilter,
  toFirestoreSegment, toCanonicalScopedMachineSegment, resolveScopedDepartment,
  resolveScopedMachine, parseMachineSelectionInput, getConfiguredAllowedMachines,
  isSupportedImportFileName, toSafeDocId, resolveGoogleAiApiKey, containsPromptInjectionPattern,
  clampText, getEuropeAmsterdamDayKey, toNumber, normalizeEmployeeNumber, parseTimestampInput,
  getDateKeyFromDate, resolveAtpsWebhookToken, computeElapsedHours, closeActiveOccupancyForEmployee,
  normalizeStatusForStats, isPlanningActiveStatus, getPlanningContribution, getTrackedContribution,
  diffContribution, applyStatsDelta, createOrderLifecycleEvent, isUnderPath,
  getStartedCounterFieldByMachine, getPlanningOrderDocByOrderId, countActiveLotsForOrder,
  upsertOrderSafetyState, handlePlanningOrderWrite, normalizeAiMessages, secureSystemPrefix,
  buildProtectedSystemPrompt, enforceAiRateLimit, callGeminiGenerateContent, isStatusAllowed,
  getIsoWeek, classifyByWc, classifyReferenceOperation, getSplitPlannedHours,
  buildReferenceOperationSummary, findColumnIndex, processRawLNDump, pickBestSheetName,
  parseOrdersFromBuffer, importOrdersToFirestore
};
`;

fs.writeFileSync(path.join(__dirname, '../src/utils/helpers.js'), helpersContent);

// 2. Scheduled Jobs
const scheduledJobsContent = `const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { executeDrawingSync } = require('../services/drawingSyncService');
const db = admin.firestore();

${extractLines(48, 72)}
`;
fs.writeFileSync(path.join(__dirname, '../src/triggers/scheduledJobs.js'), scheduledJobsContent);

// 3. Webhooks
const webhooksContent = `const functions = require('firebase-functions/v1');
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

${extractLines(1255, 1568)}
`;
fs.writeFileSync(path.join(__dirname, '../src/triggers/webhooks.js'), webhooksContent);

// 4. Storage Triggers
const storageTriggersContent = `const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const db = admin.firestore();
const auditService = require('../services/auditService');
const { IMPORT_RUNS_COLLECTION, STORAGE_IMPORT_FOLDER } = require('../config/constants');
const { isSupportedImportFileName, toSafeDocId } = require('../utils/helpers');

${extractLines(1569, 1664)}
`;
fs.writeFileSync(path.join(__dirname, '../src/triggers/storageTriggers.js'), storageTriggersContent);

// 5. Database Triggers
const databaseTriggersContent = `const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const db = admin.firestore();
const {
  getPlanningContribution, getTrackedContribution, diffContribution, applyStatsDelta,
  handlePlanningOrderWrite
} = require('../utils/helpers');

${extractLines(1666, 1974)}
`;
fs.writeFileSync(path.join(__dirname, '../src/triggers/databaseTriggers.js'), databaseTriggersContent);

// 6. Client Logging Triggers (Wait, are they in index.js?)
// Yes, line 1927 has applyActivityLogTtl, etc. They are already in databaseTriggers.js.

console.log('Split complete!');
