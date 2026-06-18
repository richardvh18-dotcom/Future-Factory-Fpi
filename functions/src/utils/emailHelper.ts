// @ts-nocheck

const admin = require('firebase-admin');
const { Resend } = require('resend');
const { DB_PATHS } = require('../config/dbPaths');

/**
 * Interne helper om e-mails te versturen met template ondersteuning.
 * Wordt gedeeld door de https.onCall en de automation engine.
 */
async function sendEmailInternal({ to, subject, html, text, templateId, variables = {}, from = 'Future Factory <onboarding@resend.dev>', metadata = {} }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  if (!apiKey) {
    throw new Error('Resend API key ontbreekt in backend configuratie.');
  }

  const resend = new Resend(apiKey);

  // Als er een templateId is, haal het template op en vervang variabelen
  if (templateId) {
    const templateDoc = await admin.firestore().doc(`${DB_PATHS.EMAIL_TEMPLATES}/${templateId}`).get();
    if (!templateDoc.exists) {
      throw new Error(`Template met ID ${templateId} niet gevonden.`);
    }
    const template = templateDoc.data();

    // Gebruik subject en body van template als ze niet handmatig zijn overschreven
    subject = subject || template.subject;
    html = html || template.body;

    // Vervang variabelen in subject en html: {{variableName}}
    Object.keys(variables).forEach(key => {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      const value = String(variables[key] || '');
      subject = subject.replace(placeholder, value);
      if (html) html = html.replace(placeholder, value);
      if (text) text = text.replace(placeholder, value);
    });
  }

  // Pre-log poging
  const logRef = admin.firestore().collection(DB_PATHS.EMAIL_LOGS).doc();
  const logData = {
    to,
    subject,
    from,
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'pending',
    metadata,
    userId: variables.userId || 'system'
  };

  try {
    const { data: responseData, error } = await resend.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text
    });

    if (error) {
      console.error('Fout bij versturen email via Resend:', error);
      await logRef.set({ ...logData, status: 'error', error: error.message });
      throw new Error(error.message || 'Kon email niet versturen.');
    }

    await logRef.set({ ...logData, status: 'success', resendId: responseData?.id });
    return { ok: true, id: responseData?.id };
  } catch (err) {
    console.error('Fout bij aanroepen Resend API:', err);
    await logRef.set({ ...logData, status: 'error', error: err.message });
    throw err;
  }
}

module.exports = { sendEmailInternal };