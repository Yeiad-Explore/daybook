import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/space-page";
import { sortTodos } from "./todo-sort";

const task = (title: string, due: string | null, extra: Partial<Task> = {}): Task => ({
  id: title, block_id: "b", parent_id: null, depth: 0, title, note: null, due_date: due, due_time: null,
  done: false, completed_at: null, is_milestone: false, reschedule_count: 0, position: 1, ...extra,
});

describe("sortTodos (TODO-3)", () => {
  const tasks = [
    task("Later", "2026-10-20", { position: 1 }),
    task("Done early", "2026-10-10", { done: true, position: 2 }),
    task("Undated", null, { position: 3 }),
    task("Today, no time", "2026-10-16", { position: 4 }),
    task("Today 09:00", "2026-10-16", { due_time: "09:00:00", position: 5 }),
  ];

  it("by deadline: unfinished by date, then time, then position; undated last; done at the bottom", () => {
    expect(sortTodos(tasks, "deadline").map((t) => t.title)).toEqual(["Today 09:00", "Today, no time", "Later", "Undated", "Done early"]);
  });

  it("manual: by position, done still at the bottom", () => {
    expect(sortTodos(tasks, "manual").map((t) => t.title)).toEqual(["Later", "Undated", "Today, no time", "Today 09:00", "Done early"]);
  });
});
