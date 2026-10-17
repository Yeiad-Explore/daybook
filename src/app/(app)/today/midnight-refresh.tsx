"use client";

import { TZDate } from "@date-fns/tz";
import { addDays, startOfDay } from "date-fns";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** TODAY-1: left open, Today re-renders at the owner's local midnight (profile timezone). */
export function MidnightRefresh({ timezone, today }: { timezone: string; today: string }) {
  const router = useRouter();
  useEffect(() => {
    const now = new TZDate(new Date(), timezone);
    const ms = startOfDay(addDays(now, 1)).getTime() - now.getTime() + 1000;
    const timer = setTimeout(() => router.refresh(), ms);
    return () => clearTimeout(timer);
  }, [router, timezone, today]); // today changes after each refresh, which schedules the next midnight
  return null;
}
