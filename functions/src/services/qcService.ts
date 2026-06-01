import { getFirestore, FieldValue } from "firebase-admin/firestore";

type MeasurementType = "ri" | "tg";

const getGenericRecordPath = (recordType: string): string =>
  `future-factory/production/qc_records/live/types/${String(recordType || "unknown").toLowerCase()}/items`;

const normalizeDepartmentName = (department?: string): string => {
  const value = String(department || "").trim();
  if (!value) return "";

  const lower = value.toLowerCase();
  if (lower === "fittings") return "Fittings";
  if (lower === "spoolbouw") return "Spoolbouw";
  if (lower === "buizen") return "Buizen";

  return value;
};

const normalizeMeasurementType = (value: unknown): MeasurementType => {
  const rawType = String(value || "").trim().toLowerCase();
  if (rawType === "tg") return "tg";
  if (rawType === "ri" || rawType === "brix") return "ri";
  return "ri";
};

const resolveTrackedRef = async (db: FirebaseFirestore.Firestore, payload: any) => {
  if (!payload?.lotNumber) return null;

  const lotUpper = String(payload.lotNumber).trim().toUpperCase();

  if (payload.trackedProductPath) {
    const explicitRef = db.doc(String(payload.trackedProductPath));
    const explicitSnap = await explicitRef.get();
    if (explicitSnap.exists) {
      return explicitRef;
    }
  }

  const rootTrackingQuery = await db
    .collection("future-factory/production/tracked_products")
    .where("lotNumber", "==", lotUpper)
    .limit(1)
    .get();

  if (!rootTrackingQuery.empty) {
    return rootTrackingQuery.docs[0].ref;
  }

  const scopedTrackingQuery = await db
    .collectionGroup("items")
    .where("lotNumber", "==", lotUpper)
    .limit(1)
    .get();

  if (!scopedTrackingQuery.empty) {
    return scopedTrackingQuery.docs[0].ref;
  }

  // Alleen BH18-lots (met 418) moeten altijd aan een bestaand productdossier gekoppeld zijn.
  if (lotUpper.includes("418")) {
    throw new Error(`Lotnummer ${lotUpper} is niet gevonden in de database. QC metingen moeten aan een bestaand productdossier gekoppeld worden.`);
  }

  // Voor overige machines mag QC tijdelijk zonder gekoppeld tracked product worden opgeslagen.
  return null;
};

const resolveMeasurementType = (payload: any): MeasurementType => {
  const rawType = String(payload?.type || payload?.measurementType || payload?.recordType || "").trim().toLowerCase();
  if (rawType === "tg" || (payload?.tg !== undefined && payload?.tg !== null)) return "tg";
  if (
    rawType === "ri" ||
    rawType === "brix" ||
    (payload?.ri !== undefined && payload?.ri !== null) ||
    (payload?.brix !== undefined && payload?.brix !== null) ||
    (payload?.refractiveIndex !== undefined && payload?.refractiveIndex !== null)
  ) {
    return "ri";
  }
  return "ri";
};

const getMeasurementCollectionPath = (measurementType: MeasurementType): string =>
  `future-factory/production/qc_measurements/live/types/${measurementType}/items`;

export const migrateLegacyQcDataService = async (options?: {
  limit?: number;
  dryRun?: boolean;
  migrateMeasurements?: boolean;
  migrateInspectionsToGeneric?: boolean;
}) => {
  const db = getFirestore();
  const limit = Math.max(1, Math.min(500, Number(options?.limit || 100)));
  const dryRun = options?.dryRun !== false;
  const migrateMeasurements = options?.migrateMeasurements !== false;
  const migrateInspectionsToGeneric = options?.migrateInspectionsToGeneric !== false;

  const result = {
    dryRun,
    scannedMeasurements: 0,
    movedMeasurements: 0,
    scannedInspections: 0,
    mirroredInspections: 0,
  };

  if (migrateMeasurements) {
    const snap = await db.collection("future-factory/production/qc_measurements").limit(limit).get();
    result.scannedMeasurements = snap.size;

    if (!dryRun && !snap.empty) {
      const batch = db.batch();
      for (const docSnap of snap.docs) {
        const data = docSnap.data() || {};
        const measurementType = resolveMeasurementType(data);
        const targetRef = db.collection(getMeasurementCollectionPath(measurementType)).doc(docSnap.id);
        const genericRef = db.collection(getGenericRecordPath(measurementType)).doc(docSnap.id);

        batch.set(targetRef, {
          ...data,
          measurementType,
          recordFamily: "qc_records",
          recordKind: "measurement",
          recordType: measurementType,
          migratedFromLegacyPath: docSnap.ref.path,
          migratedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        batch.set(genericRef, {
          ...data,
          measurementType,
          recordFamily: "qc_records",
          recordKind: "measurement",
          recordType: measurementType,
          migratedFromLegacyPath: docSnap.ref.path,
          migratedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        batch.delete(docSnap.ref);
        result.movedMeasurements += 1;
      }
      await batch.commit();
    }
  }

  if (migrateInspectionsToGeneric) {
    const snap = await db.collection("future-factory/production/qc_inspections").limit(limit).get();
    result.scannedInspections = snap.size;

    if (!dryRun && !snap.empty) {
      const batch = db.batch();
      for (const docSnap of snap.docs) {
        const data = docSnap.data() || {};
        const genericRef = db.collection(getGenericRecordPath("inspection")).doc(docSnap.id);
        batch.set(genericRef, {
          ...data,
          recordFamily: "qc_records",
          recordKind: "inspection",
          recordType: "inspection",
          mirroredFromInspectionPath: docSnap.ref.path,
          mirroredAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        result.mirroredInspections += 1;
      }
      await batch.commit();
    }
  }

  return result;
};

export const saveQcMeasurementService = async (payload: any) => {
  const db = getFirestore();

  const trackedRef = await resolveTrackedRef(db, payload);
  const measurementType = resolveMeasurementType(payload);

  const docRef = db.collection(getMeasurementCollectionPath(measurementType)).doc();
  const genericDocRef = db.collection(getGenericRecordPath(measurementType)).doc(docRef.id);
  
  const batch = db.batch();
  batch.set(docRef, {
    ...payload,
    measurementType,
    recordFamily: "qc_records",
    recordKind: "measurement",
    recordType: measurementType,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(genericDocRef, {
    ...payload,
    measurementType,
    recordFamily: "qc_records",
    recordKind: "measurement",
    recordType: measurementType,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (trackedRef) {
    const updateData: any = {};
    const addIfDefined = (key: string, value: unknown) => {
      if (value !== undefined) {
        updateData[key] = value;
      }
    };

    if (measurementType === "ri") {
      addIfDefined("measurements.Brix", payload.refractiveIndex);
      addIfDefined("measurements.Brix_Area", payload.area);
      addIfDefined("measurements.Brix_Ratio", payload.mixingRatio);
      addIfDefined("measurements.Brix_Department", normalizeDepartmentName(payload.department));
      addIfDefined("measurements.Brix_Kitchen", payload.kitchen);
      addIfDefined("measurements.Brix_TapPoint", payload.tapPoint);
      addIfDefined("measurements.Brix_Shift", payload.shift);
      addIfDefined("measurements.Brix_VisualCheck", payload.visualCheckOk);
      addIfDefined("measurements.Brix_ResinWeight", payload.resinWeight);
      addIfDefined("measurements.Brix_HardenerWeight", payload.hardenerWeight);
      addIfDefined("measurements.Brix_TableRef", payload.tableRef);
      addIfDefined("measurements.Brix_Operator", payload.actorLabel);
      addIfDefined("measurements.RI", payload.refractiveIndex);
      addIfDefined("measurements.RI_Area", payload.area);
      addIfDefined("measurements.RI_Ratio", payload.mixingRatio);
      addIfDefined("measurements.RI_Department", normalizeDepartmentName(payload.department));
      addIfDefined("measurements.RI_Kitchen", payload.kitchen);
      addIfDefined("measurements.RI_TapPoint", payload.tapPoint);
      addIfDefined("measurements.RI_Shift", payload.shift);
      addIfDefined("measurements.RI_VisualCheck", payload.visualCheckOk);
      addIfDefined("measurements.RI_ResinWeight", payload.resinWeight);
      addIfDefined("measurements.RI_HardenerWeight", payload.hardenerWeight);
      addIfDefined("measurements.RI_TableRef", payload.tableRef);
      addIfDefined("measurements.RI_Operator", payload.actorLabel);
    } else if (payload.tg !== undefined && payload.tg !== null && !isNaN(payload.tg)) {
      addIfDefined("measurements.Tg", payload.tg);
      if (payload.resinBatch) {
        updateData.resinBatch = payload.resinBatch;
      }
    }
    if (Object.keys(updateData).length > 0) batch.update(trackedRef, updateData);
  }

  await batch.commit();
  return { ok: true, id: docRef.id };
};

export const saveQcInspectionService = async (payload: any) => {
  const db = getFirestore();

  const trackedRef = await resolveTrackedRef(db, payload);

  const docRef = db.collection("future-factory/production/qc_inspections").doc();
  const genericDocRef = db.collection(getGenericRecordPath("inspection")).doc(docRef.id);
  
  const batch = db.batch();
  batch.set(docRef, {
    ...payload,
    recordFamily: "qc_records",
    recordKind: "inspection",
    recordType: "inspection",
    createdAt: FieldValue.serverTimestamp(),
  });

  batch.set(genericDocRef, {
    ...payload,
    recordFamily: "qc_records",
    recordKind: "inspection",
    recordType: "inspection",
    createdAt: FieldValue.serverTimestamp(),
  });

  if (trackedRef) {
    batch.update(trackedRef, {
      "inspection.status": payload.result === "OK" ? "Goedgekeurd" : "Afgekeurd",
      "inspection.lastNote": payload.note || "",
      "inspection.updatedAt": FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return { ok: true, id: docRef.id };
};

export const updateQcMeasurementService = async (payload: any) => {
  const db = getFirestore();

  const measurementId = String(payload?.measurementId || "").trim();
  if (!measurementId) {
    throw new Error("measurementId is verplicht.");
  }

  const candidateRefs = [
    db.doc(`future-factory/production/qc_measurements/live/types/ri/items/${measurementId}`),
    db.doc(`future-factory/production/qc_measurements/live/types/brix/items/${measurementId}`),
    db.doc(`future-factory/production/qc_measurements/live/types/tg/items/${measurementId}`),
    db.doc(`future-factory/production/qc_records/live/types/ri/items/${measurementId}`),
    db.doc(`future-factory/production/qc_records/live/types/brix/items/${measurementId}`),
    db.doc(`future-factory/production/qc_records/live/types/tg/items/${measurementId}`),
    db.doc(`future-factory/production/qc_measurements/${measurementId}`),
  ];

  let measurementRef = null as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData> | null;
  let measurementSnap = null as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData> | null;

  for (const candidateRef of candidateRefs) {
    const candidateSnap = await candidateRef.get();
    if (candidateSnap.exists) {
      measurementRef = candidateRef;
      measurementSnap = candidateSnap;
      break;
    }
  }

  if (!measurementRef || !measurementSnap) {
    throw new Error(`QC meting ${measurementId} is niet gevonden.`);
  }

  const existing = measurementSnap.data() || {};
  const resolvedType = normalizeMeasurementType(payload?.type || existing.type || existing.measurementType || existing.recordType || "");
  const genericDocRef = db.doc(`future-factory/production/qc_records/live/types/${resolvedType}/items/${measurementId}`);

  const nextLotNumber = String(payload?.lotNumber || existing.lotNumber || "").trim().toUpperCase();
  const nextTrackedProductPath = payload?.trackedProductPath ?? existing.trackedProductPath ?? null;

  const updatePayload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  const assignIfDefined = (key: string, value: unknown) => {
    if (value !== undefined) {
      updatePayload[key] = value;
    }
  };

  assignIfDefined("lotNumber", nextLotNumber || undefined);
  assignIfDefined("type", payload?.type !== undefined ? normalizeMeasurementType(payload?.type) : payload?.type);
  assignIfDefined("measurementType", payload?.type !== undefined ? normalizeMeasurementType(payload?.type) : payload?.measurementType);
  assignIfDefined("recordType", payload?.type !== undefined ? normalizeMeasurementType(payload?.type) : payload?.recordType);
  assignIfDefined("notes", payload?.notes);
  assignIfDefined("measuredAt", payload?.measuredAt);
  assignIfDefined("actorLabel", payload?.actorLabel);
  assignIfDefined("source", payload?.source);
  assignIfDefined("trackedProductPath", nextTrackedProductPath);

  assignIfDefined("department", payload?.department ? normalizeDepartmentName(payload.department) : payload?.department);
  assignIfDefined("kitchen", payload?.kitchen);
  assignIfDefined("tapPoint", payload?.tapPoint);
  assignIfDefined("shift", payload?.shift);
  assignIfDefined("resinWeight", payload?.resinWeight);
  assignIfDefined("hardenerWeight", payload?.hardenerWeight);
  assignIfDefined("refractiveIndex", payload?.refractiveIndex);
  assignIfDefined("visualCheckOk", payload?.visualCheckOk);
  assignIfDefined("tableRef", payload?.tableRef);
  assignIfDefined("mixingRatio", payload?.mixingRatio);
  assignIfDefined("area", payload?.area);
  assignIfDefined("ri", payload?.ri);
  assignIfDefined("brix", payload?.brix);
  assignIfDefined("resinBatch", payload?.resinBatch);
  assignIfDefined("tg", payload?.tg);

  const batch = db.batch();
  batch.update(measurementRef, updatePayload);
  batch.set(genericDocRef, {
    ...existing,
    ...payload,
    measurementType: resolvedType,
    recordFamily: "qc_records",
    recordKind: "measurement",
    recordType: resolvedType,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const trackedRef = await resolveTrackedRef(db, {
    lotNumber: nextLotNumber,
    trackedProductPath: nextTrackedProductPath,
  });

  if (trackedRef && resolvedType === "ri") {
    const merged = {
      ...existing,
      ...payload,
      lotNumber: nextLotNumber,
      department: payload?.department ? normalizeDepartmentName(payload.department) : normalizeDepartmentName(existing.department),
    };

    const trackedUpdate: Record<string, unknown> = {};
    const addIfDefined = (key: string, value: unknown) => {
      if (value !== undefined) {
        trackedUpdate[key] = value;
      }
    };

    addIfDefined("measurements.Brix", merged.refractiveIndex);
    addIfDefined("measurements.Brix_Area", merged.area);
    addIfDefined("measurements.Brix_Ratio", merged.mixingRatio);
    addIfDefined("measurements.Brix_Department", merged.department);
    addIfDefined("measurements.Brix_Kitchen", merged.kitchen);
    addIfDefined("measurements.Brix_TapPoint", merged.tapPoint);
    addIfDefined("measurements.Brix_Shift", merged.shift);
    addIfDefined("measurements.Brix_VisualCheck", merged.visualCheckOk);
    addIfDefined("measurements.Brix_ResinWeight", merged.resinWeight);
    addIfDefined("measurements.Brix_HardenerWeight", merged.hardenerWeight);
    addIfDefined("measurements.Brix_TableRef", merged.tableRef);
    addIfDefined("measurements.Brix_Operator", merged.actorLabel);
    addIfDefined("measurements.RI", merged.refractiveIndex);
    addIfDefined("measurements.RI_Area", merged.area);
    addIfDefined("measurements.RI_Ratio", merged.mixingRatio);
    addIfDefined("measurements.RI_Department", merged.department);
    addIfDefined("measurements.RI_Kitchen", merged.kitchen);
    addIfDefined("measurements.RI_TapPoint", merged.tapPoint);
    addIfDefined("measurements.RI_Shift", merged.shift);
    addIfDefined("measurements.RI_VisualCheck", merged.visualCheckOk);
    addIfDefined("measurements.RI_ResinWeight", merged.resinWeight);
    addIfDefined("measurements.RI_HardenerWeight", merged.hardenerWeight);
    addIfDefined("measurements.RI_TableRef", merged.tableRef);
    addIfDefined("measurements.RI_Operator", merged.actorLabel);

    if (Object.keys(trackedUpdate).length > 0) {
      batch.update(trackedRef, trackedUpdate);
    }
  }

  await batch.commit();
  return { ok: true, id: measurementId };
};