"use client";

import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { useSave } from "@/lib/use-save";
import { useServerState } from "@/lib/use-server-state";

/**
 * Today's checks for one routine, with the streak (RT-3, RT-4). Checking a step is optimistic; the
 * streak shown is the database's streak up to yesterday plus today once every step is checked, and
 * finishing the last step says so in a toast (RT-4 AC1). The block and Today's card both use this, so
 * a check in one shows in the other after the refresh (TODAY-3).
 */
export function useRoutine({
  blockId,
  today,
  stepIds,
  checkedIds,
  streakBeforeToday,
  scheduledToday,
}: {
  blockId: string;
  today: string;
  stepIds: string[];
  checkedIds: string[];
  /** The streak up to yesterday (`routine_streak.streak` minus today when today is complete). */
  streakBeforeToday: number;
  scheduledToday: boolean;
}) {
  const save = useSave();
  const toast = useToast();
  const [checked, setChecked] = useServerState(checkedIds);
  const isComplete = (ids: string[]) => scheduledToday && stepIds.length > 0 && stepIds.every((id) => ids.includes(id));
  const complete = isComplete(checked);
  const streak = streakBeforeToday + (complete ? 1 : 0);

  function toggle(stepId: string) {
    const on = !checked.includes(stepId);
    const next = on ? [...checked, stepId] : checked.filter((id) => id !== stepId);
    const previous = checked;
    setChecked(next);
    if (on && isComplete(next) && !complete) {
      const n = streakBeforeToday + 1;
      toast.success(`Streak ${n} ${n === 1 ? "day" : "days"}. Every step is done.`);
    }
    const supabase = createClient();
    save.mutate({
      request: () =>
        on
          ? supabase.from("routine_checks").insert({ step_id: stepId, block_id: blockId, check_date: today })
          : supabase.from("routine_checks").delete().eq("step_id", stepId).eq("check_date", today),
      rollback: () => setChecked(previous),
    });
  }

  return { checked, toggle, complete, streak };
}

/** "Streak 12 days" (RT-4 AC1). */
export const streakText = (n: number) => `Streak ${n} ${n === 1 ? "day" : "days"}`;
