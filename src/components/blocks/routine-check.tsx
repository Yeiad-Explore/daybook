import { Check } from "lucide-react";
import { cx } from "@/lib/cx";

/** DESIGN.md "Routine card": a circular check at the end of the row, black when done (never colour alone: it holds a tick). */
export function RoutineCheck({ label, checked, disabled, onToggle }: { label: string; checked: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className="group grid size-11 shrink-0 place-items-center rounded-pill"
    >
      <span
        aria-hidden
        className={cx(
          "grid size-6 place-items-center rounded-pill border-[1.5px] transition-colors",
          checked ? "border-surface-dark-fixed bg-surface-dark-fixed text-on-dark-fixed" : "border-ink-3 bg-transparent group-hover:border-ink",
        )}
      >
        {checked && <Check size={14} strokeWidth={2.25} />}
      </span>
    </button>
  );
}
