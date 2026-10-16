-- DL-14 (C-DL-24): trashing something that contains late tasks needs one reason and logs each task.
begin;
select plan(18);

select function_privs_are('public', 'trash_item', array['text', 'uuid', 'text'], 'anon', array[]::text[], 'trash_item: anon cannot call it');
select function_privs_are('public', 'trash_item', array['text', 'uuid', 'text'], 'authenticated', array['EXECUTE'], 'trash_item: signed-in owner can call it');

select tests.create_user('owner@test.local');
select tests.create_user('other@test.local');
select tests.seed(tests.uid('owner@test.local'));
select tests.authenticate_as('owner@test.local');
select set_config('app.today', '2026-10-16', true);

-- Direct trash is refused and names the late task.
select throws_like(
  $$ update public.blocks set deleted_at = now() where title = 'Marketing tasks' $$,
  '%Send proposal follow-up to Bayside Café%', 'C-DL-24: trashing a block with a late task directly is refused, listing it'
);
select throws_ok(
  $$ update public.spaces set deleted_at = now() where name = 'AI Agency' $$,
  '42501', null, 'C-DL-24: the same holds for a space'
);
select throws_ok(
  $$ update public.pages set deleted_at = now() where title = 'Marketing' $$,
  '42501', null, 'C-DL-24: and for a page'
);

-- AC1: without a reason, trash_item returns the list and trashes nothing.
select is(
  public.trash_item('blocks', (select id from public.blocks where title = 'Marketing tasks')),
  jsonb_build_object('status', 'needs_reason', 'late_tasks', jsonb_build_array(jsonb_build_object(
    'id', (select id from public.tasks where title = 'Send proposal follow-up to Bayside Café'),
    'title', 'Send proposal follow-up to Bayside Café', 'due_date', '2026-10-15'))),
  'DL-14 AC1: without a reason the late tasks are listed'
);
select is((select deleted_at from public.blocks where title = 'Marketing tasks'), null, 'DL-14 AC1: nothing is trashed yet');
select throws_ok(
  $$ select public.trash_item('blocks', (select id from public.blocks where title = 'Marketing tasks'), 'no') $$,
  '23514', null, 'DL-14: a reason needs at least 3 characters'
);

-- AC2: with a reason, one deleted_while_late record per late task, then Trash.
select is(
  public.trash_item('blocks', (select id from public.blocks where title = 'Marketing tasks'), 'Dropping this channel'),
  '{"status": "trashed", "late_logged": 1}'::jsonb, 'DL-14 AC2: the block goes to Trash'
);
select results_eq(
  $$ select kind::text, item_title, old_due, new_due, reason, was_late from public.deadline_changes where kind = 'deleted_while_late' $$,
  $$ values ('deleted_while_late', 'Send proposal follow-up to Bayside Café', '2026-10-15'::date, null::date, 'Dropping this channel', true) $$,
  'DL-14 AC2: the late task is logged with the reason'
);
select isnt((select deleted_at from public.tasks where title = 'Send proposal follow-up to Bayside Café'), null,
  'DL-14 AC2: the task went to Trash with its block');

-- Restore keeps the log and re-checks the rules (DL-13).
update public.blocks set deleted_at = null where title = 'Marketing tasks';
select is((select deleted_at from public.tasks where title = 'Send proposal follow-up to Bayside Café'), null,
  'DL-14: restoring brings the task back');
select is((select count(*)::int from public.deadline_changes where kind = 'deleted_while_late'), 1,
  'DL-14: the deleted-while-late record stays after restore');

-- A roadmap step whose sub-step is late (the "add a sub-step, then trash" route).
insert into public.tasks (block_id, parent_id, title, due_date, position)
select block_id, id, 'Variables quiz', '2026-10-12', 5 from public.tasks where title = 'Learn Python';
select throws_ok(
  $$ update public.tasks set deleted_at = now() where title = 'Learn Python' $$,
  '42501', null, 'C-DL-24: trashing a step with a late sub-step directly is refused'
);
select is(
  public.trash_item('tasks', (select id from public.tasks where title = 'Learn Python'), 'Changing course') ->> 'late_logged',
  '1', 'DL-14: trashing the step logs its late sub-step'
);

-- Nothing late inside: trash_item trashes without asking.
select is(
  public.trash_item('blocks', (select id from public.blocks where title = 'Workout slots')),
  '{"status": "trashed", "late_logged": 0}'::jsonb, 'DL-14: no late tasks inside, no reason needed'
);

-- Only the four trashable tables, and only your own rows.
select throws_ok($$ select public.trash_item('profiles', gen_random_uuid()) $$, '22023', null, 'trash_item: other tables are refused');
select tests.authenticate_as('other@test.local');
select throws_ok(
  format($$ select public.trash_item('blocks', %L, 'Not mine') $$, tests.row_id('blocks', 'owner@test.local', 'title = ''Training plan''')),
  'P0002', null, 'trash_item: another owner''s block is not found'
);

select * from finish();
rollback;
