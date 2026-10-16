import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

/**
 * DESIGN.md "glass-panel" (elevation level 2). Use only over an aura or a photo, never over flat
 * white, and never more than two glass layers deep. tone="dark" is the dark glass of the Index.
 */
export function GlassPanel({ tone = "light", className, ...props }: ComponentProps<"div"> & { tone?: "light" | "dark" }) {
  return <div className={cx("glass rounded-lg", tone === "dark" && "glass-dark", className)} {...props} />;
}
