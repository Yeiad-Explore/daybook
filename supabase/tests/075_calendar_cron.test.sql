-- Phase 3: the 10-minute retry job (PRD §10.8, GC-6) and the connection-level auto-add default (GC-4, TB-4).
begin;
select plan(11);

select tests.create_user('owner@test.local');
select tests.seed(tests.uid('owner@test.local'));

select is((select schedule from cron.job where jobname = 'calendar_retry'), '*/10 * * * *', 'GC-6: calendar-sync is woken every 10 minutes');
select ok(exists (select 1 from cron.job where jobname = 'purge_sync_log'), 'the sync log is trimmed daily');

create function pg_temp.queued() returns bigint language sql as $$ select count(*) from net.http_request_queue $$;
create function pg_temp.add_slot(p_title text) returns void language sql as $$
  insert into public.time_blocks (owner_id, block_id, space_id, title, starts_at, ends_at)
  select owner_id, id, space_id, p_title, '2026-10-16 20:00+06', '2026-10-16 21:00+06' from public.blocks where title = 'Workout slots'
$$;

-- Nothing due: no call, even with the Vault entries present.
select vault.create_secret('http://example.test/functions/v1/calendar-sync', 'calendar_sync_url');
select vault.create_secret('secret-key-for-test', 'calendar_sync_key');
select is(pg_temp.queued(), 0::bigint, 'precondition: nothing queued');
select lives_ok($$ select private.invoke_calendar_sweep() $$, 'a sweep with nothing due is quiet');
select is(pg_temp.queued(), 0::bigint, 'GC-6: no call when nothing is due');

-- A pending slot is due: one call, authenticated with the secret key from Vault.
select pg_temp.add_slot('Due now');
select is((select sync_status::text from public.time_blocks where title = 'Due now'), 'pending', 'precondition: the slot is pending');
select private.invoke_calendar_sweep();
select is(pg_temp.queued(), 1::bigint, 'GC-6: a due slot makes the job call calendar-sync once');
select is((select headers ->> 'apikey' from net.http_request_queue limit 1), 'secret-key-for-test', 'the call carries the secret key from Vault');

-- Without the Vault entries the job never calls anything.
delete from vault.secrets where name in ('calendar_sync_url', 'calendar_sync_key');
delete from net.http_request_queue;
select lives_ok($$ select private.invoke_calendar_sweep() $$, 'without Vault entries the sweep does not fail');
select is(pg_temp.queued(), 0::bigint, 'and calls nothing');

-- GC-4: the connection's "add new slots automatically" default applies when a block has no setting of its own.
update public.google_connections set auto_sync_new_blocks = false;
select pg_temp.add_slot('Default off');
select is((select sync_status::text from public.time_blocks where title = 'Default off'), 'not_synced', 'GC-4: with the default off a new slot is not queued');

select * from finish();
rollback;
