/**
 * Run dit script om de initiële label-printregels te importeren in Firestore.
 * Zorg dat je admin rechten/service account JSON geconfigureerd hebt.
 * 
 * Commando: node scripts/import-label-rules.cjs
 */

const { initializeApp, cert, applicationDefault } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  "future-factory-377ef";

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (serviceAccountJson) {
  initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), projectId });
} else {
  initializeApp({ credential: applicationDefault(), projectId });
}

const db = getFirestore();
const RULES_COLLECTION = "future-factory/settings/label_print_rules";

const initialRules = [
  {
    name: "Standaard Basisregel",
    priority: 10,
    active: true,
    conditions: [
      { field: "productType", operator: "!=", value: "X_ONMOGELIJK_X" }
    ],
    output: {
      labelCount: 1,
      labelSizeId: "Large"
    }
  },
  {
    name: "Kleine Elbows (< 100)",
    priority: 20,
    active: true,
    conditions: [
      { field: "productType", operator: "contains", value: "ELBOW" },
      { field: "diameterVal", operator: "<", value: 100 }
    ],
    output: {
      labelCount: 1,
      labelSizeId: "Slim"
    }
  },
  {
    name: "Middelgrote Elbows (100 - 450)",
    priority: 30,
    active: true,
    conditions: [
      { field: "productType", operator: "contains", value: "ELBOW" },
      { field: "diameterVal", operator: ">=", value: 100 },
      { field: "diameterVal", operator: "<=", value: 450 }
    ],
    output: {
      labelCount: 2,
      labelSizeId: "Large"
    }
  },
  {
    name: "Standaard Flens Label",
    priority: 40,
    active: true,
    conditions: [
      { field: "productType", operator: "contains", value: "FLANGE" }
    ],
    output: {
      labelCount: 1,
      labelSizeId: "Large",
      requiredTags: ["FLENS"]
    }
  },
  {
    name: "Grote Flenzen (> 450)",
    priority: 50,
    active: true,
    conditions: [
      { field: "productType", operator: "contains", value: "FLANGE" },
      { field: "diameterVal", operator: ">", value: 450 }
    ],
    output: {
      labelCount: 2,
      labelSizeId: "Large",
      requiredTags: ["FLENS"]
    }
  }
];

async function importRules() {
  console.log("Start importeren van label print regels...");
  
  const batch = db.batch();
  
  for (const rule of initialRules) {
    const ref = db.collection(RULES_COLLECTION).doc();
    batch.set(ref, {
      ...rule,
      createdAt: FieldValue.serverTimestamp()
    });
    console.log(`Toegevoegd aan batch: ${rule.name}`);
  }

  try {
    await batch.commit();
    console.log("✅ Alle regels succesvol geïmporteerd!");
  } catch (err) {
    console.error("❌ Fout bij importeren:", err);
  }
}

importRules().then(() => process.exit(0));