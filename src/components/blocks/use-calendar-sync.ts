"use client";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/client";

export type SyncKind = "time_block" | "task";

/**
 * GC-6: right after a slot is created, edited, trashed or restored, the app asks calendar-sync to push it
 * now; the 10-minute cron job covers anything this misses. TB-3: "Add to Google Calendar" and "Retry".
 */
export function useCalendarSync() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  /** Pushes one row now. The row's real state comes back through router.refresh(); failures also show in the sync log. */
  const push = useCallback(
    async (kind: SyncKind, id: string) => {
      const { error } = await createClient().functions.invoke("calendar-sync", { body: { action: "sync", kind, id } });
      router.refresh();
      if (!error) return true;
      let reason = "Couldn't reach Google Calendar sync. It will try again within 10 minutes.";
      if (error instanceof FunctionsHttpError) {
        const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
        if (body?.error === "needs_reconnect") reason = "Google Calendar needs you to reconnect in Settings.";
        if (body?.error === "not_connected") reason = "Connect Google Calendar in Settings first.";
      }
      toast.error(reason);
      return false;
    },
    [router, toast],
  );

  /** Pushes everything of the owner's that is due now (after Retry all, or deadlines switched on). */
  const sweepMine = useCallback(async () => {
    const { error } = await createClient().functions.invoke("calendar-sync", { body: { action: "sweep" } });
    router.refresh();
    if (error) toast.error("Couldn't reach Google Calendar sync. It will try again within 10 minutes.");
  }, [router, toast]);

  /** The "Add to Google Calendar" button. */
  const add = useCallback(
    async (id: string) => {
      setBusy(id);
      try {
        const { error } = await createClient().rpc("request_calendar_sync", { p_time_block_id: id });
        if (error) return void toast.error(errorMessage(error));
        router.refresh();
        await push("time_block", id);
      } finally {
        setBusy(null);
      }
    },
    [push, router, toast],
  );

  /** The "Retry" button, for one slot (or every failed one when no id is given). */
  const retry = useCallback(
    async (id?: string, kind: SyncKind = "time_block") => {
      setBusy(id ?? "all");
      try {
        const { error } = await createClient().rpc("retry_calendar_sync", id ? { p_id: id } : {});
        if (error) return void toast.error(errorMessage(error));
        router.refresh();
        if (id) await push(kind, id);
        else await sweepMine();
      } finally {
        setBusy(null);
      }
    },
    [push, router, sweepMine, toast],
  );

  return { push, add, retry, sweepMine, busy };
}
