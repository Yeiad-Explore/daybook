"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useSpace } from "@/components/space/space-context";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tag } from "@/components/ui/tag";
import { formatNumber } from "@/lib/money";
import type { Block, TrackerField } from "@/lib/space-page";
import { createClient } from "@/lib/supabase/client";
import { entriesInRange, entriesToLog, metaLine, RANGES, trendTag, type Range, type Series } from "@/lib/tracker-logic";
import { useSave } from "@/lib/use-save";
import { useServerState } from "@/lib/use-server-state";
import { BlockFrame, type BlockActions } from "./block-frame";
import type { DragHandle } from "@/components/ui/sortable";
import { TrackerChart } from "./tracker-chart";
import { TrackerFieldsDialog } from "./tracker-fields-dialog";
import { FieldForm, type FieldValues } from "./tracker-field-form";
import { TrackerHistoryDialog } from "./tracker-history-dialog";

export type TrackerConfig = { range_days?: Range };

/** PRD §6.7 Tracker block (TRK-1..6): setup, log form, per-field value, meta line and chart, history, fields. */
export function TrackerBlock({
  block,
  fields: serverFields,
  series: serverSeries,
  actions,
  drag,
  setConfig,
}: {
  block: Block;
  fields: TrackerField[];
  series: Record<string, Series>;
  actions: BlockActions;
  drag: DragHandle;
  setConfig: (config: TrackerConfig) => void;
}) {
  const { today } = useSpace();
  const save = useSave();
  const [fields] = useServerState(serverFields);
  const [series, setSeries] = useServerState(serverSeries);
  const [history, setHistory] = useState(false);
  const [manage, setManage] = useState(false);
  const config = block.config as TrackerConfig;
  const days = (config.range_days ?? 30) as Range;
  const live = fields.filter((f) => !f.archived_at);

  async function addField(values: FieldValues) {
    const position = Math.max(0, ...fields.map((f) => f.position)) + 1;
    try {
      await save.mutateAsync({ request: () => createClient().from("tracker_fields").insert({ block_id: block.id, ...values, position }) });
      return true;
    } catch {
      return false;
    }
  }

  /** TRK-2: optimistic: the new values show at once; the refresh then brings the database's averages and streak. */
  function logged(rows: { field_id: string; entry_date: string; value: number }[]) {
    setSeries((all) => {
      const next = { ...all };
      for (const r of rows) {
        const s = next[r.field_id];
        if (!s) continue;
        const entries = [...s.entries.filter((e) => e.date !== r.entry_date), { date: r.entry_date, value: r.value, note: null }].sort((a, b) => a.date.localeCompare(b.date));
        const latest = entries.filter((e) => e.date <= today).at(-1) ?? null;
        next[r.field_id] = { ...s, entries, latest: latest && { date: latest.date, value: latest.value } };
      }
      return next;
    });
  }

  if (live.length === 0) {
    return (
      <BlockFrame block={block} actions={actions} drag={drag}>
        <p className="type-heading mb-1">What do you want to track?</p>
        <p className="type-body-sm mb-4 text-ink-2">Name one number to log each day. You can add up to eight.</p>
        <FieldForm idPrefix={`setup-${block.id}`} submitLabel="Start tracking" onSubmit={addField} />
        {fields.length > 0 && (
          <Button variant="ghost" className="mt-2" onClick={() => setManage(true)}>
            Archived fields ({fields.length})
          </Button>
        )}
        <TrackerFieldsDialog open={manage} onOpenChange={setManage} blockId={block.id} fields={fields} />
      </BlockFrame>
    );
  }

  const streak = series[live[0].id]?.logging_streak ?? 0;
  const todayLogged = live.some((f) => series[f.id]?.entries.some((e) => e.date === today));

  return (
    <BlockFrame
      block={block}
      actions={actions}
      drag={drag}
      controls={
        <>
          <SegmentedControl
            label={`Range for ${block.title}`}
            options={RANGES}
            value={`${days}`}
            onChange={(v) => setConfig({ ...config, range_days: Number(v) as Range })}
          />
          <Button variant="ghost" className="whitespace-nowrap" onClick={() => setHistory(true)}>
            All entries
          </Button>
          <Button variant="ghost" className="whitespace-nowrap" onClick={() => setManage(true)}>
            Fields
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {todayLogged ? <Tag variant="outlined">Logged today</Tag> : <Tag variant="outlined">Not logged yet today</Tag>}
        {streak > 0 && <Tag variant="outlined">Logged {streak} {streak === 1 ? "day" : "days"} in a row</Tag>}
      </div>

      <div className={live.length > 1 ? "grid gap-4 laptop:grid-cols-2" : "grid gap-4"}>
        {live.map((f) => {
          const s = series[f.id];
          if (!s) return null;
          const tag = trendTag(s.change, f.unit, f.decimals);
          return (
            <section key={f.id} aria-label={f.label} className="flex flex-col gap-3 rounded-md bg-canvas p-4">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div>
                  <h3 className="type-heading flex items-center gap-2">
                    {s.entries.some((e) => e.date === today) && <span aria-hidden className="size-2 rounded-pill bg-lime" />}
                    {f.label}
                  </h3>
                  <p className="type-caption mt-0.5 text-ink-2">{metaLine(s)}</p>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="type-number-lg">{s.latest ? formatNumber(s.latest.value, f.decimals) : "–"}</p>
                  {f.unit && <p className="type-body-sm text-ink-3-small">{f.unit}</p>}
                  {tag && <Tag>{tag}</Tag>}
                </div>
              </div>
              <TrackerChart field={s.field} entries={entriesInRange(s.entries, days, today)} days={days} today={today} />
            </section>
          );
        })}
      </div>

      <LogForm blockId={block.id} fields={live} series={series} today={today} onLogged={logged} />
      <TrackerHistoryDialog open={history} onOpenChange={setHistory} blockId={block.id} fields={live} />
      <TrackerFieldsDialog open={manage} onOpenChange={setManage} blockId={block.id} fields={fields} />
    </BlockFrame>
  );
}

/** TRK-2: one input per field, pre-filled with the date's values; empty inputs write nothing and clear nothing. */
function LogForm({
  blockId,
  fields,
  series,
  today,
  onLogged,
}: {
  blockId: string;
  fields: TrackerField[];
  series: Record<string, Series>;
  today: string;
  onLogged: (rows: { field_id: string; entry_date: string; value: number }[]) => void;
}) {
  const save = useSave();
  const [date, setDate] = useState(today);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const existing = (f: TrackerField) => series[f.id]?.entries.find((e) => e.date === date)?.value;
  const shown = (f: TrackerField) => typed[`${date}:${f.id}`] ?? (existing(f) === undefined ? "" : String(existing(f)));

  function submit() {
    const result = entriesToLog(fields, (id) => shown(fields.find((f) => f.id === id)!), blockId, date);
    if ("error" in result) return setProblem(result.error);
    const { rows } = result;
    setProblem(null);
    onLogged(rows);
    // The typed text is dropped now, not when the save lands: the optimistic series already holds it,
    // and clearing later would wipe whatever was typed in between.
    setTyped((t) => Object.fromEntries(Object.entries(t).filter(([key]) => !rows.some((r) => key === `${date}:${r.field_id}`))));
    save.mutate({ request: () => createClient().from("tracker_entries").upsert(rows, { onConflict: "field_id,entry_date" }) });
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mt-4 flex flex-col gap-3 rounded-md bg-canvas p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field id={`log-date-${blockId}`} label="Day">
          <input id={`log-date-${blockId}`} type="date" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputClass} />
        </Field>
        {fields.map((f) => (
          <Field key={f.id} id={`log-${f.id}`} label={f.unit ? `${f.label} (${f.unit})` : f.label}>
            <input
              id={`log-${f.id}`}
              inputMode="decimal"
              value={shown(f)}
              placeholder="–"
              onChange={(e) => setTyped((t) => ({ ...t, [`${date}:${f.id}`]: e.target.value }))}
              className={`${inputClass} w-32`}
            />
          </Field>
        ))}
        <Button type="submit" variant="primary" icon={<ArrowRight size={12} strokeWidth={2} />}>
          {date === today ? "Log today" : "Save entries"}
        </Button>
      </div>
      {problem && (
        <p role="alert" className="type-body-sm text-signal-ink">
          {problem}
        </p>
      )}
    </form>
  );
}
