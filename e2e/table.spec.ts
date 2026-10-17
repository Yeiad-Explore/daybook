import { expect, test, type Page } from "@playwright/test";
import { OWNER_STATE } from "./global-setup";
import { checkScreen, hydrated } from "./helpers/checks";
import { day, db, seedBlock, seedColumns, seedRow, seedSpace, unique } from "./helpers/seed";

test.use({ storageState: OWNER_STATE });

const open = (page: Page, s: { spaceId: string; pageId: string }) => page.goto(`/s/${s.spaceId}/${s.pageId}`);
const MEALS = [
  { id: "opt_breakfast", label: "Breakfast", tone: "neutral" },
  { id: "opt_lunch", label: "Lunch", tone: "neutral" },
];

test("TBL-1 AC1: setup names text columns by commas, which can then be retyped", async ({ page }) => {
  const s = await seedSpace({ name: unique("Money"), kind: "area" });
  const block = await seedBlock(s, "table", "Income and expenses");
  await open(page, s);
  await hydrated(page, '[aria-label="Block title"]');
  await page.getByLabel("Name the columns, separated by commas").fill("Date, Item, Amount");
  await page.getByRole("button", { name: "Create table" }).click();
  await expect(page.getByRole("columnheader", { name: "Amount" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("columnheader")).toHaveCount(3);

  await page.getByRole("button", { name: "Columns" }).click();
  const dialog = page.getByRole("dialog", { name: "Columns" });
  await dialog.getByLabel("Type of Amount").selectOption("money");
  await dialog.getByLabel("Type of Date").selectOption("date");
  await expect.poll(async () => (await db().from("table_columns").select("kind").eq("block_id", block).eq("name", "Amount")).data?.[0]?.kind).toBe("money");
  await dialog.getByLabel(/Signed: income is positive/).check();
  await dialog.getByLabel("Footer summary of Amount").selectOption("sum");
  await expect.poll(async () => (await db().from("table_columns").select("signed, summary").eq("block_id", block).eq("name", "Amount")).data?.[0]).toEqual({ signed: true, summary: "sum" });
});

test("TBL-2 AC1: cells are validated by kind with a message; rows add, edit and go to Trash with Undo", async ({ page }) => {
  const s = await seedSpace({ name: unique("Money"), kind: "area" });
  const block = await seedBlock(s, "table", "Expenses");
  const cols = await seedColumns(s, block, [{ name: "Item" }, { name: "Qty", kind: "number" }, { name: "Amount", kind: "money" }, { name: "Date", kind: "date" }]);
  await seedRow(s, block, cols, { Item: "Rice", Qty: 2, Amount: -450, Date: day(0) });
  await open(page, s);
  await hydrated(page, '[aria-label="Block title"]');

  await page.getByLabel("New row: Item").fill("Lentils");
  await page.getByLabel("New row: Qty").fill("two");
  await page.getByRole("button", { name: "Add row" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Qty: Enter a number, like 2 or 12.5." })).toBeVisible();
  await page.getByLabel("New row: Qty").fill("3");
  await page.getByLabel("New row: Amount").fill("৳1,250.50");
  await page.getByRole("button", { name: "Add row" }).click();
  await expect(page.getByRole("button", { name: /^Item, row 2/ })).toContainText("Lentils");
  await expect.poll(async () => (await db().from("table_rows").select("cells").eq("block_id", block)).data?.length).toBe(2);

  // Edit a cell in place; an invalid value stays open with its message.
  await page.getByRole("button", { name: /^Amount, row 1/ }).click();
  const edit = page.getByLabel("Amount, row 1");
  await edit.fill("abc");
  await edit.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Enter an amount, like 1250 or -450." })).toBeVisible();
  await edit.fill("-500");
  await edit.press("Enter");
  await expect(page.getByRole("button", { name: /^Amount, row 1/ })).toContainText("500");
  await expect.poll(async () => (await db().from("table_rows").select("cells").eq("block_id", block).order("position")).data?.[0]?.cells).toMatchObject({ [cols.Amount]: -500 });

  await page.getByRole("button", { name: "Delete row 2" }).click();
  await expect(page.getByRole("button", { name: /^Item, row 2/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: /^Item, row 2/ })).toContainText("Lentils");
});

test("TBL-3, TBL-4, TBL-7: ledger strip, summary footer and month groups with their own summary", async ({ page }) => {
  const s = await seedSpace({ name: unique("Ledger"), kind: "area" });
  const block = await seedBlock(s, "table", "Income and expenses");
  const cols = await seedColumns(s, block, [{ name: "Date", kind: "date" }, { name: "Item" }, { name: "Amount", kind: "money", signed: true, summary: "sum" }]);
  await seedRow(s, block, cols, { Date: "2026-09-03", Item: "Retainer", Amount: 25000 });
  await seedRow(s, block, cols, { Date: "2026-09-10", Item: "Rent", Amount: -12000 });
  await seedRow(s, block, cols, { Date: "2026-10-02", Item: "Retainer", Amount: 18000 });
  await seedRow(s, block, cols, { Date: "2026-10-05", Item: "Groceries", Amount: -3400.5 });
  await open(page, s);
  await hydrated(page, "#table-group");
  const strip = page.getByLabel("Income, expenses and net for the rows shown");
  await expect(strip).toContainText("৳43,000");
  await expect(strip).toContainText("৳15,400.5");
  await expect(strip).toContainText("৳27,599.5");
  await expect(page.locator("tfoot")).toContainText("27,599.5");

  await page.getByLabel("Group by month").selectOption({ label: "Group by month: Date" });
  await expect(page.getByRole("button", { name: /^October 2026/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^September 2026/ })).toBeVisible();
  const rows = page.getByRole("row");
  await expect(rows.filter({ hasText: "October 2026" })).toContainText("14,599.5"); // 18,000 − 3,400.5
  await expect(rows.filter({ hasText: "September 2026" })).toContainText("13,000"); // 25,000 − 12,000
  await page.getByRole("button", { name: /^October 2026/ }).click();
  await expect(page.getByRole("button", { name: /^Item, row 4/ })).toHaveCount(0); // October collapsed
  await page.reload();
  await expect(page.getByLabel("Group by month")).toHaveValue(cols.Date); // saved per block
});

test("TBL-5 AC: 'What I ate' filtered to Date = today shows only today's meals and their Calories sum", async ({ page }) => {
  const s = await seedSpace({ name: unique("Health"), kind: "area" });
  const block = await seedBlock(s, "table", "What I ate");
  const cols = await seedColumns(s, block, [{ name: "Date", kind: "date" }, { name: "Meal", kind: "select", options: MEALS }, { name: "Food" }, { name: "Calories", kind: "number", summary: "sum" }]);
  await seedRow(s, block, cols, { Date: day(0), Meal: "opt_breakfast", Food: "Eggs", Calories: 420 });
  await seedRow(s, block, cols, { Date: day(0), Meal: "opt_lunch", Food: "Rice and fish", Calories: 640 });
  await seedRow(s, block, cols, { Date: day(-1), Meal: "opt_lunch", Food: "Soup", Calories: 300 });
  await open(page, s);
  await hydrated(page, '[aria-label="Block title"]');
  await expect(page.locator("tfoot")).toContainText("1,360");

  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByLabel("Column").selectOption({ label: "Date" });
  await page.getByLabel("Show").selectOption("is_today");
  await page.getByRole("button", { name: "Add filter" }).click();
  await expect(page.getByRole("button", { name: /^Food, row 2/ })).toHaveCount(1); // row numbers follow the stored order
  await expect(page.getByRole("button", { name: /^Food, row 3/ })).toHaveCount(0);
  await expect(page.getByText("Soup")).toHaveCount(0);
  await expect(page.locator("tfoot")).toContainText("1,060");
  await expect(page.getByText("Showing 2 of 3 rows.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Soup")).toHaveCount(0); // filters are saved per block
  await expect(page.locator("tfoot")).toContainText("1,060");
});

test("Table passes layout and accessibility checks in light and dark at 400 and 1440px", async ({ page }) => {
  test.slow(); // four page loads, each with an accessibility scan
  const s = await seedSpace({ name: unique("Ledger"), kind: "area" });
  const block = await seedBlock(s, "table", "Client pipeline");
  const cols = await seedColumns(s, block, [
    { name: "Client" },
    { name: "Status", kind: "select", options: [{ id: "opt_lead", label: "Lead", tone: "early" }, { id: "opt_client", label: "Client", tone: "active" }, { id: "opt_lost", label: "Lost", tone: "closed" }] },
    { name: "Value ৳/mo", kind: "money", summary: "sum" },
    { name: "Paid", kind: "checkbox" },
    { name: "Site", kind: "url" },
  ]);
  await seedRow(s, block, cols, { Client: "Bayside Café", Status: "opt_client", "Value ৳/mo": 20000, Paid: true, Site: "https://example.com" });
  await seedRow(s, block, cols, { Client: "Lumen Foods", Status: "opt_lead", "Value ৳/mo": 15000, Paid: false });
  await checkScreen(page, `/s/${s.spaceId}/${s.pageId}`);
});
