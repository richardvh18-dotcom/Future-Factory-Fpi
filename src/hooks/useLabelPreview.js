import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { PATHS } from '../config/dbPaths';
import { processLabelData, applyLabelLogic } from '../utils/labelHelpers';

/**
 * Custom hook to centralize label preview logic.
 * Fetches templates and rules, and computes the preview data.
 * @param {object} productData - The raw data for the label (e.g., order, tracked product).
 * @param {string} selectedLabelId - The ID of the currently selected label template.
 * @returns {object} { selectedLabel, previewData, availableLabels, loadingLabels }
 */
export const useLabelPreview = (productData, selectedLabelId) => {
  const [labelTemplates, setLabelTemplates] = useState([]);
  const [labelRules, setLabelRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const templatesRef = collection(db, ...PATHS.LABEL_TEMPLATES);
    const unsubTemplates = onSnapshot(templatesRef, (snap) => {
      setLabelTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));

    const logicRef = collection(db, ...PATHS.LABEL_LOGIC);
    const unsubLogic = onSnapshot(logicRef, (snap) => {
      setLabelRules(snap.docs.map(d => d.data()));
    }, () => setLoading(false));

    return () => {
      unsubTemplates();
      unsubLogic();
    };
  }, []);

  const selectedLabel = useMemo(() => {
    if (!selectedLabelId || labelTemplates.length === 0) return null;
    return labelTemplates.find(l => l.id === selectedLabelId);
  }, [labelTemplates, selectedLabelId]);

  const previewData = useMemo(() => {
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