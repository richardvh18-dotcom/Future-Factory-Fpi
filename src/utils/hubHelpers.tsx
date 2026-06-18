import React from "react";
import { Zap, Droplets } from "lucide-react";
import i18n from "../i18n";

type AppWindow = Window & {
  __app_id?: string;
};

type FirestoreDateLike = {
  toDate: () => Date;
};

type DateInput = FirestoreDateLike | Date | string | number | null | undefined;

type MaterialInfo = {
  type: "CST" | "EWT" | "EST";
  label: string;
  shortLabel: string;
  colorClasses: string;
  warning: string | null;
  icon: React.ReactNode;
};

const isFirestoreDateLike = (value: DateInput): value is FirestoreDateLike =>
  typeof value === "object" && value !== null && "toDate" in value;

// --- CONFIGURATIE ---
export const getAppId = (): string => {
  const appWindow = typeof window !== "undefined" ? (window as AppWindow) : undefined;
  if (appWindow?.__app_id) return appWindow.__app_id;
  return "fittings-app-v1";
};

export const FITTING_MACHINES = [
  "BM01",
  "BH11",
  "BH12",
  "BH15",
  "BH16",
  "BH17",
  "BH18",
  "BH31",
  "Mazak",
  "Nabewerking",
];

export const PIPE_MACHINES = ["BH05", "BH07", "BH08", "BH09"];

// --- HULPFUNCTIES ---
export const normalizeMachine = (m: unknown): string => {
  if (!m) return "";
  const normalized = String(m).trim().replace(/\s+/g, "").toUpperCase();
  if (/^40(BH|BM|BA)\d+/.test(normalized)) {
    return normalized.slice(2);
  }
  return normalized;
};

export const getStartedCounterField = (stationName: unknown): string => {
  const normalized = normalizeMachine(stationName || "");
  const fallback = String(stationName || "").trim().replace(/\s+/g, "");
  const keySource = normalized || fallback;
  if (!keySource) return "";
  const safeKey = keySource.replace(/[^a-zA-Z0-9]/g, "_");
  return `started_${safeKey}`;
};

export const formatDate = (ts: DateInput): string => {
  if (!ts) return "-";
  const d = isFirestoreDateLike(ts) ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString(i18n.language, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const getISOWeekInfo = (date: Date): { week: number; year: number } => {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const year = d.getUTCFullYear();
  return { week: weekNo, year: year };
};

export const getMaterialInfo = (itemString: unknown): MaterialInfo => {
  const upperItem = String(itemString || "").toUpperCase();

  if (upperItem.includes("CST")) {
    return {
      type: "CST",
      label: i18n.t("material.cst_label", "CST - Conductive"),
      shortLabel: "CST",
      colorClasses: "bg-orange-100 text-orange-800 border-orange-200",
      warning: i18n.t("material.cst_warning", "⚠ LET OP: Conductive! Vergeet Carbon niet."),
      icon: <Zap size={12} className="text-orange-600" />,
    };
  }

  if (upperItem.includes("EWT")) {
    return {
      type: "EWT",
      label: i18n.t("material.ewt_label", "EWT - Water"),
      shortLabel: "EWT",
      colorClasses: "bg-cyan-100 text-cyan-800 border-cyan-200",
      warning: i18n.t("material.ewt_warning", "⚠ LET OP: EWT! Controleer moffen."),
      icon: <Droplets size={12} className="text-cyan-600" />,
    };
  }

  return {
    type: "EST",
    label: i18n.t("material.est_label", "EST - Standaard"),
    shortLabel: "EST",
    colorClasses: "bg-slate-100 text-slate-600 border-slate-200",
    warning: null,
    icon: null,
  };
};
