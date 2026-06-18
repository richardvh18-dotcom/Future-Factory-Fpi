import { useState, useEffect } from "react";
import { fetchAllSettings } from "../repositories/settingsRepository";
import type { User } from "firebase/auth";

interface SettingsState {
  productRange: Record<string, unknown>;
  generalConfig: Record<string, unknown>;
  boreDimensions: unknown[];
  cbDimensions: unknown[];
  tbDimensions: unknown[];
  loading: boolean;
}

/**
 * useSettingsData V8.0 - Via settingsRepository
 * Haalt alle factory-instellingen op via de centrale repository laag.
 */
export const useSettingsData = (user: User | null | undefined): SettingsState => {
  const [settings, setSettings] = useState<SettingsState>({
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
        if (isMounted) setSettings({ ...(data as SettingsState), loading: false });
      })
      .catch((e: Error) => {
        console.error("Kritieke fout bij ophalen van instellingen:", e);
        if (isMounted) setSettings((prev) => ({ ...prev, loading: false }));
      });

    return () => { isMounted = false; };
  }, [user]);

  return settings;
};
