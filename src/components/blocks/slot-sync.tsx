"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { dayViewUrl, type CalendarStatus } from "@/lib/calendar";
import type { Enums } from "@/lib/database.types";

const small = "min-h-8 px-3 py-1.5 text-[12px]";

/**
 * TB-3 / DESIGN.md "Time slot row": "On calendar ✓" in lime-ink, "Add to Google Calendar" as a secondary pill,
 * "Syncing", and "Sync failed" with the reason and Retry. Every state is words as well as colour.
 */
export function SlotSync({
  status,
  error,
  day,
  connection,
  busy,
  onAdd,
  onRetry,
  showReason = true,
  reconnectLink = true,
  label,
}: {
  status: Enums<"sync_status">;
  error?: string | null;
  /** The slot's local date, for the link to Google Calendar's day view. */
  day: string;
  connection: CalendarStatus["status"];
  busy?: boolean;
  onAdd: () => void;
  onRetry: () => void;
  showReason?: boolean;
  /** False where a banner already carries the Reconnect link (Today), so a list does not repeat it on every row. */
  reconnectLink?: boolean;
  /** The slot's title, so several identical buttons are told apart by screen readers. */
  label?: string;
}) {
  if (status === "synced") {
    return (
      <a href={dayViewUrl(day)} target="_blank" rel="noreferrer" aria-label={`On calendar, on Google Calendar. Opens the day${label ? ` of ${label}` : ""} in Google Calendar.`} className="type-caption inline-flex items-center gap-1 rounded-pill bg-canvas-2 px-2 py-[3px] text-lime-ink hover:underline">
        On calendar
        <Check size={12} strokeWidth={2} aria-hidden />
      </a>
    );
  }
  // GC-10: while Google needs a new sign-in nothing syncs, so a waiting slot says what the owner has to do.
  if (connection === "needs_reconnect") {
    if (!reconnectLink) return <Tag variant="outlined">Waiting for reconnect</Tag>;
    return (
      <Link href="/settings/calendar" className="type-caption text-ink-2 underline underline-offset-4">
        Reconnect Google Calendar
      </Link>
    );
  }
  if (status === "pending" || status === "delete_pending") return <Tag variant="outlined">Syncing</Tag>;
  if (status === "failed") {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Tag variant="outlined">Sync failed</Tag>
        {showReason && error && <span className="type-caption text-ink-3-small">{error}</span>}
        {connection === "connected" && (
          <Button className={small} disabled={busy} onClick={onRetry} aria-label={label ? `Retry: ${label}` : undefined}>
            Retry
          </Button>
        )}
      </span>
    );
  }
  if (connection === "connected") {
    return (
      <Button className={small} disabled={busy} onClick={onAdd} aria-label={label ? `Add to Google Calendar: ${label}` : undefined}>
        Add to Google Calendar
      </Button>
    );
  }
  return <Tag variant="outlined">Not on calendar</Tag>;
}
