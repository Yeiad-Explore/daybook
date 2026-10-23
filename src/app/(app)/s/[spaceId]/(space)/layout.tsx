import { redirect } from "next/navigation";
import { DeadlinePassed } from "@/components/space/deadline-passed";
import { DeadlineRail } from "@/components/space/deadline-rail";
import { PageSwap } from "@/components/space/page-swap";
import { PageTabs } from "@/components/space/page-tabs";
import { SpaceProvider } from "@/components/space/space-context";
import { SpaceHero } from "@/components/space/space-hero";
import { getProfile } from "@/lib/profile";
import { loadSpaceShell } from "@/lib/space-page";
import type { ReactNode } from "react";

// The header and page tabs stay mounted while /s/:spaceId/:pageId changes, so switching
// pages replaces only the blocks below.
export default async function SpaceViewLayout({ children, params }: { children: ReactNode; params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const [shell, profile] = await Promise.all([loadSpaceShell(spaceId), getProfile()]);
  if (!profile) redirect("/login");
  const { space, summary } = shell;

  return (
    <SpaceProvider
      value={{
        space: { id: space.id, kind: space.kind, name: space.name, deadline: space.deadline, mark: space.mark },
        pageId: "",
        today: summary.today,
        timezone: profile.timezone,
        currency: profile.currency,
        weekStartsOn: profile.week_starts_on,
        blocks: [],
      }}
    >
      <div className="flex flex-col gap-6 pt-2">
        <SpaceHero space={space} summary={summary} coverUrl={shell.coverUrl} />
        {space.kind === "goal" && space.status === "active" && (summary.days_left ?? 0) < 0 && <DeadlinePassed space={space} today={summary.today} />}
        {space.kind === "goal" && <DeadlineRail summary={summary} weekStartsOn={profile.week_starts_on} />}
        <PageTabs pages={shell.pages} />
        <PageSwap pageIds={shell.pages.map((page) => page.id)}>{children}</PageSwap>
      </div>
    </SpaceProvider>
  );
}
