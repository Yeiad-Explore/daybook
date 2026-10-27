"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { inputClass } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { Json } from "@/lib/database.types";
import { moveItem } from "@/lib/move-item";
import { reorderRequest } from "@/lib/reorder";
import { createClient } from "@/lib/supabase/client";
import { parseCell, type Column, type ColumnKind, type Row, type SelectOption, type SummaryKind, type Tone } from "@/lib/table-logic";
import { useSave } from "@/lib/use-save";

const KINDS: { value: ColumnKind; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "money", label: "Money" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "url", label: "Link" },
];
const TONES: { value: Tone; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "neutral", label: "Neutral" },
  { value: "early", label: "Early" },
  { value: "closed", label: "Closed" },
];
const MAX_COLUMNS = 20;

type Retype = { column: Column; kind: ColumnKind; lost: number; cells: Map<string, Json | null> };

/** TBL-1: add, rename, retype, reorder and delete columns; select options with tones; signed money; footer summary. */
export function TableColumnsDialog({ open, onOpenChange, blockId, columns, setColumns, rows }: { open: boolean; onOpenChange: (open: boolean) => void; blockId: string; columns: Column[]; setColumns: (columns: Column[]) => void; rows: Row[] }) {
  const save = useSave();
  const [retype, setRetype] = useState<Retype | null>(null);
  const [newName, setNewName] = useState("");

  async function run(request: () => PromiseLike<{ data: unknown; error: unknown }>, rollback?: () => void) {
    try {
      await save.mutateAsync({ request, rollback });
      return true;
    } catch {
      return false;
    }
  }

  /** Rewrites the cells of the rows that hold a value in `columnId`. Rows are written in small batches. */
  async function rewriteRows(columnId: string, next: (old: Json | undefined) => Json | null | undefined) {
    const touched = rows.filter((r) => r.cells[columnId] !== undefined);
    for (let i = 0; i < touched.length; i += 20) {
      const ok = await Promise.all(
        touched.slice(i, i + 20).map((r) => {
          const cells = { ...r.cells };
          const value = next(cells[columnId]);
          if (value === null || value === undefined) delete cells[columnId];
          else cells[columnId] = value;
          return run(() => createClient().from("table_rows").update({ cells: cells as { [key: string]: Json } }).eq("id", r.id));
        }),
      );
      if (ok.includes(false)) return false;
    }
    return true;
  }

  /** Optimistic: the column changes on screen at once and goes back if the database refuses it (NFR-1, NFR-5). */
  const patch = (id: string, fields: Partial<Column>) => {
    const previous = columns;
    setColumns(columns.map((c) => (c.id === id ? { ...c, ...fields } : c)));
    return run(() => createClient().from("table_columns").update(fields).eq("id", id), () => setColumns(previous));
  };

  function askRetype(column: Column, kind: ColumnKind) {
    const cells = new Map<string, Json | null>();
    let lost = 0;
    for (const r of rows) {
      const old = r.cells[column.id];
      if (old === null || old === undefined || old === "") continue;
      const parsed = kind === "select" ? { error: "x" } : parseCell({ kind, options: [] }, typeof old === "boolean" ? String(old) : String(old));
      if ("error" in parsed) {
        lost += 1;
        cells.set(r.id, null);
      } else cells.set(r.id, parsed.value);
    }
    if (cells.size === 0 || lost === 0) void applyRetype({ column, kind, lost, cells });
    else setRetype({ column, kind, lost, cells });
  }

  async function applyRetype({ column, kind, cells }: Retype) {
    setRetype(null);
    const summary: SummaryKind = kind === "number" || kind === "money" || column.summary === "count" ? column.summary : "none";
    // The column changes first: the database checks each cell against the column's kind.
    if (!(await patch(column.id, { kind, options: [], signed: kind === "money" ? column.signed : false, summary }))) return;
    const byRow = new Map(rows.map((r) => [r.id, r]));
    for (const [rowId, value] of cells) {
      const row = byRow.get(rowId)!;
      const next = { ...row.cells };
      if (value === null) delete next[column.id];
      else next[column.id] = value;
      await run(() => createClient().from("table_rows").update({ cells: next as { [key: string]: Json } }).eq("id", rowId));
    }
  }

  function moveColumn(from: number, to: number) {
    const { next, before, after } = moveItem(columns, from, to);
    const previous = columns;
    setColumns(next);
    void run(() => reorderRequest("table_columns", columns[from].id, before, after), () => setColumns(previous));
  }

  async function removeColumn(column: Column) {
    // Cells of a deleted column would make every later edit of their row fail (unknown column), so they go first.
    if (!(await rewriteRows(column.id, () => null))) return;
    const previous = columns;
    setColumns(columns.filter((c) => c.id !== column.id));
    await run(() => createClient().from("table_columns").delete().eq("id", column.id), () => setColumns(previous));
  }

  async function setOptions(column: Column, options: SelectOption[], removed?: string) {
    if (removed && !(await rewriteRows(column.id, (old) => (old === removed ? null : old)))) return;
    await patch(column.id, { options });
  }

  async function addColumn(name: string) {
    const position = Math.max(0, ...columns.map((c) => c.position)) + 1;
    if (await run(() => createClient().from("table_columns").insert({ block_id: blockId, name, kind: "text", position }))) setNewName("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[min(44rem,calc(100%-2rem))] overflow-auto">
        <DialogTitle>Columns</DialogTitle>
        <DialogDescription>A table holds up to {MAX_COLUMNS} columns. Changing a column&apos;s type converts its cells where it can.</DialogDescription>

        {retype && (
          <div role="alert" className="rounded-md bg-signal-wash p-4">
            <p className="type-body-sm text-ink">
              {retype.lost} {retype.lost === 1 ? "cell" : "cells"} in “{retype.column.name}” can&apos;t become {KINDS.find((k) => k.value === retype.kind)!.label.toLowerCase()} and will be cleared.
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" onClick={() => void applyRetype(retype)}>
                Change the type
              </Button>
              <Button variant="ghost" onClick={() => setRetype(null)}>
                Keep it as it is
              </Button>
            </div>
          </div>
        )}

        <ul className="flex flex-col divide-y divide-hairline">
          {columns.map((c, i) => (
            <li key={c.id} className="flex flex-col gap-3 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={`Name of column ${i + 1}`}
                  defaultValue={c.name}
                  maxLength={60}
                  key={c.name}
                  onBlur={(e) => {
                    const name = e.currentTarget.value.trim() || c.name;
                    e.currentTarget.value = name;
                    if (name !== c.name) void patch(c.id, { name });
                  }}
                  className={`${inputClass} w-48 flex-1`}
                />
                <Select label={`Type of ${c.name}`} value={c.kind} onChange={(next) => askRetype(c, next as ColumnKind)} className={`${inputClass} w-32`} options={KINDS} />
                {(c.kind === "number" || c.kind === "money" || c.kind === "text" || c.kind === "select" || c.kind === "date" || c.kind === "url") && (
                  <Select
                    label={`Footer summary of ${c.name}`}
                    value={c.summary}
                    onChange={(next) => void patch(c.id, { summary: next as SummaryKind })}
                    className={`${inputClass} w-36`}
                    options={[
                      { value: "none", label: "No summary" },
                      ...((c.kind === "number" || c.kind === "money") ? [{ value: "sum", label: "Sum" }, { value: "avg", label: "Average" }] : []),
                      { value: "count", label: "Count" },
                    ]}
                  />
                )}
                <Button
                  variant="ghost"
                  aria-label={`Move ${c.name} up`}
                  disabled={i === 0}
                  onClick={() => moveColumn(i, i - 1)}
                >
                  <ArrowUp size={14} strokeWidth={1.5} aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Move ${c.name} down`}
                  disabled={i === columns.length - 1}
                  onClick={() => moveColumn(i, i + 1)}
                >
                  <ArrowDown size={14} strokeWidth={1.5} aria-hidden />
                </Button>
                <Button variant="ghost" aria-label={`Delete column ${c.name}`} disabled={columns.length === 1} onClick={() => void removeColumn(c)}>
                  <Trash2 size={14} strokeWidth={1.5} aria-hidden />
                </Button>
              </div>

              {c.kind === "money" && (
                <label className="type-body-sm flex items-center gap-2">
                  <input type="checkbox" checked={c.signed} onChange={(e) => void patch(c.id, { signed: e.target.checked })} className="size-4 accent-[var(--ink)]" />
                  Signed: income is positive, expenses are negative (shows Income, Expenses and Net)
                </label>
              )}

              {c.kind === "select" && <OptionsEditor column={c} onChange={(options, removed) => void setOptions(c, options, removed)} />}
            </li>
          ))}
        </ul>

        {columns.length < MAX_COLUMNS && (
          <form
            noValidate
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) void addColumn(newName.trim());
            }}
          >
            <input aria-label="New column name" placeholder="New column name" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} className={`${inputClass} flex-1`} />
            <Button type="submit" variant="secondary">
              <Plus size={14} strokeWidth={1.5} aria-hidden /> Add column
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OptionsEditor({ column, onChange }: { column: Column; onChange: (options: SelectOption[], removed?: string) => void }) {
  const [label, setLabel] = useState("");
  const [tone, setTone] = useState<Tone>("neutral");
  const options = column.options;
  return (
    <div className="ml-1 flex flex-col gap-2 rounded-md bg-canvas p-3">
      <p className="type-eyebrow text-ink-3-small">Options</p>
      {options.map((o, i) => (
        <div key={o.id} className="flex flex-wrap items-center gap-2">
          <input
            aria-label={`Option ${i + 1} of ${column.name}`}
            defaultValue={o.label}
            key={o.label}
            maxLength={40}
            onBlur={(e) => {
              const next = e.currentTarget.value.trim() || o.label;
              if (next !== o.label) onChange(options.map((x) => (x.id === o.id ? { ...x, label: next } : x)));
            }}
            className={`${inputClass} w-44 flex-1 py-1.5`}
          />
          <Select
            label={`Tone of ${o.label}`}
            value={o.tone}
            onChange={(next) => onChange(options.map((x) => (x.id === o.id ? { ...x, tone: next as Tone } : x)))}
            className={`${inputClass} w-32 py-1.5`}
            options={TONES}
          />
          <Button variant="ghost" aria-label={`Remove option ${o.label}`} onClick={() => onChange(options.filter((x) => x.id !== o.id), o.id)}>
            <Trash2 size={14} strokeWidth={1.5} aria-hidden />
          </Button>
        </div>
      ))}
      <form
        noValidate
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          const id = `opt_${label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20)}_${Math.random().toString(36).slice(2, 6)}`;
          onChange([...options, { id, label: label.trim(), tone }]);
          setLabel("");
        }}
      >
        <input aria-label={`New option for ${column.name}`} placeholder="New option" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} className={`${inputClass} w-44 flex-1 py-1.5`} />
        <Select label="Tone of the new option" value={tone} onChange={(next) => setTone(next as Tone)} className={`${inputClass} w-32 py-1.5`} options={TONES} />
        <Button type="submit" variant="secondary">
          Add option
        </Button>
      </form>
    </div>
  );
}
