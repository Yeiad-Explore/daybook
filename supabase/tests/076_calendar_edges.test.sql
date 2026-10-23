-- Phase 3 review fixes: items trashed or finished before they reach Google, a connection waiting for a reconnect,
-- failed deletes, and the lease on explicit claims. TB-5, GC-9, GC-10, GC-11.
begin;
select plan(21);

select tests.create_user('owner@test.local');
select tests.seed(tests.uid('owner@test.local'));

create function pg_temp.owner() returns uuid language sql as $$ select tests.uid('owner@test.local') $$;
create function pg_temp.add_slot(p_title text) returns uuid language sql as $$
  insert into public.time_blocks (block_id, title, starts_at, ends_at)
  select id, p_title, '2026-10-16 20:00+06', '2026-10-16 21:00+06' from public.blocks where title = 'Workout slots'
  returning id
$$;
create function pg_temp.slot(p_title text) returns public.time_blocks language sql as $$
  select t from public.time_blocks t where t.title = p_title and t.owner_id = pg_temp.owner()
$$;
create function pg_temp.task(p_title text) returns public.tasks language sql as $$
  select t from public.tasks t where t.title = p_title and t.owner_id = pg_temp.owner()
$$;

------------------------------------------------------------------------------------------------
-- A slot trashed before it reached Google is never created there.
------------------------------------------------------------------------------------------------
select tests.authenticate_as('owner@test.local');
select pg_temp.add_slot('Trashed early');
select is((pg_temp.slot('Trashed early')).sync_status::text, 'pending', 'precondition: queued');
update public.time_blocks set deleted_at = now() where title = 'Trashed early' and owner_id = pg_temp.owner();
select is((pg_temp.slot('Trashed early')).sync_status::text, 'not_synced', 'TB-5: a slot trashed before its first sync leaves the queue');
select is((pg_temp.slot('Trashed early')).next_sync_at, null, 'and has nothing scheduled');

-- Defence in depth: even a deleted row left pending is not handed out.
reset role;
update public.time_blocks set sync_status = 'pending', next_sync_at = now() - interval '1 minute' where title = 'Trashed early' and owner_id = pg_temp.owner();
set local role service_role;
select is(jsonb_array_length(public.claim_sync_rows('time_block', null, pg_temp.owner(), 10)), 0, 'claim_sync_rows never hands out a trashed row that has no event to delete');
reset role;

------------------------------------------------------------------------------------------------
-- An event created while the item was being trashed is queued for deletion (the triggers had no id to act on).
------------------------------------------------------------------------------------------------
select tests.authenticate_as('owner@test.local');
select pg_temp.add_slot('Trashed mid-sync');
reset role;
set local role service_role;
create temp table claimed as select public.claim_sync_rows('time_block', null, pg_temp.owner(), 10) as rows;
grant all on claimed to public;
reset role;
select tests.authenticate_as('owner@test.local');
update public.time_blocks set deleted_at = now() where title = 'Trashed mid-sync' and owner_id = pg_temp.owner();
reset role;
set local role service_role;
select is(public.finish_sync_row('time_block', ((select rows from claimed) -> 0 ->> 'id')::uuid, ((select rows from claimed) -> 0 ->> 'next_sync_at')::timestamptz,
  'evt-late', false, 'synced', 0, null, null), false, 'the stale result is refused');
reset role;
select is((pg_temp.slot('Trashed mid-sync')).gcal_event_id, 'evt-late', 'GC-8: the created event id is kept');
select is((pg_temp.slot('Trashed mid-sync')).sync_status::text, 'delete_pending', 'TB-5: and the event is queued for deletion');

------------------------------------------------------------------------------------------------
-- A task done before it reached Google; a task done while its create was in flight.
------------------------------------------------------------------------------------------------
select tests.authenticate_as('owner@test.local');
select public.set_calendar_prefs(true, null, null);
select is((pg_temp.task('Buy running shoes')).sync_status::text, 'pending', 'GC-11: precondition, the deadline is queued');
select public.set_task_done((pg_temp.task('Buy running shoes')).id, true);
select is((pg_temp.task('Buy running shoes')).sync_status::text, 'not_synced', 'GC-11: done before its first sync, it leaves the queue');

------------------------------------------------------------------------------------------------
-- GC-10: while Google waits for a reconnect, nothing is lost and no deadline event is dropped.
------------------------------------------------------------------------------------------------
reset role;
update public.tasks set done = false where title = 'Buy running shoes' and owner_id = pg_temp.owner();
update public.tasks set sync_status = 'synced', gcal_event_id = 'task-evt', next_sync_at = null where title = 'Buy running shoes' and owner_id = pg_temp.owner();
update public.google_connections set status = 'needs_reconnect' where owner_id = pg_temp.owner();
select private.reconcile_deadline_events(pg_temp.owner());
select is((pg_temp.task('Buy running shoes')).sync_status::text, 'synced', 'GC-10: a pending reconnect does not make the cron delete deadline events');

select tests.authenticate_as('owner@test.local');
select pg_temp.add_slot('During outage');
select is((pg_temp.slot('During outage')).sync_status::text, 'pending', 'GC-10: a slot added while waiting for a reconnect is queued, not forgotten');
reset role;
update public.time_blocks set sync_status = 'synced', gcal_event_id = 'slot-evt', next_sync_at = null where title = 'During outage' and owner_id = pg_temp.owner();
select tests.authenticate_as('owner@test.local');
update public.time_blocks set title = 'During outage 2' where title = 'During outage' and owner_id = pg_temp.owner();
select is((pg_temp.slot('During outage 2')).sync_status::text, 'pending', 'GC-10: editing a synced slot during the outage queues the change');
reset role;
set local role service_role;
select is(jsonb_array_length(public.claim_sync_rows('time_block', null, pg_temp.owner(), 10)), 0, 'GC-10: nothing is handed out while the connection waits');
reset role;
update public.google_connections set status = 'connected' where owner_id = pg_temp.owner();

------------------------------------------------------------------------------------------------
-- A failed delete stays a delete, counts as a failed sync, and Retry keeps it a delete.
------------------------------------------------------------------------------------------------
update public.time_blocks set sync_status = 'delete_pending', sync_error = 'Google had a problem, will retry.', sync_attempts = 2, next_sync_at = now() + interval '30 minutes'
  where title = 'During outage 2' and owner_id = pg_temp.owner();
select tests.authenticate_as('owner@test.local');
select ok((public.get_calendar_status() ->> 'failed_syncs')::int >= 1, 'GC-9: a failed delete counts in "Failed syncs"');
select ok(public.retry_calendar_sync(null) >= 1, 'GC-9: Retry all picks it up');
select is((pg_temp.slot('During outage 2')).sync_status::text, 'delete_pending', 'TB-5: Retry keeps a failed delete a delete');
select is((pg_temp.slot('During outage 2')).sync_attempts, 0::smallint, 'with the count reset');

------------------------------------------------------------------------------------------------
-- An explicit claim respects the lease: a row being synced is not handed out a second time.
------------------------------------------------------------------------------------------------
reset role;
set local role service_role;
create temp table first_claim as select public.claim_sync_rows('time_block', (select id from public.time_blocks where title = 'During outage 2' and owner_id = pg_temp.owner()), pg_temp.owner(), 1) as rows;
select is(jsonb_array_length((select rows from first_claim)), 1, 'an explicit claim takes the row');
select is(jsonb_array_length(public.claim_sync_rows('time_block', (select id from public.time_blocks where title = 'During outage 2' and owner_id = pg_temp.owner()), pg_temp.owner(), 1)), 0,
  'GC-8: a second claim during the lease gets nothing');
reset role;

------------------------------------------------------------------------------------------------
-- Disconnect while waiting for a reconnect can still revoke: the token stays readable until it is deleted.
------------------------------------------------------------------------------------------------
set local role service_role;
select public.connect_google_account(pg_temp.owner(), 'owner@gmail.test', array['x'], 'tok-1');
reset role;
update public.google_connections set status = 'needs_reconnect' where owner_id = pg_temp.owner();
set local role service_role;
select is(public.read_google_refresh_token(pg_temp.owner()), 'tok-1', 'GC-5: Disconnect can still read the token to revoke it while a reconnect is pending');
reset role;
select tests.authenticate_as('owner@test.local');
select throws_ok($$ select public.read_google_refresh_token(tests.uid('owner@test.local')) $$, '42501', null, 'and a signed-in user still cannot');

select * from finish();
rollback;
