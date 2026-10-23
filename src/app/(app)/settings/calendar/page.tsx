import { redirect } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { parseCalendarStatus, type CalendarLogEntry } from "@/lib/calendar";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { CalendarSettings } from "./calendar-settings";

export const metadata = { title: "Google Calendar · Daybook" };

// GC-4: connection state, preferences, Reconnect / Disconnect and the sync log. google_connections is closed to the
// browser, so everything here comes through get_calendar_status() and get_calendar_log().
export default async function CalendarSettingsPage({ searchParams }: { searchParams: Promise<{ connect?: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const [{ data: status }, { data: log }, { connect }] = await Promise.all([supabase.rpc("get_calendar_status"), supabase.rpc("get_calendar_log", { p_limit: 30 }), searchParams]);
  const calendar = parseCalendarStatus(status);
  const statement = { connected: "Connected.", needs_reconnect: "Needs a new sign-in.", disconnected: "Not connected." }[calendar.status];

  return (
    <>
      <PageIntro eyebrow="Google Calendar" context="Time slots on your calendar." statement={statement} />
      <CalendarSettings calendar={calendar} log={(log ?? []) as unknown as CalendarLogEntry[]} timezone={profile.timezone} connectFailed={connect === "failed"} />
    </>
  );
}
