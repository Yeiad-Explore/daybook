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
  glass = false,
  side = "bottom",
  align = "end",
  sideOffset = 6,
  ...props
}: Omit<MenuPrimitive.Popup.Props, "className"> & { className?: string; glass?: boolean } & Pick<MenuPrimitive.Positioner.Props, "side" | "align" | "sideOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner side={side} align={align} sideOffset={sideOffset} className={cx("z-50", glass && "glass-float rounded-md")}>
        <MenuPrimitive.Popup
          className={cx("min-w-44 p-1.5 text-ink outline-none", glass ? "bg-transparent" : "rounded-md bg-surface shadow-float", POP, className)}
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
        "data-[highlighted]:bg-hairline-strong data-[disabled]:opacity-50 pointer-coarse:min-h-11",
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
