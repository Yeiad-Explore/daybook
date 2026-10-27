"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { useAddTask, useCaptureTargets } from "@/components/capture/capture";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { defaultSpaceId, LAST_SPACE_KEY } from "@/lib/capture";

/** PRD §5.3 item 7: "Add a task for today…" at the bottom of the agenda, with a space picker; the deadline is today. */
export function TodayCapture({ today }: { today: string }) {
  const { data } = useCaptureTargets();
  const add = useAddTask();
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
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

  async function submit() {
    if (busy) return;
    setBusy(true);
    const blocks = (data?.blocks ?? []).filter((b) => b.space_id === spaceId).sort((a, b) => a.page_position - b.page_position || a.position - b.position);
    const error = await add({ title, spaceId, blockId: blocks[0]?.id ?? null, due: today }, space, today);
    setBusy(false);
    setProblem(error);
    if (!error) setTitle("");
  }

  return (
    <form
      noValidate
      aria-label="Add a task for today"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="mt-6 flex flex-col gap-1.5"
    >
      <div className="flex flex-wrap items-center gap-1.5 rounded-pill bg-surface p-1 shadow-card ring-1 ring-inset ring-ink-3 focus-within:ring-ink max-tablet:rounded-md">
        <input aria-label="Task title" placeholder="Add a task for today…" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="type-body min-w-40 flex-1 rounded-pill bg-transparent px-3 py-1.5 placeholder:text-ink-3-small focus-visible:shadow-none focus-visible:outline-none" />
        <DropdownMenu>
          <DropdownMenuTrigger
            type="button"
            aria-label="Space"
            disabled={!data}
            className="type-button inline-flex min-h-9 max-w-44 items-center gap-1 rounded-pill bg-canvas-2 py-1 pr-2 pl-3 text-ink ring-1 ring-inset ring-control-edge outline-none disabled:opacity-50 data-[popup-open]:[&_svg]:rotate-180 pointer-coarse:min-h-11"
          >
            <span className="truncate">{space?.name ?? "Space"}</span>
            <ChevronDown size={14} strokeWidth={1.5} aria-hidden className="shrink-0 text-ink-3-small transition-transform duration-150" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
            {spaces.map((s) => (
              <DropdownMenuItem key={s.id} onClick={() => setPicked(s.id)}>
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {s.id === spaceId && <Check size={14} strokeWidth={1.5} aria-hidden className="ml-auto shrink-0" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="submit" disabled={busy || !data} aria-label="Add task" className="grid size-9 place-items-center rounded-pill bg-surface-dark text-on-dark disabled:opacity-50 pointer-coarse:size-11">
          <Plus size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      {problem && (
        <p role="alert" className="type-caption px-3 text-signal-ink">
          {problem}
        </p>
      )}
    </form>
  );
}
