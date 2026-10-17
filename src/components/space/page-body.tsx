"use client";

import type { JSONContent } from "@tiptap/react";
import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BLOCK_TYPES, type BlockType } from "@/components/blocks/block-types";
import type { BlockActions } from "@/components/blocks/block-frame";
import { NotesBlock } from "@/components/blocks/notes-block";
import { RoadmapBlock } from "@/components/blocks/roadmap-block";
import { RoutineBlock } from "@/components/blocks/routine-block";
import { TimeBlock } from "@/components/blocks/time-block";
import { TableBlock } from "@/components/blocks/table-block";
import { TodoBlock } from "@/components/blocks/todo-block";
import { TrackerBlock } from "@/components/blocks/tracker-block";
import { useTrash } from "@/components/deadlines/use-trash";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sortable, type DragHandle } from "@/components/ui/sortable";
import type { Json, TablesUpdate } from "@/lib/database.types";
import { moveItem } from "@/lib/move-item";
import { reorderRequest } from "@/lib/reorder";
import type { Block, SpacePageData } from "@/lib/space-page";
import { DERIVED_SPACE_ID } from "@/lib/derived";
import { createClient } from "@/lib/supabase/client";
import { useSave } from "@/lib/use-save";
import { useServerState } from "@/lib/use-server-state";
import { useSpace } from "./space-context";

const NONE: never[] = [];

/**
 * PRD §5.4 page body: the editable page title (PG-2), the blocks on a 12-column grid (BLK-8), then
 * "+ Add a block" (BLK-1). "/" on an empty page, or arriving from a new space (SPC-1 AC2), opens the
 * block menu. Opening a page records it as the space's last opened page (PG AC).
 */
export function PageBody({ data, lastPage }: { data: SpacePageData; lastPage: string | undefined }) {
  const { space, today } = useSpace();
  const router = useRouter();
  const params = useSearchParams();
  const save = useSave();
  const { trash, dialog } = useTrash(today);
  const [blocks, setBlocks] = useServerState(data.blocks);
  const [menuOpen, setMenuOpen] = useState(params.get("add") === "block");
  // Stable per-block arrays: they change only when the server data does, so a re-render (a toast,
  // a menu) never resets a block's optimistic state.
  const tasksByBlock = useMemo(() => Map.groupBy(data.tasks, (t) => t.block_id), [data.tasks]);
  const fieldsByBlock = useMemo(() => Map.groupBy(data.trackerFields, (f) => f.block_id), [data.trackerFields]);
  const columnsByBlock = useMemo(() => Map.groupBy(data.columns, (c) => c.block_id), [data.columns]);
  const rowsByBlock = useMemo(() => Map.groupBy(data.rows, (r) => r.block_id), [data.rows]);
  const stepsByBlock = useMemo(() => Map.groupBy(data.steps, (s) => s.block_id), [data.steps]);
  const checkedByBlock = useMemo(() => {
    const blockOf = new Map(data.steps.map((s) => [s.id, s.block_id]));
    return Map.groupBy(data.checkedToday.filter((id) => blockOf.has(id)), (id) => blockOf.get(id)!);
  }, [data.steps, data.checkedToday]);
  const slotsByBlock = useMemo(() => Map.groupBy(data.slots, (s) => s.block_id), [data.slots]);

  useEffect(() => {
    // Builders run only when awaited; a failure here just means the space opens on its first page.
    if (lastPage !== data.page.id) void createClient().rpc("remember_page", { p_space_id: space.id, p_page_id: data.page.id }).then();
  }, [data.page.id, lastPage, space.id]);

  useEffect(() => {
    if (blocks.length > 0) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setMenuOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blocks.length]);

  function patch(id: string, fields: TablesUpdate<"blocks">) {
    const previous = blocks;
    setBlocks(blocks.map((b) => (b.id === id ? ({ ...b, ...fields } as Block) : b)));
    save.mutate({ request: () => createClient().from("blocks").update(fields).eq("id", id), rollback: () => setBlocks(previous) });
  }

  function reorder(from: number, to: number) {
    if (to < 0 || to >= blocks.length) return;
    const { next, before, after } = moveItem(blocks, from, to);
    const previous = blocks;
    setBlocks(next);
    save.mutate({ request: () => reorderRequest("blocks", blocks[from].id, before, after), rollback: () => setBlocks(previous) });
  }

  function addBlock(type: BlockType) {
    const t = BLOCK_TYPES[type];
    const position = Math.max(0, ...blocks.map((b) => b.position)) + 1;
    // A Notes block gets its notes row on the first save (NotesBlock upserts it).
    save.mutate(
      { request: () => createClient().from("blocks").insert({ page_id: data.page.id, type, title: t.name, span: t.span, position, space_id: DERIVED_SPACE_ID }) },
      { onSuccess: () => params.get("add") && router.replace(`/s/${space.id}/${data.page.id}`, { scroll: false }) },
    );
  }

  const actions = (block: Block, index: number): BlockActions => ({
    rename: (title) => patch(block.id, { title }),
    setCollapsed: (collapsed) => patch(block.id, { collapsed }),
    setSpan: (span) => patch(block.id, { span }),
    move: (direction) => reorder(index, index + direction),
    trash: () => trash({ table: "blocks", id: block.id, name: block.title, onTrashed: () => setBlocks((all) => all.filter((b) => b.id !== block.id)),
      onUndone: () => setBlocks((all) => [...all, block].sort((a, b) => a.position - b.position)),
    }),
  });

  const render = (block: Block, drag: DragHandle) => {
    const index = blocks.indexOf(block);
    const common = { block, actions: actions(block, index), drag };
    const setConfig = (config: object) => patch(block.id, { config: config as { [key: string]: Json } });
    const tasks = tasksByBlock.get(block.id) ?? NONE;
    switch (block.type) {
      case "todo":
        return <TodoBlock {...common} tasks={tasks} setConfig={setConfig} />;
      case "roadmap":
        return <RoadmapBlock {...common} tasks={tasks} setConfig={setConfig} />;
      case "notes":
        return <NotesBlock {...common} body={(data.notes.find((n) => n.block_id === block.id)?.body ?? null) as JSONContent | null} />;
      case "routine": {
        const steps = stepsByBlock.get(block.id) ?? NONE;
        return <RoutineBlock {...common} setConfig={setConfig} steps={steps} checkedIds={checkedByBlock.get(block.id) ?? NONE} streak={data.streaks[block.id]} />;
      }
      case "table":
        return <TableBlock {...common} setConfig={setConfig} columns={columnsByBlock.get(block.id) ?? NONE} rows={rowsByBlock.get(block.id) ?? NONE} />;
      case "tracker":
        return (
          <TrackerBlock {...common} setConfig={setConfig} fields={fieldsByBlock.get(block.id) ?? NONE} series={data.series} />
        );
      case "timeblock":
        return <TimeBlock {...common} setConfig={setConfig} slots={slotsByBlock.get(block.id) ?? NONE} />;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageTitle key={data.page.id} id={data.page.id} title={data.page.title} autoFocus={params.get("rename") === "1"} />

      {blocks.length === 0 && (
        <p className="type-body text-ink-2">
          This page is empty. Add a block, or press <kbd className="type-number rounded-xs bg-canvas-2 px-1.5 py-0.5">/</kbd>.
        </p>
      )}
      <div className="grid grid-cols-12 gap-4 laptop:gap-5">
        <Sortable id={`blocks-${data.page.id}`} items={blocks} strategy="grid" onMove={reorder} render={render} />
      </div>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger className="type-button inline-flex min-h-11 w-fit items-center gap-2 rounded-pill bg-canvas-2 px-4 text-ink ring-1 ring-inset ring-control-edge hover:bg-hairline">
          <Plus size={16} strokeWidth={1.5} aria-hidden /> Add a block
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-80">
          {(Object.keys(BLOCK_TYPES) as BlockType[]).map((type) => {
            const t = BLOCK_TYPES[type];
            const Icon = t.icon;
            return (
              <DropdownMenuItem key={type} onClick={() => addBlock(type)} className="items-start py-2">
                <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-pill bg-canvas-2">
                  <Icon size={14} strokeWidth={1.5} />
                </span>
                <span className="flex flex-col">
                  <span className="font-medium">{t.name}</span>
                  <span className="type-caption text-ink-2">{t.about}</span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog}
    </div>
  );
}

/** PG-1/PG-2: rename inline; Enter or leaving the field saves; an empty name becomes "Untitled page". */
function PageTitle({ id, title, autoFocus }: { id: string; title: string; autoFocus: boolean }) {
  const save = useSave();
  return (
    <input
      aria-label="Page title"
      defaultValue={title}
      autoFocus={autoFocus}
      onFocus={(e) => autoFocus && e.currentTarget.select()}
      maxLength={80}
      onBlur={(e) => {
        const next = e.currentTarget.value.trim() || "Untitled page";
        e.currentTarget.value = next;
        if (next !== title) save.mutate({ request: () => createClient().from("pages").update({ title: next }).eq("id", id) });
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="type-title -mx-2 w-full max-w-document rounded-sm bg-transparent px-2 py-1 text-ink hover:bg-surface"
    />
  );
}
