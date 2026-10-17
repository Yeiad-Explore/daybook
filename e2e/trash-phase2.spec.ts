import { expect, test } from "@playwright/test";
import { OWNER_STATE } from "./global-setup";
import { hydrated } from "./helpers/checks";
import { at, day, db, seedBlock, seedColumns, seedRow, seedSlot, seedSpace, unique } from "./helpers/seed";

test.use({ storageState: OWNER_STATE });

test("SET-3: a deleted table row and time slot are listed in Trash and can be restored", async ({ page }) => {
  const s = await seedSpace({ name: unique("Home"), kind: "area" });
  const table = await seedBlock(s, "table", "Groceries");
  const cols = await seedColumns(s, table, [{ name: "Item" }, { name: "Qty", kind: "number" }]);
  const rowTitle = unique("Lentils");
  await seedRow(s, table, cols, { Item: rowTitle, Qty: 2 });
  const slots = await seedBlock(s, "timeblock", "Chores", 6);
  const slotTitle = unique("Clean the kitchen");
  await seedSlot(s, slots, slotTitle, at(day(1), "09:00"), at(day(1), "10:00"));

  await page.goto(`/s/${s.spaceId}/${s.pageId}`);
  await hydrated(page, '[aria-label="Block title"]');
  await page.getByRole("button", { name: "Delete row 1" }).click();
  await page.getByRole("button", { name: `Delete ${slotTitle}` }).click();
  await expect.poll(async () => (await db().from("table_rows").select("deleted_at").eq("block_id", table)).data?.[0]?.deleted_at).not.toBeNull();

  await page.goto("/settings/data");
  const row = page.getByRole("listitem").filter({ hasText: rowTitle });
  await expect(row).toContainText("Row");
  const slot = page.getByRole("listitem").filter({ hasText: slotTitle });
  await expect(slot).toContainText("Slot");
  await row.getByRole("button", { name: "Restore" }).click();
  await slot.getByRole("button", { name: "Restore" }).click();
  await expect(row).toHaveCount(0);
  await expect.poll(async () => (await db().from("table_rows").select("deleted_at").eq("block_id", table)).data?.[0]?.deleted_at).toBeNull();
  await expect.poll(async () => (await db().from("time_blocks").select("deleted_at").eq("block_id", slots)).data?.[0]?.deleted_at).toBeNull();
});
