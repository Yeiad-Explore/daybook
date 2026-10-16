import { describe, expect, it } from "vitest";
import { deadlineTag } from "./deadline-tag";

const today = "2026-10-16"; // PRD §12 fixture date

const tag = (due: string, extra: Partial<Parameters<typeof deadlineTag>[0]> = {}) =>
  deadlineTag({ due, done: false, today, ...extra });

describe("deadlineTag (PRD §7.5 UI contract)", () => {
  it("done: the original date, struck through by the component", () => {
    expect(tag("2026-10-14", { done: true })).toMatchObject({ text: "14 Oct", state: "done" });
  });

  it("late: 'Nd late'", () => {
    expect(tag("2026-10-14")).toMatchObject({ text: "2d late", state: "late" });
    expect(tag("2026-10-15")).toMatchObject({ text: "1d late", state: "late" });
  });

  it("today: 'today', plus the time when set", () => {
    expect(tag("2026-10-16")).toMatchObject({ text: "today", state: "today" });
    expect(tag("2026-10-16", { dueTime: "18:00:00" })).toMatchObject({ text: "today 18:00", state: "today" });
  });

  it("tomorrow: 'tomorrow'", () => {
    expect(tag("2026-10-17")).toMatchObject({ text: "tomorrow", state: "soon" });
  });

  it("2–6 days: 'in Nd'", () => {
    expect(tag("2026-10-18")).toMatchObject({ text: "in 2d", state: "soon" });
    expect(tag("2026-10-19")).toMatchObject({ text: "in 3d", state: "soon" });
    expect(tag("2026-10-22")).toMatchObject({ text: "in 6d", state: "soon" });
  });

  it("otherwise: the date, with the year only when it is not this year", () => {
    expect(tag("2026-10-23")).toMatchObject({ text: "23 Oct", state: "future" });
    expect(tag("2026-10-25")).toMatchObject({ text: "25 Oct", state: "future" });
    expect(tag("2027-01-31")).toMatchObject({ text: "31 Jan 2027", state: "future" });
  });

  it("counts calendar days across a year boundary", () => {
    expect(tag("2027-01-02", { today: "2026-12-30" })).toMatchObject({ text: "in 3d" });
    expect(tag("2026-12-28", { today: "2027-01-02" })).toMatchObject({ text: "5d late" });
  });

  it("a done task from another year shows the year", () => {
    expect(tag("2025-12-31", { done: true })).toMatchObject({ text: "31 Dec 2025", state: "done" });
  });

  it("always offers the full date for hover ('Wed 14 Oct 2026')", () => {
    expect(tag("2026-10-14").full).toBe("Wed 14 Oct 2026");
    expect(tag("2027-01-31").full).toBe("Sun 31 Jan 2027");
  });
});
