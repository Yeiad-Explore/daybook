// Calendar sync core (PRD §8.3, ADR 0004). Plain TypeScript with no runtime imports: the database and Google
// are ports, so Vitest runs every scenario against fakes. The Edge Function entry points wire real clients.

export type Kind = "time_block" | "task";

/** A row handed out by claim_sync_rows(). `next_sync_at` is the lease: results are written only while it matches. */
export interface ClaimedRow {
  kind: Kind;
  id: string;
  owner_id: string;
  title: string;
  gcal_event_id: string | null;
  sync_status: "pending" | "failed" | "delete_pending";
  sync_attempts: number;
  next_sync_at: string;
  starts_at?: string;
  ends_at?: string;
  due_date?: string | null;
  space_id: string;
  space_name: string | null;
  page_id: string | null;
  page_title: string | null;
  timezone: string;
}

export interface EventBody {
  summary: string;
  description: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties: { private: Record<string, string> };
}

/** A non-2xx answer from Google. `reason` is Google's error reason (e.g. rateLimitExceeded), when it gave one. */
export class GoogleError extends Error {
  constructor(readonly status: number, readonly reason = "") {
    super(`Google answered ${status}${reason ? ` (${reason})` : ""}`);
  }
}

/** The refresh token no longer works (revoked, expired, 7-day Testing limit): GC-10. */
export class TokenRevokedError extends Error {}

export interface GooglePort {
  accessToken(refreshToken: string): Promise<string>;
  findByDaybookId(accessToken: string, calendarId: string, daybookId: string): Promise<string | null>;
  insert(accessToken: string, calendarId: string, event: EventBody): Promise<string>;
  patch(accessToken: string, calendarId: string, eventId: string, event: EventBody): Promise<void>;
  remove(accessToken: string, calendarId: string, eventId: string): Promise<void>;
}

export interface Finish {
  status: "synced" | "not_synced" | "failed" | ClaimedRow["sync_status"];
  eventId?: string | null;
  clearEvent?: boolean;
  attempts: number;
  error: string | null;
  next: string | null;
}

export interface LogEntry {
  owner_id: string;
  kind: Kind | "connection";
  target_id: string | null;
  target_title: string | null;
  action: "create" | "update" | "delete" | "recreate" | "adopt" | "connect" | "disconnect" | "needs_reconnect";
  outcome: "ok" | "failed" | "skipped";
  http_status: number | null;
  reason: string | null;
}

export interface StorePort {
  connection(owner: string): Promise<{ status: string; calendar_id: string } | null>;
  refreshToken(owner: string): Promise<string | null>;
  finish(row: ClaimedRow, result: Finish): Promise<boolean>;
  markNeedsReconnect(owner: string, reason: string): Promise<void>;
  log(entry: LogEntry): Promise<void>;
}

export interface Deps {
  google: GooglePort;
  store: StorePort;
  now: () => Date;
  /** Public address of the app, for the link back in the event description. Optional. */
  appUrl?: string;
}

export interface RowResult {
  kind: Kind;
  id: string;
  outcome: "synced" | "deleted" | "failed" | "skipped";
  status: string;
  error?: string;
}

/** GC-9: after failure n the next try is this many minutes later; the fifth failure stops until Retry. */
export const MAX_ATTEMPTS = 5;
export const BACKOFF_MINUTES = [10, 30, 120, 1440];

const RATE_LIMIT = /^(rateLimitExceeded|userRateLimitExceeded|quotaExceeded|backendError)$/;

/** Short, fixed reasons only: raw Google responses never reach the table or the screen (ADR 0004). */
export function reasonFor(error: unknown): { reason: string; status: number | null } {
  if (error instanceof GoogleError) {
    const { status, reason } = error;
    if (status === 429 || (status === 403 && RATE_LIMIT.test(reason))) return { reason: "Google is busy, will retry.", status };
    if (status >= 500) return { reason: "Google had a problem, will retry.", status };
    if (status === 404) return { reason: "Calendar not found.", status };
    if (status === 400) return { reason: "Google refused this event.", status };
    if (status === 403) return { reason: "Google denied access to the calendar.", status };
    return { reason: "Google returned an error.", status };
  }
  return { reason: "Couldn't reach Google, will retry.", status: null };
}

const isGone = (e: unknown) => e instanceof GoogleError && (e.status === 404 || e.status === 410);
// A 401, or a 403 about permissions, from Calendar with a fresh token is a token problem, not a slot problem (GC-10).
const isTokenProblem = (e: unknown) =>
  e instanceof GoogleError && (e.status === 401 || (e.status === 403 && /insufficientPermissions|forbidden|authError/.test(e.reason)));

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** GC-7 (slots) and GC-11 (deadlines, all-day). */
export function buildEvent(row: ClaimedRow, appUrl?: string): EventBody {
  const where = ["From Daybook", row.space_name, row.page_title].filter(Boolean).join(" · ");
  const link = appUrl && row.page_id ? `\n${appUrl.replace(/\/$/, "")}/s/${row.space_id}/${row.page_id}` : "";
  const base = {
    summary: row.title,
    description: where + link,
    extendedProperties: { private: { daybookId: row.id, daybookKind: row.kind } },
  };
  if (row.kind === "task") {
    const due = row.due_date as string;
    return { ...base, start: { date: due }, end: { date: addDays(due, 1) } };
  }
  return {
    ...base,
    start: { dateTime: new Date(row.starts_at as string).toISOString(), timeZone: row.timezone },
    end: { dateTime: new Date(row.ends_at as string).toISOString(), timeZone: row.timezone },
  };
}

/** Syncs claimed rows. A failure on one row never stops the others. */
export async function syncRows(deps: Deps, rows: ClaimedRow[]): Promise<RowResult[]> {
  const results: RowResult[] = [];
  const byOwner = new Map<string, ClaimedRow[]>();
  for (const row of rows) byOwner.set(row.owner_id, [...(byOwner.get(row.owner_id) ?? []), row]);
  for (const [owner, ownerRows] of byOwner) results.push(...(await syncOwner(deps, owner, ownerRows)));
  return results;
}

async function release(deps: Deps, rows: ClaimedRow[], error?: string): Promise<RowResult[]> {
  const next = deps.now().toISOString();
  return Promise.all(
    rows.map(async (row) => {
      await deps.store.finish(row, { status: row.sync_status, attempts: row.sync_attempts, error: null, next });
      return { kind: row.kind, id: row.id, outcome: "skipped" as const, status: row.sync_status, error };
    }),
  );
}

async function needsReconnect(deps: Deps, owner: string, rows: ClaimedRow[], reason: string): Promise<RowResult[]> {
  await deps.store.markNeedsReconnect(owner, reason);
  await deps.store.log({ owner_id: owner, kind: "connection", target_id: null, target_title: null, action: "needs_reconnect", outcome: "failed", http_status: null, reason });
  return release(deps, rows, reason);
}

async function syncOwner(deps: Deps, owner: string, rows: ClaimedRow[]): Promise<RowResult[]> {
  const conn = await deps.store.connection(owner);
  if (!conn || conn.status !== "connected") return release(deps, rows, "Google Calendar is not connected.");

  const refreshToken = await deps.store.refreshToken(owner);
  if (!refreshToken) return needsReconnect(deps, owner, rows, "Reconnect Google Calendar.");

  let access: string;
  try {
    access = await deps.google.accessToken(refreshToken);
  } catch (error) {
    if (error instanceof TokenRevokedError) return needsReconnect(deps, owner, rows, "Google no longer accepts the saved sign-in. Reconnect Google Calendar.");
    // The token endpoint answered with something other than invalid_grant (a bad client secret, an outage): say
    // so, instead of blaming each event.
    const status = error instanceof GoogleError ? error.status : null;
    return Promise.all(rows.map((row) => fail(deps, row, error, { reason: "Couldn't sign in to Google, will retry.", status })));
  }

  const results: RowResult[] = [];
  for (const row of rows) {
    try {
      results.push(await syncRow(deps, access, conn.calendar_id, row));
    } catch (error) {
      if (isTokenProblem(error)) {
        const [skipped] = await needsReconnect(deps, owner, [row], "Google no longer accepts the saved sign-in. Reconnect Google Calendar.");
        results.push(skipped);
        break; // the rest would fail the same way; they wait for the reconnect
      }
      results.push(await fail(deps, row, error));
    }
  }
  const done = new Set(results.map((r) => r.id));
  const left = rows.filter((r) => !done.has(r.id));
  if (left.length) results.push(...(await release(deps, left, "Reconnect Google Calendar.")));
  return results;
}

async function syncRow(deps: Deps, access: string, calendarId: string, row: ClaimedRow): Promise<RowResult> {
  const { google, store } = deps;
  const logOk = (action: LogEntry["action"]) =>
    store.log({ owner_id: row.owner_id, kind: row.kind, target_id: row.id, target_title: row.title, action, outcome: "ok", http_status: null, reason: null });

  if (row.sync_status === "delete_pending") {
    if (row.gcal_event_id) {
      try {
        await google.remove(access, calendarId, row.gcal_event_id);
      } catch (error) {
        if (!isGone(error)) throw error; // GC-D5: already gone counts as deleted
      }
    }
    await store.finish(row, { status: "not_synced", clearEvent: true, attempts: 0, error: null, next: null });
    await logOk("delete");
    return { kind: row.kind, id: row.id, outcome: "deleted", status: "not_synced" };
  }

  const event = buildEvent(row, deps.appUrl);
  let eventId = row.gcal_event_id;
  let action: LogEntry["action"] = "update";

  if (eventId) {
    try {
      await google.patch(access, calendarId, eventId, event); // GC-8: same event, same id
    } catch (error) {
      if (!isGone(error)) throw error;
      eventId = null; // the event was deleted on Google: look for it, else create it again
      action = "recreate";
    }
  }
  if (!eventId) {
    const found = await google.findByDaybookId(access, calendarId, row.id); // GC-D6: never duplicate
    if (found) {
      await google.patch(access, calendarId, found, event);
      eventId = found;
      if (action !== "recreate") action = "adopt";
    } else {
      eventId = await google.insert(access, calendarId, event);
      if (action !== "recreate") action = "create";
    }
  }
  await store.finish(row, { status: "synced", eventId, attempts: 0, error: null, next: null });
  await logOk(action);
  return { kind: row.kind, id: row.id, outcome: "synced", status: "synced" };
}

async function fail(deps: Deps, row: ClaimedRow, error: unknown, override?: { reason: string; status: number | null }): Promise<RowResult> {
  const { reason, status } = override ?? reasonFor(error);
  // A delete that failed is still a delete: turning it into "failed" would make the next try PATCH the event of an
  // item that is in the Trash or done, and it would never leave the calendar.
  const stays = row.sync_status === "delete_pending";
  const attempts = row.sync_attempts + 1;
  const next = attempts >= MAX_ATTEMPTS ? null : new Date(deps.now().getTime() + BACKOFF_MINUTES[attempts - 1] * 60_000).toISOString();
  await deps.store.finish(row, { status: stays ? "delete_pending" : "failed", attempts, error: reason, next });
  await deps.store.log({
    owner_id: row.owner_id, kind: row.kind, target_id: row.id, target_title: row.title,
    action: row.sync_status === "delete_pending" ? "delete" : row.gcal_event_id ? "update" : "create",
    outcome: "failed", http_status: status, reason,
  });
  return { kind: row.kind, id: row.id, outcome: "failed", status: stays ? "delete_pending" : "failed", error: reason };
}
