import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { deadlineTag } from "@/lib/deadline-tag";
import { cx } from "@/lib/cx";
import { DeadlineTag } from "./deadline-tag";

type MarkColor = "moss" | "slate" | "ochre" | "teal" | "clay" | "graphite";

/**
 * DESIGN.md "Task row" (v2.2): 44px row, circular checkbox (ink-3 border; checked = black circle,
 * white tick), title, optional source line with the space's aura dot, deadline tag, menu on hover.
 * Late rows add an ember dot before the title.
 */
export function TaskRow({
  title,
  done,
  onToggle,
  due,
  dueTime,
  today,
  movedCount,
  source,
  menu,
}: {
  title: string;
  done: boolean;
  onToggle: (done: boolean) => void;
  due?: string | null;
  dueTime?: string | null;
  today: string;
  movedCount?: number;
  source?: { mark: MarkColor; label: string };
  menu?: ReactNode;
}) {
  const late = !!due && deadlineTag({ due, done, today }).state === "late";

  return (
    <li className="group flex min-h-11 items-center gap-2 rounded-md pr-2 hover:bg-canvas">
      {/* 44px touch target around the 18px circle */}
      <label className="relative grid size-11 shrink-0 cursor-pointer place-items-center">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Done: ${title}`}
          className="peer size-4.5 cursor-pointer appearance-none rounded-pill border-[1.5px] border-ink-3 checked:border-surface-dark checked:bg-surface-dark"
        />
        <Check
          aria-hidden
          size={12}
          strokeWidth={2}
          className="pointer-events-none absolute hidden text-on-dark peer-checked:block"
        />
      </label>
      <div className="min-w-0 flex-1 py-1">
        <p className="type-body flex items-center gap-2">
          {late && <span aria-hidden className="size-1.5 shrink-0 rounded-pill bg-signal" />}
          <span className={cx("truncate", done && "text-ink-3-small line-through")}>{title}</span>
        </p>
        {source && (
          <p className="type-caption flex items-center gap-1.5 text-ink-3-small">
            <span aria-hidden data-mark={source.mark} className="size-2.5 shrink-0 rounded-pill bg-aura-mid" />
            {source.label}
          </p>
        )}
      </div>
      {due && <DeadlineTag due={due} dueTime={dueTime} done={done} today={today} movedCount={movedCount} />}
      {menu && <div className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">{menu}</div>}
    </li>
  );
}
