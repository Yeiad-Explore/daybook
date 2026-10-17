"use client";

import { ChevronRight, GripVertical } from "lucide-react";
import { Fragment, useState } from "react";
import { useTrash } from "@/components/deadlines/use-trash";
import { useSpace } from "@/components/space/space-context";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Sortable, type DragHandle } from "@/components/ui/sortable";
import { Tag } from "@/components/ui/tag";
import { cx } from "@/lib/cx";
import { shortDate } from "@/lib/dates";
import { moveItem, positionBetween } from "@/lib/move-item";
import { reorderRequest } from "@/lib/reorder";
import type { Block, Task } from "@/lib/space-page";
import { createClient } from "@/lib/supabase/client";
import { AddTask } from "./add-task";
import { BlockFrame, type BlockActions } from "./block-frame";
import { MoveUnderDialog } from "./move-under-dialog";
import { childrenMap, leafProgress } from "./roadmap-tree";
import { TaskItem } from "./task-item";
import { useTaskList } from "./use-task-list";

export type RoadmapConfig = { expanded?: string[] };

/** PRD §6.6 Roadmap block (RM-1..RM-8), DESIGN.md "Roadmap". */
export function RoadmapBlock({
  block,
  tasks: serverTasks,
  actions,
  drag,
  setConfig,
}: {
  block: Block;
  tasks: Task[];
  actions: BlockActions;
  drag: DragHandle;
  setConfig: (config: RoadmapConfig) => void;
}) {
  const { space, today } = useSpace();
  const list = useTaskList(serverTasks);
  const { trash, dialog } = useTrash(today);
  const [adding, setAdding] = useState<string | null>(null);
  const [moving, setMoving] = useState<Task | null>(null);
  const map = childrenMap(list.tasks);
  const stages = map.get("") ?? [];
  const overall = leafProgress("", map);
  const goal = space.kind === "goal";

  // RM-5: config.expanded lists open steps; without it every step is open.
  const config = block.config as RoadmapConfig;
  const parents = list.tasks.filter((t) => map.has(t.id)).map((t) => t.id);
  const isOpen = (id: string) => !config.expanded || config.expanded.includes(id);
  const toggleOpen = (id: string) => {
    const open = config.expanded ?? parents;
    setConfig({ ...config, expanded: open.includes(id) ? open.filter((x) => x !== id) : [...open, id] });
  };

  function reorder(siblings: Task[], from: number, to: number) {
    const { before, after } = moveItem(siblings, from, to);
    const id = siblings[from].id;
    const position = positionBetween(siblings, before, after);
    list.move(id, { position }, () => reorderRequest("tasks", id, before, after));
  }

  const trashTask = (t: Task) =>
    trash({ table: "tasks", id: t.id, name: t.title, onTrashed: () => list.setTasks((all) => all.filter((x) => x.id !== t.id)), onUndone: () => list.setTasks((all) => [...all, t]) });

  // RM-2: a step's sub-steps are due by its deadline (the database says so too).
  const addUnder = (parent: Task) => (
    <AddTask
      label={`Add a step to ${parent.title}`}
      dateRequired={goal}
      max={parent.due_date}
      maxMessage={parent.due_date ? `Must be due by ${shortDate(parent.due_date, today)}, the deadline of '${parent.title}'.` : undefined}
      onAdd={async (fields) => {
        const added = await list.add({ block_id: block.id, parent_id: parent.id, title: fields.title, due_date: fields.due_date });
        if (added && !isOpen(parent.id)) toggleOpen(parent.id);
        return added;
      }}
    />
  );

  const menuItems = (t: Task) => (
    <>
      {t.depth < 3 && <DropdownMenuItem onClick={() => setAdding(t.id)}>Break down</DropdownMenuItem>}
      <DropdownMenuItem onClick={() => setMoving(t)}>Move under…</DropdownMenuItem>
    </>
  );

  const steps = (parent: Task) => {
    const kids = map.get(parent.id) ?? [];
    if (kids.length === 0 && adding !== parent.id) return null;
    return (
      <ul className="ml-5 flex flex-col border-l border-hairline pl-2">
        <Sortable
          id={`steps-${parent.id}`}
          items={kids}
          onMove={(from, to) => reorder(kids, from, to)}
          render={(kid, handle) => step(kid, handle)}
        />
        {adding === parent.id && <li className="py-1">{addUnder(parent)}</li>}
      </ul>
    );
  };

  const step = (task: Task, handle: DragHandle) => {
    const kids = map.get(task.id) ?? [];
    const p = leafProgress(task.id, map, task);
    const open = isOpen(task.id);
    return (
      <Fragment key={task.id}>
        <TaskItem
          task={task}
          list={list}
          maxDue={list.tasks.find((t) => t.id === task.parent_id)?.due_date ?? space.deadline}
          onTrash={() => trashTask(task)}
          drag={handle}
          items={menuItems(task)}
          lead={
            kids.length > 0 && (
              <button
                type="button"
                aria-expanded={open}
                aria-label={`${open ? "Collapse" : "Expand"} ${task.title}: ${p.done} of ${p.total} done`}
                onClick={() => toggleOpen(task.id)}
                className="type-caption flex items-center gap-0.5 rounded-pill px-1 py-1 text-ink-2 hover:bg-canvas-2"
              >
                <ChevronRight size={12} strokeWidth={1.5} aria-hidden className={cx("transition-transform", open && "rotate-90")} />
                {p.done}/{p.total}
              </button>
            )
          }
        />
        {open && kids.length + (adding === task.id ? 1 : 0) > 0 && <li>{steps(task)}</li>}
      </Fragment>
    );
  };

  return (
    <BlockFrame block={block} actions={actions} drag={drag} controls={<Tag>{overall.done}/{overall.total} steps</Tag>}>
      {stages.length === 0 && <p className="type-body-sm px-1 pb-2 text-ink-2">No stages yet. Start with the first big step below.</p>}
      <ol className="flex flex-col gap-3">
        <Sortable
          id={`stages-${block.id}`}
          items={stages}
          onMove={(from, to) => reorder(stages, from, to)}
          render={(stage, handle) => {
            const kids = map.get(stage.id) ?? [];
            const p = leafProgress(stage.id, map, stage);
            const pct = p.total ? Math.round((100 * p.done) / p.total) : 0;
            const index = stages.indexOf(stage) + 1;
            return (
              <li key={stage.id} ref={handle.ref} style={handle.style} className="rounded-md bg-surface ring-1 ring-hairline">
                <div className="flex items-start gap-1 px-2 pt-2">
                  <button type="button" aria-label={`Move ${stage.title}`} {...handle.handle} className="mt-3 grid h-6 w-5 shrink-0 cursor-grab place-items-center rounded-sm text-ink-3-small hover:bg-canvas-2 pointer-coarse:hidden">
                    <GripVertical size={14} strokeWidth={1.5} aria-hidden />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="type-caption px-1 pt-1 text-ink-3-small">[{index}]</p>
                    <ul>
                      <TaskItem
                        task={stage}
                        list={list}
                        maxDue={space.deadline}
                        onTrash={() => trashTask(stage)}
                        items={menuItems(stage)}
                        lead={kids.length > 0 && <Tag className="px-1.5">{p.done}/{p.total}</Tag>}
                        className="type-heading"
                      />
                    </ul>
                  </div>
                </div>
                {kids.length > 0 && (
                  <div className="flex items-center gap-3 px-4 pb-1">
                    <div role="progressbar" aria-label={`${stage.title} progress`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-1 flex-1 overflow-hidden rounded-pill bg-canvas-2">
                      <div className="h-full rounded-pill bg-ink" style={{ width: `${pct}%` }} />
                    </div>
                    <button type="button" aria-expanded={isOpen(stage.id)} onClick={() => toggleOpen(stage.id)} className="type-caption rounded-pill px-2 py-1 text-ink-2 hover:bg-canvas-2 pointer-coarse:min-h-11">
                      {isOpen(stage.id) ? "Hide steps" : `Show ${kids.length} steps`}
                    </button>
                  </div>
                )}
                <div className="px-2 pb-2">{isOpen(stage.id) && steps(stage)}</div>
              </li>
            );
          }}
        />
      </ol>
      <AddTask
        label="Add a stage"
        dateRequired={goal}
        max={goal ? space.deadline : null}
        maxMessage={goal && space.deadline ? `That deadline is after the goal ends (${shortDate(space.deadline, today)}). Pick an earlier date.` : undefined}
        onAdd={(fields) => list.add({ block_id: block.id, title: fields.title, due_date: fields.due_date })}
      />
      {moving && (
        <MoveUnderDialog
          task={moving}
          tasks={list.tasks}
          onClose={() => setMoving(null)}
          onMove={(parentId, position) =>
            list.move(moving.id, { parent_id: parentId, position }, () => createClient().from("tasks").update({ parent_id: parentId, position }).eq("id", moving.id))
          }
        />
      )}
      {dialog}
    </BlockFrame>
  );
}

