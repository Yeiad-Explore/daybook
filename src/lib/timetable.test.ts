import { describe, expect, it } from "vitest";
import { layoutSlots, minutesOfDay } from "./timetable";

const slot = (id: string, from: string, to: string) => {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return { id, startMin: m(from), endMin: m(to) };
};

describe("minutesOfDay (NFR-6)", () => {
  it("reads the clock in the owner's timezone, not the browser's", () => {
    expect(minutesOfDay("2026-10-16T14:00:00Z", "Asia/Dhaka")).toBe(20 * 60); // 20:00 in Dhaka (UTC+6)
    expect(minutesOfDay("2026-10-16T18:10:00Z", "Asia/Dhaka")).toBe(10); // 00:10 the next day
  });
});

describe("layoutSlots (TB-6: overlapping slots sit side by side)", () => {
  it("gives separate slots a full-width lane each", () => {
    const [a, b] = layoutSlots([slot("a", "08:00", "09:00"), slot("b", "09:00", "10:00")]);
    expect([a.lanes, b.lanes, a.overlaps, b.overlaps]).toEqual([1, 1, false, false]);
  });
  it("puts overlapping slots in lanes and marks them", () => {
    const placed = layoutSlots([slot("a", "08:00", "10:00"), slot("b", "09:00", "11:00"), slot("c", "10:00", "10:30")]);
    const by = Object.fromEntries(placed.map((p) => [p.id, p]));
    expect([by.a.lane, by.b.lane, by.c.lane]).toEqual([0, 1, 0]); // c reuses a's lane once a has ended
    expect(placed.every((p) => p.lanes === 2 && p.overlaps)).toBe(true);
  });
  it("keeps clusters independent", () => {
    const placed = layoutSlots([slot("a", "08:00", "09:00"), slot("b", "08:30", "09:30"), slot("c", "12:00", "13:00")]);
    expect(placed.find((p) => p.id === "c")).toMatchObject({ lanes: 1, overlaps: false });
    expect(placed.find((p) => p.id === "a")).toMatchObject({ lanes: 2, overlaps: true });
  });
  it("clips to the 06:00 to 24:00 ruler and drops slots entirely outside it", () => {
    const placed = layoutSlots([slot("early", "05:00", "07:00"), slot("night", "03:00", "05:30")]);
    expect(placed.map((p) => [p.id, p.from, p.to])).toEqual([["early", 360, 420]]);
  });
});
