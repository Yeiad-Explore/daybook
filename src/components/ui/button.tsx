import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/cx";

type Variant = "primary" | "secondary" | "ghost" | "lime";

// DESIGN.md "Buttons": pills; focus ring comes from the base layer; pressed = scale 0.98.
const VARIANTS: Record<Variant, string> = {
  primary: "bg-surface-dark text-on-dark py-2.5 pr-1.5 pl-4.5",
  secondary: "bg-canvas-2 text-ink px-4 py-2.5",
  ghost: "bg-transparent text-ink-2 px-3 py-2 hover:underline underline-offset-4",
  lime: "bg-lime text-surface-dark-fixed px-4.5 py-2.5", // at most one per screen; text on lime is always near-black
};

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  /** Primary only: the small icon shown in the circle at the end ("View insight ⊙"). */
  icon?: ReactNode;
};

export function Button({ variant = "secondary", icon, className, children, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "type-button inline-flex min-h-9 items-center gap-2 rounded-pill transition-transform duration-150",
        "active:scale-[0.98] disabled:opacity-50 pointer-coarse:min-h-11",
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {children}
      {variant === "primary" && (
        <span aria-hidden className="grid size-5 place-items-center rounded-pill bg-on-dark text-surface-dark">
          {icon}
        </span>
      )}
    </button>
  );
}
