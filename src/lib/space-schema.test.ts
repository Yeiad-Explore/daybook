import { describe, expect, it } from "vitest";
import { newSpace, spaceRow } from "./space-schema";

const goal = { kind: "goal", name: "Read 12 books", mark: "slate", end_goal: "Read one book a month", description: "", start_date: "2026-10-16", deadline: "2027-10-15" } as const;
const messages = (input: unknown) => newSpace.safeParse(input).error?.issues.map((i) => i.message) ?? [];

describe("newSpace (SPC-1)", () => {
  it("accepts a complete goal", () => {
    expect(newSpace.safeParse(goal).success).toBe(true);
  });

  it("AC1: a goal without a deadline says so", () => {
    expect(messages({ ...goal, deadline: "" })).toEqual(["A goal needs a deadline."]);
  });

  it("DL-5: the deadline cannot be before the start", () => {
    expect(messages({ ...goal, deadline: "2026-10-01" })).toEqual(["The deadline can't be before the start date."]);
  });

  it("a goal needs its end goal; names are 1–60 characters", () => {
    expect(messages({ ...goal, end_goal: "  " })).toEqual(["Say what done looks like, in one sentence."]);
    expect(messages({ ...goal, name: "x".repeat(61) })).toEqual(["Keep the name to 60 characters."]);
  });

  it("a life area needs only a name", () => {
    expect(newSpace.safeParse({ ...goal, kind: "area", end_goal: "", start_date: "", deadline: "" }).success).toBe(true);
  });

  it("life areas carry no dates into the row", () => {
    const area = newSpace.parse({ ...goal, kind: "area", description: "Bills and savings" });
    expect(spaceRow(area, 3)).toEqual({ kind: "area", name: "Read 12 books", mark: "slate", description: "Bills and savings", position: 3 });
  });
});
