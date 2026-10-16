import { describe, expect, it } from "vitest";
import { CALENDAR_EVENTS_SCOPE, googleSignInOptions } from "./sign-in-options";

describe("googleSignInOptions (AUTH-1 AC2, GC-1)", () => {
  it("asks for Calendar events, offline access and consent, and returns to the callback", () => {
    expect(googleSignInOptions("http://localhost:3000")).toEqual({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000/auth/callback",
        scopes: CALENDAR_EVENTS_SCOPE,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
  });
});
