import { z } from "zod";
import { Constants, type TablesInsert } from "@/lib/database.types";

// SPC-1 form rules. They mirror the database (spaces check constraints, space guards) only to give
// friendly messages early; the database still decides (CLAUDE.md working rules).
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

export const newSpace = z
  .object({
    kind: z.enum(Constants.public.Enums.space_kind),
    name: z.string().trim().min(1, "Give it a name.").max(60, "Keep the name to 60 characters."),
    mark: z.enum(Constants.public.Enums.mark_color),
    end_goal: z.string().trim().max(200, "Keep the end goal to 200 characters."),
    description: z.string().trim().max(200, "Keep the description to 200 characters."),
    start_date: z.string(),
    deadline: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.kind !== "goal") return;
    if (!v.end_goal) ctx.addIssue({ code: "custom", path: ["end_goal"], message: "Say what done looks like, in one sentence." });
    if (!date.safeParse(v.start_date).success) ctx.addIssue({ code: "custom", path: ["start_date"], message: "Pick a start date." });
    if (!date.safeParse(v.deadline).success) ctx.addIssue({ code: "custom", path: ["deadline"], message: "A goal needs a deadline." });
    else if (v.deadline < v.start_date) ctx.addIssue({ code: "custom", path: ["deadline"], message: "The deadline can't be before the start date." });
  });

export type NewSpace = z.infer<typeof newSpace>;

/** The row to insert: goals carry their dates and end goal, life areas their description. */
export function spaceRow(v: NewSpace, position: number): TablesInsert<"spaces"> {
  return v.kind === "goal"
    ? { kind: v.kind, name: v.name, mark: v.mark, end_goal: v.end_goal, start_date: v.start_date, deadline: v.deadline, position }
    : { kind: v.kind, name: v.name, mark: v.mark, description: v.description || null, position };
}
