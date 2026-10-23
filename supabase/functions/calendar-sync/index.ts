// calendar-sync (PRD §8.3, ADR 0004): pushes slots and deadlines to Google Calendar, and disconnects.
// verify_jwt is off in config.toml because the cron job authenticates with the secret key; the caller is
// checked in identify() instead: the secret key (sweep) or a signed-in user's JWT (their own rows only).
import { handleCalendarSync } from "../_shared/handlers.ts";
import { SupabaseStore } from "../_shared/supabase-store.ts";
import { CORS, adminClient, appUrl, googleClient, identify, reply } from "../_shared/runtime.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return reply({ status: 405, body: { error: "method_not_allowed" } });

  const admin = adminClient();
  const google = googleClient();
  if (!admin || !google) return reply({ status: 500, body: { error: "not_configured" } });

  const caller = await identify(req, admin);
  if (!caller) return reply({ status: 401, body: { error: "unauthorized" } });

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return reply({ status: 400, body: { error: "bad_request" } });
  }
  try {
    return reply(
      await handleCalendarSync(
        { store: new SupabaseStore(admin), google, now: () => new Date(), appUrl: appUrl() },
        caller.mode === "secret" ? { mode: "secret" } : { mode: "user", userId: caller.userId },
        body,
      ),
    );
  } catch (error) {
    console.error("calendar-sync failed:", error instanceof Error ? error.message : "unknown");
    return reply({ status: 500, body: { error: "sync_failed" } });
  }
});
