import React from "react";
import { Zap, Droplets } from "lucide-react";

// --- CONFIGURATIE ---
export const getAppId = () => {
  if (typeof window !== "undefined" && window.__app_id) return window.__app_id;
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
export const normalizeMachine = (m) => {
  if (!m) return "";
  return String(m).trim().replace(/\s+/g, "").toUpperCase();
};

export const formatDate = (ts) => {
  if (!ts) return "-";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const getISOWeekInfo = (date) => {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  const year = d.getUTCFullYear();
  return { week: weekNo, year: year };
};

export const getMaterialInfo = (itemString) => {
  const upperItem = (itemString || "").toUpperCase();

  if (upperItem.includes("CST")) {
    return {
      type: "CST",
      label: "CST - Conductive",
      shortLabel: "CST",
      colorClasses: "bg-orange-100 text-orange-800 border-orange-200",
      warning: "⚠ LET OP: Conductive! Vergeet Carbon niet.",
      icon: <Zap size={12} className="text-orange-600" />,
    };
  }

  if (upperItem.includes("EWT")) {
    return {
      type: "EWT",
      label: "EWT - Water",
      shortLabel: "EWT",
      colorClasses: "bg-cyan-100 text-cyan-800 border-cyan-200",
      warning: "⚠ LET OP: EWT! Controleer moffen.",
      icon: <Droplets size={12} className="text-cyan-600" />,
    };
  }

  return {
    type: "EST",
    label: "EST - Standaard",
    shortLabel: "EST",
    colorClasses: "bg-slate-100 text-slate-600 border-slate-200",
    warning: null,
    icon: null,
  };
};
