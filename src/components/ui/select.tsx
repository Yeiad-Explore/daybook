"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";
import { inputClass } from "./field";

/** A form select whose list is the same frosted menu as every other dropdown. */
export function Select({
  id,
  name,
  label,
  value,
  defaultValue = "",
  onChange,
  options,
  disabled,
  className,
  describedBy,
  children,
}: {
  id?: string;
  name?: string;
  label?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  className?: string;
  describedBy?: string;
  children?: ReactNode;
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const selected = value ?? uncontrolled;
  const current = options.find((o) => o.value === selected);

  function pick(next: string) {
    setUncontrolled(next);
    onChange?.(next);
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={selected} />}
      <DropdownMenu>
        <DropdownMenuTrigger
          type="button"
          id={id}
          aria-label={label}
          aria-describedby={describedBy}
          disabled={disabled}
          data-value={selected}
          className={cx("inline-flex items-center justify-between gap-2 text-left disabled:opacity-50 data-[popup-open]:[&_svg]:rotate-180", className ?? inputClass)}
        >
          {children ?? <span className="min-w-0 truncate">{current?.label ?? "Choose"}</span>}
          <ChevronDown size={14} strokeWidth={1.5} aria-hidden className="shrink-0 text-ink-3-small" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          {options.map((o, i) => (
            <DropdownMenuItem key={`${o.value}:${i}`} onClick={() => pick(o.value)}>
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.value === selected && <Check size={14} strokeWidth={1.5} aria-hidden className="ml-auto shrink-0" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
