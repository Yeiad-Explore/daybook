import { TZDate } from "@date-fns/tz";
import { createClient } from "@supabase/supabase-js";
import { addDays, format } from "date-fns";
import type { Database, Enums } from "../../src/lib/database.types";
import { localStack, OWNER_EMAIL } from "../global-setup";

// Test data for one spec, written with the local service role (trusted, like Daybook's own code) and
// owned by the e2e owner. Every space gets a unique name so parallel specs never share rows.

let cached: ReturnType<typeof createClient<Database>> | null = null;
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

export async function seedBlock(ctx: { owner_id: string; pageId: string }, type: Enums<"block_type">, title: string, span = 12) {
  const { data, error } = await admin()
    .from("blocks")
    .insert({ owner_id: ctx.owner_id, page_id: ctx.pageId, type, title, span, position: Date.now() % 100000, space_id: undefined as unknown as string })
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
    .insert({ owner_id: ctx.owner_id, block_id: blockId, title, due_date: due, position: Date.now() % 100000, space_id: undefined as unknown as string, ...extra })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Reads rows back for assertions that the database (not just the screen) changed. */
export function db() {
  return admin();
}
