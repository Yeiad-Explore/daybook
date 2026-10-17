"use client";

import { format, parseISO } from "date-fns";
import { useState } from "react";
import { RescheduleDialog } from "@/components/deadlines/reschedule-dialog";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { TaskRow } from "@/components/ui/task-row";
import { blockHref, type AgendaRow, type TodayData } from "@/lib/deadlines";
import { createClient } from "@/lib/supabase/client";
import { useSave } from "@/lib/use-save";
import { useServerState } from "@/lib/use-server-state";

/**
 * PRD §5.3 agenda column: Overdue (hidden when empty, DL-10: only Done or Reschedule take a row out),
 * Due today (unfinished first), Next 7 days grouped by date. Checking and rescheduling here change
 * the source task (TODAY-3); every row links to its block (§5.1 deep link).
 */
export function Agenda({ data: serverData }: { data: TodayData }) {
  const [data, setData] = useServerState(serverData);
  const [moving, setMoving] = useState<AgendaRow | null>(null);
  const save = useSave();
  const today = data.today;

  function toggle(row: AgendaRow, done: boolean) {
    const previous = data;
    const flip = (rows: AgendaRow[]) => rows.map((r) => (r.id === row.id ? { ...r, done } : r));
    setData({ ...data, overdue: flip(data.overdue), due_today: flip(data.due_today), next_7: flip(data.next_7) });
    save.mutate({ request: () => createClient().rpc("set_task_done", { p_task_id: row.id, p_done: done }), rollback: () => setData(previous) });
  }

  const rows = (list: AgendaRow[], late = false) => (
    <ul className="flex flex-col divide-y divide-hairline">
      {list.map((row) => (
        <TaskRow
          key={row.id}
          title={row.title}
          done={row.done}
          onToggle={(done) => toggle(row, done)}
          due={row.due_date}
          dueTime={row.due_time}
          today={today}
          movedCount={row.reschedule_count}
          doneLate={row.done_late}
          milestone={row.is_milestone}
          source={{ mark: row.mark, label: row.source, href: blockHref(row) }}
          menuVisible={late}
          menu={
            !row.done && (
              <Button variant={late ? "secondary" : "ghost"} onClick={() => setMoving(row)} aria-label={`Reschedule ${row.title}`}>
                Reschedule
              </Button>
            )
          }
        />
      ))}
    </ul>
  );

  // Checked rows leave Overdue and Next 7 days at once (Due today keeps them, struck through).
  const overdue = data.overdue.filter((r) => !r.done);
  const byDay = Map.groupBy(data.next_7.filter((r) => !r.done), (r) => r.due_date);

  return (
    <div className="flex flex-col gap-5">
      {overdue.length > 0 && (
        <section aria-labelledby="overdue" className="overflow-hidden rounded-lg bg-surface shadow-card">
          <h2 id="overdue" className="type-heading flex items-center gap-2 bg-signal-wash px-6 py-3 text-ink">
            <span aria-hidden className="size-2 rounded-pill bg-signal" />
            Overdue <span className="type-number text-signal-ink">{overdue.length}</span>
          </h2>
          <div className="px-4 py-2 tablet:px-6">{rows(overdue, true)}</div>
        </section>
      )}

      <Panel role="region" aria-labelledby="due-today" className="py-5">
        <h2 id="due-today" className="type-heading">
          Due today
        </h2>
        {data.due_today.length === 0 ? <p className="type-body-sm mt-2 text-ink-2">Nothing is due today.</p> : <div className="mt-2">{rows(data.due_today)}</div>}
      </Panel>

      <Panel role="region" aria-labelledby="next-7" className="py-5">
        <h2 id="next-7" className="type-heading">
          Next 7 days
        </h2>
        {byDay.size === 0 && <p className="type-body-sm mt-2 text-ink-2">Nothing due in the next 7 days.</p>}
        {[...byDay].map(([day, list]) => (
          <section key={day} aria-label={format(parseISO(day), "EEEE d MMMM")} className="mt-3">
            <h3 className="type-eyebrow px-1 text-ink-3-small">{format(parseISO(day), "EEEE d MMM")}</h3>
            {rows(list)}
          </section>
        ))}
      </Panel>

      {moving && (
        <RescheduleDialog
          target={{ kind: "task", id: moving.id, title: moving.title, due: moving.due_date }}
          today={today}
          open
          onOpenChange={(open) => !open && setMoving(null)}
        />
      )}
    </div>
  );
}
