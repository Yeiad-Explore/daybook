import { createClient } from "@/lib/supabase/client";

export type Ordered = "spaces" | "pages" | "blocks" | "tasks" | "tracker_fields" | "table_columns" | "table_rows" | "routine_steps";

/**
 * The `reorder` RPC (§9.3 fractional index). `before` / `after` are the new neighbours; null at
 * either end of the list. The generated types mark the uuid args required, but SQL accepts null.
 */
export function reorderRequest(table: Ordered, id: string, before: string | null, after: string | null) {
  return createClient().rpc("reorder", {
    p_table: table,
    p_id: id,
    p_before: before as string,
    p_after: after as string,
  });
}
