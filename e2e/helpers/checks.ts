import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// DESIGN.md "Responsive behavior" + NFR-7/NFR-8: every screen is checked at these widths in both themes.
export const widths = [400, 1440] as const;
export const themes = ["light", "dark"] as const;

export async function expectNoHorizontalScroll(page: Page, view = "") {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `page scrolls sideways ${view}`).toBeLessThanOrEqual(0);
}

export async function expectNoSeriousA11yViolations(page: Page, view = "") {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  // Each finding names the view, the element and the reason, so a failure is actionable.
  const findings = serious.flatMap((v) =>
    v.nodes.slice(0, 5).map((n) => {
      const why = (n.failureSummary ?? "").split(/\r?\n/).slice(1).join(" ").trim();
      return `[${view}] ${v.id}: ${n.target.join(" ")}: ${why}`;
    }),
  );
  expect(findings).toEqual([]);
}

/** Runs the layout and accessibility checks for one URL in every theme and width. */
export async function checkScreen(page: Page, url: string) {
  for (const theme of themes) {
    for (const width of widths) {
      const view = `${theme} ${width}px`;
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(url);
      await expectNoHorizontalScroll(page, view);
      await expectNoSeriousA11yViolations(page, view);
    }
  }
}
