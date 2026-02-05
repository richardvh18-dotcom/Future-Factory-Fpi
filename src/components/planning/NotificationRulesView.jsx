import React, { useState, useEffect } from "react";
import { 
  Bell, 
  AlertTriangle, 
  Clock, 
  Users, 
  Settings,
  CheckCircle,
  XCircle,
  TrendingUp,
  Trash2,
  Plus
} from "lucide-react";
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";

/**
 * NotificationRulesView - Configure automated notifications
 * Triggers notifications based on system events
 */
const NotificationRulesView = () => {
  const [rules, setRules] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [planning, setPlanning] = useState([]);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRule, setNewRule] = useState({
    name: "",
    trigger: "capacity_shortage",
    threshold: 10,
    recipients: "all",
    enabled: true
  });

  useEffect(() => {
    // Load notification rules
    const unsubRules = onSnapshot(
      collection(db, ...PATHS.NOTIFICATION_RULES),
      (snapshot) => {
        const rulesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setRules(rulesData);
      }
    );

    // Load recent notifications
    const unsubNotifications = onSnapshot(
      collection(db, ...PATHS.NOTIFICATION_LOGS),
      (snapshot) => {
        const notifData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setNotifications(notifData.slice(0, 50)); // Last 50
      }
    );

    // Load occupancy for monitoring
    const unsubOccupancy = onSnapshot(
      collection(db, ...PATHS.OCCUPANCY),
      (snapshot) => {
        setOccupancy(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    // Load planning for monitoring
    const unsubPlanning = onSnapshot(
      collection(db, ...PATHS.PLANNING),
      (snapshot) => {
        setPlanning(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    return () => {
      unsubRules();
      unsubNotifications();
      unsubOccupancy();
      unsubPlanning();
    };
  }, []);

  // Monitor and trigger notifications
  useEffect(() => {
    if (rules.length === 0) return;

    rules.forEach(rule => {
      if (!rule.enabled) return;

      checkRule(rule);
    });
  }, [occupancy, planning, rules]);

  // Check if rule conditions are met
  const checkRule = async (rule) => {
    let shouldTrigger = false;
    let message = "";
    let severity = "info";

    switch (rule.trigger) {
      case "capacity_shortage":
        // Check if capacity < demand by threshold
        const totalCapacity = occupancy.reduce((sum, o) => sum + (o.productionHours || 0), 0);
        const totalDemand = planning.reduce((sum, p) => sum + (p.estimatedHours || 0), 0);
        const shortage = totalDemand - totalCapacity;
        
        if (shortage > rule.threshold) {
          shouldTrigger = true;
          message = `⚠️ Capaciteitstekort gedetecteerd: ${Math.round(shortage)}h tekort (threshold: ${rule.threshold}h)`;
          severity = "warning";
        }
        break;

      case "low_efficiency":
        // Check if efficiency drops below threshold
        const avgEfficiency = occupancy.reduce((sum, o) => {
          const eff = o.productionHours > 0 ? (o.actualHours || 0) / o.productionHours : 0;
          return sum + eff;
        }, 0) / (occupancy.length || 1);

        if (avgEfficiency < rule.threshold / 100) {
          shouldTrigger = true;
          message = `📉 Lage efficiency gedetecteerd: ${Math.round(avgEfficiency * 100)}% (threshold: ${rule.threshold}%)`;
          severity = "warning";
        }
        break;

      case "order_delay":
        // Check for orders past planned date
        const now = new Date();
        const delayedOrders = planning.filter(p => {
          if (!p.plannedDate || p.status === "shipped") return false;
          const planDate = new Date(p.plannedDate.seconds * 1000);
          return planDate < now;
        });

        if (delayedOrders.length > 0) {
          shouldTrigger = true;
          message = `🕐 ${delayedOrders.length} orders zijn vertraagd`;
          severity = "critical";
        }
        break;

      case "missing_operator":
        // Check for machines without operators
        const machinesWithoutOperators = occupancy.filter(o => 
          !o.operatorName || o.operatorName === ""
        );

        if (machinesWithoutOperators.length >= rule.threshold) {
          shouldTrigger = true;
          message = `👤 ${machinesWithoutOperators.length} machines zonder operator`;
          severity = "warning";
        }
        break;

      case "dependency_blocked":
        // Check for orders blocked by dependencies
        const blockedOrders = planning.filter(p => {
          if (!p.dependencies || p.dependencies.length === 0) return false;
          const allDepsComplete = p.dependencies.every(depId => {
            const dep = planning.find(o => o.id === depId);
            return dep && dep.status === "shipped";
          });
          return !allDepsComplete && p.status !== "shipped";
        });

        if (blockedOrders.length >= rule.threshold) {
          shouldTrigger = true;
          message = `🔗 ${blockedOrders.length} orders geblokkeerd door dependencies`;
          severity = "info";
        }
        break;
    }

    if (shouldTrigger) {
      // Check if we already sent this notification recently (debounce)
      const recentSimilar = notifications.find(n => 
        n.ruleId === rule.id && 
        n.createdAt && 
        (Date.now() - new Date(n.createdAt.seconds * 1000).getTime()) < 3600000 // 1 hour
      );

      if (!recentSimilar) {
        await sendNotification({
          ruleId: rule.id,
          ruleName: rule.name,
          message,
          severity,
          recipients: rule.recipients
        });
      }
    }
  };

  // Send notification
  const sendNotification = async (notification) => {
    await addDoc(collection(db, ...PATHS.NOTIFICATION_LOGS), {
      ...notification,
      createdAt: serverTimestamp(),
      read: false
    });
  };

  // Add new rule
  const addRule = async () => {
    if (!newRule.name) {
      alert("Geef de regel een naam");
      return;
    }

    await addDoc(collection(db, ...PATHS.NOTIFICATION_RULES), {
      ...newRule,
      createdAt: serverTimestamp()
    });

    setNewRule({
      name: "",
      trigger: "capacity_shortage",
      threshold: 10,
      recipients: "all",
      enabled: true
    });
    setShowAddRule(false);
  };

  // Delete rule
  const deleteRule = async (ruleId) => {
    if (confirm("Weet je zeker dat je deze regel wilt verwijderen?")) {
      await deleteDoc(doc(db, ...PATHS.NOTIFICATION_RULES, ruleId));
    }
  };

  // Toggle rule
  const toggleRule = async (ruleId, currentState) => {
    await updateDoc(doc(db, ...PATHS.NOTIFICATION_RULES, ruleId), {
      enabled: !currentState
    });
  };

  // Mark notification as read
  const markAsRead = async (notifId) => {
    await updateDoc(doc(db, ...PATHS.NOTIFICATION_LOGS, notifId), {
      read: true
    });
  };

  const getTriggerLabel = (trigger) => {
    const labels = {
      capacity_shortage: "Capaciteitstekort",
      low_efficiency: "Lage Efficiency",
      order_delay: "Order Vertraging",
      missing_operator: "Ontbrekende Operator",
      dependency_blocked: "Geblokkeerde Dependencies"
    };
    return labels[trigger] || trigger;
  };

  const getSeverityColor = (severity) => {
    const colors = {
      info: "bg-blue-50 border-blue-200 text-blue-800",
      warning: "bg-amber-50 border-amber-200 text-amber-800",
      critical: "bg-red-50 border-red-200 text-red-800"
    };
    return colors[severity] || colors.info;
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-800">
              Notification <span className="text-blue-600">Rules</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Configureer geautomatiseerde notificaties voor systeem events
            </p>
          </div>

          <button
            onClick={() => setShowAddRule(!showAddRule)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold transition-colors"
          >
            <Plus size={16} />
            Nieuwe Regel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Rules */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200">
            <div className="p-4 border-b-2 border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800">Actieve Regels</h3>
            </div>
            <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
              {showAddRule && (
                <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl space-y-3">
                  <input
                    type="text"
                    placeholder="Regel naam..."
                    value={newRule.name}
                    onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                  />

                  <select
                    value={newRule.trigger}
                    onChange={(e) => setNewRule({ ...newRule, trigger: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                  >
                    <option value="capacity_shortage">Capaciteitstekort</option>
                    <option value="low_efficiency">Lage Efficiency</option>
                    <option value="order_delay">Order Vertraging</option>
                    <option value="missing_operator">Ontbrekende Operator</option>
                    <option value="dependency_blocked">Geblokkeerde Dependencies</option>
                  </select>

                  <input
                    type="number"
                    placeholder="Threshold..."
                    value={newRule.threshold}
                    onChange={(e) => setNewRule({ ...newRule, threshold: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                  />

                  <select
                    value={newRule.recipients}
                    onChange={(e) => setNewRule({ ...newRule, recipients: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                  >
                    <option value="all">Iedereen</option>
                    <option value="admins">Alleen Admins</option>
                    <option value="teamleaders">Teamleaders</option>
                    <option value="engineers">Engineers</option>
                  </select>

                  <div className="flex gap-2">
                    <button
                      onClick={addRule}
                      className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors"
                    >
                      Opslaan
                    </button>
                    <button
                      onClick={() => setShowAddRule(false)}
                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                    >
                      Annuleren
                    </button>
                  </div>
                </div>
              )}

              {rules.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  Nog geen notification rules
                </div>
              ) : (
                rules.map(rule => (
                  <div
                    key={rule.id}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      rule.enabled 
                        ? "border-blue-200 bg-blue-50" 
                        : "border-slate-200 bg-slate-50 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-bold text-sm text-slate-800">{rule.name}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {getTriggerLabel(rule.trigger)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleRule(rule.id, rule.enabled)}
                          className={`p-1 rounded-lg transition-colors ${
                            rule.enabled 
                              ? "bg-emerald-100 hover:bg-emerald-200" 
                              : "bg-slate-200 hover:bg-slate-300"
                          }`}
                        >
                          {rule.enabled ? (
                            <CheckCircle className="text-emerald-600" size={16} />
                          ) : (
                            <XCircle className="text-slate-500" size={16} />
                          )}
                        </button>
                        <button
                          onClick={() => deleteRule(rule.id)}
                          className="p-1 hover:bg-red-100 rounded-lg transition-colors"
                        >
                          <Trash2 className="text-red-600" size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1 text-slate-600">
                        <TrendingUp size={12} />
                        <span>Threshold: {rule.threshold}</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-600">
                        <Users size={12} />
                        <span>{rule.recipients}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Recent Notifications */}
        <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200">
          <div className="p-4 border-b-2 border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-800">Recente Notificaties</h3>
          </div>
          <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                Geen notificaties
              </div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  className={`p-3 rounded-xl border-2 ${getSeverityColor(notif.severity)} ${
                    notif.read ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Bell size={14} />
                      <div className="text-xs font-bold">{notif.ruleName}</div>
                    </div>
                    {!notif.read && (
                      <button
                        onClick={() => markAsRead(notif.id)}
                        className="text-xs underline hover:no-underline"
                      >
                        Markeer gelezen
                      </button>
                    )}
                  </div>
                  <div className="text-xs">{notif.message}</div>
                  {notif.createdAt && (
                    <div className="text-xs opacity-60 mt-2">
                      {new Date(notif.createdAt.seconds * 1000).toLocaleString('nl-NL')}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationRulesView;
