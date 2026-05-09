// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import { 
  evaluateCapacityShortage, 
  evaluateLowEfficiency,
  evaluateOrderDelay,
  evaluateMissingOperator,
  evaluateDependencyBlocked,
  evaluateInspectionOverdue,
  evaluateRule,
  checkDebounce,
  executeRuleWithLogging,
} from "./automationEngine";
import { getDocs } from "firebase/firestore";
import { executeAutomationRule } from "../services/planningSecurityService";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

vi.mock("../config/firebase", () => ({ db: {} }));

vi.mock("../config/dbPaths", () => ({
  PATHS: {
    OCCUPANCY: ["occupancy"],
    PLANNING: ["planning"],
    TRACKING: ["tracking"],
    PRODUCTION_STANDARDS: ["standards"],
    AUTOMATION_EXECUTIONS: ["automation_executions"]
  }
}));

vi.mock("../i18n", () => ({
  default: { t: (key, options) => options?.defaultValue || key }
}));

vi.mock("../services/planningSecurityService", () => ({
  executeAutomationRule: vi.fn()
}));

describe("automationEngine", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("evaluateCapacityShortage", () => {
    it("should trigger when shortage > threshold", async () => {
      // Mock occupancy
      getDocs.mockResolvedValueOnce({
        docs: [
          { data: () => ({ hoursPerWeek: 40 }) },
          { data: () => ({ hoursPerWeek: 40 }) }
        ]
      });
      // Mock planning
      getDocs.mockResolvedValueOnce({
        docs: [
          { data: () => ({ estimatedHours: 50 }) },
          { data: () => ({ estimatedHours: 40 }) }
        ]
      });

      // capacity = 80, demand = 90, shortage = 10
      const result = await evaluateCapacityShortage({ threshold: 5 });
      
      expect(result.triggered).toBe(true);
      expect(result.data.shortage).toBe(10);
    });

    it("should not trigger when shortage <= threshold", async () => {
      getDocs.mockResolvedValueOnce({
        docs: [{ data: () => ({ hoursPerWeek: 80 }) }]
      });
      getDocs.mockResolvedValueOnce({
        docs: [{ data: () => ({ estimatedHours: 85 }) }]
      });

      // shortage = 5, threshold = 5
      const result = await evaluateCapacityShortage({ threshold: 5 });
      
      expect(result.triggered).toBe(false);
    });
  });

  describe("evaluateLowEfficiency", () => {
    it("should trigger when efficiency < threshold", async () => {
      getDocs.mockResolvedValueOnce({
        docs: [
          { data: () => ({ productionHours: 10, actualHours: 7 }) }, // 70%
          { data: () => ({ productionHours: 10, actualHours: 8 }) }  // 80%
        ] // avg = 75%
      });

      const result = await evaluateLowEfficiency({ threshold: 80 });
      
      expect(result.triggered).toBe(true);
      expect(result.data.avgEfficiency).toBe(75);
    });

    it("should not trigger when efficiency >= threshold", async () => {
      getDocs.mockResolvedValueOnce({
        docs: [
          { data: () => ({ productionHours: 10, actualHours: 9 }) } // 90%
        ]
      });

      const result = await evaluateLowEfficiency({ threshold: 80 });
      
      expect(result.triggered).toBe(false);
    });
  });

  describe("evaluateOrderDelay", () => {
    it("should trigger when delayed orders >= minDelayedOrders", async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      getDocs.mockResolvedValueOnce({
        docs: [
          { id: "1", data: () => ({ status: "in_production", plannedDate: pastDate, orderId: "O1" }) },
          { id: "2", data: () => ({ status: "in_production", plannedDate: futureDate, orderId: "O2" }) },
        ]
      });

      const result = await evaluateOrderDelay({ minDelayedOrders: 1 });
      
      expect(result.triggered).toBe(true);
      expect(result.data.delayedCount).toBe(1);
      expect(result.data.delayedOrderIds).toContain("O1");
    });
  });

  describe("evaluateMissingOperator", () => {
    it("should trigger when machines without operators exceed threshold", async () => {
      getDocs.mockResolvedValueOnce({
        docs: [
          { data: () => ({ station: "40BH18", operatorName: "" }) },
          { data: () => ({ station: "40BH17", operatorName: null }) },
          { data: () => ({ station: "40BH12", operatorName: "Piet" }) },
        ]
      });

      const result = await evaluateMissingOperator({ threshold: 2 });
      expect(result.triggered).toBe(true);
      expect(result.data.count).toBe(2);
    });
  });

  describe("evaluateDependencyBlocked", () => {
    it("should trigger for orders with incomplete dependencies", async () => {
      getDocs.mockResolvedValueOnce({
        docs: [
          { id: "dep-1", data: () => ({ orderId: "DEP-1", status: "in_production" }) },
          { id: "main-1", data: () => ({ orderId: "MAIN-1", status: "planned", dependencies: ["dep-1"] }) },
        ]
      });

      const result = await evaluateDependencyBlocked({ threshold: 1 });
      expect(result.triggered).toBe(true);
      expect(result.data.blockedCount).toBe(1);
      expect(result.data.blockedOrderIds).toContain("MAIN-1");
    });
  });

  describe("evaluateInspectionOverdue", () => {
    it("should trigger for overdue temporary rejections without reminder", async () => {
      const oldDate = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();
      getDocs.mockResolvedValueOnce({
        docs: [
          {
            id: "p-1",
            data: () => ({
              lotNumber: "L-1",
              currentStation: "QC",
              reminderSent: false,
              inspection: { status: "Tijdelijke afkeur", timestamp: oldDate },
            }),
          },
        ]
      });

      const result = await evaluateInspectionOverdue({ daysOverdue: 7, station: "QC" });
      expect(result.triggered).toBe(true);
      expect(result.data.overdueCount).toBe(1);
      expect(result.data.products[0].lotNumber).toBe("L-1");
    });
  });

  describe("evaluateRule", () => {
    it("returns unknown trigger info for unsupported trigger type", async () => {
      const result = await evaluateRule({
        trigger: { type: "does_not_exist" },
        action: { type: "send_notification" },
      });
      expect(result.triggered).toBe(false);
      expect(result.message).toContain("Unknown trigger type");
    });

    it("executes action when trigger fires", async () => {
      getDocs.mockResolvedValueOnce({
        docs: [{ data: () => ({ productionHours: 10, actualHours: 5 }) }],
      });

      const result = await evaluateRule({
        trigger: { type: "low_efficiency", conditions: { threshold: 80 } },
        action: { type: "send_notification", params: {} },
      });

      expect(result.triggered).toBe(true);
      expect(result.actionResult.success).toBe(true);
    });
  });

  describe("checkDebounce", () => {
    it("returns true when a recent execution exists", async () => {
      getDocs.mockResolvedValueOnce({
        docs: [
          {
            data: () => ({
              executedAt: { toDate: () => new Date(Date.now() - 10 * 60 * 1000) },
            }),
          },
        ],
      });

      const result = await checkDebounce("rule-1", 60);
      expect(result).toBe(true);
    });
  });

  describe("executeRuleWithLogging", () => {
    it("delegates execution to backend callable wrapper", async () => {
      executeAutomationRule.mockResolvedValueOnce({ ok: true });
      const rule = { id: "rule-42" };

      const result = await executeRuleWithLogging(rule);
      expect(executeAutomationRule).toHaveBeenCalledWith(rule);
      expect(result).toEqual({ ok: true });
    });
  });
});
