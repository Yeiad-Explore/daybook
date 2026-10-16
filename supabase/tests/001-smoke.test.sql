-- Proves the helpers impersonate the way RLS sees it: role + auth.uid().
begin;
select plan(5);

select tests.create_user('owner@test.local');
select tests.create_user('other@test.local');

select tests.authenticate_as('owner@test.local');
select is(current_user::text, 'authenticated', 'acting as an authenticated user');
select is(auth.uid(), tests.uid('owner@test.local'), 'auth.uid() is the owner');

select tests.authenticate_as('other@test.local');
select is(auth.uid(), tests.uid('other@test.local'), 'switching users changes auth.uid()');

select tests.clear_authentication();
select is(current_user::text, 'anon', 'cleared to anon');
select is(auth.uid(), null, 'anon has no auth.uid()');

select * from finish();
rollback;
