import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";
import type { Enums } from "@/lib/database.types";
import { GlassPanel } from "./glass-panel";

type MarkColor = Enums<"mark_color">;

/**
 * DESIGN.md "Aura card" (signature), three variants, radius xl, 24px padding. At most three visible
 * at once and at most one dark aura card per row. Text rules (DESIGN.md v2.2): small text on light
 * glass is ink; on dark surfaces it is full white (theme-fixed, so the card is the same in both themes).
 * - glass: aura with a light glass panel inset 16px.
 * - dark:  aura in the top third, fading to near-black; white text.
 * - sand:  warm aura with a dark glass panel.
 */
export function AuraCard({
  variant,
  mark = variant === "sand" ? "ochre" : variant === "dark" ? "moss" : "slate",
  className,
  children,
  ...props
}: ComponentProps<"div"> & { variant: "glass" | "dark" | "sand"; mark?: MarkColor }) {
  if (variant === "dark") {
    return (
      <div data-mark={mark} className={cx("aura overflow-hidden rounded-xl", className)} {...props}>
        {/* Content sits on the dark fade; white text on the bright top third would fail contrast. */}
        <div className="aura-fade-dark flex h-full min-h-72 flex-col justify-end p-6 text-on-dark-fixed">{children}</div>
      </div>
    );
  }
  return (
    <div data-mark={mark} className={cx("aura rounded-xl p-4", className)} {...props}>
      <GlassPanel tone={variant === "sand" ? "dark" : "light"} className={cx("h-full p-5", variant === "glass" && "text-ink")}>
        {children}
      </GlassPanel>
    </div>
  );
}
