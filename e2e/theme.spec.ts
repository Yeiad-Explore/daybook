import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { parse } from "yaml";
import { applyTheme } from "./helpers/checks";

// Expected values come from DESIGN.md itself, the single source of the tokens.
const design = parse(readFileSync("DESIGN.md", "utf8").split(/^---$/m)[1]);
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const LIGHT = rgb(design.colors.canvas);
const DARK = rgb(design["colors-dark"].canvas);

const canvas = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);

test("light is the default, even when the computer is set to dark", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  expect(await canvas(page)).toBe(LIGHT);
});

test("dark is used when chosen, without a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await applyTheme(page, "dark");
  expect(await canvas(page)).toBe(DARK);
  await applyTheme(page, "light");
  expect(await canvas(page)).toBe(LIGHT);
});

test("'follow my system' tracks the computer's setting", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await applyTheme(page, "system");
  expect(await canvas(page)).toBe(LIGHT);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await canvas(page)).toBe(DARK);
});

test("fonts are self-hosted: no request leaves for Google Fonts (NFR-4)", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) external.push(r.url());
  });
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  expect(external).toEqual([]);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("Inter");
});
