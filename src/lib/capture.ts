import type { Enums } from "@/lib/database.types";

// Quick capture (CAP-1, CAP-2): which space and To-do block a new task goes to.

export type CaptureSpace = { id: string; name: string; kind: Enums<"space_kind">; mark: Enums<"mark_color">; deadline: string | null };
export type CaptureBlock = { id: string; space_id: string; title: string; position: number; page_position: number };

export const LAST_SPACE_KEY = "daybook:last-capture-space";

/** The first To-do block of a space: first page, then first block on it (CAP-1). */
export function firstTodoBlock(blocks: CaptureBlock[], spaceId: string): CaptureBlock | undefined {
  return blocks.filter((b) => b.space_id === spaceId).sort((a, b) => a.page_position - b.page_position || a.position - b.position)[0];
}

/** CAP-1: the space used last if it still exists, else the first one. */
export function defaultSpaceId(spaces: CaptureSpace[], last: string | null): string {
  return spaces.find((s) => s.id === last)?.id ?? spaces[0]?.id ?? "";
}

/** The message for a deadline after the goal ends (TODO-1 AC1), reused by CAP-2. */
export const afterGoalMessage = (deadlineLabel: string) => `That deadline is after the goal ends (${deadlineLabel}). Pick an earlier date.`;
