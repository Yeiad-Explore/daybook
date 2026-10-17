-- Read models: get_today (agenda, PRD §5.3 + Appendix A) and space_summary (SPC-6..8, Appendix C),
-- plus set_task_done. C-TODAY-01, C-DL-16, C-SPC-02. Fixtures: PRD §12 subset, p_today = 2026-10-16.
begin;
select plan(38);

select tests.create_user('owner@test.local');
select tests.create_user('other@test.local');
select tests.seed(tests.uid('owner@test.local'));
select tests.authenticate_as('owner@test.local');
select set_config('app.today', '2026-10-16', true);

create function pg_temp.titles(p_list text, p_today date default '2026-10-16') returns text[] language sql as $$
  select coalesce(array_agg(r ->> 'title' order by o), '{}') from jsonb_array_elements(public.get_today(p_today) -> p_list) with ordinality t(r, o)
$$;
create function pg_temp.row(p_list text, p_title text) returns jsonb language sql as $$
  select r from jsonb_array_elements(public.get_today('2026-10-16') -> p_list) r where r ->> 'title' = p_title
$$;
create function pg_temp.summary(p_name text, p_today date default '2026-10-16') returns jsonb language sql as $$
  select public.space_summary((select id from public.spaces where name = p_name), p_today)
$$;

------------------------------------------------------------------------------------------------
-- TODAY AC (PRD §6.12): Overdue and the late-count with the seed and today = 16 Oct 2026.
------------------------------------------------------------------------------------------------
select is(pg_temp.titles('overdue'), array['Buy running shoes', 'Send proposal follow-up to Bayside Café'],
  'TODAY AC: Overdue lists both late tasks, oldest first');
select is((public.get_today('2026-10-16') ->> 'late_count')::int, 2, 'TODAY AC / TODAY-4: the late-count is 2');
select is(pg_temp.row('overdue', 'Buy running shoes') ->> 'source', 'Health · Workouts', 'TODAY AC: source "Health · Workouts"');
select is(pg_temp.row('overdue', 'Send proposal follow-up to Bayside Café') ->> 'source', 'AI Agency · Marketing', 'TODAY AC: source "AI Agency · Marketing"');
select is(pg_temp.row('overdue', 'Buy running shoes') ->> 'mark', 'moss', 'C-TODAY-01: rows carry the space mark for the aura dot');
select ok(pg_temp.row('overdue', 'Buy running shoes') ?& array['id', 'block_id', 'page_id', 'space_id', 'due_date', 'due_time', 'done', 'reschedule_count'],
  'C-TODAY-01: rows carry what the row and its deep link need');
select is(public.get_today('2026-10-16') ->> 'today', '2026-10-16', 'C-TODAY-01: the date it was computed for is returned');

------------------------------------------------------------------------------------------------
-- RM-8 AC: a roadmap leaf due today, sourced "Space · Page · Stage"; parents never appear.
------------------------------------------------------------------------------------------------
select is(pg_temp.titles('due_today'), array['Loops: for and while'], 'RM-8 AC: the leaf due today is in Due today');
select is(pg_temp.row('due_today', 'Loops: for and while') ->> 'source', 'AI Engineering · Roadmap · Learn Python', 'RM-8 AC: source names the stage');
select ok(not ('Learn Python' = any (pg_temp.titles('next_7', '2026-11-10'))), 'C-TODAY-01: a stage with sub-steps is never an agenda row');

------------------------------------------------------------------------------------------------
-- Next 7 days, Due today ordering, and what never shows.
------------------------------------------------------------------------------------------------
insert into public.tasks (block_id, title, due_date, due_time, position)
select id, t.title, t.due::date, t.at::time, t.pos from public.blocks, (values
  ('Stretch', '2026-10-16', null, 2), ('Evening walk', '2026-10-16', '18:00', 3), ('Tomorrow run', '2026-10-17', null, 4),
  ('Week out', '2026-10-23', null, 5), ('Too far', '2026-10-24', null, 6)) t(title, due, at, pos)
where blocks.title = 'Training plan';
select is(pg_temp.titles('next_7'), array['Tomorrow run', 'Week out'], 'Appendix A: Next 7 days is tomorrow through today + 7');

update public.tasks set done = true where title = 'Stretch';
select is(pg_temp.titles('due_today'), array['Evening walk', 'Loops: for and while', 'Stretch'],
  'Appendix A: Due today keeps unfinished first (timed before untimed), done last');
select is(pg_temp.row('due_today', 'Stretch') ->> 'done', 'true', 'Appendix A: a done task stays in Due today');

-- TODO-2 / §7.3: done late is judged by the completion date in the owner's timezone (Dhaka midnight = 18:00 UTC).
reset role;
update public.tasks set completed_at = '2026-10-16 17:59:59+00' where title = 'Stretch';
select tests.authenticate_as('owner@test.local');
select is(pg_temp.row('due_today', 'Stretch') ->> 'done_late', 'false', '§7.3: done at 23:59 Dhaka on the due date is on time');
reset role;
update public.tasks set completed_at = '2026-10-16 18:00:00+00' where title = 'Stretch';
select tests.authenticate_as('owner@test.local');
select is(pg_temp.row('due_today', 'Stretch') ->> 'done_late', 'true', '§7.3: done at 00:00 Dhaka the next day is done late');

-- C-DL-16 / DL-10: late tasks leave Overdue only by being done (or rescheduled, see 032); there is no dismiss.
select is_empty(
  $$ select column_name from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name ~ 'dismiss|hidden|snooze' $$,
  'C-DL-16: tasks have no dismiss, hide or snooze column'
);
select lives_ok(
  format($$ select public.set_task_done(%L, true) $$, (select id from public.tasks where title = 'Buy running shoes')),
  'set_task_done: the owner checks a task (TODAY-3)'
);
select is(pg_temp.titles('overdue'), array['Send proposal follow-up to Bayside Café'], 'C-DL-16: done is the way out of Overdue');
select is((public.get_today('2026-10-16') ->> 'late_count')::int, 1, 'TODAY-4: the late-count follows');
select lives_ok(
  format($$ select public.set_task_done(%L, false) $$, (select id from public.tasks where title = 'Buy running shoes')),
  'set_task_done: and unchecks it'
);
select is((public.get_today('2026-10-16') ->> 'late_count')::int, 2, 'C-DL-16: unchecked, it is late again');

-- set_task_done respects RM-3: a parent is done through its children only.
select throws_ok(
  format($$ select public.set_task_done(%L, true) $$, (select id from public.tasks where title = 'Learn Python')),
  '42501', null, 'RM-3: a stage with sub-steps cannot be checked directly'
);
select public.set_task_done((select id from public.tasks where title = 'Loops: for and while'), true);
select is((select done from public.tasks where title = 'Learn Python'), true, 'RM-3: checking the last leaf completes the stage');
select public.set_task_done((select id from public.tasks where title = 'Loops: for and while'), false);

-- TODAY-2: only active spaces. And trashed blocks never contribute.
update public.spaces set status = 'archived' where name = 'AI Agency';
select is(pg_temp.titles('overdue'), array['Buy running shoes'], 'TODAY-2: an archived goal''s tasks leave Today');
update public.spaces set status = 'active' where name = 'AI Agency';
select public.trash_item('blocks', (select id from public.blocks where title = 'Training plan'), 'Plan replaced');
select is(pg_temp.titles('overdue'), array['Send proposal follow-up to Bayside Café'], 'C-TODAY-01: tasks in Trash never show');

-- p_today defaults to the owner's local today.
select is(public.get_today() -> 'overdue', public.get_today('2026-10-16') -> 'overdue', 'TODAY-1: no p_today means the owner''s today');

------------------------------------------------------------------------------------------------
-- space_summary (C-SPC-02)
------------------------------------------------------------------------------------------------
select is((pg_temp.summary('Health') ->> 'days_left')::int, 107, 'SPC-6 AC1: 16 Oct 2026 → 31 Jan 2027 is 107 days');
select is((pg_temp.summary('Health', '2027-01-31') ->> 'days_left')::int, 0, 'SPC-6: the deadline day is 0 ("due today")');
select is((pg_temp.summary('Health', '2027-02-03') ->> 'days_left')::int, -3, 'SPC-4 AC2: past the deadline is negative (3 days past)');
select is((pg_temp.summary('AI Engineering') ->> 'elapsed')::numeric, round(15 / 211.0, 4), 'Appendix C: elapsed share of 1 Oct → 30 Apr');

select is(pg_temp.summary('AI Engineering') -> 'progress',
  jsonb_build_object('metric', 'tasks', 'done', 0, 'total', 1, 'percent', 0, 'label', '0 of 1 steps done'),
  'SPC-7 tasks: Roadmap leaves count, stages do not');
select public.set_task_done((select id from public.tasks where title = 'Loops: for and while'), true);
select is((pg_temp.summary('AI Engineering') -> 'progress' ->> 'percent')::int, 100, 'SPC-7 AC1: progress recalculates at once');

-- SPC-8 AC1/AC2: milestones = stages + flagged tasks; done / late / upcoming.
update public.tasks set is_milestone = true where title = 'Send proposal follow-up to Bayside Café';
insert into public.tasks (block_id, title, due_date, is_milestone, position)
select id, 'First client call', '2026-11-20', true, 2 from public.blocks where title = 'Marketing tasks';
select results_eq(
  $$ select m ->> 'title', m ->> 'state' from jsonb_array_elements((select public.space_summary(id, '2026-10-16') from public.spaces where name = 'AI Agency') -> 'milestones') m $$,
  $$ values ('Send proposal follow-up to Bayside Café', 'late'), ('First client call', 'upcoming') $$,
  'SPC-8 AC1/AC2: flagged tasks are milestones; late and upcoming states, in date order'
);
select is(pg_temp.summary('AI Engineering') -> 'milestones' -> 0 ->> 'state', 'done', 'SPC-8 AC1/AC2: a stage is a milestone; done when its steps are');
select is(pg_temp.summary('AI Agency') -> 'due_counts', '[{"day": "2026-10-15", "count": 1}, {"day": "2026-11-20", "count": 1}]'::jsonb,
  'SPC-8 / DESIGN.md Rail: due counts per day for the barcode bars');

select is(pg_temp.summary('Finance') ->> 'days_left', null, 'Life areas have no countdown');

select tests.authenticate_as('other@test.local');
select is((public.get_today('2026-10-16') ->> 'late_count')::int, 0, 'get_today: another user sees none of the owner''s tasks');
select throws_ok(
  format($$ select public.space_summary(%L, '2026-10-16') $$, tests.row_id('spaces', 'owner@test.local', 'name = ''Health''')),
  'P0002', null, 'space_summary: another owner''s space is not found'
);

select * from finish();
rollback;
