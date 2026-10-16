import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// DESIGN.md "Responsive behavior" + NFR-7/NFR-8: every screen is checked at these widths in both themes.
export const widths = [400, 1440] as const;
export const themes = ["light", "dark"] as const;

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(0);
}

export async function expectNoSeriousA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

/** Runs the layout and accessibility checks for one URL in every theme and width. */
export async function checkScreen(page: Page, url: string) {
  for (const theme of themes) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(url);
      await expectNoHorizontalScroll(page);
      await expectNoSeriousA11yViolations(page);
    }
  }
}
