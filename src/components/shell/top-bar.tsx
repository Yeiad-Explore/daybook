import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { NewTaskButton } from "@/components/capture/capture";

/** DESIGN.md "Top bar" (64px): left the menu (narrow screens), right the date pill in the owner's timezone and the New task button (CAP-1). */
export function TopBar({ timezone, menu }: { timezone: string; menu: ReactNode }) {
  const now = new TZDate(new Date(), timezone);
  return (
    <header className="flex h-16 items-center justify-between gap-3">
      <div>{menu}</div>
      <div className="flex items-center gap-2">
        <p className="type-button rounded-pill bg-surface px-3.5 py-2 text-ink shadow-card">
          <time dateTime={format(now, "yyyy-MM-dd")}>{format(now, "EEE, d MMM")}</time>
        </p>
        <NewTaskButton />
      </div>
    </header>
  );
}
