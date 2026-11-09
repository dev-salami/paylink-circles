import { describe, expect, it } from "vitest";
import { addMonthsClamped, daysUntil, isOverdue, roundDate } from "./dates";

describe("dates", () => {
  it("steps rounds weekly, biweekly and monthly", () => {
    expect(roundDate("2026-11-10", "weekly", 2)).toBe("2026-11-24");
    expect(roundDate("2026-11-10", "biweekly", 1)).toBe("2026-11-24");
    expect(roundDate("2026-11-10", "monthly", 3)).toBe("2027-02-10");
  });

  it("clamps month ends", () => {
    expect(addMonthsClamped("2027-01-31", 1)).toBe("2027-02-28");
  });

  it("treats the whole due day as on time", () => {
    expect(isOverdue("2026-11-05", new Date("2026-11-05T23:00:00Z"))).toBe(false);
    expect(isOverdue("2026-11-05", new Date("2026-11-06T00:30:00Z"))).toBe(true);
    expect(daysUntil("2026-11-08", new Date("2026-11-05T10:00:00Z"))).toBe(3);
  });
});
