import { describe, expect, it } from "vitest";
import { moveItem } from "./move-item";

const list = ["a", "b", "c", "d"].map((id) => ({ id }));

describe("moveItem (fractional reorder neighbours)", () => {
  it("moving down puts the item between its new neighbours", () => {
    const { next, before, after } = moveItem(list, 0, 2);
    expect(next.map((i) => i.id)).toEqual(["b", "c", "a", "d"]);
    expect([before, after]).toEqual(["c", "d"]);
  });

  it("moving to either end leaves that side empty", () => {
    expect(moveItem(list, 2, 0)).toMatchObject({ before: null, after: "a" });
    expect(moveItem(list, 0, 3)).toMatchObject({ before: "d", after: null });
  });
});
