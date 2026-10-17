import { redirect } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { getSpaceOr404 } from "@/lib/space";
import { createClient } from "@/lib/supabase/server";

// PRD §5.1: a space opens on its first page (remembering the last opened page comes in Phase 1).
export default async function SpacePage({ params }: PageProps<"/s/[spaceId]">) {
  const { spaceId } = await params;
  const space = await getSpaceOr404(spaceId);
  const supabase = await createClient();
  const { data: page } = await supabase.from("pages").select("id").eq("space_id", space.id).is("deleted_at", null).order("position").limit(1).maybeSingle();
  if (page) redirect(`/s/${space.id}/${page.id}`);
  return <PageIntro eyebrow={space.kind === "goal" ? "Goal" : "Life area"} statement={space.name}>This space has no pages yet.</PageIntro>;
}
