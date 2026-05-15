// src/services/versionService.ts
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS, getPathString } from "../config/dbPaths";
/**
 * Luistert realtime naar de app-versie in Firestore.
 * @param {function} onChange - Callback bij versie-wijziging (nieuwe versie als argument)
 * @returns {function} Unsubscribe functie
 */
export function listenToAppVersion(onChange) {
    const versionDoc = doc(db, getPathString(PATHS.GENERAL_SETTINGS));
    return onSnapshot(versionDoc, (snapshot) => {
        if (!snapshot.exists())
            return;
        const data = snapshot.data() || {};
        const version = data.version ||
            data.appVersion ||
            data.frontendVersion ||
            data.clientVersion ||
            null;
        if (version)
            onChange(version);
    }, (error) => {
        // Niet kritisch: app moet blijven werken als versie-doc niet leesbaar is.
        console.warn("Version listener unavailable:", error?.code || error?.message || error);
    });
}
