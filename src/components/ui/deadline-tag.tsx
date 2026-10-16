import { deadlineTag, type DeadlineState } from "@/lib/deadline-tag";
import { cx } from "@/lib/cx";
import { Tag } from "./tag";

// DESIGN.md "Deadline tag" (v2.2 colours): status in words and colour, never colour alone.
const STATES: Record<DeadlineState, string> = {
  future: "bg-canvas-2 text-ink-2",
  soon: "bg-surface text-ink border border-hairline",
  today: "bg-surface-dark text-on-dark",
  late: "bg-signal-wash text-signal-ink",
  done: "text-ink-3-small line-through",
};

export function DeadlineTag({
  due,
  dueTime,
  done,
  today,
  movedCount = 0,
}: {
  due: string;
  dueTime?: string | null;
  done: boolean;
  today: string;
  movedCount?: number;
}) {
  const { text, state, full } = deadlineTag({ due, dueTime, done, today });
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <span className={cx("type-number inline-flex items-center gap-1 rounded-pill px-2 py-[3px] text-[12px]", STATES[state])}>
        {state === "late" && <span aria-hidden className="size-1.5 rounded-pill bg-signal" />}
        <time dateTime={due} title={full}>
          {text}
        </time>
        <span className="sr-only">{state === "done" ? `, done, was due ${full}` : `, due ${full}`}</span>
      </span>
      {movedCount > 0 && <Tag>moved {movedCount}×</Tag>}
    </span>
  );
}
