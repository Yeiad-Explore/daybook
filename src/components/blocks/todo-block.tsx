"use client";

import { useTrash } from "@/components/deadlines/use-trash";
import { useSpace } from "@/components/space/space-context";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sortable } from "@/components/ui/sortable";
import { shortDate } from "@/lib/dates";
import { moveItem } from "@/lib/move-item";
import { reorderRequest } from "@/lib/reorder";
import type { Block, Task } from "@/lib/space-page";
import { AddTask } from "./add-task";
import { sortTodos } from "./todo-sort";
import { BlockFrame, type BlockActions } from "./block-frame";
import type { DragHandle } from "@/components/ui/sortable";
import { TaskItem } from "./task-item";
import { useTaskList } from "./use-task-list";

export type TodoConfig = { hide_done?: boolean; sort?: "deadline" | "manual" };

const SORTS = [
  { value: "deadline", label: "By date" },
  { value: "manual", label: "Manual" },
] as const;

/** PRD §6.5 To-do list block (TODO-1..6). */
export function TodoBlock({
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
  setConfig: (config: TodoConfig) => void;
}) {
  const { space, today } = useSpace();
  const list = useTaskList(serverTasks);
  const { trash, dialog } = useTrash(today);
  const config = block.config as TodoConfig;
  const sorted = sortTodos(list.tasks, config.sort);
  const open = sorted.filter((t) => !t.done);
  const done = sorted.filter((t) => t.done);
  const goal = space.kind === "goal";

  function moveTo(from: number, to: number) {
    const { before, after } = moveItem(open, from, to);
    const id = open[from].id;
    const lo = open.find((t) => t.id === before)?.position;
    const hi = open.find((t) => t.id === after)?.position;
    const position = lo !== undefined && hi !== undefined ? (lo + hi) / 2 : lo !== undefined ? lo + 1 : (hi ?? 0) - 1;
    list.move(id, { position }, () => reorderRequest("tasks", id, before, after));
  }

  const item = (task: Task, drag?: DragHandle) => (
    <TaskItem
      key={task.id}
      task={task}
      list={list}
      maxDue={goal ? space.deadline : null}
      onTrash={() => trash({ table: "tasks", id: task.id, name: task.title, onTrashed: () => list.setTasks((all) => all.filter((t) => t.id !== task.id)), onUndone: () => list.setTasks((all) => [...all, task]) })}
      drag={drag}
    />
  );

  return (
    <BlockFrame
      block={block}
      actions={actions}
      drag={drag}
      controls={
        <>
          <SegmentedControl label={`Sort ${block.title}`} options={[...SORTS]} value={config.sort ?? "deadline"} onChange={(sort) => setConfig({ ...config, sort })} />
          <button
            type="button"
            aria-pressed={!!config.hide_done}
            onClick={() => setConfig({ ...config, hide_done: !config.hide_done })}
            className="type-button min-h-8 rounded-pill px-2.5 text-[12px] text-ink-2 hover:bg-canvas-2 pointer-coarse:min-h-11"
          >
            {config.hide_done ? `Show done (${done.length})` : "Hide done"}
          </button>
        </>
      }
    >
      {open.length === 0 && done.length === 0 && <p className="type-body-sm px-1 pb-2 text-ink-2">No tasks yet. Add the first one below.</p>}
      <ul className="flex flex-col divide-y divide-hairline">
        {config.sort === "manual" ? (
          <Sortable
            id={`todo-${block.id}`}
            items={open}
            onMove={moveTo}
            render={(task, handle) => item(task, handle)}
          />
        ) : (
          open.map((t) => item(t))
        )}
        {!config.hide_done && done.map((t) => item(t))}
      </ul>
      <AddTask
        label="Add a task"
        dateRequired={goal}
        withTime
        max={goal ? space.deadline : null}
        maxMessage={goal && space.deadline ? `That deadline is after the goal ends (${shortDate(space.deadline, today)}). Pick an earlier date.` : undefined}
        onAdd={(fields) => list.add({ block_id: block.id, ...fields })}
      />
      {dialog}
    </BlockFrame>
  );
}
