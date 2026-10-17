import { format, parseISO } from "date-fns";
import { AlertCircle, CalendarCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuraCard } from "@/components/ui/aura-card";
import { KpiItem } from "@/components/ui/kpi-item";
import { shortDate } from "@/lib/dates";
import type { SpaceSummary } from "@/lib/deadlines";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/today-data";
import { Agenda } from "./agenda";
import { MidnightRefresh } from "./midnight-refresh";

export const metadata = { title: "Today · Daybook" };

const icon = { size: 16, strokeWidth: 1.5 } as const;

// PRD §5.3 Today, Phase 1 part: headline, KPI row, goals strip and the agenda column (D-P1-10).
export default async function TodayPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const agenda = await getToday();
  const supabase = await createClient();
  const { data: goals } = await supabase.from("spaces").select("id, name, mark").eq("kind", "goal").eq("status", "active").is("deleted_at", null).order("position");
  const summaries = await Promise.all(
    (goals ?? []).map(async (g) => ({ goal: g, summary: (await supabase.rpc("space_summary", { p_space_id: g.id })).data as unknown as SpaceSummary })),
  );

  const dueToday = agenda.due_today.filter((t) => !t.done).length;
  const statement = dueToday === 0 ? "Nothing left for today." : `${dueToday} ${dueToday === 1 ? "thing" : "things"} due today.`;

  return (
    <div className="flex flex-col gap-8 pt-2">
      <MidnightRefresh timezone={profile.timezone} today={agenda.today} />
      <header className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <p className="type-eyebrow text-ink-3-small">Today · {format(parseISO(agenda.today), "EEEE")}</p>
          <h1 className="type-hero max-tablet:text-[36px]">
            <span className="text-ink-3">{format(parseISO(agenda.today), "EEEE, d MMMM")}</span>
            <br />
            {statement}
          </h1>
        </div>
        <div className="flex flex-wrap gap-6">
          <KpiItem icon={<AlertCircle {...icon} />} value={agenda.late_count} caption="Late" />
          <KpiItem icon={<CalendarCheck {...icon} />} value={dueToday} caption="Due today" />
        </div>
      </header>

      {summaries.length > 0 && (
        <section aria-label="Goals" className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2">
          {summaries.map(({ goal, summary }, i) => {
            const next = summary.milestones.find((m) => !m.done);
            // DESIGN.md "Aura card": the three variants side by side, so each row of three has one dark card.
            const variant = (["glass", "dark", "sand"] as const)[i % 3];
            return (
              <Link key={goal.id} href={`/s/${goal.id}`} prefetch={false} className="w-[min(100%,22rem)] shrink-0 snap-start rounded-xl desktop:w-[calc((100%-2rem)/3)]">
                <AuraCard variant={variant} mark={goal.mark} className="h-full transition-transform duration-200 hover:-translate-y-0.5">
                  <div className={variant === "dark" ? "flex flex-col gap-3" /* on the dark fade, not on the aura */ : "flex h-full flex-col gap-3"}>
                    <p className="type-heading truncate">{goal.name}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="type-number-xl">
                        {summary.progress?.percent ?? 0}
                        <span className="type-body-sm">%</span>
                      </p>
                      <p className="type-caption">{summary.progress?.label}</p>
                    </div>
                    <p className="type-caption mt-auto flex flex-wrap justify-between gap-x-3">
                      <span>
                        {summary.days_left !== null && summary.days_left >= 0 ? `${summary.days_left} days left` : `${-(summary.days_left ?? 0)} days past deadline`}
                      </span>
                      {next && (
                        <span className="truncate">
                          Next: {next.title} · {next.state === "late" ? "late" : shortDate(next.due_date, agenda.today)}
                        </span>
                      )}
                    </p>
                  </div>
                </AuraCard>
              </Link>
            );
          })}
        </section>
      )}

      <div className="max-w-document">
        <Agenda data={agenda} />
      </div>
    </div>
  );
}
