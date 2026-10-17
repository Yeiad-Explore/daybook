"use client";

import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import type { Task } from "@/lib/space-page";
import { createClient } from "@/lib/supabase/client";
import { useSave } from "@/lib/use-save";
import { useServerState } from "@/lib/use-server-state";

type Editable = Pick<TablesUpdate<"tasks">, "title" | "note" | "is_milestone" | "due_date" | "due_time">;

/**
 * The tasks of one To-do or Roadmap block with optimistic writes (NFR-1). Plain edits are direct
 * table writes (PRD §9.3); the database still refuses anything against the deadline rules, and the
 * change is then rolled back with its message. Deadlines that exist change only through Reschedule.
 */
export function useTaskList(serverTasks: Task[]) {
  const [tasks, setTasks] = useServerState(serverTasks);
  const save = useSave();
  const tasksTable = () => createClient().from("tasks");

  function change(id: string, fields: Partial<Task>, request: () => PromiseLike<{ data: unknown; error: unknown }>) {
    const previous = tasks;
    setTasks(tasks.map((t) => (t.id === id ? { ...t, ...fields } : t)));
    save.mutate({ request, rollback: () => setTasks(previous) });
  }

  return {
    tasks,
    setTasks,
    toggle: (id: string, done: boolean) => change(id, { done }, () => createClient().rpc("set_task_done", { p_task_id: id, p_done: done })),
    edit: (id: string, fields: Editable) => change(id, fields as Partial<Task>, () => tasksTable().update(fields).eq("id", id)),
    /** Position or parent changes (TODO-3 manual order, RM-6); the request is the reorder RPC or a parent update. */
    move: (id: string, fields: Pick<Partial<Task>, "position" | "parent_id">, request: () => PromiseLike<{ data: unknown; error: unknown }>) =>
      change(id, fields, request),
    /** Adds a task (or a sub-step) after its siblings. Resolves false when the database refuses it. */
    add: async (row: Omit<TablesInsert<"tasks">, "position" | "space_id">) => {
      const siblings = tasks.filter((t) => t.block_id === row.block_id && t.parent_id === (row.parent_id ?? null));
      const position = Math.max(0, ...siblings.map((t) => t.position)) + 1;
      const temp: Task = {
        id: `new-${crypto.randomUUID()}`,
        block_id: row.block_id,
        parent_id: row.parent_id ?? null,
        depth: 0,
        title: row.title,
        note: row.note ?? null,
        due_date: row.due_date ?? null,
        due_time: row.due_time ?? null,
        done: false,
        completed_at: null,
        is_milestone: row.is_milestone ?? false,
        reschedule_count: 0,
        position,
      };
      const previous = tasks;
      setTasks([...tasks, temp]);
      try {
        // space_id is derived by the database from the block (DB-2); the insert type still asks for it.
        await save.mutateAsync({ request: () => tasksTable().insert({ ...row, position, space_id: undefined as unknown as string }), rollback: () => setTasks(previous) });
        return true;
      } catch {
        return false;
      }
    },
  };
}
