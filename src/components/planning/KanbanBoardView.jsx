import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Truck, 
  Package,
  User,
  Calendar
} from "lucide-react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { format } from "date-fns";

/**
 * KanbanBoardView - Order Workflow Visualization
 * Statussen: Gepland → In Productie → Controle → Verzonden
 */
const KanbanBoardView = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const columns = [
    { 
      id: "planned", 
      title: "📅 Gepland", 
      color: "bg-blue-50 border-blue-200",
      icon: Clock,
      wipLimit: null
    },
    { 
      id: "in_production", 
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
    },
    { 
      id: "ready_to_ship", 
      title: "✅ Verzendklaar", 
      color: "bg-emerald-50 border-emerald-200",
      icon: CheckCircle2,
      wipLimit: null
    },
    { 
      id: "shipped", 
      title: "🚚 Verzonden", 
      color: "bg-slate-50 border-slate-200",
      icon: Truck,
      wipLimit: null
    }
  ];

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, ...PATHS.PLANNING),
      (snapshot) => {
        const ordersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          status: doc.data().status || "planned"
        }));
        setOrders(ordersData);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading orders:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId) return;

    // Check WIP limit
    const destColumn = columns.find(c => c.id === destination.droppableId);
    const destOrders = orders.filter(o => o.status === destination.droppableId);
    
    if (destColumn.wipLimit && destOrders.length >= destColumn.wipLimit) {
      alert(`⚠️ WIP Limiet bereikt! Max ${destColumn.wipLimit} orders in ${destColumn.title}`);
      return;
    }

    try {
      // Update order status in Firestore
      const orderRef = doc(db, ...PATHS.PLANNING, draggableId);
      await updateDoc(orderRef, {
        status: destination.droppableId,
        statusUpdatedAt: new Date(),
        statusUpdatedBy: "user" // TODO: Add actual user
      });

      // Optimistic UI update
      setOrders(prev => prev.map(order => 
        order.id === draggableId 
          ? { ...order, status: destination.droppableId }
          : order
      ));
    } catch (error) {
      console.error("Error updating order status:", error);
      alert("Fout bij het verplaatsen van order");
    }
  };

  const getOrdersByStatus = (status) => {
    return orders.filter(order => order.status === status);
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
      <div className="mb-6">
        <h1 className="text-3xl font-black text-slate-800">
          Kanban Board <span className="text-blue-600">Planning</span>
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Sleep orders tussen kolommen om status te wijzigen
        </p>
      </div>

      {/* Kanban Board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-5 gap-4">
          {columns.map(column => {
            const columnOrders = getOrdersByStatus(column.id);
            const Icon = column.icon;
            
            return (
              <div key={column.id} className="flex flex-col">
                {/* Column Header */}
                <div className={`${column.color} border-2 rounded-t-2xl p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon size={16} className="text-slate-700" />
                      <h3 className="font-bold text-sm text-slate-800">
                        {column.title}
                      </h3>
                    </div>
                    <span className="px-2 py-0.5 bg-white rounded-full text-xs font-bold text-slate-700">
                      {columnOrders.length}
                    </span>
                  </div>
                  
                  {column.wipLimit && (
                    <div className="text-xs text-slate-600">
                      WIP Limiet: {columnOrders.length}/{column.wipLimit}
                      {columnOrders.length >= column.wipLimit && (
                        <span className="text-red-600 font-bold ml-1">⚠️ VOL</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Column Content */}
                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 ${column.color} border-x-2 border-b-2 rounded-b-2xl p-3 min-h-[500px] ${
                        snapshot.isDraggingOver ? "bg-blue-100" : ""
                      }`}
                    >
                      <div className="space-y-3">
                        {columnOrders.map((order, index) => (
                          <Draggable
                            key={order.id}
                            draggableId={order.id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`bg-white rounded-xl p-3 shadow-sm border-2 ${
                                  snapshot.isDragging
                                    ? "border-blue-500 shadow-lg"
                                    : "border-slate-200"
                                } hover:shadow-md transition-shadow cursor-move`}
                              >
                                {/* Order Info */}
                                <div className="mb-2">
                                  <div className="font-bold text-sm text-slate-800 mb-1">
                                    {order.orderId || order.item}
                                  </div>
                                  <div className="text-xs text-slate-600">
                                    {order.itemCode || order.extraCode}
                                  </div>
                                </div>

                                {/* Meta Info */}
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                  <Package size={12} />
                                  <span>{order.plan || 0} stuks</span>
                                </div>

                                {order.machine && (
                                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                    <User size={12} />
                                    <span>{order.machine}</span>
                                  </div>
                                )}

                                {order.plannedDate && (
                                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                    <Calendar size={12} />
                                    <span>{format(new Date(order.plannedDate.seconds * 1000), 'dd-MM-yyyy')}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Stats Footer */}
      <div className="mt-6 grid grid-cols-5 gap-4">
        {columns.map(column => {
          const columnOrders = getOrdersByStatus(column.id);
          const totalPlan = columnOrders.reduce((sum, o) => sum + (parseInt(o.plan) || 0), 0);
          
          return (
            <div key={column.id} className="bg-white rounded-xl p-4 border-2 border-slate-200">
              <div className="text-xs text-slate-600 mb-1">{column.title}</div>
              <div className="font-bold text-lg text-slate-800">{totalPlan} stuks</div>
              <div className="text-xs text-slate-500">{columnOrders.length} orders</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default KanbanBoardView;
