"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Menu } from "lucide-react";
import { useState } from "react";
import { IndexNav, type IndexSpace } from "./index-nav";

// DESIGN.md "Responsive behavior": below 900px the Index is an overlay drawer.
export function MobileIndex(props: { name: string; spaces: IndexSpace[]; archivedCount: number }) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        aria-label="Open the Index"
        className="grid size-11 place-items-center rounded-pill bg-canvas-2 text-ink ring-1 ring-inset ring-control-edge laptop:hidden"
      >
        <Menu size={18} strokeWidth={1.5} aria-hidden />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-surface-dark-fixed/40 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <DialogPrimitive.Popup
          aria-label="Index"
          className="aura fixed inset-y-0 left-0 z-50 w-[min(18rem,85vw)] p-3 outline-none transition-transform duration-200 data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full"
        >
          <IndexNav {...props} onNavigate={() => setOpen(false)} />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
