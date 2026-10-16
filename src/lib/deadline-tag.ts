import { differenceInCalendarDays, format, parseISO } from "date-fns";

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
  const dueDate = parseISO(due);
  const days = differenceInCalendarDays(dueDate, parseISO(today));
  const sameYear = due.slice(0, 4) === today.slice(0, 4);
  const date = format(dueDate, sameYear ? "d MMM" : "d MMM yyyy");
  const full = format(dueDate, "EEE d MMM yyyy");

  if (done) return { text: date, state: "done", full };
  if (days < 0) return { text: `${-days}d late`, state: "late", full };
  if (days === 0) return { text: dueTime ? `today ${dueTime.slice(0, 5)}` : "today", state: "today", full };
  if (days === 1) return { text: "tomorrow", state: "soon", full };
  if (days <= 6) return { text: `in ${days}d`, state: "soon", full };
  return { text: date, state: "future", full };
}
