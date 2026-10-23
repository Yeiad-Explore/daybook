"use client";

import { format, parseISO } from "date-fns";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { cx } from "@/lib/cx";
import type { Json } from "@/lib/database.types";
import { currencySymbol, formatNumber } from "@/lib/money";
import { parseCell, type Column, type SelectOption, type Tone } from "@/lib/table-logic";

const DOT: Record<Tone, string> = {
  active: "bg-lime-ink",
  neutral: "bg-ink-2",
  early: "bg-ink-3",
  closed: "border border-ink-3 bg-transparent",
};

/** DESIGN.md "Table": the currency mark before the figures; taka is written Tk (Inter has no taka sign). */
export function MoneyText({ value, currency }: { value: number; currency: string }) {
  return (
    <span className="type-number tabular-nums">
      {value < 0 && "−"}
      <span className="text-[0.85em]">{currencySymbol(currency)}</span>{/^[A-Za-z]/.test(currencySymbol(currency)) && " "}
      {formatNumber(Math.abs(value))}
    </span>
  );
}

/** A select option as a status tag with its leading dot (words as well as colour, DESIGN.md). */
export function OptionTag({ option }: { option: SelectOption }) {
  return (
    <span className="type-caption inline-flex items-center gap-1.5 rounded-pill bg-canvas-2 px-2 py-[3px] text-ink">
      <span aria-hidden className={cx("size-1.5 rounded-pill", DOT[option.tone])} />
      {option.label}
    </span>
  );
}

const cellBase = "min-h-11 w-full rounded-sm px-3 py-2 text-left hover:bg-canvas focus-visible:bg-canvas";

export type CellProps = {
  column: Column;
  value: Json | undefined;
  /** Saves the new value. Returns false when it could not be saved (the cell then shows the old value again). */
  onCommit: (value: Json | null) => void;
  currency: string;
  /** For screen readers: "Calories, Rice and fish". */
  label: string;
  /** The row is still being saved: it cannot be edited until it has its real id. */
  disabled?: boolean;
};

/** One editable cell. Click to edit text, number, money and url; native controls for date, select and checkbox. */
export function Cell({ column, value, onCommit, currency, label, disabled }: CellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (column.kind === "checkbox") {
    return (
      <div className="flex min-h-11 items-center justify-center">
        <input
          type="checkbox"
          disabled={disabled}
          aria-label={label}
          checked={value === true}
          onChange={(e) => onCommit(e.target.checked)}
          className="size-5 accent-[var(--ink)]"
        />
      </div>
    );
  }

  if (column.kind === "select") {
    const current = column.options.find((o) => o.id === value);
    return (
      <div className="relative flex min-h-11 items-center px-2">
        <select
          disabled={disabled}
          aria-label={label}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onCommit(e.target.value || null)}
          className="type-caption absolute inset-0 w-full cursor-pointer appearance-none rounded-sm bg-transparent px-3 text-transparent opacity-0 focus-visible:opacity-100 focus-visible:text-ink focus-visible:bg-surface"
        >
          <option value="">–</option>
          {column.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <span aria-hidden className="pointer-events-none px-1">
          {current ? <OptionTag option={current} /> : <span className="text-ink-3-small">–</span>}
        </span>
      </div>
    );
  }

  if (column.kind === "date") {
    if (editing) {
      // One write when the picker is done (Enter or leaving the field), not one per keystroke: typing a year
      // fires a change for every valid prefix, and those writes could land out of order.
      const done = (commit: boolean) => {
        setEditing(false);
        const next = draft || null;
        const valid = next === null || "value" in parseCell(column, next);
        if (commit && valid && next !== (value ?? null)) onCommit(next);
      };
      return (
        <input
          type="date"
          autoFocus
          disabled={disabled}
          aria-label={label}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => done(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") done(true);
            if (e.key === "Escape") done(false);
          }}
          className="type-number min-h-11 w-full min-w-36 rounded-sm bg-canvas px-3 text-ink"
        />
      );
    }
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setDraft(typeof value === "string" ? value : "");
          setEditing(true);
        }}
        className={cx(cellBase, "min-w-36 text-left")}
      >
        <span className="sr-only">{label}: </span>
        {typeof value === "string" && value ? <span className="type-number">{format(parseISO(value), "d MMM yyyy")}</span> : <span className="text-ink-3-small">–</span>}
      </button>
    );
  }

  const align = column.kind === "number" || column.kind === "money" ? "text-right" : "text-left";
  const display = () => {
    if (value === null || value === undefined || value === "") return <span className="text-ink-3-small">–</span>;
    if (column.kind === "money" && typeof value === "number") return <MoneyText value={value} currency={currency} />;
    if (column.kind === "number" && typeof value === "number") return <span className="type-number tabular-nums">{formatNumber(value)}</span>;
    if (column.kind === "url" && typeof value === "string") {
      return (
        <span className="inline-flex max-w-56 items-center gap-1 truncate">
          <span className="truncate underline underline-offset-2">{value.replace(/^https?:\/\//, "")}</span>
        </span>
      );
    }
    return <span className="type-body-sm">{String(value)}</span>;
  };

  function start() {
    setDraft(value === null || value === undefined ? "" : String(value));
    setError(null);
    setEditing(true);
  }
  function finish(commit: boolean, viaBlur: boolean) {
    if (!commit) return setEditing(false);
    const result = parseCell(column, draft);
    if ("error" in result) {
      if (viaBlur) return setEditing(false); // leaving the cell reverts it; Enter keeps it open to fix
      return setError(result.error);
    }
    setEditing(false);
    if (result.value !== (value ?? null)) onCommit(result.value);
  }

  if (editing) {
    return (
      <div className="px-1 py-1">
        <input
          autoFocus
          aria-label={label}
          aria-invalid={!!error}
          aria-describedby={error ? `${label}-error` : undefined}
          value={draft}
          inputMode={column.kind === "number" || column.kind === "money" ? "decimal" : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onBlur={() => finish(true, true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") finish(true, false);
            if (e.key === "Escape") finish(false, false);
          }}
          className={cx("type-body-sm min-h-9 w-full rounded-sm border bg-surface px-2 py-1.5", align, error ? "border-signal-ink" : "border-ink")}
        />
        {error && (
          <p id={`${label}-error`} role="alert" className="type-caption px-1 pt-1 text-signal-ink">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center">
      <button type="button" disabled={disabled} onClick={start} className={cx(cellBase, align)}>
        <span className="sr-only">{label}: </span>
        {display()}
      </button>
      {column.kind === "url" && typeof value === "string" && (
        <a href={value} target="_blank" rel="noreferrer noopener" aria-label={`Open ${value}`} className="grid size-9 shrink-0 place-items-center rounded-pill text-ink-2 hover:bg-canvas-2">
          <ExternalLink size={14} strokeWidth={1.5} aria-hidden />
        </a>
      )}
    </div>
  );
}
