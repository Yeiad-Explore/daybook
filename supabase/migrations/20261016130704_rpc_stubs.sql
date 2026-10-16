-- Phase 0 T11: the RPC surface from PRD §10.7 with final signatures and grants, so later phases only
-- replace bodies. Stubs raise 0A000 naming the phase that builds them (CONSTRAINTS.md exception E1).
-- All are security invoker: RLS applies to whatever they read or write. get_calendar_status and
-- set_calendar_prefs are implemented now; they reach google_connections through security definer
-- helpers in `private` that only ever touch the caller's own row.

create function private.not_yet(p_name text, p_phase int)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is not available until Phase %.', p_name, p_phase using errcode = '0A000';
end;
$$;

------------------------------------------------------------------------------------------------
-- Stubs
------------------------------------------------------------------------------------------------
create function public.get_today(p_today date default null)
returns jsonb language plpgsql set search_path = ''
as $$ begin perform private.not_yet('get_today', 1); return null; end; $$;

create function public.space_summary(p_space_id uuid, p_today date default null)
returns jsonb language plpgsql set search_path = ''
as $$ begin perform private.not_yet('space_summary', 1); return null; end; $$;

create function public.reschedule_task(p_task_id uuid, p_new_due date, p_reason text, p_cascade_children boolean default false)
returns jsonb language plpgsql set search_path = ''
as $$ begin perform private.not_yet('reschedule_task', 1); return null; end; $$;

create function public.reschedule_space(p_space_id uuid, p_new_deadline date, p_reason text)
returns jsonb language plpgsql set search_path = ''
as $$ begin perform private.not_yet('reschedule_space', 1); return null; end; $$;

create function public.delete_task(p_task_id uuid, p_reason text default null)
returns void language plpgsql set search_path = ''
as $$ begin perform private.not_yet('delete_task', 1); end; $$;

create function public.set_task_done(p_task_id uuid, p_done boolean)
returns void language plpgsql set search_path = ''
as $$ begin perform private.not_yet('set_task_done', 1); end; $$;

create function public.move_page(p_page_id uuid, p_target_space uuid)
returns jsonb language plpgsql set search_path = ''
as $$ begin perform private.not_yet('move_page', 4); return null; end; $$;

create function public.move_block(p_block_id uuid, p_target_page uuid)
returns jsonb language plpgsql set search_path = ''
as $$ begin perform private.not_yet('move_block', 4); return null; end; $$;

create function public.reorder(p_table text, p_id uuid, p_before uuid, p_after uuid)
returns numeric language plpgsql set search_path = ''
as $$ begin perform private.not_yet('reorder', 1); return null; end; $$;

create function public.duplicate_page(p_page_id uuid, p_include_content boolean)
returns uuid language plpgsql set search_path = ''
as $$ begin perform private.not_yet('duplicate_page', 4); return null; end; $$;

create function public.duplicate_block(p_block_id uuid, p_include_content boolean)
returns uuid language plpgsql set search_path = ''
as $$ begin perform private.not_yet('duplicate_block', 4); return null; end; $$;

create function public.routine_streak(p_block_id uuid, p_today date default null)
returns integer language plpgsql set search_path = ''
as $$ begin perform private.not_yet('routine_streak', 2); return null; end; $$;

create function public.tracker_series(p_field_id uuid, p_days integer)
returns jsonb language plpgsql set search_path = ''
as $$ begin perform private.not_yet('tracker_series', 2); return null; end; $$;

create function public.week_review(p_week_start date)
returns jsonb language plpgsql set search_path = ''
as $$ begin perform private.not_yet('week_review', 4); return null; end; $$;

create function public.restore_item(p_table text, p_id uuid)
returns jsonb language plpgsql set search_path = ''
as $$ begin perform private.not_yet('restore_item', 1); return null; end; $$;

create function public.search_all(p_query text, p_limit integer default 30)
returns jsonb language plpgsql set search_path = ''
as $$ begin perform private.not_yet('search_all', 4); return null; end; $$;

-- Scheduled job only (§10.8); not callable by clients.
create function public.purge_trash()
returns integer language plpgsql set search_path = ''
as $$ begin perform private.not_yet('purge_trash', 1); return null; end; $$;

------------------------------------------------------------------------------------------------
-- Calendar status and prefs (GC-4, C-RLS-07)
------------------------------------------------------------------------------------------------
create function private.calendar_status(p_owner uuid)
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
                               where t.owner_id = p_owner and t.sync_status = 'failed' and t.deleted_at is null))
     from public.google_connections g where g.owner_id = p_owner),
    jsonb_build_object('status', 'disconnected'))
$$;

create function private.set_calendar_prefs(p_owner uuid, p_push_deadlines boolean, p_auto_sync boolean, p_calendar_id text)
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
end;
$$;

create function public.get_calendar_status()
returns jsonb language sql stable set search_path = ''
as $$ select private.calendar_status(auth.uid()) $$;

create function public.set_calendar_prefs(p_push_deadlines boolean, p_auto_sync boolean, p_calendar_id text)
returns void language sql set search_path = ''
as $$ select private.set_calendar_prefs(auth.uid(), p_push_deadlines, p_auto_sync, p_calendar_id) $$;

------------------------------------------------------------------------------------------------
-- Grants: nothing in public is callable by anon; clients get exactly the §10.7 RPCs.
------------------------------------------------------------------------------------------------
-- Supabase's default privileges grant new public functions to anon and authenticated explicitly,
-- so revoking from PUBLIC alone is not enough. The default-privileges line covers Supabase's
-- explicit grants only: it cannot remove the global EXECUTE-to-PUBLIC default, so every later
-- migration that adds a public function must revoke it from public and anon itself.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant execute on function
  public.is_valid_timezone(text),
  public.get_today(date),
  public.space_summary(uuid, date),
  public.reschedule_task(uuid, date, text, boolean),
  public.reschedule_space(uuid, date, text),
  public.delete_task(uuid, text),
  public.set_task_done(uuid, boolean),
  public.move_page(uuid, uuid),
  public.move_block(uuid, uuid),
  public.reorder(text, uuid, uuid, uuid),
  public.duplicate_page(uuid, boolean),
  public.duplicate_block(uuid, boolean),
  public.routine_streak(uuid, date),
  public.tracker_series(uuid, integer),
  public.week_review(date),
  public.restore_item(text, uuid),
  public.search_all(text, integer),
  public.get_calendar_status(),
  public.set_calendar_prefs(boolean, boolean, text)
to authenticated;

grant execute on all functions in schema public to service_role;
