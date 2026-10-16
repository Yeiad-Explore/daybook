import { describe, expect, it } from "vitest";
import { loginErrorFor } from "./login-errors";

describe("loginErrorFor", () => {
  it("recognises the allowlist rejection (AUTH-2 AC1)", () => {
    expect(loginErrorFor("This Daybook is private.")).toBe("private");
  });

  it("maps anything else to a generic failure, never echoing it", () => {
    expect(loginErrorFor("<script>alert(1)</script>")).toBe("failed");
    expect(loginErrorFor(null)).toBe("failed");
  });
});
