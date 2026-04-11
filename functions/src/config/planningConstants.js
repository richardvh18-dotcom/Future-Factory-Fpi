const BASE = 'future-factory';

const TRACKING_COLLECTION = `${BASE}/production/tracked_products`;
const PLANNING_COLLECTION = `${BASE}/production/digital_planning`;
const PLANNING_COLLECTION_LEGACY = `${BASE}/production/data/digital_planning/orders`;
const USER_ACCOUNTS_COLLECTION = `${BASE}/Users/Accounts`;

const REJECT_ALLOWED_ROLES = new Set([
  'admin',
  'teamleader',
  'qc',
  'operator',
  'planner',
  'engineer',
  'management',
]);

const MANUAL_MOVE_ALLOWED_ROLES = new Set([
  'admin',
  'teamleader',
  'operator',
  'qc',
  'planner',
  'engineer',
  'management',
]);

const PLANNING_ARCHIVE_ALLOWED_ROLES = new Set([
  'admin',
  'teamleader',
  'planner',
  'management',
]);

const ALLOWED_ARCHIVE_REASONS = new Set(['rejected', 'completed', 'manual']);

const COMPLETE_ALLOWED_ROLES = new Set([
  'admin',
  'teamleader',
  'qc',
  'operator',
  'planner',
  'engineer',
  'management',
]);

const ALLOWED_FINISH_TYPES = new Set(['archive', 'forward']);

module.exports = {
  BASE,
  TRACKING_COLLECTION,
  PLANNING_COLLECTION,
  PLANNING_COLLECTION_LEGACY,
  USER_ACCOUNTS_COLLECTION,
  REJECT_ALLOWED_ROLES,
  MANUAL_MOVE_ALLOWED_ROLES,
  PLANNING_ARCHIVE_ALLOWED_ROLES,
  ALLOWED_ARCHIVE_REASONS,
  COMPLETE_ALLOWED_ROLES,
  ALLOWED_FINISH_TYPES,
};
