import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays, format, parseISO, startOfMonth } from "date-fns";
import { redirect } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { cx } from "@/lib/cx";
import { longDate, shortDate } from "@/lib/dates";
import { getProfile } from "@/lib/profile";
import { isUuid } from "@/lib/space";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/today";

export const metadata = { title: "Deadline history · Daybook" };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * PRD §5.7 /history: every reschedule and late deletion (DL-7, DL-11, DL-14), newest first, with the
 * days moved and whether it was late at the time; filters by space and date range; this month's
 * totals per space. The table scrolls inside its panel on phones; that box is `relative` so screen-reader
 * text in it (position: absolute) cannot widen the page.
 */
export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const params = await searchParams;
  const space = isUuid(one(params.space) ?? "") ? one(params.space)! : "";
  const from = DAY.test(one(params.from) ?? "") ? one(params.from)! : "";
  const to = DAY.test(one(params.to) ?? "") ? one(params.to)! : "";
  const tz = profile.timezone;
  const today = todayIn(tz);
  const instant = (day: string, end = false) => {
    const [y, m, d] = day.split("-").map(Number);
    return new TZDate(y, m - 1, d + (end ? 1 : 0), tz).toISOString();
  };

  const supabase = await createClient();
  let query = supabase
    .from("deadline_changes")
    .select("id, kind, item_title, old_due, new_due, reason, was_late, changed_at, space_id, spaces(name, mark)")
    .order("changed_at", { ascending: false })
    .limit(500);
  if (space) query = query.eq("space_id", space);
  if (from) query = query.gte("changed_at", instant(from));
  if (to) query = query.lt("changed_at", instant(to, true));
  const monthStart = format(startOfMonth(parseISO(today)), "yyyy-MM-dd");
  const [{ data: rows }, { data: spaces }, { data: month }] = await Promise.all([
    query,
    supabase.from("spaces").select("id, name").is("deleted_at", null).order("kind").order("position"),
    supabase.from("deadline_changes").select("space_id, old_due, new_due, spaces(name)").eq("kind", "reschedule").gte("changed_at", instant(monthStart)),
  ]);

  const moved = (r: { old_due: string | null; new_due: string | null }) =>
    r.old_due && r.new_due ? differenceInCalendarDays(parseISO(r.new_due), parseISO(r.old_due)) : null;
  const totals = [...Map.groupBy(month ?? [], (r) => r.spaces?.name ?? "")].map(([name, list]) => ({
    name,
    count: list.length,
    days: list.reduce((sum, r) => sum + Math.abs(moved(r) ?? 0), 0),
  }));

  return (
    <>
      <PageIntro eyebrow="Deadline history" context="Every moved deadline," statement="with its reason." />

      {totals.length > 0 && (
        <ul aria-label="This month" className="mb-6 flex flex-wrap gap-2">
          {totals.map((t) => (
            <li key={t.name} className="type-body-sm rounded-pill bg-surface px-4 py-2 shadow-card">
              <span className="font-medium">{t.name}:</span> {t.count} {t.count === 1 ? "reschedule" : "reschedules"}, {t.days} {t.days === 1 ? "day" : "days"} moved this month
            </li>
          ))}
        </ul>
      )}

      <Panel className="flex flex-col gap-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-48 flex-col gap-1.5">
            <span className="type-caption text-ink-3-small">Space</span>
            <select name="space" defaultValue={space} className={inputClass}>
              <option value="">All spaces</option>
              {(spaces ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="type-caption text-ink-3-small">From</span>
            <input type="date" name="from" defaultValue={from} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="type-caption text-ink-3-small">To</span>
            <input type="date" name="to" defaultValue={to} className={inputClass} />
          </label>
          <Button type="submit" variant="secondary">
            Show
          </Button>
        </form>

        {(rows ?? []).length === 0 ? (
          <p className="type-body text-ink-2">{space || from || to ? "No moved deadlines match these filters." : "No deadline has moved yet."}</p>
        ) : (
          <div tabIndex={0} role="region" aria-label="Deadline history table" className="relative -mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[56rem] border-collapse text-left">
              <caption className="sr-only">Moved and deleted deadlines, newest first</caption>
              <thead>
                <tr className="type-eyebrow bg-canvas-2 text-ink-3-small">
                  {["Changed", "Item", "Space", "Deadline", "Moved", "Reason", "Was late"].map((h, i) => (
                    <th key={h} scope="col" className={cx("px-3 py-2.5 font-medium", i === 0 && "rounded-l-sm", i === 6 && "rounded-r-sm", i === 4 && "text-right")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="type-body-sm">
                {(rows ?? []).map((r) => {
                  const days = moved(r);
                  const changed = new TZDate(new Date(r.changed_at), tz);
                  return (
                    <tr key={r.id} className="border-b border-hairline">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <time dateTime={r.changed_at}>{format(changed, "d MMM, HH:mm")}</time>
                      </td>
                      <td className="px-3 py-3">{r.item_title}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <span aria-hidden data-mark={r.spaces?.mark} className="size-2.5 rounded-pill bg-aura-mid" />
                          {r.spaces?.name}
                        </span>
                      </td>
                      <td className="type-number px-3 py-3 whitespace-nowrap">
                        {r.old_due && <time dateTime={r.old_due} title={longDate(r.old_due)}>{shortDate(r.old_due, today)}</time>}
                        {" → "}
                        {r.kind === "deleted_while_late" ? "deleted" : r.new_due && <time dateTime={r.new_due} title={longDate(r.new_due)}>{shortDate(r.new_due, today)}</time>}
                      </td>
                      <td className="type-number px-3 py-3 text-right whitespace-nowrap">{days === null ? <span className="sr-only">not moved</span> : `${days > 0 ? "+" : ""}${days}d`}</td>
                      <td className="px-3 py-3">{r.reason}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {r.was_late ? <span className="type-caption rounded-pill bg-signal-wash px-2 py-[3px] text-signal-ink">yes</span> : "no"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
