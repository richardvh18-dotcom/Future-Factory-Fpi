// src/services/versionService.js
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";

/**
 * Luistert realtime naar de app-versie in Firestore.
 * @param {function} onChange - Callback bij versie-wijziging (nieuwe versie als argument)
 * @returns {function} Unsubscribe functie
 */
export function listenToAppVersion(onChange) {
  const versionDoc = doc(db, "app", "version");
  return onSnapshot(versionDoc, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      if (data && data.version) {
        onChange(data.version);
      }
    }
  });
}
