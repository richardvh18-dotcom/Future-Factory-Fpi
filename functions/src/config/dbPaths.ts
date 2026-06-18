// @ts-nocheck

export const DB_BASE = 'future-factory';

export const DB_PATHS = {
  AUDIT_LOGS: `${DB_BASE}/audit/logs`,
  ACTIVITY_LOGS: `${DB_BASE}/logs/activity_logs`,
  EMAIL_TEMPLATES: `${DB_BASE}/settings/email_templates`,
  EMAIL_LOGS: `${DB_BASE}/logs/email_logs`,

  PRODUCTION_PLANNING: `${DB_BASE}/production/digital_planning`,
  PRODUCTION_PLANNING_LEGACY: `${DB_BASE}/production/data/digital_planning/orders`,
  TRACKED_PRODUCTS: `${DB_BASE}/production/tracked_products`,
  MACHINE_OCCUPANCY: `${DB_BASE}/production/machine_occupancy`,
  EFFICIENCY_HOURS: `${DB_BASE}/production/efficiency_hours`,
  PRODUCTION_EVENTS: `${DB_BASE}/production/events`,
  PRODUCTION_PRODUCTS: `${DB_BASE}/production/products`,
  PRINT_QUEUE: `${DB_BASE}/production/print_queue`,
  TIME_STANDARDS: `${DB_BASE}/production/time_standards`,
  COUNTERS: `${DB_BASE}/production/counters`,
  PRODUCTION_MESSAGES: `${DB_BASE}/production/messages`,
  DOWNTIME_REPORTS: `${DB_BASE}/production/downtime_reports`,
  DEFECT_REPORTS: `${DB_BASE}/production/defect_reports`,

  QC_MEASUREMENTS: `${DB_BASE}/production/qc_measurements`,
  QC_INSPECTIONS: `${DB_BASE}/production/qc_inspections`,
  QC_RECORDS_LIVE: `${DB_BASE}/production/qc_records/live`,
  PRODUCTION_ARCHIVE: `${DB_BASE}/production/archive`,

  USERS_PROFILES: `${DB_BASE}/users/profiles`,
  ADMIN_ACCOUNT_REQUESTS: `${DB_BASE}/admin/account_requests`,
  USER_ACCOUNTS: `${DB_BASE}/Users/Accounts`,
  PERSONNEL: `${DB_BASE}/Users/Personnel`,

  AI_CONFIG_MAIN: `${DB_BASE}/settings/ai_config/main`,
  AI_DOCUMENTS_RECORDS: `${DB_BASE}/settings/ai_documents/knowledge/records`,
  AI_KNOWLEDGE_RECORDS: `${DB_BASE}/settings/ai_knowledge_base/training/records`,
  CONVERSIONS_RECORDS: `${DB_BASE}/settings/conversions/mapping/records`,
  REFERENCE_OPERATIONS: `${DB_BASE}/settings/reference_operations`,

  ATPS_EXPORT_RUNS: `${DB_BASE}/integrations/atps_export_runs`,
  ATPS_PREVIEW_RUNS: `${DB_BASE}/integrations/atps_preview_runs`,
  ATPS_RETRY_QUEUE: `${DB_BASE}/integrations/atps_retry_queue`,
  EXPORT_TASKS: `${DB_BASE}/exports/tasks`,
  LN_QR_EXPORT_HISTORY: `${DB_BASE}/exports/ln_qr_history`,

  NOTIFICATION_LOGS: `${DB_BASE}/notifications/logs`,
  AUTOMATION_RULES: `${DB_BASE}/automation/rules`,
  AUTOMATION_EXECUTIONS: `${DB_BASE}/automation/executions`,

  SYSTEM_LOGS: `${DB_BASE}/logs/system_logs`,
  INSIGHTS_REPORTS: `${DB_BASE}/insights/reports`,
  ROOT_MESSAGES: `${DB_BASE}/messages`,
};

export const pathToSegments = (path) => String(path || '').split('/').filter(Boolean);

export const getArchiveItemsPath = (year) => `${DB_PATHS.PRODUCTION_ARCHIVE}/${String(year)}/items`;
export const getArchivePlanningPath = (year) => `${DB_PATHS.PRODUCTION_ARCHIVE}/${String(year)}/planning`;
export const getArchiveEfficiencyPath = (year) => `${DB_PATHS.PRODUCTION_ARCHIVE}/${String(year)}/efficiency`;