import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { PATHS, getPathString } from '../config/dbPaths';

type LabelTemplate = {
  id: string;
  [key: string]: unknown;
};

type LabelRule = Record<string, unknown>;

type LabelCatalogResult = {
  labelTemplates: LabelTemplate[];
  labelRules: LabelRule[];
  loadingLabels: boolean;
};

export const useLabelCatalog = (): LabelCatalogResult => {
  const [labelTemplates, setLabelTemplates] = useState<LabelTemplate[]>([]);
  const [labelRules, setLabelRules] = useState<LabelRule[]>([]);
  const [loadingLabels, setLoadingLabels] = useState(true);

  useEffect(() => {
    setLoadingLabels(true);

    const templatesRef = collection(db, getPathString(PATHS.LABEL_TEMPLATES));
    const logicRef = collection(db, getPathString(PATHS.LABEL_LOGIC));

    const unsubTemplates = onSnapshot(
      templatesRef,
      (snap) => {
        setLabelTemplates(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        setLoadingLabels(false);
      },
      () => setLoadingLabels(false)
    );

    const unsubLogic = onSnapshot(
      logicRef,
      (snap) => {
        setLabelRules(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      },
      () => setLoadingLabels(false)
    );

    return () => {
      unsubTemplates();
      unsubLogic();
    };
  }, []);

  return { labelTemplates, labelRules, loadingLabels };
};
