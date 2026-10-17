"use client";

import { Toast } from "@base-ui/react/toast";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/** PRD §5.2: destructive actions offer Undo for 6 seconds. */
export const UNDO_WINDOW_MS = 6000;

// Behaviour: Base UI Toast (announcements, F6 to reach the region, swipe to dismiss).
// Look: DESIGN.md "Toast": dark card, radius md, float shadow, bottom right; lime dot for success,
// ember dot for errors; one line plus an optional Undo. Same in both themes (theme-fixed colours).
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider limit={3}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100%-2rem))] flex-col gap-2 outline-none">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      className={cx(
        "flex items-center gap-3 rounded-md bg-surface-dark-fixed py-2.5 pr-2 pl-4 text-on-dark-fixed shadow-float ring-1 ring-on-dark-fixed/15",
        "transition-[opacity,transform] duration-200 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0",
      )}
    >
      <span aria-hidden className={cx("size-2 shrink-0 rounded-pill", toast.type === "error" ? "bg-signal" : "bg-lime")} />
      <Toast.Title className="type-body-sm flex-1" />
      <Toast.Action className="type-button rounded-pill px-3 py-2 text-on-dark-fixed underline-offset-4 hover:underline pointer-coarse:min-h-11" />
      <Toast.Close aria-label="Dismiss" className="grid size-8 place-items-center rounded-pill text-on-dark-fixed hover:bg-on-dark-fixed/10 pointer-coarse:size-11">
        <X size={14} strokeWidth={1.5} aria-hidden />
      </Toast.Close>
    </Toast.Root>
  ));
}

/** Toasts for the app: confirmations, errors (announced urgently) and Undo for destructive actions. */
export function useToast() {
  const manager = Toast.useToastManager();
  return {
    success: (title: string) => manager.add({ title, type: "success" }),
    error: (title: string) => manager.add({ title, type: "error", priority: "high" }),
    undoable: (title: string, onUndo: () => void) => {
      const id = manager.add({
        title,
        type: "success",
        timeout: UNDO_WINDOW_MS,
        actionProps: {
          children: "Undo",
          onClick: () => {
            onUndo();
            manager.close(id);
          },
        },
      });
      return id;
    },
  };
}
