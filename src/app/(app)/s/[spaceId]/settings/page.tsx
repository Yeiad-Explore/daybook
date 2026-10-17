import { notFound, redirect } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { getProfile } from "@/lib/profile";
import { isUuid } from "@/lib/space";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/today";
import { SpaceSettings } from "./space-settings";

// PRD §5.5 space settings (Phase 1 part; cover photo and progress metric settings arrive with Phase 2).
export default async function SpaceSettingsPage({ params }: PageProps<"/s/[spaceId]/settings">) {
  const { spaceId } = await params;
  if (!isUuid(spaceId)) notFound();
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const { data: space } = await supabase.from("spaces").select("*").eq("id", spaceId).is("deleted_at", null).maybeSingle();
  if (!space) notFound();
  return (
    <>
      <PageIntro eyebrow="Space settings" context={space.name} statement="Details, dates and status." />
      <SpaceSettings space={space} today={todayIn(profile.timezone)} />
    </>
  );
}
