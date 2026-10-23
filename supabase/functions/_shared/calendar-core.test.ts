import { describe, expect, it } from "vitest";
import { BACKOFF_MINUTES, GoogleError, MAX_ATTEMPTS, buildEvent, reasonFor, syncRows } from "./calendar-core.ts";
import { FakeGoogle, FakeStore, slot, task } from "./calendar-fakes.ts";

const NOW = new Date("2026-10-16T12:00:00.000Z");
const setup = () => {
  const google = new FakeGoogle();
  const store = new FakeStore();
  return { google, store, deps: { google, store, now: () => NOW, appUrl: "https://daybook.test" } };
};

describe("event mapping (GC-7, GC-11)", () => {
  it("maps a slot to a timed event in the profile timezone with a link back and the daybookId", () => {
    const e = buildEvent(slot(), "https://daybook.test/");
    expect(e.summary).toBe("Python: loops");
    expect(e.description).toBe("From Daybook · AI Engineering · Overview\nhttps://daybook.test/s/space-1/page-1");
    expect(e.start).toEqual({ dateTime: "2026-10-16T14:00:00.000Z", timeZone: "Asia/Dhaka" });
    expect(e.end).toEqual({ dateTime: "2026-10-16T15:30:00.000Z", timeZone: "Asia/Dhaka" });
    expect(e.extendedProperties.private).toEqual({ daybookId: slot().id, daybookKind: "time_block" });
  });
  it("maps a deadline to an all-day event ending the next day", () => {
    const e = buildEvent(task({ due_date: "2026-12-31" }));
    expect(e.start).toEqual({ date: "2026-12-31" });
    expect(e.end).toEqual({ date: "2027-01-01" });
    expect(e.description).toBe("From Daybook · AI Engineering · Overview");
  });
});

describe("create, update, delete (GC-6, GC-8; AC1 to AC3)", () => {
  it("AC1: a new slot becomes one event and its id is stored", async () => {
    const { google, store, deps } = setup();
    const [r] = await syncRows(deps, [slot()]);
    expect(r).toMatchObject({ outcome: "synced", status: "synced" });
    expect(google.events.size).toBe(1);
    expect(store.finished[0].result).toMatchObject({ status: "synced", eventId: "evt1", attempts: 0, error: null, next: null });
    expect(store.logs.at(-1)).toMatchObject({ action: "create", outcome: "ok", target_title: "Python: loops" });
  });

  it("AC2: an edit patches the same event, never a second one", async () => {
    const { google, store, deps } = setup();
    await syncRows(deps, [slot()]);
    const id = store.finished[0].result.eventId as string;
    await syncRows(deps, [slot({ gcal_event_id: id, ends_at: "2026-10-16T16:00:00+00:00" })]);
    expect(google.events.size).toBe(1);
    expect(google.events.get(id)?.end.dateTime).toBe("2026-10-16T16:00:00.000Z");
    expect(store.finished[1].result.eventId).toBe(id);
    expect(store.logs.at(-1)?.action).toBe("update");
  });

  it("AC3: a deleted slot deletes its event and forgets the id", async () => {
    const { google, store, deps } = setup();
    await syncRows(deps, [slot()]);
    const id = store.finished[0].result.eventId as string;
    const [r] = await syncRows(deps, [slot({ gcal_event_id: id, sync_status: "delete_pending" })]);
    expect(r.outcome).toBe("deleted");
    expect(google.events.size).toBe(0);
    expect(store.finished[1].result).toMatchObject({ status: "not_synced", clearEvent: true, error: null, next: null });
  });

  it("deleting an event Google already lost counts as deleted (GC-D5)", async () => {
    const { store, deps } = setup();
    const [r] = await syncRows(deps, [slot({ gcal_event_id: "gone", sync_status: "delete_pending" })]);
    expect(r.outcome).toBe("deleted");
    expect(store.finished[0].result.status).toBe("not_synced");
  });

  it("a delete with no event id just clears the row", async () => {
    const { google, deps } = setup();
    const [r] = await syncRows(deps, [slot({ sync_status: "delete_pending" })]);
    expect(r.outcome).toBe("deleted");
    expect(google.calls).not.toContain("remove");
  });
});

describe("idempotency (GC-8, GC-D6)", () => {
  it("404 on patch recreates the event and stores the new id", async () => {
    const { google, store, deps } = setup();
    const [r] = await syncRows(deps, [slot({ gcal_event_id: "deleted-in-google" })]);
    expect(r.outcome).toBe("synced");
    expect(google.events.size).toBe(1);
    expect(store.finished[0].result.eventId).toBe("evt1");
    expect(store.logs.at(-1)?.action).toBe("recreate");
  });

  it("410 on patch recreates too", async () => {
    const { google, store, deps } = setup();
    google.failures.patch = [new GoogleError(410, "deleted")];
    await syncRows(deps, [slot({ gcal_event_id: "old" })]);
    expect(store.finished[0].result.eventId).toBe("evt1");
  });

  it("adopts an event it already created (crash after Google answered), never a duplicate", async () => {
    const { google, store, deps } = setup();
    await syncRows(deps, [slot()]); // event exists, but pretend the id was never saved
    const [r] = await syncRows(deps, [slot({ gcal_event_id: null })]);
    expect(r.outcome).toBe("synced");
    expect(google.events.size).toBe(1);
    expect(google.calls.filter((c) => c === "insert")).toHaveLength(1);
    expect(store.finished[1].result.eventId).toBe("evt1");
    expect(store.logs.at(-1)?.action).toBe("adopt");
  });

  it("syncing the same row twice leaves one event", async () => {
    const { google, store, deps } = setup();
    await syncRows(deps, [slot()]);
    await syncRows(deps, [slot({ gcal_event_id: store.finished[0].result.eventId as string })]);
    expect(google.events.size).toBe(1);
  });
});

describe("retries and backoff (GC-9)", () => {
  it("backs off 10 min, 30 min, 2 h, 24 h and stops at the fifth failure", async () => {
    const minutes: (number | null)[] = [];
    for (let attempts = 0; attempts < MAX_ATTEMPTS; attempts++) {
      const { google, store, deps } = setup();
      google.failures.insert = [new GoogleError(503)];
      const [r] = await syncRows(deps, [slot({ sync_attempts: attempts })]);
      expect(r).toMatchObject({ outcome: "failed", error: "Google had a problem, will retry." });
      const { next, attempts: n, status } = store.finished[0].result;
      expect([status, n]).toEqual(["failed", attempts + 1]);
      minutes.push(next === null ? null : (new Date(next).getTime() - NOW.getTime()) / 60_000);
    }
    expect(minutes).toEqual([...BACKOFF_MINUTES, null]);
  });

  it("a success after failures resets the count", async () => {
    const { store, deps } = setup();
    await syncRows(deps, [slot({ sync_status: "failed", sync_attempts: 3 })]);
    expect(store.finished[0].result).toMatchObject({ status: "synced", attempts: 0, error: null });
  });

  it("one failing row does not stop the others", async () => {
    const { google, deps } = setup();
    google.failures.insert = [new GoogleError(500), null];
    const rows = [slot(), slot({ id: "33333333-3333-4333-8333-333333333333", title: "Second" })];
    const res = await syncRows(deps, rows);
    expect(res.map((r) => r.outcome)).toEqual(["failed", "synced"]);
  });

  it("a network error is a retryable failure with a plain reason", async () => {
    const { google, store, deps } = setup();
    google.failures.insert = [new TypeError("fetch failed")];
    const [r] = await syncRows(deps, [slot()]);
    expect(r.error).toBe("Couldn't reach Google, will retry.");
    expect(store.logs.at(-1)).toMatchObject({ outcome: "failed", http_status: null });
  });

  it("maps statuses to fixed reasons and never echoes Google's text", () => {
    expect(reasonFor(new GoogleError(429)).reason).toBe("Google is busy, will retry.");
    expect(reasonFor(new GoogleError(403, "rateLimitExceeded")).reason).toBe("Google is busy, will retry.");
    expect(reasonFor(new GoogleError(403, "forbidden")).reason).toBe("Google denied access to the calendar.");
    expect(reasonFor(new GoogleError(404)).reason).toBe("Calendar not found.");
    expect(reasonFor(new GoogleError(400, "invalid: secret-looking text")).reason).toBe("Google refused this event.");
  });

  it("an insert that 404s (no such calendar) is a failure, not a recreate loop", async () => {
    const { google, deps } = setup();
    google.failures.insert = [new GoogleError(404, "notFound")];
    const [r] = await syncRows(deps, [slot()]);
    expect(r).toMatchObject({ outcome: "failed", error: "Calendar not found." });
  });
});

describe("token failure (GC-10)", () => {
  it("a revoked refresh token marks the connection and does not count a failure", async () => {
    const { google, store, deps } = setup();
    store.token = "revoked";
    const res = await syncRows(deps, [slot({ sync_attempts: 2 }), slot({ id: "33333333-3333-4333-8333-333333333333" })]);
    expect(res.map((r) => r.outcome)).toEqual(["skipped", "skipped"]);
    expect(store.conn?.status).toBe("needs_reconnect");
    expect(store.reconnectReasons).toHaveLength(1);
    expect(store.logs.filter((l) => l.action === "needs_reconnect")).toHaveLength(1);
    for (const f of store.finished) expect(f.result).toMatchObject({ status: "pending", attempts: f.row.sync_attempts, error: null });
    expect(google.calls).toEqual(["accessToken"]);
  });

  it("a 401 from Calendar with a fresh token also needs a reconnect, and the rest wait", async () => {
    const { google, store, deps } = setup();
    google.failures.insert = [new GoogleError(401, "authError")];
    const res = await syncRows(deps, [slot(), slot({ id: "33333333-3333-4333-8333-333333333333" })]);
    expect(res.map((r) => r.outcome)).toEqual(["skipped", "skipped"]);
    expect(store.conn?.status).toBe("needs_reconnect");
  });

  it("a missing stored token needs a reconnect", async () => {
    const { store, deps } = setup();
    store.token = null;
    const [r] = await syncRows(deps, [slot()]);
    expect(r.outcome).toBe("skipped");
    expect(store.conn?.status).toBe("needs_reconnect");
  });

  it("nothing is attempted while the connection is not connected", async () => {
    const { google, store, deps } = setup();
    store.conn = { status: "needs_reconnect", calendar_id: "primary" };
    const [r] = await syncRows(deps, [slot()]);
    expect(r.outcome).toBe("skipped");
    expect(google.calls).toEqual([]);
  });

  it("an unreachable token endpoint is a retryable failure, not a reconnect", async () => {
    const { google, store, deps } = setup();
    google.tokenError = new GoogleError(503);
    const [r] = await syncRows(deps, [slot()]);
    expect(r.outcome).toBe("failed");
    expect(store.conn?.status).toBe("connected");
  });
});
