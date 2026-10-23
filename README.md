# Daybook

Daybook is a private, single-user life-OS web app: goals with strict deadlines, ongoing life areas, pages built from seven block types, a Today screen, and one-way Google Calendar sync. "Daybook" is a working name.

`DESIGN.md` is the visual source and is in this repo. The behaviour spec, constraints and decision records stay on the owner's machine and are not published here.

---

# Part 1: Using Daybook

## What this project is

Daybook is one person's life on one private website. It holds what you **plan** to do and records what you **actually did**: health, learning, your agency, money, routines, personal life. Only your Google account can sign in. There are no teams, sharing, public pages or analytics.

Its core idea is **strict deadlines**. Every goal has an end date, every task inside it has a date, and the system refuses impossible dates, keeps late work visible until it is done, and makes every postponement deliberate and recorded.

## How it is organised: Space > Page > Block

- **Space**: a top-level container.
  - **Goal**: an end goal sentence, a start date and a deadline ("Reach 72 kg by 31 Jan"). It can end as achieved, missed or archived.
  - **Life area**: ongoing, no end date (Finance, Skincare, Personal).
- **Page**: a tab inside a space (Tracker, Roadmap, Products...). Pages are one level deep.
- **Block**: a piece of content on a page. There are seven types.

| Block | Use it for |
|---|---|
| **To-do list** | Tasks with deadlines. Overdue and due-today tasks flow to Today. |
| **Roadmap** | A big plan broken into stages and smaller steps (up to 4 levels), each with its own deadline. |
| **Tracker** | Numbers you log daily (weight, calories, study hours) with a trend chart and optional target. |
| **Table** | Any records: clients, products, meals, a money ledger. Typed columns, filters, sums, month grouping. |
| **Time block** | Booking time. Slots are pushed to your Google Calendar. |
| **Routine** | A daily or weekday checklist with a streak and a 12-week history. |
| **Notes** | Rich writing with Markdown shortcuts; autosaves. |

Because everything is built from these seven blocks, a CRM, a food log, a finance ledger and a product catalogue are all just Tables with different columns.

## The screens

| Screen | What it does |
|---|---|
| **Today** (`/today`) | The home screen. Overdue, due today and the next 7 days from every space; a day timetable with a NOW line; your routines; "log today" for each tracker; quick add. |
| **Space page** | A header with countdown, **Deadline Rail** (start to deadline, milestones, today) and progress, then the page's blocks. |
| **Space settings** | Name, colour, cover photo, end goal, dates, progress metric, and Mark achieved / Close as missed / Archive / Delete. |
| **Deadline history** (`/history`) | Every reschedule with its reason, filterable by space. |
| **Settings** | Profile (name, timezone, week start, currency, theme), Google Calendar, and Data (Trash). |
| **Command palette / Review** | Planned (Phase 4), see below. |

## Things you can do

- **Set a goal with a hard end date** and break it down: goal, stage, step, daily task. A task cannot be due after its goal, and a sub-step cannot be due after its parent.
- **See what to do right now** on Today. Late work stays listed, with how late it is ("2d late"), until it is done or rescheduled.
- **Move a deadline only with a reason.** Quick picks (tomorrow, +3 days, next week) are offered, but a reason of 3+ characters is always required. Tasks show "moved 2x" and every move is logged.
- **Track progress your way.** A goal's progress can be computed from tasks done, a tracker value (e.g. weight 78.4 towards 72), a count of table rows (e.g. 2 of 5 retainer clients), or entered by hand.
- **Log numbers in seconds** from Today or the tracker block; one entry per field per day.
- **Build checklists with streaks**, including weekday-only routines.
- **Time-block your day** and have it appear in Google Calendar (see below). Optionally push task deadlines as all-day events.
- **Capture fast:** press `N` anywhere to add a task.
- **Undo mistakes.** Deleting anything goes to Trash for 30 days, with Undo for 6 seconds. Deleting a *late* task asks for a reason and records it, so deadlines cannot be quietly erased.
- **Work on a phone** (every screen is usable at 400 px) and in light, dark or system theme.

## Google Calendar

Daybook writes to your **primary** Google Calendar, one way (it never reads or changes your other events), using the narrow `calendar.events.owned` scope.

1. Sign in with Google (this requests Calendar access once).
2. Add a slot in a Time block: it goes from *Not on calendar* to *Syncing* to *On Google Calendar*. Editing the slot updates the event; deleting the slot deletes it.
3. Failures retry automatically (10 minutes, 30 minutes, 2 hours, then daily) and stop after five; press **Retry**.
4. If Google stops accepting the saved sign-in, Daybook shows "Reconnect Google Calendar". See "Reconnect Google Calendar" below.

## Using it day to day

- **Morning:** open Today. Clear or reschedule everything in Overdue (with a reason), then look at Due today and the timetable.
- **During the day:** tick tasks, check routine steps, log trackers, add slots.
- **Weekly:** look at `/history` to see where deadlines keep slipping.
- **Setting up:** create a goal, add a roadmap with dated stages, add a to-do block for daily tasks, a tracker for the number that matters, and a time block for study or work sessions.

## What is built and what is not

Built: sign-in (owner only), spaces, pages, all seven blocks, the deadline engine and history, Today, Trash, trackers, tables, routines, time blocks, quick capture, Google Calendar sync.

**Not built yet (Phase 4):** weekly review, command palette and search (`Ctrl+K`), table board view, CSV import/export, JSON export, repeating tasks, turning a note line into a task, duplicating and moving pages and blocks. `/review` is a placeholder until then.

---

# Part 2: Running and deploying Daybook

Stack: Next.js (App Router) + TypeScript on Vercel; Supabase (Postgres, Auth, RLS, Edge Functions, Cron, Vault, Storage) as the only backend; pnpm.

## Setup (local)

You need Node 22+, pnpm, Docker (for the local Supabase stack) and the Supabase CLI (`pnpm exec supabase`).

```bash
pnpm install
pnpm db:start                   # local Supabase (Docker); applies migrations
cp .env.example .env.local      # fill in the values below
pnpm dev                        # http://localhost:3000
```

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local`, Vercel | Supabase API URL. Local: `pnpm exec supabase status`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local`, Vercel | Publishable (anon-level) key. The only key the browser ever sees. |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` | `.env.local` | Read by `supabase/config.toml` for the **local** stack's Google sign-in only. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL` | Edge Function secrets | Calendar sync. `GOOGLE_CLIENT_ID` must be the same OAuth client Supabase uses for sign-in (GC-D17). Locally in `supabase/functions/.env` (gitignored); on the cloud project with `supabase secrets set`. |
| `SUPABASE_CLOUD_*` | `.env.local` only | Project ref, URL and keys of the cloud project. Never used by the app; never on Vercel. |

Secrets (Google client secret, secret/service-role key) live only in Supabase and Edge Function environments. Never in the browser, never committed (CI runs gitleaks).

### First sign-in and seed data

Only the owner's email (set in `private.signup_allowlist`) can sign in. The database rejects every other address before a user exists (`private.before_user_created`).
After the first sign-in, load the starting setup into the **local** stack:

```bash
pnpm seed             # with the demo examples
pnpm seed -- --empty  # structure only
```

The script refuses non-local URLs. For the cloud project, call `seed_owner` yourself only if you want the starting structure there; it refuses an owner who already has spaces.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Dev server / production build / serve the build |
| `pnpm check:fast` | typecheck + lint + token check (after every edit) |
| `pnpm test` | Vitest unit tests |
| `pnpm test:db` | pgTAP database tests (`supabase/tests/`) |
| `pnpm test:e2e` | Playwright. Starts `pnpm dev` on port 3100; with a dev server already running use `E2E_BASE_URL=http://localhost:3000`. Needs `pnpm functions:e2e` running in another terminal. |
| `pnpm check:all` | Everything CI runs |
| `pnpm tokens` | Regenerate `src/styles/tokens.css` from `DESIGN.md` |

## Migrations

Schema changes only through versioned migrations in `supabase/migrations/`.

```bash
pnpm exec supabase migration new <name>   # write the SQL
pnpm db:reset                             # rebuild the local DB from migrations
pnpm db:types                             # regenerate src/lib/database.types.ts (always, after a migration)
pnpm test:db
```

Every new function in `public` gets `revoke execute ... from public, anon` and an explicit `grant ... to authenticated`; `security definer` functions live in `private`.

Pushing to the cloud project is a deliberate step, never part of a normal change:

```bash
pnpm exec supabase link --project-ref <ref>
pnpm exec supabase db push --dry-run     # read the list first
pnpm exec supabase db push
pnpm exec supabase functions deploy calendar-sync store-google-token
pnpm exec supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... APP_URL=https://<your domain>
```

Calendar cron (`calendar_retry`, every 10 minutes) reads two Vault entries, `calendar_sync_url` (the `calendar-sync` function URL) and `calendar_sync_key` (the project secret key). It does nothing while they are missing. Create them once on the cloud project with `vault.create_secret(...)` in the SQL editor.

## Production (Supabase and Vercel)

Before a public URL:

1. **Email sign-in must be off** in the cloud Auth settings. The allowlist checks the email address only, so with email sign-up on, anyone could register the owner's address with a password.
2. Enable the **Before User Created** hook pointing at `private.before_user_created`.
3. Disable new sign-ups after the owner's first sign-in.
4. Google provider: production OAuth client, redirect `https://<project-ref>.supabase.co/auth/v1/callback`; add the production site URL and `https://<domain>/**` to the Auth redirect list.
5. Vercel: set the two `NEXT_PUBLIC_SUPABASE_*` variables; protect preview deployments.

## Backup and export

- **Supabase backups:** the cloud project's daily backups (availability depends on the plan; check Dashboard > Database > Backups).
- **Your own copy:** `pnpm exec supabase db dump --linked -f backup.sql` (add `--data-only` for rows only). Keep the file private: it holds your whole life.
- **In-app export (SET-2, JSON and CSV):** planned in Phase 4, not built yet. Until then use the dump above.
- **Trash:** deleted items stay restorable for 30 days under Settings > Data.

## Reconnect Google Calendar

Daybook only writes to the primary calendar of the signed-in Google account, one way, with the narrow scope `calendar.events.owned`.

- **Status:** Settings > Google Calendar shows the connection, last sync and failures.
- **"Reconnect Google Calendar" appears** when Google rejects the stored refresh token (revoked, unused for 6 months, or expired). While the Google Cloud consent screen is in *Testing*, tokens expire after 7 days: set it to *In production* (owner only, unverified is fine).
- **To reconnect:** press **Reconnect** in Settings > Google Calendar (or sign out and sign in again with Google). Consent is requested again, a new refresh token is stored in Vault, and everything that waited is retried.
- **Existing slots after a disconnect** show *Not on calendar*; add them again with **Add to Google Calendar**. New slots follow the Time block's auto-add setting.
- **Failed slots** retry at 10 minutes, 30 minutes, 2 hours, then daily; after five failures press **Retry**.

## Rollback

- **App:** Vercel > Deployments > pick the previous production deployment > Promote to Production (or `vercel rollback`). The app has no build-time data, so this is instant.
- **Database:** migrations are forward-only. Fix a bad migration with a new one; restore from a Supabase backup only for data loss.
- **Edge Functions:** redeploy the previous commit with `supabase functions deploy`.
