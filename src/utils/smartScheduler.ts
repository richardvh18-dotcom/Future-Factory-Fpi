import { differenceInMinutes } from "date-fns";

export interface PlanningOrder {
  id: string;
  orderId: string;
  orderNumber?: string;
  deliveryDate?: string | Date; // Datum voor de vrachtwagen
  plannedDate?: string | Date;
  type?: 'klant' | 'project' | 'voorraad';
  priority?: 'immediate' | 'urgent' | 'high' | 'normal' | 'low';
  status: string;
  plan?: number;
}

export const calculateOrderPriorityScore = (order: PlanningOrder): number => {
  let score = 0;

  // 1. Order Type weging
  const typeStr = String(order.type || '').toLowerCase();
  if (typeStr.includes('klant')) score += 50;
  else if (typeStr.includes('project')) score += 30;
  else if (typeStr.includes('voorraad')) score += 5;
  else score += 15; // Standaard / Onbekend

  // 2. Handmatige (bestaande) prioriteit respecteren
  if (order.priority === 'immediate') score += 150;
  else if (order.priority === 'urgent') score += 80;
  else if (order.priority === 'high') score += 40;

  // 3. Deadline / Vrachtwagen logica
  const targetDate = order.deliveryDate || order.plannedDate;
  if (targetDate) {
    const delivery = new Date(targetDate);
    const now = new Date();
    const minutesUntilDelivery = differenceInMinutes(delivery, now);
    
    if (minutesUntilDelivery < 0) {
      score += 200; // Te laat! Brand! Hoogste prio.
    } else if (minutesUntilDelivery < 24 * 60) {
      score += 100; // Vrachtwagen vertrekt binnen 24 uur
    } else if (minutesUntilDelivery < 3 * 24 * 60) {
      score += 50;  // Binnen 3 dagen
    } else if (minutesUntilDelivery < 7 * 24 * 60) {
      score += 20;  // Binnen een week
    }
  }

  return score;
};

export const generateSmartSuggestions = (orders: PlanningOrder[]): Array<PlanningOrder & { score: number }> => {
  // Filter alleen orders die nog niet gereed of geannuleerd zijn
  const activeOrders = orders.filter(o => 
    !['completed', 'gereed', 'rejected', 'cancelled', 'deleted'].includes(o.status?.toLowerCase())
  );

  const scoredOrders = activeOrders.map(order => ({
    ...order,
    score: calculateOrderPriorityScore(order)
  }));

  // Sorteer van hoogste naar laagste score en pak de top 5
  scoredOrders.sort((a, b) => b.score - a.score);
  return scoredOrders.slice(0, 5);
};