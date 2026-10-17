import { describe, expect, it } from "vitest";
import { addDaysTo, longDate, quickPicks, shortDate } from "./dates";
import { errorMessage, SAVE_FAILED } from "./db-error";

describe("quickPicks (DL-6)", () => {
  it("offers tomorrow, +3 days and next week from the owner's today", () => {
    expect(quickPicks("2026-10-16")).toEqual([
      { label: "Tomorrow", date: "2026-10-17" },
      { label: "+3 days", date: "2026-10-19" },
      { label: "Next week", date: "2026-10-23" },
    ]);
  });

  it("crosses month and year ends", () => {
    expect(addDaysTo("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("date labels (PRD §7.5)", () => {
  it("drops the year inside the current year and keeps it outside", () => {
    expect(shortDate("2026-11-15", "2026-10-16")).toBe("15 Nov");
    expect(shortDate("2027-01-31", "2026-10-16")).toBe("31 Jan 2027");
  });

  it("gives the full date for hover", () => {
    expect(longDate("2026-10-14")).toBe("Wed 14 Oct 2026");
  });
});

describe("errorMessage", () => {
  it("shows the database's words for rule errors", () => {
    const rule = { code: "23514", message: "That deadline is after the goal ends (31 Jan 2027). Pick an earlier date." };
    expect(errorMessage(rule)).toBe(rule.message);
  });

  it("hides anything else behind a plain retry message", () => {
    expect(errorMessage({ code: "08006", message: "connection failure at 10.0.0.1" })).toBe(SAVE_FAILED);
    expect(errorMessage(new TypeError("Failed to fetch"))).toBe(SAVE_FAILED);
  });
});
