import { isValid, parseISO } from "date-fns";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/page-intro";

// A saved review (PRD §5.6), built in Phase 4. The URL must be a date: /review/2026-10-10.
export default async function PastReviewPage({ params }: PageProps<"/review/[weekStart]">) {
  const { weekStart } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !isValid(parseISO(weekStart))) notFound(); // Date.parse accepts 31 Feb
  return <PageIntro eyebrow="Weekly review" context={`Week of ${weekStart}.`} statement="Saved reviews arrive in Phase 4." />;
}
