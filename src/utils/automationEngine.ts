import { 
  collection, 
  getDocs, 
  query, 
  where, 
} from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS, getPathString } from "../config/dbPaths";
import i18n from "../i18n";
import { executeAutomationRule as executeAutomationRuleBackend } from "../services/planningSecurityService";

type TriggerConditions = Record<string, unknown>;

type AutomationTrigger = {
  type: string;
  conditions?: TriggerConditions;
};

type AutomationAction = {
  type: string;
  params?: Record<string, unknown>;
};

type AutomationRule = {
  trigger: AutomationTrigger;
  action: AutomationAction;
};

type TriggerResult = {
  triggered: boolean;
  message: string | null;
  severity?: string;
  data?: Record<string, unknown>;
};

type ActionResult = {
  success: boolean;
  message: string;
};

type TimestampLike = {
  toDate?: () => Date;
};

type OccupancyRecord = {
  hoursPerWeek?: number;
  productionHours?: number;
  actualHours?: number;
  operatorName?: string;
  station?: string;
  machine?: string;
};

type PlanningRecord = {
  id: string;
  orderId?: string;
  estimatedHours?: number;
  plannedDate?: TimestampLike | string | number | Date;
  status?: string;
  dependencies?: string[];
};

type InspectionRecord = {
  status?: string;
  timestamp?: string | number | Date;
};

type TrackedProductRecord = {
  id: string;
  lotNumber?: string;
  currentStation?: string;
  reminderSent?: boolean;
  inspection?: InspectionRecord;
  timestamps?: {
    station_start?: TimestampLike | string | number | Date;
    completed?: TimestampLike | string | number | Date;
    finished?: TimestampLike | string | number | Date;
  };
};

type ProductionStandardRecord = {
  id: string;
  itemCode?: string;
  machine?: string;
  standardMinutes?: number;
};

/**
 * Automation Engine - Centralized rule evaluation and execution
 * Migreert alle hardcoded automation logica naar data-driven rules
 */

// ==============================================
// TRIGGER EVALUATORS
// ==============================================

/**
 * Evaluate capacity shortage trigger
 * Migrated from: NotificationRulesView.jsx checkRule()
 */
export const evaluateCapacityShortage = async (conditions: TriggerConditions): Promise<TriggerResult> => {
  const threshold = Number(conditions.threshold ?? 0);
  
  // Load occupancy and planning data
  const occupancySnap = await getDocs(collection(db, getPathString(PATHS.OCCUPANCY)));
  const planningSnap = await getDocs(collection(db, getPathString(PATHS.PLANNING)));
  
  const occupancy = occupancySnap.docs.map((d) => d.data() as OccupancyRecord);
  const planning = planningSnap.docs.map((d) => d.data() as PlanningRecord);
  
  const totalCapacity = occupancy.reduce((sum, o) => sum + (o.hoursPerWeek || 0), 0);
  const totalDemand = planning.reduce((sum, p) => sum + (p.estimatedHours || 0), 0);
  const shortage = totalDemand - totalCapacity;
  
  return {
    triggered: shortage > threshold,
    message: shortage > threshold 
      ? i18n.t("automation.capacity_shortage", { shortage: Math.round(shortage), threshold, defaultValue: `⚠️ Capaciteitstekort: ${Math.round(shortage)}h tekort (threshold: ${threshold}h)` })
      : null,
    severity: "warning",
    data: {
      totalCapacity,
      totalDemand,
      shortage
    }
  };
};

/**
 * Evaluate low efficiency trigger
 * Migrated from: NotificationRulesView.jsx checkRule()
 */
export const evaluateLowEfficiency = async (conditions: TriggerConditions): Promise<TriggerResult> => {
  const threshold = Number(conditions.threshold ?? 80); // percentage
  
  const occupancySnap = await getDocs(collection(db, getPathString(PATHS.OCCUPANCY)));
  const occupancy = occupancySnap.docs.map((d) => d.data() as OccupancyRecord);
  
  const avgEfficiency = occupancy.reduce((sum, o) => {
    const productionHours = Number(o.productionHours || 0);
    const actualHours = Number(o.actualHours || 0);
    const eff = productionHours > 0 ? actualHours / productionHours : 0;
    return sum + eff;
  }, 0) / (occupancy.length || 1);
  
  const efficiencyPercent = Math.round(avgEfficiency * 100);
  
  return {
    triggered: efficiencyPercent < threshold,
    message: efficiencyPercent < threshold
      ? i18n.t("automation.low_efficiency", { efficiency: efficiencyPercent, threshold, defaultValue: `📉 Lage efficiency: ${efficiencyPercent}% (threshold: ${threshold}%)` })
      : null,
    severity: "warning",
    data: {
      avgEfficiency: efficiencyPercent,
      threshold
    }
  };
};

/**
 * Evaluate order delay trigger
 * Migrated from: NotificationRulesView.jsx checkRule()
 */
export const evaluateOrderDelay = async (conditions: TriggerConditions): Promise<TriggerResult> => {
  const minDelayedOrders = Number(conditions.minDelayedOrders ?? 1);
  
  const planningSnap = await getDocs(collection(db, getPathString(PATHS.PLANNING)));
  const planning = planningSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PlanningRecord, "id">) }));
  
  const now = new Date();
  const delayedOrders = planning.filter(p => {
    if (!p.plannedDate || p.status === "shipped" || p.status === "completed") return false;
    const planDate = toDateSafe(p.plannedDate);
    if (!planDate) return false;
    return planDate < now;
  });
  
  return {
    triggered: delayedOrders.length >= minDelayedOrders,
    message: delayedOrders.length >= minDelayedOrders
      ? i18n.t("automation.order_delay", { count: delayedOrders.length, defaultValue: `🕐 ${delayedOrders.length} order(s) zijn vertraagd` })
      : null,
    severity: "critical",
    data: {
      delayedCount: delayedOrders.length,
      delayedOrderIds: delayedOrders.map(o => o.orderId).slice(0, 5)
    }
  };
};

/**
 * Evaluate missing operator trigger
 * Migrated from: NotificationRulesView.jsx checkRule()
 */
export const evaluateMissingOperator = async (conditions: TriggerConditions): Promise<TriggerResult> => {
  const threshold = Number(conditions.threshold ?? 1);
  
  const occupancySnap = await getDocs(collection(db, getPathString(PATHS.OCCUPANCY)));
  const occupancy = occupancySnap.docs.map((d) => d.data() as OccupancyRecord);
  
  const machinesWithoutOperators = occupancy.filter(o => 
    !o.operatorName || o.operatorName === ""
  );
  
  return {
    triggered: machinesWithoutOperators.length >= threshold,
    message: machinesWithoutOperators.length >= threshold
      ? i18n.t("automation.missing_operator", { count: machinesWithoutOperators.length, defaultValue: `👤 ${machinesWithoutOperators.length} machine(s) zonder operator` })
      : null,
    severity: "warning",
    data: {
      count: machinesWithoutOperators.length,
      machines: machinesWithoutOperators.map(m => m.station || m.machine).slice(0, 5)
    }
  };
};

/**
 * Evaluate dependency blocked trigger
 * Migrated from: NotificationRulesView.jsx checkRule()
 */
export const evaluateDependencyBlocked = async (conditions: TriggerConditions): Promise<TriggerResult> => {
  const threshold = Number(conditions.threshold ?? 1);
  
  const planningSnap = await getDocs(collection(db, getPathString(PATHS.PLANNING)));
  const planning = planningSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PlanningRecord, "id">) }));
  
  const blockedOrders = planning.filter(p => {
    if (!p.dependencies || p.dependencies.length === 0) return false;
    if (p.status === "shipped" || p.status === "completed") return false;
    
    const allDepsComplete = p.dependencies.every((depId: string) => {
      const dep = planning.find((o) => o.id === depId);
      return dep && (dep.status === "shipped" || dep.status === "completed");
    });
    
    return !allDepsComplete;
  });
  
  return {
    triggered: blockedOrders.length >= threshold,
    message: blockedOrders.length >= threshold
      ? i18n.t("automation.dependency_blocked", { count: blockedOrders.length, defaultValue: `🔗 ${blockedOrders.length} order(s) geblokkeerd door dependencies` })
      : null,
    severity: "info",
    data: {
      blockedCount: blockedOrders.length,
      blockedOrderIds: blockedOrders.map(o => o.orderId).slice(0, 5)
    }
  };
};

/**
 * Evaluate inspection overdue trigger
 * Migrated from: WorkstationHub.jsx checkAndSendReminders()
 */
export const evaluateInspectionOverdue = async (conditions: TriggerConditions): Promise<TriggerResult> => {
  const daysOverdue = Number(conditions.daysOverdue ?? 7);
  const station = typeof conditions.station === "string" ? conditions.station : null;
  
  const trackedSnap = await getDocs(collection(db, getPathString(PATHS.TRACKING)));
  const products = trackedSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TrackedProductRecord, "id">) }));
  
  const overdueProducts = products.filter(p => {
    // Filter by station if specified
    if (station && p.currentStation !== station) return false;
    
    const isTempReject = p.inspection?.status === "Tijdelijke afkeur";
    if (!isTempReject) return false;
    
    const timestamp = p.inspection?.timestamp;
    if (!timestamp) return false;
    
    const inspectionDate = new Date(timestamp);
    const daysSince = Math.floor((Date.now() - inspectionDate.getTime()) / (1000 * 60 * 60 * 24));
    
    return daysSince >= daysOverdue && !p.reminderSent;
  });
  
  return {
    triggered: overdueProducts.length > 0,
    message: overdueProducts.length > 0
      ? i18n.t("automation.inspection_overdue", { count: overdueProducts.length, days: daysOverdue, defaultValue: `⏰ ${overdueProducts.length} product(en) ${daysOverdue}+ dagen in tijdelijke afkeur` })
      : null,
    severity: "alert",
    data: {
      overdueCount: overdueProducts.length,
      products: overdueProducts.map(p => ({
        lotNumber: p.lotNumber,
        station: p.currentStation,
        daysSince: Math.floor((Date.now() - new Date(p.inspection?.timestamp || Date.now()).getTime()) / (1000 * 60 * 60 * 24))
      })).slice(0, 5)
    }
  };
};

/**
 * Evaluate production time standard deviation
 * Migrated from: autoLearningService.js
 */
export const evaluateStandardDeviation = async (conditions: TriggerConditions): Promise<TriggerResult> => {
  const { 
    minSamples = 5,
    minDeviation = 5 // percentage
  } = {
    minSamples: Number(conditions.minSamples ?? 5),
    minDeviation: Number(conditions.minDeviation ?? 5),
  };
  
  const standardsSnap = await getDocs(collection(db, getPathString(PATHS.PRODUCTION_STANDARDS)));
  const standards = standardsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProductionStandardRecord, "id">) }));
  
  const deviatingStandards: Array<{
    itemCode: string;
    machine: string;
    currentStandard: number;
    observedMedian: number;
    deviation: number;
    sampleCount: number;
  }> = [];
  
  for (const standard of standards) {
    // Get completed products for this item/machine
    const trackedQuery = query(
      collection(db, getPathString(PATHS.TRACKING)),
      where("item", "==", standard.itemCode),
      where("originMachine", "==", standard.machine),
      where("status", "==", "completed")
    );
    
    const trackedSnap = await getDocs(trackedQuery);
    const products = trackedSnap.docs.map((d) => d.data() as TrackedProductRecord);
    
    // Filter valid products with timestamps
    const validProducts = products.filter(p => 
      p.timestamps?.station_start && 
      (p.timestamps?.completed || p.timestamps?.finished)
    );
    
    if (validProducts.length < minSamples) continue;
    
    // Calculate actual times
    const actualTimes = validProducts.map((p) => {
      const stationStart = p.timestamps?.station_start;
      const completed = p.timestamps?.completed;
      const finished = p.timestamps?.finished;

      if (!stationStart) return 0;

      const start = toDateSafe(stationStart);
      const end = toDateSafe(completed || finished);
      if (!start || !end) return 0;

      return Math.round((end.getTime() - start.getTime()) / 60000); // minutes
    }).filter(t => t > 0);
    
    if (actualTimes.length === 0) continue;
    
    // Calculate median
    const sorted = [...actualTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    
    const currentStandard = Number(standard.standardMinutes || 0);
    if (currentStandard <= 0 || !standard.itemCode || !standard.machine) continue;
    const deviation = ((median - currentStandard) / currentStandard) * 100;
    
    if (Math.abs(deviation) >= minDeviation) {
      deviatingStandards.push({
        itemCode: standard.itemCode,
        machine: standard.machine,
        currentStandard,
        observedMedian: median,
        deviation: Math.round(deviation * 10) / 10,
        sampleCount: actualTimes.length
      });
    }
  }
  
  return {
    triggered: deviatingStandards.length > 0,
    message: deviatingStandards.length > 0
      ? i18n.t("automation.standard_deviation", { count: deviatingStandards.length, defaultValue: `📊 ${deviatingStandards.length} standaard(en) wijken significant af` })
      : null,
    severity: "info",
    data: {
      deviatingCount: deviatingStandards.length,
      standards: deviatingStandards.slice(0, 5)
    }
  };
};

/**
 * Evaluate order status change trigger
 * Existing functionality in AutomationRulesView
 */
export const evaluateOrderStatusChange = async (conditions: TriggerConditions): Promise<TriggerResult> => {
  const targetStatus = typeof conditions.targetStatus === "string" ? conditions.targetStatus : "in_production";
  const orderId = typeof conditions.orderId === "string" ? conditions.orderId : null;
  
  // This is typically used with real-time listeners
  // For manual execution, check recent status changes
  const planningSnap = await getDocs(collection(db, getPathString(PATHS.PLANNING)));
  const planning = planningSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PlanningRecord, "id">) }));
  
  const matchingOrders = planning.filter(p => {
    if (orderId && p.orderId !== orderId) return false;
    return p.status === targetStatus;
  });
  
  return {
    triggered: matchingOrders.length > 0,
    message: matchingOrders.length > 0
      ? i18n.t("automation.order_status_change", { count: matchingOrders.length, status: targetStatus, defaultValue: `📋 ${matchingOrders.length} order(s) hebben status "${targetStatus}"` })
      : null,
    severity: "info",
    data: {
      count: matchingOrders.length,
      orderIds: matchingOrders.map(o => o.orderId).slice(0, 5)
    }
  };
};

// ==============================================
// ACTION EXECUTORS
// ==============================================

/**
 * Execute send notification action
 */
export const executeSendNotification = async (
  _params: Record<string, unknown> = {},
  _triggerResult?: TriggerResult
): Promise<ActionResult> => {
  // Uitgevoerd server-side via executeAutomationRule callable
  return { success: true, message: i18n.t("automation.notification_sent", "Notificatie verzonden") };
};

/**
 * Execute update status action
 */
export const executeUpdateStatus = async (
  params: Record<string, unknown> = {},
  _triggerResult?: TriggerResult
): Promise<ActionResult> => {
  const { targetStatus = "in_progress" } = params;
  return { success: true, message: i18n.t("automation.status_update_planned", { status: targetStatus, defaultValue: `Status update naar ${targetStatus} gepland` }) };
};

/**
 * Execute create log action
 */
export const executeCreateLog = async (
  _params: Record<string, unknown> = {},
  _triggerResult?: TriggerResult
): Promise<ActionResult> => {
  // Uitgevoerd server-side via executeAutomationRule callable
  return { success: true, message: i18n.t("automation.log_created", "Log entry aangemaakt") };
};

/**
 * Execute auto-learning update action
 * Server-side uitgevoerd via executeAutomationRule callable.
 */
export const executeAutoLearningUpdate = async (
  params: Record<string, unknown> = {},
  _triggerResult?: TriggerResult
): Promise<ActionResult> => {
  const { dryRun = true } = params;
  return {
    success: true,
    message: dryRun
      ? i18n.t("automation.standards_would_update", { count: 0, defaultValue: "Auto-learning wordt server-side uitgevoerd" })
      : i18n.t("automation.standards_updated", { count: 0, defaultValue: "Auto-learning uitgevoerd via server" }),
  };
};

/**
 * Execute inspection reminder action
 * Server-side uitgevoerd via executeAutomationRule callable.
 */
export const executeInspectionReminder = async (
  _params: Record<string, unknown> = {},
  _triggerResult?: TriggerResult
): Promise<ActionResult> => {
  // Uitgevoerd server-side via executeAutomationRule callable
  return { success: true, message: i18n.t("automation.reminders_sent", { count: 0, defaultValue: "Reminders worden server-side verzonden" }) };
};

// ==============================================
// MAIN EVALUATION ENGINE
// ==============================================

/**
 * Evaluate a rule and execute if triggered
 */
export const evaluateRule = async (rule: AutomationRule): Promise<TriggerResult & { actionResult?: ActionResult }> => {
  const { trigger, action } = rule;
  
  let result: TriggerResult;
  
  // Evaluate trigger based on type
  switch (trigger.type) {
    case "capacity_shortage":
      result = await evaluateCapacityShortage(trigger.conditions || {});
      break;
    case "low_efficiency":
      result = await evaluateLowEfficiency(trigger.conditions || {});
      break;
    case "order_delay":
      result = await evaluateOrderDelay(trigger.conditions || {});
      break;
    case "missing_operator":
      result = await evaluateMissingOperator(trigger.conditions || {});
      break;
    case "dependency_blocked":
      result = await evaluateDependencyBlocked(trigger.conditions || {});
      break;
    case "inspection_overdue":
      result = await evaluateInspectionOverdue(trigger.conditions || {});
      break;
    case "standard_deviation":
      result = await evaluateStandardDeviation(trigger.conditions || {});
      break;
    case "order_status_change":
      result = await evaluateOrderStatusChange(trigger.conditions || {});
      break;
    default:
      return { 
        triggered: false, 
        message: `Unknown trigger type: ${trigger.type}` 
      };
  }
  
  // If triggered, execute action
  if (result.triggered) {
    let actionResult;
    
    switch (action.type) {
      case "send_notification":
        actionResult = await executeSendNotification(action.params || {}, result);
        break;
      case "create_log":
        actionResult = await executeCreateLog(action.params || {}, result);
        break;
      case "auto_learning_update":
        actionResult = await executeAutoLearningUpdate(action.params || {}, result);
        break;
      case "inspection_reminder":
        actionResult = await executeInspectionReminder(action.params || {}, result);
        break;
      case "update_status":
        actionResult = await executeUpdateStatus(action.params || {}, result);
        break;
      default:
        actionResult = { success: false, message: `Unknown action type: ${action.type}` };
    }
    
    return {
      ...result,
      actionResult
    };
  }
  
  return result;
};

/**
 * Check for recent similar executions (debouncing)
 */
const toDateSafe = (value: unknown): Date | null => {
  if (!value) return null;

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const checkDebounce = async (ruleId: string, debounceMinutes = 60): Promise<boolean> => {
  const cutoff = new Date(Date.now() - debounceMinutes * 60 * 1000);
  
  const executionsSnap = await getDocs(
    query(
      collection(db, getPathString(PATHS.AUTOMATION_EXECUTIONS)),
      where("ruleId", "==", ruleId)
    )
  );
  
  const recentExecutions = executionsSnap.docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((execution) => {
      const execDate = toDateSafe(execution.executedAt);
      if (!execDate) return false;
      return execDate > cutoff;
    });
  
  return recentExecutions.length > 0;
};

/**
 * Execute rule with logging and debouncing
 */
export const executeRuleWithLogging = async (rule: unknown) => {
  return executeAutomationRuleBackend(rule);
};
