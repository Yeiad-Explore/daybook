import { test } from "@playwright/test";
import { checkScreen } from "./helpers/checks";

test("the public entry page passes layout and accessibility checks", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await checkScreen(page, "/login");
  test.expect(errors).toEqual([]);
});

test("NFR-3: pages and redirects send the baseline security headers", async ({ request }) => {
  for (const path of ["/login", "/today"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    const h = res.headers();
    test.expect(h["content-security-policy"], path).toBe("frame-ancestors 'none'");
    test.expect(h["x-frame-options"], path).toBe("DENY");
    test.expect(h["x-content-type-options"], path).toBe("nosniff");
    test.expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
  }
});
