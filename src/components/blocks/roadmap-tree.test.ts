import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/space-page";
import { childrenMap, leafProgress, possibleParents } from "./roadmap-tree";

const task = (id: string, parent: string | null, depth: number, done = false, position = 1): Task => ({
  id, block_id: "b", parent_id: parent, depth, title: id, note: null, due_date: "2026-11-15", due_time: null,
  done, completed_at: null, is_milestone: false, reschedule_count: 0, position,
});

// Learn Python > Loops > (While loops done, For loops); Learn databases (a leaf stage).
const tasks = [
  task("python", null, 0), task("loops", "python", 1), task("while", "loops", 2, true), task("for", "loops", 2, false, 2),
  task("databases", null, 0, false, 2),
];
const map = childrenMap(tasks);

describe("roadmap tree (RM-3, RM-4, RM-6)", () => {
  it("orders stages and siblings by position", () => {
    expect(map.get("")!.map((t) => t.id)).toEqual(["python", "databases"]);
    expect(map.get("loops")!.map((t) => t.id)).toEqual(["while", "for"]);
  });

  it("RM-4: progress counts leaf steps only", () => {
    expect(leafProgress("python", map)).toEqual({ done: 1, total: 2 });
    expect(leafProgress("databases", map, tasks[4])).toEqual({ done: 0, total: 1 });
  });

  it("RM-6: a step cannot move under itself, its own parent or so deep the tree passes 4 levels", () => {
    expect(possibleParents(tasks[1], tasks, map).map((t) => t.id)).toEqual(["databases"]);
    expect(possibleParents(tasks[2], tasks, map).map((t) => t.id)).toEqual(["python", "for", "databases"]);
  });
});
