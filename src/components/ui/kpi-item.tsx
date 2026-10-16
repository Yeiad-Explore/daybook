import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/** DESIGN.md "KPI item": 32px icon circle + value + caption. tone="dark" on dark aura cards. */
export function KpiItem({
  icon,
  value,
  caption,
  tone = "light",
}: {
  icon: ReactNode;
  value: ReactNode;
  caption: string;
  tone?: "light" | "dark";
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className={cx(
          "grid size-8 shrink-0 place-items-center rounded-pill",
          tone === "light" ? "bg-surface text-ink shadow-card" : "glass-dark",
        )}
      >
        {icon}
      </span>
      <div>
        <p className="type-number-lg">{value}</p>
        <p className={cx("type-caption", tone === "light" ? "text-ink-3-small" : "text-on-dark-fixed")}>{caption}</p>
      </div>
    </div>
  );
}
