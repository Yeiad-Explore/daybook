-- Phase 0 T5: tasks and deadline_changes (PRD §10.3, §10.4, §10.5).
-- Task status is computed, never stored (§7.3, C-DL-09): there is deliberately no status column.

------------------------------------------------------------------------------------------------
-- tasks (To-do items and Roadmap steps)
------------------------------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  block_id uuid not null references public.blocks (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  parent_id uuid references public.tasks (id) on delete cascade,
  depth smallint not null default 0 check (depth between 0 and 3),
  title text not null check (char_length(title) between 1 and 200),
  note text,
  due_date date,
  due_time time,
  done boolean not null default false,
  completed_at timestamptz,
  is_milestone boolean not null default false,
  reschedule_count integer not null default 0 check (reschedule_count >= 0),
  repeat_rule jsonb,
  position numeric not null,
  gcal_event_id text,
  sync_status public.sync_status not null default 'not_synced',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_owner_done_due on public.tasks (owner_id, done, due_date) where deleted_at is null;
create index tasks_block_parent_position on public.tasks (block_id, parent_id, position) where deleted_at is null;
create index tasks_space on public.tasks (space_id) where deleted_at is null;
create index tasks_parent on public.tasks (parent_id);
create index tasks_title_trgm on public.tasks using gin (title extensions.gin_trgm_ops);

create trigger set_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();

select private.apply_owner_rls('public.tasks');

------------------------------------------------------------------------------------------------
-- deadline_changes (append-only log, §7.4 DL-7)
------------------------------------------------------------------------------------------------
create table public.deadline_changes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.deadline_change_kind not null default 'reschedule',
  task_id uuid references public.tasks (id) on delete set null,  -- null = the goal's own deadline
  space_id uuid not null references public.spaces (id) on delete cascade,
  item_title text not null,
  old_due date,
  new_due date,
  reason text not null check (char_length(reason) >= 3),
  was_late boolean not null,
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- C-DL-18: only a deletion has no new date.
  constraint new_due_unless_deleted check (kind = 'deleted_while_late' or new_due is not null)
);

create index deadline_changes_owner_changed on public.deadline_changes (owner_id, changed_at desc);
create index deadline_changes_space on public.deadline_changes (space_id);
create index deadline_changes_task on public.deadline_changes (task_id);

-- C-RLS-06: append-only. Select and insert only; no update or delete for anyone but the service role.
alter table public.deadline_changes enable row level security;
grant select, insert on public.deadline_changes to authenticated;
create policy "owner can read" on public.deadline_changes
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner can insert" on public.deadline_changes
  for insert to authenticated with check (owner_id = (select auth.uid()));
