-- Test-only helpers. Runs first (files run alphabetically) and is NOT rolled back, so later
-- test files can call these. The `tests` schema exists only in the local/CI test database;
-- it is never part of a migration.
--
-- Written in-repo instead of installing basejump-supabase_test_helpers via dbdev, which
-- downloads from api.database.dev on every run. Impersonation follows auth.uid(), which reads
-- the `sub` of request.jwt.claims (see 001-smoke.test.sql, which checks this).

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

create or replace function tests.create_user(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
          '{"provider":"email","providers":["email"]}', '{}', now(), now());
  return v_id;
end;
$$;

create or replace function tests.uid(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select id from auth.users where email = p_email $$;

-- Act as the given user for the rest of the transaction (role + JWT claims).
create or replace function tests.authenticate_as(p_email text)
returns void
language plpgsql
as $$
declare
  v_id uuid := tests.uid(p_email);
begin
  if v_id is null then
    raise exception 'tests.authenticate_as: no user %', p_email;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id, 'email', p_email, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
end;
$$;

create or replace function tests.clear_authentication()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
end;
$$;

-- Fixtures: the PRD §12 seed subset the rule tests need, owned by p_owner, inserted as the
-- test superuser (no RLS). Dates are fixed so tests can pass p_today = 2026-10-16.
create or replace function tests.seed(p_owner uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_health uuid; v_ai uuid; v_agency uuid; v_finance uuid; v_skincare uuid;
  v_page uuid;
begin
  insert into public.spaces (owner_id, kind, name, mark, end_goal, start_date, deadline, metric, position)
  values (p_owner, 'goal', 'Health', 'moss', 'Reach 72 kg and run a 5K without stopping', '2026-09-01', '2027-01-31', 'tracker', 1)
  returning id into v_health;
  insert into public.spaces (owner_id, kind, name, mark, end_goal, start_date, deadline, position)
  values (p_owner, 'goal', 'AI Engineering', 'slate', 'Finish the AI engineering roadmap and ship one real AI project', '2026-10-01', '2027-04-30', 2)
  returning id into v_ai;
  insert into public.spaces (owner_id, kind, name, mark, end_goal, start_date, deadline, metric, position)
  values (p_owner, 'goal', 'AI Agency', 'ochre', 'Grow to 5 retainer clients', '2026-08-15', '2027-03-31', 'table_count', 3)
  returning id into v_agency;
  insert into public.spaces (owner_id, kind, name, mark, position)
  values (p_owner, 'area', 'Finance', 'teal', 1) returning id into v_finance;
  insert into public.spaces (owner_id, kind, name, mark, position)
  values (p_owner, 'area', 'Skincare', 'clay', 2) returning id into v_skincare;

  insert into public.pages (owner_id, space_id, title, position) values (p_owner, v_health, 'Workouts', 1) returning id into v_page;
  insert into public.blocks (owner_id, page_id, space_id, type, title, position, span) values (p_owner, v_page, v_health, 'todo', 'Training plan', 1, 6);
  insert into public.blocks (owner_id, page_id, space_id, type, title, position, span) values (p_owner, v_page, v_health, 'timeblock', 'Workout slots', 2, 6);

  insert into public.pages (owner_id, space_id, title, position) values (p_owner, v_ai, 'Roadmap', 1) returning id into v_page;
  insert into public.blocks (owner_id, page_id, space_id, type, title, position) values (p_owner, v_page, v_ai, 'roadmap', 'AI Engineering roadmap', 1);

  insert into public.pages (owner_id, space_id, title, position) values (p_owner, v_agency, 'Marketing', 1) returning id into v_page;
  insert into public.blocks (owner_id, page_id, space_id, type, title, position, span) values (p_owner, v_page, v_agency, 'todo', 'Marketing tasks', 1, 6);

  insert into public.pages (owner_id, space_id, title, position) values (p_owner, v_finance, 'Ledger', 1) returning id into v_page;
  insert into public.blocks (owner_id, page_id, space_id, type, title, position) values (p_owner, v_page, v_finance, 'table', 'Income and expenses', 1);

  insert into public.pages (owner_id, space_id, title, position) values (p_owner, v_skincare, 'Routine', 1) returning id into v_page;
  insert into public.blocks (owner_id, page_id, space_id, type, title, position, span) values (p_owner, v_page, v_skincare, 'routine', 'Morning', 1, 4);

  -- Tasks from PRD §6.12 / §6.6 ACs (today = 2026-10-16).
  insert into public.tasks (owner_id, block_id, space_id, title, due_date, position)
  select p_owner, b.id, b.space_id, 'Buy running shoes', '2026-10-14', 1 from public.blocks b where b.title = 'Training plan' and b.owner_id = p_owner;
  insert into public.tasks (owner_id, block_id, space_id, title, due_date, position)
  select p_owner, b.id, b.space_id, 'Send proposal follow-up to Bayside Café', '2026-10-15', 1 from public.blocks b where b.title = 'Marketing tasks' and b.owner_id = p_owner;
  insert into public.tasks (owner_id, block_id, space_id, title, due_date, position)
  select p_owner, b.id, b.space_id, 'Learn Python', '2026-11-15', 1 from public.blocks b where b.title = 'AI Engineering roadmap' and b.owner_id = p_owner;
  insert into public.tasks (owner_id, block_id, space_id, parent_id, depth, title, due_date, position)
  select p_owner, t.block_id, t.space_id, t.id, 1, 'Loops: for and while', '2026-10-16', 1 from public.tasks t where t.title = 'Learn Python' and t.owner_id = p_owner;

  insert into public.deadline_changes (owner_id, task_id, space_id, item_title, old_due, new_due, reason, was_late)
  select p_owner, t.id, t.space_id, t.title, '2026-10-12', '2026-10-14', 'Shop closed', true from public.tasks t where t.title = 'Buy running shoes' and t.owner_id = p_owner;
end;
$$;

-- C-RLS-02/04: run as the non-owner. Three assertions per table: reads, updates and deletes nothing.
create or replace function tests.other_sees_nothing(p_table text)
returns setof text
language plpgsql
as $$
declare
  n bigint;
begin
  execute format('select count(*) from public.%I', p_table) into n;
  return next extensions.is(n, 0::bigint, p_table || ': non-owner reads nothing');
  execute format('with u as (update public.%I set created_at = created_at returning 1) select count(*) from u', p_table) into n;
  return next extensions.is(n, 0::bigint, p_table || ': non-owner updates nothing');
  execute format('with d as (delete from public.%I returning 1) select count(*) from d', p_table) into n;
  return next extensions.is(n, 0::bigint, p_table || ': non-owner deletes nothing');
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- pg_prove needs a plan in every file.
begin;
select plan(1);
select has_function('tests', 'authenticate_as', array['text'], 'test helpers are installed');
select * from finish();
rollback;
