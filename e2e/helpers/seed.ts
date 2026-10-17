import { TZDate } from "@date-fns/tz";
import { createClient } from "@supabase/supabase-js";
import { addDays, format } from "date-fns";
import type { Database, Enums, TablesInsert } from "../../src/lib/database.types";
import { localStack, OWNER_EMAIL } from "../global-setup";

// Test data for one spec, written with the local service role (trusted, like Daybook's own code) and
// owned by the e2e owner. Every space gets a unique name so parallel specs never share rows.

let cached: ReturnType<typeof createClient<Database>> | null = null;
let order = 0; // rows seeded later sort later
const nextPosition = () => ++order;
function admin() {
  if (!cached) {
    const { url, secret } = localStack();
    if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error(`Refusing to seed ${url}`);
    cached = createClient<Database>(url, secret, { auth: { persistSession: false } });
  }
  return cached;
}

async function ownerId() {
  const { data } = await admin().auth.admin.listUsers();
  return data.users.find((u) => u.email === OWNER_EMAIL)!.id;
}

/** The owner's local today (Asia/Dhaka, the e2e profile default), shifted by `days`. */
export function day(days = 0) {
  return format(addDays(new TZDate(new Date(), "Asia/Dhaka"), days), "yyyy-MM-dd");
}

export const unique = (name: string) => `${name} ${Math.random().toString(36).slice(2, 7)}`;

export async function seedSpace(opts: {
  name: string;
  kind?: Enums<"space_kind">;
  mark?: Enums<"mark_color">;
  endGoal?: string;
  start?: string;
  deadline?: string;
}) {
  const owner_id = await ownerId();
  const goal = (opts.kind ?? "goal") === "goal";
  const { data: space, error } = await admin()
    .from("spaces")
    .insert({
      owner_id,
      kind: opts.kind ?? "goal",
      name: opts.name,
      mark: opts.mark ?? "moss",
      end_goal: goal ? (opts.endGoal ?? "Finish what this test needs") : null,
      start_date: goal ? (opts.start ?? day(-30)) : null,
      deadline: goal ? (opts.deadline ?? day(90)) : null,
      position: -1000 - Math.random(), // before anything the app creates (SPC-1 AC3 puts new spaces last)
    })
    .select("id")
    .single();
  if (error) throw error;
  const { data: page } = await admin().from("pages").select("id").eq("space_id", space.id).single();
  return { owner_id, spaceId: space.id, pageId: page!.id };
}

export async function seedBlock(ctx: { owner_id: string; pageId: string }, type: Enums<"block_type">, title: string, span = 12, extra: Partial<TablesInsert<"blocks">> = {}) {
  const { data, error } = await admin()
    .from("blocks")
    .insert({ owner_id: ctx.owner_id, page_id: ctx.pageId, type, title, span, position: nextPosition(), space_id: undefined as unknown as string, ...extra })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function seedTask(
  ctx: { owner_id: string },
  blockId: string,
  title: string,
  due: string | null,
  extra: { parent_id?: string; done?: boolean; is_milestone?: boolean } = {},
) {
  const { data, error } = await admin()
    .from("tasks")
    .insert({ owner_id: ctx.owner_id, block_id: blockId, title, due_date: due, position: nextPosition(), space_id: undefined as unknown as string, ...extra })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

type Ctx = { owner_id: string };

export async function seedField(ctx: Ctx, blockId: string, label: string, extra: Partial<TablesInsert<"tracker_fields">> = {}) {
  const { data, error } = await admin()
    .from("tracker_fields")
    .insert({ owner_id: ctx.owner_id, block_id: blockId, label, position: nextPosition(), ...extra })
    .select("id, block_id")
    .single();
  if (error) throw error;
  return data;
}

export async function seedEntry(ctx: Ctx, field: { id: string; block_id: string }, entryDate: string, value: number) {
  const { error } = await admin().from("tracker_entries").insert({ owner_id: ctx.owner_id, field_id: field.id, block_id: field.block_id, entry_date: entryDate, value });
  if (error) throw error;
}

/** Table columns by name (kind and options optional); returns name -> id. */
export async function seedColumns(ctx: Ctx, blockId: string, columns: { name: string; kind?: Enums<"column_kind">; options?: { id: string; label: string; tone: string }[]; signed?: boolean; summary?: Enums<"summary_kind"> }[]) {
  const ids: Record<string, string> = {};
  for (const c of columns) {
    const { data, error } = await admin()
      .from("table_columns")
      .insert({ owner_id: ctx.owner_id, block_id: blockId, name: c.name, kind: c.kind ?? "text", options: c.options ?? [], signed: c.signed ?? false, summary: c.summary ?? "none", position: nextPosition() })
      .select("id")
      .single();
    if (error) throw error;
    ids[c.name] = data.id;
  }
  return ids;
}

/** A table row from cells keyed by column NAME. */
export async function seedRow(ctx: Ctx, blockId: string, columns: Record<string, string>, cells: Record<string, string | number | boolean | null>) {
  const keyed = Object.fromEntries(Object.entries(cells).map(([name, v]) => [columns[name], v]));
  const { error } = await admin().from("table_rows").insert({ owner_id: ctx.owner_id, block_id: blockId, cells: keyed, position: nextPosition() });
  if (error) throw error;
}

export async function seedStep(ctx: Ctx, blockId: string, label: string, extra: Partial<TablesInsert<"routine_steps">> = {}) {
  const { data, error } = await admin().from("routine_steps").insert({ owner_id: ctx.owner_id, block_id: blockId, label, position: nextPosition(), ...extra }).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function seedCheck(ctx: Ctx, blockId: string, stepId: string, checkDate: string) {
  const { error } = await admin().from("routine_checks").insert({ owner_id: ctx.owner_id, block_id: blockId, step_id: stepId, check_date: checkDate });
  if (error) throw error;
}

export async function seedSlot(ctx: Ctx, blockId: string, title: string, startsAt: string, endsAt: string, extra: Partial<TablesInsert<"time_blocks">> = {}) {
  const { error } = await admin().from("time_blocks").insert({ owner_id: ctx.owner_id, block_id: blockId, title, starts_at: startsAt, ends_at: endsAt, space_id: undefined as unknown as string, ...extra });
  if (error) throw error;
}

/** Reads rows back for assertions that the database (not just the screen) changed. */
export function db() {
  return admin();
}

/** An ISO instant for a local Asia/Dhaka day ("YYYY-MM-DD") and time ("HH:mm"). */
export function at(dayText: string, time: string) {
  return new TZDate(`${dayText}T${time}:00`, "Asia/Dhaka").toISOString();
}
