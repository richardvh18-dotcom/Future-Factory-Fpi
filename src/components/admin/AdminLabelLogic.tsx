import React, { useState, useEffect } from "react";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS, getPathString } from "../../config/dbPaths";
import {
  Plus,
  Trash2,
  Save,
  Search,
  Variable,
  GitBranch,
  ArrowRight,
  X,
  Beaker,
  Lightbulb,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNotifications } from "../../contexts/NotificationContext";

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
  const { showConfirm, notify } = useNotifications();
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [availableCodes, setAvailableCodes] = useState<string[]>([]);

  // Form state
  const [formCode, setFormCode] = useState("");
  const [variables, setVariables] = useState<RuleVariable[]>([]);
  const [testInputs, setTestInputs] = useState<Record<string, any>>({});

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, getPathString(PATHS.LABEL_LOGIC)),
      (snap) => {
        setRules(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );

    // Fetch available product codes from General Settings
    const fetchCodes = async () => {
      try {
        const settingsRef = doc(db, getPathString(PATHS.GENERAL_SETTINGS));
        const snap = await getDoc(settingsRef);
        const settings = snap.data() as GeneralSettings | undefined;
        if (snap.exists() && Array.isArray(settings?.codes)) {
          setAvailableCodes(settings.codes);
        }
      } catch (e) {
        console.error("Error fetching codes:", e);
      }
    };
    fetchCodes();

    return () => unsub();
  }, []);

  const handleSelect = (rule: Rule) => {
    setSelectedRule(rule);
    setFormCode(rule.productCode || "");
    setVariables(rule.variables || []);
    setTestInputs({});
  };

  const handleNew = () => {
    setSelectedRule({ id: "new" });
    setFormCode("");
    setVariables([]);
    setTestInputs({});
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
    setFormCode("A1S1");
    setVariables([
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
    ]);
  };

  return <div>Admin Label Logic Component</div>;
};

export default AdminLabelLogic;
