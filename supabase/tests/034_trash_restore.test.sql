-- Trash, restore, pages, status and order: C-DL-17 (DL-11), C-DL-20 (DL-13 restore), C-TRASH-01
-- (SET-3, purge), C-PG-01, C-SPC-03, C-ORD-01. Fixtures: PRD §12 subset, today = 2026-10-16.
begin;
select plan(42);

select tests.create_user('owner@test.local');
select tests.create_user('other@test.local');
select tests.seed(tests.uid('owner@test.local'));
select tests.authenticate_as('owner@test.local');
select set_config('app.today', '2026-10-16', true);

create function pg_temp.task(p_title text) returns uuid language sql as $$ select id from public.tasks where title = p_title $$;

------------------------------------------------------------------------------------------------
-- C-DL-17 / DL-11: deleting a late task needs a reason and is recorded.
------------------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.delete_task(%L) $$, pg_temp.task('Buy running shoes')),
  '22023', 'This task is late. Give a reason to delete it, so it shows in your deadline history.',
  'DL-11: a late task without a reason is not deleted'
);
select is((select deleted_at from public.tasks where title = 'Buy running shoes'), null, 'DL-11: nothing went to Trash');
select throws_ok(
  format($$ select public.delete_task(%L, 'no') $$, pg_temp.task('Buy running shoes')),
  '23514', 'A reason needs at least 3 characters.', 'DL-11: the reason needs 3 characters'
);
select lives_ok(
  format($$ select public.delete_task(%L, 'Bought them already') $$, pg_temp.task('Buy running shoes')),
  'DL-11: with a reason the late task is deleted'
);
select isnt((select deleted_at from public.tasks where title = 'Buy running shoes'), null, 'DL-11: it is in Trash');
select results_eq(
  $$ select kind::text, old_due, new_due, reason, was_late from public.deadline_changes where reason = 'Bought them already' $$,
  $$ values ('deleted_while_late', '2026-10-14'::date, null::date, 'Bought them already', true) $$,
  'DL-11: one "deleted while late" history row with the reason'
);

insert into public.tasks (block_id, title, due_date, position)
select id, 'Book a physio', '2027-01-20', 2 from public.blocks where title = 'Training plan';
select lives_ok(format($$ select public.delete_task(%L) $$, pg_temp.task('Book a physio')), 'DL-11: a task that is not late needs no reason');
select is((select count(*)::int from public.deadline_changes where item_title = 'Book a physio'), 0, 'DL-11: and leaves no history row');

------------------------------------------------------------------------------------------------
-- C-DL-20 / DL-13 and C-TRASH-01: restore re-checks the rules; containers come first.
------------------------------------------------------------------------------------------------
select is(
  public.restore_item('tasks', pg_temp.task('Buy running shoes')),
  jsonb_build_object('status', 'restored', 'table', 'tasks', 'id', pg_temp.task('Buy running shoes')),
  'SET-3: a task comes back to its place'
);
select is((select count(*)::int from public.deadline_changes where reason = 'Bought them already'), 1, 'DL-14: restoring keeps the history (append-only)');

-- The goal ends before the trashed physio task now: restoring it would break DL-1.
select public.reschedule_space((select id from public.spaces where name = 'Health'), '2026-12-31', 'Shorter plan');
select throws_ok(
  format($$ select public.restore_item('tasks', %L) $$, pg_temp.task('Book a physio')),
  '23514', 'Can''t restore ''Book a physio'': it is due after the goal ends (31 Dec). Reschedule it first.',
  'DL-13: a restore that breaks DL-1 is refused and says what to do'
);
select isnt((select deleted_at from public.tasks where title = 'Book a physio'), null, 'DL-13: it stays in Trash');
select public.reschedule_task(pg_temp.task('Book a physio'), '2026-12-20', 'Fits the new plan');
select is(public.restore_item('tasks', pg_temp.task('Book a physio')) ->> 'status', 'restored', 'DL-13: rescheduled first, it restores');

-- A block whose page is in Trash returns to the space's first live page (SET-3, D-P1-11).
insert into public.pages (space_id, title, position) select id, 'Extra', 5 from public.spaces where name = 'Health';
insert into public.blocks (page_id, type, title, position) select id, 'todo', 'Spare list', 1 from public.pages where title = 'Extra';
update public.blocks set deleted_at = now() - interval '1 minute' where title = 'Spare list';
update public.pages set deleted_at = now() where title = 'Extra';
select is(
  public.restore_item('blocks', (select id from public.blocks where title = 'Spare list')) ->> 'moved_to_page',
  (select id::text from public.pages where space_id = (select id from public.spaces where name = 'Health') and deleted_at is null order by position, created_at limit 1),
  'SET-3: the block moves to the space''s first page because its own page is in Trash'
);
select is((select deleted_at from public.blocks where title = 'Spare list'), null, 'SET-3: and it is live there');

-- A task whose block is in Trash, or a page whose space is: restore the container first.
insert into public.tasks (block_id, title, due_date, position) select id, 'Spare task', '2026-12-01', 1 from public.blocks where title = 'Spare list';
update public.tasks set deleted_at = now() - interval '1 minute' where title = 'Spare task';
update public.blocks set deleted_at = now() where title = 'Spare list';
select throws_ok(
  format($$ select public.restore_item('tasks', %L) $$, pg_temp.task('Spare task')),
  '22023', 'Restore its block first.', 'C-TRASH-01: a task whose block is in Trash waits for the block'
);
insert into public.spaces (kind, name, position) values ('area', 'Hobbies', 9);
insert into public.pages (space_id, title, position) select id, 'Ideas', 2 from public.spaces where name = 'Hobbies';
update public.pages set deleted_at = now() - interval '1 minute' where title = 'Ideas';
update public.spaces set deleted_at = now() where name = 'Hobbies';
select throws_ok(
  format($$ select public.restore_item('pages', %L) $$, (select id from public.pages where title = 'Ideas')),
  '22023', 'Restore its space first.', 'C-TRASH-01: a page whose space is in Trash waits for the space'
);
select is(public.restore_item('spaces', (select id from public.spaces where name = 'Hobbies')) ->> 'status', 'restored', 'SPC-5: a space restores');
select is((select count(*)::int from public.pages p join public.spaces s on s.id = p.space_id where s.name = 'Hobbies' and p.deleted_at is null), 1,
  'SPC-5: its page trashed with it comes back; the one trashed earlier stays in Trash');

select throws_ok($$ select public.restore_item('profiles', gen_random_uuid()) $$, '22023', null, 'C-TRASH-01: other tables are refused');
select throws_ok(
  format($$ select public.restore_item('tasks', %L) $$, pg_temp.task('Buy running shoes')),
  '22023', 'It is not in Trash.', 'C-TRASH-01: a live item has nothing to restore'
);

------------------------------------------------------------------------------------------------
-- C-PG-01: every new space gets "Overview"; the last live page of a live space stays.
------------------------------------------------------------------------------------------------
insert into public.spaces (kind, name, end_goal, start_date, deadline, position)
values ('goal', 'Read 12 books', 'Read one book a month', '2026-10-16', '2027-10-15', 9);
select results_eq(
  $$ select p.title from public.pages p join public.spaces s on s.id = p.space_id where s.name = 'Read 12 books' $$,
  $$ values ('Overview') $$, 'SPC-1 AC2: a new space has one page, "Overview"'
);
select throws_ok(
  $$ update public.pages set deleted_at = now() where title = 'Overview' and space_id = (select id from public.spaces where name = 'Read 12 books') $$,
  '23514', 'A space needs at least one page.', 'PG AC: the last page cannot go to Trash'
);
select throws_ok(
  format($$ select public.trash_item('pages', %L) $$, (select p.id from public.pages p join public.spaces s on s.id = p.space_id where s.name = 'Read 12 books')),
  '23514', 'A space needs at least one page.', 'PG AC: not through trash_item either'
);
insert into public.pages (space_id, title, position) select id, 'Reading list', 2 from public.spaces where name = 'Read 12 books';
select lives_ok(
  $$ update public.pages set deleted_at = now() where title = 'Overview' and space_id = (select id from public.spaces where name = 'Read 12 books') $$,
  'PG-6: with a second page, one can go to Trash'
);
select lives_ok(
  $$ update public.spaces set deleted_at = now() where name = 'Read 12 books' $$,
  'SPC-5: trashing the space takes its last page with it'
);

------------------------------------------------------------------------------------------------
-- C-SPC-03: status_changed_at follows status (SPC-4 AC1).
------------------------------------------------------------------------------------------------
update public.spaces set status = 'achieved' where name = 'AI Engineering';
select isnt((select status_changed_at from public.spaces where name = 'AI Engineering'), null, 'SPC-4 AC1: marking achieved records the date');
update public.spaces set status_changed_at = '2020-01-01' where name = 'Finance';
select is((select status_changed_at from public.spaces where name = 'Finance'), null, 'C-SPC-03: the date is Daybook''s, not the client''s');

------------------------------------------------------------------------------------------------
-- C-ORD-01: reorder places an item strictly between its new neighbours.
------------------------------------------------------------------------------------------------
-- Goals are Health (1), AI Engineering (2), AI Agency (3): move AI Agency between the first two.
select ok(
  public.reorder('spaces', (select id from public.spaces where name = 'AI Agency'),
                 (select id from public.spaces where name = 'Health'), (select id from public.spaces where name = 'AI Engineering')) between 1.0001 and 1.9999,
  'C-ORD-01: the new position is between the neighbours'
);
select is(
  array(select name from public.spaces where kind = 'goal' and deleted_at is null order by position),
  array['Health', 'AI Agency', 'AI Engineering'], 'SPC-3: the new order persists'
);
select is(public.reorder('spaces', (select id from public.spaces where name = 'Health'), (select id from public.spaces where name = 'AI Engineering'), null),
  3::numeric, 'C-ORD-01: last place is one after the item before');
select is(public.reorder('spaces', (select id from public.spaces where name = 'Health'), null, (select id from public.spaces where name = 'AI Agency')),
  (select position - 1 from public.spaces where name = 'AI Agency'), 'C-ORD-01: first place is one before the item after');
select throws_ok($$ select public.reorder('profiles', gen_random_uuid(), null, null) $$, '22023', null, 'C-ORD-01: only ordered tables');
select lives_ok(
  format($$ select public.reorder('tasks', %L, null, null) $$, pg_temp.task('Buy running shoes')),
  'C-ORD-01: tasks reorder too'
);

------------------------------------------------------------------------------------------------
-- Another user can neither delete, restore nor reorder the owner's items.
------------------------------------------------------------------------------------------------
select tests.authenticate_as('other@test.local');
select throws_ok(format($$ select public.delete_task(%L, 'Not mine') $$, tests.row_id('tasks', 'owner@test.local', 'title = ''Book a physio''')),
  'P0002', null, 'delete_task: another owner''s task is not found');
select throws_ok(format($$ select public.restore_item('tasks', %L) $$, tests.row_id('tasks', 'owner@test.local', 'title = ''Spare task''')),
  'P0002', null, 'restore_item: another owner''s item is not found');
select throws_ok(format($$ select public.reorder('spaces', %L, null, null) $$, tests.row_id('spaces', 'owner@test.local', 'name = ''Health''')),
  'P0002', null, 'reorder: another owner''s item is not found');

------------------------------------------------------------------------------------------------
-- C-TRASH-01: purge_trash (scheduler only) removes what has been in Trash for over 30 days.
------------------------------------------------------------------------------------------------
reset role;
update public.tasks set deleted_at = now() - interval '31 days' where title = 'Spare task';
update public.blocks set deleted_at = now() - interval '29 days' where title = 'Spare list';
select ok(public.purge_trash() >= 1, 'SET-3: the daily purge removes old Trash');
select is((select count(*)::int from public.tasks where title = 'Spare task'), 0, 'SET-3: a task in Trash for 31 days is gone');
select is((select count(*)::int from public.blocks where title = 'Spare list'), 1, 'SET-3: a block in Trash for 29 days stays');
select is((select count(*)::int from cron.job where jobname = 'purge_trash' and schedule = '0 21 * * *'), 1,
  '§10.8: purge_trash is scheduled daily at 03:00 Asia/Dhaka (21:00 UTC)');
select function_privs_are('public', 'purge_trash', array[]::text[], 'authenticated', array[]::text[], 'purge_trash: clients cannot run it');

select * from finish();
rollback;
