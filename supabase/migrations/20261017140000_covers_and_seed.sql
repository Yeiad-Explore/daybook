-- Phase 2: cover photos bucket (PRD §5.5, C-COV-01) and the §12 seed (C-SEED-01).

------------------------------------------------------------------------------------------------
-- Covers: private bucket, one folder per owner (<owner_id>/<space_id>/cover.webp)
------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', false, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "covers: owner reads" on storage.objects for select to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "covers: owner uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "covers: owner replaces" on storage.objects for update to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "covers: owner removes" on storage.objects for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

------------------------------------------------------------------------------------------------
-- Seed helpers (private; used only by seed_owner)
------------------------------------------------------------------------------------------------
-- A space already has its "Overview" page (SPC-1 AC2); the first seeded page takes it over.
create function private.seed_page(p_owner uuid, p_space uuid, p_title text, p_pos numeric)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_pos = 1 then
    update public.pages set title = p_title where space_id = p_space returning id into v_id;
  else
    insert into public.pages (owner_id, space_id, title, position) values (p_owner, p_space, p_title, p_pos) returning id into v_id;
  end if;
  return v_id;
end;
$$;

create function private.seed_block(p_owner uuid, p_page uuid, p_type public.block_type, p_title text, p_pos numeric,
                                   p_span integer, p_config jsonb default '{}', p_created timestamptz default now())
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.blocks (owner_id, page_id, space_id, type, title, position, span, config, created_at)
  values (p_owner, p_page, (select space_id from public.pages where id = p_page), p_type, p_title, p_pos, p_span, p_config, p_created)
  returning id into v_id;
  if p_type = 'notes' then
    insert into public.notes (owner_id, block_id) values (p_owner, v_id);
  end if;
  return v_id;
end;
$$;

create function private.seed_columns(p_owner uuid, p_block uuid, p_defs jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  d jsonb;
  v_id uuid;
  v_ids jsonb := '{}';
  i int := 0;
begin
  for d in select * from jsonb_array_elements(p_defs) loop
    i := i + 1;
    insert into public.table_columns (owner_id, block_id, name, kind, options, signed, summary, position)
    values (p_owner, p_block, d ->> 'name', (d ->> 'kind')::public.column_kind, coalesce(d -> 'options', '[]'),
            coalesce((d ->> 'signed')::boolean, false), coalesce(d ->> 'summary', 'none')::public.summary_kind, i)
    returning id into v_id;
    v_ids := v_ids || jsonb_build_object(d ->> 'name', v_id);
  end loop;
  return v_ids;
end;
$$;

-- p_cells uses column names; they become column ids here.
create function private.seed_row(p_owner uuid, p_block uuid, p_cols jsonb, p_cells jsonb, p_pos numeric)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.table_rows (owner_id, block_id, cells, position)
  values (p_owner, p_block, (select coalesce(jsonb_object_agg(p_cols ->> k, v), '{}') from jsonb_each(p_cells) e(k, v)), p_pos);
end;
$$;

create function private.seed_task(p_owner uuid, p_block uuid, p_parent uuid, p_title text, p_due date, p_pos numeric,
                                  p_milestone boolean default false)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.tasks (owner_id, block_id, parent_id, title, due_date, position, is_milestone)
  values (p_owner, p_block, p_parent, p_title, p_due, p_pos, p_milestone) returning id into v_id;
  return v_id;
end;
$$;

create function private.seed_slot(p_owner uuid, p_block uuid, p_title text, p_day date, p_start time, p_end time)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_tz text := coalesce((select timezone from public.profiles where id = p_owner), 'Asia/Dhaka');
begin
  insert into public.time_blocks (owner_id, block_id, title, starts_at, ends_at)
  values (p_owner, p_block, p_title, (p_day + p_start) at time zone v_tz, (p_day + p_end) at time zone v_tz);
end;
$$;

------------------------------------------------------------------------------------------------
-- seed_owner: PRD §12. p_examples adds the dev demo data (late tasks, entries, rows, streaks).
-- Called by `pnpm seed` with the service role; refuses an owner who already has spaces.
------------------------------------------------------------------------------------------------
create function public.seed_owner(p_owner uuid, p_examples boolean default false, p_today date default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_today date := coalesce(p_today, private.local_date(now(), p_owner));
  v_old timestamptz := ((coalesce(p_today, private.local_date(now(), p_owner)) - 30) + time '08:00') at time zone
                       coalesce((select timezone from public.profiles where id = p_owner), 'Asia/Dhaka');
  v_ids jsonb := '{}';
  v_health uuid; v_ai uuid; v_agency uuid; v_finance uuid; v_skin uuid; v_personal uuid;
  v_page uuid; v_blk uuid; v_blk2 uuid; v_cols jsonb; v_field uuid; v_cal uuid;
  v_train uuid; v_road uuid; v_mkt uuid; v_stage uuid;
  v_prev date; v_stage_due date; v_n int; v_i int; v_step text; v_morning uuid; v_night uuid;
  stage record;
  d int;
begin
  if not exists (select 1 from public.profiles where id = p_owner) then
    raise exception 'No such owner.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.spaces where owner_id = p_owner) then
    raise exception 'This owner already has spaces.' using errcode = '55000';
  end if;

  -- Spaces (a trigger gives each its first page).
  insert into public.spaces (owner_id, kind, name, mark, end_goal, start_date, deadline, position)
  values (p_owner, 'goal', 'Health', 'moss', 'Reach 72 kg and run a 5K without stopping', '2026-09-01', '2027-01-31', 1) returning id into v_health;
  insert into public.spaces (owner_id, kind, name, mark, end_goal, start_date, deadline, position)
  values (p_owner, 'goal', 'AI Engineering', 'slate', 'Finish the AI engineering roadmap and ship one real AI project', '2026-10-01', '2027-04-30', 2) returning id into v_ai;
  insert into public.spaces (owner_id, kind, name, mark, end_goal, start_date, deadline, position)
  values (p_owner, 'goal', 'AI Agency', 'ochre', 'Grow to 5 retainer clients', '2026-08-15', '2027-03-31', 3) returning id into v_agency;
  insert into public.spaces (owner_id, kind, name, mark, description, position)
  values (p_owner, 'area', 'Finance', 'teal', 'Money in, money out, month by month.', 1) returning id into v_finance;
  insert into public.spaces (owner_id, kind, name, mark, description, position)
  values (p_owner, 'area', 'Skincare', 'clay', 'Morning and night routines.', 2) returning id into v_skin;
  insert into public.spaces (owner_id, kind, name, mark, description, position)
  values (p_owner, 'area', 'Personal', 'graphite', 'Errands, paperwork and a journal.', 3) returning id into v_personal;
  v_ids := jsonb_build_object('Health', v_health, 'AI Engineering', v_ai, 'AI Agency', v_agency,
                              'Finance', v_finance, 'Skincare', v_skin, 'Personal', v_personal);

  ------------------------------------------------------------------ Health
  v_page := private.seed_page(p_owner, v_health, 'Daily Tracker', 1);
  v_blk := private.seed_block(p_owner, v_page, 'tracker', 'Body & food', 1, 12, '{"range_days":30}');
  insert into public.tracker_fields (owner_id, block_id, label, unit, decimals, target_value, target_kind, position)
  values (p_owner, v_blk, 'Weight', 'kg', 1, 72, 'reach', 1) returning id into v_field;
  insert into public.tracker_fields (owner_id, block_id, label, unit, decimals, target_value, target_kind, position)
  values (p_owner, v_blk, 'Calories', 'kcal', 0, 2000, 'at_most', 2) returning id into v_cal;
  update public.spaces set metric = 'tracker',
    metric_config = jsonb_build_object('tracker', jsonb_build_object('field_id', v_field, 'start', 78.4, 'target', 72))
   where id = v_health;

  v_blk2 := private.seed_block(p_owner, v_page, 'table', 'What I ate', 2, 12);
  v_cols := private.seed_columns(p_owner, v_blk2, jsonb_build_array(
    jsonb_build_object('name', 'Date', 'kind', 'date'),
    jsonb_build_object('name', 'Meal', 'kind', 'select', 'options', jsonb_build_array(
      jsonb_build_object('id', 'opt_breakfast', 'label', 'Breakfast', 'tone', 'neutral'),
      jsonb_build_object('id', 'opt_lunch', 'label', 'Lunch', 'tone', 'neutral'),
      jsonb_build_object('id', 'opt_snack', 'label', 'Snack', 'tone', 'neutral'),
      jsonb_build_object('id', 'opt_dinner', 'label', 'Dinner', 'tone', 'neutral'))),
    jsonb_build_object('name', 'Food', 'kind', 'text'),
    jsonb_build_object('name', 'Calories', 'kind', 'number', 'summary', 'sum')));
  update public.blocks set config = jsonb_build_object('view', 'table',
      'filters', jsonb_build_array(jsonb_build_object('column_id', v_cols ->> 'Date', 'op', 'is_today')),
      'sort', jsonb_build_object('column_id', v_cols ->> 'Date', 'dir', 'asc'))
   where id = v_blk2;

  v_page := private.seed_page(p_owner, v_health, 'Workouts', 2);
  v_train := private.seed_block(p_owner, v_page, 'todo', 'Training plan', 1, 6);
  perform private.seed_task(p_owner, v_train, null, '76 kg', '2026-11-15', 1, true);
  perform private.seed_task(p_owner, v_train, null, 'First 5K run', '2026-12-20', 2, true);
  perform private.seed_task(p_owner, v_train, null, '72 kg', '2027-01-31', 3, true);
  v_blk := private.seed_block(p_owner, v_page, 'timeblock', 'Workout slots', 2, 6, '{"auto_sync":true,"show_past":false}');

  if p_examples then
    perform private.seed_task(p_owner, v_train, null, 'Buy running shoes', v_today - 2, 4);
    perform private.seed_slot(p_owner, v_blk, 'Morning run', v_today, '06:30', '07:15');
    for d in 1..13 loop
      insert into public.tracker_entries (owner_id, field_id, block_id, entry_date, value)
      select p_owner, v_field, f.block_id, v_today - d, round(78.4 - (13 - d) * 0.1, 1) from public.tracker_fields f where f.id = v_field;
      insert into public.tracker_entries (owner_id, field_id, block_id, entry_date, value)
      select p_owner, v_cal, f.block_id, v_today - d, 1850 + ((d * 137) % 400) from public.tracker_fields f where f.id = v_cal;
    end loop;
    perform private.seed_row(p_owner, v_blk2, v_cols, jsonb_build_object('Date', v_today, 'Meal', 'opt_breakfast', 'Food', 'Eggs and toast', 'Calories', 420), 1);
    perform private.seed_row(p_owner, v_blk2, v_cols, jsonb_build_object('Date', v_today, 'Meal', 'opt_lunch', 'Food', 'Rice, lentils and fish', 'Calories', 640), 2);
    perform private.seed_row(p_owner, v_blk2, v_cols, jsonb_build_object('Date', v_today, 'Meal', 'opt_snack', 'Food', 'Banana', 'Calories', 110), 3);
    perform private.seed_row(p_owner, v_blk2, v_cols, jsonb_build_object('Date', v_today - 1, 'Meal', 'opt_dinner', 'Food', 'Chicken curry and rice', 'Calories', 720), 4);
  end if;

  ------------------------------------------------------------------ AI Engineering
  v_page := private.seed_page(p_owner, v_ai, 'Roadmap', 1);
  v_road := private.seed_block(p_owner, v_page, 'roadmap', 'AI Engineering roadmap', 1, 12);
  v_blk := private.seed_block(p_owner, v_page, 'timeblock', 'Study sessions', 2, 6, '{"auto_sync":true,"show_past":false}');
  v_prev := v_today;
  v_i := 0;
  for stage in
    select * from (values
      ('Learn Python', date '2026-11-15', array['Install Python & VS Code', 'Operators and variables', 'Loops: for and while', 'Functions', 'Lists and dictionaries', 'OOP basics', 'Mini project']),
      ('Learn databases', date '2026-12-20', array['SQL basics', 'PostgreSQL', 'Supabase with Python']),
      ('Learn machine learning', date '2027-02-28', array['NumPy & Pandas', 'Supervised learning', 'Model evaluation']),
      ('Build LLM apps', date '2027-04-25', array['Prompting & APIs', 'RAG', 'Agents'])
    ) s(title, due, steps)
  loop
    v_i := v_i + 1;
    v_stage := private.seed_task(p_owner, v_road, null, stage.title, stage.due, v_i);
    v_n := array_length(stage.steps, 1);
    for d in 1..v_n loop
      -- Steps spread from the previous milestone (or today) up to just before the stage deadline.
      perform private.seed_task(p_owner, v_road, v_stage, stage.steps[d],
        least(stage.due, v_prev + ((stage.due - v_prev) * (d - 1) / v_n)), d);
    end loop;
    v_prev := greatest(stage.due, v_prev);
  end loop;
  if p_examples then
    perform private.seed_slot(p_owner, v_blk, 'Python: loops', v_today, '20:00', '21:30');
  end if;
  v_page := private.seed_page(p_owner, v_ai, 'Notes', 2);
  perform private.seed_block(p_owner, v_page, 'notes', 'Python notes', 1, 12);

  ------------------------------------------------------------------ AI Agency
  v_page := private.seed_page(p_owner, v_agency, 'Clients', 1);
  v_blk := private.seed_block(p_owner, v_page, 'table', 'Client pipeline', 1, 12);
  v_cols := private.seed_columns(p_owner, v_blk, jsonb_build_array(
    jsonb_build_object('name', 'Client', 'kind', 'text'),
    jsonb_build_object('name', 'Status', 'kind', 'select', 'options', jsonb_build_array(
      jsonb_build_object('id', 'opt_lead', 'label', 'Lead', 'tone', 'early'),
      jsonb_build_object('id', 'opt_contacted', 'label', 'Contacted', 'tone', 'early'),
      jsonb_build_object('id', 'opt_proposal', 'label', 'Proposal sent', 'tone', 'neutral'),
      jsonb_build_object('id', 'opt_client', 'label', 'Client', 'tone', 'active'),
      jsonb_build_object('id', 'opt_lost', 'label', 'Lost', 'tone', 'closed'))),
    jsonb_build_object('name', 'Value Tk/mo', 'kind', 'money', 'summary', 'sum'),
    jsonb_build_object('name', 'Next step', 'kind', 'text'),
    jsonb_build_object('name', 'Next step date', 'kind', 'date')));
  update public.blocks set config = jsonb_build_object('view', 'table', 'board_column_id', v_cols ->> 'Status') where id = v_blk;
  update public.spaces set metric = 'table_count',
    metric_config = jsonb_build_object('table_count', jsonb_build_object('column_id', v_cols ->> 'Status', 'option_id', 'opt_client', 'target', 5))
   where id = v_agency;
  if p_examples then
    perform private.seed_row(p_owner, v_blk, v_cols, jsonb_build_object('Client', 'Bayside Café', 'Status', 'opt_proposal', 'Value Tk/mo', 20000, 'Next step', 'Follow up on the proposal', 'Next step date', v_today - 1), 1);
    perform private.seed_row(p_owner, v_blk, v_cols, jsonb_build_object('Client', 'Northwind Studio', 'Status', 'opt_client', 'Value Tk/mo', 25000, 'Next step', 'Monthly report', 'Next step date', v_today + 12), 2);
    perform private.seed_row(p_owner, v_blk, v_cols, jsonb_build_object('Client', 'Harbor Dental', 'Status', 'opt_client', 'Value Tk/mo', 18000, 'Next step', 'Review chatbot answers', 'Next step date', v_today + 6), 3);
    perform private.seed_row(p_owner, v_blk, v_cols, jsonb_build_object('Client', 'Lumen Foods', 'Status', 'opt_lead', 'Next step', 'Send intro email'), 4);
    perform private.seed_row(p_owner, v_blk, v_cols, jsonb_build_object('Client', 'Orchid Spa', 'Status', 'opt_contacted', 'Next step', 'Book a demo call', 'Next step date', v_today + 3), 5);
  end if;

  v_page := private.seed_page(p_owner, v_agency, 'Products', 2);
  v_blk := private.seed_block(p_owner, v_page, 'table', 'What I sell', 1, 12);
  v_cols := private.seed_columns(p_owner, v_blk, jsonb_build_array(
    jsonb_build_object('name', 'Product', 'kind', 'text'),
    jsonb_build_object('name', 'What it does', 'kind', 'text'),
    jsonb_build_object('name', 'Price Tk', 'kind', 'money'),
    jsonb_build_object('name', 'Billing', 'kind', 'select', 'options', jsonb_build_array(
      jsonb_build_object('id', 'opt_once', 'label', 'One-time', 'tone', 'neutral'),
      jsonb_build_object('id', 'opt_monthly', 'label', 'Monthly', 'tone', 'active')))));
  if p_examples then
    perform private.seed_row(p_owner, v_blk, v_cols, jsonb_build_object('Product', 'Support chatbot', 'What it does', 'Answers customer questions around the clock', 'Price Tk', 15000, 'Billing', 'opt_monthly'), 1);
    perform private.seed_row(p_owner, v_blk, v_cols, jsonb_build_object('Product', 'Workflow setup', 'What it does', 'Connects the tools a team already uses', 'Price Tk', 40000, 'Billing', 'opt_once'), 2);
  end if;

  v_page := private.seed_page(p_owner, v_agency, 'Marketing', 3);
  v_mkt := private.seed_block(p_owner, v_page, 'todo', 'Marketing tasks', 1, 6);
  v_blk := private.seed_block(p_owner, v_page, 'timeblock', 'Marketing time', 2, 6, '{"auto_sync":true,"show_past":false}');
  perform private.seed_block(p_owner, v_page, 'notes', 'Content ideas', 3, 12);
  if p_examples then
    perform private.seed_task(p_owner, v_mkt, null, 'Send proposal follow-up to Bayside Café', v_today - 1, 1);
    perform private.seed_slot(p_owner, v_blk, 'Outreach emails', v_today, '15:00', '16:00');
  end if;

  ------------------------------------------------------------------ Finance
  v_page := private.seed_page(p_owner, v_finance, 'Ledger', 1);
  v_blk := private.seed_block(p_owner, v_page, 'table', 'Income and expenses', 1, 12);
  v_cols := private.seed_columns(p_owner, v_blk, jsonb_build_array(
    jsonb_build_object('name', 'Date', 'kind', 'date'),
    jsonb_build_object('name', 'Item', 'kind', 'text'),
    jsonb_build_object('name', 'Category', 'kind', 'select', 'options', jsonb_build_array(
      jsonb_build_object('id', 'opt_income', 'label', 'Agency income', 'tone', 'active'),
      jsonb_build_object('id', 'opt_home', 'label', 'Home', 'tone', 'neutral'),
      jsonb_build_object('id', 'opt_food', 'label', 'Food', 'tone', 'neutral'),
      jsonb_build_object('id', 'opt_bills', 'label', 'Bills', 'tone', 'neutral'),
      jsonb_build_object('id', 'opt_learning', 'label', 'Learning', 'tone', 'neutral'),
      jsonb_build_object('id', 'opt_health', 'label', 'Health', 'tone', 'neutral'),
      jsonb_build_object('id', 'opt_personal', 'label', 'Personal', 'tone', 'neutral'),
      jsonb_build_object('id', 'opt_other', 'label', 'Other', 'tone', 'neutral'))),
    jsonb_build_object('name', 'Amount Tk', 'kind', 'money', 'signed', true, 'summary', 'sum')));
  update public.blocks set config = jsonb_build_object('view', 'table', 'group_by_month_column_id', v_cols ->> 'Date',
      'sort', jsonb_build_object('column_id', v_cols ->> 'Date', 'dir', 'desc'))
   where id = v_blk;
  if p_examples then
    for d in 0..6 loop
      perform private.seed_row(p_owner, v_blk, v_cols, jsonb_build_object('Date', date_trunc('month', v_today)::date + d, 'Item',
        (array['Retainer: Northwind Studio', 'Rent', 'Groceries', 'Internet bill', 'Online course', 'Retainer: Harbor Dental', 'Pharmacy'])[d + 1],
        'Category', (array['opt_income', 'opt_home', 'opt_food', 'opt_bills', 'opt_learning', 'opt_income', 'opt_health'])[d + 1],
        'Amount Tk', (array[25000, -12000, -3400, -1200, -2500, 18000, -850])[d + 1]), d + 1);
      perform private.seed_row(p_owner, v_blk, v_cols, jsonb_build_object('Date', (date_trunc('month', v_today) - interval '1 month')::date + d + 2, 'Item',
        (array['Retainer: Northwind Studio', 'Rent', 'Groceries', 'Electricity bill', 'Books', 'Retainer: Harbor Dental', 'Dinner out'])[d + 1],
        'Category', (array['opt_income', 'opt_home', 'opt_food', 'opt_bills', 'opt_learning', 'opt_income', 'opt_personal'])[d + 1],
        'Amount Tk', (array[25000, -12000, -3900, -1650, -1800, 18000, -1400])[d + 1]), 20 + d);
    end loop;
  end if;

  ------------------------------------------------------------------ Skincare
  v_page := private.seed_page(p_owner, v_skin, 'Routine', 1);
  v_morning := private.seed_block(p_owner, v_page, 'routine', 'Morning', 1, 6, '{"days":[0,1,2,3,4,5,6]}', case when p_examples then v_old else now() end);
  v_night := private.seed_block(p_owner, v_page, 'routine', 'Night', 2, 6, '{"days":[0,1,2,3,4,5,6]}', case when p_examples then v_old else now() end);
  v_i := 0;
  foreach v_step in array array['Cleanser', 'Vitamin C serum', 'Moisturizer', 'Sunscreen SPF 50'] loop
    v_i := v_i + 1;
    insert into public.routine_steps (owner_id, block_id, label, position, created_at)
    values (p_owner, v_morning, v_step, v_i, case when p_examples then v_old else now() end);
  end loop;
  v_i := 0;
  foreach v_step in array array['Cleanser', 'Retinol', 'Moisturizer'] loop
    v_i := v_i + 1;
    insert into public.routine_steps (owner_id, block_id, label, position, created_at)
    values (p_owner, v_night, v_step, v_i, case when p_examples then v_old else now() end);
  end loop;
  if p_examples then
    -- Morning: complete on each of the last 12 days, 2 of 4 today (PRD RT-4 AC1). Night: the last 5 days.
    insert into public.routine_checks (owner_id, step_id, block_id, check_date)
    select p_owner, s.id, s.block_id, v_today - k from public.routine_steps s, generate_series(1, 12) k where s.block_id = v_morning;
    insert into public.routine_checks (owner_id, step_id, block_id, check_date)
    select p_owner, s.id, s.block_id, v_today from public.routine_steps s where s.block_id = v_morning and s.position <= 2;
    insert into public.routine_checks (owner_id, step_id, block_id, check_date)
    select p_owner, s.id, s.block_id, v_today - k from public.routine_steps s, generate_series(1, 5) k where s.block_id = v_night;
  end if;

  ------------------------------------------------------------------ Personal
  v_page := private.seed_page(p_owner, v_personal, 'Life admin', 1);
  v_blk := private.seed_block(p_owner, v_page, 'todo', 'Errands', 1, 6);
  if p_examples then
    perform private.seed_task(p_owner, v_blk, null, 'Pay the electricity bill', v_today + 3, 1);
    perform private.seed_task(p_owner, v_blk, null, 'Renew the passport', null, 2);
  end if;
  v_page := private.seed_page(p_owner, v_personal, 'Journal', 2);
  perform private.seed_block(p_owner, v_page, 'notes', 'Journal', 1, 12);

  return v_ids;
end;
$$;

revoke execute on function public.seed_owner(uuid, boolean, date) from public, anon, authenticated;
grant execute on function public.seed_owner(uuid, boolean, date) to service_role;
