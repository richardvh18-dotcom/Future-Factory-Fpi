import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import StatusBadge from './common/StatusBadge';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { toDateSafe } from '../../utils/dateUtils';
const MalOptimizationPanel = ({ currentOrder, allOrders, onSelectOrder }) => {
    const { t } = useTranslation();
    const parseDateSafe = (dateInput) => {
        return toDateSafe(dateInput);
    };
    const getPlanningInfo = (order) => {
        const weekRaw = String(order.week || order.weekNumber || '').trim();
        const deliveryDate = parseDateSafe(order.deliveryDate || order.plannedDate);
        let weekLabel = '';
        if (weekRaw) {
            if (weekRaw.toUpperCase().includes('-W')) {
                const parts = weekRaw.toUpperCase().split('-W');
                weekLabel = t('digitalplanning.optimization.week', { week: parts[1] || weekRaw, defaultValue: 'Week {{week}}' });
            }
            else {
                weekLabel = t('digitalplanning.optimization.week', { week: weekRaw, defaultValue: 'Week {{week}}' });
            }
        }
        const dateLabel = deliveryDate
            ? t('digitalplanning.optimization.delivery_date', {
                date: format(deliveryDate, 'dd-MM-yyyy'),
                defaultValue: 'Leverdatum {{date}}',
            })
            : '';
        if (weekLabel && dateLabel)
            return `${weekLabel} • ${dateLabel}`;
        return weekLabel || dateLabel || t('digitalplanning.optimization.unknown', 'Week/leverdatum onbekend');
    };
    // Zoek orders met hetzelfde product die nog niet klaar zijn
    const relatedOrders = useMemo(() => {
        if (!currentOrder || !allOrders)
            return [];
        const currentCode = currentOrder.itemCode || currentOrder.productId;
        return allOrders.filter(order => (order.itemCode || order.productId) === currentCode && // Zelfde product
            order.id !== currentOrder.id && // Niet de huidige order
            (order.produced || 0) < (order.plan || order.quantity || 0) && // Nog niet klaar
            order.status !== 'completed' &&
            order.status !== 'shipped');
    }, [currentOrder, allOrders]);
    if (relatedOrders.length === 0)
        return null;
    return (_jsxs("div", { className: "mt-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 overflow-hidden animate-in fade-in slide-in-from-top-2", children: [_jsxs("div", { className: "p-3 border-b border-blue-100 dark:border-blue-800 bg-blue-100/50 dark:bg-blue-900/40", children: [_jsxs("h4", { className: "font-bold text-blue-900 dark:text-blue-300 flex items-center gap-2 text-sm", children: [_jsx("span", { className: "text-lg", children: "\uD83D\uDCE6" }), t('digitalplanning.optimization.title', 'Optimalisatie')] }), _jsx("p", { className: "text-xs text-slate-900 dark:text-slate-200 mt-1 font-medium", children: t('digitalplanning.optimization.orders_count', {
                            count: relatedOrders.length,
                            product: currentOrder.itemCode || currentOrder.productId,
                            defaultValue: 'Nog {{count}} orders voor {{product}}.',
                        }) })] }), _jsx("div", { className: "divide-y divide-blue-100 dark:divide-blue-800 max-h-48 overflow-y-auto", children: relatedOrders.map(order => (_jsxs("button", { onClick: () => onSelectOrder(order.id), className: "w-full text-left p-2 hover:bg-white dark:hover:bg-gray-800 transition-colors flex justify-between items-center group", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-bold text-slate-900 dark:text-white text-sm", children: order.orderId || order.orderNumber }), _jsx(StatusBadge, { status: order.status, showIcon: false }), order.labels?.includes('URGENT') && (_jsx("span", { className: "text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold", children: t('digitalplanning.optimization.urgent', 'SPOED') }))] }), _jsxs("div", { className: "text-[10px] text-gray-500", children: [order.plan || order.quantity, " ", t('digitalplanning.optimization.pieces', 'stuks'), " \u2022 ", order.project || t('digitalplanning.optimization.internal', 'Intern')] }), _jsx("div", { className: "text-[10px] text-blue-700 font-semibold", children: getPlanningInfo(order) })] }), _jsx("div", { className: "text-blue-600 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all text-xs font-bold", children: t('digitalplanning.optimization.view_link', 'Bekijk →') })] }, order.id))) })] }));
};
export default MalOptimizationPanel;
