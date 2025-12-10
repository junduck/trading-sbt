import { describe, it, expect } from "vitest";
import { toDate, toEpoch } from "../src/shared/utils.js";

describe("toDate and toEpoch", () => {
  describe('epochUnit "s"', () => {
    it("should round trip correctly", () => {
      const rep = { epochUnit: "s" as const, timezone: "UTC" };
      const originalTime = 1000;
      const date = toDate(originalTime, rep);
      expect(date.getTime()).toBe(1000000); // 1000 * 1000
      const back = toEpoch(date, rep);
      expect(back).toBe(originalTime);
    });

    it("should handle zero", () => {
      const rep = { epochUnit: "s" as const, timezone: "UTC" };
      const date = toDate(0, rep);
      expect(date.getTime()).toBe(0);
      const back = toEpoch(date, rep);
      expect(back).toBe(0);
    });

    it("should handle negative", () => {
      const rep = { epochUnit: "s" as const, timezone: "UTC" };
      const date = toDate(-1000, rep);
      expect(date.getTime()).toBe(-1000000);
      const back = toEpoch(date, rep);
      expect(back).toBe(-1000);
    });
  });

  describe('epochUnit "ms"', () => {
    it("should round trip correctly", () => {
      const rep = { epochUnit: "ms" as const, timezone: "UTC" };
      const originalTime = 1000000;
      const date = toDate(originalTime, rep);
      expect(date.getTime()).toBe(1000000);
      const back = toEpoch(date, rep);
      expect(back).toBe(originalTime);
    });

    it("should handle zero", () => {
      const rep = { epochUnit: "ms" as const, timezone: "UTC" };
      const date = toDate(0, rep);
      expect(date.getTime()).toBe(0);
      const back = toEpoch(date, rep);
      expect(back).toBe(0);
    });
  });

  describe('epochUnit "us"', () => {
    it("should round trip correctly", () => {
      const rep = { epochUnit: "us" as const, timezone: "UTC" };
      const originalTime = 1000000000;
      const date = toDate(originalTime, rep);
      expect(date.getTime()).toBe(1000000); // 1000000000 / 1000
      const back = toEpoch(date, rep);
      expect(back).toBe(originalTime);
    });

    it("should handle zero", () => {
      const rep = { epochUnit: "us" as const, timezone: "UTC" };
      const date = toDate(0, rep);
      expect(date.getTime()).toBe(0);
      const back = toEpoch(date, rep);
      expect(back).toBe(0);
    });
  });

  describe('epochUnit "days"', () => {
    describe("UTC timezone", () => {
      it("should handle positive days", () => {
        const rep = { epochUnit: "days" as const, timezone: "UTC" };
        const date = toDate(1, rep);
        expect(date.toISOString()).toBe("1970-01-02T00:00:00.000Z");
        const epoch = toEpoch(date, rep);
        expect(epoch).toBe(1);
      });

      it("should handle zero", () => {
        const rep = { epochUnit: "days" as const, timezone: "UTC" };
        const date = toDate(0, rep);
        expect(date.toISOString()).toBe("1970-01-01T00:00:00.000Z");
        const epoch = toEpoch(date, rep);
        expect(epoch).toBe(0);
      });

      it("should handle negative days", () => {
        const rep = { epochUnit: "days" as const, timezone: "UTC" };
        const date = toDate(-1, rep);
        expect(date.toISOString()).toBe("1969-12-31T00:00:00.000Z");
        const epoch = toEpoch(date, rep);
        expect(epoch).toBe(-1);
      });

      it("should handle fractional days (floor)", () => {
        const rep = { epochUnit: "days" as const, timezone: "UTC" };
        const date = toDate(1.9, rep);
        expect(date.toISOString()).toBe("1970-01-02T21:36:00.000Z"); // 1.9 * 24 hours = 45.6 hours = 1 day + 21 hours 36 min
        const epoch = toEpoch(date, rep);
        expect(epoch).toBe(1); // floored
      });
    });

    describe("Asia/Shanghai timezone", () => {
      it("should handle 1 day since epoch", () => {
        const rep = { epochUnit: "days" as const, timezone: "Asia/Shanghai" };
        const date = toDate(1, rep);
        expect(
          date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" })
        ).toBe("1970-01-02");
        const epoch = toEpoch(date, rep);
        expect(epoch).toBe(1);
      });

      it("should handle zero", () => {
        const rep = { epochUnit: "days" as const, timezone: "Asia/Shanghai" };
        const date = toDate(0, rep);
        expect(
          date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" })
        ).toBe("1970-01-01");
        const epoch = toEpoch(date, rep);
        expect(epoch).toBe(0);
      });

      it("should handle negative days", () => {
        const rep = { epochUnit: "days" as const, timezone: "Asia/Shanghai" };
        const date = toDate(-1, rep);
        expect(
          date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" })
        ).toBe("1969-12-31");
        const epoch = toEpoch(date, rep);
        expect(epoch).toBe(-1);
      });
    });

    describe("America/New_York timezone", () => {
      it("should handle positive days", () => {
        const rep = {
          epochUnit: "days" as const,
          timezone: "America/New_York",
        };
        const date = toDate(1, rep);
        expect(
          date.toLocaleDateString("en-CA", { timeZone: "America/New_York" })
        ).toBe("1970-01-02");
        const epoch = toEpoch(date, rep);
        expect(epoch).toBe(1);
      });

      it("should handle zero", () => {
        const rep = {
          epochUnit: "days" as const,
          timezone: "America/New_York",
        };
        const date = toDate(0, rep);
        expect(
          date.toLocaleDateString("en-CA", { timeZone: "America/New_York" })
        ).toBe("1970-01-01");
        const epoch = toEpoch(date, rep);
        expect(epoch).toBe(0);
      });
    });
  });
});
