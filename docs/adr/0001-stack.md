# ADR 0001: Stack: Next.js on Vercel, Supabase as the only backend

## Status

Accepted (owner decision, 2026-10-16), including the two version details under "Version decisions".

## Date

2026-10-16

## Context

- Daybook is a private, single-user web app (PRD §1–2). PRD §15 D2 left the frontend to the owner; the backend was already fixed by PRD §9–10.
- The PRD puts business rules in Postgres (constraints, triggers, RLS, RPCs; §2.3 principle 2, §10.6) so that no client can break them. The frontend only mirrors those rules for friendly messages.
- NFR-1: Today renders with data in under 1 s; a single interaction reflects in the UI in under 100 ms (optimistic) and persists in under 500 ms.
- NFR-3/NFR-4: RLS on every table, no secrets in the client bundle, no analytics or third-party trackers.
- DESIGN.md asks for custom data graphics (Deadline Rail barcode, hatched line charts, value bubbles) that stock chart libraries do not produce.
- The build is done by Claude Code, phase by phase, so the stack should have current official docs and tooling the agent can verify against.

## Decision

### Backend: Supabase only

Postgres, Auth (Google provider), Row Level Security, Edge Functions, Cron, Vault and Storage, exactly as PRD §9–10. No other backend, database, auth provider, queue, cron service or file storage is added.

- Schema changes only through Supabase CLI migrations (NFR-10). TypeScript types are regenerated from the schema after every migration.
- Database tests: pgTAP, run with `supabase test db`.

### Frontend

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js, App Router, latest stable (16.4.x on 2026-10-16) | Server-side session handling with cookies via `@supabase/ssr`; route protection in `proxy.ts`; first-class Vercel deploys. |
| Language | TypeScript 5.9.3, `strict` | Types generated from the schema keep client code aligned with the database. |
| Hosting | Vercel | Native Next.js host; preview deployments per push; deployment protection for previews. |
| Package manager | pnpm | Owner's choice. |
| Supabase client | `@supabase/supabase-js` + `@supabase/ssr` | Official SSR package: cookie-based sessions, `getClaims()` verification on the server. |
| Styling | Tailwind CSS v4, every DESIGN.md token as a CSS variable (light + dark) | Tokens stay the single source; utilities reference variables, never raw hex. |
| UI primitives | shadcn/ui as unstyled building blocks only (dialog, popover, command, dropdown, tooltip), restyled to DESIGN.md | Accessible behaviour (focus traps, keyboard) without adopting a visual system. See ADR 0002. |
| Data fetching | TanStack Query | Caching and optimistic updates with rollback, needed for NFR-1 and NFR-5. |
| Forms | react-hook-form + zod | zod schemas mirror the database rules for friendly messages only; the database stays the authority. |
| Notes editor | Tiptap, JSON stored in `notes.body` | Matches PRD §10.3 (`body` jsonb + `body_text`). |
| Drag and drop | dnd-kit | Pages, blocks, rows, roadmap steps; keyboard sensors support NFR-7. |
| Dates | date-fns + `@date-fns/tz` | All "today" logic in the profile timezone (default Asia/Dhaka, NFR-6). |
| Charts | Hand-built SVG with d3-scale | DESIGN.md charts are custom; a chart library would be fought rather than used. |
| Icons | lucide-react, 1.5px stroke | DESIGN.md "Shapes". |
| Tests | Vitest (unit), pgTAP (database), Playwright (end-to-end and AC checks) | Every AC becomes at least one test (PRD §14). |

Versions are checked against the npm registry and official docs when each package is installed (`source-driven-development`), not fixed here. Registry state on 2026-10-16: next 16.4.2, react 19.3.1, tailwindcss 4.3.3, @supabase/supabase-js 2.118.0, @supabase/ssr 0.12.7, supabase CLI 2.121.0, @tanstack/react-query 5.104.3, zod 4.6.7, @tiptap/react 3.32.0, @dnd-kit/core 6.3.1, date-fns 4.4.0, @date-fns/tz 1.5.0, d3-scale 4.0.2, lucide-react 1.58.0, vitest 5.0.5, @playwright/test 1.64.1.

### Version decisions (owner, 2026-10-16)

1. **TypeScript 5.9.3.** The latest release is 7.0.2 (native compiler). Next.js 16.3+ can type-check with it through the `tsc` CLI, but TypeScript 7 has no JavaScript compiler API until 7.1, and `typescript-eslint` 8.71 (used by Next.js's ESLint config for typed rules) supports only `typescript >=4.8.4 <6.1.0`. **Revisit TypeScript 7 when `typescript-eslint` supports it.**
2. **`@date-fns/tz` instead of `date-fns-tz`.** date-fns 4's official timezone package (`TZDate` and the `in` option), from the date-fns maintainers.

## Alternatives considered

### Custom backend (Node API + separate database, auth and job runner)
- Pros: full control.
- Cons: re-implements what Supabase provides; splits rules between API and database.
- Rejected: PRD §9 fixes Supabase; the PRD's rules-in-the-database principle needs Postgres RLS and triggers either way.

### Vite + React single-page app
- Pros: simpler build, no server runtime.
- Cons: sessions live in browser storage; route protection is client-only; no server rendering for the Today first paint.
- Rejected: cookie-based server sessions (`@supabase/ssr`) and server-side redirects (AUTH-3 AC2) are simpler and safer with Next.js.

### A chart library (Recharts, Chart.js, ECharts)
- Pros: faster first chart.
- Cons: the barcode rail, hatched bands and value bubbles need heavy overrides; extra bundle weight.
- Rejected: d3-scale for the maths plus hand-built SVG matches DESIGN.md exactly.

### A full component library (shadcn default theme, MUI, Chakra)
- Rejected: see ADR 0002. Only unstyled behaviour is taken from shadcn/Radix.

## Consequences

- Business rules are tested in the database with pgTAP. The UI never relies on its own validation.
- Local Supabase (`supabase start`, `supabase test db`, type generation from the local schema) needs a container runtime. Docker is not installed on the owner's machine as of 2026-10-16; see `tasks/plan.md`.
- Vercel preview deployments must be protected (owner-only) because they connect to real data.
- Google OAuth with the Calendar scope is a "sensitive" scope. If the Google Cloud consent screen stays in "Testing" status, Google issues refresh tokens that expire in 7 days (developers.google.com/identity/protocols/oauth2#expiration), which would break Calendar sync weekly (Phase 3).
- Secrets (Google client secret, Supabase service-role key) live only in Supabase and Vercel environment variables.

## Sources (checked 2026-10-16)

- https://nextjs.org/docs/app/getting-started/installation
- https://supabase.com/docs/guides/auth/server-side/nextjs
- https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
- https://supabase.com/docs/guides/local-development/testing/overview
- https://nextjs.org/docs/app/api-reference/config/typescript
- https://github.com/date-fns/tz
- https://developers.google.com/identity/protocols/oauth2#expiration
- npm registry (`npm view <package> version`, `npm view typescript-eslint peerDependencies`)
