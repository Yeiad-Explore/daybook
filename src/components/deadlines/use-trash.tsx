"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { inputClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { shortDate } from "@/lib/dates";
import { errorMessage } from "@/lib/db-error";
import type { Blocker, TrashResult } from "@/lib/deadlines";
import { createClient } from "@/lib/supabase/client";

type Trashable = "spaces" | "pages" | "blocks" | "tasks";
type Request = { table: Trashable; id: string; name: string; onTrashed?: () => void; onUndone?: () => void };

/**
 * Move a space, page, block or task to Trash (SPC-5, PG-6, BLK-7, DL-11, DL-14) with Undo for 6 s.
 * When late tasks are inside, trash_item lists them and nothing moves until the owner gives a reason.
 * Returns the function to call and the dialog to render.
 */
export function useTrash(today: string) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<(Request & { late: Blocker[] }) | null>(null);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(request: Request, why?: string) {
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("trash_item", { p_table: request.table, p_id: request.id, p_reason: why });
    setBusy(false);
    if (error) {
      if (why) setProblem(errorMessage(error));
      else toast.error(errorMessage(error));
      return;
    }
    const result = data as unknown as TrashResult;
    if (result.status === "needs_reason") {
      setPending({ ...request, late: result.late_tasks });
      return;
    }
    close();
    request.onTrashed?.();
    router.refresh();
    toast.undoable(`${request.name} moved to Trash.`, async () => {
      const { error: undoError } = await supabase.rpc("restore_item", { p_table: request.table, p_id: request.id });
      if (undoError) toast.error(errorMessage(undoError));
      else request.onUndone?.();
      router.refresh();
    });
  }

  function close() {
    setPending(null);
    setReason("");
    setProblem(null);
  }

  const dialog = pending && (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogTitle>{pending.late.length === 1 && pending.late[0].id === pending.id ? "This task is late" : "Late tasks inside"}</DialogTitle>
        <DialogDescription>
          Daybook keeps late work you delete in your deadline history, with your reason.
        </DialogDescription>
        <ul className="type-body-sm flex flex-col gap-1 rounded-md bg-signal-wash p-3">
          {pending.late.map((t) => (
            <li key={t.id} className="flex justify-between gap-3">
              <span className="truncate">{t.title}</span>
              <span className="type-number shrink-0 text-signal-ink">was due {shortDate(t.due_date, today)}</span>
            </li>
          ))}
        </ul>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length < 3) return setProblem("A reason needs at least 3 characters.");
            void run(pending, reason);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="trash-reason" className="type-heading">
              Why are you dropping it?
            </label>
            <input id="trash-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Dropping this channel" maxLength={200} className={inputClass} />
          </div>
          {problem && (
            <p role="alert" className="type-body-sm text-signal-ink">
              {problem}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Keep it
            </Button>
            <Button type="submit" variant="secondary" disabled={busy}>
              Move to Trash
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  return { trash: (request: Request) => run(request), dialog };
}
