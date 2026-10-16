-- Phase 0 T9: the deadline engine at the database level (PRD §7.1–7.4, §10.6 task_deadline_guard,
-- task_due_change_guard, space_deadline_guard; DL-12, DL-13, SPC-9).
--
-- Errors: 23514 = a containment rule (message is UI-ready; the rule ID is in DETAIL);
--         42501 = the change must go through an RPC (reschedule_task, reschedule_space, delete_task)
--                 or through Trash.
-- Soft-deleted tasks never count against a rule (DL-13); restoring one re-checks it.
-- Locking: a task write takes FOR SHARE on its space and parent, so a concurrent reschedule of
-- that space or parent (which holds the row lock) cannot slip past the check.

------------------------------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------------------------------

-- Set only by reschedule_task / reschedule_space (Phase 1) with set_config(..., true).
-- PostgREST does not expose set_config, so API clients cannot set it.
create function private.is_rescheduling()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(current_setting('app.reschedule', true), '') = 'on' $$;

-- The owner's local date (§9.3). app.today pins it: RPCs set it from p_today and tests from the
-- fixture date; clients cannot set it.
create function private.owner_today(p_owner uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('app.today', true), '')::date,
    (now() at time zone coalesce((select timezone from public.profiles where id = p_owner), 'Asia/Dhaka'))::date
  )
$$;

-- "15 Nov", or "31 Jan 2027" when not in the owner's current year (§7.5).
create function private.fmt_day(p_day date, p_owner uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_day,
    case when extract(year from p_day) = extract(year from private.owner_today(p_owner)) then 'FMDD Mon' else 'FMDD Mon YYYY' end)
$$;

-- "'A', 'B' and 3 more": keeps error messages short.
create function private.list_items(p_items text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select array_to_string(p_items[1:10], ', ')
         || case when cardinality(p_items) > 10 then format(' and %s more', cardinality(p_items) - 10) else '' end
$$;

-- Raises a containment error. p_context: 'edit' (the owner set this date: PRD wording),
-- 'move' or 'restore' (the date did not change: name the task and say what to do).
create function private.deadline_problem(p_rule text, p_context text, p_title text, p_edit_message text, p_reason text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%', case p_context
      when 'edit' then p_edit_message
      else format('Can''t %s ''%s'': %s Reschedule it first.', p_context, p_title, p_reason)
    end
    using errcode = '23514', detail = p_rule;
end;
$$;

------------------------------------------------------------------------------------------------
-- task_deadline_guard (C-DL-02, C-DL-04..06, C-DL-10, C-DL-20). Also covers task_due_change_guard
-- (DL-6) first, so a direct edit is told to use Reschedule before anything else.
-- No column list: space_id can change through a page or block move's cascade.
------------------------------------------------------------------------------------------------
create function private.task_deadline_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_context text := 'edit';
  v_kind public.space_kind;
  v_deadline date;
  v_parent_title text;
  v_parent_due date;
  v_ancestors uuid[];
  v_limit date;
  v_blockers text;
begin
  -- DL-6 / §7.4 AC2: an existing deadline changes only through reschedule_task.
  if tg_op = 'UPDATE' and old.due_date is not null and new.due_date is distinct from old.due_date
     and not private.is_rescheduling() then
    raise exception 'Change a deadline with Reschedule, which asks for a reason.' using errcode = '42501', detail = 'DL-6';
  end if;

  if new.deleted_at is not null then
    return new;  -- DL-13
  end if;
  if tg_op = 'UPDATE' then
    if old.deleted_at is not null then
      v_context := 'restore';
    elsif new.due_date is not distinct from old.due_date
      and new.space_id is not distinct from old.space_id
      and new.parent_id is not distinct from old.parent_id then
      return new;
    elsif new.due_date is not distinct from old.due_date then
      v_context := 'move';
    end if;
  end if;

  -- §7.1 and DL-1
  select kind, deadline into v_kind, v_deadline from public.spaces where id = new.space_id for share;
  if v_kind = 'goal' then
    if new.due_date is null then
      perform private.deadline_problem('TODO-1', v_context, new.title,
        'A goal needs a deadline for every task.',
        'it has no deadline, and every task in a goal needs one.');
    end if;
    if new.due_date > v_deadline then
      perform private.deadline_problem('DL-1', v_context, new.title,
        format('That deadline is after the goal ends (%s). Pick an earlier date.', private.fmt_day(v_deadline, new.owner_id)),
        format('it is due after the goal ends (%s).', private.fmt_day(v_deadline, new.owner_id)));
    end if;
  end if;

  -- DL-2: against the nearest dated live ancestor (undated steps exist in life areas). The chain up
  -- to it is locked so a concurrent reschedule of any of those steps waits for this write.
  if new.parent_id is not null then
    with recursive ancestors as (
      select id, parent_id, due_date from public.tasks where id = new.parent_id and deleted_at is null
      union all
      select t.id, t.parent_id, t.due_date
      from public.tasks t join ancestors a on t.id = a.parent_id
      where a.due_date is null and t.deleted_at is null
    )
    select array_agg(id) into v_ancestors from ancestors;
    perform 1 from public.tasks where id = any (v_ancestors) for share;
    select title, due_date into v_parent_title, v_parent_due
    from public.tasks where id = any (v_ancestors) and due_date is not null;
  end if;
  if new.due_date is not null and v_parent_due is not null then
    if new.due_date > v_parent_due then
      perform private.deadline_problem('DL-2', v_context, new.title,
        format('Must be due by %s, the deadline of ''%s''.', private.fmt_day(v_parent_due, new.owner_id), v_parent_title),
        format('it is due after ''%s'' (%s).', v_parent_title, private.fmt_day(v_parent_due, new.owner_id)));
    end if;
  end if;

  -- DL-3: no live descendant may be due after this step's date, or (if it has none) after its nearest
  -- dated ancestor's. Checked when the date changes, the step moves in the tree, or it is restored.
  v_limit := coalesce(new.due_date, v_parent_due);
  if tg_op = 'UPDATE' and v_limit is not null
     and (v_context = 'restore' or new.due_date is distinct from old.due_date or new.parent_id is distinct from old.parent_id) then
    with recursive descendants as (
      select id, title, due_date from public.tasks where parent_id = new.id and deleted_at is null
      union all
      select t.id, t.title, t.due_date from public.tasks t join descendants d on t.parent_id = d.id where t.deleted_at is null
    )
    select private.list_items(array_agg(format('''%s'' (due %s)', title, private.fmt_day(due_date, new.owner_id)) order by due_date desc, title))
      into v_blockers
    from descendants where due_date > v_limit;
    if v_blockers is not null then
      perform private.deadline_problem('DL-3', v_context, new.title,
        format('Move these steps to %s or earlier first: %s.', private.fmt_day(v_limit, new.owner_id), v_blockers),
        format('these steps are due after %s: %s.', private.fmt_day(v_limit, new.owner_id), v_blockers));
    end if;
  end if;

  return new;
end;
$$;

create trigger task_deadline_guard before insert or update on public.tasks
  for each row execute function private.task_deadline_guard();

------------------------------------------------------------------------------------------------
-- DL-12 (C-DL-19): a client cannot trash a late task directly; delete_task records the reason
-- (DL-11). "Late" is what Today's Overdue shows (Appendix A): not done, due before today, a leaf,
-- in an active space. Daybook's own cascades and RPCs are not clients.
------------------------------------------------------------------------------------------------
create function private.task_soft_delete_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_client()
     and old.deleted_at is null and new.deleted_at is not null
     and not old.done
     and old.due_date < private.owner_today(old.owner_id)
     and not exists (select 1 from public.tasks where parent_id = old.id and deleted_at is null)
     and (select status from public.spaces where id = old.space_id) = 'active' then
    raise exception 'This task is late. Delete it with a reason so it shows in your deadline history.'
      using errcode = '42501', detail = 'DL-12';
  end if;
  return new;
end;
$$;

create trigger task_soft_delete_guard before update on public.tasks
  for each row execute function private.task_soft_delete_guard();

------------------------------------------------------------------------------------------------
-- Trash first (PRD §2.3 principle 5, SPC-5, PG-6, BLK-7, SET-3): clients hard-delete only what is
-- already in Trash. Without this, deleting a live block, page or space would remove the late tasks
-- in it through foreign-key cascades, which run as the table owner and skip DL-12.
------------------------------------------------------------------------------------------------
create function private.trash_first()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_client() and old.deleted_at is null then
    raise exception 'Move it to Trash first. Items in Trash can be deleted forever.' using errcode = '42501', detail = 'SET-3';
  end if;
  return old;
end;
$$;

create trigger trash_first before delete on public.spaces for each row execute function private.trash_first();
create trigger trash_first before delete on public.pages for each row execute function private.trash_first();
create trigger trash_first before delete on public.blocks for each row execute function private.trash_first();
create trigger trash_first before delete on public.tasks for each row execute function private.trash_first();
create trigger trash_first before delete on public.table_rows for each row execute function private.trash_first();
create trigger trash_first before delete on public.time_blocks for each row execute function private.trash_first();

------------------------------------------------------------------------------------------------
-- space_deadline_guard (C-DL-07, C-DL-08, C-DL-11, C-SPC-01). A goal's deadline changes only
-- through reschedule_space; converting goal -> area drops the rules (PRD §5.5), and an area -> goal
-- conversion sets the goal's first deadline.
------------------------------------------------------------------------------------------------
create function private.space_deadline_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_blockers text;
begin
  if new.kind = 'goal' and new.deadline is null then
    raise exception 'A goal needs a deadline.' using errcode = '23514', detail = 'SPC-1';
  end if;

  -- Goal -> area drops the rules but keeps the dates, so switching kinds cannot swap a deadline.
  if old.kind = 'goal' and new.kind = 'area' then
    new.start_date := old.start_date;
    new.deadline := old.deadline;
  end if;

  -- DL-6: once a space has a deadline, it changes only through reschedule_space, whatever the kind.
  if old.deadline is not null and new.deadline is distinct from old.deadline and not private.is_rescheduling() then
    raise exception 'Change a goal''s deadline with Reschedule, which asks for a reason.' using errcode = '42501', detail = 'DL-6';
  end if;

  if new.kind = 'goal' and (old.kind = 'area' or new.deadline is distinct from old.deadline) then
    select private.list_items(array_agg(
             format('''%s'' (%s)', title, coalesce('due ' || private.fmt_day(due_date, new.owner_id), 'no deadline'))
             order by due_date nulls first, title))
      into v_blockers
    from public.tasks
    where space_id = new.id and deleted_at is null and (due_date is null or due_date > new.deadline);

    if v_blockers is not null then
      if old.kind = 'area' then
        raise exception '%', format('To make this a goal, every task needs a deadline on or before %s. Fix these first: %s.',
            private.fmt_day(new.deadline, new.owner_id), v_blockers)
          using errcode = '23514', detail = 'SPC-9';
      else
        raise exception '%', format('Move these tasks to %s or earlier first: %s.', private.fmt_day(new.deadline, new.owner_id), v_blockers)
          using errcode = '23514', detail = 'DL-4';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger space_deadline_guard before update on public.spaces
  for each row execute function private.space_deadline_guard();

------------------------------------------------------------------------------------------------
-- Nothing live inside Trash. A live row may not be created in, moved into or restored into a parent
-- that is in Trash, so "delete forever" on a trashed container can only remove trashed rows.
-- TG_ARGV: pairs of (parent table, column in NEW).
------------------------------------------------------------------------------------------------
create function private.require_live_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  i int := 0;
  v_id uuid;
  v_trashed boolean;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  while i < tg_nargs loop
    v_id := (to_jsonb(new) ->> tg_argv[i + 1])::uuid;
    if v_id is not null then
      execute format('select deleted_at is not null from public.%I where id = $1', tg_argv[i]) into v_trashed using v_id;
      if v_trashed then
        raise exception 'That place is in Trash. Restore it first, or choose another place.'
          using errcode = '23514', detail = 'SET-3';
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end;
$$;

create trigger guard_live_parent before insert or update on public.pages
  for each row execute function private.require_live_parent('spaces', 'space_id');
create trigger guard_live_parent before insert or update on public.blocks
  for each row execute function private.require_live_parent('pages', 'page_id');
create trigger guard_live_parent before insert or update on public.tasks
  for each row execute function private.require_live_parent('blocks', 'block_id', 'tasks', 'parent_id');
create trigger guard_live_parent before insert or update on public.table_rows
  for each row execute function private.require_live_parent('blocks', 'block_id');
create trigger guard_live_parent before insert or update on public.time_blocks
  for each row execute function private.require_live_parent('blocks', 'block_id');

-- A step's sub-steps go to Trash (and come back) with it, like a block's contents.
create trigger soft_delete_cascade after update of deleted_at on public.tasks
  for each row execute function private.soft_delete_cascade('tasks', 'parent_id');
