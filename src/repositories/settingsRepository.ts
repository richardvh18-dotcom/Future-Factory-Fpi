/**
 * settingsRepository.js
 *
 * Centraliseert alle Firestore-leesbewerkingen voor instellingen, configuraties
 * en technische dimensies.
 * Hooks mogen ALLEEN via dit bestand settings-data ophalen.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { PATHS, isValidPath, getPathString } from '../config/dbPaths';

type SettingsRecord = Record<string, unknown>;
type RepoRecord = { id: string } & SettingsRecord;
type DimensionsPathKey =
  | 'BORE_DIMENSIONS'
  | 'CB_DIMENSIONS'
  | 'TB_DIMENSIONS'
  | 'FITTING_SPECS'
  | 'SOCKET_SPECS';

const DIMENSIONS_PATHS: Record<DimensionsPathKey, string[]> = {
  BORE_DIMENSIONS: PATHS.BORE_DIMENSIONS,
  CB_DIMENSIONS: PATHS.CB_DIMENSIONS,
  TB_DIMENSIONS: PATHS.TB_DIMENSIONS,
  FITTING_SPECS: PATHS.FITTING_SPECS,
  SOCKET_SPECS: PATHS.SOCKET_SPECS,
};

/**
 * Haalt de algemene factory-instellingen op.
 *
 * @returns {Promise<object>}  Leeg object als het document niet bestaat.
 */
export const fetchGeneralConfig = async () => {
  if (!isValidPath('GENERAL_SETTINGS')) return {};
  const snap = await getDoc(doc(db, getPathString(PATHS.GENERAL_SETTINGS)));
  return snap.exists() ? snap.data() : {};
};

/**
 * Haalt de matrix/productrange-configuratie op.
 *
 * @returns {Promise<object>}
 */
export const fetchMatrixConfig = async (): Promise<SettingsRecord> => {
  if (!isValidPath('MATRIX_CONFIG')) return {};
  const snap = await getDoc(doc(db, getPathString(PATHS.MATRIX_CONFIG)));
  return snap.exists() ? snap.data() : {};
};

/**
 * Haalt een collectie van technische dimensies op.
 *
 * @param {'BORE_DIMENSIONS'|'CB_DIMENSIONS'|'TB_DIMENSIONS'|'FITTING_SPECS'|'SOCKET_SPECS'} pathKey
 * @returns {Promise<Array<{id: string, [key: string]: any}>>}
 */
export const fetchDimensions = async (pathKey: DimensionsPathKey): Promise<RepoRecord[]> => {
  if (!isValidPath(pathKey)) return [];
  const snap = await getDocs(collection(db, getPathString(DIMENSIONS_PATHS[pathKey])));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/**
 * Haalt alle instellingen parallel op die nodig zijn voor de app-bootstrap.
 * Vervangt de losse Promise.all() aanroepen in useSettingsData.
 *
 * @returns {Promise<{
 *   generalConfig: object,
 *   productRange: object,
 *   boreDimensions: Array,
 *   cbDimensions: Array,
 *   tbDimensions: Array,
 * }>}
 */
export const fetchAllSettings = async () => {
  const [
    generalConfig,
    productRange,
    boreDimensions,
    cbDimensions,
    tbDimensions,
  ] = await Promise.all([
    fetchGeneralConfig(),
    fetchMatrixConfig(),
    fetchDimensions('BORE_DIMENSIONS'),
    fetchDimensions('CB_DIMENSIONS'),
    fetchDimensions('TB_DIMENSIONS'),
  ]);

  return { generalConfig, productRange, boreDimensions, cbDimensions, tbDimensions };
};

/**
 * Haalt label-templates op.
 *
 * @returns {Promise<Array<{id: string, [key: string]: any}>>}
 */
export const fetchLabelTemplates = async () => {
  if (!isValidPath('LABEL_TEMPLATES')) return [];
  const snap = await getDocs(collection(db, getPathString(PATHS.LABEL_TEMPLATES)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/**
 * Haalt printerinstellingen op.
 *
 * @returns {Promise<Array<{id: string, [key: string]: any}>>}
 */
export const fetchPrinters = async () => {
  if (!isValidPath('PRINTERS')) return [];
  const snap = await getDocs(collection(db, getPathString(PATHS.PRINTERS)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};
