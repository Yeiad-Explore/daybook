"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import type { TargetKind } from "@/lib/tracker-logic";

export type FieldValues = { label: string; unit: string | null; decimals: number; target_value: number | null; target_kind: TargetKind | null };

const KINDS: { value: TargetKind; label: string; hint: string }[] = [
  { value: "at_most", label: "At most", hint: "A daily ceiling, like 2,000 kcal." },
  { value: "at_least", label: "At least", hint: "A daily floor, like 2 hours of study." },
  { value: "reach", label: "Reach", hint: "A value to get to, like 72 kg." },
];

/** TRK-1: label, unit, decimals and an optional target with its kind. Used for setup, adding and editing a field. */
export function FieldForm({
  idPrefix,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  initial?: FieldValues;
  submitLabel: string;
  onSubmit: (values: FieldValues) => Promise<boolean> | boolean;
  onCancel?: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [decimals, setDecimals] = useState(String(initial?.decimals ?? 1));
  const [kind, setKind] = useState<TargetKind | "">(initial?.target_kind ?? "");
  const [target, setTarget] = useState(initial?.target_value === null || initial?.target_value === undefined ? "" : String(initial.target_value));
  const [problems, setProblems] = useState<{ label?: string; target?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    const next: typeof problems = {};
    if (!label.trim()) next.label = "Give it a name, like Weight.";
    const value = target.trim() === "" ? null : Number(target.replace(/,/g, ""));
    if (kind && value === null) next.target = "Enter the target value.";
    if (value !== null && !Number.isFinite(value)) next.target = "Enter a number, like 72 or 2000.";
    setProblems(next);
    if (next.label || next.target) return;
    setBusy(true);
    const saved = await onSubmit({
      label: label.trim(),
      unit: unit.trim() || null,
      decimals: Number(decimals),
      target_value: kind ? value : null,
      target_kind: kind || null,
    });
    setBusy(false);
    if (saved && !initial) {
      setLabel("");
      setUnit("");
      setKind("");
      setTarget("");
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="grid gap-3 tablet:grid-cols-2"
    >
      <Field id={`${idPrefix}-label`} label="What do you track?" error={problems.label}>
        <input id={`${idPrefix}-label`} value={label} maxLength={60} placeholder="Weight" onChange={(e) => setLabel(e.target.value)} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${idPrefix}-unit`} label="Unit (optional)">
          <input id={`${idPrefix}-unit`} value={unit} maxLength={16} placeholder="kg" onChange={(e) => setUnit(e.target.value)} className={inputClass} />
        </Field>
        <Field id={`${idPrefix}-decimals`} label="Decimals">
          <select id={`${idPrefix}-decimals`} value={decimals} onChange={(e) => setDecimals(e.target.value)} className={inputClass}>
            {[0, 1, 2, 3].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id={`${idPrefix}-kind`} label="Target (optional)" hint={KINDS.find((k) => k.value === kind)?.hint}>
        <select id={`${idPrefix}-kind`} value={kind} onChange={(e) => setKind(e.target.value as TargetKind | "")} className={inputClass}>
          <option value="">No target</option>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
      {kind && (
        <Field id={`${idPrefix}-target`} label="Target value" error={problems.target}>
          <input id={`${idPrefix}-target`} inputMode="decimal" value={target} placeholder="72" onChange={(e) => setTarget(e.target.value)} className={inputClass} />
        </Field>
      )}
      <div className="flex items-end justify-end gap-2 tablet:col-span-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={busy} icon={<ArrowRight size={12} strokeWidth={2} />}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
