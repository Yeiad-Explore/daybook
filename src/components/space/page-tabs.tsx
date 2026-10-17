"use client";

import { Ellipsis, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

/**
 * PRD §5.4 page tabs as DESIGN.md's pill segmented control: one tab per page, drag to reorder (PG-3;
 * "Move left / right" in the menu for keyboards), "+ Page" (PG-1), rename and Trash with Undo (PG-2, PG-6).
 */
export function PageTabs({ pages: serverPages }: { pages: PageRow[] }) {
  const { space, pageId, today } = useSpace();
  const router = useRouter();
  const toast = useToast();
  const save = useSave();
  const { trash, dialog } = useTrash(today);
  const [pages, setPages] = useServerState(serverPages);

  function move(from: number, to: number) {
    if (to < 0 || to >= pages.length) return;
    const { next, before, after } = moveItem(pages, from, to);
    const previous = pages;
    setPages(next);
    save.mutate({ request: () => reorderRequest("pages", pages[from].id, before, after), rollback: () => setPages(previous) });
  }

  async function addPage() {
    const position = Math.max(0, ...pages.map((p) => p.position)) + 1;
    const { data, error } = await createClient().from("pages").insert({ space_id: space.id, position }).select("id").single();
    if (error) return toast.error(errorMessage(error));
    router.push(`/s/${space.id}/${data.id}?rename=1`);
  }

  const renameCurrent = () =>
    setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label="Page title"]')?.select(), 60);

  return (
    <nav aria-label="Pages" className="flex max-w-full items-center gap-2 overflow-x-auto">
      <div className="flex w-fit items-center gap-0.5 rounded-pill bg-canvas-2 p-0.5">
        <Sortable
          id={`pages-${space.id}`}
          items={pages}
          strategy="horizontal"
          onMove={move}
          render={(page, drag) => {
            const index = pages.indexOf(page);
            const active = page.id === pageId;
            return (
              <div ref={drag.ref} style={drag.style} className={cx("flex items-center rounded-pill", active && "bg-surface shadow-card ring-1 ring-inset ring-control-edge")}>
                <Link
                  href={`/s/${space.id}/${page.id}`}
                  aria-current={active ? "page" : undefined}
                  {...drag.listeners}
                  className={cx(
                    "type-button flex min-h-8 items-center rounded-pill px-3 text-[12px] whitespace-nowrap pointer-coarse:min-h-11",
                    active ? "text-ink" : "text-ink-3-small hover:text-ink",
                  )}
                >
                  {page.title}
                </Link>
                {active && (
                  <DropdownMenu>
                    <DropdownMenuTrigger aria-label={`${page.title}: more`} className="mr-1 grid size-6 place-items-center rounded-pill text-ink-2 hover:bg-canvas-2 pointer-coarse:size-11">
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
                            onTrashed: () => router.push(`/s/${space.id}/${pages[index === 0 ? 1 : index - 1]?.id ?? ""}`),
                            onUndone: () => router.push(`/s/${space.id}/${page.id}`),
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
        onClick={() => void addPage()}
        className="type-button flex min-h-9 shrink-0 items-center gap-1 rounded-pill px-3 text-[12px] text-ink-2 hover:bg-canvas-2 pointer-coarse:min-h-11"
      >
        <Plus size={14} strokeWidth={1.5} aria-hidden /> Page
      </button>
      {dialog}
    </nav>
  );
}
