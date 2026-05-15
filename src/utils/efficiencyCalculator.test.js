import { describe, it, expect } from "vitest";
import { calculateDuration, formatMinutes, calculateAvailability, calculatePerformance, calculateQuality, calculateOEE, calculateEfficiency, getEfficiencyColor, isBehindSchedule, calculateTimeDeviation, calculateBatchEfficiency, getEfficiencyLabel } from "./efficiencyCalculator";
describe("efficiencyCalculator", () => {
    describe("calculateDuration", () => {
        it("should calculate duration in minutes correctly", () => {
            const start = new Date("2026-05-07T10:00:00Z");
            const end = new Date("2026-05-07T10:30:00Z");
            expect(calculateDuration(start, end)).toBe(30);
        });
        it("should return 0 if end is before start", () => {
            const start = new Date("2026-05-07T10:30:00Z");
            const end = new Date("2026-05-07T10:00:00Z");
            expect(calculateDuration(start, end)).toBe(0);
        });
        it("should handle Firestore Timestamp objects with toDate()", () => {
            const start = { toDate: () => new Date("2026-05-07T10:00:00Z") };
            const end = { toDate: () => new Date("2026-05-07T11:15:00Z") };
            expect(calculateDuration(start, end)).toBe(75);
        });
    });
    describe("formatMinutes", () => {
        it("should format less than 60 minutes correctly", () => {
            expect(formatMinutes(45)).toBe("45m");
        });
        it("should format more than 60 minutes correctly", () => {
            expect(formatMinutes(135)).toBe("2u 15m");
        });
        it("should round minutes correctly", () => {
            expect(formatMinutes(135.6)).toBe("2u 16m");
        });
    });
    describe("calculateAvailability", () => {
        it("should calculate correct percentage", () => {
            expect(calculateAvailability(400, 480)).toBeCloseTo(83.33, 1);
        });
        it("should cap at 100%", () => {
            expect(calculateAvailability(500, 480)).toBe(100);
        });
        it("should return 0 if planned time is 0", () => {
            expect(calculateAvailability(400, 0)).toBe(0);
        });
    });
    describe("calculatePerformance", () => {
        it("should calculate correct percentage", () => {
            expect(calculatePerformance(80, 100)).toBe(80);
        });
        it("can exceed 100%", () => {
            expect(calculatePerformance(110, 100)).toBeCloseTo(110, 1);
        });
        it("should return 0 if target output is 0", () => {
            expect(calculatePerformance(100, 0)).toBe(0);
        });
    });
    describe("calculateQuality", () => {
        it("should calculate correct percentage", () => {
            expect(calculateQuality(95, 100)).toBe(95);
        });
        it("should return 0 if total count is 0", () => {
            expect(calculateQuality(0, 0)).toBe(0);
        });
    });
    describe("calculateOEE", () => {
        it("should calculate OEE correctly", () => {
            // 80% * 90% * 95% = 68.4%
            expect(calculateOEE(80, 90, 95)).toBeCloseTo(68.4, 1);
        });
    });
    describe("calculateEfficiency", () => {
        it("should calculate target / actual * 100", () => {
            expect(calculateEfficiency(50, 60)).toBe(120);
            expect(calculateEfficiency(100, 80)).toBe(80);
        });
        it("should return 0 if actualMinutes is 0", () => {
            expect(calculateEfficiency(0, 50)).toBe(0);
        });
    });
    describe("getEfficiencyColor", () => {
        it("returns correct color classes", () => {
            expect(getEfficiencyColor(105)).toContain("emerald");
            expect(getEfficiencyColor(90)).toContain("green");
            expect(getEfficiencyColor(75)).toContain("yellow");
            expect(getEfficiencyColor(60)).toContain("orange");
            expect(getEfficiencyColor(40)).toContain("red");
        });
    });
    describe("calculateBatchEfficiency", () => {
        it("calculates total efficiency for multiple products", () => {
            const products = [
                { actualMinutes: 50, targetMinutes: 60 },
                { actualMinutes: 30, targetMinutes: 30 },
            ]; // total actual = 80, total target = 90
            expect(calculateBatchEfficiency(products)).toBe(112.5);
        });
        it("supports actualTime/targetTime fallback fields", () => {
            const products = [
                { actualTime: 20, targetTime: 25 },
                { actualTime: 40, targetTime: 35 },
            ];
            expect(calculateBatchEfficiency(products)).toBe(100);
        });
        it("returns 0 for empty or invalid arrays", () => {
            expect(calculateBatchEfficiency([])).toBe(0);
            expect(calculateBatchEfficiency(null)).toBe(0);
        });
    });
    describe("schedule helpers", () => {
        it("detects behind schedule correctly", () => {
            const start = new Date(Date.now() - 31 * 60 * 1000);
            expect(isBehindSchedule(start, 30)).toBe(true);
            expect(isBehindSchedule(start, 40)).toBe(false);
        });
        it("calculates positive and negative time deviation", () => {
            const behindStart = new Date(Date.now() - 65 * 60 * 1000);
            const aheadStart = new Date(Date.now() - 10 * 60 * 1000);
            expect(calculateTimeDeviation(behindStart, 60)).toBeGreaterThan(0);
            expect(calculateTimeDeviation(aheadStart, 20)).toBeLessThan(0);
        });
    });
    describe("getEfficiencyLabel", () => {
        it("returns translated labels by threshold", () => {
            expect(getEfficiencyLabel(105)).toBe("Uitstekend");
            expect(getEfficiencyLabel(90)).toBe("Goed");
            expect(getEfficiencyLabel(75)).toBe("Voldoende");
            expect(getEfficiencyLabel(55)).toBe("Matig");
            expect(getEfficiencyLabel(30)).toBe("Kritiek");
        });
    });
});
