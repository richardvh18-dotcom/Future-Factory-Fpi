import React from "react";
import { ClipboardList } from "lucide-react";
import PlanningSidebar from "../digitalplanning/PlanningSidebar";
import OrderDetail from "../digitalplanning/OrderDetail";

const PlanningSidebarAny = PlanningSidebar as React.ComponentType<any>;
const OrderDetailAny = OrderDetail as React.ComponentType<any>;

type TeamleaderPlanningViewProps = {
  orders: any[];
  products: any[];
  selectedOrderId: string | null;
  onSelectOrder: (orderId: string | null) => void;
  selectedOrder: any;
};

const TeamleaderPlanningView = ({ 
  orders, 
  products, 
  selectedOrderId, 
  onSelectOrder, 
  selectedOrder 
}: TeamleaderPlanningViewProps) => {
  return (
    <div className="h-full flex gap-6 overflow-hidden">
      <div className="w-80 shrink-0 flex flex-col min-h-0">
        <PlanningSidebarAny
          orders={orders}
          selectedOrderId={selectedOrderId}
          onSelect={onSelectOrder}
        />
      </div>
      <div className="flex-1 bg-white rounded-[40px] border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        {selectedOrder ? (
          <OrderDetailAny
            order={selectedOrder}
            products={products}
            onClose={() => onSelectOrder(null)}
            isManager={true}
            showAllStations={true}
          />
        ) : (
          <div className="flex-1 flex flex-col justify-center items-center opacity-40 italic text-center">
            <ClipboardList size={64} className="mb-4 text-slate-300" />
            <p className="font-black uppercase tracking-widest text-xs text-slate-400">
              Selecteer een order uit de lijst
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamleaderPlanningView;