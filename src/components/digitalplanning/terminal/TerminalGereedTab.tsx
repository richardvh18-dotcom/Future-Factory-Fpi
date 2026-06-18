import React from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, X } from "lucide-react";
import { useTerminalGereedData } from "./useTerminalGereedData";
import TerminalGereedItemCard from "./TerminalGereedItemCard";
import { useTouchKeyboardPreference } from "../../../hooks/useTouchKeyboardPreference";

type TerminalTrackedItem = {
  id?: string;
  lotNumber?: string;
  [key: string]: unknown;
};

type TerminalGereedTabProps = {
  allTracked?: TerminalTrackedItem[];
  stationId?: string;
  effectiveStationId?: string;
};

const TerminalGereedTab = ({ allTracked = [], stationId, effectiveStationId }: TerminalGereedTabProps) => {
  const { t } = useTranslation();
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const { touchKeyboardPreferred, setTouchKeyboardPreferred } = useTouchKeyboardPreference();
  const isTouchDevice = React.useMemo(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(pointer: coarse)").matches;
  }, []);
  const { gereedSearch, setGereedSearch, needle, filtered } = useTerminalGereedData({
    allTracked: allTracked as never[],
    stationId,
  }) as {
    gereedSearch: string;
    setGereedSearch: (value: string) => void;
    needle: string;
    filtered: TerminalTrackedItem[];
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden text-left">
      {/* Zoekbalk — sticky bovenaan */}
      <div className="shrink-0 px-3 pt-3 pb-2 md:px-6 md:pt-5 md:pb-3 bg-slate-50 border-b border-slate-100">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={gereedSearch}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGereedSearch(e.target.value)}
            placeholder={t("digitalplanning.terminal.search_product_order_lot", "Zoek op product, order of lotnummer...")}
            className="w-full rounded-xl border border-slate-200 bg-white pl-4 pr-20 py-3 text-sm font-medium text-slate-700 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
            inputMode={isTouchDevice && !touchKeyboardPreferred ? "none" : "text"}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {gereedSearch ? (
              <button
                type="button"
                onClick={() => {
                  setGereedSearch("");
                  searchInputRef.current?.focus();
                }}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700"
                title={t("common.clear", "Wissen")}
              >
                <X size={14} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setTouchKeyboardPreferred(true);
                requestAnimationFrame(() => searchInputRef.current?.focus());
              }}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-blue-600 hover:text-blue-700"
              title={t("digitalplanning.terminal.keyboard", "Toetsenbord")}
            >
              <Keyboard size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollbare lijst */}
      <div className="flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-4 flex flex-col gap-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
          {filtered.length} {filtered.length === 1 ? t("digitalplanning.terminal.piece", "stuk") : t("digitalplanning.terminal.pieces", "stuks")} {t("digitalplanning.terminal.forwarded_from", "doorgezet vanaf")} {effectiveStationId}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            {needle
              ? t("digitalplanning.terminal.no_results_for_search", "Geen resultaten voor deze zoekopdracht.")
              : t("digitalplanning.terminal.no_ready_reports_for_station", "Nog geen gereedmeldingen gevonden voor dit station.")}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.slice(0, 200).map((item: TerminalTrackedItem) => (
              <TerminalGereedItemCard key={item.id || item.lotNumber} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TerminalGereedTab;
