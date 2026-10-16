# Constraints

Last reviewed: 2026-10-16. Status: **accepted** by the owner on 2026-10-16.

Read this file before writing code. Do not weaken it to make a change pass. Tightening a rule is fine in any commit; loosening one needs the owner's OK and its own commit.

## Floor (always enforced)

- No new suppression comments: `@ts-ignore`, `@ts-expect-error` without a reason, `eslint-disable`, `istanbul ignore`.
- No unimplemented stubs (`throw new Error("Not implemented")`, `raise exception 'not implemented'`, empty `catch {}`), except the rows in **Exceptions**.
- No skipped (`.skip`, `.only`, `skip()` in pgTAP) or deleted tests without a reason in the commit message.
- No secrets in source or in git history.
- No raw colour values (`#hex`, `rgb(`, `rgba(`, `hsl(`) in components; only the token file may contain them (ADR 0002).
- Database rules below are never bypassed by the UI, and never weakened to make a UI test pass.

## Enforced with commands

Tools are installed by the Phase 0 tasks named in "Installed by". A row is binding from the moment its task is done.

| Dimension | Rule | Checked by | Runs at | Installed by |
|---|---|---|---|---|
| Types | Zero errors, `strict` on | `pnpm typecheck` (`tsc --noEmit`) | every edit, CI | T1 |
| Lint | Zero errors | `pnpm lint` (ESLint, Next.js config) | every edit, CI | T1 |
| Tokens | No raw colour values outside `src/styles/tokens.css` | `pnpm check:tokens` | every edit, CI | T2 |
| Unit tests | All pass | `pnpm test` (Vitest) | task end, CI | T2 |
| Database tests | All pass; every constraint in this file has a test | `supabase test db` (pgTAP) | task end, CI | T3 |
| End-to-end | All pass | `pnpm test:e2e` (Playwright) | task end, CI | T2 |
| Secrets | No findings | `gitleaks detect --redact --no-banner` | CI | T22 |
| Dependencies | Nothing at high or above | `pnpm audit --audit-level high` | CI | T22 |
| Accessibility | Zero critical or serious violations, light and dark | `@axe-core/playwright` in the e2e suite | task end, CI | T2 |
| Layout | No horizontal scroll at 400px and 1440px, light and dark | Playwright check in the e2e suite | task end, CI | T2 |

External checks (not judged by this project's own tests): axe-core (WCAG), `pnpm audit`, gitleaks.

## Database rules (PRD §7, §10.5, §10.6)

Every rule is enforced in Postgres (constraint, trigger, RLS policy or RPC) and has at least one pgTAP test. The UI may repeat a rule for a friendly message but never depends on it. "Today" means the owner's local date in `profiles.timezone`; RPCs take `p_today` so tests are deterministic (2026-10-16 with the PRD §12 seed).

### Deadline engine (§7)

| ID | Rule | PRD | Enforced by | Test file |
|---|---|---|---|---|
| C-DL-01 | A goal space has `end_goal`, `start_date` and `deadline` (all not null). | §7.1, SPC-1 | `spaces` check constraint | `030_deadline_engine` |
| C-DL-02 | A task in a goal space must have a `due_date`, on insert and on update. | §7.1, TODO-1 AC2 | `task_deadline_guard` | `030_deadline_engine` |
| C-DL-03 | A task in a life area may have no `due_date`. | §7.1 | (absence of a rule; tested so it stays allowed) | `030_deadline_engine` |
| C-DL-04 | DL-1: in a goal space, task `due_date` ≤ the space's `deadline`. | §7.2 | `task_deadline_guard` | `030_deadline_engine` |
| C-DL-05 | DL-2: a roadmap child's `due_date` ≤ its parent's `due_date`. | §7.2, RM-2 AC1 | `task_deadline_guard` | `030_deadline_engine` |
| C-DL-06 | DL-3: a parent's `due_date` cannot move earlier than any child's `due_date`. | §7.2, RM-7 | `task_deadline_guard` | `030_deadline_engine` |
| C-DL-07 | DL-4: a goal's `deadline` cannot move earlier than any of its tasks' `due_date`. | §7.2 | `space_deadline_guard` | `030_deadline_engine` |
| C-DL-08 | DL-5: goal `start_date` ≤ `deadline`. | §7.2 | `spaces` check constraint + `space_deadline_guard` | `030_deadline_engine` |
| C-DL-09 | Task status (`done_on_time`, `done_late`, `late`, `due_today`, `upcoming`, `undated`) is computed, never stored; no status column exists. | §7.3 | schema | `030_deadline_engine` |
| C-DL-10 | DL-6: an existing `due_date` can change only through `reschedule_task` (transaction-local flag `app.reschedule = on`). Setting a due date for the first time is allowed. Direct API updates are rejected. | §7.4, AC2 | `task_due_change_guard` | `030_deadline_engine` |
| C-DL-11 | DL-6: a goal's `deadline` can change only through `reschedule_space`. | §7.4, SPC-2 AC1 | `space_deadline_guard` | `030_deadline_engine` |
| C-DL-12 | DL-6: a reschedule needs a reason of at least 3 characters. | §7.4 | RPC + `deadline_changes` check | `030_deadline_engine` (Phase 1: RPC) |
| C-DL-13 | DL-7: every reschedule writes one `deadline_changes` row (old date, new date, reason, `was_late`, timestamp). | §7.4 | `reschedule_task`, `reschedule_space` | Phase 1 |
| C-DL-14 | DL-8: `reschedule_count` increases by exactly 1 per reschedule. | §7.4 | `reschedule_task` | Phase 1 |
| C-DL-15 | DL-9: a reschedule must satisfy C-DL-04…08; conflicts are returned, not silently applied. | §7.4 | RPCs + guards | Phase 1 |
| C-DL-16 | DL-10: late tasks stay in Overdue until done or rescheduled; there is no dismiss column or action. | §7.4 | schema + `get_today` | Phase 1 |
| C-DL-17 | DL-11: deleting a late task needs a reason and logs `deleted_while_late`. | §7.4 | `delete_task` | Phase 1 |
| C-DL-19 | DL-12: a late task cannot be soft-deleted by setting `deleted_at` directly; only `delete_task` may. | §7.4 | `task_soft_delete_guard` | `030_deadline_engine` |
| C-DL-20 | DL-13: soft-deleted tasks are ignored by C-DL-04…08. Restoring a task re-checks them and refuses with the rule's name if one would break. | §7.4 | guards (`deleted_at is null` filters) + `restore_item` | `030_deadline_engine` (restore: Phase 1) |
| C-DL-18 | `deadline_changes` targets exactly one thing: a task (`task_id` set) or the goal itself (`task_id` null). `new_due` is null only for `deleted_while_late`. `was_late` = old date before today at change time. | §10.3 | check constraints | `030_deadline_engine` |

### Spaces and maintained columns (SPC-9, DB-1, DB-2)

| ID | Rule | Enforced by | Test file |
|---|---|---|---|
| C-SPC-01 | SPC-9: changing a space from area to goal is rejected while any live task has no due date or is due after the new deadline; the error lists the blocking tasks. | `space_deadline_guard` | `030_deadline_engine` |
| C-DB-01 | DB-1: a `profiles` row with the §10.3 defaults is created when an `auth.users` row is created. | trigger on `auth.users` | `010_schema` |
| C-DB-02 | DB-2: the client cannot write `space_id`, `depth`, `completed_at`, `done` on roadmap parents, `reschedule_count` or the sync fields; triggers, RPCs and service-role code can. | guard triggers | `040_triggers` |

### Row Level Security (§10.5, §9.4)

| ID | Rule | Enforced by | Test file |
|---|---|---|---|
| C-RLS-01 | RLS is enabled on every table in `public`. | `enable row level security` | `020_rls` (catalog check: zero tables without RLS) |
| C-RLS-02 | Every table except `google_connections` and `deadline_changes`: select, insert, update and delete only where `owner_id = auth.uid()` (`profiles`: `id = auth.uid()`). | four policies per table | `020_rls` |
| C-RLS-03 | `owner_id` defaults to `auth.uid()`; inserting a row for another owner is rejected. | default + `with check` | `020_rls` |
| C-RLS-04 | A second, non-owner user reads zero rows and can insert, update or delete nothing in the owner's data, on every table. | policies | `020_rls` |
| C-RLS-05 | The `anon` role reads and writes nothing. | policies + grants | `020_rls` |
| C-RLS-06 | `deadline_changes` is append-only: select and insert policies only, no update or delete. | policies | `020_rls` |
| C-RLS-07 | `google_connections` has no policies for `authenticated` or `anon`; safe fields are read only through `get_calendar_status()`. | no policies | `020_rls` |
| C-RLS-08 | Child rows can only attach to parents owned by the same owner (no foreign ids from another owner). | `sync_space_id` + parent-owner checks | `020_rls` |

### Triggers (§10.6)

| ID | Trigger | Rule | Test file |
|---|---|---|---|
| C-TRG-01 | `set_updated_at` | Every editable table sets `updated_at = now()` before update. | `040_triggers` |
| C-TRG-02 | `sync_space_id` | `blocks`, `tasks`, `time_blocks` copy `space_id` from their page or block on insert and update; cross-owner parents are rejected. | `040_triggers` |
| C-TRG-03 | `block_type_guard` | `tasks` only in `todo`/`roadmap` blocks; `tracker_fields` only in `tracker`; `table_columns`/`table_rows` only in `table`; `time_blocks` only in `timeblock`; `routine_steps` only in `routine`; `notes` only in `notes`. | `040_triggers` |
| C-TRG-04 | `task_tree_guard` | `parent_id` only in roadmap blocks; parent in the same block; no cycles; depth ≤ 3 (4 levels). | `040_triggers` |
| C-TRG-05 | `task_deadline_guard` | C-DL-02, C-DL-04, C-DL-05, C-DL-06. | `030_deadline_engine` |
| C-TRG-06 | `task_due_change_guard` | C-DL-10. | `030_deadline_engine` |
| C-TRG-07 | `task_parent_done` | After insert, update or delete, `done`/`completed_at` are recomputed up the parent chain (parent done ⇔ all live children done). | `040_triggers` |
| C-TRG-08 | `task_completed_at` | `completed_at = now()` when `done` becomes true; cleared when false. | `040_triggers` |
| C-TRG-09 | `space_deadline_guard` | C-DL-07, C-DL-08, C-DL-11. | `030_deadline_engine` |
| C-TRG-10 | `table_cells_validate` | Each cell matches its column kind (text string; number/money number; date `YYYY-MM-DD`; select a valid option id; checkbox boolean; url http/https string); unknown column ids rejected. | `040_triggers` |
| C-TRG-11 | `time_block_sync_flag` | When title or times change, or the slot is soft-deleted, and Calendar is connected: `sync_status` = `pending` (or `delete_pending`) and attempts reset. | `040_triggers` |
| C-TRG-12 | `time_block_same_day` | `ends_at > starts_at`, and both fall on the same local date (profile timezone). | `040_triggers` |
| C-TRG-13 | `soft_delete_cascade` | Setting `deleted_at` on a space, page or block propagates to its children; clearing it on restore clears theirs. | `040_triggers` |

### Schema rules from §10.3 (also database-enforced)

| ID | Rule | Test file |
|---|---|---|
| C-SCH-01 | `blocks.type` is immutable after insert. | `040_triggers` |
| C-SCH-02 | `blocks.span` ∈ {4, 6, 8, 12}. | `010_schema` |
| C-SCH-03 | Lengths: space name 1–60, end goal 1–200, page title 1–80, task title 1–200. | `010_schema` |
| C-SCH-04 | `tracker_fields.decimals` 0–3; `target_kind` required when `target_value` is set. | `010_schema` |
| C-SCH-05 | Unique: `tracker_entries (field_id, entry_date)`, `routine_checks (step_id, check_date)`, `reviews (owner_id, week_start)`. | `010_schema` |
| C-SCH-06 | `profiles.timezone` is a valid IANA name; `week_starts_on` 0–6. | `010_schema` |

### Auth and environments (AUTH-2, §9.4, TEST-1, DEV-1)

| ID | Rule | Enforced by | Test file |
|---|---|---|---|
| C-AUTH-01 | Only the owner's email can create a user: a server-side allowlist rejects every other email before the user record exists. | Supabase Auth "Before User Created" hook (Postgres function) | `050_auth` |
| C-AUTH-02 | New sign-ups are disabled once the owner's account exists. | Supabase Auth setting (production) | manual check, recorded in the Phase 0 summary |
| C-AUTH-03 | TEST-1: email sign-in is enabled only in the local/test config; production is Google-only. | `[auth.email]` in `supabase/config.toml` vs production settings | `pnpm check:auth-config` (reads the production config via the Supabase CLI once linked) |
| C-DEV-01 | DEV-1: `/dev/primitives` does not exist in production builds. | build-time guard | e2e against `next build && next start` |

## Exceptions

| ID | Rule waived | Path | Reason | Owner | Expires |
|---|---|---|---|---|---|
| E1 | "No unimplemented stubs" | RPC functions from PRD §10.7 in `supabase/migrations` | Phase 0 creates their signatures, grants and security settings so later phases never reshape the schema. Each stub raises a clear "not available until Phase N" error and is replaced in its phase. | Owner | When the phase that implements each RPC ends (Phase 4 at the latest) |
