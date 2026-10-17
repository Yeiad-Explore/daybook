"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSpace } from "@/components/space/space-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { inputClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { longDate } from "@/lib/dates";
import { errorMessage } from "@/lib/db-error";
import type { TrackerField } from "@/lib/space-page";
import { createClient } from "@/lib/supabase/client";

type EntryRow = { id: string; field_id: string; entry_date: string; value: number };

/** TRK-4: every entry by date, newest first; edit a value in place, or delete a day's entries. */
export function TrackerHistoryDialog({ open, onOpenChange, blockId, fields }: { open: boolean; onOpenChange: (open: boolean) => void; blockId: string; fields: TrackerField[] }) {
  const { today } = useSpace();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const key = ["tracker-entries", blockId];
  const { data: entries, isPending } = useQuery({
    queryKey: key,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("tracker_entries")
        .select("id, field_id, entry_date, value")
        .eq("block_id", blockId)
        .lte("entry_date", today)
        .order("entry_date", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as EntryRow[];
    },
  });

  const write = useMutation({
    mutationFn: async (request: () => PromiseLike<{ error: unknown }>) => {
      const { error } = await request();
      if (error) throw error;
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      router.refresh();
    },
  });

  const byDate = Map.groupBy(entries ?? [], (e) => e.entry_date);

  function edit(entry: EntryRow, text: string) {
    const value = Number(text.replace(/,/g, ""));
    if (text.trim() === "" || !Number.isFinite(value)) return toast.error("Enter a number, like 77.2.");
    if (value !== entry.value) write.mutate(() => createClient().from("tracker_entries").update({ value }).eq("id", entry.id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(46rem,calc(100%-2rem))]">
        <DialogTitle>All entries</DialogTitle>
        <DialogDescription>Change a value and leave the field to save it. Deleting a day removes its entries for good.</DialogDescription>
        <div className="max-h-[60vh] overflow-auto rounded-md ring-1 ring-hairline">
          <table className="type-body-sm w-full border-collapse">
            <thead className="sticky top-0 bg-canvas-2">
              <tr>
                <th scope="col" className="type-eyebrow px-3 py-2 text-left text-ink-3-small">Date</th>
                {fields.map((f) => (
                  <th key={f.id} scope="col" className="type-eyebrow px-3 py-2 text-right text-ink-3-small">
                    {f.label}
                    {f.unit ? ` (${f.unit})` : ""}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {isPending && (
                <tr>
                  <td colSpan={fields.length + 2} className="px-3 py-6 text-center text-ink-2">Loading…</td>
                </tr>
              )}
              {!isPending && byDate.size === 0 && (
                <tr>
                  <td colSpan={fields.length + 2} className="px-3 py-6 text-center text-ink-2">Nothing logged yet.</td>
                </tr>
              )}
              {[...byDate.entries()].map(([date, rows]) => (
                <tr key={date} className="border-t border-hairline">
                  <th scope="row" className="type-number px-3 py-1.5 text-left font-medium">{longDate(date)}</th>
                  {fields.map((f) => {
                    const entry = rows.find((r) => r.field_id === f.id);
                    return (
                      <td key={f.id} className="px-3 py-1.5 text-right">
                        {entry ? (
                          <input
                            aria-label={`${f.label} on ${longDate(date)}`}
                            defaultValue={entry.value}
                            inputMode="decimal"
                            onBlur={(e) => edit(entry, e.currentTarget.value)}
                            className={`${inputClass} type-number ml-auto w-24 py-1.5 text-right`}
                          />
                        ) : (
                          <span className="text-ink-3-small">–</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right">
                    <Button
                      variant="ghost"
                      aria-label={`Delete the entries of ${longDate(date)}`}
                      onClick={() => write.mutate(() => createClient().from("tracker_entries").delete().in("id", rows.map((r) => r.id)))}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
