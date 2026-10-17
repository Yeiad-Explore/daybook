import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { PageIntro } from "@/components/page-intro";
import { getProfile } from "@/lib/profile";

export const metadata = { title: "Today · Daybook" };

// PRD §5.3 is built in Phase 1 (agenda) and Phase 2 (timetable, routines, trackers).
export default async function TodayPage() {
  const profile = await getProfile();
  const now = new TZDate(new Date(), profile?.timezone ?? "Asia/Dhaka");
  return (
    <PageIntro eyebrow="Today" context={format(now, "EEEE, d MMMM")} statement="Your agenda arrives in Phase 1.">
      Overdue, due today and the next 7 days will gather here from every space.
    </PageIntro>
  );
}
