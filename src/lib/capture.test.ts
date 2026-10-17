import { describe, expect, it } from "vitest";
import { afterGoalMessage, defaultSpaceId, firstTodoBlock, type CaptureBlock, type CaptureSpace } from "./capture";

const block = (id: string, space_id: string, position: number, page_position: number): CaptureBlock => ({ id, space_id, title: id, position, page_position });
const space = (id: string): CaptureSpace => ({ id, name: id, kind: "area", mark: "moss", deadline: null });

describe("quick capture targets (CAP-1)", () => {
  it("picks the first To-do block of the space by page, then by block", () => {
    const blocks = [block("late", "s1", 1, 2), block("second", "s1", 2, 1), block("first", "s1", 1, 1), block("other", "s2", 1, 1)];
    expect(firstTodoBlock(blocks, "s1")?.id).toBe("first");
    expect(firstTodoBlock(blocks, "s3")).toBeUndefined();
  });
  it("defaults to the space used last, else the first", () => {
    const spaces = [space("a"), space("b")];
    expect(defaultSpaceId(spaces, "b")).toBe("b");
    expect(defaultSpaceId(spaces, "gone")).toBe("a");
    expect(defaultSpaceId(spaces, null)).toBe("a");
    expect(defaultSpaceId([], null)).toBe("");
  });
  it("words the goal-deadline rule as TODO-1 AC1 does", () => {
    expect(afterGoalMessage("31 Jan 2027")).toBe("That deadline is after the goal ends (31 Jan 2027). Pick an earlier date.");
  });
});
