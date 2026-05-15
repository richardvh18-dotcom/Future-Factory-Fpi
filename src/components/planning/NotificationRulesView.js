import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect } from "react";
import { Bell, Users, CheckCircle, XCircle, TrendingUp, Trash2, Plus } from "lucide-react";
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useNotifications } from "../../contexts/NotificationContext";
/**
 * NotificationRulesView - Configure automated notifications
 * Triggers notifications based on system events
 */
const NotificationRulesView = () => {
    const { showConfirm, notify } = useNotifications();
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
        const unsubRules = onSnapshot(collection(db, ...PATHS.NOTIFICATION_RULES), (snapshot) => {
            const rulesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setRules(rulesData);
        });
        // Load recent notifications
        const unsubNotifications = onSnapshot(collection(db, ...PATHS.NOTIFICATION_LOGS), (snapshot) => {
            const notifData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setNotifications(notifData.slice(0, 50)); // Last 50
        });
        // Load occupancy for monitoring
        const unsubOccupancy = onSnapshot(collection(db, ...PATHS.OCCUPANCY), (snapshot) => {
            setOccupancy(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        // Load planning for monitoring
        const unsubPlanning = onSnapshot(collection(db, ...PATHS.PLANNING), (snapshot) => {
            setPlanning(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => {
            unsubRules();
            unsubNotifications();
            unsubOccupancy();
            unsubPlanning();
        };
    }, []);
    // Monitor and trigger notifications
    useEffect(() => {
        if (rules.length === 0)
            return;
        rules.forEach(rule => {
            if (!rule.enabled)
                return;
            checkRule(rule);
        });
    }, [occupancy, planning, rules]);
    // Check if rule conditions are met
    const checkRule = async (rule) => {
        let shouldTrigger = false;
        let message = "";
        let severity = "info";
        switch (rule.trigger) {
            case "capacity_shortage": {
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
            }
            case "low_efficiency": {
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
            }
            case "order_delay": {
                // Check for orders past planned date
                const now = new Date();
                const delayedOrders = planning.filter(p => {
                    if (!p.plannedDate || p.status === "shipped")
                        return false;
                    const planDate = new Date(p.plannedDate.seconds * 1000);
                    return planDate < now;
                });
                if (delayedOrders.length > 0) {
                    shouldTrigger = true;
                    message = `🕐 ${delayedOrders.length} orders zijn vertraagd`;
                    severity = "critical";
                }
                break;
            }
            case "missing_operator": {
                // Check for machines without operators
                const machinesWithoutOperators = occupancy.filter(o => !o.operatorName || o.operatorName === "");
                if (machinesWithoutOperators.length >= rule.threshold) {
                    shouldTrigger = true;
                    message = `👤 ${machinesWithoutOperators.length} machines zonder operator`;
                    severity = "warning";
                }
                break;
            }
            case "dependency_blocked": {
                // Check for orders blocked by dependencies
                const blockedOrders = planning.filter(p => {
                    if (!p.dependencies || p.dependencies.length === 0)
                        return false;
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
        }
        if (shouldTrigger) {
            // Check if we already sent this notification recently (debounce)
            const recentSimilar = notifications.find(n => n.ruleId === rule.id &&
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
        await logActivity(auth.currentUser?.uid, "NOTIFICATION_CREATE", `Automatische notificatie aangemaakt via regel ${notification.ruleName || notification.ruleId || "onbekend"}`);
    };
    // Add new rule
    const addRule = async () => {
        if (!newRule.name) {
            notify("Geef de regel een naam");
            return;
        }
        await addDoc(collection(db, ...PATHS.NOTIFICATION_RULES), {
            ...newRule,
            createdAt: serverTimestamp()
        });
        await logActivity(auth.currentUser?.uid, "NOTIFICATION_RULE_CREATE", `Notificatieregel aangemaakt: ${newRule.name} (${newRule.trigger})`);
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
        const confirmed = await showConfirm({
            title: "Notificatieregel verwijderen",
            message: "Weet je zeker dat je deze regel wilt verwijderen?",
            confirmText: "Verwijderen",
            cancelText: "Annuleren",
            tone: "danger",
        });
        if (!confirmed)
            return;
        await deleteDoc(doc(db, ...PATHS.NOTIFICATION_RULES, ruleId));
        await logActivity(auth.currentUser?.uid, "NOTIFICATION_RULE_DELETE", `Notificatieregel verwijderd: ${ruleId}`);
    };
    // Toggle rule
    const toggleRule = async (ruleId, currentState) => {
        await updateDoc(doc(db, ...PATHS.NOTIFICATION_RULES, ruleId), {
            enabled: !currentState
        });
        await logActivity(auth.currentUser?.uid, "NOTIFICATION_RULE_TOGGLE", `Notificatieregel ${ruleId} ${!currentState ? "ingeschakeld" : "uitgeschakeld"}`);
    };
    // Mark notification as read
    const markAsRead = async (notifId) => {
        await updateDoc(doc(db, ...PATHS.NOTIFICATION_LOGS, notifId), {
            read: true
        });
        await logActivity(auth.currentUser?.uid, "NOTIFICATION_READ", `Notificatie gemarkeerd als gelezen: ${notifId}`);
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
    return (_jsxs("div", { className: "p-6 bg-slate-50 min-h-screen", children: [_jsx("div", { className: "bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-slate-200", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-3xl font-black text-slate-800", children: ["Notification ", _jsx("span", { className: "text-blue-600", children: "Rules" })] }), _jsx("p", { className: "text-sm text-slate-600 mt-1", children: "Configureer geautomatiseerde notificaties voor systeem events" })] }), _jsxs("button", { onClick: () => setShowAddRule(!showAddRule), className: "flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold transition-colors", children: [_jsx(Plus, { size: 16 }), "Nieuwe Regel"] })] }) }), _jsxs("div", { className: "grid grid-cols-2 gap-6", children: [_jsx("div", { className: "space-y-4", children: _jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200", children: [_jsx("div", { className: "p-4 border-b-2 border-slate-200 bg-slate-50", children: _jsx("h3", { className: "text-sm font-bold text-slate-800", children: "Actieve Regels" }) }), _jsxs("div", { className: "p-4 space-y-3 max-h-[600px] overflow-y-auto", children: [showAddRule && (_jsxs("div", { className: "p-4 bg-blue-50 border-2 border-blue-200 rounded-xl space-y-3", children: [_jsx("input", { type: "text", placeholder: "Regel naam...", value: newRule.name, onChange: (e) => setNewRule({ ...newRule, name: e.target.value }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" }), _jsxs("select", { value: newRule.trigger, onChange: (e) => setNewRule({ ...newRule, trigger: e.target.value }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm", children: [_jsx("option", { value: "capacity_shortage", children: "Capaciteitstekort" }), _jsx("option", { value: "low_efficiency", children: "Lage Efficiency" }), _jsx("option", { value: "order_delay", children: "Order Vertraging" }), _jsx("option", { value: "missing_operator", children: "Ontbrekende Operator" }), _jsx("option", { value: "dependency_blocked", children: "Geblokkeerde Dependencies" })] }), _jsx("input", { type: "number", placeholder: "Threshold...", value: newRule.threshold, onChange: (e) => setNewRule({ ...newRule, threshold: parseInt(e.target.value) }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" }), _jsxs("select", { value: newRule.recipients, onChange: (e) => setNewRule({ ...newRule, recipients: e.target.value }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm", children: [_jsx("option", { value: "all", children: "Iedereen" }), _jsx("option", { value: "admins", children: "Alleen Admins" }), _jsx("option", { value: "teamleaders", children: "Teamleaders" }), _jsx("option", { value: "engineers", children: "Engineers" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: addRule, className: "px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors", children: "Opslaan" }), _jsx("button", { onClick: () => setShowAddRule(false), className: "px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors", children: "Annuleren" })] })] })), rules.length === 0 ? (_jsx("div", { className: "text-center py-12 text-slate-400", children: "Nog geen notification rules" })) : (rules.map(rule => (_jsxs("div", { className: `p-4 rounded-xl border-2 transition-all ${rule.enabled
                                                ? "border-blue-200 bg-blue-50"
                                                : "border-slate-200 bg-slate-50 opacity-60"}`, children: [_jsxs("div", { className: "flex items-start justify-between mb-2", children: [_jsxs("div", { children: [_jsx("div", { className: "font-bold text-sm text-slate-800", children: rule.name }), _jsx("div", { className: "text-xs text-slate-500 mt-1", children: getTriggerLabel(rule.trigger) })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => toggleRule(rule.id, rule.enabled), className: `p-1 rounded-lg transition-colors ${rule.enabled
                                                                        ? "bg-emerald-100 hover:bg-emerald-200"
                                                                        : "bg-slate-200 hover:bg-slate-300"}`, children: rule.enabled ? (_jsx(CheckCircle, { className: "text-emerald-600", size: 16 })) : (_jsx(XCircle, { className: "text-slate-500", size: 16 })) }), _jsx("button", { onClick: () => deleteRule(rule.id), className: "p-1 hover:bg-red-100 rounded-lg transition-colors", children: _jsx(Trash2, { className: "text-red-600", size: 14 }) })] })] }), _jsxs("div", { className: "flex items-center gap-4 text-xs", children: [_jsxs("div", { className: "flex items-center gap-1 text-slate-600", children: [_jsx(TrendingUp, { size: 12 }), _jsxs("span", { children: ["Threshold: ", rule.threshold] })] }), _jsxs("div", { className: "flex items-center gap-1 text-slate-600", children: [_jsx(Users, { size: 12 }), _jsx("span", { children: rule.recipients })] })] })] }, rule.id))))] })] }) }), _jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200", children: [_jsx("div", { className: "p-4 border-b-2 border-slate-200 bg-slate-50", children: _jsx("h3", { className: "text-sm font-bold text-slate-800", children: "Recente Notificaties" }) }), _jsx("div", { className: "p-4 space-y-2 max-h-[600px] overflow-y-auto", children: notifications.length === 0 ? (_jsx("div", { className: "text-center py-12 text-slate-400", children: "Geen notificaties" })) : (notifications.map(notif => (_jsxs("div", { className: `p-3 rounded-xl border-2 ${getSeverityColor(notif.severity)} ${notif.read ? "opacity-50" : ""}`, children: [_jsxs("div", { className: "flex items-start justify-between mb-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Bell, { size: 14 }), _jsx("div", { className: "text-xs font-bold", children: notif.ruleName })] }), !notif.read && (_jsx("button", { onClick: () => markAsRead(notif.id), className: "text-xs underline hover:no-underline", children: "Markeer gelezen" }))] }), _jsx("div", { className: "text-xs", children: notif.message }), notif.createdAt && (_jsx("div", { className: "text-xs opacity-60 mt-2", children: new Date(notif.createdAt.seconds * 1000).toLocaleString('nl-NL') }))] }, notif.id)))) })] })] })] }));
};
export default NotificationRulesView;
