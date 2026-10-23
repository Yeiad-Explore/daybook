import { describe, expect, it } from "vitest";
import { handOverGoogleToken } from "./hand-over-token";

const config = { supabaseUrl: "http://127.0.0.1:54321", publishableKey: "pub" };
const session = { access_token: "jwt", provider_token: "g-access", provider_refresh_token: "g-refresh" };

function fake(status: number | Error) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (status instanceof Error) throw status;
    return new Response("{}", { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("handOverGoogleToken (GC-2)", () => {
  it("sends both tokens to store-google-token with the user's JWT, server to server", async () => {
    const { f, calls } = fake(200);
    expect(await handOverGoogleToken(session, config, f)).toBe("stored");
    expect(calls[0].url).toBe("http://127.0.0.1:54321/functions/v1/store-google-token");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer jwt");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ refresh_token: "g-refresh", access_token: "g-access" });
  });
  it("does nothing when Google returned no refresh token", async () => {
    const { f, calls } = fake(200);
    expect(await handOverGoogleToken({ access_token: "jwt", provider_token: "x" }, config, f)).toBe("skipped");
    expect(calls).toHaveLength(0);
  });
  it("reports a refused or unreachable function as failed, without throwing", async () => {
    expect(await handOverGoogleToken(session, config, fake(400).f)).toBe("failed");
    expect(await handOverGoogleToken(session, config, fake(new TypeError("offline")).f)).toBe("failed");
  });
});
