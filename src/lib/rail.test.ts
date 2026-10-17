import { describe, expect, it } from "vitest";
import { barIndex, bucketSize, monthTicks, railBars, railWindow } from "./rail";

describe("railWindow (Deadline Rail zoom)", () => {
  it("All is the goal's start to its deadline", () => {
    expect(railWindow("all", "2026-09-01", "2027-01-31", "2026-10-16", 6)).toEqual({ from: "2026-09-01", to: "2027-01-31" });
  });

  it("This month and This week stay inside the goal", () => {
    expect(railWindow("month", "2026-10-10", "2027-01-31", "2026-10-16", 6)).toEqual({ from: "2026-10-10", to: "2026-10-31" });
    // Friday 16 Oct 2026, weeks start on Saturday (PRD §5.8 default).
    expect(railWindow("week", "2026-09-01", "2027-01-31", "2026-10-16", 6)).toEqual({ from: "2026-10-10", to: "2026-10-16" });
  });

  it("falls back to All when today is outside the goal", () => {
    expect(railWindow("week", "2026-09-01", "2026-09-30", "2026-10-16", 6)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
});

describe("railBars", () => {
  it("one bar per day, height = tasks due that day", () => {
    const bars = railBars("2026-10-14", "2026-10-17", [{ day: "2026-10-15", count: 2 }]);
    expect(bars.map((b) => b.count)).toEqual([0, 2, 0, 0]);
    expect(barIndex(bars, "2026-10-16")).toBe(2);
    expect(barIndex(bars, "2026-10-20")).toBe(-1);
  });

  it("long goals group days so the rail stays readable", () => {
    expect(bucketSize(152)).toBe(1);
    expect(bucketSize(400)).toBe(2);
    const bars = railBars("2026-01-01", "2027-02-04", [{ day: "2026-01-02", count: 1 }, { day: "2026-01-01", count: 1 }]);
    expect(bars[0]).toEqual({ from: "2026-01-01", to: "2026-01-02", count: 2 });
    expect(bars.at(-1)!.to).toBe("2027-02-04");
  });

  it("labels each month once, with the year when it changes", () => {
    const ticks = monthTicks(railBars("2026-12-30", "2027-01-02", []));
    expect(ticks).toEqual([{ index: 0, label: "Dec" }, { index: 2, label: "Jan 2027" }]);
  });
});
