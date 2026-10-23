// Test doubles for the sync ports: an in-memory Google Calendar and an in-memory store.
import {
  GoogleError, TokenRevokedError,
  type ClaimedRow, type EventBody, type Finish, type GooglePort, type LogEntry, type StorePort,
} from "./calendar-core.ts";

export class FakeGoogle implements GooglePort {
  events = new Map<string, EventBody>();
  calls: string[] = [];
  /** Errors to throw on the next calls of a method, in order (a `null` lets that call through). */
  failures: Record<string, (Error | null)[]> = {};
  tokenError: Error | null = null;
  private seq = 0;

  private maybeFail(method: string) {
    this.calls.push(method);
    const next = this.failures[method]?.shift();
    if (next) throw next;
  }

  async accessToken(refreshToken: string) {
    this.calls.push("accessToken");
    if (this.tokenError) throw this.tokenError;
    if (refreshToken === "revoked") throw new TokenRevokedError("invalid_grant");
    return `access-for-${refreshToken}`;
  }

  async findByDaybookId(_t: string, _c: string, daybookId: string) {
    this.maybeFail("find");
    for (const [id, e] of this.events) if (e.extendedProperties.private.daybookId === daybookId) return id;
    return null;
  }

  async insert(_t: string, _c: string, event: EventBody) {
    this.maybeFail("insert");
    const id = `evt${++this.seq}`;
    this.events.set(id, structuredClone(event));
    return id;
  }

  async patch(_t: string, _c: string, eventId: string, event: EventBody) {
    this.maybeFail("patch");
    if (!this.events.has(eventId)) throw new GoogleError(404, "notFound");
    this.events.set(eventId, structuredClone(event));
  }

  async remove(_t: string, _c: string, eventId: string) {
    this.maybeFail("remove");
    if (!this.events.has(eventId)) throw new GoogleError(410, "deleted");
    this.events.delete(eventId);
  }
}

export class FakeStore implements StorePort {
  conn: { status: string; calendar_id: string } | null = { status: "connected", calendar_id: "primary" };
  token: string | null = "good";
  finished: { row: ClaimedRow; result: Finish }[] = [];
  logs: LogEntry[] = [];
  reconnectReasons: string[] = [];

  async connection() { return this.conn; }
  async refreshToken() { return this.token; }
  async finish(row: ClaimedRow, result: Finish) { this.finished.push({ row, result }); return true; }
  async markNeedsReconnect(_owner: string, reason: string) {
    this.reconnectReasons.push(reason);
    if (this.conn) this.conn = { ...this.conn, status: "needs_reconnect" };
  }
  async log(entry: LogEntry) { this.logs.push(entry); }
}

export function slot(over: Partial<ClaimedRow> = {}): ClaimedRow {
  return {
    kind: "time_block", id: "11111111-1111-4111-8111-111111111111", owner_id: "owner-1", title: "Python: loops",
    gcal_event_id: null, sync_status: "pending", sync_attempts: 0, next_sync_at: "2026-10-16T14:00:00.000Z",
    starts_at: "2026-10-16T14:00:00+00:00", ends_at: "2026-10-16T15:30:00+00:00",
    space_id: "space-1", space_name: "AI Engineering", page_id: "page-1", page_title: "Overview", timezone: "Asia/Dhaka",
    ...over,
  };
}

export function task(over: Partial<ClaimedRow> = {}): ClaimedRow {
  return slot({ kind: "task", id: "22222222-2222-4222-8222-222222222222", title: "Send proposal", due_date: "2026-10-31", starts_at: undefined, ends_at: undefined, ...over });
}
