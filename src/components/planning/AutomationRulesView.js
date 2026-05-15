import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Zap, Plus, Trash2, CheckCircle, XCircle, Play, ArrowRight, Edit, AlertTriangle, Clock, TrendingDown, Users, Link2, BarChart3, Upload } from "lucide-react";
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { executeRuleWithLogging } from "../../utils/automationEngine";
import { useNotifications } from "../../contexts/NotificationContext";
/**
 * AutomationRulesView - "When X happens, then Y" automation engine
 * Centralized automation met gemigreerde hardcoded logica
 */
const AutomationRulesView = () => {
    const { t } = useTranslation();
    const { showConfirm, notify } = useNotifications();
    const [rules, setRules] = useState([]);
    const [executions, setExecutions] = useState([]);
    const [emailTemplates, setEmailTemplates] = useState([]);
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
        const unsubRules = onSnapshot(collection(db, ...PATHS.AUTOMATION_RULES), (snapshot) => {
            const rulesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setRules(rulesData);
        });
        // Load execution history
        const unsubExecutions = onSnapshot(collection(db, ...PATHS.AUTOMATION_EXECUTIONS), (snapshot) => {
            const execData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setExecutions(execData.slice(0, 100)); // Last 100
        });
        // Load email templates
        const unsubEmailTemplates = onSnapshot(collection(db, ...PATHS.EMAIL_TEMPLATES), (snapshot) => {
            const templatesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setEmailTemplates(templatesData);
        });
        return () => {
            unsubRules();
            unsubExecutions();
            unsubEmailTemplates();
        };
    }, []);
    // Add or Update automation rule
    const saveRule = async () => {
        if (!newRule.name) {
            notify(t("planning.automationRules.alerts.ruleNameRequired", "Geef de regel een naam"));
            return;
        }
        if (editingRule) {
            // Update bestaande regel
            await updateDoc(doc(db, ...PATHS.AUTOMATION_RULES, editingRule.id), {
                ...newRule,
                updatedAt: serverTimestamp()
            });
            await logActivity(auth.currentUser?.uid, "AUTOMATION_RULE_UPDATE", `Automationregel bijgewerkt: ${editingRule.id} (${newRule.name})`);
        }
        else {
            // Voeg nieuwe regel toe
            await addDoc(collection(db, ...PATHS.AUTOMATION_RULES), {
                ...newRule,
                createdAt: serverTimestamp(),
                executionCount: 0,
                lastExecuted: null
            });
            await logActivity(auth.currentUser?.uid, "AUTOMATION_RULE_CREATE", `Automationregel aangemaakt: ${newRule.name}`);
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
        const confirmed = await showConfirm({
            title: t("planning.automationRules.alerts.deleteTitle", "Automationregel verwijderen"),
            message: t("planning.automationRules.alerts.confirmDelete", "Weet je zeker dat je deze automation regel wilt verwijderen?"),
            confirmText: t("common.delete", "Verwijderen"),
            cancelText: t("common.cancel", "Annuleren"),
            tone: "danger",
        });
        if (!confirmed)
            return;
        await deleteDoc(doc(db, ...PATHS.AUTOMATION_RULES, ruleId));
        await logActivity(auth.currentUser?.uid, "AUTOMATION_RULE_DELETE", `Automationregel verwijderd: ${ruleId}`);
    };
    // Toggle rule
    const toggleRule = async (ruleId, currentState) => {
        await updateDoc(doc(db, ...PATHS.AUTOMATION_RULES, ruleId), {
            enabled: !currentState
        });
        await logActivity(auth.currentUser?.uid, "AUTOMATION_RULE_TOGGLE", `Automationregel ${ruleId} ${!currentState ? "ingeschakeld" : "uitgeschakeld"}`);
    };
    // Test rule (manual execution using automation engine)
    const testRule = async (rule) => {
        setIsTesting(true);
        try {
            const result = await executeRuleWithLogging(rule);
            if (result.skipped) {
                notify(`⏸️ ${result.message}`);
            }
            else if (result.error) {
                notify(`❌ ${t("planning.automationRules.alerts.error", "Fout")}: ${result.error}`);
            }
            else if (result.triggered) {
                notify(`✅ ${t("planning.automationRules.alerts.ruleExecuted", "Regel uitgevoerd!")}\n\n${result.message || t("planning.automationRules.alerts.actionSuccess", "Actie succesvol uitgevoerd")}`);
            }
            else {
                notify(`ℹ️ ${t("planning.automationRules.alerts.triggerNotActivated", "Trigger niet geactiveerd")}\n\n${result.message || t("planning.automationRules.alerts.conditionsNotMet", "Condities niet voldaan")}`);
            }
        }
        catch (error) {
            console.error("Test error:", error);
            notify(`❌ ${t("planning.automationRules.alerts.executionFailed", "Fout bij uitvoeren")}: ${error.message}`);
        }
        finally {
            setIsTesting(false);
        }
    };
    const getTriggerLabel = (trigger) => {
        const labels = {
            // Existing
            order_status_change: t("planning.automationRules.triggers.order_status_change", "Order Status Wijziging"),
            capacity_threshold: t("planning.automationRules.triggers.capacity_threshold", "Capaciteit Threshold"),
            time_based: t("planning.automationRules.triggers.time_based", "Tijd-gebaseerd"),
            dependency_complete: t("planning.automationRules.triggers.dependency_complete", "Dependency Voltooid"),
            efficiency_drop: t("planning.automationRules.triggers.efficiency_drop", "Efficiency Daling"),
            // Migrated from NotificationRulesView
            capacity_shortage: t("planning.automationRules.triggers.capacity_shortage", "Capaciteitstekort"),
            low_efficiency: t("planning.automationRules.triggers.low_efficiency", "Lage Efficiency"),
            order_delay: t("planning.automationRules.triggers.order_delay", "Order Vertraging"),
            missing_operator: t("planning.automationRules.triggers.missing_operator", "Ontbrekende Operator"),
            dependency_blocked: t("planning.automationRules.triggers.dependency_blocked", "Geblokkeerde Dependencies"),
            // Migrated from WorkstationHub
            inspection_overdue: t("planning.automationRules.triggers.inspection_overdue", "Inspectie Overdue"),
            // Migrated from autoLearningService
            standard_deviation: t("planning.automationRules.triggers.standard_deviation", "Standaard Afwijking")
        };
        return labels[trigger.type] || trigger.type;
    };
    const getActionLabel = (action) => {
        const labels = {
            send_notification: t("planning.automationRules.actions.send_notification", "Stuur Notificatie"),
            send_resend_email: t("planning.automationRules.actions.send_resend_email", "Stuur E-mail (Template)"),
            update_status: t("planning.automationRules.actions.update_status", "Update Status"),
            assign_operator: t("planning.automationRules.actions.assign_operator", "Wijs Operator Toe"),
            reschedule_order: t("planning.automationRules.actions.reschedule_order", "Herplan Order"),
            create_log: t("planning.automationRules.actions.create_log", "Maak Log Entry"),
            // New migrated actions
            auto_learning_update: t("planning.automationRules.actions.auto_learning_update", "Update Standaarden (AI)"),
            inspection_reminder: t("planning.automationRules.actions.inspection_reminder", "Stuur Inspectie Reminder")
        };
        return labels[action.type] || action.type;
    };
    const getConditionSummary = (rule) => {
        if (!rule.trigger?.conditions)
            return null;
        if (rule.trigger.type === "capacity_shortage") {
            return t("planning.automationRules.summaries.thresholdHours", "Threshold: {{value}}h", { value: rule.trigger.conditions.threshold });
        }
        if (rule.trigger.type === "low_efficiency") {
            return t("planning.automationRules.summaries.minPercent", "Min: {{value}}%", { value: rule.trigger.conditions.threshold });
        }
        if (rule.trigger.type === "order_delay") {
            return t("planning.automationRules.summaries.minOrders", "Min orders: {{value}}", { value: rule.trigger.conditions.minDelayedOrders || 1 });
        }
        if (rule.trigger.type === "missing_operator") {
            return t("planning.automationRules.summaries.minMachines", "Min machines: {{value}}", { value: rule.trigger.conditions.threshold || 1 });
        }
        if (rule.trigger.type === "dependency_blocked") {
            return t("planning.automationRules.summaries.minBlocked", "Min blocked: {{value}}", { value: rule.trigger.conditions.threshold || 1 });
        }
        if (rule.trigger.type === "inspection_overdue") {
            return t("planning.automationRules.summaries.inspectionOverdue", "{{days}} dagen{{station}}", {
                days: rule.trigger.conditions.daysOverdue || 7,
                station: rule.trigger.conditions.station ? ` @ ${rule.trigger.conditions.station}` : "",
            });
        }
        if (rule.trigger.type === "standard_deviation") {
            return t("planning.automationRules.summaries.standardDeviation", "Min samples: {{samples}}, Dev: {{deviation}}%", {
                samples: rule.trigger.conditions.minSamples || 5,
                deviation: rule.trigger.conditions.minDeviation || 5,
            });
        }
        return null;
    };
    const getTriggerIcon = (type) => {
        const icons = {
            capacity_shortage: _jsx(AlertTriangle, { className: "text-orange-600", size: 14 }),
            low_efficiency: _jsx(TrendingDown, { className: "text-red-600", size: 14 }),
            order_delay: _jsx(Clock, { className: "text-amber-600", size: 14 }),
            missing_operator: _jsx(Users, { className: "text-purple-600", size: 14 }),
            dependency_blocked: _jsx(Link2, { className: "text-blue-600", size: 14 }),
            inspection_overdue: _jsx(Clock, { className: "text-red-600", size: 14 }),
            standard_deviation: _jsx(BarChart3, { className: "text-indigo-600", size: 14 }),
            order_status_change: _jsx(CheckCircle, { className: "text-emerald-600", size: 14 })
        };
        return icons[type] || _jsx(Zap, { className: "text-slate-600", size: 14 });
    };
    // Import standaard rules (gemigreerd van oude modules)
    const importDefaultRules = async () => {
        const confirmed = await showConfirm({
            title: t("planning.automationRules.alerts.importTitle", "Standaardregels importeren"),
            message: t("planning.automationRules.alerts.confirmImportDefaults", "Dit importeert vooraf geconfigureerde automation rules gebaseerd op de oude hardcoded logica. Doorgaan?"),
            confirmText: t("common.continue", "Doorgaan"),
            cancelText: t("common.cancel", "Annuleren"),
            tone: "warning",
        });
        if (!confirmed)
            return;
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
            await logActivity(auth.currentUser?.uid, "AUTOMATION_RULES_IMPORT", `${defaultRules.length} standaard automationregels geimporteerd`);
            notify(`✅ ${t("planning.automationRules.alerts.defaultsImported", "{{count}} standaard automation rules geïmporteerd!", { count: defaultRules.length })}`);
        }
        catch (error) {
            console.error("Import error:", error);
            notify(`❌ ${t("planning.automationRules.alerts.importFailed", "Fout bij importeren")}: ${error.message}`);
        }
        finally {
            setIsImporting(false);
        }
    };
    return (_jsxs("div", { className: "p-6 bg-slate-50 min-h-screen", children: [_jsx("div", { className: "bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-slate-200", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-3xl font-black text-slate-800", children: [t("planning.automationRules.titlePrefix", "Automation"), " ", _jsx("span", { className: "text-purple-600", children: t("planning.automationRules.titleAccent", "Rules") })] }), _jsx("p", { className: "text-sm text-slate-600 mt-1", children: t("planning.automationRules.subtitle", '"When X happens, then Y" - Automatiseer acties op basis van triggers') })] }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("div", { className: "px-4 py-2 bg-purple-50 border-2 border-purple-200 rounded-xl", children: [_jsx("div", { className: "text-xs text-purple-600 font-bold uppercase", children: t("planning.automationRules.activeRules", "Active Rules") }), _jsx("div", { className: "text-2xl font-black text-purple-600", children: rules.filter(r => r.enabled).length })] }), _jsxs("button", { onClick: importDefaultRules, disabled: isImporting, className: `flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-colors ${isImporting ? "opacity-50 cursor-not-allowed" : ""}`, title: t("planning.automationRules.importDefaultsTitle", "Importeer vooraf geconfigureerde rules van oude modules"), children: [_jsx(Upload, { size: 16 }), isImporting ? t("planning.automationRules.importing", "Importeren...") : t("planning.automationRules.importDefaults", "Importeer Defaults")] }), _jsxs("button", { onClick: () => {
                                        setEditingRule(null);
                                        setShowAddRule(!showAddRule);
                                    }, className: "flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-bold transition-colors", children: [_jsx(Plus, { size: 16 }), t("planning.automationRules.newRule", "Nieuwe Regel")] })] })] }) }), _jsxs("div", { className: "grid grid-cols-3 gap-6", children: [_jsxs("div", { className: "col-span-2 space-y-4", children: [showAddRule && (_jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-purple-200 p-6", children: [_jsx("h3", { className: "text-lg font-bold text-slate-800 mb-4", children: editingRule ? t("planning.automationRules.editRule", "Automation Regel Bewerken") : t("planning.automationRules.newAutomationRule", "Nieuwe Automation Regel") }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-slate-700 uppercase mb-2 block", children: t("planning.automationRules.ruleName", "Regel Naam") }), _jsx("input", { type: "text", placeholder: t("planning.automationRules.ruleNamePlaceholder", "Bijv: Auto-notify bij productie start"), value: newRule.name, onChange: (e) => setNewRule({ ...newRule, name: e.target.value }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-slate-700 uppercase mb-2 block", children: t("planning.automationRules.whenTrigger", "WHEN (Trigger)") }), _jsxs("select", { value: newRule.trigger.type, onChange: (e) => setNewRule({
                                                                    ...newRule,
                                                                    trigger: { type: e.target.value, conditions: {} }
                                                                }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm mb-2", children: [_jsxs("optgroup", { label: t("planning.automationRules.groups.capacityPlanning", "📊 Capaciteit & Planning"), children: [_jsx("option", { value: "capacity_shortage", children: t("planning.automationRules.triggers.capacity_shortage", "Capaciteitstekort") }), _jsx("option", { value: "low_efficiency", children: t("planning.automationRules.triggers.low_efficiency", "Lage Efficiency") }), _jsx("option", { value: "order_delay", children: t("planning.automationRules.triggers.order_delay", "Order Vertraging") }), _jsx("option", { value: "missing_operator", children: t("planning.automationRules.triggers.missing_operator", "Ontbrekende Operator") })] }), _jsxs("optgroup", { label: t("planning.automationRules.groups.workflow", "🔗 Dependencies & Workflow"), children: [_jsx("option", { value: "dependency_blocked", children: t("planning.automationRules.triggers.dependency_blocked", "Geblokkeerde Dependencies") }), _jsx("option", { value: "order_status_change", children: t("planning.automationRules.triggers.order_status_change", "Order Status Wijziging") })] }), _jsx("optgroup", { label: t("planning.automationRules.groups.quality", "🔍 Kwaliteit & Inspectie"), children: _jsx("option", { value: "inspection_overdue", children: t("planning.automationRules.triggers.inspection_overdue", "Inspectie Overdue") }) }), _jsx("optgroup", { label: t("planning.automationRules.groups.ai", "🤖 AI & Learning"), children: _jsx("option", { value: "standard_deviation", children: t("planning.automationRules.triggers.standard_deviation", "Standaard Afwijking") }) }), _jsx("optgroup", { label: t("planning.automationRules.groups.time", "⏰ Tijd & Scheduling"), children: _jsx("option", { value: "time_based", children: t("planning.automationRules.triggers.time_based", "Tijd-gebaseerd") }) })] }), newRule.trigger.type === "capacity_shortage" && (_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs text-slate-600", children: t("planning.automationRules.conditions.thresholdHours", "Tekort threshold (uren)") }), _jsx("input", { type: "number", placeholder: t("planning.automationRules.placeholders.example40", "Bijv: 40"), value: newRule.trigger.conditions?.threshold || "", onChange: (e) => setNewRule({
                                                                            ...newRule,
                                                                            trigger: {
                                                                                ...newRule.trigger,
                                                                                conditions: { threshold: parseInt(e.target.value) || 0 }
                                                                            }
                                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" })] })), newRule.trigger.type === "low_efficiency" && (_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs text-slate-600", children: t("planning.automationRules.conditions.minEfficiency", "Minimum efficiency (%)") }), _jsx("input", { type: "number", placeholder: t("planning.automationRules.placeholders.example80", "Bijv: 80"), value: newRule.trigger.conditions?.threshold || "", onChange: (e) => setNewRule({
                                                                            ...newRule,
                                                                            trigger: {
                                                                                ...newRule.trigger,
                                                                                conditions: { threshold: parseInt(e.target.value) || 80 }
                                                                            }
                                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" })] })), newRule.trigger.type === "order_delay" && (_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs text-slate-600", children: t("planning.automationRules.conditions.minDelayedOrders", "Minimum vertraagde orders") }), _jsx("input", { type: "number", placeholder: t("planning.automationRules.placeholders.example1", "Bijv: 1"), value: newRule.trigger.conditions?.minDelayedOrders || "", onChange: (e) => setNewRule({
                                                                            ...newRule,
                                                                            trigger: {
                                                                                ...newRule.trigger,
                                                                                conditions: { minDelayedOrders: parseInt(e.target.value) || 1 }
                                                                            }
                                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" })] })), newRule.trigger.type === "missing_operator" && (_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs text-slate-600", children: t("planning.automationRules.conditions.minMachinesWithoutOperator", "Minimum machines zonder operator") }), _jsx("input", { type: "number", placeholder: t("planning.automationRules.placeholders.example1", "Bijv: 1"), value: newRule.trigger.conditions?.threshold || "", onChange: (e) => setNewRule({
                                                                            ...newRule,
                                                                            trigger: {
                                                                                ...newRule.trigger,
                                                                                conditions: { threshold: parseInt(e.target.value) || 1 }
                                                                            }
                                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" })] })), newRule.trigger.type === "dependency_blocked" && (_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs text-slate-600", children: t("planning.automationRules.conditions.minBlockedOrders", "Minimum geblokkeerde orders") }), _jsx("input", { type: "number", placeholder: t("planning.automationRules.placeholders.example1", "Bijv: 1"), value: newRule.trigger.conditions?.threshold || "", onChange: (e) => setNewRule({
                                                                            ...newRule,
                                                                            trigger: {
                                                                                ...newRule.trigger,
                                                                                conditions: { threshold: parseInt(e.target.value) || 1 }
                                                                            }
                                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" })] })), newRule.trigger.type === "inspection_overdue" && (_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs text-slate-600", children: t("planning.automationRules.conditions.daysOverdue", "Dagen overdue") }), _jsx("input", { type: "number", placeholder: t("planning.automationRules.placeholders.example7", "Bijv: 7"), value: newRule.trigger.conditions?.daysOverdue || "", onChange: (e) => setNewRule({
                                                                            ...newRule,
                                                                            trigger: {
                                                                                ...newRule.trigger,
                                                                                conditions: {
                                                                                    ...newRule.trigger.conditions,
                                                                                    daysOverdue: parseInt(e.target.value) || 7
                                                                                }
                                                                            }
                                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" }), _jsx("label", { className: "text-xs text-slate-600", children: t("planning.automationRules.conditions.stationOptional", "Station (optioneel)") }), _jsx("input", { type: "text", placeholder: t("planning.automationRules.placeholders.exampleStation", "Bijv: NABEWERKING"), value: newRule.trigger.conditions?.station || "", onChange: (e) => setNewRule({
                                                                            ...newRule,
                                                                            trigger: {
                                                                                ...newRule.trigger,
                                                                                conditions: {
                                                                                    ...newRule.trigger.conditions,
                                                                                    station: e.target.value
                                                                                }
                                                                            }
                                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" })] })), newRule.trigger.type === "standard_deviation" && (_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs text-slate-600", children: t("planning.automationRules.conditions.minSamples", "Minimum samples") }), _jsx("input", { type: "number", placeholder: t("planning.automationRules.placeholders.example5", "Bijv: 5"), value: newRule.trigger.conditions?.minSamples || "", onChange: (e) => setNewRule({
                                                                            ...newRule,
                                                                            trigger: {
                                                                                ...newRule.trigger,
                                                                                conditions: {
                                                                                    ...newRule.trigger.conditions,
                                                                                    minSamples: parseInt(e.target.value) || 5
                                                                                }
                                                                            }
                                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" }), _jsx("label", { className: "text-xs text-slate-600", children: t("planning.automationRules.conditions.minDeviation", "Minimum afwijking (%)") }), _jsx("input", { type: "number", placeholder: t("planning.automationRules.placeholders.example5", "Bijv: 5"), value: newRule.trigger.conditions?.minDeviation || "", onChange: (e) => setNewRule({
                                                                            ...newRule,
                                                                            trigger: {
                                                                                ...newRule.trigger,
                                                                                conditions: {
                                                                                    ...newRule.trigger.conditions,
                                                                                    minDeviation: parseInt(e.target.value) || 5
                                                                                }
                                                                            }
                                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" })] })), newRule.trigger.type === "order_status_change" && (_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs text-slate-600", children: t("planning.automationRules.conditions.targetStatus", "Target status") }), _jsxs("select", { value: newRule.trigger.conditions?.targetStatus || "", onChange: (e) => setNewRule({
                                                                            ...newRule,
                                                                            trigger: {
                                                                                ...newRule.trigger,
                                                                                conditions: { targetStatus: e.target.value }
                                                                            }
                                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm", children: [_jsx("option", { value: "planned", children: t("planning.automationRules.statuses.planned", "Gepland") }), _jsx("option", { value: "in_production", children: t("planning.automationRules.statuses.in_production", "In Productie") }), _jsx("option", { value: "quality_check", children: t("planning.automationRules.statuses.quality_check", "Controle") }), _jsx("option", { value: "ready_to_ship", children: t("planning.automationRules.statuses.ready_to_ship", "Verzendklaar") }), _jsx("option", { value: "shipped", children: t("planning.automationRules.statuses.shipped", "Verzonden") }), _jsx("option", { value: "completed", children: t("planning.automationRules.statuses.completed", "Voltooid") })] })] }))] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-slate-700 uppercase mb-2 block", children: t("planning.automationRules.thenAction", "THEN (Action)") }), _jsxs("select", { value: newRule.action.type, onChange: (e) => setNewRule({
                                                                    ...newRule,
                                                                    action: { type: e.target.value, params: {} }
                                                                }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm mb-2", children: [_jsx("option", { value: "send_notification", children: t("planning.automationRules.actions.send_notification", "Stuur Notificatie") }), _jsx("option", { value: "send_resend_email", children: t("planning.automationRules.actions.send_resend_email", "Stuur E-mail (Template)") }), _jsx("option", { value: "create_log", children: t("planning.automationRules.actions.create_log", "Maak Log Entry") }), _jsx("option", { value: "inspection_reminder", children: t("planning.automationRules.actions.inspection_reminder", "Stuur Inspectie Reminder") }), _jsx("option", { value: "auto_learning_update", children: t("planning.automationRules.actions.auto_learning_update", "Update Standaarden (AI)") }), _jsx("option", { value: "update_status", children: t("planning.automationRules.actions.update_status", "Update Status") }), _jsx("option", { value: "assign_operator", children: t("planning.automationRules.actions.assign_operator", "Wijs Operator Toe") }), _jsx("option", { value: "reschedule_order", children: t("planning.automationRules.actions.reschedule_order", "Herplan Order") })] }), newRule.action.type === "send_resend_email" && (_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs text-slate-600", children: t("planning.automationRules.emailTo", "Ontvanger(s) (komma gescheiden)") }), _jsx("input", { type: "text", placeholder: t("planning.automationRules.emailToPlaceholder", "bijv. manager@bedrijf.nl"), value: newRule.action.params?.to || "", onChange: (e) => setNewRule({
                                                                            ...newRule,
                                                                            action: { ...newRule.action, params: { ...newRule.action.params, to: e.target.value } }
                                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" }), _jsx("label", { className: "text-xs text-slate-600", children: t("planning.automationRules.emailTemplate", "Kies een Template") }), _jsxs("select", { value: newRule.action.params?.templateId || "", onChange: (e) => setNewRule({
                                                                            ...newRule,
                                                                            action: { ...newRule.action, params: { ...newRule.action.params, templateId: e.target.value } }
                                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm", children: [_jsx("option", { value: "", disabled: true, children: t("planning.automationRules.selectTemplate", "-- Selecteer een template --") }), emailTemplates.map(tpl => (_jsx("option", { value: tpl.id, children: tpl.name }, tpl.id)))] }), _jsx("p", { className: "text-xs text-slate-500", children: t("planning.automationRules.emailTemplateHelp", "Templates beheer je via het 'E-mail Beheer' dashboard.") })] })), newRule.action.type === "send_notification" && (_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs text-slate-600", children: t("planning.automationRules.severity", "Severity") }), _jsxs("select", { value: newRule.action.params?.severity || "info", onChange: (e) => setNewRule({
                                                                            ...newRule,
                                                                            action: {
                                                                                ...newRule.action,
                                                                                params: { ...newRule.action.params, severity: e.target.value }
                                                                            }
                                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm", children: [_jsx("option", { value: "info", children: t("planning.automationRules.severities.info", "Info") }), _jsx("option", { value: "warning", children: t("planning.automationRules.severities.warning", "Warning") }), _jsx("option", { value: "critical", children: t("planning.automationRules.severities.critical", "Critical") }), _jsx("option", { value: "alert", children: t("planning.automationRules.severities.alert", "Alert") })] }), _jsx("label", { className: "text-xs text-slate-600", children: t("planning.automationRules.customMessageOptional", "Custom bericht (optioneel)") }), _jsx("input", { type: "text", placeholder: t("planning.automationRules.leaveEmptyAutoMessage", "Laat leeg voor auto bericht"), value: newRule.action.params?.message || "", onChange: (e) => setNewRule({
                                                                            ...newRule,
                                                                            action: {
                                                                                ...newRule.action,
                                                                                params: { ...newRule.action.params, message: e.target.value }
                                                                            }
                                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" })] })), newRule.action.type === "auto_learning_update" && (_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs text-slate-600", children: t("planning.automationRules.learningRate", "Learning Rate (0-1)") }), _jsx("input", { type: "number", step: "0.1", placeholder: t("planning.automationRules.placeholders.exampleLearningRate", "Bijv: 0.3"), value: newRule.action.params?.learningRate || "", onChange: (e) => setNewRule({
                                                                            ...newRule,
                                                                            action: {
                                                                                ...newRule.action,
                                                                                params: {
                                                                                    ...newRule.action.params,
                                                                                    learningRate: parseFloat(e.target.value) || 0.3
                                                                                }
                                                                            }
                                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" }), _jsxs("label", { className: "flex items-center gap-2", children: [_jsx("input", { type: "checkbox", checked: newRule.action.params?.dryRun || false, onChange: (e) => setNewRule({
                                                                                    ...newRule,
                                                                                    action: {
                                                                                        ...newRule.action,
                                                                                        params: {
                                                                                            ...newRule.action.params,
                                                                                            dryRun: e.target.checked
                                                                                        }
                                                                                    }
                                                                                }) }), _jsx("span", { className: "text-xs text-slate-600", children: t("planning.automationRules.dryRun", "Dry Run (alleen simuleren)") })] })] })), newRule.action.type === "create_log" && (_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs text-slate-600", children: t("planning.automationRules.logMessageOptional", "Log bericht (optioneel)") }), _jsx("input", { type: "text", placeholder: t("planning.automationRules.leaveEmptyAutoMessage", "Laat leeg voor auto bericht"), value: newRule.action.params?.logMessage || "", onChange: (e) => setNewRule({
                                                                            ...newRule,
                                                                            action: {
                                                                                ...newRule.action,
                                                                                params: { ...newRule.action.params, logMessage: e.target.value }
                                                                            }
                                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" })] }))] })] }), _jsxs("div", { className: "pt-2 border-t border-slate-200", children: [_jsx("label", { className: "text-xs font-bold text-slate-700 uppercase mb-2 block", children: t("planning.automationRules.debounceMinutes", "Debounce (minuten)") }), _jsx("input", { type: "number", placeholder: t("planning.automationRules.placeholders.example60", "Bijv: 60"), value: newRule.debounceMinutes || "", onChange: (e) => setNewRule({
                                                            ...newRule,
                                                            debounceMinutes: parseInt(e.target.value) || 60
                                                        }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" }), _jsx("p", { className: "text-xs text-slate-500 mt-1", children: t("planning.automationRules.debounceHelp", "Voorkomt dubbele executions binnen deze tijd") })] }), _jsxs("div", { className: "flex gap-2 pt-4 border-t-2 border-slate-200", children: [_jsx("button", { onClick: saveRule, className: "px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-bold transition-colors", children: editingRule ? t("planning.automationRules.saveChanges", "Wijzigingen Opslaan") : t("planning.automationRules.saveRule", "Regel Opslaan") }), _jsx("button", { onClick: () => {
                                                            setShowAddRule(false);
                                                            setEditingRule(null);
                                                        }, className: "px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold transition-colors", children: t("planning.automationRules.cancel", "Annuleren") })] })] })] })), _jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200", children: [_jsx("div", { className: "p-4 border-b-2 border-slate-200 bg-slate-50", children: _jsx("h3", { className: "text-sm font-bold text-slate-800", children: t("planning.automationRules.rulesHeader", "Automation Regels") }) }), _jsx("div", { className: "p-4 space-y-3", children: rules.length === 0 ? (_jsx("div", { className: "text-center py-12 text-slate-400", children: t("planning.automationRules.noRulesConfigured", "Nog geen automation rules geconfigureerd") })) : (rules.map(rule => (_jsxs("div", { className: `p-4 rounded-xl border-2 transition-all ${rule.enabled
                                                ? "border-purple-200 bg-purple-50"
                                                : "border-slate-200 bg-slate-50 opacity-60"}`, children: [_jsxs("div", { className: "flex items-start justify-between mb-3", children: [_jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "font-bold text-sm text-slate-800 mb-1 flex items-center gap-2", children: [rule.name, rule.debounceMinutes && (_jsx("span", { className: "text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-normal", children: t("planning.automationRules.debounceBadge", "{{count}}min debounce", { count: rule.debounceMinutes }) }))] }), _jsxs("div", { className: "flex items-center gap-2 text-xs flex-wrap", children: [_jsxs("span", { className: "px-2 py-1 bg-blue-100 text-blue-700 rounded font-bold flex items-center gap-1", children: [getTriggerIcon(rule.trigger.type), t("planning.automationRules.when", "WHEN")] }), _jsx("span", { className: "text-slate-600", children: getTriggerLabel(rule.trigger) }), _jsx(ArrowRight, { size: 12, className: "text-slate-400" }), _jsx("span", { className: "px-2 py-1 bg-emerald-100 text-emerald-700 rounded font-bold", children: t("planning.automationRules.then", "THEN") }), _jsx("span", { className: "text-slate-600", children: getActionLabel(rule.action) })] }), rule.trigger.conditions && Object.keys(rule.trigger.conditions).length > 0 && (_jsx("div", { className: "mt-2 text-xs text-slate-500", children: getConditionSummary(rule) }))] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => handleEditRule(rule), className: "p-1 hover:bg-blue-100 rounded-lg transition-colors", title: t("planning.automationRules.edit", "Bewerken"), children: _jsx(Edit, { className: "text-blue-600", size: 14 }) }), _jsx("button", { onClick: () => testRule(rule), disabled: isTesting, className: `p-1 rounded-lg transition-colors ${isTesting
                                                                        ? "bg-slate-100 cursor-not-allowed"
                                                                        : "hover:bg-blue-100"}`, title: t("planning.automationRules.testRun", "Test uitvoeren"), children: _jsx(Play, { className: isTesting ? "text-slate-400" : "text-blue-600", size: 14 }) }), _jsx("button", { onClick: () => toggleRule(rule.id, rule.enabled), className: `p-1 rounded-lg transition-colors ${rule.enabled
                                                                        ? "bg-emerald-100 hover:bg-emerald-200"
                                                                        : "bg-slate-200 hover:bg-slate-300"}`, children: rule.enabled ? (_jsx(CheckCircle, { className: "text-emerald-600", size: 16 })) : (_jsx(XCircle, { className: "text-slate-500", size: 16 })) }), _jsx("button", { onClick: () => deleteRule(rule.id), className: "p-1 hover:bg-red-100 rounded-lg transition-colors", children: _jsx(Trash2, { className: "text-red-600", size: 14 }) })] })] }), _jsxs("div", { className: "flex items-center gap-4 text-xs text-slate-500", children: [_jsx("span", { children: t("planning.automationRules.executedCount", "Uitgevoerd: {{count}}x", { count: rule.executionCount || 0 }) }), rule.lastExecuted && (_jsxs("span", { children: [t("planning.automationRules.lastExecuted", "Laatst"), ": ", new Date(rule.lastExecuted.seconds * 1000).toLocaleString('nl-NL', {
                                                                    day: '2-digit',
                                                                    month: '2-digit',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit'
                                                                })] }))] })] }, rule.id)))) })] })] }), _jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200", children: [_jsx("div", { className: "p-4 border-b-2 border-slate-200 bg-slate-50", children: _jsx("h3", { className: "text-sm font-bold text-slate-800", children: t("planning.automationRules.executionHistory", "Execution History") }) }), _jsx("div", { className: "p-4 space-y-2 max-h-[700px] overflow-y-auto", children: executions.length === 0 ? (_jsx("div", { className: "text-center py-12 text-slate-400 text-sm", children: t("planning.automationRules.noExecutions", "Nog geen executions") })) : (executions.map(exec => (_jsxs("div", { className: `p-3 rounded-lg border ${exec.status === "success"
                                        ? "border-emerald-200 bg-emerald-50"
                                        : "border-red-200 bg-red-50"}`, children: [_jsxs("div", { className: "flex items-start justify-between mb-1", children: [_jsx("div", { className: "text-xs font-bold text-slate-800", children: exec.ruleName }), exec.status === "success" ? (_jsx(CheckCircle, { className: "text-emerald-600", size: 12 })) : (_jsx(XCircle, { className: "text-red-600", size: 12 }))] }), _jsx("div", { className: "text-xs text-slate-600", children: exec.message || t("planning.automationRules.noMessage", "No message") }), exec.executedAt && (_jsx("div", { className: "text-xs text-slate-400 mt-1", children: new Date(exec.executedAt.seconds * 1000).toLocaleString('nl-NL', {
                                                day: '2-digit',
                                                month: '2-digit',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            }) }))] }, exec.id)))) })] })] }), _jsx("div", { className: "mt-6 bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl p-6 border-2 border-purple-200", children: _jsxs("div", { className: "flex items-start gap-4", children: [_jsx(Zap, { className: "text-purple-600 flex-shrink-0", size: 24 }), _jsxs("div", { children: [_jsx("h3", { className: "text-lg font-bold text-slate-800 mb-2", children: t("planning.automationRules.infoTitle", "Centralized Automation Engine 🚀") }), _jsxs("div", { className: "text-sm text-slate-700 space-y-1", children: [_jsxs("p", { children: ["\u2705 ", _jsx("strong", { children: t("planning.automationRules.info.migratedLogicLabel", "Gemigreerde Logica:") }), " ", t("planning.automationRules.info.migratedLogicText", "Alle hardcoded automation rules zijn nu data-driven")] }), _jsxs("p", { children: ["\u2705 ", _jsx("strong", { children: t("planning.automationRules.info.triggerTypesLabel", "8 Trigger Types:") }), " ", t("planning.automationRules.info.triggerTypesText", "Capacity shortage, Low efficiency, Order delay, Missing operator, Dependency blocked, Inspection overdue, Standard deviation, Status change")] }), _jsxs("p", { children: ["\u2705 ", _jsx("strong", { children: t("planning.automationRules.info.actionTypesLabel", "7 Action Types:") }), " ", t("planning.automationRules.info.actionTypesText", "Notificaties, Logs, Inspectie reminders, AI learning updates, Status updates, Operator toewijzingen, Herplanningen")] }), _jsxs("p", { children: ["\u2705 ", _jsx("strong", { children: t("planning.automationRules.info.smartDebouncingLabel", "Smart Debouncing:") }), " ", t("planning.automationRules.info.smartDebouncingText", "Voorkomt dubbele executions binnen geconfigureerde tijd")] }), _jsxs("p", { children: ["\u2705 ", _jsx("strong", { children: t("planning.automationRules.info.realTimeTestingLabel", "Real-time Testing:") }), " ", t("planning.automationRules.info.realTimeTestingText", "Test elke regel direct met actuele data via Play knop")] }), _jsxs("p", { children: ["\u2705 ", _jsx("strong", { children: t("planning.automationRules.info.executionHistoryLabel", "Execution History:") }), " ", t("planning.automationRules.info.executionHistoryText", "Volledige logging van alle uitgevoerde rules")] })] }), _jsxs("div", { className: "mt-3 p-3 bg-white/50 rounded-lg border border-purple-200", children: [_jsx("p", { className: "text-xs font-bold text-purple-700 mb-1", children: t("planning.automationRules.info.migrationSuccessTitle", "🎯 Migratie Succesvol:") }), _jsxs("p", { className: "text-xs text-slate-600", children: [_jsx("strong", { children: "NotificationRulesView:" }), " ", t("planning.automationRules.info.notificationRulesViewText", "5 trigger types → Automation Rules"), _jsx("br", {}), _jsx("strong", { children: "WorkstationHub:" }), " ", t("planning.automationRules.info.workstationHubText", "Inspection reminders → Automation Rules"), _jsx("br", {}), _jsx("strong", { children: "autoLearningService:" }), " ", t("planning.automationRules.info.autoLearningServiceText", "AI standard updates → Automation Rules")] })] })] })] }) })] }));
};
export default AutomationRulesView;
