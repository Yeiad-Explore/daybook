"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cx } from "@/lib/cx";
import { POP } from "./motion";

// Behaviour: Base UI Popover. Look: DESIGN.md floating layer (surface, radius md, float shadow).
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({
  className,
  side = "bottom",
  align = "center",
  sideOffset = 8,
  ...props
}: Omit<PopoverPrimitive.Popup.Props, "className"> & { className?: string } & Pick<PopoverPrimitive.Positioner.Props, "side" | "align" | "sideOffset">) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50">
        <PopoverPrimitive.Popup
          className={cx("w-72 rounded-md bg-surface p-4 text-ink shadow-float outline-none", POP, className)}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}
