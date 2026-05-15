import React, { useState } from "react";
import { Loader2, X, ImageIcon } from "lucide-react";
import { collection, query, where, limit, getDocs } from "firebase/firestore";
import { db } from "../../../config/firebase";

const getAppId = () => {
  if (typeof window !== "undefined" && window.__app_id) return window.__app_id;
  return "fittings-app-v1";
};

const OperatorLinkModal = ({ order, onClose, onLinkProduct }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const searchCatalog = async () => {
    if (!searchQuery || searchQuery.length < 2) return;
    setSearching(true);
    try {
      const appId = getAppId();
      const productsRef = collection(db, "artifacts", appId, "public", "data", "products");
      const q = query(productsRef, where("name", ">=", searchQuery), where("name", "<=", searchQuery + "\uf8ff"), limit(10));
      const snapshot = await getDocs(q);
      setSearchResults(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Zoekfout:", err);
    } finally {
      setSearching(false);
    }
  };

  const handleSave = (product) => {
    onLinkProduct(order.id, product);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 scale-100 animate-in zoom-in-95 flex flex-col max-h-[80vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase italic tracking-tight">Koppel Product</h2>
            <p className="text-xs text-gray-500 font-medium font-mono">Order: {order.orderId}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>
        <div className="p-8 overflow-y-auto custom-scrollbar">
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              placeholder="Zoek op productnaam..."
              className="flex-1 p-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchCatalog()}
              autoFocus
            />
            <button onClick={searchCatalog} disabled={searching} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50">
              {searching ? <Loader2 className="animate-spin" /> : "Zoek"}
            </button>
          </div>
          <div className="space-y-2">
            {searchResults.map((prod) => (
              <div key={prod.id} onClick={() => handleSave(prod)} className="p-3 border rounded-xl hover:bg-blue-50 flex justify-between items-center transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  {prod.imageUrl ? (
                    <img src={prod.imageUrl} alt="" className="w-10 h-10 object-cover rounded-lg bg-gray-100" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-300"><ImageIcon size={16} /></div>
                  )}
                  <div><p className="text-sm font-bold text-gray-800">{prod.name}</p><p className="text-xs text-gray-400">{prod.articleCode}</p></div>
                </div>
                <div className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm">Kies</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperatorLinkModal;