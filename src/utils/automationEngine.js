import { 
  collection, 
  getDocs, 
  query, 
  where, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp 
} from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS } from "../config/dbPaths";

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
export const evaluateCapacityShortage = async (conditions) => {
  const { threshold = 0 } = conditions;
  
  // Load occupancy and planning data
  const occupancySnap = await getDocs(collection(db, ...PATHS.OCCUPANCY));
  const planningSnap = await getDocs(collection(db, ...PATHS.PLANNING));
  
  const occupancy = occupancySnap.docs.map(d => d.data());
  const planning = planningSnap.docs.map(d => d.data());
  
  const totalCapacity = occupancy.reduce((sum, o) => sum + (o.hoursPerWeek || 0), 0);
  const totalDemand = planning.reduce((sum, p) => sum + (p.estimatedHours || 0), 0);
  const shortage = totalDemand - totalCapacity;
  
  return {
    triggered: shortage > threshold,
    message: shortage > threshold 
      ? `⚠️ Capaciteitstekort: ${Math.round(shortage)}h tekort (threshold: ${threshold}h)`
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
export const evaluateLowEfficiency = async (conditions) => {
  const { threshold = 80 } = conditions; // percentage
  
  const occupancySnap = await getDocs(collection(db, ...PATHS.OCCUPANCY));
  const occupancy = occupancySnap.docs.map(d => d.data());
  
  const avgEfficiency = occupancy.reduce((sum, o) => {
    const eff = o.productionHours > 0 ? (o.actualHours || 0) / o.productionHours : 0;
    return sum + eff;
  }, 0) / (occupancy.length || 1);
  
  const efficiencyPercent = Math.round(avgEfficiency * 100);
  
  return {
    triggered: efficiencyPercent < threshold,
    message: efficiencyPercent < threshold
      ? `📉 Lage efficiency: ${efficiencyPercent}% (threshold: ${threshold}%)`
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
export const evaluateOrderDelay = async (conditions) => {
  const { minDelayedOrders = 1 } = conditions;
  
  const planningSnap = await getDocs(collection(db, ...PATHS.PLANNING));
  const planning = planningSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const now = new Date();
  const delayedOrders = planning.filter(p => {
    if (!p.plannedDate || p.status === "shipped" || p.status === "completed") return false;
    const planDate = p.plannedDate.toDate ? p.plannedDate.toDate() : new Date(p.plannedDate);
    return planDate < now;
  });
  
  return {
    triggered: delayedOrders.length >= minDelayedOrders,
    message: delayedOrders.length >= minDelayedOrders
      ? `🕐 ${delayedOrders.length} order(s) zijn vertraagd`
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
export const evaluateMissingOperator = async (conditions) => {
  const { threshold = 1 } = conditions;
  
  const occupancySnap = await getDocs(collection(db, ...PATHS.OCCUPANCY));
  const occupancy = occupancySnap.docs.map(d => d.data());
  
  const machinesWithoutOperators = occupancy.filter(o => 
    !o.operatorName || o.operatorName === ""
  );
  
  return {
    triggered: machinesWithoutOperators.length >= threshold,
    message: machinesWithoutOperators.length >= threshold
      ? `👤 ${machinesWithoutOperators.length} machine(s) zonder operator`
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
export const evaluateDependencyBlocked = async (conditions) => {
  const { threshold = 1 } = conditions;
  
  const planningSnap = await getDocs(collection(db, ...PATHS.PLANNING));
  const planning = planningSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const blockedOrders = planning.filter(p => {
    if (!p.dependencies || p.dependencies.length === 0) return false;
    if (p.status === "shipped" || p.status === "completed") return false;
    
    const allDepsComplete = p.dependencies.every(depId => {
      const dep = planning.find(o => o.id === depId);
      return dep && (dep.status === "shipped" || dep.status === "completed");
    });
    
    return !allDepsComplete;
  });
  
  return {
    triggered: blockedOrders.length >= threshold,
    message: blockedOrders.length >= threshold
      ? `🔗 ${blockedOrders.length} order(s) geblokkeerd door dependencies`
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
export const evaluateInspectionOverdue = async (conditions) => {
  const { daysOverdue = 7, station = null } = conditions;
  
  const trackedSnap = await getDocs(collection(db, ...PATHS.TRACKING));
  const products = trackedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
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
      ? `⏰ ${overdueProducts.length} product(en) ${daysOverdue}+ dagen in tijdelijke afkeur`
      : null,
    severity: "alert",
    data: {
      overdueCount: overdueProducts.length,
      products: overdueProducts.map(p => ({
        lotNumber: p.lotNumber,
        station: p.currentStation,
        daysSince: Math.floor((Date.now() - new Date(p.inspection.timestamp).getTime()) / (1000 * 60 * 60 * 24))
      })).slice(0, 5)
    }
  };
};

/**
 * Evaluate production time standard deviation
 * Migrated from: autoLearningService.js
 */
export const evaluateStandardDeviation = async (conditions) => {
  const { 
    minSamples = 5, 
    minDeviation = 5 // percentage
  } = conditions;
  
  const standardsSnap = await getDocs(collection(db, ...PATHS.PRODUCTION_STANDARDS));
  const standards = standardsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const deviatingStandards = [];
  
  for (const standard of standards) {
    // Get completed products for this item/machine
    const trackedQuery = query(
      collection(db, ...PATHS.TRACKING),
      where("item", "==", standard.itemCode),
      where("originMachine", "==", standard.machine),
      where("status", "==", "completed")
    );
    
    const trackedSnap = await getDocs(trackedQuery);
    const products = trackedSnap.docs.map(d => d.data());
    
    // Filter valid products with timestamps
    const validProducts = products.filter(p => 
      p.timestamps?.station_start && 
      (p.timestamps?.completed || p.timestamps?.finished)
    );
    
    if (validProducts.length < minSamples) continue;
    
    // Calculate actual times
    const actualTimes = validProducts.map(p => {
      const start = p.timestamps.station_start.toDate ? p.timestamps.station_start.toDate() : new Date(p.timestamps.station_start);
      const end = p.timestamps.completed?.toDate ? p.timestamps.completed.toDate() : 
                  p.timestamps.finished?.toDate ? p.timestamps.finished.toDate() : new Date(p.timestamps.completed || p.timestamps.finished);
      return Math.round((end - start) / 60000); // minutes
    }).filter(t => t > 0);
    
    if (actualTimes.length === 0) continue;
    
    // Calculate median
    const sorted = [...actualTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    
    const currentStandard = standard.standardMinutes;
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
      ? `📊 ${deviatingStandards.length} standaard(en) wijken significant af`
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
export const evaluateOrderStatusChange = async (conditions) => {
  const { targetStatus = "in_production", orderId = null } = conditions;
  
  // This is typically used with real-time listeners
  // For manual execution, check recent status changes
  const planningSnap = await getDocs(collection(db, ...PATHS.PLANNING));
  const planning = planningSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const matchingOrders = planning.filter(p => {
    if (orderId && p.orderId !== orderId) return false;
    return p.status === targetStatus;
  });
  
  return {
    triggered: matchingOrders.length > 0,
    message: matchingOrders.length > 0
      ? `📋 ${matchingOrders.length} order(s) hebben status "${targetStatus}"`
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
export const executeSendNotification = async (params, triggerData) => {
  const { 
    message = "Automation regel uitgevoerd", 
    severity = "info",
    recipients = [] 
  } = params;
  
  // 1. Schrijf naar de notificatie logs (voor de specifieke notificatie view)
  await addDoc(collection(db, ...PATHS.NOTIFICATION_LOGS), {
    message: message || triggerData.message,
    severity: severity || triggerData.severity,
    recipients,
    type: "automation",
    status: "unread",
    createdAt: serverTimestamp(),
    data: triggerData.data
  });

  // 2. Schrijf naar het centrale berichtensysteem (Inbox)
  await addDoc(collection(db, ...PATHS.MESSAGES), {
    to: "admin", // Zichtbaar voor alle admins
    subject: `🔔 Automation: ${triggerData.message || "Systeem Alert"}`,
    content: message || triggerData.message,
    senderId: "system_automation",
    senderName: "Automation Engine",
    from: "system@futurefactory.local",
    timestamp: serverTimestamp(),
    read: false,
    archived: false,
    type: "automation_alert",
    priority: severity === "critical" || severity === "alert" ? "urgent" : "normal"
  });
  
  return { success: true, message: "Notificatie verzonden" };
};

/**
 * Execute update status action
 */
export const executeUpdateStatus = async (params, triggerData) => {
  const { targetCollection = "planning", targetStatus = "in_progress" } = params;
  
  // This would typically be executed with specific order IDs from trigger data
  // For now, return success
  return { success: true, message: `Status update naar ${targetStatus} gepland` };
};

/**
 * Execute create log action
 */
export const executeCreateLog = async (params, triggerData) => {
  const { logMessage = "Automation log" } = params;
  
  await addDoc(collection(db, ...PATHS.MESSAGES), {
    to: "admin",
    subject: "🤖 Automation Event",
    content: logMessage || triggerData.message,
    senderId: "system_automation",
    senderName: "Automation Engine",
    from: "system@futurefactory.local",
    timestamp: serverTimestamp(),
    read: false,
    archived: false,
    type: "system_log",
    priority: "normal",
    data: triggerData.data
  });
  
  return { success: true, message: "Log entry aangemaakt" };
};

/**
 * Execute auto-learning update action
 * Migrated from: autoLearningService.js
 */
export const executeAutoLearningUpdate = async (params, triggerData) => {
  const { 
    learningRate = 0.3,
    dryRun = true 
  } = params;
  
  if (!triggerData.data?.standards) {
    return { success: false, message: "Geen standaarden gevonden in trigger data" };
  }
  
  const standards = triggerData.data.standards;
  let updated = 0;
  
  for (const std of standards) {
    const currentStandard = std.currentStandard;
    const observedMedian = std.observedMedian;
    
    // Gradual adjustment with learning rate
    const change = (observedMedian - currentStandard) * learningRate;
    const newStandard = Math.round(currentStandard + change);
    
    if (!dryRun) {
      // Find the standard document
      const standardsSnap = await getDocs(
        query(
          collection(db, ...PATHS.PRODUCTION_STANDARDS),
          where("itemCode", "==", std.itemCode),
          where("machine", "==", std.machine)
        )
      );
      
      if (!standardsSnap.empty) {
        const standardDoc = standardsSnap.docs[0];
        await updateDoc(doc(db, ...PATHS.PRODUCTION_STANDARDS, standardDoc.id), {
          standardMinutes: newStandard,
          updatedAt: serverTimestamp(),
          autoLearning: {
            lastUpdate: new Date().toISOString(),
            sampleCount: std.sampleCount,
            previousStandard: currentStandard,
            observedMedian,
            deviation: std.deviation
          }
        });
        updated++;
      }
    }
  }
  
  return { 
    success: true, 
    message: dryRun 
      ? `${standards.length} standaard(en) zouden bijgewerkt worden` 
      : `${updated} standaard(en) bijgewerkt`
  };
};

/**
 * Execute inspection reminder action
 * Migrated from: WorkstationHub.jsx
 */
export const executeInspectionReminder = async (params, triggerData) => {
  if (!triggerData.data?.products) {
    return { success: false, message: "Geen producten gevonden in trigger data" };
  }
  
  let reminded = 0;
  
  for (const product of triggerData.data.products) {
    // Send message
    await addDoc(collection(db, ...PATHS.MESSAGES), {
      to: "admin",
      subject: "⏰ Reminder: Tijdelijke Afkeur",
      content: `Product ${product.lotNumber} ligt al ${product.daysSince}+ dagen op ${product.station} ter reparatie. Graag actie.`,
      senderId: "system_automation",
      senderName: "Automation Engine",
      from: "system@futurefactory.local",
      timestamp: serverTimestamp(),
      read: false,
      archived: false,
      type: "alert",
      priority: "urgent",
      relatedLot: product.lotNumber
    });
    
    // Mark reminder as sent in product (would need product doc ID)
    reminded++;
  }
  
  return { 
    success: true, 
    message: `${reminded} reminder(s) verzonden`
  };
};

// ==============================================
// MAIN EVALUATION ENGINE
// ==============================================

/**
 * Evaluate a rule and execute if triggered
 */
export const evaluateRule = async (rule) => {
  const { trigger, action } = rule;
  
  let result;
  
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
export const checkDebounce = async (ruleId, debounceMinutes = 60) => {
  const cutoff = new Date(Date.now() - debounceMinutes * 60 * 1000);
  
  const executionsSnap = await getDocs(
    query(
      collection(db, ...PATHS.AUTOMATION_EXECUTIONS),
      where("ruleId", "==", ruleId)
    )
  );
  
  const recentExecutions = executionsSnap.docs
    .map(d => d.data())
    .filter(e => {
      if (!e.executedAt) return false;
      const execDate = e.executedAt.toDate ? e.executedAt.toDate() : new Date(e.executedAt);
      return execDate > cutoff;
    });
  
  return recentExecutions.length > 0;
};

/**
 * Execute rule with logging and debouncing
 */
export const executeRuleWithLogging = async (rule) => {
  // Check debounce
  if (rule.debounceMinutes && await checkDebounce(rule.id, rule.debounceMinutes)) {
    return {
      skipped: true,
      message: "Skipped due to recent execution (debounce)"
    };
  }
  
  try {
    const result = await evaluateRule(rule);
    
    // Log execution
    await addDoc(collection(db, ...PATHS.AUTOMATION_EXECUTIONS), {
      ruleId: rule.id,
      ruleName: rule.name,
      trigger: rule.trigger,
      action: rule.action,
      status: result.triggered ? "success" : "no_trigger",
      message: result.message || "No trigger match",
      data: result.data || null,
      actionResult: result.actionResult || null,
      executedAt: serverTimestamp()
    });
    
    // Update rule execution count
    if (result.triggered) {
      const ruleRef = doc(db, ...PATHS.AUTOMATION_RULES, rule.id);
      await updateDoc(ruleRef, {
        executionCount: (rule.executionCount || 0) + 1,
        lastExecuted: serverTimestamp()
      });
    }
    
    return result;
  } catch (error) {
    console.error(`Error executing rule ${rule.name}:`, error);
    
    // Log error
    await addDoc(collection(db, ...PATHS.AUTOMATION_EXECUTIONS), {
      ruleId: rule.id,
      ruleName: rule.name,
      trigger: rule.trigger,
      action: rule.action,
      status: "error",
      message: error.message,
      executedAt: serverTimestamp()
    });
    
    return {
      triggered: false,
      error: error.message
    };
  }
};
