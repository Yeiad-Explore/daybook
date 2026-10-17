import { redirect } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { Panel } from "@/components/ui/panel";
import { getProfile } from "@/lib/profile";
import { todayIn } from "@/lib/today";
import { loadTrash } from "@/lib/trash";
import { TrashList } from "./trash-list";

export const metadata = { title: "Data · Daybook" };

// SET-3 Trash (Phase 1). Export (SET-2) is Phase 4.
export default async function DataSettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const entries = await loadTrash();
  return (
    <>
      <PageIntro eyebrow="Data" context="Trash keeps things for 30 days." statement="Restore them, or let them go." />
      <Panel className="max-w-document">
        <h2 className="type-heading mb-2">Trash</h2>
        <TrashList entries={entries} today={todayIn(profile.timezone)} timezone={profile.timezone} />
        <p className="type-caption mt-4 text-ink-3-small">Exporting your data arrives in a later phase.</p>
      </Panel>
    </>
  );
}
