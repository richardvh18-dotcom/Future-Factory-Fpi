/**
 * inventoryRepository.js
 *
 * Centraliseert alle Firestore-leesbewerkingen voor de inventaris.
 * Hooks mogen ALLEEN via dit bestand inventory-data ophalen.
 *
 * Samenvoegt legacy- en scoped-inventory in één aanroep.
 */

import {
  collection,
  collectionGroup,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { PATHS, getPathString } from '../config/dbPaths';
import { isProductionInventoryScopedDoc } from '../utils/inventoryPaths';

/**
 * Haalt alle inventory-records op.
 * Merget de legacy-collectie en de scoped sub-collecties.
 * Scoped docs krijgen voorrang bij identieke ID's (migratie-overgangsperiode).
 *
 * @returns {Promise<Array<{id: string, _source: 'legacy'|'scoped', [key: string]: any}>>}
 */
export const fetchInventory = async () => {
  const [legacySnapshot, scopedSnapshot] = await Promise.all([
    getDocs(collection(db, getPathString(PATHS.INVENTORY))),
    getDocs(
      query(collectionGroup(db, 'items'), where('_scopeType', '==', 'inventory')),
    ),
  ]);

  const legacyList = legacySnapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    _source: 'legacy',
  }));

  const scopedList = scopedSnapshot.docs
    .filter((d) => isProductionInventoryScopedDoc(d.ref.path))
    .map((d) => ({
      id: d.id,
      ...d.data(),
      _source: 'scoped',
    }));

  // Scoped docs overschrijven legacy bij gelijke ID's
  const byId = new Map();
  legacyList.forEach((entry) => byId.set(entry.id, entry));
  scopedList.forEach((entry) => byId.set(entry.id, entry));

  return Array.from(byId.values());
};
