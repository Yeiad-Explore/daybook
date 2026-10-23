"use client";

import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { ArrowRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSpace } from "@/components/space/space-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, inputClass } from "@/components/ui/field";
import type { DragHandle } from "@/components/ui/sortable";
import { useToast } from "@/components/ui/toast";
import { cx } from "@/lib/cx";
import { shortDate } from "@/lib/dates";
import { errorMessage } from "@/lib/db-error";
import { DERIVED_SPACE_ID } from "@/lib/derived";
import type { Block, Slot } from "@/lib/space-page";
import { createClient } from "@/lib/supabase/client";
import { zonedInstant } from "@/lib/today";
import { useSave } from "@/lib/use-save";
import { useServerState } from "@/lib/use-server-state";
import { BlockFrame, type BlockActions } from "./block-frame";

export type TimeConfig = { auto_sync?: boolean; show_past?: boolean };

const END_AFTER_START = "The end time needs to be after the start time.";

/** PRD §6.9 Time block (TB-1, TB-2, TB-6): book slots, a date-ordered list with past slots dimmed, linked tasks. Calendar sync is Phase 3. */
export function TimeBlock({ block, slots: serverSlots, actions, drag, setConfig }: { block: Block; slots: Slot[]; actions: BlockActions; drag: DragHandle; setConfig: (config: TimeConfig) => void }) {
  const { today, timezone } = useSpace();
  const save = useSave();
  const toast = useToast();
  const router = useRouter();
  const [slots, setSlots] = useServerState(serverSlots);
  const [editing, setEditing] = useState<Slot | null>(null);
  const config = block.config as TimeConfig;
  const local = (iso: string) => new TZDate(new Date(iso), timezone);
  const dayOf = (iso: string) => format(local(iso), "yyyy-MM-dd");
  const isPast = (s: Slot) => dayOf(s.starts_at) < today;
  const sorted = [...slots].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const pastCount = sorted.filter(isPast).length;
  const shown = config.show_past ? sorted : sorted.filter((s) => !isPast(s));

  async function add(fields: { title: string; day: string; start: string; end: string }) {
    const row = { title: fields.title, starts_at: zonedInstant(fields.day, timezone, fields.start), ends_at: zonedInstant(fields.day, timezone, fields.end) };
    const previous = slots;
    const temp = `new-${crypto.randomUUID()}`;
    setSlots([...slots, { id: temp, block_id: block.id, task_id: null, task: null, ...row }]);
    try {
      const saved = (await save.mutateAsync({ request: () => createClient().from("time_blocks").insert({ block_id: block.id, space_id: DERIVED_SPACE_ID, ...row }).select("id").single(), rollback: () => setSlots(previous) })) as { id: string };
      setSlots((all) => all.map((s) => (s.id === temp ? { ...s, id: saved.id } : s)));
      return true;
    } catch {
      return false;
    }
  }

  async function update(slot: Slot, fields: { title: string; day: string; start: string; end: string }) {
    const row = { title: fields.title, starts_at: zonedInstant(fields.day, timezone, fields.start), ends_at: zonedInstant(fields.day, timezone, fields.end) };
    const previous = slots;
    setSlots(slots.map((s) => (s.id === slot.id ? { ...s, ...row } : s)));
    try {
      await save.mutateAsync({ request: () => createClient().from("time_blocks").update(row).eq("id", slot.id), rollback: () => setSlots(previous) });
      return true;
    } catch {
      return false;
    }
  }

  /** A slot goes to Trash (restorable for 30 days) with Undo for 6 seconds. */
  async function trash(slot: Slot) {
    const supabase = createClient();
    const { error } = await supabase.from("time_blocks").update({ deleted_at: new Date().toISOString() }).eq("id", slot.id);
    if (error) return toast.error(errorMessage(error));
    setSlots((all) => all.filter((s) => s.id !== slot.id));
    router.refresh();
    toast.undoable(`${slot.title} moved to Trash.`, async () => {
      const { error: undoError } = await supabase.rpc("restore_item", { p_table: "time_blocks", p_id: slot.id });
      if (undoError) toast.error(errorMessage(undoError));
      else setSlots((all) => [...all, slot]);
      router.refresh();
    });
  }

  return (
    <BlockFrame
      block={block}
      actions={actions}
      drag={drag}
      controls={
        pastCount > 0 && (
          <button type="button" aria-pressed={!!config.show_past} onClick={() => setConfig({ ...config, show_past: !config.show_past })} className="type-button min-h-8 rounded-pill px-2.5 text-[12px] text-ink-2 hover:bg-canvas-2 pointer-coarse:min-h-11">
            {config.show_past ? "Hide past" : `Show past (${pastCount})`}
          </button>
        )
      }
    >
      {shown.length === 0 && <p className="type-body-sm px-1 pb-2 text-ink-2">{slots.length === 0 ? "No time booked yet. Add a slot below, or use “Book time” on a task." : "Nothing coming up. Show past slots, or add a new one below."}</p>}
      <ul className="flex flex-col divide-y divide-hairline">
        {shown.map((s) => (
          <li key={s.id} className={cx("flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-1 py-1.5", isPast(s) && "opacity-60")}>
            <span className="type-number w-28 shrink-0 text-ink-2">
              {format(local(s.starts_at), "EEE d MMM")}
              <br />
              {format(local(s.starts_at), "HH:mm")} to {format(local(s.ends_at), "HH:mm")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="type-body truncate">{s.title}</p>
              {s.task && (
                <p className="type-caption text-ink-3-small">
                  For “{s.task.title}”{s.task.due_date ? ` · due ${shortDate(s.task.due_date, today)}` : ""}
                </p>
              )}
            </div>
            <div className="flex items-center">
              <button type="button" aria-label={`Edit ${s.title}`} disabled={s.id.startsWith("new-")} onClick={() => setEditing(s)} className="grid size-9 place-items-center rounded-pill text-ink-2 hover:bg-canvas-2 pointer-coarse:size-11">
                <Pencil size={14} strokeWidth={1.5} aria-hidden />
              </button>
              <button type="button" aria-label={`Delete ${s.title}`} disabled={s.id.startsWith("new-")} onClick={() => void trash(s)} className="grid size-9 place-items-center rounded-pill text-ink-2 hover:bg-canvas-2 pointer-coarse:size-11">
                <Trash2 size={14} strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <AddSlot today={today} onAdd={add} />
      {editing && <SlotDialog slot={editing} day={dayOf(editing.starts_at)} start={format(local(editing.starts_at), "HH:mm")} end={format(local(editing.ends_at), "HH:mm")} onClose={() => setEditing(null)} onSave={(fields) => update(editing, fields)} />}
    </BlockFrame>
  );
}

function validate(f: { title: string; day: string; start: string; end: string }) {
  if (!f.title.trim()) return "Give the slot a title.";
  if (!f.day || !f.start || !f.end) return "Pick a day, a start and an end.";
  if (f.end <= f.start) return END_AFTER_START; // TB-1 AC1; slots stay on one day (TB-1 AC2)
  return null;
}

/** TB-1: the inline add form, one pill row at the bottom of the block (DESIGN.md "Inputs"). */
function AddSlot({ today, onAdd }: { today: string; onAdd: (fields: { title: string; day: string; start: string; end: string }) => Promise<boolean> }) {
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(today);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [problem, setProblem] = useState<string | null>(null);

  async function submit() {
    const fields = { title: title.trim(), day, start, end };
    const error = validate(fields);
    setProblem(error);
    if (error) return;
    if (await onAdd(fields)) setTitle("");
  }

  const time = "type-number min-h-9 rounded-pill bg-surface px-3 text-ink ring-1 ring-inset ring-ink-3 pointer-coarse:min-h-11";
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="mt-2 flex flex-col gap-1.5"
    >
      <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-canvas p-1 ring-1 ring-inset ring-ink-3 focus-within:ring-ink">
        <input aria-label="Slot title" placeholder="+ Add a time slot" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="type-body min-w-40 flex-1 rounded-pill bg-transparent px-3 py-1.5 placeholder:text-ink-3-small focus-visible:shadow-none focus-visible:outline-none" />
        <input aria-label="Day" type="date" value={day} onChange={(e) => setDay(e.target.value)} className={time} />
        <input aria-label="Starts" type="time" value={start} onChange={(e) => setStart(e.target.value)} className={time} />
        <input aria-label="Ends" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={time} />
        <button type="submit" aria-label={`Add slot: ${title || "new"}`} className="grid size-9 place-items-center rounded-pill bg-surface-dark text-on-dark pointer-coarse:size-11">
          <Plus size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      {problem && (
        <p role="alert" className="type-caption px-3 text-signal-ink">
          {problem}
        </p>
      )}
    </form>
  );
}

function SlotDialog({ slot, day, start, end, onClose, onSave }: { slot: Slot; day: string; start: string; end: string; onClose: () => void; onSave: (fields: { title: string; day: string; start: string; end: string }) => Promise<boolean> }) {
  const [fields, setFields] = useState({ title: slot.title, day, start, end });
  const [problem, setProblem] = useState<string | null>(null);
  const set = (key: keyof typeof fields) => (e: { target: { value: string } }) => setFields((f) => ({ ...f, [key]: e.target.value }));

  async function submit() {
    const error = validate(fields);
    setProblem(error);
    if (!error && (await onSave({ ...fields, title: fields.title.trim() }))) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Edit slot</DialogTitle>
        <DialogDescription>Changing the title, day or times keeps the slot where it is.</DialogDescription>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field id="slot-title" label="Title">
            <input id="slot-title" value={fields.title} maxLength={200} onChange={set("title")} className={inputClass} />
          </Field>
          <Field id="slot-edit-day" label="Day">
            <input id="slot-edit-day" type="date" value={fields.day} onChange={set("day")} className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="slot-edit-start" label="Starts">
              <input id="slot-edit-start" type="time" value={fields.start} onChange={set("start")} className={inputClass} />
            </Field>
            <Field id="slot-edit-end" label="Ends">
              <input id="slot-edit-end" type="time" value={fields.end} onChange={set("end")} className={inputClass} />
            </Field>
          </div>
          {problem && (
            <p role="alert" className="type-body-sm text-signal-ink">
              {problem}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" icon={<ArrowRight size={12} strokeWidth={2} />}>
              Save slot
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
