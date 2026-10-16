"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cx } from "@/lib/cx";
import { POP } from "./motion";

// Behaviour: Base UI Tooltip (hover and keyboard focus). DESIGN.md has no tooltip spec, so it uses
// the toast's dark-card language at caption size.
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  side = "top",
  sideOffset = 6,
  ...props
}: Omit<TooltipPrimitive.Popup.Props, "className"> & { className?: string } & Pick<TooltipPrimitive.Positioner.Props, "side" | "sideOffset">) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} className="z-50">
        <TooltipPrimitive.Popup
          className={cx("type-caption max-w-xs rounded-xs bg-surface-dark px-2 py-1 text-on-dark shadow-float", POP, className)}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
