-- Phase 0 T6: tracker, table, time slot, routine, notes, google_connections, reviews
-- (PRD §10.3, §10.4, §10.5).

------------------------------------------------------------------------------------------------
-- Tracker
------------------------------------------------------------------------------------------------
create table public.tracker_fields (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  block_id uuid not null references public.blocks (id) on delete cascade,
  label text not null,
  unit text,
  decimals smallint not null default 1 check (decimals between 0 and 3),
  target_value numeric,
  target_kind public.target_kind,
  position numeric not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint target_needs_kind check (target_value is null or target_kind is not null)
);

create index tracker_fields_block_position on public.tracker_fields (block_id, position);

create table public.tracker_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  field_id uuid not null references public.tracker_fields (id) on delete cascade,
  block_id uuid not null references public.blocks (id) on delete cascade,
  entry_date date not null,
  value numeric not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- TRK-2 AC1: one entry per field per date. Also serves the §10.4 (field_id, entry_date desc) reads.
  constraint one_entry_per_field_per_day unique (field_id, entry_date)
);

create index tracker_entries_block_date on public.tracker_entries (block_id, entry_date);

------------------------------------------------------------------------------------------------
-- Table
------------------------------------------------------------------------------------------------
create table public.table_columns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  block_id uuid not null references public.blocks (id) on delete cascade,
  name text not null,
  kind public.column_kind not null default 'text',
  options jsonb not null default '[]',
  signed boolean not null default false,
  summary public.summary_kind not null default 'none',
  position numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index table_columns_block_position on public.table_columns (block_id, position);

create table public.table_rows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  block_id uuid not null references public.blocks (id) on delete cascade,
  cells jsonb not null default '{}',
  position numeric not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index table_rows_block_position on public.table_rows (block_id, position) where deleted_at is null;
create index table_rows_cells on public.table_rows using gin (cells);
create index table_rows_text_trgm on public.table_rows using gin ((cells::text) extensions.gin_trgm_ops);

------------------------------------------------------------------------------------------------
-- Time slots
------------------------------------------------------------------------------------------------
create table public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  block_id uuid not null references public.blocks (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  gcal_event_id text,
  sync_status public.sync_status not null default 'not_synced',
  sync_attempts smallint not null default 0,
  sync_error text,
  next_sync_at timestamptz,
  last_synced_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- TB-1 AC1. The same-local-day rule (TB-1 AC2) needs the profile timezone: trigger in T10.
  constraint ends_after_start check (ends_at > starts_at)
);

create index time_blocks_owner_starts on public.time_blocks (owner_id, starts_at) where deleted_at is null;
create index time_blocks_sync on public.time_blocks (sync_status, next_sync_at);
create index time_blocks_block on public.time_blocks (block_id);

------------------------------------------------------------------------------------------------
-- Routine
------------------------------------------------------------------------------------------------
create table public.routine_steps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  block_id uuid not null references public.blocks (id) on delete cascade,
  label text not null,
  position numeric not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index routine_steps_block_position on public.routine_steps (block_id, position);

create table public.routine_checks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  step_id uuid not null references public.routine_steps (id) on delete cascade,
  block_id uuid not null references public.blocks (id) on delete cascade,
  check_date date not null,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint one_check_per_step_per_day unique (step_id, check_date)
);

create index routine_checks_block_date on public.routine_checks (block_id, check_date);

------------------------------------------------------------------------------------------------
-- Notes
------------------------------------------------------------------------------------------------
create table public.notes (
  block_id uuid primary key references public.blocks (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body jsonb not null default '{}',
  body_text text not null default '',
  -- 'simple' config: notes mix languages, so no stemming.
  search tsvector generated always as (to_tsvector('simple', body_text)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_search on public.notes using gin (search);

------------------------------------------------------------------------------------------------
-- Google connection (§8.2). RLS on, no policies and no grants: service role and RPCs only (C-RLS-07).
------------------------------------------------------------------------------------------------
create table public.google_connections (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  google_email text not null,
  scopes text[] not null,
  refresh_token_secret_id uuid,
  calendar_id text not null default 'primary',
  status public.connection_status not null default 'connected',
  push_deadlines boolean not null default false,
  auto_sync_new_blocks boolean not null default true,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_connections enable row level security;

------------------------------------------------------------------------------------------------
-- Weekly reviews (§5.6)
------------------------------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  stats jsonb not null,
  went_well text,
  slipped text,
  next_priority text,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint one_review_per_week unique (owner_id, week_start)
);

------------------------------------------------------------------------------------------------
-- updated_at triggers and RLS
------------------------------------------------------------------------------------------------
create trigger set_updated_at before update on public.tracker_fields for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tracker_entries for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.table_columns for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.table_rows for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.time_blocks for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.routine_steps for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.notes for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.google_connections for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.reviews for each row execute function private.set_updated_at();

select private.apply_owner_rls('public.tracker_fields');
select private.apply_owner_rls('public.tracker_entries');
select private.apply_owner_rls('public.table_columns');
select private.apply_owner_rls('public.table_rows');
select private.apply_owner_rls('public.time_blocks');
select private.apply_owner_rls('public.routine_steps');
select private.apply_owner_rls('public.routine_checks');
select private.apply_owner_rls('public.notes');
select private.apply_owner_rls('public.reviews');
