import type { ReactNode } from "react";

/** Page heading per DESIGN.md: eyebrow, two-tone light headline (context in ink-3, statement in ink). */
export function PageIntro({ eyebrow, context, statement, children }: { eyebrow: string; context?: string; statement: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-6">
      <p className="type-eyebrow text-ink-3-small">{eyebrow}</p>
      <h1 className="type-display max-tablet:text-[32px]">
        {context && <span className="text-ink-3">{context} </span>}
        {statement}
      </h1>
      {children && <div className="type-body text-ink-2">{children}</div>}
    </div>
  );
}
