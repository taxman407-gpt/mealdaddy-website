alter table public.ai_usage_events
  add column if not exists request_kind text not null default 'legacy';

alter table public.ai_usage_reservations drop constraint if exists ai_usage_reservations_request_kind_check;
alter table public.ai_usage_reservations
  add constraint ai_usage_reservations_request_kind_check
  check (request_kind in ('estimate-entry', 'coach-action', 'recipe-recreation', 'analyze-saved-food', 'adjust-leftovers', 'summarize-feedback'));

create or replace function public.reserve_ai_usage(
  requested_user_id uuid, requested_ledger_entry_id uuid, requested_kind text,
  requested_reserved_micros bigint, requested_monthly_limit_micros bigint,
  requested_daily_call_limit integer
) returns table(reservation_id uuid, used_monthly_micros bigint, calls_today bigint)
language plpgsql security definer set search_path=public as $$
declare control public.ai_runtime_control%rowtype; active_count bigint; month_used bigint; month_reserved bigint; today_count bigint; created_id uuid;
begin
  if requested_kind not in ('estimate-entry','coach-action','recipe-recreation','analyze-saved-food','adjust-leftovers','summarize-feedback')
    or requested_reserved_micros < 1 or requested_reserved_micros > 250000
    or requested_monthly_limit_micros < 1 or requested_monthly_limit_micros > 3000000
    or requested_daily_call_limit < 1 or requested_daily_call_limit > 50 then raise exception 'Invalid AI allowance request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_user_id::text,0));
  select * into control from public.ai_runtime_control where singleton=true;
  if control.ai_enabled is distinct from true then raise exception 'AI_PAUSED: %',control.pause_message; end if;
  update public.ai_usage_reservations set status='expired' where user_id=requested_user_id and status='reserved' and expires_at<=now();
  select count(*) into active_count from public.ai_usage_reservations where user_id=requested_user_id and status='reserved' and expires_at>now();
  if active_count>0 then raise exception 'AI_REQUEST_IN_PROGRESS'; end if;
  select coalesce(sum(estimated_cost_micros),0) into month_used from public.ai_usage_events where user_id=requested_user_id and created_at>=date_trunc('month',now());
  select count(*) into today_count from public.ai_usage_events where user_id=requested_user_id and created_at>=date_trunc('day',now());
  select coalesce(sum(reserved_cost_micros),0) into month_reserved from public.ai_usage_reservations where user_id=requested_user_id and status='reserved' and expires_at>now();
  if month_used+month_reserved+requested_reserved_micros>requested_monthly_limit_micros then raise exception 'AI_MONTHLY_LIMIT'; end if;
  if today_count>=requested_daily_call_limit then raise exception 'AI_DAILY_LIMIT'; end if;
  insert into public.ai_usage_reservations(user_id,ledger_entry_id,request_kind,reserved_cost_micros)
  values(requested_user_id,requested_ledger_entry_id,requested_kind,requested_reserved_micros) returning id into created_id;
  return query select created_id,month_used,today_count;
end; $$;

create or replace function public.settle_ai_usage(
  requested_reservation_id uuid, requested_user_id uuid, requested_provider text,
  requested_model text, requested_input_tokens integer, requested_output_tokens integer,
  requested_actual_cost_micros bigint
) returns void language plpgsql security definer set search_path = public as $$
declare r public.ai_usage_reservations%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(requested_user_id::text, 0));
  select * into r from public.ai_usage_reservations
    where id=requested_reservation_id and user_id=requested_user_id and status='reserved' for update;
  if not found then raise exception 'AI_RESERVATION_NOT_FOUND'; end if;
  insert into public.ai_usage_events(user_id,ledger_entry_id,provider,model,input_tokens,output_tokens,estimated_cost_micros,request_kind)
  values(r.user_id,r.ledger_entry_id,left(requested_provider,40),left(requested_model,120),greatest(0,requested_input_tokens),greatest(0,requested_output_tokens),greatest(0,requested_actual_cost_micros),r.request_kind);
  update public.ai_usage_reservations set status='settled',settled_at=now() where id=r.id;
end; $$;

create table if not exists public.shared_recipe_templates (
  cache_key text primary key check (char_length(cache_key)=64),
  source_description text not null check (char_length(source_description) between 1 and 500),
  detail_level text not null check (detail_level in ('quick','detailed')),
  recipe jsonb not null,
  source_checked_on date,
  expires_at timestamptz,
  use_count integer not null default 0 check (use_count >= 0),
  beta_status text not null default 'beta' check (beta_status in ('beta','reviewed','retired')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.shared_recipe_templates enable row level security;
revoke all on public.shared_recipe_templates from public, anon, authenticated;
grant select,insert,update on public.shared_recipe_templates to service_role;

create table if not exists public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_key text not null check (char_length(request_key)=64),
  source_description text not null check (char_length(source_description) between 1 and 500),
  detail_level text not null check (detail_level in ('quick','detailed')),
  recipe jsonb not null,
  shared_template_key text references public.shared_recipe_templates(cache_key) on delete set null,
  use_count integer not null default 1 check (use_count >= 0),
  last_used_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,request_key)
);
create index if not exists saved_recipes_user_updated_idx on public.saved_recipes(user_id,updated_at desc);
alter table public.saved_recipes enable row level security;
revoke all on public.saved_recipes from public,anon,authenticated;
grant select,insert,update,delete on public.saved_recipes to authenticated;
grant select,insert,update,delete on public.saved_recipes to service_role;
create policy "Users manage their own recipes" on public.saved_recipes for all to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create table if not exists public.recipe_beta_feedback (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_recipe_id uuid references public.saved_recipes(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment)<=1500),
  created_at timestamptz not null default now()
);
alter table public.recipe_beta_feedback enable row level security;
revoke all on public.recipe_beta_feedback from public,anon,authenticated;
grant select,insert on public.recipe_beta_feedback to authenticated;
grant select,insert on public.recipe_beta_feedback to service_role;
create policy "Users read their own recipe feedback" on public.recipe_beta_feedback for select to authenticated using ((select auth.uid())=user_id);
create policy "Users add their own recipe feedback" on public.recipe_beta_feedback for insert to authenticated with check ((select auth.uid())=user_id);

comment on table public.shared_recipe_templates is 'De-identified generic beta recipe cache. Never store user identity, health profile, location, or private notes.';
comment on column public.ai_usage_events.request_kind is 'Separate accounting category for each AI feature, including recipe-recreation.';
