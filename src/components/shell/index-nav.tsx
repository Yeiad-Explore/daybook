"use client";

import { CalendarCheck, Plus, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import type { Enums } from "@/lib/database.types";

export type IndexSpace = {
  id: string;
  kind: Enums<"space_kind">;
  name: string;
  mark: Enums<"mark_color">;
  daysLeft: number | null;
};

const icon = { size: 16, strokeWidth: 1.5, "aria-hidden": true } as const;

/**
 * DESIGN.md "Index" (PRD §5.2): Today, Goals (with days left), Life areas, Review, Settings and
 * "+ New space". White text on dark glass (theme-fixed). Hover: white 8% pill; active: white 14% + 500.
 */
export function IndexNav({
  name,
  spaces,
  archivedCount,
  onNavigate,
}: {
  name: string;
  spaces: IndexSpace[];
  archivedCount: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const goals = spaces.filter((s) => s.kind === "goal");
  const areas = spaces.filter((s) => s.kind === "area");

  const item = (href: string, label: ReactNode, opts: { exact?: boolean; leading?: ReactNode; trailing?: ReactNode } = {}) => {
    const active = opts.exact === false ? pathname.startsWith(href) : pathname === href;
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cx(
          "type-body-sm flex min-h-9 items-center gap-2.5 rounded-pill px-3 pointer-coarse:min-h-11",
          active ? "bg-on-dark-fixed/14 font-medium" : "hover:bg-on-dark-fixed/8",
        )}
      >
        {opts.leading}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {opts.trailing}
      </Link>
    );
  };

  const group = (title: string, list: IndexSpace[], empty: string) => (
    <section aria-label={title} className="flex flex-col gap-0.5">
      <h2 className="type-eyebrow px-3 pb-1">{title}</h2>
      {list.length === 0 && <p className="type-body-sm px-3">{empty}</p>}
      {list.map((s) =>
        item(`/s/${s.id}`, s.name, {
          exact: false,
          leading: <span aria-hidden data-mark={s.mark} className="size-2.5 shrink-0 rounded-pill bg-aura-light" />, // light stop: mid is lost on dark glass
          trailing:
            s.daysLeft === null ? undefined : (
              <span className="type-number shrink-0">
                {s.daysLeft >= 0 ? s.daysLeft : `${-s.daysLeft} past`}
                <span className="sr-only">{s.daysLeft >= 0 ? " days left" : " days past deadline"}</span>
              </span>
            ),
        }),
      )}
    </section>
  );

  return (
    <nav aria-label="Index" className="glass glass-dark flex h-full flex-col gap-6 overflow-y-auto rounded-lg p-3">
      <div className="flex items-center gap-2.5 px-1 pt-1">
        <span aria-hidden className="type-heading grid size-8 place-items-center rounded-pill bg-on-dark-fixed/14">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="type-body-sm truncate font-medium">{name}</span>
      </div>

      <div className="flex flex-col gap-0.5">{item("/today", "Today", { leading: <CalendarCheck {...icon} /> })}</div>

      {group("Goals", goals, "No goals yet.")}
      {group("Life areas", areas, "No life areas yet.")}
      {archivedCount > 0 && <p className="type-caption px-3">Archived ({archivedCount})</p>}

      <div className="mt-auto flex flex-col gap-0.5">
        {item("/review", "Review", { exact: false, leading: <Sparkles {...icon} /> })}
        {item("/settings", "Settings", { exact: false, leading: <Settings {...icon} /> })}
        <Link
          href="/new"
          onClick={onNavigate}
          className="type-button mt-2 flex min-h-9 items-center justify-center gap-1.5 rounded-pill bg-on-dark-fixed/14 hover:bg-on-dark-fixed/20 pointer-coarse:min-h-11"
        >
          <Plus {...icon} /> New space
        </Link>
      </div>
    </nav>
  );
}
