import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

/**
 * DESIGN.md "floating-card" (elevation level 3): glass, radius md, float shadow, 16px padding.
 * Overlaps the edge of a larger card by 24–40px; one per hero, at most two per screen.
 */
export function FloatingCard({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("glass rounded-md p-4 shadow-float", className)} {...props} />;
}
