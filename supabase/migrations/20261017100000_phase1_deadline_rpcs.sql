-- Phase 1: the deadline engine RPCs (PRD §7.4, §10.7): reschedule_task, reschedule_space,
-- delete_task, set_task_done; the read models get_today (agenda) and space_summary; restore_item,
-- purge_trash (+ schedule), reorder; the "Overview" page, the last-page rule and status_changed_at.
-- Constraints: C-DL-12..17, C-DL-20, C-DL-25..28, C-TODAY-01, C-SPC-02, C-SPC-03, C-PG-01,
-- C-TRASH-01, C-ORD-01.
--
-- Errors follow Phase 0: 23514 = a rule (UI-ready message), 42501 = use the RPC, 22023 = a request
-- that cannot apply (no deadline, same date, container in Trash), P0002 = not found or not yours.
-- All RPCs are security invoker: RLS decides what the caller can read and write.

------------------------------------------------------------------------------------------------
-- Dates (C-DL-27). Writes never take "today" from the client: owner_today reads app.today (set only
-- by tests and trusted code, never exposed by PostgREST) or the owner's local date.
------------------------------------------------------------------------------------------------
create function private.local_date(p_at timestamptz, p_owner uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone coalesce((select timezone from public.profiles where id = p_owner), 'Asia/Dhaka'))::date
$$;

create or replace function private.owner_today(p_owner uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('app.today', true), '')::date, private.local_date(now(), p_owner))
$$;

-- C-DL-12: at least 3 characters once trimmed. Returns the trimmed reason.
create function private.require_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'A reason needs at least 3 characters.' using errcode = '23514', detail = 'DL-6';
  end if;
  return trim(p_reason);
end;
$$;

-- C-DL-25: the checks every reschedule shares.
create function private.check_new_date(p_old date, p_new date, p_no_deadline text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_old is null then
    raise exception '%', p_no_deadline using errcode = '22023', detail = 'DL-6';
  elsif p_new is null then
    raise exception 'Pick a new date.' using errcode = '22023', detail = 'DL-6';
  elsif p_new = p_old then
    raise exception 'That is already the deadline.' using errcode = '22023', detail = 'DL-6';
  end if;
end;
$$;

-- One reschedule of one task: new date, count + 1, one history row (DL-7, DL-8). The caller has set
-- app.reschedule (DL-6 guard) and app.internal (reschedule_count is maintained, DB-2).
-- Phase 3 adds marking the task's Calendar deadline event for sync here (GC-11).
create function private.move_task_due(p_task_id uuid, p_new date, p_reason text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_old public.tasks;
begin
  select * into v_old from public.tasks where id = p_task_id;
  update public.tasks set due_date = p_new, reschedule_count = reschedule_count + 1 where id = p_task_id;
  insert into public.deadline_changes (kind, task_id, space_id, item_title, old_due, new_due, reason, was_late)
  values ('reschedule', v_old.id, v_old.space_id, v_old.title, v_old.due_date, p_new, p_reason,
          v_old.due_date < private.owner_today(v_old.owner_id));
end;
$$;

create function private.set_reschedule_flags(p_on boolean)
returns void
language sql
set search_path = ''
as $$
  select set_config('app.reschedule', case when p_on then 'on' else '' end, true),
         set_config('app.internal', case when p_on then 'on' else '' end, true)
$$;

------------------------------------------------------------------------------------------------
-- reschedule_task (DL-6..9, RM-7, C-DL-26)
------------------------------------------------------------------------------------------------
create or replace function public.reschedule_task(p_task_id uuid, p_new_due date, p_reason text, p_cascade_children boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_task public.tasks;
  v_reason text;
  v_blockers jsonb;
  v_ids uuid[];
  v_moved int := 0;
  v_id uuid;
begin
  -- Trashed tasks are allowed (C-DL-20): a refused restore is fixed by rescheduling first.
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found.' using errcode = 'P0002';
  end if;
  perform private.check_new_date(v_task.due_date, p_new_due, 'This task has no deadline yet. Set one by editing the task.');
  v_reason := private.require_reason(p_reason);

  -- DL-3: live descendants due after the new date must move first (RM-7). Deepest first: every
  -- blocker lands on the same date, so no step ever sits after its parent.
  with recursive d as (
    select id, title, due_date, depth from public.tasks where parent_id = p_task_id and deleted_at is null
    union all
    select t.id, t.title, t.due_date, t.depth from public.tasks t join d on t.parent_id = d.id where t.deleted_at is null
  )
  select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'due_date', due_date) order by due_date desc, title),
         array_agg(id order by depth desc)
    into v_blockers, v_ids
  from d where due_date > p_new_due;
  if v_blockers is not null and not p_cascade_children then
    return jsonb_build_object('status', 'conflict', 'rule', 'DL-3', 'new_due', p_new_due, 'blockers', v_blockers);
  end if;

  perform private.set_reschedule_flags(true);
  foreach v_id in array coalesce(v_ids, '{}') loop
    perform private.move_task_due(v_id, p_new_due, v_reason);
    v_moved := v_moved + 1;
  end loop;
  perform private.move_task_due(p_task_id, p_new_due, v_reason);
  perform private.set_reschedule_flags(false);

  return jsonb_build_object('status', 'rescheduled', 'task_id', p_task_id, 'old_due', v_task.due_date,
                            'new_due', p_new_due, 'moved', v_moved + 1);
end;
$$;

------------------------------------------------------------------------------------------------
-- reschedule_space (DL-4, DL-5, DL-6; D-P1-4 adds p_cascade_tasks). C-DL-28: the space is locked
-- before its tasks are read, the same order task writes use (they take FOR SHARE on the space).
------------------------------------------------------------------------------------------------
drop function public.reschedule_space(uuid, date, text);

create function public.reschedule_space(p_space_id uuid, p_new_deadline date, p_reason text, p_cascade_tasks boolean default false)
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

  perform private.set_reschedule_flags(true);
  if v_blockers is not null then
    for v_id in
      select id from public.tasks where space_id = p_space_id and deleted_at is null and due_date > p_new_deadline order by depth desc
    loop
      perform private.move_task_due(v_id, p_new_deadline, v_reason);
      v_moved := v_moved + 1;
    end loop;
  end if;
  update public.spaces set deadline = p_new_deadline where id = p_space_id;
  insert into public.deadline_changes (kind, task_id, space_id, item_title, old_due, new_due, reason, was_late)
  values ('reschedule', null, p_space_id, v_space.name, v_space.deadline, p_new_deadline, v_reason,
          v_space.deadline < private.owner_today(v_space.owner_id));
  perform private.set_reschedule_flags(false);

  return jsonb_build_object('status', 'rescheduled', 'space_id', p_space_id, 'old_due', v_space.deadline,
                            'new_due', p_new_deadline, 'moved', v_moved);
end;
$$;

revoke execute on function public.reschedule_space(uuid, date, text, boolean) from public, anon;
grant execute on function public.reschedule_space(uuid, date, text, boolean) to authenticated, service_role;

------------------------------------------------------------------------------------------------
-- delete_task (DL-11): Trash through trash_item, which logs late tasks (DL-14). Without a reason
-- for a late task, nothing is deleted.
------------------------------------------------------------------------------------------------
create or replace function public.delete_task(p_task_id uuid, p_reason text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_result jsonb := public.trash_item('tasks', p_task_id, p_reason);
begin
  if v_result ->> 'status' = 'needs_reason' then
    if v_result -> 'late_tasks' @> jsonb_build_array(jsonb_build_object('id', p_task_id)) then
      raise exception 'This task is late. Give a reason to delete it, so it shows in your deadline history.' using errcode = '22023', detail = 'DL-11';
    end if;
    raise exception 'Steps inside this one are late. Give a reason to delete it, so they show in your deadline history.' using errcode = '22023', detail = 'DL-14';
  end if;
end;
$$;

------------------------------------------------------------------------------------------------
-- set_task_done (TODO-2, RM-3, TODAY-3). A plain update: the task_done guard keeps parents
-- derived from their children.
------------------------------------------------------------------------------------------------
create or replace function public.set_task_done(p_task_id uuid, p_done boolean)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.tasks set done = p_done where id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'Task not found.' using errcode = 'P0002';
  end if;
end;
$$;

------------------------------------------------------------------------------------------------
-- get_today (PRD §5.3 agenda, Appendix A, C-TODAY-01). p_today only shapes this read.
------------------------------------------------------------------------------------------------
create or replace function public.get_today(p_today date default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with d as (select coalesce(p_today, private.owner_today((select auth.uid()))) as today),
  agenda as (
    select t.*, b.page_id, s.name as space_name, s.mark,
           -- RM-8: "Space · Page · Stage"; the stage is the step's depth-0 ancestor.
           concat_ws(' · ', s.name, p.title, coalesce(a3.title, a2.title, a1.title)) as source
    from public.tasks t
    join public.blocks b on b.id = t.block_id and b.deleted_at is null
    join public.pages p on p.id = b.page_id and p.deleted_at is null
    join public.spaces s on s.id = t.space_id and s.deleted_at is null and s.status = 'active'
    left join public.tasks a1 on a1.id = t.parent_id
    left join public.tasks a2 on a2.id = a1.parent_id
    left join public.tasks a3 on a3.id = a2.parent_id
    cross join d
    where t.deleted_at is null
      and t.due_date <= d.today + 7
      and not exists (select 1 from public.tasks c where c.parent_id = t.id and c.deleted_at is null)
  ),
  rows as (
    select a.*, jsonb_build_object(
             'id', a.id, 'title', a.title, 'due_date', a.due_date, 'due_time', a.due_time, 'done', a.done,
             'done_late', a.done and private.local_date(a.completed_at, a.owner_id) > a.due_date,
             'reschedule_count', a.reschedule_count, 'is_milestone', a.is_milestone, 'note', a.note,
             'parent_id', a.parent_id, 'block_id', a.block_id, 'page_id', a.page_id, 'space_id', a.space_id,
             'space_name', a.space_name, 'mark', a.mark, 'source', a.source) as j
    from agenda a
  )
  select jsonb_build_object(
    'today', d.today,
    'late_count', (select count(*) from rows where not done and due_date < d.today),
    'overdue', coalesce((select jsonb_agg(j order by due_date, due_time nulls last, position) from rows
                         where not done and due_date < d.today), '[]'),
    'due_today', coalesce((select jsonb_agg(j order by done, due_time nulls last, position) from rows
                           where due_date = d.today), '[]'),
    'next_7', coalesce((select jsonb_agg(j order by due_date, due_time nulls last, position) from rows
                        where not done and due_date > d.today), '[]'))
  from d
$$;

------------------------------------------------------------------------------------------------
-- space_summary (SPC-6, SPC-7 `tasks` per D-P1-5, SPC-8, Appendix C; C-SPC-02)
------------------------------------------------------------------------------------------------
create or replace function public.space_summary(p_space_id uuid, p_today date default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_space public.spaces;
  v_today date;
  v_goal boolean;
  v_done int;
  v_total int;
  v_milestones jsonb;
  v_due_counts jsonb;
begin
  select * into v_space from public.spaces where id = p_space_id;
  if not found then
    raise exception 'Space not found.' using errcode = 'P0002';
  end if;
  v_today := coalesce(p_today, private.owner_today(v_space.owner_id));
  v_goal := v_space.kind = 'goal';

  with live as (
    select t.id, t.title, t.due_date, t.done, t.is_milestone, t.depth, b.type = 'roadmap' as in_roadmap,
           not exists (select 1 from public.tasks c where c.parent_id = t.id and c.deleted_at is null) as is_leaf
    from public.tasks t
    join public.blocks b on b.id = t.block_id and b.deleted_at is null
    join public.pages p on p.id = b.page_id and p.deleted_at is null
    where t.space_id = p_space_id and t.deleted_at is null
  )
  select
    -- Appendix C `tasks`: To-do items and Roadmap leaves.
    count(*) filter (where is_leaf and done),
    count(*) filter (where is_leaf),
    -- SPC-8 AC1/AC2: stages and flagged tasks; filled when done, late when past due, else upcoming.
    coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'due_date', due_date, 'done', done,
               'state', case when done then 'done' when due_date < v_today then 'late' else 'upcoming' end)
             order by due_date, title)
             filter (where due_date is not null and (is_milestone or (in_roadmap and depth = 0))), '[]'),
    -- DESIGN.md Deadline Rail: bar height = tasks due that day.
    coalesce((select jsonb_agg(jsonb_build_object('day', day, 'count', n) order by day)
              from (select l.due_date as day, count(*) as n from live l where l.is_leaf and l.due_date is not null group by l.due_date) c), '[]')
    into v_done, v_total, v_milestones, v_due_counts
  from live;

  return jsonb_build_object(
    'space_id', v_space.id,
    'kind', v_space.kind,
    'status', v_space.status,
    'today', v_today,
    'start_date', v_space.start_date,
    'deadline', v_space.deadline,
    'days_left', case when v_goal then v_space.deadline - v_today end,
    'elapsed', case when v_goal then
                 case when v_space.deadline = v_space.start_date then (v_today >= v_space.start_date)::int::numeric
                      else round(greatest(0, least(1, (v_today - v_space.start_date)::numeric / (v_space.deadline - v_space.start_date))), 4) end
               end,
    'progress', case when v_goal then jsonb_build_object(
                  'metric', 'tasks', 'done', v_done, 'total', v_total,
                  'percent', case when v_total = 0 then 0 else round(100.0 * v_done / v_total)::int end,
                  'label', format('%s of %s steps done', v_done, v_total)) end,
    'milestones', v_milestones,
    'due_counts', v_due_counts);
end;
$$;

------------------------------------------------------------------------------------------------
-- restore_item (SET-3, DL-13, D-P1-11; C-TRASH-01)
------------------------------------------------------------------------------------------------
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
    where space_id = (v_row ->> 'space_id')::uuid and deleted_at is null order by position, created_at limit 1;
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

  return jsonb_build_object('status', 'restored', 'table', p_table, 'id', p_id)
         || case when v_moved is not null then jsonb_build_object('moved_to_page', v_moved) else '{}' end;
end;
$$;

------------------------------------------------------------------------------------------------
-- purge_trash (SET-3, §10.8): rows in Trash for more than 30 days are deleted for good. Containers
-- first; foreign-key cascades take their contents. Slots still waiting to leave Google Calendar
-- stay until Phase 3's sync has removed their event.
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
begin
  foreach v_table in array array['spaces', 'pages', 'blocks', 'tasks', 'table_rows', 'time_blocks'] loop
    execute format(
      'with d as (delete from public.%I where deleted_at < now() - interval ''30 days''%s returning 1) select count(*) from d',
      v_table, case when v_table = 'time_blocks' then ' and sync_status <> ''delete_pending''' else '' end)
      into v_count;
    v_total := v_total + v_count;
  end loop;
  return v_total;
end;
$$;

create extension if not exists pg_cron with schema pg_catalog;
-- 03:00 Asia/Dhaka (UTC+6, no daylight saving) = 21:00 UTC.
select cron.schedule('purge_trash', '0 21 * * *', 'select public.purge_trash()');

------------------------------------------------------------------------------------------------
-- reorder (§9.3 fractional index; SPC-3, PG-3, BLK-3, TODO-3, RM-6; C-ORD-01). p_before / p_after are
-- the neighbours the item should sit between (either may be null at an end).
------------------------------------------------------------------------------------------------
create or replace function public.reorder(p_table text, p_id uuid, p_before uuid, p_after uuid)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  v_current numeric;
  v_lo numeric;
  v_hi numeric;
  v_new numeric;
begin
  if p_table is null or p_table not in ('spaces', 'pages', 'blocks', 'tasks', 'tracker_fields', 'table_columns', 'table_rows', 'routine_steps') then
    raise exception 'That list cannot be reordered.' using errcode = '22023';
  end if;
  execute format('select position from public.%I where id = $1', p_table) into v_current using p_id;
  if v_current is null then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  if p_before is not null then
    execute format('select position from public.%I where id = $1', p_table) into v_lo using p_before;
    if v_lo is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  end if;
  if p_after is not null then
    execute format('select position from public.%I where id = $1', p_table) into v_hi using p_after;
    if v_hi is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  end if;
  if v_lo is not null and v_hi is not null and v_lo >= v_hi then
    raise exception 'The neighbours are in the wrong order.' using errcode = '22023';
  end if;

  v_new := case
    when v_lo is not null and v_hi is not null then (v_lo + v_hi) / 2
    when v_lo is not null then v_lo + 1
    when v_hi is not null then v_hi - 1
    else v_current
  end;
  execute format('update public.%I set position = $1 where id = $2', p_table) using v_new, p_id;
  return v_new;
end;
$$;

------------------------------------------------------------------------------------------------
-- Pages: every new space gets "Overview" (SPC-1 AC2); a live space keeps one live page (C-PG-01).
------------------------------------------------------------------------------------------------
create function private.space_first_page()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.pages (owner_id, space_id, title, position) values (new.owner_id, new.id, 'Overview', 0);
  return null;
end;
$$;

create trigger first_page after insert on public.spaces
  for each row execute function private.space_first_page();

create function private.keep_one_page()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is null
     and (new.deleted_at is not null or new.space_id is distinct from old.space_id)
     and (select deleted_at from public.spaces where id = old.space_id) is null
     and not exists (select 1 from public.pages where space_id = old.space_id and id <> old.id and deleted_at is null) then
    raise exception 'A space needs at least one page.' using errcode = '23514', detail = 'PG-6';
  end if;
  return new;
end;
$$;

create trigger keep_one_page before update of deleted_at, space_id on public.pages
  for each row execute function private.keep_one_page();

------------------------------------------------------------------------------------------------
-- status_changed_at is Daybook's (SPC-4 AC1, C-SPC-03).
------------------------------------------------------------------------------------------------
create function private.space_status_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.status_changed_at := case when new.status <> 'active' then now() end;
  elsif new.status is distinct from old.status then
    new.status_changed_at := now();
  else
    new.status_changed_at := old.status_changed_at;
  end if;
  return new;
end;
$$;

create trigger status_changed_at before insert or update on public.spaces
  for each row execute function private.space_status_changed();
