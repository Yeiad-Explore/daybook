"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cx } from "@/lib/cx";
import { POP } from "./motion";

// Behaviour: Base UI Menu (arrow keys, typeahead, Esc). Look: DESIGN.md floating layer; menu items
// use radius sm.
export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  side = "bottom",
  align = "end",
  sideOffset = 6,
  ...props
}: Omit<MenuPrimitive.Popup.Props, "className"> & { className?: string } & Pick<MenuPrimitive.Positioner.Props, "side" | "align" | "sideOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50">
        <MenuPrimitive.Popup
          className={cx("min-w-44 rounded-md bg-surface p-1.5 text-ink shadow-float outline-none", POP, className)}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, tone, ...props }: Omit<MenuPrimitive.Item.Props, "className"> & { className?: string; tone?: "danger" }) {
  return (
    <MenuPrimitive.Item
      className={cx(
        "type-body-sm flex min-h-9 cursor-default items-center gap-2 rounded-sm px-2.5 outline-none select-none",
        "data-[highlighted]:bg-canvas-2 data-[disabled]:opacity-50 pointer-coarse:min-h-11",
        tone === "danger" ? "text-signal-ink" : "text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: Omit<MenuPrimitive.Separator.Props, "className"> & { className?: string }) {
  return <MenuPrimitive.Separator className={cx("my-1 h-px bg-hairline", className)} {...props} />;
}
