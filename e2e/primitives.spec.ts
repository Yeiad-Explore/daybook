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

test("task row: keyboard toggles done, and late is said in words (NFR-7)", async ({ page }) => {
  await page.goto("/dev/primitives");
  const box = page.getByRole("checkbox", { name: "Done: Buy running shoes" });
  await expect(box).not.toBeChecked();
  await box.focus();
  await page.keyboard.press("Space");
  await expect(box).toBeChecked();
  await page.keyboard.press("Space");
  await expect(box).not.toBeChecked();

  const row = page.getByRole("listitem").filter({ hasText: "Buy running shoes" });
  await expect(row).toContainText("2d late");
  await expect(row.locator("time")).toHaveAttribute("title", "Wed 14 Oct 2026");
  await expect(row).toContainText("due Wed 14 Oct 2026"); // screen-reader text
});

test.describe("behaviour primitives (keyboard)", () => {
  test("dialog: focus moves in, Esc closes, focus returns to the trigger", async ({ page }) => {
    await page.goto("/dev/primitives");
    const trigger = page.getByRole("button", { name: "Reschedule…" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Reschedule" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("menu: Enter opens, arrows move, Enter chooses", async ({ page }) => {
    await page.goto("/dev/primitives");
    await page.getByRole("button", { name: "Block menu" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Last action" })).toContainText(/Last action: (Rename|Duplicate)\./);
    await expect(page.getByRole("menu")).toBeHidden();
  });

  test("tooltip: shows on keyboard focus", async ({ page }) => {
    await page.goto("/dev/primitives");
    await page.getByRole("button", { name: "14 Oct" }).focus();
    await expect(page.getByText("Wed 14 Oct 2026", { exact: true })).toBeVisible();
  });

  test("command palette: type to filter, Enter runs", async ({ page }) => {
    await page.goto("/dev/primitives");
    await page.getByRole("button", { name: "Open command palette" }).click();
    await page.keyboard.type("log");
    await expect(page.getByRole("option", { name: "Log weight" })).toBeVisible();
    await expect(page.getByRole("option", { name: "New task" })).toBeHidden();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Last action" })).toContainText("Last action: Log weight.");
  });

  test("toast: Undo restores within 6 seconds (PRD §5.2)", async ({ page }) => {
    await page.goto("/dev/primitives");
    await page.getByRole("button", { name: "Delete note" }).click();
    await expect(page.getByText("Note in Trash")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Note kept")).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo" })).toBeHidden();
  });

  test("toast: the Undo offer disappears after 6 seconds", async ({ page }) => {
    await page.clock.install();
    await page.goto("/dev/primitives");
    await page.getByRole("button", { name: "Delete note" }).click();
    const undo = page.getByRole("button", { name: "Undo" });
    await expect(undo).toBeVisible();
    await page.mouse.move(0, 0); // hovering a toast pauses its timer
    await page.clock.runFor(5_500);
    await expect(undo).toBeVisible();
    await page.clock.runFor(1_000);
    await expect(undo).toBeHidden();
  });
});

// Found in a real-browser pass (dark theme): colours that pass text-contrast checks but hide state.
test.describe("dark theme: overlays and highlights stay visible", () => {
  // Relative luminance of a computed colour: rgb()/rgba(), or oklab()/oklch() from Tailwind's
  // opacity modifiers (for neutral greys, luminance ≈ L³).
  const lum = (css: string) => {
    const n = (css.match(/-?[\d.]+/g) ?? []).map(Number);
    if (/^okl(ab|ch)/.test(css)) return n[0] ** 3;
    const [r, g, b] = n.slice(0, 3).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/dev/primitives");
  });

  test("the dialog backdrop dims the page instead of lightening it", async ({ page }) => {
    await page.getByRole("button", { name: "Reschedule…" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const backdrop = await page.evaluate(() => {
      // The full-viewport fixed layer that actually paints a colour (alpha > 0).
      const el = [...document.querySelectorAll("body *")].find((e) => {
        const s = getComputedStyle(e);
        const alpha = Number(s.backgroundColor.match(/[\d.]+/g)?.[3] ?? 1);
        return s.position === "fixed" && s.inset === "0px" && s.backgroundColor !== "rgba(0, 0, 0, 0)" && alpha > 0;
      });
      return el ? getComputedStyle(el).backgroundColor : "none found";
    });
    expect(lum(backdrop), backdrop).toBeLessThan(0.05);
  });

  test("the highlighted menu item stands out from the menu (WCAG 2.4.7)", async ({ page }) => {
    await page.getByRole("button", { name: "Block menu" }).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    const [item, menu] = await page.evaluate(() => {
      const hi = document.querySelector("[role=menuitem][data-highlighted]")!;
      return [getComputedStyle(hi).backgroundColor, getComputedStyle(hi.closest("[role=menu]")!).backgroundColor];
    });
    expect(ratio(item, menu)).toBeGreaterThanOrEqual(1.3);
  });

  test("the selected palette item stands out from the palette", async ({ page }) => {
    await page.getByRole("button", { name: "Open command palette" }).click();
    await page.keyboard.press("ArrowDown");
    const [item, panel] = await page.evaluate(() => {
      const sel = document.querySelector("[cmdk-item][data-selected=true]")!;
      return [getComputedStyle(sel).backgroundColor, getComputedStyle(sel.closest("[role=dialog]")!).backgroundColor];
    });
    expect(ratio(item, panel)).toBeGreaterThanOrEqual(1.3);
  });
});
