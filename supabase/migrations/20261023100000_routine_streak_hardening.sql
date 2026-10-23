-- Phase 2 review fixes for routine_streak (RT-2, RT-4, Appendix D):
--  * a config.days with non-weekday entries no longer raises (it made get_today, and so Today, fail);
--  * an empty or unusable config.days means every day, as the UI reads it;
--  * a today before the routine's first day returns streak 0, never null.
-- create or replace keeps the existing grants.

create or replace function public.routine_streak(p_block_id uuid, p_today date default null)
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
  -- Only 0..6 count; anything else in a hand-written config is ignored, and no usable day means every day
  -- (the same reading the UI uses), so a bad config can never make Today fail.
  v_days := case when jsonb_typeof(v_block.config -> 'days') = 'array'
                 then array(select e::int from jsonb_array_elements_text(v_block.config -> 'days') e where e ~ '^[0-6]$')
                 else array[]::int[] end;
  if coalesce(cardinality(v_days), 0) = 0 then
    v_days := array[0, 1, 2, 3, 4, 5, 6];
  end if;

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
  v_streak := coalesce(v_streak, 0) + coalesce((v_today_state = 'complete')::int, 0);

  return jsonb_build_object(
    'streak', v_streak,
    'today_complete', coalesce(v_today_state = 'complete', false),
    'scheduled_today', coalesce(v_today_state is distinct from 'not_scheduled', false),
    'history', v_history);
end;
$$;
