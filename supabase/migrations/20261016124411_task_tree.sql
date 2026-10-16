-- Phase 0 T8: roadmap tree rules (PRD §10.6 task_tree_guard, task_parent_done, task_completed_at;
-- RM-2, RM-3; DB-2 for done on parents and depth).

------------------------------------------------------------------------------------------------
-- task_tree_guard (C-TRG-04): parents only in roadmap blocks, same block, no cycles, depth <= 3.
-- depth is always derived from the parent, so a client value is ignored (DB-2).
------------------------------------------------------------------------------------------------
create function private.task_tree_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent_block uuid;
  v_parent_depth smallint;
begin
  if new.parent_id is null then
    new.depth := 0;
    return new;
  end if;

  if (select type from public.blocks where id = new.block_id) is distinct from 'roadmap' then
    raise exception 'Only roadmap steps can be broken down' using errcode = '23514';
  end if;

  select block_id, depth into v_parent_block, v_parent_depth
  from public.tasks where id = new.parent_id and owner_id = new.owner_id;
  if not found then
    raise exception 'Step % not found', new.parent_id using errcode = '23503';
  end if;
  if v_parent_block <> new.block_id then
    raise exception 'A step and its parent must be in the same roadmap' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and exists (
    with recursive ancestors as (
      select id, parent_id from public.tasks where id = new.parent_id
      union
      select t.id, t.parent_id from public.tasks t join ancestors a on t.id = a.parent_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'A step cannot sit under itself' using errcode = '23514';
  end if;

  new.depth := v_parent_depth + 1;
  if new.depth > 3 then
    raise exception 'A roadmap goes four levels deep at most' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger task_tree_guard before insert or update of parent_id, block_id, depth on public.tasks
  for each row execute function private.task_tree_guard();

-- A moved step carries its subtree: children re-derive depth (and block) from it, so a move that
-- pushes any descendant past 4 levels fails as a whole.
create function private.task_tree_cascade()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.tasks set block_id = new.block_id, depth = depth where parent_id = new.id;
  return null;
end;
$$;

-- No column list: depth is changed by task_tree_guard, not by the client's SET, and a column-list
-- trigger only fires for columns named in the statement.
create trigger task_tree_cascade after update on public.tasks
  for each row when (new.depth is distinct from old.depth or new.block_id is distinct from old.block_id)
  execute function private.task_tree_cascade();

------------------------------------------------------------------------------------------------
-- task_completed_at (C-TRG-08) and DB-2 for parents: completed_at follows done; a step with live
-- sub-steps cannot be checked or unchecked by the client (RM-3).
------------------------------------------------------------------------------------------------
create function private.task_done()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.done is distinct from old.done and private.is_client()
     and exists (select 1 from public.tasks where parent_id = new.id and deleted_at is null) then
    raise exception 'A step with sub-steps is done when all of them are done' using errcode = '42501';
  end if;
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.completed_at := now();
  elsif not new.done then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger task_done before insert or update of done on public.tasks
  for each row execute function private.task_done();

------------------------------------------------------------------------------------------------
-- task_parent_done (C-TRG-07): after any change, a parent is done exactly when all its live
-- children are done; the parent's own update recurses up the chain. A parent left with no live
-- children keeps its state (it is a leaf again). Security definer: Daybook's write, not the client's.
------------------------------------------------------------------------------------------------
create function private.task_parent_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent uuid;
  v_done boolean;
begin
  foreach v_parent in array array[
    case when tg_op <> 'DELETE' then new.parent_id end,
    case when tg_op <> 'INSERT' then old.parent_id end
  ] loop
    continue when v_parent is null;
    select bool_and(done) into v_done from public.tasks where parent_id = v_parent and deleted_at is null;
    if v_done is not null then
      update public.tasks set done = v_done where id = v_parent and done is distinct from v_done;
    end if;
  end loop;
  return null;
end;
$$;

create trigger task_parent_done after insert or delete or update of done, parent_id, deleted_at on public.tasks
  for each row execute function private.task_parent_done();
