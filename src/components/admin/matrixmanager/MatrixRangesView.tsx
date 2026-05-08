// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import {
  Save,
  Loader2,
  Database,
  AlertCircle,
  CheckCircle2,
  Plus,
  Trash2,
  Settings2,
  Search,
  Link2,
  Ruler,
} from "lucide-react";
import { db, auth, logActivity } from "../../../config/firebase";
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { PATHS } from "../../../config/dbPaths";

const META_KEYS = new Set([
  "id",
  "pressure",
  "diameter",
  "lastUpdated",
  "updatedBy",
  "storagePath",
  "type",
  "sourceType",
]);

const FITTING_FIELD_ORDER = ["TW", "L", "Lo", "R", "Weight"];
const SOCKET_FIELD_ORDER = ["B1", "B2", "BA", "A", "TWcb", "TWtb", "BD", "W"];
const CONNECTION_PRIORITY = ["CB", "TB", "AB", "AM", "FL", "FB", "CF", "CS"];

const prettifyType = (typeKey) =>
  String(typeKey || "")
    .replace(/_+/g, " ")
    .trim();

const normalizeValue = (value) => String(value || "").trim().toUpperCase();

const parseSpecId = (rawId, isSocket = false) => {
  const id = normalizeValue(rawId);
  if (!id) return null;

  const socketMatch = id.match(/^(.*?)_SOCKET_([A-Z]+)_PN([0-9.]+)_ID(\d+)(?:_(.+))?$/i);
  if (socketMatch) {
    const typeKey = normalizeValue(socketMatch[1]);
    return {
      id,
      sourceKind: "socket",
      typeKey,
      typeLabel: prettifyType(typeKey),
      angle: "",
      connection: normalizeValue(socketMatch[2]),
      pressure: socketMatch[3],
      diameter: socketMatch[4],
      extraCode: normalizeValue(socketMatch[5]),
    };
  }

  if (isSocket) return null;

  const fittingMatch = id.match(/^(.*?)_([A-Z]+)_PN([0-9.]+)_ID(\d+)(?:_(.+))?$/i);
  if (!fittingMatch) return null;

  const rawTypeKey = normalizeValue(fittingMatch[1]);
  const angleMatch = rawTypeKey.match(/^(.*)_(\d+(?:\.\d+)?)$/);
  const typeKey = angleMatch ? normalizeValue(angleMatch[1]) : rawTypeKey;
  const angle = angleMatch ? angleMatch[2] : "";

  return {
    id,
    sourceKind: "fitting",
    typeKey,
    typeLabel: prettifyType(typeKey),
    angle,
    connection: normalizeValue(fittingMatch[2]),
    pressure: fittingMatch[3],
    diameter: fittingMatch[4],
    extraCode: normalizeValue(fittingMatch[5]),
  };
};

const buildLookupKey = (parsed) => {
  if (!parsed) return "";
  return [
    normalizeValue(parsed.typeKey),
    normalizeValue(parsed.connection),
    normalizeValue(parsed.pressure),
    normalizeValue(parsed.diameter),
    normalizeValue(parsed.extraCode),
  ].join("|");
};

const sortByPreferredOrder = (fields) => {
  const order = [...FITTING_FIELD_ORDER, ...SOCKET_FIELD_ORDER];
  return [...fields].sort((a, b) => {
    const indexA = order.indexOf(a);
    const indexB = order.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
};

const getRecordFields = (record) =>
  Object.keys(record || {}).filter((key) => !META_KEYS.has(key) && record[key] !== "" && record[key] !== undefined && record[key] !== null);

const getDisplayName = (parsed) => {
  if (!parsed) return "Onbekende tekening";
  const angleText = parsed.angle ? ` ${parsed.angle}°` : "";
  const extraText = parsed.extraCode ? ` ${parsed.extraCode}` : "";
  return `${parsed.typeLabel}${angleText} ${parsed.connection} PN${parsed.pressure} ID${parsed.diameter}${extraText}`.trim();
};

const MatrixRangesView = () => {
  const [config, setConfig] = useState({ toleranceItems: [], ranges: [] });
  const [fittingRecords, setFittingRecords] = useState([]);
  const [socketRecords, setSocketRecords] = useState([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingSpecs, setLoadingSpecs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedConnection, setSelectedConnection] = useState("CB");
  const [selectedTypeKey, setSelectedTypeKey] = useState("");
  const [selectedAngle, setSelectedAngle] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [draftTolerances, setDraftTolerances] = useState({});

  useEffect(() => {
    const docRef = doc(db, ...PATHS.MATRIX_CONFIG);
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() || {};
          setConfig({
            ...data,
            ranges: Array.isArray(data.ranges) ? data.ranges : [],
            toleranceItems: Array.isArray(data.toleranceItems) ? data.toleranceItems : [],
          });
        } else {
          setConfig({ toleranceItems: [], ranges: [] });
        }
        setLoadingConfig(false);
      },
      (err) => {
        console.error("Fout bij laden tolerantieconfig:", err);
        setLoadingConfig(false);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    let remaining = 2;
    const finish = () => {
      remaining -= 1;
      if (remaining <= 0) setLoadingSpecs(false);
    };

    const fittingUnsub = onSnapshot(
      query(collection(db, ...PATHS.FITTING_SPECS)),
      (snap) => {
        setFittingRecords(
          snap.docs
            .map((d) => {
              const parsed = parseSpecId(d.id, false);
              return parsed ? { id: d.id, ...d.data(), __parsed: parsed } : null;
            })
            .filter(Boolean)
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
        );
        finish();
      },
      (err) => {
        console.error("Fout bij laden fitting specs:", err);
        finish();
      }
    );

    const socketUnsub = onSnapshot(
      query(collection(db, ...PATHS.SOCKET_SPECS)),
      (snap) => {
        setSocketRecords(
          snap.docs
            .map((d) => {
              const parsed = parseSpecId(d.id, true);
              return parsed ? { id: d.id, ...d.data(), __parsed: parsed } : null;
            })
            .filter(Boolean)
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
        );
        finish();
      },
      (err) => {
        console.error("Fout bij laden socket specs:", err);
        finish();
      }
    );

    return () => {
      fittingUnsub();
      socketUnsub();
    };
  }, []);

  const socketLookup = useMemo(() => {
    const map = new Map();
    socketRecords.forEach((record) => {
      map.set(buildLookupKey(record.__parsed), record);
    });
    return map;
  }, [socketRecords]);

  const connectionOptions = useMemo(() => {
    const values = Array.from(new Set(fittingRecords.map((record) => record.__parsed.connection)));
    return values.sort((a, b) => {
      const aIndex = CONNECTION_PRIORITY.indexOf(a);
      const bIndex = CONNECTION_PRIORITY.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [fittingRecords]);

  const typeOptions = useMemo(() => {
    const filtered = fittingRecords.filter(
      (record) => !selectedConnection || record.__parsed.connection === selectedConnection
    );
    const map = new Map();
    filtered.forEach((record) => {
      map.set(record.__parsed.typeKey, record.__parsed.typeLabel);
    });
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [fittingRecords, selectedConnection]);

  const angleOptions = useMemo(() => {
    const filtered = fittingRecords.filter(
      (record) =>
        (!selectedConnection || record.__parsed.connection === selectedConnection) &&
        (!selectedTypeKey || record.__parsed.typeKey === selectedTypeKey)
    );
    const values = Array.from(new Set(filtered.map((record) => record.__parsed.angle).filter(Boolean)));
    return values.sort((a, b) => Number(a) - Number(b));
  }, [fittingRecords, selectedConnection, selectedTypeKey]);

  const matchingFittings = useMemo(() => {
    const term = search.trim().toUpperCase();
    return fittingRecords.filter((record) => {
      const parsed = record.__parsed;
      if (selectedConnection && parsed.connection !== selectedConnection) return false;
      if (selectedTypeKey && parsed.typeKey !== selectedTypeKey) return false;
      if (selectedAngle && parsed.angle !== selectedAngle) return false;
      if (!term) return true;
      return [record.id, parsed.typeLabel, parsed.extraCode, parsed.diameter, parsed.pressure]
        .join(" ")
        .toUpperCase()
        .includes(term);
    });
  }, [fittingRecords, search, selectedConnection, selectedTypeKey, selectedAngle]);

  const selectedFitting = useMemo(
    () => matchingFittings.find((record) => record.id === selectedSourceId) || fittingRecords.find((record) => record.id === selectedSourceId) || null,
    [matchingFittings, fittingRecords, selectedSourceId]
  );

  const selectedSocket = useMemo(() => {
    if (!selectedFitting) return null;
    return socketLookup.get(buildLookupKey(selectedFitting.__parsed)) || null;
  }, [selectedFitting, socketLookup]);

  const selectedFields = useMemo(() => {
    if (!selectedFitting) return [];
    const fittingFields = getRecordFields(selectedFitting).map((key) => ({
      key,
      source: "Fitting",
      value: selectedFitting[key],
    }));
    const socketFields = selectedSocket
      ? getRecordFields(selectedSocket).map((key) => ({
          key,
          source: "Mof",
          value: selectedSocket[key],
        }))
      : [];

    return sortByPreferredOrder([...new Set([...fittingFields.map((f) => f.key), ...socketFields.map((f) => f.key)])]).map((key) => {
      const fittingField = fittingFields.find((field) => field.key === key);
      const socketField = socketFields.find((field) => field.key === key);
      return fittingField || socketField;
    });
  }, [selectedFitting, selectedSocket]);

  const existingConfigIndex = useMemo(() => {
    if (!selectedFitting) return -1;
    return config.toleranceItems.findIndex((item) => item.sourceId === selectedFitting.id);
  }, [config.toleranceItems, selectedFitting]);

  useEffect(() => {
    if (!selectedFitting) {
      setDraftTolerances({});
      return;
    }

    const existing = existingConfigIndex >= 0 ? config.toleranceItems[existingConfigIndex] : null;
    const nextDraft = {};

    selectedFields.forEach((field) => {
      const current = existing?.tolerances?.[field.key];
      nextDraft[field.key] = {
        enabled: Boolean(current?.enabled),
        tolerance: current?.tolerance || "",
      };
    });

    setDraftTolerances(nextDraft);
  }, [selectedFitting, selectedFields, existingConfigIndex, config.toleranceItems]);

  useEffect(() => {
    if (selectedConnection && !connectionOptions.includes(selectedConnection)) {
      setSelectedConnection(connectionOptions[0] || "");
    }
  }, [connectionOptions, selectedConnection]);

  useEffect(() => {
    if (selectedTypeKey && !typeOptions.some((option) => option.value === selectedTypeKey)) {
      setSelectedTypeKey("");
      setSelectedAngle("");
      setSelectedSourceId("");
    }
  }, [typeOptions, selectedTypeKey]);

  useEffect(() => {
    if (selectedAngle && !angleOptions.includes(selectedAngle)) {
      setSelectedAngle("");
      setSelectedSourceId("");
    }
  }, [angleOptions, selectedAngle]);

  const handleToggleField = (fieldKey) => {
    setDraftTolerances((prev) => ({
      ...prev,
      [fieldKey]: {
        enabled: !prev[fieldKey]?.enabled,
        tolerance: prev[fieldKey]?.tolerance || "",
      },
    }));
  };

  const handleToleranceChange = (fieldKey, value) => {
    setDraftTolerances((prev) => ({
      ...prev,
      [fieldKey]: {
        enabled: prev[fieldKey]?.enabled ?? true,
        tolerance: value,
      },
    }));
  };

  const handleAddOrUpdateTolerance = () => {
    if (!selectedFitting) return;

    const activeTolerances = Object.fromEntries(
      Object.entries(draftTolerances).filter(([, value]) => value?.enabled)
    );

    const item = {
      sourceId: selectedFitting.id,
      sourceDisplayName: getDisplayName(selectedFitting.__parsed),
      fittingId: selectedFitting.id,
      socketId: selectedSocket?.id || "",
      connection: selectedFitting.__parsed.connection,
      typeKey: selectedFitting.__parsed.typeKey,
      typeLabel: selectedFitting.__parsed.typeLabel,
      angle: selectedFitting.__parsed.angle,
      pressure: selectedFitting.__parsed.pressure,
      diameter: selectedFitting.__parsed.diameter,
      extraCode: selectedFitting.__parsed.extraCode,
      tolerances: activeTolerances,
      updatedAt: new Date().toISOString(),
    };

    setConfig((prev) => {
      const currentItems = Array.isArray(prev.toleranceItems) ? [...prev.toleranceItems] : [];
      const index = currentItems.findIndex((entry) => entry.sourceId === item.sourceId);
      if (index >= 0) currentItems[index] = item;
      else currentItems.push(item);
      return { ...prev, toleranceItems: currentItems };
    });

    setStatus({ type: "success", msg: "Tolerantieconfiguratie toegevoegd aan concept." });
    setTimeout(() => setStatus(null), 2500);
  };

  const handleRemoveTolerance = (sourceId) => {
    setConfig((prev) => ({
      ...prev,
      toleranceItems: (prev.toleranceItems || []).filter((item) => item.sourceId !== sourceId),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const docRef = doc(db, ...PATHS.MATRIX_CONFIG);
      await setDoc(
        docRef,
        {
          ...config,
          type: "MATRIX_TOLERANCE_CONFIG",
          storagePath: PATHS.MATRIX_CONFIG.join("/"),
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );

      await logActivity(
        auth.currentUser?.uid,
        "MATRIX_TOLERANCE_SAVE",
        `Tolerantie manager opgeslagen (${(config.toleranceItems || []).length} items)`
      );

      setStatus({ type: "success", msg: "Tolerantie Manager succesvol gepubliceerd." });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error("Save error:", err);
      setStatus({ type: "error", msg: `Opslaan mislukt: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  if (loadingConfig || loadingSpecs) {
    return (
      <div className="p-20 text-center flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-blue-500" size={40} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          Tolerantie Manager synchroniseren...
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-8 bg-slate-50 text-left custom-scrollbar animate-in fade-in">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between xl:items-center gap-6">
          <div className="text-left">
            <h3 className="text-xl font-black text-slate-900 uppercase italic leading-none">
              <span className="text-blue-600">Tolerantie</span> Manager
            </h3>
            <p className="mt-2 text-sm font-medium text-slate-500 max-w-3xl">
              Combineer fitting- en moftekeningen uit de database en leg per veld vast waar een tolerantie op zit.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Database size={12} className="text-blue-500" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Actief Pad:</span>
              <code className="text-[9px] font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 italic">
                /{PATHS.MATRIX_CONFIG.join("/")}
              </code>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl disabled:opacity-50 flex items-center gap-3 active:scale-95"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Toleranties Publiceren
          </button>
        </div>

        {status && (
          <div
            className={`p-5 rounded-3xl border-2 flex items-center gap-4 animate-in slide-in-from-top-2 ${
              status.type === "success"
                ? "bg-emerald-50 border-emerald-100 text-emerald-700 shadow-emerald-100 shadow-md"
                : "bg-rose-50 border-rose-100 text-rose-700 shadow-rose-100 shadow-md"
            }`}
          >
            {status.type === "success" ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <p className="text-[10px] font-black uppercase tracking-widest">{status.msg}</p>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6">
          <div className="space-y-6">
            <div className="bg-white rounded-[35px] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/70">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 italic">
                  <Search size={14} className="text-blue-500" /> Database selectie
                </h4>
                <p className="mt-2 text-xs font-medium text-slate-500">
                  Filter op mof-type, fittingtype en hoek. Kies daarna de tekening uit de fitting-database.
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={selectedConnection}
                    onChange={(e) => {
                      setSelectedConnection(e.target.value);
                      setSelectedTypeKey("");
                      setSelectedAngle("");
                      setSelectedSourceId("");
                    }}
                    className="bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-xs font-bold"
                  >
                    <option value="">Mof type</option>
                    {connectionOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedTypeKey}
                    onChange={(e) => {
                      setSelectedTypeKey(e.target.value);
                      setSelectedAngle("");
                      setSelectedSourceId("");
                    }}
                    className="bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-xs font-bold"
                  >
                    <option value="">Type fitting</option>
                    {typeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
                  <select
                    value={selectedAngle}
                    onChange={(e) => {
                      setSelectedAngle(e.target.value);
                      setSelectedSourceId("");
                    }}
                    className="bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-xs font-bold"
                  >
                    <option value="">Hoek</option>
                    {angleOptions.map((angle) => (
                      <option key={angle} value={angle}>
                        {angle}°
                      </option>
                    ))}
                  </select>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Zoek op PN, ID of extra code..."
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="border border-slate-100 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Fitting database ({matchingFittings.length})
                  </div>
                  <div className="max-h-[420px] overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {matchingFittings.length === 0 ? (
                      <div className="p-6 text-center text-[10px] font-black uppercase tracking-widest text-slate-300">
                        Geen records gevonden
                      </div>
                    ) : (
                      matchingFittings.map((record) => (
                        <button
                          key={record.id}
                          onClick={() => setSelectedSourceId(record.id)}
                          className={`w-full text-left p-4 rounded-2xl border transition-all ${
                            selectedSourceId === record.id
                              ? "bg-blue-50 border-blue-300 shadow-sm"
                              : "bg-white border-slate-100 hover:border-blue-200 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-black text-slate-800 truncate">{getDisplayName(record.__parsed)}</p>
                              <p className="text-[10px] font-mono text-slate-400 mt-1 truncate">{record.id}</p>
                            </div>
                            <span className="text-[9px] font-black uppercase text-blue-600 shrink-0">
                              {record.__parsed.connection}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[35px] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 italic">
                    <Settings2 size={14} className="text-blue-500" /> Opgeslagen toleranties
                  </h4>
                  <p className="mt-2 text-xs font-medium text-slate-500">
                    Reeds gekoppelde tekeningen met tolerantievelden.
                  </p>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {(config.toleranceItems || []).length} items
                </span>
              </div>
              <div className="p-4 space-y-2 max-h-[360px] overflow-y-auto custom-scrollbar">
                {(config.toleranceItems || []).length === 0 ? (
                  <div className="p-6 text-center text-[10px] font-black uppercase tracking-widest text-slate-300">
                    Nog geen toleranties gekoppeld
                  </div>
                ) : (
                  config.toleranceItems.map((item) => (
                    <div key={item.sourceId} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/60">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-800 truncate">{item.sourceDisplayName}</p>
                          <p className="text-[10px] font-mono text-slate-400 mt-1 truncate">{item.sourceId}</p>
                          <p className="text-[10px] font-bold text-slate-500 mt-2">
                            Velden: {Object.keys(item.tolerances || {}).join(", ") || "-"}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveTolerance(item.sourceId)}
                          className="p-2 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                          title="Verwijder tolerantieconfiguratie"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden min-h-[720px]">
            <div className="p-8 border-b border-slate-100 bg-slate-50/70 flex items-start justify-between gap-4">
              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 italic">
                  <Link2 size={14} className="text-blue-500" /> Gekoppelde tekening
                </h4>
                <p className="mt-2 text-xs font-medium text-slate-500 max-w-2xl">
                  Kies een fittingrecord. De manager combineert automatisch de fittingtekening met de bijbehorende moftekening en laat alle beschikbare velden zien.
                </p>
              </div>
              <button
                onClick={handleAddOrUpdateTolerance}
                disabled={!selectedFitting}
                className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg disabled:opacity-40 flex items-center gap-2"
              >
                <Plus size={16} />
                {existingConfigIndex >= 0 ? "Werk selectie bij" : "Voeg selectie toe"}
              </button>
            </div>

            {!selectedFitting ? (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-40">
                <Ruler size={48} className="mb-4 text-slate-300" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Selecteer links een fitting uit de database
                </p>
              </div>
            ) : (
              <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar max-h-[calc(100vh-280px)]">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                  <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                    <span className="text-[9px] font-black uppercase text-slate-400">Type fitting</span>
                    <p className="mt-2 text-sm font-black text-slate-800">{selectedFitting.__parsed.typeLabel}</p>
                  </div>
                  <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                    <span className="text-[9px] font-black uppercase text-slate-400">Hoek</span>
                    <p className="mt-2 text-sm font-black text-slate-800">{selectedFitting.__parsed.angle ? `${selectedFitting.__parsed.angle}°` : "-"}</p>
                  </div>
                  <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                    <span className="text-[9px] font-black uppercase text-slate-400">Mof type</span>
                    <p className="mt-2 text-sm font-black text-slate-800">{selectedFitting.__parsed.connection}</p>
                  </div>
                  <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                    <span className="text-[9px] font-black uppercase text-slate-400">PN / ID</span>
                    <p className="mt-2 text-sm font-black text-slate-800">PN{selectedFitting.__parsed.pressure} • ID{selectedFitting.__parsed.diameter}</p>
                  </div>
                  <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                    <span className="text-[9px] font-black uppercase text-slate-400">Moftekening</span>
                    <p className="mt-2 text-sm font-black text-slate-800 break-all">{selectedSocket?.id || "Geen gekoppelde mofrecord gevonden"}</p>
                  </div>
                </div>

                <div className="rounded-[30px] border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
                    <div>
                      <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Beschikbare velden</h5>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        Vink de velden aan waar tolerantie op zit en vul rechts de tolerantie in.
                      </p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {selectedFields.length} velden
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {selectedFields.map((field) => {
                      const fieldState = draftTolerances[field.key] || { enabled: false, tolerance: "" };
                      return (
                        <div key={field.key} className="grid grid-cols-1 lg:grid-cols-[140px_120px_minmax(0,1fr)_220px] gap-4 px-6 py-4 items-center">
                          <label className="flex items-center gap-3 text-sm font-black text-slate-800">
                            <input
                              type="checkbox"
                              checked={fieldState.enabled}
                              onChange={() => handleToggleField(field.key)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            {field.key}
                          </label>
                          <span className={`text-[10px] font-black uppercase tracking-widest ${field.source === "Mof" ? "text-emerald-600" : "text-blue-600"}`}>
                            {field.source}
                          </span>
                          <div className="text-sm font-mono font-bold text-slate-600 break-all bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                            {String(field.value)}
                          </div>
                          <input
                            value={fieldState.tolerance}
                            onChange={(e) => handleToleranceChange(field.key, e.target.value)}
                            disabled={!fieldState.enabled}
                            placeholder="Bijv. +/- 1.5 mm"
                            className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-300"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-900 p-8 rounded-[45px] text-white/50 text-[9px] font-black uppercase tracking-[0.2em] flex flex-col md:flex-row items-center gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
            <Database size={100} />
          </div>
          <div className="p-4 bg-blue-600 rounded-2xl shadow-lg text-white">
            <Settings2 size={20} />
          </div>
          <div className="text-left flex-1 relative z-10">
            <p className="text-white text-xs mb-1 italic tracking-tight">Root Protection Protocol Active</p>
            <p className="leading-relaxed">
              Deze manager combineert fittingtekeningen en moftekeningen uit de database en bewaart per veld welke tolerantie geldt. Zo kun je voor records zoals ELBOW_90_CB_PN8_ID350 direct TW, Lo en andere maten markeren.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatrixRangesView;
