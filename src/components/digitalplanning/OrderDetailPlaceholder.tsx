import React from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList } from "lucide-react";

const OrderDetailPlaceholder = () => {
  const { t } = useTranslation();

  return (
    <div className="flex-1 flex flex-col justify-center items-center opacity-40 italic text-center">
      <ClipboardList size={64} className="mb-4 text-slate-300" />
      <p className="font-black uppercase tracking-widest text-xs text-slate-400">
        {t("teamleader.select_order", "Selecteer een order uit de lijst")}
      </p>
    </div>
  );
};

export default OrderDetailPlaceholder;