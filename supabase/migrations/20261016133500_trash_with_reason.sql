-- DL-14 (C-DL-24): moving something that contains late tasks to Trash needs one reason, and each late
-- task inside is logged as deleted_while_late. "Late" = not done, due before today, a leaf (DL-12).

-- Live late tasks inside a space, page, block or task (a task includes itself and its sub-steps).
create function private.late_tasks_in(p_table text, p_id uuid)
returns table (id uuid, title text, due_date date, space_id uuid)
language sql
stable
set search_path = ''
as $$
  with recursive scope as (
    select t.id from public.tasks t
    where t.deleted_at is null
      and (   (p_table = 'spaces' and t.space_id = p_id)
           or (p_table = 'pages' and t.block_id in (select b.id from public.blocks b where b.page_id = p_id))
           or (p_table = 'blocks' and t.block_id = p_id)
           or (p_table = 'tasks' and t.id = p_id))
    union
    select c.id from public.tasks c join scope s on c.parent_id = s.id
    where p_table = 'tasks' and c.deleted_at is null
  )
  select t.id, t.title, t.due_date, t.space_id
  from public.tasks t
  where t.id in (select id from scope)
    and not t.done
    and t.due_date < private.owner_today(t.owner_id)
    and not exists (select 1 from public.tasks c where c.parent_id = t.id and c.deleted_at is null)
$$;

-- A client cannot trash something holding late tasks directly; trash_item asks for the reason.
create function private.trash_late_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_list text;
begin
  if private.is_client() and old.deleted_at is null and new.deleted_at is not null then
    select private.list_items(array_agg(format('''%s'' (due %s)', l.title, private.fmt_day(l.due_date, new.owner_id))
                                         order by l.due_date, l.title))
      into v_list
    from private.late_tasks_in(tg_table_name, new.id) l;
    if v_list is not null then
      raise exception '%', format('These late tasks are inside: %s. Move it to Trash with a reason so they show in your deadline history.', v_list)
        using errcode = '42501', detail = 'DL-14';
    end if;
  end if;
  return new;
end;
$$;

create trigger trash_late_guard before update on public.spaces for each row execute function private.trash_late_guard();
create trigger trash_late_guard before update on public.pages for each row execute function private.trash_late_guard();
create trigger trash_late_guard before update on public.blocks for each row execute function private.trash_late_guard();
create trigger trash_late_guard before update on public.tasks for each row execute function private.trash_late_guard();

-- Security invoker: RLS decides what the caller can see and trash.
create function public.trash_item(p_table text, p_id uuid, p_reason text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_reason text := nullif(trim(p_reason), '');
  v_live boolean;
  v_late jsonb;
  v_count int;
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

  insert into public.deadline_changes (kind, task_id, space_id, item_title, old_due, new_due, reason, was_late)
  select 'deleted_while_late', l.id, l.space_id, l.title, l.due_date, null, v_reason, true
  from private.late_tasks_in(p_table, p_id) l;

  perform set_config('app.internal', 'on', true);
  execute format('update public.%I set deleted_at = now() where id = $1', p_table) using p_id;
  perform set_config('app.internal', '', true);

  return jsonb_build_object('status', 'trashed', 'late_logged', v_count);
end;
$$;

-- Every new public function needs this: schema-level default privileges cannot remove the global
-- EXECUTE-to-PUBLIC default (060_rpc checks that anon can execute nothing in public).
revoke execute on function public.trash_item(text, uuid, text) from public, anon;
grant execute on function public.trash_item(text, uuid, text) to authenticated;
