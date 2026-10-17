import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getSpaceOr404 } from "@/lib/space";
import { createClient } from "@/lib/supabase/server";

// PRD §5.1 / PG AC: a space opens on the page last opened in it, else its first page. A live space
// always has a live page (C-PG-01).
export default async function SpacePage({ params }: PageProps<"/s/[spaceId]">) {
  const { spaceId } = await params;
  const [space, profile] = await Promise.all([getSpaceOr404(spaceId), getProfile()]);
  const supabase = await createClient();
  const { data: pages } = await supabase.from("pages").select("id").eq("space_id", space.id).is("deleted_at", null).order("position").order("created_at").order("id");
  const last = profile?.last_page_by_space[space.id];
  const page = pages?.find((p) => p.id === last) ?? pages?.[0];
  if (!page) notFound();
  redirect(`/s/${space.id}/${page.id}`);
}
