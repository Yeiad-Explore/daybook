-- Row Level Security: C-RLS-01..05 (C-RLS-06/07 arrive with their tables, C-RLS-08 with T7).
begin;
select plan(27);

select tests.create_user('owner@test.local');
select tests.create_user('other@test.local');
select tests.seed(tests.uid('owner@test.local'));

-- C-RLS-01: no table in public without RLS.
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'C-RLS-01: every table in public has RLS enabled'
);

-- Owner sees their own data (so "sees nothing" below is meaningful).
select tests.authenticate_as('owner@test.local');
select ok((select count(*) from public.spaces) = 5, 'owner reads their 5 spaces');
select ok((select count(*) from public.pages) > 0, 'owner reads their pages');
select ok((select count(*) from public.blocks) > 0, 'owner reads their blocks');
select ok((select count(*) from public.tasks) = 4, 'owner reads their 4 tasks');
select ok((select count(*) from public.deadline_changes) = 1, 'owner reads their deadline history');

-- C-RLS-06: deadline_changes is append-only, even for the owner.
select throws_ok($$ update public.deadline_changes set reason = 'edited' $$, '42501', null, 'C-RLS-06: owner cannot edit deadline history');
select throws_ok($$ delete from public.deadline_changes $$, '42501', null, 'C-RLS-06: owner cannot delete deadline history');

-- C-RLS-03: owner_id defaults to the signed-in user; another owner's id is rejected.
select lives_ok(
  $$ insert into public.spaces (kind, name, position) values ('area', 'Personal', 3) $$,
  'C-RLS-03: owner inserts without giving owner_id'
);
select is(
  (select owner_id from public.spaces where name = 'Personal'), tests.uid('owner@test.local'),
  'C-RLS-03: owner_id defaults to auth.uid()'
);
select throws_ok(
  format($$ insert into public.spaces (owner_id, kind, name, position) values (%L, 'area', 'Spoofed', 4) $$, tests.uid('other@test.local')),
  '42501', null, 'C-RLS-03: inserting a row for another owner is rejected'
);

-- C-RLS-02/04: the non-owner reads, updates and deletes nothing.
select tests.authenticate_as('other@test.local');
select * from tests.other_sees_nothing('spaces');
select * from tests.other_sees_nothing('pages');
select * from tests.other_sees_nothing('blocks');
select * from tests.other_sees_nothing('tasks');
select is((select count(*)::int from public.deadline_changes), 0, 'C-RLS-04: non-owner reads no deadline history');
select is(
  (select count(*)::int from public.profiles where id = tests.uid('owner@test.local')), 0,
  'C-RLS-04: non-owner cannot read the owner''s profile'
);
select throws_ok(
  format($$ insert into public.pages (owner_id, space_id, position)
            values (%L, (select id from public.spaces limit 1), 1) $$, tests.uid('owner@test.local')),
  '42501', null, 'C-RLS-04: non-owner cannot insert into the owner''s data'
);

-- C-RLS-05: anon has no access at all.
select tests.clear_authentication();
select throws_ok($$ select count(*) from public.spaces $$, '42501', null, 'C-RLS-05: anon cannot read spaces');

select * from finish();
rollback;
