import React, { FC } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  XCircle,
  Timer,
  ShieldCheck,
  PlayCircle,
  PauseCircle,
  ArrowRight,
} from "lucide-react";

/**
 * StatusBadge V6.0 - Universal Industrial Edition
 * Ondersteunt zowel productie-statussen als kwaliteitslabels.
 * Design: font-black, uppercase, italic, tracking-widest.
 */

interface StatusConfig {
  label: string;
  style: string;
  icon?: JSX.Element;
}

interface StatusBadgeProps {
  status?: string;
  showIcon?: boolean;
}

const StatusBadge: FC<StatusBadgeProps> = React.memo(({ status, showIcon = true }) => {
  if (!status) return null;

  // Mapping van statussen naar stijlen, labels en iconen
  const { t } = useTranslation();
  const getStatusConfig = (s: string): StatusConfig => {
    const cleanStatus = String(s).toLowerCase();

    // 1. KWALITEITS LABELS (QC)
    if (cleanStatus === "goed" || cleanStatus === "approved" || cleanStatus === "released") {
      return {
        label: t('status.good', 'Goed'),
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
        label: t('status.repair', 'Tijdelijke afkeur'),
        style: "bg-orange-50 text-orange-600 border-orange-200",
        icon: <Timer size={12} className="animate-spin-slow" />,
      };
    }
    if (cleanStatus === "definitieve afkeur" || cleanStatus === "rejected") {
      return {
        label: t('status.rejected', 'Afkeur'),
        style: "bg-rose-50 text-rose-600 border-rose-200",
        icon: <XCircle size={12} />,
      };
    }

    // 2. PRODUCTIE STATUSSEN (MES)
    if (
      cleanStatus === "finished" ||
      cleanStatus === "voltooid" ||
      cleanStatus === "completed" ||
      cleanStatus === "gereed"
    ) {
      return {
        label: t('status.finished', 'Gereed'),
        style: "bg-emerald-50 text-emerald-700 border-emerald-200",
        icon: <CheckCircle2 size={12} />,
      };
    }
    if (
      cleanStatus === "in production" ||
      cleanStatus === "in_progress" ||
      cleanStatus === "bezig"
    ) {
      return {
        label: t('status.in_production', 'In Productie'),
        style: "bg-blue-600 text-white border-blue-500 shadow-sm animate-pulse",
        icon: <Zap size={12} fill="currentColor" />,
      };
    }
    if (cleanStatus === "pending" || cleanStatus === "te doen") {
      return {
        label: t('status.queue', 'Te doen'),
        style: "bg-slate-100 text-slate-500 border-slate-200",
        icon: <Clock size={12} />,
      };
    }
    
    // 3. PILOT FLOW & NIEUWE STATUSSEN
    if (cleanStatus === "active") {
      return {
        label: t('status.active', 'Actief'),
        style: "bg-green-100 text-green-800 border-green-200 animate-pulse",
        icon: <Zap size={12} />,
      };
    }
    if (cleanStatus === "paused" || cleanStatus === "on_hold") {
      return {
        label: cleanStatus === "on_hold" ? t('status.on_hold', 'On Hold') : t('status.paused', 'Gepauzeerd'),
        style: "bg-orange-100 text-orange-800 border-orange-200",
        icon: <PauseCircle size={12} />,
      };
    }
    if (cleanStatus === "problem") {
      return {
        label: t('status.problem', 'Probleem'),
        style: "bg-red-100 text-red-800 border-red-200",
        icon: <AlertTriangle size={12} />,
      };
    }
    if (cleanStatus === "to_unload" || cleanStatus === "te lossen" || cleanStatus === "wacht op lossen") {
      return {
        label: t('status.to_unload', 'Te Lossen'),
        style: "bg-amber-100 text-amber-800 border-amber-300",
        icon: <ArrowRight size={12} />,
      };
    }
    if (cleanStatus === "unloading") {
      return {
        label: t('status.unloading', 'Lossen...'),
        style: "bg-cyan-100 text-cyan-800 border-cyan-200 animate-pulse",
        icon: <Zap size={12} />,
      };
    }
    if (
      cleanStatus === "mazak" ||
      cleanStatus === "wacht op mazak" ||
      cleanStatus === "te mazak"
    ) {
      return {
        label: t('status.mazak', 'Mazak'),
        style: "bg-indigo-100 text-indigo-800 border-indigo-300",
        icon: <ArrowRight size={12} />,
      };
    }
    if (
      cleanStatus === "post_processing" ||
      cleanStatus === "nabewerking" ||
      cleanStatus === "te nabewerken" ||
      cleanStatus === "te nabewerking" ||
      cleanStatus === "wacht op nabewerking"
    ) {
      return {
        label: t('status.post_processing', 'Nabewerking'),
        style: "bg-violet-100 text-violet-800 border-violet-300",
        icon: <Clock size={12} />,
      };
    }
    if (
      cleanStatus === "to_inspect" ||
      cleanStatus === "te keuren" ||
      cleanStatus === "eindinspectie" ||
      cleanStatus === "te inspecteren"
    ) {
      return {
        label: t('status.to_inspect', 'Te Keuren'),
        style: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300",
        icon: <ShieldCheck size={12} />,
      };
    }
    if (cleanStatus === "planned") {
      return {
        label: t('status.planned', 'Gepland'),
        style: "bg-blue-100 text-blue-800 border-blue-200",
        icon: <Clock size={12} />,
      };
    }

    // FALLBACK
    return {
      label: s?.replace(/_/g, ' ') || 'UNKNOWN',
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
