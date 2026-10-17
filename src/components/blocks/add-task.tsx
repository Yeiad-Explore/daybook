"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { cx } from "@/lib/cx";

/**
 * DESIGN.md "Inputs": an inline add form is one pill row at the bottom of a block: the title field, a
 * date pill and a black pill button. The date is required where the rules need it (§7.1); its max is
 * the goal's or the parent's deadline, with that rule's own sentence when it is exceeded (TODO-1 AC1,
 * RM-2 AC1). The database checks again either way.
 */
export function AddTask({
  label,
  dateRequired,
  max,
  maxMessage,
  withTime,
  onAdd,
}: {
  label: string;
  dateRequired: boolean;
  max?: string | null;
  maxMessage?: string;
  withTime?: boolean;
  onAdd: (fields: { title: string; due_date: string | null; due_time: string | null }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) return setProblem("Give it a title.");
    if (dateRequired && !date) return setProblem("A goal needs a deadline for every task.");
    if (max && date > max) return setProblem(maxMessage ?? null);
    setProblem(null);
    const added = await onAdd({ title: title.trim(), due_date: date || null, due_time: time || null });
    if (added) {
      setTitle("");
      setTime("");
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="mt-2 flex flex-col gap-1.5"
    >
      <div className="flex flex-wrap items-center gap-1.5 rounded-pill bg-canvas p-1 ring-1 ring-inset ring-ink-3 focus-within:ring-ink max-tablet:rounded-md">
        <input
          aria-label={label}
          placeholder={`+ ${label}`}
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          className="type-body min-w-40 flex-1 rounded-pill bg-transparent px-3 py-1.5 placeholder:text-ink-3-small focus-visible:shadow-none focus-visible:outline-none"
        />
        <input
          aria-label="Deadline"
          type="date"
          value={date}
          max={max ?? undefined}
          required={dateRequired}
          onChange={(e) => setDate(e.target.value)}
          className="type-number min-h-9 rounded-pill bg-surface px-3 text-ink ring-1 ring-inset ring-ink-3 pointer-coarse:min-h-11"
        />
        {withTime && (
          <input
            aria-label="Time (optional)"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="type-number min-h-9 rounded-pill bg-surface px-3 text-ink ring-1 ring-inset ring-ink-3 pointer-coarse:min-h-11"
          />
        )}
        <button
          type="submit"
          aria-label={`Add: ${title || label}`}
          className={cx("type-button grid size-9 place-items-center rounded-pill bg-surface-dark text-on-dark pointer-coarse:size-11")}
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      {problem && (
        <p role="alert" className="type-caption px-3 text-signal-ink">
          {problem}
        </p>
      )}
    </form>
  );
}
