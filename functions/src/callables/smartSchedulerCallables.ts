// @ts-nocheck

const functions = require('firebase-functions/v1');

exports.calculateSmartSuggestions = functions.region('europe-west1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Gebruiker moet ingelogd zijn.');
  }

  const { orders } = data;
  if (!Array.isArray(orders)) {
    return { topOrders: [] };
  }

  // Filter alleen orders die nog niet gereed of geannuleerd zijn
  const activeOrders = orders.filter(o => {
    const status = String(o.status || '').toLowerCase();
    return !['completed', 'gereed', 'rejected', 'cancelled', 'deleted'].includes(status);
  });

  const scoredOrders = activeOrders.map(order => {
    let score = 0;

    // 1. Order Type weging
    const typeStr = String(order.type || '').toLowerCase();
    if (typeStr.includes('klant')) score += 50;
    else if (typeStr.includes('project')) score += 30;
    else if (typeStr.includes('voorraad')) score += 5;
    else score += 15;

    // 2. Handmatige prioriteit respecteren
    if (order.priority === 'immediate') score += 150;
    else if (order.priority === 'urgent') score += 80;
    else if (order.priority === 'high') score += 40;

    // 3. Deadline / Vrachtwagen wiskunde
    const targetDate = order.deliveryDate || order.plannedDate;
    if (targetDate) {
      const delivery = new Date(targetDate);
      const now = new Date();
      const minutesUntilDelivery = Math.round((delivery.getTime() - now.getTime()) / 60000);

      if (minutesUntilDelivery < 0) score += 200;
      else if (minutesUntilDelivery < 24 * 60) score += 100;
      else if (minutesUntilDelivery < 3 * 24 * 60) score += 50;
      else if (minutesUntilDelivery < 7 * 24 * 60) score += 20;
    }

    return { ...order, score };
  });

  scoredOrders.sort((a, b) => b.score - a.score);
  return { topOrders: scoredOrders.slice(0, 5) };
});