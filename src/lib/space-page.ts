import { notFound } from "next/navigation";
import type { Tables } from "@/lib/database.types";
import type { SpaceSummary } from "@/lib/deadlines";
import { isUuid } from "@/lib/space";
import { createClient } from "@/lib/supabase/server";

export type Space = Tables<"spaces">;
export type PageRow = Pick<Tables<"pages">, "id" | "title" | "position">;
export type Block = Tables<"blocks">;
export type Task = Pick<
  Tables<"tasks">,
  "id" | "block_id" | "parent_id" | "depth" | "title" | "note" | "due_date" | "due_time" | "done" | "completed_at" | "is_milestone" | "reschedule_count" | "position"
>;
export type Slot = Pick<Tables<"time_blocks">, "id" | "block_id" | "task_id" | "title" | "starts_at" | "ends_at">;
export type Note = Pick<Tables<"notes">, "block_id" | "body">;

const TASK_COLUMNS = "id, block_id, parent_id, depth, title, note, due_date, due_time, done, completed_at, is_milestone, reschedule_count, position";

/** Everything the space page (PRD §5.4) renders, for one page of one live space. 404 otherwise. */
export async function loadSpacePage(spaceId: string, pageId: string) {
  if (!isUuid(spaceId) || !isUuid(pageId)) notFound();
  const supabase = await createClient();

  const [{ data: space }, { data: pages }, { data: blocks }, { data: summary }] = await Promise.all([
    supabase.from("spaces").select("*").eq("id", spaceId).is("deleted_at", null).maybeSingle(),
    supabase.from("pages").select("id, title, position").eq("space_id", spaceId).is("deleted_at", null).order("position").order("created_at").order("id"),
    supabase.from("blocks").select("*").eq("page_id", pageId).is("deleted_at", null).order("position").order("created_at"),
    supabase.rpc("space_summary", { p_space_id: spaceId }),
  ]);
  if (!space || !pages?.some((p) => p.id === pageId)) notFound();

  const ids = (types: Block["type"][]) => (blocks ?? []).filter((b) => types.includes(b.type)).map((b) => b.id);
  const [{ data: tasks }, { data: notes }, { data: slots }] = await Promise.all([
    supabase.from("tasks").select(TASK_COLUMNS).in("block_id", ids(["todo", "roadmap"])).is("deleted_at", null).order("position").order("created_at"),
    supabase.from("notes").select("block_id, body").in("block_id", ids(["notes"])),
    supabase.from("time_blocks").select("id, block_id, task_id, title, starts_at, ends_at").in("block_id", ids(["timeblock"])).is("deleted_at", null).order("starts_at"),
  ]);

  return {
    space,
    pages: pages ?? [],
    page: pages!.find((p) => p.id === pageId)!,
    blocks: blocks ?? [],
    tasks: (tasks ?? []) as Task[],
    notes: (notes ?? []) as Note[],
    slots: (slots ?? []) as Slot[],
    summary: summary as unknown as SpaceSummary,
  };
}

export type SpacePageData = Awaited<ReturnType<typeof loadSpacePage>>;
