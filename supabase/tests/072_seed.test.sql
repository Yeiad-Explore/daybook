-- The PRD §12 seed (C-SEED-01) and the TODAY AC (§6.12) with the dev examples, p_today = 2026-10-16.
begin;
select plan(23);

select tests.create_user('owner@test.local');
select tests.create_user('empty@test.local');
select tests.create_user('other@test.local');

-- Callable by the service role only.
select tests.authenticate_as('owner@test.local');
select throws_ok($$ select public.seed_owner(tests.uid('owner@test.local'), true, '2026-10-16') $$, '42501', null,
  'C-SEED-01: a signed-in client cannot call seed_owner');
select tests.clear_authentication();
select throws_ok($$ select public.seed_owner(tests.uid('owner@test.local'), true, '2026-10-16') $$, '42501', null,
  'C-SEED-01: anon cannot call seed_owner');

set local role service_role;
select lives_ok($$ select public.seed_owner(tests.uid('owner@test.local'), true, '2026-10-16') $$, 'C-SEED-01: seeds a fresh owner with examples');
select lives_ok($$ select public.seed_owner(tests.uid('empty@test.local'), false, '2026-10-16') $$, 'C-SEED-01: seeds a fresh owner, structure only');
select throws_ok($$ select public.seed_owner(tests.uid('owner@test.local'), true, '2026-10-16') $$, '55000', null,
  'C-SEED-01: refuses an owner who already has spaces');
reset role;

select results_eq($$ select kind::text, count(*)::int from public.spaces where owner_id = tests.uid('owner@test.local') group by kind order by kind $$,
  $$ values ('area', 3), ('goal', 3) $$, '§12: three goals and three life areas');
select results_eq($$ select name, mark::text from public.spaces where owner_id = tests.uid('owner@test.local') order by kind, position $$,
  $$ values ('Health', 'moss'), ('AI Engineering', 'slate'), ('AI Agency', 'ochre'), ('Finance', 'teal'), ('Skincare', 'clay'), ('Personal', 'graphite') $$,
  '§12: names and marks in order');
select results_eq($$ select p.title from public.pages p join public.spaces s on s.id = p.space_id where s.name = 'Health' and s.owner_id = tests.uid('owner@test.local') order by p.position $$,
  $$ values ('Daily Tracker'), ('Workouts') $$, '§12: Health pages (the auto Overview page became Daily Tracker)');
select is((select count(*)::int from public.blocks b join public.spaces s on s.id = b.space_id where s.owner_id = tests.uid('owner@test.local')), 17,
  '§12: 17 blocks across the six spaces');
select is((select count(*)::int from public.tasks t join public.blocks b on b.id = t.block_id where b.type = 'roadmap' and t.parent_id is null and t.owner_id = tests.uid('owner@test.local')), 4,
  '§12: four roadmap stages');
select is((select count(*)::int from public.tasks t join public.blocks b on b.id = t.block_id where b.type = 'roadmap' and t.parent_id is not null and t.owner_id = tests.uid('owner@test.local')), 16,
  '§12: sixteen roadmap steps');
select is((select count(*)::int from public.tasks where is_milestone and owner_id = tests.uid('owner@test.local')), 3, '§12: Health milestones 76 kg, First 5K run, 72 kg');

-- Structure only: no example tasks, nothing late.
select tests.authenticate_as('empty@test.local');
select is((public.get_today('2026-10-16') ->> 'late_count')::int, 0, '§12: structure-only seed has nothing late');
select is((select count(*)::int from public.tasks where title in ('Buy running shoes', 'Send proposal follow-up to Bayside Café')), 0,
  '§12: production starts without the example tasks');
select is((select count(*)::int from public.tracker_entries), 0, '§12: structure-only seed has no tracker entries');

-- With examples: the TODAY AC and the Phase 2 demos.
select tests.authenticate_as('owner@test.local');
select results_eq($$ select r ->> 'title' from jsonb_array_elements(public.get_today('2026-10-16') -> 'overdue') r $$,
  $$ values ('Buy running shoes'), ('Send proposal follow-up to Bayside Café') $$, 'TODAY AC: Overdue shows the two late example tasks');
select is((public.get_today('2026-10-16') ->> 'late_count')::int, 2, 'TODAY AC: the late-count is 2');
select is(public.space_summary((select id from public.spaces where name = 'AI Agency'), '2026-10-16') -> 'progress' ->> 'label', '2 of 5 · Client',
  'SPC-7: the agency goal counts its Client rows');
select is(public.space_summary((select id from public.spaces where name = 'Health'), '2026-10-16') -> 'progress' ->> 'label', '77.2 kg now · started 78.4 · target 72',
  'SPC-7: Health progress reads the Weight field');
select is((public.routine_streak((select id from public.blocks where title = 'Morning'), '2026-10-16') ->> 'streak')::int, 12,
  'RT-4 AC1: Morning shows a 12-day streak with 2 of 4 steps done today');
select is((select sum((r.cells ->> c.id::text)::numeric)::int from public.table_rows r
             join public.table_columns c on c.block_id = r.block_id and c.name = 'Calories'
            where r.cells ->> (select d.id::text from public.table_columns d where d.name = 'Date' and d.block_id = c.block_id) = '2026-10-16'), 1170,
  'TBL-5 AC: today''s meals add up to 1,170 kcal');
select is(jsonb_array_length(public.get_today('2026-10-16') -> 'slots'), 3, 'TB-1: three example slots today');

select tests.authenticate_as('other@test.local');
select is((select count(*)::int from public.spaces), 0, 'RLS: another user sees none of the seeded data');

select * from finish();
rollback;
