-- Phase 0 T9 follow-up: fixes from the third adversarial review of the deadline engine.

-- #1: "late" no longer depends on the space's status. Otherwise archive -> trash -> reactivate
-- would remove a late task without a reason (DL-11/DL-12).
create or replace function private.task_soft_delete_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_client()
     and old.deleted_at is null and new.deleted_at is not null
     and not old.done
     and old.due_date < private.owner_today(old.owner_id)
     and not exists (select 1 from public.tasks where parent_id = old.id and deleted_at is null) then
    raise exception 'This task is late. Delete it with a reason so it shows in your deadline history.'
      using errcode = '42501', detail = 'DL-12';
  end if;
  return new;
end;
$$;

-- #3: the parent row is locked, so a concurrent "move to Trash" of that parent waits for this write
-- (and then sees it) instead of leaving a live row inside a trashed container.
create or replace function private.require_live_parent()
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
      execute format('select deleted_at is not null from public.%I where id = $1 for share', tg_argv[i]) into v_trashed using v_id;
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

-- #4: a block trashes and restores only its top-level steps; each step carries its own sub-steps
-- (tasks' own soft_delete_cascade). Restores then always run parent before child, whatever the
-- physical row order.
create or replace function private.soft_delete_cascade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  i int := 0;
  v_roots text;
begin
  while i < tg_nargs loop
    v_roots := case when tg_argv[i] = 'tasks' and tg_argv[i + 1] = 'block_id' then ' and parent_id is null' else '' end;
    if new.deleted_at is not null and old.deleted_at is null then
      execute format('update public.%I set deleted_at = $1 where %I = $2 and deleted_at is null%s', tg_argv[i], tg_argv[i + 1], v_roots)
        using new.deleted_at, new.id;
    elsif new.deleted_at is null and old.deleted_at is not null then
      execute format('update public.%I set deleted_at = null where %I = $1 and deleted_at = $2%s', tg_argv[i], tg_argv[i + 1], v_roots)
        using new.id, old.deleted_at;
    end if;
    i := i + 2;
  end loop;
  return null;
end;
$$;
