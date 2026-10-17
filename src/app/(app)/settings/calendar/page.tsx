import { PageIntro } from "@/components/page-intro";
import { Panel } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";

// GC-4 status, read through get_calendar_status() (google_connections is closed to clients).
// Connect, reconnect and disconnect are built in Phase 3.
export default async function CalendarSettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_calendar_status");
  const status = (data as { status?: string; google_email?: string } | null)?.status ?? "disconnected";
  const email = (data as { google_email?: string } | null)?.google_email;
  return (
    <>
      <PageIntro eyebrow="Google Calendar" context="Time slots on your calendar." statement="Calendar sync arrives in Phase 3." />
      <Panel>
        <p className="type-heading">{status === "connected" ? `Connected as ${email}` : "Not connected"}</p>
        <p className="type-body-sm text-ink-2">Daybook only adds, changes and removes the events it creates.</p>
      </Panel>
    </>
  );
}
