import type { Task } from "@/lib/space-page";
import type { TodoConfig } from "./todo-block";

/** TODO-3: unfinished by deadline, then time, then manual position; finished at the bottom. */
export function sortTodos(tasks: Task[], sort: TodoConfig["sort"]) {
  const byDeadline = (a: Task, b: Task) =>
    (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || (a.due_time ?? "99").localeCompare(b.due_time ?? "99") || a.position - b.position;
  const order = sort === "manual" ? (a: Task, b: Task) => a.position - b.position : byDeadline;
  return [...tasks.filter((t) => !t.done).sort(order), ...tasks.filter((t) => t.done).sort(order)];
}
