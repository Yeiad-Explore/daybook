// Generates src/styles/tokens.css from the DESIGN.md front matter, the only source of design tokens
// (ADR 0002). Run `pnpm tokens` after editing DESIGN.md; scripts/gen-tokens.test.mjs fails when the
// two drift apart.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

export const OUT = "src/styles/tokens.css";

// DESIGN.md "Typography → Families": fallback after the self-hosted fonts.
const FALLBACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FAMILY = { "Inter Tight": "var(--font-inter-tight)", Inter: "var(--font-inter)" };
const AURA_STOPS = ["light", "mid", "deep"];

export function readDesign(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error("DESIGN.md has no front matter");
  return parse(match[1]);
}

const block = (selector, lines) => `${selector} {\n${lines.map((l) => `  ${l}`).join("\n")}\n}`;

function colorVars(colors) {
  return Object.entries(colors).flatMap(([name, value]) =>
    Array.isArray(value)
      ? value.map((v, i) => `--${name}-${AURA_STOPS[i]}: ${v};`)
      : [`--${name}: ${value};`],
  );
}

export function generateTokensCss(design) {
  const { colors, typography, rounded, spacing, elevation, layout } = design;
  const dark = design["colors-dark"];
  const flatColors = Object.keys(colors).filter((k) => !Array.isArray(colors[k]));
  const auras = Object.keys(colors).filter((k) => Array.isArray(colors[k])).map((k) => k.replace(/^aura-/, ""));

  const theme = block("@theme", [
    "/* Only DESIGN.md values exist: Tailwind's default palette, radii, shadows, sizes and breakpoints are removed. */",
    "--color-*: initial;",
    "--radius-*: initial;",
    "--shadow-*: initial;",
    "--text-*: initial;",
    "--breakpoint-*: initial;",
    "/* spacing: 4px base; DESIGN.md steps 1–9 = 4, 8, 12, 16, 20, 24, 32, 48, 72px (p-1 … p-6, p-8, p-12, p-18). */",
    `--spacing: ${spacing[1]};`,
    ...Object.entries(rounded).map(([k, v]) => `--radius-${k}: ${v};`),
    `--shadow-card: ${elevation.card};`,
    `--shadow-card-hover: ${elevation["card-hover"]};`,
    `--shadow-float: ${elevation.float};`,
    `--shadow-glass-edge: ${elevation["glass-edge"]};`,
    `--container-content: ${layout["content-max"]};`,
    `--container-document: ${layout["document-max"]};`,
    "/* DESIGN.md \"Responsive behavior\": phone < 640 ≤ tablet < 900 ≤ laptop < 1200 ≤ desktop. */",
    "--breakpoint-tablet: 640px;",
    "--breakpoint-laptop: 900px;",
    "--breakpoint-desktop: 1200px;",
  ]);

  const themeInline = block("@theme inline", [
    `--font-sans: var(--font-inter), ${FALLBACK};`,
    `--font-display: var(--font-inter-tight), ${FALLBACK};`,
    ...flatColors.map((k) => `--color-${k}: var(--${k});`),
    ...["surface-dark", "on-dark", "on-dark-2"].map((k) => `--color-${k}-fixed: var(--${k}-fixed);`),
    ...auras.flatMap((a) => AURA_STOPS.map((s) => `--color-aura-${a}-${s}: var(--aura-${a}-${s});`)),
    "--color-aura-light: var(--aura-light);",
    "--color-aura-mid: var(--aura-mid);",
    "--color-aura-deep: var(--aura-deep);",
  ]);

  const root = block(":root", [
    "color-scheme: light;",
    ...colorVars(colors),
    `--glass-filter: ${elevation["blur-glass"].replace(/^backdrop-filter:\s*/, "")};`,
    ...Object.entries(spacing).map(([k, v]) => `--space-${k}: ${v};`),
    ...Object.entries(layout).map(([k, v]) => `--layout-${k}: ${v};`),
    "/* Theme-fixed copies: aura cards and dark glass look the same in both themes (DESIGN.md \"Dark theme\"). */",
    ...["surface-dark", "on-dark", "on-dark-2"].map((k) => `--${k}-fixed: ${colors[k]};`),
    "/* Default aura (graphite) until an element sets data-mark. */",
    ...AURA_STOPS.map((s) => `--aura-${s}: var(--aura-graphite-${s});`),
  ]);

  const darkLines = ["color-scheme: dark;", ...colorVars(dark)];
  const darkCss = [
    block(':root[data-theme="dark"]', darkLines),
    `@media (prefers-color-scheme: dark) {\n${block(':root[data-theme="system"]', darkLines).replace(/^/gm, "  ")}\n}`,
  ].join("\n\n");

  const marks = auras
    .map((a) => block(`[data-mark="${a}"]`, AURA_STOPS.map((s) => `--aura-${s}: var(--aura-${a}-${s});`)))
    .join("\n");

  const typeUtilities = Object.entries(typography)
    .map(([name, t]) =>
      block(`@utility type-${name}`, [
        `font-family: ${FAMILY[t.fontFamily] ?? t.fontFamily}, ${FALLBACK};`,
        `font-size: ${t.fontSize};`,
        `font-weight: ${t.fontWeight};`,
        `line-height: ${t.lineHeight};`,
        ...(t.letterSpacing ? [`letter-spacing: ${t.letterSpacing};`] : []),
        ...(t.textTransform ? [`text-transform: ${t.textTransform};`] : []),
        ...(t.fontFeature === "tnum" ? ["font-variant-numeric: tabular-nums;"] : []),
      ]),
    )
    .join("\n");

  return [
    "/* GENERATED from the DESIGN.md front matter by scripts/gen-tokens.mjs. Do not edit: run `pnpm tokens`. */",
    "/* The only file allowed to contain raw colour values (ADR 0002, `pnpm check:tokens`). */",
    theme,
    themeInline,
    root,
    darkCss,
    "/* Aura palette per space mark (PRD mark_color). */",
    marks,
    "/* Typography tokens: class=\"type-hero\", \"type-number-lg\", … */",
    typeUtilities,
    "",
  ].join("\n\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(OUT, generateTokensCss(readDesign(readFileSync("DESIGN.md", "utf8"))));
  console.log(`wrote ${OUT}`);
}
