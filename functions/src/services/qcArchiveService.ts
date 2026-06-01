import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

type ArchiveKind = "qc_measurements" | "qc_inspections";
type MeasurementType = "ri" | "tg" | "unknown";
type GenericRecordType = string;

const SOURCE_COLLECTIONS: Record<ArchiveKind, string> = {
  qc_measurements: "future-factory/production/qc_measurements",
  qc_inspections: "future-factory/production/qc_inspections",
};

const ARCHIVE_ROOT = "future-factory/production/archive";
const BATCH_SIZE = 200;

const getAmsterdamMonthKey = (dateLike: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
  }).format(dateLike);

const parseDateLike = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    const converted = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(converted.getTime()) ? null : converted;
  }

  const raw = String(value || "").trim();
  if (!raw) return null;

  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const dutchPattern = raw.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (dutchPattern) {
    const [, dd, mm, yyyy, hh = "00", min = "00"] = dutchPattern;
    const fallback = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  return null;
};

const resolveArchiveMonthKey = (data: Record<string, unknown>): string | null => {
  const measuredAt = parseDateLike(data.measuredAt);
  if (measuredAt) return getAmsterdamMonthKey(measuredAt);

  const createdAt = parseDateLike(data.createdAt);
  if (createdAt) return getAmsterdamMonthKey(createdAt);

  const updatedAt = parseDateLike(data.updatedAt);
  if (updatedAt) return getAmsterdamMonthKey(updatedAt);

  return null;
};

const resolveMeasurementType = (data: Record<string, unknown>): MeasurementType => {
  const rawType = String(data.type || data.measurementType || "").trim().toLowerCase();
  if (rawType === "ri" || rawType === "brix") return "ri";
  if (rawType === "tg") return "tg";
  if (data.ri !== undefined && data.ri !== null) return "ri";
  if (data.refractiveIndex !== undefined && data.refractiveIndex !== null) return "ri";
  if (data.brix !== undefined && data.brix !== null) return "ri";
  if (data.tg !== undefined && data.tg !== null) return "tg";
  return "unknown";
};

const getArchiveCollectionPath = (kind: ArchiveKind, monthKey: string, measurementType?: MeasurementType): string => {
  if (kind === "qc_measurements") {
    const typeSegment = measurementType && measurementType !== "unknown" ? measurementType : "misc";
    return `${ARCHIVE_ROOT}/${kind}/${monthKey}/types/${typeSegment}/items`;
  }

  return `${ARCHIVE_ROOT}/${kind}/${monthKey}/items`;
};

const getGenericArchiveCollectionPath = (monthKey: string, recordType: GenericRecordType): string =>
  `${ARCHIVE_ROOT}/qc_records/${monthKey}/types/${String(recordType || "unknown").toLowerCase()}/items`;

const archiveCollection = async (kind: ArchiveKind): Promise<{ archived: number; skipped: number }> => {
  const db = getFirestore();
  const sourceCollection = db.collection(SOURCE_COLLECTIONS[kind]);
  const currentMonthKey = getAmsterdamMonthKey(new Date());

  let archived = 0;
  let skipped = 0;

  while (true) {
    const snapshot = await sourceCollection.orderBy("createdAt", "asc").limit(BATCH_SIZE).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    let batchOps = 0;
    let reachedCurrentMonth = false;

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as Record<string, unknown>;
      const archiveMonthKey = resolveArchiveMonthKey(data);

      if (!archiveMonthKey) {
        skipped += 1;
        continue;
      }

      if (archiveMonthKey === currentMonthKey) {
        reachedCurrentMonth = true;
        break;
      }

      const measurementType = kind === "qc_measurements" ? resolveMeasurementType(data) : undefined;
      const archiveRef = db.collection(getArchiveCollectionPath(kind, archiveMonthKey, measurementType)).doc(docSnap.id);
      batch.set(archiveRef, {
        ...data,
        archivedAt: FieldValue.serverTimestamp(),
        archiveMonthKey,
        archiveMeasurementType: measurementType || null,
        archiveSourceCollection: SOURCE_COLLECTIONS[kind],
        archiveSourcePath: docSnap.ref.path,
      });
      batch.delete(docSnap.ref);
      archived += 1;
      batchOps += 2;

      if (batchOps >= 400) {
        break;
      }
    }

    if (batchOps > 0) {
      await batch.commit();
    }

    if (reachedCurrentMonth || snapshot.docs.length < BATCH_SIZE) {
      break;
    }
  }

  return { archived, skipped };
};

export const archiveQcDataService = async () => {
  const measurements = await archiveCollection("qc_measurements");
  const inspections = await archiveCollection("qc_inspections");

  const db = getFirestore();
  const currentMonthKey = getAmsterdamMonthKey(new Date());
  let genericArchived = 0;
  let genericSkipped = 0;

  while (true) {
    const snapshot = await db
      .collectionGroup("items")
      .where("recordFamily", "==", "qc_records")
      .limit(BATCH_SIZE)
      .get();

    if (snapshot.empty) break;

    const batch = db.batch();
    let batchOps = 0;
    let reachedCurrentMonth = false;

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as Record<string, unknown>;
      const archiveMonthKey = resolveArchiveMonthKey(data);

      if (!archiveMonthKey) {
        genericSkipped += 1;
        continue;
      }

      if (archiveMonthKey === currentMonthKey) {
        reachedCurrentMonth = true;
        break;
      }

      const recordType = String(data.recordType || data.measurementType || data.recordKind || "unknown").toLowerCase();
      const archiveRef = db.collection(getGenericArchiveCollectionPath(archiveMonthKey, recordType)).doc(docSnap.id);
      batch.set(archiveRef, {
        ...data,
        archivedAt: FieldValue.serverTimestamp(),
        archiveMonthKey,
        archiveRecordType: recordType,
        archiveSourcePath: docSnap.ref.path,
      });
      batch.delete(docSnap.ref);
      genericArchived += 1;
      batchOps += 2;

      if (batchOps >= 400) {
        break;
      }
    }

    if (batchOps > 0) {
      await batch.commit();
    }

    if (reachedCurrentMonth || snapshot.docs.length < BATCH_SIZE) {
      break;
    }
  }

  return {
    ok: true,
    measurements,
    inspections,
    generic: { archived: genericArchived, skipped: genericSkipped },
  };
};
