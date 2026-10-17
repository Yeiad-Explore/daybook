import { expect, test } from "@playwright/test";
import { TZDate } from "@date-fns/tz";
import { OWNER_STATE } from "./global-setup";
import { checkScreen, hydrated } from "./helpers/checks";
import { at, day, db, seedBlock, seedField, seedSlot, seedSpace, seedStep, unique } from "./helpers/seed";

test.use({ storageState: OWNER_STATE });

test("Day Timetable: today's slots on the ruler and in the list; overlapping slots say so; the NOW pill shows the time", async ({ page }) => {
  const s = await seedSpace({ name: unique("Study"), kind: "area" });
  const block = await seedBlock(s, "timeblock", "Study sessions", 6);
  const [a, b, c] = [unique("Standup"), unique("Design review"), unique("Gym")];
  await seedSlot(s, block, a, at(day(0), "09:00"), at(day(0), "09:30"));
  await seedSlot(s, block, b, at(day(0), "14:00"), at(day(0), "15:00"));
  await seedSlot(s, block, c, at(day(0), "14:30"), at(day(0), "15:30"));
  await seedSlot(s, block, "Tomorrow only", at(day(1), "09:00"), at(day(1), "10:00"));
  await page.goto("/today");
  const timetable = page.getByLabel("Day Timetable");
  await expect(timetable.getByRole("listitem").filter({ hasText: a })).toContainText("09:00 to 09:30");
  await expect(timetable.getByRole("listitem").filter({ hasText: a })).toContainText("Not on calendar");
  await expect(timetable.getByRole("listitem").filter({ hasText: b })).toContainText("Overlaps");
  await expect(timetable.getByRole("listitem").filter({ hasText: c })).toContainText("Overlaps");
  await expect(timetable.getByRole("listitem").filter({ hasText: a })).not.toContainText("Overlaps");
  await expect(timetable.getByText("Tomorrow only")).toHaveCount(0);
  await expect(page.getByText("Time blocks", { exact: true })).toBeVisible(); // KPI
  const hour = new TZDate(new Date(), "Asia/Dhaka").getHours();
  if (hour >= 6) await expect(timetable.getByText(/^NOW \d\d:\d\d$/)).toBeVisible(); // lime NOW pill within the ruler
});

test("Routine card: today's routine with its steps and streak; checking the last step finishes it", async ({ page }) => {
  const title = unique("Morning");
  const s = await seedSpace({ name: unique("Skincare"), kind: "area", mark: "clay" });
  const block = await seedBlock(s, "routine", title, 6);
  await seedStep(s, block, "Cleanser");
  await seedStep(s, block, "Sunscreen");
  await page.goto("/today");
  await hydrated(page, 'section[aria-label="Routines"]');
  const card = page.getByRole("region", { name: "Routines" });
  await expect(card).toContainText(title);
  await card.getByRole("checkbox", { name: `Done: Cleanser (${title})` }).click();
  await expect.poll(async () => (await db().from("routine_checks").select("id").eq("block_id", block).eq("check_date", day(0))).data?.length).toBe(1);
  await card.getByRole("checkbox", { name: `Done: Sunscreen (${title})` }).click();
  await expect(card.getByText("Streak 1 day")).toBeVisible();
  await expect(page.getByText("Streak 1 day. Every step is done.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Routines" }).getByRole("checkbox", { name: `Done: Sunscreen (${title})` })).toBeChecked();
});

test("Trackers card: 'Log today' until today has values, then 'Logged'; the form is pre-filled", async ({ page }) => {
  const title = unique("Body");
  const s = await seedSpace({ name: unique("Health"), kind: "area" });
  const block = await seedBlock(s, "tracker", title);
  const weight = await seedField(s, block, "Weight", { unit: "kg", decimals: 1 });
  await seedField(s, block, "Calories", { unit: "kcal", decimals: 0 });
  await page.goto("/today");
  await hydrated(page, "section[aria-label='Trackers']");
  const card = page.getByLabel(`${title}: log today`);
  await card.getByLabel("Weight (kg)").fill("77.2");
  await card.getByRole("button", { name: "Log today" }).click();
  await expect(card.getByText("Logged", { exact: true })).toBeVisible();
  await expect(card).toContainText("77.2");
  await expect.poll(async () => (await db().from("tracker_entries").select("value").eq("field_id", weight.id).eq("entry_date", day(0))).data?.map((r) => r.value)).toEqual([77.2]);
  // The source block shows the same value (TODAY-3).
  await page.goto(`/s/${s.spaceId}/${s.pageId}`);
  await expect(page.getByLabel("Weight (kg)")).toHaveValue("77.2");
  await page.goto("/today");
  await page.getByLabel(`${title}: log today`).getByRole("button", { name: "Change today's values" }).click();
  await expect(page.getByLabel(`${title}: log today`).getByLabel("Weight (kg)")).toHaveValue("77.2");
});

test("Today with the right column passes layout and accessibility checks in light and dark at 400 and 1440px", async ({ page }) => {
  test.slow(); // four page loads, each with an accessibility scan
  const s = await seedSpace({ name: unique("Study"), kind: "area" });
  const slots = await seedBlock(s, "timeblock", "Study sessions", 6);
  await seedSlot(s, slots, unique("Reading"), at(day(0), "10:00"), at(day(0), "11:00"));
  const routine = await seedBlock(s, "routine", unique("Evening"), 6);
  await seedStep(s, routine, "Brush teeth");
  const tracker = await seedBlock(s, "tracker", unique("Mood"));
  await seedField(s, tracker, "Mood", { decimals: 0 });
  await checkScreen(page, "/today");
});
