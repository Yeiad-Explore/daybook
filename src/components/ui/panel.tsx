import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

/** DESIGN.md "panel": white surface, radius lg, card shadow, 24px padding (elevation level 1). Hover lifts it 2px. */
export function Panel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("card-hover rounded-lg bg-surface p-6 shadow-card", className)} {...props} />;
}
