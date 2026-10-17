import { PageIntro } from "@/components/page-intro";

export const metadata = { title: "Deadline history · Daybook" };

// PRD §5.7, built in Phase 1.
export default function HistoryPage() {
  return <PageIntro eyebrow="Deadline history" context="Every reschedule, with its reason." statement="History arrives in Phase 1." />;
}
