"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { Task } from "@/lib/space-page";
import { childrenMap, possibleParents } from "./roadmap-tree";

const STAGE = "stage";

/**
 * RM-6: move a step under another step (or make it a stage). The database re-checks the deadline rule
 * (DL-2) and the 4-level limit; a refusal comes back as its message and the move is undone.
 */
export function MoveUnderDialog({
  task,
  tasks,
  onMove,
  onClose,
}: {
  task: Task;
  tasks: Task[];
  onMove: (parentId: string | null, position: number) => void;
  onClose: () => void;
}) {
  const map = childrenMap(tasks);
  const options = possibleParents(task, tasks, map);
  const [target, setTarget] = useState(task.parent_id ? STAGE : (options[0]?.id ?? ""));

  function move() {
    const parentId = target === STAGE ? null : target;
    const siblings = map.get(parentId ?? "") ?? [];
    onMove(parentId, Math.max(0, ...siblings.map((t) => t.position)) + 1);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Move under…</DialogTitle>
        <DialogDescription>
          <span className="text-ink">{task.title}</span> and its steps go to the end of the new place. Its deadline has to fit there.
        </DialogDescription>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            move();
          }}
        >
          <Field id="move-under" label="New place">
            <Select
              id="move-under"
              value={target}
              onChange={setTarget}
              options={[
                ...(task.parent_id ? [{ value: STAGE, label: "Its own stage" }] : []),
                ...options.map((t) => ({ value: t.id, label: `${t.depth > 0 ? `${"  ".repeat(t.depth)}↳ ` : ""}${t.title}` })),
              ]}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="secondary" disabled={!target}>
              Move
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
