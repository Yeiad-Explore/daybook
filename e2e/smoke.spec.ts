import { test } from "@playwright/test";
import { checkScreen } from "./helpers/checks";

test("home page passes layout and accessibility checks", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await checkScreen(page, "/");
  test.expect(errors).toEqual([]);
});
