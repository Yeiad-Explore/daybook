"use client";

import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { blockHref, type TodaySlot } from "@/lib/deadlines";
import { DAY_START, HOURS, layoutSlots, minutesOfDay } from "@/lib/timetable";

const HOUR_PX = 36;
const LABEL_W = 44; // px: hour labels

const SYNC: Record<TodaySlot["sync_status"], string> = {
  not_synced: "Not on calendar",
  pending: "Syncing",
  synced: "On calendar",
  failed: "Sync failed",
  delete_pending: "Syncing",
};

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * PRD §5.3 item 4, DESIGN.md "Time slot and Day Timetable": hour ruler 06:00–24:00, today's slots at
 * their real times with a 3px edge in the space's aura, overlapping slots side by side with an
 * "Overlaps" note, a NOW line with a lime pill, and the list of slots with their calendar status below.
 */
export function DayTimetable({ slots, timezone }: { slots: TodaySlot[]; timezone: string }) {
  // The clock is read after mount: the server's "now" would not match the browser's at hydration.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(minutesOfDay(new Date(), timezone));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [timezone]);

  const placed = layoutSlots(slots.map((s) => ({ ...s, startMin: minutesOfDay(s.starts_at, timezone), endMin: minutesOfDay(s.ends_at, timezone) })));
  const overlapping = new Set(placed.filter((p) => p.overlaps).map((p) => p.id));
  const y = (minutes: number) => ((minutes - DAY_START) / 60) * HOUR_PX;
  const local = (iso: string) => format(new TZDate(new Date(iso), timezone), "HH:mm");

  return (
    <Panel className="flex flex-col gap-4 p-5" aria-label="Day Timetable">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="type-heading">Day timetable</h2>
        <p className="type-caption text-ink-3-small">06:00 to 24:00</p>
      </div>

      <div role="img" aria-label={`Today's timetable: ${slots.length === 0 ? "no slots" : `${slots.length} ${slots.length === 1 ? "slot" : "slots"}, listed below`}`} className="relative rounded-md bg-canvas" style={{ height: (HOURS.length - 1) * HOUR_PX + 20 }}>
        {HOURS.map((h) => (
          <div key={h} className="absolute inset-x-0" style={{ top: y(h * 60) + 10 }}>
            <span className="type-caption absolute -top-2 left-2 w-9 text-right text-ink-3-small">{h === 24 ? "24:00" : `${String(h).padStart(2, "0")}:00`}</span>
            <div className="ml-14 border-t border-hairline" />
          </div>
        ))}
        <div className="absolute inset-y-0 right-2" style={{ left: LABEL_W + 20 }}>
          {placed.map((p) => (
            <div
              key={p.id}
              data-mark={p.mark}
              aria-hidden
              className="absolute overflow-hidden rounded-md border-l-[3px] border-aura-mid bg-surface px-2 py-1 shadow-card"
              style={{ top: y(p.from) + 10, height: Math.max(22, y(p.to) - y(p.from) - 2), left: `${(p.lane / p.lanes) * 100}%`, width: `calc(${100 / p.lanes}% - 3px)` }}
            >
              <p className="type-caption truncate font-medium text-ink">{p.title}</p>
              {p.to - p.from >= 60 && <p className="type-caption truncate text-ink-3-small">{`${hhmm(p.startMin)} to ${hhmm(p.endMin)}`}</p>}
            </div>
          ))}
          {now !== null && now >= DAY_START && (
            <div className="absolute inset-x-0 z-10" style={{ top: y(now) + 10 }} role="presentation">
              <div className="h-[1.5px] bg-ink" />
              <span className="type-number absolute -top-2.5 right-0 rounded-pill bg-lime px-2 py-0.5 text-[11px] text-surface-dark-fixed">NOW {hhmm(now)}</span>
            </div>
          )}
        </div>
      </div>

      {slots.length === 0 ? (
        <p className="type-body-sm text-ink-2">No time booked today. Add a slot in a Time block.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {slots.map((s) => (
            <li key={s.id} className="flex flex-col gap-1 py-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="type-number text-ink-2">
                  {local(s.starts_at)} to {local(s.ends_at)}
                </span>
                {overlapping.has(s.id) && <Tag>Overlaps</Tag>}
                <Tag variant="outlined">{SYNC[s.sync_status]}</Tag>
              </div>
              <Link href={blockHref(s)} prefetch={false} className="type-body break-words underline-offset-4 hover:underline">
                {s.title}
              </Link>
              <p className="type-caption flex items-center gap-1.5 text-ink-3-small">
                <span aria-hidden data-mark={s.mark} className="size-2 rounded-pill bg-aura-mid" />
                {s.space_name}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
