import { describe, expect, it } from "vitest";
import { isPublicPath } from "./paths";

describe("isPublicPath (AUTH-3 AC2)", () => {
  it("allows only the sign-in page and auth callbacks without a session", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
  });

  it("protects everything else, including look-alikes", () => {
    for (const path of ["/", "/today", "/login/x", "/loginx", "/authx", "/settings", "/s/1/2"]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });
});
