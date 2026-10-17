import { describe, expect, it } from "vitest";
import { daysLeft, todayIn, zonedInstant } from "./today";

describe("todayIn (TODAY-1: today in the profile timezone)", () => {
  it("uses the owner's local date, not UTC", () => {
    const instant = new Date("2026-10-16T19:30:00Z"); // 01:30 on 17 Oct in Dhaka (UTC+6)
    expect(todayIn("Asia/Dhaka", instant)).toBe("2026-10-17");
    expect(todayIn("UTC", instant)).toBe("2026-10-16");
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-10-16");
  });

  it("flips exactly at local midnight", () => {
    expect(todayIn("Asia/Dhaka", new Date("2026-10-16T17:59:59Z"))).toBe("2026-10-16");
    expect(todayIn("Asia/Dhaka", new Date("2026-10-16T18:00:00Z"))).toBe("2026-10-17");
  });
});

describe("daysLeft (SPC-6 countdown)", () => {
  it("SPC-6 AC1: today 16 Oct 2026, deadline 31 Jan 2027 → 107", () => {
    expect(daysLeft("2027-01-31", "2026-10-16")).toBe(107);
  });

  it("the deadline day counts as 0 and past deadlines are negative", () => {
    expect(daysLeft("2026-10-16", "2026-10-16")).toBe(0);
    expect(daysLeft("2026-10-14", "2026-10-16")).toBe(-2);
  });
});

describe("zonedInstant (NFR-6)", () => {
  it("reads a local Dhaka time as the right instant (UTC+6)", () => {
    expect(new Date(zonedInstant("2026-10-16", "Asia/Dhaka", "20:00")).toISOString()).toBe("2026-10-16T14:00:00.000Z");
    expect(new Date(zonedInstant("2026-10-16", "Asia/Dhaka")).toISOString()).toBe("2026-10-15T18:00:00.000Z"); // local midnight
  });
});
