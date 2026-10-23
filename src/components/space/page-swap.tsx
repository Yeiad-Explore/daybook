"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

/**
 * The space header and page tabs stay mounted. The blocks below slide in from the side of the
 * page just opened, so a tab change is a move rather than a cut.
 */
export function PageSwap({ pageIds, children }: { pageIds: string[]; children: ReactNode }) {
  const pageId = usePathname().split("/")[3] ?? "";
  const [motion, setMotion] = useState({ id: pageId, dir: "forward" as "forward" | "back", enter: false });
  if (pageId && pageId !== motion.id) {
    const from = pageIds.indexOf(motion.id);
    const to = pageIds.indexOf(pageId);
    setMotion({ id: pageId, dir: from >= 0 && to >= 0 && to < from ? "back" : "forward", enter: true });
  }

  return (
    <div className="overflow-x-clip">
      <div key={motion.id} className={motion.enter ? (motion.dir === "back" ? "page-swap-back" : "page-swap-forward") : undefined}>
        {children}
      </div>
    </div>
  );
}
