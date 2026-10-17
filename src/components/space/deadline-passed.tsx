"use client";

import { useState } from "react";
import { RescheduleDialog } from "@/components/deadlines/reschedule-dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useSave } from "@/lib/use-save";
import type { Space } from "@/lib/space-page";

/** SPC-4 AC2: an active goal past its deadline asks to be closed or extended (extending needs a reason). */
export function DeadlinePassed({ space, today }: { space: Space; today: string }) {
  const save = useSave();
  const [extending, setExtending] = useState(false);
  const close = (status: "achieved" | "missed") =>
    save.mutate({ request: () => createClient().from("spaces").update({ status }).eq("id", space.id) });

  return (
    <div role="status" className="mb-6 flex flex-col gap-3 rounded-lg bg-signal-wash p-4 tablet:flex-row tablet:items-center tablet:justify-between">
      <p className="type-body flex items-center gap-2 text-ink">
        <span aria-hidden className="size-2 shrink-0 rounded-pill bg-signal" />
        This goal&apos;s deadline has passed. Mark achieved, close as missed, or extend (with a reason).
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => close("achieved")}>Mark achieved</Button>
        <Button variant="secondary" onClick={() => close("missed")}>Close as missed</Button>
        <Button variant="secondary" onClick={() => setExtending(true)}>Extend</Button>
      </div>
      <RescheduleDialog
        target={{ kind: "space", id: space.id, title: space.name, due: space.deadline! }}
        today={today}
        open={extending}
        onOpenChange={setExtending}
      />
    </div>
  );
}
