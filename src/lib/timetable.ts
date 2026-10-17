import { TZDate } from "@date-fns/tz";

// Day Timetable maths (PRD §5.3 item 4, TB-6): hour ruler 06:00–24:00, slots at their real times,
// overlapping slots side by side.
export const DAY_START = 6 * 60;
export const DAY_END = 24 * 60;

/** Minutes after local midnight for an instant, in the owner's timezone (NFR-6). */
export function minutesOfDay(iso: string | Date, timezone: string): number {
  const d = new TZDate(new Date(iso), timezone);
  return d.getHours() * 60 + d.getMinutes();
}

export type Placed<T> = T & {
  /** Minutes clipped to the ruler. */
  from: number;
  to: number;
  lane: number;
  lanes: number;
  overlaps: boolean;
};

/**
 * Places slots on the ruler. Slots that overlap in time share a cluster and sit in lanes side by side;
 * a cluster's width is split by its widest moment (the most lanes it needs).
 */
export function layoutSlots<T extends { startMin: number; endMin: number }>(slots: T[]): Placed<T>[] {
  const visible = slots
    .map((s) => ({ ...s, from: Math.max(s.startMin, DAY_START), to: Math.min(s.endMin, DAY_END) }))
    .filter((s) => s.to > s.from)
    .sort((a, b) => a.from - b.from || a.to - b.to);

  const placed: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let clusterEnd = -1;
  const close = () => {
    const lanes = Math.max(1, ...cluster.map((s) => s.lane + 1));
    for (const s of cluster) {
      s.lanes = lanes;
      s.overlaps = lanes > 1;
    }
    placed.push(...cluster);
    cluster = [];
  };

  for (const s of visible) {
    if (s.from >= clusterEnd && cluster.length) close();
    const taken = new Set(cluster.filter((c) => c.to > s.from).map((c) => c.lane));
    let lane = 0;
    while (taken.has(lane)) lane += 1;
    cluster.push({ ...s, lane, lanes: 1, overlaps: false });
    clusterEnd = Math.max(clusterEnd, s.to);
  }
  if (cluster.length) close();
  return placed;
}

/** "06:00" ruler labels, one per hour. */
export const HOURS = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START / 60 + i);
