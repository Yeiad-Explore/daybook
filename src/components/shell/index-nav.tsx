"use client";

import { CalendarCheck, GripVertical, History, NotebookPen, Plus, Settings, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useQuickCapture } from "@/components/capture/capture";
import { useTrash } from "@/components/deadlines/use-trash";
import { Sortable } from "@/components/ui/sortable";
import { cx } from "@/lib/cx";
import type { Enums } from "@/lib/database.types";
import { moveItem } from "@/lib/move-item";
import { reorderRequest } from "@/lib/reorder";
import { useSave } from "@/lib/use-save";
import { useServerState } from "@/lib/use-server-state";

export type IndexSpace = {
  id: string;
  kind: Enums<"space_kind">;
  status: Enums<"space_status">;
  name: string;
  mark: Enums<"mark_color">;
  daysLeft: number | null;
};

const icon = { size: 16, strokeWidth: 1.5, "aria-hidden": true } as const;

/**
 * DESIGN.md "Index" (PRD §5.2): the name opens Profile, Today with its count badge, Goals (days left), Life areas, closed and
 * archived spaces folded away (SPC-4), Review, History, Settings and "+ New space". Spaces reorder by
 * drag or keyboard within their group (SPC-3). White text on dark glass (theme-fixed).
 */
export function IndexNav({
  name,
  spaces: serverSpaces,
  lateCount,
  dueTodayCount,
  today,
  onNavigate,
}: {
  name: string;
  spaces: IndexSpace[];
  lateCount: number;
  dueTodayCount: number;
  today: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { trash, dialog: trashDialog } = useTrash(today);
  const capture = useQuickCapture();
  const [spaces, setSpaces] = useServerState(serverSpaces);
  const save = useSave();

  const item = (href: string, label: ReactNode, opts: { exact?: boolean; leading?: ReactNode; trailing?: ReactNode; prefetch?: false } = {}) => {
    const active = opts.exact === false ? pathname.startsWith(href) : pathname === href;
    return (
      <Link
        key={href}
        href={href}
        prefetch={opts.prefetch}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cx(
          "type-body-sm flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-pill px-3 pointer-coarse:min-h-11",
          active ? "bg-on-dark-fixed/14 font-medium" : "hover:bg-on-dark-fixed/8",
        )}
      >
        {opts.leading}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {opts.trailing}
      </Link>
    );
  };

  const spaceLink = (s: IndexSpace) =>
    item(`/s/${s.id}`, s.name, {
      exact: false,
      prefetch: false, // /s/:id redirects to the last opened page, which a prefetch would freeze
      leading: <span aria-hidden data-mark={s.mark} className="size-2.5 shrink-0 rounded-pill bg-aura-light" />, // light stop: mid is lost on dark glass
      trailing:
        s.daysLeft === null || s.status !== "active" ? undefined : (
          <span className="type-number shrink-0">
            {s.daysLeft >= 0 ? s.daysLeft : `${-s.daysLeft} past`}
            <span className="sr-only">{s.daysLeft >= 0 ? " days left" : " days past deadline"}</span>
          </span>
        ),
    });

  function move(group: IndexSpace[], from: number, to: number) {
    const { next, before, after } = moveItem(group, from, to);
    const previous = spaces;
    const order = new Map(next.map((s, i) => [s.id, i]));
    setSpaces([...spaces].sort((a, b) => (order.get(a.id) ?? -1) - (order.get(b.id) ?? -1)));
    save.mutate({ request: () => reorderRequest("spaces", group[from].id, before, after), rollback: () => setSpaces(previous) });
  }

  const group = (title: string, kind: Enums<"space_kind">, empty: string) => {
    const list = spaces.filter((s) => s.kind === kind && s.status === "active");
    return (
      <section aria-label={title} className="flex flex-col gap-0.5">
        <h2 className="type-eyebrow px-3 pb-1">{title}</h2>
        {list.length === 0 && <p className="type-body-sm px-3">{empty}</p>}
        <Sortable
          id={`index-${kind}`}
          items={list}
          onMove={(from, to) => move(list, from, to)}
          render={(s, drag) => (
            <div ref={drag.ref} style={drag.style} className={cx("group/space flex items-center", drag.dragging && "opacity-80")}>
              {spaceLink(s)}
              <button
                type="button"
                aria-label={`Reorder ${s.name}`}
                {...drag.handle}
                className="grid size-7 shrink-0 cursor-grab place-items-center rounded-pill opacity-0 group-hover/space:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden"
              >
                <GripVertical size={14} strokeWidth={1.5} aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`Move ${s.name} to Trash`}
                onClick={() =>
                  trash({ table: "spaces", id: s.id, name: s.name, onTrashed: () => pathname.startsWith(`/s/${s.id}`) && router.push("/today") })
                }
                className="grid size-7 shrink-0 place-items-center rounded-pill opacity-0 group-hover/space:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
              >
                <Trash2 size={14} strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          )}
        />
      </section>
    );
  };

  const folded = (label: string, list: IndexSpace[]) =>
    list.length > 0 && (
      <details className="group/fold">
        <summary className="type-caption flex min-h-8 cursor-pointer items-center rounded-pill px-3 hover:bg-on-dark-fixed/8 pointer-coarse:min-h-11">
          {label} ({list.length})
        </summary>
        <div className="flex flex-col gap-0.5 pt-1">{list.map(spaceLink)}</div>
      </details>
    );

  const badge =
    lateCount > 0 ? (
      <span className="type-number grid h-4.5 min-w-4.5 place-items-center rounded-pill bg-signal px-1.5 text-[11px] text-on-dark-fixed">
        {lateCount}
        <span className="sr-only"> late</span>
      </span>
    ) : dueTodayCount > 0 ? (
      <span className="type-number grid h-4.5 min-w-4.5 place-items-center rounded-pill bg-on-dark-fixed/14 px-1.5 text-[11px]">
        {dueTodayCount}
        <span className="sr-only"> due today</span>
      </span>
    ) : undefined;

  return (
    <nav aria-label="Index" className="glass glass-dark flex h-full min-h-0 flex-col gap-6 overflow-hidden rounded-lg p-3">
      <div className="flex shrink-0 flex-col gap-6">
        <Link
          href="/settings"
          onClick={onNavigate}
          aria-current={pathname === "/settings" ? "page" : undefined}
          className={cx(
            "flex min-h-9 min-w-0 items-center gap-2.5 rounded-pill px-1 pt-1 hover:bg-on-dark-fixed/8 pointer-coarse:min-h-11",
            pathname === "/settings" && "bg-on-dark-fixed/14",
          )}
        >
          <span aria-hidden className="type-heading grid size-8 place-items-center rounded-pill bg-on-dark-fixed/14">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className="type-body-sm truncate font-medium">{name}</span>
          <span className="sr-only">Profile</span>
        </Link>

        <div className="flex flex-col gap-0.5">
          <div className="flex">{item("/today", "Today", { leading: <CalendarCheck {...icon} />, trailing: badge })}</div>
          <button
            type="button"
            aria-keyshortcuts="N"
            onClick={() => {
              onNavigate?.();
              capture.open();
            }}
            className="type-body-sm flex min-h-9 items-center gap-2.5 rounded-pill px-3 text-left hover:bg-on-dark-fixed/8 pointer-coarse:min-h-11"
          >
            <Plus {...icon} />
            <span className="flex-1">New task</span>
            <kbd className="type-caption rounded-xs bg-on-dark-fixed/14 px-1.5">N</kbd>
          </button>
        </div>
      </div>

      <div className="index-scroll flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-1">
          {group("Goals", "goal", "No goals yet.")}
          {folded("Achieved", spaces.filter((s) => s.status === "achieved"))}
          {folded("Missed", spaces.filter((s) => s.status === "missed"))}
        </div>
        {group("Life areas", "area", "No life areas yet.")}
        {folded("Archived", spaces.filter((s) => s.status === "archived"))}
      </div>

      <div className="flex shrink-0 flex-col gap-0.5">
        <div className="flex">{item("/review", "Review", { exact: false, leading: <NotebookPen {...icon} /> })}</div>
        <div className="flex">{item("/history", "Deadline history", { leading: <History {...icon} /> })}</div>
        <div className="flex">{item("/settings", "Settings", { exact: false, leading: <Settings {...icon} /> })}</div>
        <Link
          href="/new"
          onClick={onNavigate}
          className="type-button mt-2 flex min-h-9 items-center justify-center gap-1.5 rounded-pill bg-on-dark-fixed/14 hover:bg-on-dark-fixed/20 pointer-coarse:min-h-11"
        >
          <Plus {...icon} /> New space
        </Link>
      </div>
      {trashDialog}
    </nav>
  );
}
