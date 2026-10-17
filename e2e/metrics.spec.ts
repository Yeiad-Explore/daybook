import { expect, test, type Page } from "@playwright/test";
import { OWNER_STATE } from "./global-setup";
import { checkScreen, hydrated } from "./helpers/checks";
import { day, db, seedBlock, seedColumns, seedEntry, seedField, seedRow, seedSpace, unique } from "./helpers/seed";

test.use({ storageState: OWNER_STATE });

const settings = async (page: Page, spaceId: string) => {
  await page.goto(`/s/${spaceId}/settings`);
  await hydrated(page, "#name");
};
const hero = (page: Page) => page.getByRole("region", { name: "Goal", exact: true });

test("SPC-7 AC1: a tracker metric shows the latest value; changing the metric recalculates the progress line", async ({ page }) => {
  const s = await seedSpace({ name: unique("Health"), kind: "goal", deadline: day(90) });
  const block = await seedBlock(s, "tracker", "Body");
  const weight = await seedField(s, block, "Weight", { unit: "kg", decimals: 1 });
  await seedEntry(s, weight, day(-1), 77.2);
  await settings(page, s.spaceId);
  await page.getByLabel("Count progress by").selectOption("tracker");
  await page.getByRole("button", { name: "Save progress setting" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Pick a tracker field first." })).toBeVisible();
  await page.getByLabel("Tracker field").selectOption({ index: 1 });
  await page.getByLabel("Start value").fill("78.4");
  await page.getByLabel("Target value").fill("72");
  await page.getByRole("button", { name: "Save progress setting" }).click();
  await expect(page.getByText("Right now:")).toContainText("19%");
  await expect(page.getByText("Right now:")).toContainText("77.2 kg now · started 78.4 · target 72");

  await page.goto(`/s/${s.spaceId}`);
  await expect(hero(page)).toContainText("77.2 kg now · started 78.4 · target 72");
  await expect(hero(page).getByRole("link", { name: "Log weight" })).toBeVisible();

  await settings(page, s.spaceId);
  await page.getByLabel("Count progress by").selectOption("manual");
  await page.getByLabel("Percent done").fill("40");
  await page.getByRole("button", { name: "Save progress setting" }).click();
  await expect(page.getByText("Right now:")).toContainText("40% · Set manually: 40%");
  await page.goto(`/s/${s.spaceId}`);
  await expect(hero(page)).toContainText("Set manually: 40%");
});

test("SPC-7: a table_count metric counts rows with the chosen option", async ({ page }) => {
  const s = await seedSpace({ name: unique("Agency"), kind: "goal", deadline: day(90) });
  const block = await seedBlock(s, "table", "Client pipeline");
  const cols = await seedColumns(s, block, [{ name: "Client" }, { name: "Status", kind: "select", options: [{ id: "opt_lead", label: "Lead", tone: "early" }, { id: "opt_client", label: "Client", tone: "active" }] }]);
  for (const [name, status] of [["A", "opt_client"], ["B", "opt_client"], ["C", "opt_lead"]]) await seedRow(s, block, cols, { Client: name, Status: status });
  await settings(page, s.spaceId);
  await page.getByLabel("Count progress by").selectOption("table_count");
  await page.getByLabel("Table column").selectOption({ index: 1 });
  await page.getByLabel("Count rows that are").selectOption({ label: "Client" });
  await page.getByLabel("Target count").fill("5");
  await page.getByRole("button", { name: "Save progress setting" }).click();
  await expect(page.getByText("Right now:")).toContainText("40% · 2 of 5 · Client");
});

test("SPC-7 AC2: deleting the tracker field falls back to tasks and says so in settings", async ({ page }) => {
  const s = await seedSpace({ name: unique("Health"), kind: "goal", deadline: day(90) });
  const block = await seedBlock(s, "tracker", "Body");
  const weight = await seedField(s, block, "Weight", { unit: "kg" });
  await db().from("spaces").update({ metric: "tracker", metric_config: { tracker: { field_id: weight.id, start: 80, target: 70 } } }).eq("id", s.spaceId);
  await settings(page, s.spaceId);
  await expect(page.getByLabel("Count progress by")).toHaveValue("tracker");
  await db().from("tracker_fields").delete().eq("id", weight.id);
  await settings(page, s.spaceId);
  await expect(page.getByLabel("Count progress by")).toHaveValue("tasks");
  await expect(page.getByRole("status").filter({ hasText: "Progress went back" })).toContainText("Progress went back to finished tasks because the tracker field it followed was deleted.");
  await page.goto(`/s/${s.spaceId}`);
  await expect(hero(page)).toContainText("0 of 0 steps done");
});

test("Cover photo: upload and crop, shown behind the hero, then remove", async ({ page }) => {
  const s = await seedSpace({ name: unique("Reading"), kind: "area" });
  await settings(page, s.spaceId);
  await expect(page.getByRole("button", { name: "Choose a photo" })).toBeVisible();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
  await page.getByLabel("Choose a cover photo").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: png });
  const dialog = page.getByRole("dialog", { name: "Crop the cover" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Vertical position of the crop").fill("30");
  await dialog.getByRole("button", { name: "Save the cover" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect.poll(async () => (await db().from("spaces").select("cover_path").eq("id", s.spaceId).single()).data?.cover_path).toBe(`${s.owner_id}/${s.spaceId}/cover.webp`);
  await page.goto(`/s/${s.spaceId}`);
  await expect(page.getByRole("region", { name: "Life area" }).locator("img")).toHaveCount(1);
  await settings(page, s.spaceId);
  await page.getByRole("button", { name: "Remove the cover" }).click();
  await expect.poll(async () => (await db().from("spaces").select("cover_path").eq("id", s.spaceId).single()).data?.cover_path).toBeNull();
  await expect(page.getByRole("button", { name: "Choose a photo" })).toBeVisible();
});

test("Space settings with the progress and cover panels pass layout and accessibility checks", async ({ page }) => {
  const s = await seedSpace({ name: unique("Health"), kind: "goal", deadline: day(90) });
  const block = await seedBlock(s, "tracker", "Body");
  await seedField(s, block, "Weight", { unit: "kg" });
  await checkScreen(page, `/s/${s.spaceId}/settings`);
});
