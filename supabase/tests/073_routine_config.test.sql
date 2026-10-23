-- Phase 2 review fixes: routine_streak survives a hand-written blocks.config (RT-2, RT-4, C-RT-01).
begin;
select plan(5);

select tests.create_user('owner@test.local');
select tests.seed(tests.uid('owner@test.local'));
select tests.authenticate_as('owner@test.local');

create function pg_temp.streak(p_today date) returns jsonb language sql as $$
  select public.routine_streak((select id from public.blocks where title = 'Morning'), p_today)
$$;

update public.blocks set created_at = '2026-09-01 08:00+06' where title = 'Morning';
update public.blocks set config = jsonb_set(config, '{days}', '["x", 9, "1"]') where title = 'Morning';
select lives_ok($$ select pg_temp.streak('2026-10-16') $$, 'unusable weekday entries do not make routine_streak fail');
select is((pg_temp.streak('2026-10-16') ->> 'scheduled_today')::boolean, false,
  'only the valid day (Monday) counts: Friday 2026-10-16 is not scheduled');
select is((pg_temp.streak('2026-10-12') ->> 'scheduled_today')::boolean, true, 'Monday 2026-10-12 is scheduled');

update public.blocks set config = jsonb_set(config, '{days}', '[]') where title = 'Morning';
select is((pg_temp.streak('2026-10-16') ->> 'scheduled_today')::boolean, true, 'an empty days list means every day, as in the UI');

select is(pg_temp.streak('2026-08-01') ->> 'streak', '0', 'a today before the routine existed gives streak 0, not null');

select * from finish();
rollback;
