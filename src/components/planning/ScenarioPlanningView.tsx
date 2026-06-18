import React, { useState, useEffect, useMemo } from "react";
import { 
  Beaker, 
  Plus, 
  Trash2,
  Copy,
} from "lucide-react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS, getPathString } from "../../config/dbPaths";
import { addDays } from "date-fns";
import { useNotifications } from "../../contexts/NotificationContext";
import { useTranslation } from "react-i18next";

type ChangeType =
  | "add_capacity"
  | "remove_capacity"
  | "delay_order"
  | "rush_order"
  | "change_efficiency";

type ScenarioChange = {
  id: number;
  type: ChangeType;
  machine: string;
  hours: number;
  days: number;
  orderId: string;
  efficiency: number;
};

type Scenario = {
  id: string;
  name: string;
  description: string;
  changes: ScenarioChange[];
  [key: string]: unknown;
};

type ScenarioDraft = {
  name: string;
  description: string;
  changes: ScenarioChange[];
};

type OccupancyRow = {
  id: string;
  machine?: string;
  productionHours?: number;
  efficiency?: number;
  [key: string]: unknown;
};

type DateLike =
  | { seconds?: number; _seconds?: number; toDate?: () => Date }
  | Date
  | string
  | number
  | null
  | undefined;

type PlanningRow = {
  id: string;
  plannedDate?: DateLike;
  estimatedHours?: number;
  [key: string]: unknown;
};

const isChangeType = (value: string): value is ChangeType => {
  return [
    "add_capacity",
    "remove_capacity",
    "delay_order",
    "rush_order",
    "change_efficiency",
  ].includes(value);
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toSeconds = (value: DateLike): number | null => {
  if (!value) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
  }
  if (typeof value === "object") {
    if (typeof value.toDate === "function") return Math.floor(value.toDate().getTime() / 1000);
    if (typeof value.seconds === "number") return value.seconds;
    if (typeof value._seconds === "number") return value._seconds;
  }
  return null;
};

/**
 * ScenarioPlanningView - What-if analysis for capacity planning
 * Simulate changes before implementing them
 */
const ScenarioPlanningView = () => {
  const { showConfirm , notify} = useNotifications();
  const { t } = useTranslation();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyRow[]>([]);
  const [planning, setPlanning] = useState<PlanningRow[]>([]);
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
  const [showCreateScenario, setShowCreateScenario] = useState(false);
  const [newScenario, setNewScenario] = useState<ScenarioDraft>({
    name: "",
    description: "",
    changes: []
  });

  useEffect(() => {
    // Load scenarios
    const unsubScenarios = onSnapshot(
      collection(db, getPathString(PATHS.SCENARIOS)),
      (snapshot) => {
        const scenariosData: Scenario[] = snapshot.docs.map((docEntry) => {
          const raw = docEntry.data() as Record<string, unknown>;
          const rawChanges = Array.isArray(raw.changes) ? raw.changes : [];
          const changes: ScenarioChange[] = rawChanges
            .map((change, idx) => {
              const c = (change || {}) as Record<string, unknown>;
              const type = typeof c.type === "string" && isChangeType(c.type) ? c.type : "add_capacity";
              return {
                id: typeof c.id === "number" ? c.id : Date.now() + idx,
                type,
                machine: String(c.machine || ""),
                hours: toNumber(c.hours),
                days: toNumber(c.days),
                orderId: String(c.orderId || ""),
                efficiency: toNumber(c.efficiency),
              };
            });

          return {
            id: docEntry.id,
            name: String(raw.name || ""),
            description: String(raw.description || ""),
            changes,
            ...raw,
          };
        });
        setScenarios(scenariosData);
      }
    );

    // Load current data
    const unsubOccupancy = onSnapshot(
      collection(db, getPathString(PATHS.OCCUPANCY)),
      (snapshot) => {
        setOccupancy(
          snapshot.docs.map((docEntry): OccupancyRow => ({ id: docEntry.id, ...(docEntry.data() as Record<string, unknown>) }))
        );
      }
    );

    const unsubPlanning = onSnapshot(
      collection(db, getPathString(PATHS.PLANNING)),
      (snapshot) => {
        setPlanning(
          snapshot.docs.map((docEntry): PlanningRow => ({ id: docEntry.id, ...(docEntry.data() as Record<string, unknown>) }))
        );
      }
    );

    return () => {
      unsubScenarios();
      unsubOccupancy();
      unsubPlanning();
    };
  }, []);

  // Calculate scenario impact
  const calculateScenarioImpact = (scenario: Scenario | null) => {
    if (!scenario) return null;

    let modifiedOccupancy = [...occupancy];
    let modifiedPlanning = [...planning];

    // Apply scenario changes
    scenario.changes.forEach((change) => {
      switch (change.type) {
        case "add_capacity":
          modifiedOccupancy = modifiedOccupancy.map((o) => 
            o.machine === change.machine 
              ? { ...o, productionHours: toNumber(o.productionHours) + change.hours }
              : o
          );
          break;

        case "remove_capacity":
          modifiedOccupancy = modifiedOccupancy.map((o) => 
            o.machine === change.machine 
              ? { ...o, productionHours: Math.max(0, toNumber(o.productionHours) - change.hours) }
              : o
          );
          break;

        case "delay_order":
          modifiedPlanning = modifiedPlanning.map((o) => {
            if (o.id === change.orderId && o.plannedDate) {
              const oldSeconds = toSeconds(o.plannedDate);
              if (oldSeconds === null) return o;
              const oldDate = new Date(oldSeconds * 1000);
              const newDate = addDays(oldDate, change.days);
              return { 
                ...o, 
                plannedDate: { seconds: newDate.getTime() / 1000 } 
              };
            }
            return o;
          });
          break;

        case "rush_order":
          modifiedPlanning = modifiedPlanning.map((o) => {
            if (o.id === change.orderId && o.plannedDate) {
              const oldSeconds = toSeconds(o.plannedDate);
              if (oldSeconds === null) return o;
              const oldDate = new Date(oldSeconds * 1000);
              const newDate = addDays(oldDate, -change.days);
              return { 
                ...o, 
                plannedDate: { seconds: newDate.getTime() / 1000 } 
              };
            }
            return o;
          });
          break;

        case "change_efficiency":
          modifiedOccupancy = modifiedOccupancy.map((o) => 
            o.machine === change.machine 
              ? { ...o, efficiency: change.efficiency }
              : o
          );
          break;
      }
    });

    // Calculate metrics
    const totalCapacity = modifiedOccupancy.reduce((sum, o) => sum + toNumber(o.productionHours), 0);
    const totalDemand = modifiedPlanning.reduce((sum, o) => sum + toNumber(o.estimatedHours), 0);
    const utilization = totalCapacity > 0 ? (totalDemand / totalCapacity) * 100 : 0;
    const gap = totalCapacity - totalDemand;

    // Compare with baseline
    const baselineCapacity = occupancy.reduce((sum, o) => sum + toNumber(o.productionHours), 0);
    const baselineDemand = planning.reduce((sum, o) => sum + toNumber(o.estimatedHours), 0);
    const baselineGap = baselineCapacity - baselineDemand;

    const capacityChange = totalCapacity - baselineCapacity;
    const gapImprovement = gap - baselineGap;

    return {
      totalCapacity,
      totalDemand,
      utilization,
      gap,
      baselineCapacity,
      baselineDemand,
      baselineGap,
      capacityChange,
      gapImprovement,
      isImprovement: gapImprovement > 0
    };
  };

  const activeScenarioImpact = useMemo(() => 
    calculateScenarioImpact(activeScenario),
    [activeScenario, occupancy, planning]
  );

  // Create scenario
  const createScenario = async () => {
    if (!newScenario.name) {
      notify("Geef het scenario een naam");
      return;
    }

    await addDoc(collection(db, getPathString(PATHS.SCENARIOS)), {
      ...newScenario,
      createdAt: serverTimestamp(),
      createdBy: "current_user"
    });

    await logActivity(
      auth.currentUser?.uid || "system",
      "SCENARIO_CREATE",
      `Scenario aangemaakt: ${newScenario.name}`
    );

    setNewScenario({
      name: "",
      description: "",
      changes: []
    });
    setShowCreateScenario(false);
  };

  // Delete scenario
  const deleteScenario = async (scenarioId: string) => {
    const confirmed = await showConfirm({
      title: "Scenario verwijderen",
      message: "Weet je zeker dat je dit scenario wilt verwijderen?",
      confirmText: "Verwijderen",
      cancelText: "Annuleren",
      tone: "danger",
    });
    if (!confirmed) return;

    await deleteDoc(doc(db, `${getPathString(PATHS.SCENARIOS)}/${scenarioId}`));
    await logActivity(
      auth.currentUser?.uid || "system",
      "SCENARIO_DELETE",
      `Scenario verwijderd: ${scenarioId}`
    );
    if (activeScenario?.id === scenarioId) {
      setActiveScenario(null);
    }
  };

  // Clone scenario
  const cloneScenario = async (scenario: Scenario) => {
    await addDoc(collection(db, getPathString(PATHS.SCENARIOS)), {
      name: `${scenario.name} (kopie)`,
      description: scenario.description,
      changes: scenario.changes,
      createdAt: serverTimestamp(),
      createdBy: "current_user"
    });

    await logActivity(
      auth.currentUser?.uid || "system",
      "SCENARIO_CLONE",
      `Scenario gekloond: ${scenario.name}`
    );
  };

  // Add change to new scenario
  const addChange = (changeType: ChangeType) => {
    setNewScenario({
      ...newScenario,
      changes: [
        ...newScenario.changes,
        {
          id: Date.now(),
          type: changeType,
          machine: "",
          hours: 0,
          days: 0,
          orderId: "",
          efficiency: 0
        }
      ]
    });
  };

  // Remove change
  const removeChange = (changeId: number) => {
    setNewScenario({
      ...newScenario,
      changes: newScenario.changes.filter((c) => c.id !== changeId)
    });
  };

  // Update change
  const updateChange = (changeId: number, field: keyof ScenarioChange, value: string | number) => {
    setNewScenario({
      ...newScenario,
      changes: newScenario.changes.map((c) => 
        c.id === changeId ? { ...c, [field]: value } as ScenarioChange : c
      )
    });
  };

  const getChangeTypeLabel = (type: ChangeType) => {
    const labels: Record<ChangeType, string> = {
      add_capacity: t("scenarioPlanningView.addCapacity", "Capaciteit Toevoegen"),
      remove_capacity: t("scenarioPlanningView.removeCapacity", "Capaciteit Verminderen"),
      delay_order: t("scenarioPlanningView.delayOrder", "Order Uitstellen"),
      rush_order: t("scenarioPlanningView.rushOrder", "Order Vervroegen"),
      change_efficiency: t("scenarioPlanningView.changeEfficiency", "Efficiency Aanpassen")
    };
    return labels[type] || String(type);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-800">
              {t("scenarioPlanningView.title", "Scenario Planning")}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              What-if analyse: simuleer veranderingen voor je ze implementeert
            </p>
          </div>

          <button
            onClick={() => setShowCreateScenario(!showCreateScenario)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-bold transition-colors"
          >
            <Plus size={16} />
            {t("scenarioPlanningView.newScenario", "Nieuw Scenario")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Scenarios List */}
        <div className="space-y-4">
          {showCreateScenario && (
            <div className="bg-white rounded-2xl shadow-sm border-2 border-purple-200 p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4">{t("scenarioPlanningView.newScenario", "Nieuw Scenario")}</h3>
              
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder={t("planning.scenario.namePlaceholder", "Scenario naam...")}
                  value={newScenario.name}
                  onChange={(e) => setNewScenario({ ...newScenario, name: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                />

                <textarea
                  placeholder={t("planning.scenario.descriptionPlaceholder", "Beschrijving...")}
                  value={newScenario.description}
                  onChange={(e) => setNewScenario({ ...newScenario, description: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                  rows={3}
                />

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                    {t("scenarioPlanningView.changes", "Wijzigingen")}
                  </label>
                  <div className="space-y-2 mb-3">
                    {newScenario.changes.map((change) => (
                      <div key={change.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-600">
                            {getChangeTypeLabel(change.type)}
                          </span>
                          <button
                            onClick={() => removeChange(change.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        {/* Dynamic inputs based on change type */}
                        {(change.type === "add_capacity" || change.type === "remove_capacity") && (
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              placeholder={t("planning.scenario.machinePlaceholder", "Machine")}
                              value={change.machine}
                              onChange={(e) => updateChange(change.id, "machine", e.target.value)}
                              className="px-2 py-1 text-xs border border-slate-200 rounded"
                            />
                            <input
                              type="number"
                              placeholder={t("planning.scenario.hoursPlaceholder", "Uren")}
                              value={change.hours}
                              onChange={(e) => updateChange(change.id, "hours", parseInt(e.target.value))}
                              className="px-2 py-1 text-xs border border-slate-200 rounded"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        if (isChangeType(e.target.value)) addChange(e.target.value);
                        e.target.value = "";
                      }
                    }}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
                  >
                    <option value="">{t("scenarioPlanningView.addChange", "Wijziging toevoegen...")}</option>
                    <option value="add_capacity">{t("scenarioPlanningView.addCapacity", "Capaciteit Toevoegen")}</option>
                    <option value="remove_capacity">{t("scenarioPlanningView.removeCapacity", "Capaciteit Verminderen")}</option>
                    <option value="delay_order">{t("scenarioPlanningView.delayOrder", "Order Uitstellen")}</option>
                    <option value="rush_order">{t("scenarioPlanningView.rushOrder", "Order Vervroegen")}</option>
                    <option value="change_efficiency">{t("scenarioPlanningView.changeEfficiency", "Efficiency Aanpassen")}</option>
                  </select>
                </div>

                <div className="flex gap-2 pt-4 border-t-2 border-slate-200">
                  <button
                    onClick={createScenario}
                    className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-bold transition-colors"
                  >
                    {t("scenarioPlanningView.saveScenario", "Scenario Opslaan")}
                  </button>
                  <button
                    onClick={() => setShowCreateScenario(false)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold transition-colors"
                  >
                    {t("common.cancel", "Annuleren")}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200">
            <div className="p-4 border-b-2 border-slate-200 bg-slate-50">
                <h3 className="text-sm font-bold text-slate-800">{t("scenarioPlanningView.scenariosCount", "Scenarios ({{count}})", { count: scenarios.length })}</h3>
            </div>
            <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto">
              {scenarios.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  Nog geen scenarios
                </div>
              ) : (
                scenarios.map((scenario) => (
                  <div
                    key={scenario.id}
                    onClick={() => setActiveScenario(scenario)}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      activeScenario?.id === scenario.id
                        ? "border-purple-500 bg-purple-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-bold text-sm text-slate-800">{scenario.name}</div>
                        <div className="text-xs text-slate-500 mt-1">{scenario.description}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            cloneScenario(scenario);
                          }}
                          className="p-1 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          <Copy className="text-blue-600" size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteScenario(scenario.id);
                          }}
                          className="p-1 hover:bg-red-100 rounded-lg transition-colors"
                        >
                          <Trash2 className="text-red-600" size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      {scenario.changes.length} wijziging(en)
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Scenario Analysis */}
        <div className="col-span-2">
          {activeScenario && activeScenarioImpact ? (
            <div className="space-y-6">
              {/* Impact Summary */}
              <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4">{t("scenarioPlanningView.impactAnalysis", "Impact Analyse")}</h3>
                
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center">
                    <div className="text-xs text-slate-500 uppercase mb-1">{t("scenarioPlanningView.capacity", "Capaciteit")}</div>
                    <div className="text-2xl font-black text-slate-800">
                      {Math.round(activeScenarioImpact.totalCapacity)}h
                    </div>
                    <div className={`text-xs font-bold mt-1 ${
                      activeScenarioImpact.capacityChange >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {activeScenarioImpact.capacityChange >= 0 ? '+' : ''}{Math.round(activeScenarioImpact.capacityChange)}h
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-xs text-slate-500 uppercase mb-1">{t("scenarioPlanningView.utilization", "Utilization")}</div>
                    <div className="text-2xl font-black text-slate-800">
                      {Math.round(activeScenarioImpact.utilization)}%
                    </div>
                    <div className={`text-xs font-bold mt-1 ${
                      activeScenarioImpact.utilization < 90 ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {activeScenarioImpact.utilization < 90 ? 'Gezond' : 'Overbelast'}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-xs text-slate-500 uppercase mb-1">{t("scenarioPlanningView.gap", "Gap")}</div>
                    <div className={`text-2xl font-black ${
                      activeScenarioImpact.gap >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {activeScenarioImpact.gap >= 0 ? '+' : ''}{Math.round(activeScenarioImpact.gap)}h
                    </div>
                    <div className={`text-xs font-bold mt-1 ${
                      activeScenarioImpact.isImprovement ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {activeScenarioImpact.isImprovement ? '✓ Verbetering' : '✗ Verslechtering'}
                    </div>
                  </div>
                </div>

                {/* Comparison */}
                <div className="pt-6 border-t-2 border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-600 uppercase">{t("scenarioPlanningView.baseline", "Baseline")}</span>
                    <span className="text-sm font-bold text-slate-700">
                      {Math.round(activeScenarioImpact.baselineCapacity)}h capaciteit / 
                      {Math.round(activeScenarioImpact.baselineGap)}h gap
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-600 uppercase">{t("scenarioPlanningView.afterScenario", "Na Scenario")}</span>
                    <span className="text-sm font-bold text-purple-700">
                      {Math.round(activeScenarioImpact.totalCapacity)}h capaciteit / 
                      {Math.round(activeScenarioImpact.gap)}h gap
                    </span>
                  </div>
                </div>
              </div>

              {/* Changes List */}
              <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Wijzigingen ({activeScenario.changes.length})</h3>
                <div className="space-y-3">
                  {activeScenario.changes.map((change, idx) => (
                    <div key={idx} className="p-4 bg-purple-50 border-2 border-purple-200 rounded-xl">
                      <div className="font-bold text-sm text-slate-800 mb-2">
                        {getChangeTypeLabel(change.type as ChangeType)}
                      </div>
                      <div className="text-xs text-slate-600">
                        {change.machine && `Machine: ${change.machine}`}
                        {change.hours && ` | ${change.hours}h`}
                        {change.days && ` | ${change.days} dagen`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 p-12 text-center">
              <Beaker className="mx-auto mb-4 text-slate-300" size={48} />
              <div className="text-slate-400">
                Selecteer een scenario om de impact te analyseren
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScenarioPlanningView;
