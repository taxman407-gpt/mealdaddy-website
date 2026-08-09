-- Server-only free-trial accounting for Meal Daddy subscriptions.
-- The trusted service role reserves slots; browsers receive availability only.

do $$ begin
  create type public.trial_reservation_status as enum ('reserved', 'granted', 'released');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.subscription_trial_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_checkout_session_id text unique,
  week_start date not null,
  status public.trial_reservation_status not null default 'reserved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists subscription_trial_reservations_week_status_idx
  on public.subscription_trial_reservations (week_start, status);

alter table public.subscription_trial_reservations enable row level security;

revoke all on public.subscription_trial_reservations from public, anon, authenticated;
grant all on public.subscription_trial_reservations to service_role;

create or replace function public.reserve_weekly_subscription_trial(
  requested_user_id uuid,
  requested_week_start date,
  requested_weekly_limit integer default 2000
)
returns table (eligible boolean, reservation_id uuid, used_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_reservation public.subscription_trial_reservations%rowtype;
  active_count bigint;
  new_reservation_id uuid;
begin
  if requested_weekly_limit < 0 then
    raise exception 'Weekly trial limit cannot be negative';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('mealdaddy-trials:' || requested_week_start::text, 0)
  );

  select * into existing_reservation
    from public.subscription_trial_reservations
   where user_id = requested_user_id;

  select count(*) into active_count
    from public.subscription_trial_reservations
   where week_start = requested_week_start
     and status in ('reserved', 'granted');

  if existing_reservation.id is not null and existing_reservation.status <> 'released' then
    return query select false, existing_reservation.id, active_count;
    return;
  end if;

  if active_count >= requested_weekly_limit then
    return query select false, null::uuid, active_count;
    return;
  end if;

  insert into public.subscription_trial_reservations (user_id, week_start, status, updated_at)
  values (requested_user_id, requested_week_start, 'reserved', now())
  on conflict (user_id) do update
    set week_start = excluded.week_start,
        status = 'reserved',
        stripe_checkout_session_id = null,
        updated_at = now()
    where public.subscription_trial_reservations.status = 'released'
  returning id into new_reservation_id;

  if new_reservation_id is null then
    return query select false, existing_reservation.id, active_count;
    return;
  end if;

  return query select true, new_reservation_id, active_count + 1;
end;
$$;

revoke all on function public.reserve_weekly_subscription_trial(uuid, date, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_weekly_subscription_trial(uuid, date, integer)
  to service_role;
