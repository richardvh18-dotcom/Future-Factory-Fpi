import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTranslation } from "react-i18next";
import { ClipboardList } from "lucide-react";
const OrderDetailPlaceholder = () => {
    const { t } = useTranslation();
    return (_jsxs("div", { className: "flex-1 flex flex-col justify-center items-center opacity-40 italic text-center", children: [_jsx(ClipboardList, { size: 64, className: "mb-4 text-slate-300" }), _jsx("p", { className: "font-black uppercase tracking-widest text-xs text-slate-400", children: t("teamleader.select_order", "Selecteer een order uit de lijst") })] }));
};
export default OrderDetailPlaceholder;
