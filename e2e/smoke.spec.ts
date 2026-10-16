import { test } from "@playwright/test";
import { checkScreen } from "./helpers/checks";

test("the public entry page passes layout and accessibility checks", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await checkScreen(page, "/login");
  test.expect(errors).toEqual([]);
});
