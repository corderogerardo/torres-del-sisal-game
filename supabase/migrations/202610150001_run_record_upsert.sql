-- Duplicate preflight: refuse global idempotency if historical records collide.
do $$
begin
  if exists (
    select r.client_run_id
    from public.run_records as r
    group by r.client_run_id
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce global run_records.client_run_id uniqueness: duplicate client_run_id values exist';
  end if;
end;
$$;

create unique index run_records_client_run_id_global_uidx
  on public.run_records (client_run_id);

create or replace function public.submit_run_record(
  p_client_run_id uuid,
  p_difficulty text,
  p_outcome text,
  p_duration_ms bigint,
  p_floor_reached smallint,
  p_mementos smallint,
  p_display_alias text default null,
  p_publish_rescue boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_preferences public.player_preferences%rowtype;
  v_run public.run_records%rowtype;
  v_display_alias text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

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
  elsif p_duration_ms is null or p_duration_ms not between 1000 and 7200000 then
    raise exception 'Terminal duration_ms must be between 1000 and 7200000';
  end if;

  select p.*
  into v_preferences
  from public.player_preferences as p
  where p.user_id = v_user_id
    and (p.stats_opt_in or p.rescue_opt_in)
  for share;

  if not found then
    raise exception 'Run telemetry requires an opted-in player_preferences row' using errcode = '42501';
  end if;

  if p_outcome = 'in_progress' then
    insert into public.run_records (
      user_id,
      client_run_id,
      difficulty,
      outcome,
      duration_ms,
      floor_reached,
      mementos
    ) values (
      v_user_id,
      p_client_run_id,
      p_difficulty,
      'in_progress',
      null,
      p_floor_reached,
      p_mementos
    )
    on conflict (client_run_id) do nothing
    returning * into v_run;

    if not found then
      select r.*
      into v_run
      from public.run_records as r
      where r.client_run_id = p_client_run_id
      for update;

      if not found then
        raise exception 'Run record disappeared during submission; retry the request';
      end if;
    end if;
  else
    select r.*
    into v_run
    from public.run_records as r
    where r.client_run_id = p_client_run_id
    for update;

    if not found then
      raise exception 'Terminal run requires a recorded in_progress start';
    end if;
  end if;

  -- The private random client_run_id is the outbox capability for a single run.
  -- Anonymous Auth is session-only, so a durable retry may arrive under a new user_id.
  -- Never transfer the stored owner; only complete this exact in-progress run.
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
      update public.run_records
      set outcome = p_outcome,
          duration_ms = p_duration_ms,
          floor_reached = p_floor_reached,
          mementos = p_mementos
      where id = v_run.id
      returning * into v_run;
    end if;
  elsif v_run.outcome in ('rescued', 'jumped') then
    if p_outcome = 'in_progress' then
      -- A delayed start replay must never overwrite a terminal run.
      null;
    elsif p_outcome = v_run.outcome
      and p_duration_ms = v_run.duration_ms
      and p_floor_reached = v_run.floor_reached
      and p_mementos = v_run.mementos then
      -- Exact terminal replay: return the original row without changing it.
      null;
    else
      raise exception 'Conflicting terminal run payload' using errcode = '23505';
    end if;
  end if;

  v_display_alias := pg_catalog.btrim(p_display_alias);
  if v_run.outcome = 'rescued'
    and p_outcome = 'rescued'
    and p_publish_rescue
    and v_preferences.rescue_opt_in
    and v_display_alias is not null
    and pg_catalog.char_length(v_display_alias) between 1 and 24
    and v_display_alias ~ '^[A-Za-z0-9 _-]+$' then
    insert into public.public_rescue_entries (
      run_record_id,
      owner_id,
      display_alias,
      difficulty,
      duration_ms,
      mementos
    ) values (
      v_run.id,
      v_run.user_id,
      v_display_alias,
      v_run.difficulty,
      v_run.duration_ms,
      v_run.mementos
    )
    on conflict (run_record_id) do nothing;
  end if;

  return v_run.id;
end;
$$;

revoke all on function public.submit_run_record(uuid, text, text, bigint, smallint, smallint, text, boolean)
  from public, anon, authenticated;
grant execute on function public.submit_run_record(uuid, text, text, bigint, smallint, smallint, text, boolean)
  to authenticated;
