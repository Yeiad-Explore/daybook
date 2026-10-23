// Request handling for the two Edge Functions, free of Deno and supabase-js so it can be tested with fakes.
import { GoogleError, syncRows, type ClaimedRow, type Deps, type GooglePort, type Kind, type RowResult, type StorePort } from "./calendar-core.ts";

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, status = 400): Reply => ({ status, body: { error } });

// ---------------------------------------------------------------------------------------------
// store-google-token (GC-2): the one-time hand-over right after sign-in.
// ---------------------------------------------------------------------------------------------
/** Any of these lets Daybook write events on the owner's primary calendar. The narrowest is requested (GC-1). */
export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar",
];

export interface TokenGoogle {
  tokenInfo(accessToken: string): Promise<{ email: string | null; scopes: string[] }>;
}
export interface TokenStore {
  connect(owner: string, email: string, scopes: string[], refreshToken: string): Promise<void>;
}

export async function storeGoogleToken(
  deps: { google: TokenGoogle; store: TokenStore },
  user: { id: string; email: string | null },
  body: unknown,
): Promise<Reply> {
  const { refresh_token: refresh, access_token: access } = (body ?? {}) as Record<string, unknown>;
  // Google only returns a refresh token when asked with access_type=offline and prompt=consent (GC-1).
  if (typeof refresh !== "string" || !refresh) return bad("missing_refresh_token");
  if (typeof access !== "string" || !access) return bad("missing_access_token");

  let info: { email: string | null; scopes: string[] };
  try {
    info = await deps.google.tokenInfo(access); // what Google says, never what the browser says
  } catch (error) {
    return error instanceof GoogleError && error.status >= 400 && error.status < 500 ? bad("invalid_access_token", 401) : bad("google_unreachable", 502);
  }
  if (!info.scopes.some((s) => CALENDAR_SCOPES.includes(s))) return bad("missing_scope");
  if (!info.email || !user.email || info.email.toLowerCase() !== user.email.toLowerCase()) return bad("wrong_account", 403);

  await deps.store.connect(user.id, info.email, info.scopes, refresh);
  return { status: 200, body: { status: "connected", google_email: info.email } };
}

// ---------------------------------------------------------------------------------------------
// calendar-sync (GC-6, GC-8, GC-9, GC-10, GC-5)
// ---------------------------------------------------------------------------------------------
export type Auth = { mode: "user"; userId: string } | { mode: "secret" };

export interface SyncStore extends StorePort {
  claim(kind: Kind, id: string | null, owner: string | null, limit: number): Promise<ClaimedRow[]>;
  eventIds(owner: string): Promise<string[]>;
  disconnect(owner: string): Promise<void>;
}
export interface SyncGoogle extends GooglePort {
  revoke(refreshToken: string): Promise<void>;
}
export type SyncDeps = Omit<Deps, "store" | "google"> & { store: SyncStore; google: SyncGoogle };

const SWEEP_LIMIT = 25;

export async function handleCalendarSync(deps: SyncDeps, auth: Auth, body: unknown): Promise<Reply> {
  const input = (body ?? {}) as Record<string, unknown>;

  if (input.action === "sweep") {
    // The cron job (secret key) sweeps everyone's due rows; a signed-in user sweeps only their own (Retry all, deadlines on).
    const owner = auth.mode === "user" ? auth.userId : null;
    const rows = [...(await deps.store.claim("time_block", null, owner, SWEEP_LIMIT)), ...(await deps.store.claim("task", null, owner, SWEEP_LIMIT))];
    return { status: 200, body: { results: await syncRows(deps, rows) } };
  }

  if (input.action === "sync") {
    const { kind, id } = input;
    if ((kind !== "time_block" && kind !== "task") || typeof id !== "string" || !UUID.test(id)) return bad("bad_request");
    const owner = auth.mode === "user" ? auth.userId : null;
    const rows = await deps.store.claim(kind, id, owner, 1);
    if (rows.length === 0 && owner) {
      const conn = await deps.store.connection(owner);
      if (!conn || conn.status === "disconnected") return bad("not_connected", 409);
      if (conn.status !== "connected") return bad("needs_reconnect", 409);
    }
    const results: RowResult[] = await syncRows(deps, rows);
    return { status: 200, body: { results } };
  }

  if (input.action === "disconnect") {
    if (auth.mode !== "user") return bad("forbidden", 403);
    const owner = auth.userId;
    const token = await deps.store.refreshToken(owner); // null unless connected: then there is nothing to revoke
    let removed = 0;
    if (token) {
      if (input.remove_events === true) {
        try {
          const access = await deps.google.accessToken(token);
          const conn = await deps.store.connection(owner);
          for (const eventId of await deps.store.eventIds(owner)) {
            try {
              await deps.google.remove(access, conn?.calendar_id ?? "primary", eventId);
              removed++;
            } catch (error) {
              if (error instanceof GoogleError && (error.status === 404 || error.status === 410)) removed++;
            }
          }
        } catch {
          // The owner still asked to disconnect: events that could not be removed stay on Google.
        }
      }
      await deps.google.revoke(token);
    }
    await deps.store.disconnect(owner);
    return { status: 200, body: { status: "disconnected", removed } };
  }

  return bad("bad_request");
}
