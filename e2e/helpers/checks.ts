import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// DESIGN.md "Responsive behavior" + NFR-7/NFR-8: every screen is checked at these widths in both themes.
export const widths = [400, 1440] as const;
export const themes = ["light", "dark"] as const;

/** Applies a theme the way the saved profile setting will (data-theme on <html>). */
export async function applyTheme(page: Page, theme: "light" | "dark" | "system") {
  await page.evaluate(async (t) => {
    document.documentElement.dataset.theme = t;
    // Let the colour transitions this starts finish, so checks read the final colours, not a mid-fade.
    await new Promise(requestAnimationFrame);
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
  }, theme);
}

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
  const contrast = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  // axe files some failures as "incomplete" (e.g. "a 1:1 contrast ratio", which it suspects is hidden
  // text). Where it did compute a ratio, treat it as a failure; gradients and glass stay excluded.
  const unsure = contrast.incomplete
    .map((v) => ({ ...v, nodes: v.nodes.filter((n) => n.any.some((a) => /contrast ratio/.test(a.message))) }))
    .filter((v) => v.nodes.length > 0);
  const serious = [...violations.filter((v) => v.impact === "critical" || v.impact === "serious"), ...unsure];
  // Each finding names the view, the element and the reason, so a failure is actionable.
  const findings = serious.flatMap((v) =>
    v.nodes.slice(0, 5).map((n) => {
      const why = n.failureSummary?.split(/\r?\n/).slice(1).join(" ").trim() || n.any.map((a) => a.message).join(" ");
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
      await applyTheme(page, theme);
      await expectNoHorizontalScroll(page, view);
      await expectNoSeriousA11yViolations(page, view);
    }
  }
}
