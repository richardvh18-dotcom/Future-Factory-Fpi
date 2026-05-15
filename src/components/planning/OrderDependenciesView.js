import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import React, { useState, useEffect, useMemo } from "react";
import { GitBranch, Plus, Trash2, AlertTriangle, Clock, CheckCircle, Link, TrendingUp } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { addOrderDependency, removeOrderDependency } from "../../services/planningSecurityService";
import { useNotifications } from '../../contexts/NotificationContext';
/**
 * OrderDependenciesView - Manage order dependencies and critical path
 * Shows which orders block others and calculates critical path
 */
const OrderDependenciesView = () => {
    const { notify } = useNotifications();
    const [orders, setOrders] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showAddDependency, setShowAddDependency] = useState(false);
    const [potentialDependency, setPotentialDependency] = useState("");
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const unsubOrders = onSnapshot(collection(db, ...PATHS.PLANNING), (snapshot) => {
            const ordersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setOrders(ordersData);
            setLoading(false);
        });
        return () => unsubOrders();
    }, []);
    // Get dependencies for an order
    const getDependencies = (order) => {
        return (order.dependencies || []).map(depId => orders.find(o => o.id === depId)).filter(Boolean);
    };
    // Get blocked orders (orders that depend on this one)
    const getBlockedOrders = (orderId) => {
        return orders.filter(o => (o.dependencies || []).includes(orderId));
    };
    // Calculate critical path
    const criticalPath = useMemo(() => {
        if (orders.length === 0)
            return [];
        // Build dependency graph
        const graph = {};
        orders.forEach(order => {
            graph[order.id] = {
                order,
                dependencies: order.dependencies || [],
                duration: order.estimatedHours || 8,
                earliestStart: 0,
                latestStart: 0
            };
        });
        // Calculate earliest start times (forward pass)
        const calculateEarliestStart = (orderId, visited = new Set()) => {
            if (visited.has(orderId))
                return graph[orderId].earliestStart;
            visited.add(orderId);
            const node = graph[orderId];
            if (!node)
                return 0;
            let maxDependencyFinish = 0;
            node.dependencies.forEach(depId => {
                const depEarliestFinish = calculateEarliestStart(depId, visited) + graph[depId]?.duration || 0;
                maxDependencyFinish = Math.max(maxDependencyFinish, depEarliestFinish);
            });
            node.earliestStart = maxDependencyFinish;
            return node.earliestStart;
        };
        orders.forEach(order => calculateEarliestStart(order.id));
        // Find project completion time
        const projectEndTime = Math.max(...Object.values(graph).map(n => n.earliestStart + n.duration));
        // Calculate latest start times (backward pass)
        const calculateLatestStart = (orderId, visited = new Set()) => {
            if (visited.has(orderId))
                return graph[orderId].latestStart;
            visited.add(orderId);
            const node = graph[orderId];
            if (!node)
                return 0;
            const blockedOrders = getBlockedOrders(orderId);
            if (blockedOrders.length === 0) {
                // No successors, can start as late as project end minus duration
                node.latestStart = projectEndTime - node.duration;
            }
            else {
                // Must finish before earliest successor starts
                let minSuccessorStart = Infinity;
                blockedOrders.forEach(blocked => {
                    calculateLatestStart(blocked.id, visited);
                    const blockedNode = graph[blocked.id];
                    minSuccessorStart = Math.min(minSuccessorStart, blockedNode.latestStart);
                });
                node.latestStart = minSuccessorStart - node.duration;
            }
            return node.latestStart;
        };
        orders.forEach(order => calculateLatestStart(order.id));
        // Identify critical path (slack = 0)
        const critical = orders.filter(order => {
            const node = graph[order.id];
            const slack = node.latestStart - node.earliestStart;
            return Math.abs(slack) < 0.01; // floating point tolerance
        });
        return critical;
    }, [orders]);
    // Add dependency
    const addDependency = async () => {
        if (!selectedOrder || !potentialDependency)
            return;
        // Check for circular dependencies
        if (wouldCreateCircular(selectedOrder.id, potentialDependency)) {
            notify("⚠️ Dit zou een circulaire dependency cre\u00ebren!");
            return;
        }
        await addOrderDependency({
            orderId: selectedOrder.id,
            dependencyId: potentialDependency,
        });
        await logActivity(auth.currentUser?.uid, "ORDER_DEPENDENCY_ADD", `Dependency toegevoegd: ${selectedOrder.id} <- ${potentialDependency}`);
        setPotentialDependency("");
        setShowAddDependency(false);
    };
    // Remove dependency
    const removeDependency = async (orderId, depId) => {
        await removeOrderDependency({
            orderId,
            dependencyId: depId,
        });
        await logActivity(auth.currentUser?.uid, "ORDER_DEPENDENCY_REMOVE", `Dependency verwijderd: ${orderId} -/-> ${depId}`);
    };
    // Check if adding dependency would create circular reference
    const wouldCreateCircular = (orderId, newDepId, visited = new Set()) => {
        if (orderId === newDepId)
            return true;
        if (visited.has(newDepId))
            return false;
        visited.add(newDepId);
        const newDepOrder = orders.find(o => o.id === newDepId);
        if (!newDepOrder || !newDepOrder.dependencies)
            return false;
        return newDepOrder.dependencies.some(depId => wouldCreateCircular(orderId, depId, visited));
    };
    // Get status icon
    const getStatusIcon = (order) => {
        const deps = getDependencies(order);
        const allDepsComplete = deps.every(d => d.status === "shipped");
        if (order.status === "shipped")
            return _jsx(CheckCircle, { className: "text-emerald-600", size: 20 });
        if (!allDepsComplete)
            return _jsx(Clock, { className: "text-amber-600", size: 20 });
        return _jsx(TrendingUp, { className: "text-blue-600", size: 20 });
    };
    if (loading) {
        return (_jsx("div", { className: "flex items-center justify-center p-12", children: _jsx("div", { className: "animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" }) }));
    }
    return (_jsxs("div", { className: "p-6 bg-slate-50 min-h-screen", children: [_jsx("div", { className: "bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-slate-200", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-3xl font-black text-slate-800", children: ["Order ", _jsx("span", { className: "text-purple-600", children: "Dependencies" })] }), _jsx("p", { className: "text-sm text-slate-600 mt-1", children: "Beheer afhankelijkheden en critical path tussen orders" })] }), _jsx("div", { className: "flex items-center gap-4", children: _jsxs("div", { className: "px-4 py-2 bg-red-50 border-2 border-red-200 rounded-xl", children: [_jsx("div", { className: "text-xs text-red-600 font-bold uppercase tracking-wider", children: "Critical Path" }), _jsx("div", { className: "text-2xl font-black text-red-600", children: criticalPath.length }), _jsx("div", { className: "text-xs text-red-500 mt-1", children: "orders" })] }) })] }) }), _jsxs("div", { className: "grid grid-cols-2 gap-6", children: [_jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200", children: [_jsx("div", { className: "p-4 border-b-2 border-slate-200 bg-slate-50", children: _jsx("h3", { className: "text-sm font-bold text-slate-800", children: "Orders" }) }), _jsx("div", { className: "p-4 max-h-[700px] overflow-y-auto space-y-2", children: orders.map(order => {
                                    const deps = getDependencies(order);
                                    const blocked = getBlockedOrders(order.id);
                                    const isCritical = criticalPath.some(cp => cp.id === order.id);
                                    const isSelected = selectedOrder?.id === order.id;
                                    return (_jsxs("div", { onClick: () => setSelectedOrder(order), className: `p-4 rounded-xl border-2 cursor-pointer transition-all ${isSelected
                                            ? "border-purple-500 bg-purple-50"
                                            : isCritical
                                                ? "border-red-300 bg-red-50 hover:border-red-400"
                                                : "border-slate-200 bg-white hover:border-slate-300"}`, children: [_jsxs("div", { className: "flex items-start justify-between mb-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [getStatusIcon(order), _jsxs("div", { children: [_jsx("div", { className: "font-bold text-sm text-slate-800", children: order.orderId || order.item }), _jsx("div", { className: "text-xs text-slate-500", children: order.itemCode || order.extraCode })] })] }), isCritical && (_jsx("span", { className: "px-2 py-1 bg-red-500 text-white text-xs font-bold rounded", children: "CRITICAL" }))] }), _jsxs("div", { className: "flex items-center gap-4 text-xs", children: [_jsxs("div", { className: "flex items-center gap-1 text-amber-600", children: [_jsx(Link, { size: 12 }), _jsxs("span", { children: [deps.length, " deps"] })] }), _jsxs("div", { className: "flex items-center gap-1 text-blue-600", children: [_jsx(GitBranch, { size: 12 }), _jsxs("span", { children: [blocked.length, " blocked"] })] }), _jsxs("div", { className: "text-slate-500", children: [order.estimatedHours || 8, "h"] })] })] }, order.id));
                                }) })] }), _jsx("div", { className: "space-y-6", children: selectedOrder ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200 p-6", children: [_jsx("h3", { className: "text-lg font-bold text-slate-800 mb-4", children: selectedOrder.orderId || selectedOrder.item }), _jsxs("div", { className: "grid grid-cols-2 gap-4 mb-4", children: [_jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-500 uppercase", children: "Item" }), _jsx("div", { className: "font-bold text-slate-800", children: selectedOrder.itemCode || selectedOrder.extraCode })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-500 uppercase", children: "Status" }), _jsx("div", { className: "font-bold text-slate-800", children: selectedOrder.status || "planned" })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-500 uppercase", children: "Machine" }), _jsx("div", { className: "font-bold text-slate-800", children: selectedOrder.machine || "-" })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-500 uppercase", children: "Geschatte uren" }), _jsxs("div", { className: "font-bold text-slate-800", children: [selectedOrder.estimatedHours || 8, "h"] })] })] })] }), _jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200", children: [_jsxs("div", { className: "p-4 border-b-2 border-slate-200 bg-slate-50 flex items-center justify-between", children: [_jsx("h3", { className: "text-sm font-bold text-slate-800", children: "Dependencies (moet wachten op)" }), _jsx("button", { onClick: () => setShowAddDependency(!showAddDependency), className: "p-1 hover:bg-slate-200 rounded-lg transition-colors", children: _jsx(Plus, { size: 16 }) })] }), _jsxs("div", { className: "p-4 space-y-2", children: [showAddDependency && (_jsxs("div", { className: "mb-4 p-3 bg-blue-50 rounded-xl border-2 border-blue-200", children: [_jsxs("select", { value: potentialDependency, onChange: (e) => setPotentialDependency(e.target.value), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg mb-2 text-sm", children: [_jsx("option", { value: "", children: "Selecteer order..." }), orders
                                                                    .filter(o => o.id !== selectedOrder.id && !(selectedOrder.dependencies || []).includes(o.id))
                                                                    .map(o => (_jsxs("option", { value: o.id, children: [o.orderId || o.item, " - ", o.itemCode] }, o.id)))] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: addDependency, className: "px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors", children: "Toevoegen" }), _jsx("button", { onClick: () => {
                                                                        setShowAddDependency(false);
                                                                        setPotentialDependency("");
                                                                    }, className: "px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors", children: "Annuleren" })] })] })), getDependencies(selectedOrder).length === 0 ? (_jsx("div", { className: "text-center py-8 text-slate-400 text-sm", children: "Geen dependencies - kan direct starten" })) : (getDependencies(selectedOrder).map(dep => (_jsxs("div", { className: "flex items-center justify-between p-3 bg-amber-50 border-2 border-amber-200 rounded-xl", children: [_jsxs("div", { className: "flex items-center gap-2", children: [dep.status === "shipped" ? (_jsx(CheckCircle, { className: "text-emerald-600", size: 16 })) : (_jsx(Clock, { className: "text-amber-600", size: 16 })), _jsxs("div", { children: [_jsx("div", { className: "font-bold text-sm text-slate-800", children: dep.orderId || dep.item }), _jsx("div", { className: "text-xs text-slate-500", children: dep.itemCode })] })] }), _jsx("button", { onClick: () => removeDependency(selectedOrder.id, dep.id), className: "p-1 hover:bg-red-100 rounded-lg transition-colors", children: _jsx(Trash2, { className: "text-red-600", size: 14 }) })] }, dep.id))))] })] }), _jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200", children: [_jsx("div", { className: "p-4 border-b-2 border-slate-200 bg-slate-50", children: _jsx("h3", { className: "text-sm font-bold text-slate-800", children: "Blocked Orders (wachten op deze order)" }) }), _jsx("div", { className: "p-4 space-y-2", children: getBlockedOrders(selectedOrder.id).length === 0 ? (_jsx("div", { className: "text-center py-8 text-slate-400 text-sm", children: "Geen blocked orders" })) : (getBlockedOrders(selectedOrder.id).map(blocked => (_jsx("div", { className: "p-3 bg-blue-50 border-2 border-blue-200 rounded-xl", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(AlertTriangle, { className: "text-blue-600", size: 16 }), _jsxs("div", { children: [_jsx("div", { className: "font-bold text-sm text-slate-800", children: blocked.orderId || blocked.item }), _jsx("div", { className: "text-xs text-slate-500", children: blocked.itemCode })] })] }) }, blocked.id)))) })] })] })) : (_jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200 p-12 text-center", children: [_jsx(GitBranch, { className: "mx-auto mb-4 text-slate-300", size: 48 }), _jsx("div", { className: "text-slate-400", children: "Selecteer een order om dependencies te bekijken" })] })) })] }), criticalPath.length > 0 && (_jsxs("div", { className: "mt-6 bg-white rounded-2xl shadow-sm border-2 border-red-200 p-6", children: [_jsxs("h3", { className: "text-lg font-bold text-red-600 mb-4 flex items-center gap-2", children: [_jsx(AlertTriangle, { size: 20 }), "Critical Path Analysis"] }), _jsx("div", { className: "flex items-center gap-2 overflow-x-auto pb-4", children: criticalPath.map((order, idx) => (_jsxs(React.Fragment, { children: [_jsxs("div", { className: "flex-shrink-0 p-3 bg-red-50 border-2 border-red-300 rounded-xl min-w-[150px]", children: [_jsx("div", { className: "font-bold text-sm text-slate-800", children: order.orderId || order.item }), _jsxs("div", { className: "text-xs text-slate-500 mt-1", children: [order.estimatedHours || 8, "h"] })] }), idx < criticalPath.length - 1 && (_jsx("div", { className: "text-red-400 font-bold", children: "\u2192" }))] }, order.id))) }), _jsx("div", { className: "mt-4 p-3 bg-red-50 rounded-xl border border-red-200", children: _jsxs("div", { className: "text-xs text-red-800", children: [_jsx("strong", { children: "Let op:" }), " Deze orders vormen het critical path. Vertragingen in deze orders vertragen het hele project. Prioriteer deze voor on-time delivery."] }) })] }))] }));
};
export default OrderDependenciesView;
