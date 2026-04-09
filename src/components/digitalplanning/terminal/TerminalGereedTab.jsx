import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { getArchiveItemsPath } from "../../../config/dbPaths";
import { normalizeMachine } from "../../../utils/hubHelpers";
import { toDateSafe } from "../../../utils/dateUtils";

// Telt n werkdagen terug (zaterdag + zondag worden overgeslagen)
const subtractWorkingDays = (fromDate, days) => {
  const d = new Date(fromDate);
  let counted = 0;
  while (counted < days) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) counted++;
  }
  return d;
};

const DAYS_BACK = 5;

const TerminalGereedTab = ({ allTracked = [], stationId, effectiveStationId }) => {
  const { t } = useTranslation();
  const [gereedSearch, setGereedSearch] = useState("");
  const [archivedTracked, setArchivedTracked] = useState([]);

  const normalizedStationId = useMemo(
    () => (normalizeMachine(stationId || "") || "").toUpperCase().trim(),
    [stationId]
  );

  // Laad archief eenmalig
  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const cutoff = subtractWorkingDays(new Date(), DAYS_BACK);
        const years = Array.from(new Set([cutoff.getFullYear(), new Date().getFullYear()]));
        const snaps = await Promise.all(
          years.map((y) => getDocs(collection(db, ...getArchiveItemsPath(y))))
        );
        const items = snaps.flatMap((snap) =>
          snap.docs.map((d) => ({ id: d.id, ...d.data(), _source: "archive" }))
        );
        if (isMounted) setArchivedTracked(items);
      } catch (e) {
        console.warn("Archief laden mislukt:", e);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [normalizedStationId]);

  const completedByStation = useMemo(() => {
    const cutoff = subtractWorkingDays(new Date(), DAYS_BACK);

    const getTimestampMs = (item) => {
      const best =
        toDateSafe(item?.timestamps?.lossen_start) ||
        toDateSafe(item?.updatedAt) ||
        toDateSafe(item?.timestamps?.wikkelen_end) ||
        toDateSafe(item?.timestamps?.station_end) ||
        toDateSafe(item?.createdAt);
      return best ? best.getTime() : 0;
    };

    const filterItem = (item) => {
      const originNorm = (normalizeMachine(item?.originMachine || item?.machine || "") || "").toUpperCase().trim();
      if (originNorm !== normalizedStationId) return false;

      const step = String(item?.currentStep || "").toUpperCase().trim();
      const status = String(item?.status || "").toLowerCase().trim();
      if (status === "rejected" || step === "REJECTED") return false;

      const isStillInWinding = step === "WIKKELEN" || step === "HOLD_AREA";
      if (isStillInWinding) return false;

      const ts =
        toDateSafe(item?.timestamps?.lossen_start) ||
        toDateSafe(item?.updatedAt) ||
        toDateSafe(item?.timestamps?.wikkelen_end) ||
        toDateSafe(item?.createdAt);
      return ts ? ts >= cutoff : false;
    };

    const seen = new Set();
    return [...allTracked, ...archivedTracked]
      .filter((item) => {
        if (!filterItem(item)) return false;
        const key = item.id || item.lotNumber;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => getTimestampMs(b) - getTimestampMs(a));
  }, [allTracked, archivedTracked, normalizedStationId]);

  const needle = gereedSearch.trim().toLowerCase();
  const filtered = needle
    ? completedByStation.filter((item) => {
        const product = [item.item, item.itemCode, item.itemDescription, item.description]
          .filter(Boolean).join(" ").toLowerCase();
        const order = String(item.orderId || "").toLowerCase();
        const lot = String(item.lotNumber || "").toLowerCase();
        return product.includes(needle) || order.includes(needle) || lot.includes(needle);
      })
    : completedByStation;

  return (
    <div className="flex-1 flex flex-col overflow-hidden text-left">
      {/* Zoekbalk — sticky bovenaan */}
      <div className="shrink-0 px-3 pt-3 pb-2 md:px-6 md:pt-5 md:pb-3 bg-slate-50 border-b border-slate-100">
        <div className="relative">
          <input
            type="text"
            value={gereedSearch}
            onChange={(e) => setGereedSearch(e.target.value)}
            placeholder={t("digitalplanning.terminal.search_product_order_lot", "Zoek op product, order of lotnummer...")}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
          />
          {gereedSearch && (
            <button
              onClick={() => setGereedSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg leading-none"
            >×</button>
          )}
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
            {filtered.slice(0, 200).map((item) => {
              const productName = [item.item, item.itemDescription, item.description]
                .map(s => String(s || "").trim()).filter(Boolean)[0] || t("digitalplanning.terminal.unknown_product", "Onbekend product");
              const productCode = String(item.itemCode || "").trim();
              const lossenTs = toDateSafe(item?.timestamps?.lossen_start) || toDateSafe(item?.updatedAt);
              const tsLabel = lossenTs
                ? lossenTs.toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
                : null;
              const stationNow = item.currentStation || "-";
              const stepNow = item.currentStep || "-";

              return (
                <div key={item.id || item.lotNumber} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-base font-black text-slate-900 leading-snug">{productName}</div>
                  {productCode && <div className="text-xs font-mono text-slate-400 mt-0.5 mb-2">{productCode}</div>}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {item.orderId && (
                      <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-100 text-xs font-black text-blue-700 uppercase tracking-wide">
                        {item.orderId}
                      </span>
                    )}
                    {item.lotNumber && (
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-black text-slate-700 uppercase tracking-wide">
                        {item.lotNumber}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 font-medium border-t border-slate-100 pt-2 mt-1">
                    <span>{t("digitalplanning.terminal.now_at", "Nu op")}: <span className="font-bold text-slate-700">{stationNow}</span> · {stepNow}</span>
                    {tsLabel && (
                      <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg">
                        ✓ {tsLabel}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TerminalGereedTab;
