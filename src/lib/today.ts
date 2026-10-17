import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays, format, parseISO } from "date-fns";

/** The owner's local date ("YYYY-MM-DD") in their profile timezone (TODAY-1, NFR-6). */
export function todayIn(timezone: string, now: Date = new Date()): string {
  return format(new TZDate(now, timezone), "yyyy-MM-dd");
}

/** SPC-6: days from today to the deadline; the deadline day is 0, past deadlines are negative. */
export function daysLeft(deadline: string, today: string): number {
  return differenceInCalendarDays(parseISO(deadline), parseISO(today));
}
