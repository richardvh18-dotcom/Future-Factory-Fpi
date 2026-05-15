import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { PATHS, getPathString } from '../config/dbPaths';
import { processLabelData, applyLabelLogic } from '../utils/labelHelpers';

type LabelTemplate = {
  id: string;
  [key: string]: unknown;
};

type LabelRule = Record<string, unknown>;

type ProductData = {
  orderId?: string;
  orderNumber?: string;
  itemCode?: string;
  productId?: string;
  item?: string;
  description?: string;
  [key: string]: unknown;
};

type LabelPreviewResult = {
  selectedLabel: LabelTemplate | null;
  previewData: Record<string, unknown>;
  availableLabels: LabelTemplate[];
  loadingLabels: boolean;
};

/**
 * Custom hook to centralize label preview logic.
 * Fetches templates and rules, and computes the preview data.
 * @param {object} productData - The raw data for the label (e.g., order, tracked product).
 * @param {string} selectedLabelId - The ID of the currently selected label template.
 * @returns {object} { selectedLabel, previewData, availableLabels, loadingLabels }
 */
export const useLabelPreview = (
  productData: ProductData | null | undefined,
  selectedLabelId: string | null | undefined,
): LabelPreviewResult => {
  const [labelTemplates, setLabelTemplates] = useState<LabelTemplate[]>([]);
  const [labelRules, setLabelRules] = useState<LabelRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const templatesRef = collection(db, getPathString(PATHS.LABEL_TEMPLATES));
    const unsubTemplates = onSnapshot(templatesRef, (snap) => {
      setLabelTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));

    const logicRef = collection(db, getPathString(PATHS.LABEL_LOGIC));
    const unsubLogic = onSnapshot(logicRef, (snap) => {
      setLabelRules(snap.docs.map((d) => d.data()));
    }, () => setLoading(false));

    return () => {
      unsubTemplates();
      unsubLogic();
    };
  }, []);

  const selectedLabel = useMemo<LabelTemplate | null>(() => {
    if (!selectedLabelId || labelTemplates.length === 0) return null;
    return labelTemplates.find((l) => l.id === selectedLabelId) ?? null;
  }, [labelTemplates, selectedLabelId]);

  const previewData = useMemo<Record<string, unknown>>(() => {
    if (!productData) return {};
    const baseData = processLabelData({
      ...productData,
      orderNumber: productData.orderId || productData.orderNumber,
      productId: productData.itemCode || productData.productId,
      description: productData.item || productData.description,
    });
    return applyLabelLogic(baseData, labelRules);
  }, [productData, labelRules]);

  return { selectedLabel, previewData, availableLabels: labelTemplates, loadingLabels: loading };
};