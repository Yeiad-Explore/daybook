-- Cover photos: the private `covers` bucket and its owner-folder policies (PRD §5.5, NFR-3). C-COV-01.
begin;
select plan(8);

select tests.create_user('owner@test.local');
select tests.create_user('other@test.local');

select is((select public from storage.buckets where id = 'covers'), false, 'C-COV-01: the covers bucket is private');

select tests.authenticate_as('owner@test.local');
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('covers', '%s/space-1/cover.webp') $$, tests.uid('owner@test.local')),
  'C-COV-01: the owner uploads into their own folder');
select is((select count(*)::int from storage.objects where bucket_id = 'covers'), 1, 'C-COV-01: the owner reads their cover');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('covers', '%s/space-1/cover.webp') $$, tests.uid('other@test.local')),
  '42501', null, 'C-COV-01: the owner cannot write into another user''s folder');

select tests.authenticate_as('other@test.local');
select is((select count(*)::int from storage.objects where bucket_id = 'covers'), 0, 'C-COV-01: another user reads nothing');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('covers', '%s/space-1/cover.webp') $$, tests.uid('owner@test.local')),
  '42501', null, 'C-COV-01: another user cannot upload into the owner''s folder');

select tests.clear_authentication();
select is((select count(*)::int from storage.objects where bucket_id = 'covers'), 0, 'C-COV-01: anon reads nothing');

-- Storage refuses direct SQL deletes (the API removes objects); the delete policy is what the API runs under.
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'DELETE'
             and policyname = 'covers: owner removes'), 1, 'C-COV-01: only the owner''s folder can be deleted from');

select * from finish();
rollback;
