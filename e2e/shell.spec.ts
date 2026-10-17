import { expect, test } from "@playwright/test";
import { OWNER_STATE } from "./global-setup";
import { checkScreen } from "./helpers/checks";

test.use({ storageState: OWNER_STATE });

// PRD §5.1: every route renders inside the shell (placeholders are fine in Phase 0).
const routes = ["/today", "/new", "/review", "/review/2026-10-10", "/history", "/settings", "/settings/calendar", "/settings/data"];

for (const route of routes) {
  test(`${route} renders inside the shell without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Index" })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("the Index lists goals with days left and life areas (PRD §5.2)", async ({ page }) => {
  await page.goto("/today");
  const index = page.getByRole("navigation", { name: "Index" });
  await expect(index.getByRole("region", { name: "Goals" }).getByRole("link", { name: /Health/ })).toContainText(/\d+/);
  await expect(index.getByRole("region", { name: "Goals" })).toContainText("days left");
  await expect(index.getByRole("region", { name: "Life areas" }).getByRole("link", { name: /Finance/ })).toBeVisible();
  await expect(index.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
});

test("a space opens on its first page; a space without pages says so", async ({ page }) => {
  await page.goto("/today");
  await page.getByRole("navigation", { name: "Index" }).getByRole("link", { name: /Health/ }).click();
  await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Workouts");
  await page.getByRole("navigation", { name: "Index" }).getByRole("link", { name: /Finance/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Finance");
  await expect(page.getByText("This space has no pages yet.")).toBeVisible();
});

test("unknown pages, foreign or malformed ids and bad dates show the not-found page", async ({ page }) => {
  for (const url of ["/no-such-page", "/s/00000000-0000-4000-8000-000000000000", "/s/not-a-uuid", "/review/last-week", "/review/2026-02-31"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 }), url).toContainText("Nothing here.");
    await expect(page.getByRole("link", { name: "Go to Today" })).toBeVisible();
  }
});

test("narrow screens: the Index is a drawer that closes after navigating", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 860 });
  await page.goto("/today");
  await expect(page.getByRole("navigation", { name: "Index" })).toBeHidden();
  await page.getByRole("button", { name: "Open the Index" }).click();
  const drawer = page.getByRole("dialog", { name: "Index" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(drawer).toBeHidden();
});

test("Today and Settings pass layout and accessibility checks in both themes", async ({ page }) => {
  await checkScreen(page, "/today");
  await checkScreen(page, "/settings");
  await checkScreen(page, "/settings/calendar");
});
