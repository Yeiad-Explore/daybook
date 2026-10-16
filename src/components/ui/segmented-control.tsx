"use client";

import { useRef, type KeyboardEvent } from "react";
import { cx } from "@/lib/cx";

type Option<T extends string> = { value: T; label: string };

/**
 * DESIGN.md "Segmented control": canvas-2 pill track; the active item is a white pill with the
 * card shadow. A radio group: one Tab stop, arrow keys move and select (WAI-ARIA radio pattern).
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className={cx("inline-flex w-fit gap-0.5 rounded-pill bg-canvas-2 p-0.5", className)}>
      {options.map((option, i) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              "type-button rounded-pill px-2.5 py-1.5 text-[12px] transition-colors pointer-coarse:min-h-11",
              checked ? "bg-surface text-ink shadow-card" : "text-ink-3-small hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
