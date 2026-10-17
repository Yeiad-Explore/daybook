import Link from "next/link";

export const metadata = { title: "Not found · Daybook" };

// PRD §5.1: plain message and a link to Today.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-document flex-col justify-center gap-4 px-6">
      <p className="type-eyebrow text-ink-3-small">Not found</p>
      <h1 className="type-display">
        <span className="text-ink-3">Nothing here. </span>It may have been moved or deleted.
      </h1>
      <p>
        <Link href="/today" className="type-button inline-flex rounded-pill bg-surface-dark px-4 py-2.5 text-on-dark">
          Go to Today
        </Link>
      </p>
    </main>
  );
}
