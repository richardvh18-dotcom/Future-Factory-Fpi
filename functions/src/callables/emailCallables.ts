// @ts-nocheck

const functions = require('firebase-functions/v1');
const { sendEmailInternal } = require('../utils/emailHelper');
const { withAudit } = require('../utils/withAudit');

exports.sendEmail = withAudit(
  'SEND_EMAIL',
  async (data, context) => {
  // Optioneel: Haal commentaar weg als je wilt dat alleen ingelogde gebruikers mails kunnen sturen
  // if (!context.auth?.uid) {
  //   throw new functions.https.HttpsError('unauthenticated', 'Inloggen vereist.');
  // }

  try {
    const result = await sendEmailInternal({
      ...data,
      variables: {
        ...data.variables,
        userId: context.auth?.uid
      }
    });
    return result;
  } catch (err) {
    throw new functions.https.HttpsError('internal', err.message || 'Kon email niet versturen.');
  }
  },
  (handler) => functions.runWith({ secrets: ['RESEND_API_KEY'] }).https.onCall(handler),
);
