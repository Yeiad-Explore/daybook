-- Rescheduling (PRD §7.4): reschedule_task and reschedule_space. C-DL-12..15, C-DL-20 (trashed
-- tasks can be rescheduled), C-DL-25..27. Fixtures: PRD §12 subset, today = 2026-10-16 (Asia/Dhaka).
begin;
select plan(51);

select tests.create_user('owner@test.local');
select tests.create_user('other@test.local');
select tests.seed(tests.uid('owner@test.local'));
select tests.authenticate_as('owner@test.local');
select set_config('app.today', '2026-10-16', true);

create function pg_temp.task(p_title text) returns uuid language sql as $$ select id from public.tasks where title = p_title $$;
create function pg_temp.space(p_name text) returns uuid language sql as $$ select id from public.spaces where name = p_name $$;

------------------------------------------------------------------------------------------------
-- §7.4 AC1: "Buy running shoes" due 14 Oct, today 16 Oct, moved to 18 Oct with "Shop closed".
------------------------------------------------------------------------------------------------
select is(
  public.reschedule_task(pg_temp.task('Buy running shoes'), '2026-10-18', 'Shop closed'),
  jsonb_build_object('status', 'rescheduled', 'task_id', pg_temp.task('Buy running shoes'),
                     'old_due', '2026-10-14', 'new_due', '2026-10-18', 'moved', 1),
  '§7.4 AC1: the reschedule succeeds and reports old and new dates'
);
select is((select due_date from public.tasks where title = 'Buy running shoes'), '2026-10-18'::date, '§7.4 AC1: the task is due 18 Oct');
select is((select reschedule_count from public.tasks where title = 'Buy running shoes'), 1, 'C-DL-14 / DL-8: moved 1×');
select results_eq(
  $$ select kind::text, item_title, old_due, new_due, reason, was_late, task_id = (select id from public.tasks where title = 'Buy running shoes')
     from public.deadline_changes where reason = 'Shop closed' and new_due = '2026-10-18' $$,
  $$ values ('reschedule', 'Buy running shoes', '2026-10-14'::date, '2026-10-18'::date, 'Shop closed', true, true) $$,
  'C-DL-13 / DL-7: one history row with old date, new date, reason and "was late: yes"'
);
select ok(
  not exists (select 1 from jsonb_array_elements(public.get_today('2026-10-16') -> 'overdue') r where r ->> 'title' = 'Buy running shoes'),
  '§7.4 AC1 / DL-10: the task leaves Overdue'
);
select ok(
  exists (select 1 from jsonb_array_elements(public.get_today('2026-10-16') -> 'next_7') r
          where r ->> 'title' = 'Buy running shoes' and (r ->> 'reschedule_count')::int = 1),
  '§7.4 AC1: it now shows in the next 7 days, moved once'
);

-- The flag the RPC sets does not outlive the call: a direct edit is still refused (§7.4 AC2).
select throws_ok(
  $$ update public.tasks set due_date = '2026-10-19' where title = 'Buy running shoes' $$,
  '42501', null, 'C-DL-10: after a reschedule, direct due_date edits are still refused'
);

------------------------------------------------------------------------------------------------
-- C-DL-12: a reason of at least 3 characters, trimmed. Nothing changes otherwise.
------------------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.reschedule_task(%L, '2026-10-20', 'no') $$, pg_temp.task('Buy running shoes')),
  '23514', 'A reason needs at least 3 characters.', 'C-DL-12: a 2-character reason is refused'
);
select throws_ok(
  format($$ select public.reschedule_task(%L, '2026-10-20', '   ab   ') $$, pg_temp.task('Buy running shoes')),
  '23514', null, 'C-DL-12: spaces do not count towards the reason'
);
select throws_ok(
  format($$ select public.reschedule_task(%L, '2026-10-20', null) $$, pg_temp.task('Buy running shoes')),
  '23514', null, 'C-DL-12: a missing reason is refused'
);
select is((select due_date from public.tasks where title = 'Buy running shoes'), '2026-10-18'::date, 'C-DL-12: refused reschedules change nothing');

------------------------------------------------------------------------------------------------
-- C-DL-25: no deadline yet, no new date, or the same date.
------------------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.reschedule_task(%L, '2026-10-18', 'Same again') $$, pg_temp.task('Buy running shoes')),
  '22023', 'That is already the deadline.', 'C-DL-25: rescheduling to the same date is refused'
);
select throws_ok(
  format($$ select public.reschedule_task(%L, null, 'No date') $$, pg_temp.task('Buy running shoes')),
  '22023', 'Pick a new date.', 'C-DL-25: a missing date is refused'
);
insert into public.pages (space_id, title, position) select id, 'Life admin', 1 from public.spaces where name = 'Finance';
insert into public.blocks (page_id, type, title, position) select id, 'todo', 'Errands', 1 from public.pages where title = 'Life admin';
insert into public.tasks (block_id, title, position) select id, 'Renew passport', 1 from public.blocks where title = 'Errands';
select throws_ok(
  format($$ select public.reschedule_task(%L, '2026-11-01', 'Give it a date') $$, pg_temp.task('Renew passport')),
  '22023', 'This task has no deadline yet. Set one by editing the task.', 'C-DL-25: an undated task gets its first date by an edit, not a reschedule'
);
select lives_ok(
  $$ update public.tasks set due_date = '2026-11-01' where title = 'Renew passport' $$,
  'C-DL-25: setting a first deadline directly is allowed'
);

------------------------------------------------------------------------------------------------
-- C-DL-15 / DL-9: containment rules hold for reschedules; the guard's message comes back.
------------------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.reschedule_task(%L, '2027-02-01', 'Need longer') $$, pg_temp.task('Buy running shoes')),
  '23514', 'That deadline is after the goal ends (31 Jan 2027). Pick an earlier date.', 'DL-1: past the goal''s deadline is refused (TODO-1 AC1 wording)'
);
select throws_ok(
  format($$ select public.reschedule_task(%L, '2026-11-20', 'Takes longer') $$, pg_temp.task('Loops: for and while')),
  '23514', 'Must be due by 15 Nov, the deadline of ''Learn Python''.', 'DL-2: a step past its parent is refused (RM-2 AC1 wording)'
);
select is((select count(*)::int from public.deadline_changes where reason in ('Need longer', 'Takes longer')), 0,
  'C-DL-15: refused reschedules leave no history');

-- DL-3 / RM-7: a parent moving earlier than its children. Three levels, so the cascade order matters.
insert into public.tasks (block_id, parent_id, title, due_date, position)
select block_id, id, 'While loops', '2026-10-15', 1 from public.tasks where title = 'Loops: for and while';
select is(
  public.reschedule_task(pg_temp.task('Learn Python'), '2026-10-12', 'Compressing the plan'),
  jsonb_build_object('status', 'conflict', 'rule', 'DL-3', 'new_due', '2026-10-12', 'blockers', jsonb_build_array(
    jsonb_build_object('id', pg_temp.task('Loops: for and while'), 'title', 'Loops: for and while', 'due_date', '2026-10-16'),
    jsonb_build_object('id', pg_temp.task('While loops'), 'title', 'While loops', 'due_date', '2026-10-15'))),
  'C-DL-15 / RM-7: without the cascade flag the children that must move are listed'
);
select is((select due_date from public.tasks where title = 'Learn Python'), '2026-11-15'::date, 'RM-7: a conflict changes nothing');

-- C-DL-26: with the flag, every blocker moves to the new date (deepest first), each logged.
select is(
  public.reschedule_task(pg_temp.task('Learn Python'), '2026-10-12', 'Compressing the plan', true) ->> 'moved',
  '3', 'C-DL-26: the step and its two late-to-be descendants move together'
);
select results_eq(
  $$ select title, due_date, reschedule_count from public.tasks
     where title in ('Learn Python', 'Loops: for and while', 'While loops') order by depth $$,
  $$ values ('Learn Python', '2026-10-12'::date, 1), ('Loops: for and while', '2026-10-12'::date, 1), ('While loops', '2026-10-12'::date, 1) $$,
  'C-DL-26: all three are due 12 Oct and each counts one move'
);
select results_eq(
  $$ select item_title, old_due, new_due, was_late from public.deadline_changes where reason = 'Compressing the plan' order by item_title $$,
  $$ values ('Learn Python', '2026-11-15'::date, '2026-10-12'::date, false),
            ('Loops: for and while', '2026-10-16'::date, '2026-10-12'::date, false),
            ('While loops', '2026-10-15'::date, '2026-10-12'::date, true) $$,
  'C-DL-26 / C-DL-27: one history row each with the same reason; "was late" is per task (15 Oct < 16 Oct)'
);

-- Moving a parent later needs nothing from its children.
select is(
  public.reschedule_task(pg_temp.task('Learn Python'), '2026-11-30', 'More time for OOP') ->> 'moved', '1',
  'DL-3: moving a parent later moves only the parent'
);
select is((select due_date from public.tasks where title = 'While loops'), '2026-10-12'::date, 'DL-3: the children keep their dates');

------------------------------------------------------------------------------------------------
-- C-DL-27: "today" is the owner's local date. Asia/Dhaka is UTC+6, so its midnight is 18:00 UTC.
------------------------------------------------------------------------------------------------
select is(private.local_date('2026-10-15 17:59:59+00', tests.uid('owner@test.local')), '2026-10-15'::date,
  'C-DL-27: 23:59:59 in Dhaka is still 15 Oct');
select is(private.local_date('2026-10-15 18:00:00+00', tests.uid('owner@test.local')), '2026-10-16'::date,
  'C-DL-27: 00:00 in Dhaka is 16 Oct');
update public.profiles set timezone = 'America/New_York' where id = tests.uid('owner@test.local');
select is(private.local_date('2026-10-16 03:59:59+00', tests.uid('owner@test.local')), '2026-10-15'::date,
  'C-DL-27: the profile timezone decides (New York is still on 15 Oct)');
update public.profiles set timezone = 'Asia/Dhaka' where id = tests.uid('owner@test.local');
select has_function('public', 'reschedule_task', array['uuid', 'date', 'text', 'boolean'], 'C-DL-27: reschedule_task takes no client "today"');

------------------------------------------------------------------------------------------------
-- C-DL-20: a task in Trash can be rescheduled (so a refused restore can be fixed first).
------------------------------------------------------------------------------------------------
insert into public.tasks (block_id, title, due_date, position)
select id, 'Book a physio', '2026-11-01', 2 from public.blocks where title = 'Training plan';
update public.tasks set deleted_at = now() where title = 'Book a physio';
select is(
  public.reschedule_task(pg_temp.task('Book a physio'), '2026-11-02', 'Clinic moved') ->> 'status', 'rescheduled',
  'C-DL-20: a trashed task can be rescheduled'
);

-- A trashed step with sub-steps: rescheduling moves the sub-steps trashed with it, so the restore works.
insert into public.tasks (block_id, title, due_date, position) select id, 'Learn Git', '2026-12-01', 9 from public.blocks where title = 'AI Engineering roadmap';
insert into public.tasks (block_id, parent_id, title, due_date, position) select block_id, id, 'Branches', '2026-11-20', 1 from public.tasks where title = 'Learn Git';
update public.tasks set deleted_at = now() where title = 'Learn Git';
select is(public.reschedule_task(pg_temp.task('Learn Git'), '2026-11-10', 'Git first') ->> 'status', 'conflict',
  'C-DL-20: a trashed step''s trashed sub-steps still count as blockers');
select is(public.reschedule_task(pg_temp.task('Learn Git'), '2026-11-10', 'Git first', true) ->> 'moved', '2',
  'C-DL-20: and move with it');
select is(public.restore_item('tasks', pg_temp.task('Learn Git')) ->> 'status', 'restored', 'DL-13: then the step restores');
select results_eq($$ select deleted_at is null, due_date from public.tasks where title = 'Branches' $$, $$ values (true, '2026-11-10'::date) $$,
  'DL-13: with its sub-step, on the new date');

------------------------------------------------------------------------------------------------
-- reschedule_space (DL-4, DL-5, D-P1-4)
------------------------------------------------------------------------------------------------
select function_privs_are('public', 'reschedule_space', array['uuid', 'date', 'text', 'boolean'], 'anon', array[]::text[], 'reschedule_space: anon cannot call it');
select function_privs_are('public', 'reschedule_space', array['uuid', 'date', 'text', 'boolean'], 'authenticated', array['EXECUTE'], 'reschedule_space: the owner can call it');

select is(
  public.reschedule_space(pg_temp.space('Health'), '2026-10-17', 'Racing it'),
  jsonb_build_object('status', 'conflict', 'rule', 'DL-4', 'new_due', '2026-10-17', 'blockers', jsonb_build_array(
    jsonb_build_object('id', pg_temp.task('Buy running shoes'), 'title', 'Buy running shoes', 'due_date', '2026-10-18'))),
  'DL-4: live tasks due after the new deadline are listed (the trashed one is ignored, DL-13)'
);
select is((select deadline from public.spaces where name = 'Health'), '2027-01-31'::date, 'DL-4: a conflict changes nothing');

select is(
  public.reschedule_space(pg_temp.space('Health'), '2026-10-17', 'Racing it', true),
  jsonb_build_object('status', 'rescheduled', 'space_id', pg_temp.space('Health'), 'old_due', '2027-01-31', 'new_due', '2026-10-17', 'moved', 2),
  'C-DL-26 / DL-4: with the flag the task moves with the goal'
);
select results_eq(
  $$ select due_date, reschedule_count from public.tasks where title = 'Buy running shoes' $$,
  $$ values ('2026-10-17'::date, 2) $$, 'C-DL-26: the task is due on the new deadline and counts a second move'
);
select results_eq(
  $$ select task_id, item_title, old_due, new_due, was_late from public.deadline_changes where reason = 'Racing it' order by task_id nulls first $$,
  $$ values (null::uuid, 'Health', '2027-01-31'::date, '2026-10-17'::date, false),
            ((select id from public.tasks where title = 'Buy running shoes'), 'Buy running shoes', '2026-10-18'::date, '2026-10-17'::date, false) $$,
  'C-DL-13: the goal''s own row has no task; each moved task has its own row'
);

select throws_ok(
  format($$ select public.reschedule_space(%L, '2026-08-31', 'Too early') $$, pg_temp.space('Health')),
  '23514', 'The deadline can''t be before the start date (1 Sep).', 'DL-5: a deadline before the start date is refused'
);
select throws_ok(
  format($$ select public.reschedule_space(%L, '2026-12-01', 'x') $$, pg_temp.space('AI Engineering')),
  '23514', 'A reason needs at least 3 characters.', 'C-DL-12: goals need a reason too'
);
select throws_ok(
  format($$ select public.reschedule_space(%L, '2027-04-30', 'Same') $$, pg_temp.space('AI Engineering')),
  '22023', 'That is already the deadline.', 'C-DL-25: same deadline is refused'
);
select throws_ok(
  format($$ select public.reschedule_space(%L, '2027-01-01', 'An area') $$, pg_temp.space('Finance')),
  '22023', 'This space has no deadline to move.', 'C-DL-25: an area has no deadline to reschedule'
);
select is(
  public.reschedule_space(pg_temp.space('AI Engineering'), '2027-05-31', 'One more month') ->> 'moved', '1',
  'reschedule_space: a later deadline moves only the goal (moved counts everything with a new date)'
);
select is((select deadline from public.spaces where name = 'AI Engineering'), '2027-05-31'::date, 'reschedule_space: the deadline is stored');
select throws_ok(
  $$ update public.spaces set deadline = '2027-06-30' where name = 'AI Engineering' $$,
  '42501', null, 'C-DL-11: direct deadline edits are still refused after the RPC ran'
);

------------------------------------------------------------------------------------------------
-- Ownership: another user cannot see, so cannot move, the owner's items.
------------------------------------------------------------------------------------------------
select tests.authenticate_as('other@test.local');
select throws_ok(
  format($$ select public.reschedule_task(%L, '2026-10-20', 'Not mine') $$, tests.row_id('tasks', 'owner@test.local', 'title = ''Buy running shoes''')),
  'P0002', null, 'reschedule_task: another owner''s task is not found'
);
select throws_ok(
  format($$ select public.reschedule_space(%L, '2026-12-20', 'Not mine') $$, tests.row_id('spaces', 'owner@test.local', 'name = ''Health''')),
  'P0002', null, 'reschedule_space: another owner''s goal is not found'
);
select throws_ok(
  format($$ select public.reschedule_task(%L, '2026-10-20', 'Missing') $$, gen_random_uuid()),
  'P0002', null, 'reschedule_task: an unknown id is not found'
);

select * from finish();
rollback;
