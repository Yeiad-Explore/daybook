import { differenceInCalendarDays, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { addDaysTo } from "@/lib/dates";

export type RailRange = "all" | "month" | "week";

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const clamp = (day: string, from: string, to: string) => (day < from ? from : day > to ? to : day);

/** The days the Deadline Rail shows: the whole goal, or today's month / week inside it (DESIGN.md zoom). */
export function railWindow(range: RailRange, start: string, deadline: string, today: string, weekStartsOn: number) {
  if (range === "all" || today < start || today > deadline) return { from: start, to: deadline };
  const t = parseISO(today);
  const ws = weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const [from, to] = range === "month" ? [startOfMonth(t), endOfMonth(t)] : [startOfWeek(t, { weekStartsOn: ws }), endOfWeek(t, { weekStartsOn: ws })];
  return { from: clamp(iso(from), start, deadline), to: clamp(iso(to), start, deadline) };
}

/** DESIGN.md: one bar per day; on long ranges one bar per 2–3 days so bars keep their 1px + 3px rhythm. */
export function bucketSize(days: number) {
  return Math.max(1, Math.ceil(days / 240));
}

export type RailBar = { from: string; to: string; count: number };

/** Bars for the window: each covers `bucketSize` days and counts the tasks due in them. */
export function railBars(from: string, to: string, dueCounts: { day: string; count: number }[]): RailBar[] {
  const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
  const size = bucketSize(days);
  const counts = new Map(dueCounts.map((c) => [c.day, c.count]));
  const bars: RailBar[] = [];
  for (let i = 0; i < days; i += size) {
    const barFrom = addDaysTo(from, i);
    const barTo = addDaysTo(from, Math.min(i + size, days) - 1);
    let count = 0;
    for (let d = barFrom; d <= barTo; d = addDaysTo(d, 1)) count += counts.get(d) ?? 0;
    bars.push({ from: barFrom, to: barTo, count });
  }
  return bars;
}

/** Index of the bar holding `day`, or -1 outside the window. */
export function barIndex(bars: RailBar[], day: string) {
  return bars.findIndex((b) => b.from <= day && day <= b.to);
}

/** Month labels: the first bar of each month in the window ("Nov"; "Jan 2027" when the year changes). */
export function monthTicks(bars: RailBar[]) {
  const ticks: { index: number; label: string }[] = [];
  let last = "";
  bars.forEach((b, index) => {
    const month = b.from.slice(0, 7);
    if (month === last) return;
    const changedYear = last !== "" && month.slice(0, 4) !== last.slice(0, 4);
    last = month;
    ticks.push({ index, label: format(parseISO(b.from), changedYear ? "MMM yyyy" : "MMM") });
  });
  return ticks;
}
