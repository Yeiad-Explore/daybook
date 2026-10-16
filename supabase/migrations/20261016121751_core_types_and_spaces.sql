-- Phase 0 T4: enums, shared helpers, profiles, spaces, pages, blocks (PRD §10.1, §10.3, §10.4, §10.5, DB-1).

create extension if not exists pg_trgm with schema extensions;

-- Internal helpers live outside the API-exposed `public` schema (security definer functions must
-- never be callable over the Data API: supabase.com/docs/guides/database/postgres/row-level-security).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- New tables in public get no automatic grants; each table grants exactly what `authenticated` needs.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

------------------------------------------------------------------------------------------------
-- Enums (§10.1)
------------------------------------------------------------------------------------------------
create type public.space_kind as enum ('goal', 'area');
create type public.space_status as enum ('active', 'achieved', 'missed', 'archived');
create type public.mark_color as enum ('moss', 'slate', 'ochre', 'teal', 'clay', 'graphite');
create type public.goal_metric as enum ('tasks', 'tracker', 'table_count', 'manual');
create type public.block_type as enum ('todo', 'roadmap', 'tracker', 'table', 'timeblock', 'routine', 'notes');
create type public.target_kind as enum ('at_most', 'at_least', 'reach');
create type public.column_kind as enum ('text', 'number', 'money', 'date', 'select', 'checkbox', 'url');
create type public.summary_kind as enum ('none', 'sum', 'avg', 'count');
create type public.sync_status as enum ('not_synced', 'pending', 'synced', 'failed', 'delete_pending');
create type public.connection_status as enum ('connected', 'needs_reconnect', 'disconnected');
create type public.deadline_change_kind as enum ('reschedule', 'deleted_while_late');
create type public.theme_pref as enum ('system', 'light', 'dark');

------------------------------------------------------------------------------------------------
-- Shared helpers
------------------------------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Enables RLS and creates the four owner policies from §10.5, plus the matching grants.
create function private.apply_owner_rls(p_table regclass, p_owner_col text default 'owner_id')
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('alter table %s enable row level security', p_table);
  execute format('grant select, insert, update, delete on %s to authenticated', p_table);
  execute format('create policy "owner can read" on %s for select to authenticated using (%I = (select auth.uid()))', p_table, p_owner_col);
  execute format('create policy "owner can insert" on %s for insert to authenticated with check (%I = (select auth.uid()))', p_table, p_owner_col);
  execute format('create policy "owner can update" on %s for update to authenticated using (%I = (select auth.uid())) with check (%I = (select auth.uid()))', p_table, p_owner_col, p_owner_col);
  execute format('create policy "owner can delete" on %s for delete to authenticated using (%I = (select auth.uid()))', p_table, p_owner_col);
end;
$$;

-- Used by a check constraint, so it must be callable by `authenticated`; it reads nothing.
create function public.is_valid_timezone(p_tz text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform now() at time zone p_tz;
  return true;
exception when others then
  return false;
end;
$$;

------------------------------------------------------------------------------------------------
-- profiles (§10.3, SET-1)
------------------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Dhaka' check (public.is_valid_timezone(timezone)),
  week_starts_on smallint not null default 6 check (week_starts_on between 0 and 6),
  currency text not null default 'BDT' check (currency ~ '^[A-Z]{3}$'),
  theme public.theme_pref not null default 'system',
  last_page_by_space jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

select private.apply_owner_rls('public.profiles', 'id');

-- DB-1: every auth user gets a profile with the §10.3 defaults.
create function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger create_profile after insert on auth.users
  for each row execute function private.create_profile_for_new_user();

------------------------------------------------------------------------------------------------
-- spaces (§10.3)
------------------------------------------------------------------------------------------------
create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.space_kind not null,
  name text not null check (char_length(name) between 1 and 60),
  mark public.mark_color not null default 'graphite',
  cover_path text,
  description text,
  end_goal text check (end_goal is null or char_length(end_goal) between 1 and 200),
  start_date date,
  deadline date,
  status public.space_status not null default 'active',
  status_changed_at timestamptz,
  metric public.goal_metric not null default 'tasks',
  metric_config jsonb not null default '{}',
  position numeric not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- C-DL-01, C-DL-08 (DL-5)
  constraint goal_has_deadline check (
    kind = 'area'
    or (end_goal is not null and start_date is not null and deadline is not null and start_date <= deadline)
  )
);

create index spaces_owner_kind_position on public.spaces (owner_id, kind, position) where deleted_at is null;

create trigger set_updated_at before update on public.spaces
  for each row execute function private.set_updated_at();

select private.apply_owner_rls('public.spaces');

------------------------------------------------------------------------------------------------
-- pages (§10.3)
------------------------------------------------------------------------------------------------
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  title text not null default 'Untitled page' check (char_length(title) between 1 and 80),
  position numeric not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pages_space_position on public.pages (space_id, position) where deleted_at is null;
create index pages_owner on public.pages (owner_id);

create trigger set_updated_at before update on public.pages
  for each row execute function private.set_updated_at();

select private.apply_owner_rls('public.pages');

------------------------------------------------------------------------------------------------
-- blocks (§10.3)
------------------------------------------------------------------------------------------------
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page_id uuid not null references public.pages (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  type public.block_type not null,
  title text not null,
  position numeric not null,
  collapsed boolean not null default false,
  span smallint not null default 12 check (span in (4, 6, 8, 12)),
  config jsonb not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index blocks_page_position on public.blocks (page_id, position) where deleted_at is null;
create index blocks_space_type on public.blocks (space_id, type);
create index blocks_owner on public.blocks (owner_id);

create trigger set_updated_at before update on public.blocks
  for each row execute function private.set_updated_at();

select private.apply_owner_rls('public.blocks');
