import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  XCircle,
  Timer,
  ShieldCheck,
  PlayCircle,
} from "lucide-react";

/**
 * StatusBadge V6.0 - Universal Industrial Edition
 * Ondersteunt zowel productie-statussen als kwaliteitslabels.
 * Design: font-black, uppercase, italic, tracking-widest.
 */
const StatusBadge = React.memo(({ status, showIcon = true }) => {
  if (!status) return null;

  // Mapping van statussen naar stijlen, labels en iconen
  const getStatusConfig = (s) => {
    const cleanStatus = String(s).toLowerCase();

    // 1. KWALITEITS LABELS (QC)
    if (cleanStatus === "goed" || cleanStatus === "approved") {
      return {
        label: "Goed",
        style: "bg-emerald-50 text-emerald-600 border-emerald-200",
        icon: <ShieldCheck size={12} />,
      };
    }
    if (
      cleanStatus === "tijdelijke afkeur" ||
      cleanStatus === "temp_rejected" ||
      cleanStatus === "held_qc"
    ) {
      return {
        label: "Herstellen",
        style: "bg-orange-50 text-orange-600 border-orange-200",
        icon: <Timer size={12} className="animate-spin-slow" />,
      };
    }
    if (cleanStatus === "definitieve afkeur" || cleanStatus === "rejected") {
      return {
        label: "Afkeur",
        style: "bg-rose-50 text-rose-600 border-rose-200",
        icon: <XCircle size={12} />,
      };
    }

    // 2. PRODUCTIE STATUSSEN (MES)
    if (cleanStatus === "finished" || cleanStatus === "voltooid") {
      return {
        label: "Voltooid",
        style: "bg-blue-50 text-blue-700 border-blue-200",
        icon: <CheckCircle2 size={12} />,
      };
    }
    if (
      cleanStatus === "in production" ||
      cleanStatus === "in_progress" ||
      cleanStatus === "bezig"
    ) {
      return {
        label: "Actief",
        style: "bg-blue-600 text-white border-blue-500 shadow-sm animate-pulse",
        icon: <Zap size={12} fill="currentColor" />,
      };
    }
    if (cleanStatus === "pending" || cleanStatus === "te doen") {
      return {
        label: "Wachtrij",
        style: "bg-slate-100 text-slate-500 border-slate-200",
        icon: <Clock size={12} />,
      };
    }

    // FALLBACK
    return {
      label: s,
      style: "bg-slate-50 text-slate-400 border-slate-200",
      icon: <PlayCircle size={12} />,
    };
  };

  const config = getStatusConfig(status);

  return (
    <div
      className={`
        px-3 py-1.5 rounded-full border shadow-sm
        text-[9px] font-black uppercase tracking-widest italic
        flex items-center gap-2 select-none transition-all duration-300
        ${config.style}
      `}
    >
      {showIcon && config.icon}
      <span className="leading-none">{config.label}</span>
    </div>

  );
});

export default StatusBadge;
