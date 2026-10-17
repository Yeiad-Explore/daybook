import { expect, test, type Page } from "@playwright/test";
import { OWNER_STATE } from "./global-setup";
import { checkScreen, hydrated } from "./helpers/checks";
import { at, day, db, seedBlock, seedSlot, seedSpace, seedTask, unique } from "./helpers/seed";

test.use({ storageState: OWNER_STATE });

const open = (page: Page, s: { spaceId: string; pageId: string }) => page.goto(`/s/${s.spaceId}/${s.pageId}`);

test("TB-1 AC1: the end must be after the start; a valid slot is saved", async ({ page }) => {
  const s = await seedSpace({ name: unique("Study"), kind: "area" });
  const block = await seedBlock(s, "timeblock", "Study sessions", 6);
  await open(page, s);
  await hydrated(page, '[aria-label="Block title"]');
  await page.getByLabel("Slot title").fill("Python: loops");
  await page.getByLabel("Day").fill(day(1));
  await page.getByLabel("Starts").fill("20:00");
  await page.getByLabel("Ends").fill("19:00");
  await page.getByRole("button", { name: /^Add slot/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The end time needs to be after the start time." })).toBeVisible();
  await page.getByLabel("Ends").fill("21:30");
  await page.getByRole("button", { name: /^Add slot/ }).click();
  const item = page.getByRole("listitem").filter({ hasText: "Python: loops" });
  await expect(item).toContainText("20:00 to 21:30");
  await expect.poll(async () => (await db().from("time_blocks").select("starts_at, ends_at").eq("block_id", block)).data?.map((r) => [Date.parse(r.starts_at), Date.parse(r.ends_at)])).toEqual([[Date.parse(at(day(1), "20:00")), Date.parse(at(day(1), "21:30"))]]);
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Python: loops" })).toContainText("20:00 to 21:30"); // shown in the owner's timezone
});

test("TB-2: sorted by date and start; past slots are hidden until 'Show past'", async ({ page }) => {
  const s = await seedSpace({ name: unique("Study"), kind: "area" });
  const block = await seedBlock(s, "timeblock", "Study sessions", 6);
  await seedSlot(s, block, "Later", at(day(2), "09:00"), at(day(2), "10:00"));
  await seedSlot(s, block, "Evening", at(day(1), "18:00"), at(day(1), "19:00"));
  await seedSlot(s, block, "Morning", at(day(1), "08:00"), at(day(1), "09:00"));
  await seedSlot(s, block, "Last week", at(day(-7), "08:00"), at(day(-7), "09:00"));
  await open(page, s);
  const titles = () => page.getByRole("listitem").locator("p.type-body").allTextContents();
  await expect.poll(titles).toEqual(["Morning", "Evening", "Later"]);
  await page.getByRole("button", { name: "Show past (1)" }).click();
  await expect.poll(titles).toEqual(["Last week", "Morning", "Evening", "Later"]);
  await page.reload();
  await expect.poll(titles).toEqual(["Last week", "Morning", "Evening", "Later"]); // saved per block
});

test("TB-6: a slot linked to a task shows the task's title and deadline; completing the task keeps the slot", async ({ page }) => {
  const s = await seedSpace({ name: unique("Study"), kind: "goal", deadline: day(60) });
  const todo = await seedBlock(s, "todo", "Plan", 6);
  const task = await seedTask(s, todo, "Finish chapter 3", day(5));
  const block = await seedBlock(s, "timeblock", "Study sessions", 6);
  await seedSlot(s, block, "Chapter 3 focus", at(day(1), "10:00"), at(day(1), "11:00"), { task_id: task });
  await open(page, s);
  const item = page.getByRole("listitem").filter({ hasText: "Chapter 3 focus" });
  await expect(item).toContainText("For “Finish chapter 3” · due ");
  await page.getByRole("checkbox", { name: "Done: Finish chapter 3", exact: true }).click();
  await expect.poll(async () => (await db().from("tasks").select("done").eq("id", task)).data?.[0]?.done).toBe(true);
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Chapter 3 focus" })).toBeVisible();
});

test("slots can be edited and deleted with Undo", async ({ page }) => {
  const s = await seedSpace({ name: unique("Study"), kind: "area" });
  const block = await seedBlock(s, "timeblock", "Study sessions", 6);
  await seedSlot(s, block, "Reading", at(day(1), "09:00"), at(day(1), "10:00"));
  await open(page, s);
  await hydrated(page, '[aria-label="Block title"]');
  await page.getByRole("button", { name: "Edit Reading" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit slot" });
  await dialog.getByLabel("Ends").fill("11:30");
  await dialog.getByRole("button", { name: "Save slot" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Reading" })).toContainText("09:00 to 11:30");
  await page.getByRole("button", { name: "Delete Reading" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Reading" })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Reading" })).toBeVisible();
});

test("Time block passes layout and accessibility checks in light and dark at 400 and 1440px", async ({ page }) => {
  const s = await seedSpace({ name: unique("Study"), kind: "area" });
  const block = await seedBlock(s, "timeblock", "Study sessions", 6);
  await seedSlot(s, block, "Reading", at(day(1), "09:00"), at(day(1), "10:00"));
  await seedSlot(s, block, "Old session", at(day(-3), "09:00"), at(day(-3), "10:00"));
  await checkScreen(page, `/s/${s.spaceId}/${s.pageId}`);
});
