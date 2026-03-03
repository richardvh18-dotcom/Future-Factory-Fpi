import React, { useMemo } from 'react';
import StatusBadge from './common/StatusBadge';

const MalOptimizationPanel = ({ currentOrder, allOrders, onSelectOrder }) => {
  // Zoek orders met hetzelfde product die nog niet klaar zijn
  const relatedOrders = useMemo(() => {
    if (!currentOrder || !allOrders) return [];

    const currentCode = currentOrder.itemCode || currentOrder.productId;

    return allOrders.filter(order => 
      (order.itemCode || order.productId) === currentCode && // Zelfde product
      order.id !== currentOrder.id && // Niet de huidige order
      (order.produced || 0) < (order.plan || order.quantity || 0) && // Nog niet klaar
      order.status !== 'completed' && 
      order.status !== 'shipped'
    );
  }, [currentOrder, allOrders]);

  if (relatedOrders.length === 0) return null;

  return (
    <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 overflow-hidden animate-in fade-in slide-in-from-top-2">
      <div className="p-3 border-b border-blue-100 dark:border-blue-800 bg-blue-100/50 dark:bg-blue-900/40">
        <h4 className="font-bold text-blue-900 dark:text-blue-300 flex items-center gap-2 text-sm">
          <span className="text-lg">📦</span> 
          Optimalisatie
        </h4>
        <p className="text-xs text-slate-900 dark:text-slate-200 mt-1 font-medium">
          Nog <strong>{relatedOrders.length}</strong> orders voor {currentOrder.itemCode || currentOrder.productId}.
        </p>
      </div>

      <div className="divide-y divide-blue-100 dark:divide-blue-800 max-h-48 overflow-y-auto">
        {relatedOrders.map(order => (
          <button
            key={order.id}
            onClick={() => onSelectOrder(order.id)}
            className="w-full text-left p-2 hover:bg-white dark:hover:bg-gray-800 transition-colors flex justify-between items-center group"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  {order.orderId || order.orderNumber}
                </span>
                <StatusBadge status={order.status} showIcon={false} />
                {order.labels?.includes('URGENT') && (
                  <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">
                    SPOED
                  </span>
                )}
              </div>
              <div className="text-[10px] text-gray-500">
                {order.plan || order.quantity} stuks • {order.project || 'Intern'}
              </div>
            </div>
            
            <div className="text-blue-600 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all text-xs font-bold">
              Bekijk →
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default MalOptimizationPanel;