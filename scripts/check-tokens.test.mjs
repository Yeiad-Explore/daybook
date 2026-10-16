import { describe, expect, it } from "vitest";
import { findRawColours } from "./check-tokens.mjs";

describe("findRawColours", () => {
  it("flags hex and colour functions", () => {
    expect(findRawColours('const a = "#fff";\nborder: 1px solid rgba(0,0,0,.1);')).toEqual([
      { line: 1, match: "#fff" },
      { line: 2, match: "rgba(" },
    ]);
  });

  it("ignores token references and anchors", () => {
    expect(findRawColours('color: var(--color-ink); href="#block-12"')).toEqual([]);
  });
});
