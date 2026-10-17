"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { blockHref, type TodayTracker } from "@/lib/deadlines";
import { formatNumber } from "@/lib/money";
import { entriesToLog } from "@/lib/tracker-logic";
import { createClient } from "@/lib/supabase/client";
import { useSave } from "@/lib/use-save";
import { useServerState } from "@/lib/use-server-state";

/**
 * PRD §5.3 item 6: every Tracker block with a compact "log today" form (one input per field, pre-filled
 * when logged). Once today has values it reads "Logged" with them; "Change" reopens the form.
 */
export function TrackersCard({ trackers, today }: { trackers: TodayTracker[]; today: string }) {
  if (trackers.length === 0) return null;
  return (
    <section aria-label="Trackers" className="flex flex-col gap-4">
      {trackers.map((t) => (
        <TrackerForm key={t.block_id} tracker={t} today={today} />
      ))}
    </section>
  );
}

function TrackerForm({ tracker: serverTracker, today }: { tracker: TodayTracker; today: string }) {
  const save = useSave();
  const [tracker, setTracker] = useServerState(serverTracker);
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const shown = (f: TodayTracker["fields"][number]) => typed[f.id] ?? (f.today_value === null ? "" : String(f.today_value));

  function submit() {
    const result = entriesToLog(tracker.fields, (id) => shown(tracker.fields.find((f) => f.id === id)!), tracker.block_id, today);
    if ("error" in result) return setProblem(result.error);
    const { rows } = result;
    setProblem(null);
    const values = new Map(rows.map((r) => [r.field_id, r.value]));
    setTracker({ ...tracker, logged: true, fields: tracker.fields.map((f) => ({ ...f, today_value: values.get(f.id) ?? f.today_value })) });
    setEditing(false);
    setTyped({});
    save.mutate({ request: () => createClient().from("tracker_entries").upsert(rows, { onConflict: "field_id,entry_date" }) });
  }

  const showForm = !tracker.logged || editing;
  return (
    <Panel className="flex flex-col gap-3 p-5" aria-label={`${tracker.title}: log today`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={blockHref(tracker)} prefetch={false} className="type-heading underline-offset-4 hover:underline">
            {tracker.title}
          </Link>
          <p className="type-caption flex items-center gap-1.5 text-ink-3-small">
            <span aria-hidden data-mark={tracker.mark} className="size-2 rounded-pill bg-aura-mid" />
            {tracker.space_name}
          </p>
        </div>
        {tracker.logged && <Tag variant="outlined">Logged</Tag>}
      </div>

      {showForm ? (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            {tracker.fields.map((f) => (
              <Field key={f.id} id={`today-${f.id}`} label={f.unit ? `${f.label} (${f.unit})` : f.label}>
                <input id={`today-${f.id}`} inputMode="decimal" value={shown(f)} placeholder="–" onChange={(e) => setTyped((t) => ({ ...t, [f.id]: e.target.value }))} className={inputClass} />
              </Field>
            ))}
          </div>
          {problem && (
            <p role="alert" className="type-body-sm text-signal-ink">
              {problem}
            </p>
          )}
          <Button type="submit" variant="primary" className="self-end" icon={<ArrowRight size={12} strokeWidth={2} />}>
            Log today
          </Button>
        </form>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {tracker.fields.map((f) => (
              <div key={f.id}>
                <dt className="type-caption text-ink-3-small">{f.label}</dt>
                <dd className="type-number-lg">
                  {f.today_value === null ? "–" : formatNumber(f.today_value, f.decimals)}
                  {f.unit && f.today_value !== null && <span className="type-body-sm ml-1 text-ink-3-small">{f.unit}</span>}
                </dd>
              </div>
            ))}
          </dl>
          <Button variant="ghost" className="self-start" onClick={() => setEditing(true)}>
            Change today&apos;s values
          </Button>
        </>
      )}
    </Panel>
  );
}
