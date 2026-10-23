import { describe, expect, it } from "vitest";
import { GoogleError, TokenRevokedError } from "./calendar-core.ts";
import { buildEvent } from "./calendar-core.ts";
import { GoogleClient } from "./google.ts";
import { slot } from "./calendar-fakes.ts";

type Call = { url: string; init: RequestInit };
function client(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { calls, google: new GoogleClient({ clientId: "cid", clientSecret: "csecret", fetch: f }) };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("GoogleClient", () => {
  it("exchanges the refresh token for an access token", async () => {
    const { calls, google } = client(() => json({ access_token: "at-1" }));
    expect(await google.accessToken("rt-1")).toBe("at-1");
    const body = new URLSearchParams(String(calls[0].init.body));
    expect(Object.fromEntries(body)).toEqual({ client_id: "cid", client_secret: "csecret", refresh_token: "rt-1", grant_type: "refresh_token" });
  });

  it("invalid_grant means the token is revoked or expired (GC-10)", async () => {
    const { google } = client(() => json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400));
    await expect(google.accessToken("rt")).rejects.toBeInstanceOf(TokenRevokedError);
  });

  it("other token errors are plain Google errors", async () => {
    const { google } = client(() => json({ error: "temporarily_unavailable" }, 503));
    await expect(google.accessToken("rt")).rejects.toMatchObject({ status: 503 });
  });

  it("inserts, patches and deletes on the calendar with the bearer token and returns the id", async () => {
    const { calls, google } = client((c) => (c.init.method === "DELETE" ? new Response(null, { status: 204 }) : json({ id: "evt9" })));
    const event = buildEvent(slot());
    expect(await google.insert("at", "primary", event)).toBe("evt9");
    await google.patch("at", "primary", "evt9", event);
    await google.remove("at", "primary", "evt9");
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      "POST https://www.googleapis.com/calendar/v3/calendars/primary/events",
      "PATCH https://www.googleapis.com/calendar/v3/calendars/primary/events/evt9",
      "DELETE https://www.googleapis.com/calendar/v3/calendars/primary/events/evt9",
    ]);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer at");
    expect(JSON.parse(String(calls[0].init.body)).extendedProperties.private.daybookId).toBe(slot().id);
  });

  it("looks an event up by daybookId and finds none or one", async () => {
    const { calls, google } = client((c) => json({ items: c.url.includes("daybookId%3Dhit") ? [{ id: "found" }] : [] }));
    expect(await google.findByDaybookId("at", "primary", "hit")).toBe("found");
    expect(await google.findByDaybookId("at", "primary", "miss")).toBeNull();
    expect(calls[0].url).toContain("privateExtendedProperty=daybookId%3Dhit");
  });

  it("turns a Calendar error into a GoogleError with Google's reason", async () => {
    const { google } = client(() => json({ error: { code: 403, errors: [{ reason: "rateLimitExceeded" }] } }, 403));
    await expect(google.remove("at", "primary", "e")).rejects.toEqual(new GoogleError(403, "rateLimitExceeded"));
  });

  it("reads the email and granted scopes from tokeninfo", async () => {
    const { google } = client(() => json({ email: "me@gmail.test", scope: "openid https://www.googleapis.com/auth/calendar.events.owned" }));
    expect(await google.tokenInfo("at")).toEqual({ email: "me@gmail.test", scopes: ["openid", "https://www.googleapis.com/auth/calendar.events.owned"] });
  });

  it("revoke never throws", async () => {
    const f = (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
    await expect(new GoogleClient({ clientId: "a", clientSecret: "b", fetch: f }).revoke("rt")).resolves.toBeUndefined();
  });
});
