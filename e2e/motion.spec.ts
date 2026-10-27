import { expect, test, type Page } from "@playwright/test";
import { OWNER_STATE } from "./global-setup";
import { applyTheme, expectNoHorizontalScroll, themes, widths } from "./helpers/checks";
import { seedSpace, unique } from "./helpers/seed";

test.use({ storageState: OWNER_STATE });

const heroOf = (page: Page) => page.getByRole("region", { name: "Goal", exact: true });

async function runningLong(page: Page) {
  return heroOf(page).evaluate((el) =>
    el.getAnimations({ subtree: true }).some((animation) => {
      const timing = animation.effect?.getComputedTiming();
      const iterations = timing?.iterations;
      const duration = typeof timing?.duration === "number" ? timing.duration : 0;
      return animation.playState === "running" && (iterations === Infinity || duration > 1000);
    }),
  );
}

test("DESIGN motion: a coverless space hero drifts, and a card lifts under a fine pointer", async ({ page }) => {
  const s = await seedSpace({ name: unique("Motion") });
  await page.goto(`/s/${s.spaceId}/${s.pageId}`);
  const hero = heroOf(page);
  await expect(hero).toHaveClass(/aura-drift/);
  await expect(hero).toHaveClass(/hero-timeline/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveClass(/motion-blur-in/);
  await expect(hero.locator(".hero-float")).toBeAttached();
  await expect.poll(async () => hero.evaluate((el) => el.getAnimations().map((animation) => ("animationName" in animation ? String(animation.animationName) : "")))).toContain("aura-drift");

  const rail = page.locator(".card-hover").filter({ has: page.getByRole("heading", { name: "Deadline Rail" }) });
  await rail.hover();
  await expect.poll(async () => rail.evaluate((el) => getComputedStyle(el).transform)).toBe("matrix(1, 0, 0, 1, 0, -2)");

  for (const theme of themes) {
    await applyTheme(page, theme);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalScroll(page, `${theme} ${width}`);
    }
  }
});

test.describe("reduced motion", () => {
  test.use({ storageState: OWNER_STATE, reducedMotion: "reduce" });

  test("DESIGN motion: reduced motion leaves no long-running hero animation", async ({ page }) => {
    const s = await seedSpace({ name: unique("Motion still") });
    await page.goto(`/s/${s.spaceId}/${s.pageId}`);
    await expect(heroOf(page)).toBeVisible();
    await expect.poll(() => runningLong(page)).toBe(false);
  });
});

test("DESIGN motion: the card lift only applies for a pointer that can hover", async ({ page }) => {
  const s = await seedSpace({ name: unique("Motion touch") });
  await page.goto(`/s/${s.spaceId}/${s.pageId}`);
  // This Chromium cannot emulate the hover media feature (matchMedia stays true), so the gate is
  // checked in the served CSS. The fine-pointer lift is the other test.
  const gated = await page.evaluate(() =>
    [...document.styleSheets].some((sheet) => {
      try {
        return [...sheet.cssRules].some((rule) => rule.cssText.includes("@media (hover: hover)") && rule.cssText.includes(".card-hover:hover"));
      } catch {
        return false;
      }
    }),
  );
  expect(gated).toBe(true);
});
