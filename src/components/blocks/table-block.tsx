"use client";

import { ChevronDown, GripVertical, Plus, Trash2 } from "lucide-react";
import { Fragment, useState } from "react";
import { useSpace } from "@/components/space/space-context";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { Sortable, type DragHandle } from "@/components/ui/sortable";
import { useToast } from "@/components/ui/toast";
import { cx } from "@/lib/cx";
import type { Json } from "@/lib/database.types";
import { errorMessage } from "@/lib/db-error";
import { formatNumber } from "@/lib/money";
import { moveItem, positionBetween } from "@/lib/move-item";
import { reorderRequest } from "@/lib/reorder";
import type { Block } from "@/lib/space-page";
import { createClient } from "@/lib/supabase/client";
import { applyFilters, groupByMonth, incomeExpenses, parseCell, parseColumnNames, sortRows, summarize, type Column, type Row, type TableConfig } from "@/lib/table-logic";
import { useSave } from "@/lib/use-save";
import { useServerState } from "@/lib/use-server-state";
import { BlockFrame, type BlockActions } from "./block-frame";
import { Cell, MoneyText } from "./table-cell";
import { TableColumnsDialog } from "./table-columns-dialog";
import { TableToolbar } from "./table-toolbar";

/** PRD §6.8 Table block (TBL-1..5, TBL-7): setup, typed cells, rows, ledger strip, summaries, filters, sort, month groups. */
export function TableBlock({
  block,
  columns: serverColumns,
  rows: serverRows,
  actions,
  drag,
  setConfig,
}: {
  block: Block;
  columns: Column[];
  rows: Row[];
  actions: BlockActions;
  drag: DragHandle;
  setConfig: (config: TableConfig) => void;
}) {
  const { today, currency, weekStartsOn } = useSpace();
  const save = useSave();
  const toast = useToast();
  const [columns, setColumns] = useServerState(serverColumns);
  const [rows, setRows] = useServerState(serverRows);
  const [manage, setManage] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const config = block.config as TableConfig;

  async function createColumns(names: string[]) {
    try {
      await save.mutateAsync({ request: () => createClient().from("table_columns").insert(names.map((name, i) => ({ block_id: block.id, name, kind: "text" as const, position: i + 1 }))) });
    } catch {
      /* the toast already says why */
    }
  }

  if (columns.length === 0) {
    return (
      <BlockFrame block={block} actions={actions} drag={drag}>
        <SetupForm onCreate={createColumns} />
      </BlockFrame>
    );
  }

  const visible = sortRows(applyFilters(rows, columns, config.filters, today, weekStartsOn), columns, config.sort);
  const ledger = columns.find((c) => c.kind === "money" && c.signed);
  const groupColumn = columns.find((c) => c.id === config.group_by_month_column_id && c.kind === "date");
  const groups = groupColumn ? groupByMonth(visible, groupColumn.id, config.sort?.column_id === groupColumn.id ? config.sort.dir === "desc" : true) : null;
  const filtered = (config.filters?.length ?? 0) > 0;
  const manualOrder = !config.sort && !filtered && !groups;

  function editCell(row: Row, column: Column, value: Json | null) {
    const cells = { ...row.cells };
    if (value === null) delete cells[column.id];
    else cells[column.id] = value;
    const previous = rows;
    setRows(rows.map((r) => (r.id === row.id ? { ...r, cells } : r)));
    save.mutate({ request: () => createClient().from("table_rows").update({ cells: cells as { [key: string]: Json } }).eq("id", row.id), rollback: () => setRows(previous) });
  }

  async function addRow(cells: Record<string, Json>) {
    const position = Math.max(0, ...rows.map((r) => r.position)) + 1;
    const previous = rows;
    const temp = `new-${crypto.randomUUID()}`;
    setRows([...rows, { id: temp, cells, position }]);
    try {
      const saved = (await save.mutateAsync({ request: () => createClient().from("table_rows").insert({ block_id: block.id, cells, position }).select("id").single(), rollback: () => setRows(previous) })) as { id: string };
      // The real id replaces the temporary one at once, so the new row can be edited or deleted before the refresh lands.
      setRows((all) => all.map((r) => (r.id === temp ? { ...r, id: saved.id } : r)));
      return true;
    } catch {
      return false;
    }
  }

  /** TBL-2: a row goes to Trash (restorable for 30 days) with Undo for 6 seconds. */
  async function trashRow(row: Row) {
    const supabase = createClient();
    const { error } = await supabase.from("table_rows").update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
    if (error) return toast.error(errorMessage(error));
    setRows((all) => all.filter((r) => r.id !== row.id));
    toast.undoable("Row moved to Trash.", async () => {
      const { error: undoError } = await supabase.rpc("restore_item", { p_table: "table_rows", p_id: row.id });
      if (undoError) toast.error(errorMessage(undoError));
      else setRows((all) => [...all, row]);
    });
  }

  function moveRow(from: number, to: number) {
    const { before, after } = moveItem(visible, from, to);
    const id = visible[from].id;
    const position = positionBetween(visible, before, after);
    const previous = rows;
    setRows(rows.map((r) => (r.id === id ? { ...r, position } : r)));
    save.mutate({ request: () => reorderRequest("table_rows", id, before, after), rollback: () => setRows(previous) });
  }

  const money = (column: Column, value: number) => (column.kind === "money" ? <MoneyText value={value} currency={currency} /> : <span className="type-number tabular-nums">{formatNumber(value)}</span>);
  const summaryCell = (column: Column, list: Row[]) => {
    const value = summarize(column, list);
    if (value === null) return null;
    return (
      <>
        <span className="type-caption mr-1.5 text-ink-3-small">{{ sum: "Sum", avg: "Average", count: "Count", none: "" }[column.summary]}</span>
        <strong className="font-semibold">{column.summary === "count" ? value : money(column, value)}</strong>
      </>
    );
  };
  const hasSummary = columns.some((c) => c.summary !== "none");

  const renderRow = (row: Row, handle?: DragHandle) => (
    <tr key={row.id} ref={handle?.ref as never} style={handle?.style} className={cx("group/row border-t border-hairline hover:bg-canvas/60", handle?.dragging && "bg-surface shadow-float")}>
      <td className="w-8 px-1">
        {manualOrder && handle && (
          <button type="button" aria-label="Move row (drag, or Space and arrow keys)" {...handle.handle} className="grid size-8 cursor-grab place-items-center rounded-sm text-ink-3-small opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden">
            <GripVertical size={14} strokeWidth={1.5} aria-hidden />
          </button>
        )}
      </td>
      {columns.map((c) => (
        <td key={c.id} className="min-w-28 p-0 align-middle">
          <Cell
            column={c}
            value={row.cells[c.id]}
            currency={currency}
            disabled={row.id.startsWith("new-")}
            label={`${c.name}, row ${rows.indexOf(row) + 1}`}
            onCommit={(value) => editCell(row, c, value)}
          />
        </td>
      ))}
      <td className="w-10 px-1">
        <button type="button" aria-label={`Delete row ${rows.indexOf(row) + 1}`} disabled={row.id.startsWith("new-")} onClick={() => void trashRow(row)} className="grid size-8 place-items-center rounded-pill text-ink-2 opacity-0 hover:bg-canvas-2 group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100">
          <Trash2 size={14} strokeWidth={1.5} aria-hidden />
        </button>
      </td>
    </tr>
  );

  return (
    <BlockFrame
      block={block}
      actions={actions}
      drag={drag}
      controls={
        <Button variant="ghost" onClick={() => setManage(true)}>
          Columns
        </Button>
      }
    >
      <TableToolbar columns={columns} config={config} onChange={setConfig} />

      {ledger && (
        <dl className="mb-3 grid grid-cols-3 gap-2 rounded-md bg-canvas p-3" aria-label="Income, expenses and net for the rows shown">
          {(() => {
            const t = incomeExpenses(ledger, visible);
            return (
              [
                ["Income", t.income, false],
                ["Expenses", t.expenses, false],
                ["Net", t.net, true],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="type-eyebrow text-ink-3-small">{label}</dt>
                <dd className={cx("type-number-lg", label === "Net" && value < 0 && "text-signal-ink")}>
                  <MoneyText value={value} currency={currency} />
                  {label === "Net" && value < 0 && <span className="type-caption ml-2 text-signal-ink">negative</span>}
                </dd>
              </div>
            ));
          })()}
        </dl>
      )}

      {/* relative: the screen-reader-only text in cells is absolutely positioned and must be clipped here, not widen the page */}
      <div className="relative overflow-x-auto rounded-md ring-1 ring-hairline">
        <table className="type-body-sm w-full min-w-max border-collapse">
          <thead className="bg-canvas-2">
            <tr>
              <th className="w-8" aria-hidden />
              {columns.map((c) => (
                <th key={c.id} scope="col" className={cx("type-eyebrow px-3 py-2.5 whitespace-nowrap text-ink-3-small", c.kind === "number" || c.kind === "money" ? "text-right" : c.kind === "checkbox" ? "text-center" : "text-left")}>
                  {c.name}
                </th>
              ))}
              <th className="w-10" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-6 text-center text-ink-2">
                  No rows yet. Add the first one below.
                </td>
              </tr>
            )}
            {rows.length > 0 && visible.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-6 text-center text-ink-2">
                  No rows match these filters.
                </td>
              </tr>
            )}
            {groups
              ? groups.map((g) => (
                  <Fragment key={g.key}>
                    <tr className="border-t border-hairline bg-canvas">
                      <th scope="rowgroup" colSpan={2} className="px-2 py-1 text-left">
                        <button type="button" aria-expanded={!collapsed.has(g.key)} onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })} className="type-heading inline-flex min-h-9 items-center gap-1.5 rounded-sm px-2 hover:bg-canvas-2 pointer-coarse:min-h-11">
                          <ChevronDown size={14} strokeWidth={1.5} aria-hidden className={cx("transition-transform", collapsed.has(g.key) && "-rotate-90")} />
                          {g.label}
                          <span className="type-caption text-ink-3-small">
                            {g.rows.length} {g.rows.length === 1 ? "row" : "rows"}
                          </span>
                        </button>
                      </th>
                      {columns.slice(1).map((c) => (
                        <td key={c.id} className={cx("px-3 py-1 whitespace-nowrap", c.kind === "number" || c.kind === "money" ? "text-right" : "")}>
                          {summaryCell(c, g.rows)}
                        </td>
                      ))}
                      <td />
                    </tr>
                    {!collapsed.has(g.key) && g.rows.map((r) => renderRow(r))}
                  </Fragment>
                ))
              : manualOrder
                ? <Sortable id={`rows-${block.id}`} items={visible} onMove={moveRow} render={(row, handle) => renderRow(row, handle)} />
                : visible.map((r) => renderRow(r))}
            <AddRow columns={columns} defaultDate={config.filters?.some((f) => f.op === "is_today") ? today : ""} onAdd={addRow} />
          </tbody>
          {hasSummary && (
            <tfoot className="border-t border-hairline-strong bg-canvas-2">
              <tr>
                <td />
                {columns.map((c, i) => (
                  <td key={c.id} className={cx("px-3 py-2.5 whitespace-nowrap", c.kind === "number" || c.kind === "money" ? "text-right" : "")}>
                    {i === 0 && c.summary === "none" ? <span className="type-caption text-ink-3-small">{filtered ? "Rows shown" : "All rows"}</span> : summaryCell(c, visible)}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {filtered && (
        <p className="type-caption mt-2 text-ink-3-small">
          Showing {visible.length} of {rows.length} rows.
        </p>
      )}

      <TableColumnsDialog open={manage} onOpenChange={setManage} blockId={block.id} columns={columns} setColumns={setColumns} rows={rows} />
    </BlockFrame>
  );
}

/** TBL-1 AC1: "Name the columns, separated by commas" creates text columns that can be retyped afterwards. */
function SetupForm({ onCreate }: { onCreate: (names: string[]) => Promise<void> }) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const names = parseColumnNames(text);
        if (names.length === 0) return setProblem("Name at least one column, like Date, Item, Amount.");
        setProblem(null);
        void onCreate(names);
      }}
    >
      <Field id="table-setup" label="Name the columns, separated by commas" error={problem ?? undefined} hint="They start as text columns. You can change each one to a number, money, date and more afterwards.">
        <input id="table-setup" value={text} placeholder="Date, Item, Amount" onChange={(e) => setText(e.target.value)} className={inputClass} />
      </Field>
      <Button type="submit" variant="primary" className="self-end" icon={<Plus size={12} strokeWidth={2} />}>
        Create table
      </Button>
    </form>
  );
}

/** TBL-2: the inline add form is the last row of the table, one control per column. */
function AddRow({ columns, defaultDate, onAdd }: { columns: Column[]; defaultDate: string; onAdd: (cells: Record<string, Json>) => Promise<boolean> }) {
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [problems, setProblems] = useState<string[]>([]);
  const value = (c: Column) => draft[c.id] ?? (c.kind === "date" ? defaultDate : c.kind === "checkbox" ? false : "");

  async function submit() {
    const cells: Record<string, Json> = {};
    const errors: string[] = [];
    for (const c of columns) {
      const result = parseCell(c, value(c));
      if ("error" in result) errors.push(`${c.name}: ${result.error}`);
      else if (result.value !== null && !(c.kind === "checkbox" && result.value === false)) cells[c.id] = result.value;
    }
    setProblems(errors);
    if (errors.length) return;
    if (Object.keys(cells).length === 0) return setProblems(["Fill in at least one cell."]);
    if (await onAdd(cells)) setDraft({});
  }

  return (
    <>
      <tr className="border-t border-hairline bg-canvas/50">
        <td />
        {columns.map((c, i) => (
          <td key={c.id} className="p-1 align-middle">
            {c.kind === "checkbox" ? (
              <div className="flex min-h-11 items-center justify-center">
                <input type="checkbox" aria-label={`New row: ${c.name}`} checked={value(c) === true} onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.checked }))} className="size-5 accent-[var(--ink)]" />
              </div>
            ) : c.kind === "select" ? (
              <select aria-label={`New row: ${c.name}`} value={String(value(c))} onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))} className="type-body-sm min-h-9 w-full rounded-pill bg-surface px-3 ring-1 ring-inset ring-ink-3">
                <option value="">{c.name}</option>
                {c.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label={`New row: ${c.name}`}
                type={c.kind === "date" ? "date" : "text"}
                placeholder={i === 0 ? `+ ${c.name}` : c.name}
                inputMode={c.kind === "number" || c.kind === "money" ? "decimal" : undefined}
                value={String(value(c))}
                onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
                className={cx("type-body-sm min-h-9 w-full min-w-24 rounded-pill bg-surface px-3 ring-1 ring-inset ring-ink-3 placeholder:text-ink-3-small", (c.kind === "number" || c.kind === "money") && "text-right")}
              />
            )}
          </td>
        ))}
        <td className="px-1">
          <button type="button" aria-label="Add row" onClick={() => void submit()} className="grid size-9 place-items-center rounded-pill bg-surface-dark text-on-dark pointer-coarse:size-11">
            <Plus size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </td>
      </tr>
      {problems.length > 0 && (
        <tr>
          <td />
          <td colSpan={columns.length + 1} className="px-3 pb-2">
            {problems.map((p) => (
              <p key={p} role="alert" className="type-caption text-signal-ink">
                {p}
              </p>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}
