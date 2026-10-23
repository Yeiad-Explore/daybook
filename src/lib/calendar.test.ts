import { describe, expect, it } from "vitest";
import { dayViewUrl, describeLogEntry, parseCalendarStatus, type CalendarLogEntry } from "./calendar";

const entry = (over: Partial<CalendarLogEntry>): CalendarLogEntry => ({ at: "2026-10-16T10:00:00Z", kind: "time_block", title: "Gym", action: "create", outcome: "ok", http_status: null, reason: null, ...over });

describe("calendar helpers (GC-4, TB-3)", () => {
  it("reads a missing status as disconnected", () => {
    expect(parseCalendarStatus(null)).toEqual({ status: "disconnected" });
    expect(parseCalendarStatus({ status: "connected" }).status).toBe("connected");
  });
  it("links to Google Calendar's day view without leading zeros", () => {
    expect(dayViewUrl("2026-10-06")).toBe("https://calendar.google.com/calendar/u/0/r/day/2026/10/6");
  });
  it("describes a success and a failure in plain words", () => {
    expect(describeLogEntry(entry({}))).toBe("Added to calendar: Gym");
    expect(describeLogEntry(entry({ outcome: "failed" }))).toBe("Couldn't add to calendar: Gym");
    expect(describeLogEntry(entry({ action: "delete", outcome: "failed" }))).toBe("Couldn't remove from calendar: Gym");
  });
  it("keeps connection entries as they are, even when they failed", () => {
    expect(describeLogEntry(entry({ kind: "connection", title: null, action: "needs_reconnect", outcome: "failed" }))).toBe("Google asked for a new sign-in");
    expect(describeLogEntry(entry({ kind: "connection", title: null, action: "connect" }))).toBe("Connected Google Calendar");
  });
});
