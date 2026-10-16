-- Task tree: C-TRG-04 (task_tree_guard), C-TRG-07 (task_parent_done), C-TRG-08 (task_completed_at),
-- C-DB-02 (done on roadmap parents), RM-2 AC2, RM-3.
begin;
select plan(24);

select tests.create_user('owner@test.local');
select tests.seed(tests.uid('owner@test.local'));
select tests.authenticate_as('owner@test.local');
select set_config('app.today', '2026-10-16', true);  -- p_today, so "late" never depends on the wall clock

------------------------------------------------------------------------------------------------
-- C-TRG-04: tree shape.
------------------------------------------------------------------------------------------------
insert into public.tasks (block_id, parent_id, depth, title, due_date, position)
select block_id, id, 0, 'Operators and variables', '2026-10-20', 2 from public.tasks where title = 'Learn Python';
select is((select depth from public.tasks where title = 'Operators and variables'), 1::smallint,
  'C-TRG-04: depth comes from the parent, not the client');

select throws_ok(
  $$ insert into public.tasks (block_id, parent_id, title, due_date, position)
     select b.id, t.id, 'Child in a to-do list', '2026-10-20', 1
     from public.blocks b, public.tasks t where b.title = 'Training plan' and t.title = 'Buy running shoes' $$,
  '23514', null, 'C-TRG-04: only roadmap steps can have a parent'
);

insert into public.blocks (page_id, type, title, position)
select page_id, 'roadmap', 'Second roadmap', 2 from public.blocks where title = 'AI Engineering roadmap';
select throws_ok(
  $$ insert into public.tasks (block_id, parent_id, title, due_date, position)
     select b.id, t.id, 'Cross-block child', '2026-10-20', 1
     from public.blocks b, public.tasks t where b.title = 'Second roadmap' and t.title = 'Learn Python' $$,
  '23514', null, 'C-TRG-04: a parent must be in the same block'
);
select throws_ok(
  $$ update public.tasks set parent_id = id where title = 'Learn Python' $$,
  '23514', null, 'C-TRG-04: a step cannot be its own parent'
);
select throws_ok(
  $$ update public.tasks set parent_id = (select id from public.tasks where title = 'Loops: for and while') where title = 'Learn Python' $$,
  '23514', null, 'C-TRG-04: cycles are rejected'
);

-- Build stage(0) > Loops(1) > A(2) > B(3).
insert into public.tasks (block_id, parent_id, title, due_date, position)
select block_id, id, 'Level 2', '2026-10-16', 1 from public.tasks where title = 'Loops: for and while';
insert into public.tasks (block_id, parent_id, title, due_date, position)
select block_id, id, 'Level 3', '2026-10-16', 1 from public.tasks where title = 'Level 2';
select is((select depth from public.tasks where title = 'Level 3'), 3::smallint, 'C-TRG-04: a 4th level is allowed');
select throws_ok(
  $$ insert into public.tasks (block_id, parent_id, title, due_date, position)
     select block_id, id, 'Level 4', '2026-10-16', 1 from public.tasks where title = 'Level 3' $$,
  '23514', null, 'C-TRG-04: a 5th level is rejected'
);
select throws_ok(
  $$ update public.tasks set parent_id = (select id from public.tasks where title = 'Operators and variables')
     where title = 'Loops: for and while' $$,
  '23514', null, 'C-TRG-04: moving a subtree deeper than 4 levels is rejected'
);
select is((select depth from public.tasks where title = 'Level 3'), 3::smallint, 'C-TRG-04: a rejected move changes nothing');
update public.tasks set depth = 0 where title = 'Level 3';
select is((select depth from public.tasks where title = 'Level 3'), 3::smallint,
  'C-TRG-04 / DB-2: a hand-set depth is recomputed from the parent');

------------------------------------------------------------------------------------------------
-- C-TRG-08: completed_at follows done.
------------------------------------------------------------------------------------------------
update public.tasks set done = true where title = 'Buy running shoes';
select isnt((select completed_at from public.tasks where title = 'Buy running shoes'), null,
  'C-TRG-08: completing sets completed_at');
update public.tasks set done = false where title = 'Buy running shoes';
select is((select completed_at from public.tasks where title = 'Buy running shoes'), null,
  'C-TRG-08: un-completing clears completed_at');
insert into public.tasks (block_id, title, due_date, position, done)
select id, 'Logged as done', '2026-10-16', 5, true from public.blocks where title = 'Training plan';
select isnt((select completed_at from public.tasks where title = 'Logged as done'), null,
  'C-TRG-08: a task inserted as done gets completed_at');

------------------------------------------------------------------------------------------------
-- C-TRG-07 / RM-3: parents are done exactly when every live child is done.
------------------------------------------------------------------------------------------------
update public.tasks set done = true where title in ('Level 3', 'Operators and variables');
select ok((select done from public.tasks where title = 'Level 2'), 'C-TRG-07: completing the only child completes its parent');
select ok((select done and completed_at is not null from public.tasks where title = 'Learn Python'),
  'C-TRG-07: completion travels all the way up the chain, with completed_at');

update public.tasks set done = false where title = 'Level 3';
select ok(not (select done from public.tasks where title = 'Learn Python'),
  'C-TRG-07: un-checking a leaf un-completes the whole chain');
select is((select completed_at from public.tasks where title = 'Learn Python'), null,
  'C-TRG-07: and clears completed_at up the chain');

update public.tasks set done = true where title = 'Level 3';
insert into public.tasks (block_id, parent_id, title, due_date, position)
select block_id, id, 'Mini project', '2026-11-10', 3 from public.tasks where title = 'Learn Python';
select ok(not (select done from public.tasks where title = 'Learn Python'),
  'RM-2 AC2: breaking down a done step un-completes it');

update public.tasks set deleted_at = now() where title = 'Mini project';
select ok((select done from public.tasks where title = 'Learn Python'),
  'C-TRG-07: deleting the only open child completes the parent');
update public.tasks set deleted_at = null where title = 'Mini project';
select ok(not (select done from public.tasks where title = 'Learn Python'),
  'C-TRG-07: restoring it re-opens the parent');
update public.tasks set deleted_at = now() where title = 'Mini project';
delete from public.tasks where title = 'Mini project';
select ok((select done from public.tasks where title = 'Learn Python'),
  'C-TRG-07: hard-deleting the open child completes the parent');

------------------------------------------------------------------------------------------------
-- C-DB-02: done on a step with sub-steps is maintained by Daybook.
------------------------------------------------------------------------------------------------
select throws_ok(
  $$ update public.tasks set done = false where title = 'Learn Python' $$,
  '42501', null, 'C-DB-02: a parent''s done cannot be set directly'
);
select lives_ok(
  $$ update public.tasks set done = false where title = 'Level 3' $$,
  'C-DB-02: leaves stay checkable'
);
select ok(not (select done from public.tasks where title = 'Learn Python'), 'and the parent follows');

select * from finish();
rollback;
