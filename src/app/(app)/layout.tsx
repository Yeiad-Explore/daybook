import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { IndexSpace } from "@/components/shell/index-nav";
import { IndexNav } from "@/components/shell/index-nav";
import { MobileIndex } from "@/components/shell/mobile-index";
import { TopBar } from "@/components/shell/top-bar";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { daysLeft, todayIn } from "@/lib/today";

// The signed-in app shell (PRD §5.2, DESIGN.md "App shell"): Index + top bar + content.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login"); // proxy.ts already guards; this keeps the types honest

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("spaces")
    .select("id, kind, name, mark, deadline, status")
    .is("deleted_at", null)
    .order("position");

  const today = todayIn(profile.timezone);
  const spaces: IndexSpace[] = (rows ?? [])
    .filter((s) => s.status === "active")
    .map((s) => ({ id: s.id, kind: s.kind, name: s.name, mark: s.mark, daysLeft: s.deadline ? daysLeft(s.deadline, today) : null }));
  const archivedCount = (rows ?? []).filter((s) => s.status === "archived").length;
  const index = { name: profile.name, spaces, archivedCount };

  return (
    <div className="min-h-dvh">
      <a href="#content" className="type-button sr-only rounded-pill bg-surface px-4 py-2 text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50">
        Skip to content
      </a>
      {/* Index: dark glass floating 12px inside the left edge, over the ambient aura. */}
      <aside data-mark="graphite" className="aura fixed inset-y-0 left-0 hidden w-(--layout-index-width) p-3 laptop:block">
        <IndexNav {...index} />
      </aside>
      <div className="laptop:pl-(--layout-index-width)">
        <div className="mx-auto max-w-content px-4 tablet:px-6">
          <TopBar timezone={profile.timezone} menu={<MobileIndex {...index} />} />
          <main id="content" className="pb-16">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
