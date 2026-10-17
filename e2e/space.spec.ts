import { expect, test, type Page } from "@playwright/test";
import { format, parseISO } from "date-fns";
import { OWNER_STATE } from "./global-setup";
import { checkScreen, hydrated } from "./helpers/checks";
import { day, db, seedBlock, seedSpace, seedTask, unique } from "./helpers/seed";

test.use({ storageState: OWNER_STATE });

// The innermost list item holding the task's checkbox (a stage's panel also contains its steps).
const row = (page: Page, title: string) => page.getByRole("listitem").filter({ has: page.getByRole("checkbox", { name: `Done: ${title}`, exact: true }) }).last();
const openTaskMenu = (page: Page, title: string) => page.getByRole("button", { name: `${title}: more`, exact: true }).click();

test("SPC-1: a goal needs a deadline; a new one opens on Overview with the block menu, last in Goals", async ({ page }) => {
  const name = unique("Run a 10K");
  await page.goto("/new");
  await hydrated(page, "#name");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("End goal").fill("Finish a 10K under an hour");
  await page.getByRole("button", { name: "Create goal" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "A goal needs a deadline." })).toBeVisible(); // AC1

  await page.getByLabel("Deadline").fill(day(60));
  await page.getByRole("button", { name: "Create goal" }).click();
  await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}\/[0-9a-f-]{36}/, { timeout: 15_000 }); // first visit compiles the route
  await expect(page.getByLabel("Page title")).toHaveValue("Overview"); // AC2
  await expect(page.getByRole("menuitem", { name: /To-do list/ })).toBeVisible(); // AC2: block menu open
  const goals = page.getByRole("navigation", { name: "Index" }).getByRole("region", { name: "Goals" });
  await expect(goals.getByRole("link").last()).toContainText(name); // AC3
});

test("TODO-1: a task needs a deadline inside the goal; a valid one is saved", async ({ page }) => {
  const s = await seedSpace({ name: unique("Fitness"), deadline: day(30) });
  await seedBlock(s, "todo", "Training plan", 6);
  await page.goto(`/s/${s.spaceId}/${s.pageId}`);
  await hydrated(page, 'input[aria-label="Add a task"]');
  const add = page.getByRole("textbox", { name: "Add a task" });
  await add.fill("Buy running shoes");
  await page.getByRole("button", { name: "Add: Buy running shoes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "A goal needs a deadline for every task." })).toBeVisible(); // AC2
  await page.getByLabel("Deadline").first().fill(day(31));
  await page.getByRole("button", { name: "Add: Buy running shoes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /That deadline is after the goal ends \(.+\)\. Pick an earlier date\./ })).toBeVisible(); // AC1
  await page.getByLabel("Deadline").first().fill(day(3));
  await page.getByRole("button", { name: "Add: Buy running shoes" }).click();
  await expect(row(page, "Buy running shoes")).toContainText("in 3d");
  await page.reload();
  await expect(row(page, "Buy running shoes")).toContainText("in 3d");
});

test("§7.4 AC1: rescheduling a late task needs a reason, leaves it 'moved 1×' and logs 'was late'", async ({ page }) => {
  const s = await seedSpace({ name: unique("Fitness") });
  const block = await seedBlock(s, "todo", "Training plan", 6);
  const id = await seedTask(s, block, "Buy running shoes", day(-2));
  await page.goto(`/s/${s.spaceId}/${s.pageId}`);
  await expect(row(page, "Buy running shoes")).toContainText("2d late");
  await hydrated(page, 'input[aria-label="Add a task"]');

  await openTaskMenu(page, "Buy running shoes");
  await page.getByRole("menuitem", { name: "Move the deadline" }).click();
  const dialog = page.getByRole("dialog", { name: "Move the deadline" });
  await dialog.getByLabel("Or pick a date").fill(day(2));
  await dialog.getByLabel("Why is it moving?").fill("no");
  await dialog.getByRole("button", { name: "Move deadline" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("A reason needs at least 3 characters."); // DL-6
  await dialog.getByLabel("Why is it moving?").fill("Shop closed");
  await dialog.getByRole("button", { name: "Move deadline" }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, "Buy running shoes")).toContainText("in 2d");
  await expect(row(page, "Buy running shoes")).toContainText("moved 1×"); // DL-8

  const { data } = await db().from("deadline_changes").select("old_due, new_due, reason, was_late").eq("task_id", id);
  expect(data).toEqual([{ old_due: day(-2), new_due: day(2), reason: "Shop closed", was_late: true }]); // DL-7
});

test("DL-11: deleting a late task asks for a reason and records it", async ({ page }) => {
  const s = await seedSpace({ name: unique("Agency") });
  const block = await seedBlock(s, "todo", "Marketing tasks", 6);
  const id = await seedTask(s, block, "Send proposal follow-up", day(-1));
  await page.goto(`/s/${s.spaceId}/${s.pageId}`);
  await hydrated(page, 'input[aria-label="Add a task"]');
  await openTaskMenu(page, "Send proposal follow-up");
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  const dialog = page.getByRole("dialog", { name: "This task is late" });
  await expect(dialog).toContainText("Send proposal follow-up");
  await dialog.getByLabel("Why are you dropping it?").fill("Client went quiet");
  await dialog.getByRole("button", { name: "Move to Trash" }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, "Send proposal follow-up")).toHaveCount(0);
  const { data } = await db().from("deadline_changes").select("kind, reason").eq("task_id", id);
  expect(data).toEqual([{ kind: "deleted_while_late", reason: "Client went quiet" }]);
});

test("RM-2 AC1 and RM-7: steps fit inside their stage; moving the stage earlier offers to move them too", async ({ page }) => {
  const s = await seedSpace({ name: unique("AI Engineering"), mark: "slate" });
  const block = await seedBlock(s, "roadmap", "AI Engineering roadmap");
  const stage = await seedTask(s, block, "Learn Python", day(20));
  await seedTask(s, block, "Loops: for and while", day(15), { parent_id: stage });
  await page.goto(`/s/${s.spaceId}/${s.pageId}`);
  await hydrated(page, 'input[aria-label="Add a stage"]');

  await openTaskMenu(page, "Learn Python");
  await page.getByRole("menuitem", { name: "Break down" }).click();
  await page.getByRole("textbox", { name: "Add a step to Learn Python" }).fill("Functions");
  await page.getByRole("region", { name: "AI Engineering roadmap" }).getByLabel("Deadline").first().fill(day(25));
  await page.getByRole("button", { name: "Add: Functions" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Must be due by .+, the deadline of 'Learn Python'\./ })).toBeVisible();

  await openTaskMenu(page, "Learn Python");
  await page.getByRole("menuitem", { name: "Move the deadline" }).click();
  const dialog = page.getByRole("dialog", { name: "Move the deadline" });
  await dialog.getByLabel("Or pick a date").fill(day(10));
  await dialog.getByLabel("Why is it moving?").fill("Compressing the plan");
  await dialog.getByRole("button", { name: "Move deadline" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Loops: for and while"); // the child that blocks it
  await dialog.getByRole("button", { name: "Move all 2" }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, "Loops: for and while")).toContainText(format(parseISO(day(10)), "d MMM")); // §7.5: 7+ days out is a date
  await expect(row(page, "Loops: for and while")).toContainText("moved 1×");
});

test("Pages: add, rename, Trash with Undo; the last page stays (PG-1, PG-2, PG-6)", async ({ page }) => {
  const s = await seedSpace({ name: unique("Skincare"), kind: "area", mark: "clay" });
  await page.goto(`/s/${s.spaceId}/${s.pageId}`);
  const tabs = page.getByRole("navigation", { name: "Pages" });
  await hydrated(page, 'input[aria-label="Page title"]');

  await tabs.getByRole("button", { name: "Page" }).click();
  await expect(page.getByLabel("Page title")).toHaveValue("Untitled page");
  await expect(page.getByLabel("Page title")).toBeFocused(); // PG-1
  await page.getByLabel("Page title").fill("Night routine");
  await page.getByLabel("Page title").press("Enter");
  await expect(tabs.getByRole("link", { name: "Night routine" })).toBeVisible(); // PG-2

  await tabs.getByRole("button", { name: "Night routine: more" }).click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await expect(page.getByRole("region", { name: "Notifications" }).getByText("Night routine moved to Trash.")).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Night routine" })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(tabs.getByRole("link", { name: "Night routine" })).toBeVisible(); // PG-6 Undo

  await tabs.getByRole("link", { name: "Overview" }).click();
  await tabs.getByRole("button", { name: "Overview: more" }).click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await expect(page.getByRole("region", { name: "Notifications" }).getByText("Overview moved to Trash.")).toBeVisible();
  // Night routine is now the only page: Trash refuses it.
  await tabs.getByRole("button", { name: "Night routine: more" }).click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await expect(page.getByRole("region", { name: "Notifications" }).getByText("A space needs at least one page.")).toBeVisible();
});

test("Blocks: add, rename, collapse, width, Alt+arrow order and Trash persist (BLK-1..3, BLK-6..8)", async ({ page }) => {
  const s = await seedSpace({ name: unique("Personal"), kind: "area", mark: "graphite" });
  await page.goto(`/s/${s.spaceId}/${s.pageId}`);
  await hydrated(page, 'input[aria-label="Page title"]');
  await page.keyboard.press("/"); // empty page: "/" opens the block menu
  await page.getByRole("menuitem", { name: /To-do list/ }).click();
  const todo = page.getByRole("region", { name: "To-do list" });
  await expect(todo).toBeVisible();
  await page.getByRole("button", { name: "Add a block" }).click();
  await page.getByRole("menuitem", { name: /Notes/ }).click();
  await expect(page.getByRole("region", { name: "Notes" })).toBeVisible();

  await todo.getByLabel("Block title").fill("Errands");
  await todo.getByLabel("Block title").press("Enter");
  const errands = page.getByRole("region", { name: "Errands" });
  await errands.getByRole("button", { name: "Collapse Errands" }).click();
  await errands.getByRole("button", { name: "Errands: more" }).click();
  await page.getByRole("menuitem", { name: "S", exact: true }).click();
  await page.getByRole("region", { name: "Notes" }).getByLabel("Block title").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(page.locator("section[id^=block-]").first()).toHaveAttribute("aria-label", "Notes");

  await page.reload();
  const blocks = page.locator("section[id^=block-]");
  await expect(blocks.first()).toHaveAttribute("aria-label", "Notes"); // BLK-3, BLK-8 AC2
  await expect(page.getByRole("button", { name: "Expand Errands" })).toHaveAttribute("aria-expanded", "false"); // BLK-6
  await expect(page.getByRole("region", { name: "Errands" })).toHaveClass(/laptop:col-span-4/); // BLK-8

  const id = await page.getByRole("region", { name: "Errands" }).getAttribute("id");
  await page.goto(`/s/${s.spaceId}/${s.pageId}#${id}`);
  await expect(page.locator(`#${id}`)).toBeInViewport(); // BLK-8 AC1

  await hydrated(page, 'input[aria-label="Page title"]');
  await page.getByRole("button", { name: "Errands: more" }).click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await expect(page.getByRole("region", { name: "Errands" })).toHaveCount(0); // BLK-7
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("region", { name: "Errands" })).toBeVisible();
});

test("NOTE-1/NOTE-2: Markdown shortcuts and autosave", async ({ page }) => {
  const s = await seedSpace({ name: unique("AI Notes"), kind: "area" });
  await seedBlock(s, "notes", "Python notes", 8);
  await page.goto(`/s/${s.spaceId}/${s.pageId}`);
  const editor = page.getByRole("textbox", { name: "Python notes text" });
  await editor.click();
  await page.keyboard.type("## Loops\n- for iterates a sequence\n");
  await expect(editor.locator("h2")).toHaveText("Loops");
  await expect(editor.locator("ul li").first()).toHaveText("for iterates a sequence");
  await expect(page.getByRole("region", { name: "Python notes" }).getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Python notes text" }).locator("h2")).toHaveText("Loops");
});

test("The space page passes layout and accessibility checks in both themes", async ({ page }) => {
  test.setTimeout(120_000); // 4 page loads with axe runs
  const s = await seedSpace({ name: unique("AI Engineering"), mark: "slate" });
  const roadmap = await seedBlock(s, "roadmap", "AI Engineering roadmap");
  const stage = await seedTask(s, roadmap, "Learn Python", day(20));
  await seedTask(s, roadmap, "Loops: for and while", day(0), { parent_id: stage });
  const todo = await seedBlock(s, "todo", "Study tasks", 6);
  await seedTask(s, todo, "Buy a Python book", day(-2), { is_milestone: true });
  await seedBlock(s, "notes", "Python notes", 6);
  await checkScreen(page, `/s/${s.spaceId}/${s.pageId}`);
});
