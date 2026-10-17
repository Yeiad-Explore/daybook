import { addDays, format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";

export type TrashTable = "spaces" | "pages" | "blocks" | "tasks";
export type TrashEntry = { table: TrashTable; id: string; name: string; where: string; deletedAt: string; purgeOn: string };

/** §10.8: purge_trash deletes for good after 30 days. */
const purgeDay = (deletedAt: string) => format(addDays(parseISO(deletedAt), 30), "yyyy-MM-dd");

/**
 * SET-3: what is in Trash, newest first. Only things trashed on their own are listed: a page that went
 * with its space (same deleted_at) comes back with the space, so it is not a separate entry.
 */
export async function loadTrash(): Promise<TrashEntry[]> {
  const supabase = await createClient();
  const [spaces, pages, blocks, tasks] = await Promise.all([
    supabase.from("spaces").select("id, name, deleted_at").not("deleted_at", "is", null),
    supabase.from("pages").select("id, title, deleted_at, spaces(name, deleted_at)").not("deleted_at", "is", null),
    supabase.from("blocks").select("id, title, deleted_at, pages(title, deleted_at), spaces(name)").not("deleted_at", "is", null),
    supabase.from("tasks").select("id, title, parent_id, deleted_at, blocks(title, deleted_at), spaces(name)").not("deleted_at", "is", null),
  ]);
  const failed = [spaces, pages, blocks, tasks].find((r) => r.error);
  if (failed) throw failed.error;
  const trashedTask = new Map((tasks.data ?? []).map((t) => [t.id, t.deleted_at]));

  const entries: TrashEntry[] = [
    ...(spaces.data ?? []).map((s) => ({ table: "spaces" as const, id: s.id, name: s.name, where: "", deletedAt: s.deleted_at! })),
    ...(pages.data ?? [])
      .filter((p) => p.spaces?.deleted_at !== p.deleted_at)
      .map((p) => ({ table: "pages" as const, id: p.id, name: p.title, where: p.spaces?.name ?? "", deletedAt: p.deleted_at! })),
    ...(blocks.data ?? [])
      .filter((b) => b.pages?.deleted_at !== b.deleted_at)
      .map((b) => ({ table: "blocks" as const, id: b.id, name: b.title, where: [b.spaces?.name, b.pages?.title].filter(Boolean).join(" · "), deletedAt: b.deleted_at! })),
    ...(tasks.data ?? [])
      .filter((t) => t.blocks?.deleted_at !== t.deleted_at && (!t.parent_id || trashedTask.get(t.parent_id) !== t.deleted_at))
      .map((t) => ({ table: "tasks" as const, id: t.id, name: t.title, where: [t.spaces?.name, t.blocks?.title].filter(Boolean).join(" · "), deletedAt: t.deleted_at! })),
  ].map((e) => ({ ...e, purgeOn: purgeDay(e.deletedAt) }));

  return entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}
