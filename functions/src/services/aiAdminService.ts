// @ts-nocheck

const { db, admin } = require('../config/firebase');
const { DB_PATHS } = require('../config/dbPaths');

const aiConfigRef = () => db.doc(DB_PATHS.AI_CONFIG_MAIN);
const aiDocsRef = () => db.collection(DB_PATHS.AI_DOCUMENTS_RECORDS);
const aiKnowledgeRef = () => db.collection(DB_PATHS.AI_KNOWLEDGE_RECORDS);

const clean = (value) => String(value || '').trim();

async function saveAiContextConfigService({ systemPrompt = '', actorEmail = '' }) {
  const prompt = String(systemPrompt || '');
  if (!prompt) {
    throw new Error('systemPrompt is verplicht.');
  }

  await aiConfigRef().set(
    {
      systemPrompt: prompt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: clean(actorEmail) || 'admin',
    },
    { merge: true }
  );

  return { ok: true };
}

async function createAiDocumentRecordService({ payload = {}, actorEmail = '' }) {
  const fileName = clean(payload.fileName);
  if (!fileName) {
    throw new Error('fileName is verplicht.');
  }

  const docRef = await aiDocsRef().add({
    ...payload,
    fileName,
    uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
    uploadedBy: clean(actorEmail) || payload.uploadedBy || 'admin',
  });

  return { ok: true, docId: docRef.id };
}

async function updateAiDocumentRecordService({ docId = '', patch = {} }) {
  const id = clean(docId);
  if (!id) {
    throw new Error('docId is verplicht.');
  }

  await aiDocsRef().doc(id).set(
    {
      ...patch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true, docId: id };
}

async function deleteAiDocumentRecordService({ docId = '' }) {
  const id = clean(docId);
  if (!id) {
    throw new Error('docId is verplicht.');
  }

  await aiDocsRef().doc(id).delete();
  return { ok: true, docId: id };
}

async function verifyAiKnowledgeEntryService({ entryId = '', correctedAnswer = null, actorEmail = '' }) {
  const id = clean(entryId);
  if (!id) {
    throw new Error('entryId is verplicht.');
  }

  await aiKnowledgeRef().doc(id).set(
    {
      verified: true,
      correctedAnswer: correctedAnswer || null,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      verifiedBy: clean(actorEmail) || 'Admin',
    },
    { merge: true }
  );

  return { ok: true, entryId: id };
}

async function deleteAiKnowledgeEntryService({ entryId = '' }) {
  const id = clean(entryId);
  if (!id) {
    throw new Error('entryId is verplicht.');
  }

  await aiKnowledgeRef().doc(id).delete();
  return { ok: true, entryId: id };
}

async function migrateAiKnowledgeFieldsService() {
  const snap = await aiKnowledgeRef().get();
  if (snap.empty) {
    return { ok: true, updated: 0 };
  }

  let updated = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const patch = {};

    if (data.userInput && !data.question) {
      patch.question = data.userInput;
    }
    if (data.question && !data.userInput) {
      patch.userInput = data.question;
    }

    if (Object.keys(patch).length) {
      await docSnap.ref.set(patch, { merge: true });
      updated += 1;
    }
  }

  return { ok: true, updated };
}

module.exports = {
  saveAiContextConfigService,
  createAiDocumentRecordService,
  updateAiDocumentRecordService,
  deleteAiDocumentRecordService,
  verifyAiKnowledgeEntryService,
  deleteAiKnowledgeEntryService,
  migrateAiKnowledgeFieldsService,
};
