import { describe, expect, it } from "vitest";
import { ROLL_MS, rollFrame } from "./number-roll";

describe("rollFrame (DESIGN.md Motion)", () => {
  it("is halfway at the midpoint of a 300ms roll", () => {
    expect(rollFrame(10, 90, ROLL_MS / 2, false)).toBe(50);
  });

  it("returns the target immediately when motion is reduced", () => {
    expect(rollFrame(10, 90, 0, true)).toBe(90);
  });

  it("stays on the previous value at the start of a roll", () => {
    expect(rollFrame(10, 90, 0, false)).toBe(10);
  });

  it("lands on the target once the roll is over", () => {
    expect(rollFrame(10, 90, ROLL_MS, false)).toBe(90);
  });
});
