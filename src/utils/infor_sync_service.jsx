/**
 * infor_sync_service.js
 * Afhandeling van Infor LN data.
 * Combineert dynamische kolomherkenning met vaste fallbacks voor robuustheid.
 */

import { 
  collection, doc, getDocs, query, where, 
  deleteDoc, addDoc, setDoc, getDoc 
} from 'firebase/firestore';
import { PATHS, getPlanningArchivePath, getEfficiencyArchivePath } from '../config/dbPaths';
import { patchPlanningOrderMetadata } from '../services/planningSecurityService';
import { logActivity } from '../config/firebase';

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
    const index = headers.findIndex(h => 
      h && ALIASES[targetKey].includes(String(h).toLowerCase().trim())
    );
    if (index !== -1) return index;
  }
  
  // Fallback naar de bekende vaste indexen (0-based)
  if (targetKey === 'minutes') return 54; // BC
  if (targetKey === 'quantity') return 55; // BD
  if (targetKey === 'orderId') return 170; // FO
  if (targetKey === 'status') return 41;   // AP
  
  return -1;
};

/**
 * Veilige nummer parsing (handelt komma's af voor NL formaat)
 */
const parseFloatSafe = (val) => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val.replace(',', '.'));
  return 0;
};

export const processInforUpdate = async (db, appId, csvData) => {
  if (!csvData || csvData.length < 1) return { countCreated: 0, countUpdated: 0, countDeleted: 0, countMatched: 0, unmatchedOrders: [] };

  // Probeer headers te lezen uit de eerste rij
  const headers = csvData[0];
  // Bepaal indexen dynamisch
  const idx = {
    orderId: findColumnIndex(headers, 'orderId'),
    status: findColumnIndex(headers, 'status'),
    minutes: findColumnIndex(headers, 'minutes'),
    quantity: findColumnIndex(headers, 'quantity'),
    operation: findColumnIndex(headers, 'operation')
  };

  // 1. Planning (Operationeel): Alleen Order, Item, Aantal
  const planningRef = collection(db, ...PATHS.PLANNING);
  
  // 2. Efficiency (Data): Uren, Normen, Efficiency
  const efficiencyRef = collection(db, ...PATHS.EFFICIENCY_HOURS);
  
  let countCreated = 0;
  let countUpdated = 0;
  let countDeleted = 0;
  let countMatched = 0;
  const unmatchedOrders = [];

  // Start loop (sla header over als we die gebruikt hebben voor detectie, anders verwerk alles)
  // We nemen aan dat rij 0 headers zijn, dus we beginnen bij slice(1)
  const rowsToProcess = csvData.length > 1 ? csvData.slice(1) : csvData;
  const currentYear = new Date().getFullYear().toString();

  // STAP 0: Aggregatie van regels per order (om dubbele regels en operaties samen te voegen)
  const ordersMap = new Map();

  for (const row of rowsToProcess) {
    const orderId = row[idx.orderId];
    if (!orderId) continue;

    const rawStatus = String(row[idx.status] || '').toLowerCase();
    // Input is in UREN, converteren naar MINUTEN
    const totalHours = parseFloatSafe(row[idx.minutes]);
    const totalMin = totalHours * 60;
    const qty = parseFloatSafe(row[idx.quantity]) || 1;
    const opCode = idx.operation !== -1 ? parseInt(row[idx.operation]) : 0;

    if (!ordersMap.has(orderId)) {
      ordersMap.set(orderId, {
        orderId,
        status: rawStatus,
        quantity: qty,
        productionMinutes: 0,
        postProcessingMinutes: 0,
        qcMinutes: 0
      });
    }

    const entry = ordersMap.get(orderId);
    if (rawStatus) entry.status = rawStatus;
    if (qty > entry.quantity) entry.quantity = qty; // Pak de grootste hoeveelheid als er verschil is

    // Splits tijd op basis van operatie
    // 60 = QC (Negeren voor productietijd, apart opslaan)
    // 30 = Nabewerking (Apart opslaan)
    // 20 (Productie), etc = Productie
    if (opCode === 60) {
      entry.qcMinutes += totalMin;
    } else if (opCode === 30) {
      entry.postProcessingMinutes += totalMin;
    } else {
      entry.productionMinutes += totalMin;
    }
  }

  // STAP 1 & 2: Verwerken van geaggregeerde orders
  for (const orderData of ordersMap.values()) {
    const { orderId, status: rawStatus, quantity, productionMinutes, postProcessingMinutes, qcMinutes } = orderData;
    
    const isReady = rawStatus.includes('gereed') || rawStatus.includes('afgehandeld');
    
    // Check of order bestaat in Planning
    const q = query(planningRef, where("orderId", "==", orderId));
    const snap = await getDocs(q);

    if (snap.empty) {
      unmatchedOrders.push(orderId);
      continue;
    }

    countMatched++;

    // Update Efficiency Database (QC tijd apart opgeslagen, niet in totaal)
    const efficiencyData = {
      orderId: String(orderId),
      standardTimeTotal: productionMinutes + postProcessingMinutes, // Totaal voor efficiency
      productionTimeTotal: productionMinutes, // BM/BA (Op 20)
      postProcessingTimeTotal: postProcessingMinutes, // Nabewerking (Op 30)
      qcTimeTotal: qcMinutes,
      quantity: quantity,
      minutesPerUnit: quantity > 0 ? (productionMinutes + postProcessingMinutes) / quantity : 0,
      status: isReady ? 'completed' : 'active',
      source: 'infor_ln',
      lastSync: new Date().toISOString()
    };
    
    await setDoc(doc(efficiencyRef, String(orderId)), efficiencyData, { merge: true });
    await logActivity(
      'system',
      'INFOR_EFFICIENCY_SYNC',
      `Efficiency gesynchroniseerd voor order ${orderId} (status: ${isReady ? 'completed' : 'active'})`
    );

    if (isReady) {
      // Archiveer Planning Doc
      for (const d of snap.docs) {
        const docData = d.data();
        const archiveRef = collection(db, ...getPlanningArchivePath(currentYear));
        
        await addDoc(archiveRef, {
          ...docData,
          finalStatus: 'completed_in_ln',
          archivedAt: new Date().toISOString(),
          efficiencySnapshot: efficiencyData 
        });
        await logActivity('system', 'INFOR_PLANNING_ARCHIVE', `Planning order gearchiveerd: ${orderId}`);
        
        await deleteDoc(d.ref);
        await logActivity('system', 'INFOR_PLANNING_DELETE', `Planning order verwijderd na LN gereedmelding: ${orderId}`);
        countDeleted++;
      }

      // Archiveer Efficiency Doc
      const effDocRef = doc(efficiencyRef, String(orderId));
      const effDocSnap = await getDoc(effDocRef);
      if (effDocSnap.exists()) {
         // Archiveren per jaar in /archive/{JAAR}/efficiency
         const yearEfficiencyArchiveRef = collection(db, ...getEfficiencyArchivePath(currentYear));
         
         await setDoc(doc(yearEfficiencyArchiveRef, String(orderId)), {
          ...effDocSnap.data(),
          archivedAt: new Date().toISOString(),
          finalStatus: 'completed_in_ln'
        });
        await logActivity('system', 'INFOR_EFFICIENCY_ARCHIVE', `Efficiency gearchiveerd voor order ${orderId}`);
        await deleteDoc(effDocRef);
        await logActivity('system', 'INFOR_EFFICIENCY_DELETE', `Efficiency verwijderd na archivering: ${orderId}`);
      }
    } else {
      // Update Planning Doc
      const existingDoc = snap.docs[0];
      await patchPlanningOrderMetadata({
        orderDocId: existingDoc.id,
        patch: {
          quantity: quantity,
          lastSync: new Date().toISOString(),
        },
        source: 'infor_sync_service',
      });
      await logActivity('system', 'INFOR_PLANNING_UPDATE', `Planning bijgewerkt vanuit LN voor order ${orderId}`);
      countUpdated++;
    }
  }

  await logActivity(
    'system',
    'INFOR_SYNC_RUN',
    `LN sync afgerond. Matched: ${countMatched}, Updated: ${countUpdated}, Deleted: ${countDeleted}, Unmatched: ${unmatchedOrders.length}`
  );

  return { countCreated, countUpdated, countDeleted, countMatched, unmatchedOrders };
};
