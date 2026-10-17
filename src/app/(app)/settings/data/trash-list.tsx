"use client";

import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tag } from "@/components/ui/tag";
import { useToast } from "@/components/ui/toast";
import { shortDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import type { TrashEntry } from "@/lib/trash";
import { useSave } from "@/lib/use-save";
import { useServerState } from "@/lib/use-server-state";

const KIND = { spaces: "Space", pages: "Page", blocks: "Block", tasks: "Task" } as const;

/** SET-3: restore puts an item back (the database re-checks the deadline rules, DL-13); delete forever is final. */
export function TrashList({ entries: serverEntries, today, timezone }: { entries: TrashEntry[]; today: string; timezone: string }) {
  const [entries, setEntries] = useServerState(serverEntries);
  const [forever, setForever] = useState<TrashEntry | null>(null);
  const save = useSave();
  const toast = useToast();

  function act(entry: TrashEntry, request: () => PromiseLike<{ data: unknown; error: unknown }>, done: string) {
    const previous = entries;
    setEntries(entries.filter((e) => e.id !== entry.id));
    save.mutate({ request, rollback: () => setEntries(previous) }, { onSuccess: () => toast.success(done) });
  }

  if (entries.length === 0) return <p className="type-body text-ink-2">Trash is empty.</p>;

  return (
    <>
      <ul className="flex flex-col divide-y divide-hairline">
        {entries.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="type-body flex items-center gap-2">
                <Tag>{KIND[e.table]}</Tag>
                <span className="truncate">{e.name}</span>
              </p>
              <p className="type-caption mt-0.5 text-ink-3-small">
                {e.where && `${e.where} · `}deleted {format(new TZDate(new Date(e.deletedAt), timezone), "d MMM")} · gone for good on {shortDate(e.purgeOn, today)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => act(e, () => createClient().rpc("restore_item", { p_table: e.table, p_id: e.id }), `${e.name} is back.`)}>
                Restore
              </Button>
              <Button variant="ghost" onClick={() => setForever(e)}>
                Delete forever
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {forever && (
        <Dialog open onOpenChange={(open) => !open && setForever(null)}>
          <DialogContent>
            <DialogTitle>Delete forever?</DialogTitle>
            <DialogDescription>
              <span className="text-ink">{forever.name}</span>
              {forever.table === "tasks" ? "" : " and everything in it"} will be gone. This can&apos;t be undone.
              {forever.table === "spaces" ? " Its deadline history goes with it." : " Its deadline history stays."}
            </DialogDescription>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForever(null)}>
                Keep it
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  act(forever, () => createClient().from(forever.table).delete().eq("id", forever.id), `${forever.name} is deleted for good.`);
                  setForever(null);
                }}
              >
                Delete forever
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
