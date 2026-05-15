import { jsx as _jsx } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { collection, onSnapshot, doc, getDoc, } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS, getPathString } from "../../config/dbPaths";
import { useTranslation } from "react-i18next";
import { useNotifications } from "../../contexts/NotificationContext";
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
const AdminLabelLogic = () => {
    const { t } = useTranslation();
    const { showConfirm, notify } = useNotifications();
    const [rules, setRules] = useState([]);
    const [selectedRule, setSelectedRule] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [availableCodes, setAvailableCodes] = useState([]);
    // Form state
    const [formCode, setFormCode] = useState("");
    const [variables, setVariables] = useState([]);
    const [testInputs, setTestInputs] = useState({});
    useEffect(() => {
        const unsub = onSnapshot(collection(db, getPathString(PATHS.LABEL_LOGIC)), (snap) => {
            setRules(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        });
        // Fetch available product codes from General Settings
        const fetchCodes = async () => {
            try {
                const settingsRef = doc(db, getPathString(PATHS.GENERAL_SETTINGS));
                const snap = await getDoc(settingsRef);
                const settings = snap.data();
                if (snap.exists() && Array.isArray(settings?.codes)) {
                    setAvailableCodes(settings.codes);
                }
            }
            catch (e) {
                console.error("Error fetching codes:", e);
            }
        };
        fetchCodes();
        return () => unsub();
    }, []);
    const handleSelect = (rule) => {
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
            if (!confirmed)
                return;
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
    return _jsx("div", { children: "Admin Label Logic Component" });
};
export default AdminLabelLogic;
