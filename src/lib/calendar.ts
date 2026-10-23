import type { Enums } from "@/lib/database.types";

/** What get_calendar_status() returns (PRD §10.7); google_connections itself is closed to the browser. */
export type CalendarStatus = {
  status: Enums<"connection_status">;
  google_email?: string;
  calendar_id?: string;
  push_deadlines?: boolean;
  auto_sync_new_blocks?: boolean;
  last_success_at?: string | null;
  last_error?: string | null;
  failed_syncs?: number;
  waiting_syncs?: number;
};

/** One line of get_calendar_log() (the sync log on /settings/calendar). */
export type CalendarLogEntry = {
  at: string;
  kind: "time_block" | "task" | "connection";
  title: string | null;
  action: "create" | "update" | "delete" | "recreate" | "adopt" | "connect" | "disconnect" | "needs_reconnect";
  outcome: "ok" | "failed" | "skipped";
  http_status: number | null;
  reason: string | null;
};

export const parseCalendarStatus = (data: unknown): CalendarStatus => (data as CalendarStatus | null) ?? { status: "disconnected" };

/** Google Calendar's day view for a local date ("yyyy-MM-dd"): where the "On calendar" tag takes the owner. */
export function dayViewUrl(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `https://calendar.google.com/calendar/u/0/r/day/${y}/${m}/${d}`;
}

const ACTION_WORDS: Record<CalendarLogEntry["action"], string> = {
  create: "Added to calendar",
  update: "Updated on calendar",
  recreate: "Added again (it had been deleted in Google)",
  adopt: "Matched an event already on the calendar",
  delete: "Removed from calendar",
  connect: "Connected Google Calendar",
  disconnect: "Disconnected Google Calendar",
  needs_reconnect: "Google asked for a new sign-in",
};

const FAILED_WORDS: Partial<Record<CalendarLogEntry["action"], string>> = {
  create: "Couldn't add to calendar",
  update: "Couldn't update on calendar",
  recreate: "Couldn't add again",
  adopt: "Couldn't match an existing event",
  delete: "Couldn't remove from calendar",
};

/** One plain line for the sync log: what was tried, and for a failure that it did not work (the reason follows on its own line). */
export function describeLogEntry(e: CalendarLogEntry): string {
  const words = (e.outcome === "failed" && FAILED_WORDS[e.action]) || ACTION_WORDS[e.action];
  return `${words}${e.title ? `: ${e.title}` : ""}`;
}
