create table public.player_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stats_opt_in boolean not null default false,
  rescue_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.run_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_run_id uuid not null,
  difficulty text not null check (difficulty in ('Piadoso', 'Normal', 'Pesadilla')),
  outcome text not null default 'in_progress'
    check (outcome in ('in_progress', 'rescued', 'jumped')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms bigint,
  floor_reached smallint not null default 1 check (floor_reached between 1 and 7),
  mementos smallint not null default 0 check (mementos between 0 and 6),
  unique (user_id, client_run_id),
  unique (id, user_id),
  check (
    (outcome = 'in_progress' and ended_at is null and duration_ms is null)
    or
    (outcome in ('rescued', 'jumped') and ended_at is not null
      and duration_ms is not null and duration_ms between 1000 and 7200000
      and ended_at >= started_at)
  )
);

create table public.public_rescue_entries (
  id uuid primary key default gen_random_uuid(),
  run_record_id uuid not null unique,
  owner_id uuid not null references auth.users (id) on delete cascade,
  display_alias text not null
    check (
      char_length(display_alias) between 1 and 24
      and btrim(display_alias) <> ''
      and display_alias ~ '^[A-Za-z0-9 _-]+$'
    ),
  difficulty text not null check (difficulty in ('Piadoso', 'Normal', 'Pesadilla')),
  duration_ms bigint not null check (duration_ms between 1000 and 7200000),
  mementos smallint not null check (mementos between 0 and 6),
  created_at timestamptz not null default now(),
  foreign key (run_record_id, owner_id)
    references public.run_records (id, user_id) on delete cascade
);

create index run_records_user_id_idx on public.run_records (user_id);
create index run_records_user_outcome_idx on public.run_records (user_id, outcome);
create index public_rescue_entries_owner_id_idx on public.public_rescue_entries (owner_id);
create index public_rescue_entries_leaderboard_idx
  on public.public_rescue_entries (difficulty, duration_ms, created_at);

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create or replace function app_private.guard_run_record_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.outcome in ('rescued', 'jumped') then
      new.ended_at := clock_timestamp();
    end if;
    return new;
  end if;

  if old.outcome <> 'in_progress' then
    raise exception 'Terminal run records are immutable';
  end if;

  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.client_run_id is distinct from old.client_run_id
    or new.difficulty is distinct from old.difficulty
    or new.started_at is distinct from old.started_at then
    raise exception 'Run identity and start fields are immutable';
  end if;

  if new.outcome not in ('rescued', 'jumped') then
    raise exception 'A run can transition only to a terminal outcome';
  end if;

  new.ended_at := clock_timestamp();
  return new;
end;
$$;

create trigger run_records_terminal_update_guard
  before insert or update on public.run_records
  for each row execute function app_private.guard_run_record_update();

alter table public.player_preferences enable row level security;
alter table public.run_records enable row level security;
alter table public.public_rescue_entries enable row level security;

create policy player_preferences_owner_all
  on public.player_preferences for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy run_records_owner_read
  on public.run_records for select to authenticated
  using (user_id = (select auth.uid()));

create policy run_records_owner_insert
  on public.run_records for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.player_preferences p
      where p.user_id = (select auth.uid())
        and (p.stats_opt_in or p.rescue_opt_in)
    )
  );

create policy run_records_owner_update
  on public.run_records for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy run_records_owner_delete
  on public.run_records for delete to authenticated
  using (user_id = (select auth.uid()));

create policy public_rescue_owner_insert
  on public.public_rescue_entries for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.player_preferences p
      join public.run_records r on r.user_id = p.user_id
      where p.user_id = (select auth.uid())
        and p.rescue_opt_in
        and r.id = run_record_id
        and r.outcome = 'rescued'
        and r.difficulty = public_rescue_entries.difficulty
        and r.duration_ms = public_rescue_entries.duration_ms
        and r.mementos = public_rescue_entries.mementos
    )
  );

create policy public_rescue_owner_delete
  on public.public_rescue_entries for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on table
  public.player_preferences,
  public.run_records,
  public.public_rescue_entries
from public, anon, authenticated;

grant select, insert, update, delete on public.player_preferences to authenticated;
grant select, insert, update, delete on public.run_records to authenticated;
grant insert, delete on public.public_rescue_entries to authenticated;

create or replace function public.get_run_analytics()
returns table (
  started_count bigint,
  in_progress_count bigint,
  rescued_count bigint,
  jumped_count bigint,
  session_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(r.id) as started_count,
    count(r.id) filter (where r.outcome = 'in_progress') as in_progress_count,
    count(r.id) filter (where r.outcome = 'rescued') as rescued_count,
    count(r.id) filter (where r.outcome = 'jumped') as jumped_count,
    (select count(*) from public.player_preferences p where p.stats_opt_in) as session_count
  from public.run_records r
  join public.player_preferences p on p.user_id = r.user_id
  where p.stats_opt_in;
$$;

create or replace function public.get_public_rescues()
returns table (
  display_alias text,
  difficulty text,
  duration_ms bigint,
  mementos smallint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked_rescues as (
    select
      e.display_alias,
      e.difficulty,
      e.duration_ms,
      e.mementos,
      e.created_at,
      row_number() over (
        partition by e.difficulty
        order by e.duration_ms, e.created_at, e.id
      ) as rank_in_difficulty
    from public.public_rescue_entries e
    join public.player_preferences p on p.user_id = e.owner_id
    join public.run_records r on r.id = e.run_record_id and r.user_id = e.owner_id
    where p.rescue_opt_in and r.outcome = 'rescued'
  )
  select
    display_alias,
    difficulty,
    duration_ms,
    mementos,
    created_at
  from ranked_rescues
  where rank_in_difficulty <= 10
  order by difficulty, duration_ms, created_at;
$$;

create or replace function public.delete_my_run_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from public.run_records where user_id = current_user_id;
  delete from public.player_preferences where user_id = current_user_id;
end;
$$;

revoke all on function public.get_run_analytics() from public, anon, authenticated;
revoke all on function public.get_public_rescues() from public, anon, authenticated;
revoke all on function public.delete_my_run_data() from public, anon, authenticated;
grant execute on function public.get_run_analytics() to anon, authenticated;
grant execute on function public.get_public_rescues() to anon, authenticated;
grant execute on function public.delete_my_run_data() to authenticated;
