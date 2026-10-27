"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, inputClass } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { afterGoalMessage, defaultSpaceId, firstTodoBlock, LAST_SPACE_KEY, type CaptureBlock, type CaptureSpace } from "@/lib/capture";
import { shortDate } from "@/lib/dates";
import { errorMessage } from "@/lib/db-error";
import { DERIVED_SPACE_ID } from "@/lib/derived";
import { createClient } from "@/lib/supabase/client";
import { todayIn } from "@/lib/today";

/** The spaces a task can go to (live and active, CAP-1) and their To-do blocks. Loaded fresh each time it is needed. */
export function useCaptureTargets(enabled = true) {
  return useQuery({
    queryKey: ["capture-targets"],
    enabled,
    staleTime: 0,
    queryFn: async () => {
      const supabase = createClient();
      const [spaces, blocks] = await Promise.all([
        supabase.from("spaces").select("id, name, kind, mark, deadline").eq("status", "active").is("deleted_at", null).order("kind", { ascending: false }).order("position"),
        supabase.from("blocks").select("id, space_id, title, position, pages!inner(position)").eq("type", "todo").is("deleted_at", null).is("pages.deleted_at", null),
      ]);
      if (spaces.error) throw spaces.error;
      if (blocks.error) throw blocks.error;
      return {
        spaces: spaces.data as CaptureSpace[],
        blocks: blocks.data.map((b) => ({ id: b.id, space_id: b.space_id, title: b.title, position: b.position, page_position: b.pages.position })) as CaptureBlock[],
      };
    },
  });
}

export type NewTask = { title: string; spaceId: string; blockId: string | null; due: string | null };

/** Adds the task to the chosen To-do block; a space without one gets a "To-do list" on its first page. The database applies the deadline rules (CAP-2). */
async function addTask({ title, spaceId, blockId, due }: NewTask) {
  const supabase = createClient();
  let target = blockId;
  let madeBlock = false;
  if (!target) {
    const { data: page, error: pageError } = await supabase.from("pages").select("id").eq("space_id", spaceId).is("deleted_at", null).order("position").limit(1).single();
    if (pageError) throw pageError;
    const { data: last } = await supabase.from("blocks").select("position").eq("page_id", page.id).order("position", { ascending: false }).limit(1);
    const { data: block, error } = await supabase
      .from("blocks")
      .insert({ page_id: page.id, type: "todo", title: "To-do list", span: 6, position: (last?.[0]?.position ?? 0) + 1, space_id: DERIVED_SPACE_ID })
      .select("id")
      .single();
    if (error) throw error;
    target = block.id;
    madeBlock = true;
  }
  const { data: tail } = await supabase.from("tasks").select("position").eq("block_id", target).is("parent_id", null).order("position", { ascending: false }).limit(1);
  const { error } = await supabase.from("tasks").insert({ block_id: target, title, due_date: due, position: (tail?.[0]?.position ?? 0) + 1, space_id: DERIVED_SPACE_ID });
  if (error) {
    // A To-do list made just for this task goes again when the task is refused (a deadline rule), so a retry does not add a second one.
    if (madeBlock) await supabase.from("blocks").delete().eq("id", target);
    throw error;
  }
}

/** The shared "add a task" call: client-side rules first (TODO-1), then the database's, with its message on refusal. */
export function useAddTask() {
  const router = useRouter();
  const toast = useToast();
  return async (task: NewTask, space: CaptureSpace | undefined, today: string): Promise<string | null> => {
    if (!task.title.trim()) return "Give it a title.";
    if (!space) return "Pick a space.";
    if (space.kind === "goal" && !task.due) return "A goal needs a deadline for every task.";
    if (space.kind === "goal" && task.due && space.deadline && task.due > space.deadline) return afterGoalMessage(shortDate(space.deadline, today));
    try {
      await addTask({ ...task, title: task.title.trim() });
    } catch (error) {
      return errorMessage(error);
    }
    toast.success(`Task added to ${space.name}.`);
    try {
      localStorage.setItem(LAST_SPACE_KEY, space.id);
    } catch {
      /* storage can be blocked; the default space is then the first one */
    }
    router.refresh();
    return null;
  };
}

const Ctx = createContext<{ open: () => void } | null>(null);
export const useQuickCapture = () => useContext(Ctx) ?? { open: () => {} };

/** CAP-1: `N` (when not typing) or the "New task" button opens the dialog from any screen. */
export function QuickCaptureProvider({ timezone, children }: { timezone: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      const typing = !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
      if (typing || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Ctx.Provider value={{ open: () => setOpen(true) }}>
      {children}
      {open && <CaptureDialog timezone={timezone} onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  );
}

/** The black pill in the top bar (DESIGN.md "Top bar"). */
export function NewTaskButton() {
  const { open } = useQuickCapture();
  return (
    <Button variant="primary" onClick={open} icon={<Plus size={12} strokeWidth={2} />} aria-keyshortcuts="N">
      New task
    </Button>
  );
}

function CaptureDialog({ timezone, onClose }: { timezone: string; onClose: () => void }) {
  const today = todayIn(timezone);
  const { data } = useCaptureTargets();
  const add = useAddTask();
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [blockChoice, setBlockChoice] = useState<string | null>(null);
  const [due, setDue] = useState(today);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const spaces = data?.spaces ?? [];
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_SPACE_KEY);
  } catch {
    /* storage can be blocked */
  }
  const spaceId = picked ?? defaultSpaceId(spaces, last);
  const space = spaces.find((s) => s.id === spaceId);
  const blocks = (data?.blocks ?? []).filter((b) => b.space_id === spaceId).sort((a, b) => a.page_position - b.page_position || a.position - b.position);
  const blockId = blocks.find((b) => b.id === blockChoice)?.id ?? firstTodoBlock(data?.blocks ?? [], spaceId)?.id ?? null;

  async function submit() {
    setBusy(true);
    const error = await add({ title, spaceId, blockId, due: due || null }, space, today);
    setBusy(false);
    setProblem(error);
    if (!error) onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>New task</DialogTitle>
        <DialogDescription>Goes to the first To-do list of the space you pick, due today unless you change it.</DialogDescription>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field id="cap-title" label="Title">
            <input id="cap-title" autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </Field>
          <div className="grid gap-3 tablet:grid-cols-2">
            <Field id="cap-space" label="Space">
              <Select
                id="cap-space"
                value={spaceId}
                onChange={(next) => {
                  setPicked(next);
                  setBlockChoice(null);
                }}
                options={spaces.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Field>
            <Field id="cap-block" label="To-do list">
              <Select
                id="cap-block"
                value={blockId ?? ""}
                disabled={blocks.length === 0}
                onChange={setBlockChoice}
                options={blocks.length === 0 ? [{ value: "", label: "A new To-do list" }] : blocks.map((b) => ({ value: b.id, label: b.title }))}
              />
            </Field>
          </div>
          <Field id="cap-due" label={space?.kind === "goal" ? "Deadline" : "Deadline (optional)"}>
            <input id="cap-due" type="date" value={due} max={space?.kind === "goal" ? (space.deadline ?? undefined) : undefined} onChange={(e) => setDue(e.target.value)} className={inputClass} />
          </Field>
          {problem && (
            <p role="alert" className="type-body-sm text-signal-ink">
              {problem}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !data} icon={<ArrowRight size={12} strokeWidth={2} />}>
              Add task
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
