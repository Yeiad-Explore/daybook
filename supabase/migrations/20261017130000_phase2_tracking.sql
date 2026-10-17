-- Phase 2 (Tracking): routine_streak (RT-4, Appendix D), tracker_series (TRK-3, TRK-5), progress metrics
-- (SPC-7, Appendix C) with their guard and fallback triggers, and get_today's slots / routines / trackers
-- (Appendix A). CONSTRAINTS.md C-RT-01..03, C-TRK-02, C-SPC-04..06, C-TODAY-02. Replaces the Phase 0 stubs.

------------------------------------------------------------------------------------------------
-- routine_streak: the only implementation of the streak rule (PRD §10.7 changed 17 Oct 2026 to return jsonb).
-- A step counts on a day only if it existed then (created on or before it, not archived on or before it),
-- so adding or archiving a step never rewrites earlier days. The walk starts at the block's first day.
------------------------------------------------------------------------------------------------
drop function public.routine_streak(uuid, date);

create function public.routine_streak(p_block_id uuid, p_today date default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_block public.blocks;
  v_today date;
  v_first date;
  v_tz text;
  v_days int[];
  v_streak int;
  v_today_state text;
  v_history jsonb;
begin
  select * into v_block from public.blocks where id = p_block_id and type = 'routine';
  if not found then
    raise exception 'Routine not found.' using errcode = 'P0002';
  end if;
  v_today := coalesce(p_today, private.owner_today(v_block.owner_id));
  v_tz := coalesce((select timezone from public.profiles where id = v_block.owner_id), 'Asia/Dhaka');
  v_first := (v_block.created_at at time zone v_tz)::date;
  -- RT-2: blocks.config.days = weekdays, 0 = Sunday; missing means every day.
  v_days := case when jsonb_typeof(v_block.config -> 'days') = 'array'
                 then array(select jsonb_array_elements_text(v_block.config -> 'days')::int)
                 else array[0, 1, 2, 3, 4, 5, 6] end;

  with days as (
    select g::date as day from generate_series(greatest(v_first, v_today - 3650), v_today, interval '1 day') g
  ), per as (
    select d.day,
           extract(dow from d.day)::int = any (v_days) as scheduled,
           -- Steps required on this day: created before it, or created on it when it is today, the routine's
           -- first day, or the step was checked that day. So a step added in the evening of a past day
           -- never turns that day into a miss (C-RT-02).
           (select count(*) from public.routine_steps s
             where s.block_id = p_block_id
               and (s.created_at at time zone v_tz)::date <= d.day
               and (s.archived_at is null or (s.archived_at at time zone v_tz)::date > d.day)
               and ((s.created_at at time zone v_tz)::date < d.day or d.day = v_today or d.day = v_first
                    or exists (select 1 from public.routine_checks c where c.step_id = s.id and c.check_date = d.day))) as active,
           (select count(*) from public.routine_checks c join public.routine_steps s on s.id = c.step_id
             where c.block_id = p_block_id and c.check_date = d.day
               and (s.created_at at time zone v_tz)::date <= d.day
               and (s.archived_at is null or (s.archived_at at time zone v_tz)::date > d.day)) as done
    from days d
  ), st as (
    select day, scheduled,
           case when not scheduled then 'not_scheduled'
                when active > 0 and done = active then 'complete'
                when day = v_today then 'open'
                when done > 0 then 'partial'
                else 'missed' end as state
    from per
  )
  select
    (select state from st where day = v_today),
    -- Appendix D: scheduled days before today, newest first, until the first one that is not complete.
    (select coalesce(min(rn) filter (where state <> 'complete') - 1, count(*))
       from (select state, row_number() over (order by day desc) as rn from st where scheduled and day < v_today) x),
    (select jsonb_agg(jsonb_build_object('date', g::date, 'state', coalesce(st.state, 'not_scheduled')) order by g)
       from generate_series(v_today - 83, v_today, interval '1 day') g left join st on st.day = g::date)
    into v_today_state, v_streak, v_history;
  v_streak := coalesce(v_streak, 0) + (v_today_state = 'complete')::int;

  return jsonb_build_object(
    'streak', v_streak,
    'today_complete', coalesce(v_today_state = 'complete', false),
    'scheduled_today', coalesce(v_today_state is distinct from 'not_scheduled', false),
    'history', v_history);
end;
$$;

------------------------------------------------------------------------------------------------
-- tracker_series (TRK-3, TRK-5; C-TRK-02)
------------------------------------------------------------------------------------------------
create or replace function public.tracker_series(p_field_id uuid, p_days integer)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  f public.tracker_fields;
  v_today date;
  v_entries jsonb;
  v_latest record;
  v_start numeric;
  v_avg numeric;
  v_change numeric;
  v_status text;
  v_streak int;
  v_from date;
begin
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'Pick 7, 30 or 90 days.' using errcode = '22023';
  end if;
  select * into f from public.tracker_fields where id = p_field_id;
  if not found then
    raise exception 'Tracker field not found.' using errcode = 'P0002';
  end if;
  v_today := private.owner_today(f.owner_id);

  select coalesce(jsonb_agg(jsonb_build_object('date', entry_date, 'value', value, 'note', note) order by entry_date), '[]')
    into v_entries
  from public.tracker_entries
  where field_id = p_field_id and entry_date between v_today - (p_days - 1) and v_today;

  select entry_date, value into v_latest from public.tracker_entries
   where field_id = p_field_id and entry_date <= v_today order by entry_date desc limit 1;
  select value into v_start from public.tracker_entries
   where field_id = p_field_id and entry_date <= v_today order by entry_date asc limit 1;

  select round(avg(value), 4) into v_avg from public.tracker_entries
   where field_id = p_field_id and entry_date between v_today - 6 and v_today;

  -- Change over the last 14 entries: the latest minus the oldest of them (needs two entries).
  with last14 as (
    select entry_date, value from public.tracker_entries
     where field_id = p_field_id and entry_date <= v_today order by entry_date desc limit 14)
  select case when count(*) >= 2
              then (select value from last14 order by entry_date desc limit 1) - (select value from last14 order by entry_date asc limit 1) end
    into v_change from last14;

  v_status := case f.target_kind
    when 'at_most' then case when v_avg is null then null when v_avg <= f.target_value then 'on_target' else 'over' end
    when 'at_least' then case when v_avg is null then null when v_avg >= f.target_value then 'on_target' else 'under' end
    when 'reach' then case
      when v_latest.value is null then null
      when v_start > f.target_value then case when v_latest.value <= f.target_value then 'on_target' else 'over' end
      when v_start < f.target_value then case when v_latest.value >= f.target_value then 'on_target' else 'under' end
      else case when v_latest.value = f.target_value then 'on_target' when v_latest.value > f.target_value then 'over' else 'under' end
      end
    end;

  -- TRK-5: consecutive days on which any active field was logged; today not yet logged does not break it.
  with logged as (
    select distinct e.entry_date as d from public.tracker_entries e
    join public.tracker_fields tf on tf.id = e.field_id and tf.archived_at is null
    where e.block_id = f.block_id and e.entry_date <= v_today
  ), s as (select case when exists (select 1 from logged where d = v_today) then v_today else v_today - 1 end as start_day),
  ranked as (select d, row_number() over (order by d desc) as rn from logged, s where d <= s.start_day)
  select count(*) into v_streak from ranked, s where ranked.d = s.start_day - (ranked.rn - 1)::int;

  return jsonb_build_object(
    'field', jsonb_build_object('id', f.id, 'block_id', f.block_id, 'label', f.label, 'unit', f.unit, 'decimals', f.decimals,
                                'target_value', f.target_value, 'target_kind', f.target_kind),
    'days', p_days,
    'entries', v_entries,
    'latest', case when v_latest.value is null then null else jsonb_build_object('date', v_latest.entry_date, 'value', v_latest.value) end,
    'average_7d', v_avg,
    'change', v_change,
    'target_status', v_status,
    'logging_streak', v_streak);
end;
$$;

------------------------------------------------------------------------------------------------
-- Progress metrics (SPC-7, Appendix C)
------------------------------------------------------------------------------------------------
-- Progress for a non-`tasks` metric; null when its configuration is missing, gone or in Trash (C-SPC-04).
create function private.metric_progress(p_space public.spaces, p_today date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  cfg jsonb;
  fld public.tracker_fields;
  col public.table_columns;
  v_start numeric; v_target numeric; v_latest numeric; v_percent int; v_n int; v_opt jsonb; v_manual numeric;
begin
  begin
    if p_space.metric = 'tracker' then
      cfg := p_space.metric_config -> 'tracker';
      select f.* into fld from public.tracker_fields f
        join public.blocks b on b.id = f.block_id and b.deleted_at is null
        join public.pages pg on pg.id = b.page_id and pg.deleted_at is null
       where f.id = (cfg ->> 'field_id')::uuid and b.space_id = p_space.id;
      if not found then return null; end if;
      v_start := (cfg ->> 'start')::numeric;
      v_target := (cfg ->> 'target')::numeric;
      select value into v_latest from public.tracker_entries
       where field_id = fld.id and entry_date <= p_today order by entry_date desc limit 1;
      v_percent := case when v_latest is null then 0
                        when v_start = v_target then case when v_latest = v_target then 100 else 0 end
                        else round(100 * greatest(0, least(1, (v_start - v_latest) / (v_start - v_target)))) end;
      return jsonb_build_object('metric', 'tracker', 'percent', v_percent, 'field_id', fld.id, 'unit', fld.unit,
        'latest', v_latest, 'start', v_start, 'target', v_target,
        'label', case when v_latest is null
                      then format('No entries yet · started %s · target %s', trim_scale(v_start), trim_scale(v_target))
                      else format('%s%s now · started %s · target %s', round(v_latest, fld.decimals),
                                  coalesce(' ' || fld.unit, ''), trim_scale(v_start), trim_scale(v_target)) end);

    elsif p_space.metric = 'table_count' then
      cfg := p_space.metric_config -> 'table_count';
      select c.* into col from public.table_columns c
        join public.blocks b on b.id = c.block_id and b.deleted_at is null
        join public.pages pg on pg.id = b.page_id and pg.deleted_at is null
       where c.id = (cfg ->> 'column_id')::uuid and b.space_id = p_space.id and c.kind = 'select';
      if not found then return null; end if;
      select o into v_opt from jsonb_array_elements(col.options) o where o ->> 'id' = cfg ->> 'option_id';
      if v_opt is null then return null; end if;
      v_target := (cfg ->> 'target')::numeric;
      select count(*) into v_n from public.table_rows r
       where r.block_id = col.block_id and r.deleted_at is null and r.cells ->> col.id::text = cfg ->> 'option_id';
      return jsonb_build_object('metric', 'table_count', 'percent', round(100 * least(1, v_n / v_target)),
        'count', v_n, 'target', v_target, 'label', format('%s of %s · %s', v_n, trim_scale(v_target), v_opt ->> 'label'));

    elsif p_space.metric = 'manual' then
      v_manual := (p_space.metric_config -> 'manual' ->> 'percent')::numeric;
      if v_manual is null then return null; end if;
      return jsonb_build_object('metric', 'manual', 'percent', round(v_manual), 'label', format('Set manually: %s%%', trim_scale(round(v_manual))));
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range or division_by_zero then
    return null;
  end;
  return null;
end;
$$;

-- C-SPC-06: a metric needs a valid configuration when it is set or changed.
create function private.spaces_metric_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cfg jsonb;
  v_n int;
begin
  if new.metric is not distinct from old.metric and new.metric_config is not distinct from old.metric_config then
    return new;
  end if;
  if new.metric <> 'tasks' and new.kind <> 'goal' then
    raise exception 'Only goals have a progress metric.' using errcode = '23514';
  end if;

  if new.metric = 'tracker' then
    cfg := new.metric_config -> 'tracker';
    if jsonb_typeof(cfg) is distinct from 'object' or cfg ->> 'field_id' !~* '^[0-9a-f-]{36}$' then
      raise exception 'Pick a tracker field first.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.tracker_fields f join public.blocks b on b.id = f.block_id
                    where f.id = (cfg ->> 'field_id')::uuid and b.space_id = new.id) then
      raise exception 'That tracker field is not in this space.' using errcode = '23514';
    end if;
    if jsonb_typeof(cfg -> 'start') is distinct from 'number' or jsonb_typeof(cfg -> 'target') is distinct from 'number' then
      raise exception 'Enter a start value and a target value.' using errcode = '23514';
    end if;
  elsif new.metric = 'table_count' then
    cfg := new.metric_config -> 'table_count';
    if jsonb_typeof(cfg) is distinct from 'object' or cfg ->> 'column_id' !~* '^[0-9a-f-]{36}$' then
      raise exception 'Pick a table column first.' using errcode = '23514';
    end if;
    select count(*) into v_n from public.table_columns c join public.blocks b on b.id = c.block_id
     where c.id = (cfg ->> 'column_id')::uuid and b.space_id = new.id and c.kind = 'select'
       and exists (select 1 from jsonb_array_elements(c.options) o where o ->> 'id' = cfg ->> 'option_id');
    if v_n = 0 then
      raise exception 'Pick a select column of this space and one of its options.' using errcode = '23514';
    end if;
    if jsonb_typeof(cfg -> 'target') is distinct from 'number' or (cfg ->> 'target')::numeric < 1
       or (cfg ->> 'target')::numeric <> trunc((cfg ->> 'target')::numeric) then
      raise exception 'The target count must be a whole number, 1 or more.' using errcode = '23514';
    end if;
  elsif new.metric = 'manual' then
    if jsonb_typeof(new.metric_config -> 'manual' -> 'percent') is distinct from 'number'
       or (new.metric_config -> 'manual' ->> 'percent')::numeric not between 0 and 100 then
      raise exception 'Enter a percentage from 0 to 100.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger spaces_metric_guard before update of metric, metric_config on public.spaces
  for each row execute function private.spaces_metric_guard();

-- C-SPC-05 / SPC-7 AC2: losing the field, column or option a metric reads sets the metric back to `tasks`
-- and leaves a note for the settings screen.
create function private.metric_fallback_tracker_field()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.spaces set metric = 'tasks', metric_config = jsonb_build_object('fell_back_from', 'tracker')
   where metric = 'tracker' and metric_config -> 'tracker' ->> 'field_id' = old.id::text;
  return old;
end;
$$;
create trigger metric_fallback after delete on public.tracker_fields
  for each row execute function private.metric_fallback_tracker_field();

create function private.metric_fallback_table_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.spaces set metric = 'tasks', metric_config = jsonb_build_object('fell_back_from', 'table_count')
     where metric = 'table_count' and metric_config -> 'table_count' ->> 'column_id' = old.id::text;
    return old;
  end if;
  update public.spaces s set metric = 'tasks', metric_config = jsonb_build_object('fell_back_from', 'table_count')
   where s.metric = 'table_count' and s.metric_config -> 'table_count' ->> 'column_id' = new.id::text
     and (new.kind <> 'select'
          or not (new.options @> jsonb_build_array(jsonb_build_object('id', s.metric_config -> 'table_count' ->> 'option_id'))));
  return new;
end;
$$;
create trigger metric_fallback_delete after delete on public.table_columns
  for each row execute function private.metric_fallback_table_column();
create trigger metric_fallback_update after update of kind, options on public.table_columns
  for each row execute function private.metric_fallback_table_column();

------------------------------------------------------------------------------------------------
-- space_summary: progress per metric (SPC-7, Appendix C; C-SPC-04). Phase 1 body plus the metric branch.
------------------------------------------------------------------------------------------------
create or replace function public.space_summary(p_space_id uuid, p_today date default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_space public.spaces;
  v_today date;
  v_goal boolean;
  v_done int;
  v_total int;
  v_milestones jsonb;
  v_due_counts jsonb;
  v_progress jsonb;
begin
  select * into v_space from public.spaces where id = p_space_id;
  if not found then
    raise exception 'Space not found.' using errcode = 'P0002';
  end if;
  v_today := coalesce(p_today, private.owner_today(v_space.owner_id));
  v_goal := v_space.kind = 'goal';

  with live as (
    select t.id, t.title, t.due_date, t.done, t.is_milestone, t.depth, b.type = 'roadmap' as in_roadmap,
           not exists (select 1 from public.tasks c where c.parent_id = t.id and c.deleted_at is null) as is_leaf
    from public.tasks t
    join public.blocks b on b.id = t.block_id and b.deleted_at is null
    join public.pages p on p.id = b.page_id and p.deleted_at is null
    where t.space_id = p_space_id and t.deleted_at is null
  )
  select
    count(*) filter (where is_leaf and done),
    count(*) filter (where is_leaf),
    coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'due_date', due_date, 'done', done,
               'state', case when done then 'done' when due_date < v_today then 'late' else 'upcoming' end)
             order by due_date, title)
             filter (where due_date is not null and (is_milestone or (in_roadmap and depth = 0))), '[]'),
    coalesce((select jsonb_agg(jsonb_build_object('day', day, 'count', n) order by day)
              from (select l.due_date as day, count(*) as n from live l where l.is_leaf and l.due_date is not null group by l.due_date) c), '[]')
    into v_done, v_total, v_milestones, v_due_counts
  from live;

  if v_goal then
    if v_space.metric <> 'tasks' then
      v_progress := private.metric_progress(v_space, v_today);
    end if;
    if v_progress is null then
      v_progress := jsonb_build_object(
        'metric', 'tasks', 'done', v_done, 'total', v_total,
        'percent', case when v_total = 0 then 0 else round(100.0 * v_done / v_total)::int end,
        'label', format('%s of %s steps done', v_done, v_total),
        'fallback', v_space.metric <> 'tasks');
      if not (v_progress ->> 'fallback')::boolean then v_progress := v_progress - 'fallback'; end if;
    end if;
    -- The settings screen explains a metric that fell back after its field, column or option was deleted.
    v_progress := jsonb_strip_nulls(v_progress || jsonb_build_object('fell_back_from', v_space.metric_config ->> 'fell_back_from'));
  end if;

  return jsonb_build_object(
    'space_id', v_space.id,
    'kind', v_space.kind,
    'status', v_space.status,
    'today', v_today,
    'start_date', v_space.start_date,
    'deadline', v_space.deadline,
    'days_left', case when v_goal then v_space.deadline - v_today end,
    'elapsed', case when v_goal then
                 case when v_space.deadline = v_space.start_date then (v_today >= v_space.start_date)::int::numeric
                      else round(greatest(0, least(1, (v_today - v_space.start_date)::numeric / (v_space.deadline - v_space.start_date))), 4) end
               end,
    'progress', v_progress,
    'milestones', v_milestones,
    'due_counts', v_due_counts);
end;
$$;

------------------------------------------------------------------------------------------------
-- get_today: Phase 1 agenda plus slots, routines and trackers (Appendix A, C-TODAY-02)
------------------------------------------------------------------------------------------------
create or replace function public.get_today(p_today date default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with d as (select coalesce(p_today, private.owner_today((select auth.uid()))) as today),
  agenda as (
    select t.*, b.page_id, s.name as space_name, s.mark,
           -- RM-8: "Space · Page · Stage"; the stage is the step's depth-0 ancestor.
           concat_ws(' · ', s.name, p.title, coalesce(a3.title, a2.title, a1.title)) as source
    from public.tasks t
    join public.blocks b on b.id = t.block_id and b.deleted_at is null
    join public.pages p on p.id = b.page_id and p.deleted_at is null
    join public.spaces s on s.id = t.space_id and s.deleted_at is null and s.status = 'active'
    left join public.tasks a1 on a1.id = t.parent_id
    left join public.tasks a2 on a2.id = a1.parent_id
    left join public.tasks a3 on a3.id = a2.parent_id
    cross join d
    where t.deleted_at is null
      and t.due_date <= d.today + 7
      and not exists (select 1 from public.tasks c where c.parent_id = t.id and c.deleted_at is null)
  ),
  rows as (
    select a.*, jsonb_build_object(
             'id', a.id, 'title', a.title, 'due_date', a.due_date, 'due_time', a.due_time, 'done', a.done,
             'done_late', a.done and private.local_date(a.completed_at, a.owner_id) > a.due_date,
             'reschedule_count', a.reschedule_count, 'is_milestone', a.is_milestone, 'note', a.note,
             'parent_id', a.parent_id, 'block_id', a.block_id, 'page_id', a.page_id, 'space_id', a.space_id,
             'space_name', a.space_name, 'mark', a.mark, 'source', a.source) as j
    from agenda a
  ),
  -- Blocks that can show on Today: live block, live page, active space (TODAY-2).
  live_blocks as (
    select b.id, b.type, b.title, b.config, b.page_id, b.space_id, b.created_at, s.name as space_name, s.mark
    from public.blocks b
    join public.pages p on p.id = b.page_id and p.deleted_at is null
    join public.spaces s on s.id = b.space_id and s.deleted_at is null and s.status = 'active'
    where b.deleted_at is null
  ),
  slots as (
    select t.starts_at, jsonb_build_object(
             'id', t.id, 'title', t.title, 'starts_at', t.starts_at, 'ends_at', t.ends_at, 'task_id', t.task_id,
             'task_title', (select k.title from public.tasks k where k.id = t.task_id),
             'sync_status', t.sync_status, 'block_id', b.id, 'page_id', b.page_id, 'space_id', b.space_id,
             'space_name', b.space_name, 'mark', b.mark) as j
    from public.time_blocks t
    join live_blocks b on b.id = t.block_id
    cross join d
    where t.deleted_at is null and private.local_date(t.starts_at, t.owner_id) = d.today
  ),
  routines as (
    select b.created_at, jsonb_build_object(
             'block_id', b.id, 'page_id', b.page_id, 'space_id', b.space_id, 'title', b.title,
             'space_name', b.space_name, 'mark', b.mark,
             'streak', (rs.r ->> 'streak')::int, 'complete', (rs.r ->> 'today_complete')::boolean,
             'steps', st.steps) as j
    from live_blocks b
    cross join d
    cross join lateral (select public.routine_streak(b.id, d.today) as r) rs
    cross join lateral (
      select jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label, 'position', s.position,
                       'checked', exists (select 1 from public.routine_checks c where c.step_id = s.id and c.check_date = d.today))
                       order by s.position) as steps
      from public.routine_steps s where s.block_id = b.id and s.archived_at is null) st
    where b.type = 'routine' and st.steps is not null
      and case when jsonb_typeof(b.config -> 'days') = 'array'
               then b.config -> 'days' @> to_jsonb(extract(dow from d.today)::int) else true end
  ),
  trackers as (
    select b.created_at, jsonb_build_object(
             'block_id', b.id, 'page_id', b.page_id, 'space_id', b.space_id, 'title', b.title,
             'space_name', b.space_name, 'mark', b.mark,
             'logged', exists (select 1 from jsonb_array_elements(fl.fields) f where f -> 'today_value' <> 'null'::jsonb),
             'fields', fl.fields) as j
    from live_blocks b
    cross join d
    cross join lateral (
      select jsonb_agg(jsonb_build_object('id', f.id, 'label', f.label, 'unit', f.unit, 'decimals', f.decimals,
                       'target_value', f.target_value, 'target_kind', f.target_kind,
                       'today_value', (select e.value from public.tracker_entries e where e.field_id = f.id and e.entry_date = d.today))
                       order by f.position) as fields
      from public.tracker_fields f where f.block_id = b.id and f.archived_at is null) fl
    where b.type = 'tracker' and fl.fields is not null
  )
  select jsonb_build_object(
    'today', d.today,
    'late_count', (select count(*) from rows where not done and due_date < d.today),
    'overdue', coalesce((select jsonb_agg(j order by due_date, due_time nulls last, position) from rows
                         where not done and due_date < d.today), '[]'),
    'due_today', coalesce((select jsonb_agg(j order by done, due_time nulls last, position) from rows
                           where due_date = d.today), '[]'),
    'next_7', coalesce((select jsonb_agg(j order by due_date, due_time nulls last, position) from rows
                        where not done and due_date > d.today), '[]'),
    'slots', coalesce((select jsonb_agg(j order by starts_at) from slots), '[]'),
    'routines', coalesce((select jsonb_agg(j order by created_at) from routines), '[]'),
    'trackers', coalesce((select jsonb_agg(j order by created_at) from trackers), '[]'))
  from d
$$;

------------------------------------------------------------------------------------------------
-- Grants (public functions are never callable by anon; clients get exactly the §10.7 RPCs)
------------------------------------------------------------------------------------------------
revoke execute on function public.routine_streak(uuid, date) from public, anon;
grant execute on function public.routine_streak(uuid, date) to authenticated, service_role;
