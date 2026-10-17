import { notFound } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { getSpaceOr404, isUuid } from "@/lib/space";
import { createClient } from "@/lib/supabase/server";

// PRD §5.4 (space header, page tabs, blocks) is built in Phase 1.
export default async function SpacePagePage({ params }: PageProps<"/s/[spaceId]/[pageId]">) {
  const { spaceId, pageId } = await params;
  const space = await getSpaceOr404(spaceId);
  if (!isUuid(pageId)) notFound();
  const supabase = await createClient();
  const { data: page } = await supabase.from("pages").select("title").eq("id", pageId).eq("space_id", space.id).is("deleted_at", null).maybeSingle();
  if (!page) notFound();
  return (
    <PageIntro eyebrow={space.kind === "goal" ? "Goal" : "Life area"} context={space.name} statement={page.title}>
      The space header, page tabs and blocks are built in Phase 1.
    </PageIntro>
  );
}
