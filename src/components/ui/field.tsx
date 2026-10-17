import type { ReactNode } from "react";

/** DESIGN.md "Inputs": white, 1px ink-3 border (controls need 3:1), radius sm; focus ring from the base layer. */
export const inputClass =
  "type-body w-full rounded-sm border border-ink-3 bg-surface px-3 py-2.5 text-ink placeholder:text-ink-3-small";

export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="type-heading">
        {label}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="type-caption text-ink-3-small">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="type-caption text-signal-ink">
          {error}
        </p>
      )}
    </div>
  );
}

