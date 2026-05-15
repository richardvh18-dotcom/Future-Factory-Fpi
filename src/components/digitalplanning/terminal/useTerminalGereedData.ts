import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { getArchiveItemsPath } from "../../../config/dbPaths";
import { normalizeMachine } from "../../../utils/hubHelpers";
import {
  getTrackedStatus,
  getTrackedStep,
  subtractWorkingDays,
  getTrackedCompletionDate,
} from "../../../utils/trackingHelpers";

const DAYS_BACK = 5;

interface TrackedItem {
  id?: string;
  lotNumber?: string;
  item?: string;
  itemCode?: string;
  itemDescription?: string;
  description?: string;
  orderId?: string;
  originMachine?: string;
  machine?: string;
  _source?: string;
  status?: unknown;
  currentStep?: unknown;
  timestamps?: {
    finished?: unknown;
    completed?: unknown;
    lossen_start?: unknown;
    wikkelen_end?: unknown;
    station_end?: unknown;
  };
  archivedAt?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
  [key: string]: any;
}

interface UseTerminalGereedDataParams {
  allTracked?: TrackedItem[];
  stationId?: string;
}

interface UseTerminalGereedDataReturn {
  gereedSearch: string;
  setGereedSearch: (search: string) => void;
  needle: string;
  filtered: TrackedItem[];
}

export const useTerminalGereedData = ({
  allTracked = [],
  stationId,
}: UseTerminalGereedDataParams): UseTerminalGereedDataReturn => {
  const [gereedSearch, setGereedSearch] = useState<string>("");
  const [archivedTracked, setArchivedTracked] = useState<TrackedItem[]>([]);

  const normalizedStationId = useMemo(
    () => (normalizeMachine(stationId || "") || "").toUpperCase().trim(),
    [stationId]
  );

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const cutoff = subtractWorkingDays(new Date(), DAYS_BACK);
        const years = Array.from(new Set([cutoff.getFullYear(), new Date().getFullYear()]));
        const snaps = await Promise.all(
          years.map((y) => getDocs(collection(db, ...(getArchiveItemsPath(y) as [string, ...string[]]))))
        );
        const items = snaps.flatMap((snap) =>
          snap.docs.map((d) => ({ id: d.id, ...d.data(), _source: "archive" } as TrackedItem))
        );

        if (isMounted) setArchivedTracked(items);
      } catch (e) {
        console.warn("Archief laden mislukt:", e);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [normalizedStationId]);

  const completedByStation = useMemo(() => {
    const cutoff = subtractWorkingDays(new Date(), DAYS_BACK);

    const getTimestampMs = (item: TrackedItem): number => {
      const best = getTrackedCompletionDate(item);
      return best ? best.getTime() : 0;
    };

    const filterItem = (item: TrackedItem): boolean => {
      const originNorm = (normalizeMachine(item?.originMachine || item?.machine || "") || "")
        .toUpperCase()
        .trim();
      if (originNorm !== normalizedStationId) return false;

      const step = getTrackedStep(item).toUpperCase();
      const status = getTrackedStatus(item);
      if (status === "rejected" || step === "REJECTED") return false;

      const isStillInWinding = step === "WIKKELEN" || step === "HOLD_AREA";
      if (isStillInWinding) return false;

      const ts = getTrackedCompletionDate(item);
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

  const filtered = useMemo(() => {
    if (!needle) return completedByStation;

    return completedByStation.filter((item) => {
      const product = [item.item, item.itemCode, item.itemDescription, item.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const order = String(item.orderId || "").toLowerCase();
      const lot = String(item.lotNumber || "").toLowerCase();
      return product.includes(needle) || order.includes(needle) || lot.includes(needle);
    });
  }, [completedByStation, needle]);

  return {
    gereedSearch,
    setGereedSearch,
    needle,
    filtered,
  };
};
