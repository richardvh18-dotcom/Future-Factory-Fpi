// @ts-nocheck

'use strict';

const functions = require('firebase-functions');

/**
 * Canonical mapping van interne service-foutcodes naar Firebase HttpsError.
 * Voeg hier nieuwe codes toe; catch blocks hoeven dit niet meer inline te doen.
 */
const ERROR_MAP = {
  // Not found
  NOT_FOUND_ORDER:                   { code: 'not-found',           message: 'Planning-order niet gevonden.' },
  NOT_FOUND_PRODUCT:                 { code: 'not-found',           message: 'Product niet gevonden in tracking.' },
  NOT_FOUND_ARCHIVED_PRODUCT:        { code: 'not-found',           message: 'Gearchiveerd product niet gevonden.' },
  NOT_FOUND_TARGET_ORDER:            { code: 'not-found',           message: 'Doelorder niet gevonden.' },
  NOT_FOUND_TRACKED:                 { code: 'not-found',           message: 'Geen tracking item gevonden.' },
  NOT_FOUND_PRINT_JOB:               { code: 'not-found',           message: 'Printjob niet gevonden.' },
  NOT_FOUND_ASSIGNMENT:              { code: 'not-found',           message: 'Toewijzing niet gevonden.' },
  NOT_FOUND_ISSUE:                   { code: 'not-found',           message: 'Melding niet gevonden.' },
  NOT_FOUND_OVERPRODUCTION_PRODUCTS: { code: 'not-found',           message: 'Geen actieve overproduction-producten gevonden.' },
  NO_PRODUCTS_FOUND:                 { code: 'not-found',           message: 'Geen actieve trackingproducten gevonden.' },

  // Invalid arguments
  INVALID_ADVANCE_TARGET:              { code: 'invalid-argument', message: 'Ongeldige doeltransitie.' },
  INVALID_FINISH_TYPE:                 { code: 'invalid-argument', message: 'Ongeldig finishType.' },
  INVALID_ISSUE_TYPE:                  { code: 'invalid-argument', message: 'Ongeldig issue type.' },
  INVALID_LOT_EDIT_PAYLOAD:            { code: 'invalid-argument', message: 'Ongeldige lotnummerwijziging payload.' },
  INVALID_LOT_FORMAT:                  { code: 'invalid-argument', message: 'Ongeldig lotformaat.' },
  INVALID_LOT_RANGE_SIZE:              { code: 'invalid-argument', message: 'count moet tussen 1 en 200 liggen.' },
  INVALID_LOT_SEQUENCE:                { code: 'invalid-argument', message: 'Ongeldige lot-volgorde.' },
  INVALID_MANUAL_ORDER_PAYLOAD:        { code: 'invalid-argument', message: 'Ongeldige payload voor handmatige order.' },
  INVALID_MESSAGES_PAYLOAD:            { code: 'invalid-argument', message: 'Ongeldige messages payload.' },
  INVALID_MOVE_TARGET:                 { code: 'invalid-argument', message: 'Ongeldig verplaatsingsdoel.' },
  INVALID_OCCUPANCY_ASSIGNMENT_IDS:    { code: 'invalid-argument', message: 'Ongeldige occupancy assignment ids.' },
  INVALID_OCCUPANCY_RECORDS:           { code: 'invalid-argument', message: 'Ongeldige bezettingsrecords.' },
  INVALID_ORDER_REASSIGN_PAYLOAD:      { code: 'invalid-argument', message: 'Ongeldige ordernummerwijziging payload.' },
  INVALID_OVERPRODUCTION_PAYLOAD:      { code: 'invalid-argument', message: 'Ongeldige overproduction payload.' },
  INVALID_PATCH_PAYLOAD:               { code: 'invalid-argument', message: 'Ongeldige planning patch payload.' },
  INVALID_PATCH_QUANTITY:              { code: 'invalid-argument', message: 'Ongeldige planning patch payload.' },
  INVALID_PERSONNEL_PAYLOAD:           { code: 'invalid-argument', message: 'Ongeldige personnel payload.' },
  INVALID_PRODUCT_ID:                  { code: 'invalid-argument', message: 'productId is ongeldig.' },
  INVALID_QC_NOTE_PAYLOAD:             { code: 'invalid-argument', message: 'Ongeldige payload voor QC-notitie.' },
  INVALID_RESTORE_ROUTE:               { code: 'invalid-argument', message: 'targetRoute is ongeldig.' },
  INVALID_START_PRODUCTION_LOTS_PAYLOAD: { code: 'invalid-argument', message: 'Ongeldige startpayload voor productie-lots.' },
  INVALID_WORKSTATION_START_PAYLOAD:   { code: 'invalid-argument', message: 'Ongeldige startpayload voor productie-run.' },
  LOT_MATCHES_ORDER_ID:                { code: 'invalid-argument', message: 'Lotnummer mag niet gelijk zijn aan ordernummer.' },
  LOT_NUMBER_UNCHANGED:                { code: 'invalid-argument', message: 'Ongeldige lotnummerwijziging payload.' },
  MISSING_SOURCE_ORDER:                { code: 'invalid-argument', message: 'Ongeldige ordernummerwijziging payload.' },
  NO_PRODUCTS_TO_ROUTE:                { code: 'invalid-argument', message: 'Geen producten om te routeren.' },
  NO_PRODUCTS_TO_UPDATE:               { code: 'invalid-argument', message: 'Geen producten opgegeven voor label update.' },
  ORDER_ID_UNCHANGED:                  { code: 'invalid-argument', message: 'Ongeldige ordernummerwijziging payload.' },

  // Already exists
  ALREADY_ACTIVE_IN_TRACKING: { code: 'already-exists',      message: 'Product is al actief in tracking.' },
  LOT_NUMBER_EXISTS:           { code: 'already-exists',      message: 'Lotnummer bestaat al in actieve tracking.' },
  ORDER_ALREADY_EXISTS:        { code: 'already-exists',      message: 'Order bestaat al in planning.' },

  // Failed preconditions
  ACTIVE_PRODUCTS_REMAIN: {
    code: 'failed-precondition',
    message: 'Er zijn nog actieve producten in productie. Archiveren is alleen mogelijk nadat het laatste product goedgekeurd is bij Eindinspectie.',
  },
  ALREADY_REJECTED:            { code: 'failed-precondition', message: 'Product is al definitief afgekeurd.' },
  INVALID_PRINT_QUEUE_TRANSITION: { code: 'failed-precondition', message: 'Ongeldige print queue statusovergang.' },

  // Resource exhausted
  NO_UNIQUE_LOT_AVAILABLE: { code: 'resource-exhausted', message: 'Geen uniek lotnummer beschikbaar voor deze machine/week.' },

  // Printing validation
  'Ongeldige printerId.':               { code: 'invalid-argument', message: 'printerId is ongeldig.' },
  'ZPL payload ontbreekt of is te groot.': { code: 'invalid-argument', message: 'zplData ontbreekt of is te groot.' },
  'Metadata is te groot.':              { code: 'invalid-argument', message: 'metadata is te groot.' },
};

/**
 * Vertaalt een interne servicefout naar een Firebase HttpsError.
 *
 * Gebruik in elke onCall catch block:
 *   } catch (error) { handleCallableError(error); }
 *
 * Gedrag:
 * - Al een HttpsError (bewust gegooid vóór het try block) → rethrow ongewijzigd.
 * - error.message zit in ERROR_MAP → throw HttpsError met canonical code + bericht.
 * - Onbekende fout → rethrow origineel (wordt door Firebase als 'internal' gelogd).
 */
const handleCallableError = (error) => {
  if (error instanceof functions.https.HttpsError) {
    throw error;
  }

  const mapped = ERROR_MAP[error?.message];
  if (mapped) {
    throw new functions.https.HttpsError(mapped.code, mapped.message);
  }

  throw error;
};

module.exports = { handleCallableError, ERROR_MAP };