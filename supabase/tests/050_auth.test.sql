-- Single owner: C-AUTH-01 (AUTH-2 AC1/AC2). The hook is called the way Supabase Auth calls it:
-- with the user about to be created, as supabase_auth_admin.
begin;
select plan(9);

select has_function('private', 'before_user_created', array['jsonb'], 'the Before User Created hook exists');
select function_privs_are('private', 'before_user_created', array['jsonb'], 'supabase_auth_admin', array['EXECUTE'],
  'Supabase Auth can call the hook');
select function_privs_are('private', 'before_user_created', array['jsonb'], 'authenticated', array[]::text[],
  'signed-in clients cannot call the hook');
select function_privs_are('private', 'before_user_created', array['jsonb'], 'anon', array[]::text[],
  'anonymous clients cannot call the hook');

-- postgres may not SET ROLE supabase_auth_admin locally; who may call it is checked above.
select is(
  private.before_user_created('{"user": {"email": "ourcoc4@gmail.com"}}'),
  '{}'::jsonb, 'C-AUTH-01: the owner''s email may sign up'
);
select is(
  private.before_user_created('{"user": {"email": "OurCoc4@Gmail.com"}}'),
  '{}'::jsonb, 'C-AUTH-01: email case does not matter'
);
select is(
  private.before_user_created('{"user": {"email": "someone.else@gmail.com"}}'),
  '{"error": {"http_code": 403, "message": "This Daybook is private."}}'::jsonb,
  'C-AUTH-01: any other email is refused with "This Daybook is private." (AUTH-2 AC1)'
);
select is(
  private.before_user_created('{"user": {"phone": "+8801000000000"}}') -> 'error' ->> 'message',
  'This Daybook is private.', 'C-AUTH-01: a sign-up without an email is refused'
);

select is(
  (select count(*)::int from private.signup_allowlist), 1, 'exactly one address is allowed'
);

select * from finish();
rollback;
