-- Schema rules: C-DL-01, C-DL-08 (check), C-SCH-02, C-SCH-03, C-SCH-06, C-DB-01.
begin;
select plan(27);

select tests.create_user('owner@test.local');

-- C-DB-01 (DB-1): a profile with the §10.3 defaults exists for the new user.
select results_eq(
  $$ select timezone, week_starts_on, currency, theme::text from public.profiles where id = tests.uid('owner@test.local') $$,
  $$ values ('Asia/Dhaka'::text, 6::smallint, 'BDT'::text, 'light'::text) $$,
  'C-DB-01: new user gets a profile with the default timezone, week start, currency and theme (light)'
);

-- C-DL-01: a goal needs end goal, start date and deadline.
select throws_ok(
  format($$ insert into public.spaces (owner_id, kind, name, end_goal, start_date, position)
            values (%L, 'goal', 'No deadline', 'Something', '2026-10-01', 1) $$, tests.uid('owner@test.local')),
  '23514', null, 'C-DL-01: a goal without a deadline is rejected'
);
select throws_ok(
  format($$ insert into public.spaces (owner_id, kind, name, start_date, deadline, position)
            values (%L, 'goal', 'No end goal', '2026-10-01', '2027-01-01', 1) $$, tests.uid('owner@test.local')),
  '23514', null, 'C-DL-01: a goal without an end goal is rejected'
);

-- C-DL-08 (DL-5): start date must not be after the deadline.
select throws_ok(
  format($$ insert into public.spaces (owner_id, kind, name, end_goal, start_date, deadline, position)
            values (%L, 'goal', 'Backwards', 'x', '2027-02-01', '2027-01-01', 1) $$, tests.uid('owner@test.local')),
  '23514', null, 'C-DL-08: start date after deadline is rejected'
);
select lives_ok(
  format($$ insert into public.spaces (owner_id, kind, name, end_goal, start_date, deadline, position)
            values (%L, 'goal', 'Same day', 'x', '2027-01-01', '2027-01-01', 1) $$, tests.uid('owner@test.local')),
  'C-DL-08: start date equal to deadline is allowed'
);
select lives_ok(
  format($$ insert into public.spaces (owner_id, kind, name, position) values (%L, 'area', 'Finance', 1) $$, tests.uid('owner@test.local')),
  'a life area needs no dates'
);

-- C-SCH-03: lengths.
select throws_ok(
  format($$ insert into public.spaces (owner_id, kind, name, position) values (%L, 'area', '', 1) $$, tests.uid('owner@test.local')),
  '23514', null, 'C-SCH-03: empty space name is rejected'
);
select throws_ok(
  format($$ insert into public.spaces (owner_id, kind, name, position) values (%L, 'area', repeat('x', 61), 1) $$, tests.uid('owner@test.local')),
  '23514', null, 'C-SCH-03: 61-character space name is rejected'
);
select throws_ok(
  format($$ insert into public.spaces (owner_id, kind, name, end_goal, start_date, deadline, position)
            values (%L, 'goal', 'Long goal', repeat('x', 201), '2026-10-01', '2027-01-01', 1) $$, tests.uid('owner@test.local')),
  '23514', null, 'C-SCH-03: 201-character end goal is rejected'
);

select tests.seed(tests.uid('owner@test.local'));

select throws_ok(
  $$ insert into public.pages (owner_id, space_id, title, position)
     select owner_id, id, repeat('x', 81), 9 from public.spaces where name = 'Finance' and position = 1 limit 1 $$,
  '23514', null, 'C-SCH-03: 81-character page title is rejected'
);
select ok(
  exists (select 1 from public.pages p join public.spaces s on s.id = p.space_id where s.name = 'Health' and p.title = 'Workouts'),
  'fixture page exists'
);
select lives_ok(
  $$ insert into public.pages (owner_id, space_id, position)
     select owner_id, id, 9 from public.spaces where name = 'Health' $$,
  'a page without a title gets the default'
);
select is(
  (select count(*)::int from public.pages where title = 'Untitled page'), 1,
  'default page title is "Untitled page"'
);

-- C-SCH-02: block span.
select throws_ok(
  $$ insert into public.blocks (owner_id, page_id, space_id, type, title, position, span)
     select owner_id, id, space_id, 'notes', 'Bad span', 9, 5 from public.pages where title = 'Workouts' $$,
  '23514', null, 'C-SCH-02: span 5 is rejected'
);

-- C-SCH-06: timezone and week start.
select throws_ok(
  format($$ update public.profiles set timezone = 'Mars/Olympus' where id = %L $$, tests.uid('owner@test.local')),
  '23514', null, 'C-SCH-06: an unknown timezone is rejected'
);
select throws_ok(
  format($$ update public.profiles set week_starts_on = 7 where id = %L $$, tests.uid('owner@test.local')),
  '23514', null, 'C-SCH-06: week_starts_on 7 is rejected'
);

-- C-SCH-03: task title length.
select throws_ok(
  $$ insert into public.tasks (owner_id, block_id, space_id, title, due_date, position)
     select owner_id, id, space_id, '', '2026-10-20', 9 from public.blocks where title = 'Training plan' $$,
  '23514', null, 'C-SCH-03: empty task title is rejected'
);
select throws_ok(
  $$ insert into public.tasks (owner_id, block_id, space_id, title, due_date, position)
     select owner_id, id, space_id, repeat('x', 201), '2026-10-20', 9 from public.blocks where title = 'Training plan' $$,
  '23514', null, 'C-SCH-03: 201-character task title is rejected'
);

-- C-DL-09: task status is computed, never stored.
select hasnt_column('public', 'tasks', 'status', 'C-DL-09: tasks has no stored status column');

-- C-DL-18: deadline_changes shape.
select lives_ok(
  $$ insert into public.deadline_changes (owner_id, kind, task_id, space_id, item_title, old_due, new_due, reason, was_late)
     select owner_id, 'deleted_while_late', id, space_id, title, due_date, null, 'Not needed any more', true
     from public.tasks where title = 'Buy running shoes' $$,
  'C-DL-18: a deletion is logged without a new date'
);
select throws_ok(
  $$ insert into public.deadline_changes (owner_id, task_id, space_id, item_title, old_due, new_due, reason, was_late)
     select owner_id, id, space_id, title, due_date, null, 'No new date', true
     from public.tasks where title = 'Buy running shoes' $$,
  '23514', null, 'C-DL-18: a reschedule without a new date is rejected'
);
select throws_ok(
  $$ insert into public.deadline_changes (owner_id, task_id, space_id, item_title, old_due, new_due, reason, was_late)
     select owner_id, id, space_id, title, due_date, '2026-10-20', 'ab', true
     from public.tasks where title = 'Buy running shoes' $$,
  '23514', null, 'C-DL-12: a reason shorter than 3 characters is rejected'
);

-- C-SCH-04: tracker field decimals and target.
select throws_ok(
  $$ insert into public.tracker_fields (owner_id, block_id, label, decimals, position)
     select owner_id, id, 'Too precise', 4, 9 from public.blocks where title = 'Body & food' $$,
  '23514', null, 'C-SCH-04: decimals 4 is rejected'
);
select throws_ok(
  $$ insert into public.tracker_fields (owner_id, block_id, label, target_value, position)
     select owner_id, id, 'No kind', 2000, 9 from public.blocks where title = 'Body & food' $$,
  '23514', null, 'C-SCH-04: a target without a target kind is rejected'
);

-- C-SCH-05: one per day / per week.
select throws_ok(
  $$ insert into public.tracker_entries (owner_id, field_id, block_id, entry_date, value)
     select owner_id, field_id, block_id, entry_date, 77.0 from public.tracker_entries $$,
  '23505', null, 'C-SCH-05: a second entry for the same field and date is rejected (TRK-2 AC1)'
);
select throws_ok(
  $$ insert into public.routine_checks (owner_id, step_id, block_id, check_date)
     select owner_id, step_id, block_id, check_date from public.routine_checks $$,
  '23505', null, 'C-SCH-05: a second check for the same step and date is rejected'
);
select throws_ok(
  $$ insert into public.reviews (owner_id, week_start, stats) select owner_id, week_start, '{}' from public.reviews $$,
  '23505', null, 'C-SCH-05: a second review for the same week is rejected'
);

select * from finish();
rollback;
