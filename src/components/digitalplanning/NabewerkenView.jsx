import React from "react";
import { useTranslation } from "react-i18next";

// Eenvoudige lijstweergave voor Nabewerking-producten
const NabewerkenView = ({ producten }) => {
  const { t } = useTranslation();

  if (!producten || producten.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400 text-lg">
        {t("digitalplanning.nabewerking.empty_view", "Geen producten voor Nabewerking gevonden.")}
      </div>
    );
  }
  return (
    <div className="p-4 overflow-auto h-full">
      <table className="min-w-full border text-xs">
        <thead>
          <tr className="bg-slate-100">
            <th className="px-2 py-1 border">{t("digitalplanning.nabewerking.table_lot", "Lotnummer")}</th>
            <th className="px-2 py-1 border">{t("digitalplanning.nabewerking.table_order", "Order ID")}</th>
            <th className="px-2 py-1 border">{t("digitalplanning.nabewerking.table_item", "Item")}</th>
            <th className="px-2 py-1 border">{t("digitalplanning.nabewerking.table_status", "Status")}</th>
            <th className="px-2 py-1 border">{t("digitalplanning.nabewerking.table_step", "Stap")}</th>
            <th className="px-2 py-1 border">{t("digitalplanning.nabewerking.table_updated", "Laatste update")}</th>
          </tr>
        </thead>
        <tbody>
          {producten.map((p) => (
            <tr key={p.id} className="border-b hover:bg-slate-50">
              <td className="px-2 py-1 border">{p.lotNumber}</td>
              <td className="px-2 py-1 border">{p.orderId}</td>
              <td className="px-2 py-1 border">{p.item || p.itemCode || p.productId}</td>
              <td className="px-2 py-1 border">{p.status}</td>
              <td className="px-2 py-1 border">{p.currentStep}</td>
              <td className="px-2 py-1 border">{p.updatedAt?.toDate ? p.updatedAt.toDate().toLocaleString() : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default NabewerkenView;
