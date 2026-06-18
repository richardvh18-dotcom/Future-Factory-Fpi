// @ts-nocheck

const { DB_BASE, DB_PATHS } = require('./dbPaths');

const BASE = DB_BASE;

const TRACKING_COLLECTION = DB_PATHS.TRACKED_PRODUCTS;
const PLANNING_COLLECTION = DB_PATHS.PRODUCTION_PLANNING;
const PRODUCTION_EVENTS_COLLECTION = DB_PATHS.PRODUCTION_EVENTS;
const PLANNING_COLLECTION_LEGACY = DB_PATHS.PRODUCTION_PLANNING_LEGACY;
const USER_ACCOUNTS_COLLECTION = DB_PATHS.USER_ACCOUNTS;

const REJECT_ALLOWED_ROLES = new Set([
  'admin',
  'teamleader',
  'qc',
  'operator',
  'planner',
  'engineer',
  'management',
]);

const TEMP_REJECT_ALLOWED_ROLES = new Set([
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

const ALLOWED_FINISH_TYPES = new Set(['archive', 'forward', 'post_inspection']);

const CANCEL_ALLOWED_ROLES = new Set([
  'admin',
  'teamleader',
  'qc',
  'operator',
  'planner',
  'engineer',
  'management',
]);

const ORDER_PRIORITY_ALLOWED_ROLES = new Set([
  'admin',
  'teamleader',
  'planner',
  'management',
]);

const ORDER_CANCEL_ALLOWED_ROLES = new Set([
  'admin',
  'teamleader',
  'planner',
  'management',
]);

const ORDER_EDIT_ALLOWED_ROLES = new Set([
  'admin',
  'teamleader',
  'planner',
  'management',
]);

const ALLOWED_ORDER_PRIORITIES = new Set([
  'high',
  'urgent',
  'immediate',
]);

const OCCUPANCY_ALLOWED_ROLES = new Set([
  'admin',
  'teamleader',
  'operator',
  'planner',
  'engineer',
  'management',
]);

const START_PRODUCTION_ALLOWED_ROLES = new Set([
  'admin',
  'teamleader',
  'operator',
  'planner',
  'engineer',
  'management',
]);

const TRANSITION_ALLOWED_ROLES = new Set([
  'admin',
  'teamleader',
  'qc',
  'operator',
  'planner',
  'engineer',
  'management',
]);

const OVERPRODUCTION_ALLOWED_ROLES = new Set([
  'admin',
  'teamleader',
  'planner',
  'management',
]);

const ARCHIVE_RESTORE_ALLOWED_ROLES = new Set([
  'admin',
  'teamleader',
]);

module.exports = {
  BASE,
  TRACKING_COLLECTION,
  PRODUCTION_EVENTS_COLLECTION,
  PLANNING_COLLECTION,
  PLANNING_COLLECTION_LEGACY,
  USER_ACCOUNTS_COLLECTION,
  REJECT_ALLOWED_ROLES,
  TEMP_REJECT_ALLOWED_ROLES,
  MANUAL_MOVE_ALLOWED_ROLES,
  PLANNING_ARCHIVE_ALLOWED_ROLES,
  ALLOWED_ARCHIVE_REASONS,
  COMPLETE_ALLOWED_ROLES,
  ALLOWED_FINISH_TYPES,
  CANCEL_ALLOWED_ROLES,
  ORDER_PRIORITY_ALLOWED_ROLES,
  ORDER_CANCEL_ALLOWED_ROLES,
  ORDER_EDIT_ALLOWED_ROLES,
  ALLOWED_ORDER_PRIORITIES,
  OCCUPANCY_ALLOWED_ROLES,
  START_PRODUCTION_ALLOWED_ROLES,
  TRANSITION_ALLOWED_ROLES,
  OVERPRODUCTION_ALLOWED_ROLES,
  ARCHIVE_RESTORE_ALLOWED_ROLES,
};