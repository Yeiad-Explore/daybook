# Phase 0 tasks

Plan and open questions: `tasks/plan.md`. Rules: `CONSTRAINTS.md`. Each task ends in a working, committed state; commit messages reference requirement or constraint IDs. Test files are named in `CONSTRAINTS.md`.

Commands below (`pnpm typecheck`, `pnpm test`, …) are created in T1–T3.

---

## T0: Owner prerequisites

**Description:** Accounts and installs the code depends on. Owner actions; listed so nothing blocks mid-task. See the table in `tasks/plan.md`.

- [x] Docker Desktop installed and running
- [ ] Private GitHub repo (deferred; no remote, no push)
- [ ] Google Cloud OAuth client (walkthrough at T14; Phase 0 uses TEST-1 email sign-in locally)
- [ ] Supabase cloud project "daybook" (Singapore, free) created and linked, no migrations pushed (needs owner's `supabase login`)
- [ ] Vercel account (deferred with T23)

---

## T1: Scaffold the Next.js app

**Description:** Create the app with `pnpm create next-app` (TypeScript, ESLint, Tailwind CSS, App Router, `src/` directory, `@/*` alias, no React Compiler, no Cache Components until a phase needs them). Turn on `strict`, pin the TypeScript version agreed in open question 1, add `typecheck`, `lint`, `dev`, `build` scripts, `.gitignore` (including `.env*.local`) and `.env.example`. Fill in the Commands section of CLAUDE.md.

**Acceptance criteria:**
- [ ] `pnpm dev` serves the starter page; `pnpm build` succeeds
- [ ] `tsconfig.json` has `"strict": true`; `pnpm typecheck` and `pnpm lint` pass
- [ ] No starter styles, fonts or copy remain that conflict with DESIGN.md

**Verification:** `pnpm typecheck && pnpm lint && pnpm build`

**Dependencies:** T0 (repo, git identity)

**Files likely touched:** `package.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `.gitignore`, `.env.example`, `CLAUDE.md`

**Estimated scope:** M

---

## T2: Test tooling

**Description:** Vitest for unit tests; Playwright with `@axe-core/playwright` and a shared helper that checks no horizontal scroll at 400px and 1440px in light and dark; `pnpm check:tokens` (a small script that fails on raw colour values outside `src/styles/tokens.css`); `check:fast` and `check:task` scripts that mirror `CONSTRAINTS.md`.

**Acceptance criteria:**
- [ ] `pnpm test` runs one passing sample test; `pnpm test:e2e` runs one passing smoke test against `pnpm dev`
- [ ] The e2e helper fails a test when the page scrolls sideways or axe reports a critical/serious violation
- [ ] `pnpm check:tokens` fails on a planted `#fff` in a component and passes once it is removed

**Verification:** `pnpm test && pnpm test:e2e && pnpm check:tokens`

**Dependencies:** T1

**Files likely touched:** `vitest.config.ts`, `playwright.config.ts`, `e2e/helpers/checks.ts`, `e2e/smoke.spec.ts`, `scripts/check-tokens.mjs`, `package.json`

**Estimated scope:** M

---

## T3: Supabase local stack and pgTAP helpers

**Description:** `supabase init`; configure `supabase/config.toml` (site URL, Google provider reading client id/secret from env, `enable_signup` behaviour documented, timezone-neutral settings); enable `pgtap`. Write test helpers: create a test user, act as a user (`set local role authenticated` plus JWT claims, per current Supabase docs), and a fixture builder that inserts the PRD §12 subset needed for rule tests (Health goal 1 Sep 2026 → 31 Jan 2027 with "Buy running shoes" due 14 Oct; AI Engineering goal with the "Learn Python" stage due 15 Nov and the leaf "Loops: for and while" due 16 Oct; AI Agency with "Send proposal follow-up to Bayside Café" due 15 Oct; Finance and Skincare areas). The fixture builder is filled in as tables arrive (T4–T6).

**Acceptance criteria:**
- [ ] `supabase start` and `supabase test db` run locally; a first pgTAP test passes
- [ ] Helpers can create two users (owner, other) and switch between them inside one test transaction
- [ ] Every test file runs inside `begin; … rollback;` and leaves no data behind

**Verification:** `supabase db reset && supabase test db`

**Dependencies:** T0 (Docker), T1

**Files likely touched:** `supabase/config.toml`, `supabase/tests/000_helpers.sql` (or `supabase/tests/helpers/`), `supabase/tests/001_smoke.test.sql`, `.env.example`

**Estimated scope:** M

---

## T4: Migration: enums, profiles, spaces, pages, blocks

**Description:** `source-driven-development` for current Supabase migration and RLS guidance first. Create all enums from §10.1; the shared `set_updated_at()` function; `profiles` (+ DB-1 auto-create trigger, if approved); `spaces`, `pages`, `blocks` with every column, default, check and index from §10.3–10.4; RLS enabled with the four owner policies per table. `full-output-enforcement` for the migration file.

**Acceptance criteria:**
- [ ] C-DL-01, C-DL-08 (check part), C-SCH-02, C-SCH-03 (space, page), C-SCH-06 pass
- [ ] C-RLS-01…05 pass for these tables, including the second non-owner user seeing and changing nothing
- [ ] `supabase db reset` applies cleanly

**Verification:** `supabase db reset && supabase test db`

**Dependencies:** T3

**Files likely touched:** `supabase/migrations/<ts>_core_types_and_spaces.sql`, `supabase/tests/010_schema.test.sql`, `supabase/tests/020_rls.test.sql`, fixture helper

**Estimated scope:** M

---

## T5: Migration: tasks and deadline_changes

**Description:** `tasks` and `deadline_changes` per §10.3 with indexes (§10.4, including the trigram/full-text index on `tasks.title`); RLS (owner policies on `tasks`; select + insert only on `deadline_changes`). Check constraints for C-DL-18.

**Acceptance criteria:**
- [ ] C-SCH-03 (task title), C-DL-09 (no status column), C-DL-18 pass
- [ ] C-RLS-02…06 pass for both tables; updating or deleting a `deadline_changes` row fails for the owner too

**Verification:** `supabase db reset && supabase test db`

**Dependencies:** T4

**Files likely touched:** `supabase/migrations/<ts>_tasks.sql`, `supabase/tests/010_schema.test.sql`, `supabase/tests/020_rls.test.sql`

**Estimated scope:** S

---

## T6: Migration: content tables

**Description:** `tracker_fields`, `tracker_entries`, `table_columns`, `table_rows`, `time_blocks`, `routine_steps`, `routine_checks`, `notes` (with generated `search` tsvector), `google_connections` (no client policies), `reviews`; all indexes including GIN on `table_rows.cells` and `notes.search`; RLS.

**Acceptance criteria:**
- [ ] C-SCH-04, C-SCH-05 pass
- [ ] C-RLS-01 passes across the whole `public` schema (zero tables without RLS)
- [ ] C-RLS-02…05, C-RLS-07 pass for every table; the non-owner user reads zero rows and every write fails

**Verification:** `supabase db reset && supabase test db`

**Dependencies:** T5

**Files likely touched:** `supabase/migrations/<ts>_content_tables.sql`, `supabase/tests/010_schema.test.sql`, `supabase/tests/020_rls.test.sql`

**Estimated scope:** M

### Checkpoint CP-A
- [ ] Every table, enum and index in PRD §10.1–10.4 exists
- [ ] RLS suite green, including the second non-owner user on every table
- [ ] Owner review before triggers

---

## T7: Triggers: shared rules

**Description:** Attach `set_updated_at` to every editable table; `sync_space_id` (blocks, tasks, time_blocks) with cross-owner rejection; `block_type_guard` on every child table; `blocks.type` immutable; `soft_delete_cascade` for spaces → pages → blocks → content (and clearing on restore); DB-2 protected columns if approved.

**Acceptance criteria:**
- [ ] C-TRG-01, C-TRG-02, C-TRG-03, C-TRG-13, C-SCH-01, C-RLS-08 pass
- [ ] Attaching a child to another owner's block fails even with a valid id

**Verification:** `supabase test db`

**Dependencies:** CP-A

**Files likely touched:** `supabase/migrations/<ts>_shared_triggers.sql`, `supabase/tests/040_triggers.test.sql`

**Estimated scope:** M

---

## T8: Triggers: task tree

**Description:** `task_tree_guard` (roadmap-only parents, same block, no cycles, depth ≤ 3), `task_completed_at`, `task_parent_done` (recompute up the chain on insert, update, delete and soft delete).

**Acceptance criteria:**
- [ ] C-TRG-04, C-TRG-07, C-TRG-08 pass, including: a cycle is rejected; a 5th level is rejected; checking the last child marks the parent chain done; un-checking a child un-completes the chain; adding a child under a done step un-completes it (RM-2 AC2)

**Verification:** `supabase test db`

**Dependencies:** T7

**Files likely touched:** `supabase/migrations/<ts>_task_tree.sql`, `supabase/tests/040_triggers.test.sql`

**Estimated scope:** M

---

## T9: Deadline engine guards

**Description:** `doubt-driven-development` on the design before writing. `task_deadline_guard`, `task_due_change_guard` (transaction-local `app.reschedule` flag), `space_deadline_guard`; DL-12, DL-13 and SPC-9 if approved. Tests at date boundaries use `p_today = 2026-10-16` and the §12 fixtures.

**Acceptance criteria:**
- [ ] C-DL-02…08, C-DL-10, C-DL-11 pass (C-TRG-05, C-TRG-06, C-TRG-09)
- [ ] §7.4 AC2: a direct `update tasks set due_date = …` on an existing goal task is rejected; the same update succeeds only with the reschedule flag set inside the transaction
- [ ] TODO-1 AC1/AC2 and RM-2 AC1 rejections happen in the database with clear error messages the UI can show

**Verification:** `supabase test db`

**Dependencies:** T8

**Files likely touched:** `supabase/migrations/<ts>_deadline_engine.sql`, `supabase/tests/030_deadline_engine.test.sql`

**Estimated scope:** M

---

## T10: Triggers: tables and time slots

**Description:** `table_cells_validate` (per Appendix B value types), `time_block_same_day` (profile timezone), `time_block_sync_flag` (reads the connection status with a `security definer` helper, because `google_connections` has no client policies).

**Acceptance criteria:**
- [ ] C-TRG-10, C-TRG-11, C-TRG-12 pass, including invalid number/date/select/url cells, unknown column ids, a slot crossing local midnight (TB-1 AC2) and end before start (TB-1 AC1)

**Verification:** `supabase test db`

**Dependencies:** T7

**Files likely touched:** `supabase/migrations/<ts>_content_triggers.sql`, `supabase/tests/040_triggers.test.sql`

**Estimated scope:** M

---

## T11: RPC stubs

**Description:** `api-and-interface-design` on the §10.7 signatures. Create every function with its final name, parameters, return type, `security invoker/definer` choice and grants (`authenticated` only; never `anon`). Bodies raise "not available until Phase N" (CONSTRAINTS.md E1). `get_calendar_status()` and `set_calendar_prefs()` may be implemented fully if trivial.

**Acceptance criteria:**
- [ ] Every §10.7 function exists with the documented signature (pgTAP `has_function`)
- [ ] `anon` cannot execute any of them; `authenticated` can
- [ ] Each stub's error names its phase

**Verification:** `supabase test db`

**Dependencies:** T9, T10

**Files likely touched:** `supabase/migrations/<ts>_rpc_stubs.sql`, `supabase/tests/060_rpc.test.sql`

**Estimated scope:** S

---

## T12: Auth allowlist and generated types

**Description:** `security-and-hardening` + `source-driven-development` (Auth hooks page). A "Before User Created" hook as a Postgres function that allows only the owner's email (configured, not hard-coded in app code), granted to `supabase_auth_admin` only; enable it in `config.toml`. Add `pnpm db:types` (`supabase gen types`) and generate `src/lib/database.types.ts`.

**Acceptance criteria:**
- [ ] C-AUTH-01: the hook returns an error for any other email and `{}` for the owner's (pgTAP calls the function directly)
- [ ] `authenticated` and `anon` cannot execute the hook function
- [ ] Generated types compile; `pnpm typecheck` passes

**Verification:** `supabase test db && pnpm db:types && pnpm typecheck`

**Dependencies:** T11

**Files likely touched:** `supabase/migrations/<ts>_auth_allowlist.sql`, `supabase/config.toml`, `supabase/tests/050_auth.test.sql`, `src/lib/database.types.ts`, `package.json`

**Estimated scope:** S

### Checkpoint CP-B
- [ ] `supabase db reset && supabase test db` green from an empty database
- [ ] Every C-DL, C-RLS, C-TRG, C-SCH and C-AUTH-01 row marked "Phase 0" has a passing test
- [ ] Owner review of the schema before UI work builds on it

---

## T13: Supabase clients and route protection

**Description:** `source-driven-development` (Supabase SSR for Next.js). `src/lib/supabase/client.ts` (browser), `server.ts` (per-request server client), `proxy.ts` session refresh with `getClaims()`, following the documented cookie and caching warnings. Signed-out requests to any route except `/login` (and the auth callback) redirect to `/login`; `/` redirects to `/today` or `/login`.

**Acceptance criteria:**
- [ ] AUTH-3 AC2: e2e test, signed out, every §5.1 route redirects to `/login`
- [ ] `/` redirects to `/login` when signed out
- [ ] No server code reads `getSession()` for authorisation

**Verification:** `pnpm typecheck && pnpm test:e2e`

**Dependencies:** CP-B, T2

**Files likely touched:** `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/proxy.ts`, `e2e/auth-redirect.spec.ts`

**Estimated scope:** S

---

## T14: Sign in with Google

**Description:** `/login` with "Continue with Google"; `signInWithOAuth` requesting `https://www.googleapis.com/auth/calendar.events` with `access_type=offline` and `prompt=consent` (AUTH-1 AC2, GC-1); the callback route exchanges the code and lands on `/today`; a rejected account sees "This Daybook is private." (AUTH-2 AC1). The provider tokens are not stored yet (that is GC-2, Phase 3). TEST-1 local email sign-in for Playwright, if approved.

**Acceptance criteria:**
- [ ] AUTH-1 AC1: manual check at CP-C, owner signs in with Google and lands on `/today`
- [ ] AUTH-1 AC2: unit test on the sign-in options (scope, `access_type`, `prompt`)
- [ ] AUTH-2 AC1: e2e test, the hook's rejection shows "This Daybook is private." and no user record exists
- [ ] AUTH-3 AC1: session survives a browser restart (Playwright persistent context)

**Verification:** `pnpm test && pnpm test:e2e`, plus the manual Google sign-in

**Dependencies:** T13, T0 (OAuth client)

**Files likely touched:** `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`, `src/lib/auth/sign-in-options.ts`, `e2e/login.spec.ts`

**Estimated scope:** M

### Checkpoint CP-C
- [ ] Owner signs in locally with Google; a different Google account is refused
- [ ] All tests green

---

## T15: Design tokens and theme

**Description:** `frontend-ui-engineering`. `src/styles/tokens.css` generated from the DESIGN.md front matter: every colour (light under `:root`, dark under `[data-theme="dark"]` and `prefers-color-scheme`), typography, radii, spacing, elevation, layout; the six aura palettes and the aura recipe (with 2–3% grain) as a reusable class/utility; Tailwind v4 `@theme` mapping onto the variables; fonts (per open question 6); theme preference (system/light/dark) without a flash on load; `prefers-reduced-motion` base rules; solid fallback when `backdrop-filter` is unsupported.

**Acceptance criteria:**
- [ ] Every DESIGN.md token has a CSS variable; every light colour has its dark value (unit test parses both)
- [ ] `pnpm check:tokens` passes; no raw colour outside `tokens.css`
- [ ] Switching theme changes the page without reload; reload keeps the choice

**Verification:** `pnpm test && pnpm check:tokens && pnpm build`

**Dependencies:** T1

**Files likely touched:** `src/styles/tokens.css`, `src/app/globals.css`, `src/app/layout.tsx`, `src/lib/theme.ts`, `src/styles/tokens.test.ts`

**Estimated scope:** M

---

## T16: Primitives A

**Description:** Panel, Glass panel, Floating card, Pill button (primary with trailing icon circle, secondary, ghost, lime), Tag (incl. outlined variant), Segmented control (keyboard accessible). DEV-1 `/dev/primitives` page if approved.

**Acceptance criteria:**
- [ ] Each primitive matches its DESIGN.md component spec using tokens only
- [ ] Focus is visible (lime-soft ring + ink border); pressed = scale 0.98; reduced motion respected
- [ ] The primitives page passes axe and the 400/1440px, light/dark checks

**Verification:** `pnpm test:e2e` (primitives spec), `pnpm check:tokens`

**Dependencies:** T15

**Files likely touched:** `src/components/ui/panel.tsx`, `glass-panel.tsx`, `floating-card.tsx`, `button.tsx`, `tag.tsx`, `segmented-control.tsx`, `src/app/dev/primitives/page.tsx`

**Estimated scope:** M

---

## T17: Primitives B

**Description:** Aura card (glass, dark, sand variants; driven by `mark`), KPI item, Task row (circular checkbox, title, source line, deadline tag, late dot), Deadline tag with a pure `deadlineTagText(due, dueTime, done, today)` that implements PRD §7.5 exactly.

**Acceptance criteria:**
- [ ] `deadlineTagText` unit tests cover every §7.5 row with `today = 2026-10-16` (done struck, "2d late", "today", "today 18:00", "tomorrow", "in 3d", "25 Oct", "31 Jan 2027"); full date available on hover
- [ ] Late state uses words and colour (NFR-7); aura text passes contrast (scrim where needed)
- [ ] Primitives page checks pass

**Verification:** `pnpm test && pnpm test:e2e`

**Dependencies:** T16

**Files likely touched:** `src/components/ui/aura-card.tsx`, `kpi-item.tsx`, `task-row.tsx`, `deadline-tag.tsx`, `src/lib/deadline-tag.ts`, `src/lib/deadline-tag.test.ts`

**Estimated scope:** M

---

## T18: Behaviour primitives and toast

**Description:** shadcn/ui (current docs for Tailwind v4) for dialog, popover, dropdown, tooltip, command, restyled 100% with tokens (no default shadcn classes or colours ship). Toast per DESIGN.md (dark card, lime/ember dot, optional Undo held for 6 seconds).

**Acceptance criteria:**
- [ ] Each primitive works by keyboard (open, navigate, close with Esc, focus returns)
- [ ] Toast with Undo calls the undo handler within 6 s and disappears after
- [ ] `pnpm check:tokens` passes; no shadcn default palette variables remain

**Verification:** `pnpm test && pnpm test:e2e`

**Dependencies:** T16

**Files likely touched:** `components.json`, `src/components/ui/dialog.tsx`, `popover.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`, `command.tsx`, `toast.tsx`

**Estimated scope:** M

### Checkpoint CP-D
- [ ] Primitives page reviewed in light and dark at 1440px and 400px; no console errors
- [ ] `antislop-ui` pass on the primitives; fixes made against DESIGN.md

---

## T19: App shell

**Description:** Signed-in layout: Index sidebar (dark glass over the ambient aura; profile row; search pill with `Ctrl K` hint; Today with count badge; Goals and Life areas groups read from `spaces` via TanStack Query, with empty states; Review, Settings, "+ New space"), top bar (breadcrumb/greeting, theme toggle, date pill, "New task" button as a placeholder until Phase 1), responsive behaviour (collapsible at 900–1199px, drawer below 900px).

**Acceptance criteria:**
- [ ] Layout matches DESIGN.md "App shell" in light and dark
- [ ] At 400px the Index is a drawer, nothing scrolls sideways, touch targets ≥ 44px
- [ ] The Index shows spaces from the database (fixture data in dev) and an empty state when there are none

**Verification:** `pnpm test:e2e` (shell spec)

**Dependencies:** CP-C, CP-D

**Files likely touched:** `src/app/(app)/layout.tsx`, `src/components/shell/index-sidebar.tsx`, `top-bar.tsx`, `src/lib/query/provider.tsx`, `e2e/shell.spec.ts`

**Estimated scope:** M

---

## T20: Routing

**Description:** Every route in PRD §5.1 as a placeholder screen inside the shell (`/today`, `/s/[spaceId]` redirect, `/s/[spaceId]/[pageId]`, `/s/[spaceId]/settings`, `/new`, `/review`, `/review/[weekStart]`, `/history`, `/settings`, `/settings/calendar`, `/settings/data`) plus the not-found screen ("plain message and a link to Today"). Placeholder copy through `antislop-copywriting`.

**Acceptance criteria:**
- [ ] Signed in, every route renders inside the shell without console errors
- [ ] An unknown URL shows the not-found screen with a link to Today

**Verification:** `pnpm test:e2e` (routes spec)

**Dependencies:** T19

**Files likely touched:** `src/app/(app)/**/page.tsx`, `src/app/not-found.tsx`, `e2e/routes.spec.ts`

**Estimated scope:** S (many small files, one pattern)

---

## T21: Profile settings and sign out

**Description:** `/settings` (Profile): display name, timezone (IANA list, default Asia/Dhaka), week starts on (Sat/Sun/Mon), currency (default BDT), theme; react-hook-form + zod mirroring C-SCH-06; optimistic update with TanStack Query and rollback with an error toast. "Sign out" (AUTH-3 AC3).

**Acceptance criteria:**
- [ ] SET-1: each field persists across reload and takes effect immediately (theme switches; the date pill re-computes for a new timezone)
- [ ] An invalid timezone is rejected by the database even if the form is bypassed
- [ ] AUTH-3 AC3: Sign out ends the session and returns to `/login`

**Verification:** `pnpm test && pnpm test:e2e` (settings spec)

**Dependencies:** T20

**Files likely touched:** `src/app/(app)/settings/page.tsx`, `src/components/settings/profile-form.tsx`, `src/lib/profile.ts`, `e2e/settings.spec.ts`

**Estimated scope:** M

---

## T22: CI (workflow file + local script; running on GitHub deferred)

**Description:** `ci-cd-and-automation`. GitHub Actions on every push and pull request: pnpm install with cache, `pnpm typecheck`, `pnpm lint`, `pnpm check:tokens`, `pnpm test`, Supabase CLI `supabase start` + `supabase test db`, Playwright e2e against the local stack, `gitleaks detect --redact`, `pnpm audit --audit-level high`.

**Acceptance criteria:**
- [ ] A push runs every job and all pass
- [ ] A planted failing test, type error or raw hex makes the run fail

**Verification:** `pnpm check:all` green locally, plus one deliberately red run (reverted). A green run on GitHub is deferred until the owner adds the remote.

**Dependencies:** T21

**Files likely touched:** `.github/workflows/ci.yml`

**Estimated scope:** M

---

## T23: Deployment (DEFERRED by the owner, 2026-10-16)

**Description:** `vercel:bootstrap`, `vercel:env-vars`, `vercel:deployments-cicd`, `vercel:access-protected-vercel-deployment`. Link the Supabase production project and push migrations; set Google provider and the allowlist hook in production; disable new sign-ups after the owner's first sign-in (C-AUTH-02); Vercel project from the GitHub repo with env vars per environment; deployment protection on previews.

**Acceptance criteria:**
- [ ] Production URL: owner signs in with Google and reaches `/today`; another account is refused
- [ ] A preview URL is not reachable without Vercel authentication
- [ ] No secret appears in the client bundle (search the build output for the service-role key and Google secret)

**Verification:** manual checks recorded in the Phase 0 summary; `pnpm build` locally

**Dependencies:** T22, T0

**Files likely touched:** `vercel.json` (only if needed), `.env.example`, `CLAUDE.md` (deploy notes)

**Estimated scope:** M

---

## CP-E: Phase 0 checks and summary (Step 5)

- [ ] `browser-testing-with-devtools`: shell in light and dark at 1440px and 400px; no console errors; no horizontal scroll
- [ ] `antislop-ui` on primitives and shell; fixes against DESIGN.md
- [ ] Built-in `security-review`: RLS, allowlist, secrets
- [ ] `code-review-and-quality`, then `code-simplification`
- [ ] Summary: what was built, which ACs pass (by ID), anything left or blocked
