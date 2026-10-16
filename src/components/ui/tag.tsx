import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/cx";

/** DESIGN.md "tag": canvas-2 pill, caption text; outlined variant for streak-style tags ("12-day streak"). */
export function Tag({
  variant = "filled",
  icon,
  className,
  children,
  ...props
}: ComponentProps<"span"> & { variant?: "filled" | "outlined"; icon?: ReactNode }) {
  return (
    <span
      className={cx(
        "type-caption inline-flex items-center gap-1 rounded-pill px-2 py-[3px] text-ink-2",
        variant === "filled" ? "bg-canvas-2" : "border border-hairline-strong",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
