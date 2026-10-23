"use client";

import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCalendarSync } from "@/components/blocks/use-calendar-sync";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { googleSignInOptions } from "@/lib/auth/sign-in-options";
import { describeLogEntry, type CalendarLogEntry, type CalendarStatus } from "@/lib/calendar";
import { errorMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/client";
import { useSave } from "@/lib/use-save";

const when = (iso: string, timezone: string) => format(new TZDate(new Date(iso), timezone), "d MMM, HH:mm");

function Alert({ children }: { children: string }) {
  return (
    <p role="alert" className="type-body-sm flex items-center gap-2 text-ink">
      <span aria-hidden className="size-2 shrink-0 rounded-pill bg-signal" />
      {children}
    </p>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1 pointer-coarse:min-h-11">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-4 shrink-0 accent-[var(--ink)]" />
      <span className="flex flex-col gap-0.5">
        <span className="type-body">{label}</span>
        <span className="type-body-sm text-ink-2">{hint}</span>
      </span>
    </label>
  );
}

/** GC-4 / GC-5 / GC-10, plus the sync log (observability): what Daybook sent to Google, what failed and why. */
export function CalendarSettings({ calendar, log, timezone, connectFailed }: { calendar: CalendarStatus; log: CalendarLogEntry[]; timezone: string; connectFailed: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const save = useSave();
  const sync = useCalendarSync();
  const [pending, setPending] = useState(false);
  const [signInFailed, setSignInFailed] = useState(false);
  const [prefs, setPrefs] = useState({ push: calendar.push_deadlines ?? false, auto: calendar.auto_sync_new_blocks ?? true });
  const [confirming, setConfirming] = useState(false);
  const [removeEvents, setRemoveEvents] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Connect and Reconnect are the same thing: sign in with Google again, asking for Calendar and a fresh refresh token (GC-1).
  async function signIn() {
    setPending(true);
    setSignInFailed(false);
    const { error } = await createClient().auth.signInWithOAuth(googleSignInOptions(window.location.origin));
    if (error) {
      setPending(false);
      setSignInFailed(true);
    }
  }

  function setPref(next: { push?: boolean; auto?: boolean }) {
    const previous = prefs;
    const merged = { push: next.push ?? prefs.push, auto: next.auto ?? prefs.auto };
    setPrefs(merged);
    save.mutate({
      request: () => createClient().rpc("set_calendar_prefs", { p_push_deadlines: merged.push, p_auto_sync: merged.auto, p_calendar_id: "" }),
      rollback: () => setPrefs(previous),
    });
  }

  async function disconnect() {
    setDisconnecting(true);
    const { error } = await createClient().functions.invoke("calendar-sync", { body: { action: "disconnect", remove_events: removeEvents } });
    setDisconnecting(false);
    if (error) return void toast.error(errorMessage(error));
    setConfirming(false);
    toast.success("Google Calendar disconnected.");
    router.refresh();
  }

  const connected = calendar.status === "connected";
  const failed = calendar.failed_syncs ?? 0;

  return (
    <div className="flex max-w-document flex-col gap-6">
      {connectFailed && <Alert>Google signed you in, but Daybook could not save the Calendar connection. Try connecting again.</Alert>}
      {signInFailed && <Alert>Couldn&apos;t reach Google. Check your connection and try again.</Alert>}

      <Panel className="flex flex-col gap-4">
        {calendar.status === "disconnected" && (
          <>
            <p className="type-body text-ink-2">Daybook can add your time slots, and optionally your deadlines, to your primary Google Calendar. It only creates, changes and deletes events it made itself, and never reads your other events.</p>
            <div>
              <Button variant="primary" disabled={pending} onClick={() => void signIn()}>
                Connect Google Calendar
              </Button>
            </div>
          </>
        )}

        {calendar.status === "needs_reconnect" && (
          <>
            <Alert>Google no longer accepts the saved sign-in, so nothing syncs. Slots stay in Daybook and sync again after you reconnect.</Alert>
            {calendar.last_error && <p className="type-body-sm text-ink-2">{calendar.last_error}</p>}
            <div>
              <Button variant="primary" disabled={pending} onClick={() => void signIn()}>
                Reconnect Google Calendar
              </Button>
            </div>
          </>
        )}

        {connected && (
          <dl className="grid gap-x-6 gap-y-3 tablet:grid-cols-[10rem_1fr]">
            <dt className="type-body-sm text-ink-2">Google account</dt>
            <dd className="type-body break-all">{calendar.google_email}</dd>
            <dt className="type-body-sm text-ink-2">Calendar</dt>
            <dd className="type-body">Your primary calendar</dd>
            <dt className="type-body-sm text-ink-2">Last sync</dt>
            <dd className="type-body">{calendar.last_success_at ? when(calendar.last_success_at, timezone) : "Nothing synced yet"}</dd>
            <dt className="type-body-sm text-ink-2">Failed syncs</dt>
            <dd className="flex flex-wrap items-center gap-3">
              <span className="type-body">{failed}</span>
              {failed > 0 && (
                <Button className="min-h-8 px-3 py-1.5 text-[12px]" disabled={sync.busy !== null} onClick={() => void sync.retry()}>
                  Retry all
                </Button>
              )}
            </dd>
          </dl>
        )}
      </Panel>

      {connected && (
        <Panel className="flex flex-col gap-3">
          <h2 className="type-heading">What goes on the calendar</h2>
          <Toggle label="Add new time slots automatically" hint="The default for Time blocks. Each block can turn it off for itself." checked={prefs.auto} onChange={(auto) => setPref({ auto })} />
          <Toggle label="Add deadlines as all-day events" hint="One event for each task with a date. Finished or deleted tasks, and spaces you archive, leave the calendar." checked={prefs.push} onChange={(push) => setPref({ push })} />
        </Panel>
      )}

      {calendar.status !== "disconnected" && (
        <Panel className="flex flex-col gap-3">
          <h2 className="type-heading">Disconnect</h2>
          <p className="type-body-sm text-ink-2">Daybook asks Google to forget its access and deletes the saved sign-in. Every slot goes back to &ldquo;Not on calendar&rdquo;.</p>
          <div>
            <Button onClick={() => setConfirming(true)}>Disconnect Google Calendar</Button>
          </div>
        </Panel>
      )}

      <Panel className="flex flex-col gap-3">
        <h2 className="type-heading">Recent activity</h2>
        {log.length === 0 ? (
          <p className="type-body-sm text-ink-2">Nothing has been sent to Google yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {log.map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex flex-col gap-0.5 py-2.5">
                <p className="type-body-sm flex flex-wrap items-baseline gap-x-2">
                  <span className="type-number text-ink-2">{when(e.at, timezone)}</span>
                  <span className="break-words">{describeLogEntry(e)}</span>
                </p>
                {e.outcome !== "ok" && (
                  <p className="type-caption flex items-center gap-1.5 text-ink-2">
                    <span aria-hidden className="size-1.5 rounded-pill bg-signal" />
                    {e.reason ?? (e.outcome === "failed" ? "It did not work." : "Skipped.")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogTitle>Disconnect Google Calendar?</DialogTitle>
          <DialogDescription>Events already on your calendar stay there unless you choose to remove them.</DialogDescription>
          <label className="flex cursor-pointer items-start gap-3 pointer-coarse:min-h-11">
            <input type="checkbox" checked={removeEvents} onChange={(e) => setRemoveEvents(e.target.checked)} className="mt-1 size-4 shrink-0 accent-[var(--ink)]" />
            <span className="type-body">Also remove Daybook events from my calendar</span>
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose render={<Button />}>Keep connected</DialogClose>
            <Button variant="primary" disabled={disconnecting} onClick={() => void disconnect()}>
              Disconnect
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
