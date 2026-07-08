import { useState, useEffect } from "react";
import { fetchAllSettings, fetchGeneralConfig } from "../repositories/settingsRepository";
import type { User } from "firebase/auth";

interface SettingsState {
  productRange: Record<string, unknown>;
  generalConfig: Record<string, unknown>;
  boreDimensions: unknown[];
  cbDimensions: unknown[];
  tbDimensions: unknown[];
  loading: boolean;
}

interface UseSettingsDataOptions {
  mode?: "full" | "minimal";
}

/**
 * useSettingsData V8.0 - Via settingsRepository
 * Haalt alle factory-instellingen op via de centrale repository laag.
 */
export const useSettingsData = (
  user: User | null | undefined,
  options?: UseSettingsDataOptions,
): SettingsState => {
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

    const loadPromise =
      options?.mode === "minimal"
        ? fetchGeneralConfig().then((generalConfig) => ({
            generalConfig,
            productRange: {},
            boreDimensions: [],
            cbDimensions: [],
            tbDimensions: [],
          }))
        : fetchAllSettings();

    loadPromise
      .then((data) => {
        if (isMounted) setSettings({ ...(data as SettingsState), loading: false });
      })
      .catch((e: Error) => {
        console.error("Kritieke fout bij ophalen van instellingen:", e);
        if (isMounted) setSettings((prev) => ({ ...prev, loading: false }));
      });

    return () => { isMounted = false; };
  }, [user, options?.mode]);

  return settings;
};
