import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { expect, test } from "@playwright/test";
import { OWNER_STATE, SIGN_OUT_STATE } from "./global-setup";

// SET-1 and AUTH-3 AC3. These tests change the one shared profile, so they run in order and
// each puts back what it changed.
test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_STATE });

const saved = (page: import("@playwright/test").Page) => expect(page.getByText("Saved.").last()).toBeVisible();

test("SET-1: the theme takes effect at once and persists across reloads", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/settings");
  const theme = page.getByRole("radiogroup", { name: "Theme" });
  await theme.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await saved(page);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { checked: true })).toHaveText("Dark");
  await page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await saved(page);
  expect(errors).toEqual([]); // no hydration mismatch
});

test("SET-1: changing the timezone re-computes today (TODAY-1)", async ({ page }) => {
  await page.goto("/settings");
  const pill = page.locator("header time");
  for (const tz of ["Pacific/Kiritimati", "Asia/Dhaka"]) {
    await page.getByLabel("Timezone").selectOption(tz);
    await saved(page);
    await expect(pill).toHaveText(format(new TZDate(new Date(), tz), "EEE, d MMM"));
  }
});

test("SET-1: week start, currency and name persist; an invalid currency is explained and not saved", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("radiogroup", { name: "Week starts on" }).getByRole("radio", { name: "Mon" }).click();
  await saved(page);
  await page.getByLabel("Currency").fill("BD"); // 2 letters (the field stops at 3)
  await page.getByLabel("Display name").focus(); // leaving the field triggers the check
  await expect(page.getByRole("alert").filter({ hasText: "3-letter currency code" })).toBeVisible();
  await page.getByLabel("Currency").fill("usd");
  await page.getByLabel("Display name").fill("Kabid");
  await page.getByLabel("Currency").focus(); // blur the name, then the currency
  await page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "Light" }).focus();
  await saved(page);

  await page.reload();
  await expect(page.getByRole("radiogroup", { name: "Week starts on" }).getByRole("radio", { checked: true })).toHaveText("Mon");
  await expect(page.getByLabel("Currency")).toHaveValue("USD");
  await expect(page.getByLabel("Display name")).toHaveValue("Kabid");

  // Put the defaults back (PRD §5.8): Saturday, BDT.
  await page.getByRole("radiogroup", { name: "Week starts on" }).getByRole("radio", { name: "Sat" }).click();
  await page.getByLabel("Currency").fill("BDT");
  await page.getByLabel("Display name").focus();
  await saved(page);
});

test("AUTH-3 AC3: Sign out ends the session on this device", async ({ browser }) => {
  const context = await browser.newContext({ storageState: SIGN_OUT_STATE });
  const page = await context.newPage();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login$/);
  await context.close();
});
