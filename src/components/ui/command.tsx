"use client";

import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

// Behaviour: cmdk (filtering, arrow keys, Enter) inside the Base UI dialog. Look: DESIGN.md.
// The command palette itself (SRCH-1..3) is Phase 4; this is the primitive.
export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive className={cx("flex flex-col text-ink", className)} {...props} />;
}

export function CommandDialog({
  open,
  onOpenChange,
  title = "Command palette",
  description = "Search or run an action",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[20%] translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <Command>{children}</Command>
      </DialogContent>
    </Dialog>
  );
}

export function CommandInput({ className, ...props }: ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-2 border-b border-hairline px-4">
      <Search size={16} strokeWidth={1.5} aria-hidden className="text-ink-3-small" />
      <CommandPrimitive.Input
        className={cx("type-body my-2 h-10 flex-1 rounded-sm bg-transparent px-2 placeholder:text-ink-3-small", className)}
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className={cx("max-h-80 overflow-y-auto p-1.5", className)} {...props} />;
}

export function CommandEmpty(props: ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="type-body-sm px-3 py-6 text-center text-ink-2" {...props} />;
}

export function CommandGroup({ className, ...props }: ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cx(
        "[&_[cmdk-group-heading]]:type-eyebrow [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-ink-3-small",
        className,
      )}
      {...props}
    />
  );
}

export function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cx(
        "type-body-sm flex min-h-9 cursor-default items-center gap-2 rounded-sm px-2.5 select-none data-[selected=true]:bg-hairline-strong pointer-coarse:min-h-11",
        className,
      )}
      {...props}
    />
  );
}
