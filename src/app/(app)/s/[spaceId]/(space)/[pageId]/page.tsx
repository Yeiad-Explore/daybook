import { redirect } from "next/navigation";
import { PageBody } from "@/components/space/page-body";
import { SpaceProvider } from "@/components/space/space-context";
import { getProfile } from "@/lib/profile";
import { loadSpacePage } from "@/lib/space-page";

export async function generateMetadata({ params }: PageProps<"/s/[spaceId]/[pageId]">) {
  const { spaceId, pageId } = await params;
  const { space, page } = await loadSpacePage(spaceId, pageId);
  return { title: `${page.title} · ${space.name} · Daybook` };
}

// PRD §5.4: the page's blocks. The hero, Deadline Rail and tabs live in the space layout.
export default async function SpacePagePage({ params }: PageProps<"/s/[spaceId]/[pageId]">) {
  const { spaceId, pageId } = await params;
  const [data, profile] = await Promise.all([loadSpacePage(spaceId, pageId), getProfile()]);
  if (!profile) redirect("/login");
  const { space, summary } = data;

  return (
    <SpaceProvider
      value={{
        space: { id: space.id, kind: space.kind, name: space.name, deadline: space.deadline, mark: space.mark },
        pageId,
        today: summary.today,
        timezone: profile.timezone,
        currency: profile.currency,
        weekStartsOn: profile.week_starts_on,
        blocks: data.blocks,
      }}
    >
      <PageBody data={data} lastPage={profile.last_page_by_space[space.id]} />
    </SpaceProvider>
  );
}
