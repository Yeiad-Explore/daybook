"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";

const TABS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/calendar", label: "Google Calendar" },
  { href: "/settings/data", label: "Data" },
] as const;

// Segmented-control look (DESIGN.md) for navigation links.
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="inline-flex w-fit flex-wrap gap-0.5 rounded-pill bg-canvas-2 p-0.5">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "type-button rounded-pill px-3 py-1.5 pointer-coarse:min-h-11 pointer-coarse:py-3",
              active ? "bg-surface text-ink shadow-card ring-1 ring-inset ring-control-edge" : "text-ink-3-small hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
