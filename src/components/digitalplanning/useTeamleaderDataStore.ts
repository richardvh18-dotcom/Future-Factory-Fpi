import { useMemo } from "react";
import { normalizeMachine, FITTING_MACHINES, getStartedCounterField } from "../../utils/hubHelpers";
import { normalizeOrderStatus } from "../../utils/trackingHelpers";

type FactoryStation = {
  id?: string;
  name?: string;
  department?: string;
  [key: string]: unknown;
};

type FactoryDepartment = {
  slug?: string;
  id?: string;
  name?: string;
  stations?: FactoryStation[];
};

type FactoryConfig = {
  departments?: FactoryDepartment[];
};

type RawProduct = {
  id?: string;
  machine?: string;
  originMachine?: string;
  currentStation?: string;
  lastStation?: string;
  status?: string;
  currentStep?: string;
  [key: string]: unknown;
};

type RawOrder = {
  orderId?: string;
  machine?: string;
  station?: string;
  status?: string;
  orderStatus?: string;
  delegatedTo?: unknown;
  department?: string;
  originalDepartment?: string;
  [key: string]: unknown;
};

type OrderProgressMeta = {
  trackedInScopeCount: number;
  activeTrackedInScopeCount: number;
  trackedLots: Set<string>;
};

type UseTeamleaderDataStoreArgs = {
  rawOrders: RawOrder[];
  rawProducts: RawProduct[];
  factoryConfig?: FactoryConfig;
  fixedScope?: string;
  allowedMachines?: string[];
  departmentFilter?: string;
  getOrderIdFromTrackedRecord: (record: RawProduct) => string | undefined;
  getLotFromTrackedRecord: (record: RawProduct) => string | undefined;
};

/**
 * useTeamleaderDataStore
 *
 * Derives scope/station config and the filtered+enriched order list (dataStore)
 * from raw Firestore data + component props.
 *
 * Returns: safeScope, targetSlug, effectiveStations, effectiveAllowedNorms,
 *          orderProgressMeta, dataStore.
 */
export const useTeamleaderDataStore = ({
  rawOrders,
  rawProducts,
  factoryConfig,
  fixedScope,
  allowedMachines,
  departmentFilter,
  getOrderIdFromTrackedRecord,
  getLotFromTrackedRecord,
}: UseTeamleaderDataStoreArgs) => {
  const safeScope = (fixedScope || "all").toLowerCase();
  const scopeMap = {
    fittings: "fittings",
    pipes: "pipes",
    spools: "spools",
    pipe: "pipes",
  };
  const targetSlug = scopeMap[safeScope] || safeScope;

  // 1. Determine effective stations for this scope
  const effectiveStations = useMemo(() => {
    let stations;
    let deptStations = [];

    if (factoryConfig && factoryConfig.departments && safeScope !== "all") {
      const dept = factoryConfig.departments.find(
        (d) =>
          d.slug === targetSlug ||
          d.id === targetSlug ||
          String(d.name || "").toLowerCase() === targetSlug
      );
      deptStations = dept ? dept.stations || [] : [];
    } else if (factoryConfig && factoryConfig.departments) {
      if (departmentFilter !== "ALL") {
        const filterSlug = departmentFilter.toLowerCase();
        const dept = factoryConfig.departments.find(
          (d) =>
            d.slug === filterSlug ||
            d.id === filterSlug ||
            String(d.name || "").toLowerCase() === filterSlug
        );
        deptStations = dept ? dept.stations || [] : [];
      } else {
        deptStations = factoryConfig.departments.flatMap((d) => d.stations || []);
      }
    }

    if (allowedMachines && allowedMachines.length > 0) {
      stations = allowedMachines
        .map((m) => {
          const found = deptStations.find(
            (s) => normalizeMachine(s.name || "") === normalizeMachine(m)
          );
          return found || null;
        })
        .filter(Boolean);
    } else {
      stations = deptStations;
    }

    // Failsafe: exclude cross-dept stations by scope
    if (safeScope === "fittings") {
      const excludedBA = ["BA05", "BA07", "BA08", "BA09"];
      stations = stations.filter((s) => {
        const n = normalizeMachine(s.name || "");
        return !excludedBA.includes(n);
      });
    } else if (safeScope === "pipes" || safeScope === "pipe") {
      stations = stations.filter((s) => {
        const n = normalizeMachine(s.name || "");
        return (
          !n.startsWith("BM") &&
          !n.includes("MAZAK") &&
          !n.includes("NABEWERK")
        );
      });
      if (!stations.some((s) => s.name === "SPOOLS_INBOX")) {
        stations.push({
          id: "SPOOLS_INBOX",
          name: "SPOOLS_INBOX",
          department: "pipes",
        });
      }
    }

    return stations;
  }, [allowedMachines, factoryConfig, safeScope, targetSlug, departmentFilter]);

  // 2. Normalized machine names for filtering
  const effectiveAllowedNorms = useMemo(() => {
    const baseNorms = effectiveStations
      .map((s) => normalizeMachine(s.name))
      .filter((n) => n && n !== "TEAMLEADER" && n !== "ALGEMEEN");

    if (safeScope === "fittings") {
      const fittingNorms = FITTING_MACHINES.map((stationName) =>
        normalizeMachine(stationName)
      ).filter(Boolean);
      return Array.from(new Set([...baseNorms, ...fittingNorms]));
    }

    return baseNorms;
  }, [effectiveStations, safeScope]);

  // 3. Per-order tracking metadata (for scope-aware progress)
  const orderProgressMeta = useMemo(() => {
    const perOrder = new Map();

    rawProducts.forEach((product) => {
      const orderId = getOrderIdFromTrackedRecord(product);
      if (!orderId) return;

      const machineNorm = normalizeMachine(product?.machine || "");
      const originNorm = normalizeMachine(product?.originMachine || "");
      const currentNorm = normalizeMachine(product?.currentStation || "");
      const lastNorm = normalizeMachine(product?.lastStation || "");

      const inScope =
        effectiveAllowedNorms.length === 0 ||
        [machineNorm, originNorm, currentNorm, lastNorm].some((value) =>
          value ? effectiveAllowedNorms.includes(value) : false
        );

      if (!inScope) return;

      const existing: OrderProgressMeta = perOrder.get(orderId) || {
        trackedInScopeCount: 0,
        activeTrackedInScopeCount: 0,
        trackedLots: new Set(),
      };

      existing.trackedInScopeCount += 1;
      const status = String(product?.status || "").trim().toLowerCase();
      const step = String(product?.currentStep || "").trim().toLowerCase();
      const isInactive =
        status === "archived_rejected" ||
        ["finished", "completed", "gereed", "rejected", "afkeur"].includes(status) ||
        step === "finished" ||
        step === "rejected";
      if (!isInactive) existing.activeTrackedInScopeCount += 1;

      const lotNumber =
        getLotFromTrackedRecord(product) || String(product?.id || "").trim();
      if (lotNumber) existing.trackedLots.add(lotNumber);
      perOrder.set(orderId, existing);
    });

    return perOrder;
  }, [rawProducts, effectiveAllowedNorms, getOrderIdFromTrackedRecord, getLotFromTrackedRecord]);

  // 4. Filtered + enriched order list
  const dataStore = useMemo(() => {
    if (!rawOrders) return [];

    const bh17InRaw = rawOrders.filter((o) =>
      String(o.machine || "").toUpperCase().includes("BH17")
    );
    if (bh17InRaw.length > 0) {
      console.log(
        "[DEBUG BH17] dataStore: BH17 orders in rawOrders:",
        bh17InRaw.length,
        "effectiveAllowedNorms:",
        effectiveAllowedNorms,
        "targetSlug:",
        targetSlug,
        "departmentFilter:",
        departmentFilter
      );
    }

    return rawOrders
      .map((o) => {
        const normMachine = normalizeMachine(o.machine || "");
        const statusNorm = normalizeOrderStatus(o.status || o.orderStatus);
        const isMazakMachine = normMachine === "MAZAK";
        const shouldShowMazakStatus =
          isMazakMachine &&
          [
            "te_nabewerken",
            "wacht_op_nabewerking",
            "nabewerking",
            "post_processing",
          ].includes(statusNorm);

        return {
          ...o,
          normMachine,
          status: shouldShowMazakStatus ? "Wacht op Mazak" : o.status,
        };
      })
      .filter((o) => {
        const orderId = String(o?.orderId || "").trim();
        const progressMeta = orderProgressMeta.get(orderId);

        if (targetSlug !== "all") {
          const dept = (o.department || "").toLowerCase();
          const origDept = (o.originalDepartment || "").toLowerCase();
          if (dept && dept !== targetSlug && origDept !== targetSlug) {
            return false;
          }
        }

        // Hard excludes by scope (failsafe)
        if (targetSlug === "fittings") {
          if (o.normMachine.startsWith("BA")) return false;
          if (o.station && normalizeMachine(o.station).startsWith("BA"))
            return false;
        }
        if (targetSlug === "pipes" || targetSlug === "pipe") {
          if (
            o.normMachine.startsWith("BM") ||
            o.normMachine.includes("MAZAK") ||
            o.normMachine.includes("NABEWERK")
          )
            return false;
          if (
            o.station &&
            (normalizeMachine(o.station).startsWith("BM") ||
              normalizeMachine(o.station).includes("MAZAK") ||
              normalizeMachine(o.station).includes("NABEWERK"))
          )
            return false;
        }

        if (targetSlug === "all" && departmentFilter === "ALL") return true;

        if (effectiveAllowedNorms.length > 0) {
          if (o.delegatedTo || o.machine === "SPOOLS_INBOX") return true;

          if (o.normMachine && effectiveAllowedNorms.includes(o.normMachine))
            return true;

          const hasStartedInScope = effectiveAllowedNorms.some((stationNorm) => {
            const startedField = getStartedCounterField(stationNorm);
            return startedField ? Number(o?.[startedField] || 0) > 0 : false;
          });
          if (hasStartedInScope) return true;

          if ((progressMeta?.trackedInScopeCount || 0) > 0) return true;

          return !o.normMachine;
        }

        return false;
      });
  }, [rawOrders, effectiveAllowedNorms, targetSlug, departmentFilter, orderProgressMeta]);

  return {
    safeScope,
    targetSlug,
    effectiveStations,
    effectiveAllowedNorms,
    orderProgressMeta,
    dataStore,
  };
};
