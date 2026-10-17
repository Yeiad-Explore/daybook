import { describe, expect, it } from "vitest";
import { profileFields } from "./profile-schema";

const valid = { display_name: "Kabid", timezone: "Asia/Dhaka", week_starts_on: 6, currency: "BDT", theme: "light" };

describe("profileFields (SET-1, mirrors C-SCH-06)", () => {
  it("accepts the defaults", () => {
    expect(profileFields.parse(valid)).toEqual(valid);
  });

  it("rejects an unknown timezone with a friendly message", () => {
    const r = profileFields.safeParse({ ...valid, timezone: "Mars/Olympus" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Pick a timezone from the list.");
  });

  it("normalises the currency and rejects codes that are not 3 letters", () => {
    expect(profileFields.parse({ ...valid, currency: " usd " }).currency).toBe("USD");
    expect(profileFields.safeParse({ ...valid, currency: "TAKA" }).success).toBe(false);
  });

  it("only allows Saturday, Sunday or Monday as the week start (PRD §5.8)", () => {
    expect(profileFields.safeParse({ ...valid, week_starts_on: 3 }).success).toBe(false);
  });
});
