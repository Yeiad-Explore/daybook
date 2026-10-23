import { describe, expect, it } from "vitest";
import { chartGeometry, entriesInRange, entriesToLog, metaLine, statusWords, trendTag, type Series } from "./tracker-logic";

const field = (over: Partial<Series["field"]> = {}): Series["field"] => ({ id: "f", block_id: "b", label: "Weight", unit: "kg", decimals: 1, target_value: null, target_kind: null, ...over });

describe("entriesInRange (TRK-3)", () => {
  const entries = [{ date: "2026-10-16", value: 3 }, { date: "2026-10-10", value: 2 }, { date: "2026-10-09", value: 1 }, { date: "2026-10-17", value: 9 }];
  it("keeps the last N days, today included, oldest first, and drops the future", () => {
    expect(entriesInRange(entries, 7, "2026-10-16").map((e) => e.date)).toEqual(["2026-10-10", "2026-10-16"]);
    expect(entriesInRange(entries, 8, "2026-10-16").map((e) => e.date)).toEqual(["2026-10-09", "2026-10-10", "2026-10-16"]);
  });
});

describe("wording (TRK-3)", () => {
  it("says on target / over / under in words", () => {
    expect(statusWords("on_target")).toBe("on target");
    expect(statusWords("over")).toBe("over target");
    expect(statusWords("under")).toBe("under target");
    expect(statusWords(null)).toBeNull();
  });
  it("formats the trend with direction and unit", () => {
    expect(trendTag(-1.2, "kg", 1)).toBe("↘ 1.2 kg");
    expect(trendTag(0.5, null, 1)).toBe("↗ 0.5");
    expect(trendTag(0, "kg", 1)).toBeNull();
    expect(trendTag(null, "kg", 1)).toBeNull();
  });
  it("shows average and target for at_most / at_least, the change otherwise", () => {
    const base = { entries: [], change: null, average_7d: 2033.33 };
    expect(metaLine({ ...base, field: field({ label: "Calories", unit: "kcal", decimals: 0, target_value: 2000, target_kind: "at_most" }), target_status: "over" }))
      .toBe("7-day average 2,033 kcal · target 2,000 kcal · over target");
    expect(metaLine({ ...base, field: field({ target_value: 72, target_kind: "reach" }), target_status: "over" })).toBe("over target · target 72.0 kg");
    expect(metaLine({ ...base, field: field(), change: -1.2, target_status: null, entries: Array.from({ length: 20 }, (_, i) => ({ date: String(i), value: i, note: null })) }))
      .toBe("↘ 1.2 kg over the last 14 entries");
    expect(metaLine({ ...base, field: field(), change: null, target_status: null })).toBe("Not enough entries for a trend yet");
  });
});

describe("chartGeometry (DESIGN.md Tracker chart)", () => {
  const entries = [{ date: "2026-10-10", value: 77.6 }, { date: "2026-10-13", value: 77.4 }, { date: "2026-10-16", value: 77.2 }];
  it("places the newest entry at the right edge and the oldest by its day", () => {
    const g = chartGeometry(entries, 7, "2026-10-16", 600, 200, null);
    expect(g.points).toHaveLength(3);
    expect(g.points[0].x).toBeCloseTo(8, 5);
    expect(g.points[2].x).toBeCloseTo(592, 5);
    expect(g.points[0].y).toBeLessThan(g.points[2].y); // 77.6 is higher on screen than 77.2
    expect(g.line.startsWith("M")).toBe(true);
    expect(g.band.endsWith("Z")).toBe(true);
    expect(g.targetY).toBeNull();
  });
  it("includes the target in the vertical range so the dashed line is always visible", () => {
    const g = chartGeometry(entries, 7, "2026-10-16", 600, 200, 72);
    expect(g.targetY).not.toBeNull();
    expect(g.targetY!).toBeGreaterThan(g.points[2].y);
    expect(g.targetY!).toBeLessThanOrEqual(g.baseline);
  });
  it("copes with one entry, none, and a flat series", () => {
    expect(chartGeometry([entries[0]], 30, "2026-10-16", 600, 200, null).band).toBe("");
    expect(chartGeometry([], 30, "2026-10-16", 600, 200, null).points).toEqual([]);
    const flat = chartGeometry([{ date: "2026-10-15", value: 5 }, { date: "2026-10-16", value: 5 }], 7, "2026-10-16", 600, 200, null);
    expect(Number.isFinite(flat.points[0].y)).toBe(true);
  });
  it("labels the first, middle and last day", () => {
    expect(chartGeometry(entries, 7, "2026-10-16", 600, 200, null).xTicks.map((t) => t.date)).toEqual(["2026-10-10", "2026-10-13", "2026-10-16"]);
  });
});

describe("entriesToLog (TRK-2)", () => {
  it("refuses a decimal comma instead of logging 772 for 77,2", () => {
    expect(entriesToLog([{ id: "w", label: "Weight" }], () => "77,2", "b", "2026-10-16")).toEqual({ error: "Weight: enter a number, like 77.2." });
  });
  const fields = [{ id: "w", label: "Weight" }, { id: "c", label: "Calories" }];
  it("keeps only the fields with a number typed, so empty inputs write and clear nothing", () => {
    expect(entriesToLog(fields, (id) => ({ w: "77.2", c: "  " })[id as "w" | "c"], "b", "2026-10-16")).toEqual({ rows: [{ field_id: "w", block_id: "b", entry_date: "2026-10-16", value: 77.2 }] });
  });
  it("accepts thousands separators", () => {
    expect(entriesToLog(fields, (id) => (id === "c" ? "1,850" : ""), "b", "d")).toEqual({ rows: [{ field_id: "c", block_id: "b", entry_date: "d", value: 1850 }] });
  });
  it("refuses a value that is not a number, and a form with nothing in it", () => {
    expect(entriesToLog(fields, (id) => (id === "w" ? "heavy" : ""), "b", "d")).toEqual({ error: "Weight: enter a number, like 77.2." });
    expect(entriesToLog(fields, () => "", "b", "d")).toEqual({ error: "Enter at least one value to log." });
  });
});
