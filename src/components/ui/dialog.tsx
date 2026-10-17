"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cx } from "@/lib/cx";
import { POP } from "./motion";

// Behaviour: Base UI Dialog (focus trap, Esc, focus return). Look: DESIGN.md panel at float level.
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, ...props }: Omit<DialogPrimitive.Popup.Props, "className"> & { className?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-surface-dark-fixed/40 transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
      <DialogPrimitive.Popup
        className={cx(
          "fixed top-1/2 left-1/2 z-50 grid w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg bg-surface p-6 text-ink shadow-float outline-none",
          POP,
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute top-3 right-3 grid size-9 place-items-center rounded-pill text-ink-2 hover:bg-canvas-2 pointer-coarse:size-11"
        >
          <X size={16} strokeWidth={1.5} aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: Omit<DialogPrimitive.Title.Props, "className"> & { className?: string }) {
  return <DialogPrimitive.Title className={cx("type-title pr-8", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: Omit<DialogPrimitive.Description.Props, "className"> & { className?: string }) {
  return <DialogPrimitive.Description className={cx("type-body text-ink-2", className)} {...props} />;
}
