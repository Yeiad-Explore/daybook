import { cache } from "react";
import type { TodayData } from "@/lib/deadlines";
import { createClient } from "@/lib/supabase/server";

/**
 * get_today once per request: the Index late-count and Today's Overdue read the same call, so
 * TODAY-4 ("the late-count equals the rows in Overdue") holds by construction.
 */
export const getToday = cache(async (): Promise<TodayData> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_today", {});
  if (error) throw error;
  return data as unknown as TodayData;
});
