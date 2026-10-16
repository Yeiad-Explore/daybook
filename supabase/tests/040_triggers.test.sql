-- Shared triggers: C-TRG-01, C-TRG-02, C-TRG-03, C-TRG-13, C-SCH-01, C-RLS-08, C-DB-02.
begin;
select plan(45);

select tests.create_user('owner@test.local');
select tests.create_user('other@test.local');
select tests.seed(tests.uid('owner@test.local'));
select tests.seed(tests.uid('other@test.local'));

------------------------------------------------------------------------------------------------
-- C-TRG-01: every table with updated_at stamps it on update.
------------------------------------------------------------------------------------------------
create function pg_temp.updated_at_is_stamped()
returns setof text
language plpgsql
as $$
declare
  t text;
  v timestamptz;
begin
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'updated_at' order by 1
  loop
    execute format('update public.%I set updated_at = ''2000-01-01'' returning updated_at', t) into v;
    return next ok(v > '2000-01-01', 'C-TRG-01: ' || t || ' stamps updated_at');
  end loop;
end;
$$;
select * from pg_temp.updated_at_is_stamped();

------------------------------------------------------------------------------------------------
-- C-TRG-02: space_id and block_id are derived from the parent, never from the client.
------------------------------------------------------------------------------------------------
select tests.authenticate_as('owner@test.local');

insert into public.blocks (page_id, type, title, position, space_id)
values (tests.row_id('pages', 'owner@test.local', 'title = ''Workouts'''), 'todo', 'Derived', 9,
        tests.row_id('spaces', 'owner@test.local', 'name = ''Finance'''));
select is(
  (select space_id from public.blocks where title = 'Derived'),
  tests.row_id('spaces', 'owner@test.local', 'name = ''Health'''),
  'C-TRG-02: a block takes its space from its page, whatever the client sent'
);

insert into public.tasks (block_id, title, due_date, position)
values (tests.row_id('blocks', 'owner@test.local', 'title = ''Derived'''), 'Derived task', '2026-10-20', 1);
select is(
  (select space_id from public.tasks where title = 'Derived task'),
  tests.row_id('spaces', 'owner@test.local', 'name = ''Health'''),
  'C-TRG-02: a task takes its space from its block'
);

insert into public.tracker_entries (field_id, block_id, entry_date, value)
values (tests.row_id('tracker_fields', 'owner@test.local'),
        tests.row_id('blocks', 'owner@test.local', 'title = ''Training plan'''), '2026-10-15', 77.5);
select is(
  (select block_id from public.tracker_entries where entry_date = '2026-10-15'),
  tests.row_id('blocks', 'owner@test.local', 'title = ''Body & food'''),
  'C-TRG-02: a tracker entry takes its block from its field'
);

update public.pages set space_id = tests.row_id('spaces', 'owner@test.local', 'name = ''AI Agency''')
where id = tests.row_id('pages', 'owner@test.local', 'title = ''Workouts''');
select is(
  (select space_id from public.tasks where title = 'Buy running shoes'),
  tests.row_id('spaces', 'owner@test.local', 'name = ''AI Agency'''),
  'C-TRG-02: moving a page moves its blocks'' tasks to the new space'
);
select is(
  (select space_id from public.time_blocks where title = 'Morning run'),
  tests.row_id('spaces', 'owner@test.local', 'name = ''AI Agency'''),
  'C-TRG-02: moving a page moves its time slots to the new space'
);

------------------------------------------------------------------------------------------------
-- C-TRG-03: children only in blocks of the matching type.
------------------------------------------------------------------------------------------------
select throws_ok(
  format($$ insert into public.tasks (block_id, title, position) values (%L, 'Wrong block', 1) $$,
         tests.row_id('blocks', 'owner@test.local', 'type = ''table''')),
  '23514', null, 'C-TRG-03: tasks only in todo or roadmap blocks'
);
select throws_ok(
  format($$ insert into public.tracker_fields (block_id, label, position) values (%L, 'Wrong', 1) $$,
         tests.row_id('blocks', 'owner@test.local', 'type = ''todo''')),
  '23514', null, 'C-TRG-03: tracker fields only in tracker blocks'
);
select throws_ok(
  format($$ insert into public.table_columns (block_id, name, position) values (%L, 'Wrong', 1) $$,
         tests.row_id('blocks', 'owner@test.local', 'type = ''notes''')),
  '23514', null, 'C-TRG-03: table columns only in table blocks'
);
select throws_ok(
  format($$ insert into public.table_rows (block_id, position) values (%L, 1) $$,
         tests.row_id('blocks', 'owner@test.local', 'type = ''routine''')),
  '23514', null, 'C-TRG-03: table rows only in table blocks'
);
select throws_ok(
  format($$ insert into public.time_blocks (block_id, title, starts_at, ends_at) values (%L, 'Wrong', '2026-10-16 10:00+06', '2026-10-16 11:00+06') $$,
         tests.row_id('blocks', 'owner@test.local', 'type = ''roadmap''')),
  '23514', null, 'C-TRG-03: time slots only in time blocks'
);
select throws_ok(
  format($$ insert into public.routine_steps (block_id, label, position) values (%L, 'Wrong', 1) $$,
         tests.row_id('blocks', 'owner@test.local', 'type = ''tracker''')),
  '23514', null, 'C-TRG-03: routine steps only in routine blocks'
);
select throws_ok(
  format($$ insert into public.notes (block_id) values (%L) $$,
         tests.row_id('blocks', 'owner@test.local', 'type = ''timeblock''')),
  '23514', null, 'C-TRG-03: notes only in notes blocks'
);

-- C-SCH-01: a block's type never changes.
select throws_ok(
  $$ update public.blocks set type = 'notes' where title = 'Training plan' $$,
  '23514', null, 'C-SCH-01: a block''s type cannot change'
);

------------------------------------------------------------------------------------------------
-- C-DB-02: maintained columns are not writable by the client.
------------------------------------------------------------------------------------------------
select throws_ok(
  $$ update public.tasks set reschedule_count = 5 where title = 'Buy running shoes' $$,
  '42501', null, 'C-DB-02: reschedule_count is not client-writable'
);
select throws_ok(
  $$ update public.tasks set completed_at = now() where title = 'Buy running shoes' $$,
  '42501', null, 'C-DB-02: completed_at is not client-writable'
);
select throws_ok(
  $$ update public.tasks set sync_status = 'synced' where title = 'Buy running shoes' $$,
  '42501', null, 'C-DB-02: a task''s sync status is not client-writable'
);
select throws_ok(
  $$ update public.time_blocks set gcal_event_id = 'fake', sync_status = 'synced' where title = 'Morning run' $$,
  '42501', null, 'C-DB-02: a slot''s calendar fields are not client-writable'
);
select throws_ok(
  format($$ insert into public.tasks (block_id, title, due_date, position, reschedule_count) values (%L, 'Pre-moved', '2026-10-20', 1, 3) $$,
         tests.row_id('blocks', 'owner@test.local', 'title = ''Training plan''')),
  '42501', null, 'C-DB-02: maintained columns cannot be set on insert either'
);
select lives_ok(
  $$ update public.tasks set title = 'Buy trail running shoes', note = 'size 43' where title = 'Buy running shoes' $$,
  'C-DB-02: ordinary columns stay editable'
);

------------------------------------------------------------------------------------------------
-- C-RLS-08: nothing attaches to another owner's parent, even with a valid id.
------------------------------------------------------------------------------------------------
select tests.authenticate_as('other@test.local');
select throws_ok(
  format($$ insert into public.pages (space_id, position) values (%L, 9) $$, tests.row_id('spaces', 'owner@test.local')),
  '23503', null, 'C-RLS-08: a page cannot attach to another owner''s space'
);
select throws_ok(
  format($$ insert into public.blocks (page_id, type, title, position) values (%L, 'notes', 'Intruder', 9) $$, tests.row_id('pages', 'owner@test.local')),
  '23503', null, 'C-RLS-08: a block cannot attach to another owner''s page'
);
select throws_ok(
  format($$ insert into public.tasks (block_id, title, position) values (%L, 'Intruder', 9) $$,
         tests.row_id('blocks', 'owner@test.local', 'type = ''todo''')),
  '23503', null, 'C-RLS-08: a task cannot attach to another owner''s block'
);
select throws_ok(
  format($$ insert into public.tracker_entries (field_id, block_id, entry_date, value) values (%L, %L, '2026-10-16', 1) $$,
         tests.row_id('tracker_fields', 'owner@test.local'), tests.row_id('blocks', 'other@test.local', 'type = ''tracker''')),
  '23503', null, 'C-RLS-08: a tracker entry cannot attach to another owner''s field'
);
select throws_ok(
  format($$ insert into public.time_blocks (block_id, task_id, title, starts_at, ends_at) values (%L, %L, 'Linked', '2026-10-16 10:00+06', '2026-10-16 11:00+06') $$,
         tests.row_id('blocks', 'other@test.local', 'type = ''timeblock'''), tests.row_id('tasks', 'owner@test.local')),
  '23503', null, 'C-RLS-08: a time slot cannot link another owner''s task'
);
select throws_ok(
  format($$ insert into public.deadline_changes (space_id, item_title, old_due, new_due, reason, was_late) values (%L, 'x', '2026-10-01', '2026-10-02', 'spoof', false) $$,
         tests.row_id('spaces', 'owner@test.local')),
  '23503', null, 'C-RLS-08: deadline history cannot point at another owner''s space'
);

------------------------------------------------------------------------------------------------
-- C-TRG-13: soft delete cascades down and restore brings back what went with it.
------------------------------------------------------------------------------------------------
reset role;
update public.blocks set deleted_at = '2026-10-10 09:00+06'
where id = tests.row_id('blocks', 'owner@test.local', 'title = ''Marketing tasks''');  -- deleted on its own earlier
update public.spaces set deleted_at = '2026-10-16 09:00+06'
where id = tests.row_id('spaces', 'owner@test.local', 'name = ''AI Agency''');
select is(
  (select count(*)::int from public.pages p where p.space_id = tests.row_id('spaces', 'owner@test.local', 'name = ''AI Agency''') and p.deleted_at = '2026-10-16 09:00+06'),
  2, 'C-TRG-13: deleting a space deletes its pages'
);
select is(
  (select deleted_at from public.tasks where title = 'Send proposal follow-up to Bayside Café' and owner_id = tests.uid('owner@test.local')),
  '2026-10-10 09:00+06'::timestamptz, 'C-TRG-13: an item already in Trash keeps its own deletion time'
);
select is(
  (select deleted_at from public.blocks where title = 'Training plan' and owner_id = tests.uid('owner@test.local')),
  '2026-10-16 09:00+06'::timestamptz, 'C-TRG-13: blocks of a deleted space are deleted (page moved there earlier)'
);
select is(
  (select deleted_at from public.tasks where title = 'Buy trail running shoes' and owner_id = tests.uid('owner@test.local')),
  '2026-10-16 09:00+06'::timestamptz, 'C-TRG-13: tasks of a deleted space are deleted'
);
update public.spaces set deleted_at = null
where id = tests.row_id('spaces', 'owner@test.local', 'name = ''AI Agency''');
select is(
  (select count(*)::int from public.tasks where owner_id = tests.uid('owner@test.local') and deleted_at = '2026-10-16 09:00+06'),
  0, 'C-TRG-13: restoring the space restores what was deleted with it'
);
select isnt(
  (select deleted_at from public.blocks where title = 'Marketing tasks' and owner_id = tests.uid('owner@test.local')),
  null, 'C-TRG-13: restore leaves separately deleted items in Trash'
);

select * from finish();
rollback;
