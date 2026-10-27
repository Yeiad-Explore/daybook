import { expect, test } from "@playwright/test";
import { OWNER_STATE } from "./global-setup";
import { checkScreen, hydrated, pickOption } from "./helpers/checks";
import { day, db, seedBlock, seedEntry, seedField, seedSpace, unique } from "./helpers/seed";

test.use({ storageState: OWNER_STATE });

const open = (page: import("@playwright/test").Page, s: { spaceId: string; pageId: string }) => page.goto(`/s/${s.spaceId}/${s.pageId}`);

test("TRK-1 AC1: a new tracker opens in setup mode and switches to logging once a field exists", async ({ page }) => {
  const s = await seedSpace({ name: unique("Body"), kind: "area" });
  await seedBlock(s, "tracker", "Body & food");
  await open(page, s);
  await hydrated(page, '[aria-label="Block title"]');
  await expect(page.getByText("What do you want to track?")).toBeVisible();
  await page.getByLabel("What do you track?").fill("Weight");
  await page.getByLabel("Unit (optional)").fill("kg");
  await pickOption(page.getByLabel("Target (optional)"), "Reach");
  await page.getByLabel("Target value").fill("72");
  await page.getByRole("button", { name: "Start tracking" }).click();
  await expect(page.getByRole("button", { name: "Log today" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: "Weight" })).toContainText("target 72.0 kg");
});

test("TRK-2: logging the same field twice on one date updates one entry; an empty input neither creates nor clears", async ({ page }) => {
  const s = await seedSpace({ name: unique("Body"), kind: "area" });
  const block = await seedBlock(s, "tracker", "Body & food");
  const weight = await seedField(s, block, "Weight", { unit: "kg", decimals: 1 });
  const calories = await seedField(s, block, "Calories", { unit: "kcal", decimals: 0 });
  await seedEntry(s, calories, day(0), 1800);
  await open(page, s);
  await hydrated(page, '[aria-label="Block title"]');

  await page.getByLabel("Weight (kg)").fill("77.2");
  await page.getByLabel("Calories (kcal)").fill(""); // emptied: must not clear the stored 1800 (AC2)
  await page.getByRole("button", { name: "Log today" }).click();
  await expect(page.getByRole("region", { name: "Weight" })).toContainText("77.2");
  await page.getByLabel("Weight (kg)").fill("77.0");
  await page.getByRole("button", { name: "Log today" }).click();
  await expect.poll(async () => (await db().from("tracker_entries").select("value").eq("field_id", weight.id).eq("entry_date", day(0))).data?.map((r) => r.value)).toEqual([77]); // AC1
  const { data: cal } = await db().from("tracker_entries").select("value").eq("field_id", calories.id);
  expect(cal?.map((r) => r.value)).toEqual([1800]); // AC2

  await page.reload();
  await expect(page.getByLabel("Weight (kg)")).toHaveValue("77"); // pre-filled with today's value
  await expect(page.getByLabel("Calories (kcal)")).toHaveValue("1800");
});

test("TRK-3: current value, meta line, target and the 7D / 30D / 90D range", async ({ page }) => {
  const s = await seedSpace({ name: unique("Body"), kind: "area" });
  const block = await seedBlock(s, "tracker", "Body & food");
  const calories = await seedField(s, block, "Calories", { unit: "kcal", decimals: 0, target_value: 2000, target_kind: "at_most" });
  for (const [d, v] of [[-40, 2100], [-3, 1800], [-2, 2300], [-1, 2000], [0, 1900]] as const) await seedEntry(s, calories, day(d), v);
  await open(page, s);
  const region = page.getByRole("region", { name: "Calories" });
  await expect(region).toContainText("1,900"); // latest
  await expect(region).toContainText("7-day average 2,000 kcal · target 2,000 kcal · on target");
  const chart = region.getByRole("img");
  await expect(chart).toHaveAccessibleName("Calories, last 30 days: 4 entries, latest 1,900 kcal");
  await page.getByRole("radio", { name: "90D" }).click();
  await expect(chart).toHaveAccessibleName("Calories, last 90 days: 5 entries, latest 1,900 kcal");
  await page.getByRole("radio", { name: "7D" }).click();
  await expect(chart).toHaveAccessibleName("Calories, last 7 days: 4 entries, latest 1,900 kcal");
  await page.reload();
  await expect(page.getByRole("radio", { name: "7D" })).toBeChecked(); // saved per block (Appendix B)
});

test("TRK-4, TRK-5, TRK-6: history edit and delete, logging streak, archiving keeps entries", async ({ page }) => {
  const s = await seedSpace({ name: unique("Body"), kind: "area" });
  const block = await seedBlock(s, "tracker", "Body & food");
  const weight = await seedField(s, block, "Weight", { unit: "kg", decimals: 1 });
  const mood = await seedField(s, block, "Mood", { decimals: 0 });
  for (const d of [-2, -1, 0]) await seedEntry(s, weight, day(d), 77 + d / 10);
  await seedEntry(s, mood, day(-1), 4);
  await open(page, s);
  await expect(page.getByText("Logged 3 days in a row")).toBeVisible(); // TRK-5

  await page.getByRole("button", { name: "All entries" }).click();
  const dialog = page.getByRole("dialog", { name: "All entries" });
  await expect(dialog.getByRole("row")).toHaveCount(4); // header + 3 days
  const input = dialog.getByLabel(/^Weight on/).first();
  await input.fill("76.5");
  await input.blur();
  await expect.poll(async () => (await db().from("tracker_entries").select("value").eq("field_id", weight.id).eq("entry_date", day(0))).data?.[0]?.value).toBe(76.5);
  await dialog.getByRole("button", { name: /^Delete the entries of/ }).last().click();
  await expect(dialog.getByRole("row")).toHaveCount(3);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Fields" }).click();
  await page.getByRole("button", { name: "Archive" }).last().click();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Mood")).toHaveCount(0); // hidden from the log form
  const { data } = await db().from("tracker_entries").select("value").eq("field_id", mood.id);
  expect(data).toHaveLength(1); // entries kept
});

test("Tracker passes layout and accessibility checks in light and dark at 400 and 1440px", async ({ page }) => {
  test.slow(); // four page loads, each with an accessibility scan
  const s = await seedSpace({ name: unique("Body"), kind: "area" });
  const block = await seedBlock(s, "tracker", "Body & food");
  const weight = await seedField(s, block, "Weight", { unit: "kg", target_value: 72, target_kind: "reach" });
  for (const d of [-20, -12, -6, -3, -1, 0]) await seedEntry(s, weight, day(d), 78 + d / 20);
  await checkScreen(page, `/s/${s.spaceId}/${s.pageId}`);
});
