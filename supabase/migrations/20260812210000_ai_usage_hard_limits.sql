create table if not exists public.ai_runtime_control (
  singleton boolean primary key default true check (singleton),
  ai_enabled boolean not null default true,
  pause_message text not null default 'Meal Daddy estimates are temporarily paused. Your entry is saved and can be retried later.',
  updated_at timestamptz not null default now()
);

insert into public.ai_runtime_control (singleton) values (true)
on conflict (singleton) do nothing;

create table if not exists public.ai_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ledger_entry_id uuid references public.ledger_entries(id) on delete set null,
  request_kind text not null check (request_kind in ('estimate-entry', 'coach-action', 'analyze-saved-food', 'adjust-leftovers', 'summarize-feedback')),
  reserved_cost_micros bigint not null check (reserved_cost_micros between 1 and 3000000),
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'released', 'expired')),
  expires_at timestamptz not null default (now() + interval '3 minutes'),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists ai_usage_reservations_user_created_idx
  on public.ai_usage_reservations (user_id, created_at desc);

alter table public.ai_runtime_control enable row level security;
alter table public.ai_usage_reservations enable row level security;
revoke all on public.ai_runtime_control, public.ai_usage_reservations from public, anon, authenticated;
grant select, insert, update on public.ai_runtime_control, public.ai_usage_reservations to service_role;

create or replace function public.reserve_ai_usage(
  requested_user_id uuid,
  requested_ledger_entry_id uuid,
  requested_kind text,
  requested_reserved_micros bigint,
  requested_monthly_limit_micros bigint,
  requested_daily_call_limit integer
)
returns table(reservation_id uuid, used_monthly_micros bigint, calls_today bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  control public.ai_runtime_control%rowtype;
  active_count bigint;
  month_used bigint;
  month_reserved bigint;
  today_calls bigint;
  created_id uuid;
begin
  if requested_kind not in ('estimate-entry', 'coach-action', 'analyze-saved-food', 'adjust-leftovers', 'summarize-feedback')
    or requested_reserved_micros < 1 or requested_reserved_micros > 250000
    or requested_monthly_limit_micros < 1 or requested_monthly_limit_micros > 3000000
    or requested_daily_call_limit < 1 or requested_daily_call_limit > 50 then
    raise exception 'Invalid AI allowance request';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(requested_user_id::text, 0));
  select * into control from public.ai_runtime_control where singleton = true;
  if control.ai_enabled is distinct from true then raise exception 'AI_PAUSED: %', control.pause_message; end if;

  update public.ai_usage_reservations set status = 'expired'
    where user_id = requested_user_id and status = 'reserved' and expires_at <= now();
  select count(*) into active_count from public.ai_usage_reservations
    where user_id = requested_user_id and status = 'reserved' and expires_at > now();
  if active_count > 0 then raise exception 'AI_REQUEST_IN_PROGRESS'; end if;

  select coalesce(sum(estimated_cost_micros), 0), count(*)
    into month_used, today_calls
    from public.ai_usage_events
    where user_id = requested_user_id and created_at >= date_trunc('month', now());
  select count(*) into today_calls from public.ai_usage_events
    where user_id = requested_user_id and created_at >= date_trunc('day', now());
  select coalesce(sum(reserved_cost_micros), 0) into month_reserved
    from public.ai_usage_reservations
    where user_id = requested_user_id and status = 'reserved' and expires_at > now();

  if month_used + month_reserved + requested_reserved_micros > requested_monthly_limit_micros then
    raise exception 'AI_MONTHLY_LIMIT';
  end if;
  if today_calls >= requested_daily_call_limit then raise exception 'AI_DAILY_LIMIT'; end if;

  insert into public.ai_usage_reservations(user_id, ledger_entry_id, request_kind, reserved_cost_micros)
  values (requested_user_id, requested_ledger_entry_id, requested_kind, requested_reserved_micros)
  returning id into created_id;
  return query select created_id, month_used, today_calls;
end;
$$;

create or replace function public.settle_ai_usage(
  requested_reservation_id uuid,
  requested_user_id uuid,
  requested_provider text,
  requested_model text,
  requested_input_tokens integer,
  requested_output_tokens integer,
  requested_actual_cost_micros bigint
)
returns void language plpgsql security definer set search_path = public as $$
declare r public.ai_usage_reservations%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(requested_user_id::text, 0));
  select * into r from public.ai_usage_reservations
    where id = requested_reservation_id and user_id = requested_user_id and status = 'reserved' for update;
  if not found then raise exception 'AI_RESERVATION_NOT_FOUND'; end if;
  insert into public.ai_usage_events(user_id, ledger_entry_id, provider, model, input_tokens, output_tokens, estimated_cost_micros)
  values (r.user_id, r.ledger_entry_id, left(requested_provider, 40), left(requested_model, 120), greatest(0, requested_input_tokens), greatest(0, requested_output_tokens), greatest(0, requested_actual_cost_micros));
  update public.ai_usage_reservations set status='settled', settled_at=now() where id=r.id;
end;
$$;

create or replace function public.release_ai_usage(requested_reservation_id uuid, requested_user_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.ai_usage_reservations set status='released', settled_at=now()
  where id=requested_reservation_id and user_id=requested_user_id and status='reserved';
$$;

revoke all on function public.reserve_ai_usage(uuid,uuid,text,bigint,bigint,integer) from public, anon, authenticated;
revoke all on function public.settle_ai_usage(uuid,uuid,text,text,integer,integer,bigint) from public, anon, authenticated;
revoke all on function public.release_ai_usage(uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid,uuid,text,bigint,bigint,integer) to service_role;
grant execute on function public.settle_ai_usage(uuid,uuid,text,text,integer,integer,bigint) to service_role;
grant execute on function public.release_ai_usage(uuid,uuid) to service_role;

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from public, anon, authenticated;
grant select, insert on public.stripe_webhook_events to service_role;
