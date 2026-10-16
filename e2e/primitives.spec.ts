import { expect, test } from "@playwright/test";
import { OWNER_STATE } from "./global-setup";
import { checkScreen } from "./helpers/checks";

// DEV-1 gallery (development only). Every primitive is checked in light/dark at 400 and 1440px.
test.use({ storageState: OWNER_STATE });

test("primitives pass layout and accessibility checks in both themes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await checkScreen(page, "/dev/primitives");
  expect(errors).toEqual([]);
});

test("segmented control is one Tab stop and arrow keys select (radio group)", async ({ page }) => {
  await page.goto("/dev/primitives");
  const group = page.getByRole("radiogroup", { name: "Range" });
  await expect(group.getByRole("radio", { checked: true })).toHaveText("30D");
  await group.getByRole("radio", { name: "30D" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(group.getByRole("radio", { checked: true })).toHaveText("90D");
  await expect(group.getByRole("radio", { name: "90D" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(group.getByRole("radio", { checked: true })).toHaveText("7D");
  await expect(page.getByText("Selected: 7d")).toBeVisible();
  await expect(group.getByRole("radio", { name: "90D" })).toHaveAttribute("tabindex", "-1");
});
