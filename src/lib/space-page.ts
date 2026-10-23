import { notFound } from "next/navigation";
import { cache } from "react";
import type { Tables } from "@/lib/database.types";
import { parseCalendarStatus } from "@/lib/calendar";
import type { SpaceSummary } from "@/lib/deadlines";
import type { Column, Row, SelectOption } from "@/lib/table-logic";
import type { Series } from "@/lib/tracker-logic";
import { isUuid } from "@/lib/space";
import { createClient } from "@/lib/supabase/server";

export type Space = Tables<"spaces">;
export type PageRow = Pick<Tables<"pages">, "id" | "title" | "position">;
export type Block = Tables<"blocks">;
export type Task = Pick<
  Tables<"tasks">,
  "id" | "block_id" | "parent_id" | "depth" | "title" | "note" | "due_date" | "due_time" | "done" | "completed_at" | "is_milestone" | "reschedule_count" | "position"
>;
export type Slot = Pick<Tables<"time_blocks">, "id" | "block_id" | "task_id" | "title" | "starts_at" | "ends_at" | "gcal_event_id" | "sync_status" | "sync_error"> & {
  /** TB-6: the linked task's title and deadline. */
  task: { title: string; due_date: string | null } | null;
};
export type TrackerField = Pick<Tables<"tracker_fields">, "id" | "block_id" | "label" | "unit" | "decimals" | "target_value" | "target_kind" | "position" | "archived_at">;
export type RoutineStep = Pick<Tables<"routine_steps">, "id" | "block_id" | "label" | "position" | "archived_at">;
/** What `routine_streak` returns (PRD §10.7). */
export type RoutineStreak = {
  streak: number;
  today_complete: boolean;
  scheduled_today: boolean;
  history: { date: string; state: "complete" | "partial" | "missed" | "not_scheduled" | "open" }[];
};
export type Note = Pick<Tables<"notes">, "block_id" | "body">;

const TRACKER_FIELD_COLUMNS = "id, block_id, label, unit, decimals, target_value, target_kind, position, archived_at";
const TASK_COLUMNS = "id, block_id, parent_id, depth, title, note, due_date, due_time, done, completed_at, is_milestone, reschedule_count, position";

/** Space header shared by every page in the space: it stays mounted while tabs change. */
export const loadSpaceShell = cache(async (spaceId: string) => {
  if (!isUuid(spaceId)) notFound();
  const supabase = await createClient();
  const [{ data: space }, { data: pages }, { data: summary }] = await Promise.all([
    supabase.from("spaces").select("*").eq("id", spaceId).is("deleted_at", null).maybeSingle(),
    supabase.from("pages").select("id, title, position").eq("space_id", spaceId).is("deleted_at", null).order("position").order("created_at").order("id"),
    supabase.rpc("space_summary", { p_space_id: spaceId }),
  ]);
  if (!space || !pages?.length) notFound();
  const coverUrl = space.cover_path ? ((await supabase.storage.from("covers").createSignedUrl(space.cover_path, 3600)).data?.signedUrl ?? null) : null;
  return { space, pages, coverUrl, summary: summary as unknown as SpaceSummary };
});

/** Everything the space page (PRD §5.4) renders, for one page of one live space. 404 otherwise. */
export const loadSpacePage = cache(async (spaceId: string, pageId: string) => {
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
  const today = (summary as unknown as SpaceSummary).today;
  const [{ data: tasks }, { data: notes }, { data: slots }, { data: fields }, { data: columns }, { data: rows }, { data: steps }, { data: checks }, { data: calendar }] = await Promise.all([
    supabase.from("tasks").select(TASK_COLUMNS).in("block_id", ids(["todo", "roadmap"])).is("deleted_at", null).order("position").order("created_at"),
    supabase.from("notes").select("block_id, body").in("block_id", ids(["notes"])),
    supabase.from("time_blocks").select("id, block_id, task_id, title, starts_at, ends_at, gcal_event_id, sync_status, sync_error, task:tasks(title, due_date)").in("block_id", ids(["timeblock"])).is("deleted_at", null).order("starts_at"),
    supabase.from("tracker_fields").select(TRACKER_FIELD_COLUMNS).in("block_id", ids(["tracker"])).order("position").order("created_at"),
    supabase.from("table_columns").select("id, block_id, name, kind, options, signed, summary, position").in("block_id", ids(["table"])).order("position").order("created_at"),
    supabase.from("table_rows").select("id, block_id, cells, position").in("block_id", ids(["table"])).is("deleted_at", null).order("position").order("created_at"),
    supabase.from("routine_steps").select("id, block_id, label, position, archived_at").in("block_id", ids(["routine"])).is("archived_at", null).order("position").order("created_at"),
    supabase.from("routine_checks").select("step_id").in("block_id", ids(["routine"])).eq("check_date", today),
    supabase.rpc("get_calendar_status"), // TB-3: whether slots can offer "Add to Google Calendar"
  ]);

  // TRK-3: one 90-day series per live field; the block slices it for 7D / 30D / 90D.
  const live = (fields ?? []).filter((f) => !f.archived_at);
  const series = Object.fromEntries(
    await Promise.all(
      live.map(async (f) => {
        const { data, error } = await supabase.rpc("tracker_series", { p_field_id: f.id, p_days: 90 });
        if (error) throw error;
        return [f.id, data as unknown as Series] as const;
      }),
    ),
  );
  // RT-4 / RT-5: the streak and the 84-day strip come from the database, once per routine block.
  const streaks = Object.fromEntries(
    await Promise.all(
      ids(["routine"]).map(async (id) => {
        const { data, error } = await supabase.rpc("routine_streak", { p_block_id: id, p_today: today });
        if (error) throw error;
        return [id, data as unknown as RoutineStreak] as const;
      }),
    ),
  );

  // SPC cover: a private bucket, so the browser gets a short-lived signed URL (NFR-3).
  const coverUrl = space.cover_path ? ((await supabase.storage.from("covers").createSignedUrl(space.cover_path, 3600)).data?.signedUrl ?? null) : null;

  return {
    space,
    coverUrl,
    pages: pages ?? [],
    page: pages!.find((p) => p.id === pageId)!,
    blocks: blocks ?? [],
    tasks: (tasks ?? []) as Task[],
    notes: (notes ?? []) as Note[],
    slots: (slots ?? []) as unknown as Slot[],
    calendar: parseCalendarStatus(calendar),
    trackerFields: (fields ?? []) as TrackerField[],
    series,
    columns: (columns ?? []).map((c) => ({ ...c, options: c.options as unknown as SelectOption[] })) as (Column & { block_id: string })[],
    rows: (rows ?? []) as unknown as (Row & { block_id: string })[],
    steps: (steps ?? []) as RoutineStep[],
    checkedToday: (checks ?? []).map((c) => c.step_id),
    streaks,
    summary: summary as unknown as SpaceSummary,
  };
});

export type SpacePageData = Awaited<ReturnType<typeof loadSpacePage>>;
