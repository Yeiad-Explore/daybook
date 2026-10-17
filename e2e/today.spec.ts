import { expect, test, type Page } from "@playwright/test";
import { OWNER_STATE } from "./global-setup";
import { checkScreen, hydrated } from "./helpers/checks";
import { day, db, seedBlock, seedSpace, seedTask, unique } from "./helpers/seed";

test.use({ storageState: OWNER_STATE });

const section = (page: Page, name: string) => page.getByRole("region", { name: new RegExp(`^${name}`) });
const row = (page: Page, title: string) => page.getByRole("listitem").filter({ has: page.getByRole("checkbox", { name: `Done: ${title}`, exact: true }) });

test("TODAY AC / TODAY-4: Overdue lists late tasks oldest first with their source; the Index count equals its rows", async ({ page }) => {
  const proposal = unique("Send proposal follow-up");
  const shoesTitle = unique("Buy running shoes");
  const agency = await seedSpace({ name: unique("Agency"), mark: "ochre" });
  const marketing = await seedBlock(agency, "todo", "Marketing", 6);
  await seedTask(agency, marketing, proposal, day(-1));
  const fitness = await seedSpace({ name: unique("Fitness") });
  const plan = await seedBlock(fitness, "todo", "Workouts", 6);
  await seedTask(fitness, plan, shoesTitle, day(-2));

  await page.goto("/today");
  const overdue = section(page, "Overdue");
  await expect(row(page, shoesTitle)).toContainText("2d late");
  await expect(row(page, shoesTitle)).toContainText(/Fitness \w+ · Overview/);
  await expect(row(page, proposal)).toContainText("1d late");
  const titles = await overdue.getByRole("checkbox").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(titles.indexOf(`Done: ${shoesTitle}`)).toBeLessThan(titles.indexOf(`Done: ${proposal}`)); // oldest first

  const badge = await page.getByRole("navigation", { name: "Index" }).getByRole("link", { name: /^Today/ }).innerText();
  expect(Number(badge.match(/\d+/)![0])).toBe(titles.length); // TODAY-4
});

test("RM-8 AC: a roadmap leaf due today is in Due today with 'Space · Page · Stage'; the stage is not", async ({ page }) => {
  const loops = unique("Loops: for and while");
  const python = unique("Learn Python");
  const ai = await seedSpace({ name: unique("AI Engineering"), mark: "slate" });
  const roadmap = await seedBlock(ai, "roadmap", "Roadmap");
  const stage = await seedTask(ai, roadmap, python, day(20));
  await seedTask(ai, roadmap, loops, day(0), { parent_id: stage });
  await page.goto("/today");
  await expect(row(page, loops)).toContainText(new RegExp(`AI Engineering \\w+ · Overview · ${python}`));
  await expect(row(page, loops)).toContainText("today");
  await expect(row(page, python)).toHaveCount(0);
  // The source links to the block (§5.1 deep link).
  await row(page, loops).getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/s/${ai.spaceId}/${ai.pageId}#block-${roadmap}$`));
});

test("DL-10 / TODAY-3: a late task leaves Overdue only when done or rescheduled, and the source changes", async ({ page }) => {
  const shoesTitle = unique("Buy running shoes");
  const matTitle = unique("Buy a yoga mat");
  const s = await seedSpace({ name: unique("Fitness") });
  const plan = await seedBlock(s, "todo", "Workouts", 6);
  const shoes = await seedTask(s, plan, shoesTitle, day(-2));
  const mat = await seedTask(s, plan, matTitle, day(-3));
  await page.goto("/today");
  await hydrated(page, `input[aria-label="Done: ${shoesTitle}"]`);

  await row(page, matTitle).getByRole("checkbox").click(); // click, not check(): the row leaves Overdue at once
  await expect(section(page, "Overdue").getByRole("checkbox", { name: `Done: ${matTitle}` })).toHaveCount(0);
  await expect.poll(async () => (await db().from("tasks").select("done").eq("id", mat).single()).data?.done).toBe(true);

  await row(page, shoesTitle).getByRole("button", { name: `Reschedule ${shoesTitle}` }).click();
  const dialog = page.getByRole("dialog", { name: "Move the deadline" });
  await dialog.getByRole("button", { name: "Tomorrow" }).click();
  await dialog.getByLabel("Why is it moving?").fill("Shop closed");
  await dialog.getByRole("button", { name: "Move deadline" }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, shoesTitle)).toContainText("tomorrow");
  await expect(row(page, shoesTitle)).toContainText("moved 1×");
  await expect(section(page, "Next 7 days").getByRole("checkbox", { name: `Done: ${shoesTitle}` })).toBeVisible();
  await expect.poll(async () => (await db().from("tasks").select("due_date").eq("id", shoes).single()).data?.due_date).toBe(day(1));
});

test("TODAY-2: archived, achieved and missed spaces leave Today; Next 7 days stops at today + 7", async ({ page }) => {
  const ship = unique("Ship the landing page");
  const post = unique("Write the launch post");
  const s = await seedSpace({ name: unique("Side project") });
  const block = await seedBlock(s, "todo", "Tasks", 6);
  await seedTask(s, block, ship, day(7));
  await seedTask(s, block, post, day(8));
  await page.goto("/today");
  await expect(row(page, ship)).toBeVisible();
  await expect(row(page, post)).toHaveCount(0);
  for (const status of ["archived", "achieved", "missed"] as const) {
    await db().from("spaces").update({ status }).eq("id", s.spaceId);
    await page.reload();
    await expect(row(page, ship), status).toHaveCount(0);
  }
});

test("/history lists a reschedule with its reason, 'was late' and filters by space (§5.7, §7.4 AC1)", async ({ page }) => {
  const s = await seedSpace({ name: unique("History check") });
  const block = await seedBlock(s, "todo", "Tasks", 6);
  const id = await seedTask(s, block, "Renew the gym card", day(-2));
  const { error } = await db().rpc("reschedule_task", { p_task_id: id, p_new_due: day(2), p_reason: "Card office closed" });
  expect(error).toBeNull();

  await page.goto(`/history?space=${s.spaceId}`);
  const entry = page.getByRole("row").filter({ hasText: "Renew the gym card" });
  await expect(entry).toContainText("Card office closed");
  await expect(entry).toContainText("+4d");
  await expect(entry.getByRole("cell").last()).toHaveText("yes");
  await expect(page.getByRole("list", { name: "This month" })).toContainText(/1 reschedule, 4 days moved this month/);
  await page.goto(`/history?space=${s.spaceId}&from=${day(1)}`);
  await expect(page.getByText("No moved deadlines match these filters.")).toBeVisible();
});

test("SET-3: Trash lists what was deleted, restores it, refuses a restore that breaks a rule, and deletes forever", async ({ page }) => {
  const errands = unique("Errands");
  const physioTitle = unique("Book a physio");
  const s = await seedSpace({ name: unique("Trash check"), deadline: day(40) });
  const block = await seedBlock(s, "todo", errands, 6);
  const physio = await seedTask(s, block, physioTitle, day(30));
  await db().rpc("trash_item", { p_table: "tasks", p_id: physio });
  await db().rpc("trash_item", { p_table: "blocks", p_id: block });

  await page.goto("/settings/data");
  const trash = page.getByRole("listitem");
  await expect(trash.filter({ hasText: `Block${errands}` })).toBeVisible();
  await hydrated(page, "main button");
  await trash.filter({ hasText: `Block${errands}` }).getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("region", { name: "Notifications" }).getByText(`${errands} is back.`)).toBeVisible();

  // The goal now ends before the physio task: restoring it is refused with the rule (DL-13).
  await db().rpc("reschedule_space", { p_space_id: s.spaceId, p_new_deadline: day(20), p_reason: "Shorter plan" });
  await page.reload();
  await hydrated(page, "main button");
  await trash.filter({ hasText: `Task${physioTitle}` }).getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("region", { name: "Notifications" }).getByText(new RegExp(`Can't restore '${physioTitle}': it is due after the goal ends`))).toBeVisible();
  await expect(trash.filter({ hasText: `Task${physioTitle}` })).toBeVisible();

  await trash.filter({ hasText: `Task${physioTitle}` }).getByRole("button", { name: "Delete forever" }).click();
  await page.getByRole("dialog", { name: "Delete forever?" }).getByRole("button", { name: "Delete forever" }).click();
  await expect(trash.filter({ hasText: `Task${physioTitle}` })).toHaveCount(0);
  await expect.poll(async () => (await db().from("tasks").select("id").eq("id", physio)).data?.length).toBe(0);
});

test("SPC-4 / SPC-2: status changes move a goal in the Index; the deadline moves only with a reason", async ({ page }) => {
  const name = unique("Read books");
  const s = await seedSpace({ name, deadline: day(60) });
  await page.goto(`/s/${s.spaceId}/settings`);
  await hydrated(page, "#name");
  await expect(page.locator('input[type="date"][name="deadline"], #deadline')).toHaveCount(0); // SPC-2 AC1: no direct deadline field
  await page.getByRole("button", { name: "Mark achieved" }).click();
  const index = page.getByRole("navigation", { name: "Index" });
  await index.getByText(/^Achieved \(\d+\)$/).click();
  await expect(index.getByRole("link", { name })).toBeVisible(); // SPC-4 AC1
  await expect(index.getByRole("region", { name: "Goals" }).getByRole("link", { name })).toHaveCount(0);
  const { data } = await db().from("spaces").select("status, status_changed_at").eq("id", s.spaceId).single();
  expect(data?.status).toBe("achieved");
  expect(data?.status_changed_at).not.toBeNull();

  await page.getByRole("button", { name: "Make active again" }).click();
  await page.getByRole("button", { name: "Move the deadline" }).click();
  const dialog = page.getByRole("dialog", { name: "Move the deadline" });
  await dialog.getByRole("button", { name: "Next week" }).click();
  await dialog.getByLabel("Why is it moving?").fill("Holiday in the way");
  await dialog.getByRole("button", { name: "Move deadline" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await db().from("spaces").select("deadline").eq("id", s.spaceId).single()).data?.deadline).toBe(day(7));
});

test("SPC-4 AC2: a goal past its deadline says so and offers to close or extend it", async ({ page }) => {
  const s = await seedSpace({ name: unique("Old goal"), start: day(-60), deadline: day(-3) });
  await page.goto(`/s/${s.spaceId}/${s.pageId}`);
  await expect(page.getByText("This goal's deadline has passed. Mark achieved, close as missed, or extend (with a reason).")).toBeVisible();
  await expect(page.getByRole("region", { name: "Goal", exact: true })).toContainText("days past deadline");
});

test("SPC-3: spaces reorder in the Index by keyboard and the order persists", async ({ page }) => {
  const first = await seedSpace({ name: unique("Order A"), kind: "area" });
  const second = await seedSpace({ name: unique("Order B"), kind: "area" });
  await db().from("spaces").update({ position: -5000 }).eq("id", first.spaceId);
  await db().from("spaces").update({ position: -4000 }).eq("id", second.spaceId);
  const names = async () => page.getByRole("navigation", { name: "Index" }).getByRole("region", { name: "Life areas" }).getByRole("link").allInnerTexts();
  await page.goto("/today");
  await hydrated(page, 'nav[aria-label="Index"] button');
  const [a, b] = [(await db().from("spaces").select("name").eq("id", first.spaceId).single()).data!.name, (await db().from("spaces").select("name").eq("id", second.spaceId).single()).data!.name];
  expect((await names()).indexOf(a)).toBeLessThan((await names()).indexOf(b));
  const grip = page.getByRole("button", { name: `Reorder ${a}` });
  await grip.focus();
  // dnd-kit's keyboard sensor needs a frame per step (pick up, move, drop).
  await page.keyboard.press("Space");
  await page.waitForTimeout(250);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(250);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await names()).indexOf(a) > (await names()).indexOf(b)).toBe(true);
  await page.reload();
  expect((await names()).indexOf(a)).toBeGreaterThan((await names()).indexOf(b));
});

test("Today, history and Trash pass layout and accessibility checks in both themes", async ({ page }) => {
  test.setTimeout(150_000);
  const s = await seedSpace({ name: unique("Checks") });
  const block = await seedBlock(s, "todo", "Tasks", 6);
  const late = await seedTask(s, block, "A late task", day(-1));
  await seedTask(s, block, "Due today", day(0));
  await db().rpc("reschedule_task", { p_task_id: late, p_new_due: day(1), p_reason: "Checking history" });
  await seedTask(s, block, "Another late one", day(-2));
  await checkScreen(page, "/today");
  await checkScreen(page, "/history");
  await checkScreen(page, "/settings/data");
});
