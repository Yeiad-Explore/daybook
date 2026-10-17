import { expect, test, type Page } from "@playwright/test";
import { TZDate } from "@date-fns/tz";
import { OWNER_STATE } from "./global-setup";
import { checkScreen, hydrated } from "./helpers/checks";
import { day, db, seedBlock, seedCheck, seedSpace, seedStep, unique } from "./helpers/seed";

test.use({ storageState: OWNER_STATE });

const open = (page: Page, s: { spaceId: string; pageId: string }) => page.goto(`/s/${s.spaceId}/${s.pageId}`);
const thirtyDaysAgo = () => new TZDate(new Date(Date.now() - 30 * 864e5), "Asia/Dhaka").toISOString();
const STEPS = ["Cleanser", "Vitamin C serum", "Moisturizer", "Sunscreen SPF 50"];

/** A Morning routine a month old with every step checked on each of the last 12 days. */
async function morning(s: Awaited<ReturnType<typeof seedSpace>>) {
  const created = thirtyDaysAgo();
  const block = await seedBlock(s, "routine", "Morning", 6, { created_at: created });
  const ids: string[] = [];
  for (const label of STEPS) ids.push(await seedStep(s, block, label, { created_at: created }));
  for (let d = 1; d <= 12; d++) for (const id of ids) await seedCheck(s, block, id, day(-d));
  return { block, ids };
}

test("RT-4 AC1: 12 complete days and 2 of 4 today read 'Streak 12 days'; finishing today makes it 13 with a toast", async ({ page }) => {
  const s = await seedSpace({ name: unique("Skincare"), kind: "area" });
  const { block, ids } = await morning(s);
  await seedCheck(s, block, ids[0], day(0));
  await seedCheck(s, block, ids[1], day(0));
  await open(page, s);
  await hydrated(page, '[aria-label="Block title"]');
  await expect(page.getByText("Streak 12 days")).toBeVisible();
  await expect(page.getByText("2 of 4 today")).toBeVisible();
  await page.getByRole("checkbox", { name: "Done: Moisturizer" }).click();
  await expect(page.getByText("Streak 12 days")).toBeVisible(); // not complete yet
  await page.getByRole("checkbox", { name: "Done: Sunscreen SPF 50" }).click();
  await expect(page.getByText("Streak 13 days", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Streak 13 days. Every step is done.")).toBeVisible(); // the toast
  await expect.poll(async () => (await db().from("routine_checks").select("id").eq("block_id", block).eq("check_date", day(0))).data?.length).toBe(4); // RT-3
  await page.reload();
  await expect(page.getByText("Streak 13 days")).toBeVisible();
  await page.getByRole("checkbox", { name: "Done: Sunscreen SPF 50" }).click(); // un-checking removes today's check
  await expect.poll(async () => (await db().from("routine_checks").select("id").eq("block_id", block).eq("check_date", day(0))).data?.length).toBe(3);
});

test("RT-5: the 12-week strip counts complete days", async ({ page }) => {
  const s = await seedSpace({ name: unique("Skincare"), kind: "area" });
  await morning(s);
  await open(page, s);
  await expect(page.getByRole("img", { name: "Last 12 weeks: 12 complete, 0 partial, 18 missed" })).toBeVisible();
});

test("RT-1: steps can be added, renamed and archived", async ({ page }) => {
  const s = await seedSpace({ name: unique("Skincare"), kind: "area" });
  const block = await seedBlock(s, "routine", "Night", 6);
  await seedStep(s, block, "Cleanser");
  await open(page, s);
  await hydrated(page, '[aria-label="Block title"]');
  await page.getByLabel("Add a step").fill("Retinol");
  await page.getByRole("button", { name: /^Add step/ }).click();
  await expect(page.getByLabel("Step: Retinol")).toBeVisible();
  await page.getByLabel("Step: Retinol").fill("Retinol (Mon, Wed, Fri)");
  await page.getByLabel("Step: Retinol").blur();
  await expect.poll(async () => (await db().from("routine_steps").select("label").eq("block_id", block).order("position")).data?.map((r) => r.label)).toEqual(["Cleanser", "Retinol (Mon, Wed, Fri)"]);
  await page.getByRole("button", { name: "Archive Cleanser" }).click();
  await expect(page.getByLabel("Step: Cleanser")).toHaveCount(0);
  await expect.poll(async () => (await db().from("routine_steps").select("archived_at").eq("block_id", block).eq("label", "Cleanser")).data?.[0]?.archived_at).not.toBeNull(); // archived, not deleted
});

test("RT-2: a routine can be limited to weekdays; today is marked when it is not scheduled", async ({ page }) => {
  const s = await seedSpace({ name: unique("Skincare"), kind: "area" });
  const block = await seedBlock(s, "routine", "Retinol", 6);
  await seedStep(s, block, "Retinol");
  await open(page, s);
  await hydrated(page, '[aria-label="Block title"]');
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayName = names[new TZDate(`${day(0)}T12:00:00`, "Asia/Dhaka").getDay()];
  const other = names.find((n) => n !== todayName)!;
  await page.getByRole("button", { name: "Schedule" }).click();
  for (const n of names) if (n !== other) await page.getByRole("button", { name: n, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Not scheduled today")).toBeVisible();
  await expect.poll(async () => (await db().from("blocks").select("config").eq("id", block)).data?.[0]?.config).toEqual({ days: [names.indexOf(other)] });
});

test("Routine passes layout and accessibility checks in light and dark at 400 and 1440px", async ({ page }) => {
  const s = await seedSpace({ name: unique("Skincare"), kind: "area" });
  await morning(s);
  await checkScreen(page, `/s/${s.spaceId}/${s.pageId}`);
});
