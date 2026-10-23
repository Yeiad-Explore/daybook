import { createClient } from "@supabase/supabase-js";
import { expect } from "@playwright/test";
import { localStack, OWNER_EMAIL } from "../global-setup";
import { db, ownerId } from "./seed";

// Helpers for the Phase 3 specs: the fake Google (e2e/fake-google/server.mjs) and the real local Edge Functions.
const FAKE = "http://localhost:4010";
export const SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";

export type FakeEvent = { summary: string; description: string; start: { dateTime?: string; date?: string; timeZone?: string }; end: { dateTime?: string; date?: string; timeZone?: string }; extendedProperties: { private: Record<string, string> } };

const post = (path: string, body: unknown = {}) => fetch(`${FAKE}${path}`, { method: "POST", body: JSON.stringify(body) });

export const fake = {
  reset: () => post("/__reset"),
  state: async (): Promise<{ events: Record<string, FakeEvent>; calls: string[]; refreshes: number }> => (await fetch(`${FAKE}/__state`)).json(),
  fail: (method: string, status: number, reason = "", count = 1) => post("/__fail", { method, status, reason, count }),
  remove: (id: string) => post("/__remove", { id }),
};

export const functionsUrl = () => `${localStack().url}/functions/v1`;

/** The sync functions must be served for these specs; say so plainly when they are not. */
export async function requireFunctions() {
  const res = await fetch(`${functionsUrl()}/calendar-sync`, { method: "POST", body: "{}" }).catch(() => null);
  expect(res?.status, "Serve the Edge Functions first: pnpm functions:e2e (Docker, with the fake Google on port 4010).").toBe(401);
}

export async function connectCalendar(refreshToken = "good-refresh") {
  const { error } = await db().rpc("connect_google_account", { p_owner: await ownerId(), p_email: OWNER_EMAIL, p_scopes: [SCOPE], p_token: refreshToken });
  if (error) throw error;
}

export async function disconnectCalendar() {
  const owner = await ownerId();
  // Never wipe the owner's real connection: real Google refresh tokens start with "1//", the fake ones do not.
  const { data: stored } = await db().rpc("read_google_refresh_token", { p_owner: owner });
  if (typeof stored === "string" && stored.startsWith("1//")) {
    throw new Error("The local owner is connected to REAL Google Calendar; the calendar e2e would delete that connection. Disconnect it in Settings first.");
  }
  const { error } = await db().rpc("disconnect_google_account", { p_owner: owner });
  if (error) throw error;
  await db().from("google_connections").delete().eq("owner_id", owner);
  await db().from("calendar_sync_log").delete().eq("owner_id", owner);
}

/** What the 10-minute cron job does: the secret key asks calendar-sync to sweep everything that is due. */
export async function sweep() {
  const res = await fetch(`${functionsUrl()}/calendar-sync`, { method: "POST", headers: { apikey: localStack().secret, "Content-Type": "application/json" }, body: JSON.stringify({ action: "sweep" }) });
  expect(res.status).toBe(200);
  return (await res.json()) as { results: { outcome: string }[] };
}

/** A signed-in user's access token (a fresh session for the owner; the browser's own session and password are left alone). */
export async function ownerJwt() {
  const { url, publishable } = localStack();
  const { data: link, error: linkError } = await db().auth.admin.generateLink({ type: "magiclink", email: OWNER_EMAIL });
  if (linkError) throw linkError;
  const client = createClient(url, publishable, { auth: { persistSession: false } });
  const { data, error } = await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (error || !data.session) throw error ?? new Error("No session");
  return data.session.access_token;
}

export async function connectionRow() {
  const { data } = await db().from("google_connections").select("status, google_email, refresh_token_secret_id, last_error, push_deadlines").eq("owner_id", await ownerId()).maybeSingle();
  return data;
}
