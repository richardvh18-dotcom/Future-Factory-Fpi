/**
 * efficiencyCalculator.js
 * Berekent productie efficiency op basis van verwachte vs werkelijke tijden
 */

/**
 * Bereken efficiency percentage
 * @param {number} actualMinutes - Werkelijke productietijd in minuten
 * @param {number} targetMinutes - Verwachte productietijd in minuten
 * @returns {number} Efficiency percentage (100 = perfect, >100 = sneller dan verwacht)
 */
export const calculateEfficiency = (actualMinutes, targetMinutes) => {
  if (!actualMinutes || !targetMinutes || actualMinutes <= 0 || targetMinutes <= 0) {
    return null;
  }
  
  // Efficiency = (Target tijd / Actual tijd) * 100
  // 100% = precies op tijd
  // >100% = sneller dan verwacht (goed!)
  // <100% = langzamer dan verwacht
  const efficiency = (targetMinutes / actualMinutes) * 100;
  return Math.round(efficiency * 10) / 10; // Rond af op 1 decimaal
};

/**
 * Bereken totale efficiency voor een set van producten
 * @param {Array} products - Array van producten met actualTime en targetTime
 * @returns {Object} { averageEfficiency, totalActual, totalTarget, productCount }
 */
export const calculateBatchEfficiency = (products) => {
  if (!Array.isArray(products) || products.length === 0) {
    return {
      averageEfficiency: null,
      totalActual: 0,
      totalTarget: 0,
      productCount: 0
    };
  }

  let totalActual = 0;
  let totalTarget = 0;
  let validCount = 0;

  products.forEach(product => {
    const actual = product.actualTime || product.productionTime || 0;
    const target = product.targetTime || product.standardTime || 0;
    
    if (actual > 0 && target > 0) {
      totalActual += actual;
      totalTarget += target;
      validCount++;
    }
  });

  if (validCount === 0) {
    return {
      averageEfficiency: null,
      totalActual,
      totalTarget,
      productCount: validCount
    };
  }

  const averageEfficiency = calculateEfficiency(totalActual, totalTarget);

  return {
    averageEfficiency,
    totalActual,
    totalTarget,
    productCount: validCount
  };
};

/**
 * Format tijd in minuten naar leesbaar formaat
 * @param {number} minutes - Tijd in minuten
 * @returns {string} Geformatteerde tijd string (bijv. "2u 30m")
 */
export const formatMinutes = (minutes) => {
  if (!minutes || minutes <= 0) return '0m';
  
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  
  if (hours > 0 && mins > 0) {
    return `${hours}u ${mins}m`;
  } else if (hours > 0) {
    return `${hours}u`;
  } else {
    return `${mins}m`;
  }
};

/**
 * Bereken tijd verschil tussen start en eind timestamps
 * @param {Date|string|Timestamp} startTime - Start tijd
 * @param {Date|string|Timestamp} endTime - Eind tijd
 * @returns {number} Verschil in minuten
 */
export const calculateDuration = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;
  
  // Convert Firestore Timestamps to Date
  const start = startTime?.toDate ? startTime.toDate() : new Date(startTime);
  const end = endTime?.toDate ? endTime.toDate() : new Date(endTime);
  
  const diffMs = end - start;
  const diffMinutes = Math.round(diffMs / 1000 / 60);
  
  return diffMinutes > 0 ? diffMinutes : 0;
};

/**
 * Get efficiency kleur voor UI
 * @param {number} efficiency - Efficiency percentage
 * @returns {string} Tailwind kleur classes
 */
export const getEfficiencyColor = (efficiency) => {
  if (!efficiency) return 'text-slate-400 bg-slate-50';
  
  if (efficiency >= 100) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (efficiency >= 85) return 'text-green-700 bg-green-50 border-green-200';
  if (efficiency >= 70) return 'text-amber-700 bg-amber-50 border-amber-200';
  if (efficiency >= 50) return 'text-orange-700 bg-orange-50 border-orange-200';
  return 'text-rose-700 bg-rose-50 border-rose-200';
};

/**
 * Get efficiency label
 * @param {number} efficiency - Efficiency percentage
 * @returns {string} Label text
 */
export const getEfficiencyLabel = (efficiency) => {
  if (!efficiency) return 'Onbekend';
  
  if (efficiency >= 100) return 'Uitstekend';
  if (efficiency >= 85) return 'Goed';
  if (efficiency >= 70) return 'Voldoende';
  if (efficiency >= 50) return 'Matig';
  return 'Onder Norm';
};

/**
 * Bereken verwachte eindtijd op basis van start en target tijd
 * @param {Date|string|Timestamp} startTime - Start tijd
 * @param {number} targetMinutes - Verwachte duur in minuten
 * @returns {Date} Verwachte eindtijd
 */
export const calculateExpectedEndTime = (startTime, targetMinutes) => {
  if (!startTime || !targetMinutes) return null;
  
  const start = startTime?.toDate ? startTime.toDate() : new Date(startTime);
  const expectedEnd = new Date(start.getTime() + (targetMinutes * 60 * 1000));
  
  return expectedEnd;
};

/**
 * Check of een productie achterloopt
 * @param {Date|string|Timestamp} startTime - Start tijd
 * @param {number} targetMinutes - Verwachte duur in minuten
 * @returns {boolean} True als achterlopend
 */
export const isBehindSchedule = (startTime, targetMinutes) => {
  if (!startTime || !targetMinutes) return false;
  
  const expectedEnd = calculateExpectedEndTime(startTime, targetMinutes);
  const now = new Date();
  
  return now > expectedEnd;
};

/**
 * Bereken tijd over/onder voor lopende productie
 * @param {Date|string|Timestamp} startTime - Start tijd
 * @param {number} targetMinutes - Verwachte duur in minuten
 * @returns {number} Minuten voor of achter (positief = voor, negatief = achter)
 */
export const calculateTimeDeviation = (startTime, targetMinutes) => {
  if (!startTime || !targetMinutes) return 0;
  
  const expectedEnd = calculateExpectedEndTime(startTime, targetMinutes);
  const now = new Date();
  
  const diffMs = expectedEnd - now;
  const diffMinutes = Math.round(diffMs / 1000 / 60);
  
  return diffMinutes; // Positief = nog tijd over, negatief = te laat
};
