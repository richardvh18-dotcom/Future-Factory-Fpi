import { useState, useEffect } from "react";
import { fetchAllSettings } from "../repositories/settingsRepository";
/**
 * useSettingsData V8.0 - Via settingsRepository
 * Haalt alle factory-instellingen op via de centrale repository laag.
 */
export const useSettingsData = (user) => {
    const [settings, setSettings] = useState({
        productRange: {},
        generalConfig: {},
        boreDimensions: [],
        cbDimensions: [],
        tbDimensions: [],
        loading: true,
    });
    useEffect(() => {
        if (!user) {
            setSettings((s) => ({ ...s, loading: false }));
            return;
        }
        let isMounted = true;
        fetchAllSettings()
            .then((data) => {
            if (isMounted)
                setSettings({ ...data, loading: false });
        })
            .catch((e) => {
            console.error("Kritieke fout bij ophalen van instellingen:", e);
            if (isMounted)
                setSettings((prev) => ({ ...prev, loading: false }));
        });
        return () => { isMounted = false; };
    }, [user]);
    return settings;
};
