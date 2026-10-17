-- Phase 1 CP-1: fixes from the adversarial review of 20261017100000_phase1_deadline_rpcs.sql.

------------------------------------------------------------------------------------------------
-- History is written only by Daybook (C-RLS-06 tightened): clients read deadline_changes but cannot
-- insert, so no "reschedule" or "deleted while late" row can be invented. task_id keeps the task's id
-- after the task is deleted forever (no foreign key, D-P1-13): null always means the goal's own deadline.
------------------------------------------------------------------------------------------------
drop policy "owner can insert" on public.deadline_changes;
revoke insert on public.deadline_changes from authenticated;
alter table public.deadline_changes drop constraint deadline_changes_task_id_fkey;

-- The only writer. Security definer (inserts are revoked from clients); private is not exposed by the
-- Data API. Callers pass the owner of the row they already read through RLS.
create function private.log_deadline_change(
  p_owner uuid, p_kind public.deadline_change_kind, p_task_id uuid, p_space_id uuid, p_title text,
  p_old date, p_new date, p_reason text, p_was_late boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.deadline_changes (owner_id, kind, task_id, space_id, item_title, old_due, new_due, reason, was_late)
  values (p_owner, p_kind, p_task_id, p_space_id, p_title, p_old, p_new, p_reason, p_was_late)
$$;
revoke execute on function private.log_deadline_change(uuid, public.deadline_change_kind, uuid, uuid, text, date, date, text, boolean) from public, anon;
grant execute on function private.log_deadline_change(uuid, public.deadline_change_kind, uuid, uuid, text, date, date, text, boolean) to authenticated, service_role;

------------------------------------------------------------------------------------------------
-- Flags: restore what the caller had instead of clearing it (review #11).
------------------------------------------------------------------------------------------------
drop function private.set_reschedule_flags(boolean);

------------------------------------------------------------------------------------------------
-- move_task_due: locks the row before reading its old date (review #2); explicit owner (review #10).
------------------------------------------------------------------------------------------------
create or replace function private.move_task_due(p_task_id uuid, p_new date, p_reason text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_old public.tasks;
begin
  select * into v_old from public.tasks where id = p_task_id for update;
  update public.tasks set due_date = p_new, reschedule_count = reschedule_count + 1 where id = p_task_id;
  perform private.log_deadline_change(v_old.owner_id, 'reschedule', v_old.id, v_old.space_id, v_old.title, v_old.due_date, p_new,
                                      p_reason, v_old.due_date < private.owner_today(v_old.owner_id));
end;
$$;

------------------------------------------------------------------------------------------------
-- reschedule_task. Lock order (review #1, C-DL-28): space (share), ancestors top-down (share), the
-- task (update), then descendants as they move. reschedule_space takes the space first too, so two
-- tabs queue instead of deadlocking. A trashed step carries the sub-steps trashed with it (review #8).
------------------------------------------------------------------------------------------------
create or replace function public.reschedule_task(p_task_id uuid, p_new_due date, p_reason text, p_cascade_children boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_task public.tasks;
  v_reason text;
  v_blockers jsonb;
  v_ids uuid[];
  v_id uuid;
  v_moved int := 0;
  v_prev_reschedule text := current_setting('app.reschedule', true);
  v_prev_internal text := current_setting('app.internal', true);
begin
  select space_id into v_space_id from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found.' using errcode = 'P0002';
  end if;
  perform 1 from public.spaces where id = v_space_id for share;
  perform 1 from (
    with recursive a as (
      select parent_id as id, 1 as up from public.tasks where id = p_task_id
      union all
      select t.parent_id, a.up + 1 from public.tasks t join a on t.id = a.id where t.parent_id is not null
    )
    select t.id from public.tasks t join a on t.id = a.id order by a.up desc for share of t
  ) locked;
  -- Trashed tasks are allowed (C-DL-20): a refused restore is fixed by rescheduling first.
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.space_id is distinct from v_space_id then
    raise exception 'This task just moved. Try again.' using errcode = '40001';
  end if;
  perform private.check_new_date(v_task.due_date, p_new_due, 'This task has no deadline yet. Set one by editing the task.');
  v_reason := private.require_reason(p_reason);

  -- DL-3: descendants due after the new date must move first (RM-7): live ones, or for a step in
  -- Trash the ones that went to Trash with it. Deepest first, all to the same date.
  with recursive d as (
    select id, title, due_date, depth from public.tasks
    where parent_id = p_task_id and deleted_at is not distinct from v_task.deleted_at
    union all
    select t.id, t.title, t.due_date, t.depth from public.tasks t join d on t.parent_id = d.id
    where t.deleted_at is not distinct from v_task.deleted_at
  )
  select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'due_date', due_date) order by due_date desc, title),
         array_agg(id order by depth desc)
    into v_blockers, v_ids
  from d where due_date > p_new_due;
  if v_blockers is not null and not p_cascade_children then
    return jsonb_build_object('status', 'conflict', 'rule', 'DL-3', 'new_due', p_new_due, 'blockers', v_blockers);
  end if;

  perform set_config('app.reschedule', 'on', true), set_config('app.internal', 'on', true);
  foreach v_id in array coalesce(v_ids, '{}') loop
    perform private.move_task_due(v_id, p_new_due, v_reason);
    v_moved := v_moved + 1;
  end loop;
  perform private.move_task_due(p_task_id, p_new_due, v_reason);
  perform set_config('app.reschedule', coalesce(v_prev_reschedule, ''), true), set_config('app.internal', coalesce(v_prev_internal, ''), true);

  -- moved = everything that got a new date (review #9: same meaning in reschedule_space).
  return jsonb_build_object('status', 'rescheduled', 'task_id', p_task_id, 'old_due', v_task.due_date,
                            'new_due', p_new_due, 'moved', v_moved + 1);
end;
$$;

------------------------------------------------------------------------------------------------
-- reschedule_space: same flag handling, explicit owner, `moved` counts the goal too.
------------------------------------------------------------------------------------------------
create or replace function public.reschedule_space(p_space_id uuid, p_new_deadline date, p_reason text, p_cascade_tasks boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_space public.spaces;
  v_reason text;
  v_blockers jsonb;
  v_moved int := 0;
  v_id uuid;
  v_prev_reschedule text := current_setting('app.reschedule', true);
  v_prev_internal text := current_setting('app.internal', true);
begin
  select * into v_space from public.spaces where id = p_space_id for update;
  if not found then
    raise exception 'Space not found.' using errcode = 'P0002';
  end if;
  perform private.check_new_date(v_space.deadline, p_new_deadline, 'This space has no deadline to move.');
  if p_new_deadline < v_space.start_date then
    raise exception '%', format('The deadline can''t be before the start date (%s).', private.fmt_day(v_space.start_date, v_space.owner_id))
      using errcode = '23514', detail = 'DL-5';
  end if;
  v_reason := private.require_reason(p_reason);

  if v_space.kind = 'goal' then
    select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'due_date', due_date) order by due_date desc, title)
      into v_blockers
    from public.tasks where space_id = p_space_id and deleted_at is null and due_date > p_new_deadline;
    if v_blockers is not null and not p_cascade_tasks then
      return jsonb_build_object('status', 'conflict', 'rule', 'DL-4', 'new_due', p_new_deadline, 'blockers', v_blockers);
    end if;
  end if;

  perform set_config('app.reschedule', 'on', true), set_config('app.internal', 'on', true);
  if v_blockers is not null then
    for v_id in
      select id from public.tasks where space_id = p_space_id and deleted_at is null and due_date > p_new_deadline order by depth desc, id
    loop
      perform private.move_task_due(v_id, p_new_deadline, v_reason);
      v_moved := v_moved + 1;
    end loop;
  end if;
  update public.spaces set deadline = p_new_deadline where id = p_space_id;
  perform private.log_deadline_change(v_space.owner_id, 'reschedule', null, p_space_id, v_space.name, v_space.deadline, p_new_deadline,
                                      v_reason, v_space.deadline < private.owner_today(v_space.owner_id));
  perform set_config('app.reschedule', coalesce(v_prev_reschedule, ''), true), set_config('app.internal', coalesce(v_prev_internal, ''), true);

  return jsonb_build_object('status', 'rescheduled', 'space_id', p_space_id, 'old_due', v_space.deadline,
                            'new_due', p_new_deadline, 'moved', v_moved + 1);
end;
$$;

------------------------------------------------------------------------------------------------
-- trash_item writes history through the helper and keeps the caller's app.internal (review #11).
------------------------------------------------------------------------------------------------
create or replace function public.trash_item(p_table text, p_id uuid, p_reason text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_reason text := nullif(trim(p_reason), '');
  v_live boolean;
  v_late jsonb;
  v_count int;
  v_prev_internal text := current_setting('app.internal', true);
begin
  if p_table is null or p_table not in ('spaces', 'pages', 'blocks', 'tasks') then
    raise exception 'Only spaces, pages, blocks and tasks go to Trash this way.' using errcode = '22023';
  end if;
  execute format('select deleted_at is null from public.%I where id = $1', p_table) into v_live using p_id;
  if v_live is null then
    raise exception 'Not found.' using errcode = 'P0002';
  elsif not v_live then
    raise exception 'It is already in Trash.' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'due_date', l.due_date) order by l.due_date, l.title), count(*)
    into v_late, v_count
  from private.late_tasks_in(p_table, p_id) l;

  if v_count > 0 and v_reason is null then
    return jsonb_build_object('status', 'needs_reason', 'late_tasks', v_late);
  end if;
  if v_count > 0 and char_length(v_reason) < 3 then
    raise exception 'A reason needs at least 3 characters.' using errcode = '23514', detail = 'DL-14';
  end if;

  perform private.log_deadline_change(t.owner_id, 'deleted_while_late', l.id, l.space_id, l.title, l.due_date, null, v_reason, true)
  from private.late_tasks_in(p_table, p_id) l join public.tasks t on t.id = l.id;

  perform set_config('app.internal', 'on', true);
  execute format('update public.%I set deleted_at = now() where id = $1', p_table) using p_id;
  perform set_config('app.internal', coalesce(v_prev_internal, ''), true);

  return jsonb_build_object('status', 'trashed', 'late_logged', v_count);
end;
$$;

------------------------------------------------------------------------------------------------
-- Pages (review #3, #4): the last-page check locks its space so two tabs cannot each trash "the other"
-- page; restoring a space whose pages were all deleted forever gives it a fresh "Overview".
-- "First page" is ordered by position, then created_at, then id, so ties are deterministic.
------------------------------------------------------------------------------------------------
create or replace function private.keep_one_page()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is null and (new.deleted_at is not null or new.space_id is distinct from old.space_id) then
    perform 1 from public.spaces where id = old.space_id for update;
    if (select deleted_at from public.spaces where id = old.space_id) is null
       and not exists (select 1 from public.pages where space_id = old.space_id and id <> old.id and deleted_at is null) then
      raise exception 'A space needs at least one page.' using errcode = '23514', detail = 'PG-6';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.restore_item(p_table text, p_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb;
  v_page uuid;
  v_moved uuid;
begin
  if p_table is null or p_table not in ('spaces', 'pages', 'blocks', 'tasks', 'table_rows', 'time_blocks') then
    raise exception 'Only spaces, pages, blocks, tasks, table rows and time slots go to Trash.' using errcode = '22023';
  end if;
  execute format('select to_jsonb(r) from public.%I r where id = $1', p_table) into v_row using p_id;
  if v_row is null then
    raise exception 'Not found.' using errcode = 'P0002';
  elsif v_row ->> 'deleted_at' is null then
    raise exception 'It is not in Trash.' using errcode = '22023';
  end if;

  -- Containers come back first (nothing live inside Trash, C-DL-22).
  if p_table in ('pages', 'blocks') and (select deleted_at from public.spaces where id = (v_row ->> 'space_id')::uuid) is not null then
    raise exception 'Restore its space first.' using errcode = '22023';
  end if;
  if p_table = 'blocks' and (select deleted_at from public.pages where id = (v_row ->> 'page_id')::uuid) is not null then
    -- SET-3: the original page is gone, so the block goes to the space's first page.
    select id into v_page from public.pages
    where space_id = (v_row ->> 'space_id')::uuid and deleted_at is null order by position, created_at, id limit 1;
    if v_page is null then
      raise exception 'Restore its page first.' using errcode = '22023';
    end if;
    v_moved := v_page;
  end if;
  if p_table in ('tasks', 'table_rows', 'time_blocks')
     and (select deleted_at from public.blocks where id = (v_row ->> 'block_id')::uuid) is not null then
    raise exception 'Restore its block first.' using errcode = '22023';
  end if;
  if p_table = 'tasks' and (select deleted_at from public.tasks where id = (v_row ->> 'parent_id')::uuid) is not null then
    raise exception 'Restore the step it belongs to first.' using errcode = '22023';
  end if;

  -- The deadline guards re-check DL-1..3 for everything that comes back (DL-13).
  if v_moved is not null then
    update public.blocks set page_id = v_moved, deleted_at = null where id = p_id;
  else
    execute format('update public.%I set deleted_at = null where id = $1', p_table) using p_id;
  end if;
  if p_table = 'spaces' and not exists (select 1 from public.pages where space_id = p_id and deleted_at is null) then
    insert into public.pages (owner_id, space_id, title, position) values ((v_row ->> 'owner_id')::uuid, p_id, 'Overview', 0);
  end if;

  return jsonb_build_object('status', 'restored', 'table', p_table, 'id', p_id)
         || case when v_moved is not null then jsonb_build_object('moved_to_page', v_moved) else '{}' end;
end;
$$;

------------------------------------------------------------------------------------------------
-- purge_trash (review #6): a container still holding a slot that waits to leave Google Calendar stays
-- until Phase 3's sync has removed the event (foreign-key cascades would otherwise take the slot).
------------------------------------------------------------------------------------------------
create or replace function public.purge_trash()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_table text;
  v_count int;
  v_total int := 0;
  v_pending constant text := ' and not exists (select 1 from public.time_blocks tb where tb.%s = x.id and tb.sync_status = ''delete_pending'')';
begin
  foreach v_table in array array['spaces', 'pages', 'blocks', 'tasks', 'table_rows', 'time_blocks'] loop
    execute format(
      'with d as (delete from public.%I x where x.deleted_at < now() - interval ''30 days''%s returning 1) select count(*) from d',
      v_table,
      case v_table
        when 'spaces' then format(v_pending, 'space_id')
        when 'pages' then ' and not exists (select 1 from public.time_blocks tb join public.blocks b on b.id = tb.block_id where b.page_id = x.id and tb.sync_status = ''delete_pending'')'
        when 'blocks' then format(v_pending, 'block_id')
        when 'time_blocks' then ' and x.sync_status <> ''delete_pending'''
        else ''
      end)
      into v_count;
    v_total := v_total + v_count;
  end loop;
  return v_total;
end;
$$;

------------------------------------------------------------------------------------------------
-- SPC-1 AC1: a goal without a deadline is rejected with the PRD's words on insert too.
------------------------------------------------------------------------------------------------
create function private.space_insert_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'goal' and new.deadline is null then
    raise exception 'A goal needs a deadline.' using errcode = '23514', detail = 'SPC-1';
  end if;
  return new;
end;
$$;

create trigger space_insert_guard before insert on public.spaces
  for each row execute function private.space_insert_guard();
