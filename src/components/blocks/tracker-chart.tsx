"use client";

import { useId } from "react";
import { shortDate } from "@/lib/dates";
import { formatNumber } from "@/lib/money";
import { chartGeometry, type Entry, type Series } from "@/lib/tracker-logic";

const W = 600;
const H = 190;

/**
 * DESIGN.md "Tracker chart": a 1.5px line over circular nodes, a diagonally hatched band under it, a
 * dashed target line with its caption, and a white value bubble on the latest point. Hand-built SVG
 * (ADR 0001); the scales come from d3-scale. Labels use ink-3-small, never ink-3 (AA, DESIGN.md v2.1).
 */
export function TrackerChart({ field, entries, days, today }: { field: Series["field"]; entries: Entry[]; days: number; today: string }) {
  const hatch = useId();
  const g = chartGeometry(entries, days, today, W, H, field.target_value);
  const fmt = (v: number) => formatNumber(v, field.decimals);
  const last = g.points.at(-1);
  const summary = last ? `${field.label}, last ${days} days: ${entries.length} entries, latest ${fmt(last.value)}${field.unit ? ` ${field.unit}` : ""}` : `${field.label}: no entries in the last ${days} days`;

  if (!last) return <p className="type-body-sm rounded-md bg-surface px-4 py-8 text-center text-ink-2">No entries in the last {days} days yet.</p>;

  const bubbleX = Math.min(Math.max(last.x, 34), W - 34);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full overflow-visible">
      <defs>
        <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" className="stroke-ink-4" strokeWidth="1" />
        </pattern>
      </defs>

      {g.yTicks.map((t) => (
        <g key={t.value}>
          <line x1="0" x2={W} y1={t.y} y2={t.y} className="stroke-hairline" strokeWidth="1" />
          <text x="8" y={t.y - 4} className="fill-ink-3-small" fontSize="11">
            {fmt(t.value)}
          </text>
        </g>
      ))}

      {g.band && <path d={g.band} fill={`url(#${hatch})`} opacity="0.55" />}

      {g.targetY !== null && (
        <g>
          <line x1="0" x2={W} y1={g.targetY} y2={g.targetY} className="stroke-ink-3" strokeWidth="1" strokeDasharray="5 5" />
          <text x={W - 4} y={g.targetY - 5} textAnchor="end" className="fill-ink-3-small" fontSize="11">
            target {fmt(field.target_value!)}
          </text>
        </g>
      )}

      <path d={g.line} fill="none" className="stroke-ink" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {g.points.map((p, i) => (i === g.points.length - 1 || g.points.length <= 31) && (
        <circle key={p.date} cx={p.x} cy={p.y} r="3" className="fill-surface stroke-ink" strokeWidth="1.5">
          <title>{`${shortDate(p.date, today)}: ${fmt(p.value)}${field.unit ? ` ${field.unit}` : ""}`}</title>
        </circle>
      ))}

      <g>
        <rect x={bubbleX - 28} y={last.y - 30} width="56" height="22" rx="6" className="fill-surface stroke-hairline-strong" />
        <text x={bubbleX} y={last.y - 15} textAnchor="middle" className="fill-ink" fontSize="12" fontWeight="500">
          {fmt(last.value)}
        </text>
      </g>

      {g.xTicks.map((t, i) => (
        <text key={t.date} x={t.x} y={H - 6} textAnchor={i === 0 ? "start" : i === g.xTicks.length - 1 ? "end" : "middle"} className="fill-ink-3-small" fontSize="11">
          {shortDate(t.date, today)}
        </text>
      ))}
    </svg>
  );
}
