/**
 * infor_sync_service.js
 * Afhandeling van Infor LN data.
 * Combineert dynamische kolomherkenning met vaste fallbacks voor robuustheid.
 */
import { processInforUpdate as processInforUpdateCallable } from '../services/planningSecurityService';
// Aliassen voor kolomherkenning (flexibiliteit voor export variaties)
const ALIASES = {
    orderId: ['order', 'ordernummer', 'productieorder', 'tisfc010.pdno', 'fo'],
    status: ['status', 'orderstatus', 'tisfc010.stts', 'ap'],
    minutes: ['productietijd', 'minuten', 'tijd (min)', 'tisfc140.prtm', 'bc'],
    quantity: ['aantal', 'hoeveelheid', 'quantity', 'tisfc140.qty', 'bd'],
    operation: ['bewerking', 'operation', 'op', 'tisfc010.opno']
};
/**
 * Vindt de index van een kolom op basis van aliassen of fallback
 */
const findColumnIndex = (headers, targetKey) => {
    if (headers && Array.isArray(headers)) {
        const index = headers.findIndex(h => h && ALIASES[targetKey].includes(String(h).toLowerCase().trim()));
        if (index !== -1)
            return index;
    }
    // Fallback naar de bekende vaste indexen (0-based)
    if (targetKey === 'minutes')
        return 54; // BC
    if (targetKey === 'quantity')
        return 55; // BD
    if (targetKey === 'orderId')
        return 170; // FO
    if (targetKey === 'status')
        return 41; // AP
    return -1;
};
/**
 * Veilige nummer parsing (handelt komma's af voor NL formaat)
 */
const parseFloatSafe = (val) => {
    if (typeof val === 'number')
        return val;
    if (typeof val === 'string')
        return parseFloat(val.replace(',', '.'));
    return 0;
};
export const processInforUpdate = async (db, appId, csvData) => {
    if (!csvData || csvData.length < 1) {
        return {
            countCreated: 0,
            countUpdated: 0,
            countDeleted: 0,
            countMatched: 0,
            unmatchedOrders: [],
        };
    }
    // db/appId params blijven voor backward compatibility met bestaande callsites.
    return processInforUpdateCallable(csvData);
};
