import React from "react";
import {
  Package,
  ChevronRight,
  Ruler,
  Database,
  ImageIcon,
} from "lucide-react";

/**
 * ProductCard: Toont een product in de catalogus.
 * GEFIXT: Afbeelding is nu zichtbaar in het overzicht.
 */
const ProductCard = React.memo(({ product, onClick }) => {
  return (
    <div
      onClick={() => onClick(product)}
      className="bg-white rounded-[32px] border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all cursor-pointer group flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300"
    >
      {/* Product Afbeelding / Placeholder */}
      <div className="relative aspect-video w-full bg-slate-100 overflow-hidden">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-2">
            <ImageIcon size={40} strokeWidth={1.5} />
            <span className="text-[8px] font-black uppercase tracking-widest">
              Geen Afbeelding
            </span>
          </div>
        )}

        {/* Label Overlay */}
        <div className="absolute top-3 left-3">
          <span className="bg-slate-900/80 backdrop-blur-md text-white text-[8px] font-black px-2 py-1 rounded-lg uppercase tracking-widest border border-white/20">
            {product.label || "Standaard"}
          </span>
        </div>
      </div>

      <div className="p-6 flex-1 flex flex-col text-left">
        <div className="mb-4">
          <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-tight line-clamp-2 leading-tight">
            {product.name}
          </h3>
          <p className="text-[9px] font-bold text-slate-400 font-mono mt-1 uppercase tracking-tighter">
            {product.articleCode || product.id}
          </p>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2">
          <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 flex flex-col">
            <span className="text-[7px] font-black text-blue-500 uppercase tracking-widest">
              Druk
            </span>
            <span className="text-xs font-black text-slate-700 leading-none">
              PN {product.pressure || product.pn}
            </span>
          </div>
          <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 flex flex-col">
            <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest">
              Maat
            </span>
            <span className="text-xs font-black text-slate-700 leading-none">
              ID {product.diameter || product.dn}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                product.status === "approved"
                  ? "bg-emerald-500 animate-pulse"
                  : "bg-orange-400"
              }`}
            />
            <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">
              {product.status === "approved" ? "Live" : "Concept"}
            </span>
          </div>
          <ChevronRight
            size={14}
            className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all"
          />
        </div>
      </div>
    </div>

  );
});

export default ProductCard;
