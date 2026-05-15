import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTranslation } from "react-i18next";
import { ShieldCheck, AlertOctagon, CheckCircle2, XCircle, FileEdit, } from "lucide-react";
import { VERIFICATION_STATUS } from "../../data/constants";
const VerificationBadge = ({ status, verifiedBy }) => {
    const { t } = useTranslation();
    const config = {
        [VERIFICATION_STATUS.CONCEPT]: {
            bg: "bg-slate-50 text-slate-400 border-slate-200",
            label: t("verification.concept", "Concept"),
            icon: _jsx(FileEdit, { size: 12 }),
            subText: t("verification.inProgress", "In bewerking"),
        },
        [VERIFICATION_STATUS.PENDING]: {
            bg: "bg-orange-50 text-orange-600 border-orange-200 animate-pulse",
            label: t("verification.pending", "Te Verifiëren"),
            icon: _jsx(AlertOctagon, { size: 12 }),
            subText: t("verification.actionRequired", "Actie vereist"),
        },
        [VERIFICATION_STATUS.VERIFIED]: {
            bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
            label: t("verification.verified", "Geverifieerd"),
            icon: _jsx(ShieldCheck, { size: 12 }),
            subText: verifiedBy?.name
                ? t("verification.by", { name: verifiedBy.name, defaultValue: `Door: ${verifiedBy.name}` })
                : t("verification.approved", "Goedgekeurd"),
        },
        [VERIFICATION_STATUS.REJECTED]: {
            bg: "bg-rose-50 text-rose-700 border-rose-200",
            label: t("verification.rejected", "Afgekeurd"),
            icon: _jsx(XCircle, { size: 12 }),
            subText: t("verification.adjust", "Aanpassen"),
        },
    };
    const currentStatus = status || VERIFICATION_STATUS.CONCEPT;
    const active = config[currentStatus] || config[VERIFICATION_STATUS.CONCEPT];
    return (_jsxs("div", { className: "flex flex-col items-start gap-1.5 select-none", children: [_jsxs("div", { className: `
        flex items-center gap-2 px-3 py-1 rounded-lg border shadow-sm
        text-[10px] font-black uppercase tracking-widest italic
        transition-all duration-300 ${active.bg}
      `, children: [active.icon, active.label] }), _jsxs("div", { className: "flex items-center gap-1.5 ml-1", children: [_jsx("span", { className: `
          text-[9px] font-bold uppercase tracking-tighter italic
          ${currentStatus === VERIFICATION_STATUS.PENDING ? "text-orange-500" : "text-slate-400"}
        `, children: active.subText }), currentStatus === VERIFICATION_STATUS.VERIFIED && (_jsx(CheckCircle2, { size: 10, className: "text-emerald-500" }))] })] }));
};
export default VerificationBadge;
