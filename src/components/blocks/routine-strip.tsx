import { getDay, parseISO } from "date-fns";
import { cx } from "@/lib/cx";
import { longDate } from "@/lib/dates";
import type { RoutineStreak } from "@/lib/space-page";

type State = RoutineStreak["history"][number]["state"];

const LOOK: Record<State, string> = {
  complete: "bg-ink",
  partial: "bg-ink-4",
  missed: "border border-ink-3 bg-transparent",
  not_scheduled: "bg-canvas-2 ring-1 ring-inset ring-hairline",
  open: "bg-lime ring-1 ring-ink", // today, not finished: lime means now
};
const WORDS: Record<State, string> = { complete: "complete", partial: "partial", missed: "missed", not_scheduled: "not scheduled", open: "today, in progress" };

/** RT-5: the last 12 weeks, one square per day, weeks as columns that start on the profile's week start. */
export function RoutineStrip({ history, weekStartsOn }: { history: RoutineStreak["history"]; weekStartsOn: number }) {
  const lead = (getDay(parseISO(history[0].date)) - weekStartsOn + 7) % 7;
  const cells: (RoutineStreak["history"][number] | null)[] = [...Array<null>(lead).fill(null), ...history];
  const count = (s: State) => history.filter((h) => h.state === s).length;
  const summary = `Last 12 weeks: ${count("complete")} complete, ${count("partial")} partial, ${count("missed")} missed`;

  return (
    <div>
      <div role="img" aria-label={summary} className="inline-grid grid-flow-col grid-rows-7 gap-[3px]">
        {cells.map((h, i) =>
          h ? <span key={h.date} title={`${longDate(h.date)}: ${WORDS[h.state]}`} className={cx("size-3 rounded-[3px]", LOOK[h.state])} /> : <span key={`pad-${i}`} className="size-3" />,
        )}
      </div>
      <ul className="type-caption mt-2 flex flex-wrap gap-x-4 gap-y-1 text-ink-3-small" aria-label="Legend">
        {(["complete", "partial", "missed", "not_scheduled"] as const).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span aria-hidden className={cx("size-3 rounded-[3px]", LOOK[s])} />
            {WORDS[s][0].toUpperCase() + WORDS[s].slice(1)}
          </li>
        ))}
      </ul>
    </div>
  );
}
