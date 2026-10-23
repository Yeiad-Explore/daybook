import { expect, test, type Page } from "@playwright/test";
import { OWNER_STATE } from "./global-setup";
import { applyTheme, checkScreen } from "./helpers/checks";
import { day, seedBlock, seedColumns, seedField, seedRow, seedSpace, seedStep, seedTask, unique } from "./helpers/seed";

// NFR-7: every screen is usable with the keyboard alone. For each screen, Tab through the whole page and check that
// every stop is on screen, shows a focus indicator, and that focus comes back round (no trap). Also covers the three
// screens the layout/axe suite did not reach (/new, /review, the 404 page), in both themes at both widths.
test.use({ storageState: OWNER_STATE });

type Stop = { label: string; visible: boolean; indicated: boolean; inMain: boolean };

const MAX_STOPS = 400;

async function tabAround(page: Page): Promise<{ stops: Stop[]; cycled: boolean }> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  const stops: Stop[] = [];
  const seen = new Set<Element | string>();
  let cycled = false;
  for (let i = 0; i < MAX_STOPS; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el === document.documentElement) return null;
      const rect = el.getBoundingClientRect();
      const hasRing = (node: Element) => {
        const cs = getComputedStyle(node);
        return (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
      };
      // A ring can sit on a wrapper that reacts to :focus-within (inputs inside a styled field).
      let indicated = hasRing(el);
      for (let p: Element | null = el.parentElement, depth = 0; !indicated && p && depth < 3; p = p.parentElement, depth++) {
        if (p.matches(":focus-within") && hasRing(p)) indicated = true;
      }
      const name = el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 40) || el.getAttribute("name") || "";
      return {
        label: `<${el.tagName.toLowerCase()}${el.getAttribute("role") ? ` role=${el.getAttribute("role")}` : ""}> ${name}`,
        visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0,
        indicated,
        inMain: !!el.closest("main"),
        key: (el as unknown as { __k?: string }).__k ?? ((el as unknown as { __k: string }).__k = Math.random().toString(36)),
      };
    });
    if (!stop) {
      cycled = true; // focus left the page content (browser chrome / body): one full round
      break;
    }
    if (seen.has(stop.key)) {
      cycled = true;
      break;
    }
    seen.add(stop.key);
    stops.push({ label: stop.label, visible: stop.visible, indicated: stop.indicated, inMain: stop.inMain });
  }
  return { stops, cycled };
}

async function keyboardPass(page: Page, url: string, theme: "light" | "dark", minInMain = 1) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(url);
  await applyTheme(page, theme);
  const view = `${url} ${theme}`;
  const { stops, cycled } = await tabAround(page);
  expect(cycled, `${view}: Tab never came back round within ${MAX_STOPS} stops (a trap?)`).toBe(true);
  expect(stops.length, `${view}: nothing is reachable by keyboard`).toBeGreaterThan(0);
  expect(stops.filter((s) => s.inMain).length, `${view}: nothing in <main> is reachable by keyboard`).toBeGreaterThanOrEqual(minInMain);
  expect(stops.filter((s) => !s.visible).map((s) => s.label), `${view}: focus lands on something that is not on screen`).toEqual([]);
  expect(stops.filter((s) => !s.indicated).map((s) => s.label), `${view}: focus is not visible on`).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test(`NFR-7: keyboard-only pass over the shell screens (${theme})`, async ({ page }) => {
    for (const url of ["/today", "/new", "/history", "/review", "/settings", "/settings/calendar", "/settings/data"]) {
      // /review is the Phase 4 placeholder: only the shell is interactive there until the review is built.
      await keyboardPass(page, url, theme, url === "/review" ? 0 : 1);
    }
  });

  test(`NFR-7: keyboard-only pass over a space page with every block type, and its settings (${theme})`, async ({ page }) => {
    const s = await seedSpace({ name: unique("Keys"), kind: "goal", mark: "slate" });
    const todo = await seedBlock(s, "todo", "To do", 6);
    await seedTask(s, todo, "Late thing", day(-2));
    await seedTask(s, todo, "Soon thing", day(3));
    const roadmap = await seedBlock(s, "roadmap", "Roadmap", 6);
    const stage = await seedTask(s, roadmap, "Stage one", day(30));
    await seedTask(s, roadmap, "Step one", day(10), { parent_id: stage });
    const tracker = await seedBlock(s, "tracker", "Body", 4);
    await seedField(s, tracker, "Weight", { unit: "kg", target_value: 72, target_kind: "reach" });
    const table = await seedBlock(s, "table", "Clients", 8);
    const cols = await seedColumns(s, table, [{ name: "Client" }, { name: "Value", kind: "money" }]);
    await seedRow(s, table, cols, { Client: "Bayside Café", Value: 1200 });
    await seedBlock(s, "timeblock", "Study sessions", 6);
    const routine = await seedBlock(s, "routine", "Morning", 6);
    await seedStep(s, routine, "Cleanser");
    await seedBlock(s, "notes", "Notes", 12);
    await keyboardPass(page, `/s/${s.spaceId}/${s.pageId}`, theme, 8);
    await keyboardPass(page, `/s/${s.spaceId}/settings`, theme);
  });
}

test("Layout and accessibility: /new, /review and the 404 page, light and dark at 400 and 1440px", async ({ page }) => {
  await checkScreen(page, "/new");
  await checkScreen(page, "/review");
  await checkScreen(page, "/review/2026-10-17");
  await checkScreen(page, "/no-such-page");
});
