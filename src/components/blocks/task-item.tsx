"use client";

import { Ellipsis, GripVertical } from "lucide-react";
import { useState, type ReactNode } from "react";
import { RescheduleDialog } from "@/components/deadlines/reschedule-dialog";
import { useSpace } from "@/components/space/space-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { inputClass } from "@/components/ui/field";
import type { DragHandle } from "@/components/ui/sortable";
import { TaskRow } from "@/components/ui/task-row";
import { cx } from "@/lib/cx";
import { todayIn } from "@/lib/today";
import type { Task } from "@/lib/space-page";
import { BookTimeDialog } from "./book-time-dialog";
import type { useTaskList } from "./use-task-list";

/**
 * One task (To-do item or Roadmap step) with its inline title and note (TODO-4), the milestone flag
 * (TODO-5), Book time (TODO-6), Reschedule (DL-6) and Trash. `lead` replaces the checkbox for steps
 * with sub-steps (RM-3); `items` adds block-specific menu entries.
 */
export function TaskItem({
  task,
  list,
  maxDue,
  onTrash,
  lead,
  items,
  drag,
  className,
}: {
  task: Task;
  list: ReturnType<typeof useTaskList>;
  /** The latest date the rules allow (goal deadline, parent deadline): a picker hint. */
  maxDue?: string | null;
  onTrash: () => void;
  lead?: ReactNode;
  items?: ReactNode;
  /** Present when the list is in manual order: a grip in the menu cell, wiring on the row. */
  drag?: DragHandle;
  className?: string;
}) {
  const { today, timezone } = useSpace();
  const [dialog, setDialog] = useState<"reschedule" | "first" | "book" | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const saved = !task.id.startsWith("new-");
  const isStage = task.depth === 0 && !!items; // roadmap stages are milestones already (SPC-8 AC1)
  const doneLate = task.done && !!task.due_date && !!task.completed_at && todayIn(timezone, new Date(task.completed_at)) > task.due_date;

  const titleSlot = (
    <input
      aria-label="Task title"
      readOnly={!saved}
      defaultValue={task.title}
      key={task.title}
      maxLength={200}
      onBlur={(e) => {
        const next = e.currentTarget.value.trim();
        if (!next) e.currentTarget.value = task.title;
        else if (next !== task.title) list.edit(task.id, { title: next });
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = task.title;
          e.currentTarget.blur();
        }
      }}
      className={cx("min-w-0 flex-1 truncate rounded-sm bg-transparent px-1 py-0.5", task.done && "text-ink-3-small line-through")}
    />
  );

  const detail = noteOpen ? (
    <textarea
      aria-label={`Note for ${task.title}`}
      defaultValue={task.note ?? ""}
      autoFocus
      rows={2}
      maxLength={2000}
      onBlur={(e) => {
        setNoteOpen(false);
        const note = e.currentTarget.value.trim() || null;
        if (note !== task.note) list.edit(task.id, { note });
      }}
      className={cx(inputClass, "type-body-sm mt-1 py-1.5")}
    />
  ) : (
    task.note && (
      <button type="button" onClick={() => setNoteOpen(true)} className="type-body-sm block max-w-full truncate px-1 text-left text-ink-2 hover:text-ink">
        {task.note}
      </button>
    )
  );

  const menu = saved && (
    <div className="flex items-center">
      {drag && (
        <button type="button" aria-label={`Move ${task.title}`} {...drag.handle} className="grid size-8 cursor-grab place-items-center rounded-pill text-ink-3-small hover:bg-canvas-2 pointer-coarse:hidden">
          <GripVertical size={14} strokeWidth={1.5} aria-hidden />
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`${task.title}: more`} className="grid size-8 place-items-center rounded-pill text-ink-2 hover:bg-canvas-2 pointer-coarse:size-11">
          <Ellipsis size={16} strokeWidth={1.5} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {task.due_date ? (
            <DropdownMenuItem onClick={() => setDialog("reschedule")}>Move the deadline</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setDialog("first")}>Set a deadline</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setNoteOpen(true)}>{task.note ? "Edit note" : "Add a note"}</DropdownMenuItem>
          {!isStage && (
            <DropdownMenuItem onClick={() => list.edit(task.id, { is_milestone: !task.is_milestone })}>
              {task.is_milestone ? "Take off the Deadline Rail" : "Show on Deadline Rail"}
            </DropdownMenuItem>
          )}
          {!lead && <DropdownMenuItem onClick={() => setDialog("book")}>Book time</DropdownMenuItem>}
          {items}
          <DropdownMenuSeparator />
          <DropdownMenuItem tone="danger" onClick={onTrash}>
            Move to Trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <>
      <TaskRow
        title={task.title}
        done={task.done}
        onToggle={lead || !saved ? undefined : (done) => list.toggle(task.id, done)}
        lead={lead}
        due={task.due_date}
        dueTime={task.due_time}
        today={today}
        movedCount={task.reschedule_count}
        doneLate={doneLate}
        milestone={task.is_milestone && !isStage}
        titleSlot={titleSlot}
        detail={detail}
        menu={menu}
        className={className}
        rowRef={drag?.ref}
        style={drag?.style}
      />
      {task.due_date && dialog === "reschedule" && (
        <RescheduleDialog
          target={{ kind: "task", id: task.id, title: task.title, due: task.due_date, max: maxDue }}
          today={today}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          onMoved={({ ids, newDue }) =>
            list.setTasks((all) => all.map((t) => (ids.includes(t.id) ? { ...t, due_date: newDue, reschedule_count: t.reschedule_count + 1 } : t)))
          }
        />
      )}
      {dialog === "book" && <BookTimeDialog task={task} open onOpenChange={(open) => !open && setDialog(null)} />}
      {dialog === "first" && <FirstDeadline task={task} list={list} max={maxDue} onClose={() => setDialog(null)} />}
    </>
  );
}

/** An undated task (life areas, §7.1) gets its first deadline by a plain edit; later changes are reschedules. */
function FirstDeadline({ task, list, max, onClose }: { task: Task; list: ReturnType<typeof useTaskList>; max?: string | null; onClose: () => void }) {
  const { today } = useSpace();
  const [date, setDate] = useState("");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Set a deadline</DialogTitle>
        <DialogDescription>Once it has a date, moving it asks for a reason.</DialogDescription>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!date) return;
            list.edit(task.id, { due_date: date });
            onClose();
          }}
        >
          <input aria-label="Deadline" type="date" required min={today} max={max ?? undefined} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="secondary">
              Set deadline
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
