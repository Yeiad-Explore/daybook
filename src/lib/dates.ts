import { addDays, format, parseISO } from "date-fns";

// Calendar dates are "YYYY-MM-DD" strings already in the owner's timezone (TODAY-1), so no
// timezone maths happens here.

export function addDaysTo(day: string, days: number): string {
  return format(addDays(parseISO(day), days), "yyyy-MM-dd");
}

/** "Wed 14 Oct 2026": the full date shown on hover and read to screen readers (PRD §7.5). */
export function longDate(day: string): string {
  return format(parseISO(day), "EEE d MMM yyyy");
}

/** "15 Nov", or "31 Jan 2027" outside the current year (PRD §7.5, same as the database's fmt_day). */
export function shortDate(day: string, today: string): string {
  return format(parseISO(day), day.slice(0, 4) === today.slice(0, 4) ? "d MMM" : "d MMM yyyy");
}

/** DL-6 quick picks. "Pick a date" is the date field next to them. */
export function quickPicks(today: string) {
  return [
    { label: "Tomorrow", date: addDaysTo(today, 1) },
    { label: "+3 days", date: addDaysTo(today, 3) },
    { label: "Next week", date: addDaysTo(today, 7) },
  ];
}
