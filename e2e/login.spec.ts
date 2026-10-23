import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { OWNER_STATE } from "./global-setup";
import { checkScreen } from "./helpers/checks";

test.describe("signed out", () => {
  test("sign-in page passes layout and accessibility checks", async ({ page }) => {
    await checkScreen(page, "/login");
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  });

  test("AUTH-1 AC2: Google sign-in asks for Calendar events, offline access and consent", async ({ page }) => {
    let authorize: URL | undefined;
    await page.route("**/auth/v1/authorize**", (route) => {
      authorize = new URL(route.request().url());
      return route.abort();
    });
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect.poll(() => authorize?.searchParams.get("provider")).toBe("google");
    expect(authorize?.searchParams.get("scopes")).toBe("https://www.googleapis.com/auth/calendar.events.owned");
    expect(authorize?.searchParams.get("access_type")).toBe("offline");
    expect(authorize?.searchParams.get("prompt")).toBe("consent");
    expect(authorize?.searchParams.get("redirect_to")).toMatch(/\/auth\/callback$/);
  });

  test("AUTH-2 AC1: a refused account sees 'This Daybook is private.'", async ({ page }) => {
    await page.goto("/auth/callback?error=access_denied&error_description=This%20Daybook%20is%20private.");
    await expect(page).toHaveURL(/\/login\?error=private$/);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("This Daybook is private.");
  });

  test("other sign-in errors show a fixed message, never text from the URL", async ({ page }) => {
    await page.goto("/auth/callback?error=server_error&error_description=%3Cb%3EPhishing%20text%3C%2Fb%3E");
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Sign-in didn't work. Try again.");
    await expect(page.getByText("Phishing text")).toHaveCount(0);
  });
});

test.describe("signed in (TEST-1, local email sign-in)", () => {
  test.use({ storageState: OWNER_STATE });

  test("AUTH-1 AC1: a signed-in owner lands on /today", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/today$/);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/today$/);
  });

  test("AUTH-3 AC1: the session survives a browser restart", async ({ browser }) => {
    const { cookies } = JSON.parse(readFileSync(OWNER_STATE, "utf8")) as { cookies: { name: string; expires: number }[] };
    const auth = cookies.filter((c) => c.name.includes("auth-token"));
    expect(auth.length).toBeGreaterThan(0);
    for (const c of auth) expect(c.expires, `${c.name} is persistent`).toBeGreaterThan(Date.now() / 1000 + 30 * 86400);

    const restarted = await browser.newContext({ storageState: OWNER_STATE });
    const page = await restarted.newPage();
    await page.goto("/today");
    await expect(page).toHaveURL(/\/today$/);
    await restarted.close();
  });
});
