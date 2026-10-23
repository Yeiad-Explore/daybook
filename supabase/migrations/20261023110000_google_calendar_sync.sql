-- Phase 3: Google Calendar sync (PRD §8, §9.4, §10; GC-2, GC-5, GC-6, GC-9, GC-10, GC-11; TB-3..5).
-- ADR 0004. Everything that touches Google's refresh token or the sync fields runs through the
-- functions below; google_connections and calendar_sync_log have no client policy and no client grant.

create extension if not exists pg_net with schema extensions;

------------------------------------------------------------------------------------------------
-- Tasks get the same sync bookkeeping time slots have (GC-9 backoff and the claim lease need it).
------------------------------------------------------------------------------------------------
alter table public.tasks
  add column sync_attempts smallint not null default 0,
  add column sync_error text,
  add column next_sync_at timestamptz,
  add column last_synced_at timestamptz;

create index tasks_sync_due on public.tasks (sync_status, next_sync_at) where sync_status <> 'not_synced';
create index time_blocks_sync_due on public.time_blocks (sync_status, next_sync_at) where sync_status <> 'not_synced';

-- DB-2: the new columns are maintained by Daybook too (same trigger name, so it still runs before task_sync_flag).
drop trigger protect_maintained_columns on public.tasks;
create trigger protect_maintained_columns before insert or update on public.tasks
  for each row execute function private.protect_maintained_columns(
    'completed_at', 'null', 'reschedule_count', '0', 'gcal_event_id', 'null', 'sync_status', 'not_synced',
    'sync_attempts', '0', 'sync_error', 'null', 'next_sync_at', 'null', 'last_synced_at', 'null');

------------------------------------------------------------------------------------------------
-- calendar_sync_log (observability: what the owner sees on /settings/calendar). No client access.
-- Never holds tokens or raw Google responses: `reason` comes from a fixed list in the function.
------------------------------------------------------------------------------------------------
create table public.calendar_sync_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('time_block', 'task', 'connection')),
  target_id uuid,
  target_title text,
  action text not null check (action in ('create', 'update', 'delete', 'recreate', 'adopt', 'connect', 'disconnect', 'needs_reconnect')),
  outcome text not null check (outcome in ('ok', 'failed', 'skipped')),
  http_status integer,
  reason text
);
create index calendar_sync_log_owner_at on public.calendar_sync_log (owner_id, at desc);
alter table public.calendar_sync_log enable row level security;
revoke all on public.calendar_sync_log from anon, authenticated;
grant all on public.calendar_sync_log to service_role;

------------------------------------------------------------------------------------------------
-- TB-4 / GC-4: a block's own auto_sync setting wins; otherwise the connection's default for new blocks.
------------------------------------------------------------------------------------------------
-- google_connections is closed to clients, so the trigger (which runs as the signed-in user) asks through this.
create function private.calendar_auto_sync_default(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce((select g.auto_sync_new_blocks from public.google_connections g where g.owner_id = p_owner), true) $$;

create or replace function private.time_block_sync_flag()
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
          or coalesce((select (config ->> 'auto_sync')::boolean from public.blocks where id = new.block_id),
                      private.calendar_auto_sync_default(new.owner_id))) then
    new.sync_status := 'pending';
    new.sync_attempts := 0;
    new.sync_error := null;
    new.next_sync_at := now();
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------------------------
-- Which tasks get a deadline event (GC-11): dated, unfinished, a leaf, in an active space, with
-- push_deadlines on and the calendar connected.
------------------------------------------------------------------------------------------------
create function private.task_wants_event(p_task public.tasks)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_task.due_date is not null
     and not p_task.done
     and p_task.deleted_at is null
     and exists (select 1 from public.spaces s where s.id = p_task.space_id and s.status = 'active' and s.deleted_at is null)
     and not exists (select 1 from public.tasks c where c.parent_id = p_task.id and c.deleted_at is null)
     and exists (select 1 from public.google_connections g
                 where g.owner_id = p_task.owner_id and g.status = 'connected' and g.push_deadlines)
$$;

-- Runs after protect_maintained_columns (trigger names sort that way), like time_block_sync_flag.
create function private.task_sync_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_changed boolean := tg_op = 'INSERT' or (new.gcal_event_id is null and new.sync_status = 'not_synced');
begin
  if private.task_wants_event(new) then
    if tg_op = 'UPDATE' and not v_changed then
      v_changed := new.title is distinct from old.title
                or new.due_date is distinct from old.due_date
                or new.done is distinct from old.done
                or new.deleted_at is distinct from old.deleted_at;
    end if;
    if v_changed then
      new.sync_status := 'pending';
      new.sync_attempts := 0;
      new.sync_error := null;
      new.next_sync_at := now();
    end if;
  elsif new.gcal_event_id is not null and new.sync_status <> 'delete_pending' then
    new.sync_status := 'delete_pending';
    new.sync_attempts := 0;
    new.sync_error := null;
    new.next_sync_at := now();
  end if;
  return new;
end;
$$;

create trigger task_sync_flag before insert or update on public.tasks
  for each row execute function private.task_sync_flag();

-- Catches what no task row change announces: a space archived or restored, push_deadlines toggled.
create function private.reconcile_deadline_events(p_owner uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tasks t
  set sync_status = 'pending', sync_attempts = 0, sync_error = null, next_sync_at = now()
  where (p_owner is null or t.owner_id = p_owner)
    and t.gcal_event_id is null and t.sync_status = 'not_synced'
    and private.task_wants_event(t);

  update public.tasks t
  set sync_status = 'delete_pending', sync_attempts = 0, sync_error = null, next_sync_at = now()
  where (p_owner is null or t.owner_id = p_owner)
    and t.gcal_event_id is not null and t.sync_status <> 'delete_pending'
    and not private.task_wants_event(t);
end;
$$;

------------------------------------------------------------------------------------------------
-- Claiming rows (GC-6, GC-8): FOR UPDATE SKIP LOCKED plus a two-minute lease in next_sync_at.
-- Returns each row as json with what the event needs (space, page, timezone).
------------------------------------------------------------------------------------------------
create function private.claim_sync_rows(p_kind text, p_id uuid, p_owner uuid, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_rows jsonb;
begin
  v_table := case p_kind when 'time_block' then 'time_blocks' when 'task' then 'tasks' end;
  if v_table is null then
    raise exception 'Unknown kind %.', p_kind using errcode = '22023';
  end if;
  execute format($f$
    with c as (
      select t.id from public.%1$I t
      join public.google_connections g on g.owner_id = t.owner_id and g.status = 'connected'
      where t.sync_status in ('pending', 'failed', 'delete_pending')
        and ($1 is null or t.id = $1)
        and ($2 is null or t.owner_id = $2)
        and ($1 is not null or (t.next_sync_at <= now() and t.sync_attempts < 5))
      order by t.next_sync_at nulls first
      limit $3
      for update of t skip locked
    ), u as (
      update public.%1$I t set next_sync_at = now() + interval '2 minutes'
      from c where t.id = c.id
      returning t.*
    )
    select coalesce(jsonb_agg(to_jsonb(u) || jsonb_build_object(
      'kind', %2$L,
      'space_name', (select s.name from public.spaces s where s.id = u.space_id),
      'page_id', (select b.page_id from public.blocks b where b.id = u.block_id),
      'page_title', (select p.title from public.blocks b join public.pages p on p.id = b.page_id where b.id = u.block_id),
      'timezone', coalesce((select pr.timezone from public.profiles pr where pr.id = u.owner_id), 'Asia/Dhaka')
    )), '[]'::jsonb) from u
  $f$, v_table, p_kind) into v_rows using p_id, p_owner, p_limit;
  return v_rows;
end;
$$;

-- Writes a sync result only while the lease still matches, so an edit made mid-sync (which resets the row
-- to pending) is never overwritten. The event id is always saved. Returns false when the lease was lost.
create function private.finish_sync_row(
  p_kind text, p_id uuid, p_lease timestamptz, p_event_id text, p_clear_event boolean,
  p_status public.sync_status, p_attempts integer, p_error text, p_next timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_owner uuid;
  v_done boolean;
begin
  v_table := case p_kind when 'time_block' then 'time_blocks' when 'task' then 'tasks' end;
  if v_table is null then
    raise exception 'Unknown kind %.', p_kind using errcode = '22023';
  end if;

  if p_clear_event then
    execute format('update public.%I set gcal_event_id = null where id = $1', v_table) using p_id;
  elsif p_event_id is not null then
    execute format('update public.%I set gcal_event_id = $2 where id = $1', v_table) using p_id, p_event_id;
  end if;

  execute format($f$
    update public.%I set sync_status = $3, sync_attempts = $4, sync_error = $5, next_sync_at = $6,
      last_synced_at = case when $3 in ('synced', 'not_synced') then now() else last_synced_at end
    where id = $1 and next_sync_at = $2
    returning owner_id
  $f$, v_table) into v_owner using p_id, p_lease, p_status, p_attempts, p_error, p_next;
  v_done := v_owner is not null;

  if v_done and p_status in ('synced', 'not_synced') then
    update public.google_connections set last_success_at = now(), last_error = null where owner_id = v_owner;
  end if;
  return v_done;
end;
$$;

------------------------------------------------------------------------------------------------
-- Vault (GC-2, GC-5). Readable only by service-role code.
------------------------------------------------------------------------------------------------
create function private.read_google_refresh_token(p_owner uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret
  from public.google_connections g
  join vault.decrypted_secrets d on d.id = g.refresh_token_secret_id
  where g.owner_id = p_owner and g.status = 'connected'
$$;

create function private.connect_google(p_owner uuid, p_email text, p_scopes text[], p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
  v_name constant text := 'google_refresh_token_' || p_owner::text;
begin
  select refresh_token_secret_id into v_secret from public.google_connections where owner_id = p_owner;
  if v_secret is not null and exists (select 1 from vault.secrets where id = v_secret) then
    perform vault.update_secret(v_secret, p_token);
  else
    delete from vault.secrets where name = v_name; -- an orphan from an interrupted earlier connect
    v_secret := vault.create_secret(p_token, v_name, 'Google Calendar refresh token');
  end if;

  insert into public.google_connections (owner_id, google_email, scopes, refresh_token_secret_id, status, last_error)
  values (p_owner, p_email, p_scopes, v_secret, 'connected', null)
  on conflict (owner_id) do update
    set google_email = excluded.google_email, scopes = excluded.scopes,
        refresh_token_secret_id = excluded.refresh_token_secret_id, status = 'connected', last_error = null;

  -- GC-10: whatever waited for a working connection is tried again now.
  update public.time_blocks set next_sync_at = now(), sync_attempts = 0, sync_error = null
    where owner_id = p_owner and sync_status in ('pending', 'failed', 'delete_pending');
  update public.tasks set next_sync_at = now(), sync_attempts = 0, sync_error = null
    where owner_id = p_owner and sync_status in ('pending', 'failed', 'delete_pending');
  perform private.reconcile_deadline_events(p_owner);

  insert into public.calendar_sync_log (owner_id, kind, action, outcome) values (p_owner, 'connection', 'connect', 'ok');
end;
$$;

-- GC-5: forgets the token and marks every slot and deadline "Not on calendar". Events already on Google
-- stay (the function removes them first when the owner asked); a later reconnect adopts them by daybookId.
create function private.disconnect_google(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  select refresh_token_secret_id into v_secret from public.google_connections where owner_id = p_owner;
  update public.google_connections
    set status = 'disconnected', refresh_token_secret_id = null, last_error = null
    where owner_id = p_owner;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
  update public.time_blocks
    set sync_status = 'not_synced', gcal_event_id = null, sync_attempts = 0, sync_error = null, next_sync_at = null
    where owner_id = p_owner and (sync_status <> 'not_synced' or gcal_event_id is not null);
  update public.tasks
    set sync_status = 'not_synced', gcal_event_id = null, sync_attempts = 0, sync_error = null, next_sync_at = null
    where owner_id = p_owner and (sync_status <> 'not_synced' or gcal_event_id is not null);
  insert into public.calendar_sync_log (owner_id, kind, action, outcome) values (p_owner, 'connection', 'disconnect', 'ok');
end;
$$;

------------------------------------------------------------------------------------------------
-- Owner-facing RPCs (§10.7): slot buttons, the log, the status.
------------------------------------------------------------------------------------------------
create function private.request_calendar_sync(p_owner uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.calendar_connected(p_owner) then
    raise exception 'Connect Google Calendar first.' using errcode = 'P0002';
  end if;
  update public.time_blocks
    set sync_status = 'pending', sync_attempts = 0, sync_error = null, next_sync_at = now()
    where id = p_id and owner_id = p_owner and deleted_at is null;
  if not found then
    raise exception 'That time slot no longer exists.' using errcode = 'P0002';
  end if;
end;
$$;

-- Retry: one slot, or every failed slot and deadline when p_id is null (GC-9 "until the owner presses Retry").
create function private.retry_calendar_sync(p_owner uuid, p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slots integer;
  v_tasks integer;
begin
  update public.time_blocks
    set sync_status = 'pending', sync_attempts = 0, sync_error = null, next_sync_at = now()
    where owner_id = p_owner and sync_status = 'failed' and (p_id is null or id = p_id);
  get diagnostics v_slots = row_count;
  update public.tasks
    set sync_status = 'pending', sync_attempts = 0, sync_error = null, next_sync_at = now()
    where owner_id = p_owner and sync_status = 'failed' and (p_id is null or id = p_id);
  get diagnostics v_tasks = row_count;
  return v_slots + v_tasks;
end;
$$;

create function private.calendar_log(p_owner uuid, p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'at', l.at, 'kind', l.kind, 'title', l.target_title, 'action', l.action,
           'outcome', l.outcome, 'http_status', l.http_status, 'reason', l.reason) order by l.at desc, l.id desc), '[]'::jsonb)
  from (select * from public.calendar_sync_log where owner_id = p_owner order by at desc, id desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) l
$$;

create or replace function private.calendar_status(p_owner uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object(
              'status', g.status,
              'google_email', g.google_email,
              'calendar_id', g.calendar_id,
              'push_deadlines', g.push_deadlines,
              'auto_sync_new_blocks', g.auto_sync_new_blocks,
              'last_success_at', g.last_success_at,
              'last_error', g.last_error,
              'failed_syncs', (select count(*) from public.time_blocks t
                               where t.owner_id = p_owner and t.sync_status = 'failed' and t.deleted_at is null)
                            + (select count(*) from public.tasks t
                               where t.owner_id = p_owner and t.sync_status = 'failed' and t.deleted_at is null),
              'waiting_syncs', (select count(*) from public.time_blocks t
                                where t.owner_id = p_owner and t.sync_status in ('pending', 'delete_pending') and t.deleted_at is null))
     from public.google_connections g where g.owner_id = p_owner),
    jsonb_build_object('status', 'disconnected'))
$$;

-- Changing push_deadlines adds or removes the deadline events at once.
create or replace function private.set_calendar_prefs(p_owner uuid, p_push_deadlines boolean, p_auto_sync boolean, p_calendar_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.google_connections
  set push_deadlines = coalesce(p_push_deadlines, push_deadlines),
      auto_sync_new_blocks = coalesce(p_auto_sync, auto_sync_new_blocks),
      calendar_id = coalesce(nullif(trim(p_calendar_id), ''), calendar_id)
  where owner_id = p_owner;
  if not found then
    raise exception 'Connect Google Calendar first.' using errcode = 'P0002';
  end if;
  perform private.reconcile_deadline_events(p_owner);
end;
$$;

create function public.request_calendar_sync(p_time_block_id uuid)
returns void language sql set search_path = ''
as $$ select private.request_calendar_sync(auth.uid(), p_time_block_id) $$;

create function public.retry_calendar_sync(p_id uuid default null)
returns integer language sql set search_path = ''
as $$ select private.retry_calendar_sync(auth.uid(), p_id) $$;

create function public.get_calendar_log(p_limit integer default 50)
returns jsonb language sql stable set search_path = ''
as $$ select private.calendar_log(auth.uid(), p_limit) $$;

------------------------------------------------------------------------------------------------
-- Service-role entry points for the Edge Functions (never callable by clients).
------------------------------------------------------------------------------------------------
create function public.claim_sync_rows(p_kind text, p_id uuid, p_owner uuid, p_limit integer)
returns jsonb language sql set search_path = ''
as $$ select private.claim_sync_rows(p_kind, p_id, p_owner, p_limit) $$;

create function public.finish_sync_row(
  p_kind text, p_id uuid, p_lease timestamptz, p_event_id text, p_clear_event boolean,
  p_status public.sync_status, p_attempts integer, p_error text, p_next timestamptz)
returns boolean language sql set search_path = ''
as $$ select private.finish_sync_row(p_kind, p_id, p_lease, p_event_id, p_clear_event, p_status, p_attempts, p_error, p_next) $$;

create function public.read_google_refresh_token(p_owner uuid)
returns text language sql stable set search_path = ''
as $$ select private.read_google_refresh_token(p_owner) $$;

create function public.connect_google_account(p_owner uuid, p_email text, p_scopes text[], p_token text)
returns void language sql set search_path = ''
as $$ select private.connect_google(p_owner, p_email, p_scopes, p_token) $$;

create function public.disconnect_google_account(p_owner uuid)
returns void language sql set search_path = ''
as $$ select private.disconnect_google(p_owner) $$;

-- Grants. Private functions are PUBLIC-executable by default; the ones that read secrets or take any
-- owner id are closed to everyone except service_role (and the postgres owner / cron).
revoke execute on function
  private.claim_sync_rows(text, uuid, uuid, integer),
  private.finish_sync_row(text, uuid, timestamptz, text, boolean, public.sync_status, integer, text, timestamptz),
  private.read_google_refresh_token(uuid),
  private.connect_google(uuid, text, text[], text),
  private.disconnect_google(uuid),
  private.reconcile_deadline_events(uuid)
from public, anon, authenticated;
grant execute on function
  private.claim_sync_rows(text, uuid, uuid, integer),
  private.finish_sync_row(text, uuid, timestamptz, text, boolean, public.sync_status, integer, text, timestamptz),
  private.read_google_refresh_token(uuid),
  private.connect_google(uuid, text, text[], text),
  private.disconnect_google(uuid)
to service_role;

revoke execute on function
  public.claim_sync_rows(text, uuid, uuid, integer),
  public.finish_sync_row(text, uuid, timestamptz, text, boolean, public.sync_status, integer, text, timestamptz),
  public.read_google_refresh_token(uuid),
  public.connect_google_account(uuid, text, text[], text),
  public.disconnect_google_account(uuid),
  public.request_calendar_sync(uuid),
  public.retry_calendar_sync(uuid),
  public.get_calendar_log(integer)
from public, anon, authenticated;
grant execute on function
  public.claim_sync_rows(text, uuid, uuid, integer),
  public.finish_sync_row(text, uuid, timestamptz, text, boolean, public.sync_status, integer, text, timestamptz),
  public.read_google_refresh_token(uuid),
  public.connect_google_account(uuid, text, text[], text),
  public.disconnect_google_account(uuid)
to service_role;
grant execute on function
  public.request_calendar_sync(uuid),
  public.retry_calendar_sync(uuid),
  public.get_calendar_log(integer)
to authenticated;

------------------------------------------------------------------------------------------------
-- Cron (§10.8): every 10 minutes, wake calendar-sync when something is due. The project URL and the
-- secret key live in Vault (names calendar_sync_url, calendar_sync_key); without them nothing is called.
------------------------------------------------------------------------------------------------
create function private.invoke_calendar_sweep()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  perform private.reconcile_deadline_events(null);
  if not exists (select 1 from public.time_blocks where sync_status in ('pending', 'failed', 'delete_pending') and next_sync_at <= now() and sync_attempts < 5)
     and not exists (select 1 from public.tasks where sync_status in ('pending', 'failed', 'delete_pending') and next_sync_at <= now() and sync_attempts < 5) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'calendar_sync_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'calendar_sync_key';
  if v_url is null or v_key is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key),
    body := jsonb_build_object('action', 'sweep'));
end;
$$;
revoke execute on function private.invoke_calendar_sweep() from public, anon, authenticated;

select cron.schedule('calendar_retry', '*/10 * * * *', 'select private.invoke_calendar_sweep()');
-- 03:10 Asia/Dhaka: keep the log to 30 days.
select cron.schedule('purge_sync_log', '10 21 * * *', $$delete from public.calendar_sync_log where at < now() - interval '30 days'$$);
