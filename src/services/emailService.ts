import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  templateId?: string;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type SendEmailResult = {
  ok: boolean;
  id: string;
};

/**
 * Verstuurt een email via de Resend Cloud Function.
 * 
 * @param {Object} options
 * @param {string|string[]} options.to - Ontvanger(s) e-mailadres
 * @param {string} options.subject - Onderwerp van de e-mail
 * @param {string} [options.html] - HTML body van de e-mail
 * @param {string} [options.text] - Plain text body van de e-mail (optioneel als html is meegegeven)
 * @param {string} [options.from] - Afzender (optioneel, standaard 'Future Factory <onboarding@resend.dev>')
 * @param {string} [options.templateId] - ID van het e-mailtemplate in Firestore
 * @param {Object} [options.variables] - Variabelen om in het template te injecteren
 * @param {Object} [options.metadata] - Extra metadata voor logging
 * @returns {Promise<{ ok: boolean, id: string }>}
 */
export const sendEmail = async ({
  to,
  subject,
  html,
  text,
  from,
  templateId,
  variables,
  metadata,
}: SendEmailOptions): Promise<SendEmailResult> => {
  try {
    const sendEmailFn = httpsCallable<SendEmailOptions, SendEmailResult>(functions, 'sendEmail');
    const result = await sendEmailFn({ to, subject, html, text, from, templateId, variables, metadata });
    return result.data;
  } catch (error) {
    console.error('Fout bij versturen van e-mail via Cloud Function:', error);
    throw error;
  }
};
