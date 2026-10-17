"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatNumber } from "@/lib/money";
import { moveItem } from "@/lib/move-item";
import { reorderRequest } from "@/lib/reorder";
import type { TrackerField } from "@/lib/space-page";
import { createClient } from "@/lib/supabase/client";
import { useSave } from "@/lib/use-save";
import { FieldForm, type FieldValues } from "./tracker-field-form";

const MAX_FIELDS = 8;

/** TRK-1 / TRK-6: add, edit, reorder and archive fields. Archiving hides a field but keeps its entries. */
export function TrackerFieldsDialog({ open, onOpenChange, blockId, fields }: { open: boolean; onOpenChange: (open: boolean) => void; blockId: string; fields: TrackerField[] }) {
  const save = useSave();
  const [editing, setEditing] = useState<string | null>(null);
  const live = fields.filter((f) => !f.archived_at);
  const archived = fields.filter((f) => f.archived_at);

  async function run(request: () => PromiseLike<{ data: unknown; error: unknown }>) {
    try {
      await save.mutateAsync({ request });
      return true;
    } catch {
      return false;
    }
  }

  const add = (values: FieldValues) => run(() => createClient().from("tracker_fields").insert({ block_id: blockId, ...values, position: Math.max(0, ...fields.map((f) => f.position)) + 1 }));
  const update = async (id: string, values: FieldValues) => {
    const ok = await run(() => createClient().from("tracker_fields").update(values).eq("id", id));
    if (ok) setEditing(null);
    return ok;
  };
  const move = (index: number, to: number) => {
    const { before, after } = moveItem(live, index, to);
    void run(() => reorderRequest("tracker_fields", live[index].id, before, after));
  };
  const setArchived = (id: string, archived: boolean) => run(() => createClient().from("tracker_fields").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id));

  const describe = (f: TrackerField) =>
    [f.unit, f.target_kind && f.target_value !== null ? `${{ at_most: "at most", at_least: "at least", reach: "reach" }[f.target_kind]} ${formatNumber(f.target_value, f.decimals)}` : null].filter(Boolean).join(" · ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(40rem,calc(100%-2rem))] max-h-[85vh] overflow-auto">
        <DialogTitle>Fields</DialogTitle>
        <DialogDescription>A tracker holds one to eight fields. Archiving hides a field and keeps its entries.</DialogDescription>
        <ul className="flex flex-col divide-y divide-hairline">
          {live.map((f, i) => (
            <li key={f.id} className="flex flex-col gap-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="type-heading">{f.label}</p>
                  <p className="type-caption text-ink-2">{describe(f) || "No unit or target"}</p>
                </div>
                <Button variant="ghost" aria-label={`Move ${f.label} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                  <ArrowUp size={14} strokeWidth={1.5} aria-hidden />
                </Button>
                <Button variant="ghost" aria-label={`Move ${f.label} down`} disabled={i === live.length - 1} onClick={() => move(i, i + 1)}>
                  <ArrowDown size={14} strokeWidth={1.5} aria-hidden />
                </Button>
                <Button variant="secondary" onClick={() => setEditing(editing === f.id ? null : f.id)}>
                  {editing === f.id ? "Close" : "Edit"}
                </Button>
                <Button variant="ghost" disabled={live.length === 1} onClick={() => void setArchived(f.id, true)}>
                  Archive
                </Button>
              </div>
              {editing === f.id && (
                <FieldForm
                  idPrefix={`edit-${f.id}`}
                  initial={{ label: f.label, unit: f.unit, decimals: f.decimals, target_value: f.target_value, target_kind: f.target_kind }}
                  submitLabel="Save field"
                  onSubmit={(values) => update(f.id, values)}
                  onCancel={() => setEditing(null)}
                />
              )}
            </li>
          ))}
        </ul>
        {archived.length > 0 && (
          <div>
            <p className="type-eyebrow mb-1 text-ink-3-small">Archived</p>
            <ul className="flex flex-col divide-y divide-hairline">
              {archived.map((f) => (
                <li key={f.id} className="flex items-center gap-2 py-2">
                  <p className="type-body-sm min-w-0 flex-1 truncate text-ink-2">{f.label}</p>
                  <Button variant="secondary" disabled={live.length >= MAX_FIELDS} onClick={() => void setArchived(f.id, false)}>
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {live.length < MAX_FIELDS ? (
          <div className="rounded-md bg-canvas p-4">
            <p className="type-heading mb-3">Add a field</p>
            <FieldForm idPrefix={`add-${blockId}`} submitLabel="Add field" onSubmit={add} />
          </div>
        ) : (
          <p className="type-body-sm text-ink-2">That is the eight-field limit. Archive one to add another.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
