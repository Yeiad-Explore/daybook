import { describe, expect, it } from "vitest";
import { applyFilters, groupByMonth, incomeExpenses, parseCell, parseColumnNames, sortRows, summarize, weekStart, type Column, type Row } from "./table-logic";

const col = (over: Partial<Column> & Pick<Column, "id" | "kind">): Column => ({ name: over.id, options: [], signed: false, summary: "none", position: 1, ...over });
const row = (id: string, cells: Row["cells"], position = 1): Row => ({ id, cells, position });

describe("parseCell (TBL-2 AC1)", () => {
  const select = { kind: "select" as const, options: [{ id: "opt_a", label: "A", tone: "active" as const }] };
  it("accepts numbers and money, including commas and the currency sign", () => {
    expect(parseCell({ kind: "number", options: [] }, "12.5")).toEqual({ value: 12.5 });
    expect(parseCell({ kind: "money", options: [] }, "৳1,250")).toEqual({ value: 1250 });
    expect(parseCell({ kind: "money", options: [] }, "−450")).toEqual({ value: -450 });
  });
  it("rejects invalid numbers and money with a message that says what to type", () => {
    expect(parseCell({ kind: "number", options: [] }, "two")).toEqual({ error: "Enter a number, like 2 or 12.5." });
    expect(parseCell({ kind: "money", options: [] }, "12abc")).toEqual({ error: "Enter an amount, like 1250 or -450." });
  });
  it("accepts real dates only", () => {
    expect(parseCell({ kind: "date", options: [] }, "2026-10-16")).toEqual({ value: "2026-10-16" });
    expect("error" in parseCell({ kind: "date", options: [] }, "16/10/2026")).toBe(true);
    expect("error" in parseCell({ kind: "date", options: [] }, "2026-02-30")).toBe(true);
  });
  it("accepts only http(s) urls", () => {
    expect(parseCell({ kind: "url", options: [] }, "https://example.com/a")).toEqual({ value: "https://example.com/a" });
    expect("error" in parseCell({ kind: "url", options: [] }, "ftp://example.com")).toBe(true);
    expect("error" in parseCell({ kind: "url", options: [] }, "example")).toBe(true);
  });
  it("accepts only the column's options", () => {
    expect(parseCell(select, "opt_a")).toEqual({ value: "opt_a" });
    expect("error" in parseCell(select, "opt_z")).toBe(true);
  });
  it("turns checkboxes into booleans and empty text into a cleared cell", () => {
    expect(parseCell({ kind: "checkbox", options: [] }, true)).toEqual({ value: true });
    expect(parseCell({ kind: "text", options: [] }, "   ")).toEqual({ value: null });
  });
});

describe("summaries (TBL-4) and the ledger strip (TBL-3)", () => {
  const amount = col({ id: "amt", kind: "money", signed: true, summary: "sum" });
  const rows = [row("1", { amt: 25000 }), row("2", { amt: -12000 }), row("3", { amt: -3400.5 }), row("4", {})];
  it("sums, averages and counts", () => {
    expect(summarize(amount, rows)).toBe(9599.5);
    expect(summarize({ ...amount, summary: "avg" }, rows)).toBe(3199.83);
    expect(summarize({ ...amount, summary: "count" }, rows)).toBe(3);
    expect(summarize({ ...amount, summary: "none" }, rows)).toBeNull();
  });
  it("avoids floating point drift", () => {
    expect(summarize(amount, [row("1", { amt: 0.1 }), row("2", { amt: 0.2 })])).toBe(0.3);
  });
  it("splits income, expenses and net", () => {
    expect(incomeExpenses(amount, rows)).toEqual({ income: 25000, expenses: 15400.5, net: 9599.5 });
  });
});

describe("filters (TBL-5)", () => {
  const cols = [col({ id: "d", kind: "date" }), col({ id: "m", kind: "select", options: [{ id: "x", label: "X", tone: "neutral" }] }), col({ id: "t", kind: "text" }), col({ id: "c", kind: "checkbox" })];
  const rows = [
    row("a", { d: "2026-10-16", m: "x", t: "Rice and fish", c: true }),
    row("b", { d: "2026-10-15", t: "Toast", c: false }),
    row("c", { d: "2026-10-10", t: "Soup" }),
    row("d", { d: "2026-09-30" }),
  ];
  const ids = (r: Row[]) => r.map((x) => x.id);
  it("is_today shows only today's rows (TBL-5 AC)", () => {
    expect(ids(applyFilters(rows, cols, [{ column_id: "d", op: "is_today" }], "2026-10-16", 6))).toEqual(["a"]);
  });
  it("this_week follows the profile's week start", () => {
    // 16 Oct 2026 is a Friday: a Saturday-start week began on 10 Oct; a Monday-start week on 12 Oct.
    expect(weekStart("2026-10-16", 6)).toBe("2026-10-10");
    expect(weekStart("2026-10-16", 1)).toBe("2026-10-12");
    expect(ids(applyFilters(rows, cols, [{ column_id: "d", op: "this_week" }], "2026-10-16", 6))).toEqual(["a", "b", "c"]);
    expect(ids(applyFilters(rows, cols, [{ column_id: "d", op: "this_week" }], "2026-10-16", 1))).toEqual(["a", "b"]);
  });
  it("this_month and custom ranges", () => {
    expect(ids(applyFilters(rows, cols, [{ column_id: "d", op: "this_month" }], "2026-10-16", 6))).toEqual(["a", "b", "c"]);
    expect(ids(applyFilters(rows, cols, [{ column_id: "d", op: "range", value: "2026-10-11", to: "2026-10-15" }], "2026-10-16", 6))).toEqual(["b"]);
  });
  it("filters by select option, checkbox and text contains", () => {
    expect(ids(applyFilters(rows, cols, [{ column_id: "m", op: "is", value: "x" }], "2026-10-16", 6))).toEqual(["a"]);
    expect(ids(applyFilters(rows, cols, [{ column_id: "c", op: "is", value: true }], "2026-10-16", 6))).toEqual(["a"]);
    expect(ids(applyFilters(rows, cols, [{ column_id: "c", op: "is", value: false }], "2026-10-16", 6))).toEqual(["b", "c", "d"]);
    expect(ids(applyFilters(rows, cols, [{ column_id: "t", op: "contains", value: "SO" }], "2026-10-16", 6))).toEqual(["c"]);
  });
  it("ignores a filter whose column was deleted, and combines filters with AND", () => {
    expect(ids(applyFilters(rows, cols, [{ column_id: "gone", op: "is_today" }], "2026-10-16", 6))).toHaveLength(4);
    expect(ids(applyFilters(rows, cols, [{ column_id: "d", op: "this_month" }, { column_id: "t", op: "contains", value: "toast" }], "2026-10-16", 6))).toEqual(["b"]);
  });
});

describe("sort and month groups (TBL-5, TBL-7)", () => {
  const cols = [col({ id: "d", kind: "date" }), col({ id: "n", kind: "number" })];
  const rows = [row("a", { d: "2026-10-02", n: 3 }, 1), row("b", { d: "2026-09-20", n: 1 }, 2), row("c", { n: 2 }, 3), row("e", { d: "2026-10-30", n: 2 }, 4)];
  it("sorts ascending and descending with empty cells last", () => {
    expect(sortRows(rows, cols, { column_id: "d", dir: "asc" }).map((r) => r.id)).toEqual(["b", "a", "e", "c"]);
    expect(sortRows(rows, cols, { column_id: "d", dir: "desc" }).map((r) => r.id)).toEqual(["e", "a", "b", "c"]);
  });
  it("keeps manual order for ties and with no sort", () => {
    expect(sortRows(rows, cols, { column_id: "n", dir: "asc" }).map((r) => r.id)).toEqual(["b", "c", "e", "a"]);
    expect(sortRows(rows, cols, null).map((r) => r.id)).toEqual(["a", "b", "c", "e"]);
  });
  it("groups by month, newest first, undated last", () => {
    const groups = groupByMonth(rows, "d");
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ["October 2026", ["a", "e"]],
      ["September 2026", ["b"]],
      ["No date", ["c"]],
    ]);
    expect(groupByMonth(rows, "d", false).map((g) => g.key)).toEqual(["2026-09", "2026-10", "none"]);
  });
});

describe("parseColumnNames (TBL-1 AC1)", () => {
  it("trims, drops blanks and duplicates, and caps at 20", () => {
    expect(parseColumnNames(" Date, Item ,, item, Amount ")).toEqual(["Date", "Item", "Amount"]);
    expect(parseColumnNames(Array.from({ length: 25 }, (_, i) => `C${i}`).join(","))).toHaveLength(20);
  });
});
