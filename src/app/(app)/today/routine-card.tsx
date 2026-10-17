"use client";

import Link from "next/link";
import { useMemo } from "react";
import { RoutineCheck } from "@/components/blocks/routine-check";
import { streakText, useRoutine } from "@/components/blocks/use-routine";
import { Tag } from "@/components/ui/tag";
import { blockHref, type TodayRoutine } from "@/lib/deadlines";

/**
 * PRD §5.3 item 5, DESIGN.md "Routine card": the pale-lime card; every routine scheduled today with its
 * steps as rows, a circular check at the end, the streak, and "2 of 4 today". Checking here is the
 * same write as in the block (TODAY-3).
 */
export function RoutineCard({ routines, today }: { routines: TodayRoutine[]; today: string }) {
  if (routines.length === 0) return null;
  return (
    <section aria-label="Routines" className="flex flex-col gap-5 rounded-lg bg-lime-soft p-5 text-ink">
      <h2 className="type-heading">Routines</h2>
      {routines.map((r) => (
        <Routine key={r.block_id} routine={r} today={today} />
      ))}
    </section>
  );
}

function Routine({ routine, today }: { routine: TodayRoutine; today: string }) {
  // Stable while the server data is: useRoutine follows its input, and a new array each render would loop.
  const checkedIds = useMemo(() => routine.steps.filter((s) => s.checked).map((s) => s.id), [routine]);
  const r = useRoutine({
    blockId: routine.block_id,
    today,
    stepIds: routine.steps.map((s) => s.id),
    checkedIds,
    streakBeforeToday: routine.streak - (routine.complete ? 1 : 0),
    scheduledToday: true,
  });
  const done = routine.steps.filter((s) => r.checked.includes(s.id)).length;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={blockHref(routine)} prefetch={false} className="type-body font-medium underline-offset-4 hover:underline">
          {routine.title}
        </Link>
        <Tag variant="outlined" className="border-ink/25 text-ink">
          {streakText(r.streak)}
        </Tag>
      </div>
      <p className="type-caption mb-1 flex items-center gap-1.5 text-ink-2">
        <span aria-hidden data-mark={routine.mark} className="size-2 rounded-pill bg-aura-mid" />
        {routine.space_name}
      </p>
      <ul className="flex flex-col divide-y divide-ink/10">
        {routine.steps.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2">
            <span className={r.checked.includes(s.id) ? "type-body text-ink-2" : "type-body"}>{s.label}</span>
            <RoutineCheck label={`Done: ${s.label} (${routine.title})`} checked={r.checked.includes(s.id)} onToggle={() => r.toggle(s.id)} />
          </li>
        ))}
      </ul>
      <p className="type-caption mt-1 text-ink-2">
        {done} of {routine.steps.length} today
      </p>
    </div>
  );
}
