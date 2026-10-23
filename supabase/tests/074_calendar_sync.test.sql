-- Phase 3 database layer: Vault token handling, claim/lease, result writes, retry/request RPCs, log,
-- disconnect, deadline events. GC-2, GC-5, GC-6, GC-8, GC-9, GC-10, GC-11, TB-3..5; PRD §9.4, DB-2.
begin;
select plan(52);

select tests.create_user('owner@test.local');
select tests.create_user('other@test.local');
select tests.seed(tests.uid('owner@test.local'));

create function pg_temp.owner() returns uuid language sql as $$ select tests.uid('owner@test.local') $$;
create function pg_temp.add_slot(p_title text, p_start timestamptz, p_end timestamptz) returns uuid language sql as $$
  insert into public.time_blocks (block_id, title, starts_at, ends_at)
  select id, p_title, p_start, p_end from public.blocks where title = 'Workout slots'
  returning id
$$;
create function pg_temp.slot(p_title text) returns public.time_blocks language sql as $$
  select t from public.time_blocks t where t.title = p_title and t.owner_id = tests.uid('owner@test.local')
$$;

------------------------------------------------------------------------------------------------
-- Privileges (GC-2, §9.4): the browser can reach none of this.
------------------------------------------------------------------------------------------------
select tests.authenticate_as('owner@test.local');
select throws_ok($$ select * from public.google_connections $$, '42501', null, 'GC-2: clients cannot read google_connections');
select throws_ok($$ select * from public.calendar_sync_log $$, '42501', null, 'clients cannot read calendar_sync_log directly');
select throws_ok($$ select public.read_google_refresh_token(tests.uid('owner@test.local')) $$, '42501', null, 'GC-2: clients cannot read the refresh token');
select throws_ok($$ select public.claim_sync_rows('time_block', null, null, 5) $$, '42501', null, 'clients cannot claim rows');
select throws_ok($$ select public.finish_sync_row('time_block', gen_random_uuid(), now(), null, false, 'synced', 0, null, null) $$, '42501', null, 'clients cannot write sync results');
select throws_ok($$ select public.connect_google_account(tests.uid('owner@test.local'), 'a@b.c', array['x'], 'tok') $$, '42501', null, 'clients cannot store a token');
select throws_ok($$ select public.disconnect_google_account(tests.uid('owner@test.local')) $$, '42501', null, 'clients cannot disconnect another path');
select throws_ok($$ select private.read_google_refresh_token(tests.uid('owner@test.local')) $$, '42501', null, 'the private reader is closed too');
select tests.clear_authentication();
select throws_ok($$ select public.request_calendar_sync(gen_random_uuid()) $$, '42501', null, 'anon cannot call request_calendar_sync');

------------------------------------------------------------------------------------------------
-- Connect and reconnect (GC-2): the token lives in Vault, once per owner, and nowhere a client reads.
------------------------------------------------------------------------------------------------
reset role;
set local role service_role;
select lives_ok($$ select public.connect_google_account(tests.uid('owner@test.local'), 'owner@gmail.test', array['https://www.googleapis.com/auth/calendar.events.owned'], 'refresh-1') $$, 'service role stores the token');
select is(public.read_google_refresh_token(pg_temp.owner()), 'refresh-1', 'GC-2: the stored token reads back for the service role');
select lives_ok($$ select public.connect_google_account(tests.uid('owner@test.local'), 'owner@gmail.test', array['https://www.googleapis.com/auth/calendar.events.owned'], 'refresh-2') $$, 'a reconnect replaces the token');
select is(public.read_google_refresh_token(pg_temp.owner()), 'refresh-2', 'GC-10: the reconnect token is the one used');
reset role;
select is((select count(*)::int from vault.secrets where name = 'google_refresh_token_' || tests.uid('owner@test.local')::text), 1, 'GC-2: one Vault secret per owner after a reconnect');
select is((select status::text from public.google_connections where owner_id = pg_temp.owner()), 'connected', 'the connection is connected');

select tests.authenticate_as('owner@test.local');
select ok(position('refresh' in public.get_calendar_status()::text) = 0 and position('secret' in public.get_calendar_status()::text) = 0,
  'GC-4: get_calendar_status carries no token or secret id');
select is(jsonb_array_length(public.get_calendar_log(50)), 2, 'the log shows the connect and the reconnect');
select is(public.get_calendar_log(50) -> 0 ->> 'action', 'connect', 'GC-4: and says it was a connect');
select tests.authenticate_as('other@test.local');
select is(jsonb_array_length(public.get_calendar_log(50)), 0, 'another account sees none of the owner''s log');

------------------------------------------------------------------------------------------------
-- Claim and lease (GC-6, GC-8): a row is taken once; edits made mid-sync are not overwritten.
------------------------------------------------------------------------------------------------
select tests.authenticate_as('owner@test.local');
select pg_temp.add_slot('Python: loops', '2026-10-16 20:00+06', '2026-10-16 21:30+06');
select is((pg_temp.slot('Python: loops')).sync_status::text, 'pending', 'GC-6: a new slot is pending');

reset role;
set local role service_role;
create temp table claimed as select public.claim_sync_rows('time_block', null, null, 10) as rows;
grant all on claimed to public;
select is(jsonb_array_length((select rows from claimed)), 1, 'GC-8: the sweep claims the pending slot');
select is((select rows -> 0 ->> 'space_name' from claimed) is not null and (select rows -> 0 ->> 'timezone' from claimed) = 'Asia/Dhaka', true, 'GC-7: the claim carries the space name and the timezone');
select is(jsonb_array_length(public.claim_sync_rows('time_block', null, null, 10)), 0, 'GC-8: a claimed row is not handed out again during its lease');

-- A result for the current lease is written.
select is(public.finish_sync_row('time_block', ((select rows from claimed) -> 0 ->> 'id')::uuid, ((select rows from claimed) -> 0 ->> 'next_sync_at')::timestamptz,
  'evt-1', false, 'synced', 0, null, null), true, 'a result with the live lease is written');
reset role;
select is((pg_temp.slot('Python: loops')).gcal_event_id, 'evt-1', 'the event id is stored');
select is((pg_temp.slot('Python: loops')).sync_status::text, 'synced', 'TB-3: the slot is synced');
select ok((select last_success_at is not null from public.google_connections where owner_id = pg_temp.owner()), 'GC-4: last success is recorded');

-- Edit mid-sync: the claim's lease no longer matches, so the stale result must not mark it synced.
select tests.authenticate_as('owner@test.local');
update public.time_blocks set title = 'Python: loops 2' where title = 'Python: loops' and owner_id = pg_temp.owner();
reset role;
set local role service_role;
create temp table claimed2 as select public.claim_sync_rows('time_block', null, null, 10) as rows;
grant all on claimed2 to public;
reset role;
select tests.authenticate_as('owner@test.local');
update public.time_blocks set title = 'Python: loops 3' where title = 'Python: loops 2' and owner_id = pg_temp.owner();
reset role;
set local role service_role;
select is(public.finish_sync_row('time_block', ((select rows from claimed2) -> 0 ->> 'id')::uuid, ((select rows from claimed2) -> 0 ->> 'next_sync_at')::timestamptz,
  'evt-1', false, 'synced', 0, null, null), false, 'GC-8: a result for a lost lease is refused');
reset role;
select is((pg_temp.slot('Python: loops 3')).sync_status::text, 'pending', 'TB-5: the mid-sync edit stays pending');
select is((pg_temp.slot('Python: loops 3')).gcal_event_id, 'evt-1', 'GC-8: the event id is kept');

-- GC-9: a failed slot is not claimed before its time, nor after five failures.
set local role service_role;
select public.finish_sync_row('time_block', (select id from public.time_blocks where title = 'Python: loops 3' and owner_id = pg_temp.owner()),
  (select next_sync_at from public.time_blocks where title = 'Python: loops 3' and owner_id = pg_temp.owner()), null, false, 'failed', 1, 'Google is busy, will retry.', now() + interval '10 minutes');
select is(jsonb_array_length(public.claim_sync_rows('time_block', null, null, 10)), 0, 'GC-9: a failed slot waits for its backoff');
reset role;
update public.time_blocks set next_sync_at = now() - interval '1 minute', sync_attempts = 5 where title = 'Python: loops 3' and owner_id = pg_temp.owner();
set local role service_role;
select is(jsonb_array_length(public.claim_sync_rows('time_block', null, null, 10)), 0, 'GC-9: after five failures the sweep stops');
reset role;

------------------------------------------------------------------------------------------------
-- Buttons: Retry and Add to Google Calendar (TB-3).
------------------------------------------------------------------------------------------------
select tests.authenticate_as('owner@test.local');
select is(public.retry_calendar_sync((select id from public.time_blocks where title = 'Python: loops 3' and owner_id = pg_temp.owner())), 1, 'TB-3: Retry resets one failed slot');
select is((pg_temp.slot('Python: loops 3')).sync_status::text || (pg_temp.slot('Python: loops 3')).sync_attempts::text, 'pending0', 'TB-3: it is pending with no failures counted');
select is(public.retry_calendar_sync(null), 0, 'Retry with nothing failed changes nothing');

update public.blocks set config = '{"auto_sync": false}' where title = 'Workout slots';
select pg_temp.add_slot('Manual only', '2026-10-17 07:00+06', '2026-10-17 08:00+06');
select is((pg_temp.slot('Manual only')).sync_status::text, 'not_synced', 'TB-4: auto-sync off leaves a new slot not on the calendar');
select lives_ok($$ select public.request_calendar_sync((select id from public.time_blocks where title = 'Manual only' and owner_id = pg_temp.owner())) $$, 'TB-3: Add to Google Calendar queues the slot');
select is((pg_temp.slot('Manual only')).sync_status::text, 'pending', 'TB-3: and it is pending');
select throws_ok($$ select public.request_calendar_sync(gen_random_uuid()) $$, 'P0002', null, 'a slot that does not exist is refused');
select throws_ok($$ update public.time_blocks set sync_attempts = 3 where title = 'Manual only' and owner_id = pg_temp.owner() $$, '42501', null, 'DB-2: clients cannot write sync fields');

------------------------------------------------------------------------------------------------
-- GC-11 deadline events.
------------------------------------------------------------------------------------------------
select is((select sync_status::text from public.tasks where title = 'Buy running shoes'), 'not_synced', 'GC-11: off by default, tasks are untouched');
select lives_ok($$ select public.set_calendar_prefs(true, null, null) $$, 'GC-11: turning on push_deadlines');
select is((select sync_status::text from public.tasks where title = 'Buy running shoes'), 'pending', 'GC-11: a dated, unfinished task in an active space is queued');
reset role;
update public.tasks set sync_status = 'synced', gcal_event_id = 'task-evt-1', next_sync_at = null where title = 'Buy running shoes';
select tests.authenticate_as('owner@test.local');
select lives_ok($$ select public.set_task_done((select id from public.tasks where title = 'Buy running shoes'), true) $$, 'completing the task');
select is((select sync_status::text from public.tasks where title = 'Buy running shoes'), 'delete_pending', 'GC-11: completing a task queues its event for deletion');
select lives_ok($$ select public.set_calendar_prefs(false, null, null) $$, 'turning push_deadlines off');
select is((select count(*)::int from public.tasks where owner_id = pg_temp.owner() and gcal_event_id is not null and sync_status <> 'delete_pending'), 0, 'GC-11: every deadline event is queued for deletion');

------------------------------------------------------------------------------------------------
-- Disconnect (GC-5): the token goes, every row is "Not on calendar".
------------------------------------------------------------------------------------------------
reset role;
set local role service_role;
select lives_ok($$ select public.disconnect_google_account(tests.uid('owner@test.local')) $$, 'GC-5: disconnect runs');
select is(public.read_google_refresh_token(pg_temp.owner()), null, 'GC-5: the token can no longer be read');
reset role;
select is((select count(*)::int from vault.secrets where name = 'google_refresh_token_' || tests.uid('owner@test.local')::text), 0, 'GC-5: the Vault secret is deleted');
select is((select count(*)::int from public.time_blocks where owner_id = pg_temp.owner() and (gcal_event_id is not null or sync_status <> 'not_synced')), 0, 'GC-5: every slot is Not on calendar');
select is((select status::text from public.google_connections where owner_id = pg_temp.owner()), 'disconnected', 'GC-5: the connection reads disconnected');

select * from finish();
rollback;
