import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import { LinkButton } from "@/components/ui/button";
import { FloatingCard } from "@/components/ui/floating-card";
import { cx } from "@/lib/cx";
import { longDate, shortDate } from "@/lib/dates";
import type { SpaceSummary } from "@/lib/deadlines";
import type { Space } from "@/lib/space-page";

/**
 * DESIGN.md "Space view anatomy" 1 (PRD §5.4): an aura card in the space's mark with the eyebrow, a
 * two-tone headline (space name / end goal), the Countdown glass panel (SPC-6) and a floating card
 * with the progress line (SPC-7 `tasks`). Life areas show the eyebrow, name and description only.
 * Text sits on a dark scrim over the aura (DESIGN.md Accessibility: never small white text on an aura).
 */
export function SpaceHero({ space, summary, coverUrl }: { space: Space; summary: SpaceSummary; coverUrl?: string | null }) {
  const goal = space.kind === "goal";
  return (
    <section
      aria-label={goal ? "Goal" : "Life area"}
      data-mark={space.mark}
      className={cx("aura relative rounded-xl text-on-dark-fixed", goal ? "min-h-70 max-tablet:min-h-55" : "min-h-40", goal && "mb-6 tablet:mb-10")}
    >
      {coverUrl && (
        // A cover photo shows blurred 40px behind the same scrims (DESIGN.md "Aura recipe"); decorative, so no alt text.
        <div aria-hidden className="absolute inset-0 overflow-hidden rounded-xl">
          {/* unoptimized: a short-lived signed URL, which the image proxy must not cache */}
          <Image src={coverUrl} alt="" fill unoptimized sizes="100vw" className="scale-110 object-cover blur-[40px]" />
        </div>
      )}
      <div aria-hidden className="absolute inset-0 rounded-xl bg-linear-to-r from-surface-dark-fixed/60 via-surface-dark-fixed/30 to-surface-dark-fixed/5" />
      <div className="relative flex flex-col gap-6 p-6 tablet:flex-row tablet:items-start tablet:justify-between tablet:p-7">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="type-eyebrow">{goal ? `Goal · ${space.name}` : "Life area"}</p>
          <h1 className="type-display max-w-[22ch] text-balance max-tablet:text-[30px]">
            {goal ? (
              <>
                <span className="text-on-dark-2-fixed">{space.name}.</span> {space.end_goal}
              </>
            ) : (
              space.name
            )}
          </h1>
          {!goal && space.description && <p className="type-body max-w-[60ch]">{space.description}</p>}
        </div>
        {goal && summary.days_left !== null && <Countdown days={summary.days_left} deadline={space.deadline!} today={summary.today} />}
      </div>

      {goal && summary.progress && (
        <FloatingCard className="relative mx-6 mb-6 flex flex-col gap-3 text-ink tablet:absolute tablet:right-7 tablet:-bottom-8 tablet:mx-0 tablet:mb-0 tablet:w-80">
          <div className="flex items-baseline gap-2">
            <p className="type-number-lg">
              {summary.progress.percent}
              <span className="type-body-sm">%</span>
            </p>
            <p className="type-caption">{summary.progress.label}</p>
          </div>
          <div
            role="progressbar"
            aria-label="Progress"
            aria-valuenow={summary.progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 overflow-hidden rounded-pill bg-canvas-2"
          >
            <div className="h-full rounded-pill bg-ink" style={{ width: `${summary.progress.percent}%` }} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {summary.progress.metric === "tracker" && summary.progress.block_id && summary.progress.page_id && (
              <LinkButton href={`/s/${space.id}/${summary.progress.page_id}#block-${summary.progress.block_id}`} variant="primary" icon={<ArrowUpRight size={12} strokeWidth={2} />}>
                Log {summary.progress.field_label?.toLowerCase()}
              </LinkButton>
            )}
            <LinkButton href={`/history?space=${space.id}`} variant={summary.progress.metric === "tracker" ? "secondary" : "primary"} icon={summary.progress.metric === "tracker" ? undefined : <ArrowUpRight size={12} strokeWidth={2} />}>
              Deadline history
            </LinkButton>
          </div>
        </FloatingCard>
      )}
    </section>
  );
}

/** DESIGN.md "Countdown": number-xl days + caption; past the deadline the number turns ember (SPC-4 AC2). */
function Countdown({ days, deadline, today }: { days: number; deadline: string; today: string }) {
  const past = days < 0;
  return (
    <div className="glass shrink-0 self-start rounded-lg px-5 py-4 text-ink">
      <p className={cx("type-number-xl", past && "text-signal-ink")}>{Math.abs(days)}</p>
      <p className="type-caption mt-1">
        {past ? "days past deadline" : days === 0 ? "due today" : days === 1 ? "day left" : "days left"} ·{" "}
        <time dateTime={deadline} title={longDate(deadline)}>
          {shortDate(deadline, today)}
        </time>
      </p>
    </div>
  );
}
