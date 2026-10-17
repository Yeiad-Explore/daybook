import { differenceInCalendarDays, parseISO } from "date-fns";
import { longDate, shortDate } from "@/lib/dates";

export type DeadlineState = "done" | "late" | "today" | "soon" | "future";

/**
 * PRD §7.5 deadline tag text. Dates are calendar dates ("YYYY-MM-DD") already in the owner's
 * timezone; `today` is the owner's local date (profile timezone, TODAY-1), so no timezone maths here.
 */
export function deadlineTag({
  due,
  dueTime,
  done,
  today,
}: {
  due: string;
  dueTime?: string | null;
  done: boolean;
  today: string;
}): { text: string; state: DeadlineState; full: string } {
  const days = differenceInCalendarDays(parseISO(due), parseISO(today));
  const date = shortDate(due, today);
  const full = longDate(due);

  if (done) return { text: date, state: "done", full };
  if (days < 0) return { text: `${-days}d late`, state: "late", full };
  if (days === 0) return { text: dueTime ? `today ${dueTime.slice(0, 5)}` : "today", state: "today", full };
  if (days === 1) return { text: "tomorrow", state: "soon", full };
  if (days <= 6) return { text: `in ${days}d`, state: "soon", full };
  return { text: date, state: "future", full };
}
