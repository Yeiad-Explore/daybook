import { Activity, CalendarClock, ListTodo, NotebookText, Repeat, Route, Table2, type LucideIcon } from "lucide-react";
import type { Enums } from "@/lib/database.types";

export type BlockType = Enums<"block_type">;

/** BLK-1 menu (PRD §4.1) with DESIGN.md "Space view anatomy" default spans. */
export const BLOCK_TYPES: Record<BlockType, { name: string; about: string; span: 4 | 6 | 8 | 12; icon: LucideIcon; phase2?: boolean }> = {
  todo: { name: "To-do list", about: "Tasks with strict deadlines.", span: 6, icon: ListTodo },
  roadmap: { name: "Roadmap", about: "Big steps broken into smaller ones.", span: 12, icon: Route },
  notes: { name: "Notes", about: "Free writing.", span: 8, icon: NotebookText },
  tracker: { name: "Tracker", about: "Numbers logged daily, with a trend.", span: 12, icon: Activity, phase2: true },
  table: { name: "Table", about: "Records: products, clients, meals, money.", span: 12, icon: Table2, phase2: true },
  timeblock: { name: "Time block", about: "Booked time, for Google Calendar.", span: 6, icon: CalendarClock, phase2: true },
  routine: { name: "Routine", about: "A daily checklist with a streak.", span: 4, icon: Repeat, phase2: true },
};

export const SPANS = [
  { value: "4", label: "S" },
  { value: "6", label: "M" },
  { value: "8", label: "L" },
  { value: "12", label: "Full" },
] as const;

// Static class names so Tailwind sees them. Below 900px every block is full width (BLK-8).
export const SPAN_CLASS: Record<number, string> = {
  4: "laptop:col-span-4",
  6: "laptop:col-span-6",
  8: "laptop:col-span-8",
  12: "laptop:col-span-12",
};
