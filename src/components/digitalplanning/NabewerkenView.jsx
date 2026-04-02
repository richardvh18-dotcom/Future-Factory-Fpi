import React from "react";

// Eenvoudige lijstweergave voor Nabewerking-producten
const NabewerkenView = ({ producten }) => {
  if (!producten || producten.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400 text-lg">
        Geen producten voor Nabewerking gevonden.
      </div>
    );
  }
  return (
    <div className="p-4 overflow-auto h-full">
      <table className="min-w-full border text-xs">
        <thead>
          <tr className="bg-slate-100">
            <th className="px-2 py-1 border">Lotnummer</th>
            <th className="px-2 py-1 border">Order ID</th>
            <th className="px-2 py-1 border">Item</th>
            <th className="px-2 py-1 border">Status</th>
            <th className="px-2 py-1 border">Stap</th>
            <th className="px-2 py-1 border">Laatste update</th>
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
