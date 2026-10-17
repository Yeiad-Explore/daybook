"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import type { Json, Tables } from "@/lib/database.types";
import type { SpaceSummary } from "@/lib/deadlines";
import { createClient } from "@/lib/supabase/client";
import type { SelectOption } from "@/lib/table-logic";
import { useSave } from "@/lib/use-save";

type Space = Tables<"spaces">;
type Metric = Space["metric"];
export type TrackerChoice = { id: string; label: string; unit: string | null; place: string };
export type ColumnChoice = { id: string; name: string; place: string; options: SelectOption[] };

const LABELS: Record<Metric, string> = {
  tasks: "Finished tasks",
  tracker: "A tracker field",
  table_count: "Rows in a table",
  manual: "A percentage I set myself",
};
const GONE: Partial<Record<Metric, string>> = {
  tracker: "the tracker field it followed was deleted",
  table_count: "the table column or option it counted was deleted",
};

type Config = { tracker?: { field_id?: string; start?: number; target?: number }; table_count?: { column_id?: string; option_id?: string; target?: number }; manual?: { percent?: number } };

/** PRD §5.5 and SPC-7: which of the four progress metrics a goal uses, and its configuration. */
export function MetricSettings({ space, progress, fields, columns }: { space: Space; progress: SpaceSummary["progress"]; fields: TrackerChoice[]; columns: ColumnChoice[] }) {
  const save = useSave();
  const toast = useToast();
  const config = (space.metric_config ?? {}) as Config;
  const [metric, setMetric] = useState<Metric>(space.metric);
  const [fieldId, setFieldId] = useState(config.tracker?.field_id ?? "");
  const [start, setStart] = useState(config.tracker?.start?.toString() ?? "");
  const [target, setTarget] = useState(config.tracker?.target?.toString() ?? "");
  const [columnId, setColumnId] = useState(config.table_count?.column_id ?? "");
  const [optionId, setOptionId] = useState(config.table_count?.option_id ?? "");
  const [count, setCount] = useState(config.table_count?.target?.toString() ?? "");
  const [percent, setPercent] = useState(config.manual?.percent?.toString() ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const column = columns.find((c) => c.id === columnId);
  const fellBack = progress?.fell_back_from;

  function submit() {
    let metric_config: Config = {};
    const num = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(/,/g, "")));
    if (metric === "tracker") {
      if (!fieldId) return setProblem("Pick a tracker field first.");
      if (!Number.isFinite(num(start)) || !Number.isFinite(num(target))) return setProblem("Enter a start value and a target value.");
      metric_config = { tracker: { field_id: fieldId, start: num(start), target: num(target) } };
    } else if (metric === "table_count") {
      if (!columnId || !optionId) return setProblem("Pick a table column and the option to count.");
      if (!Number.isInteger(num(count)) || num(count) < 1) return setProblem("The target count must be a whole number, 1 or more.");
      metric_config = { table_count: { column_id: columnId, option_id: optionId, target: num(count) } };
    } else if (metric === "manual") {
      if (!(num(percent) >= 0 && num(percent) <= 100)) return setProblem("Enter a percentage from 0 to 100.");
      metric_config = { manual: { percent: num(percent) } };
    }
    setProblem(null);
    save.mutate(
      { request: () => createClient().from("spaces").update({ metric, metric_config: metric_config as { [key: string]: Json } }).eq("id", space.id) },
      { onSuccess: () => toast.success("Progress setting saved.") },
    );
  }

  return (
    <Panel className="flex flex-col gap-4" aria-label="Progress">
      <div>
        <h2 className="type-heading">Progress</h2>
        <p className="type-body-sm mt-1 text-ink-2">How this goal&apos;s percentage is worked out.</p>
      </div>

      {(fellBack || progress?.fallback) && (
        <p role="status" className="type-body-sm rounded-md bg-canvas p-3 text-ink">
          {fellBack ? `Progress went back to finished tasks because ${GONE[fellBack] ?? "what it followed was deleted"}. Pick a new one below.` : "What this goal follows is in Trash, so finished tasks are shown for now. Restore it to bring the setting back."}
        </p>
      )}
      {progress && (
        <p className="type-body-sm text-ink-2">
          Right now: <span className="type-number text-ink">{progress.percent}%</span> · {progress.label}
        </p>
      )}

      <Field id="metric" label="Count progress by">
        <select id="metric" value={metric} onChange={(e) => { setMetric(e.target.value as Metric); setProblem(null); }} className={inputClass}>
          {(Object.keys(LABELS) as Metric[]).map((m) => (
            <option key={m} value={m}>
              {LABELS[m]}
            </option>
          ))}
        </select>
      </Field>

      {metric === "tasks" && <p className="type-body-sm text-ink-2">Finished tasks divided by all tasks (To-do items and Roadmap steps) in this goal.</p>}

      {metric === "tracker" &&
        (fields.length === 0 ? (
          <p className="type-body-sm text-ink-2">This goal has no Tracker block with a field yet. Add one on a page first.</p>
        ) : (
          <div className="grid gap-4 tablet:grid-cols-3">
            <Field id="metric-field" label="Tracker field">
              <select id="metric-field" value={fieldId} onChange={(e) => setFieldId(e.target.value)} className={inputClass}>
                <option value="">Choose a field</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label} · {f.place}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="metric-start" label="Start value">
              <input id="metric-start" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
            </Field>
            <Field id="metric-target" label="Target value">
              <input id="metric-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass} />
            </Field>
          </div>
        ))}

      {metric === "table_count" &&
        (columns.length === 0 ? (
          <p className="type-body-sm text-ink-2">This goal has no Table with a select column yet. Add one on a page first.</p>
        ) : (
          <div className="grid gap-4 tablet:grid-cols-3">
            <Field id="metric-column" label="Table column">
              <select id="metric-column" value={columnId} onChange={(e) => { setColumnId(e.target.value); setOptionId(""); }} className={inputClass}>
                <option value="">Choose a column</option>
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.place}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="metric-option" label="Count rows that are">
              <select id="metric-option" value={optionId} onChange={(e) => setOptionId(e.target.value)} className={inputClass} disabled={!column}>
                <option value="">Choose an option</option>
                {column?.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="metric-count" label="Target count">
              <input id="metric-count" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} className={inputClass} />
            </Field>
          </div>
        ))}

      {metric === "manual" && (
        <Field id="metric-percent" label="Percent done">
          <input id="metric-percent" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} className={`${inputClass} max-w-40`} />
        </Field>
      )}

      {problem && (
        <p role="alert" className="type-body-sm text-signal-ink">
          {problem}
        </p>
      )}
      <Button variant="primary" className="self-start" onClick={submit}>
        Save progress setting
      </Button>
    </Panel>
  );
}
