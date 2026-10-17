"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RescheduleDialog } from "@/components/deadlines/reschedule-dialog";
import { useTrash } from "@/components/deadlines/use-trash";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, inputClass } from "@/components/ui/field";
import { MarkPicker } from "@/components/ui/mark-picker";
import { Panel } from "@/components/ui/panel";
import type { Tables, TablesUpdate } from "@/lib/database.types";
import { shortDate } from "@/lib/dates";
import { errorMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/client";
import { useSave } from "@/lib/use-save";
import { useServerState } from "@/lib/use-server-state";
import type { SpaceSummary } from "@/lib/deadlines";
import { CoverSettings } from "./cover-settings";
import { MetricSettings, type ColumnChoice, type TrackerChoice } from "./metric-settings";

type Space = Tables<"spaces">;

/**
 * PRD §5.5: name, colour, cover photo, progress metric (SPC-7), end goal or description, start date, the deadline
 * (only through Reschedule, SPC-2 AC1), kind (goal ↔ area, SPC-9 checked by the database), status
 * (SPC-4) and Trash (SPC-5). Text fields save when you leave them.
 */
export function SpaceSettings({
  space: serverSpace,
  today,
  coverUrl,
  progress,
  fields,
  columns,
}: {
  space: Space;
  today: string;
  coverUrl: string | null;
  progress: SpaceSummary["progress"];
  fields: TrackerChoice[];
  columns: ColumnChoice[];
}) {
  const router = useRouter();
  const save = useSave();
  const { trash, dialog } = useTrash(today);
  const [space, setSpace] = useServerState(serverSpace);
  const [rescheduling, setRescheduling] = useState(false);
  const [converting, setConverting] = useState<"goal" | "area" | null>(null);
  const goal = space.kind === "goal";

  function patch(fields: TablesUpdate<"spaces">) {
    const previous = space;
    setSpace({ ...space, ...fields } as Space);
    save.mutate({ request: () => createClient().from("spaces").update(fields).eq("id", space.id), rollback: () => setSpace(previous) });
  }

  const text = (key: "name" | "end_goal" | "description", label: string, max: number, hint?: string) => (
    <Field id={key} label={label} hint={hint}>
      <input
        id={key}
        defaultValue={space[key] ?? ""}
        key={space[key] ?? ""}
        maxLength={max}
        className={inputClass}
        onBlur={(e) => {
          const value = e.currentTarget.value.trim();
          if (key !== "description" && !value) e.currentTarget.value = space[key] ?? "";
          else if (value !== (space[key] ?? "")) patch({ [key]: value || null });
        }}
      />
    </Field>
  );

  const status = (next: Space["status"], label: string) => (
    <Button variant="secondary" onClick={() => patch({ status: next })}>
      {label}
    </Button>
  );

  return (
    <div className="flex max-w-document flex-col gap-6">
      <Panel className="flex flex-col gap-6">
        {text("name", "Name", 60)}
        <MarkPicker value={space.mark} onChange={(mark) => patch({ mark })} />
        {goal ? text("end_goal", "End goal", 200, "One sentence: what does done look like?") : text("description", "Description", 200, "Optional. One line about what lives here.")}
      </Panel>

      <CoverSettings space={space} coverUrl={coverUrl} />

      {goal && (
        <Panel className="grid gap-6 tablet:grid-cols-2">
          <Field id="start_date" label="Start">
            <input
              id="start_date"
              type="date"
              defaultValue={space.start_date ?? ""}
              key={space.start_date}
              max={space.deadline ?? undefined}
              className={inputClass}
              onBlur={(e) => e.currentTarget.value && e.currentTarget.value !== space.start_date && patch({ start_date: e.currentTarget.value })}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="type-heading">Deadline</span>
            <p className="type-number-lg">{space.deadline && shortDate(space.deadline, today)}</p>
            <p className="type-caption text-ink-3-small">Moving it needs a reason and goes in your deadline history.</p>
            <Button variant="secondary" className="self-start" onClick={() => setRescheduling(true)}>
              Move the deadline
            </Button>
          </div>
        </Panel>
      )}

      {goal && <MetricSettings key={`${space.metric}-${JSON.stringify(space.metric_config)}`} space={space} progress={progress} fields={fields} columns={columns} />}

      <Panel className="flex flex-col gap-4">
        <h2 className="type-heading">Kind and status</h2>
        <p className="type-body-sm text-ink-2">
          This is a {goal ? "goal" : "life area"}, {space.status === "active" ? "active" : space.status}.
        </p>
        <div className="flex flex-wrap gap-2">
          {space.status === "active" ? (
            <>
              {goal && status("achieved", "Mark achieved")}
              {goal && status("missed", "Close as missed")}
              {status("archived", "Archive")}
            </>
          ) : (
            status("active", "Make active again")
          )}
          <Button variant="ghost" onClick={() => setConverting(goal ? "area" : "goal")}>
            {goal ? "Turn into a life area" : "Turn into a goal"}
          </Button>
        </div>
      </Panel>

      <Panel className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body-sm text-ink-2">Move this space, its pages and everything on them to Trash. You can restore it for 30 days.</p>
        <Button variant="secondary" onClick={() => trash({ table: "spaces", id: space.id, name: space.name, onTrashed: () => router.push("/today") })}>
          Move to Trash
        </Button>
      </Panel>

      {goal && space.deadline && (
        <RescheduleDialog target={{ kind: "space", id: space.id, title: space.name, due: space.deadline }} today={today} open={rescheduling} onOpenChange={setRescheduling} />
      )}
      {converting && <Convert space={space} to={converting} today={today} onClose={() => setConverting(null)} />}
      {dialog}
    </div>
  );
}

/** §5.5 kind change: goal → area drops the deadline rules after confirming; area → goal needs an end goal and dates (SPC-9). */
function Convert({ space, to, today, onClose }: { space: Space; to: "goal" | "area"; today: string; onClose: () => void }) {
  const router = useRouter();
  const [endGoal, setEndGoal] = useState(space.end_goal ?? "");
  const [start, setStart] = useState(space.start_date ?? today);
  const [deadline, setDeadline] = useState(space.deadline ?? "");
  const [problem, setProblem] = useState<string | null>(null);

  async function convert() {
    const fields: TablesUpdate<"spaces"> = to === "area" ? { kind: "area" } : { kind: "goal", end_goal: endGoal.trim(), start_date: start, ...(space.deadline ? {} : { deadline }) };
    if (to === "goal" && (!endGoal.trim() || !deadline)) return setProblem("A goal needs an end goal and a deadline.");
    const { error } = await createClient().from("spaces").update(fields).eq("id", space.id);
    if (error) return setProblem(errorMessage(error));
    onClose();
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>{to === "area" ? "Turn into a life area?" : "Turn into a goal"}</DialogTitle>
        <DialogDescription>
          {to === "area"
            ? "Its tasks no longer need deadlines inside a goal date, and it stops counting down. The dates stay, so turning it back restores them."
            : "Every task needs a deadline on or before the goal's deadline. Daybook lists any that don't fit."}
        </DialogDescription>
        {to === "goal" && (
          <div className="flex flex-col gap-4">
            <Field id="convert-end" label="End goal">
              <input id="convert-end" value={endGoal} maxLength={200} onChange={(e) => setEndGoal(e.target.value)} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="convert-start" label="Start">
                <input id="convert-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
              </Field>
              <Field id="convert-deadline" label="Deadline">
                <input id="convert-deadline" type="date" value={deadline} disabled={!!space.deadline} onChange={(e) => setDeadline(e.target.value)} className={inputClass} />
              </Field>
            </div>
          </div>
        )}
        {problem && (
          <p role="alert" className="type-body-sm text-signal-ink">
            {problem}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void convert()}>
            {to === "area" ? "Make it a life area" : "Make it a goal"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
