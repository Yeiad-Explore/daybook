-- Phase 0 T7: shared triggers (PRD §10.5 child ownership, §10.6 sync_space_id, block_type_guard,
-- soft_delete_cascade; §10.3 immutable block type; DB-2 maintained columns).
--
-- Error codes the UI can rely on: 23503 = parent not found (or not yours), 23514 = business rule,
-- 42501 = column maintained by Daybook.

-- Trigger functions run as the calling role. `private` is not exposed by the Data API, so letting
-- `authenticated` resolve functions in it does not make them callable over the API.
grant usage on schema private to authenticated, service_role;
revoke execute on function private.apply_owner_rls(regclass, text) from public;

-- True for API callers (authenticated/anon) unless an RPC marked the transaction as internal.
-- PostgREST does not expose set_config, so clients cannot set app.internal themselves.
create function private.is_client()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('authenticated', 'anon')
     and coalesce(current_setting('app.internal', true), '') <> 'on'
$$;

------------------------------------------------------------------------------------------------
-- Parent ownership (C-RLS-08). Lookups run as the caller, so RLS hides other owners' rows and a
-- foreign id is simply "not found".
------------------------------------------------------------------------------------------------

-- TG_ARGV: pairs of (parent table, column in NEW). Null references are skipped.
create function private.require_owned()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  i int := 0;
  v_id uuid;
  v_ok boolean;
begin
  while i < tg_nargs loop
    v_id := (to_jsonb(new) ->> tg_argv[i + 1])::uuid;
    if v_id is not null then
      execute format('select exists (select 1 from public.%I where id = $1 and owner_id = $2)', tg_argv[i])
        into v_ok using v_id, new.owner_id;
      if not v_ok then
        raise exception '% % not found', tg_argv[i], v_id using errcode = '23503';
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end;
$$;

-- blocks: page must be the caller's; space_id is copied from the page; type never changes (C-SCH-01).
create function private.blocks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_space uuid;
begin
  if tg_op = 'UPDATE' and new.type is distinct from old.type then
    raise exception 'A block''s type cannot change' using errcode = '23514';
  end if;
  select space_id into v_space from public.pages where id = new.page_id and owner_id = new.owner_id;
  if v_space is null then
    raise exception 'Page % not found', new.page_id using errcode = '23503';
  end if;
  new.space_id := v_space;
  return new;
end;
$$;

-- Children of a block (C-TRG-03). TG_ARGV[0]: allowed block types, comma-separated.
-- TG_ARGV[1] = 'space': also copy space_id from the block (C-TRG-02).
create function private.block_child_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_type public.block_type;
  v_space uuid;
begin
  select type, space_id into v_type, v_space from public.blocks where id = new.block_id and owner_id = new.owner_id;
  if v_type is null then
    raise exception 'Block % not found', new.block_id using errcode = '23503';
  end if;
  if not v_type::text = any (string_to_array(tg_argv[0], ',')) then
    raise exception 'A % block cannot hold this item', v_type using errcode = '23514';
  end if;
  if tg_nargs > 1 and tg_argv[1] = 'space' then
    new := jsonb_populate_record(new, jsonb_build_object('space_id', v_space));
  end if;
  return new;
end;
$$;

-- Rows whose block_id is denormalised from another parent. TG_ARGV: (parent table, column in NEW).
create function private.derive_block_id()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_block uuid;
begin
  execute format('select block_id from public.%I where id = $1 and owner_id = $2', tg_argv[0])
    into v_block using (to_jsonb(new) ->> tg_argv[1])::uuid, new.owner_id;
  if v_block is null then
    raise exception '% % not found', tg_argv[0], to_jsonb(new) ->> tg_argv[1] using errcode = '23503';
  end if;
  new := jsonb_populate_record(new, jsonb_build_object('block_id', v_block));
  return new;
end;
$$;

create trigger guard_parent before insert or update of space_id, owner_id on public.pages
  for each row execute function private.require_owned('spaces', 'space_id');
create trigger guard_parent before insert or update of page_id, owner_id, space_id, type on public.blocks
  for each row execute function private.blocks_guard();
create trigger guard_parent before insert or update of block_id, owner_id, space_id on public.tasks
  for each row execute function private.block_child_guard('todo,roadmap', 'space');
create trigger guard_parent before insert or update of block_id, owner_id on public.tracker_fields
  for each row execute function private.block_child_guard('tracker');
create trigger guard_parent before insert or update of field_id, block_id, owner_id on public.tracker_entries
  for each row execute function private.derive_block_id('tracker_fields', 'field_id');
create trigger guard_parent before insert or update of block_id, owner_id on public.table_columns
  for each row execute function private.block_child_guard('table');
create trigger guard_parent before insert or update of block_id, owner_id on public.table_rows
  for each row execute function private.block_child_guard('table');
create trigger guard_parent before insert or update of block_id, owner_id, space_id on public.time_blocks
  for each row execute function private.block_child_guard('timeblock', 'space');
create trigger guard_task_link before insert or update of task_id, owner_id on public.time_blocks
  for each row execute function private.require_owned('tasks', 'task_id');
create trigger guard_parent before insert or update of block_id, owner_id on public.routine_steps
  for each row execute function private.block_child_guard('routine');
create trigger guard_parent before insert or update of step_id, block_id, owner_id on public.routine_checks
  for each row execute function private.derive_block_id('routine_steps', 'step_id');
create trigger guard_parent before insert or update of block_id, owner_id on public.notes
  for each row execute function private.block_child_guard('notes');
create trigger guard_parent before insert or update of space_id, task_id, owner_id on public.deadline_changes
  for each row execute function private.require_owned('spaces', 'space_id', 'tasks', 'task_id');

------------------------------------------------------------------------------------------------
-- Moving a page or block re-derives space_id below it (each child's guard recomputes it).
-- TG_ARGV: pairs of (child table, foreign key column).
------------------------------------------------------------------------------------------------
create function private.cascade_space_id()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  i int := 0;
begin
  while i < tg_nargs loop
    execute format('update public.%I set space_id = $1 where %I = $2', tg_argv[i], tg_argv[i + 1])
      using new.space_id, new.id;
    i := i + 2;
  end loop;
  return null;
end;
$$;

-- No column list: a block's space_id changes through its guard when the client moves it to another
-- page, and a column-list trigger only fires for columns named in the statement's SET.
create trigger cascade_space_id after update on public.pages
  for each row when (new.space_id is distinct from old.space_id)
  execute function private.cascade_space_id('blocks', 'page_id');
create trigger cascade_space_id after update on public.blocks
  for each row when (new.space_id is distinct from old.space_id)
  execute function private.cascade_space_id('tasks', 'block_id', 'time_blocks', 'block_id');

------------------------------------------------------------------------------------------------
-- soft_delete_cascade (C-TRG-13). Children get the parent's deleted_at; restore clears only the
-- children deleted at that same moment, so items trashed on their own stay in Trash.
-- Security definer: the cascade is Daybook's action, not a direct client write (DL-12 allows it).
-- TG_ARGV: pairs of (child table, foreign key column).
------------------------------------------------------------------------------------------------
create function private.soft_delete_cascade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  i int := 0;
begin
  while i < tg_nargs loop
    if new.deleted_at is not null and old.deleted_at is null then
      execute format('update public.%I set deleted_at = $1 where %I = $2 and deleted_at is null', tg_argv[i], tg_argv[i + 1])
        using new.deleted_at, new.id;
    elsif new.deleted_at is null and old.deleted_at is not null then
      execute format('update public.%I set deleted_at = null where %I = $1 and deleted_at = $2', tg_argv[i], tg_argv[i + 1])
        using new.id, old.deleted_at;
    end if;
    i := i + 2;
  end loop;
  return null;
end;
$$;

create trigger soft_delete_cascade after update of deleted_at on public.spaces
  for each row execute function private.soft_delete_cascade('pages', 'space_id');
create trigger soft_delete_cascade after update of deleted_at on public.pages
  for each row execute function private.soft_delete_cascade('blocks', 'page_id');
create trigger soft_delete_cascade after update of deleted_at on public.blocks
  for each row execute function private.soft_delete_cascade('tasks', 'block_id', 'table_rows', 'block_id', 'time_blocks', 'block_id');

------------------------------------------------------------------------------------------------
-- DB-2: columns Daybook maintains. Clients may not set them on insert (must equal the default)
-- or change them on update. TG_ARGV: pairs of (column, default as text, or 'null').
------------------------------------------------------------------------------------------------
create function private.protect_maintained_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  i int := 0;
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
begin
  if not private.is_client() then
    return new;
  end if;
  while i < tg_nargs loop
    if (tg_op = 'INSERT' and (v_new ->> tg_argv[i]) is distinct from nullif(tg_argv[i + 1], 'null'))
       or (tg_op = 'UPDATE' and (v_new -> tg_argv[i]) is distinct from (v_old -> tg_argv[i])) then
      raise exception '% is maintained by Daybook and cannot be set directly', tg_argv[i] using errcode = '42501';
    end if;
    i := i + 2;
  end loop;
  return new;
end;
$$;

create trigger protect_maintained_columns before insert or update on public.tasks
  for each row execute function private.protect_maintained_columns(
    'completed_at', 'null', 'reschedule_count', '0', 'gcal_event_id', 'null', 'sync_status', 'not_synced');
create trigger protect_maintained_columns before insert or update on public.time_blocks
  for each row execute function private.protect_maintained_columns(
    'gcal_event_id', 'null', 'sync_status', 'not_synced', 'sync_attempts', '0',
    'sync_error', 'null', 'next_sync_at', 'null', 'last_synced_at', 'null');
