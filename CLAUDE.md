# Daybook

Daybook is the owner's private, single-user life-OS web app: goals with strict deadlines, ongoing life areas, pages built from seven block types, a Today screen, and one-way Google Calendar sync.
"Daybook" is a working name (PRD §15 D1); replace it everywhere once the final name is chosen.

## Source of truth

Read all three fully before any work:

- `PRD.md`: what to build. Sitemap, requirements with IDs and acceptance criteria (AC), the deadline engine (§7), Google Calendar sync (§8), system design (§9), the full Supabase schema (§10), build phases (§13).
- `DESIGN.md`: how it looks. Tokens in the front matter, components, motion, do's and don'ts, responsive rules.
- `design-reference.jpg`: the visual reference board DESIGN.md was extracted from. Inspiration only.

Precedence: the owner's messages > PRD.md for behaviour > DESIGN.md for visuals.
If something is not covered, propose an addition with a new requirement ID and wait for the owner's OK before building it. Never guess silently.

## Stack

Decided 2026-10-16, rationale in `docs/adr/0001-stack.md`. Check current docs (`source-driven-development`) before installing or upgrading anything.

- **Frontend:** Next.js (App Router, latest stable) + TypeScript 5.9.3 (strict; revisit 7.x when typescript-eslint supports it), deployed on Vercel. Package manager: pnpm.
- **Supabase client:** `@supabase/supabase-js` + `@supabase/ssr` (server-side auth with cookies).
- **Styling:** Tailwind CSS v4 with every DESIGN.md token as a CSS variable (light + dark). No raw hex in components.
- **UI primitives:** shadcn/ui only as unstyled building blocks (dialog, popover, command, dropdown, tooltip), fully restyled to DESIGN.md.
- **Data fetching and optimistic updates:** TanStack Query (NFR-1).
- **Forms and validation:** react-hook-form + zod. The zod schemas mirror the DB rules for friendly messages only.
- **Notes editor:** Tiptap, storing its JSON in `notes.body`.
- **Drag and drop:** dnd-kit (pages, blocks, rows, roadmap steps).
- **Dates:** date-fns + `@date-fns/tz`. All "today" logic uses the profile timezone (default Asia/Dhaka).
- **Charts:** hand-built SVG with d3-scale. No chart library.
- **Icons:** lucide-react, 1.5px stroke.
- **Tests:** Vitest (unit), pgTAP via `supabase test db` (triggers, RLS, RPCs), Playwright (end-to-end flows and AC checks).
- **Database workflow:** Supabase CLI migrations; regenerate TypeScript types from the schema after every migration.
- **Backend: Supabase only.** Postgres, Auth (Google), Row Level Security, Edge Functions, Cron, Vault, Storage, exactly as PRD §9–10. Do not add another backend, database, auth provider, queue, cron service or file storage.
- **Next.js specifics:** read `AGENTS.md` (Next.js writes it); the docs for the installed version are in `node_modules/next/dist/docs/`. Cache Components is off (ADR 0001).

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm lint` | ESLint (Next.js config) |
| `pnpm check:tokens` | Fails on raw colour values outside `src/styles/tokens.css` |
| `pnpm test` | Vitest unit tests (`src/**/*.test.ts(x)`, `scripts/**/*.test.mjs`) |
| `pnpm test:e2e` | Playwright (starts `pnpm dev` on port 3100); `e2e/helpers/checks.ts` has the light/dark × 400/1440 layout and axe checks |
| `pnpm db:start` / `pnpm db:reset` | Start the local Supabase stack (Docker) / rebuild the local DB from migrations |
| `pnpm test:db` | pgTAP database tests in `supabase/tests/` (helpers and §12 fixtures in `000-setup-tests-hooks.sql`) |
| `pnpm check:fast` | typecheck + lint + tokens (after every edit) |
| `pnpm check:task` | check:fast + unit + database + e2e (end of every task) |

Read `CONSTRAINTS.md` before writing code. Do not weaken it to make a change pass.

## Boundaries

- Never bypass the database rules in PRD §10.6. Rule-heavy changes go through the RPCs in §10.7.
- Schema changes only through versioned migrations (NFR-10).
- Reference requirement IDs in every commit message (e.g. `AUTH-2: ...`).
- Secrets (Google client secret, service role key) live only in Supabase / Edge Function env vars. Never in the client, never committed.
- No analytics or third-party trackers (NFR-4).

## Status

- Step 1 (this file), Step 2 (ADRs 0001, 0002) and Step 3 (`CONSTRAINTS.md`, `tasks/plan.md`, `tasks/todo.md`): done.
- Phase 0 plan: approved 2026-10-16 with the owner's answers (recorded in `tasks/plan.md`). Building; progress is ticked in `tasks/todo.md`.
- Git: commit locally after each task. Do NOT push and do not add a GitHub remote until the owner says so.
- Supabase: develop against the local stack. The cloud project `daybook` is linked but migrations are NOT pushed until the owner says so.

## WORKING RULES (every session)

- One phase per session: plan → my approval → build in small steps → test → check → summary.
- Every AC in the PRD becomes at least one automated test. Date-dependent tests pass p_today.
- Business rules live in the database (PRD §10.6). The UI may mirror them for nice messages, but never relies on them and never bypasses them.
- Use DESIGN.md tokens only. No raw hex values in components. Lime = now/live, ember = late; nothing else is coloured.
- A screen is done only after it is checked in light + dark + 400px width.
- If something fails twice, stop retrying and use `debugging-and-error-recovery`.
- If a requirement is unclear, use `interview-me` and ask me instead of guessing.
- Never reuse the reference site's name, logo, copy or photos.

## SKILL MAP (which skill, when)

Planning
- planning-and-task-breakdown (/plan): start of every phase.
- constraint-driven-development (/constraints): before building any rule-heavy part (deadline engine, RLS, calendar sync).
- spec-driven-development (/spec): only when adding something NOT in PRD.md; update PRD.md with a new ID first.
- interview-me: when a requirement is ambiguous.
- documentation-and-adrs: any decision that changes stack, schema or design rules.

Database and backend
- source-driven-development: before any Supabase Auth/RLS/Vault/Edge Function/Cron code and any Google Calendar API code; check the current official docs.
- api-and-interface-design: RPC signatures (PRD §10.7) and Edge Function contracts.
- test-driven-development (/test): every trigger, RPC and AC.
- doubt-driven-development: the deadline engine and anything date/timezone related (Asia/Dhaka, midnight boundaries, streaks).
- security-and-hardening: RLS, single-owner auth, Google token storage.
- full-output-enforcement: migrations and long files.

Frontend
- incremental-implementation (/build): all building.
- frontend-ui-engineering: components and screens.
- react-best-practices / nextjs: if that is the stack.
- shadcn: unstyled primitives only, restyled with DESIGN.md.
- dataviz: Deadline Rail, tracker charts, barcode bars, KPI items. DESIGN.md chart specs override its default palette.
- high-end-visual-design: the ONE visual-polish skill, always within DESIGN.md.
- image-to-code: compare finished screens with design-reference.jpg.
- imagegen-frontend-web: original nature cover photos and aura textures (moss, bark, stone, mist, sky). Never copy the reference images.
- brandkit: logo, wordmark and favicon once the final name is set.

Quality
- antislop-ui: after every screen.
- antislop-copywriting: all UI text, empty states and error messages.
- browser-testing-with-devtools: every screen, light/dark, 1440px and 400px.
- code-review-and-quality (/review): end of every phase. This is the ONE review skill.
- code-simplification (/code-simplify): end of every phase, after review.
- security-review (built-in): end of Phase 0, Phase 3 and before launch.
- performance-optimization (/webperf): Phase 4 and before launch.
- debugging-and-error-recovery: when something fails twice.
- observability-and-instrumentation: Google Calendar sync logging (Phase 3).

Shipping
- git-workflow-and-versioning: always.
- ci-cd-and-automation: Phase 0, then keep green.
- bootstrap, env-vars, deployments-cicd, access-protected-vercel-deployment: if deployed on Vercel.
- shipping-and-launch (/ship) and verification: final launch.

DO NOT USE ON THIS PROJECT
- Business plugins: small-business, sales, marketing, cowork-plugin-management.
- 3d-web-experience, fable-3d-web (the design has no 3D).
- senior-backend (empty template).
- Competing design skills, because DESIGN.md is the only design authority: design-taste-frontend, design-taste-frontend-v1, gpt-taste, minimalist-ui, industrial-brutalist-ui, stitch-design-taste, frontend-design, senior-frontend, senior-fullstack, redesign-existing-projects.
- Duplicate review/simplify skills: built-in code-review, ponytail-review, built-in simplify.
- Vercel backend/AI skills that would replace Supabase or add out-of-scope AI: auth, vercel-storage, queues, workflow, create-a-backend, marketplace, ai-sdk, ai-gateway, build-agents, eve, chat-sdk, vercel-agent, vercel-sandbox, microfrontends, flags-sdk.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
