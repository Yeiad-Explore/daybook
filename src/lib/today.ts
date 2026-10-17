import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays, format, parseISO } from "date-fns";

/** The owner's local date ("YYYY-MM-DD") in their profile timezone (TODAY-1, NFR-6). */
export function todayIn(timezone: string, now: Date = new Date()): string {
  return format(new TZDate(now, timezone), "yyyy-MM-dd");
}

/** A local day and time ("YYYY-MM-DD", "HH:mm") in the owner's timezone, as an ISO instant (NFR-6). */
export function zonedInstant(day: string, timezone: string, time = "00:00"): string {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new TZDate(y, m - 1, d, h, min, timezone).toISOString();
}

/** SPC-6: days from today to the deadline; the deadline day is 0, past deadlines are negative. */
export function daysLeft(deadline: string, today: string): number {
  return differenceInCalendarDays(parseISO(deadline), parseISO(today));
}
