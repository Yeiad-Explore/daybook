import { differenceInCalendarDays, parseISO } from "date-fns";
import { scaleLinear } from "d3-scale";
import { addDaysTo } from "@/lib/dates";
import type { Enums } from "@/lib/database.types";
import { formatNumber, readNumber } from "@/lib/money";

// Tracker maths shared by the block, the chart and Today's Trackers card (TRK-2, TRK-3).

export type TargetKind = Enums<"target_kind">;
export type Entry = { date: string; value: number };
export type TargetStatus = "on_target" | "over" | "under" | null;
export type Range = 7 | 30 | 90;
export const RANGES: { value: `${Range}`; label: string }[] = [
  { value: "7", label: "7D" },
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
];

/** What `tracker_series(field, 90)` returns (PRD §10.7). */
export type Series = {
  field: { id: string; block_id: string; label: string; unit: string | null; decimals: number; target_value: number | null; target_kind: TargetKind | null };
  entries: (Entry & { note: string | null })[];
  latest: Entry | null;
  average_7d: number | null;
  change: number | null;
  target_status: TargetStatus;
  logging_streak: number;
};

/** The entries inside the last `days` days, today included (TRK-3). */
export function entriesInRange(entries: Entry[], days: number, today: string): Entry[] {
  const from = addDaysTo(today, -(days - 1));
  return entries.filter((e) => e.date >= from && e.date <= today).sort((a, b) => a.date.localeCompare(b.date));
}

/** "on target", "over target" or "under target": words as well as colour (DESIGN.md). */
export function statusWords(status: TargetStatus): string | null {
  return status === "on_target" ? "on target" : status === "over" ? "over target" : status === "under" ? "under target" : null;
}

/** "↗ 1.2 kg" / "↘ 1.2 kg" for a change; null when nothing moved or there is nothing to compare. */
export function trendTag(change: number | null, unit: string | null, decimals: number): string | null {
  if (change === null || Math.abs(change) < 10 ** -decimals / 2) return null;
  return `${change > 0 ? "↗" : "↘"} ${formatNumber(Math.abs(change), decimals)}${unit ? ` ${unit}` : ""}`;
}

/** The meta line under the current value (TRK-3): average and target when there is one, else the change. */
export function metaLine(s: Pick<Series, "field" | "average_7d" | "change" | "target_status" | "entries">): string {
  const { field } = s;
  const unit = field.unit ? ` ${field.unit}` : "";
  if (field.target_value !== null && field.target_kind) {
    const target = `target ${formatNumber(field.target_value, field.decimals)}${unit}`;
    if (field.target_kind === "reach") return [s.target_status ? statusWords(s.target_status) : null, target].filter(Boolean).join(" · ");
    return s.average_7d === null
      ? target
      : [`7-day average ${formatNumber(s.average_7d, field.decimals)}${unit}`, target, statusWords(s.target_status)].filter(Boolean).join(" · ");
  }
  const tag = trendTag(s.change, field.unit, field.decimals);
  return tag ? `${tag} over the last ${Math.min(14, s.entries.length)} entries` : "Not enough entries for a trend yet";
}

export type ChartGeometry = {
  points: { x: number; y: number; date: string; value: number }[];
  line: string;
  /** The closed outline under the line, to fill with the hatch pattern. */
  band: string;
  targetY: number | null;
  yTicks: { y: number; value: number }[];
  xTicks: { x: number; date: string }[];
  baseline: number;
};

const PAD = { left: 8, right: 8, top: 28, bottom: 24 };

/** SVG geometry for the tracker chart (DESIGN.md "Tracker chart"): a line over `days` days ending today, with an optional target line. */
export function chartGeometry(entries: Entry[], days: number, today: string, width: number, height: number, target: number | null): ChartGeometry {
  const start = addDaysTo(today, -(days - 1));
  const x = scaleLinear().domain([0, Math.max(1, days - 1)]).range([PAD.left, width - PAD.right]);
  const values = [...entries.map((e) => e.value), ...(target === null ? [] : [target])];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (!Number.isFinite(lo)) [lo, hi] = [0, 1];
  if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
  const pad = (hi - lo) * 0.12;
  const baseline = height - PAD.bottom;
  const y = scaleLinear().domain([lo - pad, hi + pad]).range([baseline, PAD.top]);

  const points = entries.map((e) => ({ x: x(differenceInCalendarDays(parseISO(e.date), parseISO(start))), y: y(e.value), date: e.date, value: e.value }));
  const line = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const band = points.length > 1 ? `${line} L${points.at(-1)!.x.toFixed(1)} ${baseline} L${points[0].x.toFixed(1)} ${baseline} Z` : "";
  const yTicks = y.ticks(3).map((value) => ({ y: y(value), value }));
  const xTicks = [0, Math.round((days - 1) / 2), days - 1].map((i) => ({ x: x(i), date: addDaysTo(start, i) }));
  return { points, line, band, targetY: target === null ? null : y(target), yTicks, xTicks, baseline };
}

export type EntryRow = { field_id: string; block_id: string; entry_date: string; value: number };

/**
 * The entries to upsert from a log form (TRK-2): one per field with a number typed. Empty inputs are
 * skipped, so they neither create nor clear an entry (AC2). Returns the first message when a value is not a number.
 */
export function entriesToLog(
  fields: { id: string; label: string }[],
  typed: (fieldId: string) => string,
  blockId: string,
  date: string,
): { rows: EntryRow[] } | { error: string } {
  const rows: EntryRow[] = [];
  for (const f of fields) {
    const text = typed(f.id).trim();
    if (text === "") continue;
    const value = readNumber(text);
    if (value === null) return { error: `${f.label}: enter a number, like 77.2.` };
    rows.push({ field_id: f.id, block_id: blockId, entry_date: date, value });
  }
  return rows.length === 0 ? { error: "Enter at least one value to log." } : { rows };
}
