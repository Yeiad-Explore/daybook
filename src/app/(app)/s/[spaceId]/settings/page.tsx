import { PageIntro } from "@/components/page-intro";
import { getSpaceOr404 } from "@/lib/space";

// PRD §5.5, built in Phase 1.
export default async function SpaceSettingsPage({ params }: PageProps<"/s/[spaceId]/settings">) {
  const { spaceId } = await params;
  const space = await getSpaceOr404(spaceId);
  return <PageIntro eyebrow="Space settings" context={space.name} statement="Settings arrive in Phase 1." />;
}
