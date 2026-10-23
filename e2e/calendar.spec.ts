import { expect, test, type Page } from "@playwright/test";
import { checkScreen, hydrated } from "./helpers/checks";
import { connectCalendar, connectionRow, disconnectCalendar, fake, functionsUrl, ownerJwt, requireFunctions, sweep } from "./helpers/calendar";
import { localStack, OWNER_STATE } from "./global-setup";
import { at, day, db, ownerId, seedBlock, seedSlot, seedSpace, seedTask, unique } from "./helpers/seed";

// Phase 3 (GC-1 to GC-11, TB-3 to TB-5) against the real local Edge Functions and a fake Google.
// Needs `pnpm functions:e2e` running (Docker). The fake Google is started by Playwright.
test.use({ storageState: OWNER_STATE });
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await requireFunctions();
});
test.beforeEach(async () => {
  await fake.reset();
  await disconnectCalendar();
});
test.afterAll(async () => {
  await disconnectCalendar();
});

async function setup(page: Page, blockConfig: Record<string, boolean> = {}) {
  page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 400)));
  const s = await seedSpace({ name: unique("Study"), kind: "area" });
  const block = await seedBlock(s, "timeblock", "Study sessions", 12, { config: blockConfig });
  await page.goto(`/s/${s.spaceId}/${s.pageId}`);
  await hydrated(page, '[aria-label="Block title"]');
  return { ...s, block };
}

async function addSlot(page: Page, title: string, d: string, start: string, end: string) {
  await page.getByLabel("Slot title").fill(title);
  await page.getByLabel("Day").fill(d);
  await page.getByLabel("Starts").fill(start);
  await page.getByLabel("Ends").fill(end);
  await page.getByRole("button", { name: /^Add slot/ }).click();
}

const row = (page: Page, title: string) => page.getByRole("listitem").filter({ hasText: title });
const onCalendar = (page: Page, title: string) => row(page, title).getByRole("link", { name: /^On calendar/ });
const events = async () => Object.entries((await fake.state()).events);
const ms = (iso: string | undefined) => Date.parse(iso ?? "");

test("GC AC1 to AC3: a slot reaches Google, the same event follows an edit, and deleting the slot deletes the event", async ({ page }) => {
  await connectCalendar();
  const s = await setup(page);
  await addSlot(page, "Python: loops", day(1), "20:00", "21:30");

  // AC1: within 10 s the slot says it is on Google Calendar, and the event exists at 20:00 to 21:30 Asia/Dhaka.
  await expect(onCalendar(page, "Python: loops")).toBeVisible({ timeout: 10_000 });
  const [[id, event]] = await events();
  expect(ms(event.start.dateTime)).toBe(ms(at(day(1), "20:00")));
  expect(ms(event.end.dateTime)).toBe(ms(at(day(1), "21:30")));
  expect(event.start.timeZone).toBe("Asia/Dhaka");
  expect(event.summary).toBe("Python: loops");
  expect(event.description).toContain("From Daybook");
  const { data: slot } = await db().from("time_blocks").select("id, gcal_event_id, sync_status").eq("block_id", s.block).single();
  expect(slot).toMatchObject({ gcal_event_id: id, sync_status: "synced" });
  expect(event.extendedProperties.private.daybookId).toBe(slot!.id);

  // AC2: the end moves to 22:00, the same event (same id) now ends at 22:00.
  await page.getByRole("button", { name: "Edit Python: loops" }).click();
  await page.getByRole("dialog").getByLabel("Ends").fill("22:00");
  await page.getByRole("button", { name: "Save slot" }).click();
  await expect.poll(async () => ms((await events())[0]?.[1].end.dateTime), { timeout: 10_000 }).toBe(ms(at(day(1), "22:00")));
  expect((await events()).map(([eid]) => eid)).toEqual([id]);

  // AC3: deleting the slot deletes the Google event.
  await page.getByRole("button", { name: "Delete Python: loops" }).click();
  await expect.poll(async () => (await events()).length, { timeout: 10_000 }).toBe(0);
  await expect.poll(async () => (await db().from("time_blocks").select("sync_status, gcal_event_id").eq("id", slot!.id).single()).data).toEqual({ sync_status: "not_synced", gcal_event_id: null });
});

test("GC-8: an event deleted on Google is created again on the next edit, never duplicated", async ({ page }) => {
  await connectCalendar();
  await setup(page);
  await addSlot(page, "Review notes", day(1), "09:00", "10:00");
  await expect(onCalendar(page, "Review notes")).toBeVisible({ timeout: 10_000 });
  const [[first]] = await events();
  await fake.remove(first);

  await page.getByRole("button", { name: "Edit Review notes" }).click();
  await page.getByRole("dialog").getByLabel("Ends").fill("10:30");
  await page.getByRole("button", { name: "Save slot" }).click();
  await expect.poll(async () => (await events()).map(([id]) => id).filter((id) => id !== first).length, { timeout: 10_000 }).toBe(1);
  expect(await events()).toHaveLength(1);
  const { data } = await db().from("time_blocks").select("gcal_event_id").eq("title", "Review notes").single();
  expect(data?.gcal_event_id).not.toBe(first);
});

test("GC-9, TB-3: a Google error shows 'Sync failed' with the reason, and Retry works", async ({ page }) => {
  await connectCalendar();
  await setup(page);
  await fake.fail("POST", 503, "backendError", 1);
  await addSlot(page, "Gym", day(1), "07:00", "08:00");
  await expect(row(page, "Gym").getByText("Sync failed")).toBeVisible({ timeout: 10_000 });
  await expect(row(page, "Gym")).toContainText("Google had a problem, will retry.");
  const { data } = await db().from("time_blocks").select("sync_status, sync_attempts, next_sync_at, sync_error").eq("title", "Gym").single();
  expect(data).toMatchObject({ sync_status: "failed", sync_attempts: 1, sync_error: "Google had a problem, will retry." });
  expect(ms(data!.next_sync_at!) - Date.now()).toBeGreaterThan(8 * 60_000); // backed off about 10 minutes

  await row(page, "Gym").getByRole("button", { name: "Retry" }).click();
  await expect(onCalendar(page, "Gym")).toBeVisible({ timeout: 10_000 });
  expect(await events()).toHaveLength(1);
});

test("TB-5: a failed delete is retried as a delete, and the event leaves Google", async ({ page }) => {
  await connectCalendar();
  await setup(page);
  await addSlot(page, "Short lived", day(1), "11:00", "12:00");
  await expect(onCalendar(page, "Short lived")).toBeVisible({ timeout: 10_000 });
  await fake.fail("DELETE", 503, "backendError", 1);
  await page.getByRole("button", { name: "Delete Short lived" }).click();
  await expect.poll(async () => (await db().from("time_blocks").select("sync_status, sync_error").eq("title", "Short lived").single()).data, { timeout: 10_000 }).toEqual({ sync_status: "delete_pending", sync_error: "Google had a problem, will retry." });
  expect(await events()).toHaveLength(1); // still on Google

  await page.goto("/settings/calendar"); // the failed delete shows as a failed sync with Retry all
  await expect(page.getByRole("button", { name: "Retry all" })).toBeVisible();
  await page.getByRole("button", { name: "Retry all" }).click();
  await expect.poll(async () => (await events()).length, { timeout: 10_000 }).toBe(0);
  expect((await db().from("time_blocks").select("sync_status, gcal_event_id").eq("title", "Short lived").single()).data).toEqual({ sync_status: "not_synced", gcal_event_id: null });
});

test("TB-3, TB-4: with auto-add off a slot offers 'Add to Google Calendar'", async ({ page }) => {
  await connectCalendar();
  await setup(page, { auto_sync: false });
  await addSlot(page, "Manual one", day(1), "12:00", "13:00");
  await expect(row(page, "Manual one").getByRole("button", { name: "Add to Google Calendar" })).toBeVisible();
  expect(await events()).toHaveLength(0);
  await row(page, "Manual one").getByRole("button", { name: "Add to Google Calendar" }).click();
  await expect(onCalendar(page, "Manual one")).toBeVisible({ timeout: 10_000 });
  expect(await events()).toHaveLength(1);
});

test("GC-10: a revoked token needs a reconnect: nothing fails, the owner is told, and a reconnect resumes the sync", async ({ page }) => {
  await connectCalendar("revoked");
  await setup(page);
  await addSlot(page, "Waits for me", day(1), "15:00", "16:00");
  await expect(row(page, "Waits for me").getByRole("link", { name: "Reconnect Google Calendar" })).toBeVisible({ timeout: 10_000 });
  expect((await connectionRow())?.status).toBe("needs_reconnect");
  const { data: slot } = await db().from("time_blocks").select("sync_status, sync_attempts").eq("title", "Waits for me").single();
  expect(slot).toEqual({ sync_status: "pending", sync_attempts: 0 }); // not a slot failure
  expect(await events()).toHaveLength(0);

  await page.goto("/today");
  await expect(page.getByRole("link", { name: "Reconnect Google Calendar" })).toBeVisible();
  await page.goto("/settings/calendar");
  await expect(page.getByRole("button", { name: "Reconnect Google Calendar" })).toBeVisible();
  await expect(page.getByText("Google asked for a new sign-in")).toBeVisible(); // the log says so

  // The owner signs in again (a new refresh token is stored) and the 10-minute sweep delivers the slot.
  await connectCalendar("good-refresh");
  const swept = await sweep();
  expect(swept.results.map((r) => r.outcome)).toEqual(["synced"]);
  expect(await events()).toHaveLength(1);
  await page.goto("/settings/calendar");
  await expect(page.getByText("Connected.")).toBeVisible();
});

test("GC-2, GC-1: store-google-token verifies with Google and keeps the token only in Vault", async () => {
  const jwt = await ownerJwt();
  const call = (body: unknown, auth: string | null = `Bearer ${jwt}`) =>
    fetch(`${functionsUrl()}/store-google-token`, { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body) });

  expect((await call({ refresh_token: "r", access_token: "a" }, null)).status).toBe(401);
  expect((await call({ access_token: "a" })).status).toBe(400);
  const noScope = await call({ refresh_token: "r", access_token: "no-calendar" });
  expect(await noScope.json()).toEqual({ error: "missing_scope" });
  const wrong = await call({ refresh_token: "r", access_token: "other-account" });
  expect(wrong.status).toBe(403);
  expect(await connectionRow()).toBeNull();

  const ok = await call({ refresh_token: "my-refresh-token", access_token: "a" });
  expect(ok.status).toBe(200);
  const text = await ok.text();
  expect(text).not.toContain("my-refresh-token");
  expect(JSON.parse(text)).toMatchObject({ status: "connected" });
  expect(await connectionRow()).toMatchObject({ status: "connected" });
  const { data: stored } = await db().rpc("read_google_refresh_token", { p_owner: (await db().from("google_connections").select("owner_id").single()).data!.owner_id });
  expect(stored).toBe("my-refresh-token");
});

test("GC-2, §9.4: the owner's own session cannot read the token, the connection or the log, and the cron key cannot disconnect", async () => {
  await connectCalendar("super-secret-refresh");
  const jwt = await ownerJwt();
  const { url, publishable } = localStack();
  const headers = { apikey: publishable, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" };
  const owner = await ownerId();

  // Direct table reads and the service-only RPCs are refused for a signed-in user (no policy, no grant).
  for (const table of ["google_connections", "calendar_sync_log"]) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, { headers });
    expect(res.ok, `${table} must not be readable`).toBe(false);
  }
  for (const fn of ["read_google_refresh_token", "claim_sync_rows", "connect_google_account", "disconnect_google_account"]) {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify({ p_owner: owner }) });
    expect(res.ok, `${fn} must not be callable`).toBe(false);
    expect(await res.text()).not.toContain("super-secret-refresh");
  }
  // What the owner can read is safe: the status carries no token or secret id.
  const status = await fetch(`${url}/rest/v1/rpc/get_calendar_status`, { method: "POST", headers, body: "{}" });
  const text = await status.text();
  expect(JSON.parse(text)).toMatchObject({ status: "connected" });
  expect(text).not.toMatch(/super-secret|secret_id|refresh/);

  // A user JWT may sweep (their own rows) but never disconnect through the cron key's path, and no request without
  // credentials gets anywhere.
  const anon = await fetch(`${functionsUrl()}/calendar-sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sweep" }) });
  expect(anon.status).toBe(401);
  const wrongKey = await fetch(`${functionsUrl()}/calendar-sync`, { method: "POST", headers: { apikey: publishable, "Content-Type": "application/json" }, body: JSON.stringify({ action: "sweep" }) });
  expect(wrongKey.status).toBe(401); // the publishable key is not the secret key
  const cronDisconnect = await fetch(`${functionsUrl()}/calendar-sync`, { method: "POST", headers: { apikey: localStack().secret, "Content-Type": "application/json" }, body: JSON.stringify({ action: "disconnect" }) });
  expect(cronDisconnect.status).toBe(403); // the cron key can sweep, not disconnect
});

test("GC-11: deadlines become all-day events when switched on, and leave when the task is done", async ({ page }) => {
  await connectCalendar();
  const s = await seedSpace({ name: unique("Work"), kind: "area" });
  const block = await seedBlock(s, "todo", "Tasks");
  const due = day(3);
  const taskId = await seedTask(s, block, "Send proposal", due);
  // Earlier specs left dated tasks behind; keep this test about its own task (the data is disposable).
  await db().from("tasks").update({ deleted_at: new Date().toISOString() }).eq("owner_id", s.owner_id).neq("id", taskId).is("deleted_at", null);
  await page.goto("/settings/calendar");
  await hydrated(page);
  await page.getByLabel("Add deadlines as all-day events").check();
  await expect.poll(async () => (await db().from("tasks").select("sync_status").eq("id", taskId).single()).data?.sync_status).toBe("pending");
  await sweep();
  const [[eventId, event]] = await events();
  expect(event.start).toEqual({ date: due });
  expect(event.summary).toBe("Send proposal");
  const { data: synced } = await db().from("tasks").select("sync_status, gcal_event_id").eq("id", taskId).single();
  expect(synced).toEqual({ sync_status: "synced", gcal_event_id: eventId });

  const { error } = await db().from("tasks").update({ done: true }).eq("id", taskId);
  expect(error).toBeNull();
  await sweep();
  expect(await events()).toHaveLength(0);
  expect((await db().from("tasks").select("sync_status").eq("id", taskId).single()).data?.sync_status).toBe("not_synced");
});

test("GC-4, GC-5: /settings/calendar shows the account and the log, and Disconnect can also remove the events", async ({ page }) => {
  await connectCalendar();
  await setup(page);
  await addSlot(page, "Planning", day(1), "10:00", "11:00");
  await expect(onCalendar(page, "Planning")).toBeVisible({ timeout: 10_000 });

  await page.goto("/settings/calendar");
  await expect(page.locator("#content").getByText("ourcoc4@gmail.com")).toBeVisible();
  await expect(page.getByText("Your primary calendar")).toBeVisible();
  await expect(page.getByText("Added to calendar: Planning")).toBeVisible();
  await expect(page.getByText("Nothing synced yet")).toHaveCount(0);

  await page.getByRole("button", { name: "Disconnect Google Calendar" }).click();
  await page.getByLabel("Also remove Daybook events from my calendar").check();
  await page.getByRole("dialog").getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("button", { name: "Connect Google Calendar" })).toBeVisible({ timeout: 10_000 });
  expect(await events()).toHaveLength(0);
  expect((await connectionRow())?.status).toBe("disconnected");
  expect((await connectionRow())?.refresh_token_secret_id).toBeNull();
  expect((await db().from("time_blocks").select("sync_status, gcal_event_id").eq("title", "Planning").single()).data).toEqual({ sync_status: "not_synced", gcal_event_id: null });
});

test("Disconnect without removing leaves the events on Google, and a reconnect adopts them instead of duplicating", async ({ page }) => {
  await connectCalendar();
  const s = await setup(page);
  await addSlot(page, "Keep me", day(1), "10:00", "11:00");
  await expect(onCalendar(page, "Keep me")).toBeVisible({ timeout: 10_000 });
  await page.goto("/settings/calendar");
  await page.getByRole("button", { name: "Disconnect Google Calendar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("button", { name: "Connect Google Calendar" })).toBeVisible({ timeout: 10_000 });
  expect(await events()).toHaveLength(1);

  await connectCalendar();
  const { data: slot } = await db().from("time_blocks").select("id").eq("block_id", s.block).single();
  await page.goto(`/s/${s.spaceId}/${s.pageId}`);
  await row(page, "Keep me").getByRole("button", { name: "Add to Google Calendar" }).click();
  await expect(onCalendar(page, "Keep me")).toBeVisible({ timeout: 10_000 });
  expect(await events()).toHaveLength(1);
  expect((await db().from("time_blocks").select("gcal_event_id").eq("id", slot!.id).single()).data?.gcal_event_id).toBe((await events())[0][0]);
});

test("The calendar screens pass layout and accessibility checks in light and dark at 400 and 1440px", async ({ page }) => {
  test.setTimeout(240_000);
  // Disconnected, connected with activity, and needing a reconnect.
  await checkScreen(page, "/settings/calendar");
  await connectCalendar();
  const s = await setup(page);
  await addSlot(page, "Checked slot", day(1), "10:00", "11:00");
  await expect(onCalendar(page, "Checked slot")).toBeVisible({ timeout: 10_000 });
  await seedSlot(s, s.block, "Not yet", at(day(2), "10:00"), at(day(2), "11:00"));
  await db().from("time_blocks").update({ sync_status: "failed", sync_error: "Google had a problem, will retry.", sync_attempts: 1 }).eq("title", "Not yet");
  await checkScreen(page, `/s/${s.spaceId}/${s.pageId}`);
  await checkScreen(page, "/settings/calendar");
  await connectCalendar("revoked");
  await db().from("google_connections").update({ status: "needs_reconnect", last_error: "Google no longer accepts the saved sign-in. Reconnect Google Calendar." }).neq("owner_id", "00000000-0000-0000-0000-000000000000");
  await checkScreen(page, "/settings/calendar");
  await checkScreen(page, "/today");
});
