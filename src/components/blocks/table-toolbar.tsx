"use client";

import { ArrowDownAZ, ArrowUpAZ, Filter as FilterIcon, X } from "lucide-react";
import { useState } from "react";
import { useSpace } from "@/components/space/space-context";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { shortDate } from "@/lib/dates";
import type { Column, Filter, TableConfig } from "@/lib/table-logic";

const DATE_PRESETS = [
  { value: "is_today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "range", label: "Custom range" },
] as const;

function describe(f: Filter, column: Column | undefined, today: string) {
  if (!column) return "Deleted column";
  switch (f.op) {
    case "contains":
      return `${column.name} contains “${f.value}”`;
    case "is":
      return column.kind === "checkbox" ? `${column.name} is ${f.value ? "checked" : "unchecked"}` : `${column.name} is ${column.options.find((o) => o.id === f.value)?.label ?? "removed option"}`;
    case "is_today":
      return `${column.name} is today`;
    case "this_week":
      return `${column.name} this week`;
    case "this_month":
      return `${column.name} this month`;
    case "range":
      return `${column.name}: ${f.value ? shortDate(String(f.value), today) : "any"} to ${f.to ? shortDate(f.to, today) : "any"}`;
  }
}

/** TBL-5 / TBL-7: sort, filters (saved per block), and the group-by-month switch. */
export function TableToolbar({ columns, config, onChange }: { columns: Column[]; config: TableConfig; onChange: (config: TableConfig) => void }) {
  const { today } = useSpace();
  const filters = config.filters ?? [];
  const dateColumns = columns.filter((c) => c.kind === "date");
  const byId = new Map(columns.map((c) => [c.id, c]));

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <AddFilter columns={columns} onAdd={(f) => onChange({ ...config, filters: [...filters, f] })} />

      <div className="flex items-center gap-1">
        <label className="sr-only" htmlFor="table-sort">
          Sort by
        </label>
        <Select
          id="table-sort"
          value={config.sort?.column_id ?? ""}
          onChange={(next) => onChange({ ...config, sort: next ? { column_id: next, dir: config.sort?.dir ?? "asc" } : null })}
          className="type-button min-h-9 rounded-pill bg-canvas-2 px-3 text-ink ring-1 ring-inset ring-control-edge pointer-coarse:min-h-11"
          options={[{ value: "", label: "Manual order" }, ...columns.map((c) => ({ value: c.id, label: `Sort: ${c.name}` }))]}
        />
        {config.sort && (
          <Button
            variant="secondary"
            aria-label={config.sort.dir === "asc" ? "Ascending. Switch to descending" : "Descending. Switch to ascending"}
            onClick={() => onChange({ ...config, sort: { ...config.sort!, dir: config.sort!.dir === "asc" ? "desc" : "asc" } })}
          >
            {config.sort.dir === "asc" ? <ArrowDownAZ size={14} strokeWidth={1.5} aria-hidden /> : <ArrowUpAZ size={14} strokeWidth={1.5} aria-hidden />}
          </Button>
        )}
      </div>

      {dateColumns.length > 0 && (
        <>
          <label className="sr-only" htmlFor="table-group">
            Group by month
          </label>
          <Select
            id="table-group"
            value={config.group_by_month_column_id ?? ""}
            onChange={(next) => onChange({ ...config, group_by_month_column_id: next || null })}
            className="type-button min-h-9 rounded-pill bg-canvas-2 px-3 text-ink ring-1 ring-inset ring-control-edge pointer-coarse:min-h-11"
            options={[{ value: "", label: "No month groups" }, ...dateColumns.map((c) => ({ value: c.id, label: `Group by month: ${c.name}` }))]}
          />
        </>
      )}

      {filters.map((f, i) => (
        <span key={i} className="type-caption inline-flex items-center gap-1 rounded-pill bg-surface py-1 pr-1 pl-3 ring-1 ring-inset ring-hairline-strong">
          {describe(f, byId.get(f.column_id), today)}
          <button
            type="button"
            aria-label={`Remove filter: ${describe(f, byId.get(f.column_id), today)}`}
            onClick={() => onChange({ ...config, filters: filters.filter((_, j) => j !== i) })}
            className="grid size-6 place-items-center rounded-pill hover:bg-canvas-2 pointer-coarse:size-11"
          >
            <X size={12} strokeWidth={1.75} aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}

function AddFilter({ columns, onAdd }: { columns: Column[]; onAdd: (filter: Filter) => void }) {
  const [open, setOpen] = useState(false);
  const [columnId, setColumnId] = useState("");
  const [op, setOp] = useState<string>("");
  const [value, setValue] = useState("");
  const [to, setTo] = useState("");
  const column = columns.find((c) => c.id === columnId);
  const filterable = columns.filter((c) => ["text", "select", "checkbox", "date", "url"].includes(c.kind));

  function submit() {
    if (!column) return;
    let filter: Filter | null = null;
    if (column.kind === "date") {
      if (op === "range") filter = { column_id: column.id, op: "range", value: value || undefined, to: to || undefined };
      else if (op) filter = { column_id: column.id, op: op as "is_today" | "this_week" | "this_month" };
    } else if (column.kind === "select") {
      if (value) filter = { column_id: column.id, op: "is", value };
    } else if (column.kind === "checkbox") {
      filter = { column_id: column.id, op: "is", value: value !== "unchecked" };
    } else if (value.trim()) {
      filter = { column_id: column.id, op: "contains", value: value.trim() };
    }
    if (!filter) return;
    onAdd(filter);
    setOpen(false);
    setColumnId("");
    setOp("");
    setValue("");
    setTo("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="type-button inline-flex min-h-9 items-center gap-1.5 rounded-pill bg-canvas-2 px-3 text-ink ring-1 ring-inset ring-control-edge pointer-coarse:min-h-11">
        <FilterIcon size={14} strokeWidth={1.5} aria-hidden /> Filter
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field id="filter-column" label="Column">
            <Select
              id="filter-column"
              value={columnId}
              onChange={(next) => {
                setColumnId(next);
                setOp("");
                setValue("");
              }}
              options={[{ value: "", label: "Choose a column" }, ...filterable.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </Field>
          {column?.kind === "date" && (
            <>
              <Field id="filter-preset" label="Show">
                <Select id="filter-preset" value={op} onChange={setOp} options={[{ value: "", label: "Choose" }, ...DATE_PRESETS.map((p) => ({ value: p.value, label: p.label }))]} />
              </Field>
              {op === "range" && (
                <div className="grid grid-cols-2 gap-2">
                  <Field id="filter-from" label="From">
                    <input id="filter-from" type="date" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
                  </Field>
                  <Field id="filter-to" label="To">
                    <input id="filter-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
                  </Field>
                </div>
              )}
            </>
          )}
          {column?.kind === "select" && (
            <Field id="filter-option" label="Is">
              <Select id="filter-option" value={value} onChange={setValue} options={[{ value: "", label: "Choose an option" }, ...column.options.map((o) => ({ value: o.id, label: o.label }))]} />
            </Field>
          )}
          {column?.kind === "checkbox" && (
            <Field id="filter-checked" label="Is">
              <Select
                id="filter-checked"
                value={value || "checked"}
                onChange={setValue}
                options={[
                  { value: "checked", label: "Checked" },
                  { value: "unchecked", label: "Unchecked" },
                ]}
              />
            </Field>
          )}
          {(column?.kind === "text" || column?.kind === "url") && (
            <Field id="filter-text" label="Contains">
              <input id="filter-text" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
            </Field>
          )}
          <Button type="submit" variant="primary" disabled={!column} className="self-end">
            Add filter
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
