import { Check, Flag } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { deadlineTag } from "@/lib/deadline-tag";
import { cx } from "@/lib/cx";
import type { Enums } from "@/lib/database.types";
import { DeadlineTag } from "./deadline-tag";

type MarkColor = Enums<"mark_color">;

/**
 * DESIGN.md "Task row" (v2.2): 44px row, circular checkbox (ink-3 border; checked = black circle,
 * white tick), title, optional source line with the space's aura dot, deadline tag, menu on hover.
 * Late rows add an ember dot before the title. Without onToggle (a roadmap step with sub-steps,
 * RM-3) the checkbox gives way to `lead`.
 */
export function TaskRow({
  title,
  done,
  onToggle,
  due,
  dueTime,
  today,
  movedCount,
  doneLate,
  milestone,
  source,
  titleSlot,
  detail,
  lead,
  menu,
  menuVisible,
  className,
  rowRef,
  style,
}: {
  title: string;
  done: boolean;
  onToggle?: (done: boolean) => void;
  due?: string | null;
  dueTime?: string | null;
  today: string;
  movedCount?: number;
  doneLate?: boolean;
  milestone?: boolean;
  source?: { mark: MarkColor; label: string; href?: string };
  /** Replaces the plain title (e.g. an inline editor, TODO-4). */
  titleSlot?: ReactNode;
  /** A line under the title (the task's note). */
  detail?: ReactNode;
  lead?: ReactNode;
  menu?: ReactNode;
  /** Show the menu cell all the time (Today's Overdue actions), not only on hover. */
  menuVisible?: boolean;
  className?: string;
  /** Drag-to-reorder wiring (Sortable) lands on the row itself, so the list stays li-only. */
  rowRef?: (el: HTMLLIElement | null) => void;
  style?: CSSProperties;
}) {
  const late = !!due && deadlineTag({ due, done, today }).state === "late";

  return (
    <li ref={rowRef} style={style} className={cx("group flex min-h-11 items-center gap-2 rounded-md bg-surface pr-2 hover:bg-canvas", className)}>
      {onToggle ? (
        // 44px touch target around the 18px circle
        <label className="relative grid size-11 shrink-0 cursor-pointer place-items-center">
          <input
            type="checkbox"
            checked={done}
            onChange={(e) => onToggle(e.target.checked)}
            aria-label={`Done: ${title}`}
            className="peer size-4.5 cursor-pointer appearance-none rounded-pill border-[1.5px] border-ink-3 checked:border-surface-dark checked:bg-surface-dark"
          />
          <Check aria-hidden size={12} strokeWidth={2} className="pointer-events-none absolute hidden text-on-dark peer-checked:block" />
        </label>
      ) : (
        <span className="grid size-11 shrink-0 place-items-center">{lead}</span>
      )}
      <div className="min-w-0 flex-1 py-1">
        <div className="type-body flex min-w-0 items-center gap-2">
          {late && <span aria-hidden className="size-1.5 shrink-0 rounded-pill bg-signal" />}
          {titleSlot ?? <span className={cx("truncate max-tablet:line-clamp-2 max-tablet:whitespace-normal", done && "text-ink-3-small line-through")}>{title}</span>}
          {milestone && (
            <Flag size={12} strokeWidth={1.5} className="shrink-0 text-ink-2" aria-label="On the Deadline Rail" role="img" />
          )}
        </div>
        {detail}
        {source && (
          <p className="type-caption flex items-center gap-1.5 text-ink-3-small">
            <span aria-hidden data-mark={source.mark} className="size-2.5 shrink-0 rounded-pill bg-aura-mid" />
            {source.href ? (
              <a href={source.href} className="truncate hover:text-ink hover:underline">
                {source.label}
              </a>
            ) : (
              source.label
            )}
          </p>
        )}
      </div>
      {due && <DeadlineTag due={due} dueTime={dueTime} done={done} doneLate={doneLate} today={today} movedCount={movedCount} />}
      {menu && (
        <div className={cx(!menuVisible && "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100")}>{menu}</div>
      )}
    </li>
  );
}
