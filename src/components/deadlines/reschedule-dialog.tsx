"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { inputClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cx } from "@/lib/cx";
import { quickPicks, shortDate } from "@/lib/dates";
import { errorMessage } from "@/lib/db-error";
import { deadlineTag } from "@/lib/deadline-tag";
import type { Blocker, RescheduleResult } from "@/lib/deadlines";
import { createClient } from "@/lib/supabase/client";

export type RescheduleTarget = {
  kind: "task" | "space";
  id: string;
  title: string;
  due: string;
  /** Latest date the rules allow (goal deadline, parent step's deadline): a hint, the database decides. */
  max?: string | null;
};

/**
 * DL-6..DL-9 (PRD §7.4): a new date (quick picks or any date) and a reason, always. Conflicts the owner
 * can fix in one step (DL-3 sub-steps, DL-4 a goal's tasks) are listed with an offer to move them too;
 * any other rule comes back as the database's own sentence.
 */
export function RescheduleDialog({
  target,
  today,
  open,
  onOpenChange,
  onMoved,
}: {
  target: RescheduleTarget;
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shows the move at once (NFR-1); the refresh that follows brings the saved rows. */
  onMoved?: (moved: { ids: string[]; newDue: string }) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<Blocker[] | null>(null);

  const status = deadlineTag({ due: target.due, done: false, today });
  const save = useMutation({
    mutationFn: async (cascade: boolean) => {
      const supabase = createClient();
      const { data, error } =
        target.kind === "task"
          ? await supabase.rpc("reschedule_task", { p_task_id: target.id, p_new_due: date, p_reason: reason, p_cascade_children: cascade })
          : await supabase.rpc("reschedule_space", { p_space_id: target.id, p_new_deadline: date, p_reason: reason, p_cascade_tasks: cascade });
      if (error) throw error;
      return data as unknown as RescheduleResult;
    },
    onSuccess: (result) => {
      if (result.status === "conflict") {
        setBlockers(result.blockers);
        return;
      }
      onMoved?.({ ids: [target.id, ...(blockers ?? []).map((b) => b.id)], newDue: result.new_due });
      toast.success(`Moved to ${shortDate(result.new_due, today)}.`);
      close(false);
      router.refresh();
    },
    onError: (error) => setProblem(errorMessage(error)),
  });

  function close(next: boolean) {
    if (!next) {
      setDate("");
      setReason("");
      setProblem(null);
      setBlockers(null);
    }
    onOpenChange(next);
  }

  function submit(cascade: boolean) {
    setProblem(null);
    if (!date) return setProblem("Pick a new date.");
    if (reason.trim().length < 3) return setProblem("A reason needs at least 3 characters.");
    save.mutate(cascade);
  }

  const things = target.kind === "task" ? "steps" : "tasks";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogTitle>Move the deadline</DialogTitle>
        <DialogDescription>
          <span className="text-ink">{target.title}</span> is due {shortDate(target.due, today)}
          {status.state === "late" ? ` (${status.text})` : ""}. Every move stays in your deadline history.
        </DialogDescription>

        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="type-heading pb-2">New date</legend>
            <div className="flex flex-wrap gap-1.5">
              {quickPicks(today).map((pick) => (
                <button
                  key={pick.label}
                  type="button"
                  aria-pressed={date === pick.date}
                  onClick={() => {
                    setDate(pick.date);
                    setBlockers(null);
                  }}
                  className={cx(
                    "type-button min-h-9 rounded-pill px-3.5 ring-1 ring-inset pointer-coarse:min-h-11",
                    date === pick.date ? "bg-surface-dark text-on-dark ring-surface-dark" : "bg-canvas-2 text-ink ring-control-edge",
                  )}
                >
                  {pick.label}
                </button>
              ))}
            </div>
            <label htmlFor="reschedule-date" className="type-caption text-ink-3-small">
              Or pick a date
            </label>
            <input
              id="reschedule-date"
              type="date"
              value={date}
              min={today}
              max={target.max ?? undefined}
              onChange={(e) => {
                setDate(e.target.value);
                setBlockers(null);
              }}
              className={inputClass}
            />
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="reschedule-reason" className="type-heading">
              Why is it moving?
            </label>
            <input
              id="reschedule-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Shop closed"
              maxLength={200}
              className={inputClass}
            />
          </div>

          {blockers && (
            <div role="alert" className="flex flex-col gap-2 rounded-md bg-canvas-2 p-3">
              <p className="type-body-sm">
                {blockers.length === 1 ? `This ${things.slice(0, -1)} is` : `These ${things} are`} due after {shortDate(date, today)}. Move{" "}
                {blockers.length === 1 ? "it" : "them"} to the same date, with the same reason?
              </p>
              <ul className="type-body-sm flex flex-col gap-1">
                {blockers.map((b) => (
                  <li key={b.id} className="flex justify-between gap-3">
                    <span className="truncate">{b.title}</span>
                    <span className="type-number shrink-0 text-ink-2">{shortDate(b.due_date, today)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {problem && (
            <p role="alert" className="type-body-sm text-signal-ink">
              {problem}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            {blockers ? (
              <Button variant="primary" disabled={save.isPending} onClick={() => submit(true)} icon={<ArrowRight size={12} strokeWidth={2} />}>
                Move all {blockers.length + 1}
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled={save.isPending} icon={<ArrowRight size={12} strokeWidth={2} />}>
                Move deadline
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
