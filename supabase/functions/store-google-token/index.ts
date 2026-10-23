// store-google-token (PRD §8.2 GC-2, ADR 0004): the one-time hand-over of Google's tokens right after
// sign-in. Called by /auth/callback on the server with the user's JWT; stores the refresh token in Vault.
import { storeGoogleToken } from "../_shared/handlers.ts";
import { SupabaseStore } from "../_shared/supabase-store.ts";
import { CORS, adminClient, googleClient, identify, reply } from "../_shared/runtime.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return reply({ status: 405, body: { error: "method_not_allowed" } });

  const admin = adminClient();
  const google = googleClient();
  if (!admin || !google) return reply({ status: 500, body: { error: "not_configured" } });

  const caller = await identify(req, admin);
  if (!caller || caller.mode !== "user") return reply({ status: 401, body: { error: "unauthorized" } });

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return reply({ status: 400, body: { error: "bad_request" } });
  }
  try {
    return reply(await storeGoogleToken({ google, store: new SupabaseStore(admin) }, { id: caller.userId, email: caller.email }, body));
  } catch (error) {
    console.error("store-google-token failed:", error instanceof Error ? error.message : "unknown");
    return reply({ status: 500, body: { error: "store_failed" } });
  }
});
