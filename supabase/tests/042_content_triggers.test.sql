-- Content triggers: C-TRG-10 (table_cells_validate), C-TRG-11 (time_block_sync_flag),
-- C-TRG-12 (time_block_same_day), TB-1 AC1/AC2, TB-4, TB-5.
begin;
select plan(22);

select tests.create_user('owner@test.local');
select tests.seed(tests.uid('owner@test.local'));
select tests.authenticate_as('owner@test.local');

------------------------------------------------------------------------------------------------
-- C-TRG-10: cells match their column kind (Appendix B).
------------------------------------------------------------------------------------------------
insert into public.table_columns (block_id, name, kind, options, position)
select id, c.name, c.kind::public.column_kind, c.options::jsonb, c.pos from public.blocks,
  (values ('Item', 'text', '[]', 2), ('Qty', 'number', '[]', 3), ('Date', 'date', '[]', 4),
          ('Category', 'select', '[{"id":"opt_food","label":"Food","tone":"neutral"}]', 5),
          ('Paid', 'checkbox', '[]', 6), ('Receipt', 'url', '[]', 7)) c(name, kind, options, pos)
where title = 'Income and expenses';

create function pg_temp.cells(p jsonb) returns jsonb language sql as $$
  select jsonb_object_agg(c.id::text, p -> c.name) from public.table_columns c
  where c.name in (select jsonb_object_keys(p)) and c.block_id = (select id from public.blocks where title = 'Income and expenses')
$$;
create function pg_temp.add_row(p jsonb) returns void language sql as $$
  insert into public.table_rows (block_id, cells, position)
  select id, pg_temp.cells(p), 9 from public.blocks where title = 'Income and expenses'
$$;

select lives_ok(
  $$ select pg_temp.add_row('{"Item":"Rice","Qty":2,"Amount":-450,"Date":"2026-10-16","Category":"opt_food","Paid":true,"Receipt":"https://example.com/r/1"}') $$,
  'C-TRG-10: a row with valid cells of every kind is accepted'
);
select lives_ok($$ select pg_temp.add_row('{"Item":null,"Qty":null}') $$, 'C-TRG-10: empty (null) cells are accepted');
select throws_ok($$ select pg_temp.add_row('{"Item":5}') $$, '23514', null, 'C-TRG-10: text must be a string');
select throws_ok($$ select pg_temp.add_row('{"Qty":"two"}') $$, '23514', null, 'C-TRG-10: number must be a number (TBL-2 AC1)');
select throws_ok($$ select pg_temp.add_row('{"Amount":"৳500"}') $$, '23514', null, 'C-TRG-10: money must be a number');
select throws_ok($$ select pg_temp.add_row('{"Date":"16/10/2026"}') $$, '23514', null, 'C-TRG-10: date must be YYYY-MM-DD');
select throws_ok($$ select pg_temp.add_row('{"Date":"2026-02-30"}') $$, '23514', null, 'C-TRG-10: date must be a real date');
select throws_ok($$ select pg_temp.add_row('{"Category":"opt_missing"}') $$, '23514', null, 'C-TRG-10: select must be one of the column''s options');
select throws_ok($$ select pg_temp.add_row('{"Paid":"yes"}') $$, '23514', null, 'C-TRG-10: checkbox must be true or false');
select throws_ok($$ select pg_temp.add_row('{"Receipt":"ftp://example.com"}') $$, '23514', null, 'C-TRG-10: url must be http or https');
select throws_ok(
  $$ insert into public.table_rows (block_id, cells, position)
     select id, '{"00000000-0000-0000-0000-000000000000": "x"}', 9 from public.blocks where title = 'Income and expenses' $$,
  '23514', null, 'C-TRG-10: unknown column ids are rejected'
);
select throws_ok(
  $$ insert into public.table_rows (block_id, cells, position) select id, '[1, 2]', 9 from public.blocks where title = 'Income and expenses' $$,
  '23514', null, 'C-TRG-10: cells must be an object'
);

------------------------------------------------------------------------------------------------
-- C-TRG-12: a slot stays on one local day (profile timezone Asia/Dhaka, UTC+6).
------------------------------------------------------------------------------------------------
create function pg_temp.add_slot(p_title text, p_start timestamptz, p_end timestamptz) returns void language sql as $$
  insert into public.time_blocks (block_id, title, starts_at, ends_at)
  select id, p_title, p_start, p_end from public.blocks where title = 'Workout slots'
$$;
select throws_ok($$ select pg_temp.add_slot('Backwards', '2026-10-16 10:00+06', '2026-10-16 09:00+06') $$,
  '23514', null, 'TB-1 AC1: the end time must be after the start time');
select throws_ok($$ select pg_temp.add_slot('Overnight', '2026-10-16 23:00+06', '2026-10-17 00:30+06') $$,
  '23514', null, 'C-TRG-12: a slot crossing local midnight is rejected (TB-1 AC2)');
select lives_ok($$ select pg_temp.add_slot('Until midnight', '2026-10-16 23:00+06', '2026-10-17 00:00+06') $$,
  'C-TRG-12: a slot may end exactly at midnight');
select throws_ok($$ select pg_temp.add_slot('UTC trap', '2026-10-16 17:30+00', '2026-10-16 18:30+00') $$,
  '23514', null, 'C-TRG-12: the day is the owner''s local day, not UTC (23:30–00:30 in Dhaka)');

------------------------------------------------------------------------------------------------
-- C-TRG-11: Calendar sync flag (owner is connected in the fixtures).
------------------------------------------------------------------------------------------------
select pg_temp.add_slot('Python: loops', '2026-10-16 20:00+06', '2026-10-16 21:30+06');
select results_eq(
  $$ select sync_status::text, next_sync_at is not null from public.time_blocks where title = 'Python: loops' $$,
  $$ values ('pending', true) $$, 'C-TRG-11: a new slot is queued for Calendar when connected (GC-6, TB-4)'
);

reset role;  -- Daybook's sync function marks it synced
update public.time_blocks set sync_status = 'synced', gcal_event_id = 'evt-1', sync_attempts = 3, next_sync_at = null
where title = 'Python: loops';
select tests.authenticate_as('owner@test.local');

update public.time_blocks set ends_at = '2026-10-16 22:00+06' where title = 'Python: loops';
select results_eq(
  $$ select sync_status::text, sync_attempts, gcal_event_id from public.time_blocks where title = 'Python: loops' $$,
  $$ values ('pending', 0::smallint, 'evt-1'::text) $$, 'C-TRG-11: editing a synced slot re-queues it and keeps the event id (TB-5, GC-8)'
);

reset role;
update public.time_blocks set sync_status = 'synced' where title = 'Python: loops';
select tests.authenticate_as('owner@test.local');
update public.time_blocks set task_id = (select id from public.tasks where title = 'Buy running shoes') where title = 'Python: loops';
select is((select sync_status::text from public.time_blocks where title = 'Python: loops'), 'synced',
  'C-TRG-11: linking a task does not touch the calendar event');

update public.time_blocks set deleted_at = now() where title = 'Python: loops';
select is((select sync_status::text from public.time_blocks where title = 'Python: loops'), 'delete_pending',
  'C-TRG-11: trashing a synced slot queues the event for deletion (TB-5, GC-6)');

update public.blocks set config = '{"auto_sync": false}' where title = 'Workout slots';
select pg_temp.add_slot('Manual only', '2026-10-17 07:00+06', '2026-10-17 08:00+06');
select is((select sync_status::text from public.time_blocks where title = 'Manual only'), 'not_synced',
  'C-TRG-11: a block with auto-sync off does not queue new slots (TB-4)');

reset role;
update public.google_connections set status = 'disconnected' where owner_id = tests.uid('owner@test.local');
select tests.authenticate_as('owner@test.local');
update public.blocks set config = '{}' where title = 'Workout slots';
select pg_temp.add_slot('Offline', '2026-10-18 07:00+06', '2026-10-18 08:00+06');
select is((select sync_status::text from public.time_blocks where title = 'Offline'), 'not_synced',
  'C-TRG-11: nothing is queued while Calendar is not connected (GC-10)');

select * from finish();
rollback;
