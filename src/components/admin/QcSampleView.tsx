/* eslint-disable */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Send, Loader2, Camera, Keyboard, Hash, RefreshCw, Printer } from "lucide-react";
import QRCode from "qrcode";
import { collection, query, where, getDocs, doc, getDoc, collectionGroup } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS, getPathString } from "../../config/dbPaths";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNotifications } from "../../contexts/NotificationContext";
import { startProductionLots, reserveAutoLotNumberRange, queuePrintJob } from "../../services/planningSecurityService";
import { useTeamleaderFirestore } from "../digitalplanning/useTeamleaderFirestore";
import { isOpenOrRunningOrder } from "../../utils/teamleaderDerived";
import { generateLotBatchZPL } from "../../utils/zplHelper";
import { useFormPersistence } from "../../hooks/useFormPersistence";
import { resolvePrinterForRouting } from "../../utils/printRouting";
import ProductReleaseModal from "../digitalplanning/modals/ProductReleaseModal";

type TeamleaderOrder = {
  id?: string;
  __docPath?: string;
  sourcePath?: string;
  orderId?: string;
  machine?: string;
  itemCode?: string;
  productId?: string;
  item?: string;
  itemDescription?: string;
  status?: string;
};

type AuthUser = {
  uid?: string;
  role?: string;
  email?: string;
  [key: string]: unknown;
};

type BarcodeDetectionResultLike = {
  rawValue?: string;
};

const getNormalizedMachine = (m: string) => {
  let norm = String(m || "").trim().toUpperCase().replace(/\s/g, "");
  if (norm.startsWith("40")) norm = norm.substring(2);
  return norm;
};

type BarcodeDetectorLike = {
  detect: (image: ImageBitmapSource) => Promise<BarcodeDetectionResultLike[]>;
};

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

const getIsoWeekAndYear = (d: Date) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { week: String(weekNo).padStart(2, '0'), year: String(year) };
};

const getMachineCode = (station: string): string => {
  const normalized = getNormalizedMachine(station);
  const map: Record<string, string> = {
    'BH11': '411', 'BH12': '412', 'BH15': '415', 'BH16': '416',
    'BH17': '417', 'BH18': '418', 'BH31': '431', 'BH05': '405',
    'BH07': '407', 'BH08': '408', 'BH09': '409', 'BA05': '405', 'BA07': '417'
  };
  if (map[normalized]) return map[normalized];
  const digits = normalized.replace(/\D/g, "");
  if (!digits) return "999";
  if (digits.length === 3) return digits;
  if (digits.length === 1) return `40${digits}`;
  return `4${digits.slice(-2).padStart(2, "0")}`;
};

const normalizeStationCode = (station: unknown): string => {
  const normalized = String(station || "").trim().toUpperCase();
  return normalized.startsWith("40") ? normalized.slice(2) : normalized;
};

const printerHasStation = (printer: unknown, station: string) => {
  const typedPrinter = (printer || {}) as { linkedStations?: unknown[]; queueStations?: unknown[] };
  const linked = Array.isArray(typedPrinter.linkedStations) ? typedPrinter.linkedStations : [];
  const queue = Array.isArray(typedPrinter.queueStations) ? typedPrinter.queueStations : [];
  const target = normalizeStationCode(station);
  return [...linked, ...queue].some((entry) => normalizeStationCode(entry) === target);
};

const resolveBm01Printer = async () => {
  const snap = await getDocs(collection(db, getPathString(PATHS.PRINTERS as unknown as string[])));
  const printers = snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  return resolvePrinterForRouting(printers, {
    stationId: "BM01",
    routeKey: "STATION:BM01",
  });
};

const QcSampleView = () => {
  const { t } = useTranslation();
  const { user } = useAdminAuth() as { user: AuthUser | null };
  const { showSuccess, showWarning } = useNotifications() as {
    showSuccess: (message: string) => void;
    showWarning: (message: string) => void;
  };

  const [formState, setFormState, clearPersistedForm] = useFormPersistence<{
    machine: string;
    orderId: string;
    lotNumber: string;
    reason: string;
    scanMode: string;
  }>("qc_sample_view_form", {
    machine: "",
    orderId: "",
    lotNumber: "",
    reason: "",
    scanMode: "auto",
  });
  const [autoLotPreview, setAutoLotPreview] = useState("");
  const [isDecodingImage, setIsDecodingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [lastIssued, setLastIssued] = useState<{lot: string, orderId: string, itemCode: string, itemDescription: string} | null>(null);
  const [createdProductForModal, setCreatedProductForModal] = useState<any>(null);

  const machine = formState.machine;
  const orderId = formState.orderId;
  const lotNumber = formState.lotNumber;
  const reason = formState.reason;
  const scanMode = formState.scanMode;

  const { rawOrders } = useTeamleaderFirestore({ user: user as any }) as { rawOrders: TeamleaderOrder[] };

  const machineOptions = useMemo(() => {
    const set = new Set<string>();
    (Array.isArray(rawOrders) ? rawOrders : []).forEach((order: TeamleaderOrder) => {
      const value = getNormalizedMachine(order?.machine || "");
      if (value) set.add(value);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawOrders]);

  const orderOptions = useMemo(() => {
    const machineKey = getNormalizedMachine(machine);
    return (Array.isArray(rawOrders) ? rawOrders : [])
      .filter((order) => isOpenOrRunningOrder(order))
      .filter((order: TeamleaderOrder) => {
        if (!machineKey) return true;
        return getNormalizedMachine(order?.machine || "") === machineKey;
      })
      .sort((a: TeamleaderOrder, b: TeamleaderOrder) => String(a?.orderId || "").localeCompare(String(b?.orderId || "")));
  }, [rawOrders, machine]);

  const selectedOrder = useMemo(() => {
    return orderOptions.find((order) => String(order?.orderId || "") === String(orderId || "")) || null;
  }, [orderOptions, orderId]);

  const selectedOrderItemCode = useMemo(() => {
    if (!selectedOrder) return "";
    const directCode = String(selectedOrder?.itemCode || selectedOrder?.productId || "").trim();
    if (directCode) return directCode;

    const parsedFromItem = String(selectedOrder?.item || "")
      .trim()
      .match(/[A-Z0-9]{6,}/i);
    return parsedFromItem ? String(parsedFromItem[0] || "").trim().toUpperCase() : "";
  }, [selectedOrder]);

  const selectedOrderLabel = useMemo(() => {
    if (!selectedOrder) return "";
    return String(selectedOrder?.itemDescription || selectedOrder?.item || "Onbekend").trim();
  }, [selectedOrder]);

  useEffect(() => {
    const targetStation = selectedOrder?.machine || machine;
    if (scanMode === "auto" && targetStation) {
      setAutoLotPreview("Laden...");
      const fetchNext = async () => {
        try {
          const now = new Date();
          const { week, year } = getIsoWeekAndYear(now);
          const shortYear = year.slice(-2);
          const machineCode = getMachineCode(targetStation);
          const prefix = `40${shortYear}${week}${machineCode}40`;
          
          let maxSeq = 0;
          
          // 1. Controleer root tracking
          try {
            const trackingRef = collection(db, getPathString(PATHS.TRACKING));
            const qRoot = query(trackingRef, where("lotNumber", ">=", prefix), where("lotNumber", "<=", prefix + "\uf8ff"));
            const snapRoot = await getDocs(qRoot);
            snapRoot.docs.forEach(docSnap => {
              const lot = docSnap.data().lotNumber;
              if (lot && lot.startsWith(prefix)) {
                const seq = parseInt(lot.slice(-4), 10);
                if (seq > maxSeq) maxSeq = seq;
              }
            });
          } catch(e) { console.warn("Root query faalde", e); }
          
          // 2. Controleer scoped tracking/archief
          try {
            const itemsGroup = collectionGroup(db, "items");
            const qScoped = query(itemsGroup, where("lotNumber", ">=", prefix), where("lotNumber", "<=", prefix + "\uf8ff"));
            const snapScoped = await getDocs(qScoped);
            snapScoped.docs.forEach(docSnap => {
              const lot = docSnap.data().lotNumber;
              if (lot && lot.startsWith(prefix)) {
                const seq = parseInt(lot.slice(-4), 10);
                if (seq > maxSeq) maxSeq = seq;
              }
            });
          } catch(e) { console.warn("Scoped query faalde", e); }

          // 3. Controleer backend teller als extra vangnet
          try {
            const normStation = getNormalizedMachine(targetStation);
            const res = await reserveAutoLotNumberRange({
              stationId: normStation,
              station: normStation,
              count: 1,
              reserve: false,
              actorLabel: user?.email || "QC",
              source: "QcSampleView_Preview"
            }) as {
              startLot?: string;
              lotStart?: string;
              lots?: string[];
              firstLot?: string;
              lotNumber?: string;
            };
            const backendLot = res?.startLot || res?.lotStart || res?.lots?.[0] || res?.firstLot || res?.lotNumber;
            if (backendLot && backendLot.startsWith(prefix)) {
              const backendSeq = parseInt(backendLot.slice(-4), 10);
              if (backendSeq - 1 > maxSeq) maxSeq = backendSeq - 1;
            }
          } catch(e) { console.warn("Backend counter query faalde", e); }
          
          const nextSeq = maxSeq + 1;
          setAutoLotPreview(`${prefix}${String(nextSeq).padStart(4, '0')}`);
        } catch (err) {
          console.error(err);
          setAutoLotPreview("Fout bij laden");
        }
      };
      
      fetchNext();
    } else {
      setAutoLotPreview("");
    }
  }, [scanMode, machine, selectedOrder, user?.email, rawOrders, refreshKey]);

  const handleOpenCamera = () => {
    cameraInputRef.current?.click();
  };

  const handleCameraFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event?.target?.files?.[0];
    if (!file) return;

    if (typeof window === "undefined") {
      showWarning("Barcode scan niet ondersteund op dit toestel/browser. Gebruik handmatige invoer.");
      event.target.value = "";
      return;
    }

    const detectorCtor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (typeof detectorCtor !== "function") {
      showWarning("Barcode scan niet ondersteund op dit toestel/browser. Gebruik handmatige invoer.");
      event.target.value = "";
      return;
    }

    setIsDecodingImage(true);
    try {
      const detector = new detectorCtor({
        formats: ["code_128", "code_39", "codabar", "ean_13", "ean_8", "qr_code"],
      });
      const imageBitmap = await createImageBitmap(file); // eslint-disable-line no-undef
      const codes = await detector.detect(imageBitmap);
      const detected = String(codes?.[0]?.rawValue || "").trim().toUpperCase();
      if (!detected) {
        showWarning("Geen barcode/lotnummer gedetecteerd. Probeer opnieuw of typ handmatig.");
        return;
      }
      setFormState((prev) => ({ ...prev, lotNumber: detected }));
      showSuccess(`Lotnummer gescand: ${detected}`);
    } catch (error: unknown) {
      console.error("Fout bij camera scan:", error);
      showWarning("Scannen met camera is mislukt. Typ het lotnummer handmatig.");
    } finally {
      event.target.value = "";
      setIsDecodingImage(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const effectiveMachine = String(selectedOrder?.machine || machine || "").trim();

    if (!selectedOrder) {
      showWarning(t("qshe.virtualLots.selectOrder", "Selecteer eerst een order."));
      return;
    }

    const cleanItemCode = String(selectedOrderItemCode || "").trim();

    if (!cleanItemCode) {
      showWarning(t("qshe.virtualLots.itemRequired", "Geen itemcode gevonden op deze order. Vul itemcode eerst aan in planning."));
      return;
    }

    let finalLot = String(lotNumber || "").trim().toUpperCase();

    if (scanMode === "auto") {
      if (!autoLotPreview || autoLotPreview === "Laden..." || autoLotPreview === "Fout bij laden") {
        showWarning("Wacht tot het auto-lotnummer geladen is of vul handmatig in.");
        return;
      }
      finalLot = autoLotPreview;
      setSubmitting(true);
    } else {
      if (!finalLot) {
        showWarning(t("qshe.virtualLots.lotRequired", "Lotnummer is verplicht."));
        return;
      }
      setSubmitting(true);
    }

    try {
      await startProductionLots({
        orderDocId: selectedOrder.id,
        orderDocPath: selectedOrder?.__docPath || "",
        orderSourcePath: selectedOrder?.sourcePath || "",
        orderId: selectedOrder?.orderId,
        itemCode: cleanItemCode,
        item: selectedOrder?.item || selectedOrder?.itemDescription || "",
        lotStart: finalLot,
        totalToProduce: 1,
        stationId: effectiveMachine,
        stationLabel: effectiveMachine,
        actorLabel: user?.email || "QC",
        isVirtualLot: true,
        virtualReason: String(reason || "").trim(),
      });

      try {
        const bm01Printer = await resolveBm01Printer();
        if (bm01Printer?.id) {
          const qcLabelPayload = generateLotBatchZPL({
            lots: [finalLot],
            orderNumber: selectedOrder?.orderId || "",
          });
          if (qcLabelPayload) {
            await queuePrintJob(String(bm01Printer.id || "").trim(), qcLabelPayload, {
              description: `QC virtueel lot ${finalLot} (${selectedOrder?.orderId || ""})`,
              quantity: 1,
              orderId: selectedOrder?.orderId || "",
              lotNumber: finalLot,
              stationId: "BM01",
              targetPrinterName: String((bm01Printer as { name?: unknown }).name || "BM01 Printer"),
              source: "QcSampleView",
              isVirtualLot: true,
            });
          }
        } else {
          showWarning("Geen BM01 printerconfig gevonden; QC label is niet naar de printqueue verstuurd.");
        }
      } catch (printError) {
        console.error("QC virtueel lot printqueue mislukt:", printError);
        showWarning("Virtueel lot is aangemaakt, maar label kon niet naar BM01 printqueue worden verstuurd.");
      }

      try {
        const trackingRef = collection(db, getPathString(PATHS.TRACKING as any));
        const itemsGroupRef = collectionGroup(db, "items");
        let found = false;
        let retries = 0;
        
        while (!found && retries < 4) {
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 800)); // wait before retry
          }
          
          // Zoek eerst in de root tracking
          let qSnap = await getDocs(query(trackingRef, where("lotNumber", "==", finalLot)));
          if (qSnap.empty) {
            // Zoek anders in de items subcollecties
            qSnap = await getDocs(query(itemsGroupRef, where("lotNumber", "==", finalLot)));
          }
          
          if (!qSnap.empty) {
            const docSnap = qSnap.docs[0];
            const docData = docSnap.data();
            docData.id = docSnap.id;
            docData.__docPath = docSnap.ref.path;
            setCreatedProductForModal(docData);
            found = true;
            showSuccess(`Lot ${finalLot} gevonden, pop-up opent...`);
          }
          retries++;
        }
        
        if (!found) {
          showWarning(`Lot ${finalLot} niet gevonden in de database. Herlaad de pagina of zoek het handmatig op.`);
          console.warn("Kon aangemaakt lot niet onmiddellijk ophalen voor Vrijgeven modal na meerdere pogingen.");
        }
      } catch (err) {
        console.error("Kon aangemaakt lot niet ophalen voor Vrijgeven modal:", err);
        showWarning("Fout bij ophalen lot voor pop-up.");
      }

      clearPersistedForm();
      setFormState((prev) => ({
        ...prev,
        lotNumber: "",
        reason: "",
      }));
      
      if (scanMode === "auto") {
        setAutoLotPreview("Laden...");
        setRefreshKey(k => k + 1);
      }

      setLastIssued({
        lot: finalLot,
        orderId: selectedOrder?.orderId || "",
        itemCode: cleanItemCode,
        itemDescription: selectedOrder?.itemDescription || selectedOrder?.item || ""
      });

      showSuccess(
        t("qshe.virtualLots.success", "QC Steekproef lot {{lot}} aangemaakt voor order {{order}}.", {
          lot: finalLot,
          order: selectedOrder?.orderId,
        })
      );
    } catch (error: unknown) {
      console.error("Fout bij uitgeven virtueel lot:", error);
      const message = error instanceof Error ? error.message : t("qshe.virtualLots.error", "Kon QC Steekproef niet aanmaken.");
      showWarning(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintLastIssued = async (issued: typeof lastIssued) => {
    if (!issued) return;
    try {
      const qrDataUrl = await QRCode.toDataURL(issued.lot, { errorCorrectionLevel: 'H', margin: 1, width: 200 });
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        showWarning(t("qcSample.popupBlocked", "Pop-up geblokkeerd. Sta pop-ups toe om direct te kunnen printen."));
        return;
      }
      printWindow.document.write(`
        <html>
          <head>
            <title>${t("qcSample.printTitle", "Print QC Steekproef")} - ${issued.lot}</title>
            <style>
              body { font-family: sans-serif; text-align: center; padding: 20px; }
              .label-box { border: 2px solid #000; padding: 15px; display: inline-block; border-radius: 8px; min-width: 250px; }
              h2 { margin: 0 0 10px 0; font-size: 16px; color: #000; }
              p { margin: 5px 0; font-size: 12px; color: #333; }
              .lot { font-family: monospace; font-size: 18px; font-weight: bold; margin-top: 10px; }
              .footer { margin-top: 15px; font-size: 10px; color: #666; text-transform: uppercase; }
            </style>
          </head>
          <body>
            <div class="label-box">
              <h2>${t("qcSample.sample", "QC Steekproef")}</h2>
              <p>${t("qcSample.order", "Order")}<strong>: ${issued.orderId}</strong></p>
              <p>${issued.itemDescription}</p>
              <img src="${qrDataUrl}" width="150" height="150" />
              <div class="lot">${issued.lot}</div>
              <div class="footer">${t("qcSample.footerBrand", "FPi Future Factory")}</div>
            </div>
            <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); };</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (e) {
      console.error(e);
      showWarning(t("qcSample.couldNotGenerateLabel", "Kon label niet genereren om te printen."));
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto text-left">
      <div className="rounded-[28px] border border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-white border border-orange-200 text-orange-700">
            <ShieldCheck size={22} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-700">{t("qcSample.qc", "QC")}</p>
            <h2 className="text-2xl font-black italic text-slate-900 mt-1">{t("qcSample.sample", "QC Steekproef")}</h2>
            <p className="text-sm font-bold text-slate-600 mt-2">
              Trek een steekproef-lot voor inspectie zonder de productie-teller te beïnvloeden. Deze lots blijven volledig traceerbaar in het systeem.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-orange-200 bg-white p-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-700 px-1 pb-2">{t("qcSample.chooseMachine", "Kies machine")}</p>
              <select
                value={machine}
                onChange={(e) => {
                  setFormState((prev) => ({ ...prev, machine: e.target.value, orderId: "" }));
                }}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none focus:border-orange-400"
              >
                <option value="">{t('qcSample.selectMachine', '- Selecteer een machine -')}</option>
                {machineOptions.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </div>

            {machine && (
              <div className="rounded-xl border border-orange-200 bg-white p-2 animate-in fade-in">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-700 px-1 pb-2">{t("qcSample.chooseActiveOrder", "Kies actieve order")}</p>
                <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                  {orderOptions.map((entry) => {
                    const entryOrderId = String(entry?.orderId || "").trim();
                    const entryLabel = String(entry?.itemDescription || entry?.item || "Onbekend").trim();
                    const isSelected = String(orderId || "") === entryOrderId;
                    const statusStr = String(entry?.status || "").toLowerCase().trim();
                    const isActive = ["in_progress", "in progress", "in-behandeling", "in behandeling", "active", "processing", "running", "lopend", "in production", "in productie"].includes(statusStr);
                    return (
                      <button
                        key={entry.id || entryOrderId}
                        type="button"
                        onClick={() => setFormState((prev) => ({ ...prev, orderId: entryOrderId }))}
                        className={`w-full px-3 py-2 rounded-lg border text-left transition-colors ${
                          isSelected
                            ? "bg-orange-100 border-orange-300"
                            : "bg-white border-slate-200 hover:bg-orange-50"
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <p className="text-xs font-black text-slate-900 leading-tight">{entryOrderId || "-"}</p>
                          {isActive && <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold uppercase tracking-wider">{t("qcSample.active", "Actief")}</span>}
                        </div>
                        <p className="text-[11px] font-bold text-slate-600 leading-tight break-words">{entryLabel}</p>
                      </button>
                    );
                  })}
                  {orderOptions.length === 0 && (
                    <p className="px-2 py-3 text-[11px] font-bold text-slate-500">{t("qcSample.noActiveOrdersForMachine", "Geen actieve orders gevonden voor deze machine.")}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {selectedOrder && (
            <div className="px-3 py-2 rounded-xl border border-orange-100 bg-white/70 text-xs font-bold text-slate-700">
              Artikelomschrijving: <span className="text-slate-900">{selectedOrderLabel || "-"}</span>
            </div>
          )}

          {selectedOrder && (
            <div className="px-3 py-2 rounded-xl border border-orange-100 bg-white/70 text-xs font-bold text-slate-700">
              Itemcode (automatisch): <span className="text-slate-900">{selectedOrderItemCode || "Niet gevonden"}</span>
            </div>
          )}

          <div className="rounded-xl border border-orange-200 bg-white p-3 space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormState((prev) => ({ ...prev, scanMode: "auto" }))}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
                  scanMode === "auto"
                    ? "bg-orange-100 text-orange-700 border-orange-300"
                    : "bg-white text-slate-500 border-slate-200"
                }`}
              >
                <Hash size={12} className="inline mr-1" /> Auto
              </button>
              <button
                type="button"
                onClick={() => setFormState((prev) => ({ ...prev, scanMode: "manual" }))}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
                  scanMode === "manual"
                    ? "bg-orange-100 text-orange-700 border-orange-300"
                    : "bg-white text-slate-500 border-slate-200"
                }`}
              >
                <Keyboard size={12} className="inline mr-1" /> Handmatig
              </button>
              <button
                type="button"
                onClick={() => setFormState((prev) => ({ ...prev, scanMode: "camera" }))}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
                  scanMode === "camera"
                    ? "bg-orange-100 text-orange-700 border-orange-300"
                    : "bg-white text-slate-500 border-slate-200"
                }`}
              >
                <Camera size={12} className="inline mr-1" /> Camera
              </button>
            </div>

            {scanMode === "auto" ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={autoLotPreview}
                  className="w-full px-3 py-2 rounded-xl border border-orange-300 bg-orange-50 text-xs font-black text-orange-800 outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!machine && !selectedOrder?.machine) return;
                    setAutoLotPreview("Laden...");
                    setRefreshKey(k => k + 1);
                  }}
                  className="p-2 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition-colors shrink-0 border border-orange-200"
                  title="Ververs auto-lotnummer"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            ) : (
              <input
                type="text"
                value={lotNumber}
                onChange={(e) => setFormState((prev) => ({ ...prev, lotNumber: e.target.value.toUpperCase() }))}
                placeholder={scanMode === "camera" ? "Scan via camera of typ handmatig" : "Typ of scan lotnummer"}
                className="w-full px-3 py-2 rounded-xl border border-orange-300 bg-white text-xs font-black text-slate-800 outline-none focus:border-orange-500"
              />
            )}

            {scanMode === "camera" && (
              <div className="flex items-center gap-2">
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCameraFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleOpenCamera}
                  disabled={isDecodingImage}
                  className="px-3 py-2 rounded-xl bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 disabled:opacity-60 flex items-center gap-2"
                >
                  {isDecodingImage ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                  {isDecodingImage ? "Scannen..." : "Open mobiele camera"}
                </button>
                <span className="text-[10px] font-bold text-slate-500">{t("qcSample.autoFilledAfterScan", "Na scannen wordt lotnummer automatisch ingevuld.")}</span>
              </div>
            )}
          </div>

          <input
            type="text"
            value={reason}
            onChange={(e) => setFormState((prev) => ({ ...prev, reason: e.target.value }))}
            placeholder={t("placeholders.adminQcSampleReasonOptional", "Steekproef reden (optioneel)")}
            className="w-full px-3 py-2 rounded-xl border border-orange-200 bg-white text-xs font-bold text-slate-700 outline-none focus:border-orange-400"
          />

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 disabled:opacity-60 flex items-center gap-2"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {submitting ? "Bezig..." : "Maak QC Steekproef"}
            </button>
          </div>
        </form>

        {lastIssued && (
          <div className="mt-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50 flex items-center justify-between animate-in slide-in-from-bottom-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">{t("qcSample.lastCreated", "Laatst aangemaakt (QC Steekproef)")}</p>
              <p className="text-sm font-bold text-emerald-900 mt-1">{lastIssued.lot} <span className="opacity-50 text-xs font-medium">({lastIssued.orderId})</span></p>
            </div>
            <button
              type="button"
              onClick={() => handlePrintLastIssued(lastIssued)}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-sm"
            >
              <Printer size={14} /> Print Label
            </button>
          </div>
        )}
      </div>

      {createdProductForModal && (
        <ProductReleaseModal
          isOpen={!!createdProductForModal}
          product={createdProductForModal}
          onClose={() => setCreatedProductForModal(null)}
          defaultStatus="rejected"
          defaultReasons={["rejection.qcSample"]}
          forceLossenMode={true}
        />
      )}
    </div>
  );
};

export default QcSampleView;
