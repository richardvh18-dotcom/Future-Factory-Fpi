import React from "react";
import { Filter, RotateCcw, Info } from "lucide-react";

type FilterState = {
  type: string;
  diameter: string;
  pressure: string;
  connection: string;
  angle: string;
  radius: string;
  boring: string;
  productLabel: string;
};

type ProductFilterSidebarProps = {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  uniqueTypes?: string[];
  uniqueDiameters?: string[];
  uniquePressures?: string[];
  uniqueConnections?: string[];
  uniqueAngles?: string[];
  uniqueRadii?: string[];
  uniqueBorings?: string[];
  uniqueLabels?: string[];
  isOpen: boolean;
  toggleSidebar: () => void;
};

const ProductFilterSidebar = ({
  filters,
  setFilters,
  uniqueTypes = [],
  uniqueDiameters = [],
  uniquePressures = [],
  uniqueConnections = [],
  uniqueAngles = [],
  uniqueRadii = [],
  uniqueBorings = [],
  uniqueLabels = [],
  isOpen,
  toggleSidebar,
}: ProductFilterSidebarProps) => {
  const resetFilters = () => {
    setFilters({
      type: "-",
      diameter: "-",
      pressure: "-",
      connection: "-",
      angle: "-",
      radius: "-",
      boring: "-",
      productLabel: "-",
    });
  };

  const Tooltip = ({ text }: { text: string }) => (
    <div className="group relative inline-block ml-2 align-middle">
      <div className="p-1 bg-slate-100 rounded-full cursor-help hover:bg-emerald-100 transition-colors">
        <Info
          size={11}
          className="text-slate-400 group-hover:text-emerald-600 transition-colors"
        />
      </div>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-48 p-3 bg-slate-900 text-white text-[10px] font-bold rounded-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100] pointer-events-none shadow-2xl border border-slate-700 leading-snug">
        <div className="relative z-10">{text}</div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900" />
      </div>
    </div>
  );

  const FilterSection = ({
    label,
    value,
    options = [],
    filterKey,
    tooltipText,
    colorClass = "border-slate-200",
  }: {
    label: string;
    value: string;
    options?: string[];
    filterKey: keyof FilterState;
    tooltipText?: string;
    colorClass?: string;
  }) => (
    <div className="mb-4 animate-in fade-in slide-in-from-left-1 duration-300">
      <div className="flex items-center mb-1.5 px-1">
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em]">
          {label}
        </label>
        {tooltipText && <Tooltip text={tooltipText} />}
      </div>
      <div className="relative">
        <select
          value={value}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, [filterKey]: e.target.value }))
          }
          className={`w-full bg-white border ${colorClass} rounded-xl px-3 py-2 text-[11px] font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/5 transition-all appearance-none cursor-pointer shadow-sm`}
        >
          <option value="-">Alle {label}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <svg
            width="8"
            height="5"
            viewBox="0 0 10 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 1L5 5L9 1" />
          </svg>
        </div>
      </div>
    </div>
  );

  if (!filters) return null;

  const isElbow = filters.type && filters.type.toLowerCase().includes("elbow");
  const is90Degrees = filters.angle === "90";
  const isFlange =
    filters.type &&
    (filters.type.toLowerCase().includes("flens") ||
      filters.type.toLowerCase().includes("flange"));

  return (
    <>
      {/* Mobiele overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-40 bg-white border-r border-slate-200 shadow-xl
          transition-all duration-300 ease-in-out flex flex-col h-full
          
          /* MOBIEL: Fixed over alles heen, toggled met translate */
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          w-72

          /* DESKTOP (lg): Niet fixed, maar static (in de flow). Toggled met width */
          lg:translate-x-0 lg:shadow-none lg:static lg:z-auto
          ${
            isOpen
              ? "lg:w-72 lg:opacity-100"
              : "lg:w-0 lg:opacity-0 lg:overflow-hidden lg:border-none"
          }
        `}
      >
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 min-w-[18rem]">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600 shadow-sm border border-emerald-100">
              <Filter size={16} />
            </div>
            <h2 className="text-sm font-black uppercase tracking-tight text-slate-800 italic">
              Filters
            </h2>
          </div>
          <button
            onClick={resetFilters}
            className="p-2 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
            title="Herstel Filters"
          >
            <RotateCcw size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar min-w-[18rem]">
          <FilterSection
            label="Product Type"
            filterKey="type"
            value={filters.type}
            options={uniqueTypes}
            tooltipText="Kies het type fitting of buis."
          />
          {isElbow && (
            <FilterSection
              label="Hoek (Degrees)"
              filterKey="angle"
              value={filters.angle}
              options={uniqueAngles}
              colorClass="border-blue-200"
            />
          )}
          {isElbow && is90Degrees && (
            <FilterSection
              label="Radius"
              filterKey="radius"
              value={filters.radius}
              options={uniqueRadii}
              colorClass="border-amber-200"
            />
          )}
          {isFlange && (
            <FilterSection
              label="Boring / Drilling"
              filterKey="boring"
              value={filters.boring}
              options={uniqueBorings}
              colorClass="border-purple-200"
            />
          )}

          <div className="h-px bg-slate-100 my-4" />

          <FilterSection
            label="Diameter (ID)"
            filterKey="diameter"
            value={filters.diameter}
            options={uniqueDiameters}
          />
          <FilterSection
            label="Drukklasse (PN)"
            filterKey="pressure"
            value={filters.pressure}
            options={uniquePressures}
          />
          <FilterSection
            label="Verbinding"
            filterKey="connection"
            value={filters.connection}
            options={uniqueConnections}
          />
          <FilterSection
            label="Label"
            filterKey="productLabel"
            value={filters.productLabel}
            options={uniqueLabels}
          />
        </div>

        <div className="p-5 border-t border-slate-100 bg-slate-50/30 min-w-[18rem]">
          <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 flex items-center justify-between">
            <p className="text-[10px] font-black text-emerald-800 uppercase italic">
              Filters Actief
            </p>
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default ProductFilterSidebar;
