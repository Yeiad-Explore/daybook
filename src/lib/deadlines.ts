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

export type TodayData = { today: string; late_count: number; overdue: AgendaRow[]; due_today: AgendaRow[]; next_7: AgendaRow[] };

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
  progress: { metric: "tasks"; done: number; total: number; percent: number; label: string } | null;
  milestones: Milestone[];
  due_counts: { day: string; count: number }[];
};

/** §5.1 deep link to a block on its page. */
export const blockHref = (row: { space_id: string; page_id: string; block_id: string }) =>
  `/s/${row.space_id}/${row.page_id}#block-${row.block_id}`;
