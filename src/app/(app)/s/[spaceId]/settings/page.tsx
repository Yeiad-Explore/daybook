import { notFound, redirect } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { getProfile } from "@/lib/profile";
import { isUuid } from "@/lib/space";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/today";
import type { SelectOption } from "@/lib/table-logic";
import type { SpaceSummary } from "@/lib/deadlines";
import { SpaceSettings } from "./space-settings";

// PRD §5.5 space settings: details, dates, cover photo, progress metric (SPC-7), status, Trash.
export default async function SpaceSettingsPage({ params }: PageProps<"/s/[spaceId]/settings">) {
  const { spaceId } = await params;
  if (!isUuid(spaceId)) notFound();
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const { data: space } = await supabase.from("spaces").select("*").eq("id", spaceId).is("deleted_at", null).maybeSingle();
  if (!space) notFound();

  // What the progress setting can point at: fields and select columns of live blocks on live pages.
  const { data: blocks } = await supabase
    .from("blocks")
    .select("id, title, type, pages!inner(title)")
    .eq("space_id", spaceId)
    .in("type", ["tracker", "table"])
    .is("deleted_at", null)
    .is("pages.deleted_at", null);
  const place = new Map((blocks ?? []).map((b) => [b.id, `${b.pages.title} · ${b.title}`]));
  const idsOf = (type: string) => (blocks ?? []).filter((b) => b.type === type).map((b) => b.id);
  const [{ data: fields }, { data: columns }, { data: summary }] = await Promise.all([
    supabase.from("tracker_fields").select("id, label, unit, block_id").in("block_id", idsOf("tracker")).is("archived_at", null).order("position"),
    supabase.from("table_columns").select("id, name, block_id, options").in("block_id", idsOf("table")).eq("kind", "select").order("position"),
    space.kind === "goal" ? supabase.rpc("space_summary", { p_space_id: spaceId }) : Promise.resolve({ data: null }),
  ]);
  const coverUrl = space.cover_path ? ((await supabase.storage.from("covers").createSignedUrl(space.cover_path, 3600)).data?.signedUrl ?? null) : null;

  return (
    <>
      <PageIntro eyebrow="Space settings" context={space.name} statement="Details, dates and status." />
      <SpaceSettings
        space={space}
        today={todayIn(profile.timezone)}
        coverUrl={coverUrl}
        progress={(summary as unknown as SpaceSummary | null)?.progress ?? null}
        fields={(fields ?? []).map((f) => ({ id: f.id, label: f.label, unit: f.unit, place: place.get(f.block_id) ?? "" }))}
        columns={(columns ?? []).map((c) => ({ id: c.id, name: c.name, place: place.get(c.block_id) ?? "", options: c.options as unknown as SelectOption[] }))}
      />
    </>
  );
}
