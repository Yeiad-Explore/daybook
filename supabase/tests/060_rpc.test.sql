-- RPC surface (PRD §10.7): signatures, grants, stub behaviour for RPCs of later phases (CONSTRAINTS.md
-- E1; Phase 1's are implemented and tested in 032..034) and the calendar functions (C-RLS-07).
begin;

create function pg_temp.rpcs() returns table (name text, args text[], phase int) language sql as $$
  values
    ('get_today', array['date'], 1),
    ('space_summary', array['uuid', 'date'], 1),
    ('reschedule_task', array['uuid', 'date', 'text', 'boolean'], 1),
    ('reschedule_space', array['uuid', 'date', 'text', 'boolean'], 1),
    ('delete_task', array['uuid', 'text'], 1),
    ('set_task_done', array['uuid', 'boolean'], 1),
    ('move_page', array['uuid', 'uuid'], 4),
    ('move_block', array['uuid', 'uuid'], 4),
    ('reorder', array['text', 'uuid', 'uuid', 'uuid'], 1),
    ('duplicate_page', array['uuid', 'boolean'], 4),
    ('duplicate_block', array['uuid', 'boolean'], 4),
    ('routine_streak', array['uuid', 'date'], 1),
    ('tracker_series', array['uuid', 'integer'], 1),
    ('week_review', array['date'], 4),
    ('restore_item', array['text', 'uuid'], 1),
    ('search_all', array['text', 'integer'], 4)
$$;

select plan(16 * 3 + 6 + 10);

-- Signature, grants and stub error for every client-facing RPC.
select has_function('public', name, args, name || ' exists with the §10.7 signature') from pg_temp.rpcs();
select function_privs_are('public', name, args, 'anon', array[]::text[], name || ': anon cannot call it') from pg_temp.rpcs();
select function_privs_are('public', name, args, 'authenticated', array['EXECUTE'], name || ': authenticated can call it') from pg_temp.rpcs();

create function pg_temp.stub_errors() returns setof text language plpgsql as $$
declare
  r record;
begin
  for r in select * from pg_temp.rpcs() where phase > 1 loop
    return next throws_ok(
      format('select public.%I(%s)', r.name, array_to_string(array(select 'null::' || a from unnest(r.args) a), ', ')),
      '0A000', format('%s is not available until Phase %s.', r.name, r.phase),
      r.name || ': stub says which phase builds it');
  end loop;
end;
$$;
select tests.create_user('owner@test.local');
select tests.authenticate_as('owner@test.local');
select * from pg_temp.stub_errors();
reset role;

-- Catalog-wide: anon can execute nothing in public (catches a future migration that forgets to revoke).
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  'anon can execute no function in public'
);

-- purge_trash is for the scheduled job only.
select has_function('public', 'purge_trash', array[]::text[], 'purge_trash exists');
select function_privs_are('public', 'purge_trash', array[]::text[], 'authenticated', array[]::text[], 'purge_trash: clients cannot call it');

-- Calendar status and prefs (implemented): only the caller's own connection, only safe fields.
select tests.create_user('other@test.local');
select tests.seed(tests.uid('owner@test.local'));
update public.google_connections set refresh_token_secret_id = gen_random_uuid() where owner_id = tests.uid('owner@test.local');

select tests.authenticate_as('owner@test.local');
select is(public.get_calendar_status() ->> 'status', 'connected', 'get_calendar_status: owner sees their connection');
select ok(not (public.get_calendar_status() ? 'refresh_token_secret_id'), 'get_calendar_status: the token reference is never returned');
select lives_ok($$ select public.set_calendar_prefs(true, false, 'primary') $$, 'set_calendar_prefs: owner updates their prefs');
select results_eq(
  $$ select (public.get_calendar_status() ->> 'push_deadlines')::boolean, (public.get_calendar_status() ->> 'auto_sync_new_blocks')::boolean $$,
  $$ values (true, false) $$, 'set_calendar_prefs: changes are stored'
);

select tests.authenticate_as('other@test.local');
select is(public.get_calendar_status() ->> 'status', 'disconnected', 'get_calendar_status: another user sees only "not connected"');
select throws_ok($$ select public.set_calendar_prefs(false, true, 'primary') $$, 'P0002', null,
  'set_calendar_prefs: another user cannot change the owner''s prefs');
reset role;
select is((select push_deadlines from public.google_connections where owner_id = tests.uid('owner@test.local')), true,
  'the owner''s prefs are untouched by the other user');

select * from finish();
rollback;
