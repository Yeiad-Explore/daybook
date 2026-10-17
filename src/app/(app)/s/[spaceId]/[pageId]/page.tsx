import { redirect } from "next/navigation";
import { DeadlinePassed } from "@/components/space/deadline-passed";
import { DeadlineRail } from "@/components/space/deadline-rail";
import { PageBody } from "@/components/space/page-body";
import { PageTabs } from "@/components/space/page-tabs";
import { SpaceProvider } from "@/components/space/space-context";
import { SpaceHero } from "@/components/space/space-hero";
import { getProfile } from "@/lib/profile";
import { loadSpacePage } from "@/lib/space-page";

export async function generateMetadata({ params }: PageProps<"/s/[spaceId]/[pageId]">) {
  const { spaceId, pageId } = await params;
  const { space, page } = await loadSpacePage(spaceId, pageId);
  return { title: `${page.title} · ${space.name} · Daybook` };
}

// PRD §5.4: space header (hero, Deadline Rail), page tabs, then the page's blocks.
export default async function SpacePagePage({ params }: PageProps<"/s/[spaceId]/[pageId]">) {
  const { spaceId, pageId } = await params;
  const [data, profile] = await Promise.all([loadSpacePage(spaceId, pageId), getProfile()]);
  if (!profile) redirect("/login");
  const { space, summary } = data;
  const ctx = {
    space: { id: space.id, kind: space.kind, name: space.name, deadline: space.deadline, mark: space.mark },
    pageId,
    today: summary.today,
    timezone: profile.timezone,
    currency: profile.currency,
    weekStartsOn: profile.week_starts_on,
    blocks: data.blocks,
  };

  return (
    <SpaceProvider value={ctx}>
      <div className="flex flex-col gap-6 pt-2">
        <SpaceHero space={space} summary={summary} coverUrl={data.coverUrl} />
        {space.kind === "goal" && space.status === "active" && (summary.days_left ?? 0) < 0 && <DeadlinePassed space={space} today={summary.today} />}
        {space.kind === "goal" && <DeadlineRail summary={summary} weekStartsOn={profile.week_starts_on} />}
        <PageTabs pages={data.pages} />
        <PageBody data={data} lastPage={profile.last_page_by_space[space.id]} />
      </div>
    </SpaceProvider>
  );
}
