import { expect, test, type Page } from "@playwright/test";
import { OWNER_STATE } from "./global-setup";
import { hydrated } from "./helpers/checks";
import { day, db, seedBlock, seedSpace, unique } from "./helpers/seed";

test.use({ storageState: OWNER_STATE });

async function openCapture(page: Page) {
  await page.goto("/today");
  await hydrated(page, 'form[aria-label="Add a task for today"]');
  await page.locator("body").press("n");
  const dialog = page.getByRole("dialog", { name: "New task" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("CAP-1: N opens quick capture with today as the deadline; the task lands in the space's first To-do block", async ({ page }) => {
  const s = await seedSpace({ name: unique("Errands"), kind: "area" });
  const first = await seedBlock(s, "todo", "First list", 6);
  await seedBlock(s, "todo", "Second list", 6);
  const title = unique("Renew passport");
  const dialog = await openCapture(page);
  await expect(dialog.getByLabel("Deadline (optional)")).toHaveValue(day(0)); // default: today
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Space").selectOption({ label: s.spaceId ? (await db().from("spaces").select("name").eq("id", s.spaceId).single()).data!.name : "" });
  await expect(dialog.getByLabel("To-do list")).toHaveValue(first); // first To-do block of that space
  await dialog.getByRole("button", { name: "Add task" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await db().from("tasks").select("block_id, due_date").eq("title", title)).data).toEqual([{ block_id: first, due_date: day(0) }]);
  await expect(page.getByRole("checkbox", { name: `Done: ${title}`, exact: true })).toBeVisible(); // Today shows it at once (TODAY-3)
});

test("CAP-1: N is ignored while typing in a field", async ({ page }) => {
  await page.goto("/today");
  await hydrated(page, 'form[aria-label="Add a task for today"]');
  await page.getByLabel("Task title").click();
  await page.keyboard.type("n");
  await expect(page.getByLabel("Task title")).toHaveValue("n");
  await expect(page.getByRole("dialog", { name: "New task" })).toHaveCount(0);
});

test("CAP-2: the deadline rules apply: a goal needs a date inside it, and the date picker stops at the goal's deadline", async ({ page }) => {
  const s = await seedSpace({ name: unique("Fitness"), kind: "goal", deadline: day(10) });
  await seedBlock(s, "todo", "Training plan", 6);
  const name = (await db().from("spaces").select("name").eq("id", s.spaceId).single()).data!.name;
  const dialog = await openCapture(page);
  await dialog.getByLabel("Title").fill(unique("Buy shoes"));
  await dialog.getByLabel("Space").selectOption({ label: name });
  await expect(dialog.getByLabel("Deadline")).toHaveAttribute("max", day(10));
  await dialog.getByLabel("Deadline").fill("");
  await dialog.getByRole("button", { name: "Add task" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("A goal needs a deadline for every task.");
  await dialog.getByLabel("Deadline").fill(day(11));
  await dialog.getByRole("button", { name: "Add task" }).click();
  await expect(dialog.getByRole("alert")).toContainText("That deadline is after the goal ends (");
  await dialog.getByLabel("Deadline").fill(day(5));
  await dialog.getByRole("button", { name: "Add task" }).click();
  await expect(dialog).toBeHidden();
});

test("CAP-1: a space with no To-do list gets one", async ({ page }) => {
  const s = await seedSpace({ name: unique("Reading"), kind: "area" });
  const name = (await db().from("spaces").select("name").eq("id", s.spaceId).single()).data!.name;
  const title = unique("Pick a book");
  const dialog = await openCapture(page);
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Space").selectOption({ label: name });
  await expect(dialog.getByLabel("To-do list")).toHaveText("A new To-do list");
  await dialog.getByRole("button", { name: "Add task" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await db().from("blocks").select("type, title").eq("space_id", s.spaceId)).data).toEqual([{ type: "todo", title: "To-do list" }]);
});

test("Today's input adds a task due today to the chosen space", async ({ page }) => {
  const s = await seedSpace({ name: unique("Home"), kind: "area" });
  const block = await seedBlock(s, "todo", "Chores", 6);
  const name = (await db().from("spaces").select("name").eq("id", s.spaceId).single()).data!.name;
  const title = unique("Water the plants");
  await page.goto("/today");
  await hydrated(page, 'form[aria-label="Add a task for today"]');
  await page.getByLabel("Task title").fill(title);
  await page.getByLabel("Space", { exact: true }).selectOption({ label: name });
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect.poll(async () => (await db().from("tasks").select("block_id, due_date").eq("title", title)).data).toEqual([{ block_id: block, due_date: day(0) }]);
  await expect(page.getByRole("checkbox", { name: `Done: ${title}`, exact: true })).toBeVisible();
});
