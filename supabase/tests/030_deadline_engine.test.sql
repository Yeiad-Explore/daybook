-- Deadline engine at the database level: C-DL-02..08, C-DL-10, C-DL-11, C-DL-19 (DL-12),
-- C-DL-20 (DL-13), C-SPC-01 (SPC-9). Reschedule RPCs arrive in Phase 1; here the transaction flag
-- they set (app.reschedule) is set directly to prove the guards accept it and only it.
begin;
select plan(46);

select tests.create_user('owner@test.local');
select tests.seed(tests.uid('owner@test.local'));
select tests.authenticate_as('owner@test.local');
select set_config('app.today', '2026-10-16', true);  -- p_today for rules that need "today"

------------------------------------------------------------------------------------------------
-- C-DL-02 / C-DL-03: due dates required in goals, optional in areas.
------------------------------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.tasks (block_id, title, position) select id, 'Undated', 2 from public.blocks where title = 'Training plan' $$,
  '23514', 'A goal needs a deadline for every task.', 'C-DL-02: a goal task without a deadline is rejected (TODO-1 AC2)'
);
insert into public.pages (space_id, title, position) select id, 'Life admin', 1 from public.spaces where name = 'Finance';
insert into public.blocks (page_id, type, title, position) select id, 'todo', 'Errands', 1 from public.pages where title = 'Life admin';
select lives_ok(
  $$ insert into public.tasks (block_id, title, position) select id, 'Renew passport', 1 from public.blocks where title = 'Errands' $$,
  'C-DL-03: a life-area task may have no deadline'
);

------------------------------------------------------------------------------------------------
-- C-DL-04 (DL-1): task deadline within the goal.
------------------------------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.tasks (block_id, title, due_date, position) select id, 'Too late', '2027-02-01', 2 from public.blocks where title = 'Training plan' $$,
  '23514', 'That deadline is after the goal ends (31 Jan 2027). Pick an earlier date.',
  'C-DL-04: a deadline after the goal''s deadline is rejected with the TODO-1 AC1 message'
);
select lives_ok(
  $$ insert into public.tasks (block_id, title, due_date, position) select id, 'On the last day', '2027-01-31', 2 from public.blocks where title = 'Training plan' $$,
  'C-DL-04: a deadline on the goal''s deadline day is allowed'
);
insert into public.blocks (page_id, type, title, position)
select page_id, 'todo', 'Spring tasks', 2 from public.blocks where title = 'AI Engineering roadmap';
insert into public.tasks (block_id, title, due_date, position) select id, 'Ship the RAG demo', '2027-04-01', 1 from public.blocks where title = 'Spring tasks';
select throws_ok(
  $$ update public.blocks set page_id = (select id from public.pages where title = 'Workouts') where title = 'Spring tasks' $$,
  '23514', null, 'C-DL-04: moving a block into a goal that ends earlier is rejected (BLK-4, PG-5)'
);

------------------------------------------------------------------------------------------------
-- C-DL-05 (DL-2) / C-DL-06 (DL-3): roadmap children inside their parent.
------------------------------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.tasks (block_id, parent_id, title, due_date, position)
     select block_id, id, 'Functions', '2026-11-16', 3 from public.tasks where title = 'Learn Python' $$,
  '23514', 'Must be due by 15 Nov, the deadline of ''Learn Python''.',
  'C-DL-05: a child due after its parent is rejected with the RM-2 AC1 message'
);
select lives_ok(
  $$ insert into public.tasks (block_id, parent_id, title, due_date, position)
     select block_id, id, 'Functions', '2026-11-15', 3 from public.tasks where title = 'Learn Python' $$,
  'C-DL-05: a child due on its parent''s deadline is allowed'
);

select set_config('app.reschedule', 'on', true);
select throws_ok(
  $$ update public.tasks set due_date = '2026-11-01' where title = 'Learn Python' $$,
  '23514', null, 'C-DL-06: a parent cannot move earlier than a child (RM-7)'
);
select throws_like(
  $$ update public.tasks set due_date = '2026-11-01' where title = 'Learn Python' $$,
  '%Functions%', 'C-DL-06: the rejection lists the children that must move first'
);

------------------------------------------------------------------------------------------------
-- C-DL-07 (DL-4) / C-DL-08 (DL-5): goal deadline vs its tasks and start date.
------------------------------------------------------------------------------------------------
select throws_like(
  $$ update public.spaces set deadline = '2026-10-13' where name = 'Health' $$,
  '%Buy running shoes%', 'C-DL-07: a goal deadline cannot move before its tasks, and the tasks are listed'
);
select throws_ok(
  $$ update public.spaces set deadline = '2026-08-31' where name = 'Health' $$,
  '23514', null, 'C-DL-08: a goal deadline cannot move before its start date'
);
select lives_ok(
  $$ update public.spaces set deadline = '2027-02-28' where name = 'Health' $$,
  'C-DL-07: a goal deadline can move later through the reschedule path'
);
select set_config('app.reschedule', '', true);

------------------------------------------------------------------------------------------------
-- C-DL-10 / C-DL-11 (DL-6, §7.4 AC2): deadlines change only through reschedule.
------------------------------------------------------------------------------------------------
select throws_ok(
  $$ update public.tasks set due_date = '2026-10-18' where title = 'Buy running shoes' $$,
  '42501', null, 'C-DL-10: updating a goal task''s due_date directly is rejected (§7.4 AC2)'
);
select throws_ok(
  $$ update public.tasks set due_date = '2027-12-31' where title = 'Buy running shoes' $$,
  '42501', null, 'C-DL-10: a direct edit past the goal deadline reports "use Reschedule" first, not "pick an earlier date"'
);
select throws_ok(
  $$ update public.spaces set deadline = '2027-03-31' where name = 'Health' $$,
  '42501', null, 'C-DL-11: updating a goal''s deadline directly is rejected (SPC-2 AC1)'
);
select lives_ok(
  $$ update public.tasks set due_date = '2099-01-10' where title = 'Renew passport' $$,
  'C-DL-10: setting a deadline for the first time is allowed'
);
select throws_ok(
  $$ update public.tasks set due_date = '2099-01-11' where title = 'Renew passport' $$,
  '42501', null, 'C-DL-10: once set, a life-area deadline also changes only through reschedule'
);
select lives_ok(
  $$ update public.spaces set start_date = '2026-09-02' where name = 'Health' $$,
  'a goal''s start date stays directly editable (within DL-5)'
);

select set_config('app.reschedule', 'on', true);
select lives_ok(
  $$ update public.tasks set due_date = '2026-10-18' where title = 'Buy running shoes' $$,
  'C-DL-10: the reschedule path can move a task''s deadline'
);
select set_config('app.reschedule', '', true);

------------------------------------------------------------------------------------------------
-- C-DL-19 (DL-12): a late task is not soft-deleted directly.
------------------------------------------------------------------------------------------------
select throws_ok(
  $$ update public.tasks set deleted_at = now() where title = 'Send proposal follow-up to Bayside Café' $$,
  '42501', null, 'C-DL-19: soft-deleting a late task directly is rejected (it goes through delete_task)'
);
select throws_ok(
  $$ delete from public.tasks where title = 'Send proposal follow-up to Bayside Café' $$,
  '42501', null, 'C-DL-19: hard-deleting a live task directly is rejected (Trash first)'
);
select throws_ok(
  $$ delete from public.blocks where title = 'Marketing tasks' $$,
  '42501', null, 'C-DL-19: hard-deleting a live block (and the late task in it) is rejected'
);
select throws_ok(
  $$ delete from public.spaces where name = 'AI Agency' $$,
  '42501', null, 'C-DL-19: hard-deleting a live space is rejected'
);
insert into public.tasks (block_id, parent_id, title, due_date, position)
select block_id, id, 'Late leaf', '2026-10-10', 9 from public.tasks where title = 'Learn Python';
select throws_ok(
  $$ update public.tasks set deleted_at = now() where title = 'Late leaf' $$,
  '42501', null, 'C-DL-19: a late roadmap leaf is protected like a to-do'
);
select lives_ok(
  $$ update public.tasks set deleted_at = now() where title = 'Renew passport' $$,
  'C-DL-19: a task that is not late can be soft-deleted directly'
);
update public.tasks set done = true where title = 'Send proposal follow-up to Bayside Café';
select lives_ok(
  $$ update public.tasks set deleted_at = now() where title = 'Send proposal follow-up to Bayside Café' $$,
  'C-DL-19: a finished task is not late and can be soft-deleted'
);
select lives_ok(
  $$ delete from public.tasks where title = 'Send proposal follow-up to Bayside Café' $$,
  'C-DL-19: an item in Trash can be deleted forever (SET-3)'
);

------------------------------------------------------------------------------------------------
-- C-DL-20 (DL-13): deleted tasks are ignored by the rules; restoring re-checks them.
------------------------------------------------------------------------------------------------
update public.tasks set deleted_at = now() where title = 'On the last day';
select set_config('app.reschedule', 'on', true);
select lives_ok(
  $$ update public.spaces set deadline = '2027-01-15' where name = 'Health' $$,
  'C-DL-20: a task in Trash does not block moving the goal''s deadline'
);
select set_config('app.reschedule', '', true);
select throws_ok(
  $$ update public.tasks set deleted_at = null where title = 'On the last day' $$,
  '23514', 'Can''t restore ''On the last day'': it is due after the goal ends (15 Jan 2027). Reschedule it first.',
  'C-DL-20: restoring a task that now breaks a rule is refused, naming the task and the rule'
);

------------------------------------------------------------------------------------------------
-- C-SPC-01 (SPC-9): area -> goal is blocked while tasks are undated or due too late.
------------------------------------------------------------------------------------------------
insert into public.tasks (block_id, title, position) select id, 'Sort old papers', 2 from public.blocks where title = 'Errands';
insert into public.tasks (block_id, title, due_date, position) select id, 'Book dentist', '2099-06-01', 3 from public.blocks where title = 'Errands';
select throws_like(
  $$ update public.spaces set kind = 'goal', end_goal = 'Clear the backlog', start_date = '2026-10-16', deadline = '2027-03-01'
     where name = 'Finance' $$,
  '%Sort old papers%', 'C-SPC-01: undated tasks are listed as blocking'
);
select throws_like(
  $$ update public.spaces set kind = 'goal', end_goal = 'Clear the backlog', start_date = '2026-10-16', deadline = '2027-03-01'
     where name = 'Finance' $$,
  '%Book dentist%', 'C-SPC-01: tasks due after the new deadline are listed as blocking'
);
update public.tasks set deleted_at = now() where title in ('Sort old papers', 'Book dentist');
select lives_ok(
  $$ update public.spaces set kind = 'goal', end_goal = 'Clear the backlog', start_date = '2026-10-16', deadline = '2027-03-01'
     where name = 'Finance' $$,
  'C-SPC-01: the conversion succeeds once every task fits'
);

select throws_ok(
  $$ update public.spaces set kind = 'goal', end_goal = 'x', start_date = '2026-10-16' where name = 'Skincare' $$,
  '23514', 'A goal needs a deadline.', 'C-SPC-01: converting to a goal without a deadline says so (SPC-1 AC1)'
);

------------------------------------------------------------------------------------------------
-- Goal -> area drops the deadline rules (PRD §5.5).
------------------------------------------------------------------------------------------------
select lives_ok(
  $$ update public.spaces set kind = 'area', start_date = null, deadline = null, end_goal = null where name = 'AI Engineering' $$,
  'goal -> area is allowed and drops the deadline rules'
);
select is((select deadline from public.spaces where name = 'AI Engineering'), '2027-04-30'::date,
  'goal -> area keeps the old dates (hidden), so they cannot be swapped without a reason');
select throws_ok(
  $$ update public.spaces set kind = 'goal', end_goal = 'Ship it', deadline = '2027-12-31' where name = 'AI Engineering' $$,
  '42501', null, 'N1: area -> goal cannot bring back a different deadline without Reschedule'
);
select throws_ok(
  $$ update public.spaces set deadline = '2027-12-31' where name = 'AI Engineering' $$,
  '42501', null, 'N1: an area cannot quietly edit a deadline it kept from being a goal'
);
select lives_ok(
  $$ update public.spaces set kind = 'goal', end_goal = 'Ship it' where name = 'AI Engineering' $$,
  'area -> goal with its kept deadline works'
);

------------------------------------------------------------------------------------------------
-- DL-2 / DL-3 through undated steps (life-area roadmaps).
------------------------------------------------------------------------------------------------
insert into public.blocks (page_id, type, title, position) select id, 'roadmap', 'Home projects', 2 from public.pages where title = 'Routine';
insert into public.tasks (block_id, title, due_date, position) select id, 'Renovate', '2099-12-01', 1 from public.blocks where title = 'Home projects';
insert into public.tasks (block_id, parent_id, title, position) select block_id, id, 'Kitchen', 1 from public.tasks where title = 'Renovate';
select throws_ok(
  $$ insert into public.tasks (block_id, parent_id, title, due_date, position)
     select block_id, id, 'Order tiles', '2099-12-31', 1 from public.tasks where title = 'Kitchen' $$,
  '23514', null, 'C-DL-05: a step must fit its nearest dated ancestor, even through an undated step'
);

insert into public.tasks (block_id, title, position) select id, 'Garden', 2 from public.blocks where title = 'Home projects';
insert into public.tasks (block_id, parent_id, title, position) select block_id, id, 'Shed', 1 from public.tasks where title = 'Garden';
insert into public.tasks (block_id, parent_id, title, due_date, position) select block_id, id, 'Paint shed', '2099-12-31', 1 from public.tasks where title = 'Shed';
select throws_like(
  $$ update public.tasks set parent_id = (select id from public.tasks where title = 'Renovate') where title = 'Shed' $$,
  '%Paint shed%', '#7: moving an undated step checks its sub-steps against the new dated ancestor'
);

------------------------------------------------------------------------------------------------
-- Nothing live inside Trash (closes erasing late tasks through Trash + foreign-key cascades).
------------------------------------------------------------------------------------------------
insert into public.blocks (page_id, type, title, position) select id, 'todo', 'Old list', 5 from public.pages where title = 'Workouts';
update public.blocks set deleted_at = now() where title = 'Old list';
select throws_ok(
  $$ update public.tasks set block_id = (select id from public.blocks where title = 'Old list') where title = 'Buy running shoes' $$,
  '23514', null, '#1: a live task cannot move into a block in Trash'
);
select throws_ok(
  $$ insert into public.tasks (block_id, title, due_date, position) select id, 'Into the bin', '2026-12-01', 1 from public.blocks where title = 'Old list' $$,
  '23514', null, '#1: nothing new is created inside a block in Trash'
);
update public.pages set deleted_at = now() where title = 'Notes';
select throws_ok(
  $$ update public.blocks set page_id = (select id from public.pages where title = 'Notes') where title = 'Spring tasks' $$,
  '23514', null, '#1: a live block cannot move into a page in Trash'
);
update public.tasks set deleted_at = now() where title = 'Kitchen';
select throws_ok(
  $$ insert into public.tasks (block_id, parent_id, title, position) select block_id, id, 'Tiles', 1 from public.tasks where title = 'Kitchen' $$,
  '23514', null, '#1: a live step cannot sit under a step in Trash'
);
update public.tasks set deleted_at = now() where title = 'Garden';
select is((select count(*)::int from public.tasks where title in ('Shed', 'Paint shed') and deleted_at is not null), 2,
  'trashing a step takes its sub-steps to Trash too');
update public.tasks set deleted_at = null where title = 'Garden';
select is((select count(*)::int from public.tasks where title in ('Shed', 'Paint shed') and deleted_at is null), 2,
  'restoring the step brings its sub-steps back');

select * from finish();
rollback;
