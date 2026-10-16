-- Phase 0 T10: table cells, time-slot day rule, Calendar sync flag
-- (PRD §10.6 table_cells_validate, time_block_same_day, time_block_sync_flag; Appendix B; TB-1, TB-4, TB-5).

------------------------------------------------------------------------------------------------
-- table_cells_validate (C-TRG-10): cells is {columnId: value}; each value matches its column kind;
-- null means an empty cell.
------------------------------------------------------------------------------------------------
create function private.is_iso_date(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p ~ '^\d{4}-\d{2}-\d{2}$' and p::date::text = p;
exception when others then
  return false;
end;
$$;

create function private.table_cells_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_key text;
  v_value jsonb;
  v_name text;
  v_kind public.column_kind;
  v_options jsonb;
  v_text text;
  v_ok boolean;
  v_needs text;
begin
  if jsonb_typeof(new.cells) is distinct from 'object' then
    raise exception 'A row''s cells must be an object of column values.' using errcode = '23514', detail = 'TBL-2';
  end if;

  for v_key, v_value in select key, value from jsonb_each(new.cells) loop
    select name, kind, options into v_name, v_kind, v_options
    from public.table_columns where id::text = v_key and block_id = new.block_id;
    if not found then
      raise exception 'This row refers to a column that is not in this table.' using errcode = '23514', detail = 'TBL-2';
    end if;
    continue when jsonb_typeof(v_value) = 'null';

    v_text := v_value #>> '{}';
    -- Computed first: in PL/pgSQL, IF ends its condition at the first THEN, including a CASE's.
    v_ok := case v_kind
         when 'text' then jsonb_typeof(v_value) = 'string'
         when 'number' then jsonb_typeof(v_value) = 'number'
         when 'money' then jsonb_typeof(v_value) = 'number'
         when 'checkbox' then jsonb_typeof(v_value) = 'boolean'
         when 'date' then jsonb_typeof(v_value) = 'string' and private.is_iso_date(v_text)
         when 'url' then jsonb_typeof(v_value) = 'string' and v_text ~* '^https?://\S+$'
         when 'select' then jsonb_typeof(v_value) = 'string'
                            and exists (select 1 from jsonb_array_elements(v_options) o where o ->> 'id' = v_text)
       end;
    if not v_ok then
      v_needs := case v_kind
          when 'text' then 'text'
          when 'number' then 'a number'
          when 'money' then 'an amount'
          when 'checkbox' then 'yes or no'
          when 'date' then 'a date'
          when 'url' then 'a web address starting with http:// or https://'
          when 'select' then 'one of its options'
        end;
      raise exception '%', format('"%s" needs %s.', v_name, v_needs) using errcode = '23514', detail = 'TBL-2';
    end if;
  end loop;
  return new;
end;
$$;

create trigger table_cells_validate before insert or update of cells, block_id on public.table_rows
  for each row execute function private.table_cells_validate();

-- A deleted column leaves no orphan keys behind (they would fail validation on the row's next edit).
create function private.drop_column_cells()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.table_rows set cells = cells - old.id::text where block_id = old.block_id and cells ? old.id::text;
  return null;
end;
$$;

create trigger drop_column_cells after delete on public.table_columns
  for each row execute function private.drop_column_cells();

------------------------------------------------------------------------------------------------
-- time_block_same_day (C-TRG-12, TB-1): end after start; start and end on the same local day in the
-- owner's timezone. Ending exactly at local midnight counts as the same day (the timetable runs to 24:00).
------------------------------------------------------------------------------------------------
create function private.time_block_same_day()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tz text := coalesce((select timezone from public.profiles where id = new.owner_id), 'Asia/Dhaka');
begin
  if new.ends_at <= new.starts_at then
    raise exception 'The end time needs to be after the start time.' using errcode = '23514', detail = 'TB-1';
  end if;
  if (new.starts_at at time zone v_tz)::date <> ((new.ends_at - interval '1 microsecond') at time zone v_tz)::date then
    raise exception 'A time slot has to start and end on the same day.' using errcode = '23514', detail = 'TB-1';
  end if;
  return new;
end;
$$;

create trigger time_block_same_day before insert or update of starts_at, ends_at on public.time_blocks
  for each row execute function private.time_block_same_day();

------------------------------------------------------------------------------------------------
-- time_block_sync_flag (C-TRG-11, GC-6, TB-4, TB-5)
------------------------------------------------------------------------------------------------

-- google_connections has no client access (C-RLS-07); this reads one safe fact about it.
create function private.calendar_connected(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.google_connections where owner_id = p_owner and status = 'connected') $$;

create function private.time_block_sync_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Trashed: an event on Google is queued for deletion.
  if tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
    if new.gcal_event_id is not null then
      new.sync_status := 'delete_pending';
      new.sync_attempts := 0;
      new.sync_error := null;
      new.next_sync_at := now();
    end if;
    return new;
  end if;
  if new.deleted_at is not null then
    return new;
  end if;

  -- Only a new slot, a restore, or a change Google shows (title or times) needs a sync.
  if tg_op = 'UPDATE' and old.deleted_at is null
     and new.title is not distinct from old.title
     and new.starts_at is not distinct from old.starts_at
     and new.ends_at is not distinct from old.ends_at then
    return new;
  end if;

  if private.calendar_connected(new.owner_id)
     and (new.gcal_event_id is not null
          or coalesce((select (config ->> 'auto_sync')::boolean from public.blocks where id = new.block_id), true)) then
    new.sync_status := 'pending';
    new.sync_attempts := 0;
    new.sync_error := null;
    new.next_sync_at := now();
  end if;
  return new;
end;
$$;

create trigger time_block_sync_flag before insert or update on public.time_blocks
  for each row execute function private.time_block_sync_flag();
