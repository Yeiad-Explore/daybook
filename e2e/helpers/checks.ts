import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

// DESIGN.md "Responsive behavior" + NFR-7/NFR-8: every screen is checked at these widths in both themes.
export const widths = [400, 1440] as const;
export const themes = ["light", "dark"] as const;

/** Applies a theme the way the saved profile setting will (data-theme on <html>). */
export async function applyTheme(page: Page, theme: "light" | "dark" | "system") {
  await page.evaluate(async (t) => {
    document.documentElement.dataset.theme = t;
    // Let the colour transitions this starts finish, so checks read the final colours, not a mid-fade.
    // The space hero's aura drift loops forever; waiting on that promise would never return.
    await new Promise(requestAnimationFrame);
    // Infinite loops (aura drift) and scroll-linked timelines never settle.
    const finite = document.getAnimations().filter((a) => {
      if (a.effect?.getComputedTiming().iterations === Infinity) return false;
      return a.timeline == null || a.timeline === document.timeline;
    });
    await Promise.all(finite.map((a) => a.finished.catch(() => {})));
  }, theme);
}

export async function expectNoHorizontalScroll(page: Page, view = "") {
  const { overflow, culprits } = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    // Elements past the right edge that no scrolling or clipping ancestor contains: the cause, not its parents.
    const contained = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) if (getComputedStyle(p).overflowX !== "visible") return true;
      return false;
    };
    const culprits = [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > vw + 1 && !contained(el))
      .slice(-3)
      .map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute("class")?.slice(0, 80)}"> "${el.textContent?.trim().slice(0, 50)}"`);
    return { overflow: document.documentElement.scrollWidth - vw, culprits };
  });
  expect(overflow, `page scrolls sideways ${view}: ${culprits.join(" | ")}`).toBeLessThanOrEqual(0);
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
      const view = `${url} ${theme} ${width}px`;
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(url);
      await applyTheme(page, theme);
      await expectNoHorizontalScroll(page, view);
      await expectNoSeriousA11yViolations(page, view);
    }
  }
}

/** Glass selects are menus. `name` is the visible option; `{ index }` matches the old selectOption index. */
export async function pickOption(control: Locator, option: string | { index: number }) {
  await control.click();
  const menu = control.page().getByRole("menu");
  const item = typeof option === "string" ? menu.getByRole("menuitem", { name: option, exact: true }) : menu.getByRole("menuitem").nth(option.index);
  await item.click();
}

/** Interactions before React hydrates are lost; wait until the element has React's props attached. */
export async function hydrated(page: Page, selector = "main") {
  await page.waitForFunction((s) => {
    const el = document.querySelector(s);
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
  }, selector);
}
