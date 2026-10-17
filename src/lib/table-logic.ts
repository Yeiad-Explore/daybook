import { addDays, format, getDay, isValid, parseISO } from "date-fns";
import type { Enums, Json } from "@/lib/database.types";

// Pure table maths for the Table block (TBL-1..5, TBL-7). The database validates every cell again
// (C-TRG-10); this file gives the friendly messages and does the display work.

export type ColumnKind = Enums<"column_kind">;
export type SummaryKind = Enums<"summary_kind">;
export type Tone = "active" | "neutral" | "early" | "closed";
export type SelectOption = { id: string; label: string; tone: Tone };
export type Column = { id: string; name: string; kind: ColumnKind; options: SelectOption[]; signed: boolean; summary: SummaryKind; position: number };
export type Row = { id: string; cells: Record<string, Json | undefined>; position: number };

export type Filter = {
  column_id: string;
  op: "contains" | "is" | "is_today" | "this_week" | "this_month" | "range";
  /** contains: text; is: option id or true/false; range: first day. */
  value?: string | boolean;
  /** range: last day. */
  to?: string;
};
export type Sort = { column_id: string; dir: "asc" | "desc" };
export type TableConfig = { view?: "table" | "board"; board_column_id?: string | null; sort?: Sort | null; filters?: Filter[]; group_by_month_column_id?: string | null };

export type CellResult = { value: Json | null } | { error: string };

const NUMBER = /^-?\d+(\.\d+)?$/;

/** TBL-2 AC1: text typed into a cell becomes the typed value, or a message saying what is wrong. Empty clears the cell. */
export function parseCell(column: Pick<Column, "kind" | "options">, raw: string | boolean): CellResult {
  if (column.kind === "checkbox") return { value: raw === true || raw === "true" };
  const text = String(raw).trim();
  if (text === "") return { value: null };
  switch (column.kind) {
    case "text":
      return { value: text };
    case "number":
    case "money": {
      const cleaned = text.replace(/[,\s৳$€£₹]/g, "").replace(/^−/, "-");
      if (!NUMBER.test(cleaned)) {
        return { error: column.kind === "money" ? "Enter an amount, like 1250 or -450." : "Enter a number, like 2 or 12.5." };
      }
      return { value: Number(cleaned) };
    }
    case "date": {
      const real = /^\d{4}-\d{2}-\d{2}$/.test(text) && isValid(parseISO(text)) && format(parseISO(text), "yyyy-MM-dd") === text;
      return real ? { value: text } : { error: "Use a real date, like 2026-10-16." };
    }
    case "select":
      return column.options.some((o) => o.id === text) ? { value: text } : { error: "Pick one of this column's options." };
    case "url":
      try {
        const url = new URL(text);
        return url.protocol === "http:" || url.protocol === "https:" ? { value: text } : { error: "Use a web address that starts with http:// or https://." };
      } catch {
        return { error: "Use a web address that starts with http:// or https://." };
      }
  }
}

const money = (n: number) => Math.round(n * 100) / 100;
const numbers = (rows: Row[], column: Column) => rows.flatMap((r) => (typeof r.cells[column.id] === "number" ? [r.cells[column.id] as number] : []));

/** TBL-4: the footer value of a number or money column; null when there is nothing to show. */
export function summarize(column: Column, rows: Row[]): number | null {
  if (column.summary === "none") return null;
  if (column.summary === "count") return rows.filter((r) => r.cells[column.id] !== null && r.cells[column.id] !== undefined && r.cells[column.id] !== "").length;
  const values = numbers(rows, column);
  if (values.length === 0) return column.summary === "sum" ? 0 : null;
  const sum = values.reduce((a, b) => a + b, 0);
  return money(column.summary === "sum" ? sum : sum / values.length);
}

/** TBL-3: Income, Expenses (as a positive amount) and Net for the rows given, from a signed money column. */
export function incomeExpenses(column: Column, rows: Row[]) {
  const values = numbers(rows, column);
  const income = money(values.filter((v) => v > 0).reduce((a, b) => a + b, 0));
  const expenses = money(-values.filter((v) => v < 0).reduce((a, b) => a + b, 0));
  return { income, expenses, net: money(income - expenses) };
}

/** First day (YYYY-MM-DD) of the week containing `day`, for a week that starts on `weekStartsOn` (0 = Sunday). */
export function weekStart(day: string, weekStartsOn: number): string {
  const back = (getDay(parseISO(day)) - weekStartsOn + 7) % 7;
  return format(addDays(parseISO(day), -back), "yyyy-MM-dd");
}

function matches(row: Row, filter: Filter, columns: Map<string, Column>, today: string, weekStartsOn: number): boolean {
  const column = columns.get(filter.column_id);
  if (!column) return true; // a filter on a deleted column filters nothing
  const cell = row.cells[column.id];
  switch (filter.op) {
    case "contains":
      return typeof cell === "string" && cell.toLowerCase().includes(String(filter.value ?? "").toLowerCase());
    case "is":
      return column.kind === "checkbox" ? (cell === true) === (filter.value === true) : cell === filter.value;
    case "is_today":
      return cell === today;
    case "this_week": {
      const start = weekStart(today, weekStartsOn);
      return typeof cell === "string" && cell >= start && cell <= format(addDays(parseISO(start), 6), "yyyy-MM-dd");
    }
    case "this_month":
      return typeof cell === "string" && cell.slice(0, 7) === today.slice(0, 7);
    case "range":
      return typeof cell === "string" && (!filter.value || cell >= String(filter.value)) && (!filter.to || cell <= filter.to);
  }
}

/** TBL-5: rows that pass every filter. */
export function applyFilters(rows: Row[], columns: Column[], filters: Filter[] | undefined, today: string, weekStartsOn: number): Row[] {
  if (!filters?.length) return rows;
  const byId = new Map(columns.map((c) => [c.id, c]));
  return rows.filter((row) => filters.every((f) => matches(row, f, byId, today, weekStartsOn)));
}

/** TBL-5: sort by one column; empty cells last whichever way; ties keep the manual order. */
export function sortRows(rows: Row[], columns: Column[], sort: Sort | null | undefined): Row[] {
  const column = sort && columns.find((c) => c.id === sort.column_id);
  if (!sort || !column) return [...rows].sort((a, b) => a.position - b.position);
  const key = (r: Row) => {
    const v = r.cells[column.id];
    if (v === null || v === undefined || v === "") return null;
    if (column.kind === "select") return column.options.findIndex((o) => o.id === v);
    return typeof v === "boolean" ? Number(v) : v;
  };
  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === null && y === null) return a.position - b.position;
    if (x === null) return 1;
    if (y === null) return -1;
    const order = x < y ? -1 : x > y ? 1 : 0;
    return (sort.dir === "asc" ? order : -order) || a.position - b.position;
  });
}

export type MonthGroup = { key: string; label: string; rows: Row[] };

/** TBL-7: rows grouped by the month of a date column, newest month first; rows without a date go last. */
export function groupByMonth(rows: Row[], dateColumnId: string, newestFirst = true): MonthGroup[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const day = row.cells[dateColumnId];
    const key = typeof day === "string" && /^\d{4}-\d{2}/.test(day) ? day.slice(0, 7) : "none";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const keys = [...groups.keys()].filter((k) => k !== "none").sort();
  if (newestFirst) keys.reverse();
  if (groups.has("none")) keys.push("none");
  return keys.map((key) => ({ key, label: key === "none" ? "No date" : format(parseISO(`${key}-01`), "MMMM yyyy"), rows: groups.get(key)! }));
}

/** "Name the columns, separated by commas" (TBL-1 AC1): text columns, trimmed, no blanks, no duplicates, at most 20. */
export function parseColumnNames(input: string): string[] {
  const seen = new Set<string>();
  return input
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()))
    .slice(0, 20);
}
