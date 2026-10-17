-- Phase 2 tracking: routine_streak (RT-1..5, Appendix D), tracker entries and tracker_series (TRK-2, 3, 5),
-- progress metrics and their fallback (SPC-7, Appendix C), get_today slots/routines/trackers (Appendix A).
-- C-RT-01..03, C-TRK-01..02, C-SPC-04..06, C-TODAY-02. Fixtures: PRD §12 subset, p_today = 2026-10-16 (a Friday).
begin;
select plan(90);

select tests.create_user('owner@test.local');
select tests.create_user('other@test.local');
select tests.seed(tests.uid('owner@test.local'));

create function pg_temp.block_id(p_title text) returns uuid language sql as $$ select id from public.blocks where title = p_title $$;
create function pg_temp.field_id(p_label text) returns uuid language sql as $$ select id from public.tracker_fields where label = p_label $$;
create function pg_temp.streak() returns jsonb language sql as $$ select public.routine_streak(pg_temp.block_id('Morning'), '2026-10-16') $$;
create function pg_temp.check_day(p_day date, p_steps int default 99) returns void language sql as $$
  insert into public.routine_checks (step_id, block_id, check_date)
  select s.id, s.block_id, p_day from public.routine_steps s
  where s.block_id = pg_temp.block_id('Morning') and s.archived_at is null
  order by s.position limit p_steps
  on conflict do nothing
$$;
create function pg_temp.hist(p_day text) returns text language sql as $$
  select h ->> 'state' from jsonb_array_elements(pg_temp.streak() -> 'history') h where h ->> 'date' = p_day
$$;

-- Routine history reaches back before 4 Oct: the block and its steps are a month old.
update public.blocks set created_at = '2026-09-01 08:00+06' where title = 'Morning';
update public.routine_steps set created_at = '2026-09-01 08:00+06';

select tests.authenticate_as('owner@test.local');
select set_config('app.today', '2026-10-16', true);

------------------------------------------------------------------------------------------------
-- RT-4 AC1: complete on each of the last 12 scheduled days, 2 of 4 today -> 12; the rest -> 13.
------------------------------------------------------------------------------------------------
select pg_temp.check_day(d::date) from generate_series('2026-10-04'::date, '2026-10-15', '1 day') d;
insert into public.routine_checks (step_id, block_id, check_date)
select id, block_id, '2026-10-16' from public.routine_steps where label = 'Vitamin C serum';
select is((pg_temp.streak() ->> 'streak')::int, 12, 'RT-4 AC1: 12 complete days, today 2 of 4 -> streak 12');
select is((pg_temp.streak() ->> 'today_complete')::boolean, false, 'RT-4: today is not complete yet');
select pg_temp.check_day('2026-10-16');
select is((pg_temp.streak() ->> 'streak')::int, 13, 'RT-4 AC1: the remaining steps checked -> streak 13');
select is((pg_temp.streak() ->> 'today_complete')::boolean, true, 'RT-4: today is complete');

-- C-RT-02: a step added in the evening of a past day never turns that day into a miss.
insert into public.routine_steps (block_id, label, position, created_at)
select id, 'Evening add', 8, '2026-10-15 18:00+06' from public.blocks where title = 'Morning';
select is((pg_temp.streak() ->> 'streak')::int, 12, 'C-RT-02: a step added on 15 Oct at 18:00 leaves 15 Oct complete (only today now needs it)');
select is(pg_temp.hist('2026-10-15'), 'complete', 'C-RT-02: 15 Oct stays complete');
update public.routine_steps set archived_at = '2026-10-16 07:00+06' where label = 'Evening add';
select is((pg_temp.streak() ->> 'streak')::int, 13, 'C-RT-02: archiving it makes today complete again');

-- C-RT-02: a step added today, or archived today, never changes earlier days.
insert into public.routine_steps (block_id, label, position, created_at)
select id, 'Toner', 9, '2026-10-16 08:00+06' from public.blocks where title = 'Morning';
select is((pg_temp.streak() ->> 'streak')::int, 12, 'C-RT-02: a new step makes today incomplete but breaks nothing earlier');
update public.routine_steps set archived_at = '2026-10-16 09:00+06' where label = 'Toner';
select is((pg_temp.streak() ->> 'streak')::int, 13, 'C-RT-02: archiving that step today makes today complete again');
update public.routine_steps set archived_at = '2026-10-16 09:00+06' where label = 'Sunscreen SPF 50';
select is((pg_temp.streak() ->> 'streak')::int, 13, 'C-RT-02: a step archived today still counted on the earlier days it existed');

-- Missing one step on one earlier day ends the streak there.
delete from public.routine_checks where check_date = '2026-10-10' and step_id = (select id from public.routine_steps where label = 'Cleanser');
select is((pg_temp.streak() ->> 'streak')::int, 6, 'RT-4: one missed step on 10 Oct ends the streak (11..16 Oct = 6 days)');
select is(pg_temp.hist('2026-10-10'), 'partial', 'C-RT-03: a day with some steps checked is partial');
delete from public.routine_checks where check_date = '2026-10-10';
select is(pg_temp.hist('2026-10-10'), 'missed', 'C-RT-03: a day with nothing checked is missed');
select is(pg_temp.hist('2026-10-12'), 'complete', 'C-RT-03: a fully checked day is complete');

-- RT-2/RT-4: weekday schedule Mon/Wed/Fri. Unscheduled days neither break nor extend the streak.
delete from public.routine_checks;
update public.blocks set config = '{"days":[1,3,5]}' where title = 'Morning';
update public.routine_steps set archived_at = null;
select pg_temp.check_day('2026-10-14');
select pg_temp.check_day('2026-10-12');
select pg_temp.check_day('2026-10-09');
select is((pg_temp.streak() ->> 'streak')::int, 3, 'RT-4: Wed 14, Mon 12, Fri 9 complete; Tue/Thu/weekend skipped; today (Fri) not done -> 3');
select is(pg_temp.hist('2026-10-13'), 'not_scheduled', 'C-RT-03: a Tuesday is not scheduled');
select is(pg_temp.hist('2026-10-16'), 'open', 'C-RT-03: today, unfinished, is open');
select is((pg_temp.streak() ->> 'scheduled_today')::boolean, true, 'RT-2: Friday is scheduled');
delete from public.routine_checks where check_date = '2026-10-09';
select is((pg_temp.streak() ->> 'streak')::int, 2, 'RT-4: a missed scheduled day (Fri 9) ends the streak');
select pg_temp.check_day('2026-10-16');
select is((pg_temp.streak() ->> 'streak')::int, 3, 'RT-4: today complete adds one');

-- Today unscheduled: nothing is added even if everything is checked.
update public.blocks set config = '{"days":[2,4]}' where title = 'Morning';
select is((pg_temp.streak() ->> 'scheduled_today')::boolean, false, 'RT-2: Friday is not scheduled for a Tue/Thu routine');
select is((pg_temp.streak() ->> 'today_complete')::boolean, false, 'RT-4: an unscheduled day is never "complete"');

-- The streak starts at the block's first day; earlier days do not exist.
update public.blocks set config = '{}' where title = 'Morning';
delete from public.routine_checks;
update public.blocks set created_at = '2026-10-10 08:00+06' where title = 'Morning';
update public.routine_steps set created_at = '2026-10-10 08:00+06';
select pg_temp.check_day(d::date) from generate_series('2026-10-10'::date, '2026-10-15', '1 day') d;
select is((pg_temp.streak() ->> 'streak')::int, 6, 'RT-4: the walk stops at the block''s first day (10..15 Oct = 6)');
select is(pg_temp.hist('2026-10-09'), 'not_scheduled', 'C-RT-03: days before the block existed are not scheduled');
select is(jsonb_array_length(pg_temp.streak() -> 'history'), 84, 'C-RT-03: history covers 84 days');
select is((pg_temp.streak() -> 'history' -> 83) ->> 'date', '2026-10-16', 'C-RT-03: history ends today');

-- No active steps -> no streak, no loop.
update public.routine_steps set archived_at = '2026-10-12 08:00+06';
select is((pg_temp.streak() ->> 'streak')::int, 0, 'RT-1: a routine with no active steps has no streak');
reset role;
update public.routine_steps set archived_at = null;
select tests.authenticate_as('owner@test.local');

-- Another user cannot read the owner's routine.
select tests.authenticate_as('other@test.local');
select throws_ok($$ select public.routine_streak((select id from public.blocks where title = 'Morning' limit 1), '2026-10-16') $$,
  'P0002', null, 'C-RT-01: another user gets not found (RLS)');
select tests.authenticate_as('owner@test.local');

------------------------------------------------------------------------------------------------
-- TRK-2 AC1: one entry per field per date; upsert updates.
------------------------------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.tracker_entries (field_id, block_id, entry_date, value)
     select id, block_id, '2026-10-16', 70 from public.tracker_fields where label = 'Weight' $$,
  '23505', null, 'C-TRK-01: a second entry for the same field and date is rejected');
insert into public.tracker_entries (field_id, block_id, entry_date, value)
select id, block_id, '2026-10-16', 77.0 from public.tracker_fields where label = 'Weight'
on conflict (field_id, entry_date) do update set value = excluded.value;
select results_eq($$ select count(*)::int, max(value)::numeric from public.tracker_entries where field_id = pg_temp.field_id('Weight') and entry_date = '2026-10-16' $$,
  $$ values (1, 77.0::numeric) $$, 'TRK-2 AC1: upsert on (field, date) updates the one entry');
update public.tracker_entries set value = 77.2 where entry_date = '2026-10-16';

------------------------------------------------------------------------------------------------
-- tracker_series (TRK-3, TRK-5)
------------------------------------------------------------------------------------------------
insert into public.tracker_entries (field_id, block_id, entry_date, value)
select f.id, f.block_id, d.day::date, d.v from public.tracker_fields f,
  (values ('2026-09-05', 78.4), ('2026-10-01', 78.0), ('2026-10-10', 77.6), ('2026-10-13', 77.4), ('2026-10-17', 70.0)) d(day, v)
where f.label = 'Weight';
create function pg_temp.series(p_label text, p_days int default 30) returns jsonb language sql as $$
  select public.tracker_series(pg_temp.field_id(p_label), p_days)
$$;

select is(jsonb_array_length(pg_temp.series('Weight', 7) -> 'entries'), 3, 'TRK-3: 7 days = 10, 13 and 16 Oct (future entries are ignored)');
select is(jsonb_array_length(pg_temp.series('Weight', 90) -> 'entries'), 5, 'TRK-3: 90 days reaches 5 Sep');
select is((pg_temp.series('Weight', 7) -> 'latest' ->> 'value')::numeric, 77.2, 'TRK-3: latest is the last entry up to today');
select is((pg_temp.series('Weight', 7) ->> 'average_7d')::numeric, 77.4, 'TRK-3: 7-day average = mean of the entries logged in the last 7 days');
select is((pg_temp.series('Weight', 7) ->> 'change')::numeric, -1.2, 'TRK-3: change over the last 14 entries (latest minus the oldest of them)');
select is(pg_temp.series('Weight', 7) ->> 'target_status', 'over', 'TRK-3: reach 72 from 78.4 down, latest 77.2 -> over');
select is((pg_temp.series('Weight', 7) -> 'field' ->> 'target_value')::numeric, 72::numeric, 'TRK-3: the field and its target come with the series');
select throws_ok($$ select pg_temp.series('Weight', 14) $$, '22023', null, 'C-TRK-02: ranges other than 7, 30, 90 are refused');

insert into public.tracker_fields (block_id, label, unit, decimals, target_value, target_kind, position)
select pg_temp.block_id('Body & food'), x.label, x.unit, x.dec, x.tv, x.tk::public.target_kind, x.pos
from (values ('Calories', 'kcal', 0, 2000, 'at_most', 2), ('Study', 'h', 1, 2, 'at_least', 3), ('Steps', null, 0, null, null, 4)) x(label, unit, dec, tv, tk, pos);
insert into public.tracker_entries (field_id, block_id, entry_date, value)
select f.id, f.block_id, d.day::date, d.v from public.tracker_fields f join
  (values ('Calories', '2026-10-14', 1800), ('Calories', '2026-10-15', 2300), ('Calories', '2026-10-16', 2000),
          ('Study', '2026-10-15', 1), ('Study', '2026-10-16', 2), ('Steps', '2026-10-16', 8000)) d(label, day, v) on d.label = f.label;
select is(pg_temp.series('Calories', 7) ->> 'target_status', 'over', 'TRK-3: at_most 2000, 7-day average 2033 -> over');
update public.tracker_entries set value = 1900 where entry_date = '2026-10-16' and field_id = pg_temp.field_id('Calories');
select is(pg_temp.series('Calories', 7) ->> 'target_status', 'on_target', 'TRK-3: at_most 2000, average 2000 -> on target');
select is(pg_temp.series('Study', 7) ->> 'target_status', 'under', 'TRK-3: at_least 2, average 1.5 -> under');
select is(pg_temp.series('Steps', 7) ->> 'target_status', null, 'TRK-3: no target, no status');

insert into public.tracker_fields (block_id, label, position) select pg_temp.block_id('Body & food'), 'Mood', 5;
select ok(pg_temp.series('Mood', 30) ->> 'latest' is null, 'TRK-3: a field with no entries has no latest value');
select is(jsonb_array_length(pg_temp.series('Mood', 30) -> 'entries'), 0, 'TRK-3: and an empty series');

-- TRK-5: logging streak, any active field counts; today unlogged does not break it.
select is((pg_temp.series('Weight', 7) ->> 'logging_streak')::int, 4, 'TRK-5: logged 13, 14, 15 and 16 Oct -> 4 days in a row');
update public.tracker_fields set archived_at = now() where label = 'Calories';
select is((pg_temp.series('Weight', 7) ->> 'logging_streak')::int, 2, 'TRK-6: an archived field''s entries do not count (14 Oct had only Calories)');
update public.tracker_fields set archived_at = null where label = 'Calories';
delete from public.tracker_entries where entry_date = '2026-10-16';
select is((pg_temp.series('Weight', 7) ->> 'logging_streak')::int, 3, 'TRK-5: today not logged yet does not break the streak');
delete from public.tracker_entries where entry_date = '2026-10-15';
select is((pg_temp.series('Weight', 7) ->> 'logging_streak')::int, 0, 'TRK-5: yesterday missing -> 0');
update public.tracker_fields set archived_at = now() where label = 'Calories';

------------------------------------------------------------------------------------------------
-- SPC-7 / Appendix C progress metrics, C-SPC-06 guard
------------------------------------------------------------------------------------------------
create function pg_temp.progress(p_space text) returns jsonb language sql as $$
  select public.space_summary((select id from public.spaces where name = p_space), '2026-10-16') -> 'progress'
$$;
insert into public.tracker_entries (field_id, block_id, entry_date, value)
select id, block_id, '2026-10-16', 77.2 from public.tracker_fields where label = 'Weight' on conflict do nothing;
select throws_ok($$ update public.spaces set metric = 'tracker' where name = 'AI Engineering' $$, '23514', null,
  'C-SPC-06: a tracker metric needs a field');
select throws_ok(
  format($$ update public.spaces set metric = 'tracker', metric_config = '{"tracker":{"field_id":"%s","start":78.4,"target":72}}' where name = 'AI Engineering' $$, pg_temp.field_id('Weight')),
  '23514', null, 'C-SPC-06: the field must belong to this space');
update public.spaces set metric = 'tracker',
  metric_config = jsonb_build_object('tracker', jsonb_build_object('field_id', pg_temp.field_id('Weight'), 'start', 78.4, 'target', 72))
where name = 'Health';
select is((pg_temp.progress('Health') ->> 'percent')::int, 19, 'Appendix C tracker: (78.4 - 77.2) / (78.4 - 72) = 18.75% -> 19');
select is(pg_temp.progress('Health') ->> 'label', '77.2 kg now · started 78.4 · target 72', 'SPC-7: tracker label');
select is(pg_temp.progress('Health') ->> 'metric', 'tracker', 'SPC-7: the metric is reported');

insert into public.tracker_fields (block_id, label, unit, decimals, position) select pg_temp.block_id('Body & food'), 'Pushups', null, 0, 6;
insert into public.tracker_entries (field_id, block_id, entry_date, value)
select id, block_id, '2026-10-16', 15 from public.tracker_fields where label = 'Pushups';
update public.spaces set metric_config = jsonb_build_object('tracker', jsonb_build_object('field_id', pg_temp.field_id('Pushups'), 'start', 10, 'target', 20)) where name = 'Health';
select is((pg_temp.progress('Health') ->> 'percent')::int, 50, 'Appendix C tracker: an increasing target (10 -> 20, now 15) = 50%');
update public.tracker_entries set value = 8 where field_id = pg_temp.field_id('Pushups');
select is((pg_temp.progress('Health') ->> 'percent')::int, 0, 'Appendix C tracker: worse than the start clamps to 0');
update public.tracker_entries set value = 30 where field_id = pg_temp.field_id('Pushups');
select is((pg_temp.progress('Health') ->> 'percent')::int, 100, 'Appendix C tracker: past the target clamps to 100');
update public.spaces set metric_config = jsonb_build_object('tracker', jsonb_build_object('field_id', pg_temp.field_id('Pushups'), 'start', 20, 'target', 20)) where name = 'Health';
select is((pg_temp.progress('Health') ->> 'percent')::int, 0, 'Appendix C tracker: start = target is 100 only when latest = target (30 is not)');
update public.tracker_entries set value = 20 where field_id = pg_temp.field_id('Pushups');
select is((pg_temp.progress('Health') ->> 'percent')::int, 100, 'Appendix C tracker: start = target and latest = target -> 100');
delete from public.tracker_entries where field_id = pg_temp.field_id('Pushups');
select is(pg_temp.progress('Health') ->> 'label', 'No entries yet · started 20 · target 20', 'SPC-7: tracker with no entries');
select is((pg_temp.progress('Health') ->> 'percent')::int, 0, 'Appendix C tracker: no entries -> 0');

-- table_count: Clients table in AI Agency (2 of 5).
insert into public.pages (space_id, title, position) select id, 'Clients', 2 from public.spaces where name = 'AI Agency';
insert into public.blocks (page_id, space_id, type, title, position)
select p.id, p.space_id, 'table', 'Client pipeline', 1 from public.pages p where p.title = 'Clients';
insert into public.table_columns (block_id, name, kind, options, position)
select pg_temp.block_id('Client pipeline'), 'Status', 'select',
  '[{"id":"opt_lead","label":"Lead","tone":"early"},{"id":"opt_client","label":"Client","tone":"active"}]', 1;
insert into public.table_rows (block_id, cells, position)
select pg_temp.block_id('Client pipeline'), jsonb_build_object(c.id::text, v.opt), v.pos
from public.table_columns c, (values ('opt_client', 1), ('opt_client', 2), ('opt_lead', 3)) v(opt, pos) where c.name = 'Status';
insert into public.table_rows (block_id, cells, position, deleted_at)
select pg_temp.block_id('Client pipeline'), jsonb_build_object(c.id::text, 'opt_client'), 4, now() from public.table_columns c where c.name = 'Status';
create function pg_temp.set_count(p_target int, p_col text default 'Status') returns void language sql as $$
  update public.spaces set metric = 'table_count',
    metric_config = jsonb_build_object('table_count', jsonb_build_object(
      'column_id', (select id from public.table_columns where name = p_col), 'option_id', 'opt_client', 'target', p_target))
  where name = 'AI Agency'
$$;
select pg_temp.set_count(5);
select is((pg_temp.progress('AI Agency') ->> 'percent')::int, 40, 'Appendix C table_count: 2 of 5 = 40% (rows in Trash do not count)');
select is(pg_temp.progress('AI Agency') ->> 'label', '2 of 5 · Client', 'SPC-7: table_count label');
select pg_temp.set_count(1);
select is((pg_temp.progress('AI Agency') ->> 'percent')::int, 100, 'Appendix C table_count: clamped to 100');
select throws_ok($$ select pg_temp.set_count(0) $$, '23514', null, 'C-SPC-06: the target must be at least 1');
insert into public.table_columns (block_id, name, kind, position) select pg_temp.block_id('Client pipeline'), 'Notes', 'text', 2;
select throws_ok($$ select pg_temp.set_count(5, 'Notes') $$, '23514', null, 'C-SPC-06: the column must be a select column');
select pg_temp.set_count(5);

-- manual, and SPC-7 AC1: changing the metric recalculates immediately.
update public.spaces set metric = 'manual', metric_config = '{"manual":{"percent":40}}' where name = 'AI Agency';
select is((pg_temp.progress('AI Agency') ->> 'percent')::int, 40, 'SPC-7 manual: percent as entered');
select is(pg_temp.progress('AI Agency') ->> 'label', 'Set manually: 40%', 'SPC-7 manual: label');
select throws_ok($$ update public.spaces set metric_config = '{"manual":{"percent":140}}' where name = 'AI Agency' $$, '23514', null,
  'C-SPC-06: manual percent is 0 to 100');
update public.spaces set metric = 'tasks', metric_config = '{}' where name = 'AI Agency';
select is(pg_temp.progress('AI Agency') ->> 'metric', 'tasks', 'SPC-7 AC1: switching the metric recalculates the summary at once');

-- SPC-7 AC2 / C-SPC-05: deleting what the metric reads falls back to tasks and says so.
select pg_temp.set_count(5);
delete from public.table_columns where name = 'Status';
select results_eq($$ select metric::text, metric_config ->> 'fell_back_from' from public.spaces where name = 'AI Agency' $$,
  $$ values ('tasks', 'table_count') $$, 'SPC-7 AC2: deleting the select column falls back to tasks and records why');
insert into public.table_columns (block_id, name, kind, options, position)
select pg_temp.block_id('Client pipeline'), 'Status', 'select', '[{"id":"opt_client","label":"Client","tone":"active"}]', 1;
select pg_temp.set_count(5);
update public.table_columns set options = '[]' where name = 'Status';
select results_eq($$ select metric::text, metric_config ->> 'fell_back_from' from public.spaces where name = 'AI Agency' $$,
  $$ values ('tasks', 'table_count') $$, 'SPC-7 AC2: removing the chosen option falls back as well');
update public.spaces set metric_config = jsonb_build_object('tracker', jsonb_build_object('field_id', pg_temp.field_id('Pushups'), 'start', 20, 'target', 20)) where name = 'Health';
delete from public.tracker_fields where label = 'Pushups';
select results_eq($$ select metric::text, metric_config ->> 'fell_back_from' from public.spaces where name = 'Health' $$,
  $$ values ('tasks', 'tracker') $$, 'SPC-7 AC2: deleting the tracker field falls back to tasks');
select is(pg_temp.progress('Health') ->> 'metric', 'tasks', 'SPC-7 AC2: and the summary now reports the tasks metric');

-- A tracker block in Trash: display falls back without touching the setting (C-SPC-04).
update public.spaces set metric = 'tracker',
  metric_config = jsonb_build_object('tracker', jsonb_build_object('field_id', pg_temp.field_id('Weight'), 'start', 78.4, 'target', 72)) where name = 'Health';
update public.blocks set deleted_at = now() where title = 'Body & food';
select results_eq($$ select pg_temp.progress('Health') ->> 'metric', (pg_temp.progress('Health') ->> 'fallback')::boolean $$,
  $$ values ('tasks', true) $$, 'C-SPC-04: a metric whose block is in Trash is shown as tasks with fallback = true');
select is((select metric::text from public.spaces where name = 'Health'), 'tracker', 'C-SPC-04: the stored setting is untouched');
update public.blocks set deleted_at = null where title = 'Body & food';
select is(pg_temp.progress('Health') ->> 'metric', 'tracker', 'C-SPC-04: restoring the block restores the metric');

------------------------------------------------------------------------------------------------
-- get_today: slots, routines, trackers (C-TODAY-02, Appendix A)
------------------------------------------------------------------------------------------------
create function pg_temp.today() returns jsonb language sql as $$ select public.get_today('2026-10-16') $$;
reset role;
update public.blocks set config = '{}' where title = 'Morning';
update public.routine_steps set archived_at = null;
delete from public.routine_checks;
insert into public.routine_checks (owner_id, step_id, block_id, check_date)
select owner_id, id, block_id, '2026-10-16' from public.routine_steps where label in ('Cleanser', 'Moisturizer');
insert into public.time_blocks (owner_id, block_id, space_id, title, starts_at, ends_at)
select b.owner_id, b.id, b.space_id, v.title, v.s::timestamptz, v.e::timestamptz
from public.blocks b, (values ('Late run', '2026-10-16 23:30+06', '2026-10-16 23:59+06'),
                              ('After midnight', '2026-10-17 00:10+06', '2026-10-17 00:40+06'),
                              ('Yesterday', '2026-10-15 20:00+06', '2026-10-15 21:00+06')) v(title, s, e)
where b.title = 'Workout slots';
insert into public.time_blocks (owner_id, block_id, space_id, title, starts_at, ends_at, deleted_at)
select b.owner_id, b.id, b.space_id, 'Trashed', '2026-10-16 10:00+06', '2026-10-16 11:00+06', now() from public.blocks b where b.title = 'Workout slots';
select tests.authenticate_as('owner@test.local');

select results_eq($$ select r ->> 'title' from jsonb_array_elements(pg_temp.today() -> 'slots') r order by r ->> 'starts_at' $$,
  $$ values ('Morning run'), ('Late run') $$, 'C-TODAY-02: slots are today''s in the profile timezone (23:30 in, 00:10 next day out, Trash out)');
select is(((pg_temp.today() -> 'slots') -> 0) ->> 'mark', 'moss', 'C-TODAY-02: slots carry the space mark for the aura edge');
select ok(((pg_temp.today() -> 'slots') -> 0) ?& array['id', 'title', 'starts_at', 'ends_at', 'space_name', 'block_id', 'page_id', 'sync_status', 'task_id'],
  'C-TODAY-02: slots carry what the timetable and deep link need');

select is(jsonb_array_length(pg_temp.today() -> 'routines'), 1, 'C-TODAY-02: the daily Morning routine is listed');
select results_eq($$ select (r ->> 'label'), (r ->> 'checked')::boolean from jsonb_array_elements((pg_temp.today() -> 'routines' -> 0) -> 'steps') r order by (r ->> 'position')::numeric $$,
  $$ values ('Cleanser', true), ('Vitamin C serum', false), ('Moisturizer', true), ('Sunscreen SPF 50', false), ('Evening add', false), ('Toner', false) $$, 'C-TODAY-02: steps carry today''s checks, in order');
select ok(((pg_temp.today() -> 'routines' -> 0)) ?& array['block_id', 'page_id', 'space_id', 'title', 'streak', 'complete', 'space_name', 'mark'],
  'C-TODAY-02: a routine carries its streak and source');
update public.blocks set config = '{"days":[2,4]}' where title = 'Morning';
select is(jsonb_array_length(pg_temp.today() -> 'routines'), 0, 'Appendix A: a Tue/Thu routine is not on a Friday');
update public.blocks set config = '{}' where title = 'Morning';

select is(jsonb_array_length(pg_temp.today() -> 'trackers'), 1, 'C-TODAY-02: the tracker with fields is listed (Body & food)');
delete from public.tracker_entries where entry_date = '2026-10-16';
select is(((pg_temp.today() -> 'trackers' -> 0) ->> 'logged')::boolean, false, 'TRK AC (Today): no value today -> the log form shows');
select is(jsonb_array_length((pg_temp.today() -> 'trackers' -> 0) -> 'fields'), 4, 'C-TODAY-02/TRK-6: archived fields are not offered (Weight, Study, Steps, Mood)');
insert into public.tracker_entries (field_id, block_id, entry_date, value)
select id, block_id, '2026-10-16', 77.2 from public.tracker_fields where label = 'Weight' on conflict do nothing;
select is(((pg_temp.today() -> 'trackers' -> 0) ->> 'logged')::boolean, true, 'TRK AC (Today): once any value exists today it reads "Logged"');
select is((select f ->> 'today_value' from jsonb_array_elements((pg_temp.today() -> 'trackers' -> 0) -> 'fields') f where f ->> 'label' = 'Weight'), '77.2',
  'TRK-2: the form is pre-filled with today''s value');

update public.spaces set status = 'archived' where name = 'Health';
select results_eq($$ select jsonb_array_length(pg_temp.today() -> 'slots'), jsonb_array_length(pg_temp.today() -> 'trackers') $$,
  $$ values (0, 0) $$, 'TODAY-2: archived spaces contribute no slots or trackers');
select is(jsonb_array_length(pg_temp.today() -> 'routines'), 1, 'TODAY-2: other spaces'' routines remain');

select * from finish();
rollback;
