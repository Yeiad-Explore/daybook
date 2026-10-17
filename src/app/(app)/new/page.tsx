import { redirect } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { getProfile } from "@/lib/profile";
import { todayIn } from "@/lib/today";
import { NewSpaceForm } from "./new-space-form";

export const metadata = { title: "New space · Daybook" };

// SPC-1 (PRD §5.1 /new). ?kind=area preselects a life area.
export default async function NewSpacePage({ searchParams }: PageProps<"/new">) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const { kind } = await searchParams;
  return (
    <>
      <PageIntro eyebrow="New space" context="Goals end on a date." statement="Life areas keep going." />
      <NewSpaceForm today={todayIn(profile.timezone)} initialKind={kind === "area" ? "area" : "goal"} />
    </>
  );
}
