-- PG AC ("opening a space returns to the page last opened in that space"): one atomic merge into
-- profiles.last_page_by_space, so two quick navigations cannot overwrite each other's entry (a
-- read-modify-write from the browser can). Only the caller's own profile; only a live page of theirs.
create function public.remember_page(p_space_id uuid, p_page_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.profiles
  set last_page_by_space = last_page_by_space || jsonb_build_object(p_space_id::text, p_page_id)
  where id = (select auth.uid())
    and exists (select 1 from public.pages where id = p_page_id and space_id = p_space_id and deleted_at is null)
$$;

revoke execute on function public.remember_page(uuid, uuid) from public, anon;
grant execute on function public.remember_page(uuid, uuid) to authenticated, service_role;
