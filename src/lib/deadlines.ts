import type { Enums } from "@/lib/database.types";

// Shapes of the Phase 1 RPC payloads (supabase/migrations/20261017100000_phase1_deadline_rpcs.sql).
// The generated types call them Json; these are the contract the SQL returns.

export type Blocker = { id: string; title: string; due_date: string };

export type RescheduleResult =
  | { status: "rescheduled"; old_due: string; new_due: string; moved: number }
  | { status: "conflict"; rule: "DL-3" | "DL-4"; new_due: string; blockers: Blocker[] };

export type TrashResult = { status: "trashed"; late_logged: number } | { status: "needs_reason"; late_tasks: Blocker[] };

export type AgendaRow = {
  id: string;
  title: string;
  due_date: string;
  due_time: string | null;
  done: boolean;
  done_late: boolean;
  reschedule_count: number;
  is_milestone: boolean;
  note: string | null;
  parent_id: string | null;
  block_id: string;
  page_id: string;
  space_id: string;
  space_name: string;
  mark: Enums<"mark_color">;
  source: string;
};

type Source = { block_id: string; page_id: string; space_id: string; space_name: string; mark: Enums<"mark_color"> };

/** A slot on today's timetable (Appendix A). */
export type TodaySlot = Source & { id: string; title: string; starts_at: string; ends_at: string; task_id: string | null; task_title: string | null; sync_status: Enums<"sync_status"> };
/** A routine scheduled today, with today's checks and the streak including today when complete (Appendix A). */
export type TodayRoutine = Source & { title: string; streak: number; complete: boolean; steps: { id: string; label: string; position: number; checked: boolean }[] };
/** A tracker with today's values (null where nothing is logged yet). */
export type TodayTracker = Source & {
  title: string;
  logged: boolean;
  fields: { id: string; label: string; unit: string | null; decimals: number; target_value: number | null; target_kind: Enums<"target_kind"> | null; today_value: number | null }[];
};

export type TodayData = {
  today: string;
  late_count: number;
  overdue: AgendaRow[];
  due_today: AgendaRow[];
  next_7: AgendaRow[];
  slots: TodaySlot[];
  routines: TodayRoutine[];
  trackers: TodayTracker[];
};

export type Milestone = { id: string; title: string; due_date: string; done: boolean; state: "done" | "late" | "upcoming" };

export type SpaceSummary = {
  space_id: string;
  kind: Enums<"space_kind">;
  status: Enums<"space_status">;
  today: string;
  start_date: string | null;
  deadline: string | null;
  days_left: number | null;
  elapsed: number | null;
  progress: {
    metric: Enums<"goal_metric">;
    percent: number;
    label: string;
    /** `tasks` only. */
    done?: number;
    total?: number;
    /** The configured field, column or option is gone or in Trash, so tasks are shown (SPC-7 AC2). */
    fallback?: boolean;
    /** Set when the database fell back after a deletion: which metric it was. */
    fell_back_from?: Enums<"goal_metric">;
    /** `tracker` only: where to log. */
    field_label?: string;
    block_id?: string;
    page_id?: string;
  } | null;
  milestones: Milestone[];
  due_counts: { day: string; count: number }[];
};

/** §5.1 deep link to a block on its page. */
export const blockHref = (row: { space_id: string; page_id: string; block_id: string }) =>
  `/s/${row.space_id}/${row.page_id}#block-${row.block_id}`;
