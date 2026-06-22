import React, { useMemo, useState, useEffect } from "react";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS, getPathString } from "../../config/dbPaths";
import {
  Plus,
  Trash2,
  Pencil,
  Save,
  Search,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNotifications } from "../../contexts/NotificationContext";
import { useFormPersistence } from "../../hooks/useFormPersistence";

type RuleVariable = {
  name: string;
  triggerField: string;
  defaultValue?: string;
  mappings?: Array<{ condition: string; value: string }>;
};

type Rule = {
  id: string;
  productCode?: string;
  variables?: RuleVariable[];
};

type GeneralSettings = {
  codes?: string[];
  labelPrintRules?: OperatorPrintRule[];
};

type OperatorPrintRule = {
  id: string;
  enabled: boolean;
  productType: string;
  code?: string;
  minDiameter?: number;
  maxDiameter?: number;
  angle?: number;
  labelCount: number;
  labelSize: "large" | "small";
};

const createPrintRuleId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const normalizePrintRule = (rule: Partial<OperatorPrintRule> | null | undefined): OperatorPrintRule => {
  const normalizedProductType = String(rule?.productType || "ANY").trim().toUpperCase() || "ANY";
  const normalizedCode = String(rule?.code || "ANY").trim().toUpperCase() || "ANY";
  const parsedLabelCount = parseInt(String(rule?.labelCount || "1"), 10);
  const toOptionalNumber = (value: unknown): number | undefined => {
    if (value === undefined || value === null || value === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return {
    id: String(rule?.id || createPrintRuleId()),
    enabled: rule?.enabled !== false,
    productType: normalizedProductType,
    code: normalizedCode,
    minDiameter: toOptionalNumber(rule?.minDiameter),
    maxDiameter: toOptionalNumber(rule?.maxDiameter),
    angle: toOptionalNumber(rule?.angle),
    labelCount: Math.max(1, Number.isFinite(parsedLabelCount) ? parsedLabelCount : 1),
    labelSize: rule?.labelSize === "large" ? "large" : "small",
  };
};

const normalizePrintRules = (rules: unknown): OperatorPrintRule[] => {
  if (!Array.isArray(rules)) return [];
  return rules.map((rule) => normalizePrintRule(rule as Partial<OperatorPrintRule>));
};

const buildPrintRuleSignature = (rule: OperatorPrintRule): string => {
  const toSigNumber = (value: number | undefined): string =>
    value === undefined || value === null ? "*" : String(value);

  return [
    rule.enabled ? "1" : "0",
    String(rule.productType || "ANY").trim().toUpperCase() || "ANY",
    String(rule.code || "ANY").trim().toUpperCase() || "ANY",
    toSigNumber(rule.minDiameter),
    toSigNumber(rule.maxDiameter),
    toSigNumber(rule.angle),
    String(Math.max(1, Number(rule.labelCount) || 1)),
    rule.labelSize === "large" ? "large" : "small",
  ].join("|");
};

const dedupePrintRulesByContent = (
  rules: OperatorPrintRule[],
  preferredRuleIds: Set<string>
): { dedupedRules: OperatorPrintRule[]; removedCount: number } => {
  const bySignature = new Map<string, OperatorPrintRule>();

  rules.forEach((rule) => {
    const signature = buildPrintRuleSignature(rule);
    const existing = bySignature.get(signature);

    if (!existing) {
      bySignature.set(signature, rule);
      return;
    }

    const currentIsPreferred = preferredRuleIds.has(rule.id);
    const existingIsPreferred = preferredRuleIds.has(existing.id);

    if (currentIsPreferred && !existingIsPreferred) {
      bySignature.set(signature, rule);
    }
  });

  const dedupedRules = Array.from(bySignature.values());
  return {
    dedupedRules,
    removedCount: Math.max(0, rules.length - dedupedRules.length),
  };
};

const formatRuleValue = (value: number | undefined): string => {
  if (value === undefined || value === null) return "*";
  if (value <= 0) return "*";
  return String(value);
};

const sanitizeForFirestore = (value: unknown): unknown => {
  if (value === undefined || value === null) return null;

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForFirestore(entry));
  }

  if (typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) continue;
      cleaned[key] = sanitizeForFirestore(entry);
    }
    return cleaned;
  }

  return value;
};

const TRIGGER_OPTIONS = [
  { value: "project", label: "Project Nummer" },
  { value: "diameter", label: "Diameter (DN)" },
  { value: "innerDiameter", label: "ID (Inwendige Diameter)" },
  { value: "pressure", label: "Drukklasse (PN)" },
  { value: "itemCode", label: "Artikel Code" },
  { value: "productType", label: "Product Type" },
  { value: "temperature", label: "Temperatuur Limiet" },
  { value: "pipingClass", label: "Piping Class" },
  { value: "pressureLineEmt", label: "Pressure Line EMT" },
  { value: "tagNumber", label: "Tag Nummer" },
  { value: "jointCode", label: "Joint Code" },
  { value: "nprs", label: "NPRs (Nominal Pressure Rating)" },
  { value: "pq", label: "Pq (Qualified Pressure)" },
  { value: "extraCode", label: "Code (Extra Code)" },
];

const AdminLabelLogic: React.FC = () => {
  const { t } = useTranslation();
  const { showConfirm, notify, showSuccess, showError } = useNotifications();
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [availableCodes, setAvailableCodes] = useState<string[]>([]);

  // Form state
  const [formState, setFormState, clearPersistedForm] = useFormPersistence<{
    formCode: string;
    variables: RuleVariable[];
    testInputs: Record<string, any>;
  }>("admin_label_logic_form", {
    formCode: "",
    variables: [],
    testInputs: {},
  });
  const [printRules, setPrintRules] = useState<OperatorPrintRule[]>([]);
  const [savedPrintRules, setSavedPrintRules] = useState<OperatorPrintRule[]>([]);
  const [hasUnsavedPrintRuleChanges, setHasUnsavedPrintRuleChanges] = useState(false);
  const [activeEditSavedRuleId, setActiveEditSavedRuleId] = useState<string | null>(null);
  const [isSavingPrintRules, setIsSavingPrintRules] = useState(false);

  const formCode = formState.formCode;
  const variables = formState.variables;
  const testInputs = formState.testInputs;

  const labelLogicCollectionPath = getPathString(PATHS.LABEL_LOGIC);

  const filteredRules = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter((r) => {
      const id = String(r.id || "").toLowerCase();
      const code = String(r.productCode || "").toLowerCase();
      return id.includes(q) || code.includes(q);
    });
  }, [rules, searchTerm]);

  const usedTriggerFields = useMemo(
    () => Array.from(new Set((variables || []).map((v) => v.triggerField).filter(Boolean))),
    [variables]
  );

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, labelLogicCollectionPath),
      (snap) => {
        setRules(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );

    // Keep label settings live-synced so operators always see backend state.
    const settingsRef = doc(db, getPathString(PATHS.GENERAL_SETTINGS));
    const unsubSettings = onSnapshot(
      settingsRef,
      (snap) => {
        const settings = (snap.data() || {}) as GeneralSettings;
        setAvailableCodes(Array.isArray(settings?.codes) ? settings.codes : []);
        const normalizedRules = normalizePrintRules(settings?.labelPrintRules);
        setSavedPrintRules(normalizedRules);
        if (!hasUnsavedPrintRuleChanges) {
          setPrintRules([]);
          setActiveEditSavedRuleId(null);
        }
      },
      (error) => {
        console.error("Error loading general settings:", error);
      }
    );

    return () => {
      unsub();
      unsubSettings();
    };
  }, [labelLogicCollectionPath, hasUnsavedPrintRuleChanges]);

  const handleSelect = (rule: Rule) => {
    setSelectedRule(rule);
    setFormState({
      formCode: rule.productCode || "",
      variables: rule.variables || [],
      testInputs: {},
    });
  };

  const handleNew = () => {
    setSelectedRule({ id: "new" });
    setFormState({ formCode: "", variables: [], testInputs: {} });
  };

  const getNewVariable = (): RuleVariable => ({
    name: "new_var",
    triggerField: "itemCode",
    defaultValue: "",
    mappings: [{ condition: "", value: "" }],
  });

  const updateVariable = (index: number, patch: Partial<RuleVariable>) => {
    setFormState((prev) => ({
      ...prev,
      variables: prev.variables.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }));
  };

  const removeVariable = (index: number) => {
    setFormState((prev) => ({
      ...prev,
      variables: prev.variables.filter((_, i) => i !== index),
    }));
  };

  const addMapping = (index: number) => {
    setFormState((prev) => ({
      ...prev,
      variables: prev.variables.map((v, i) =>
        i === index
          ? {
              ...v,
              mappings: [...(Array.isArray(v.mappings) ? v.mappings : []), { condition: "", value: "" }],
            }
          : v
      ),
    }));
  };

  const updateMapping = (
    variableIndex: number,
    mappingIndex: number,
    patch: Partial<{ condition: string; value: string }>
  ) => {
    setFormState((prev) => ({
      ...prev,
      variables: prev.variables.map((v, i) => {
        if (i !== variableIndex) return v;
        const mappings = Array.isArray(v.mappings) ? [...v.mappings] : [];
        const current = mappings[mappingIndex] || { condition: "", value: "" };
        mappings[mappingIndex] = { ...current, ...patch };
        return { ...v, mappings };
      })
    }));
  };

  const removeMapping = (variableIndex: number, mappingIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      variables: prev.variables.map((v, i) => {
        if (i !== variableIndex) return v;
        return {
          ...v,
          mappings: (Array.isArray(v.mappings) ? v.mappings : []).filter((_, mi) => mi !== mappingIndex),
        };
      })
    }));
  };

  const evaluateCondition = (conditionRaw: string, inputRaw: unknown): boolean => {
    const condition = String(conditionRaw || "").trim();
    if (!condition) return false;

    const inputString = String(inputRaw ?? "").trim();
    const inputNumber = Number.parseFloat(inputString);
    const hasNumericInput = Number.isFinite(inputNumber);

    const opMatch = condition.match(/^(>=|<=|!=|=|>|<)\s*(.+)$/);
    if (!opMatch) {
      return inputString.toLowerCase() === condition.toLowerCase();
    }

    const [, op, operandRaw] = opMatch;
    const operandString = String(operandRaw || "").trim();
    const operandNumber = Number.parseFloat(operandString);
    const hasNumericOperand = Number.isFinite(operandNumber);

    if (hasNumericInput && hasNumericOperand) {
      if (op === ">") return inputNumber > operandNumber;
      if (op === "<") return inputNumber < operandNumber;
      if (op === ">=") return inputNumber >= operandNumber;
      if (op === "<=") return inputNumber <= operandNumber;
      if (op === "=") return inputNumber === operandNumber;
      if (op === "!=") return inputNumber !== operandNumber;
    }

    const left = inputString.toLowerCase();
    const right = operandString.toLowerCase();
    if (op === "=") return left === right;
    if (op === "!=") return left !== right;
    return false;
  };

  const resolveVariableValue = (variable: RuleVariable): string => {
    const inputValue = testInputs[variable.triggerField];
    const mappings = Array.isArray(variable.mappings) ? variable.mappings : [];
    const hit = mappings.find((m) => evaluateCondition(m.condition, inputValue));
    if (hit) return String(hit.value || "");
    if (inputValue !== undefined && inputValue !== null && String(inputValue).trim() !== "") {
      return String(inputValue);
    }
    return String(variable.defaultValue || "");
  };

  const sanitizeRuleForSave = (ruleVariables: RuleVariable[]): RuleVariable[] =>
    (ruleVariables || [])
      .filter((v) => String(v.name || "").trim() && String(v.triggerField || "").trim())
      .map((v) => ({
        name: String(v.name || "").trim(),
        triggerField: String(v.triggerField || "").trim(),
        defaultValue: String(v.defaultValue || ""),
        mappings: (Array.isArray(v.mappings) ? v.mappings : [])
          .filter((m) => String(m.condition || "").trim())
          .map((m) => ({
            condition: String(m.condition || "").trim(),
            value: String(m.value || ""),
          })),
      }));

  const handleSave = async () => {
    try {
      const productCode = String(formCode || "").trim().toUpperCase();
      if (!productCode) {
        notify(t("adminLabelLogic.validationCodeRequired", "Vul een productcode in."));
        return;
      }

      const cleanVariables = sanitizeRuleForSave(variables);
      const docId = selectedRule && selectedRule.id && selectedRule.id !== "new" && selectedRule.id !== "new_example"
        ? selectedRule.id
        : productCode;
      const ref = doc(db, labelLogicCollectionPath, docId);

      await setDoc(
        ref,
        {
          productCode,
          variables: cleanVariables,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid || "unknown",
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      await logActivity(auth.currentUser?.uid || "unknown", "label_logic_saved", {
        productCode,
        variableCount: cleanVariables.length,
      });

      setSelectedRule({ id: docId, productCode, variables: cleanVariables });
      clearPersistedForm();
      setFormState({
        formCode: productCode,
        variables: cleanVariables,
        testInputs: {},
      });
      showSuccess(t("adminLabelLogic.saved", "Label logica opgeslagen."));
    } catch (error) {
      console.error("Error saving label logic:", error);
      showError(t("adminLabelLogic.saveFailed", "Opslaan mislukt."));
    }
  };

  const handleDelete = async () => {
    if (!selectedRule || !selectedRule.id || selectedRule.id === "new" || selectedRule.id === "new_example") {
      return;
    }

    const confirmed = await showConfirm({
      title: t("adminLabelLogic.deleteTitle", "Logica verwijderen"),
      message: t("adminLabelLogic.deleteMessage", "Weet je zeker dat je deze label-logica wilt verwijderen?"),
      confirmText: t("common.delete", "Verwijderen"),
      cancelText: t("common.cancel", "Annuleren"),
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, labelLogicCollectionPath, selectedRule.id));
      await logActivity(auth.currentUser?.uid || "unknown", "label_logic_deleted", {
        id: selectedRule.id,
        productCode: formCode,
      });
      handleNew();
      showSuccess(t("adminLabelLogic.deleted", "Label logica verwijderd."));
    } catch (error) {
      console.error("Error deleting label logic:", error);
      showError(t("adminLabelLogic.deleteFailed", "Verwijderen mislukt."));
    }
  };

  const handleLoadExample = async () => {
    if (variables.length > 0) {
      const confirmed = await showConfirm({
        title: t("adminLabelLogic.loadExampleTitle", "Voorbeeld laden"),
        message: t("admin.confirmClearExample"),
        confirmText: t("common.continue", "Doorgaan"),
        cancelText: t("common.cancel", "Annuleren"),
        tone: "warning",
      });
      if (!confirmed) return;
    }

    setSelectedRule({ id: "new_example" });
    setFormState({
      formCode: "A1S1",
      variables: [
        {
          name: "id_mm",
          triggerField: "innerDiameter",
          defaultValue: t("adminLabelLogic.idMmDefault"),
          mappings: [
            { condition: "> 0", value: t("adminLabelLogic.idSpecMm") },
          ],
        },
        {
          name: "nprs_bar",
          triggerField: "nprs",
        },
      ],
      testInputs: {},
    });
  };

  const addPrintRule = () => {
    setHasUnsavedPrintRuleChanges(true);
    setActiveEditSavedRuleId(null);
    setPrintRules((prev) => [
      ...prev,
      {
        id: createPrintRuleId(),
        enabled: true,
        productType: "ANY",
        code: "ANY",
        labelCount: 1,
        labelSize: "small",
      },
    ]);
  };

  const updatePrintRule = (id: string, patch: Partial<OperatorPrintRule>) => {
    setHasUnsavedPrintRuleChanges(true);
    setPrintRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removePrintRule = (id: string) => {
    setHasUnsavedPrintRuleChanges(true);
    setPrintRules((prev) => prev.filter((r) => r.id !== id));
    if (activeEditSavedRuleId === id) {
      setActiveEditSavedRuleId(null);
    }
  };

  const editSavedPrintRule = (id: string) => {
    const savedRule = savedPrintRules.find((rule) => rule.id === id);
    if (!savedRule) return;

    const editableRule = normalizePrintRule(savedRule);

    setHasUnsavedPrintRuleChanges(true);
    setActiveEditSavedRuleId(id);
    setPrintRules((prev) => {
      const withoutCurrentRule = prev.filter((rule) => rule.id !== id);
      return [...withoutCurrentRule, editableRule];
    });
    notify(t("adminLabelLogic.ruleLoadedForEdit", "Regel geladen voor bewerken."));
  };

  const deleteSavedPrintRule = async (id: string) => {
    const confirmed = await showConfirm({
      title: t("adminLabelLogic.deleteRuleTitle", "Regel verwijderen"),
      message: t("adminLabelLogic.deleteRuleMessage", "Weet je zeker dat je deze opgeslagen regel wilt verwijderen?"),
      confirmText: t("common.delete", "Verwijderen"),
      cancelText: t("common.cancel", "Annuleren"),
      tone: "danger",
    });

    if (!confirmed) return;

    setIsSavingPrintRules(true);
    try {
      const updatedSavedRules = normalizePrintRules(savedPrintRules.filter((rule) => rule.id !== id));
      await persistLabelPrintRules(updatedSavedRules);

      setSavedPrintRules(updatedSavedRules);
      setPrintRules((prev) => prev.filter((rule) => rule.id !== id));
      if (activeEditSavedRuleId === id) {
        setActiveEditSavedRuleId(null);
      }

      await logActivity(auth.currentUser?.uid || "unknown", "label_print_rule_deleted", {
        count: updatedSavedRules.length,
      });

      showSuccess(t("adminLabelLogic.printRuleDeleted", "Printregel verwijderd."));
    } catch (error) {
      console.error("Error deleting print rule:", error);
      showError(t("adminLabelLogic.printRuleDeleteFailed", "Verwijderen van printregel mislukt."));
    } finally {
      setIsSavingPrintRules(false);
    }
  };

  const savePrintRules = async () => {
    setIsSavingPrintRules(true);
    try {
      const cleanedDraftRules = normalizePrintRules(printRules);
      const draftRuleIds = new Set(cleanedDraftRules.map((rule) => rule.id));
      const mergedById = new Map<string, OperatorPrintRule>();

      normalizePrintRules(savedPrintRules).forEach((rule) => {
        mergedById.set(rule.id, rule);
      });
      cleanedDraftRules.forEach((rule) => {
        mergedById.set(rule.id, rule);
      });

  const mergedRules = Array.from(mergedById.values());
  const { dedupedRules, removedCount } = dedupePrintRulesByContent(mergedRules, draftRuleIds);
      await persistLabelPrintRules(dedupedRules);

      setSavedPrintRules(dedupedRules);
      setPrintRules([]);
      setHasUnsavedPrintRuleChanges(false);
      setActiveEditSavedRuleId(null);

      await logActivity(auth.currentUser?.uid || "unknown", "label_print_rules_saved", {
        count: dedupedRules.length,
        duplicatesRemoved: removedCount,
      });

      showSuccess(t("adminLabelLogic.printRulesSaved", "Printregels opgeslagen."));
      if (removedCount > 0) {
        notify(`Dubbele regels automatisch opgeschoond: ${removedCount}`);
      }
    } catch (error) {
      console.error("Error saving print rules:", error);
      showError(t("adminLabelLogic.printRulesSaveFailed", "Opslaan van printregels mislukt."));
    } finally {
      setIsSavingPrintRules(false);
    }
  };

  const persistLabelPrintRules = async (rulesToPersist: OperatorPrintRule[]) => {
    const normalizedRules = normalizePrintRules(rulesToPersist);
    const firestorePayload = sanitizeForFirestore(normalizedRules);

    await setDoc(
      doc(db, getPathString(PATHS.GENERAL_SETTINGS)),
      {
        labelPrintRules: firestorePayload,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || "unknown",
      },
      { merge: true }
    );
  };

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 p-3 sm:p-4 md:p-6 bg-slate-100 overflow-y-auto">
      <aside className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col min-h-[420px]">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">
            {t("adminLabelLogic.rules", "Label logica")}
          </h2>
          <button
            type="button"
            onClick={handleNew}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold"
          >
            <Plus size={14} /> {t("common.new", "Nieuw")}
          </button>
        </div>

        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("adminLabelLogic.search", "Zoek op code...")}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold outline-none focus:border-blue-500"
          />
        </div>

        <button
          type="button"
          onClick={handleLoadExample}
          className="mb-3 w-full text-left px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs font-bold"
        >
          {t("adminLabelLogic.loadExample", "Voorbeeld laden")}
        </button>

        <div className="overflow-y-auto space-y-2 pr-1">
          {filteredRules.map((rule) => {
            const active = selectedRule?.id === rule.id;
            return (
              <button
                key={rule.id}
                type="button"
                onClick={() => handleSelect(rule)}
                className={`w-full text-left rounded-xl border px-3 py-2 transition-all ${
                  active ? "bg-blue-50 border-blue-300" : "bg-white border-slate-200 hover:border-slate-300"
                }`}
              >
                <p className="text-xs font-black text-slate-800">{rule.productCode || rule.id}</p>
                <p className="text-[11px] text-slate-500 font-semibold">
                  {(rule.variables || []).length} {t("adminLabelLogic.variablesCount", "variabelen")}
                </p>
              </button>
            );
          })}
          {filteredRules.length === 0 && (
            <div className="text-xs text-slate-500 font-semibold px-1 py-2">
              {t("adminLabelLogic.noRules", "Geen regels gevonden")}
            </div>
          )}
        </div>
      </aside>

      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 md:p-6 space-y-5 min-h-[420px]">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
              {t("adminLabelLogic.productCode", "Productcode")}
            </label>
            <input
              list="admin-label-logic-codes"
              value={formCode}
              onChange={(e) => setFormState((prev) => ({ ...prev, formCode: e.target.value.toUpperCase() }))}
              placeholder="A1S1"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-blue-500"
            />
            <datalist id="admin-label-logic-codes">
              {availableCodes.map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-wider"
            >
              <Save size={14} /> {t("common.save", "Opslaan")}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!selectedRule || selectedRule.id === "new" || selectedRule.id === "new_example"}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 disabled:bg-slate-300 text-white text-xs font-black uppercase tracking-wider"
            >
              <Trash2 size={14} /> {t("common.delete", "Verwijderen")}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
              {t("adminLabelLogic.variables", "Variabelen")}
            </h3>
            <button
              type="button"
              onClick={() => setFormState((prev) => ({ ...prev, variables: [...prev.variables, getNewVariable()] }))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold"
            >
              <Plus size={13} /> {t("adminLabelLogic.addVariable", "Variabele")}
            </button>
          </div>

          {variables.map((variable, vi) => (
            <div key={`${variable.name}_${vi}`} className="rounded-xl border border-slate-200 p-3 space-y-2 bg-slate-50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  value={variable.name}
                  onChange={(e) => updateVariable(vi, { name: e.target.value })}
                  placeholder={t("adminLabelLogic.variableName", "Variabelenaam")}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold outline-none focus:border-blue-500 bg-white"
                />
                <select
                  value={variable.triggerField}
                  onChange={(e) => updateVariable(vi, { triggerField: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold outline-none focus:border-blue-500 bg-white"
                >
                  {TRIGGER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <input
                    value={variable.defaultValue || ""}
                    onChange={(e) => updateVariable(vi, { defaultValue: e.target.value })}
                    placeholder={t("adminLabelLogic.defaultValue", "Standaardwaarde")}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold outline-none focus:border-blue-500 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => removeVariable(vi)}
                    className="p-2 rounded-lg bg-rose-100 text-rose-700"
                    title={t("common.delete", "Verwijderen")}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {(variable.mappings || []).map((mapping, mi) => (
                  <div key={`${vi}_${mi}`} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
                    <input
                      value={mapping.condition}
                      onChange={(e) => updateMapping(vi, mi, { condition: e.target.value })}
                      placeholder={t("adminLabelLogic.condition", "Conditie (bijv. > 200)")}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold outline-none focus:border-blue-500 bg-white"
                    />
                    <input
                      value={mapping.value}
                      onChange={(e) => updateMapping(vi, mi, { value: e.target.value })}
                      placeholder={t("adminLabelLogic.outputValue", "Uitkomst")}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold outline-none focus:border-blue-500 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeMapping(vi, mi)}
                      className="px-3 py-2 rounded-lg bg-rose-100 text-rose-700 text-xs font-black"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addMapping(vi)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200 text-slate-800 text-xs font-bold"
                >
                  <Plus size={12} /> {t("adminLabelLogic.addCondition", "Conditie")}
                </button>
              </div>
            </div>
          ))}

          {variables.length === 0 && (
            <div className="text-xs text-slate-500 font-semibold px-1 py-2">
              {t("adminLabelLogic.noVariables", "Nog geen variabelen toegevoegd.")}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
          <h4 className="text-xs font-black text-blue-900 uppercase tracking-widest">
            {t("adminLabelLogic.liveTest", "Live test")}
          </h4>

          {usedTriggerFields.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {usedTriggerFields.map((field) => (
                <input
                  key={field}
                  value={String(testInputs[field] ?? "")}
                  onChange={(e) => setFormState((prev) => ({
                    ...prev,
                    testInputs: { ...prev.testInputs, [field]: e.target.value },
                  }))}
                  placeholder={field}
                  className="px-3 py-2 rounded-lg border border-blue-200 text-sm font-semibold outline-none focus:border-blue-500 bg-white"
                />
              ))}
            </div>
          ) : (
            <p className="text-xs font-semibold text-blue-800">
              {t("adminLabelLogic.noTriggerFields", "Voeg eerst een variabele toe met een triggerveld.")}
            </p>
          )}

          {variables.length > 0 && (
            <div className="rounded-lg bg-white border border-blue-100 p-3 space-y-1">
              {variables.map((v, idx) => (
                <div key={`${v.name}_${idx}_resolved`} className="text-xs font-semibold text-slate-700">
                  <span className="font-black">{v.name}:</span> {resolveVariableValue(v)}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-black text-amber-900 uppercase tracking-widest">
              {t("adminLabelLogic.operatorPrintRules", "Operator printregels")}
            </h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={addPrintRule}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold"
              >
                <Plus size={12} /> {t("adminLabelLogic.addRule", "Regel")}
              </button>
              <button
                type="button"
                onClick={savePrintRules}
                disabled={isSavingPrintRules}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 disabled:bg-emerald-300 text-white text-xs font-bold"
              >
                <Save size={12} /> {isSavingPrintRules ? t("common.loading", "Laden...") : t("common.save", "Opslaan")}
              </button>
            </div>
          </div>

          <p className="text-xs font-semibold text-amber-900/80">
            {t(
              "adminLabelLogic.operatorPrintRulesHelp",
              "Voorbeeld: ELBOW + ID 300 + hoek 90 -> 2 labels groot. Laat ID/hoek leeg voor algemene regel."
            )}
          </p>

          {hasUnsavedPrintRuleChanges && (
            <p className="text-xs font-semibold text-amber-900">
              {t("adminLabelLogic.unsavedPrintRuleChanges", "Je hebt niet-opgeslagen wijzigingen in de regels hieronder.")}
            </p>
          )}

          {printRules.length === 0 && (
            <p className="text-xs font-semibold text-amber-900/80">
              {t("adminLabelLogic.noPrintRules", "Klik op 'Regel' om een nieuwe regel toe te voegen of gebruik het potlood bij een opgeslagen regel.")}
            </p>
          )}

          <div className="space-y-2">
            {printRules.map((rule) => (
              <div key={rule.id} className="grid grid-cols-1 lg:grid-cols-[auto_1fr_140px_120px_120px_110px_100px_120px_auto] gap-2 items-center bg-white border border-amber-200 rounded-lg p-2">
                <input
                  type="checkbox"
                  checked={!!rule.enabled}
                  onChange={(e) => updatePrintRule(rule.id, { enabled: e.target.checked })}
                  className="h-4 w-4"
                  title={t("adminLabelLogic.ruleEnabled", "Regel actief")}
                />
                <select
                  value={rule.productType}
                  onChange={(e) => updatePrintRule(rule.id, { productType: e.target.value })}
                  className="px-2 py-2 rounded-lg border border-slate-200 text-xs font-semibold"
                >
                  {[
                    "ELBOW",
                    "FLANGE",
                    "EQUAL-TEE",
                    "UNEQUAL-TEE",
                    "REDUCER",
                    "COUPLER",
                    "ADAPTOR",
                    "ANY",
                  ].map((pt) => (
                    <option key={pt} value={pt}>
                      {pt}
                    </option>
                  ))}
                </select>
                <select
                  value={String(rule.code || "ANY")}
                  onChange={(e) => updatePrintRule(rule.id, { code: e.target.value })}
                  className="px-2 py-2 rounded-lg border border-slate-200 text-xs font-semibold"
                >
                  <option value="ANY">{t("adminLabelLogic.anyCode", "Elke code")}</option>
                  {availableCodes
                    .map((code) => String(code || "").trim().toUpperCase())
                    .filter(Boolean)
                    .map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                </select>
                <input
                  type="number"
                  value={rule.minDiameter ?? ""}
                  onChange={(e) => updatePrintRule(rule.id, { minDiameter: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder={t("adminLabelLogic.minId", "Min ID")}
                  className="px-2 py-2 rounded-lg border border-slate-200 text-xs font-semibold"
                />
                <input
                  type="number"
                  value={rule.maxDiameter ?? ""}
                  onChange={(e) => updatePrintRule(rule.id, { maxDiameter: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder={t("adminLabelLogic.maxId", "Max ID")}
                  className="px-2 py-2 rounded-lg border border-slate-200 text-xs font-semibold"
                />
                <input
                  type="number"
                  value={rule.angle ?? ""}
                  onChange={(e) => updatePrintRule(rule.id, { angle: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder={t("adminLabelLogic.angleAny", "Any / open")}
                  className="px-2 py-2 rounded-lg border border-slate-200 text-xs font-semibold"
                />
                <input
                  type="number"
                  min="1"
                  value={rule.labelCount}
                  onChange={(e) => updatePrintRule(rule.id, { labelCount: Math.max(1, parseInt(e.target.value || "1", 10) || 1) })}
                  className="px-2 py-2 rounded-lg border border-slate-200 text-xs font-semibold"
                />
                <select
                  value={rule.labelSize}
                  onChange={(e) => updatePrintRule(rule.id, { labelSize: e.target.value as "large" | "small" })}
                  className="px-2 py-2 rounded-lg border border-slate-200 text-xs font-semibold"
                >
                  <option value="large">{t("adminLabelLogic.largeLabel", "Groot")}</option>
                  <option value="small">{t("adminLabelLogic.smallLabel", "Klein")}</option>
                </select>
                <button
                  type="button"
                  onClick={() => removePrintRule(rule.id)}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-rose-100 text-rose-700"
                  title={t("common.delete", "Verwijderen")}
                  aria-label={t("common.delete", "Verwijderen")}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-amber-300 bg-white p-3 space-y-2 mt-3">
            <p className="text-[11px] font-black text-amber-900 uppercase tracking-widest">
              {t("adminLabelLogic.savedRulesOverview", "Opgeslagen regels (backend)")}
            </p>
            {savedPrintRules.length === 0 ? (
              <p className="text-xs font-semibold text-slate-500">
                {t("adminLabelLogic.noSavedRules", "Nog geen opgeslagen regels in de database.")}
              </p>
            ) : (
              <div className="space-y-2">
                {savedPrintRules.map((rule, idx) => {
                  const labelSizeText =
                    rule.labelSize === "large"
                      ? t("adminLabelLogic.largeLabel", "Groot")
                      : t("adminLabelLogic.smallLabel", "Klein");

                  return (
                    <div
                      key={`saved_${rule.id}`}
                      className="border border-amber-200 rounded-lg bg-amber-50 p-2"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-[11px] font-black text-amber-900">#{idx + 1}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${rule.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                          {rule.enabled ? "AAN" : "UIT"}
                        </span>
                        <span className="text-[11px] font-black text-slate-800">{rule.productType}</span>
                        {activeEditSavedRuleId === rule.id && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                            {t("common.edit", "Bewerken")}
                          </span>
                        )}
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => editSavedPrintRule(rule.id)}
                            className="h-6 w-6 inline-flex items-center justify-center rounded-md bg-blue-100 text-blue-800"
                            title={t("common.edit", "Bewerken")}
                            aria-label={t("common.edit", "Bewerken")}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSavedPrintRule(rule.id)}
                            disabled={isSavingPrintRules}
                            className="h-6 w-6 inline-flex items-center justify-center rounded-md bg-rose-100 text-rose-700 disabled:opacity-60"
                            title={t("common.delete", "Verwijderen")}
                            aria-label={t("common.delete", "Verwijderen")}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-[11px] font-semibold text-slate-700">
                        <div>
                          <span className="text-slate-500">Code</span>
                          <div>{String(rule.code || "ANY")}</div>
                        </div>
                        <div>
                          <span className="text-slate-500">Min ID</span>
                          <div>{formatRuleValue(rule.minDiameter)}</div>
                        </div>
                        <div>
                          <span className="text-slate-500">Max ID</span>
                          <div>{formatRuleValue(rule.maxDiameter)}</div>
                        </div>
                        <div>
                          <span className="text-slate-500">Hoek</span>
                          <div>{formatRuleValue(rule.angle)}</div>
                        </div>
                        <div>
                          <span className="text-slate-500">Labels</span>
                          <div>{rule.labelCount}</div>
                        </div>
                        <div>
                          <span className="text-slate-500">Formaat</span>
                          <div>{labelSizeText}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdminLabelLogic;
