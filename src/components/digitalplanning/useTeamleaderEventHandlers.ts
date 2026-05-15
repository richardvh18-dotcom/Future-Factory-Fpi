// @ts-nocheck
import { useCallback } from "react";
import { format, subDays } from "date-fns";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db, logActivity } from "../../config/firebase";
import { getArchiveItemsPath } from "../../config/dbPaths";
import { normalizeMachine } from "../../utils/hubHelpers";
import { runBatchDrawingSync } from "../../utils/drawingLinker";
import { archiveOrder } from "../../utils/archiveService";
import {
  moveTrackedProductManual,
  archiveRejectedTrackedProduct,
  assignOverproduction,
  createPlanningOrderManual,
  updatePlanningOrderDetails,
  saveOccupancyAssignments,
  deleteOccupancyAssignments,
} from "../../services/planningSecurityService";
import * as XLSX from "xlsx";

/**
 * useTeamleaderEventHandlers - Extract all event handlers from TeamleaderHub
 * 
 * Handles:
 * - Modal/sidebar navigation
 * - Drawing sync
 * - Data export (CSV/Excel)
 * - Occupancy management
 * - Product movement
 * - Overproduction assignment
 * - Order creation/archival
 */
export const useTeamleaderEventHandlers = ({
  // User & context
  user,
  navigate,
  t,
  todayStr,
  
  // State setters
  setActiveTab,
  setIsMobileMenuOpen,
  setShowAiPrediction,
  setIsSyncingDrawings,
  setModalTitle,
  setKpiWeekOffset,
  setActiveKpi,
  setLastKpi,
  setSelectedSidebarEntry,
  setSelectedOrderId,
  setViewingDossier,
  setSelectedStationDetail,
  setSelectedOverproductionGroup,
  setOverproductionTargetOrderId,
  setOverproductionManualStation,
  setAssigningOverproduction,
  setIsCopying,
  setIsClearing,
  setShowAddOrderModal,
  setCreatingOrder,
  setNewOrderData,
  setIsArchivingLegacyRejected,
  
  // Notifications
  showSuccess,
  showInfo,
  showWarning,
  showConfirm,
  notify,
  
  // Data
  dataStore,
  rawOrders,
  rawProducts,
  bezetting,
  selectedOverproductionGroup,
  overproductionTargetOrderId,
  overproductionManualStation,
  selectedSidebarEntry,
  newOrderData,
  legacyRejectedOrders,
  
  // Helpers
  getOrderIdFromTrackedRecord,
  getOrderProgressMeta,
  getFinishedQtyForOrder,
  resolveOverproductionRoute,
  isInAllowedScope,
  fixedScope,
  targetSlug,
  departmentFilter,
  effectiveAllowedNorms = [],
}) => {
  // Navigation handler
  const handleOpenExtendedPersonnel = useCallback(() => {
    const targetState = {
      openScreen: "personnel",
      personnelDate: todayStr,
      personnelTab: "assignment",
    };

    if (typeof navigate === "function") {
      navigate("/admin", { state: targetState });
      return;
    }

    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem("teamleader:openPersonnel", JSON.stringify(targetState));
      } catch {
        // Ignore storage failures
      }
      window.location.assign("/admin");
    }
  }, [navigate, todayStr]);

  // Overproduction handlers
  const handleOpenOverproductionGroup = useCallback((group) => {
    setSelectedOverproductionGroup(group);
    setOverproductionTargetOrderId("");
    setOverproductionManualStation("");
  }, [setSelectedOverproductionGroup, setOverproductionTargetOrderId, setOverproductionManualStation]);

  const handleAssignOverproduction = useCallback(async () => {
    if (!selectedOverproductionGroup) return;

    const targetOrderId = String(overproductionTargetOrderId || "").trim();
    if (!targetOrderId) {
      showWarning(t('teamleader.fill_new_order_first', 'Enter a new order number first.'));
      return;
    }

    const targetOrder = rawOrders.find(
      (order) => String(order.orderId || "").trim().toUpperCase() === targetOrderId.toUpperCase()
    );
    if (!targetOrder?.id) {
      showWarning(
        t('teamleader.order_not_visible_yet', 'Order {{orderId}} is not visible in planning yet. Import or sync the LN order first.', {
          orderId: targetOrderId,
        })
      );
      return;
    }

    const route = resolveOverproductionRoute(
      targetOrder,
      selectedOverproductionGroup,
      overproductionManualStation || ""
    );
    if (!route.station) {
      showWarning(
        t('teamleader.choose_target_station_pipe_overproduction', 'Choose the target station first for this pipe overproduction.')
      );
      return;
    }

    setAssigningOverproduction(true);
    try {
      const targetOrderDocId = targetOrder.__docPath || targetOrder.id;
      await assignOverproduction({
        targetOrderDocId,
        targetOrderId: targetOrder.orderId,
        productIds: selectedOverproductionGroup.products.map((product) => product.id),
        routeStation: route.station,
        sourceOrderId: selectedOverproductionGroup.originalOrderId,
        originMachine: selectedOverproductionGroup.originMachine,
        source: "TeamleaderHub",
        actorLabel: user?.email || "planner",
      });

      await logActivity(
        user?.uid || "system",
        "OVERPRODUCTION_ASSIGN",
        t('teamleader.overproduction_linked_log',
          'Overproduction linked: {{count}} pieces from {{sourceOrderId}} -> {{targetOrderId}}, station {{station}}',
          {
            count: selectedOverproductionGroup.count,
            sourceOrderId: selectedOverproductionGroup.originalOrderId,
            targetOrderId: targetOrder.orderId,
            station: route.station,
          }
        )
      );

      showSuccess(
        t('teamleader.overproduction_linked_success',
          'Overproduction linked to {{orderId}} and forwarded to {{station}}.',
          {
            orderId: targetOrder.orderId,
            station: route.station,
          }
        )
      );
      setSelectedOverproductionGroup(null);
      setOverproductionTargetOrderId("");
      setOverproductionManualStation("");
    } catch (err) {
      console.error(
        t('teamleader.overproduction_link_error', 'Error linking overproduction:'),
        err
      );
      showWarning(
        t('teamleader.overproduction_link_failed', 'Linking failed: {{message}}', {
          message: err.message,
        })
      );
    } finally {
      setAssigningOverproduction(false);
    }
  }, [
    selectedOverproductionGroup,
    rawOrders,
    resolveOverproductionRoute,
    showWarning,
    showSuccess,
    setAssigningOverproduction,
    setSelectedOverproductionGroup,
    setOverproductionTargetOrderId,
    setOverproductionManualStation,
    user,
    t,
  ]);

  // Sidebar selection handler
  const handleSidebarSelect = useCallback(
    async (entry) => {
      if (!entry) {
        setSelectedOrderId(null);
        setSelectedSidebarEntry(null);
        return;
      }

      const entryOrderId = String(entry.orderId || entry.id || "").trim();
      if (!entryOrderId) return;
      setSelectedSidebarEntry(entry);

      if (entry.isRejectEntry) {
        if (entry.orderId) {
          setSelectedOrderId(entry.orderId);
        } else {
          setSelectedOrderId(null);
        }
        return;
      }

      if (entry.isArchivedOrder) {
        const activeMatch = dataStore.find((o) => {
          const candidateOrderId = String(o?.orderId || o?.id || "").trim();
          return candidateOrderId && candidateOrderId === entryOrderId;
        });

        if (activeMatch) {
          setSelectedOrderId(String(activeMatch.orderId || activeMatch.id || "").trim());
          return;
        }

        setSelectedOrderId(null);
        try {
          const baseYear = new Date().getFullYear();
          const years = [baseYear, baseYear - 1, baseYear - 2, baseYear - 3];
          const snapshots = await Promise.all(
            years.map((year) =>
              getDocs(
                query(
                  collection(db, ...getArchiveItemsPath(year)),
                  where("orderId", "==", entryOrderId),
                  limit(100)
                )
              )
            )
          );

          const candidates = snapshots.flatMap((snap) =>
            snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          );
          const best = candidates
            .sort((a, b) => {
              const ta = a?.timestamps?.finished?.toMillis
                ? a.timestamps.finished.toMillis()
                : new Date(a?.timestamps?.finished || a?.updatedAt || 0).getTime();
              const tb = b?.timestamps?.finished?.toMillis
                ? b.timestamps.finished.toMillis()
                : new Date(b?.timestamps?.finished || b?.updatedAt || 0).getTime();
              return tb - ta;
            })[0];

          if (best) {
            const lotNumbers = Array.from(
              new Set(
                candidates
                  .map((c) => String(c.lotNumber || c.activeLot || "").trim())
                  .filter(Boolean)
              )
            );

            setSelectedSidebarEntry({
              ...entry,
              status: "completed",
              archived: true,
              isArchivedOrder: true,
              archivedCandidates: candidates,
              lotNumbers,
              lotNumbersText: lotNumbers.join(" "),
              machine: best.machine || best.originMachine || entry.machine,
              item: best.item || best.itemDescription || entry.item,
            });
            return;
          }
        } catch (err) {
          console.warn("Kon archiefdossier niet laden:", err);
        }

        const fallbackItem = {
          ...entry,
          status: "completed",
          archived: true,
          isArchivedOrder: true,
        };
        setSelectedSidebarEntry(fallbackItem);
        return;
      }

      setSelectedOrderId(entry.id || entryOrderId);
    },
    [setSelectedOrderId, setSelectedSidebarEntry, dataStore]
  );

  // Archived lot dossier handler
  const handleOpenArchivedLotDossier = useCallback(
    async (lotNumber) => {
      if (!selectedSidebarEntry?.isArchivedOrder) return;

      const lot = String(lotNumber || "").trim();
      const localCandidates = Array.isArray(selectedSidebarEntry.archivedCandidates)
        ? selectedSidebarEntry.archivedCandidates
        : [];

      let best = null;

      if (localCandidates.length > 0) {
        const scoped = lot
          ? localCandidates.filter((c) => String(c.lotNumber || c.activeLot || "").trim() === lot)
          : localCandidates;

        best = scoped.sort((a, b) => {
          const ta = a?.timestamps?.finished?.toMillis
            ? a.timestamps.finished.toMillis()
            : new Date(a?.timestamps?.finished || a?.updatedAt || 0).getTime();
          const tb = b?.timestamps?.finished?.toMillis
            ? b.timestamps.finished.toMillis()
            : new Date(b?.timestamps?.finished || b?.updatedAt || 0).getTime();
          return tb - ta;
        })[0] || null;
      }

      if (!best) {
        try {
          const orderId = String(
            selectedSidebarEntry.orderId || selectedSidebarEntry.id || ""
          ).trim();
          const baseYear = new Date().getFullYear();
          const years = [baseYear, baseYear - 1, baseYear - 2, baseYear - 3];
          const snaps = await Promise.all(
            years.map((year) =>
              getDocs(
                query(
                  collection(db, ...getArchiveItemsPath(year)),
                  where("orderId", "==", orderId),
                  limit(150)
                )
              )
            )
          );

          const candidates = snaps
            .flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))
            .filter((c) => {
              if (!lot) return true;
              return String(c.lotNumber || c.activeLot || "").trim() === lot;
            });

          best = candidates.sort((a, b) => {
            const ta = a?.timestamps?.finished?.toMillis
              ? a.timestamps.finished.toMillis()
              : new Date(a?.timestamps?.finished || a?.updatedAt || 0).getTime();
            const tb = b?.timestamps?.finished?.toMillis
              ? b.timestamps.finished.toMillis()
              : new Date(b?.timestamps?.finished || b?.updatedAt || 0).getTime();
            return tb - ta;
          })[0] || null;
        } catch (err) {
          console.warn("Kon dossier voor lot niet laden:", err);
        }
      }

      if (best) {
        setViewingDossier({
          ...best,
          status: "completed",
          archived: true,
          isArchivedOrder: true,
        });
        return;
      }

      setViewingDossier({
        ...selectedSidebarEntry,
        status: "completed",
        archived: true,
        lotNumber: lot || selectedSidebarEntry.lotNumber,
      });
    },
    [selectedSidebarEntry, setViewingDossier]
  );

  const handleReopenArchivedOrderWithIncrease = useCallback(
    async ({ entry, increaseBy }) => {
      const targetEntry = entry || selectedSidebarEntry;
      if (!targetEntry?.isArchivedOrder) {
        notify("Selecteer eerst een gearchiveerde order.");
        return { ok: false };
      }

      const safeIncrease = Math.floor(Number(increaseBy));
      if (!Number.isFinite(safeIncrease) || safeIncrease <= 0) {
        notify("Verhoging moet minimaal 1 zijn.");
        return { ok: false };
      }

      const orderRef = String(
        targetEntry.__docPath ||
          targetEntry.orderDocPath ||
          targetEntry.id ||
          targetEntry.orderId ||
          ""
      ).trim();

      if (!orderRef) {
        notify("Order referentie ontbreekt; kan archieforder niet heropenen.");
        return { ok: false };
      }

      const orderLabel = String(targetEntry.orderId || targetEntry.id || orderRef).trim();
      const confirmed = await showConfirm({
        title: "Order uit archief heropenen",
        message: `Wil je order ${orderLabel} ophogen met ${safeIncrease} en terugzetten naar planning?`,
        confirmText: "Ja, heropenen",
        cancelText: "Annuleren",
        tone: "warning",
      });

      if (!confirmed) {
        return { ok: false, cancelled: true };
      }

      try {
        const result = await updatePlanningOrderDetails({
          orderDocId: orderRef,
          planDelta: safeIncrease,
          source: "ArchivedOrderDetailPanel",
          actorLabel: user?.email || "Teamleader",
        });

        await logActivity(
          user?.uid || "system",
          "PLANNING_REOPEN_FROM_ARCHIVE",
          `Order ${orderLabel} heropend uit archief en opgehoogd met ${safeIncrease}`
        );

        setActiveTab("planning");
        setSelectedSidebarEntry(null);
        setSelectedOrderId(result?.orderId || orderLabel);
        showSuccess(`Order ${orderLabel} is opgehoogd en teruggezet naar planning.`);
        return { ok: true, result };
      } catch (error) {
        console.error("Heropenen archieforder mislukt:", error);
        notify("Heropenen mislukt: " + (error?.message || "Onbekende fout"));
        return { ok: false, error };
      }
    },
    [
      selectedSidebarEntry,
      notify,
      showConfirm,
      user,
      setActiveTab,
      setSelectedSidebarEntry,
      setSelectedOrderId,
      showSuccess,
    ]
  );

  // KPI modal handler
  const handleKpiClick = useCallback(
    (kpiId, label) => {
      setModalTitle(label);
      setKpiWeekOffset(0);
      setActiveKpi(kpiId);
    },
    [setModalTitle, setKpiWeekOffset, setActiveKpi]
  );

  // Drawing sync handler
  const handleDrawingSync = useCallback(async () => {
    setIsSyncingDrawings(true);
    try {
      const count = await runBatchDrawingSync();
      if (count > 0) {
        showSuccess(`${count} order(s) gekoppeld aan tekeningen`);
      } else {
        showInfo("Geen nieuwe tekeningen gevonden om te koppelen");
      }
    } catch (err) {
      console.error("Drawing sync error:", err);
      showWarning("Fout bij synchroniseren tekeningen");
    } finally {
      setIsSyncingDrawings(false);
    }
  }, [setIsSyncingDrawings, showSuccess, showInfo, showWarning]);

  // CSV export handler
  const handleExport = useCallback(() => {
    if (dataStore.length === 0) {
      notify("Geen data om te exporteren.");
      return;
    }
    const headers = [
      "Order",
      "Item",
      "Item Code",
      "Machine",
      "Plan",
      "Gereed",
      "Status",
      "Datum",
      "Afdeling",
    ];
    const rows = dataStore.map((o) => {
      const dateStr = o.dateObj ? format(o.dateObj, "yyyy-MM-dd") : "";
      const finishedQty = getFinishedQtyForOrder(o);
      return [
        o.orderId || "",
        `"${(o.item || "").replace(/"/g, '""')}"`,
        o.itemCode || "",
        o.machine || "",
        o.plan || 0,
        finishedQty,
        o.status || "",
        dateStr,
        o.department || "",
      ];
    });
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `teamleader_export_${fixedScope}_${format(new Date(), "yyyy-MM-dd")}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [dataStore, getFinishedQtyForOrder, notify, fixedScope]);

  // Excel planner export handler
  const handlePlannerExcelExport = useCallback(() => {
    if (dataStore.length === 0) {
      notify("Geen data om te exporteren.");
      return;
    }

    const filtered = effectiveAllowedNorms.length > 0
      ? dataStore.filter((o) => !effectiveAllowedNorms.includes(normalizeMachine(o.machine || "")))
      : dataStore;
    if (filtered.length === 0) {
      notify("Geen exportdata beschikbaar.");
      return;
    }

    const formatMachineForPlanner = (machine) => {
      const raw = String(machine || "").trim().toUpperCase();
      if (!raw) return "ONBEKEND";
      if (raw.startsWith("40")) return raw;
      if (/^(BH|BM|BA|\d{4,5})/.test(raw)) return `40${raw}`;
      return raw;
    };

    const getOrderDate = (order) => {
      const value =
        order?.plannedDate || order?.date || order?.deliveryDate || null;
      if (!value) return null;
      if (value?.toDate) return value.toDate();
      const parsed = new Date(value);
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    };

    const byMachine = filtered.reduce((acc, order) => {
      const machineKey = formatMachineForPlanner(order.machine || "ONBEKEND");
      if (!acc[machineKey]) acc[machineKey] = [];
      acc[machineKey].push(order);
      return acc;
    }, {});

    const workbook = XLSX.utils.book_new();

    Object.entries(byMachine)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([machine, orders]) => {
        const aoa = [];
        aoa.push([machine, "", "Printdatum:", format(new Date(), "M/d/yyyy")]);
        aoa.push([]);
        aoa.push([
          "Machine",
          "datum",
          "Week",
          "order",
          "PO Text",
          "Project",
          "Project Desc",
          "Manufactured Item",
          "Item Desc",
          "code",
          "Drawing",
          "Plan",
          "to do",
          "Gewikkeld",
          "Finish",
        ]);

        orders
          .slice()
          .sort((a, b) => {
            const ad = getOrderDate(a)?.getTime() || 0;
            const bd = getOrderDate(b)?.getTime() || 0;
            if (ad !== bd) return ad - bd;
            return String(a.orderId || "").localeCompare(String(b.orderId || ""));
          })
          .forEach((o) => {
            const date = getOrderDate(o);
            const week = o.weekNumber || 0;
            const plan = parseInt(o.plan || o.quantity || 0, 10) || 0;
            const wrapped = getFinishedQtyForOrder(o);
            const toDo = Math.max(plan - wrapped, 0);
            const machineCode = formatMachineForPlanner(o.machine || machine);
            const dateValue = date ? format(date, "M/d/yyyy") : "";

            aoa.push([
              machineCode,
              dateValue,
              week,
              o.orderId || "",
              o.notes || o.poText || "",
              o.project || "",
              o.projectDesc || "",
              o.itemCode || "",
              o.item || o.itemDescription || "",
              o.extraCode || o.code || "",
              o.drawing || "",
              plan,
              toDo,
              wrapped,
              "",
            ]);
          });

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws["!cols"] = [
          { wch: 12 },
          { wch: 12 },
          { wch: 8 },
          { wch: 14 },
          { wch: 18 },
          { wch: 14 },
          { wch: 20 },
          { wch: 28 },
          { wch: 28 },
          { wch: 10 },
          { wch: 18 },
          { wch: 8 },
          { wch: 8 },
          { wch: 10 },
          { wch: 10 },
        ];

        XLSX.utils.book_append_sheet(workbook, ws, machine.slice(0, 31));
      });

    XLSX.writeFile(workbook, `planner_export_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  }, [dataStore, getFinishedQtyForOrder, notify]);

  // Occupancy copy yesterday handler
  const handleCopyYesterday = useCallback(
    async (targetDeptId) => {
      const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
      const currentDayStr = format(new Date(), "yyyy-MM-dd");
      const yesterdayData = bezetting.filter(
        (o) =>
          o.date === yesterdayStr &&
          o.operatorNumber &&
          o.departmentId === targetDeptId
      );

      if (yesterdayData.length === 0) {
        notify("Geen bezetting van gisteren gevonden voor deze afdeling.");
        return;
      }
      const copyConfirmed = await showConfirm({
        title: "Bezetting kopieren",
        message: `Wil je ${yesterdayData.length} toewijzingen van gisteren kopieren naar vandaag?`,
        confirmText: "Kopieren",
        cancelText: "Annuleren",
        tone: "warning",
      });
      if (!copyConfirmed) return;

      setIsCopying(true);
      try {
        await saveOccupancyAssignments({
          records: yesterdayData.map((old) => {
            const newId = `${currentDayStr}_${old.departmentId}_${old.machineId}_${old.operatorNumber}`.replace(
              /[^a-zA-Z0-9]/g,
              "_"
            );
            return {
              assignmentId: newId,
              data: {
                ...old,
                date: currentDayStr,
                updatedAt: "__SERVER_TIMESTAMP__",
              },
            };
          }),
          source: "TeamleaderHub.copyYesterday",
          actorLabel: user?.email || "Teamleader",
        });
        await logActivity(
          user?.uid || "system",
          "OCCUPANCY_COPY_YESTERDAY",
          `Bezetting gekopieerd van gisteren: afdeling ${targetDeptId}, aantal ${yesterdayData.length}`
        );
      } catch (err) {
        console.error("Fout bij kopiëren:", err);
        notify("Fout bij kopiëren: " + err.message);
      } finally {
        setIsCopying(false);
      }
    },
    [bezetting, showConfirm, notify, setIsCopying, user]
  );

  // Occupancy clear today handler
  const handleClearToday = useCallback(
    async (targetDeptId) => {
      const currentDayStr = format(new Date(), "yyyy-MM-dd");
      const todayData = bezetting.filter(
        (o) => o.date === currentDayStr && o.departmentId === targetDeptId
      );

      if (todayData.length === 0) {
        notify("Geen bezetting gevonden voor vandaag om te wissen.");
        return;
      }
      const clearConfirmed = await showConfirm({
        title: "Bezetting wissen",
        message: `Weet je zeker dat je de bezetting van VANDAAG (${todayData.length} items) voor deze afdeling wilt wissen?`,
        confirmText: "Wissen",
        cancelText: "Annuleren",
        tone: "danger",
      });
      if (!clearConfirmed) return;

      setIsClearing(true);
      try {
        await deleteOccupancyAssignments({
          assignmentIds: todayData.map((docItem) => docItem.id),
          source: "TeamleaderHub.clearToday",
          actorLabel: user?.email || "Teamleader",
        });
        await logActivity(
          user?.uid || "system",
          "OCCUPANCY_CLEAR_TODAY",
          `Bezetting gewist voor vandaag: afdeling ${targetDeptId}, aantal ${todayData.length}`
        );
      } catch (err) {
        console.error("Fout bij wissen:", err);
        notify("Fout bij wissen: " + err.message);
      } finally {
        setIsClearing(false);
      }
    },
    [bezetting, showConfirm, notify, setIsClearing, user]
  );

  // Lot movement handler
  const handleMoveLot = useCallback(
    async (lotNumber, newStation, options = {}) => {
      if (!lotNumber || !newStation) return;
      try {
        const isRepairMove = Boolean(options?.isRepairMove);
        const repairInstruction = String(options?.repairInstruction || "").trim();

        await moveTrackedProductManual({
          productOrLotId: lotNumber,
          newStation,
          isRepairMove,
          repairInstruction,
          source: "TeamleaderHub",
          actorLabel: user?.email || "Teamleader",
        });

        await logActivity(
          user?.uid || "system",
          "LOT_MANUAL_MOVE",
          `${isRepairMove ? "Teamleader reparatie" : "Teamleader verplaatsing"}: lot ${lotNumber} -> ${newStation}${
            repairInstruction ? ` | instructie: ${repairInstruction}` : ""
          }`
        );
        notify(
          `${isRepairMove ? "Reparatie" : "Product"} ${lotNumber} verplaatst naar ${newStation}`
        );
      } catch (err) {
        console.error("Fout bij verplaatsen:", err);
        notify("Fout bij verplaatsen: " + err.message);
      }
    },
    [user, notify]
  );

  // Rejected product archival handler
  const handleArchiveRejectedProduct = useCallback(
    async (product) => {
      const productId = String(product?.id || product?.lotNumber || "").trim();
      if (!productId) return;

      const confirmed = await showConfirm({
        title: "Definitieve afkeur afsluiten",
        message: `Wil je ${
          product?.lotNumber || productId
        } afsluiten? Het product verdwijnt dan uit de afkeur-lijst en teller.`,
        confirmText: "Sluit af",
        cancelText: "Annuleren",
        tone: "warning",
      });
      if (!confirmed) return;

      try {
        await archiveRejectedTrackedProduct({
          productId,
          source: "TeamleaderHub.rejectedModal",
          actorLabel: user?.email || "Teamleader",
        });

        await logActivity(
          user?.uid || "system",
          "QUALITY_REJECT_ARCHIVE",
          `Definitieve afkeur afgesloten: ${product?.lotNumber || productId}`
        );

        showSuccess(`Afkeur ${product?.lotNumber || productId} afgesloten.`);
      } catch (error) {
        console.error("Fout bij afsluiten afkeur:", error);
        notify("Fout bij afsluiten afkeur: " + error.message);
      }
    },
    [user, showConfirm, showSuccess, notify]
  );

  // Order creation handler
  const handleCreateOrder = useCallback(
    async (e) => {
      e.preventDefault();
      if (
        !newOrderData.orderId ||
        !newOrderData.item ||
        !newOrderData.machine ||
        !newOrderData.plan
      ) {
        notify("Vul alle velden in.");
        return;
      }
      setCreatingOrder(true);
      try {
        await createPlanningOrderManual({
          orderId: newOrderData.orderId,
          item: newOrderData.item,
          machine: newOrderData.machine,
          plan: Number(newOrderData.plan),
        });
        await logActivity(
          user?.uid || "system",
          "ORDER_CREATE_MANUAL",
          `Teamleader order aangemaakt: ${newOrderData.orderId}, machine ${newOrderData.machine}, plan ${newOrderData.plan}`
        );
        setShowAddOrderModal(false);
        setNewOrderData({ orderId: "", item: "", machine: "", plan: "" });
      } catch (error) {
        console.error("Error creating order:", error);
        notify("Fout bij aanmaken order: " + error.message);
      } finally {
        setCreatingOrder(false);
      }
    },
    [newOrderData, user, notify, setCreatingOrder, setShowAddOrderModal, setNewOrderData]
  );

  // Legacy rejected orders archival handler
  const handleArchiveLegacyRejectedOrders = useCallback(async () => {
    if (legacyRejectedOrders.length === 0) {
      notify("Geen oude definitieve afkeur-orders gevonden om te verplaatsen.");
      return;
    }

    const confirmed = await showConfirm({
      title: "Oude afkeur-orders verplaatsen",
      message: `Wil je ${legacyRejectedOrders.length} oude definitieve afkeur-order(s) verplaatsen naar het archief?`,
      confirmText: "Verplaatsen",
      cancelText: "Annuleren",
      tone: "warning",
    });
    if (!confirmed) return;

    setIsArchivingLegacyRejected(true);
    try {
      let archivedCount = 0;

      for (const order of legacyRejectedOrders) {
        try {
          const ok = await archiveOrder(order, "rejected");
          if (ok) archivedCount += 1;
        } catch (error) {
          console.error(
            `Archiveren mislukt voor order ${order?.orderId || order?.id}:`,
            error
          );
        }
      }

      await logActivity(
        user?.uid || "system",
        "PLANNING_ARCHIVE_LEGACY_REJECTED",
        `Oude definitieve afkeur-orders gearchiveerd: ${archivedCount}/${legacyRejectedOrders.length}`
      );

      if (archivedCount > 0) {
        showSuccess(
          `${archivedCount} oude definitieve afkeur-order(s) verplaatst naar archief.`
        );
      }
      if (archivedCount !== legacyRejectedOrders.length) {
        showWarning(
          `Waarschuwing: ${
            legacyRejectedOrders.length - archivedCount
          } order(s) konden niet gearchiveerd worden.`
        );
      }
    } catch (err) {
      console.error("Archiveren mislukt:", err);
      notify("Fout bij archiveren: " + err.message);
    } finally {
      setIsArchivingLegacyRejected(false);
    }
  }, [legacyRejectedOrders, showConfirm, showSuccess, showWarning, notify, user, setIsArchivingLegacyRejected]);

  return {
    handleOpenExtendedPersonnel,
    handleOpenOverproductionGroup,
    handleAssignOverproduction,
    handleSidebarSelect,
    handleOpenArchivedLotDossier,
    handleReopenArchivedOrderWithIncrease,
    handleKpiClick,
    handleDrawingSync,
    handleExport,
    handlePlannerExcelExport,
    handleCopyYesterday,
    handleClearToday,
    handleMoveLot,
    handleArchiveRejectedProduct,
    handleCreateOrder,
    handleArchiveLegacyRejectedOrders,
  };
};
