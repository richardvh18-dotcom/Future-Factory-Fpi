const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const XLSX = require('xlsx');
const { withAudit } = require('../utils/withAudit');

const db = admin.firestore();

/**
 * Genereert een Excel export op de achtergrond en slaat deze op in Firestore
 * zodat het systeem niet wordt belast.
 */
exports.requestExportTask = withAudit(
    'REQUEST_EXPORT_TASK',
    async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'De gebruiker moet ingelogd zijn.');
    }

    const { exportType, filter = {}, taskName } = data;
    const userId = context.auth.uid;

    // 1. Maak een Task document aan om de voortgang bij te houden
    const taskRef = await db.collection('future-factory/exports/tasks').add({
        userId,
        exportType,
        status: 'processing',
        progress: 0,
        taskName: taskName || `Export ${exportType}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Start de verwerking (we wachten niet op het resultaat via await in deze return)
    // Maar we gebruiken een aparte async flow of we doen het direct hier als we v1 gebruiken (snelle timeout)
    // Voor grotere datasets is een PubSub of Queue beter, maar voor nu doen we de verwerking direct.
    
    try {
        let exportData = [];
        
        if (exportType === 'ln_compare') {
            exportData = await generateLNCompareData(filter);
        } else if (exportType === 'planning') {
            // Voeg hier andere types toe indien nodig
        }

        // 2. Genereer Excel buffer
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Export");
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // 3. Sla het resultaat op (Base64 voor demo, of Firebase Storage voor productie)
        // Omdat we in deze omgeving v1 gebruiken en de limiet voor Firestore docs 1MB is,
        // is Storage beter. Maar voor nu slaan we een "downloadUrl" referentie op.
        // Simulatie: we slaan het op in een subcollectie of Storage.
        
        // Voor nu: we simuleren de download.
        await taskRef.update({
            status: 'completed',
            progress: 100,
            result: buffer.toString('base64'),
            fileName: `Export_${exportType}_${new Date().getTime()}.xlsx`,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

    } catch (error) {
        console.error('Export Task Error:', error);
        await taskRef.update({
            status: 'failed',
            error: error.message,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    return { taskId: taskRef.id };
    },
    (handler) => functions.region('europe-west1').https.onCall(handler),
);

async function generateLNCompareData(filter) {
    const { selectedMachine } = filter;
    
    const ordersSnapshot = await db.collection('future-factory/production/digital_planning').get();
    const productsSnapshot = await db.collection('future-factory/production/tracked_products').get();

    const allOrders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const allProducts = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const filteredOrders = allOrders.filter(o => {
        if (!selectedMachine || selectedMachine === "Alle machines") return true;
        let m = String(o.machine || "").toUpperCase().replace(/\s/g, "");
        if (m.startsWith("40")) m = m.slice(2);
        let filterM = selectedMachine.toUpperCase().replace(/\s/g, "");
        if (filterM.startsWith("40")) filterM = filterM.slice(2);
        return m === filterM;
    });

    return filteredOrders.map(order => {
        const orderId = String(order.orderId || "").trim().toUpperCase();
        const orderProducts = allProducts.filter(p => String(p.orderId || "").trim().toUpperCase() === orderId);
        
        const gereedCount = orderProducts.filter(p => {
            const stepUpper = String(p.currentStep || "").toUpperCase();
            const statusUpper = String(p.status || "").toUpperCase();
            const isArchived = !!(p.archived || p._archived || p.archivedAt);
            return isArchived || statusUpper === "COMPLETED" || statusUpper === "GEREED" || stepUpper === "FINISHED";
        }).length;

        return {
            "Ordernummer": orderId,
            "Datum": order.deliveryDate || "",
            "Afdeling": order.machine || "",
            "Status": order.isGeheelGereed ? "Gereed" : "Actief",
            "Artikel": order.itemCode || order.articleId || "",
            "Omschrijving": order.item || order.description || "",
            "Plan Aantal": Number(order.plan || order.quantity || 0),
            "Gemaakt Aantal": gereedCount,
            "Totaal Gemaakt": gereedCount,
            "Laatste Sync": order.lastSync || ""
        };
    });
}
