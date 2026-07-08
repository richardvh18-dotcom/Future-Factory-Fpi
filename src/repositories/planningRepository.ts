/**
 * planningRepository.js
 *
 * Centraliseert alle Firestore-leesbewerkingen voor de planning.
 * Hooks mogen ALLEEN via dit bestand planning-data ophalen.
 *
 * Schrijfbewerkingen gaan altijd via Cloud Functions —
 * zie src/services/planningSecurityService.js.
 */

import {
  collection,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
  type QueryDocumentSnapshot,
  type DocumentData,
  type WhereFilterOp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { PATHS, getPathString } from '../config/dbPaths';

type RepoRecord = { id: string } & Record<string, unknown>;
type RepoDoc = QueryDocumentSnapshot<DocumentData>;
type SnapshotCallback = (docs: RepoDoc[]) => void;
type ErrorCallback = (err: Error) => void;

/** Maximale hoeveelheid planningorders uit env, met fallback. */
const planningLimit = () =>
  Math.max(10, Number(import.meta.env.VITE_PLANNING_LIMIT || 50));

/**
 * Schrijft je in op realtime updates van de planningcollectie.
 * Geeft een Firestore-unsubscribe-functie terug.
 *
 * @param {(docs: import('firebase/firestore').QueryDocumentSnapshot[]) => void} onData
 * @param {(err: Error) => void} onError
 * @returns {() => void} unsubscribe
 */
export const subscribePlanningOrders = (onData: SnapshotCallback, onError: ErrorCallback) => {
  const q = query(
    collection(db, getPathString(PATHS.PLANNING)),
    orderBy('deliveryDate', 'asc'),
    limit(planningLimit()),
  );
  return onSnapshot(q, (snap) => onData(snap.docs), onError);
};

/**
 * Eenmalige fetch van één planningorder op document-ID.
 *
 * @param {string} orderId  Firestore document-ID
 * @returns {Promise<{id: string, [key: string]: any} | null>}
 */
export const fetchPlanningOrder = async (orderId: string): Promise<RepoRecord | null> => {
  const snap = await getDoc(doc(db, getPathString([...PATHS.PLANNING, orderId])));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

/**
 * Eenmalige fetch van planningorders gefilterd op een veld.
 *
 * @param {string} field     Veldnaam om op te filteren
 * @param {'=='|'!='|'<'|'<='|'>'|'>='} op  Operator
 * @param {*}      value     Filterwaarde
 * @returns {Promise<Array<{id: string, [key: string]: any}>>}
 */
export const fetchPlanningOrdersWhere = async (
  field: string,
  op: WhereFilterOp,
  value: unknown,
): Promise<RepoRecord[]> => {
  const q = query(
    collection(db, getPathString(PATHS.PLANNING)),
    where(field, op, value),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/**
 * Schrijft je in op realtime berichten voor een specifieke ontvanger.
 *
 * @param {string} recipientEmail
 * @param {(docs: import('firebase/firestore').QueryDocumentSnapshot[]) => void} onData
 * @param {(err: Error) => void} onError
 * @returns {() => void} unsubscribe
 */
export const subscribeMessages = (
  recipientEmail: string,
  onData: SnapshotCallback,
  onError: ErrorCallback,
) => {
  const q = query(
    collection(db, getPathString(PATHS.MESSAGES)),
    where('to', '==', recipientEmail.toLowerCase()),
    limit(100),
  );
  return onSnapshot(q, (snap) => onData(snap.docs), onError);
};
