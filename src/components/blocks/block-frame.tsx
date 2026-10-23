"use client";

import { ChevronDown, Ellipsis, GripVertical } from "lucide-react";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tag } from "@/components/ui/tag";
import type { DragHandle } from "@/components/ui/sortable";
import { cx } from "@/lib/cx";
import type { Block } from "@/lib/space-page";
import { BLOCK_TYPES, SPAN_CLASS, SPANS } from "./block-types";

export type BlockActions = {
  rename: (title: string) => void;
  setCollapsed: (collapsed: boolean) => void;
  setSpan: (span: number) => void;
  move: (direction: -1 | 1) => void;
  trash: () => void;
};

/**
 * DESIGN.md "Block chrome": white panel, 28px type icon circle, editable title, type tag, the block's
 * own controls and a "⋯" menu (rename, collapse, width S/M/L/Full, Trash); a drag handle at the
 * top-left on hover. Alt+↑/↓ moves the block (BLK-3). Reachable at #block-:id (BLK-8 AC1).
 */
export function BlockFrame({
  block,
  actions,
  drag: { ref: dragRef, style, handle, dragging },
  controls,
  children,
}: {
  block: Block;
  actions: BlockActions;
  drag: DragHandle;
  controls?: ReactNode;
  children: ReactNode;
}) {
  const type = BLOCK_TYPES[block.type];
  const Icon = type.icon;
  const title = useRef<HTMLInputElement>(null);

  function onKeyDown(e: KeyboardEvent) {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    actions.move(e.key === "ArrowUp" ? -1 : 1);
  }

  function commitTitle(input: HTMLInputElement) {
    const next = input.value.trim() || type.name;
    input.value = next;
    if (next !== block.title) actions.rename(next);
  }

  return (
    <section
      ref={dragRef}
      id={`block-${block.id}`}
      aria-label={block.title}
      onKeyDown={onKeyDown}
      style={style}
      className={cx(
        "group/block relative col-span-12 min-w-0 scroll-mt-24 rounded-lg bg-surface p-5 shadow-card tablet:p-6",
        SPAN_CLASS[block.span],
        dragging && "shadow-float",
      )}
    >
      <button
        type="button"
        aria-label={`Move ${block.title} (drag, or Alt+arrow keys)`}
        {...handle}
        className="absolute top-5 -left-3 grid h-8 w-6 cursor-grab place-items-center rounded-sm bg-surface text-ink-3-small opacity-0 shadow-card group-hover/block:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden"
      >
        <GripVertical size={14} strokeWidth={1.5} aria-hidden />
      </button>

      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-pill bg-canvas-2 text-ink">
          <Icon size={14} strokeWidth={1.5} />
        </span>
        <input
          ref={title}
          aria-label="Block title"
          defaultValue={block.title}
          key={block.title}
          maxLength={80}
          onBlur={(e) => commitTitle(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.currentTarget.value = block.title;
              e.currentTarget.blur();
            }
          }}
          className="type-heading min-w-0 flex-[1_1_10rem] rounded-sm bg-transparent px-1 py-1 text-ink hover:bg-canvas"
        />
        <Tag>{type.name}</Tag>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {controls}
          <button
            type="button"
            aria-expanded={!block.collapsed}
            aria-label={block.collapsed ? `Expand ${block.title}` : `Collapse ${block.title}`}
            onClick={() => actions.setCollapsed(!block.collapsed)}
            className="grid size-8 place-items-center rounded-pill text-ink-2 hover:bg-canvas-2 pointer-coarse:size-11"
          >
            <ChevronDown size={16} strokeWidth={1.5} aria-hidden className={cx("transition-transform", block.collapsed && "-rotate-90")} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`${block.title}: more`}
              className="grid size-8 place-items-center rounded-pill text-ink-2 hover:bg-canvas-2 pointer-coarse:size-11"
            >
              <Ellipsis size={16} strokeWidth={1.5} aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setTimeout(() => title.current?.select())}>Rename</DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.setCollapsed(!block.collapsed)}>{block.collapsed ? "Expand" : "Collapse"}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <p className="type-eyebrow px-2.5 pt-1 pb-1.5 text-ink-3-small">Width</p>
              {SPANS.map((s) => (
                <DropdownMenuItem key={s.value} onClick={() => actions.setSpan(Number(s.value))}>
                  <span className="flex-1">{s.label}</span>
                  {block.span === Number(s.value) && <span className="type-caption text-ink-3-small">current</span>}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem tone="danger" onClick={actions.trash}>
                Move to Trash
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {!block.collapsed && <div className="mt-4">{children}</div>}
    </section>
  );
}
