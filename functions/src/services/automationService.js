const { db, admin } = require('../config/firebase');

const COLLECTIONS = {
  PLANNING: ['future-factory', 'production', 'data', 'digital_planning', 'orders'],
  TRACKING: ['future-factory', 'production', 'tracked_products'],
  OCCUPANCY: ['future-factory', 'production', 'machine_occupancy'],
  PRODUCTION_STANDARDS: ['future-factory', 'production', 'time_standards'],
  NOTIFICATION_LOGS: ['future-factory', 'notifications', 'logs'],
  MESSAGES: ['future-factory', 'production', 'messages'],
  AUTOMATION_RULES: ['future-factory', 'automation', 'rules'],
  AUTOMATION_EXECUTIONS: ['future-factory', 'automation', 'executions'],
};

const toDate = (value) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const asDate = new Date(value);
  return Number.isNaN(asDate.getTime()) ? null : asDate;
};

const colRef = (...segments) => db.collection(segments[0]).doc(segments[1]).collection(segments[2]);

async function getDocsFor(path) {
  const snap = await colRef(...path).get();
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

async function evaluateCapacityShortage(conditions = {}) {
  const threshold = Number(conditions.threshold || 0);
  const occupancy = await getDocsFor(COLLECTIONS.OCCUPANCY);
  const planning = await getDocsFor(COLLECTIONS.PLANNING);

  const totalCapacity = occupancy.reduce((sum, o) => sum + Number(o.hoursPerWeek || 0), 0);
  const totalDemand = planning.reduce((sum, p) => sum + Number(p.estimatedHours || 0), 0);
  const shortage = totalDemand - totalCapacity;

  return {
    triggered: shortage > threshold,
    message: shortage > threshold ? `Capaciteitstekort: ${Math.round(shortage)}h tekort (threshold: ${threshold}h)` : null,
    severity: 'warning',
    data: { totalCapacity, totalDemand, shortage },
  };
}

async function evaluateLowEfficiency(conditions = {}) {
  const threshold = Number(conditions.threshold || 80);
  const occupancy = await getDocsFor(COLLECTIONS.OCCUPANCY);

  const avgEfficiency = occupancy.reduce((sum, o) => {
    const productionHours = Number(o.productionHours || 0);
    const actualHours = Number(o.actualHours || 0);
    const eff = productionHours > 0 ? actualHours / productionHours : 0;
    return sum + eff;
  }, 0) / (occupancy.length || 1);

  const efficiencyPercent = Math.round(avgEfficiency * 100);

  return {
    triggered: efficiencyPercent < threshold,
    message: efficiencyPercent < threshold ? `Lage efficiency: ${efficiencyPercent}% (threshold: ${threshold}%)` : null,
    severity: 'warning',
    data: { avgEfficiency: efficiencyPercent, threshold },
  };
}

async function evaluateOrderDelay(conditions = {}) {
  const minDelayedOrders = Number(conditions.minDelayedOrders || 1);
  const planning = await getDocsFor(COLLECTIONS.PLANNING);
  const now = new Date();

  const delayedOrders = planning.filter((p) => {
    if (!p.plannedDate || p.status === 'shipped' || p.status === 'completed') return false;
    const planDate = toDate(p.plannedDate);
    return planDate && planDate < now;
  });

  return {
    triggered: delayedOrders.length >= minDelayedOrders,
    message: delayedOrders.length >= minDelayedOrders ? `${delayedOrders.length} order(s) zijn vertraagd` : null,
    severity: 'critical',
    data: {
      delayedCount: delayedOrders.length,
      delayedOrderIds: delayedOrders.map((o) => o.orderId).slice(0, 5),
    },
  };
}

async function evaluateMissingOperator(conditions = {}) {
  const threshold = Number(conditions.threshold || 1);
  const occupancy = await getDocsFor(COLLECTIONS.OCCUPANCY);

  const missing = occupancy.filter((o) => !o.operatorName);
  return {
    triggered: missing.length >= threshold,
    message: missing.length >= threshold ? `${missing.length} machine(s) zonder operator` : null,
    severity: 'warning',
    data: {
      count: missing.length,
      machines: missing.map((m) => m.station || m.machine).slice(0, 5),
    },
  };
}

async function evaluateDependencyBlocked(conditions = {}) {
  const threshold = Number(conditions.threshold || 1);
  const planning = await getDocsFor(COLLECTIONS.PLANNING);

  const blocked = planning.filter((p) => {
    if (!Array.isArray(p.dependencies) || p.dependencies.length === 0) return false;
    if (p.status === 'shipped' || p.status === 'completed') return false;
    const allComplete = p.dependencies.every((depId) => {
      const dep = planning.find((o) => o.id === depId);
      return dep && (dep.status === 'shipped' || dep.status === 'completed');
    });
    return !allComplete;
  });

  return {
    triggered: blocked.length >= threshold,
    message: blocked.length >= threshold ? `${blocked.length} order(s) geblokkeerd door dependencies` : null,
    severity: 'info',
    data: {
      blockedCount: blocked.length,
      blockedOrderIds: blocked.map((o) => o.orderId).slice(0, 5),
    },
  };
}

async function evaluateInspectionOverdue(conditions = {}) {
  const daysOverdue = Number(conditions.daysOverdue || 7);
  const station = String(conditions.station || '').trim();
  const products = await getDocsFor(COLLECTIONS.TRACKING);

  const overdueProducts = products.filter((p) => {
    if (station && p.currentStation !== station) return false;
    if (p.inspection?.status !== 'Tijdelijke afkeur') return false;
    if (!p.inspection?.timestamp) return false;

    const inspectionDate = toDate(p.inspection.timestamp);
    if (!inspectionDate) return false;

    const daysSince = Math.floor((Date.now() - inspectionDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysSince >= daysOverdue && !p.reminderSent;
  });

  return {
    triggered: overdueProducts.length > 0,
    message: overdueProducts.length > 0 ? `${overdueProducts.length} product(en) ${daysOverdue}+ dagen in tijdelijke afkeur` : null,
    severity: 'alert',
    data: {
      overdueCount: overdueProducts.length,
      products: overdueProducts.map((p) => ({
        lotNumber: p.lotNumber,
        station: p.currentStation,
        daysSince: Math.floor((Date.now() - toDate(p.inspection.timestamp).getTime()) / (1000 * 60 * 60 * 24)),
      })).slice(0, 5),
    },
  };
}

async function evaluateOrderStatusChange(conditions = {}) {
  const targetStatus = String(conditions.targetStatus || 'in_production').trim();
  const orderId = String(conditions.orderId || '').trim();
  const planning = await getDocsFor(COLLECTIONS.PLANNING);

  const matching = planning.filter((p) => {
    if (orderId && p.orderId !== orderId) return false;
    return p.status === targetStatus;
  });

  return {
    triggered: matching.length > 0,
    message: matching.length > 0 ? `${matching.length} order(s) hebben status "${targetStatus}"` : null,
    severity: 'info',
    data: {
      count: matching.length,
      orderIds: matching.map((o) => o.orderId).slice(0, 5),
    },
  };
}

async function evaluateTrigger(trigger = {}) {
  const type = String(trigger.type || '').trim();
  const conditions = trigger.conditions || {};

  switch (type) {
    case 'capacity_shortage': return evaluateCapacityShortage(conditions);
    case 'low_efficiency': return evaluateLowEfficiency(conditions);
    case 'order_delay': return evaluateOrderDelay(conditions);
    case 'missing_operator': return evaluateMissingOperator(conditions);
    case 'dependency_blocked': return evaluateDependencyBlocked(conditions);
    case 'inspection_overdue': return evaluateInspectionOverdue(conditions);
    case 'order_status_change': return evaluateOrderStatusChange(conditions);
    default:
      return { triggered: false, message: `Unknown trigger type: ${type}` };
  }
}

async function createAutomationMessage(subject, content, priority = 'normal', extra = {}) {
  await colRef(...COLLECTIONS.MESSAGES).add({
    to: 'admin',
    subject,
    content,
    senderId: 'system_automation',
    senderName: 'Automation Engine',
    from: 'system@futurefactory.local',
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    archived: false,
    priority,
    ...extra,
  });
}

async function executeAction(action = {}, triggerData = {}) {
  const type = String(action.type || '').trim();
  const params = action.params || {};

  if (type === 'send_notification') {
    const msg = String(params.message || triggerData.message || 'Automation regel uitgevoerd');
    const severity = String(params.severity || triggerData.severity || 'info');
    await colRef(...COLLECTIONS.NOTIFICATION_LOGS).add({
      message: msg,
      severity,
      recipients: Array.isArray(params.recipients) ? params.recipients : [],
      type: 'automation',
      status: 'unread',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      data: triggerData.data || null,
    });

    await createAutomationMessage(`Automation: ${triggerData.message || 'Systeem Alert'}`, msg, severity === 'critical' || severity === 'alert' ? 'urgent' : 'normal', { type: 'automation_alert' });
    return { success: true, message: 'Notificatie verzonden' };
  }

  if (type === 'create_log') {
    const logMessage = String(params.logMessage || triggerData.message || 'Automation log');
    await createAutomationMessage('Automation Event', logMessage, 'normal', { type: 'system_log', data: triggerData.data || null });
    return { success: true, message: 'Log entry aangemaakt' };
  }

  if (type === 'inspection_reminder') {
    const products = Array.isArray(triggerData.data?.products) ? triggerData.data.products : [];
    for (const product of products) {
      await createAutomationMessage(
        'Reminder: Tijdelijke Afkeur',
        `Product ${product.lotNumber} ligt al ${product.daysSince}+ dagen op ${product.station} ter reparatie. Graag actie.`,
        'urgent',
        { type: 'alert', relatedLot: product.lotNumber }
      );
    }
    return { success: true, message: `${products.length} reminder(s) verzonden` };
  }

  if (type === 'update_status') {
    return { success: true, message: `Status update naar ${String(params.targetStatus || 'in_progress')} gepland` };
  }

  return { success: false, message: `Unknown action type: ${type}` };
}

async function checkDebounce(ruleId, debounceMinutes = 60) {
  const cutoffDate = new Date(Date.now() - Number(debounceMinutes || 60) * 60 * 1000);
  const snap = await colRef(...COLLECTIONS.AUTOMATION_EXECUTIONS)
    .where('ruleId', '==', String(ruleId || ''))
    .where('executedAt', '>=', cutoffDate)
    .limit(1)
    .get();
  return !snap.empty;
}

async function executeAutomationRuleService(rule = {}) {
  if (!rule?.id || !rule?.name || !rule?.trigger || !rule?.action) {
    throw new Error('Ongeldige automation rule payload.');
  }

  if (rule.debounceMinutes && await checkDebounce(rule.id, rule.debounceMinutes)) {
    return { skipped: true, message: 'Skipped due to recent execution (debounce)' };
  }

  let result;
  try {
    result = await evaluateTrigger(rule.trigger);
    let actionResult = null;

    if (result.triggered) {
      actionResult = await executeAction(rule.action, result);
      await db.doc(`future-factory/automation/rules/${rule.id}`).set({
        executionCount: Number(rule.executionCount || 0) + 1,
        lastExecuted: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await colRef(...COLLECTIONS.AUTOMATION_EXECUTIONS).add({
      ruleId: rule.id,
      ruleName: rule.name,
      trigger: rule.trigger,
      action: rule.action,
      status: result.triggered ? 'success' : 'no_trigger',
      message: result.message || 'No trigger match',
      data: result.data || null,
      actionResult,
      executedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ...result, actionResult };
  } catch (error) {
    await colRef(...COLLECTIONS.AUTOMATION_EXECUTIONS).add({
      ruleId: rule.id,
      ruleName: rule.name,
      trigger: rule.trigger,
      action: rule.action,
      status: 'error',
      message: error.message,
      executedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { triggered: false, error: error.message };
  }
}

module.exports = {
  executeAutomationRuleService,
};
