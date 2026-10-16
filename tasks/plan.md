# Implementation Plan: Phase 0 (Foundations)

Status: **approved** by the owner on 2026-10-16. Progress is ticked in `tasks/todo.md`.

## Overview

Phase 0 (PRD §13) lays the ground every later phase builds on: the complete Supabase schema from PRD §10 (all tables, enums, indexes, RLS policies, triggers and RPC stubs) with database tests; Google sign-in restricted to the owner (AUTH-1 to AUTH-3); DESIGN.md tokens and primitives; the app shell with every route from PRD §5.1; profile settings (SET-1); CI; and protected Vercel deployments.

Phase 0 is done when AUTH-1–3 and SET-1 ACs pass, every constraint in `CONSTRAINTS.md` that Phase 0 owns has a passing test, and the Definition of done in PRD §13 holds.

Detailed tasks, with acceptance criteria and verification for each: `tasks/todo.md`.

## Architecture decisions

- Stack per ADR 0001; design authority per ADR 0002.
- **Database first** (PRD §14.3). The whole §10 schema lands in Phase 0 so later phases never reshape core tables. Rule-heavy RPCs are created as stubs with final signatures and grants (CONSTRAINTS.md exception E1).
- **Repository layout:** `src/` for app code (`src/app`, `src/components`, `src/lib`, `src/styles`); `supabase/` for config, migrations and pgTAP tests; `e2e/` for Playwright; `docs/adr/`; `tasks/`.
- **Migrations** are split by concern (types and core tables → tasks → content tables → triggers → deadline engine → RPC stubs → auth hook) so each is small, reviewable and individually tested.
- **Deadline guard mechanism:** `task_due_change_guard` and `space_deadline_guard` allow a deadline change only when the transaction-local setting `app.reschedule = on`, which only `reschedule_task` / `reschedule_space` set (`set_config(..., true)`). PostgREST does not expose `set_config`, so the API cannot set it.
- **Database tests:** pgTAP files in `supabase/tests/`, each wrapped in `begin; … rollback;`. Shared helpers create users, act as a given user (`set local role authenticated` + JWT claims) and build a fixture set from the PRD §12 seed. Every date-dependent test uses `p_today = 2026-10-16`.
- **Session handling:** `@supabase/ssr` with `proxy.ts` (the Next.js 16 name for middleware) refreshing sessions and redirecting signed-out requests; server code verifies with `getClaims()`, never trusts `getSession()`.
- **Single owner, two layers:** a "Before User Created" Auth hook (Postgres function) rejects every email except the owner's; sign-ups are disabled in production once the owner exists.

## Task list

| # | Task | Size | Depends on |
|---|---|---|---|
| T0 | Owner prerequisites (accounts, Docker, OAuth client) | owner | — |
| T1 | Scaffold Next.js app, strict TypeScript, lint, scripts | M | T0 (repo) |
| T2 | Test tooling: Vitest, Playwright + axe + layout checks, token check | M | T1 |
| T3 | Supabase local stack, pgTAP helpers, fixture builder | M | T0 (Docker), T1 |
| T4 | Migration: enums, profiles, spaces, pages, blocks + RLS | M | T3 |
| T5 | Migration: tasks, deadline_changes + RLS | S | T4 |
| T6 | Migration: tracker, table, time slot, routine, notes, google_connections, reviews + RLS | M | T5 |
| **CP-A** | **Checkpoint: every table exists; RLS suite green with a second user** | | T4–T6 |
| T7 | Triggers: updated_at, space_id sync, block type guards, soft-delete cascade | M | CP-A |
| T8 | Triggers: task tree, completed_at, parent done | M | T7 |
| T9 | Deadline engine guards (DL-1 to DL-6 at the database level) | M | T8 |
| T10 | Triggers: table cells, time-slot same day, sync flag | M | T7 |
| T11 | RPC stubs from §10.7 with final signatures and grants | S | T9, T10 |
| T12 | Auth allowlist hook + generated TypeScript types | S | T11 |
| **CP-B** | **Checkpoint: `supabase db reset` + `supabase test db` green from scratch** | | T7–T12 |
| T13 | Supabase clients, `proxy.ts`, signed-out redirects (AUTH-3) | S | CP-B, T2 |
| T14 | `/login`, Google OAuth with Calendar scope, callback, private-account message (AUTH-1, AUTH-2) | M | T13 |
| **CP-C** | **Checkpoint: owner can sign in locally; a non-owner cannot** | | T13–T14 |
| T15 | Design tokens (light + dark), Tailwind mapping, fonts, theme, aura utility | M | T1 |
| T16 | Primitives A: Panel, Glass panel, Floating card, Pill buttons ×4, Tag, Segmented control | M | T15 |
| T17 | Primitives B: Aura card ×3, KPI item, Task row, Deadline tag (+ §7.5 text rules) | M | T16 |
| T18 | Behaviour primitives (dialog, popover, dropdown, tooltip, command) restyled; toast with Undo | M | T16 |
| **CP-D** | **Checkpoint: primitives page passes light/dark, 400/1440px, axe** | | T15–T18 |
| T19 | App shell: Index sidebar, top bar, responsive drawer | M | CP-C, CP-D |
| T20 | Routing for every §5.1 route (placeholders), not-found | S | T19 |
| T21 | Profile settings (SET-1) and sign out (AUTH-3 AC3) | M | T20 |
| T22 | CI workflow file + local `pnpm check:all` (running on GitHub deferred) | M | T21 |
| T23 | Deploy: Supabase production project, Vercel with protected previews (**deferred**) | M | T22, T0 |
| **CP-E** | **Phase 0 checks (Step 5) and summary** | | all |

T7–T10 database work and T15–T18 design work do not depend on each other and can run in either order after CP-A; the order above front-loads the riskiest part (the deadline engine).

## Owner prerequisites (T0)

| Item | Needed by | Notes |
|---|---|---|
| Docker Desktop (or another Docker-compatible runtime) | T3 | `supabase start`, `supabase test db` and local type generation run the Supabase stack in containers. Not installed on this machine yet. |
| Private GitHub repository | T1 (first push), T22 | You said you will create it. |
| Google Cloud project + OAuth client (Web) | T14 | Authorised redirect URI = the Supabase Auth callback URL (local and production). Enable the Google Calendar API. |
| Google OAuth consent screen publishing status | T14 (decide), Phase 3 (critical) | In "Testing", Google issues refresh tokens that expire after 7 days when a non-basic scope such as Calendar is requested. "In production" (unverified, owner-only) avoids that; you will see an "unverified app" screen once. |
| Supabase production project | T23 | Free plan is enough to start. |
| Vercel account linked to GitHub | T23 | |

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Docker not installed | High: no local database tests or type generation | Install Docker Desktop (T0). Fallback: run `supabase test db` only in CI (GitHub runners have Docker), which slows every database task. |
| Deadline engine edge cases (timezone, midnight, parent/child moves) | High: core product rule | `doubt-driven-development` on T9; tests at day boundaries in Asia/Dhaka; all date maths on `date` values in the profile timezone. |
| Playwright cannot sign in with real Google in CI | Medium: AUTH flows untestable end to end | Proposed TEST-1 (open question 5): a local-only test sign-in, never enabled in production. Google sign-in itself is checked manually once at CP-C. |
| Calendar refresh token expires after 7 days in Testing mode | High in Phase 3 | Decide the publishing status now (T0). |
| TypeScript 7 incompatible with typed lint rules | Medium | Pin TypeScript 5.9.3 (open question 1). |
| Vercel blocks deployments whose commit author is not on the Vercel account | Medium | Set the git author to the GitHub identity Vercel uses (open question 4). |
| Auth hook availability on the Supabase plan | Low | Verify in T12 against current Supabase docs; fallback is a `before insert` trigger on `auth.users` (PRD §9.4 allows either). |

## Owner decisions (2026-10-16)

1. TypeScript 5.9.3; revisit 7.x when `typescript-eslint` supports it (ADR 0001).
2. `@date-fns/tz` instead of `date-fns-tz`.
3. Docker Desktop is installed and running.
4. Git identity: use the machine's configured identity as is.
5. All seven additions approved and added to PRD.md: DB-1, DB-2 (§10.9), DL-12, DL-13 (§7.4; DL-13 also re-checks rules on restore), SPC-9 (§6.2; the rejection lists the blocking tasks), DEV-1 (not in production builds), TEST-1 (local/test only, with a check that production has email sign-in disabled) (§11).
6. Inter and Inter Tight self-hosted with `next/font`.
7. Constraint defaults accepted.

T0 status:
- Git: commit locally after each task; **no push and no GitHub remote** until the owner says so.
- GitHub repo and Vercel: **deferred**. T22 still creates the CI workflow file and a local script (`pnpm check:all`) running the same checks; running it on GitHub is deferred. **T23 (deployment) is deferred.**
- Supabase: Phase 0 develops against the **local** stack. Cloud project "daybook" (free plan, Southeast Asia / Singapore) is created and linked; keys only in `.env.local`; **migrations are not pushed** until the owner says so. Needs `supabase login` by the owner (browser approval).
- Google OAuth client: not created yet. Phase 0 signs in locally with TEST-1 email sign-in; Google sign-in is wired to need only the client ID and secret. At T14 the owner is walked through creating the OAuth client.

## Phase 1 obligations from the T9 adversarial review (2026-10-16)

- `reschedule_task` must accept tasks in Trash, so a restore refused by DL-13 can be fixed ("Reschedule it first").
- `reschedule_task(..., p_cascade_children)` and the DL-4 "move them together" path must update in a safe order: children first when moving earlier, parent first when moving later (checks are per row).
- `reschedule_space` must take `FOR UPDATE` on the space before touching its tasks (task writes take `FOR SHARE` on the space; the other order can deadlock two tabs).
- `app.today` is set only from trusted input. RPCs may use a client's `p_today` for computed views, never to set `app.today` before writes (it decides "late" for DL-12).
- Open question for the owner (review finding #2a): trashing a block, page, space or parent step that still contains late tasks moves those tasks to Trash without a `deleted_while_late` record.
