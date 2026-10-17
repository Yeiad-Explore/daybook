import type { Task } from "@/lib/space-page";

/** Children of each step, in sibling order. Key "" holds the stages. */
export function childrenMap(tasks: Task[]) {
  const map = new Map<string, Task[]>();
  for (const t of [...tasks].sort((a, b) => a.position - b.position)) {
    const key = t.parent_id ?? "";
    map.set(key, [...(map.get(key) ?? []), t]);
  }
  return map;
}

/** RM-4: done / total of the leaf steps under a step (a leaf counts itself). */
export function leafProgress(id: string, map: Map<string, Task[]>, self?: Task): { done: number; total: number } {
  const kids = map.get(id) ?? [];
  if (kids.length === 0) return self ? { done: self.done ? 1 : 0, total: 1 } : { done: 0, total: 0 };
  return kids.reduce(
    (sum, k) => {
      const p = leafProgress(k.id, map, k);
      return { done: sum.done + p.done, total: sum.total + p.total };
    },
    { done: 0, total: 0 },
  );
}

/** RM-6 "Move under…": steps that can take `task` (not itself or its descendants; the result stays ≤ 4 deep). */
export function possibleParents(task: Task, tasks: Task[], map: Map<string, Task[]>) {
  const height = (id: string): number => Math.max(0, ...(map.get(id) ?? []).map((k) => 1 + height(k.id)));
  const inside = new Set<string>();
  const walk = (id: string) => {
    inside.add(id);
    (map.get(id) ?? []).forEach((k) => walk(k.id));
  };
  walk(task.id);
  const h = height(task.id);
  return tasks.filter((t) => !inside.has(t.id) && t.id !== task.parent_id && t.depth + 1 + h <= 3);
}
