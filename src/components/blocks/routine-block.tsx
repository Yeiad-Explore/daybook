"use client";

import { GripVertical, Plus, X } from "lucide-react";
import { useState } from "react";
import { useSpace } from "@/components/space/space-context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sortable, type DragHandle } from "@/components/ui/sortable";
import { Tag } from "@/components/ui/tag";
import { cx } from "@/lib/cx";
import { moveItem } from "@/lib/move-item";
import { reorderRequest } from "@/lib/reorder";
import type { Block, RoutineStep, RoutineStreak } from "@/lib/space-page";
import { createClient } from "@/lib/supabase/client";
import { useSave } from "@/lib/use-save";
import { useServerState } from "@/lib/use-server-state";
import { BlockFrame, type BlockActions } from "./block-frame";
import { RoutineCheck } from "./routine-check";
import { RoutineStrip } from "./routine-strip";
import { streakText, useRoutine } from "./use-routine";

export type RoutineConfig = { days?: number[] };
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** PRD §6.10 Routine block (RT-1..5): steps, weekday schedule, today's checks, streak, 12-week strip. */
export function RoutineBlock({
  block,
  steps: serverSteps,
  checkedIds,
  streak: serverStreak,
  actions,
  drag,
  setConfig,
}: {
  block: Block;
  steps: RoutineStep[];
  checkedIds: string[];
  streak: RoutineStreak;
  actions: BlockActions;
  drag: DragHandle;
  setConfig: (config: RoutineConfig) => void;
}) {
  const { today, weekStartsOn } = useSpace();
  const save = useSave();
  const [steps, setSteps] = useServerState(serverSteps);
  const [label, setLabel] = useState("");
  const config = block.config as RoutineConfig;
  const days = config.days?.length ? config.days : ALL_DAYS;
  const routine = useRoutine({
    blockId: block.id,
    today,
    stepIds: steps.map((s) => s.id),
    checkedIds,
    streakBeforeToday: serverStreak.streak - (serverStreak.today_complete ? 1 : 0),
    scheduledToday: serverStreak.scheduled_today,
  });
  const done = steps.filter((s) => routine.checked.includes(s.id)).length;

  async function add() {
    const text = label.trim();
    if (!text) return;
    const position = Math.max(0, ...steps.map((s) => s.position)) + 1;
    const previous = steps;
    const temp = `new-${crypto.randomUUID()}`;
    setSteps([...steps, { id: temp, block_id: block.id, label: text, position, archived_at: null }]);
    setLabel("");
    try {
      const saved = (await save.mutateAsync({ request: () => createClient().from("routine_steps").insert({ block_id: block.id, label: text, position }).select("id").single(), rollback: () => setSteps(previous) })) as { id: string };
      // The real id replaces the temporary one at once, so the new step can be checked right away.
      setSteps((all) => all.map((s) => (s.id === temp ? { ...s, id: saved.id } : s)));
    } catch {
      /* rolled back, and the toast says why */
    }
  }

  function rename(step: RoutineStep, next: string) {
    const previous = steps;
    setSteps(steps.map((s) => (s.id === step.id ? { ...s, label: next } : s)));
    save.mutate({ request: () => createClient().from("routine_steps").update({ label: next }).eq("id", step.id), rollback: () => setSteps(previous) });
  }

  function archive(step: RoutineStep) {
    const previous = steps;
    setSteps(steps.filter((s) => s.id !== step.id));
    save.mutate({ request: () => createClient().from("routine_steps").update({ archived_at: new Date().toISOString() }).eq("id", step.id), rollback: () => setSteps(previous) });
  }

  function move(from: number, to: number) {
    const { next, before, after } = moveItem(steps, from, to);
    const previous = steps;
    setSteps(next);
    save.mutate({ request: () => reorderRequest("routine_steps", steps[from].id, before, after), rollback: () => setSteps(previous) });
  }

  const row = (step: RoutineStep, handle: DragHandle) => (
    <li key={step.id} ref={handle.ref as never} style={handle.style} className={cx("group/step flex items-center gap-1 border-t border-hairline first:border-t-0", handle.dragging && "rounded-md bg-surface shadow-float")}>
      <button type="button" aria-label={`Move ${step.label} (drag, or Space and arrow keys)`} {...handle.handle} className="grid h-8 w-6 shrink-0 cursor-grab place-items-center rounded-sm text-ink-3-small opacity-0 group-hover/step:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden">
        <GripVertical size={14} strokeWidth={1.5} aria-hidden />
      </button>
      <input
        aria-label={`Step: ${step.label}`}
        defaultValue={step.label}
        key={step.label}
        maxLength={80}
        onBlur={(e) => {
          const next = e.currentTarget.value.trim();
          if (!next) e.currentTarget.value = step.label;
          else if (next !== step.label) rename(step, next);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={cx("type-body min-h-11 min-w-0 flex-1 rounded-sm bg-transparent px-2 hover:bg-canvas", routine.checked.includes(step.id) && "text-ink-2")}
      />
      <button type="button" aria-label={`Archive ${step.label}`} onClick={() => archive(step)} className="grid size-9 place-items-center rounded-pill text-ink-3-small opacity-0 hover:bg-canvas-2 group-hover/step:opacity-100 focus-visible:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100">
        <X size={14} strokeWidth={1.5} aria-hidden />
      </button>
      <RoutineCheck label={`Done: ${step.label}`} checked={routine.checked.includes(step.id)} onToggle={() => routine.toggle(step.id)} />
    </li>
  );

  return (
    <BlockFrame block={block} actions={actions} drag={drag} controls={<SchedulePopover days={days} weekStartsOn={weekStartsOn} onChange={(next) => setConfig({ ...config, days: next })} />}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tag variant="outlined">{streakText(routine.streak)}</Tag>
        {!serverStreak.scheduled_today && <Tag>Not scheduled today</Tag>}
        {days.length < 7 && <Tag>{days.length === 1 ? WEEKDAYS[days[0]] : [...days].sort((a, b) => ((a - weekStartsOn + 7) % 7) - ((b - weekStartsOn + 7) % 7)).map((d) => WEEKDAYS[d]).join(" · ")}</Tag>}
      </div>

      {steps.length === 0 && <p className="type-body-sm px-1 pb-2 text-ink-2">No steps yet. Add the first one below.</p>}
      <ul className="flex flex-col">
        <Sortable id={`steps-${block.id}`} items={steps} onMove={move} render={row} />
      </ul>

      <form
        noValidate
        className="mt-2 flex items-center gap-1.5 rounded-pill bg-canvas p-1 ring-1 ring-inset ring-ink-3 focus-within:ring-ink"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input aria-label="Add a step" placeholder="+ Add a step" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} className="type-body min-w-0 flex-1 rounded-pill bg-transparent px-3 py-1.5 placeholder:text-ink-3-small focus-visible:shadow-none focus-visible:outline-none" />
        <button type="submit" aria-label={`Add step: ${label || "new"}`} className="grid size-9 place-items-center rounded-pill bg-surface-dark text-on-dark pointer-coarse:size-11">
          <Plus size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </form>

      <p className="type-caption mt-3 px-1 text-ink-3-small">
        {done} of {steps.length} today
      </p>

      <div className="mt-4 overflow-x-auto pb-1">
        <RoutineStrip history={serverStreak.history} weekStartsOn={weekStartsOn} />
      </div>
    </BlockFrame>
  );
}

/** RT-2: every day (default) or chosen weekdays. At least one day stays selected. */
function SchedulePopover({ days, weekStartsOn, onChange }: { days: number[]; weekStartsOn: number; onChange: (days: number[]) => void }) {
  const order = ALL_DAYS.map((i) => (i + weekStartsOn) % 7);
  return (
    <Popover>
      <PopoverTrigger className="type-button min-h-8 rounded-pill px-2.5 text-[12px] text-ink-2 hover:bg-canvas-2 pointer-coarse:min-h-11">Schedule</PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="type-heading mb-1">Which days?</p>
        <p className="type-caption mb-3 text-ink-2">The streak counts scheduled days only.</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Weekdays">
          {order.map((d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => (on ? days.length > 1 && onChange(days.filter((x) => x !== d)) : onChange([...days, d].sort()))}
                className={cx("type-button min-h-9 rounded-pill px-3 pointer-coarse:min-h-11", on ? "bg-surface-dark text-on-dark" : "bg-canvas-2 text-ink ring-1 ring-inset ring-control-edge")}
              >
                {WEEKDAYS[d]}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => onChange(ALL_DAYS)} className="type-button mt-3 min-h-9 rounded-pill px-3 text-ink-2 underline-offset-4 hover:underline">
          Every day
        </button>
      </PopoverContent>
    </Popover>
  );
}
