import { useState, useEffect } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS, isValidPath } from "../config/dbPaths";

/**
 * useSettingsData V7.0 - Optimized with getDoc/getDocs
 * Vervangt onSnapshot listeners met een eenmalige fetch voor betere performance en lagere kosten.
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

    const fetchAllSettings = async () => {
      try {
        const refs = {
          generalConfig: isValidPath("GENERAL_SETTINGS") ? doc(db, ...PATHS.GENERAL_SETTINGS) : null,
          productRange: isValidPath("MATRIX_CONFIG") ? doc(db, ...PATHS.MATRIX_CONFIG) : null,
          boreDimensions: isValidPath("BORE_DIMENSIONS") ? collection(db, ...PATHS.BORE_DIMENSIONS) : null,
          cbDimensions: isValidPath("CB_DIMENSIONS") ? collection(db, ...PATHS.CB_DIMENSIONS) : null,
          tbDimensions: isValidPath("TB_DIMENSIONS") ? collection(db, ...PATHS.TB_DIMENSIONS) : null,
        };

        const [
          generalConfigSnap,
          productRangeSnap,
          boreDimensionsSnap,
          cbDimensionsSnap,
          tbDimensionsSnap,
        ] = await Promise.all([
          refs.generalConfig ? getDoc(refs.generalConfig) : null,
          refs.productRange ? getDoc(refs.productRange) : null,
          refs.boreDimensions ? getDocs(refs.boreDimensions) : null,
          refs.cbDimensions ? getDocs(refs.cbDimensions) : null,
          refs.tbDimensions ? getDocs(refs.tbDimensions) : null,
        ]);

        if (isMounted) {
          const newSettings = {
            generalConfig: generalConfigSnap?.exists() ? generalConfigSnap.data() : {},
            productRange: productRangeSnap?.exists() ? productRangeSnap.data() : {},
            boreDimensions: boreDimensionsSnap?.docs.map((d) => ({ id: d.id, ...d.data() })) || [],
            cbDimensions: cbDimensionsSnap?.docs.map((d) => ({ id: d.id, ...d.data() })) || [],
            tbDimensions: tbDimensionsSnap?.docs.map((d) => ({ id: d.id, ...d.data() })) || [],
          };

          setSettings({
            ...newSettings,
            loading: false,
          });
        }
      } catch (e) {
        console.error("Kritieke fout bij ophalen van instellingen:", e);
        if (isMounted) {
          setSettings((prev) => ({ ...prev, loading: false }));
        }
      }
    };

    fetchAllSettings();

    return () => {
      isMounted = false;
    };
  }, [user]);

  return settings;
};
