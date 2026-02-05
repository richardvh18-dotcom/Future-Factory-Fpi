import React, { useState, useEffect, useMemo } from "react";
import { 
  GitBranch, 
  Plus, 
  Trash2, 
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Link,
  TrendingUp
} from "lucide-react";
import { collection, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";

/**
 * OrderDependenciesView - Manage order dependencies and critical path
 * Shows which orders block others and calculates critical path
 */
const OrderDependenciesView = () => {
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showAddDependency, setShowAddDependency] = useState(false);
  const [potentialDependency, setPotentialDependency] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubOrders = onSnapshot(
      collection(db, ...PATHS.PLANNING),
      (snapshot) => {
        const ordersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setOrders(ordersData);
        setLoading(false);
      }
    );

    return () => unsubOrders();
  }, []);

  // Get dependencies for an order
  const getDependencies = (order) => {
    return (order.dependencies || []).map(depId => 
      orders.find(o => o.id === depId)
    ).filter(Boolean);
  };

  // Get blocked orders (orders that depend on this one)
  const getBlockedOrders = (orderId) => {
    return orders.filter(o => 
      (o.dependencies || []).includes(orderId)
    );
  };

  // Calculate critical path
  const criticalPath = useMemo(() => {
    if (orders.length === 0) return [];

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
      if (visited.has(orderId)) return graph[orderId].earliestStart;
      visited.add(orderId);

      const node = graph[orderId];
      if (!node) return 0;

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
      if (visited.has(orderId)) return graph[orderId].latestStart;
      visited.add(orderId);

      const node = graph[orderId];
      if (!node) return 0;

      const blockedOrders = getBlockedOrders(orderId);
      if (blockedOrders.length === 0) {
        // No successors, can start as late as project end minus duration
        node.latestStart = projectEndTime - node.duration;
      } else {
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
    if (!selectedOrder || !potentialDependency) return;

    // Check for circular dependencies
    if (wouldCreateCircular(selectedOrder.id, potentialDependency)) {
      alert("⚠️ Dit zou een circulaire dependency cre\u00ebren!");
      return;
    }

    await updateDoc(doc(db, ...PATHS.PLANNING, selectedOrder.id), {
      dependencies: arrayUnion(potentialDependency)
    });

    setPotentialDependency("");
    setShowAddDependency(false);
  };

  // Remove dependency
  const removeDependency = async (orderId, depId) => {
    await updateDoc(doc(db, ...PATHS.PLANNING, orderId), {
      dependencies: arrayRemove(depId)
    });
  };

  // Check if adding dependency would create circular reference
  const wouldCreateCircular = (orderId, newDepId, visited = new Set()) => {
    if (orderId === newDepId) return true;
    if (visited.has(newDepId)) return false;
    visited.add(newDepId);

    const newDepOrder = orders.find(o => o.id === newDepId);
    if (!newDepOrder || !newDepOrder.dependencies) return false;

    return newDepOrder.dependencies.some(depId => 
      wouldCreateCircular(orderId, depId, visited)
    );
  };

  // Get status icon
  const getStatusIcon = (order) => {
    const deps = getDependencies(order);
    const allDepsComplete = deps.every(d => d.status === "shipped");
    
    if (order.status === "shipped") return <CheckCircle className="text-emerald-600" size={20} />;
    if (!allDepsComplete) return <Clock className="text-amber-600" size={20} />;
    return <TrendingUp className="text-blue-600" size={20} />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-800">
              Order <span className="text-purple-600">Dependencies</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Beheer afhankelijkheden en critical path tussen orders
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Critical Path Badge */}
            <div className="px-4 py-2 bg-red-50 border-2 border-red-200 rounded-xl">
              <div className="text-xs text-red-600 font-bold uppercase tracking-wider">Critical Path</div>
              <div className="text-2xl font-black text-red-600">{criticalPath.length}</div>
              <div className="text-xs text-red-500 mt-1">orders</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Orders List */}
        <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200">
          <div className="p-4 border-b-2 border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-800">Orders</h3>
          </div>
          <div className="p-4 max-h-[700px] overflow-y-auto space-y-2">
            {orders.map(order => {
              const deps = getDependencies(order);
              const blocked = getBlockedOrders(order.id);
              const isCritical = criticalPath.some(cp => cp.id === order.id);
              const isSelected = selectedOrder?.id === order.id;

              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    isSelected 
                      ? "border-purple-500 bg-purple-50" 
                      : isCritical
                      ? "border-red-300 bg-red-50 hover:border-red-400"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(order)}
                      <div>
                        <div className="font-bold text-sm text-slate-800">
                          {order.orderId || order.item}
                        </div>
                        <div className="text-xs text-slate-500">
                          {order.itemCode || order.extraCode}
                        </div>
                      </div>
                    </div>
                    {isCritical && (
                      <span className="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded">
                        CRITICAL
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1 text-amber-600">
                      <Link size={12} />
                      <span>{deps.length} deps</span>
                    </div>
                    <div className="flex items-center gap-1 text-blue-600">
                      <GitBranch size={12} />
                      <span>{blocked.length} blocked</span>
                    </div>
                    <div className="text-slate-500">
                      {order.estimatedHours || 8}h
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dependency Details */}
        <div className="space-y-6">
          {selectedOrder ? (
            <>
              {/* Selected Order Info */}
              <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4">
                  {selectedOrder.orderId || selectedOrder.item}
                </h3>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="text-xs text-slate-500 uppercase">Item</div>
                    <div className="font-bold text-slate-800">{selectedOrder.itemCode || selectedOrder.extraCode}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 uppercase">Status</div>
                    <div className="font-bold text-slate-800">{selectedOrder.status || "planned"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 uppercase">Machine</div>
                    <div className="font-bold text-slate-800">{selectedOrder.machine || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 uppercase">Geschatte uren</div>
                    <div className="font-bold text-slate-800">{selectedOrder.estimatedHours || 8}h</div>
                  </div>
                </div>
              </div>

              {/* Dependencies (Blockers) */}
              <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200">
                <div className="p-4 border-b-2 border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800">Dependencies (moet wachten op)</h3>
                  <button
                    onClick={() => setShowAddDependency(!showAddDependency)}
                    className="p-1 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                
                <div className="p-4 space-y-2">
                  {showAddDependency && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-xl border-2 border-blue-200">
                      <select
                        value={potentialDependency}
                        onChange={(e) => setPotentialDependency(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg mb-2 text-sm"
                      >
                        <option value="">Selecteer order...</option>
                        {orders
                          .filter(o => o.id !== selectedOrder.id && !(selectedOrder.dependencies || []).includes(o.id))
                          .map(o => (
                            <option key={o.id} value={o.id}>
                              {o.orderId || o.item} - {o.itemCode}
                            </option>
                          ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={addDependency}
                          className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors"
                        >
                          Toevoegen
                        </button>
                        <button
                          onClick={() => {
                            setShowAddDependency(false);
                            setPotentialDependency("");
                          }}
                          className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                        >
                          Annuleren
                        </button>
                      </div>
                    </div>
                  )}

                  {getDependencies(selectedOrder).length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      Geen dependencies - kan direct starten
                    </div>
                  ) : (
                    getDependencies(selectedOrder).map(dep => (
                      <div key={dep.id} className="flex items-center justify-between p-3 bg-amber-50 border-2 border-amber-200 rounded-xl">
                        <div className="flex items-center gap-2">
                          {dep.status === "shipped" ? (
                            <CheckCircle className="text-emerald-600" size={16} />
                          ) : (
                            <Clock className="text-amber-600" size={16} />
                          )}
                          <div>
                            <div className="font-bold text-sm text-slate-800">{dep.orderId || dep.item}</div>
                            <div className="text-xs text-slate-500">{dep.itemCode}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => removeDependency(selectedOrder.id, dep.id)}
                          className="p-1 hover:bg-red-100 rounded-lg transition-colors"
                        >
                          <Trash2 className="text-red-600" size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Blocked Orders */}
              <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200">
                <div className="p-4 border-b-2 border-slate-200 bg-slate-50">
                  <h3 className="text-sm font-bold text-slate-800">Blocked Orders (wachten op deze order)</h3>
                </div>
                <div className="p-4 space-y-2">
                  {getBlockedOrders(selectedOrder.id).length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      Geen blocked orders
                    </div>
                  ) : (
                    getBlockedOrders(selectedOrder.id).map(blocked => (
                      <div key={blocked.id} className="p-3 bg-blue-50 border-2 border-blue-200 rounded-xl">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="text-blue-600" size={16} />
                          <div>
                            <div className="font-bold text-sm text-slate-800">{blocked.orderId || blocked.item}</div>
                            <div className="text-xs text-slate-500">{blocked.itemCode}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 p-12 text-center">
              <GitBranch className="mx-auto mb-4 text-slate-300" size={48} />
              <div className="text-slate-400">
                Selecteer een order om dependencies te bekijken
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Critical Path Visualization */}
      {criticalPath.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl shadow-sm border-2 border-red-200 p-6">
          <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
            <AlertTriangle size={20} />
            Critical Path Analysis
          </h3>
          <div className="flex items-center gap-2 overflow-x-auto pb-4">
            {criticalPath.map((order, idx) => (
              <React.Fragment key={order.id}>
                <div className="flex-shrink-0 p-3 bg-red-50 border-2 border-red-300 rounded-xl min-w-[150px]">
                  <div className="font-bold text-sm text-slate-800">{order.orderId || order.item}</div>
                  <div className="text-xs text-slate-500 mt-1">{order.estimatedHours || 8}h</div>
                </div>
                {idx < criticalPath.length - 1 && (
                  <div className="text-red-400 font-bold">→</div>
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-4 p-3 bg-red-50 rounded-xl border border-red-200">
            <div className="text-xs text-red-800">
              <strong>Let op:</strong> Deze orders vormen het critical path. Vertragingen in deze orders 
              vertragen het hele project. Prioriteer deze voor on-time delivery.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDependenciesView;
