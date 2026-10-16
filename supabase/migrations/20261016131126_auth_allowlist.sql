-- Phase 0 T12: single-owner allowlist, enforced server-side by a Supabase Auth
-- "Before User Created" hook (AUTH-2 AC1/AC2, C-AUTH-01).
-- Source: supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
-- Enabled locally in supabase/config.toml ([auth.hook.before_user_created]); in the cloud project it
-- must be enabled too before the owner's first sign-in there.

-- Not exposed by the Data API (schema private). Only Supabase Auth reads it.
create table private.signup_allowlist (
  email text primary key check (email = lower(email))
);

-- The owner (PRD header). The only account that may ever be created.
insert into private.signup_allowlist (email) values ('kabid.snit@gmail.com');

create function private.before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if exists (select 1 from private.signup_allowlist where email = lower(event -> 'user' ->> 'email')) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'This Daybook is private.'));
end;
$$;

grant usage on schema private to supabase_auth_admin;
grant select on private.signup_allowlist to supabase_auth_admin;
grant execute on function private.before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function private.before_user_created(jsonb) from public, anon, authenticated;
revoke all on private.signup_allowlist from public, anon, authenticated;
