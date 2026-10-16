import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OUT, generateTokensCss, readDesign } from "./gen-tokens.mjs";

const design = readDesign(readFileSync("DESIGN.md", "utf8"));
const css = generateTokensCss(design);

describe("design tokens (DESIGN.md is the source, ADR 0002)", () => {
  it("src/styles/tokens.css is up to date with DESIGN.md (run `pnpm tokens`)", () => {
    expect(readFileSync(OUT, "utf8").replace(/\r\n/g, "\n")).toBe(css);
  });

  it("every dark colour overrides a light colour of the same name", () => {
    const light = Object.keys(design.colors);
    expect(Object.keys(design["colors-dark"]).filter((k) => !light.includes(k))).toEqual([]);
  });

  it("every colour, light and dark, becomes a CSS variable and a Tailwind colour", () => {
    const dark = css.slice(css.indexOf(':root[data-theme="dark"]'));
    for (const [name, value] of Object.entries(design.colors)) {
      if (Array.isArray(value)) {
        value.forEach((v, i) => expect(css).toContain(`--${name}-${["light", "mid", "deep"][i]}: ${v};`));
      } else {
        expect(css).toContain(`--${name}: ${value};`);
        expect(css).toContain(`--color-${name}: var(--${name});`);
      }
    }
    for (const [name, value] of Object.entries(design["colors-dark"])) expect(dark).toContain(`--${name}: ${value};`);
  });

  it("dark applies both when chosen and when the system is dark, unless light is chosen", () => {
    expect(css).toContain(':root[data-theme="dark"] {');
    expect(css).toContain('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {');
  });

  it("removes Tailwind's default palette so only DESIGN.md colours exist", () => {
    expect(css).toMatch(/@theme \{\n(?:.*\n)*?\s+--color-\*: initial;/);
  });

  it("makes every typography token a type-* utility with tabular figures where specified", () => {
    for (const [name, t] of Object.entries(design.typography)) {
      expect(css).toContain(`@utility type-${name} {`);
      if (t.fontFeature === "tnum") {
        const rule = css.slice(css.indexOf(`@utility type-${name} {`)).split("}")[0];
        expect(rule).toContain("font-variant-numeric: tabular-nums;");
      }
    }
  });

  it("gives each of the six space marks its aura palette", () => {
    for (const mark of ["moss", "slate", "ochre", "teal", "clay", "graphite"]) {
      expect(css).toContain(`[data-mark="${mark}"] {\n  --aura-light: var(--aura-${mark}-light);`);
    }
  });
});
