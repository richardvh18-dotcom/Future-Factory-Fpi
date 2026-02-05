import React, { useState, useEffect } from "react";
import { 
  Zap, 
  Plus, 
  Trash2, 
  CheckCircle,
  XCircle,
  Play,
  Pause,
  ArrowRight,
  Edit,
  AlertTriangle,
  Clock,
  TrendingDown,
  Users,
  Link2,
  BarChart3,
  Upload
} from "lucide-react";
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { executeRuleWithLogging } from "../../utils/automationEngine";

/**
 * AutomationRulesView - "When X happens, then Y" automation engine
 * Centralized automation met gemigreerde hardcoded logica
 */
const AutomationRulesView = () => {
  const [rules, setRules] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [showAddRule, setShowAddRule] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [newRule, setNewRule] = useState({
    name: "",
    trigger: {
      type: "capacity_shortage",
      conditions: { threshold: 0 }
    },
    action: {
      type: "send_notification",
      params: { severity: "warning" }
    },
    enabled: true,
    debounceMinutes: 60
  });

  useEffect(() => {
    // Load automation rules
    const unsubRules = onSnapshot(
      collection(db, ...PATHS.AUTOMATION_RULES),
      (snapshot) => {
        const rulesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setRules(rulesData);
      }
    );

    // Load execution history
    const unsubExecutions = onSnapshot(
      collection(db, ...PATHS.AUTOMATION_EXECUTIONS),
      (snapshot) => {
        const execData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setExecutions(execData.slice(0, 100)); // Last 100
      }
    );

    return () => {
      unsubRules();
      unsubExecutions();
    };
  }, []);

  // Add or Update automation rule
  const saveRule = async () => {
    if (!newRule.name) {
      alert("Geef de regel een naam");
      return;
    }

    if (editingRule) {
      // Update bestaande regel
      await updateDoc(doc(db, ...PATHS.AUTOMATION_RULES, editingRule.id), {
        ...newRule,
        updatedAt: serverTimestamp()
      });
    } else {
      // Voeg nieuwe regel toe
      await addDoc(collection(db, ...PATHS.AUTOMATION_RULES), {
        ...newRule,
        createdAt: serverTimestamp(),
        executionCount: 0,
        lastExecuted: null
      });
    }

    // Reset state
    setEditingRule(null);
    setNewRule({
      name: "",
      trigger: {
        type: "capacity_shortage",
        conditions: { threshold: 0 }
      },
      action: {
        type: "send_notification",
        params: { severity: "warning" }
      },
      enabled: true,
      debounceMinutes: 60
    });
    setShowAddRule(false);
  };

  // Start editing rule
  const handleEditRule = (rule) => {
    setEditingRule(rule);
    setNewRule({ ...rule });
    setShowAddRule(true);
  };

  // Delete rule
  const deleteRule = async (ruleId) => {
    if (confirm("Weet je zeker dat je deze automation regel wilt verwijderen?")) {
      await deleteDoc(doc(db, ...PATHS.AUTOMATION_RULES, ruleId));
    }
  };

  // Toggle rule
  const toggleRule = async (ruleId, currentState) => {
    await updateDoc(doc(db, ...PATHS.AUTOMATION_RULES, ruleId), {
      enabled: !currentState
    });
  };

  // Test rule (manual execution using automation engine)
  const testRule = async (rule) => {
    setIsTesting(true);
    try {
      const result = await executeRuleWithLogging(rule);
      
      if (result.skipped) {
        alert(`⏸️ ${result.message}`);
      } else if (result.error) {
        alert(`❌ Error: ${result.error}`);
      } else if (result.triggered) {
        alert(`✅ Regel uitgevoerd!\n\n${result.message || 'Actie succesvol uitgevoerd'}`);
      } else {
        alert(`ℹ️ Trigger niet geactiveerd\n\n${result.message || 'Condities niet voldaan'}`);
      }
    } catch (error) {
      console.error("Test error:", error);
      alert(`❌ Fout bij uitvoeren: ${error.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const getTriggerLabel = (trigger) => {
    const labels = {
      // Existing
      order_status_change: "Order Status Wijziging",
      capacity_threshold: "Capaciteit Threshold",
      time_based: "Tijd-gebaseerd",
      dependency_complete: "Dependency Voltooid",
      efficiency_drop: "Efficiency Daling",
      // Migrated from NotificationRulesView
      capacity_shortage: "Capaciteitstekort",
      low_efficiency: "Lage Efficiency",
      order_delay: "Order Vertraging",
      missing_operator: "Ontbrekende Operator",
      dependency_blocked: "Geblokkeerde Dependencies",
      // Migrated from WorkstationHub
      inspection_overdue: "Inspectie Overdue",
      // Migrated from autoLearningService
      standard_deviation: "Standaard Afwijking"
    };
    return labels[trigger.type] || trigger.type;
  };

  const getActionLabel = (action) => {
    const labels = {
      send_notification: "Stuur Notificatie",
      update_status: "Update Status",
      assign_operator: "Wijs Operator Toe",
      reschedule_order: "Herplan Order",
      create_log: "Maak Log Entry",
      // New migrated actions
      auto_learning_update: "Update Standaarden (AI)",
      inspection_reminder: "Stuur Inspectie Reminder"
    };
    return labels[action.type] || action.type;
  };

  const getTriggerIcon = (type) => {
    const icons = {
      capacity_shortage: <AlertTriangle className="text-orange-600" size={14} />,
      low_efficiency: <TrendingDown className="text-red-600" size={14} />,
      order_delay: <Clock className="text-amber-600" size={14} />,
      missing_operator: <Users className="text-purple-600" size={14} />,
      dependency_blocked: <Link2 className="text-blue-600" size={14} />,
      inspection_overdue: <Clock className="text-red-600" size={14} />,
      standard_deviation: <BarChart3 className="text-indigo-600" size={14} />,
      order_status_change: <CheckCircle className="text-emerald-600" size={14} />
    };
    return icons[type] || <Zap className="text-slate-600" size={14} />;
  };

  // Import standaard rules (gemigreerd van oude modules)
  const importDefaultRules = async () => {
    if (!confirm("Dit importeert vooraf geconfigureerde automation rules gebaseerd op de oude hardcoded logica. Doorgaan?")) {
      return;
    }

    setIsImporting(true);
    
    const defaultRules = [
      // Van NotificationRulesView - Capacity Shortage
      {
        name: "⚠️ Capaciteitstekort Waarschuwing",
        trigger: {
          type: "capacity_shortage",
          conditions: { threshold: 40 }
        },
        action: {
          type: "send_notification",
          params: { severity: "warning" }
        },
        enabled: true,
        debounceMinutes: 60,
        description: "Gemigreerd van NotificationRulesView"
      },
      // Van NotificationRulesView - Low Efficiency
      {
        name: "📉 Lage Efficiency Alert",
        trigger: {
          type: "low_efficiency",
          conditions: { threshold: 80 }
        },
        action: {
          type: "send_notification",
          params: { severity: "warning" }
        },
        enabled: true,
        debounceMinutes: 120,
        description: "Gemigreerd van NotificationRulesView"
      },
      // Van NotificationRulesView - Order Delay
      {
        name: "🕐 Vertraagde Orders Notificatie",
        trigger: {
          type: "order_delay",
          conditions: { minDelayedOrders: 1 }
        },
        action: {
          type: "send_notification",
          params: { severity: "critical" }
        },
        enabled: true,
        debounceMinutes: 360,
        description: "Gemigreerd van NotificationRulesView"
      },
      // Van NotificationRulesView - Missing Operator
      {
        name: "👤 Ontbrekende Operators Waarschuwing",
        trigger: {
          type: "missing_operator",
          conditions: { threshold: 1 }
        },
        action: {
          type: "send_notification",
          params: { severity: "warning" }
        },
        enabled: true,
        debounceMinutes: 60,
        description: "Gemigreerd van NotificationRulesView"
      },
      // Van NotificationRulesView - Dependency Blocked
      {
        name: "🔗 Geblokkeerde Dependencies Alert",
        trigger: {
          type: "dependency_blocked",
          conditions: { threshold: 1 }
        },
        action: {
          type: "send_notification",
          params: { severity: "info" }
        },
        enabled: true,
        debounceMinutes: 180,
        description: "Gemigreerd van NotificationRulesView"
      },
      // Van WorkstationHub - Inspection Overdue (7 dagen)
      {
        name: "⏰ Inspectie Reminder (7+ dagen)",
        trigger: {
          type: "inspection_overdue",
          conditions: { daysOverdue: 7 }
        },
        action: {
          type: "inspection_reminder",
          params: {}
        },
        enabled: true,
        debounceMinutes: 1440, // 1 dag
        description: "Gemigreerd van WorkstationHub"
      },
      // Van autoLearningService - Standard Deviation (alleen rapport)
      {
        name: "📊 Productie Standaarden Afwijking Rapport",
        trigger: {
          type: "standard_deviation",
          conditions: { minSamples: 5, minDeviation: 5 }
        },
        action: {
          type: "send_notification",
          params: { severity: "info" }
        },
        enabled: true,
        debounceMinutes: 10080, // 1 week
        description: "Gemigreerd van autoLearningService (rapportage)"
      },
      // Van autoLearningService - Auto Learning Update (DRY RUN)
      {
        name: "🤖 AI Auto-Learning Standaarden (Dry Run)",
        trigger: {
          type: "standard_deviation",
          conditions: { minSamples: 5, minDeviation: 10 }
        },
        action: {
          type: "auto_learning_update",
          params: { learningRate: 0.3, dryRun: true }
        },
        enabled: false, // Disabled by default for safety
        debounceMinutes: 10080, // 1 week
        description: "Gemigreerd van autoLearningService (TEST EERST!)"
      }
    ];

    try {
      for (const rule of defaultRules) {
        await addDoc(collection(db, ...PATHS.AUTOMATION_RULES), {
          ...rule,
          createdAt: serverTimestamp(),
          executionCount: 0,
          lastExecuted: null
        });
      }
      alert(`✅ ${defaultRules.length} standaard automation rules geïmporteerd!`);
    } catch (error) {
      console.error("Import error:", error);
      alert(`❌ Fout bij importeren: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-800">
              Automation <span className="text-purple-600">Rules</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              "When X happens, then Y" - Automatiseer acties op basis van triggers
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="px-4 py-2 bg-purple-50 border-2 border-purple-200 rounded-xl">
              <div className="text-xs text-purple-600 font-bold uppercase">Active Rules</div>
              <div className="text-2xl font-black text-purple-600">
                {rules.filter(r => r.enabled).length}
              </div>
            </div>

            <button
              onClick={importDefaultRules}
              disabled={isImporting}
              className={`flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-colors ${
                isImporting ? "opacity-50 cursor-not-allowed" : ""
              }`}
              title="Importeer vooraf geconfigureerde rules van oude modules"
            >
              <Upload size={16} />
              {isImporting ? "Importeren..." : "Importeer Defaults"}
            </button>

            <button
              onClick={() => {
                setEditingRule(null);
                setShowAddRule(!showAddRule);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-bold transition-colors"
            >
              <Plus size={16} />
              Nieuwe Regel
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Rules List */}
        <div className="col-span-2 space-y-4">
          {showAddRule && (
            <div className="bg-white rounded-2xl shadow-sm border-2 border-purple-200 p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4">
                {editingRule ? "Automation Regel Bewerken" : "Nieuwe Automation Regel"}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                    Regel Naam
                  </label>
                  <input
                    type="text"
                    placeholder="Bijv: Auto-notify bij productie start"
                    value={newRule.name}
                    onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Trigger */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                      WHEN (Trigger)
                    </label>
                    <select
                      value={newRule.trigger.type}
                      onChange={(e) => setNewRule({ 
                        ...newRule, 
                        trigger: { type: e.target.value, conditions: {} } 
                      })}
                      className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm mb-2"
                    >
                      <optgroup label="📊 Capaciteit & Planning">
                        <option value="capacity_shortage">Capaciteitstekort</option>
                        <option value="low_efficiency">Lage Efficiency</option>
                        <option value="order_delay">Order Vertraging</option>
                        <option value="missing_operator">Ontbrekende Operator</option>
                      </optgroup>
                      <optgroup label="🔗 Dependencies & Workflow">
                        <option value="dependency_blocked">Geblokkeerde Dependencies</option>
                        <option value="order_status_change">Order Status Wijziging</option>
                      </optgroup>
                      <optgroup label="🔍 Kwaliteit & Inspectie">
                        <option value="inspection_overdue">Inspectie Overdue</option>
                      </optgroup>
                      <optgroup label="🤖 AI & Learning">
                        <option value="standard_deviation">Standaard Afwijking</option>
                      </optgroup>
                      <optgroup label="⏰ Tijd & Scheduling">
                        <option value="time_based">Tijd-gebaseerd</option>
                      </optgroup>
                    </select>

                    {/* Capacity Shortage Conditions */}
                    {newRule.trigger.type === "capacity_shortage" && (
                      <div className="space-y-2">
                        <label className="text-xs text-slate-600">Tekort threshold (uren)</label>
                        <input
                          type="number"
                          placeholder="Bijv: 40"
                          value={newRule.trigger.conditions?.threshold || ""}
                          onChange={(e) => setNewRule({ 
                            ...newRule, 
                            trigger: { 
                              ...newRule.trigger, 
                              conditions: { threshold: parseInt(e.target.value) || 0 } 
                            } 
                          })}
                          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                    )}

                    {/* Low Efficiency Conditions */}
                    {newRule.trigger.type === "low_efficiency" && (
                      <div className="space-y-2">
                        <label className="text-xs text-slate-600">Minimum efficiency (%)</label>
                        <input
                          type="number"
                          placeholder="Bijv: 80"
                          value={newRule.trigger.conditions?.threshold || ""}
                          onChange={(e) => setNewRule({ 
                            ...newRule, 
                            trigger: { 
                              ...newRule.trigger, 
                              conditions: { threshold: parseInt(e.target.value) || 80 } 
                            } 
                          })}
                          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                    )}

                    {/* Order Delay Conditions */}
                    {newRule.trigger.type === "order_delay" && (
                      <div className="space-y-2">
                        <label className="text-xs text-slate-600">Minimum vertraagde orders</label>
                        <input
                          type="number"
                          placeholder="Bijv: 1"
                          value={newRule.trigger.conditions?.minDelayedOrders || ""}
                          onChange={(e) => setNewRule({ 
                            ...newRule, 
                            trigger: { 
                              ...newRule.trigger, 
                              conditions: { minDelayedOrders: parseInt(e.target.value) || 1 } 
                            } 
                          })}
                          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                    )}

                    {/* Missing Operator Conditions */}
                    {newRule.trigger.type === "missing_operator" && (
                      <div className="space-y-2">
                        <label className="text-xs text-slate-600">Minimum machines zonder operator</label>
                        <input
                          type="number"
                          placeholder="Bijv: 1"
                          value={newRule.trigger.conditions?.threshold || ""}
                          onChange={(e) => setNewRule({ 
                            ...newRule, 
                            trigger: { 
                              ...newRule.trigger, 
                              conditions: { threshold: parseInt(e.target.value) || 1 } 
                            } 
                          })}
                          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                    )}

                    {/* Dependency Blocked Conditions */}
                    {newRule.trigger.type === "dependency_blocked" && (
                      <div className="space-y-2">
                        <label className="text-xs text-slate-600">Minimum geblokkeerde orders</label>
                        <input
                          type="number"
                          placeholder="Bijv: 1"
                          value={newRule.trigger.conditions?.threshold || ""}
                          onChange={(e) => setNewRule({ 
                            ...newRule, 
                            trigger: { 
                              ...newRule.trigger, 
                              conditions: { threshold: parseInt(e.target.value) || 1 } 
                            } 
                          })}
                          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                    )}

                    {/* Inspection Overdue Conditions */}
                    {newRule.trigger.type === "inspection_overdue" && (
                      <div className="space-y-2">
                        <label className="text-xs text-slate-600">Dagen overdue</label>
                        <input
                          type="number"
                          placeholder="Bijv: 7"
                          value={newRule.trigger.conditions?.daysOverdue || ""}
                          onChange={(e) => setNewRule({ 
                            ...newRule, 
                            trigger: { 
                              ...newRule.trigger, 
                              conditions: { 
                                ...newRule.trigger.conditions,
                                daysOverdue: parseInt(e.target.value) || 7 
                              } 
                            } 
                          })}
                          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                        />
                        <label className="text-xs text-slate-600">Station (optioneel)</label>
                        <input
                          type="text"
                          placeholder="Bijv: NABEWERKING"
                          value={newRule.trigger.conditions?.station || ""}
                          onChange={(e) => setNewRule({ 
                            ...newRule, 
                            trigger: { 
                              ...newRule.trigger, 
                              conditions: { 
                                ...newRule.trigger.conditions,
                                station: e.target.value 
                              } 
                            } 
                          })}
                          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                    )}

                    {/* Standard Deviation Conditions */}
                    {newRule.trigger.type === "standard_deviation" && (
                      <div className="space-y-2">
                        <label className="text-xs text-slate-600">Minimum samples</label>
                        <input
                          type="number"
                          placeholder="Bijv: 5"
                          value={newRule.trigger.conditions?.minSamples || ""}
                          onChange={(e) => setNewRule({ 
                            ...newRule, 
                            trigger: { 
                              ...newRule.trigger, 
                              conditions: { 
                                ...newRule.trigger.conditions,
                                minSamples: parseInt(e.target.value) || 5 
                              } 
                            } 
                          })}
                          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                        />
                        <label className="text-xs text-slate-600">Minimum afwijking (%)</label>
                        <input
                          type="number"
                          placeholder="Bijv: 5"
                          value={newRule.trigger.conditions?.minDeviation || ""}
                          onChange={(e) => setNewRule({ 
                            ...newRule, 
                            trigger: { 
                              ...newRule.trigger, 
                              conditions: { 
                                ...newRule.trigger.conditions,
                                minDeviation: parseInt(e.target.value) || 5 
                              } 
                            } 
                          })}
                          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                    )}

                    {/* Order Status Change Conditions */}
                    {newRule.trigger.type === "order_status_change" && (
                      <div className="space-y-2">
                        <label className="text-xs text-slate-600">Target status</label>
                        <select
                          value={newRule.trigger.conditions?.targetStatus || ""}
                          onChange={(e) => setNewRule({ 
                            ...newRule, 
                            trigger: { 
                              ...newRule.trigger, 
                              conditions: { targetStatus: e.target.value } 
                            } 
                          })}
                          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                        >
                          <option value="planned">Gepland</option>
                          <option value="in_production">In Productie</option>
                          <option value="quality_check">Controle</option>
                          <option value="ready_to_ship">Verzendklaar</option>
                          <option value="shipped">Verzonden</option>
                          <option value="completed">Voltooid</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Action */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                      THEN (Action)
                    </label>
                    <select
                      value={newRule.action.type}
                      onChange={(e) => setNewRule({ 
                        ...newRule, 
                        action: { type: e.target.value, params: {} } 
                      })}
                      className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm mb-2"
                    >
                      <option value="send_notification">Stuur Notificatie</option>
                      <option value="create_log">Maak Log Entry</option>
                      <option value="inspection_reminder">Stuur Inspectie Reminder</option>
                      <option value="auto_learning_update">Update Standaarden (AI)</option>
                      <option value="update_status">Update Status</option>
                      <option value="assign_operator">Wijs Operator Toe</option>
                      <option value="reschedule_order">Herplan Order</option>
                    </select>

                    {newRule.action.type === "send_notification" && (
                      <div className="space-y-2">
                        <label className="text-xs text-slate-600">Severity</label>
                        <select
                          value={newRule.action.params?.severity || "info"}
                          onChange={(e) => setNewRule({ 
                            ...newRule, 
                            action: { 
                              ...newRule.action, 
                              params: { ...newRule.action.params, severity: e.target.value } 
                            } 
                          })}
                          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                        >
                          <option value="info">Info</option>
                          <option value="warning">Warning</option>
                          <option value="critical">Critical</option>
                          <option value="alert">Alert</option>
                        </select>
                        <label className="text-xs text-slate-600">Custom bericht (optioneel)</label>
                        <input
                          type="text"
                          placeholder="Laat leeg voor auto bericht"
                          value={newRule.action.params?.message || ""}
                          onChange={(e) => setNewRule({ 
                            ...newRule, 
                            action: { 
                              ...newRule.action, 
                              params: { ...newRule.action.params, message: e.target.value } 
                            } 
                          })}
                          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                    )}

                    {newRule.action.type === "auto_learning_update" && (
                      <div className="space-y-2">
                        <label className="text-xs text-slate-600">Learning Rate (0-1)</label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Bijv: 0.3"
                          value={newRule.action.params?.learningRate || ""}
                          onChange={(e) => setNewRule({ 
                            ...newRule, 
                            action: { 
                              ...newRule.action, 
                              params: { 
                                ...newRule.action.params, 
                                learningRate: parseFloat(e.target.value) || 0.3 
                              } 
                            } 
                          })}
                          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                        />
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={newRule.action.params?.dryRun || false}
                            onChange={(e) => setNewRule({ 
                              ...newRule, 
                              action: { 
                                ...newRule.action, 
                                params: { 
                                  ...newRule.action.params, 
                                  dryRun: e.target.checked 
                                } 
                              } 
                            })}
                          />
                          <span className="text-xs text-slate-600">Dry Run (alleen simuleren)</span>
                        </label>
                      </div>
                    )}

                    {newRule.action.type === "create_log" && (
                      <div className="space-y-2">
                        <label className="text-xs text-slate-600">Log bericht (optioneel)</label>
                        <input
                          type="text"
                          placeholder="Laat leeg voor auto bericht"
                          value={newRule.action.params?.logMessage || ""}
                          onChange={(e) => setNewRule({ 
                            ...newRule, 
                            action: { 
                              ...newRule.action, 
                              params: { ...newRule.action.params, logMessage: e.target.value } 
                            } 
                          })}
                          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Debounce Setting */}
                <div className="pt-2 border-t border-slate-200">
                  <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                    Debounce (minuten)
                  </label>
                  <input
                    type="number"
                    placeholder="Bijv: 60"
                    value={newRule.debounceMinutes || ""}
                    onChange={(e) => setNewRule({ 
                      ...newRule, 
                      debounceMinutes: parseInt(e.target.value) || 60 
                    })}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Voorkomt dubbele executions binnen deze tijd
                  </p>
                </div>

                <div className="flex gap-2 pt-4 border-t-2 border-slate-200">
                  <button
                    onClick={saveRule}
                    className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-bold transition-colors"
                  >
                    {editingRule ? "Wijzigingen Opslaan" : "Regel Opslaan"}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddRule(false);
                      setEditingRule(null);
                    }}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold transition-colors"
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active Rules */}
          <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200">
            <div className="p-4 border-b-2 border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800">Automation Regels</h3>
            </div>
            <div className="p-4 space-y-3">
              {rules.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  Nog geen automation rules geconfigureerd
                </div>
              ) : (
                rules.map(rule => (
                  <div
                    key={rule.id}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      rule.enabled 
                        ? "border-purple-200 bg-purple-50" 
                        : "border-slate-200 bg-slate-50 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="font-bold text-sm text-slate-800 mb-1 flex items-center gap-2">
                          {rule.name}
                          {rule.debounceMinutes && (
                            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-normal">
                              {rule.debounceMinutes}min debounce
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs flex-wrap">
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded font-bold flex items-center gap-1">
                            {getTriggerIcon(rule.trigger.type)}
                            WHEN
                          </span>
                          <span className="text-slate-600">{getTriggerLabel(rule.trigger)}</span>
                          <ArrowRight size={12} className="text-slate-400" />
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded font-bold">
                            THEN
                          </span>
                          <span className="text-slate-600">{getActionLabel(rule.action)}</span>
                        </div>
                        
                        {/* Trigger Conditions Summary */}
                        {rule.trigger.conditions && Object.keys(rule.trigger.conditions).length > 0 && (
                          <div className="mt-2 text-xs text-slate-500">
                            {rule.trigger.type === "capacity_shortage" && `Threshold: ${rule.trigger.conditions.threshold}h`}
                            {rule.trigger.type === "low_efficiency" && `Min: ${rule.trigger.conditions.threshold}%`}
                            {rule.trigger.type === "order_delay" && `Min orders: ${rule.trigger.conditions.minDelayedOrders || 1}`}
                            {rule.trigger.type === "missing_operator" && `Min machines: ${rule.trigger.conditions.threshold || 1}`}
                            {rule.trigger.type === "dependency_blocked" && `Min blocked: ${rule.trigger.conditions.threshold || 1}`}
                            {rule.trigger.type === "inspection_overdue" && `${rule.trigger.conditions.daysOverdue || 7} dagen${rule.trigger.conditions.station ? ` @ ${rule.trigger.conditions.station}` : ''}`}
                            {rule.trigger.type === "standard_deviation" && `Min samples: ${rule.trigger.conditions.minSamples || 5}, Dev: ${rule.trigger.conditions.minDeviation || 5}%`}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditRule(rule)}
                          className="p-1 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Bewerken"
                        >
                          <Edit className="text-blue-600" size={14} />
                        </button>
                        <button
                          onClick={() => testRule(rule)}
                          disabled={isTesting}
                          className={`p-1 rounded-lg transition-colors ${
                            isTesting 
                              ? "bg-slate-100 cursor-not-allowed" 
                              : "hover:bg-blue-100"
                          }`}
                          title="Test uitvoeren"
                        >
                          <Play className={isTesting ? "text-slate-400" : "text-blue-600"} size={14} />
                        </button>
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

                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>Uitgevoerd: {rule.executionCount || 0}x</span>
                      {rule.lastExecuted && (
                        <span>
                          Laatst: {new Date(rule.lastExecuted.seconds * 1000).toLocaleString('nl-NL', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Execution History */}
        <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200">
          <div className="p-4 border-b-2 border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-800">Execution History</h3>
          </div>
          <div className="p-4 space-y-2 max-h-[700px] overflow-y-auto">
            {executions.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                Nog geen executions
              </div>
            ) : (
              executions.map(exec => (
                <div
                  key={exec.id}
                  className={`p-3 rounded-lg border ${
                    exec.status === "success" 
                      ? "border-emerald-200 bg-emerald-50" 
                      : "border-red-200 bg-red-50"
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="text-xs font-bold text-slate-800">{exec.ruleName}</div>
                    {exec.status === "success" ? (
                      <CheckCircle className="text-emerald-600" size={12} />
                    ) : (
                      <XCircle className="text-red-600" size={12} />
                    )}
                  </div>
                  <div className="text-xs text-slate-600">{exec.message || "No message"}</div>
                  {exec.executedAt && (
                    <div className="text-xs text-slate-400 mt-1">
                      {new Date(exec.executedAt.seconds * 1000).toLocaleString('nl-NL', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Info Panel */}
      <div className="mt-6 bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl p-6 border-2 border-purple-200">
        <div className="flex items-start gap-4">
          <Zap className="text-purple-600 flex-shrink-0" size={24} />
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Centralized Automation Engine 🚀</h3>
            <div className="text-sm text-slate-700 space-y-1">
              <p>✅ <strong>Gemigreerde Logica:</strong> Alle hardcoded automation rules zijn nu data-driven</p>
              <p>✅ <strong>8 Trigger Types:</strong> Capacity shortage, Low efficiency, Order delay, Missing operator, Dependency blocked, Inspection overdue, Standard deviation, Status change</p>
              <p>✅ <strong>7 Action Types:</strong> Notificaties, Logs, Inspectie reminders, AI learning updates, Status updates, Operator toewijzingen, Herplanningen</p>
              <p>✅ <strong>Smart Debouncing:</strong> Voorkomt dubbele executions binnen geconfigureerde tijd</p>
              <p>✅ <strong>Real-time Testing:</strong> Test elke regel direct met actuele data via Play knop</p>
              <p>✅ <strong>Execution History:</strong> Volledige logging van alle uitgevoerde rules</p>
            </div>
            <div className="mt-3 p-3 bg-white/50 rounded-lg border border-purple-200">
              <p className="text-xs font-bold text-purple-700 mb-1">🎯 Migratie Succesvol:</p>
              <p className="text-xs text-slate-600">
                <strong>NotificationRulesView:</strong> 5 trigger types → Automation Rules<br />
                <strong>WorkstationHub:</strong> Inspection reminders → Automation Rules<br />
                <strong>autoLearningService:</strong> AI standard updates → Automation Rules
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutomationRulesView;
