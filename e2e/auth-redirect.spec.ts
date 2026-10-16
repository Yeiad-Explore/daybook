import { expect, test } from "@playwright/test";

// AUTH-3 AC2: without a session, every route except /login redirects to /login (PRD §5.1).
const routes = [
  "/", "/today", "/s/space-1", "/s/space-1/page-1", "/s/space-1/settings", "/new", "/review",
  "/review/2026-10-10", "/history", "/settings", "/settings/calendar", "/settings/data", "/no-such-page",
];

for (const route of routes) {
  test(`signed out: ${route} redirects to /login`, async ({ page }) => {
    await page.goto(route);
    expect(new URL(page.url()).pathname).toBe("/login");
  });
}
