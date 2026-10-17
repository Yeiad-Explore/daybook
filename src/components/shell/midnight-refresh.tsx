"use client";

import { TZDate } from "@date-fns/tz";
import { addDays, startOfDay } from "date-fns";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { todayIn } from "@/lib/today";

/**
 * TODAY-1: a screen left open re-renders at the owner's local midnight (profile timezone), and again when
 * a hidden tab or a sleeping phone wakes on a new day. Without it, a check or a log made the next morning
 * would be written to yesterday's date, because every "today" on screen is computed when it renders.
 */
export function MidnightRefresh({ timezone, today }: { timezone: string; today: string }) {
  const router = useRouter();
  useEffect(() => {
    const now = new TZDate(new Date(), timezone);
    const ms = startOfDay(addDays(now, 1)).getTime() - now.getTime() + 1000;
    const timer = setTimeout(() => router.refresh(), ms);
    const onVisible = () => document.visibilityState === "visible" && todayIn(timezone) !== today && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, timezone, today]); // today changes after each refresh, which schedules the next midnight
  return null;
}
