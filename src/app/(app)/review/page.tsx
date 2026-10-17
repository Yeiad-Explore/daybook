import { PageIntro } from "@/components/page-intro";

export const metadata = { title: "Review · Daybook" };

// PRD §5.6, built in Phase 4.
export default function ReviewPage() {
  return <PageIntro eyebrow="Weekly review" context="This week." statement="The review arrives in Phase 4." />;
}
