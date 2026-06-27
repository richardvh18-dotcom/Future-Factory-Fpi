// @ts-nocheck

const { db, admin } = require('../config/firebase');
const { DB_PATHS } = require('../config/dbPaths');

/**
 * Update user profile settings (name, preferences, language, etc.)
 */
async function updateUserProfileService(userId, profileData) {
  if (!userId) {
    throw new Error('userId is verplicht.');
  }

  const userRef = db.collection(DB_PATHS.USERS_PROFILES).doc(userId);
  
  const sanitizedData = {
    uid: userId,
    email: profileData.email,
    name: String(profileData.name || '').trim(),
    receivesValidationAlerts: Boolean(profileData.emailNotifications),
    systemAlerts: Boolean(profileData.systemAlerts ?? true),
    language: String(profileData.language || 'nl').trim(),
    darkMode: Boolean(profileData.darkMode),
    phoneNumber: String(profileData.phoneNumber || '').trim(),
    department: String(profileData.department || '').trim(),
    signature: String(profileData.signature || '').trim(),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  };

  await userRef.set(sanitizedData, { merge: true });

  return { ok: true, userId };
}

/**
 * Clear the requirePasswordChange flag (after successful password update)
 */
async function clearPasswordChangeFlagService(userId) {
  if (!userId) {
    throw new Error('userId is verplicht.');
  }

  const userRef = db.collection(DB_PATHS.USERS_PROFILES).doc(userId);
  
  await userRef.set({ requirePasswordChange: false }, { merge: true });

  return { ok: true, userId };
}

/**
 * Submit a new account request (unauthenticated users can request access)
 */
async function submitAccountRequestService(requestData) {
  const name = String(requestData.name || '').trim();
  const email = String(requestData.email || '').trim();
  const country = String(requestData.country || '').trim();
  const department = String(requestData.department || '').trim();

  if (!name || !email) {
    throw new Error('Naam en e-mailadres zijn verplicht.');
  }

  if (!email.includes('@')) {
    throw new Error('Geldig e-mailadres vereist.');
  }

  const requestsRef = db.collection(DB_PATHS.ADMIN_ACCOUNT_REQUESTS);
  
  const docRef = await requestsRef.add({
    name,
    email,
    country,
    department,
    status: 'pending',
    requestedAt: admin.firestore.FieldValue.serverTimestamp(),
    processedAt: null,
    processedBy: null,
  });

  return { ok: true, requestId: docRef.id };
}

/**
 * Update user language preference
 */
async function updateUserLanguageService(userId, language) {
  if (!userId) {
    throw new Error('userId is verplicht.');
  }

  const lang = String(language || 'nl').trim().toLowerCase();
  const validLanguages = new Set(['nl', 'en', 'de', 'fr', 'ar']);
  
  if (!validLanguages.has(lang)) {
    throw new Error('Ongeldige taalcode.');
  }

  const userRef = db.collection(DB_PATHS.USERS_PROFILES).doc(userId);
  
  await userRef.set({ 
    language: lang,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true, userId, language: lang };
}

module.exports = {
  updateUserProfileService,
  clearPasswordChangeFlagService,
  submitAccountRequestService,
  updateUserLanguageService,
};
