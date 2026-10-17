"use client";

import { TZDate } from "@date-fns/tz";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSpace } from "@/components/space/space-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, inputClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/db-error";
import { DERIVED_SPACE_ID } from "@/lib/derived";
import { createClient } from "@/lib/supabase/client";
import type { Task } from "@/lib/space-page";

/** Local date + time in the owner's timezone, as an instant (NFR-6). */
const instant = (day: string, time: string, timezone: string) => {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new TZDate(y, m - 1, d, h, min, timezone).toISOString();
};

/**
 * TODO-6 "Book time": a time slot linked to the task, in the first Time block on this page (one is
 * created when there is none). Slot rules (end after start, same day) are the database's (TB-1).
 */
export function BookTimeDialog({ task, open, onOpenChange }: { task: Task; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { today, timezone, blocks, pageId } = useSpace();
  const router = useRouter();
  const toast = useToast();
  const [day, setDay] = useState(task.due_date && task.due_date >= today ? task.due_date : today);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function book() {
    setProblem(null);
    if (!day || !start || !end) return setProblem("Pick a day, a start and an end.");
    if (end <= start) return setProblem("The end time needs to be after the start time.");
    const startsAt = instant(day, start, timezone);
    const endsAt = instant(day, end, timezone);
    setBusy(true);
    const supabase = createClient();
    try {
      let blockId = blocks.find((b) => b.type === "timeblock")?.id;
      if (!blockId) {
        const position = Math.max(0, ...blocks.map((b) => b.position)) + 1;
        const { data, error } = await supabase
          .from("blocks")
          .insert({ page_id: pageId, type: "timeblock", title: "Time block", span: 6, position, space_id: DERIVED_SPACE_ID })
          .select("id")
          .single();
        if (error) throw error;
        blockId = data.id;
      }
      const { error } = await supabase.from("time_blocks").insert({
        block_id: blockId,
        task_id: task.id,
        title: task.title,
        starts_at: startsAt,
        ends_at: endsAt,
        space_id: DERIVED_SPACE_ID,
      });
      if (error) throw error;
      toast.success("Time booked.");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Book time</DialogTitle>
        <DialogDescription>
          A slot for <span className="text-ink">{task.title}</span>, kept with this page&apos;s time block.
        </DialogDescription>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void book();
          }}
        >
          <Field id="slot-day" label="Day">
            <input id="slot-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="slot-start" label="Starts">
              <input id="slot-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
            </Field>
            <Field id="slot-end" label="Ends">
              <input id="slot-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
            </Field>
          </div>
          {problem && (
            <p role="alert" className="type-body-sm text-signal-ink">
              {problem}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy} icon={<ArrowRight size={12} strokeWidth={2} />}>
              Book it
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
