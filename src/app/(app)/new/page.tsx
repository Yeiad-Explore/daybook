import { PageIntro } from "@/components/page-intro";

export const metadata = { title: "New space · Daybook" };

// SPC-1, built in Phase 1.
export default function NewSpacePage() {
  return <PageIntro eyebrow="New space" context="A goal or a life area." statement="Creating spaces arrives in Phase 1." />;
}
