import { redirect } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { getProfile } from "@/lib/profile";
import { ProfileForm } from "./profile-form";

function timezones(current: string) {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes(current) ? zones : [current, ...zones];
}

// SET-1 (PRD §5.8): display name, timezone, week start, currency, theme; sign out (AUTH-3 AC3).
export default async function ProfileSettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return (
    <>
      <PageIntro eyebrow="Profile" context="How Daybook knows you." statement="Changes save as you make them." />
      {/* Built on the server: Node's and the browser's timezone lists differ slightly (hydration). */}
      <ProfileForm profile={profile} zones={timezones(profile.timezone)} />
    </>
  );
}
