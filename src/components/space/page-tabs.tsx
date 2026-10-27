"use client";

import { Ellipsis, GripVertical, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useTrash } from "@/components/deadlines/use-trash";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sortable } from "@/components/ui/sortable";
import { useToast } from "@/components/ui/toast";
import { cx } from "@/lib/cx";
import { errorMessage } from "@/lib/db-error";
import { moveItem } from "@/lib/move-item";
import { reorderRequest } from "@/lib/reorder";
import type { PageRow } from "@/lib/space-page";
import { createClient } from "@/lib/supabase/client";
import { useSave } from "@/lib/use-save";
import { useServerState } from "@/lib/use-server-state";
import { useSpace } from "./space-context";

type Pill = { x: number; y: number; w: number; h: number };

const PILL_MS = 500;

function samePill(a: Pill, b: Pill) {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
}

/**
 * PRD §5.4 page tabs as DESIGN.md's pill segmented control: one tab per page. The white pill slides
 * from the page you leave to the page you open. A click switches pages without scrolling or remounting
 * the space header. Drag the grip to reorder (PG-3; "Move left / right" in the menu for keyboards).
 * "+ Page" (PG-1), rename and Trash with Undo (PG-2, PG-6). The last page stays.
 */
export function PageTabs({ pages: serverPages }: { pages: PageRow[] }) {
  const { space, today } = useSpace();
  const router = useRouter();
  // The shell stays mounted while pages change, so the active tab comes from the URL.
  const pageId = usePathname().split("/")[3] ?? "";
  const toast = useToast();
  const save = useSave();
  const { trash, dialog } = useTrash(today);
  const [pages, setPages] = useServerState(serverPages);
  const [adding, setAdding] = useState(false);
  const [pill, setPill] = useState<Pill | null>(null);
  const [slide, setSlide] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const placed = useRef(false);
  const prevPage = useRef(pageId);
  const sliding = useRef(false);
  const settleTimer = useRef(0);
  const moveTicket = useRef(0);

  const measure = useCallback((): Pill | null => {
    const tab = tabRefs.current.get(pageId);
    if (!trackRef.current || !tab) return null;
    // Layout position, so a drag transform does not pull the resting pill off its slot.
    return { x: tab.offsetLeft, y: tab.offsetTop, w: tab.offsetWidth, h: tab.offsetHeight };
  }, [pageId]);

  useLayoutEffect(() => {
    return () => {
      moveTicket.current += 1;
      window.clearTimeout(settleTimer.current);
    };
  }, []);

  useLayoutEffect(() => {
    // The pill's place is measured from the tabs, so it is written here, before paint.
    /* eslint-disable react-hooks/set-state-in-effect -- DOM measurement, not derived state */
    const next = measure();
    if (!next) return;
    const pageChanged = placed.current && prevPage.current !== pageId;
    prevPage.current = pageId;
    placed.current = true;
    if (dragId) {
      sliding.current = false;
      window.clearTimeout(settleTimer.current);
      setSlide(false);
      setPill((current) => (current && samePill(current, next) ? current : next));
      return;
    }
    if (!pageChanged) {
      if (sliding.current) return;
      setSlide(false);
      setPill((current) => (current && samePill(current, next) ? current : next));
      return;
    }
    // Arm the transition while the pill is still on the previous page, then move it.
    // A later refresh of the same page must not cancel this move.
    const ticket = ++moveTicket.current;
    sliding.current = true;
    setSlide(true);
    requestAnimationFrame(() => {
      if (moveTicket.current !== ticket) return;
      setPill(next);
    });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      if (moveTicket.current !== ticket) return;
      sliding.current = false;
      setSlide(false);
    }, reduce ? 0 : PILL_MS + 40);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pageId, pages, dragId, measure]);

  useLayoutEffect(() => {
    const tab = tabRefs.current.get(pageId);
    if (!tab) return;
    const observer = new ResizeObserver(() => {
      if (sliding.current) return;
      const next = measure();
      if (!next) return;
      setPill((current) => (current && samePill(current, next) ? current : next));
    });
    observer.observe(tab);
    return () => observer.disconnect();
  }, [pageId, pages, measure]);

  function move(from: number, to: number) {
    if (to < 0 || to >= pages.length) return;
    const { next, before, after } = moveItem(pages, from, to);
    const previous = pages;
    setPages(next);
    save.mutate({ request: () => reorderRequest("pages", pages[from].id, before, after), rollback: () => setPages(previous) });
  }

  async function addPage() {
    if (adding) return;
    setAdding(true);
    const position = Math.max(0, ...pages.map((p) => p.position)) + 1;
    const { data, error } = await createClient().from("pages").insert({ space_id: space.id, position }).select("id").single();
    setAdding(false);
    if (error) return toast.error(errorMessage(error));
    router.push(`/s/${space.id}/${data.id}?rename=1`, { scroll: false });
  }

  const renameCurrent = () =>
    setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label="Page title"]')?.select(), 60);

  return (
    <nav aria-label="Pages" className="flex max-w-full items-center gap-2 overflow-x-auto">
      <div ref={trackRef} className="relative flex w-fit items-center gap-0.5 rounded-pill bg-canvas-2 p-0.5">
        {pill && (
          <span
            aria-hidden
            className={cx(
              "pointer-events-none absolute rounded-pill bg-surface shadow-card ring-1 ring-inset ring-control-edge",
              slide && "transition-[left,top,width,height] duration-500 ease-[cubic-bezier(0.45,0,0.55,1)]",
              dragId === pageId && "opacity-0",
            )}
            style={{ left: pill.x, top: pill.y, width: pill.w, height: pill.h }}
          />
        )}
        <Sortable
          id={`pages-${space.id}`}
          items={pages}
          strategy="horizontal"
          activation={{ delay: 200, tolerance: 8 }}
          onMove={move}
          onDragActive={setDragId}
          render={(page, drag) => {
            const index = pages.indexOf(page);
            const active = page.id === pageId;
            return (
              <div
                ref={(node) => {
                  drag.ref(node);
                  if (node) tabRefs.current.set(page.id, node);
                  else tabRefs.current.delete(page.id);
                }}
                style={drag.style}
                className={cx(
                  "group/tab relative z-[1] flex items-center rounded-pill",
                  active && !pill && "bg-surface shadow-card ring-1 ring-inset ring-control-edge",
                  drag.dragging && "z-10 bg-surface shadow-card ring-1 ring-inset ring-control-edge",
                )}
              >
                <button
                  type="button"
                  aria-label={`Reorder ${page.title}`}
                  {...drag.handle}
                  className="grid h-5 w-0 shrink-0 cursor-grab place-items-center overflow-hidden rounded-pill opacity-0 transition-[width,opacity] duration-150 group-hover/tab:w-5 group-hover/tab:opacity-100 focus-visible:w-5 focus-visible:opacity-100 pointer-coarse:hidden"
                >
                  <GripVertical size={12} strokeWidth={1.5} aria-hidden />
                </button>
                <Link
                  href={`/s/${space.id}/${page.id}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "type-button flex min-h-8 items-center rounded-pill px-3 text-[12px] whitespace-nowrap transition-colors duration-500 pointer-coarse:min-h-11",
                    active ? "text-ink" : "text-ink-3-small hover:text-ink",
                  )}
                >
                  {page.title}
                </Link>
                {active && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`${page.title}: more`}
                      className="mr-1 grid size-6 place-items-center rounded-pill text-ink-2 opacity-100 transition-opacity delay-300 duration-200 starting:opacity-0 hover:bg-canvas-2 motion-reduce:transition-none motion-reduce:delay-0 pointer-coarse:size-11"
                    >
                      <Ellipsis size={14} strokeWidth={1.5} aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={renameCurrent}>Rename</DropdownMenuItem>
                      <DropdownMenuItem disabled={index === 0} onClick={() => move(index, index - 1)}>Move left</DropdownMenuItem>
                      <DropdownMenuItem disabled={index === pages.length - 1} onClick={() => move(index, index + 1)}>Move right</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        tone="danger"
                        onClick={() =>
                          trash({
                            table: "pages",
                            id: page.id,
                            name: page.title,
                            onTrashed: () => router.push(`/s/${space.id}/${pages[index === 0 ? 1 : index - 1]?.id ?? ""}`, { scroll: false }),
                            onUndone: () => router.push(`/s/${space.id}/${page.id}`, { scroll: false }),
                          })
                        }
                      >
                        Move to Trash
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          }}
        />
      </div>
      <button
        type="button"
        disabled={adding}
        onClick={() => void addPage()}
        className="type-button flex min-h-9 shrink-0 items-center gap-1 rounded-pill px-3 text-[12px] text-ink-2 hover:bg-canvas-2 pointer-coarse:min-h-11"
      >
        <Plus size={14} strokeWidth={1.5} aria-hidden /> Page
      </button>
      <Link
        href={`/s/${space.id}/settings`}
        className="type-button ml-auto flex min-h-9 shrink-0 items-center gap-1.5 rounded-pill px-3 text-[12px] text-ink-2 hover:bg-canvas-2 pointer-coarse:min-h-11"
      >
        <Settings size={14} strokeWidth={1.5} aria-hidden /> Space settings
      </Link>
      {dialog}
    </nav>
  );
}
