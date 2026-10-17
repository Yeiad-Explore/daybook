"use client";

import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { useSpace } from "@/components/space/space-context";
import type { DragHandle } from "@/components/ui/sortable";
import type { Block, Slot } from "@/lib/space-page";
import { BlockFrame, type BlockActions } from "./block-frame";
import { BLOCK_TYPES } from "./block-types";

type Props = { block: Block; actions: BlockActions; drag: DragHandle };

/** Time block until Phase 2 (D-P1-2): the slots booked from tasks (TODO-6), in date order. */
export function SlotsBlock({ slots, ...props }: Props & { slots: Slot[] }) {
  const { timezone } = useSpace();
  const local = (iso: string) => new TZDate(new Date(iso), timezone);
  return (
    <BlockFrame {...props}>
      {slots.length === 0 ? (
        <p className="type-body-sm px-1 text-ink-2">No time booked yet. Use “Book time” on a task.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {slots.map((s) => (
            <li key={s.id} className="flex min-h-11 items-center gap-3 px-1">
              <span className="type-number w-32 shrink-0 text-ink-2">
                {format(local(s.starts_at), "EEE d MMM")}
                <br />
                {format(local(s.starts_at), "HH:mm")}–{format(local(s.ends_at), "HH:mm")}
              </span>
              <span className="type-body min-w-0 truncate">{s.title}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="type-caption mt-3 px-1 text-ink-3-small">Adding slots here and Google Calendar come with the Time block’s full build.</p>
    </BlockFrame>
  );
}

/** Tracker, Table and Routine bodies are Phase 2 (D-P1-3); the block already has its chrome. */
export function LaterBlock(props: Props) {
  return (
    <BlockFrame {...props}>
      <p className="type-body-sm px-1 text-ink-2">
        {BLOCK_TYPES[props.block.type].about} This block type is built in Phase 2; it keeps its place on the page until then.
      </p>
    </BlockFrame>
  );
}
