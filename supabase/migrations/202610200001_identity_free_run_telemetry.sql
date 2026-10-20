create table public.game_run_telemetry (
  client_run_id uuid primary key,
  difficulty text not null check (difficulty in ('Piadoso', 'Normal', 'Pesadilla')),
  outcome text not null default 'in_progress'
    check (outcome in ('in_progress', 'rescued', 'jumped')),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  duration_ms bigint,
  floor_reached smallint not null default 1 check (floor_reached between 1 and 7),
  mementos smallint not null default 0 check (mementos between 0 and 6),
  check (
    (outcome = 'in_progress' and finished_at is null and duration_ms is null)
    or (
      outcome in ('rescued', 'jumped')
      and finished_at is not null
      and duration_ms between 1000 and 7200000
    )
  )
);

alter table public.game_run_telemetry enable row level security;
revoke all on table public.game_run_telemetry from public, anon, authenticated;

create index game_run_telemetry_started_at_idx
  on public.game_run_telemetry (started_at);

create or replace function public.submit_game_run_telemetry(
  p_client_run_id uuid,
  p_difficulty text,
  p_outcome text,
  p_duration_ms bigint,
  p_floor_reached smallint,
  p_mementos smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.game_run_telemetry%rowtype;
begin
  if p_client_run_id is null then
    raise exception 'client_run_id is required';
  end if;

  if p_difficulty is null
    or p_difficulty not in ('Piadoso', 'Normal', 'Pesadilla') then
    raise exception 'Invalid run difficulty';
  end if;

  if p_outcome is null
    or p_outcome not in ('in_progress', 'rescued', 'jumped') then
    raise exception 'Invalid run outcome';
  end if;

  if p_floor_reached is null or p_floor_reached not between 1 and 7 then
    raise exception 'floor_reached must be between 1 and 7';
  end if;

  if p_mementos is null or p_mementos not between 0 and 6 then
    raise exception 'mementos must be between 0 and 6';
  end if;

  if p_outcome = 'in_progress' then
    if p_duration_ms is not null then
      raise exception 'in_progress runs must have a null duration_ms';
    end if;

    insert into public.game_run_telemetry (
      client_run_id,
      difficulty,
      outcome,
      floor_reached,
      mementos
    ) values (
      p_client_run_id,
      p_difficulty,
      'in_progress',
      p_floor_reached,
      p_mementos
    )
    on conflict (client_run_id) do nothing
    returning * into v_run;

    if not found then
      select run.*
      into v_run
      from public.game_run_telemetry as run
      where run.client_run_id = p_client_run_id
      for update;

      if not found then
        raise exception 'Run telemetry disappeared during submission; retry the request';
      end if;
    end if;
  else
    if p_duration_ms is null or p_duration_ms not between 1000 and 7200000 then
      raise exception 'Terminal duration_ms must be between 1000 and 7200000';
    end if;

    select run.*
    into v_run
    from public.game_run_telemetry as run
    where run.client_run_id = p_client_run_id
    for update;

    if not found then
      raise exception 'Terminal run requires a recorded in_progress start';
    end if;
  end if;

  if v_run.difficulty is distinct from p_difficulty then
    raise exception 'Run submission conflicts with its original difficulty' using errcode = '23505';
  end if;

  if v_run.outcome = 'in_progress' then
    if p_outcome = 'in_progress' then
      if v_run.floor_reached is distinct from p_floor_reached
        or v_run.mementos is distinct from p_mementos then
        raise exception 'Conflicting in-progress run replay' using errcode = '23505';
      end if;
    else
      update public.game_run_telemetry
      set outcome = p_outcome,
          finished_at = clock_timestamp(),
          duration_ms = p_duration_ms,
          floor_reached = p_floor_reached,
          mementos = p_mementos
      where client_run_id = v_run.client_run_id
      returning * into v_run;
    end if;
  elsif v_run.outcome in ('rescued', 'jumped') then
    if p_outcome = 'in_progress' then
      null;
    elsif p_outcome = v_run.outcome
      and p_duration_ms = v_run.duration_ms
      and p_floor_reached = v_run.floor_reached
      and p_mementos = v_run.mementos then
      null;
    else
      raise exception 'Conflicting terminal run payload' using errcode = '23505';
    end if;
  end if;

  return v_run.client_run_id;
end;
$$;

revoke all on function public.submit_game_run_telemetry(uuid, text, text, bigint, smallint, smallint)
  from public, anon, authenticated;
grant execute on function public.submit_game_run_telemetry(uuid, text, text, bigint, smallint, smallint)
  to anon, authenticated;

create or replace function public.get_run_telemetry_aggregates()
returns table (
  started_count bigint,
  in_progress_count bigint,
  rescued_count bigint,
  jumped_count bigint,
  average_duration_ms bigint,
  p50_duration_ms bigint,
  p95_duration_ms bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with run_counts as (
    select
      count(*)::bigint as started_count,
      count(*) filter (where outcome = 'in_progress')::bigint as in_progress_count,
      count(*) filter (where outcome = 'rescued')::bigint as rescued_count,
      count(*) filter (where outcome = 'jumped')::bigint as jumped_count
    from public.game_run_telemetry
  ),
  duration_summary as (
    select
      coalesce(round(avg(duration_ms))::bigint, 0) as average_duration_ms,
      coalesce(round(percentile_cont(0.5) within group (order by duration_ms))::bigint, 0) as p50_duration_ms,
      coalesce(round(percentile_cont(0.95) within group (order by duration_ms))::bigint, 0) as p95_duration_ms
    from public.game_run_telemetry
    where outcome in ('rescued', 'jumped')
  )
  select * from run_counts cross join duration_summary;
$$;

revoke all on function public.get_run_telemetry_aggregates() from public, anon, authenticated;
grant execute on function public.get_run_telemetry_aggregates() to anon, authenticated;

revoke all on table
  public.player_preferences,
  public.run_records,
  public.public_rescue_entries
from public, anon, authenticated;

drop policy if exists player_preferences_owner_all on public.player_preferences;
drop policy if exists run_records_owner_delete on public.run_records;
drop policy if exists public_rescue_owner_delete on public.public_rescue_entries;

revoke all on function public.get_public_rescues() from public, anon, authenticated;
revoke all on function public.delete_my_run_data() from public, anon, authenticated;
drop function if exists public.get_public_rescues();
drop function if exists public.delete_my_run_data();
revoke all on function public.submit_run_record(uuid, text, text, bigint, smallint, smallint, text, boolean)
  from public, anon, authenticated;
drop function if exists public.submit_run_record(uuid, text, text, bigint, smallint, smallint, text, boolean);
