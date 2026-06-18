// @ts-nocheck

const { db, admin } = require('../config/firebase');
const auditService = require('./auditService');
const { DB_PATHS, pathToSegments, getArchivePlanningPath, getArchiveEfficiencyPath } = require('../config/dbPaths');

const PLANNING_PATH = pathToSegments(DB_PATHS.PRODUCTION_PLANNING_LEGACY);
const EFFICIENCY_PATH = pathToSegments(DB_PATHS.EFFICIENCY_HOURS);

const ALIASES = {
  orderId: ['order', 'ordernummer', 'productieorder', 'tisfc010.pdno', 'fo'],
  status: ['status', 'orderstatus', 'tisfc010.stts', 'ap'],
  minutes: ['productietijd', 'minuten', 'tijd (min)', 'tisfc140.prtm', 'bc'],
  quantity: ['aantal', 'hoeveelheid', 'quantity', 'tisfc140.qty', 'bd'],
  operation: ['bewerking', 'operation', 'op', 'tisfc010.opno'],
};

const findColumnIndex = (headers, targetKey) => {
  if (headers && Array.isArray(headers)) {
    const index = headers.findIndex(
      (header) => header && ALIASES[targetKey].includes(String(header).toLowerCase().trim())
    );
    if (index !== -1) return index;
  }

  if (targetKey === 'minutes') return 54;
  if (targetKey === 'quantity') return 55;
  if (targetKey === 'orderId') return 170;
  if (targetKey === 'status') return 41;
  return -1;
};

const parseFloatSafe = (val) => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return Number.parseFloat(val.replace(',', '.'));
  return 0;
};

const getPlanningRef = () =>
  db.collection(PLANNING_PATH[0]).doc(PLANNING_PATH[1]).collection(PLANNING_PATH[2]).doc(PLANNING_PATH[3]).collection(PLANNING_PATH[4]);

const getEfficiencyRef = () =>
  db.collection(EFFICIENCY_PATH[0]).doc(EFFICIENCY_PATH[1]).collection(EFFICIENCY_PATH[2]);

const normalizeMachineForScoped = (rawValue = '') => {
  let token = String(rawValue || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!token) return '';
  if (token === 'BM18') token = 'BH18';
  if (token === '40BM18') token = '40BH18';
  if (/^40(BH|BM|BA)\d+$/.test(token)) return token;
  if (/^(BH|BM|BA)\d+$/.test(token)) return `40${token}`;
  const match = token.match(/(40)?(BH|BM|BA)\d+/);
  if (!match) return '';
  const noPrefix = match[0].replace(/^40/, '');
  if (/^(BH|BM|BA)\d+$/.test(noPrefix)) return `40${noPrefix}`;
  return '';
};

const sanitizeSegment = (value, fallback) => {
  const normalized = String(value || '')
    .trim()
    .replace(/[/.#?$\[\]]/g, '_')
    .replace(/\s+/g, '_');
  return normalized || fallback;
};

const getScopedEfficiencyDocRef = ({ departmentId, machineId, orderId }) => {
  const dep = sanitizeSegment(departmentId || 'Fittings', 'Fittings');
  const machine = sanitizeSegment(normalizeMachineForScoped(machineId) || machineId || 'UNASSIGNED', 'UNASSIGNED');
  return db
    .collection(EFFICIENCY_PATH[0])
    .doc(EFFICIENCY_PATH[1])
    .collection(EFFICIENCY_PATH[2])
    .doc(dep)
    .collection('machines')
    .doc(machine)
    .collection('items')
    .doc(String(orderId));
};

const getPlanningArchiveRef = (year) =>
  db.collection(getArchivePlanningPath(year));

const getEfficiencyArchiveRef = (year) =>
  db.collection(getArchiveEfficiencyPath(year));

const getScopedEfficiencyArchiveRef = ({ year, departmentId, machineId, orderId }) => {
  const dep = sanitizeSegment(departmentId || 'Fittings', 'Fittings');
  const machine = sanitizeSegment(normalizeMachineForScoped(machineId) || machineId || 'UNASSIGNED', 'UNASSIGNED');
  return db
    .collection(getArchiveEfficiencyPath(year))
    .collection('efficiency_scoped')
    .doc(dep)
    .collection('machines')
    .doc(machine)
    .collection('items')
    .doc(String(orderId));
};

async function processInforUpdateService(csvData = []) {
  if (!Array.isArray(csvData) || csvData.length < 1) {
    return { countCreated: 0, countUpdated: 0, countDeleted: 0, countMatched: 0, unmatchedOrders: [] };
  }

  const headers = csvData[0];
  const idx = {
    orderId: findColumnIndex(headers, 'orderId'),
    status: findColumnIndex(headers, 'status'),
    minutes: findColumnIndex(headers, 'minutes'),
    quantity: findColumnIndex(headers, 'quantity'),
    operation: findColumnIndex(headers, 'operation'),
  };

  const rowsToProcess = csvData.length > 1 ? csvData.slice(1) : csvData;
  const currentYear = new Date().getFullYear().toString();

  let countCreated = 0;
  let countUpdated = 0;
  let countDeleted = 0;
  let countMatched = 0;
  const unmatchedOrders = [];

  const ordersMap = new Map();

  for (const row of rowsToProcess) {
    const orderId = row[idx.orderId];
    if (!orderId) continue;

    const rawStatus = String(row[idx.status] || '').toLowerCase();
    const totalHours = parseFloatSafe(row[idx.minutes]);
    const totalMin = totalHours * 60;
    const qty = parseFloatSafe(row[idx.quantity]) || 1;
    const opCode = idx.operation !== -1 ? Number.parseInt(row[idx.operation], 10) : 0;

    if (!ordersMap.has(orderId)) {
      ordersMap.set(orderId, {
        orderId,
        status: rawStatus,
        quantity: qty,
        productionMinutes: 0,
        postProcessingMinutes: 0,
        qcMinutes: 0,
        operations: [],
      });
    }

    const entry = ordersMap.get(orderId);
    
    // Status aggregatie: Als één van de rijen nog 'actief' is, blijft de order actief in FF.
    // Alleen als alle unieke onderdelen 'gereed' zijn, mag hij naar archief.
    if (entry.status !== 'actief' && rawStatus) {
      entry.status = rawStatus;
    }
    
    // Kwantiteit aggregatie: We nemen het maximum gevonden aantal (LN herhaalt vaak het totaal per regel)
    if (qty > entry.quantity) entry.quantity = qty;

    entry.operations.push({ opCode, minutes: totalMin, status: rawStatus });

    if (opCode === 60) {
      entry.qcMinutes += totalMin;
    } else if (opCode === 30) {
      entry.postProcessingMinutes += totalMin;
    } else {
      entry.productionMinutes += totalMin;
    }
  }

  for (const orderData of ordersMap.values()) {
    const {
      orderId,
      status: rawStatus,
      quantity,
      productionMinutes,
      postProcessingMinutes,
      qcMinutes,
      operations,
    } = orderData;

    let isReady = rawStatus.includes('gereed') || rawStatus.includes('afgehandeld');
    
    // Extra check: even als de hoofstatus 'actief' is, maar alle bewerkingen zijn 'gereed',
    // dan beschouwen we hem toch als klaar voor archivering (ook conform suggestie gebruiker).
    if (!isReady && operations.length > 0) {
      const allOpsReady = operations.every(op => op.status.includes('gereed') || op.status.includes('afgehandeld'));
      if (allOpsReady) isReady = true;
    }

    let planningSnap = await getPlanningRef().where('orderId', '==', orderId).get();
    
    // RESTORE LOGICA: Als niet gevonden in actieve planning, zoek in het archief
    if (planningSnap.empty && !isReady) {
      const archiveSnap = await getPlanningArchiveRef(currentYear).where('orderId', '==', orderId).get();
      if (!archiveSnap.empty) {
        console.log(`[inforSync] Herstellende order ${orderId} uit archief naar actieve planning.`);
        for (const archDoc of archiveSnap.docs) {
          const data = archDoc.data();
          const beforeSnapshot = { ...data };
          // Verwijder archief-specifieke velden voordat we herstellen
          delete data.archivedAt;
          delete data.finalStatus;
          delete data.efficiencySnapshot;
          
          const restoredData = {
            ...data,
            restoredFromArchiveAt: new Date().toISOString(),
            status: 'active',
          };
          await getPlanningRef().add(restoredData);
          await archDoc.ref.delete();

          auditService.logSystem('ORDER_RESTORED_FROM_ARCHIVE', {
            orderId,
            archiveYear: currentYear,
            before: beforeSnapshot,
            after: restoredData,
          }, { category: 'PLANNING', severity: 'WARNING' });
        }
        // Haal de snapshot opnieuw op nu hij hersteld is
        planningSnap = await getPlanningRef().where('orderId', '==', orderId).get();
      }
    }

    if (planningSnap.empty) {
      unmatchedOrders.push(orderId);
      continue;
    }

    countMatched += 1;

    const planningSample = planningSnap.docs[0]?.data() || {};
    const scopedDepartment = planningSample.departmentId || planningSample.department || 'Fittings';
    const scopedMachine = planningSample.machine || planningSample.station || '';

    const efficiencyData = {
      orderId: String(orderId),
      standardTimeTotal: productionMinutes + postProcessingMinutes,
      productionTimeTotal: productionMinutes,
      postProcessingTimeTotal: postProcessingMinutes,
      qcTimeTotal: qcMinutes,
      quantity,
      minutesPerUnit: quantity > 0 ? (productionMinutes + postProcessingMinutes) / quantity : 0,
      status: isReady ? 'completed' : 'active',
      source: 'infor_ln',
      lastSync: new Date().toISOString(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      departmentId: sanitizeSegment(scopedDepartment, 'Fittings'),
      machineId: sanitizeSegment(normalizeMachineForScoped(scopedMachine) || scopedMachine || 'UNASSIGNED', 'UNASSIGNED'),
      _scopeType: 'efficiency_hours',
    };

    await getEfficiencyRef().doc(String(orderId)).set(efficiencyData, { merge: true });
    await getScopedEfficiencyDocRef({
      departmentId: scopedDepartment,
      machineId: scopedMachine,
      orderId,
    }).set(efficiencyData, { merge: true });

    if (isReady) {
      for (const planningDoc of planningSnap.docs) {
        const planningData = planningDoc.data();
        const articleId = planningData.articleId || planningData.item || '';
        const orderQty = Number(quantity);
        const inspectionApprovedQty = Number(planningData.produced || planningData.inspectionApprovedQty || 0);

        // DOORTEL LOGICA: Als deze order klaar is maar méér heeft geproduceerd dan gepland (overproductie),
        // probeer dan het verschil over te zetten naar de eerstvolgende order van hetzelfde artikel.
        if (inspectionApprovedQty > orderQty && articleId) {
          const surplus = inspectionApprovedQty - orderQty;
          console.log(`[inforSync] Overproductie van ${surplus} gevonden voor order ${orderId} (${articleId}). Zoeken naar volgende order...`);
          
          const nextOrderSnap = await getPlanningRef()
            .where('articleId', '==', articleId)
            .where('status', '==', 'active')
            .orderBy('plannedDate', 'asc')
            .limit(5)
            .get();

          let distributed = false;
          for (const nextDoc of nextOrderSnap.docs) {
            if (nextDoc.id === planningDoc.id) continue;
            
            const nextData = nextDoc.data();
            const currentProduced = Number(nextData.produced || 0);
            await nextDoc.ref.update({
                produced: currentProduced + surplus,
                overproductionCarriedFrom: orderId,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[inforSync] ${surplus} stuks overgedragen naar volgende order: ${nextData.orderId}`);
            distributed = true;
            auditService.logSystem('OVERPRODUCTION_CARRIED_FORWARD', {
              fromOrderId: orderId,
              toOrderId: nextData.orderId,
              articleId,
              surplusQty: surplus,
            }, { category: 'PRODUCTION', severity: 'WARNING' });
            break; // Slechts naar de eerstvolgende overdragen
          }
        }

        const archivePayload = {
          ...planningData,
          finalStatus: 'completed_in_ln',
          archivedAt: new Date().toISOString(),
          efficiencySnapshot: efficiencyData,
        };
        await getPlanningArchiveRef(currentYear).add(archivePayload);
        await planningDoc.ref.delete();
        countDeleted += 1;

        auditService.logSystem('ORDER_ARCHIVED_BY_INFOR_SYNC', {
          orderId,
          archiveYear: currentYear,
          before: planningData,
          after: { finalStatus: 'completed_in_ln', archivedAt: archivePayload.archivedAt },
        }, { category: 'PLANNING', severity: 'INFO' });
      }

      const effRef = getEfficiencyRef().doc(String(orderId));
      const effSnap = await effRef.get();
      if (effSnap.exists) {
        await getEfficiencyArchiveRef(currentYear).doc(String(orderId)).set({
          ...effSnap.data(),
          archivedAt: new Date().toISOString(),
          finalStatus: 'completed_in_ln',
        });
        await effRef.delete();
      }

      const scopedEffRef = getScopedEfficiencyDocRef({
        departmentId: scopedDepartment,
        machineId: scopedMachine,
        orderId,
      });
      const scopedEffSnap = await scopedEffRef.get();
      if (scopedEffSnap.exists) {
        await getScopedEfficiencyArchiveRef({
          year: currentYear,
          departmentId: scopedDepartment,
          machineId: scopedMachine,
          orderId,
        }).set({
          ...scopedEffSnap.data(),
          archivedAt: new Date().toISOString(),
          finalStatus: 'completed_in_ln',
        }, { merge: true });
        await scopedEffRef.delete();
      }
    } else {
      const syncTimestamp = new Date().toISOString();
      for (const planningDoc of planningSnap.docs) {
        const planningData = planningDoc.data() || {};
        const inspectionApprovedQty = Number(planningData.produced || 0);
        const deliveryInspectionDelta = Number(quantity) - inspectionApprovedQty;

        const updatePayload = {
          quantity,
          lnDeliveredQty: Number(quantity),
          deliveredQty: Number(quantity),
          inspectionApprovedQty,
          deliveryInspectionDelta,
          deliveryInspectionMismatch: deliveryInspectionDelta !== 0,
          deliveryInspectionLastCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSync: syncTimestamp,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        };
        await planningDoc.ref.set(updatePayload, { merge: true });

        if (deliveryInspectionDelta !== 0) {
          auditService.logSystem('ORDER_QTY_MISMATCH_DETECTED', {
            orderId,
            lnDeliveredQty: Number(quantity),
            inspectionApprovedQty,
            delta: deliveryInspectionDelta,
          }, { category: 'QUALITY', severity: 'WARNING' });
        }
      }
      countUpdated += 1;
    }
  }

  return {
    countCreated,
    countUpdated,
    countDeleted,
    countMatched,
    unmatchedOrders,
  };
}

module.exports = {
  processInforUpdateService,
};
