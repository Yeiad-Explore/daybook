import { describe, expect, it } from "vitest";
import { GoogleError } from "./calendar-core.ts";
import { handleCalendarSync, storeGoogleToken, type SyncDeps } from "./handlers.ts";
import { FakeGoogle, FakeStore, slot } from "./calendar-fakes.ts";

const OWNED = "https://www.googleapis.com/auth/calendar.events.owned";
const user = { id: "owner-1", email: "Owner@Gmail.test" };

function tokenDeps(info: { email: string | null; scopes: string[] } | Error) {
  const connected: unknown[][] = [];
  return {
    connected,
    deps: {
      google: { tokenInfo: async () => { if (info instanceof Error) throw info; return info; } },
      store: { connect: async (...args: unknown[]) => { connected.push(args); } },
    },
  };
}

describe("store-google-token (GC-1, GC-2)", () => {
  it("verifies with Google, then stores the refresh token for the signed-in owner", async () => {
    const { deps, connected } = tokenDeps({ email: "owner@gmail.test", scopes: ["openid", OWNED] });
    const r = await storeGoogleToken(deps, user, { refresh_token: "rt", access_token: "at" });
    expect(r).toEqual({ status: 200, body: { status: "connected", google_email: "owner@gmail.test" } });
    expect(connected).toEqual([["owner-1", "owner@gmail.test", ["openid", OWNED], "rt"]]);
  });
  it("never echoes a token back", async () => {
    const { deps } = tokenDeps({ email: "owner@gmail.test", scopes: [OWNED] });
    const r = await storeGoogleToken(deps, user, { refresh_token: "secret-rt", access_token: "secret-at" });
    expect(JSON.stringify(r)).not.toMatch(/secret-/);
  });
  it("accepts the broader fallback scope", async () => {
    const { deps } = tokenDeps({ email: "owner@gmail.test", scopes: ["https://www.googleapis.com/auth/calendar.events"] });
    expect((await storeGoogleToken(deps, user, { refresh_token: "rt", access_token: "at" })).status).toBe(200);
  });
  it("refuses a missing refresh token (Google sent none)", async () => {
    const { deps, connected } = tokenDeps({ email: "owner@gmail.test", scopes: [OWNED] });
    expect(await storeGoogleToken(deps, user, { access_token: "at" })).toEqual({ status: 400, body: { error: "missing_refresh_token" } });
    expect(connected).toHaveLength(0);
  });
  it("refuses when the granted scopes do not include Calendar", async () => {
    const { deps, connected } = tokenDeps({ email: "owner@gmail.test", scopes: ["openid", "email"] });
    expect((await storeGoogleToken(deps, user, { refresh_token: "rt", access_token: "at" })).body).toEqual({ error: "missing_scope" });
    expect(connected).toHaveLength(0);
  });
  it("trusts Google's scope list, not a list the browser could send", async () => {
    const { deps } = tokenDeps({ email: "owner@gmail.test", scopes: ["openid"] });
    const r = await storeGoogleToken(deps, user, { refresh_token: "rt", access_token: "at", scopes: [OWNED] });
    expect(r.body).toEqual({ error: "missing_scope" });
  });
  it("refuses a token that belongs to a different Google account", async () => {
    const { deps, connected } = tokenDeps({ email: "someone.else@gmail.test", scopes: [OWNED] });
    expect(await storeGoogleToken(deps, user, { refresh_token: "rt", access_token: "at" })).toEqual({ status: 403, body: { error: "wrong_account" } });
    expect(connected).toHaveLength(0);
  });
  it("maps a rejected access token to 401 and an outage to 502", async () => {
    expect((await storeGoogleToken(tokenDeps(new GoogleError(400)).deps, user, { refresh_token: "rt", access_token: "at" })).status).toBe(401);
    expect((await storeGoogleToken(tokenDeps(new GoogleError(503)).deps, user, { refresh_token: "rt", access_token: "at" })).status).toBe(502);
    expect((await storeGoogleToken(tokenDeps(new TypeError("offline")).deps, user, { refresh_token: "rt", access_token: "at" })).status).toBe(502);
  });
});

class Store extends FakeStore {
  rows: ReturnType<typeof slot>[] = [];
  claims: unknown[][] = [];
  events: string[] = ["e1", "e2"];
  disconnected = 0;
  async claim(kind: "time_block" | "task", id: string | null, owner: string | null, limit: number) {
    this.claims.push([kind, id, owner, limit]);
    return this.rows.filter((r) => r.kind === kind && (!id || r.id === id) && (!owner || r.owner_id === owner));
  }
  async eventIds() { return this.events; }
  async disconnect() { this.disconnected++; }
}
class Google extends FakeGoogle {
  revoked: string[] = [];
  async revoke(rt: string) { this.revoked.push(rt); }
}
const syncDeps = () => {
  const store = new Store();
  const google = new Google();
  const deps: SyncDeps = { store, google, now: () => new Date("2026-10-16T12:00:00Z") };
  return { store, google, deps };
};
const ID = "11111111-1111-4111-8111-111111111111";

describe("calendar-sync: sync (GC-6)", () => {
  it("the owner syncs their own slot", async () => {
    const { store, deps } = syncDeps();
    store.rows = [slot()];
    const r = await handleCalendarSync(deps, { mode: "user", userId: "owner-1" }, { action: "sync", kind: "time_block", id: ID });
    expect(r.status).toBe(200);
    expect((r.body.results as { outcome: string }[])[0].outcome).toBe("synced");
    expect(store.claims[0]).toEqual(["time_block", ID, "owner-1", 1]);
  });
  it("cannot reach another owner's slot", async () => {
    const { store, deps } = syncDeps();
    store.rows = [slot({ owner_id: "someone-else" })];
    const r = await handleCalendarSync(deps, { mode: "user", userId: "owner-1" }, { action: "sync", kind: "time_block", id: ID });
    expect(r).toEqual({ status: 200, body: { results: [] } });
  });
  it("says so when the calendar is not connected or needs a reconnect (GC-10)", async () => {
    const { store, deps } = syncDeps();
    const call = () => handleCalendarSync(deps, { mode: "user", userId: "owner-1" }, { action: "sync", kind: "time_block", id: ID });
    store.conn = null;
    expect(await call()).toEqual({ status: 409, body: { error: "not_connected" } });
    store.conn = { status: "needs_reconnect", calendar_id: "primary" };
    expect(await call()).toEqual({ status: 409, body: { error: "needs_reconnect" } });
  });
  it("rejects malformed input", async () => {
    const { deps } = syncDeps();
    const auth = { mode: "user", userId: "owner-1" } as const;
    for (const body of [null, {}, { action: "sync" }, { action: "sync", kind: "other", id: ID }, { action: "sync", kind: "task", id: "nope" }, { action: "x" }]) {
      expect((await handleCalendarSync(deps, auth, body)).status).toBe(400);
    }
  });
});

describe("calendar-sync: sweep (GC-6 cron)", () => {
  it("the secret key sweeps everyone's rows, both kinds", async () => {
    const { store, deps } = syncDeps();
    store.rows = [slot()];
    const r = await handleCalendarSync(deps, { mode: "secret" }, { action: "sweep" });
    expect((r.body.results as unknown[]).length).toBe(1);
    expect(store.claims).toEqual([["time_block", null, null, 25], ["task", null, null, 25]]);
  });
  it("a signed-in user's sweep covers only their own rows", async () => {
    const { store, deps } = syncDeps();
    store.rows = [slot({ owner_id: "someone-else" })];
    const r = await handleCalendarSync(deps, { mode: "user", userId: "owner-1" }, { action: "sweep" });
    expect(r).toEqual({ status: 200, body: { results: [] } });
    expect(store.claims.every((c) => c[2] === "owner-1")).toBe(true);
  });
});

describe("calendar-sync: disconnect (GC-5)", () => {
  it("revokes the token and disconnects, keeping events by default", async () => {
    const { store, google, deps } = syncDeps();
    const r = await handleCalendarSync(deps, { mode: "user", userId: "owner-1" }, { action: "disconnect" });
    expect(r).toEqual({ status: 200, body: { status: "disconnected", removed: 0 } });
    expect(google.revoked).toEqual(["good"]);
    expect(store.disconnected).toBe(1);
    expect(google.calls).not.toContain("remove");
  });
  it("removes Daybook's events first when asked, treating already-gone as removed", async () => {
    const { store, google, deps } = syncDeps();
    google.events.set("e1", slot() as never);
    const r = await handleCalendarSync(deps, { mode: "user", userId: "owner-1" }, { action: "disconnect", remove_events: true });
    expect(r.body.removed).toBe(2);
    expect(store.disconnected).toBe(1);
  });
  it("still disconnects when the events could not be removed", async () => {
    const { store, google, deps } = syncDeps();
    google.tokenError = new GoogleError(503);
    const r = await handleCalendarSync(deps, { mode: "user", userId: "owner-1" }, { action: "disconnect", remove_events: true });
    expect(r.status).toBe(200);
    expect(store.disconnected).toBe(1);
  });
  it("disconnects with no token to revoke (already needs a reconnect)", async () => {
    const { store, google, deps } = syncDeps();
    store.token = null;
    await handleCalendarSync(deps, { mode: "user", userId: "owner-1" }, { action: "disconnect" });
    expect(google.revoked).toEqual([]);
    expect(store.disconnected).toBe(1);
  });
  it("the cron key cannot disconnect", async () => {
    const { deps } = syncDeps();
    expect((await handleCalendarSync(deps, { mode: "secret" }, { action: "disconnect" })).status).toBe(403);
  });
});
