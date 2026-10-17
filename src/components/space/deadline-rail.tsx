"use client";

import { scaleLinear } from "d3-scale";
import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cx } from "@/lib/cx";
import { longDate, shortDate } from "@/lib/dates";
import type { Milestone, SpaceSummary } from "@/lib/deadlines";
import { barIndex, monthTicks, railBars, railWindow, type RailRange } from "@/lib/rail";

const RANGES = [
  { value: "all", label: "All" },
  { value: "month", label: "This month" },
  { value: "week", label: "This week" },
] as const;

const STEP = 4; // DESIGN.md: 1px bar + 3px gap
const TOP = 28; // room for the "Today" pill and milestone nodes
const BARS = 56;
const HEIGHT = TOP + BARS + 26; // + month labels
const STATE_WORDS: Record<Milestone["state"], string> = { done: "done", late: "late", upcoming: "upcoming" };

type Hover = { x: number; title: string; detail: string } | null;

/**
 * DESIGN.md "Deadline Rail" (SPC-8): one 1px bar per day from the goal's start to its deadline, height
 * = tasks due that day; elapsed days ink-2, future ink-4; the lime "Today" pill over a 1.5px ink NOW
 * line; milestones as nodes (filled = done, hollow = upcoming, ember = late) with title and deadline
 * on hover or focus (AC4). Wider than its panel on phones, it scrolls inside it.
 */
export function DeadlineRail({ summary, weekStartsOn }: { summary: SpaceSummary; weekStartsOn: number }) {
  const [range, setRange] = useState<RailRange>("all");
  const [hover, setHover] = useState<Hover>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { start_date: start, deadline, today, milestones, due_counts } = summary;
  if (!start || !deadline) return null;

  const { from, to } = railWindow(range, start, deadline, today, weekStartsOn);
  const bars = railBars(from, to, due_counts);
  const step = Math.max(STEP, width / bars.length || STEP);
  const svgWidth = Math.max(width, bars.length * step);
  const x = (i: number) => i * step + step / 2;
  // Empty days are short stubs; days with tasks due rise from 24px to the full bar height.
  const due = scaleLinear().domain([1, Math.max(2, ...bars.map((b) => b.count))]).range([24, BARS]);
  const height = (count: number) => (count === 0 ? 8 : due(count));
  const now = barIndex(bars, today);
  const shown = milestones.filter((m) => barIndex(bars, m.due_date) >= 0);
  const next = milestones.filter((m) => !m.done).slice(0, 3);

  const describe = (m: Milestone) => `due ${shortDate(m.due_date, today)} · ${STATE_WORDS[m.state]}`;

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="type-heading flex items-center gap-2">
          <span aria-hidden className="size-2 rounded-pill bg-lime ring-1 ring-ink/20" />
          Deadline Rail
        </h2>
        <SegmentedControl label="Rail range" options={[...RANGES]} value={range} onChange={setRange} />
      </div>

      <div ref={box} className="relative overflow-x-auto overflow-y-hidden">
        <svg
          width={svgWidth || "100%"}
          height={HEIGHT}
          role="group"
          aria-label={`Tasks due each day from ${longDate(from)} to ${longDate(to)}`}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const i = Math.floor((e.clientX - rect.left) / step);
            const bar = bars[i];
            if (!bar) return setHover(null);
            const days = bar.from === bar.to ? shortDate(bar.from, today) : `${shortDate(bar.from, today)}–${shortDate(bar.to, today)}`;
            setHover({ x: x(i), title: days, detail: bar.count === 0 ? "nothing due" : `${bar.count} due` });
          }}
          onMouseLeave={() => setHover(null)}
        >
          {bars.map((bar, i) => {
            const h = height(bar.count);
            return (
              <rect
                key={bar.from}
                x={x(i) - 0.5}
                y={TOP + BARS - h}
                width={1}
                height={h}
                rx={0.5}
                className={bar.to < today ? "fill-ink-2" : "fill-ink-4"}
              />
            );
          })}

          {monthTicks(bars).map((t) => (
            <text key={t.index} x={x(t.index)} y={HEIGHT - 6} className="type-caption fill-ink-3-small">
              {t.label}
            </text>
          ))}

          {now >= 0 && (
            <g aria-hidden>
              <line x1={x(now)} x2={x(now)} y1={TOP - 4} y2={TOP + BARS + 4} strokeWidth={1.5} className="stroke-ink" />
              <rect x={x(now) - 21} y={2} width={42} height={18} rx={9} className="fill-lime" />
              <text x={x(now)} y={15} textAnchor="middle" className="type-caption fill-surface-dark-fixed font-medium">
                Today
              </text>
            </g>
          )}

          {shown.map((m) => {
            const i = barIndex(bars, m.due_date);
            const show = () => setHover({ x: x(i), title: m.title, detail: describe(m) });
            return (
              <g
                key={m.id}
                tabIndex={0}
                role="img"
                aria-label={`${m.title}, ${describe(m)}`}
                onMouseEnter={show}
                onFocus={show}
                onBlur={() => setHover(null)}
                className="cursor-default outline-none [&:focus-visible>circle:last-child]:stroke-[3]"
              >
                <circle cx={x(i)} cy={TOP + BARS - height(bars[i].count) - 8} r={10} className="fill-transparent" />
                <circle
                  cx={x(i)}
                  cy={TOP + BARS - height(bars[i].count) - 8}
                  r={4.5}
                  strokeWidth={1.5}
                  className={cx(
                    m.state === "done" && "fill-ink stroke-ink",
                    m.state === "upcoming" && "fill-surface stroke-ink",
                    m.state === "late" && "fill-signal stroke-signal",
                  )}
                />
              </g>
            );
          })}
        </svg>

        {hover && (
          <div
            role="tooltip"
            className="type-caption pointer-events-none absolute top-0 z-10 max-w-56 -translate-x-1/2 rounded-xs bg-surface px-2 py-1 text-ink shadow-float"
            style={{ left: Math.min(Math.max(hover.x, 60), (svgWidth || 120) - 60) }}
          >
            <span className="font-medium">{hover.title}</span> · {hover.detail}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="type-body-sm min-w-0 truncate text-ink-2">
          {next.length === 0
            ? "No milestones ahead."
            : next.map((m, i) => (
                <span key={m.id}>
                  {i > 0 && " · "}
                  <span className={cx(m.state === "late" && "text-signal-ink")}>{m.title}</span>{" "}
                  <span className="type-number">{m.state === "late" ? "late" : shortDate(m.due_date, today)}</span>
                </span>
              ))}
        </p>
        <p className="type-number shrink-0">
          <span className="type-caption text-ink-3-small">Deadline </span>
          <time dateTime={deadline} title={longDate(deadline)}>
            {shortDate(deadline, today)}
          </time>
        </p>
      </div>
    </Panel>
  );
}
