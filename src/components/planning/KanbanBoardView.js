import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { Clock, AlertCircle, Package, User, Calendar } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { format } from "date-fns";
import { updateOrderKanbanStatus } from "../../services/planningSecurityService";
import { useNotifications } from '../../contexts/NotificationContext';
/**
 * KanbanBoardView - Order Workflow Visualization
 * Statussen: Gepland → In Productie → Controle → Verzonden
 */
const KanbanBoardView = () => {
    const { notify } = useNotifications();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    // Helper om statussen te normaliseren naar de kolommen
    const normalizeStatus = (status) => {
        if (!status)
            return "pending";
        const s = status.toLowerCase();
        if (s === "planned" || s === "pending" || s === "open")
            return "pending";
        if (s === "in_production" || s === "in_progress" || s === "active" || s === "started")
            return "in_progress";
        if (s === "quality_check" || s === "inspection" || s === "check")
            return "quality_check";
        if (s === "ready_to_ship" || s === "completed" || s === "finished" || s === "gereed")
            return "completed";
        if (s === "shipped" || s === "verzonden")
            return "shipped";
        return "pending";
    };
    const columns = [
        {
            id: "pending",
            title: "📅 Gepland",
            color: "bg-blue-50 border-blue-200",
            icon: Clock,
            wipLimit: null
        },
        {
            id: "in_progress",
            title: "⚙️ In Productie",
            color: "bg-orange-50 border-orange-200",
            icon: Package,
            wipLimit: 10
        },
        {
            id: "quality_check",
            title: "🔍 Controle",
            color: "bg-purple-50 border-purple-200",
            icon: AlertCircle,
            wipLimit: 5
        }
    ];
    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, ...PATHS.PLANNING), (snapshot) => {
            const ordersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                status: normalizeStatus(doc.data().status)
            }));
            setOrders(ordersData);
            setLoading(false);
        }, (error) => {
            console.error("Error loading orders:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);
    const onDragEnd = async (result) => {
        const { source, destination, draggableId } = result;
        if (!destination)
            return;
        if (source.droppableId === destination.droppableId)
            return;
        // Check WIP limit
        const destColumn = columns.find(c => c.id === destination.droppableId);
        const destOrders = orders.filter(o => o.status === destination.droppableId);
        if (destColumn.wipLimit && destOrders.length >= destColumn.wipLimit) {
            notify(`⚠️ WIP Limiet bereikt! Max ${destColumn.wipLimit} orders in ${destColumn.title}`);
            return;
        }
        try {
            // Update order status via callable
            await updateOrderKanbanStatus({
                orderId: draggableId,
                status: destination.droppableId,
            });
            await logActivity(auth.currentUser?.uid, "ORDER_STATUS_MOVE", `Kanban status gewijzigd voor order ${draggableId}: ${source.droppableId} -> ${destination.droppableId}`);
            // Optimistic UI update
            setOrders(prev => prev.map(order => order.id === draggableId
                ? { ...order, status: destination.droppableId }
                : order));
        }
        catch (error) {
            console.error("Error updating order status:", error);
            notify("Fout bij het verplaatsen van order");
        }
    };
    const getOrdersByStatus = (status) => {
        return orders.filter(order => order.status === status);
    };
    if (loading) {
        return (_jsx("div", { className: "flex items-center justify-center p-12", children: _jsx("div", { className: "animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" }) }));
    }
    return (_jsxs("div", { className: "p-6 bg-slate-50 h-screen flex flex-col overflow-hidden", children: [_jsxs("div", { className: "mb-6 shrink-0", children: [_jsxs("h1", { className: "text-3xl font-black text-slate-800", children: ["Kanban Board ", _jsx("span", { className: "text-blue-600", children: "Planning" })] }), _jsx("p", { className: "text-sm text-slate-600 mt-1", children: "Sleep orders tussen kolommen om status te wijzigen" })] }), _jsx(DragDropContext, { onDragEnd: onDragEnd, children: _jsx("div", { className: "grid grid-cols-3 gap-4 flex-1 min-h-0", children: columns.map(column => {
                        const columnOrders = getOrdersByStatus(column.id);
                        const Icon = column.icon;
                        return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsxs("div", { className: `${column.color} border-2 rounded-t-2xl p-4 shrink-0`, children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Icon, { size: 16, className: "text-slate-700" }), _jsx("h3", { className: "font-bold text-sm text-slate-800", children: column.title })] }), _jsx("span", { className: "px-2 py-0.5 bg-white rounded-full text-xs font-bold text-slate-700", children: columnOrders.length })] }), column.wipLimit && (_jsxs("div", { className: "text-xs text-slate-600", children: ["WIP Limiet: ", columnOrders.length, "/", column.wipLimit, columnOrders.length >= column.wipLimit && (_jsx("span", { className: "text-red-600 font-bold ml-1", children: "\u26A0\uFE0F VOL" }))] }))] }), _jsx(Droppable, { droppableId: column.id, children: (provided, snapshot) => (_jsx("div", { ref: provided.innerRef, ...provided.droppableProps, className: `flex-1 ${column.color} border-x-2 border-b-2 rounded-b-2xl p-3 overflow-y-auto custom-scrollbar ${snapshot.isDraggingOver ? "bg-blue-100" : ""}`, children: _jsxs("div", { className: "space-y-3", children: [columnOrders.map((order, index) => (_jsx(Draggable, { draggableId: order.id, index: index, children: (provided, snapshot) => (_jsxs("div", { ref: provided.innerRef, ...provided.draggableProps, ...provided.dragHandleProps, className: `bg-white rounded-xl p-3 shadow-sm border-2 ${snapshot.isDragging
                                                            ? "border-blue-500 shadow-lg"
                                                            : "border-slate-200"} hover:shadow-md transition-shadow cursor-move`, children: [_jsxs("div", { className: "mb-2", children: [_jsx("div", { className: "font-bold text-sm text-slate-800 mb-1", children: order.orderId || order.item }), _jsx("div", { className: "text-xs text-slate-600", children: order.itemCode || order.extraCode })] }), _jsxs("div", { className: "flex items-center gap-2 text-xs text-slate-500", children: [_jsx(Package, { size: 12 }), _jsxs("span", { children: [order.plan || 0, " stuks"] })] }), order.machine && (_jsxs("div", { className: "flex items-center gap-2 text-xs text-slate-500 mt-1", children: [_jsx(User, { size: 12 }), _jsx("span", { children: order.machine })] })), order.plannedDate && (_jsxs("div", { className: "flex items-center gap-2 text-xs text-slate-500 mt-1", children: [_jsx(Calendar, { size: 12 }), _jsx("span", { children: format(new Date(order.plannedDate.seconds * 1000), 'dd-MM-yyyy') })] }))] })) }, order.id))), provided.placeholder] }) })) })] }, column.id));
                    }) }) }), _jsx("div", { className: "mt-6 grid grid-cols-3 gap-4 shrink-0", children: columns.map(column => {
                    const columnOrders = getOrdersByStatus(column.id);
                    const totalPlan = columnOrders.reduce((sum, o) => sum + (parseInt(o.plan) || 0), 0);
                    return (_jsxs("div", { className: "bg-white rounded-xl p-4 border-2 border-slate-200", children: [_jsx("div", { className: "text-xs text-slate-600 mb-1", children: column.title }), _jsxs("div", { className: "font-bold text-lg text-slate-800", children: [totalPlan, " stuks"] }), _jsxs("div", { className: "text-xs text-slate-500", children: [columnOrders.length, " orders"] })] }, column.id));
                }) })] }));
};
export default KanbanBoardView;
