import { getFunctions, httpsCallable } from "firebase/functions";
import app from "../config/firebase";

const functions = getFunctions(app);
const rejectTrackedProductFinalCallable = httpsCallable(functions, "rejectTrackedProductFinal");
const moveTrackedProductManualCallable = httpsCallable(functions, "moveTrackedProductManual");

export const rejectTrackedProductFinal = async ({
  productId,
  reasons = [],
  note = "",
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    productId: String(productId || "").trim(),
    reasons: Array.isArray(reasons) ? reasons : [],
    note: String(note || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.productId) {
    throw new Error("productId is verplicht.");
  }

  if (!payload.reasons.length) {
    throw new Error("Minimaal 1 afkeurreden is verplicht.");
  }

  const result = await rejectTrackedProductFinalCallable(payload);
  return result?.data || { ok: false };
};

export const moveTrackedProductManual = async ({
  productOrLotId,
  newStation,
  isRepairMove = false,
  repairInstruction = "",
  source = "",
  actorLabel = "",
}) => {
  const payload = {
    productOrLotId: String(productOrLotId || "").trim(),
    newStation: String(newStation || "").trim(),
    isRepairMove: Boolean(isRepairMove),
    repairInstruction: String(repairInstruction || "").trim(),
    source: String(source || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
  };

  if (!payload.productOrLotId) {
    throw new Error("productOrLotId is verplicht.");
  }

  if (!payload.newStation) {
    throw new Error("newStation is verplicht.");
  }

  const result = await moveTrackedProductManualCallable(payload);
  return result?.data || { ok: false };
};

const completeTrackedProductCallable = httpsCallable(functions, "completeTrackedProduct");

export const completeTrackedProduct = async ({
  productId,
  finishType,
  fromStation = "",
  note = "",
  actorLabel = "",
  source = "",
}) => {
  const payload = {
    productId: String(productId || "").trim(),
    finishType: String(finishType || "").trim(),
    fromStation: String(fromStation || "").trim(),
    note: String(note || "").trim(),
    actorLabel: String(actorLabel || "").trim(),
    source: String(source || "").trim(),
  };

  if (!payload.productId) {
    throw new Error("productId is verplicht.");
  }

  if (!["archive", "forward"].includes(payload.finishType)) {
    throw new Error('finishType moet "archive" of "forward" zijn.');
  }

  const result = await completeTrackedProductCallable(payload);
  return result?.data || { ok: false };
};
